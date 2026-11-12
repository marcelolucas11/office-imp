// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { EncodedFileOutput, EncodedFileType, TrackSource, TrackType } from 'livekit-server-sdk';
import { can, formatDuration, isAdminRole, type Role } from '@office-imp/shared';
import { config } from '../config';
import { db, schema } from '../db';
import { newId } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { sendMail } from '../lib/mailer';
import { enqueue, registerJob } from '../lib/queue';
import { officeSettings } from '../lib/settings';
import { hub } from '../realtime/hub';
import type { OfficeRoom } from '../realtime/office-room';
import { egressService, lkRoomName, roomService } from './livekit';
import { getOffice } from './offices';
import { interleave, summarize, transcriber, type SpeakerTrack } from './transcribe';

interface Active {
  meetingId: string;
  officeId: string;
  areaId: string;
  lkRoom: string;
  tracks: Set<string>;
  participants: Set<string>;
  emptySince: number | null;
  timer: NodeJS.Timeout;
  busy: boolean;
}

const active = new Map<string, Active>();

/** Controle do LiveKit Egress; substituível em testes. */
export const recorder = {
  async listAudioTracks(lkRoom: string): Promise<{ identity: string; name: string; trackSid: string }[]> {
    const parts = await roomService().listParticipants(lkRoom);
    const out: { identity: string; name: string; trackSid: string }[] = [];
    for (const p of parts) {
      for (const t of p.tracks) {
        if (t.type === TrackType.AUDIO && t.source === TrackSource.MICROPHONE) out.push({ identity: p.identity, name: p.name || p.identity, trackSid: t.sid });
      }
    }
    return out;
  },
  async start(lkRoom: string, trackSid: string, filepath: string): Promise<string> {
    const output = new EncodedFileOutput({ fileType: EncodedFileType.OGG, filepath });
    const info = await egressService().startTrackCompositeEgress(lkRoom, output, { audioTrackId: trackSid });
    return info.egressId;
  },
  async stop(egressId: string): Promise<void> {
    await egressService().stopEgress(egressId);
  },
  /** Horário real (epoch ms) em que cada gravação começou, quando o Egress informa. */
  async startTimes(lkRoom: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const list = await egressService().listEgress({ roomName: lkRoom });
    for (const e of list) {
      const ns = e.fileResults?.[0]?.startedAt ?? e.startedAt;
      if (ns && Number(ns) > 0) out.set(e.egressId, Math.round(Number(ns) / 1e6));
    }
    return out;
  },
};

export async function startMeeting(room: OfficeRoom, areaId: string, by: { id: string; name: string; role: Role }): Promise<string> {
  const area = room.map.areas.find((a) => a.id === areaId);
  if (!area || area.kind !== 'private' || !area.meeting) throw badRequest('As notas de reunião só funcionam em salas de reunião.');
  const settings = officeSettings(room.office.settings);
  if (!can(by.role, 'notes.start') || (settings.notesRestrictedToAdmins && !isAdminRole(by.role))) throw forbidden('Você não pode iniciar notas de reunião.');
  const inArea = room.playersInArea(areaId);
  if (!inArea.some((p) => p.id === by.id)) throw forbidden('Entre na sala de reunião para iniciar as notas.');
  if (room.recordings.has(areaId)) throw conflict('As notas já estão sendo gravadas nesta sala.');

  const meetingId = newId();
  await db().insert(schema.meetings).values({
    id: meetingId,
    officeId: room.officeId,
    areaId,
    areaName: area.name,
    startedBy: by.id,
    startedByName: by.name,
    participants: inArea.map((p) => p.name),
    start: Date.now(),
    end: null,
    status: 'recording',
    error: null,
  });
  await fs.mkdir(path.join(config.meetingsDir, meetingId), { recursive: true });
  await fs.chmod(path.join(config.meetingsDir, meetingId), 0o777).catch(() => {});
  room.setRecording(areaId, { meetingId, startedBy: by.id });
  const a: Active = {
    meetingId,
    officeId: room.officeId,
    areaId,
    lkRoom: lkRoomName(room.officeId, areaId),
    tracks: new Set(),
    participants: new Set(inArea.map((p) => p.name)),
    emptySince: null,
    busy: false,
    timer: setInterval(() => void poll(a), 5000),
  };
  active.set(meetingId, a);
  void poll(a);
  return meetingId;
}

