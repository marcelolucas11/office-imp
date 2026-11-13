// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  AVATAR_OPTIONS,
  DESK_DECOR_TYPES,
  MAX_DESK_DECOR,
  MAX_INTERACTION_DISTANCE,
  MIN_INTERACTION_DISTANCE,
  DEFAULT_INTERACTION_DISTANCE,
  OBJECT_DEFS,
  ROLE_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  areaCenter,
  can,
  parseYouTubeUrl,
  type AvatarConfig,
  type MapObject,
} from '@office-imp/shared';
import { Badge, Button, Empty, Field, Input, Modal, Select, Spinner, Tabs, Textarea, Toggle, cx } from '@office-imp/ui';
import { avatarPortrait } from '../game/art/avatar';
import { objectIcon } from '../game/art/objects';
import { net } from '../game/net';
import { useGame } from '../game/store';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { desktop, toast, useSession } from '../lib/session';
import { av, useAv } from './av';
import { Emo, EmoText } from '../lib/icons';

const Whiteboard = lazy(() => import('./Whiteboard'));
const close = () => useGame.setState({ modal: null });

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  return (await api.post<{ url: string }>('/api/uploads', fd)).url;
}

// ---------- objetos interativos ----------
export function ObjectModal({ object }: { object: MapObject }) {
  const def = OBJECT_DEFS[object.type];
  const canAdmin = useGame((s) => s.canAdmin);
  const title = object.props?.title || def?.label || '';
  const url = String(object.props?.url ?? '');
  const notSet = (
    <Empty>
      {t('object.notSet', 'Este objeto ainda não foi configurado.')}
      {canAdmin ? ` ${t('object.notSetAdmin', 'Abra o Mapmaker, selecione o objeto e preencha as propriedades.')}` : ''}
    </Empty>
  );
  if (def?.interact === 'whiteboard') {
    return (
      <Modal title={title} wide="full" onClose={close}>
        <Suspense fallback={<Spinner />}>
          <Whiteboard objectId={object.id} />
        </Suspense>
      </Modal>
    );
  }
  if (def?.interact === 'tv') {
    const ref = parseYouTubeUrl(url);
    const src = ref?.videoId ? `https://www.youtube-nocookie.com/embed/${ref.videoId}?autoplay=1&rel=0${ref.listId ? `&list=${ref.listId}` : ''}` : ref?.listId ? `https://www.youtube-nocookie.com/embed/videoseries?list=${ref.listId}&autoplay=1` : '';
    return (
      <Modal title={title} wide onClose={close}>
        {src ? <iframe title={title} src={src} className="aspect-video w-full rounded-xl" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : notSet}
      </Modal>
    );
  }
  if (def?.interact === 'website' || def?.interact === 'game') {
    const ok = /^https:\/\//.test(url);
    return (
      <Modal
        title={title}
        wide="full"
        onClose={close}
        footer={
          ok ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">
              {t('object.openTab', 'Abrir em nova aba')}
            </a>
          ) : undefined
        }
      >
        {ok ? (
          <div className="flex h-full flex-col gap-2">
            <iframe title={title} src={url} className="min-h-0 w-full flex-1 rounded-xl bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock" allow="fullscreen; gamepad" />
            <p className="text-[11px] text-muted">{t('object.iframeNote', 'Alguns sites não permitem ser abertos dentro de outro. Se a área acima ficar em branco, use “Abrir em nova aba”.')}</p>
          </div>
        ) : (
          notSet
        )}
      </Modal>
    );
  }
  if (def?.interact === 'poster') {
    return (
      <Modal title={title} wide onClose={close}>
        {url ? <img src={url} alt={title} className="mx-auto max-h-[75vh] rounded-xl" /> : notSet}
        {object.props?.text ? <p className="mt-3 whitespace-pre-wrap text-sm">{object.props.text}</p> : null}
      </Modal>
    );
  }
  return (
    <Modal title={title} onClose={close}>
      {object.props?.text ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{object.props.text}</p> : notSet}
    </Modal>
  );
}

// ---------- mesas ----------
const GIFTS = ['🎁', '☕', '🍫', '🧁', '🌹', '🏆', '🍕', '💛'];

