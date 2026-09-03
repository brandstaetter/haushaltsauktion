/**
 * Read models (Architektur §3.4, §3.6, §3.7, §3.8, §3.9).
 *
 * Every query in here takes `householdId` as its first predicate — that is the
 * mechanical half of §36's "kein Zugriff auf fremde Haushalte", checked by the
 * `household-scope` lint rule (§7.4) rather than by review.
 *
 * Pagination is cursor-based on `seq` (§3.1): a monotonic integer that
 * `createdAt` can tie on but `seq` cannot, so a page boundary can never drop or
 * duplicate an event.
 */

import type {
  CursorPage,
  HistoryEventDto,
  MemberDto,
  MemberEffectDto,
  PointTransactionDto,
  SelectionExplanationDto,
  SelectionTrace,
} from '@haushaltsauktion/shared';

import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { PrismaTx } from '../deps.js';
import { listAssignedToMe, listAvailableTasks, type ViewerContext } from './taskDto.js';

// ───────────────────────── cursors ─────────────────────────

export function encodeCursor(seq: bigint): string {
  return Buffer.from(String(seq), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): bigint | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const value = BigInt(decoded);
    return value >= 0n ? value : null;
  } catch {
    return null;
  }
}

/**
 * Slice one page off an over-fetched result, then map. Mapping *after* the
 * slice keeps the cursor derived from the database row rather than from a DTO
 * that has already stringified `seq` for the wire.
 */
function page<Row, Dto>(
  rows: Row[],
  limit: number,
  seqOf: (row: Row) => bigint,
  toDto: (row: Row) => Dto,
): CursorPage<Dto> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(toDto),
    nextCursor: hasMore && last !== undefined ? encodeCursor(seqOf(last)) : null,
  };
}

// ───────────────────────── members and points (§3.7) ─────────────────────────

export async function listMembers(tx: PrismaTx, householdId: string): Promise<MemberDto[]> {
  const rows = await tx.householdMember.findMany({
    where: { householdId },
    orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      isActive: true,
      pointsCache: true,
      maxRandomAssignmentsPerWeek: true,
    },
  });
  return rows.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    role: m.role,
    isActive: m.isActive,
    // Derived from the ledger (§8.4). Repairable, never authoritative.
    balance: m.pointsCache,
    maxRandomAssignmentsPerWeek: m.maxRandomAssignmentsPerWeek,
  }));
}

export async function listPointTransactions(
  tx: PrismaTx,
  householdId: string,
  memberId: string,
  opts: { cursor?: string | undefined; limit?: number | undefined } = {},
): Promise<CursorPage<PointTransactionDto>> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const before = decodeCursor(opts.cursor);

  const rows = await tx.pointTransaction.findMany({
    where: {
      householdId,
      memberId,
      ...(before === null ? {} : { seq: { lt: before } }),
    },
    orderBy: { seq: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      seq: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      type: true,
      taskInstanceId: true,
      taskAssignmentId: true,
      description: true,
      createdAt: true,
      instance: { select: { definition: { select: { title: true } } } },
      initiator: { select: { id: true, displayName: true } },
    },
  });

  return page<(typeof rows)[number], PointTransactionDto>(
    rows,
    limit,
    (r) => r.seq,
    (r) => ({
      id: r.id,
      seq: String(r.seq),
      amount: r.amount,
      balanceBefore: r.balanceBefore,
      balanceAfter: r.balanceAfter,
      type: r.type,
      taskInstanceId: r.taskInstanceId,
      taskInstanceTitle: r.instance?.definition.title ?? null,
      taskAssignmentId: r.taskAssignmentId,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      initiator: r.initiator
        ? { memberId: r.initiator.id, displayName: r.initiator.displayName }
        : null,
    }),
  );
}

// ───────────────────────── history (§3.8) ─────────────────────────

export interface HistoryFilter {
  taskInstanceId?: string | undefined;
  taskDefinitionId?: string | undefined;
  memberId?: string | undefined;
  types?: string[] | undefined;
  since?: Date | undefined;
  until?: Date | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export async function listHistory(
  tx: PrismaTx,
  householdId: string,
  filter: HistoryFilter = {},
): Promise<CursorPage<HistoryEventDto>> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
  const before = decodeCursor(filter.cursor);

