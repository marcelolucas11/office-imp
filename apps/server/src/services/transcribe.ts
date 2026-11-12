import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';

export interface Segment {
  start: number; // segundos
  end: number;
  text: string;
}

export interface SpeakerTrack {
  speaker: string;
  /** Deslocamento (s) do início da faixa em relação ao início da reunião. */
  offset: number;
  segments: Segment[];
}

/** Substituível em testes. */
export const transcriber = {
  async transcribeFile(file: string): Promise<Segment[]> {
    if (!config.whisperUrl) throw new Error('Serviço de transcrição (Whisper) não configurado.');
    const wav = await toWav(file).catch(() => null);
    const src = wav ?? file;
    try {
      const buf = await fs.readFile(src);
      const form = new FormData();
      form.append('file', new Blob([buf]), path.basename(src));
      form.append('response_format', 'verbose_json');
      form.append('language', config.whisperLanguage);
      form.append('temperature', '0.0');
      const res = await fetch(`${config.whisperUrl.replace(/\/$/, '')}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(6 * 3600_000) });
      if (!res.ok) throw new Error(`Whisper respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return parseWhisper(await res.json());
    } finally {
      if (wav) await fs.unlink(wav).catch(() => {});
    }
  },
};

export function parseWhisper(json: any): Segment[] {
  const segs: any[] = Array.isArray(json?.segments) ? json.segments : [];
  if (!segs.length && typeof json?.text === 'string' && json.text.trim()) return [{ start: 0, end: 0, text: json.text.trim() }];
  return segs
    .map((s) => {
      // whisper.cpp usa segundos em verbose_json; algumas versões expõem t0/t1 em centésimos
      const start = typeof s.start === 'number' ? s.start : typeof s.t0 === 'number' ? s.t0 / 100 : 0;
      const end = typeof s.end === 'number' ? s.end : typeof s.t1 === 'number' ? s.t1 / 100 : start;
      return { start, end, text: String(s.text ?? '').trim() };
    })
    .filter((s) => s.text && !/^\[.*\]$/.test(s.text) && !/^\(.*\)$/.test(s.text));
}

function toWav(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const out = `${file}.16k.wav`;
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg saiu com código ${code}`))));
  });
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h > 0 ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Intercala as falas de todas as faixas por horário, identificando quem falou. */
export function interleave(tracks: SpeakerTrack[]): string {
  const all = tracks.flatMap((t) => t.segments.map((s) => ({ speaker: t.speaker, at: t.offset + s.start, text: s.text })));
  all.sort((a, b) => a.at - b.at);
  const lines: string[] = [];
  let last: { speaker: string; at: number } | null = null;
  for (const seg of all) {
    if (last && last.speaker === seg.speaker && seg.at - last.at < 30) {
      lines[lines.length - 1] += ` ${seg.text}`;
    } else {
      lines.push(`[${clock(seg.at)}] ${seg.speaker}: ${seg.text}`);
      last = { speaker: seg.speaker, at: seg.at };
    }
    if (last) last.at = seg.at;
  }
  return lines.join('\n\n');
}

/** Resumo opcional por LLM local/compatível com a API da OpenAI (Ollama, etc.). */
export async function summarize(transcript: string): Promise<string | null> {
  if (!config.summary.url || !transcript.trim()) return null;
  const base = config.summary.url.replace(/\/$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}${/\/v1$/.test(base) ? '' : '/v1'}/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(config.summary.key ? { authorization: `Bearer ${config.summary.key}` } : {}) },
      body: JSON.stringify({
        model: config.summary.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Você resume reuniões de trabalho em português do Brasil. Responda com três seções curtas: "Resumo", "Decisões" e "Próximos passos" (com responsável quando houver). Não invente nada que não esteja na transcrição.' },
          { role: 'user', content: transcript.slice(0, 60000) },
        ],
      }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
