// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Spinner } from '@office-imp/ui';
import { bus } from '../game/bus';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { api } from '../lib/api';

// As fontes do Excalidraw são servidas pelo próprio office-imp (copiadas no build), sem CDN.
(window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw/';

interface El {
  id: string;
  version: number;
  versionNonce: number;
  [k: string]: unknown;
}

interface WbFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created?: number;
}

const newer = (a: El, b: El | undefined) => !b || a.version > b.version || (a.version === b.version && a.versionNonce < b.versionNonce);

/** Quadro branco colaborativo: Excalidraw com sincronização pelo servidor do escritório. */
export default function Whiteboard({ objectId }: { objectId: string }) {
  const apiRef = useRef<any>(null);
  const sent = useRef(new Map<string, number>());
  const pending = useRef<readonly El[]>([]);
  const timer = useRef<number | null>(null);
  const [initial, setInitial] = useState<El[] | null>(null);
  /** Imagens que já estão no servidor (enviadas por mim ou baixadas de lá). */
  const known = useRef(new Set<string>());
  const busy = useRef(new Set<string>());
  const base = () => `/api/offices/${useGame.getState().office?.id}/whiteboards/${objectId}/files`;

  /** Baixa as imagens que os elementos usam e que ainda não estão neste navegador. */
  const ensureFiles = (els: readonly El[]) => {
    const a = apiRef.current;
    if (!a) return;
    const have = a.getFiles() as Record<string, unknown>;
    for (const e of els) {
      const fid = e.type === 'image' && !e.isDeleted ? (e.fileId as string | null) : null;
      if (!fid || have[fid] || busy.current.has(fid)) continue;
      busy.current.add(fid);
      api
        .get<WbFile>(`${base()}/${encodeURIComponent(fid)}`)
        .then((f) => {
          known.current.add(f.id);
          apiRef.current?.addFiles([{ ...f, created: f.created ?? Date.now() }]);
        })
        .catch(() => {})
        .finally(() => busy.current.delete(fid));
    }
  };

  /** Envia para o servidor as imagens novas que eu coloquei no quadro. */
  const uploadFiles = (els: readonly El[], files: Record<string, WbFile>) => {
    for (const e of els) {
      const fid = e.type === 'image' && !e.isDeleted ? (e.fileId as string | null) : null;
      const f = fid ? files[fid] : undefined;
      if (!fid || !f || known.current.has(fid) || busy.current.has(fid)) continue;
      busy.current.add(fid);
      api
        .post(base(), { id: f.id, mimeType: f.mimeType, dataURL: f.dataURL, created: f.created })
        .then(() => known.current.add(fid))
        .catch(() => {})
        .finally(() => busy.current.delete(fid));
    }
  };

  useEffect(() => {
    const offScene = bus.on('wb:scene', (d: { objectId: string; elements: El[] }) => {
      if (d.objectId !== objectId) return;
      for (const e of d.elements) sent.current.set(e.id, e.version);
      setInitial(d.elements);
    });
    const offUpdate = bus.on('wb:update', (d: { objectId: string; elements: El[] }) => {
      const api = apiRef.current;
      if (d.objectId !== objectId || !api) return;
      const merged = new Map<string, El>((api.getSceneElementsIncludingDeleted() as El[]).map((e) => [e.id, e]));
      for (const e of d.elements) {
        if (newer(e, merged.get(e.id))) merged.set(e.id, e);
        sent.current.set(e.id, Math.max(sent.current.get(e.id) ?? 0, e.version));
      }
      api.updateScene({ elements: [...merged.values()] });
      ensureFiles(d.elements);
    });
    const offFile = bus.on('wb:file', (d: { objectId: string; fileId: string }) => {
      const a = apiRef.current;
      if (d.objectId !== objectId || !a) return;
      known.current.add(d.fileId);
      ensureFiles(a.getSceneElements() as El[]);
    });
    net.send('wb:open', { objectId });
    return () => {
      offScene();
      offUpdate();
      offFile();
      flush();
      net.send('wb:close', { objectId });
    };
  }, [objectId]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changed = pending.current.filter((e) => (sent.current.get(e.id) ?? -1) < e.version);
    if (!changed.length) return;
    for (const e of changed) sent.current.set(e.id, e.version);
    net.send('wb:update', { objectId, elements: changed });
  };

  const onChange = (elements: readonly unknown[], _state: unknown, files: unknown) => {
    pending.current = elements as readonly El[];
    uploadFiles(elements as readonly El[], (files ?? {}) as Record<string, WbFile>);
    if (!timer.current) timer.current = window.setTimeout(flush, 250);
  };

  if (!initial) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="h-full overflow-hidden rounded-xl" data-testid="whiteboard">
      <Excalidraw
        excalidrawAPI={(x: unknown) => {
          apiRef.current = x;
          // as imagens do desenho que já estava no quadro
          window.setTimeout(() => ensureFiles(initial), 0);
        }}
        initialData={{ elements: initial as any, appState: { theme: 'dark', viewBackgroundColor: '#141418' } }}
        onChange={onChange}
        langCode="pt-BR"
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: true } }}
      />
    </div>
  );
}
