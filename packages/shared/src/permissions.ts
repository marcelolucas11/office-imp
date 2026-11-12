// SPDX-License-Identifier: AGPL-3.0-only
// Papéis e matriz de permissões. Fonte única de verdade: o servidor verifica
// tudo aqui; o cliente usa as mesmas funções apenas para esconder botões.

export type Role = 'OWNER' | 'ADMIN' | 'EMPLOYEE' | 'GUEST';

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'EMPLOYEE', 'GUEST'];

export const ROLE_RANK: Record<Role, number> = { GUEST: 0, EMPLOYEE: 1, ADMIN: 2, OWNER: 3 };

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dono',
  ADMIN: 'Admin',
  EMPLOYEE: 'Funcionário',
  GUEST: 'Convidado',
};

export type Permission =
  | 'office.create'
  | 'office.delete'
  | 'user.manage' // criar, editar, remover, redefinir senha
  | 'user.promote' // promover a Admin ou rebaixar Admin
  | 'invite.manage'
  | 'map.edit' // Mapmaker completo
  | 'expansion.approve'
  | 'build.ownDesk'
  | 'spotlight.use'
  | 'analytics.view'
  | 'notes.view' // transcrições e áudios
  | 'notes.start' // iniciar notas de reunião (pode ser restrito por configuração)
  | 'settings.manage' // SMTP, destinatários, ausência, textos
  | 'server.update'
  | 'clients.update'
  | 'audit.view'
  | 'office.basic' // andar, falar, chat, status, emotes, ouvir rádio
  | 'music.dj'
  | 'area.staffOnly'
  | 'desk.claim'
  | 'calendar.use';

const MATRIX: Record<Permission, Role[]> = {
  'office.create': ['OWNER', 'ADMIN'],
  'office.delete': ['OWNER'],
  'user.manage': ['OWNER', 'ADMIN'],
  'user.promote': ['OWNER'],
  'invite.manage': ['OWNER', 'ADMIN'],
  'map.edit': ['OWNER', 'ADMIN'],
  'expansion.approve': ['OWNER', 'ADMIN'],
  'build.ownDesk': ['OWNER', 'ADMIN', 'EMPLOYEE'],
  'spotlight.use': ['OWNER', 'ADMIN'],
  'analytics.view': ['OWNER', 'ADMIN'],
  'notes.view': ['OWNER', 'ADMIN'],
  'notes.start': ['OWNER', 'ADMIN', 'EMPLOYEE'],
  'settings.manage': ['OWNER', 'ADMIN'],
  'server.update': ['OWNER'],
  'clients.update': ['OWNER', 'ADMIN'],
  'audit.view': ['OWNER', 'ADMIN'],
  'office.basic': ['OWNER', 'ADMIN', 'EMPLOYEE', 'GUEST'],
  'music.dj': ['OWNER', 'ADMIN', 'EMPLOYEE'],
  'area.staffOnly': ['OWNER', 'ADMIN', 'EMPLOYEE'],
  'desk.claim': ['OWNER', 'ADMIN', 'EMPLOYEE'],
  'calendar.use': ['OWNER', 'ADMIN', 'EMPLOYEE'],
};

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return MATRIX[perm].includes(role);
}

export function isAdminRole(role: Role | undefined | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export interface Actor {
  id: string;
  role: Role;
  /** Escritórios a que o usuário foi atribuído (o Dono enxerga todos). */
  officeIds: string[];
}

/** O ator enxerga/administra este escritório? Dono: todos. Admin: só os dele. */
export function canAdminOffice(actor: Actor, officeId: string): boolean {
  if (actor.role === 'OWNER') return true;
  if (actor.role === 'ADMIN') return actor.officeIds.includes(officeId);
  return false;
}

/** O ator pode entrar neste escritório (membro, admin dele ou Dono)? */
export function canAccessOffice(actor: Actor, officeId: string): boolean {
  if (actor.role === 'OWNER') return true;
  return actor.officeIds.includes(officeId);
}

export interface ManageTarget {
  id: string;
  role: Role;
  officeIds: string[];
}

/**
 * Regras de gestão de usuários:
 * - Dono gerencia todos (inclusive outros Donos, exceto remover a si mesmo).
 * - Admin gerencia apenas Funcionários que pertencem a algum escritório dele.
 */
export function canManageUser(actor: Actor, target: ManageTarget): boolean {
  if (actor.role === 'OWNER') return true;
  if (actor.role !== 'ADMIN') return false;
  if (target.role !== 'EMPLOYEE') return false;
  return target.officeIds.some((o) => actor.officeIds.includes(o));
}

/** Papel que o ator pode atribuir ao criar/editar um usuário. */
export function canAssignRole(actor: Actor, role: Role): boolean {
  if (role === 'GUEST') return false; // convidados não têm conta
  if (actor.role === 'OWNER') return true;
  if (actor.role === 'ADMIN') return role === 'EMPLOYEE';
  return false;
}

/** Escritórios que o ator pode atribuir a outro usuário. */
export function canAssignOffice(actor: Actor, officeId: string): boolean {
  return canAdminOffice(actor, officeId);
}

/** 2FA é obrigatório para Dono e Admin. */
export function requiresTwoFactor(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
