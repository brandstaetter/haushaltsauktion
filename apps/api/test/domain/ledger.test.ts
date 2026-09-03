/**
 * §8 — ledger integrity.
 *
 * Every violation kind in §8.5 is constructed deliberately here, because a
 * verifier that has only ever seen healthy data is not evidence of anything.
 */

import { describe, expect, it } from 'vitest';

import { AssignmentKind, GENESIS, PointTransactionType } from '@haushaltsauktion/shared';

import { ConflictError } from '../../src/domain/errors.js';
import {
  balanceFromEntries,
  computePosting,
  previousTransactionIdFor,
  recomputeBalances,
  signRuleViolated,
  verifyLedgerIntegrity,
  type LedgerEntry,
} from '../../src/domain/points/ledger-math.js';
import { TestLedger } from './_ledger.js';

const ANNA = 'member-anna';
const PAUL = 'member-paul';

const entry = (over: Partial<LedgerEntry> & Pick<LedgerEntry, 'id' | 'seq'>): LedgerEntry => ({
  memberId: ANNA,
  amount: 1,
  balanceBefore: 0,
  balanceAfter: 1,
  type: PointTransactionType.MANUAL_ADJUSTMENT,
  previousTransactionId: GENESIS,
  taskAssignmentId: null,
  assignmentKind: null,
  rewardRedemptionId: null,
  ...over,
});

describe('posting arithmetic (§8.2)', () => {
  it('computes balanceAfter as balanceBefore + amount', () => {
    expect(
      computePosting({ balanceBefore: 10, amount: -6, type: PointTransactionType.BUYOUT, taskAssignmentId: 'a1', assignmentKind: AssignmentKind.RANDOM }),
    ).toEqual({ balanceBefore: 10, balanceAfter: 4, amount: -6 });
  });

  it('rejects a zero amount — "no points" is an absent row, not a zero row', () => {
    expect(() =>
      computePosting({ balanceBefore: 0, amount: 0, type: PointTransactionType.BONUS }),
    ).toThrow(ConflictError);
  });

  it('rejects a non-integer amount', () => {
    expect(() =>
      computePosting({ balanceBefore: 0, amount: 1.5, type: PointTransactionType.BONUS }),
    ).toThrow(ConflictError);
  });

  it('enforces the per-type sign rules (§1.5)', () => {
    expect(signRuleViolated(PointTransactionType.BUYOUT, 5)).toBe(true);
    expect(signRuleViolated(PointTransactionType.BUYOUT, -5)).toBe(false);
    expect(signRuleViolated(PointTransactionType.VOLUNTARY_TASK_REWARD, -5)).toBe(true);
    expect(signRuleViolated(PointTransactionType.VOLUNTARY_TASK_REWARD, 5)).toBe(false);
    expect(signRuleViolated(PointTransactionType.DECAY, 5)).toBe(true);
    expect(signRuleViolated(PointTransactionType.DECAY, -5)).toBe(false);
    expect(signRuleViolated(PointTransactionType.MANUAL_ADJUSTMENT, -5)).toBe(false);
  });

  it('refuses a positive buyout and a negative reward', () => {
    expect(() =>
      computePosting({ balanceBefore: 0, amount: 5, type: PointTransactionType.BUYOUT, taskAssignmentId: 'a1', assignmentKind: AssignmentKind.RANDOM }),
    ).toThrow(/Vorzeichenregel/);
  });

  it('requires a work transaction to name its assignment', () => {
    expect(() =>
      computePosting({ balanceBefore: 0, amount: -1, type: PointTransactionType.BUYOUT }),
    ).toThrow(/Zuweisung/);
  });

  it('uses GENESIS rather than NULL for a first entry (§8.3)', () => {
    expect(previousTransactionIdFor(null)).toBe(GENESIS);
    expect(previousTransactionIdFor({ id: 'tx-7' })).toBe('tx-7');
  });
});

