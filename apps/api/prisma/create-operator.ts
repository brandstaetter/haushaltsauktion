/**
 * Interactive creation of an operator account — `npm run create-operator`.
 *
 * Unlike `create-admin.ts`, there is no household or config to bootstrap: an
 * `OperatorAccount` is a standalone row, not the first member of anything.
 * Deliberately re-runnable — Architektur `.planning/architecture-operator-dashboard.md`,
 * Key Decisions ("multiple operator accounts"): re-running this script with a
 * new email is how a second or third operator gets added. There is no
 * in-app "invite an operator" flow for v1; shell/CLI access is itself the
 * access control, same reasoning as the CLI-not-self-service decision for
 * the first account.
 *
 * **Non-interactive mode** (`OPERATOR_BOOTSTRAP_EMAIL` / `OPERATOR_BOOTSTRAP_PASSWORD`
 * env vars) exists for environments with no interactive shell at all — e.g. a
 * production instance reachable only via a CI job's SSH key
 * (`.github/workflows/create-operator.yml`), where a human cannot sit at a
 * TTY to answer `prompt()`. Both prompts fall back to env vars when set, so a
 * local `npm run create-operator` run is unchanged. When
 * `OPERATOR_BOOTSTRAP_PASSWORD` is supplied, the caller already knows the
 * password (it came from a value they chose) — this script does not need to
 * invent one, and never has to print a secret CI didn't already know about.
 */

import { createInterface, type Interface } from 'node:readline/promises';

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { generateTemporaryPassword, hashPassword } from '../src/infra/auth/password.js';

const prisma = new PrismaClient();

const EmailSchema = z.string().trim().min(3).max(320).email();

async function prompt(rl: Interface, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

async function main(): Promise<void> {
  const envEmail = process.env.OPERATOR_BOOTSTRAP_EMAIL;

  let rawEmail: string;
  if (envEmail !== undefined) {
    rawEmail = envEmail;
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rawEmail = await prompt(rl, 'Operator-E-Mail: ');
    rl.close();
  }
  const email = EmailSchema.parse(rawEmail).toLowerCase();

  const existing = await prisma.operatorAccount.findUnique({ where: { email } });
  if (existing !== null) {
    throw new Error(`Es existiert bereits ein Operator-Account mit der E-Mail "${email}".`);
  }

  // Non-interactive callers (see module doc) supply their own password —
  // they already know it, so there is nothing here for this script to
  // generate or reveal. Interactive/local runs keep the original one-off
  // generated password, same shape as create-admin.ts's generatePassword().
  const envPassword = process.env.OPERATOR_BOOTSTRAP_PASSWORD;
  const password = envPassword ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(password);

  const account = await prisma.operatorAccount.create({
    data: { email, passwordHash },
  });

  console.log('');
  console.log('Operator-Account erstellt.');
  console.log(`  ID:        ${account.id}`);
  console.log(`  E-Mail:    ${email}`);
  console.log(`  Passwort:  ${password}`);
  console.log('');
  console.log(
    envPassword !== undefined
      ? 'Passwort wie vorgegeben gesetzt (OPERATOR_BOOTSTRAP_PASSWORD).'
      : 'Dieses Passwort wird nur jetzt angezeigt und nirgendwo gespeichert.',
  );
  console.log(
    'Diese Identität ist bewusst getrennt von jedem Haushalts-Account — Login unter /betrieb.',
  );
  if (envPassword === undefined) {
    console.log('Bitte sicher übergeben und nach dem ersten Login ändern.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Erstellung fehlgeschlagen:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
