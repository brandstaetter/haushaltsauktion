/**
 * Sanity checks run against a freshly restored database — `npm run verify-restore`.
 *
 * Used by the weekly restore drill (.github/workflows/restore-drill.yml, per
 * docs/hosting-plan.md §7 Stufe 1) after a backup dump has been loaded into an
 * ephemeral Postgres and brought to the current migration state. This does not
 * replace the quarterly full-instance DR drill (§7 Stufe 2) — it only proves
 * the *logical* dump is intact and internally consistent.
 *
 * Exits non-zero (failing the workflow) on any check below. Row counts alone
 * are printed for visibility, not asserted against a fixed minimum — a small
 * household legitimately has few rows.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class RestoreCheckError extends Error {}

async function checkCoreTablesNotEmpty(): Promise<void> {
  const [households, members, definitions] = await Promise.all([
    prisma.household.count(),
    prisma.householdMember.count(),
    prisma.taskDefinition.count(),
  ]);

  console.log(`Households: ${households}, Members: ${members}, TaskDefinitions: ${definitions}`);

  if (households === 0 || members === 0 || definitions === 0) {
    throw new RestoreCheckError(
      'Kerntabellen (households/household_members/task_definitions) sind leer — Restore vermutlich unvollständig oder Dump falsch/leer.',
    );
  }
}

/**
 * §14/§44 Invariante: der Punktestand jedes Mitglieds ist ausschließlich aus
 * dem Ledger ableitbar. Diese Prüfung rekonstruiert den Saldo aus
 * PointTransaction (in seq-Reihenfolge) und vergleicht ihn mit dem
 * HouseholdMember.pointsCache — driftet er, ist entweder der Cache oder das
 * Ledger selbst beim Restore beschädigt worden.
 */
async function checkLedgerMatchesCache(): Promise<void> {
  const members = await prisma.householdMember.findMany({
    select: { id: true, displayName: true, pointsCache: true },
  });

  const mismatches: string[] = [];

  for (const member of members) {
    const lastTransaction = await prisma.pointTransaction.findFirst({
      where: { memberId: member.id },
      orderBy: { seq: 'desc' },
      select: { balanceAfter: true },
    });

    const expectedBalance = lastTransaction?.balanceAfter ?? 0;
    if (expectedBalance !== member.pointsCache) {
      mismatches.push(
        `${member.displayName} (${member.id}): Ledger-Saldo=${expectedBalance}, pointsCache=${member.pointsCache}`,
      );
    }
  }

  console.log(`Ledger-Konsistenz geprüft für ${members.length} Mitglieder.`);

  if (mismatches.length > 0) {
    throw new RestoreCheckError(
      `pointsCache weicht vom Ledger ab bei ${mismatches.length} Mitglied(ern):\n  ${mismatches.join('\n  ')}`,
    );
  }
}

/**
 * §1.5 Hash-Chain-lite: pro Mitglied muss previousTransactionId lückenlos auf
 * die in seq-Reihenfolge vorherige Transaktion zeigen (oder 'GENESIS' bei der
 * ersten). Eine Lücke bedeutet, dass der Dump Zeilen verloren hat oder die
 * Kette anderweitig beschädigt ist.
 */
async function checkLedgerChainIntact(): Promise<void> {
  const members = await prisma.householdMember.findMany({ select: { id: true, displayName: true } });
  const brokenChains: string[] = [];

  for (const member of members) {
    const transactions = await prisma.pointTransaction.findMany({
      where: { memberId: member.id },
      orderBy: { seq: 'asc' },
      select: { id: true, previousTransactionId: true },
    });

    let expectedPrevious = 'GENESIS';
    for (const tx of transactions) {
      if (tx.previousTransactionId !== expectedPrevious) {
        brokenChains.push(`${member.displayName} (${member.id}) bei Transaktion ${tx.id}`);
        break;
      }
      expectedPrevious = tx.id;
    }
  }

  if (brokenChains.length > 0) {
    throw new RestoreCheckError(`Ledger-Hash-Chain unterbrochen: ${brokenChains.join(', ')}`);
  }
}

async function reportFreshness(): Promise<void> {
  const latest = await prisma.pointTransaction.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (latest === null) {
    console.log('Keine PointTransaction im Dump — nichts zu datieren.');
    return;
  }

  const ageHours = (Date.now() - latest.createdAt.getTime()) / (1000 * 60 * 60);
  console.log(`Jüngste PointTransaction: ${latest.createdAt.toISOString()} (${ageHours.toFixed(1)}h alt).`);
}

async function main(): Promise<void> {
  await checkCoreTablesNotEmpty();
  await checkLedgerMatchesCache();
  await checkLedgerChainIntact();
  await reportFreshness();
  console.log('');
  console.log('Restore-Verifikation erfolgreich: Schema aktuell, Kerntabellen gefüllt, Ledger konsistent.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Restore-Verifikation fehlgeschlagen:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
