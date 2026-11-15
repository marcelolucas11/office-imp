// SPDX-License-Identifier: AGPL-3.0-only
// Editor do avatar (visual v2): abas por peça, paleta de 16 cores, acessórios de múltipla
// escolha com as combinações impossíveis indicadas, e prévia ao vivo nas 4 direções.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ACC,
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  DIRS,
  accessoryBlockers,
  avatarAccessory,
  sanitizeAvatar,
  toggleAccessory,
  type AvatarConfig,
  type Dir,
} from '@office-imp/shared';
import { Button, Modal, Tabs, Toggle, cx } from '@office-imp/ui';
import { avatarPortrait } from '../game/art/avatar';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { t } from '../lib/i18n';
import { accessoryLabel, beardLabel, bottomLabel, hairStyleLabel, patternLabel, shoesLabel, topLabel } from './avatarLabels';

type Tab = 'face' | 'hair' | 'top' | 'bottom' | 'shoes' | 'acc';
type Patch = Partial<AvatarConfig> | ((c: AvatarConfig) => Partial<AvatarConfig>);

/** Ordem dos quadros na prévia andando (parado, passo, parado, outro passo). */
const WALK = [0, 1, 0, 2];

const close = () => useGame.setState({ modal: null });

function dirLabel(d: Dir): string {
  if (d === 'down') return t('avatar.dir.down', 'Frente');
  if (d === 'left') return t('avatar.dir.left', 'Esquerda');
  if (d === 'right') return t('avatar.dir.right', 'Direita');
  return t('avatar.dir.up', 'Costas');
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </section>
  );
}

