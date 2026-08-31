/**
 * E2E-only fixture health check — called from `e2e/global-setup.ts`, never in
 * production or in `npm run seed`.
 *
 * Two independent things starve `flow-3`'s random-assignment sweep of
 * material on a repeated same-day run:
 *
 * 1. `seed.ts` only publishes a fresh instance for a definition when its
 *    `nextOccurrence` due date has actually arrived (§18) and no instance is
 *    already open for it (§5.3's `maxOpenInstancesPerDefinition`). Correct
 *    production behaviour, but `flow-1` completes one instance and
 *    `flow-2`'s race winner leaves one `ASSIGNED`, and neither frees up a
 *    new occurrence until the calendar date rolls over.
 * 2. The sweep's T4/T5 random-draw stage only considers instances whose
 *    `offerExpiresAt <= now` — "ripe" (`runAssignmentSweep.ts`). Seed's own
 *    instances get `offerExpiresAt: now` (immediately ripe, "damit der
 *    Sweep direkt ausprobiert werden kann"), but the *background* interval
 *    worker (`SWEEP_INTERVAL_SECONDS`, main.ts) materializes due occurrences
 *    with a real `offerDurationMinutes`-out `offerExpiresAt` — playwright.config.ts
 *    now sets `SWEEP_INTERVAL_SECONDS=0` for the E2E API process to stop
 *    that background churn, but any instance a *previous* E2E session's
 *    worker already materialized before that fix stays not-ripe until its
 *    own window lapses. This script is the belt to that config's braces.
 *
 * It never deletes a `TaskInstance` — completed ones are referenced by
 * `PointTransaction` under `onDelete: Restrict`, so deleting them would
 * break ledger integrity. For each definition: if a ripe `AVAILABLE`
 * instance already exists, do nothing; else if a not-yet-ripe one exists,
 * pull its `offerExpiresAt` forward to now instead of creating a duplicate;
 * else publish a fresh one exactly like `seed.ts`'s own instance-creation
 * block, just without the due-date gate. `ASSIGNED`/`COMPLETED` instances
 * are never touched.
 */

import { PrismaClient } from '@prisma/client';

const HOUSEHOLD_ID = 'seed-household-demo-family';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const definitions = await prisma.taskDefinition.findMany({
      where: { householdId: HOUSEHOLD_ID, isActive: true },
      select: { id: true, title: true, baseValue: true },
    });

    const currentConfig = await prisma.householdConfiguration.findFirst({
      where: { householdId: HOUSEHOLD_ID },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    if (!currentConfig) {
      throw new Error(`Keine Konfiguration für Haushalt ${HOUSEHOLD_ID} gefunden — Seed zuerst laufen lassen.`);
    }

    let published = 0;
    let madeRipe = 0;
    for (const def of definitions) {
      const ripeCount = await prisma.taskInstance.count({
        where: {
          householdId: HOUSEHOLD_ID,
          taskDefinitionId: def.id,
          status: 'AVAILABLE',
          offerExpiresAt: { lte: now },
        },
      });
      if (ripeCount > 0) continue;

      const notYetRipe = await prisma.taskInstance.findFirst({
        where: { householdId: HOUSEHOLD_ID, taskDefinitionId: def.id, status: 'AVAILABLE' },
        select: { id: true, version: true },
      });
      if (notYetRipe) {
        await prisma.taskInstance.updateMany({
          where: { id: notYetRipe.id, householdId: HOUSEHOLD_ID, version: notYetRipe.version },
          data: { offerExpiresAt: now, version: { increment: 1 } },
        });
        madeRipe += 1;
        continue;
      }

      const instance = await prisma.taskInstance.create({
        data: {
          householdId: HOUSEHOLD_ID,
          taskDefinitionId: def.id,
          status: 'AVAILABLE',
          currentValue: def.baseValue,
          baseValue: def.baseValue,
          scheduledFor: now,
          dueAt: new Date(now.getTime() + 24 * 3600_000),
          publishedAt: now,
          offerExpiresAt: now,
          configVersion: currentConfig.version,
        },
      });

      await prisma.taskHistoryEvent.createMany({
        data: [
          {
            householdId: HOUSEHOLD_ID,
            taskInstanceId: instance.id,
            type: 'CREATED',
            payload: { title: def.title, value: def.baseValue },
          },
          {
            householdId: HOUSEHOLD_ID,
            taskInstanceId: instance.id,
            type: 'OFFERED',
            payload: { title: def.title, value: def.baseValue },
          },
        ],
      });

      published += 1;
    }

    console.log(
      `E2E-Fixture-Auffrischung: ${published} neue AVAILABLE-Instanz(en), ` +
        `${madeRipe} bestehende sofort reif gemacht.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('E2E-Fixture-Auffrischung fehlgeschlagen:', error);
  process.exit(1);
});
