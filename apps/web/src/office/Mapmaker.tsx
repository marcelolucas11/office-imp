// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DIRS,
  Floor,
  MAX_MAP_SIZE,
  OBJECT_DEFS,
  OBJECT_TYPES,
  mapDesks,
  objSize,
  rectContains,
  rectsToTiles,
  resizeMap,
  tilesToRects,
  type Dir,
  type MapArea,
  type MapObject,
  type ObjectCategory,
  stripDerivedAreas,
  withDeskAreas,
  type OfficeMap,
  type Point,
  type Rect,
} from '@office-imp/shared';
import { Badge, Button, Field, Input, Modal, Select, Tabs, Textarea, Toggle, cx } from '@office-imp/ui';
import { objectIcon } from '../game/art/objects';
import { renderFull } from '../game/art/render';
import { FLOOR_COLOR, T, tilesetCanvas } from '../game/art/tiles';
import { useGame } from '../game/store';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { FLOOR_IDS, WALL_IDS, floorLabel, wallLabel } from './tileLabels';
import { toast } from '../lib/session';
import { uploadImage } from './Modals';
import { Emo, EmoText } from '../lib/icons';

type Tool = 'select' | 'object' | 'floor' | 'wall' | 'erase' | 'fill' | 'area' | 'spawn' | 'target';
const DIR_LABEL: Record<Dir, string> = { down: '↓', left: '←', right: '→', up: '↑' };
const CATS: { id: ObjectCategory; label: string }[] = [
  { id: 'interactive', label: 'Interativos' },
  { id: 'structure', label: 'Estrutura' },
  { id: 'furniture', label: 'Móveis' },
  { id: 'decor', label: 'Decoração' },
];
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

interface Version {
  id: string;
  authorName: string | null;
  note: string | null;
  published: boolean;
  createdAt: number;
}

