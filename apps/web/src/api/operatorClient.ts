import type { ApiErrorBody } from '@haushaltsauktion/shared';
import { checkVersionHeader } from './versionCheck';

/**
 * Near-duplicate of `client.ts`, deliberately not shared with it (Architektur
 * `.planning/architecture-operator-dashboard.md`, Key Decision "Frontend shell").
 * The operator identity is structurally separate from the household one on the
 * server (`OperatorSession` vs. `Session`, `op_session` vs. `hh_session`
 * cookie) — sharing this module's CSRF state with the member client would let
 * an operator login in one tab clobber a household session's CSRF token in
 * the same browser, or vice versa.
 */

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error?.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.details = body?.error?.details;
    this.name = 'ApiError';
  }
}

let operatorCsrfToken: string | null = null;

export function setOperatorCsrfToken(token: string | null) {
  operatorCsrfToken = token;
}

export async function operatorApi<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const url = `/api/operator${path}`;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(operatorCsrfToken ? { 'x-csrf-token': operatorCsrfToken } : {}),
      ...options.headers,
    },
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, init);
  checkVersionHeader(res);
  if (res.status === 204) {
    return undefined as T;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(res.status, undefined);
    return undefined as T;
  }

  if (!res.ok) {
    throw new ApiError(res.status, json as ApiErrorBody | undefined);
  }
  return json as T;
}
