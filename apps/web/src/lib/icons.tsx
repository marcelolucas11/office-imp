// SPDX-License-Identifier: AGPL-3.0-only
// Ícones 2D de traço branco sobre fundo preto, no lugar dos emojis 3D do sistema.
// Desenhos da biblioteca Lucide (licença ISC, ver assets/LICENSES.md).
import { Fragment, type ReactNode } from 'react';
import {
  AppWindow,
  Armchair,
  Building2,
  Cake,
  Calendar,
  Candy,
  Car,
  ChartBar,
  CircleArrowUp,
  CircleDot,
  Coffee,
  DoorOpen,
  Eraser,
  Eye,
  Flag,
  Flame,
  Flower2,
  Footprints,
  Gift,
  Hand,
  Headphones,
  Heart,
  House,
  Laptop,
  Laugh,
  Link,
  Lock,
  LockOpen,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  MessageCircleQuestion,
  MicOff,
  Monitor,
  MousePointer2,
  Music,
  NotebookPen,
  PaintBucket,
  PartyPopper,
  Pause,
  Pencil,
  PersonStanding,
  Phone,
  Pizza,
  Play,
  ReceiptText,
  Settings,
  SkipBack,
  SkipForward,
  Smile,
  Sparkles,
  Sprout,
  Thermometer,
  ThumbsUp,
  Trash2,
  TreePalm,
  Trophy,
  Users,
  UtensilsCrossed,
  Volume1,
  Volume2,
  Wrench,
  type IconNode,
} from 'lucide';

/** Emoji → desenho. Emojis fora desta lista continuam como texto. */
const BY_EMOJI: Record<string, IconNode> = {
  '👋': Hand,
  '✋': Hand,
  '👍': ThumbsUp,
  '❤': Heart,
  '💛': Heart,
  '😂': Laugh,
  '🎉': PartyPopper,
  '👏': Sparkles,
  '🤔': MessageCircleQuestion,
  '🔥': Flame,
  '☕': Coffee,
  '🎁': Gift,
  '🎵': Music,
  '🎧': Headphones,
  '📝': NotebookPen,
  '🖥': Monitor,
  '💻': Laptop,
  '🔇': MicOff,
  '🔊': Volume2,
  '🔈': Volume1,
  '🗺': MapIcon,
  '📍': MapPin,
  '📅': Calendar,
  '💬': MessageCircle,
  '📊': ChartBar,
  '🪑': Armchair,
  '🪴': Sprout,
  '🪟': AppWindow,
  '🧍': PersonStanding,
  '🛠': Wrench,
  '🚪': DoorOpen,
  '🚩': Flag,
  '😀': Smile,
  '🔒': Lock,
  '🔓': LockOpen,
  '⏸': Pause,
  '▶': Play,
  '⏮': SkipBack,
  '⏭': SkipForward,
  '🧽': Eraser,
  '🪣': PaintBucket,
  '🖱': MousePointer2,
  '🧁': Cake,
  '🤒': Thermometer,
  '🚶': Footprints,
  '🚗': Car,
  '🗑': Trash2,
  '📞': Phone,
  '🏠': House,
  '🏆': Trophy,
  '🍽': UtensilsCrossed,
  '🍫': Candy,
  '🍕': Pizza,
  '🌹': Flower2,
  '🌴': TreePalm,
  '⚙': Settings,
  '🏢': Building2,
  '👥': Users,
  '🔗': Link,
  '🧾': ReceiptText,
  '👁': Eye,
  '✏': Pencil,
  '🔴': CircleDot,
  '⬆': CircleArrowUp,
};

/** O aceno é a mão inclinada (o "✋" de levantar a mão fica reta). */
const TILT: Record<string, number> = { '👋': -22 };

const strip = (e: string) => e.replace(/[\uFE0E\uFE0F]/g, '');

export function iconFor(emoji: string): IconNode | null {
  return BY_EMOJI[strip(emoji)] ?? null;
}

export function hasIcon(emoji: string): boolean {
  return iconFor(emoji) !== null;
}

const KEYS = Object.keys(BY_EMOJI).sort((a, b) => b.length - a.length);
const SPLIT = new RegExp(`(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[\uFE0E\uFE0F]?`, 'gu');

function Svg({ node, size, tilt }: { node: IconNode; size: number; tilt?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffffff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      {node.map(([tag, attrs], i) => {
        const Tag = tag as any;
        const { key: _k, ...rest } = attrs as Record<string, string | number>;
        return <Tag key={i} {...rest} />;
      })}
    </svg>
  );
}

/**
 * Um emoji como ícone 2D: traço branco, fundo preto arredondado.
 * `size` é o tamanho total da caixa em px. Emojis sem desenho caem para o próprio caractere.
 */
export function Emo({ e, size = 18, title, className }: { e: string; size?: number; title?: string; className?: string }) {
  const node = iconFor(e);
  if (!node) return <span className={className}>{e}</span>;
  const inner = Math.round(size * 0.68);
  return (
    <span
      role="img"
      aria-label={title ?? e}
      title={title}
      className={`oi-emo inline-grid shrink-0 place-items-center rounded-[28%] bg-black align-[-0.2em] ring-1 ring-white/15 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <Svg node={node} size={inner} tilt={TILT[strip(e)]} />
    </span>
  );
}

/** Texto com os emojis conhecidos trocados por ícones (para rótulos, avisos e menus). */
export function EmoText({ text, size = 16 }: { text: string; size?: number }): ReactNode {
  if (!text) return text;
  const parts = text.split(SPLIT);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <Emo key={i} e={p} size={size} /> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

/** Ícone desenhado num canvas (para o mapa do Phaser): caixa preta arredondada com traço branco. */
export function emojiCanvas(emoji: string, px: number): HTMLCanvasElement | null {
  const node = iconFor(emoji);
  if (!node) return null;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d')!;
  const rad = px * 0.28;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, px - 1, px - 1, rad);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, px / 32);
  ctx.stroke();
  const inner = px * 0.66;
  const s = inner / 24;
  ctx.save();
  ctx.translate(px / 2, px / 2);
  const tilt = TILT[strip(emoji)];
  if (tilt) ctx.rotate((tilt * Math.PI) / 180);
  ctx.translate(-inner / 2, -inner / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [tag, a] of node) {
    const n = (k: string) => Number((a as Record<string, unknown>)[k] ?? 0);
    const p = new Path2D();
    if (tag === 'path') p.addPath(new Path2D(String((a as Record<string, unknown>).d)));
    else if (tag === 'circle') p.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    else if (tag === 'ellipse') p.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
    else if (tag === 'rect') p.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx'));
    else if (tag === 'line') {
      p.moveTo(n('x1'), n('y1'));
      p.lineTo(n('x2'), n('y2'));
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = String((a as Record<string, unknown>).points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      for (let i = 0; i + 1 < pts.length; i += 2) (i === 0 ? p.moveTo : p.lineTo).call(p, pts[i], pts[i + 1]);
      if (tag === 'polygon') p.closePath();
    }
    ctx.stroke(p);
  }
  ctx.restore();
  return c;
}
