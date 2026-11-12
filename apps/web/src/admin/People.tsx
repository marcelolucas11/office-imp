import { useState } from 'react';
import { ROLE_LABEL, type Role } from '@office-imp/shared';
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Tabs } from '@office-imp/ui';
import { api, errMsg } from '../lib/api';
import { t } from '../lib/i18n';
import { toast, useSession } from '../lib/session';
import { Loadable, OfficeSelect, Page, act, fmtDate, useLoad, useOfficeChoice } from './util';

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: Exclude<Role, 'GUEST'>;
  officeIds: string[];
  activatedOfficeIds: string[];
  totpEnabled: boolean;
  mustChangePassword: boolean;
  createdAt: number;
  manageable: boolean;
}

function tempPassword(): string {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint8Array(12));
  return [...buf].map((b) => a[b % a.length]).join('');
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const { me } = useSession();
  const isOwner = me?.role === 'OWNER';
  const offices = me?.offices ?? [];
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState(user ? '' : tempPassword());
  const [role, setRole] = useState<UserRow['role']>(user?.role ?? 'EMPLOYEE');
  const [officeIds, setOfficeIds] = useState<string[]>(user?.officeIds ?? (offices.length === 1 ? [offices[0].id] : []));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setOfficeIds(officeIds.includes(id) ? officeIds.filter((x) => x !== id) : [...officeIds, id]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (user) {
        await api.patch(`/api/users/${user.id}`, { displayName: displayName.trim(), ...(isOwner && role !== user.role ? { role } : {}), officeIds, ...(password ? { password } : {}) });
        toast(password ? t('users.savedPw', 'Salvo. Passe a nova senha temporária para a pessoa: {{pw}}', { pw: password }) : t('users.saved', 'Salvo.'), 'ok', undefined, password ? 30000 : 4000);
      } else {
        await api.post('/api/users', { displayName: displayName.trim(), username: username.trim().toLowerCase(), password, role, officeIds });
        toast(t('users.created', 'Conta criada. Usuário: {{u}} · Senha temporária: {{pw}}', { u: username.trim().toLowerCase(), pw: password }), 'ok', undefined, 60000);
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={user ? t('users.edit', 'Editar {{name}}', { name: user.displayName }) : t('users.new', 'Nova pessoa')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('app.cancel', 'Cancelar')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !displayName.trim() || (!user && (!username.trim() || password.length < 8))} data-testid="user-save">
            {t('app.save', 'Salvar')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('users.name', 'Nome de exibição')}>
          <Input name="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} autoFocus />
        </Field>
        <Field label={t('users.username', 'Usuário (login)')} hint={user ? undefined : t('setup.usernameHint', '3 a 32 letras minúsculas, números, ponto, hífen ou sublinhado. Não é e-mail.')}>
          <Input name="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} disabled={Boolean(user)} autoCapitalize="none" />
        </Field>
        <Field label={user ? t('users.resetPw', 'Nova senha temporária (deixe vazio para não mudar)') : t('users.tempPw', 'Senha temporária')} hint={t('users.pwHint', 'A pessoa é obrigada a trocar no primeiro login. Não existe recuperação por e-mail: só você redefine.')}>
          <div className="flex gap-2">
            <Input name="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button variant="ghost" onClick={() => setPassword(tempPassword())}>
              {t('users.generate', 'Gerar')}
            </Button>
          </div>
        </Field>
        <Field label={t('users.role', 'Papel')} hint={role !== 'EMPLOYEE' ? t('users.role2fa', 'Donos e Admins configuram a verificação em duas etapas no primeiro login.') : undefined}>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value as UserRow['role'])} disabled={!isOwner}>
            <option value="EMPLOYEE">{ROLE_LABEL.EMPLOYEE}</option>
            {isOwner ? <option value="ADMIN">{ROLE_LABEL.ADMIN}</option> : null}
            {isOwner ? <option value="OWNER">{ROLE_LABEL.OWNER}</option> : null}
          </Select>
        </Field>
        <Field label={t('users.offices', 'Escritórios')} hint={role === 'OWNER' ? t('users.ownerAll', 'O Dono enxerga todos os escritórios.') : t('users.officesHint', 'Funcionários entram pela primeira vez com o link de convite do escritório.')}>
          <div className="flex flex-wrap gap-2">
            {offices.map((o) => (
              <label key={o.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                <input type="checkbox" className="accent-[#d7b870]" checked={officeIds.includes(o.id)} onChange={() => toggle(o.id)} />
                {o.name}
              </label>
            ))}
            {offices.length === 0 ? <span className="text-xs text-muted">{t('users.noOffices', 'Crie um escritório primeiro.')}</span> : null}
          </div>
        </Field>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}

