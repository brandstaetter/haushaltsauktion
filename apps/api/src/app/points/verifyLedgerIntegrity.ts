/**
 * §8.5 — the ledger's self-check.
 *
 * Three call sites: `GET /api/admin/ledger/integrity`, a global `afterEach` in
 * the integration suite (so *every* integration test proves the ledger is
 * consistent after whatever it just did — end-condition 14, applied
 * continuously), and `npm run verify:ledger`.
 *
 * The walk itself is pure and lives in `domain/points/ledger-math.ts`. This
 * file is only the I/O around it: stream the rows once, hand them over, and
 * optionally repair the *cache* — never the ledger. The only remedy for a bad
 * entry is a compensating `CORRECTION` transaction, which is itself an audited
 * ledger row (§14).
 */

import type { PrismaClient } from '@prisma/client';

import {
  verifyLedgerIntegrity as verify,
  type LedgerEntry,
  type LedgerIntegrityReport,
} from '../../domain/points/ledger-math.js';

export type { LedgerIntegrityReport };

export interface VerifyOptions {
  householdId?: string;
  repairCache?: boolean;
  /** Who to attribute a `LEDGER_CACHE_REPAIRED` audit event to. */
  actorMemberId?: string | null;
}

export async function verifyLedgerIntegrity(
  db: PrismaClient,
  opts: VerifyOptions = {},
): Promise<LedgerIntegrityReport> {
  const startedAt = Date.now();
  const householdFilter = opts.householdId ? { householdId: opts.householdId } : {};

  const [rows, members] = await Promise.all([
    db.pointTransaction.findMany({
      where: householdFilter,
      orderBy: { seq: 'asc' },
      select: {
        id: true,
        seq: true,
        memberId: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        type: true,
        previousTransactionId: true,
        taskAssignmentId: true,
        assignmentKind: true,
      },
    }),
    db.householdMember.findMany({
      where: householdFilter,
      select: { id: true, pointsCache: true },
    }),
  ]);

  const entries: LedgerEntry[] = rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    memberId: r.memberId,
    amount: r.amount,
    balanceBefore: r.balanceBefore,
    balanceAfter: r.balanceAfter,
    type: r.type,
    previousTransactionId: r.previousTransactionId,
    taskAssignmentId: r.taskAssignmentId,
    assignmentKind: r.assignmentKind,
  }));

  const findings = verify({
    entries,
    members: members.map((m) => ({ memberId: m.id, pointsCache: m.pointsCache })),
  });

  if (opts.repairCache) {
    // Repair is always scoped to one household. Not a limitation — a repair is
    // an audited administrative act (§8.5), and there is no admin of "every
    // household" to attribute a global one to, nor an audit log to write it in.
    const householdId = opts.householdId;
    if (householdId === undefined) {
      throw new Error('repairCache erfordert eine householdId (§8.5).');
    }

    const sums = new Map<string, number>();
    for (const entry of entries) {
      sums.set(entry.memberId, (sums.get(entry.memberId) ?? 0) + entry.amount);
    }
    for (const member of members) {
      const expected = sums.get(member.id) ?? 0;
      if (expected === member.pointsCache) continue;
      await db.householdMember.updateMany({
        where: { id: member.id, householdId },
        data: { pointsCache: expected },
      });
      await db.auditEvent.create({
        data: {
          householdId,
          actorType: opts.actorMemberId ? 'ADMIN' : 'SYSTEM',
          actorMemberId: opts.actorMemberId ?? null,
          action: 'LEDGER_CACHE_REPAIRED',
          entityType: 'HouseholdMember',
          entityId: member.id,
          payload: { from: member.pointsCache, to: expected },
        },
      });
    }
  }

  return {
    ...findings,
    checkedAt: new Date(startedAt).toISOString(),
    householdId: opts.householdId ?? null,
    durationMs: Date.now() - startedAt,
  };
}
