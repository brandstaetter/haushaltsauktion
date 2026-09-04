import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { onVersionMismatch } from './versionCheck';

function jsonResponse(appVersion: string): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'x-app-version': appVersion },
  });
}

describe('api() — X-App-Version check (Bugfix reliable-update-check-forced-reload-overlay)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('meldet an onVersionMismatch, wenn der Server einen abweichenden X-App-Version-Header sendet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('deadbeef1234')));
    const listener = vi.fn();
    const unsubscribe = onVersionMismatch(listener);

    await api('/whatever');

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('meldet nichts, wenn der Header der eigenen (Test-Default "dev") Version entspricht', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('dev')));
    const listener = vi.fn();
    const unsubscribe = onVersionMismatch(listener);

    await api('/whatever');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('prüft die Version auch bei einer Fehlerantwort (jeder Call, nicht nur Erfolge)', async () => {
    const res = new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'nope' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'x-app-version': 'deadbeef1234' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    const listener = vi.fn();
    const unsubscribe = onVersionMismatch(listener);

    await expect(api('/whatever')).rejects.toThrow();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
