// SPDX-License-Identifier: AGPL-3.0-only
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, code, message);
export const unauthorized = (message = 'Faça login para continuar.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Você não tem permissão para isso.', code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = 'Não encontrado.') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);
