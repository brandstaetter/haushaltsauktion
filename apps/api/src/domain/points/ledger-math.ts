/**
 * Ledger arithmetic and integrity (Architektur §8; CLAUDE.md §14, §44).
 *
 * The ledger is the source of truth for every balance; `pointsCache` is a
 * derived read cache. For every member, ordered by `seq`:
 *
 *   t[0].balanceBefore = 0
 *   t[i].balanceBefore = t[i-1].balanceAfter              (chain)
 *   t[i].balanceAfter  = t[i].balanceBefore + t[i].amount (arithmetic)
 *   member.pointsCache = t[last].balanceAfter = Σ amount  (cache)
 *
 * Everything in this module is pure and works on already-loaded rows, so the
 * whole verification can be exercised against a synthetic ledger with no
 * database. `app/points/verifyLedgerIntegrity.ts` streams the real rows out of
 * Prisma and hands them to `verifyLedgerIntegrity` below.
 */

import {
  AssignmentKind,
  GENESIS,
  PointTransactionType,
  type MemberId,
} from '@haushaltsauktion/shared';

import { ConflictError } from '../errors.js';

export interface LedgerEntry {
  id: string;
  /** Global monotonic order. `createdAt` can tie; `seq` cannot. */
  seq: bigint;
  memberId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: PointTransactionType;
  /** `'GENESIS'` for a member's first entry, otherwise the previous entry's id. */
  previousTransactionId: string;
  taskAssignmentId: string | null;
  assignmentKind: AssignmentKind | null;
  /** Punkte-Shop (intake "points-shop-real-life-rewards"). */
  rewardRedemptionId: string | null;
}

export interface LedgerMemberSnapshot {
  memberId: string;
  pointsCache: number;
}

export type LedgerViolation =
  | { kind: 'CACHE_MISMATCH'; memberId: string; cachedBalance: number; ledgerSum: number }
  | {
      kind: 'CHAIN_BREAK';
      memberId: string;
      transactionId: string;
      expectedBalanceBefore: number;
      actualBalanceBefore: number;
    }
  | {
      kind: 'CHAIN_FORK';
      memberId: string;
      previousTransactionId: string;
      transactionIds: string[];
    }
  | { kind: 'MULTIPLE_GENESIS'; memberId: string; transactionIds: string[] }
  | {
      kind: 'ARITHMETIC_BREAK';
      transactionId: string;
      balanceBefore: number;
      amount: number;
      balanceAfter: number;
    }
  | { kind: 'SIGN_VIOLATION'; transactionId: string; type: PointTransactionType; amount: number }
  | { kind: 'ZERO_AMOUNT'; transactionId: string }
  | { kind: 'REWARD_ON_RANDOM'; transactionId: string; assignmentId: string }
  | { kind: 'STREAK_BONUS_ON_RANDOM'; transactionId: string; assignmentId: string }
  | { kind: 'DUPLICATE_REWARD'; assignmentId: string; transactionIds: string[] }
  | { kind: 'DUPLICATE_BUYOUT'; assignmentId: string; transactionIds: string[] }
  | { kind: 'DUPLICATE_STREAK_BONUS'; assignmentId: string; transactionIds: string[] }
  | { kind: 'DUPLICATE_REDEMPTION_DEBIT'; redemptionId: string; transactionIds: string[] }
  | { kind: 'ORPHAN_WORK_TX'; transactionId: string; type: PointTransactionType }
  | { kind: 'ORPHAN_REDEMPTION_TX'; transactionId: string }
  | {
      kind: 'BALANCE_BELOW_MINIMUM';
      memberId: string;
      balance: number;
      minimumBalance: number;
    };

export interface LedgerIntegrityFindings {
  memberCount: number;
  transactionCount: number;
  violations: LedgerViolation[];
  /** Config-dependent findings that a legitimate config change can produce. */
  warnings: LedgerViolation[];
  ok: boolean;
}

export interface LedgerIntegrityReport extends LedgerIntegrityFindings {
  checkedAt: string;
  householdId: string | null;
  durationMs: number;
}