  const rows = await tx.taskHistoryEvent.findMany({
    where: {
      householdId,
      ...(filter.taskInstanceId ? { taskInstanceId: filter.taskInstanceId } : {}),
      ...(filter.taskDefinitionId
        ? { instance: { taskDefinitionId: filter.taskDefinitionId } }
        : {}),
      ...(filter.memberId ? { memberId: filter.memberId } : {}),
      ...(filter.types && filter.types.length > 0 ? { type: { in: filter.types as never } } : {}),
      ...(filter.since || filter.until
        ? {
            createdAt: {
              ...(filter.since ? { gte: filter.since } : {}),
              ...(filter.until ? { lte: filter.until } : {}),
            },
          }
        : {}),
      ...(before === null ? {} : { seq: { lt: before } }),
    },
    orderBy: { seq: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      seq: true,
      type: true,
      payload: true,
      createdAt: true,
      taskInstanceId: true,
      instance: { select: { definition: { select: { title: true } } } },
      member: { select: { id: true, displayName: true } },
    },
  });

  return page<(typeof rows)[number], HistoryEventDto>(
    rows,
    limit,
    (r) => r.seq,
    (r) =>
      // `HistoryEventDto` is a discriminated union of (type, payload) pairs
      // (§2.6). The database column is untyped JSON, so the narrowing happens
      // at the boundary here rather than being faked row by row.
      ({
        id: r.id,
        seq: String(r.seq),
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        taskInstanceId: r.taskInstanceId,
        taskTitle: r.instance.definition.title,
        member: r.member ? { id: r.member.id, displayName: r.member.displayName } : null,
        payload: r.payload,
      }) as unknown as HistoryEventDto,
  );
}

// ───────────────────────── notifications (§3.9) ─────────────────────────

