import { describe, expect, it, vi } from 'vitest';
import { checkVersionHeader, onVersionMismatch } from './versionCheck';

function responseWithHeader(value: string | null): Response {
  const headers = new Headers();
  if (value !== null) headers.set('x-app-version', value);
  return new Response(null, { headers });
}

describe('checkVersionHeader / onVersionMismatch', () => {
  it('benachrichtigt niemanden, wenn der Header fehlt', () => {
    const listener = vi.fn();
    const unsubscribe = onVersionMismatch(listener);
    checkVersionHeader(responseWithHeader(null));
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('benachrichtigt niemanden, wenn der Header der eigenen Build-Version entspricht (Test-Default "dev")', () => {
    const listener = vi.fn();
    const unsubscribe = onVersionMismatch(listener);
    checkVersionHeader(responseWithHeader('dev'));
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('benachrichtigt jeden registrierten Listener bei einer abweichenden Version', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubscribeA = onVersionMismatch(listenerA);
    const unsubscribeB = onVersionMismatch(listenerB);

    checkVersionHeader(responseWithHeader('deadbeef1234'));

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubscribeA();
    unsubscribeB();
  });

  it('entfernt einen Listener nach dem Aufruf der unsubscribe-Funktion', () => {
    const listener = vi.fn();
    const unsubscribe = onVersionMismatch(listener);
    unsubscribe();

    checkVersionHeader(responseWithHeader('deadbeef1234'));

    expect(listener).not.toHaveBeenCalled();
  });
});