export interface LedgerSnapshot {
  entries: readonly LedgerEntry[];
  members: readonly LedgerMemberSnapshot[];
  /** When set, a balance below it is reported as a *warning*, not a violation. */
  minimumBalance?: number;
}

// ───────────────────────── posting arithmetic (§8.2) ─────────────────────────

export interface PostingInput {
  balanceBefore: number;
  amount: number;
  type: PointTransactionType;
  taskAssignmentId?: string | null;
  assignmentKind?: AssignmentKind | null;
  /** Punkte-Shop (intake "points-shop-real-life-rewards"). */
  rewardRedemptionId?: string | null;
}

export interface Posting {
  balanceBefore: number;
  balanceAfter: number;
  amount: number;
}

/** The sign rules the database enforces as CHECK constraints (§1.5). */
export function signRuleViolated(type: PointTransactionType, amount: number): boolean {
  if (type === PointTransactionType.BUYOUT) return !(amount < 0);
  if (type === PointTransactionType.VOLUNTARY_TASK_REWARD) return !(amount > 0);
  if (type === PointTransactionType.STREAK_BONUS) return !(amount > 0);
  if (type === PointTransactionType.DECAY) return !(amount <= 0);
  if (type === PointTransactionType.REWARD_REDEMPTION) return !(amount < 0);
  return false;
}

/**
 * The arithmetic every ledger write goes through (§8.2 steps 1 and 3).
 *
 * It restates in code the constraints the database enforces in SQL, so a
 * violation surfaces as a clear domain error at the call site instead of as a
 * raw SQLSTATE from Postgres. The database remains the real barrier — this is
 * the readable one.
 */
export function computePosting(input: PostingInput): Posting {
  if (!Number.isInteger(input.amount)) {
    throw new ConflictError('INTERNAL_ERROR', 'Punktebeträge müssen ganzzahlig sein.');
  }
  // §8.2 step 1: a zero entry would blur §7's "no points" — which is the
  // ABSENCE of a row — with a real event.
  if (input.amount === 0) {
    throw new ConflictError('INTERNAL_ERROR', 'Eine Punktebuchung über 0 ist nicht zulässig.');
  }
  if (signRuleViolated(input.type, input.amount)) {
    throw new ConflictError(
      'INTERNAL_ERROR',
      `Betrag ${input.amount} verletzt die Vorzeichenregel für ${input.type}.`,
    );
  }
  // §44: a reward — ordinary or streak — can only ever attach to a voluntary
  // assignment. Same discipline as `voluntaryReward`/`applyCompletionToStreak`:
  // no configuration can make a RANDOM completion pay.
  if (
    (input.type === PointTransactionType.VOLUNTARY_TASK_REWARD ||
      input.type === PointTransactionType.STREAK_BONUS) &&
    input.assignmentKind !== AssignmentKind.VOLUNTARY
  ) {
    throw new ConflictError(
      'INTERNAL_ERROR',
      'Eine Belohnung darf nur an eine freiwillige Übernahme gebucht werden.',
    );
  }
  if (
    (input.type === PointTransactionType.VOLUNTARY_TASK_REWARD ||
      input.type === PointTransactionType.BUYOUT ||
      input.type === PointTransactionType.STREAK_BONUS) &&
    !input.taskAssignmentId
  ) {
    throw new ConflictError(
      'INTERNAL_ERROR',
      `${input.type} muss die zugehörige Zuweisung benennen.`,
    );
  }
  // Punkte-Shop: eine Einlösung ist keine TaskAssignment-Zeile, deshalb ein
  // eigenständiges Feld statt einer Wiederverwendung von taskAssignmentId.
  if (input.type === PointTransactionType.REWARD_REDEMPTION && !input.rewardRedemptionId) {
    throw new ConflictError(
      'INTERNAL_ERROR',
      `${input.type} muss die zugehörige Einlösung benennen.`,
    );
  }

  return {
    balanceBefore: input.balanceBefore,
    balanceAfter: input.balanceBefore + input.amount,
    amount: input.amount,
  };
}

/** §8.2 step 4 — `'GENESIS'` is a literal, never NULL (§8.3). */
export function previousTransactionIdFor(tail: { id: string } | null | undefined): string {
  return tail ? tail.id : GENESIS;
}