export interface NotificationRow {
  id: string;
  type: string;
  payload: unknown;
  taskInstanceId: string | null;
  taskTitle: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function listNotifications(
  tx: PrismaTx,
  householdId: string,
  memberId: string,
  opts: { unreadOnly?: boolean; cursor?: string | undefined; limit?: number | undefined } = {},
): Promise<{ items: NotificationRow[]; unreadCount: number; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const beforeDate = opts.cursor
    ? new Date(Buffer.from(opts.cursor, 'base64url').toString('utf8'))
    : null;

  const [rows, unreadCount] = await Promise.all([
    tx.notification.findMany({
      where: {
        householdId,
        memberId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
        ...(beforeDate === null ? {} : { createdAt: { lt: beforeDate } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      // Same join `listHistory` already uses for `taskTitle` — without it,
      // the payload only carries `taskInstanceId`, and a notification that
      // can't say *which* chore it's about isn't useful (§24).
      include: { instance: { select: { definition: { select: { title: true } } } } },
    }),
    tx.notification.count({ where: { householdId, memberId, readAt: null } }),
  ]);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];

  return {
    items: slice.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      taskInstanceId: n.taskInstanceId,
      taskTitle: n.instance?.definition.title ?? null,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
    nextCursor:
      hasMore && last !== undefined
        ? Buffer.from(last.createdAt.toISOString(), 'utf8').toString('base64url')
        : null,
  };
}

// ───────────────────────── fairness transparency (§3.6) ─────────────────────────

/**
 * "Warum wurde mir diese Aufgabe zugewiesen?" (§32)
 *
 * Answered from the trace stored **at assignment time**, so it stays true after
 * the weights change. The raw draw is deliberately absent: §32 says the random
 * number need not be shown, and leaving it out keeps the view about fairness
 * rather than about second-guessing the dice. It is in the audit event for an
 * admin who needs to replay a selection exactly.
 */
export async function explainAssignment(
  tx: PrismaTx,
  householdId: string,
  assignmentId: string,
): Promise<SelectionExplanationDto> {
  const assignment = await tx.taskAssignment.findFirst({
    where: { id: assignmentId, householdId },
    select: { id: true, kind: true, selectionTrace: true, assignedAt: true, configVersion: true },
  });
  if (assignment === null) throw new NotFoundError('Zuweisung nicht gefunden.');
  if (assignment.kind !== 'RANDOM' || assignment.selectionTrace === null) {
    throw new ConflictError(
      'NOT_RANDOM_ASSIGNMENT',
      'Nur zufällige Zuweisungen haben eine Auswahlbegründung.',
      { kind: assignment.kind },
    );
  }

  const trace = assignment.selectionTrace as unknown as SelectionTrace;
  const names = await tx.householdMember.findMany({
    where: { householdId, id: { in: trace.candidates.map((c) => c.memberId) } },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(names.map((n) => [n.id, n.displayName]));

  return {
    assignmentId: assignment.id,
    strategy: trace.strategy,
    decidedAt: trace.decidedAt,
    configVersion: trace.configVersion,
    eligibleCount: trace.candidates.filter((c) => c.included).length,
    constraintsRelaxed: trace.constraintsRelaxed,
    candidates: trace.candidates.map((c) => ({
      memberId: c.memberId,
      displayName: nameById.get(c.memberId) ?? '',
      included: c.included,
      exclusionReason: c.exclusionReason,
      weightTerms: c.weightTerms,
      weight: c.weight,
      probability: c.probability,
      selected: c.selected,
    })),
  };
}

// ───────────────────────── dashboard (§3.4, §19) ─────────────────────────

export interface DashboardDto {
  me: {
    memberId: string;
    displayName: string;
    balance: number;
    assigned: Awaited<ReturnType<typeof listAssignedToMe>>;
    available: Awaited<ReturnType<typeof listAvailableTasks>>;
    /**
     * §31 / §6.12 (intake "points-shop-virtual-gamification-items") — the
     * member's active potion effects, so remaining time/charges are visible
     * before they act, not just discoverable after the fact.
     */
    activeEffects: MemberEffectDto[];
  };
  family: {
    members: MemberDto[];
    openTasks: Awaited<ReturnType<typeof listAvailableTasks>>;
    recentlyCompleted: Array<{
      id: string;
      title: string;
      completedAt: string;
      completedBy: string | null;
      completedByMemberId: string | null;
      value: number;
      /** From the ledger, not recomputed — 0 when nothing was ever paid (§7, §44). */
      pointsAwarded: number;
      /** An admin judged this completion unsatisfactory (§32-adjacent moderation). */
      rejected: boolean;
    }>;
  };
}

/** One round trip for §19's phone-first start screen. */
export async function loadDashboard(
  tx: PrismaTx,
  ctx: ViewerContext,
): Promise<DashboardDto> {
  const member = await tx.householdMember.findFirst({
    where: { id: ctx.memberId, householdId: ctx.householdId },
    select: { displayName: true, pointsCache: true },
  });
  if (member === null) throw new NotFoundError('Mitglied nicht gefunden.');

  const [assigned, available, members, activeEffectRows, completed] = await Promise.all([
    listAssignedToMe(tx, ctx, member.pointsCache),
    listAvailableTasks(tx, ctx),
    listMembers(tx, ctx.householdId),
    // §6.12 — "active" mirrors the eligibility read in `candidates.ts`:
    // expiresAt > now, plus (for MULTIPLIER) non-exhausted charges. A
    // MULTIPLIER row that hit 0 charges is `consumedAt`-marked but not
    // deleted (audit trail), so it must not be shown as still usable.
    tx.memberEffect.findMany({
      where: {
        householdId: ctx.householdId,
        memberId: ctx.memberId,
        expiresAt: { gt: ctx.now },
        OR: [{ type: { not: 'MULTIPLIER' } }, { chargesRemaining: { gt: 0 } }],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        multiplierValue: true,
        chargesRemaining: true,
        expiresAt: true,
        // §31 — "n von total" needs the item's original charge count; the
        // effect row only ever tracks what remains.
        redemption: { select: { reward: { select: { effectCharges: true } } } },
      },
    }),
    tx.taskInstance.findMany({
      where: { householdId: ctx.householdId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        completedAt: true,
        currentValue: true,
        completedByMemberId: true,
        definition: { select: { title: true } },
        completedBy: { select: { displayName: true } },
        // At most one assignment per instance ever reaches COMPLETED or
        // REJECTED — the state machine is terminal, so completion happens
        // once (§2.1).
        assignments: {
          where: { status: { in: ['COMPLETED', 'REJECTED'] } },
          select: { status: true },
          take: 1,
        },
        // At most one reward per instance for the same reason — 0 for a
        // RANDOM completion, which never earns one (§7, §44).
        transactions: {
          where: { type: 'VOLUNTARY_TASK_REWARD' },
          select: { amount: true },
          take: 1,
        },
      },
    }),
  ]);

  // "Active" (§6.12) is already the query predicate above — nothing left to
  // filter here, just shape the DTO.
  const activeEffects: MemberEffectDto[] = activeEffectRows.map((e) => ({
    id: e.id,
    type: e.type as 'IMMUNITY' | 'MULTIPLIER',
    multiplierValue: e.multiplierValue,
    chargesRemaining: e.chargesRemaining,
    totalCharges: e.redemption.reward.effectCharges,
    expiresAt: e.expiresAt.toISOString(),
  }));

  return {
    me: {
      memberId: ctx.memberId,
      displayName: member.displayName,
      balance: member.pointsCache,
      assigned,
      available: available.filter((t) => t.canVolunteer),
      activeEffects,
    },
    family: {
      members,
      openTasks: available,
      recentlyCompleted: completed.map((c) => ({
        id: c.id,
        title: c.definition.title,
        completedAt: c.completedAt?.toISOString() ?? '',
        completedBy: c.completedBy?.displayName ?? null,
        completedByMemberId: c.completedByMemberId,
        value: c.currentValue,
        pointsAwarded: c.transactions[0]?.amount ?? 0,
        rejected: c.assignments[0]?.status === 'REJECTED',
      })),
    },
  };
}
