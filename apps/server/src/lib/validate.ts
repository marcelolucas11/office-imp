// SPDX-License-Identifier: AGPL-3.0-only
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors';

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw badRequest(`Dados inválidos${first ? `: ${first.path.join('.')} — ${first.message}` : ''}`);
  }
  return r.data;
}

export const zUsername = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'use de 3 a 32 letras minúsculas, números, ponto, hífen ou sublinhado');
export const zPassword = z.string().min(8, 'mínimo de 8 caracteres').max(200);
export const zName = z.string().trim().min(1).max(60);
export { z };
