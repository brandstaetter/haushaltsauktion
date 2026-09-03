/**
 * Turning database rows into the pure inputs of §6.8 and §6.9.
 *
 * The domain's `EligibilityCandidate` and `FairnessMetrics` are plain numbers
 * and booleans — "is absent", not "has an absence window covering now". This
 * file is where the clock, the timezone and the ISO week (§5.6) are resolved,
 * so `domain/` stays free of `Date` and of Prisma.
 */

import { weekKey, type FairnessMetrics, type HouseholdConfig } from '@haushaltsauktion/shared';

import type { EligibilityCandidate } from '../../domain/assignment/eligibility.js';
import type { PrismaTx } from '../deps.js';

export interface CandidateContext {
  householdId: string;
  timezone: string;
  taskDefinitionId: string;
  categoryId: string | null;
  now: Date;
  cfg: HouseholdConfig;
}

interface MemberRow {
  id: string;
  isActive: boolean;
  maxRandomAssignmentsPerWeek: number | null;
}

/** ISO week boundaries in the household timezone (§5.6, OQ-6). */
function isSameIsoWeek(a: Date, b: Date, timezone: string): boolean {
  return weekKey(a, timezone) === weekKey(b, timezone);
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 86_400_000);
}

/**
 * Load every member of the household together with the eight predicates of
 * §6.9/§6.12 and the six metrics of §6.8, computed over `cfg.fairness.windowDays`.
 *
 * One pass per relation rather than a query per member: at 1–20 members the
 * whole household is a handful of rows, and the alternative is an N+1 that
 * would make the sweep's cost depend on family size for no benefit (§43).
 */
