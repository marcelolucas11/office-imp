// SPDX-License-Identifier: AGPL-3.0-only
// Preferência local "Reduzir animações" (Fase F do visual v2). Sem escolha salva, segue o
// `prefers-reduced-motion` do sistema; depois que a pessoa escolhe nas configurações, vale a
// escolha dela (guardada no navegador, como as preferências de áudio e vídeo).
import { create } from 'zustand';

export const MOTION_KEY = 'oi-reduce-motion';
const QUERY = '(prefers-reduced-motion: reduce)';

/** Valor efetivo: `'1'` = reduzir, `'0'` = animar, qualquer outra coisa (ou nada) = o do sistema. */
export function resolveReduceMotion(stored: string | null | undefined, systemPrefersReduced: boolean): boolean {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return systemPrefersReduced;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function systemQuery(): MediaQueryList | null {
  try {
    return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia(QUERY);
  } catch {
    return null;
  }
}

function stored(): string | null {
  try {
    return storage()?.getItem(MOTION_KEY) ?? null;
  } catch {
    return null;
  }
}

interface MotionState {
  /** Animações de contexto paradas no quadro 0. */
  reduce: boolean;
  /** A pessoa escolheu nas configurações (senão, segue o sistema). */
  explicit: boolean;
}

export function loadMotion(): MotionState {
  const s = stored();
  return { reduce: resolveReduceMotion(s, systemQuery()?.matches ?? false), explicit: s === '1' || s === '0' };
}

export const useMotion = create<MotionState>(() => loadMotion());

/** Liga ou desliga "Reduzir animações" e guarda a escolha. */
export function setReduceMotion(reduce: boolean): void {
  try {
    storage()?.setItem(MOTION_KEY, reduce ? '1' : '0');
  } catch {}
  useMotion.setState({ reduce, explicit: true });
}

// enquanto a pessoa não escolheu, acompanha a mudança do sistema na hora
systemQuery()?.addEventListener?.('change', (e) => {
  if (!useMotion.getState().explicit) useMotion.setState({ reduce: e.matches });
});