describe('verifyLedgerIntegrity on a healthy ledger (§8.5)', () => {
  it('passes and reports the counts', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 10, type: PointTransactionType.MANUAL_ADJUSTMENT });
    ledger.post({
      memberId: ANNA,
      amount: -6,
      type: PointTransactionType.BUYOUT,
      taskAssignmentId: 'a1',
      assignmentKind: AssignmentKind.RANDOM,
    });
    ledger.post({
      memberId: PAUL,
      amount: 6,
      type: PointTransactionType.VOLUNTARY_TASK_REWARD,
      taskAssignmentId: 'a2',
      assignmentKind: AssignmentKind.VOLUNTARY,
    });

    const report = ledger.verify([ANNA, PAUL]);
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.transactionCount).toBe(3);
    expect(report.memberCount).toBe(2);
    expect(ledger.balanceOf(ANNA)).toBe(4);
    expect(ledger.balanceOf(PAUL)).toBe(6);
  });

  it('accepts a member with a cache of 0 and no transactions', () => {
    const report = verifyLedgerIntegrity({
      entries: [],
      members: [{ memberId: ANNA, pointsCache: 0 }],
    });
    expect(report.ok).toBe(true);
    expect(report.memberCount).toBe(1);
  });
});

describe('verifyLedgerIntegrity detects every violation kind (§8.5)', () => {
  const kinds = (report: { violations: Array<{ kind: string }> }): string[] =>
    report.violations.map((v) => v.kind);

  it('CACHE_MISMATCH', () => {
    const report = verifyLedgerIntegrity({
      entries: [entry({ id: 'tx-1', seq: 1n, amount: 5, balanceBefore: 0, balanceAfter: 5 })],
      members: [{ memberId: ANNA, pointsCache: 99 }],
    });
    expect(kinds(report)).toContain('CACHE_MISMATCH');
    expect(report.ok).toBe(false);
  });

  it('CACHE_MISMATCH on a non-zero cache with an empty ledger', () => {
    const report = verifyLedgerIntegrity({
      entries: [],
      members: [{ memberId: ANNA, pointsCache: 12 }],
    });
    expect(kinds(report)).toContain('CACHE_MISMATCH');
  });

  it('ARITHMETIC_BREAK', () => {
    const report = verifyLedgerIntegrity({
      entries: [entry({ id: 'tx-1', seq: 1n, amount: 5, balanceBefore: 0, balanceAfter: 7 })],
      members: [{ memberId: ANNA, pointsCache: 5 }],
    });
    expect(kinds(report)).toContain('ARITHMETIC_BREAK');
  });

  it('CHAIN_BREAK', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({ id: 'tx-1', seq: 1n, amount: 5, balanceBefore: 0, balanceAfter: 5 }),
        entry({
          id: 'tx-2',
          seq: 2n,
          amount: 3,
          balanceBefore: 99,
          balanceAfter: 102,
          previousTransactionId: 'tx-1',
        }),
      ],
      members: [{ memberId: ANNA, pointsCache: 8 }],
    });
    expect(kinds(report)).toContain('CHAIN_BREAK');
  });

  it('CHAIN_FORK — two entries claiming the same predecessor', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({ id: 'tx-1', seq: 1n, amount: 5, balanceBefore: 0, balanceAfter: 5 }),
        entry({ id: 'tx-2', seq: 2n, amount: 3, balanceBefore: 5, balanceAfter: 8, previousTransactionId: 'tx-1' }),
        entry({ id: 'tx-3', seq: 3n, amount: 4, balanceBefore: 5, balanceAfter: 9, previousTransactionId: 'tx-1' }),
      ],
      members: [{ memberId: ANNA, pointsCache: 12 }],
    });
    expect(kinds(report)).toContain('CHAIN_FORK');
  });

  it('MULTIPLE_GENESIS', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({ id: 'tx-1', seq: 1n, amount: 5, balanceBefore: 0, balanceAfter: 5 }),
        entry({ id: 'tx-2', seq: 2n, amount: 3, balanceBefore: 5, balanceAfter: 8 }),
      ],
      members: [{ memberId: ANNA, pointsCache: 8 }],
    });
    expect(kinds(report)).toContain('MULTIPLE_GENESIS');
  });

  it('SIGN_VIOLATION', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({
          id: 'tx-1',
          seq: 1n,
          amount: 5,
          balanceBefore: 0,
          balanceAfter: 5,
          type: PointTransactionType.BUYOUT,
          taskAssignmentId: 'a1',
          assignmentKind: AssignmentKind.RANDOM,
        }),
      ],
      members: [{ memberId: ANNA, pointsCache: 5 }],
    });
    expect(kinds(report)).toContain('SIGN_VIOLATION');
  });

  it('ZERO_AMOUNT', () => {
    const report = verifyLedgerIntegrity({
      entries: [entry({ id: 'tx-1', seq: 1n, amount: 0, balanceBefore: 0, balanceAfter: 0 })],
      members: [{ memberId: ANNA, pointsCache: 0 }],
    });
    expect(kinds(report)).toContain('ZERO_AMOUNT');
  });

  it('REWARD_ON_RANDOM — §44 checked from the data, not trusted', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({
          id: 'tx-1',
          seq: 1n,
          amount: 6,
          balanceBefore: 0,
          balanceAfter: 6,
          type: PointTransactionType.VOLUNTARY_TASK_REWARD,
          taskAssignmentId: 'a1',
          assignmentKind: AssignmentKind.RANDOM,
        }),
      ],
      members: [{ memberId: ANNA, pointsCache: 6 }],
    });
    expect(kinds(report)).toContain('REWARD_ON_RANDOM');
  });

  it('DUPLICATE_REWARD and DUPLICATE_BUYOUT', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({
          id: 'tx-1',
          seq: 1n,
          amount: 6,
          balanceBefore: 0,
          balanceAfter: 6,
          type: PointTransactionType.VOLUNTARY_TASK_REWARD,
          taskAssignmentId: 'a1',
          assignmentKind: AssignmentKind.VOLUNTARY,
        }),
        entry({
          id: 'tx-2',
          seq: 2n,
          amount: 6,
          balanceBefore: 6,
          balanceAfter: 12,
          type: PointTransactionType.VOLUNTARY_TASK_REWARD,
          previousTransactionId: 'tx-1',
          taskAssignmentId: 'a1',
          assignmentKind: AssignmentKind.VOLUNTARY,
        }),
        entry({
          id: 'tx-3',
          seq: 3n,
          amount: -2,
          balanceBefore: 12,
          balanceAfter: 10,
          type: PointTransactionType.BUYOUT,
          previousTransactionId: 'tx-2',
          taskAssignmentId: 'a2',
          assignmentKind: AssignmentKind.RANDOM,
        }),
        entry({
          id: 'tx-4',
          seq: 4n,
          amount: -2,
          balanceBefore: 10,
          balanceAfter: 8,
          type: PointTransactionType.BUYOUT,
          previousTransactionId: 'tx-3',
          taskAssignmentId: 'a2',
          assignmentKind: AssignmentKind.RANDOM,
        }),
      ],
      members: [{ memberId: ANNA, pointsCache: 8 }],
    });
    expect(kinds(report)).toContain('DUPLICATE_REWARD');
    expect(kinds(report)).toContain('DUPLICATE_BUYOUT');
  });

  it('ORPHAN_WORK_TX', () => {
    const report = verifyLedgerIntegrity({
      entries: [
        entry({
          id: 'tx-1',
          seq: 1n,
          amount: 6,
          balanceBefore: 0,
          balanceAfter: 6,
          type: PointTransactionType.VOLUNTARY_TASK_REWARD,
          taskAssignmentId: null,
          assignmentKind: null,
        }),
      ],
      members: [{ memberId: ANNA, pointsCache: 6 }],
    });
    expect(kinds(report)).toContain('ORPHAN_WORK_TX');
  });

  it('BALANCE_BELOW_MINIMUM is a warning, not a violation', () => {
    // A config change can legitimately raise minimumBalance above an existing
    // balance, so this must not fail an otherwise sound ledger.
    const report = verifyLedgerIntegrity({
      entries: [entry({ id: 'tx-1', seq: 1n, amount: -5, balanceBefore: 0, balanceAfter: -5 })],
      members: [{ memberId: ANNA, pointsCache: -5 }],
      minimumBalance: 0,
    });
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.warnings.map((w) => w.kind)).toContain('BALANCE_BELOW_MINIMUM');
  });
});

describe('derived balances (§8.4)', () => {
  it('sums a member ledger', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 10, type: PointTransactionType.MANUAL_ADJUSTMENT });
    ledger.post({ memberId: ANNA, amount: -4, type: PointTransactionType.PENALTY });
    expect(balanceFromEntries(ledger.entriesFor(ANNA))).toBe(6);
  });

  it('recomputes every balance from the ledger — what repairCache writes', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 10, type: PointTransactionType.MANUAL_ADJUSTMENT });
    ledger.post({ memberId: PAUL, amount: 3, type: PointTransactionType.BONUS });
    ledger.post({ memberId: ANNA, amount: -4, type: PointTransactionType.PENALTY });

    const balances = recomputeBalances(ledger.snapshot([ANNA, PAUL]).entries);
    expect(balances.get(ANNA as never)).toBe(6);
    expect(balances.get(PAUL as never)).toBe(3);
  });
});