export function Users() {
  const { me } = useSession();
  const list = useLoad(() => api.get<UserRow[]>('/api/users'), []);
  const [editing, setEditing] = useState<UserRow | null | 'new'>(null);
  const officeName = (id: string) => me?.offices.find((o) => o.id === id)?.name ?? '—';
  const remove = async (u: UserRow) => {
    if (!confirm(t('users.deleteAsk', 'Remover {{name}}? A mesa dela fica livre e a conta é apagada.', { name: u.displayName }))) return;
    if (await act(() => api.del(`/api/users/${u.id}`), t('users.deleted', 'Pessoa removida. A mesa ficou livre.'))) list.reload();
  };
  const reset2fa = async (u: UserRow) => {
    if (!confirm(t('users.reset2faAsk', 'Zerar a verificação em duas etapas de {{name}}? A pessoa configura de novo no próximo login.', { name: u.displayName }))) return;
    if (await act(() => api.patch(`/api/users/${u.id}`, { resetTotp: true }), t('users.reset2faDone', 'Verificação em duas etapas zerada.'))) list.reload();
  };
  return (
    <Page
      title={t('admin.navPeople', 'Pessoas')}
      subtitle={t('users.subtitle', 'Só Donos e Admins criam contas. O login é por usuário e senha; nenhum e-mail é guardado.')}
      actions={
        <Button onClick={() => setEditing('new')} data-testid="new-user">
          ＋ {t('users.new', 'Nova pessoa')}
        </Button>
      }
    >
      <Loadable state={list}>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2">{t('users.colName', 'Nome')}</th>
                <th className="px-4 py-2">{t('users.colUser', 'Usuário')}</th>
                <th className="px-4 py-2">{t('users.colRole', 'Papel')}</th>
                <th className="px-4 py-2">{t('users.colOffices', 'Escritórios')}</th>
                <th className="px-4 py-2">{t('users.colState', 'Situação')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0" data-testid={`user-${u.username}`}>
                  <td className="px-4 py-2 font-medium">
                    {u.displayName} {u.id === me?.id ? <span className="text-xs text-muted">({t('people.you', 'você')})</span> : null}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-2">
                    <Badge color={u.role === 'EMPLOYEE' ? 'gray' : 'gold'}>{ROLE_LABEL[u.role]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {u.role === 'OWNER'
                      ? t('users.all', 'todos')
                      : u.officeIds.map((id) => (
                          <span key={id} className="mr-2 whitespace-nowrap">
                            {officeName(id)}
                            {u.role === 'EMPLOYEE' && !u.activatedOfficeIds.includes(id) ? <span className="text-warn"> ({t('users.pendingInvite', 'falta abrir o convite')})</span> : null}
                          </span>
                        ))}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {u.mustChangePassword ? t('users.tempState', 'senha temporária') : t('users.active', 'ativa')}
                    {u.role !== 'EMPLOYEE' ? ` · 2FA ${u.totpEnabled ? '✓' : t('users.pending', 'pendente')}` : ''}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {u.manageable && u.id !== me?.id ? (
                      <>
                        <Button small variant="ghost" onClick={() => setEditing(u)}>
                          {t('app.edit', 'Editar')}
                        </Button>{' '}
                        {u.totpEnabled ? (
                          <Button small variant="subtle" onClick={() => void reset2fa(u)}>
                            {t('users.reset2fa', 'Zerar 2FA')}
                          </Button>
                        ) : null}{' '}
                        <Button small variant="subtle" onClick={() => void remove(u)}>
                          {t('app.remove', 'Remover')}
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Loadable>
      {editing ? (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </Page>
  );
}

// ---------- links de convite ----------
interface InviteRow {
  id: string;
  kind: 'EMPLOYEE' | 'GUEST';
  label: string | null;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  createdByName: string | null;
  createdAt: number;
  state: 'active' | 'revoked' | 'expired' | 'exhausted';
  onlineNow: number;
}

export function Invites() {
  const { officeId, choose } = useOfficeChoice();
  const list = useLoad(() => (officeId ? api.get<InviteRow[]>(`/api/offices/${officeId}/invites`) : Promise.resolve([])), [officeId]);
  const [kind, setKind] = useState<'GUEST' | 'EMPLOYEE'>('GUEST');
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState<'never' | 'date'>('never');
  const [when, setWhen] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [created, setCreated] = useState<{ url: string; kind: string } | null>(null);
  const employee = (list.data ?? []).find((i) => i.kind === 'EMPLOYEE' && i.state === 'active');

  const create = async () => {
    if (kind === 'EMPLOYEE' && employee && !confirm(t('inv.regenAsk', 'Gerar um novo link da equipe? O link atual deixa de funcionar (quem já ativou o acesso continua entrando normalmente).'))) return;
    try {
      const body: Record<string, unknown> = { kind, label: label.trim() || undefined };
      if (kind === 'GUEST') {
        if (expiry === 'date') {
          const ts = new Date(when).getTime();
          if (!ts) return toast(t('inv.badDate', 'Escolha a data e a hora de expiração.'), 'error');
          body.expiresAt = ts;
        }
        if (maxUses) body.maxUses = Number(maxUses);
      }
      const r = await api.post(`/api/offices/${officeId}/invites`, body);
      setCreated({ url: r.url, kind });
      setLabel('');
      list.reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const revoke = async (i: InviteRow) => {
    if (!confirm(i.kind === 'GUEST' ? t('inv.revokeGuestAsk', 'Revogar este link? Os convidados que entraram por ele são desconectados na hora.') : t('inv.revokeAsk', 'Revogar o link da equipe?'))) return;
    if (await act(() => api.post(`/api/offices/${officeId}/invites/${i.id}/revoke`), t('inv.revoked', 'Link revogado.'))) list.reload();
  };
  const stateBadge = (i: InviteRow) => {
    const map = { active: ['green', t('inv.stActive', 'ativo')], revoked: ['red', t('inv.stRevoked', 'revogado')], expired: ['gray', t('inv.stExpired', 'expirado')], exhausted: ['gray', t('inv.stExhausted', 'esgotado')] } as const;
    const [color, text] = map[i.state];
    return <Badge color={color}>{text}</Badge>;
  };

  return (
    <Page title={t('admin.navInvites', 'Links de convite')} subtitle={t('inv.subtitle', 'Para entrar em um escritório é preciso o link: o da equipe (permanente) ou o de convidado (com ou sem validade).')} actions={<OfficeSelect value={officeId} onChange={choose} />}>
      {!officeId ? (
        <Empty>{t('inv.noOffice', 'Crie um escritório primeiro.')}</Empty>
      ) : (
        <>
          <Card className="space-y-3">
            <Tabs
              tabs={[
                { id: 'GUEST', label: t('inv.guest', 'Link de convidado') },
                { id: 'EMPLOYEE', label: t('inv.employee', 'Link da equipe') },
              ]}
              value={kind}
              onChange={setKind}
            />
            {kind === 'GUEST' ? (
              <div className="grid gap-3 md:grid-cols-4">
                <Field label={t('inv.label', 'Identificação (opcional)')}>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={t('inv.labelPh', 'Cliente X — reunião de terça')} />
                </Field>
                <Field label={t('inv.validity', 'Validade')}>
                  <Select name="expiry" value={expiry} onChange={(e) => setExpiry(e.target.value as 'never' | 'date')}>
                    <option value="never">{t('inv.never', 'Sem validade (até revogar)')}</option>
                    <option value="date">{t('inv.until', 'Expira em…')}</option>
                  </Select>
                </Field>
                {expiry === 'date' ? (
                  <Field label={t('inv.when', 'Data e hora')}>
                    <Input name="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                  </Field>
                ) : null}
                <Field label={t('inv.maxUses', 'Limite de usos (opcional)')}>
                  <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" />
                </Field>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('inv.employeeHelp', 'Um link permanente por escritório. O funcionário abre o link, faz login com a conta que você criou e o acesso fica ativado. Gerar de novo invalida o link anterior.')}</p>
            )}
            <Button onClick={() => void create()} data-testid="inv-create">
              {kind === 'EMPLOYEE' && employee ? t('inv.regen', 'Gerar novo link da equipe') : t('inv.create', 'Gerar link')}
            </Button>
            {created ? (
              <div className="space-y-1 rounded-xl border border-gold bg-gold/10 p-3">
                <p className="text-xs text-gold">{t('inv.copyNow', 'Copie agora: por segurança, o link completo só aparece uma vez.')}</p>
                <div className="flex gap-2">
                  <Input readOnly value={created.url} data-testid="inv-url" onFocus={(e) => e.target.select()} />
                  <Button onClick={() => void navigator.clipboard?.writeText(created.url).then(() => toast(t('app.copied', 'Copiado.'), 'ok'))}>{t('app.copy', 'Copiar')}</Button>
                </div>
              </div>
            ) : null}
          </Card>
          <Loadable state={list}>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2">{t('inv.colKind', 'Tipo')}</th>
                    <th className="px-4 py-2">{t('inv.colLabel', 'Identificação')}</th>
                    <th className="px-4 py-2">{t('inv.colExpires', 'Validade')}</th>
                    <th className="px-4 py-2">{t('inv.colUses', 'Usos')}</th>
                    <th className="px-4 py-2">{t('inv.colBy', 'Criado por')}</th>
                    <th className="px-4 py-2">{t('inv.colState', 'Situação')}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(list.data ?? []).map((i) => (
                    <tr key={i.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2">{i.kind === 'GUEST' ? t('inv.kGuest', 'Convidado') : t('inv.kEmployee', 'Equipe')}</td>
                      <td className="px-4 py-2 text-xs">{i.label ?? '—'}</td>
                      <td className="px-4 py-2 text-xs">{i.expiresAt ? fmtDate(i.expiresAt) : t('inv.noExpiry', 'sem validade')}</td>
                      <td className="px-4 py-2 text-xs">
                        {i.uses}
                        {i.maxUses ? ` / ${i.maxUses}` : ''}
                        {i.onlineNow ? <span className="ml-2 text-ok">· {t('inv.online', '{{n}} online', { n: i.onlineNow })}</span> : null}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">
                        {i.createdByName ?? '—'} · {fmtDate(i.createdAt)}
                      </td>
                      <td className="px-4 py-2">{stateBadge(i)}</td>
                      <td className="px-4 py-2 text-right">
                        {i.state === 'active' ? (
                          <Button small variant="subtle" onClick={() => void revoke(i)}>
                            {t('inv.revoke', 'Revogar')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(list.data ?? []).length === 0 ? <p className="p-6 text-center text-sm text-muted">{t('inv.none', 'Nenhum link gerado ainda.')}</p> : null}
            </Card>
          </Loadable>
        </>
      )}
    </Page>
  );
}