/** Editor do escritório: Mapmaker (mapa inteiro) e Build Tool (objetos interativos). */
export default function Mapmaker() {
  const office = useGame((s) => s.office)!;
  const live = useGame((s) => s.map)!;
  // as áreas das mesas são automáticas: não aparecem para edição (só no desenho)
  const mapRef = useRef<OfficeMap>(stripDerivedAreas(structuredClone(live)));
  const [rev, setRev] = useState(0);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const [tab, setTab] = useState<'build' | 'map' | 'areas' | 'versions'>('build');
  const [tool, setTool] = useState<Tool>('object');
  const [floorId, setFloorId] = useState(1);
  const [wallId, setWallId] = useState(1);
  const [objType, setObjType] = useState('whiteboard');
  const [dir, setDir] = useState<Dir>('down');
  const [eraseFloor, setEraseFloor] = useState(false);
  const [selObj, setSelObj] = useState<string | null>(null);
  const [selArea, setSelArea] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [overlays, setOverlays] = useState(true);
  const [report, setReport] = useState<{ ok: boolean; errors: string[]; warnings: string[]; desks: number } | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ w: live.width, h: live.height });
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ start: Point; last: Point; moving?: { dx: number; dy: number } } | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const map = mapRef.current;
  const dirty = undo.current.length > 0;

  const bump = () => setRev((r) => r + 1);
  const snapshot = () => {
    undo.current.push(JSON.stringify(mapRef.current));
    if (undo.current.length > 60) undo.current.shift();
    redo.current = [];
  };
  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(JSON.stringify(mapRef.current));
    mapRef.current = JSON.parse(prev);
    bump();
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(JSON.stringify(mapRef.current));
    mapRef.current = JSON.parse(next);
    bump();
  };

  const selected = map.objects.find((o) => o.id === selObj) ?? null;
  const area = map.areas.find((a) => a.id === selArea) ?? null;

  // ---------- desenho ----------
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const full = renderFull(overlays ? withDeskAreas(map) : map, { areas: overlays, spawns: overlays, grid: overlays, selectedArea: selArea });
    c.width = full.width;
    c.height = full.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(full, 0, 0);
    if (selected && overlays) {
      const { w, h } = objSize(selected);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.strokeRect(selected.x * T + 1, selected.y * T + 1, w * T - 2, h * T - 2);
      if (selected.type === 'portal' && Number.isInteger(selected.props?.toX)) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(selected.x * T + 16, selected.y * T + 16);
        ctx.lineTo(selected.props!.toX * T + 16, selected.props!.toY * T + 16);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (box) {
      ctx.fillStyle = 'rgba(56,189,248,0.25)';
      ctx.fillRect(box.x * T, box.y * T, box.w * T, box.h * T);
    }
  }, [rev, overlays, selArea, selObj, box, map, selected]);

  // ---------- teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doRedo();
      } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && selObj) {
        snapshot();
        mapRef.current.objects = mapRef.current.objects.filter((o) => o.id !== selObj);
        setSelObj(null);
        bump();
      } else if (!typing && e.key.toLowerCase() === 'r') {
        const next = DIRS[(DIRS.indexOf(dir) + 1) % DIRS.length];
        setDir(next);
        const o = mapRef.current.objects.find((x) => x.id === selObj);
        if (o) {
          snapshot();
          o.dir = next;
          bump();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selObj, dir]);

  // ---------- ferramentas ----------
  const tileOf = (e: React.MouseEvent): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / (T * zoom)), y: Math.floor((e.clientY - r.top) / (T * zoom)) };
  };
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
  const objectAt = (p: Point): MapObject | null => {
    for (let i = map.objects.length - 1; i >= 0; i--) {
      const o = map.objects[i];
      const { w, h } = objSize(o);
      if (rectContains({ x: o.x, y: o.y, w, h }, p.x, p.y)) return o;
    }
    return null;
  };
  const paint = (p: Point) => {
    if (!inside(p)) return;
    const i = p.y * map.width + p.x;
    if (tool === 'floor') map.layers.floor[i] = floorId;
    else if (tool === 'wall') {
      map.layers.walls[i] = wallId;
      if (!map.layers.floor[i]) map.layers.floor[i] = floorId;
    } else if (tool === 'erase') {
      map.layers.walls[i] = 0;
      if (eraseFloor) map.layers.floor[i] = 0;
      map.objects = map.objects.filter((o) => {
        const { w, h } = objSize(o);
        return !rectContains({ x: o.x, y: o.y, w, h }, p.x, p.y);
      });
      map.spawns = map.spawns.filter((s) => s.x !== p.x || s.y !== p.y);
    }
  };
  const fill = (p: Point) => {
    const target = map.layers.floor[p.y * map.width + p.x];
    if (target === floorId) return;
    const stack = [p];
    const seen = new Set<number>();
    while (stack.length) {
      const c = stack.pop()!;
      const i = c.y * map.width + c.x;
      if (!inside(c) || seen.has(i) || map.layers.floor[i] !== target || map.layers.walls[i]) continue;
      seen.add(i);
      map.layers.floor[i] = floorId;
      stack.push({ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 });
      if (seen.size > 40000) break;
    }
  };

  const onDown = (e: React.MouseEvent) => {
    const p = tileOf(e);
    if (!inside(p)) return;
    drag.current = { start: p, last: p };
    if (tool === 'floor' || tool === 'wall' || tool === 'erase') {
      snapshot();
      paint(p);
      bump();
    } else if (tool === 'fill') {
      snapshot();
      fill(p);
      bump();
    } else if (tool === 'object') {
      const def = OBJECT_DEFS[objType];
      if (!def) return;
      snapshot();
      const o: MapObject = { id: rid(objType === 'desk' ? 'desk' : 'o'), type: objType, x: p.x, y: p.y, ...(dir !== 'down' ? { dir } : {}) };
      if (objType === 'desk') o.props = { seat: { x: p.x, y: p.y + 1 }, zone: { x: p.x, y: p.y, w: 3, h: 1 } };
      map.objects.push(o);
      setSelObj(o.id);
      bump();
    } else if (tool === 'select') {
      const o = objectAt(p);
      setSelObj(o?.id ?? null);
      if (o) drag.current.moving = { dx: p.x - o.x, dy: p.y - o.y };
    } else if (tool === 'spawn') {
      snapshot();
      const i = map.spawns.findIndex((s) => s.x === p.x && s.y === p.y);
      if (i >= 0) map.spawns.splice(i, 1);
      else map.spawns.push(p);
      bump();
    } else if (tool === 'target' && selected) {
      snapshot();
      selected.props = { ...(selected.props ?? {}), toX: p.x, toY: p.y };
      setTool('select');
      bump();
    } else if (tool === 'area') setBox({ x: p.x, y: p.y, w: 1, h: 1 });
  };

  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = tileOf(e);
    if (p.x === d.last.x && p.y === d.last.y) return;
    d.last = p;
    if (tool === 'floor' || tool === 'wall' || tool === 'erase') {
      paint(p);
      bump();
    } else if (tool === 'select' && d.moving && selected) {
      if (d.start !== p && !('snap' in d)) {
        snapshot();
        (d as any).snap = true;
      }
      const nx = Math.max(0, Math.min(map.width - 1, p.x - d.moving.dx));
      const ny = Math.max(0, Math.min(map.height - 1, p.y - d.moving.dy));
      if (selected.type === 'desk' && selected.props) {
        const ox = nx - selected.x;
        const oy = ny - selected.y;
        const seat = selected.props.seat as Point | undefined;
        const zone = selected.props.zone as Rect | undefined;
        if (seat) selected.props.seat = { x: seat.x + ox, y: seat.y + oy };
        if (zone) selected.props.zone = { ...zone, x: zone.x + ox, y: zone.y + oy };
        for (const dec of map.objects) {
          if (dec.ownerDeskId === selected.id) {
            dec.x += ox;
            dec.y += oy;
          }
        }
      }
      selected.x = nx;
      selected.y = ny;
      bump();
    } else if (tool === 'area') {
      const x = Math.min(d.start.x, p.x);
      const y = Math.min(d.start.y, p.y);
      setBox({ x, y, w: Math.abs(p.x - d.start.x) + 1, h: Math.abs(p.y - d.start.y) + 1 });
    }
  };

  const onUp = (e: React.MouseEvent) => {
    drag.current = null;
    if (tool !== 'area' || !box) return;
    const rect = { x: Math.max(0, box.x), y: Math.max(0, box.y), w: box.w, h: box.h };
    setBox(null);
    snapshot();
    if (area) {
      const tiles = new Map(rectsToTiles(area.rects).map((p) => [`${p.x},${p.y}`, p]));
      for (const p of rectsToTiles([rect])) {
        if (e.altKey) tiles.delete(`${p.x},${p.y}`);
        else tiles.set(`${p.x},${p.y}`, p);
      }
      area.rects = tilesToRects([...tiles.values()]);
    } else {
      const a: MapArea = { id: rid('area'), name: t('mm.newArea', 'Nova sala'), kind: 'private', staffOnly: false, meeting: true, capacity: 8, rects: [rect] };
      map.areas.push(a);
      setSelArea(a.id);
      setTab('areas');
    }
    bump();
  };

  const patchObj = (fn: (o: MapObject) => void) => {
    if (!selected) return;
    snapshot();
    fn(selected);
    bump();
  };
  const patchArea = (fn: (a: MapArea) => void) => {
    if (!area) return;
    snapshot();
    fn(area);
    bump();
  };
  const setProp = (k: string, v: unknown) => patchObj((o) => (o.props = { ...(o.props ?? {}), [k]: v }));

  // ---------- servidor ----------
  const validate = async () => {
    try {
      const r = await api.post(`/api/offices/${office.id}/map/validate`, { map: mapRef.current });
      setReport(r);
      return r as { ok: boolean };
    } catch (e) {
      toast(errMsg(e), 'error');
      return { ok: false };
    }
  };
  const publish = async () => {
    setBusy(true);
    try {
      const r = await validate();
      if (!r.ok) {
        toast(t('mm.fixFirst', 'Corrija os erros apontados antes de publicar.'), 'error');
        return;
      }
      await api.post(`/api/offices/${office.id}/map`, { map: mapRef.current, note: note.trim() });
      toast(t('mm.published', 'Mapa publicado. Todos já estão vendo a nova versão.'), 'ok');
      useGame.setState({ modal: null });
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const loadVersions = () =>
    api
      .get<Version[]>(`/api/offices/${office.id}/map/versions`)
      .then(setVersions)
      .catch((e) => toast(errMsg(e), 'error'));
  const restore = async (id: string) => {
    if (!confirm(t('mm.restoreAsk', 'Restaurar esta versão? Ela vira a versão publicada (a atual continua no histórico).'))) return;
    try {
      await api.post(`/api/offices/${office.id}/map/versions/${id}/restore`);
      toast(t('mm.restored', 'Versão restaurada.'), 'ok');
      useGame.setState({ modal: null });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  useEffect(() => {
    if (tab === 'versions' && !versions) void loadVersions();
  }, [tab]);

  const closeAsk = () => {
    if (dirty && !confirm(t('mm.discardAsk', 'Sair sem publicar? As alterações serão perdidas.'))) return;
    useGame.setState({ modal: null });
  };

  const floorTiles = useMemo(() => tilesetCanvas('floor').toDataURL(), []);
  const wallTiles = useMemo(() => tilesetCanvas('walls').toDataURL(), []);
  // o fundo aparece só atrás de desenhos com transparência (a divisória de vidro)
  const swatch = (sheet: string, id: number, active: boolean, label: string, bg: string, onClick: () => void) => (
    <button key={id} type="button" title={label} aria-label={label} onClick={onClick} className={cx('h-9 w-9 rounded-md border-2', active ? 'border-gold' : 'border-line')} style={{ backgroundImage: `url(${sheet})`, backgroundPosition: `-${(id - 1) * T}px 0`, backgroundColor: bg }} />
  );
  const toolBtn = (id: Tool, label: string, title: string) => (
    <Button key={id} small variant={tool === id ? 'primary' : 'subtle'} title={title} onClick={() => setTool(id)}>
      <EmoText text={label} />
    </Button>
  );
  const def = selected ? OBJECT_DEFS[selected.type] : null;

  return (
    <Modal title={t('mm.title', 'Mapmaker — {{name}}', { name: office.name })} wide="full" onClose={closeAsk}>
      <div className="flex h-full gap-4" data-testid="mapmaker">
        {/* painel de ferramentas */}
        <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto pr-1">
          <Tabs
            tabs={[
              { id: 'build', label: t('mm.tabBuild', 'Objetos') },
              { id: 'map', label: t('mm.tabMap', 'Chão e paredes') },
              { id: 'areas', label: t('mm.tabAreas', 'Áreas') },
              { id: 'versions', label: t('mm.tabVersions', 'Versões') },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'build' ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {toolBtn('object', t('mm.place', '＋ Colocar'), t('mm.placeTip', 'Clique no mapa para colocar o objeto escolhido'))}
                {toolBtn('select', t('mm.select', '🖱 Selecionar'), t('mm.selectTip', 'Clique em um objeto para editar; arraste para mover'))}
                {toolBtn('erase', t('mm.erase', '🧽 Apagar'), t('mm.eraseTip', 'Apaga objetos e paredes do tile'))}
              </div>
              <Field group label={t('mm.dir', 'Direção (tecla R gira)')}>
                <div className="flex gap-1">
                  {DIRS.map((d) => (
                    <Button key={d} small variant={dir === d ? 'primary' : 'subtle'} onClick={() => setDir(d)}>
                      {DIR_LABEL[d]}
                    </Button>
                  ))}
                </div>
              </Field>
              {CATS.map((c) => (
                <div key={c.id}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {OBJECT_TYPES.filter((ty) => OBJECT_DEFS[ty].category === c.id).map((ty) => (
                      <button
                        key={ty}
                        type="button"
                        title={OBJECT_DEFS[ty].label}
                        data-testid={`obj-${ty}`}
                        onClick={() => {
                          setObjType(ty);
                          setTool('object');
                        }}
                        className={cx('rounded-lg border p-0.5', objType === ty && tool === 'object' ? 'border-gold bg-gold/10' : 'border-line hover:border-muted')}
                      >
                        <img src={objectIcon(ty)} alt={OBJECT_DEFS[ty].label} className="pixel h-10 w-10" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : null}
          {tab === 'map' ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {toolBtn('floor', t('mm.floor', '▦ Chão'), t('mm.floorTip', 'Pinta o chão (arraste)'))}
                {toolBtn('wall', t('mm.wall', '▮ Parede'), t('mm.wallTip', 'Pinta paredes: bloqueiam a passagem'))}
                {toolBtn('fill', t('mm.fill', '🪣 Preencher'), t('mm.fillTip', 'Troca o chão de toda a região'))}
                {toolBtn('erase', t('mm.erase', '🧽 Apagar'), t('mm.eraseTip', 'Apaga objetos e paredes do tile'))}
                {toolBtn('spawn', t('mm.spawn', '⬤ Entrada'), t('mm.spawnTip', 'Marca/desmarca os pontos onde as pessoas aparecem ao entrar'))}
              </div>
              <Field group label={t('mm.floors', 'Chão')}>
                <div className="flex flex-wrap gap-1.5">{FLOOR_IDS.map((id) => swatch(floorTiles, id, floorId === id, floorLabel(id), FLOOR_COLOR[id], () => (setFloorId(id), tool !== 'fill' && setTool('floor'))))}</div>
                <p className="mt-1 text-xs text-muted">{floorLabel(floorId)}</p>
              </Field>
              <Field group label={t('mm.walls', 'Paredes')}>
                <div className="flex flex-wrap gap-1.5">{WALL_IDS.map((id) => swatch(wallTiles, id, wallId === id, wallLabel(id), FLOOR_COLOR[Floor.Tile], () => (setWallId(id), setTool('wall'))))}</div>
                <p className="mt-1 text-xs text-muted">{wallLabel(wallId)}</p>
              </Field>
              <Toggle checked={eraseFloor} onChange={setEraseFloor} label={t('mm.eraseFloor', 'A borracha também apaga o chão')} />
              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="text-xs font-semibold text-muted">{t('mm.size', 'Tamanho do mapa (em tiles)')}</p>
                <div className="flex items-center gap-2">
                  <Input type="number" min={5} max={MAX_MAP_SIZE} value={size.w} onChange={(e) => setSize({ ...size, w: Number(e.target.value) })} />
                  ×
                  <Input type="number" min={5} max={MAX_MAP_SIZE} value={size.h} onChange={(e) => setSize({ ...size, h: Number(e.target.value) })} />
                  <Button
                    small
                    variant="ghost"
                    onClick={() => {
                      const w = Math.max(5, Math.min(MAX_MAP_SIZE, Math.round(size.w)));
                      const h = Math.max(5, Math.min(MAX_MAP_SIZE, Math.round(size.h)));
                      snapshot();
                      resizeMap(mapRef.current, w, h);
                      mapRef.current.objects = mapRef.current.objects.filter((o) => o.x < w && o.y < h);
                      mapRef.current.spawns = mapRef.current.spawns.filter((s) => s.x < w && s.y < h);
                      bump();
                    }}
                  >
                    {t('mm.apply', 'Aplicar')}
                  </Button>
                </div>
                <p className="text-[11px] text-muted">{t('mm.sizeHint', 'O mapa cresce para a direita e para baixo; o que já existe não sai do lugar.')}</p>
              </div>
            </>
          ) : null}
          {tab === 'areas' ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {toolBtn('area', t('mm.areaTool', '▭ Marcar área'), t('mm.areaTip', 'Arraste um retângulo. Com uma área selecionada, soma a ela; com Alt, remove.'))}
                <Button small variant="subtle" onClick={() => setSelArea(null)}>
                  {t('mm.newAreaBtn', '＋ Nova área')}
                </Button>
              </div>
              <p className="text-[11px] text-muted">{t('mm.areaHelp', 'Área privada: só quem está dentro se vê e se ouve. Palco (Spotlight): quem pisa nele fala para o escritório todo.')}</p>
              <div className="space-y-1">
                {map.areas.map((a) => (
                  <button key={a.id} type="button" onClick={() => (setSelArea(a.id), setTool('area'))} className={cx('flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-sm', selArea === a.id ? 'border-gold bg-gold/10' : 'border-line hover:border-muted')}>
                    <span className="truncate">
                      {a.kind === 'spotlight' ? '★ ' : a.staffOnly ? <Emo e="🔒" size={14} /> : ''} 
                      {a.name}
                    </span>
                    <Badge color="gray">{a.kind === 'spotlight' ? t('mm.kindSpot', 'palco') : t('mm.cap', '{{n}} lugares', { n: a.capacity })}</Badge>
                  </button>
                ))}
              </div>
              {area ? (
                <div className="space-y-2 rounded-xl border border-line p-3">
                  <Field label={t('mm.areaName', 'Nome')}>
                    <Input value={area.name} onChange={(e) => patchArea((a) => (a.name = e.target.value.slice(0, 60)))} />
                  </Field>
                  <Field label={t('mm.areaKind', 'Tipo')}>
                    <Select value={area.kind} onChange={(e) => patchArea((a) => (a.kind = e.target.value as MapArea['kind']))}>
                      <option value="private">{t('mm.kindPrivate', 'Área privada (sala, mesa de conversa)')}</option>
                      <option value="spotlight">{t('mm.kindSpotlight', 'Palco (Spotlight)')}</option>
                    </Select>
                  </Field>
                  {area.kind === 'private' ? (
                    <>
                      <Field label={t('mm.areaCap', 'Capacidade')}>
                        <Input type="number" min={1} max={200} value={area.capacity} onChange={(e) => patchArea((a) => (a.capacity = Math.max(1, Math.min(200, Number(e.target.value) || 1))))} />
                      </Field>
                      <Toggle checked={Boolean(area.meeting)} onChange={(v) => patchArea((a) => (a.meeting = v))} label={t('mm.areaMeeting', 'Sala de reunião (permite notas de reunião)')} />
                      <Toggle checked={area.staffOnly} onChange={(v) => patchArea((a) => (a.staffOnly = v))} label={t('mm.areaStaff', 'Somente equipe (convidados não entram)')} />
                    </>
                  ) : null}
                  <Button
                    small
                    variant="danger"
                    onClick={() => {
                      snapshot();
                      mapRef.current.areas = mapRef.current.areas.filter((a) => a.id !== area.id);
                      setSelArea(null);
                      bump();
                    }}
                  >
                    {t('mm.areaDelete', 'Excluir área')}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
          {tab === 'versions' ? (
            <div className="space-y-2">
              <a href={`/api/offices/${office.id}/map/tiled`} className="text-xs text-gold underline">
                {t('mm.tiled', 'Exportar a versão publicada para o Tiled (.json)')}
              </a>
              {(versions ?? []).map((v) => (
                <div key={v.id} className="rounded-lg border border-line p-2 text-xs">
                  <p className="flex items-center justify-between gap-2">
                    <span>{new Date(v.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {v.published ? <Badge color="green">{t('mm.current', 'publicada')}</Badge> : null}
                  </p>
                  <p className="text-muted">
                    {v.authorName ?? '—'} · {v.note ?? ''}
                  </p>
                  {!v.published ? (
                    <Button small variant="ghost" className="mt-1" onClick={() => void restore(v.id)}>
                      {t('mm.restore', 'Restaurar')}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* propriedades do objeto selecionado */}
          {selected && def ? (
            <div className="space-y-2 rounded-xl border border-ok/50 p-3" data-testid="obj-props">
              <p className="text-xs font-semibold text-ok">{def.label}</p>
              {def.interact ? (
                <Field label={t('mm.pTitle', 'Título')}>
                  <Input value={selected.props?.title ?? ''} onChange={(e) => setProp('title', e.target.value.slice(0, 80))} />
                </Field>
              ) : null}
              {def.interact === 'tv' ? (
                <Field label={t('mm.pYoutube', 'Link do vídeo no YouTube')}>
                  <Input value={selected.props?.url ?? ''} onChange={(e) => setProp('url', e.target.value.trim())} placeholder="https://youtu.be/…" />
                </Field>
              ) : null}
              {def.interact === 'website' || def.interact === 'game' ? (
                <Field label={t('mm.pUrl', 'Endereço (https://…)')}>
                  <Input value={selected.props?.url ?? ''} onChange={(e) => setProp('url', e.target.value.trim())} placeholder="https://" />
                </Field>
              ) : null}
              {def.interact === 'poster' ? (
                <>
                  <Field label={t('mm.pImage', 'Imagem')}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="text-xs"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f)
                          uploadImage(f)
                            .then((u) => setProp('url', u))
                            .catch((err) => toast(errMsg(err), 'error'));
                      }}
                    />
                  </Field>
                  {selected.props?.url ? <img src={selected.props.url} alt="" className="max-h-24 rounded" /> : null}
                </>
              ) : null}
              {def.interact === 'note' || def.interact === 'poster' ? (
                <Field label={t('mm.pText', 'Texto')}>
                  <Textarea value={selected.props?.text ?? ''} onChange={(e) => setProp('text', e.target.value.slice(0, 500))} />
                </Field>
              ) : null}
              {selected.type === 'portal' ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted">{Number.isInteger(selected.props?.toX) ? t('mm.pTarget', 'Destino: {{x}}, {{y}}', { x: selected.props!.toX, y: selected.props!.toY }) : t('mm.pNoTarget', 'Sem destino definido.')}</p>
                  <Button small variant={tool === 'target' ? 'primary' : 'ghost'} onClick={() => setTool('target')}>
                    {t('mm.pPick', 'Clicar no destino')}
                  </Button>
                </div>
              ) : null}
              {def.resizable ? (
                <div className="flex items-center gap-2 text-xs">
                  {t('mm.pSize', 'Tamanho')}
                  <Input type="number" min={1} max={12} value={objSize(selected).w} onChange={(e) => patchObj((o) => (o.w = Math.max(1, Math.min(12, Number(e.target.value) || 1))))} />
                  ×
                  <Input type="number" min={1} max={12} value={objSize(selected).h} onChange={(e) => patchObj((o) => (o.h = Math.max(1, Math.min(12, Number(e.target.value) || 1))))} />
                </div>
              ) : null}
              <Toggle checked={Boolean(selected.props?.above)} onChange={(v) => setProp('above', v)} label={t('mm.pAbove', 'Desenhar acima dos avatares')} />
              <Button
                small
                variant="danger"
                onClick={() => {
                  snapshot();
                  mapRef.current.objects = mapRef.current.objects.filter((o) => o.id !== selected.id && o.ownerDeskId !== selected.id);
                  setSelObj(null);
                  bump();
                }}
              >
                {t('mm.pDelete', 'Excluir objeto')}
              </Button>
            </div>
          ) : null}
        </div>

        {/* mapa */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button small variant="subtle" onClick={doUndo} disabled={!undo.current.length} title="Ctrl+Z">
              ↶ {t('mm.undo', 'Desfazer')}
            </Button>
            <Button small variant="subtle" onClick={doRedo} disabled={!redo.current.length} title="Ctrl+Y">
              ↷ {t('mm.redo', 'Refazer')}
            </Button>
            <span className="mx-1 h-5 w-px bg-line" />
            <Button small variant="subtle" onClick={() => setZoom(Math.max(0.25, zoom / 1.5))}>
              −
            </Button>
            <span className="w-12 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
            <Button small variant="subtle" onClick={() => setZoom(Math.min(3, zoom * 1.5))}>
              ＋
            </Button>
            <Toggle checked={!overlays} onChange={(v) => setOverlays(!v)} label={t('mm.preview', 'Pré-visualizar')} />
            <span className="text-xs text-muted">{t('mm.stats', '{{w}}×{{h}} · {{d}} mesas · {{a}} áreas', { w: map.width, h: map.height, d: mapDesks(map).length, a: map.areas.length })}</span>
            <span className="ml-auto flex items-center gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('mm.note', 'Descrição da mudança (opcional)')} className="w-56" maxLength={200} />
              <Button small variant="ghost" onClick={() => void validate()}>
                {t('mm.validate', 'Validar')}
              </Button>
              <Button small onClick={() => void publish()} disabled={busy || !dirty} data-testid="mm-publish">
                {t('mm.publish', 'Publicar')}
              </Button>
            </span>
          </div>
          {report ? (
            <div className={cx('rounded-lg border px-3 py-2 text-xs', report.ok ? 'border-ok/50 text-ok' : 'border-danger/60 text-red-200')}>
              {report.ok ? t('mm.valid', '✓ Mapa válido ({{n}} mesas).', { n: report.desks }) : null}
              {report.errors.map((e) => (
                <p key={e}>✗ {e}</p>
              ))}
              {report.warnings.map((w) => (
                <p key={w} className="text-warn">
                  ⚠ {w}
                </p>
              ))}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-black">
            <canvas
              ref={canvas}
              data-testid="mm-canvas"
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={() => {
                drag.current = null;
                setBox(null);
              }}
              style={{ width: map.width * T * zoom, height: map.height * T * zoom, cursor: tool === 'select' ? 'default' : 'crosshair' }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
