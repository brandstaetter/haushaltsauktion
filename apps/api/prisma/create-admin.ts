/**
 * Interactive creation of a real admin account — `npm run create-admin`.
 *
 * Unlike `seed.ts` (fixed demo data, fixed password `demo1234`), this asks for
 * the admin's email, creates a fresh household with a valid config version 1
 * (required — see `loadCurrentConfig` in `app/config/load.ts`, which throws if
 * a household has none), and generates a random password that is shown
 * exactly once and never stored in plaintext or logged anywhere else.
 */

import { randomBytes } from 'node:crypto';
import { createInterface, type Interface } from 'node:readline/promises';

import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';

import { DEFAULT_CONFIG, parseConfig } from '@haushaltsauktion/shared';

import { hashPassword } from '../src/infra/auth/password.js';

const prisma = new PrismaClient();

const EmailSchema = z.string().trim().min(3).max(320).email();

function generatePassword(): string {
  // 24 random bytes, base64url-encoded (~32 chars, ~192 bits of entropy) —
  // no ambiguous-character concerns since this is never hand-typed.
  return randomBytes(24).toString('base64url');
}

async function prompt(rl: Interface, question: string): Promise<string> {
  return (await rl.question(question)).trim();
}

async function main(): Promise<void> {
  // One interface for the whole run — a fresh createInterface per question
  // loses already-buffered input when stdin is piped (non-tty), so later
  // prompts silently read as empty.
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const rawEmail = await prompt(rl, 'Admin-E-Mail: ');
  const email = EmailSchema.parse(rawEmail).toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    rl.close();
    throw new Error(`Es existiert bereits ein Benutzer mit der E-Mail "${email}".`);
  }

  const householdNameInput = await prompt(rl, 'Haushaltsname [Mein Haushalt]: ');
  const householdName = householdNameInput.length > 0 ? householdNameInput : 'Mein Haushalt';

  const displayNameInput = await prompt(rl, 'Anzeigename [Admin]: ');
  const displayName = displayNameInput.length > 0 ? displayNameInput : 'Admin';

  rl.close();

  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const config = parseConfig(DEFAULT_CONFIG);

  const { household } = await prisma.$transaction(async (tx) => {
    const createdHousehold = await tx.household.create({
      data: { name: householdName },
    });

    // §5.2 — every household needs a version-1 config row before any business
    // logic (task assignment, buyout, ...) can run against it.
    await tx.householdConfiguration.create({
      data: {
        householdId: createdHousehold.id,
        version: 1,
        values: config as unknown as Prisma.InputJsonObject,
      },
    });

    const user = await tx.user.create({
      data: { email, displayName, passwordHash },
    });

    await tx.householdMember.create({
      data: {
        householdId: createdHousehold.id,
        userId: user.id,
        displayName,
        role: 'ADMIN',
      },
    });

    return { household: createdHousehold };
  });

  console.log('');
  console.log('Admin-Account erstellt.');
  console.log(`  Haushalt:  ${household.name} (${household.id})`);
  console.log(`  E-Mail:    ${email}`);
  console.log(`  Passwort:  ${password}`);
  console.log('');
  console.log('Dieses Passwort wird nur jetzt angezeigt und nirgendwo gespeichert.');
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
