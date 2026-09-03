/**
 * Platform-wide operator metrics (Architektur `.planning/architecture-operator-dashboard.md`,
 * Key Decisions: "Metrics module shape").
 *
 * One function per metric, composed by `computeOperatorMetrics` — the same
 * "checklist of independent predicates" shape `assignment/candidates.ts` uses
 * for eligibility, applied here to read-only aggregates instead. Every query
 * runs live on every call; there is deliberately no snapshot/history table
 * (resolved decision — see the architecture doc's "snapshot vs. trend" fork).
 *
 * This is the one module in the codebase allowed to query across households
 * without a `householdId` predicate — the single, narrow, auditable exception
 * to CLAUDE.md §36's isolation guarantee. Nothing else may do this.
 */

import type { PrismaClient } from '@prisma/client';

const DAY_MS = 86_400_000;

export interface OperatorMetrics {
  households: { total: number; active: number };
  users: { total: number; active: number; activeLast24h: number; activeLast7d: number };
  taskThroughput: { completedLast24h: number; completedLast7d: number };
  ledgerVolume: { transactionsLast7d: number; byType: Record<string, { count: number; sum: number }> };
  buyouts: { last7d: number };
  todoistAdoption: { activeIntegrations: number };
  auditVolume: { last7d: number };
}

async function countActiveHouseholds(db: PrismaClient, since: Date): Promise<number> {
  // §3's resolved definition: ≥1 published TaskInstance in the last 14 days.
  // "≥1 active member" was rejected — households essentially never deactivate
  // their last member, so that definition would count nearly everyone.
  const rows = await db.taskInstance.findMany({
    where: { publishedAt: { not: null, gte: since } },
    select: { householdId: true },
    distinct: ['householdId'],
  });
  return rows.length;
}

async function countUsersActiveSince(db: PrismaClient, since: Date): Promise<number> {
  const rows = await db.session.findMany({
    where: { lastSeenAt: { gte: since } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.length;
}

async function computeLedgerByType(
  db: PrismaClient,
  since: Date,
): Promise<Record<string, { count: number; sum: number }>> {
  const rows = await db.pointTransaction.groupBy({
    by: ['type'],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { amount: true },
  });
  const byType: Record<string, { count: number; sum: number }> = {};
  for (const row of rows) {
    byType[row.type] = { count: row._count._all, sum: row._sum.amount ?? 0 };
  }
  return byType;
}

export async function computeOperatorMetrics(
  db: PrismaClient,
  now: Date,
): Promise<OperatorMetrics> {
  const since24h = new Date(now.getTime() - DAY_MS);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const since14d = new Date(now.getTime() - 14 * DAY_MS);

  const [
    householdsTotal,
    householdsActive,
    usersTotal,
    usersActive,
    usersActive24h,
    usersActive7d,
    completedLast24h,
    completedLast7d,
    transactionsLast7d,
    ledgerByType,
    buyoutsLast7d,
    activeIntegrations,
    auditLast7d,
  ] = await Promise.all([
    db.household.count(),
    countActiveHouseholds(db, since14d),
    db.user.count(),
    db.user.count({ where: { isActive: true } }),
    countUsersActiveSince(db, since24h),
    countUsersActiveSince(db, since7d),
    db.taskInstance.count({ where: { status: 'COMPLETED', completedAt: { gte: since24h } } }),
    db.taskInstance.count({ where: { status: 'COMPLETED', completedAt: { gte: since7d } } }),
    db.pointTransaction.count({ where: { createdAt: { gte: since7d } } }),
    computeLedgerByType(db, since7d),
    // Buyout as a flat count over the resolved-at timestamp — deliberately NOT
    // bucketed by household size, per the architecture's rejection of that
    // shape (it risks re-identifying a specific small household).
    db.taskAssignment.count({ where: { buyoutCost: { not: null }, closedAt: { gte: since7d } } }),
    db.memberIntegration.count({ where: { status: 'ACTIVE' } }),
    db.auditEvent.count({ where: { createdAt: { gte: since7d } } }),
  ]);

  return {
    households: { total: householdsTotal, active: householdsActive },
    users: {
      total: usersTotal,
      active: usersActive,
      activeLast24h: usersActive24h,
      activeLast7d: usersActive7d,
    },
    taskThroughput: { completedLast24h, completedLast7d },
    ledgerVolume: { transactionsLast7d, byType: ledgerByType },
    buyouts: { last7d: buyoutsLast7d },
    todoistAdoption: { activeIntegrations },
    auditVolume: { last7d: auditLast7d },
  };
}
