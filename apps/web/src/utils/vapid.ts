/**
 * VAPID key conversion (push-notifications §Architekturvorschlag, Phase 2).
 *
 * `PushManager.subscribe()`'s `applicationServerKey` wants a raw
 * `Uint8Array`, but the VAPID public key travels over the wire (and out of
 * `web-push generate-vapid-keys`) as URL-safe base64. This is the standard,
 * well-known conversion for that — no cryptography of its own, just a base64
 * decode with the URL-safe alphabet normalized back to the regular one.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