async function poll(a: Active) {
  if (a.busy || !active.has(a.meetingId)) return;
  a.busy = true;
  try {
    const room = hub.room(a.officeId);
    const present = room?.playersInArea(a.areaId) ?? [];
    for (const p of present) a.participants.add(p.name);
    if (present.length === 0) {
      a.emptySince ??= Date.now();
      if (Date.now() - a.emptySince > 8000) {
        await stopMeeting(a.meetingId);
        return;
      }
    } else a.emptySince = null;
    const tracks = await recorder.listAudioTracks(a.lkRoom).catch(() => []);
    for (const t of tracks) {
      if (a.tracks.has(t.trackSid)) continue;
      a.tracks.add(t.trackSid);
      const rel = `${a.meetingId}/${t.identity.replace(/[^A-Za-z0-9_-]/g, '_')}-${t.trackSid}.ogg`;
      try {
        const egressId = await recorder.start(a.lkRoom, t.trackSid, path.posix.join(config.egressOutDir, rel));
        const speaker = present.find((p) => p.id === t.identity)?.name ?? t.name;
        await db().insert(schema.meetingTracks).values({ id: newId(), meetingId: a.meetingId, subjectId: t.identity, subjectName: speaker, trackSid: t.trackSid, egressId, file: rel, startedAt: Date.now(), deletedAt: null });
      } catch (e) {
        a.tracks.delete(t.trackSid);
        console.error('[notas] falha ao iniciar a gravação da faixa', (e as Error)?.message);
      }
    }
  } finally {
    a.busy = false;
  }
}

export async function stopMeeting(meetingId: string): Promise<void> {
  const a = active.get(meetingId);
  if (!a) {
    const [m] = await db().select().from(schema.meetings).where(eq(schema.meetings.id, meetingId));
    if (!m) throw notFound('Reunião não encontrada.');
    return;
  }
  active.delete(meetingId);
  clearInterval(a.timer);
  const now = Date.now();
  const tracks = await db().select().from(schema.meetingTracks).where(eq(schema.meetingTracks.meetingId, meetingId));
  const starts = await recorder.startTimes(a.lkRoom).catch(() => new Map<string, number>());
  for (const t of tracks) {
    if (!t.egressId) continue;
    await recorder.stop(t.egressId).catch(() => {});
    const real = starts.get(t.egressId);
    if (real) await db().update(schema.meetingTracks).set({ startedAt: real }).where(eq(schema.meetingTracks.id, t.id));
  }
  await db()
    .update(schema.meetings)
    .set({ end: now, status: 'processing', participants: [...a.participants] })
    .where(eq(schema.meetings.id, meetingId));
  hub.room(a.officeId)?.setRecording(a.areaId, null);
  await enqueue('transcribe', { meetingId }, { delayMs: process.env.NODE_ENV === 'test' ? 0 : 6000 });
}

export function activeMeetingFor(officeId: string, areaId: string): string | null {
  for (const a of active.values()) if (a.officeId === officeId && a.areaId === areaId) return a.meetingId;
  return null;
}

async function waitForFile(file: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const st = await fs.stat(file);
      if (st.size > 0) return true;
    } catch {}
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function formatNote(m: typeof schema.meetings.$inferSelect, tz: string, body: string, summary: string | null): string {
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
  const head = [
    `# Notas da reunião — ${m.areaName}`,
    '',
    `- **Data:** ${fmt.format(new Date(m.start))}`,
    `- **Duração:** ${formatDuration((m.end ?? Date.now()) - m.start)}`,
    `- **Participantes:** ${m.participants.join(', ') || '—'}`,
    `- **Iniciada por:** ${m.startedByName}`,
    '',
  ];
  if (summary) head.push('## Resumo', '', summary, '');
  head.push('## Transcrição', '', body || '_Nenhuma fala foi detectada._', '');
  return head.join('\n');
}

