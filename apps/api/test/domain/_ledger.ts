/**
 * A tiny in-memory ledger for the domain suite.
 *
 * It does exactly what `postTransaction` (§8.2) does minus the database: run
 * the real `computePosting` arithmetic, chain each entry to its predecessor,
 * and keep a cache alongside. Every economy test then ends by running
 * `verifyLedgerIntegrity` over the result, so a test that gets the right
 * balance by the wrong route still fails.
 */

import { AssignmentKind, GENESIS, type PointTransactionType } from '@haushaltsauktion/shared';

import {
  computePosting,
  previousTransactionIdFor,
  verifyLedgerIntegrity,
  type LedgerEntry,
  type LedgerIntegrityFindings,
  type LedgerSnapshot,
} from '../../src/domain/points/ledger-math.js';

export interface PostInput {
  memberId: string;
  amount: number;
  type: PointTransactionType;
  taskAssignmentId?: string | null;
  assignmentKind?: AssignmentKind | null;
  rewardRedemptionId?: string | null;
}

export class TestLedger {
  private readonly entries: LedgerEntry[] = [];
  private nextSeq = 1n;

  post(input: PostInput): LedgerEntry {
    const tail = this.tailFor(input.memberId);
    const posting = computePosting({
      balanceBefore: tail?.balanceAfter ?? 0,
      amount: input.amount,
      type: input.type,
      taskAssignmentId: input.taskAssignmentId ?? null,
      assignmentKind: input.assignmentKind ?? null,
      rewardRedemptionId: input.rewardRedemptionId ?? null,
    });

    const entry: LedgerEntry = {
      id: `tx-${this.nextSeq}`,
      seq: this.nextSeq,
      memberId: input.memberId,
      amount: posting.amount,
      balanceBefore: posting.balanceBefore,
      balanceAfter: posting.balanceAfter,
      type: input.type,
      previousTransactionId: previousTransactionIdFor(tail),
      taskAssignmentId: input.taskAssignmentId ?? null,
      assignmentKind: input.assignmentKind ?? null,
      rewardRedemptionId: input.rewardRedemptionId ?? null,
    };

    this.nextSeq += 1n;
    this.entries.push(entry);
    return entry;
  }

  private tailFor(memberId: string): LedgerEntry | null {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      if (entry && entry.memberId === memberId) return entry;
    }
    return null;
  }

  balanceOf(memberId: string): number {
    return this.tailFor(memberId)?.balanceAfter ?? 0;
  }

  count(): number {
    return this.entries.length;
  }

  entriesFor(memberId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.memberId === memberId);
  }

  snapshot(memberIds: readonly string[]): LedgerSnapshot {
    return {
      entries: [...this.entries],
      members: memberIds.map((memberId) => ({
        memberId,
        pointsCache: this.balanceOf(memberId),
      })),
    };
  }

  verify(memberIds: readonly string[]): LedgerIntegrityFindings {
    return verifyLedgerIntegrity(this.snapshot(memberIds));
  }
}

export { GENESIS };