export function DeskModal({ deskId }: { deskId: string }) {
  const desk = useGame((s) => s.desks.find((d) => d.id === deskId));
  const me = useGame((s) => s.players[s.meId]);
  const isUser = useSession((s) => s.me?.kind === 'user');
  const [kind, setKind] = useState<'note' | 'gift'>('note');
  const [content, setContent] = useState('');
  const [emoji, setEmoji] = useState(GIFTS[0]);
  if (!desk || !me) return null;
  if (!desk.userId) {
    return (
      <Modal title={t('desk.free', 'Mesa livre')} onClose={close}>
        {isUser && can(me.role, 'desk.claim') ? (
          <div className="space-y-3">
            <p className="text-sm">{me.deskId ? t('desk.claimSwap', 'Você já tem uma mesa. Se pegar esta, a outra fica livre (a decoração dela continua lá até você remover).') : t('desk.claimHelp', 'A mesa mostra o seu nome e fica acesa quando você está online. Colegas podem deixar recados e presentes nela.')}</p>
            <Button
              data-testid="claim-desk"
              onClick={() => {
                net.send('desk:claim', { deskId });
                close();
              }}
            >
              {t('desk.claim', 'Esta mesa é minha')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('desk.guestNo', 'Convidados não têm mesa.')}</p>
        )}
      </Modal>
    );
  }
  const send = () => {
    if (!content.trim()) return;
    net.send('desk:item', { deskId, kind, content: content.trim(), emoji });
    close();
  };
  return (
    <Modal title={t('desk.of', 'Mesa de {{name}}', { name: desk.userName })} onClose={close} footer={<Button onClick={send}>{kind === 'gift' ? t('desk.sendGift', 'Deixar presente') : t('desk.sendNote', 'Deixar recado')}</Button>}>
      <div className="space-y-3">
        <p className="text-xs text-muted">{desk.online ? t('desk.onlineNow', '{{name}} está online agora.', { name: desk.userName }) : t('desk.offlineNow', '{{name}} está offline. O recado aparece quando entrar.', { name: desk.userName })}</p>
        <Tabs
          tabs={[
            { id: 'note', label: <EmoText text={t('desk.note', '📝 Recado')} /> },
            { id: 'gift', label: <EmoText text={t('desk.gift', '🎁 Presente')} /> },
          ]}
          value={kind}
          onChange={setKind}
        />
        {kind === 'gift' ? (
          <div className="flex flex-wrap gap-1">
            {GIFTS.map((g) => (
              <button key={g} type="button" onClick={() => setEmoji(g)} className={cx('rounded-lg p-1.5', emoji === g ? 'bg-gold/25' : 'hover:bg-panel-3')}>
                <Emo e={g} size={30} />
              </button>
            ))}
          </div>
        ) : null}
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={500} placeholder={kind === 'gift' ? t('desk.giftPh', 'Uma mensagem para acompanhar o presente…') : t('desk.notePh', 'Escreva o seu recado…')} autoFocus />
      </div>
    </Modal>
  );
}

