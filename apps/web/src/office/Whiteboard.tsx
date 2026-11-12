import { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Spinner } from '@office-imp/ui';
import { bus } from '../game/bus';
import { net } from '../game/net';

// As fontes do Excalidraw são servidas pelo próprio office-imp (copiadas no build), sem CDN.
(window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw/';

interface El {
  id: string;
  version: number;
  versionNonce: number;
  [k: string]: unknown;
}

const newer = (a: El, b: El | undefined) => !b || a.version > b.version || (a.version === b.version && a.versionNonce < b.versionNonce);

/** Quadro branco colaborativo: Excalidraw com sincronização pelo servidor do escritório. */
export default function Whiteboard({ objectId }: { objectId: string }) {
  const apiRef = useRef<any>(null);
  const sent = useRef(new Map<string, number>());
  const pending = useRef<readonly El[]>([]);
  const timer = useRef<number | null>(null);
  const [initial, setInitial] = useState<El[] | null>(null);

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
    });
    net.send('wb:open', { objectId });
    return () => {
      offScene();
      offUpdate();
      flush();
      net.send('wb:close', { objectId });
    };
  }, [objectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changed = pending.current.filter((e) => (sent.current.get(e.id) ?? -1) < e.version);
    if (!changed.length) return;
    for (const e of changed) sent.current.set(e.id, e.version);
    net.send('wb:update', { objectId, elements: changed });
  };

  const onChange = (elements: readonly unknown[]) => {
    pending.current = elements as readonly El[];
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
        excalidrawAPI={(api: unknown) => {
          apiRef.current = api;
        }}
        initialData={{ elements: initial as any, appState: { theme: 'dark', viewBackgroundColor: '#141418' } }}
        onChange={onChange}
        langCode="pt-BR"
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: true } }}
      />
    </div>
  );
}