export async function loadCandidates(
  tx: PrismaTx,
  ctx: CandidateContext,
): Promise<{ candidates: EligibilityCandidate[]; definitionHasAllowlist: boolean }> {
  const windowStart = new Date(ctx.now.getTime() - ctx.cfg.fairness.windowDays * 86_400_000);

  const members: MemberRow[] = await tx.householdMember.findMany({
    where: { householdId: ctx.householdId },
    select: { id: true, isActive: true, maxRandomAssignmentsPerWeek: true },
    orderBy: { id: 'asc' },
  });

  const [absences, immunities, taskEligibility, categoryExclusions, assignments] =
    await Promise.all([
      tx.memberAbsence.findMany({
        where: {
          householdId: ctx.householdId,
          startsAt: { lte: ctx.now },
          endsAt: { gt: ctx.now },
        },
        select: { memberId: true },
      }),
      // Rule 8 (§6.12, intake "points-shop-virtual-gamification-items").
      // Unlocked, the same discipline as the absence read above: the sweep's
      // own advisory lock (§4.2) is what matters here, not a per-member lock.
      tx.memberEffect.findMany({
        where: { householdId: ctx.householdId, type: 'IMMUNITY', expiresAt: { gt: ctx.now } },
        select: { memberId: true },
      }),
      tx.taskDefinitionEligibility.findMany({
        where: { householdId: ctx.householdId, taskDefinitionId: ctx.taskDefinitionId },
        select: { memberId: true, mode: true },
      }),
      ctx.categoryId === null
        ? Promise.resolve([] as Array<{ memberId: string }>)
        : tx.memberCategoryExclusion.findMany({
            where: { householdId: ctx.householdId, categoryId: ctx.categoryId },
            select: { memberId: true },
          }),
      // Everything the metrics need, in one read. `windowStart` bounds it, so the
      // cost is a month of household activity rather than the whole history —
      // which is the point of OQ-7's window in the first place.
      tx.taskAssignment.findMany({
        where: { householdId: ctx.householdId, assignedAt: { gte: windowStart } },
        select: {
          memberId: true,
          kind: true,
          status: true,
          assignedAt: true,
          completedAt: true,
          closedAt: true,
          taskInstanceId: true,
          instance: { select: { definition: { select: { estimatedMinutes: true } } } },
        },
      }),
    ]);

  const absentIds = new Set(absences.map((a) => a.memberId));
  const immuneIds = new Set(immunities.map((e) => e.memberId));
  const excludedFromTask = new Set(
    taskEligibility.filter((e) => e.mode === 'EXCLUDED').map((e) => e.memberId),
  );
  const allowlist = new Set(
    taskEligibility.filter((e) => e.mode === 'INCLUDED').map((e) => e.memberId),
  );
  const categoryExcluded = new Set(categoryExclusions.map((e) => e.memberId));
  const definitionHasAllowlist = allowlist.size > 0;

  // Rule 7 needs "how many completed offer cycles ago did this member last hold
  // *this task* by draw". `buyoutCount` on the instance is not that number, so
  // it is derived from the assignment history of the definition instead.
  const randomOfThisTask = await tx.taskAssignment.findMany({
    where: {
      householdId: ctx.householdId,
      kind: 'RANDOM',
      instance: { taskDefinitionId: ctx.taskDefinitionId },
    },
    orderBy: { assignedAt: 'desc' },
    select: { memberId: true },
    take: 50,
  });
  const cyclesSince = new Map<string, number>();
  randomOfThisTask.forEach((row, index) => {
    if (!cyclesSince.has(row.memberId)) cyclesSince.set(row.memberId, index);
  });

  const candidates: EligibilityCandidate[] = members.map((member) => {
    const mine = assignments.filter((a) => a.memberId === member.id);
    const randomOnes = mine.filter((a) => a.kind === 'RANDOM');
    const lastRandom = randomOnes.reduce<Date | null>(
      (latest, a) => (latest === null || a.assignedAt > latest ? a.assignedAt : latest),
      null,
    );
    const completed = mine.filter((a) => a.status === 'COMPLETED');

    const metrics: FairnessMetrics = {
      randomAssignments: randomOnes.length,
      voluntaryCompletions: completed.filter((a) => a.kind === 'VOLUNTARY').length,
      buyouts: mine.filter((a) => a.status === 'BOUGHT_OUT').length,
      completedTasks: completed.length,
      totalEstimatedMinutes: completed.reduce(
        (sum, a) => sum + (a.instance.definition.estimatedMinutes ?? 0),
        0,
      ),
      // §6.8: a member with no history in the window is not penalized for it —
      // `windowDays` makes their recency factor ~0 rather than 1.
      daysSinceLastRandomAssignment:
        lastRandom === null
          ? ctx.cfg.fairness.windowDays
          : daysBetween(lastRandom, ctx.now),
    };

    return {
      memberId: member.id,
      isActive: member.isActive,
      isAbsent: absentIds.has(member.id),
      hasActiveImmunity: immuneIds.has(member.id),
      excludedFromTask: excludedFromTask.has(member.id),
      inAllowlist: !definitionHasAllowlist || allowlist.has(member.id),
      categoryExcluded: categoryExcluded.has(member.id),
      randomAssignmentsThisWeek: randomOnes.filter((a) =>
        isSameIsoWeek(a.assignedAt, ctx.now, ctx.timezone),
      ).length,
      maxRandomAssignmentsPerWeek: member.maxRandomAssignmentsPerWeek,
      cyclesSinceLastRandomAssignmentOfTask: cyclesSince.get(member.id) ?? null,
      metrics,
    };
  });

  return { candidates, definitionHasAllowlist };
}

/**
 * The single-member form used by `volunteerForTask` and by the `canVolunteer`
 * flag on every task DTO. Only rules 1–5 are consulted there (§6.9), so the
 * soft fields are filled with values that cannot block.
 */
export async function loadVolunteerCandidate(
  tx: PrismaTx,
  ctx: CandidateContext,
  memberId: string,
): Promise<{ candidate: EligibilityCandidate; definitionHasAllowlist: boolean } | null> {
  const { candidates, definitionHasAllowlist } = await loadCandidates(tx, ctx);
  const candidate = candidates.find((c) => c.memberId === memberId);
  if (candidate === undefined) return null;
  return { candidate, definitionHasAllowlist };
}