export function MyDeskModal() {
  const items = useGame((s) => s.deskItems);
  const me = useGame((s) => s.players[s.meId]);
  const map = useGame((s) => s.map);
  const [tab, setTab] = useState<'inbox' | 'decor'>('inbox');
  const [type, setType] = useState(DESK_DECOR_TYPES[0]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = useMemo(() => (map && me?.deskId ? map.objects.filter((o) => o.ownerDeskId === me.deskId) : []), [map, me?.deskId]);

  useEffect(() => {
    net.send('desk:items');
    net.send('desk:seen');
  }, []);

  if (!me?.deskId) {
    return (
      <Modal title={t('mydesk.title', 'Minha mesa')} onClose={close}>
        <Empty>{t('mydesk.none', 'Você ainda não tem mesa. Vá até uma mesa livre e pressione X.')}</Empty>
      </Modal>
    );
  }
  const place = () => {
    const props: Record<string, any> = {};
    if (type === 'note') props.text = text.trim();
    if (type === 'poster') {
      props.url = url;
      props.title = title.trim();
    }
    useGame.setState({ buildMode: type, buildProps: props, modal: null });
    toast(t('mydesk.placeHint', 'Clique em um ponto da área verde da sua mesa para colocar o objeto.'), 'info');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      setUrl(await uploadImage(f));
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('mydesk.title', 'Minha mesa')} onClose={close}>
      <Tabs
        tabs={[
          { id: 'inbox', label: t('mydesk.inbox', 'Recados e presentes'), badge: items.filter((i) => !i.seen).length },
          { id: 'decor', label: t('mydesk.decor', 'Decorar (Build Tool)') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'inbox' ? (
        <div className="mt-3 space-y-2">
          {items.length === 0 ? <Empty>{t('mydesk.empty', 'Nada por aqui ainda.')}</Empty> : null}
          {items.map((i) => (
            <div key={i.id} className="flex items-start gap-3 rounded-xl bg-panel-2 p-3">
              <Emo e={i.kind === 'gift' ? (i.emoji ?? '🎁') : '📝'} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  {i.authorName} · {new Date(i.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{i.content}</p>
              </div>
              <button type="button" title={t('app.delete', 'Excluir')} className="text-muted hover:text-danger" onClick={() => net.send('desk:item:delete', { id: i.id })}>
                <Emo e="🗑" size={20} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">{t('mydesk.decorHelp', 'Escolha um objeto e depois clique na área da sua mesa. Limite de {{n}} objetos.', { n: MAX_DESK_DECOR })}</p>
          <div className="flex flex-wrap gap-2">
            {DESK_DECOR_TYPES.map((d) => (
              <button key={d} type="button" onClick={() => setType(d)} title={OBJECT_DEFS[d]?.label} className={cx('rounded-xl border p-1', type === d ? 'border-gold bg-gold/10' : 'border-line hover:border-muted')}>
                <img src={objectIcon(d)} alt={OBJECT_DEFS[d]?.label} className="pixel h-10 w-10" />
              </button>
            ))}
          </div>
          {type === 'note' ? (
            <Field label={t('mydesk.noteText', 'Texto da placa')}>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            </Field>
          ) : null}
          {type === 'poster' ? (
            <>
              <Field label={t('mydesk.posterTitle', 'Título')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
              </Field>
              <Field label={t('mydesk.posterImg', 'Imagem (PNG, JPG, GIF ou WebP, até 5 MB)')}>
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => void onFile(e.target.files?.[0])} className="text-xs" />
              </Field>
              {busy ? <Spinner /> : url ? <img src={url} alt="" className="max-h-28 rounded-lg" /> : null}
            </>
          ) : null}
          <Button onClick={place} disabled={mine.length >= MAX_DESK_DECOR || busy || (type === 'poster' && !url)}>
            {t('mydesk.place', 'Colocar na mesa')}
          </Button>
          {mine.length ? (
            <div className="space-y-1 border-t border-line pt-3">
              <p className="text-xs font-semibold text-muted">{t('mydesk.mine', 'Na sua mesa ({{n}}/{{max}})', { n: mine.length, max: MAX_DESK_DECOR })}</p>
              {mine.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <img src={objectIcon(o.type)} alt="" className="pixel h-7 w-7" />
                  <span className="flex-1">{o.props?.title || OBJECT_DEFS[o.type]?.label}</span>
                  <Button small variant="subtle" onClick={() => net.send('decor:remove', { id: o.id })}>
                    {t('app.remove', 'Remover')}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="border-t border-line pt-3">
            <Button
              small
              variant="ghost"
              onClick={() => {
                net.send('desk:release');
                close();
              }}
            >
              {t('mydesk.release', 'Liberar esta mesa')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- perfil ----------
export function ProfileModal({ playerId }: { playerId: string }) {
  const p = useGame((s) => s.players[playerId]);
  const meId = useGame((s) => s.meId);
  const map = useGame((s) => s.map);
  const isGuest = useSession((s) => s.me?.kind === 'guest');
  const [title, setTitle] = useState(p?.profile.title ?? '');
  const [about, setAbout] = useState(p?.profile.about ?? '');
  const [tz, setTz] = useState(p?.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (!p) return null;
  const mine = playerId === meId;
  const st = p.away ? 'AWAY' : p.status;
  const area = p.areaId ? map?.areas.find((a) => a.id === p.areaId)?.name : null;
  let localTime = '';
  try {
    if (p.profile.timezone) localTime = new Date().toLocaleTimeString('pt-BR', { timeZone: p.profile.timezone, hour: '2-digit', minute: '2-digit' });
  } catch {}
  return (
    <Modal title={mine ? t('profile.mine', 'Meu perfil') : p.name} onClose={close}>
      <div className="flex gap-4">
        <img src={avatarPortrait(p.avatar, 3)} alt="" className="pixel h-36 shrink-0 rounded-xl bg-panel-2 p-2" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-lg font-semibold">{p.name}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge>{ROLE_LABEL[p.role]}</Badge>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[st] }} /> {STATUS_LABEL[st]}
              </span>
              <span>· {area ?? t('people.openArea', 'área aberta')}</span>
            </p>
            {p.customStatus ? (
              <p className="mt-1 text-sm">
                {p.customStatus.emoji} {p.customStatus.text}
              </p>
            ) : null}
          </div>
          {mine && !isGuest ? (
            <div className="space-y-2">
              <Field label={t('profile.title', 'Cargo')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
              </Field>
              <Field label={t('profile.about', 'Sobre mim')}>
                <Textarea value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300} />
              </Field>
              <Field label={t('profile.tz', 'Fuso horário')}>
                <Input value={tz} onChange={(e) => setTz(e.target.value)} maxLength={60} />
              </Field>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              {p.profile.title ? <p className="text-gold-soft">{p.profile.title}</p> : null}
              {p.profile.about ? <p className="whitespace-pre-wrap text-stone-300">{p.profile.about}</p> : null}
              {localTime ? <p className="text-xs text-muted">{t('profile.localTime', 'Horário local: {{time}}', { time: localTime })}</p> : null}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {mine ? (
          <>
            {!isGuest ? (
              <Button
                onClick={() => {
                  net.send('profile', { title, about, timezone: tz });
                  close();
                }}
              >
                {t('app.save', 'Salvar')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => useGame.setState({ modal: { kind: 'avatar' } })}>
              {t('more.avatar', 'Personalizar o avatar')}
            </Button>
          </>
        ) : (
          <>
            <Button small onClick={() => net.send('wave', { to: p.id })}>
              <Emo e="👋" /> {t('people.wave', 'Acenar')}
            </Button>
            <Button
              small
              variant="ghost"
              onClick={() => {
                useGame.setState({ panel: 'chat', chatTab: 'dm', dmWith: p.id, modal: null });
              }}
            >
              <Emo e="💬" /> {t('people.message', 'Mensagem')}
            </Button>
            <Button
              small
              variant="ghost"
              onClick={() => {
                useGame.setState({ following: p.id, modal: null });
              }}
            >
              <Emo e="🚶" /> {t('profile.follow', 'Seguir')}
            </Button>
            <Button
              small
              variant="ghost"
              onClick={() => {
                net.gotoPlayer(p.id);
                close();
              }}
            >
              <Emo e="📍" /> {t('people.goto', 'Ir até')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------- avatar ----------
export function AvatarModal() {
  const me = useGame((s) => s.players[s.meId]);
  const [cfg, setCfg] = useState<AvatarConfig>(me?.avatar ?? { skin: 0, hair: 0, hairColor: 0, shirt: 0, pants: 0, accessory: 0 });
  const swatches = (key: keyof AvatarConfig, colors: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c, i) => (
        <button key={c + i} type="button" aria-label={`${key} ${i + 1}`} onClick={() => setCfg({ ...cfg, [key]: i })} className={cx('h-7 w-7 rounded-full border-2', cfg[key] === i ? 'border-gold' : 'border-line')} style={{ background: c }} />
      ))}
    </div>
  );
  const names = (key: keyof AvatarConfig, list: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((n, i) => (
        <button key={n} type="button" onClick={() => setCfg({ ...cfg, [key]: i })} className={cx('rounded-lg border px-2 py-1 text-xs', cfg[key] === i ? 'border-gold bg-gold/15 text-gold' : 'border-line hover:border-muted')}>
          {n}
        </button>
      ))}
    </div>
  );
  return (
    <Modal
      title={t('avatar.title', 'Personalizar o avatar')}
      onClose={close}
      footer={
        <Button
          onClick={() => {
            net.send('avatar', cfg);
            close();
          }}
        >
          {t('app.save', 'Salvar')}
        </Button>
      }
    >
      <div className="flex gap-5">
        <img src={avatarPortrait(cfg, 4)} alt="" className="pixel h-48 shrink-0 rounded-xl bg-panel-2 p-2" />
        <div className="space-y-3">
          <Field group label={t('avatar.skin', 'Pele')}>{swatches('skin', AVATAR_OPTIONS.skin)}</Field>
          <Field group label={t('avatar.hair', 'Cabelo')}>{names('hair', AVATAR_OPTIONS.hairStyles)}</Field>
          <Field group label={t('avatar.hairColor', 'Cor do cabelo')}>{swatches('hairColor', AVATAR_OPTIONS.hairColor)}</Field>
          <Field group label={t('avatar.shirt', 'Camisa')}>{swatches('shirt', AVATAR_OPTIONS.shirt)}</Field>
          <Field group label={t('avatar.pants', 'Calça')}>{swatches('pants', AVATAR_OPTIONS.pants)}</Field>
          <Field group label={t('avatar.accessory', 'Acessório')}>{names('accessory', AVATAR_OPTIONS.accessories)}</Field>
        </div>
      </div>
    </Modal>
  );
}

// ---------- status personalizado ----------
export function CustomStatusModal() {
  const me = useGame((s) => s.players[s.meId]);
  const [emoji, setEmoji] = useState(me?.customStatus?.emoji || '🎧');
  const [text, setText] = useState(me?.customStatus?.text ?? '');
  const [mins, setMins] = useState('0');
  const save = () => {
    const m = Number(mins);
    let until: number | null = null;
    if (m > 0) until = Date.now() + m * 60000;
    if (m === -1) {
      const end = new Date();
      end.setHours(23, 59, 0, 0);
      until = end.getTime();
    }
    net.send('customStatus', { emoji, text: text.trim(), until });
    close();
  };
  return (
    <Modal
      title={t('cstatus.title', 'Status personalizado')}
      onClose={close}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              net.send('customStatus', {});
              close();
            }}
          >
            {t('cstatus.clear', 'Limpar')}
          </Button>
          <Button onClick={save}>{t('app.save', 'Salvar')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {['🎧', '🍽️', '☕', '📞', '🏠', '🚗', '🤒', '🌴', '💻', '🔥'].map((e) => (
            <button key={e} type="button" onClick={() => setEmoji(e)} className={cx('rounded-lg p-1.5', emoji === e ? 'bg-gold/25' : 'hover:bg-panel-3')}>
              <Emo e={e} size={26} />
            </button>
          ))}
        </div>
        <Field label={t('cstatus.text', 'Texto')}>
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder={t('cstatus.ph', 'focado até 15h')} autoFocus />
        </Field>
        <Field label={t('cstatus.expire', 'Expira em')}>
          <Select value={mins} onChange={(e) => setMins(e.target.value)}>
            <option value="0">{t('cstatus.never', 'Não expira')}</option>
            <option value="30">{t('cstatus.30', '30 minutos')}</option>
            <option value="60">{t('cstatus.60', '1 hora')}</option>
            <option value="240">{t('cstatus.240', '4 horas')}</option>
            <option value="-1">{t('cstatus.today', 'Hoje')}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

// ---------- preferências ----------
export function SettingsModal() {
  const s = useAv();
  const me = useGame((g) => g.players[g.meId]);
  const canAdmin = useGame((g) => g.canAdmin);
  const { logout } = useSession();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [outs, setOuts] = useState<MediaDeviceInfo[]>([]);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  useEffect(() => {
    void av.devices('audioinput').then(setMics);
    void av.devices('videoinput').then(setCams);
    void av.devices('audiooutput').then(setOuts);
  }, []);
  const dev = (label: string, list: MediaDeviceInfo[], value: string, kind: 'audioinput' | 'videoinput' | 'audiooutput') => (
    <Field label={label}>
      <Select value={value} onChange={(e) => void av.setDevice(kind, e.target.value)}>
        <option value="">{t('settings.default', 'Padrão do sistema')}</option>
        {list.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || d.deviceId.slice(0, 8)}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <Modal title={t('settings.title', 'Áudio, vídeo e preferências')} onClose={close}>
      <div className="space-y-4">
        {dev(t('settings.mic', 'Microfone'), mics, s.micId, 'audioinput')}
        <Toggle checked={s.noiseReduce} onChange={(v) => void av.setNoiseReduce(v)} label={t('settings.noise', 'Filtro de voz (só passa a sua voz: tira carros, rua, teclado, música e barulho de fundo)')} />
        {s.noiseReduce ? (
          <Field
            label={t('settings.micFilter', 'Intensidade do filtro')}
            hint={t('settings.micFilterHint', 'Forte: só passa quem está bem perto do microfone. Leve: use se a sua voz estiver cortando.')}
          >
            <Select value={s.micFilter} onChange={(e) => av.setMicFilter(e.target.value as 'light' | 'normal' | 'strong')}>
              <option value="strong">{t('settings.micFilterStrong', 'Forte')}</option>
              <option value="normal">{t('settings.micFilterNormal', 'Normal (recomendado)')}</option>
              <option value="light">{t('settings.micFilterLight', 'Leve')}</option>
            </Select>
          </Field>
        ) : null}
        {dev(t('settings.cam', 'Câmera'), cams, s.camId, 'videoinput')}
        {dev(t('settings.out', 'Saída de som'), outs, s.outId, 'audiooutput')}
        <Toggle checked={s.hd} onChange={(v) => void av.setPrefs({ hd: v })} label={t('settings.hd', 'Vídeo em HD (usa mais internet)')} />
        <Toggle checked={s.hearNearby} onChange={(v) => void av.setPrefs({ hearNearby: v })} label={t('settings.hear', 'Ouvir quem está por perto na área aberta')} />
        {canAdmin ? (
          <Field
            label={t('settings.distanceAdmin', 'Distância de interação do escritório: {{n}} blocos', { n: me?.distance ?? DEFAULT_INTERACTION_DISTANCE })}
            hint={t('settings.distanceAdminHint', 'Vale para todos no escritório. O padrão é 2 blocos. Em salas e mesas o raio não vale.')}
          >
            <input type="range" min={MIN_INTERACTION_DISTANCE} max={MAX_INTERACTION_DISTANCE} value={me?.distance ?? DEFAULT_INTERACTION_DISTANCE} onChange={(e) => net.send('distance', { value: Number(e.target.value) })} className="w-full accent-[#d7b870]" />
          </Field>
        ) : (
          <p className="text-xs text-muted">{t('settings.distanceInfo', 'Distância de interação: {{n}} blocos (definida pela administração).', { n: me?.distance ?? DEFAULT_INTERACTION_DISTANCE })}</p>
        )}
        {!desktop && perm !== 'granted' ? (
          <Button small variant="ghost" onClick={() => void Notification.requestPermission().then(setPerm)}>
            {t('settings.notify', 'Ativar notificações de acenos e mensagens')}
          </Button>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {desktop ? (
            <Button small variant="ghost" onClick={() => desktop?.changeServer()}>
              {t('shell.changeServer', 'trocar servidor')}
            </Button>
          ) : null}
          <Button small variant="subtle" onClick={() => void logout().then(() => location.assign('/login'))}>
            {t('settings.logout', 'Sair da conta')}
          </Button>
          <span className="ml-auto self-center text-[11px] text-muted">v{__APP_VERSION__}</span>
        </div>
      </div>
    </Modal>
  );
}

// ---------- agenda (Google Calendar) ----------
interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  officeLink: string | null;
  htmlLink: string | null;
}

export function CalendarModal() {
  const office = useGame((s) => s.office);
  const map = useGame((s) => s.map);
  const [status, setStatus] = useState<{ available: boolean; connected: boolean } | null>(null);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [error, setError] = useState('');
  const rooms = useMemo(() => (map?.areas ?? []).filter((a) => a.kind === 'private' && a.meeting), [map]);
  const [areaId, setAreaId] = useState(rooms[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date(Date.now() + 3600_000);
  const [date, setDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [time, setTime] = useState(`${pad(now.getHours())}:00`);
  const [dur, setDur] = useState('30');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const st = await api.get('/api/calendar/status');
      setStatus(st);
      if (st.connected) setEvents(await api.get('/api/calendar/today'));
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const connect = async () => {
    try {
      const { url } = await api.get('/api/calendar/connect-url');
      window.open(url, '_blank', 'noopener');
      toast(t('cal.connecting', 'Conclua a conexão na aba do Google e depois clique em “Atualizar”.'), 'info', undefined, 9000);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const join = (link: string) => {
    try {
      const u = new URL(link);
      const m = u.pathname.match(/^\/o\/([^/]+)(?:\/sala\/([^/]+))?/);
      if (m && m[1] === office?.slug) {
        const area = map?.areas.find((a) => a.id === m[2]);
        if (area) net.send('teleport', areaCenter(area));
        close();
      } else location.assign(u.pathname);
    } catch {}
  };
  const schedule = async () => {
    if (!office) return;
    setBusy(true);
    setError('');
    try {
      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + Number(dur) * 60000);
      await api.post('/api/calendar/schedule', { officeId: office.id, areaId, title: title.trim(), start: start.toISOString(), end: end.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      toast(t('cal.scheduled', 'Reunião criada no seu Google Calendar com o link da sala.'), 'ok');
      setTitle('');
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('cal.title', 'Agenda')} wide onClose={close}>
      {!status ? (
        error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <Spinner />
        )
      ) : !status.available ? (
        <Empty>{t('cal.unavailable', 'A integração com o Google Calendar ainda não foi configurada. Um administrador precisa preencher as credenciais do Google em Painel do ADM → Configurações.')}</Empty>
      ) : !status.connected ? (
        <div className="space-y-3 text-sm">
          <p>{t('cal.connectHelp', 'Conecte o seu Google Calendar para ver os eventos do dia e agendar reuniões com o link da sala. O app guarda apenas a autorização (criptografada), nunca o seu e-mail.')}</p>
          <div className="flex gap-2">
            <Button onClick={() => void connect()}>{t('cal.connect', 'Conectar o Google Calendar')}</Button>
            <Button variant="ghost" onClick={() => void load()}>
              {t('cal.refresh', 'Atualizar')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('cal.today', 'Próximas 24 horas')}</h3>
              <button type="button" className="text-xs text-gold underline" onClick={() => void load()}>
                {t('cal.refresh', 'Atualizar')}
              </button>
            </div>
            {!events ? <Spinner /> : events.length === 0 ? <Empty>{t('cal.none', 'Nenhum evento.')}</Empty> : null}
            {events?.map((e) => (
              <div key={e.id} className="rounded-xl bg-panel-2 p-3 text-sm">
                <p className="font-medium">{e.title || t('cal.untitled', '(sem título)')}</p>
                <p className="text-xs text-muted">{e.allDay ? t('cal.allDay', 'Dia inteiro') : `${new Date(e.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – ${new Date(e.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</p>
                <div className="mt-2 flex gap-2">
                  {e.officeLink ? (
                    <Button small onClick={() => join(e.officeLink!)}>
                      {t('cal.join', 'Entrar')}
                    </Button>
                  ) : null}
                  {e.htmlLink ? (
                    <a href={e.htmlLink} target="_blank" rel="noreferrer" className="self-center text-xs text-gold underline">
                      {t('cal.open', 'Abrir no Google')}
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-muted underline"
              onClick={() =>
                void api
                  .post('/api/calendar/disconnect')
                  .then(load)
                  .catch(() => {})
              }
            >
              {t('cal.disconnect', 'Desconectar a agenda')}
            </button>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t('cal.schedule', 'Agendar reunião')}</h3>
            {rooms.length === 0 ? (
              <Empty>{t('cal.noRooms', 'Este escritório não tem salas de reunião.')}</Empty>
            ) : (
              <>
                <Field label={t('cal.evTitle', 'Título')}>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                </Field>
                <Field label={t('cal.room', 'Sala')}>
                  <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label={t('cal.date', 'Data')}>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                  <Field label={t('cal.time', 'Hora')}>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </Field>
                  <Field label={t('cal.duration', 'Duração')}>
                    <Select value={dur} onChange={(e) => setDur(e.target.value)}>
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 h</option>
                      <option value="90">1 h 30</option>
                      <option value="120">2 h</option>
                    </Select>
                  </Field>
                </div>
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                <Button onClick={() => void schedule()} disabled={busy || !title.trim() || !areaId}>
                  {t('cal.create', 'Criar no Google Calendar')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