export function registerMeetingJobs() {
  registerJob('transcribe', async ({ meetingId }: { meetingId: string }) => {
    const [m] = await db().select().from(schema.meetings).where(eq(schema.meetings.id, meetingId));
    if (!m) return;
    const office = await getOffice(m.officeId);
    const settings = officeSettings(office.settings);
    try {
      const tracks = await db().select().from(schema.meetingTracks).where(eq(schema.meetingTracks.meetingId, meetingId));
      const speakers: SpeakerTrack[] = [];
      const problems: string[] = [];
      for (const t of tracks) {
        const file = path.join(config.meetingsDir, t.file);
        if (!(await waitForFile(file, process.env.NODE_ENV === 'test' ? 200 : 45000))) {
          problems.push(`Áudio de ${t.subjectName} não foi encontrado.`);
          continue;
        }
        try {
          const segments = await transcriber.transcribeFile(file);
          speakers.push({ speaker: t.subjectName, offset: Math.max(0, (t.startedAt - m.start) / 1000), segments });
        } catch (e) {
          problems.push(`Falha ao transcrever o áudio de ${t.subjectName}: ${(e as Error).message}`);
        }
      }
      let body = interleave(speakers);
      if (problems.length) body += `${body ? '\n\n' : ''}> Observações: ${problems.join(' ')}`;
      const summary = await summarize(body);
      const transcript = formatNote(m, office.timezone, body, summary);
      let sentTo: string[] = [];
      let sentAt: number | null = null;
      let emailError: string | null = null;
      const recipients = settings.notesRecipients.filter((r) => /.+@.+\..+/.test(r));
      if (!recipients.length) emailError = 'Nenhum destinatário configurado para as notas.';
      else {
        try {
          const day = new Intl.DateTimeFormat('pt-BR', { timeZone: office.timezone, dateStyle: 'short' }).format(new Date(m.start));
          await sendMail({
            to: recipients,
            subject: `Notas da reunião — ${m.areaName} — ${day}`,
            text: transcript,
            attachments: [{ filename: `notas-${m.areaName.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${new Date(m.start).toISOString().slice(0, 10)}.md`, content: transcript }],
          });
          sentTo = recipients;
          sentAt = Date.now();
        } catch (e) {
          emailError = `Falha ao enviar o e-mail: ${(e as Error).message}`;
        }
      }
      await db()
        .insert(schema.meetingNotes)
        .values({ meetingId, transcript, summary, sentTo, sentAt, emailError, createdAt: Date.now() })
        .onConflictDoUpdate({ target: schema.meetingNotes.meetingId, set: { transcript, summary, sentTo, sentAt, emailError } });
      await db().update(schema.meetings).set({ status: 'done', error: problems.length && !speakers.length ? problems.join(' ') : null }).where(eq(schema.meetings.id, meetingId));
    } catch (e) {
      await db().update(schema.meetings).set({ status: 'failed', error: (e as Error).message }).where(eq(schema.meetings.id, meetingId));
      throw e;
    }
  });

  /** Limpeza diária: áudios antigos e mensagens de chat fora da retenção. */
  registerJob('cleanup', async () => {
    const all = await db().select().from(schema.offices);
    for (const office of all) {
      const s = officeSettings(office.settings);
      const audioCut = Date.now() - s.audioRetentionDays * 86400_000;
      const old = await db()
        .select({ track: schema.meetingTracks })
        .from(schema.meetingTracks)
        .innerJoin(schema.meetings, eq(schema.meetings.id, schema.meetingTracks.meetingId))
        .where(and(eq(schema.meetings.officeId, office.id), lt(schema.meetings.start, audioCut), isNull(schema.meetingTracks.deletedAt)));
      for (const { track } of old) {
        await fs.unlink(path.join(config.meetingsDir, track.file)).catch(() => {});
        await db().update(schema.meetingTracks).set({ deletedAt: Date.now() }).where(eq(schema.meetingTracks.id, track.id));
      }
      const chatCut = Date.now() - s.chatRetentionDays * 86400_000;
      await db().delete(schema.chatMessages).where(and(eq(schema.chatMessages.officeId, office.id), lt(schema.chatMessages.createdAt, chatCut)));
    }
    await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now()));
  });
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  await fs.rm(path.join(config.meetingsDir, meetingId), { recursive: true, force: true }).catch(() => {});
  await db().delete(schema.meetingTracks).where(eq(schema.meetingTracks.meetingId, meetingId));
  await db().delete(schema.meetingNotes).where(eq(schema.meetingNotes.meetingId, meetingId));
  await db().delete(schema.meetings).where(eq(schema.meetings.id, meetingId));
}
