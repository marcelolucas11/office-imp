// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-gold text-ink hover:bg-gold-soft font-semibold',
  ghost: 'border border-line text-stone-100 hover:border-gold hover:text-gold',
  subtle: 'bg-panel-3 text-stone-100 hover:bg-line',
  danger: 'bg-danger/90 text-white hover:bg-danger font-semibold',
};

export function Button({ variant = 'primary', small, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50', small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm', VARIANT[variant], className)}
    />
  );
}

export function IconButton({ active, danger, label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; danger?: boolean; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={cx(
        'relative grid h-10 w-10 place-items-center rounded-xl text-lg transition-colors disabled:opacity-40',
        danger ? 'bg-danger/90 text-white hover:bg-danger' : active ? 'bg-gold text-ink' : 'bg-panel-3 text-stone-100 hover:bg-line',
        className,
      )}
    >
      {children}
    </button>
  );
}

const fieldCls = 'w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-stone-100 placeholder:text-muted focus:border-gold focus:outline-none';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(fieldCls, className)} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(fieldCls, 'min-h-20', className)} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(fieldCls, className)}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, group }: { label: string; hint?: string; children: ReactNode; group?: boolean }) {
  // "group": vários controles sob um mesmo rótulo (não usa <label>, que ativaria só o primeiro)
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block space-y-1">
      <span className="block text-xs font-medium text-stone-300">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] leading-snug text-muted">{hint}</span> : null}
    </Tag>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-panel p-4', className)}>{children}</div>;
}

export function Badge({ color = 'gold', children }: { color?: 'gold' | 'gray' | 'green' | 'red' | 'yellow'; children: ReactNode }) {
  const c = { gold: 'bg-gold/15 text-gold', gray: 'bg-panel-3 text-muted', green: 'bg-ok/15 text-ok', red: 'bg-danger/15 text-danger', yellow: 'bg-warn/15 text-warn' }[color];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', c)}>{children}</span>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-3 text-sm', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-gold' : 'bg-panel-3')}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      <span>{label}</span>
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent', className)} />;
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean | 'full'; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-2xl border border-line bg-panel shadow-2xl', wide === 'full' ? 'h-[92vh] max-w-[96vw]' : wide ? 'max-w-4xl' : 'max-w-md')}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-gold">{title}</h2>
          {onClose ? (
            <button type="button" aria-label="Fechar" onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-panel-3 hover:text-stone-100">
              ✕
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx('-mb-px border-b-2 px-3 py-2 text-sm transition-colors', value === t.id ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-stone-100')}
        >
          {t.label}
          {t.badge ? <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}
