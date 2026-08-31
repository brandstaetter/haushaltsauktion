/**
 * `secret-box` (Architektur Todoist §4, §12).
 *
 * The point of these tests is not that encryption works — `node:crypto` is not
 * under test. It is that the three properties the design *relies on* actually
 * hold: a round trip is lossless, a tampered ciphertext throws instead of
 * returning garbage, and key versioning lets an old row be read after rotation.
 *
 * The tamper case is the important one. If `open` returned corrupted bytes
 * instead of throwing, they would be sent to Todoist as a bearer token.
 */

import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  SecretBoxError,
  createSecretBox,
  parseKeyring,
  secretsEqual,
  tokenHint,
  type Keyring,
} from '../../src/infra/integrations/secret-box.js';

const KEY_1 = randomBytes(32);
const KEY_2 = randomBytes(32);
const TOKEN = '0123456789abcdef0123456789abcdef0123a3f9'; // gitleaks:allow — fixture value, not a real credential

/** Flips the first byte. `writeUInt8`/`readUInt8` rather than `buf[0] ^= …`
 *  because `noUncheckedIndexedAccess` types Buffer indexing as possibly
 *  undefined. */
function flipFirstByte(source: Uint8Array): Buffer {
  const copy = Buffer.from(source);
  copy.writeUInt8(copy.readUInt8(0) ^ 0xff, 0);
  return copy;
}

/** `SealedSecret` fields are `Uint8Array` (what Prisma returns), so the
 *  Buffer-only helpers need an explicit wrap. */
const buf = (value: Uint8Array): Buffer => Buffer.from(value);

function ring(...entries: [number, Buffer][]): Keyring {
  return new Map(entries);
}

describe('createSecretBox', () => {
  it('round-trips a token losslessly', () => {
    const box = createSecretBox(ring([1, KEY_1]));
    const sealed = box.seal(TOKEN);
    expect(box.open(sealed)).toBe(TOKEN);
  });

  it('never stores the plaintext in the ciphertext', () => {
    const box = createSecretBox(ring([1, KEY_1]));
    const sealed = box.seal(TOKEN);
    expect(buf(sealed.ciphertext).toString('utf8')).not.toContain(TOKEN);
    expect(buf(sealed.ciphertext).toString('base64')).not.toContain(TOKEN);
  });

  it('uses a fresh IV per seal, so identical plaintexts differ', () => {
    const box = createSecretBox(ring([1, KEY_1]));
    const a = box.seal(TOKEN);
    const b = box.seal(TOKEN);
    expect(buf(a.iv).equals(buf(b.iv))).toBe(false);
    expect(buf(a.ciphertext).equals(buf(b.ciphertext))).toBe(false);
    // Both still decrypt: the IV is carried per row, not derived.
    expect(box.open(a)).toBe(TOKEN);
    expect(box.open(b)).toBe(TOKEN);
  });

  it('throws on a tampered ciphertext rather than returning garbage', () => {
    const box = createSecretBox(ring([1, KEY_1]));
    const sealed = box.seal(TOKEN);
    const tampered = { ...sealed, ciphertext: flipFirstByte(sealed.ciphertext) };
    expect(() => box.open(tampered)).toThrow(SecretBoxError);
  });

  it('throws on a tampered auth tag', () => {
    const box = createSecretBox(ring([1, KEY_1]));
    const sealed = box.seal(TOKEN);
    const tampered = { ...sealed, authTag: flipFirstByte(sealed.authTag) };
    expect(() => box.open(tampered)).toThrow(SecretBoxError);
  });

  it('throws on a tampered IV', () => {
    const box = createSecretBox(ring([1, KEY_1]));
    const sealed = box.seal(TOKEN);
    const tampered = { ...sealed, iv: flipFirstByte(sealed.iv) };
    expect(() => box.open(tampered)).toThrow(SecretBoxError);
  });

  it('throws when opened with the wrong key', () => {
    const sealed = createSecretBox(ring([1, KEY_1])).seal(TOKEN);
    const otherBox = createSecretBox(ring([1, KEY_2]));
    expect(() => otherBox.open(sealed)).toThrow(SecretBoxError);
  });

  it('seals with the highest key version and still opens older ones', () => {
    // A row written before rotation.
    const old = createSecretBox(ring([1, KEY_1])).seal(TOKEN);
    expect(old.keyVersion).toBe(1);

    // After rotation both keys are present; new writes use version 2.
    const rotated = createSecretBox(ring([1, KEY_1], [2, KEY_2]));
    expect(rotated.seal(TOKEN).keyVersion).toBe(2);
    // …and the pre-rotation row is still readable. This is the whole point of
    // storing keyVersion per row rather than assuming one global key.
    expect(rotated.open(old)).toBe(TOKEN);
  });

  it('throws on an unknown key version instead of guessing', () => {
    const sealed = createSecretBox(ring([2, KEY_2])).seal(TOKEN);
    const boxWithoutV2 = createSecretBox(ring([1, KEY_1]));
    expect(() => boxWithoutV2.open(sealed)).toThrow(/Unbekannte Schlüsselversion 2/);
  });

  it('rejects an empty keyring', () => {
    expect(() => createSecretBox(ring())).toThrow(SecretBoxError);
  });
});

