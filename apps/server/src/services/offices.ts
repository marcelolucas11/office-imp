// SPDX-License-Identifier: AGPL-3.0-only
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { mapDesks, stripDerivedAreas, withDeskAreas, type DeskInfo, type OfficeMap } from '@office-imp/shared';
import { validateOffice } from '@office-imp/map-engine';
import { db, schema } from '../db';
import { newId } from '../lib/crypto';
import { badRequest, notFound } from '../lib/errors';

export type OfficeRow = typeof schema.offices.$inferSelect;
const MAX_VERSIONS = 30;

export async function getOffice(officeId: string): Promise<OfficeRow> {
  const [o] = await db().select().from(schema.offices).where(eq(schema.offices.id, officeId));
  if (!o) throw notFound('Escritório não encontrado.');
  return o;
}

export async function getOfficeBySlug(slug: string): Promise<OfficeRow> {
  const [o] = await db().select().from(schema.offices).where(eq(schema.offices.slug, slug));
  if (!o) throw notFound('Escritório não encontrado.');
  return o;
}

export async function currentMap(office: OfficeRow): Promise<{ id: string; map: OfficeMap }> {
  if (!office.mapVersionId) throw notFound('Este escritório ainda não tem mapa.');
  const [v] = await db().select().from(schema.mapVersions).where(eq(schema.mapVersions.id, office.mapVersionId));
  if (!v) throw notFound('Versão do mapa não encontrada.');
  // as áreas das mesas são derivadas das mesas a cada carga (valem também para mapas antigos)
  return { id: v.id, map: withDeskAreas(v.json) };
}

/** Mantém a tabela de mesas em sincronia com os objetos "desk" do mapa. */
export async function syncDesks(officeId: string, map: OfficeMap): Promise<number> {
  const ids = mapDesks(map).map((d) => d.id);
  const d = db();
  if (ids.length) {
    await d.delete(schema.desks).where(and(eq(schema.desks.officeId, officeId), notInArray(schema.desks.id, ids)));
    await d
      .insert(schema.desks)
      .values(ids.map((id) => ({ officeId, id, userId: null })))
      .onConflictDoNothing();
  } else {
    await d.delete(schema.desks).where(eq(schema.desks.officeId, officeId));
  }
  await d.update(schema.offices).set({ deskCapacity: ids.length }).where(eq(schema.offices.id, officeId));
  return ids.length;
}

/** Valida, grava como nova versão publicada e atualiza as mesas. */
export async function publishMap(officeId: string, input: OfficeMap, author: { id: string; name: string } | null, note: string): Promise<string> {
  const map = stripDerivedAreas(input);
  const res = validateOffice(map);
  if (!res.ok) throw badRequest(`O mapa tem problemas: ${res.errors.join(' ')}`, 'invalid_map');
  const id = newId();
  const d = db();
  await d.update(schema.mapVersions).set({ published: false }).where(eq(schema.mapVersions.officeId, officeId));
  await d.insert(schema.mapVersions).values({ id, officeId, json: map, authorId: author?.id ?? null, authorName: author?.name ?? 'Sistema', note, published: true, createdAt: Date.now() });
  await d.update(schema.offices).set({ mapVersionId: id }).where(eq(schema.offices.id, officeId));
  await syncDesks(officeId, map);
  // mantém só as versões mais recentes
  const old = await d.select({ id: schema.mapVersions.id }).from(schema.mapVersions).where(eq(schema.mapVersions.officeId, officeId)).orderBy(desc(schema.mapVersions.createdAt)).offset(MAX_VERSIONS);
  if (old.length) await d.delete(schema.mapVersions).where(inArray(schema.mapVersions.id, old.map((o) => o.id)));
  return id;
}

/** Atualiza o JSON da versão atual sem criar versão nova (decoração de mesa). */
export async function patchCurrentMap(office: OfficeRow, map: OfficeMap): Promise<void> {
  if (!office.mapVersionId) return;
  await db().update(schema.mapVersions).set({ json: stripDerivedAreas(map) }).where(eq(schema.mapVersions.id, office.mapVersionId));
}

export async function listDesks(officeId: string): Promise<DeskInfo[]> {
  const rows = await db()
    .select({ id: schema.desks.id, userId: schema.desks.userId, userName: schema.users.displayName })
    .from(schema.desks)
    .leftJoin(schema.users, eq(schema.desks.userId, schema.users.id))
    .where(eq(schema.desks.officeId, officeId));
  return rows.map((r) => ({ id: r.id, userId: r.userId, userName: r.userName ?? null }));
}

export async function desksUsed(officeId: string): Promise<number> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.desks)
    .where(and(eq(schema.desks.officeId, officeId), isNotNull(schema.desks.userId)));
  return r?.n ?? 0;
}

export async function memberCount(officeId: string): Promise<number> {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.officeMembers).where(eq(schema.officeMembers.officeId, officeId));
  return r?.n ?? 0;
}

export function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'escritorio';
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; i < 200; i++) {
    const [hit] = await db().select({ id: schema.offices.id }).from(schema.offices).where(eq(schema.offices.slug, slug));
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${newId().slice(0, 6).toLowerCase()}`;
}
