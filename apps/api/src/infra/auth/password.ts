/**
 * Password hashing (CLAUDE.md §25, §36; PRD §2).
 *
 * argon2id — memory-hard, so a leaked hash cannot be brute-forced on a GPU the
 * way a fast hash can. The parameters are the @node-rs defaults for the id
 * variant, which are the OWASP-recommended floor rather than a number picked
 * here.
 *
 * `verifyPassword` never distinguishes "no such user" from "wrong password" to
 * its caller — see `login` in `session.ts`, which pads both paths through the
 * same hash comparison so the response time does not leak which one it was.
 */

import { randomBytes } from 'node:crypto';

import { hash, verify } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id`. Spelled as the literal because @node-rs declares
 * `Algorithm` as an ambient `const enum`, which `verbatimModuleSyntax` cannot
 * import. The value is part of the library's public ABI, so it is stable.
 */
const ARGON2ID = 2;

const OPTIONS = { algorithm: ARGON2ID } as const;

/**
 * A hash of a value nobody knows, used to burn the same CPU time on a login
 * attempt for an unknown email as for a known one. Without it, "unknown email"
 * returns in microseconds and "wrong password" in ~100 ms, which is a usable
 * account-enumeration oracle.
 */
let dummyHash: string | null = null;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, OPTIONS);
  } catch {
    // A malformed stored hash must fail closed, not throw a 500 that tells an
    // attacker the record exists but is corrupt.
    return false;
  }
}

/**
 * A one-off password for an admin-created account or an admin-triggered
 * reset. Must be shown to the admin exactly once (§25) — nothing stores the
 * plaintext, so a caller who discards the return value has lost it for good.
 * base64url keeps it copy-pasteable (no characters a shell or URL would mangle)
 * while still clearing the 8-character minimum `MemberCreateBody` enforces.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

/** Spend the same time as a real verification, then fail. */
export async function burnPasswordTime(plain: string): Promise<false> {
  dummyHash ??= await hashPassword('timing-padding-value');
  await verifyPassword(dummyHash, plain);
  return false;
}
