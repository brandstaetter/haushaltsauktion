/**
 * AES-256-GCM for third-party credentials (Architektur Todoist §4).
 *
 * `node:crypto` only — no new dependency. GCM is *authenticated*, which is the
 * property that matters here: `open` throws on a tampered ciphertext rather than
 * returning plausible garbage that would then be sent to Todoist as a bearer
 * token.
 *
 * **What this protects, stated honestly.** It defends a database-only
 * compromise — a dump, a stray backup, a restored snapshot. It does *not* defend
 * an attacker holding both the database and the process environment, because
 * that attacker has the key. Under CLAUDE.md §37 the app and the database
 * almost certainly share a host, so the realistic threat this addresses is a
 * **leaked backup**, not a rooted server.
 *
 * **Not argon2.** See the `SecretBox` doc in `app/integrations/ports.ts`.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

import type { SecretBox } from '../../app/integrations/ports.js';

const ALGORITHM = 'aes-256-gcm';
/** GCM's standard nonce length. 96 bits is what the mode is specified for. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** version -> 32-byte key. The highest version is used for new seals. */
export type Keyring = ReadonlyMap<number, Buffer>;

export class SecretBoxError extends Error {}

/**
 * Parses `INTEGRATION_ENCRYPTION_KEY` / `INTEGRATION_ENCRYPTION_KEYS`.
 *
 * A single key is version 1. The multi-key form is `1:<base64>,2:<base64>` and
 * exists so a key can be rotated with a window in which both decrypt.
 *
 * Every key must base64-decode to **exactly** 32 bytes. This is stricter than
 * `SESSION_SECRET`'s `z.string().min(8)` (`config.ts:17`) on purpose: a
 * 9-character string satisfies that check and then fails inside `createCipheriv`
 * on the first member who tries to connect. Fail at boot instead.
 */
export function parseKeyring(single: string | undefined, multi: string | undefined): Keyring {
  const entries = new Map<number, Buffer>();

  const addKey = (version: number, base64: string): void => {
    const key = Buffer.from(base64, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new SecretBoxError(
        `Integrationsschlüssel Version ${version} muss base64-kodiert genau ${KEY_BYTES} Bytes ergeben, hat aber ${key.length}.`,
      );
    }
    if (entries.has(version)) {
      throw new SecretBoxError(`Integrationsschlüssel Version ${version} ist doppelt definiert.`);
    }
    entries.set(version, key);
  };

  if (multi !== undefined && multi.trim() !== '') {
    for (const part of multi.split(',')) {
      const trimmed = part.trim();
      if (trimmed === '') continue;
      const separator = trimmed.indexOf(':');
      if (separator <= 0) {
        throw new SecretBoxError(
          `INTEGRATION_ENCRYPTION_KEYS erwartet "version:base64" je Eintrag, erhielt "${trimmed}".`,
        );
      }
      const version = Number(trimmed.slice(0, separator));
      if (!Number.isInteger(version) || version < 1) {
        throw new SecretBoxError(`Ungültige Schlüsselversion in INTEGRATION_ENCRYPTION_KEYS: "${trimmed}".`);
      }
      addKey(version, trimmed.slice(separator + 1));
    }
  } else if (single !== undefined && single.trim() !== '') {
    addKey(1, single.trim());
  }

  if (entries.size === 0) {
    throw new SecretBoxError(
      'Kein Integrationsschlüssel konfiguriert: INTEGRATION_ENCRYPTION_KEY oder INTEGRATION_ENCRYPTION_KEYS setzen.',
    );
  }
  return entries;
}

function highestVersion(keyring: Keyring): number {
  let highest = 0;
  for (const version of keyring.keys()) {
    if (version > highest) highest = version;
  }
  return highest;
}

export function createSecretBox(keyring: Keyring): SecretBox {
  if (keyring.size === 0) {
    throw new SecretBoxError('Keyring ist leer.');
  }
  const writeVersion = highestVersion(keyring);

  return {
    seal(plaintext) {
      const key = keyring.get(writeVersion);
      if (key === undefined) {
        throw new SecretBoxError(`Schlüsselversion ${writeVersion} fehlt im Keyring.`);
      }
      // A fresh IV per seal. Reusing one under the same key would leak
      // plaintext relationships and void GCM's integrity guarantee entirely.
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: writeVersion };
    },

    open(sealed) {
      const key = keyring.get(sealed.keyVersion);
      if (key === undefined) {
        throw new SecretBoxError(
          `Unbekannte Schlüsselversion ${sealed.keyVersion}. Rotationsfenster zu früh geschlossen?`,
        );
      }
      if (sealed.iv.length !== IV_BYTES) {
        throw new SecretBoxError('Ungültige IV-Länge.');
      }
      const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
      decipher.setAuthTag(sealed.authTag);
      try {
        return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
      } catch {
        // `final()` throws when the auth tag does not verify. Deliberately not
        // reporting *why*: a caller cannot act on the distinction, and the
        // message would otherwise become an oracle.
        throw new SecretBoxError(
          'Entschlüsselung fehlgeschlagen: Authentifizierungs-Tag passt nicht (manipuliert oder falscher Schlüssel).',
        );
      }
    },
  };
}

/**
 * The last 4 characters of a token, for display.
 *
 * Stored as plaintext next to the ciphertext so the settings UI can render
 * "…a3f9" without decrypting anything. Short tokens are masked entirely rather
 * than revealing a meaningful fraction of themselves.
 */
export function tokenHint(token: string): string {
  return token.length < 8 ? '' : token.slice(-4);
}

/** Constant-time compare, for callers verifying a token echo. */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