/** Paleta de 16 cores (8 × 2). `null` é a cor original de cada acessório. */
function Swatches({ colors, value, onPick, label }: { colors: readonly (string | null)[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="grid w-fit grid-cols-8 gap-1.5">
      {colors.map((c, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${label} ${i + 1}`}
          aria-pressed={value === i}
          title={c === null ? t('avatar.accColorOriginal', 'Cor original de cada acessório') : `${label} ${i + 1}`}
          onClick={() => onPick(i)}
          className={cx('h-7 w-7 rounded-md border-2 transition-transform hover:scale-110', value === i ? 'border-gold ring-2 ring-gold/40' : 'border-line')}
          style={{ background: c ?? 'linear-gradient(135deg, #d7b870 0 50%, #b91c1c 50% 100%)' }}
        />
      ))}
    </div>
  );
}

/** Opções de escolha única (estilo, tipo, estampa). */
function Choices({ count, value, label, onPick }: { count: number; value: number; label: (i: number) => string; onPick: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={value === i}
          onClick={() => onPick(i)}
          className={cx('rounded-lg border px-2 py-1 text-xs', value === i ? 'border-gold bg-gold/15 text-gold' : 'border-line hover:border-muted')}
        >
          {label(i)}
        </button>
      ))}
    </div>
  );
}

/** Prévia nas 4 direções; andando, troca os quadros de caminhada. */
function Preview({ cfg }: { cfg: AvatarConfig }) {
  const [walk, setWalk] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!walk) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % WALK.length), 220);
    return () => window.clearInterval(id);
  }, [walk]);
  const frame = walk ? WALK[step] : 0;
  return (
    <div className="flex shrink-0 flex-col items-center gap-3">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-panel-2 p-2">
        {DIRS.map((d) => (
          <figure key={d} className="flex flex-col items-center gap-1 rounded-lg bg-[#5d6270] px-2 pt-2 pb-1">
            <img src={avatarPortrait(cfg, 3, d, frame)} alt={dirLabel(d)} className="pixel h-36 w-24" />
            <figcaption className="text-[11px] text-stone-100">{dirLabel(d)}</figcaption>
          </figure>
        ))}
      </div>
      <Toggle checked={walk} onChange={setWalk} label={t('avatar.walk', 'Ver andando')} />
    </div>
  );
}

const GROUPS: { title: () => string; ids: number[] }[] = [
  { title: () => t('avatar.accEyes', 'Óculos (um modelo por vez)'), ids: [ACC.Glasses, ACC.Sunglasses, ACC.RoundGlasses] },
  { title: () => t('avatar.accHead', 'Cabeça e orelhas'), ids: [ACC.Cap, ACC.Hat, ACC.Headphones, ACC.Headset] },
  { title: () => t('avatar.accOther', 'Outros'), ids: [ACC.Tie, ACC.Watch, ACC.Earring, ACC.Badge] },
];

function Accessories({ cfg, set }: { cfg: AvatarConfig; set: (p: Patch) => void }) {
  const colorable = cfg.accessories.some((id) => avatarAccessory(id)?.colorable);
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <Section key={g.ids[0]} title={g.title()}>
          <div className="flex flex-wrap gap-1.5">
            {g.ids.map((id) => {
              const on = cfg.accessories.includes(id);
              const blockers = on ? [] : accessoryBlockers(cfg.accessories, id);
              const swap = blockers.map(accessoryLabel).join(', ');
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  title={blockers.length ? t('avatar.accSwap', 'Não combina com {{list}}. Clique para trocar.', { list: swap }) : undefined}
                  onClick={() => set((c) => ({ accessories: toggleAccessory(c.accessories, id) }))}
                  className={cx(
                    'flex items-center gap-1 rounded-lg border px-2 py-1 text-xs',
                    on ? 'border-gold bg-gold/15 text-gold' : blockers.length ? 'border-dashed border-line text-muted opacity-60 hover:opacity-100' : 'border-line hover:border-muted',
                  )}
                >
                  {on ? <span aria-hidden>✓</span> : null}
                  {accessoryLabel(id)}
                  {blockers.length ? <span className="text-[10px]">⇄ {swap}</span> : null}
                </button>
              );
            })}
          </div>
        </Section>
      ))}
      <p className="text-xs text-muted">
        {t('avatar.accRules', 'Boné e chapéu não vão juntos, nem fones e headset. Chapéu e brinco não combinam com fones nem headset. Clicar num item bloqueado troca o que estiver no lugar.')}
      </p>
      <Section title={t('avatar.accColor', 'Cor dos acessórios')} hint={colorable ? t('avatar.accColorHint', 'Vale para boné, chapéu, gravata e o detalhe do headset. A primeira é a cor original de cada um.') : t('avatar.accColorNone', 'Escolha um boné, chapéu, gravata ou headset para mudar a cor.')}>
        <Swatches colors={AVATAR_OPTIONS.accColor} value={cfg.accColor ?? 0} label={t('avatar.accColor', 'Cor dos acessórios')} onPick={(i) => set({ accColor: i })} />
      </Section>
    </div>
  );
}

export function AvatarModal() {
  const me = useGame((s) => s.players[s.meId]);
  const [cfg, setCfg] = useState<AvatarConfig>(() => sanitizeAvatar(me?.avatar ?? DEFAULT_AVATAR));
  const [tab, setTab] = useState<Tab>('face');
  const set = (patch: Patch) => setCfg((c) => sanitizeAvatar({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) }));
  const O = AVATAR_OPTIONS;
  const tabs: { id: Tab; label: ReactNode }[] = [
    { id: 'face', label: <span className="whitespace-nowrap">{t('avatar.tabFace', 'Rosto')}</span> },
    { id: 'hair', label: <span className="whitespace-nowrap">{t('avatar.tabHair', 'Cabelo')}</span> },
    { id: 'top', label: <span className="whitespace-nowrap">{t('avatar.tabTop', 'Roupa de cima')}</span> },
    { id: 'bottom', label: <span className="whitespace-nowrap">{t('avatar.tabBottom', 'Roupa de baixo')}</span> },
    { id: 'shoes', label: <span className="whitespace-nowrap">{t('avatar.tabShoes', 'Calçado')}</span> },
    { id: 'acc', label: <span className="whitespace-nowrap">{t('avatar.tabAcc', 'Acessórios')}</span> },
  ];
  return (
    <Modal
      wide
      title={t('avatar.title', 'Personalizar o avatar')}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={() => setCfg(sanitizeAvatar(me?.avatar ?? DEFAULT_AVATAR))}>
            {t('avatar.undo', 'Desfazer mudanças')}
          </Button>
          <Button
            onClick={() => {
              net.send('avatar', cfg);
              close();
            }}
          >
            {t('app.save', 'Salvar')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 md:flex-row">
        <Preview cfg={cfg} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="overflow-x-auto">
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
          </div>
          {tab === 'face' ? (
            <>
              <Section title={t('avatar.skin', 'Pele')}>
                <Swatches colors={O.skin} value={cfg.skin} label={t('avatar.skin', 'Pele')} onPick={(i) => set({ skin: i })} />
              </Section>
              <Section title={t('avatar.beard', 'Barba e bigode')} hint={t('avatar.beardHint', 'A barba usa a cor do cabelo.')}>
                <Choices count={O.beards.length} value={cfg.beard ?? 0} label={beardLabel} onPick={(i) => set({ beard: i })} />
              </Section>
            </>
          ) : null}
          {tab === 'hair' ? (
            <>
              <Section title={t('avatar.hair', 'Cabelo')}>
                <Choices count={O.hairStyles.length} value={cfg.hair} label={hairStyleLabel} onPick={(i) => set({ hair: i })} />
              </Section>
              <Section title={t('avatar.hairColor', 'Cor do cabelo')}>
                <Swatches colors={O.hairColor} value={cfg.hairColor} label={t('avatar.hairColor', 'Cor do cabelo')} onPick={(i) => set({ hairColor: i })} />
              </Section>
            </>
          ) : null}
          {tab === 'top' ? (
            <>
              <Section title={t('avatar.topKind', 'Tipo')}>
                <Choices count={O.tops.length} value={cfg.top ?? 0} label={topLabel} onPick={(i) => set({ top: i })} />
              </Section>
              <Section title={t('avatar.pattern', 'Estampa')}>
                <Choices count={O.patterns.length} value={cfg.pattern ?? 0} label={patternLabel} onPick={(i) => set({ pattern: i })} />
              </Section>
              <Section title={t('avatar.topColor', 'Cor')}>
                <Swatches colors={O.shirt} value={cfg.shirt} label={t('avatar.topColor', 'Cor')} onPick={(i) => set({ shirt: i })} />
              </Section>
            </>
          ) : null}
          {tab === 'bottom' ? (
            <>
              <Section title={t('avatar.bottomKind', 'Tipo')}>
                <Choices count={O.bottoms.length} value={cfg.bottom ?? 0} label={bottomLabel} onPick={(i) => set({ bottom: i })} />
              </Section>
              <Section title={t('avatar.bottomColor', 'Cor')}>
                <Swatches colors={O.pants} value={cfg.pants} label={t('avatar.bottomColor', 'Cor')} onPick={(i) => set({ pants: i })} />
              </Section>
            </>
          ) : null}
          {tab === 'shoes' ? (
            <>
              <Section title={t('avatar.shoesKind', 'Tipo')}>
                <Choices count={O.shoes.length} value={cfg.shoes ?? 0} label={shoesLabel} onPick={(i) => set({ shoes: i })} />
              </Section>
              <Section title={t('avatar.shoeColor', 'Cor')}>
                <Swatches colors={O.shoeColor} value={cfg.shoeColor ?? 0} label={t('avatar.shoeColor', 'Cor')} onPick={(i) => set({ shoeColor: i })} />
              </Section>
            </>
          ) : null}
          {tab === 'acc' ? <Accessories cfg={cfg} set={set} /> : null}
        </div>
      </div>
    </Modal>
  );
}
