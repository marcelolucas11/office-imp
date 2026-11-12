// SPDX-License-Identifier: AGPL-3.0-only
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AvatarConfig, OfficeMap, OfficeSettings, Profile, Role } from '@office-imp/shared';

const ts = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<Exclude<Role, 'GUEST'>>().notNull(),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  recoveryCodes: jsonb('recovery_codes').$type<string[]>().notNull().default([]),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  monitoringAcceptedAt: ts('monitoring_accepted_at'),
  profile: jsonb('profile').$type<Profile>().notNull().default({}),
  avatar: jsonb('avatar').$type<AvatarConfig>(),
  interactionDistance: integer('interaction_distance').notNull().default(5),
  createdBy: text('created_by'),
  createdAt: ts('created_at').notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // hash do token do cookie
    userId: text('user_id'),
    guestId: text('guest_id'),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_guest_idx').on(t.guestId)],
);

export const offices = pgTable('offices', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  settings: jsonb('settings').$type<Partial<OfficeSettings>>().notNull().default({}),
  deskCapacity: integer('desk_capacity').notNull().default(0),
  plannedHeadcount: integer('planned_headcount').notNull().default(0),
  expansionDismissedAt: integer('expansion_dismissed_at').notNull().default(0),
  mapVersionId: text('map_version_id'),
  createdBy: text('created_by'),
  createdAt: ts('created_at').notNull(),
});

export const officeMembers = pgTable(
  'office_members',
  {
    officeId: text('office_id').notNull(),
    userId: text('user_id').notNull(),
    /** O funcionário já abriu o link de convite deste escritório. */
    activated: boolean('activated').notNull().default(false),
    lastX: integer('last_x'),
    lastY: integer('last_y'),
  },
  (t) => [primaryKey({ columns: [t.officeId, t.userId] })],
);

export const mapVersions = pgTable(
  'map_versions',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    json: jsonb('json').$type<OfficeMap>().notNull(),
    authorId: text('author_id'),
    authorName: text('author_name'),
    note: text('note'),
    published: boolean('published').notNull().default(false),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('map_versions_office_idx').on(t.officeId, t.createdAt)],
);

export const desks = pgTable(
  'desks',
  {
    officeId: text('office_id').notNull(),
    id: text('id').notNull(), // id do objeto "desk" no mapa
    userId: text('user_id'),
  },
  (t) => [primaryKey({ columns: [t.officeId, t.id] })],
);

export const deskItems = pgTable(
  'desk_items',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    deskId: text('desk_id').notNull(),
    kind: text('kind').$type<'note' | 'gift'>().notNull(),
    authorId: text('author_id').notNull(),
    authorName: text('author_name').notNull(),
    content: text('content').notNull(),
    emoji: text('emoji'),
    createdAt: ts('created_at').notNull(),
    seenAt: ts('seen_at'),
  },
  (t) => [index('desk_items_desk_idx').on(t.officeId, t.deskId)],
);

export const lostFound = pgTable('lost_found', {
  id: text('id').primaryKey(),
  officeId: text('office_id').notNull(),
  formerOwner: text('former_owner').notNull(),
  deskId: text('desk_id').notNull(),
  items: jsonb('items').$type<any[]>().notNull(),
  createdAt: ts('created_at').notNull(),
});

export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    kind: text('kind').$type<'EMPLOYEE' | 'GUEST'>().notNull(),
    tokenHash: text('token_hash').notNull(),
    label: text('label'),
    expiresAt: ts('expires_at'),
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
    revokedAt: ts('revoked_at'),
    createdBy: text('created_by'),
    createdByName: text('created_by_name'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('invites_token_idx').on(t.tokenHash), index('invites_office_idx').on(t.officeId)],
);

export const guests = pgTable('guests', {
  id: text('id').primaryKey(),
  inviteId: text('invite_id').notNull(),
  officeId: text('office_id').notNull(),
  displayName: text('display_name').notNull(),
  avatar: jsonb('avatar').$type<AvatarConfig>(),
  createdAt: ts('created_at').notNull(),
  endedAt: ts('ended_at'),
});

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    scope: text('scope').$type<'near' | 'all' | 'dm'>().notNull(),
    fromId: text('from_id').notNull(),
    fromName: text('from_name').notNull(),
    toId: text('to_id'),
    recipients: jsonb('recipients').$type<string[]>(),
    text: text('text').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('chat_office_idx').on(t.officeId, t.createdAt)],
);

export const presenceSessions = pgTable(
  'presence_sessions',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    subjectId: text('subject_id').notNull(),
    subjectName: text('subject_name').notNull(),
    role: text('role').notNull(),
    start: ts('start').notNull(),
    end: ts('end'),
  },
  (t) => [index('presence_office_idx').on(t.officeId, t.start)],
);

export const statusIntervals = pgTable(
  'status_intervals',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    subjectId: text('subject_id').notNull(),
    status: text('status').$type<'AVAILABLE' | 'BUSY' | 'DND' | 'AWAY'>().notNull(),
    start: ts('start').notNull(),
    end: ts('end'),
  },
  (t) => [index('status_office_idx').on(t.officeId, t.start)],
);

export const callSegments = pgTable(
  'call_segments',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    a: text('a').notNull(),
    b: text('b').notNull(),
    areaId: text('area_id'),
    areaName: text('area_name'),
    start: ts('start').notNull(),
    end: ts('end'),
  },
  (t) => [index('calls_office_idx').on(t.officeId, t.start)],
);

export const meetings = pgTable(
  'meetings',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id').notNull(),
    areaId: text('area_id').notNull(),
    areaName: text('area_name').notNull(),
    startedBy: text('started_by').notNull(),
    startedByName: text('started_by_name').notNull(),
    participants: jsonb('participants').$type<string[]>().notNull().default([]),
    start: ts('start').notNull(),
    end: ts('end'),
    status: text('status').$type<'recording' | 'processing' | 'done' | 'failed'>().notNull(),
    error: text('error'),
  },
  (t) => [index('meetings_office_idx').on(t.officeId, t.start)],
);

export const meetingTracks = pgTable(
  'meeting_tracks',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id').notNull(),
    subjectId: text('subject_id').notNull(),
    subjectName: text('subject_name').notNull(),
    trackSid: text('track_sid').notNull(),
    egressId: text('egress_id'),
    file: text('file').notNull(), // caminho relativo a DATA_DIR/meetings
    startedAt: ts('started_at').notNull(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('meeting_tracks_meeting_idx').on(t.meetingId)],
);

export const meetingNotes = pgTable('meeting_notes', {
  meetingId: text('meeting_id').primaryKey(),
  transcript: text('transcript').notNull(),
  summary: text('summary'),
  sentTo: jsonb('sent_to').$type<string[]>().notNull().default([]),
  sentAt: ts('sent_at'),
  emailError: text('email_error'),
  createdAt: ts('created_at').notNull(),
});

export const calendarLinks = pgTable('calendar_links', {
  userId: text('user_id').primaryKey(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  createdAt: ts('created_at').notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    officeId: text('office_id'),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('audit_created_idx').on(t.createdAt)],
);

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<any>().notNull(),
});

export const whiteboards = pgTable(
  'whiteboards',
  {
    officeId: text('office_id').notNull(),
    objectId: text('object_id').notNull(),
    elements: jsonb('elements').$type<any[]>().notNull().default([]),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.officeId, t.objectId] })],
);
