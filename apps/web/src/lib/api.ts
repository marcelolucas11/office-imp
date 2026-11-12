// SPDX-License-Identifier: AGPL-3.0-only
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw?: boolean): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (raw && res.ok) return (await res.text()) as unknown as T;
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok) throw new ApiError(res.status, json?.error ?? 'error', json?.message ?? `Erro ${res.status}`);
  return json as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  patch: <T = any>(p: string, b: unknown = {}) => request<T>('PATCH', p, b),
  put: <T = any>(p: string, b: unknown = {}) => request<T>('PUT', p, b),
  del: <T = any>(p: string) => request<T>('DELETE', p),
  text: (p: string) => request<string>('GET', p, undefined, true),
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
