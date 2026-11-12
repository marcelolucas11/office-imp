import type { ReactNode } from 'react';
import { APP_NAME } from '@office-imp/shared';
import { Card } from '@office-imp/ui';
import { t } from '../lib/i18n';
import { desktop } from '../lib/session';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0b0b0d" stroke="#d7b870" strokeWidth="1.5" />
        <path d="M16 6 L26 16 L16 26 L6 16 Z" fill="none" stroke="#d7b870" strokeWidth="2.5" />
        <rect x="13" y="13" width="6" height="6" fill="#d7b870" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-stone-100">
        office<span className="text-gold">-imp</span>
      </span>
    </span>
  );
}

/** Moldura das telas de acesso (login, convite, configuração inicial). */
export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10" style={{ maxWidth: wide ? 720 : 440 }}>
        <Logo size={36} />
        <Card className="w-full space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold text-gold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          {children}
        </Card>
        <p className="text-center text-[11px] text-muted">
          {APP_NAME} v{__APP_VERSION__} · {t('shell.license', 'software livre (AGPL-3.0)')}
          {desktop ? (
            <>
              {' · '}
              <button type="button" className="underline hover:text-gold" onClick={() => desktop?.changeServer()}>
                {t('shell.changeServer', 'trocar servidor')}
              </button>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-red-200">{children}</div>;
}
