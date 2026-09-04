/**
 * Bugfix "reliable-update-check-forced-reload-overlay": the server sends its
 * build/deploy identifier on every response as `X-App-Version` (server.ts's
 * `onSend` hook). Both `client.ts`'s `api()` and `operatorClient.ts`'s
 * `operatorApi()` call `checkVersionHeader()` right after `fetch()` so a
 * stale build is detected on the very next backend call, not on whatever
 * schedule the service worker's own update lifecycle happens to run —
 * that mechanism only checks for a new service worker on navigation, which
 * is what made the previous notification unreliable.
 *
 * `BUILD_VERSION` and the server's default both fall back to the same
 * literal `'dev'` when no image build set a real value (local/dev runs),
 * so the two sides trivially agree and this never false-triggers outside a
 * real deploy.
 */

const BUILD_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

type Listener = () => void;

const listeners = new Set<Listener>();

export function onVersionMismatch(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function checkVersionHeader(res: Response): void {
  const serverVersion = res.headers.get('x-app-version');
  if (serverVersion === null || serverVersion === BUILD_VERSION) return;
  for (const listener of listeners) listener();
}