/** The balance implied by a member's ledger, independent of the cache. */
export function balanceFromEntries(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

// ───────────────────────── verification (§8.5) ─────────────────────────

function byMember(entries: readonly LedgerEntry[]): Map<string, LedgerEntry[]> {
  const map = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.memberId);
    if (list) list.push(entry);
    else map.set(entry.memberId, [entry]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  }
  return map;
}

/**
 * Walk every member's chain once — O(total transactions), no per-row query.
 *
 * The ledger itself is never auto-corrected here. The only remedy for a bad
 * entry is a compensating `CORRECTION` transaction, which is itself an audited
 * ledger row (§14); the only thing repair may touch is the cache (§8.5).
 */
export function verifyLedgerIntegrity(snapshot: LedgerSnapshot): LedgerIntegrityFindings {
  const violations: LedgerViolation[] = [];
  const warnings: LedgerViolation[] = [];

  const grouped = byMember(snapshot.entries);
  const cacheByMember = new Map(snapshot.members.map((m) => [m.memberId, m.pointsCache]));

  // Per-assignment duplicate detection spans members, so it is collected first.
  const rewardsByAssignment = new Map<string, string[]>();
  const buyoutsByAssignment = new Map<string, string[]>();
  const streakBonusesByAssignment = new Map<string, string[]>();
  const redemptionDebitsByRedemption = new Map<string, string[]>();

  for (const entry of snapshot.entries) {
    if (entry.amount === 0) violations.push({ kind: 'ZERO_AMOUNT', transactionId: entry.id });

    if (entry.balanceAfter !== entry.balanceBefore + entry.amount) {
      violations.push({
        kind: 'ARITHMETIC_BREAK',
        transactionId: entry.id,
        balanceBefore: entry.balanceBefore,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
      });
    }

    if (signRuleViolated(entry.type, entry.amount)) {
      violations.push({
        kind: 'SIGN_VIOLATION',
        transactionId: entry.id,
        type: entry.type,
        amount: entry.amount,
      });
    }

    const isWorkTx =
      entry.type === PointTransactionType.VOLUNTARY_TASK_REWARD ||
      entry.type === PointTransactionType.BUYOUT ||
      entry.type === PointTransactionType.STREAK_BONUS;

    if (isWorkTx && entry.taskAssignmentId === null) {
      violations.push({ kind: 'ORPHAN_WORK_TX', transactionId: entry.id, type: entry.type });
    }

    if (
      entry.type === PointTransactionType.REWARD_REDEMPTION &&
      entry.rewardRedemptionId === null
    ) {
      violations.push({ kind: 'ORPHAN_REDEMPTION_TX', transactionId: entry.id });
    }

    // §44's headline invariant, checked from the data rather than trusted —
    // for the streak bonus exactly as much as for the ordinary reward.
    if (
      entry.type === PointTransactionType.VOLUNTARY_TASK_REWARD &&
      entry.assignmentKind !== AssignmentKind.VOLUNTARY
    ) {
      violations.push({
        kind: 'REWARD_ON_RANDOM',
        transactionId: entry.id,
        assignmentId: entry.taskAssignmentId ?? '(none)',
      });
    }
    if (
      entry.type === PointTransactionType.STREAK_BONUS &&
      entry.assignmentKind !== AssignmentKind.VOLUNTARY
    ) {
      violations.push({
        kind: 'STREAK_BONUS_ON_RANDOM',
        transactionId: entry.id,
        assignmentId: entry.taskAssignmentId ?? '(none)',
      });
    }

    if (entry.taskAssignmentId !== null) {
      const bucket =
        entry.type === PointTransactionType.VOLUNTARY_TASK_REWARD
          ? rewardsByAssignment
          : entry.type === PointTransactionType.BUYOUT
            ? buyoutsByAssignment
            : entry.type === PointTransactionType.STREAK_BONUS
              ? streakBonusesByAssignment
              : null;
      if (bucket) {
        const ids = bucket.get(entry.taskAssignmentId);
        if (ids) ids.push(entry.id);
        else bucket.set(entry.taskAssignmentId, [entry.id]);
      }
    }

    if (
      entry.type === PointTransactionType.REWARD_REDEMPTION &&
      entry.rewardRedemptionId !== null
    ) {
      const ids = redemptionDebitsByRedemption.get(entry.rewardRedemptionId);
      if (ids) ids.push(entry.id);
      else redemptionDebitsByRedemption.set(entry.rewardRedemptionId, [entry.id]);
    }
  }

  for (const [assignmentId, transactionIds] of rewardsByAssignment) {
    if (transactionIds.length > 1) {
      violations.push({ kind: 'DUPLICATE_REWARD', assignmentId, transactionIds });
    }
  }
  for (const [assignmentId, transactionIds] of buyoutsByAssignment) {
    if (transactionIds.length > 1) {
      violations.push({ kind: 'DUPLICATE_BUYOUT', assignmentId, transactionIds });
    }
  }
  for (const [assignmentId, transactionIds] of streakBonusesByAssignment) {
    if (transactionIds.length > 1) {
      violations.push({ kind: 'DUPLICATE_STREAK_BONUS', assignmentId, transactionIds });
    }
  }
  for (const [redemptionId, transactionIds] of redemptionDebitsByRedemption) {
    if (transactionIds.length > 1) {
      violations.push({ kind: 'DUPLICATE_REDEMPTION_DEBIT', redemptionId, transactionIds });
    }
  }

  // Every member with a cache row is checked, even one with no transactions —
  // a non-zero cache on an empty ledger is exactly the drift worth catching.
  const memberIds = new Set<string>([...grouped.keys(), ...cacheByMember.keys()]);

  for (const memberId of memberIds) {
    const entries = grouped.get(memberId) ?? [];

    const genesisIds = entries.filter((e) => e.previousTransactionId === GENESIS).map((e) => e.id);
    if (genesisIds.length > 1) {
      violations.push({ kind: 'MULTIPLE_GENESIS', memberId, transactionIds: genesisIds });
    }

    const byPrevious = new Map<string, string[]>();
    for (const entry of entries) {
      const ids = byPrevious.get(entry.previousTransactionId);
      if (ids) ids.push(entry.id);
      else byPrevious.set(entry.previousTransactionId, [entry.id]);
    }
    for (const [previousTransactionId, transactionIds] of byPrevious) {
      if (transactionIds.length > 1) {
        violations.push({ kind: 'CHAIN_FORK', memberId, previousTransactionId, transactionIds });
      }
    }

    let expected = 0;
    for (const entry of entries) {
      if (entry.balanceBefore !== expected) {
        violations.push({
          kind: 'CHAIN_BREAK',
          memberId,
          transactionId: entry.id,
          expectedBalanceBefore: expected,
          actualBalanceBefore: entry.balanceBefore,
        });
      }
      expected = entry.balanceAfter;
    }

    const ledgerSum = balanceFromEntries(entries);
    const cachedBalance = cacheByMember.get(memberId);
    if (cachedBalance !== undefined && cachedBalance !== ledgerSum) {
      violations.push({ kind: 'CACHE_MISMATCH', memberId, cachedBalance, ledgerSum });
    }

    if (snapshot.minimumBalance !== undefined && ledgerSum < snapshot.minimumBalance) {
      // A warning, not a violation: raising `minimumBalance` can legitimately
      // leave an existing balance below it.
      warnings.push({
        kind: 'BALANCE_BELOW_MINIMUM',
        memberId,
        balance: ledgerSum,
        minimumBalance: snapshot.minimumBalance,
      });
    }
  }

  return {
    memberCount: memberIds.size,
    transactionCount: snapshot.entries.length,
    violations,
    warnings,
    ok: violations.length === 0,
  };
}

/** Balances recomputed from the ledger — what `repairCache` writes (§8.5). */
export function recomputeBalances(entries: readonly LedgerEntry[]): Map<MemberId, number> {
  const balances = new Map<MemberId, number>();
  for (const entry of entries) {
    const key = entry.memberId as MemberId;
    balances.set(key, (balances.get(key) ?? 0) + entry.amount);
  }
  return balances;
}
