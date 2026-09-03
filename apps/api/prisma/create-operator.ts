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
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const rawEmail = await prompt(rl, 'Operator-E-Mail: ');
  const email = EmailSchema.parse(rawEmail).toLowerCase();

  rl.close();

  const existing = await prisma.operatorAccount.findUnique({ where: { email } });
  if (existing !== null) {
    throw new Error(`Es existiert bereits ein Operator-Account mit der E-Mail "${email}".`);
  }

  // 24 random bytes, base64url-encoded — same shape as create-admin.ts's
  // generatePassword(), reused here via generateTemporaryPassword() rather
  // than duplicated (it's the identical "one-off password, shown once"
  // primitive, already exported from password.ts for admin resets).
  const password = generateTemporaryPassword();
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
  console.log('Dieses Passwort wird nur jetzt angezeigt und nirgendwo gespeichert.');
  console.log(
    'Diese Identität ist bewusst getrennt von jedem Haushalts-Account — Login unter /betrieb.',
  );
  console.log('Bitte sicher übergeben und nach dem ersten Login ändern.');
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