describe('parseKeyring', () => {
  const b64 = (b: Buffer): string => b.toString('base64');

  it('treats a single key as version 1', () => {
    const keyring = parseKeyring(b64(KEY_1), undefined);
    expect([...keyring.keys()]).toEqual([1]);
    expect(keyring.get(1)?.equals(KEY_1)).toBe(true);
  });

  it('parses a rotation window', () => {
    const keyring = parseKeyring(undefined, `1:${b64(KEY_1)},2:${b64(KEY_2)}`);
    expect([...keyring.keys()].sort()).toEqual([1, 2]);
  });

  it('prefers the multi-key form when both are set', () => {
    const keyring = parseKeyring(b64(KEY_1), `2:${b64(KEY_2)}`);
    expect([...keyring.keys()]).toEqual([2]);
  });

  it('rejects a key that is not exactly 32 bytes', () => {
    // 31 bytes: the length a `min(8)`-style check would happily accept, and the
    // reason this validation is stricter than SESSION_SECRET's.
    expect(() => parseKeyring(b64(randomBytes(31)), undefined)).toThrow(/genau 32 Bytes/);
    expect(() => parseKeyring(b64(randomBytes(33)), undefined)).toThrow(/genau 32 Bytes/);
    expect(() => parseKeyring('kurz', undefined)).toThrow(/genau 32 Bytes/);
  });

  it('rejects a malformed entry', () => {
    expect(() => parseKeyring(undefined, b64(KEY_1))).toThrow(/version:base64/);
    expect(() => parseKeyring(undefined, `x:${b64(KEY_1)}`)).toThrow(/Ungültige Schlüsselversion/);
    expect(() => parseKeyring(undefined, `0:${b64(KEY_1)}`)).toThrow(/Ungültige Schlüsselversion/);
  });

  it('rejects a duplicated version', () => {
    expect(() => parseKeyring(undefined, `1:${b64(KEY_1)},1:${b64(KEY_2)}`)).toThrow(/doppelt/);
  });

  it('rejects no configuration at all', () => {
    expect(() => parseKeyring(undefined, undefined)).toThrow(/Kein Integrationsschlüssel/);
    expect(() => parseKeyring('', '  ')).toThrow(/Kein Integrationsschlüssel/);
  });
});

describe('tokenHint', () => {
  it('exposes only the last four characters', () => {
    expect(tokenHint(TOKEN)).toBe('a3f9');
    expect(TOKEN).toContain(tokenHint(TOKEN));
  });

  it('masks a short token entirely rather than revealing a large fraction', () => {
    expect(tokenHint('abc')).toBe('');
    expect(tokenHint('1234567')).toBe('');
  });
});

describe('secretsEqual', () => {
  it('compares equal and unequal secrets', () => {
    expect(secretsEqual(TOKEN, TOKEN)).toBe(true);
    expect(secretsEqual(TOKEN, `${TOKEN}x`)).toBe(false);
    expect(secretsEqual(TOKEN, '')).toBe(false);
  });
});
