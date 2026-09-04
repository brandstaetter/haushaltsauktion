/**
 * DTO builders (Architektur §3.4, §3.5).
 *
 * Every binding number a client sees is produced here, server-side, from the
 * configuration the server itself computes with (§36). `potentialReward`,
 * `rewardOnCompletion` and the whole buyout quote are values the client
 * *displays*; it never derives one, and the only number it may send back is an
 * echo the server re-derives and compares (§3.5).
 */

import type {
  AssignedTaskDto,
  AssignmentSummaryDto,
  AvailableTaskDto,
  HouseholdTaskDto,
  MemberRefDto,
  TaskInstanceDetailDto,
} from '@haushaltsauktion/shared';
import { AssignmentKind, type HouseholdConfig } from '@haushaltsauktion/shared';

import { canVolunteer, hardEligibilityReason } from '../../domain/assignment/eligibility.js';
import { potentialVoluntaryReward, voluntaryReward } from '../../domain/task/value.js';
import type { PrismaTx } from '../deps.js';
import { loadCandidates } from '../assignment/candidates.js';
import { buildQuote, loadQuoteCounters } from '../buyout/quote.js';
import { loadConfigVersion, loadCurrentConfig } from '../config/load.js';

export interface ViewerContext {
  householdId: string;
  memberId: string;
  timezone: string;
  now: Date;
}

const INSTANCE_INCLUDE = {
  definition: {
    select: {
      id: true,
      title: true,
      description: true,
      estimatedMinutes: true,
      buyoutEnabled: true,
      categoryId: true,
      // Intake "task-role-based-eligibility-and-preferred-assignee":
      // consulted by viewerEligibility below so the DTO's canVolunteer flag
      // reflects a role-restricted task, not just the pre-existing rules.
      requiredRole: true,
      category: { select: { id: true, name: true, colorHex: true } },
    },
  },
  completedBy: { select: { id: true, displayName: true, avatarUrl: true } },
  assignments: {
    where: { status: 'ACTIVE' as const },
    // Multi-worker-tasks (Phase 3): deterministic slot order so "the first
    // active assignment" (kept for backward compatibility, see
    // `TaskInstanceDetailDto.activeAssignment`) always means the lowest slot,
    // not database insertion order.
    orderBy: { slotIndex: 'asc' as const },
    select: {
      id: true,
      kind: true,
      status: true,
      response: true,
      assignedAt: true,
      valueAtAssignment: true,
      configVersion: true,
      memberId: true,
      slotIndex: true,
      // Additive: `toAssignmentSummary` still reads `memberId` only. Joined
      // here (same shape as admin.ts's `/admin/task-definitions/:id` instance
      // list) so the household-wide view can show a name without a second
      // per-instance member lookup.
      member: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  },
} as const;

async function findInstance(tx: PrismaTx, householdId: string, instanceId: string) {
  return tx.taskInstance.findFirst({
    where: { id: instanceId, householdId },
    include: INSTANCE_INCLUDE,
  });
}

type LoadedInstance = NonNullable<Awaited<ReturnType<typeof findInstance>>>;

function isOverdue(row: { dueAt: Date | null; status: string }, now: Date): boolean {
  // §1.4 — derivable, so it is derived. Persisting it would double every
  // transition in §2 and add a background job whose only output is a badge.
  if (row.dueAt === null) return false;
  if (row.status !== 'AVAILABLE' && row.status !== 'ASSIGNED') return false;
  return row.dueAt.getTime() < now.getTime();
}

/**
 * The eligibility flags and the potential reward for one viewer.
 *
 * Loading the whole candidate set to answer a question about one member looks
 * wasteful, but the household is at most 20 rows (§43) and it keeps a single
 * implementation of §6.9 rather than a "just for the DTO" second copy that
 * could disagree with the one the mutation enforces.
 */
async function viewerEligibility(
  tx: PrismaTx,
  ctx: ViewerContext,
  instance: LoadedInstance,
  cfg: HouseholdConfig,
): Promise<{ canVolunteer: boolean; reason: ReturnType<typeof hardEligibilityReason> }> {
  const { candidates, definitionHasAllowlist } = await loadCandidates(tx, {
    householdId: ctx.householdId,
    timezone: ctx.timezone,
    taskDefinitionId: instance.taskDefinitionId,
    categoryId: instance.definition.categoryId,
    now: ctx.now,
    cfg,
  });
  const mine = candidates.find((c) => c.memberId === ctx.memberId);
  if (mine === undefined) return { canVolunteer: false, reason: null };
  // `adminSlotReserved` is deliberately omitted here, same as `instanceId`
  // above: this pass is a coarse, non-instance-aware DTO hint (see this
  // function's own comment), not the authoritative gate — `volunteerForTask`
  // recomputes both freshly, and §36 makes that the binding check regardless
  // of what this flag says.
  const options = { definitionHasAllowlist, requiredRole: instance.definition.requiredRole, adminSlotReserved: false };
  return {
    canVolunteer: canVolunteer(mine, options),
    reason: hardEligibilityReason(mine, options),
  };
}

export interface TaskDtoOptions {
  /** Skip the per-task eligibility pass when the caller already knows it. */
  eligibility?: { canVolunteer: boolean; reason: ReturnType<typeof hardEligibilityReason> };
}

async function toAvailableDto(
  tx: PrismaTx,
  ctx: ViewerContext,
  instance: LoadedInstance,
  cfg: HouseholdConfig,
  options: TaskDtoOptions = {},
): Promise<AvailableTaskDto> {
  const eligibility =
    options.eligibility ?? (await viewerEligibility(tx, ctx, instance, cfg));

  return {
    id: instance.id,
    version: instance.version,
    title: instance.definition.title,
    description: instance.definition.description,
    category: instance.definition.category
      ? {
          id: instance.definition.category.id,
          name: instance.definition.category.name,
          colorHex: instance.definition.category.colorHex,
        }
      : null,
    currentValue: instance.currentValue,
    baseValue: instance.baseValue,
    buyoutCount: instance.buyoutCount,
    estimatedMinutes: instance.definition.estimatedMinutes,
    dueAt: instance.dueAt?.toISOString() ?? null,
    isOverdue: isOverdue(instance, ctx.now),
    offerExpiresAt: instance.offerExpiresAt?.toISOString() ?? null,
    status: instance.status,
    canVolunteer: instance.status === 'AVAILABLE' && eligibility.canVolunteer,
    ineligibleReason: eligibility.reason,
    potentialReward: potentialVoluntaryReward(cfg, instance.currentValue),
    workerCountMode: instance.workerCountMode,
    workerCount: instance.workerCount,
    activeSlotCount: instance.activeSlotCount,
  };
}

/**
 * The assignment block of §21's screen.
 *
 * `rewardOnCompletion` is **exactly 0** for a random assignment, computed by
 * the same `voluntaryReward` the completion transaction uses — so the number on
 * the screen and the number in the ledger cannot disagree (§7, §44).
 */
async function toAssignmentSummary(
  tx: PrismaTx,
  ctx: ViewerContext,
  instance: LoadedInstance,
  assignment: LoadedInstance['assignments'][number],
  viewerBalance: number,
): Promise<AssignmentSummaryDto> {
  // Pinned to the assignment (§5.5): the reward and the buyout price this
  // member was promised, not whatever an admin has since configured.
  const pinned = await loadConfigVersion(tx, ctx.householdId, assignment.configVersion);

  const rewardOnCompletion = voluntaryReward(pinned, {
    kind: assignment.kind,
    currentValue: instance.currentValue,
    timing: pinned.voluntary.rewardTiming,
  });

  let buyoutQuote: AssignmentSummaryDto['buyoutQuote'] = null;
  if (assignment.kind === AssignmentKind.RANDOM && assignment.memberId === ctx.memberId) {
    const counters = await loadQuoteCounters(tx, {
      householdId: ctx.householdId,
      memberId: assignment.memberId,
      timezone: ctx.timezone,
      now: ctx.now,
    });
    buyoutQuote = buildQuote(
      {
        assignmentId: assignment.id,
        kind: assignment.kind,
        assignmentStatus: assignment.status,
        memberId: assignment.memberId,
        householdId: ctx.householdId,
        currentValue: instance.currentValue,
        baseValue: instance.baseValue,
        buyoutCount: instance.buyoutCount,
        buyoutEnabledForDefinition: instance.definition.buyoutEnabled,
        balance: viewerBalance,
        configVersion: assignment.configVersion,
        cfg: pinned,
        timezone: ctx.timezone,
        now: ctx.now,
      },
      counters,
    ).dto;
  }

  return {
    id: assignment.id,
    memberId: assignment.memberId,
    kind: assignment.kind,
    response: assignment.response,
    assignedAt: assignment.assignedAt.toISOString(),
    valueAtAssignment: assignment.valueAtAssignment,
    rewardOnCompletion,
    buyoutQuote,
  };
}

export async function buildInstanceDetail(
  tx: PrismaTx,
  ctx: ViewerContext,
  instance: LoadedInstance,
  cfg: HouseholdConfig,
  viewerBalance: number,
): Promise<TaskInstanceDetailDto> {
  const base = await toAvailableDto(tx, ctx, instance, cfg);

  const completedBy: MemberRefDto | null = instance.completedBy
    ? {
        id: instance.completedBy.id,
        displayName: instance.completedBy.displayName,
        avatarUrl: instance.completedBy.avatarUrl,
      }
    : null;

  // Multi-worker-tasks (Phase 3): every currently active slot, not just the
  // first. `activeAssignment` is kept as the lowest-`slotIndex` entry — for
  // an EXACTLY(1) task that is the only slot, so existing callers see no
  // change.
  const activeAssignments = await Promise.all(
    instance.assignments.map((a) => toAssignmentSummary(tx, ctx, instance, a, viewerBalance)),
  );

  return {
    ...base,
    taskDefinitionId: instance.taskDefinitionId,
    scheduledFor: instance.scheduledFor.toISOString(),
    publishedAt: instance.publishedAt?.toISOString() ?? null,
    completedAt: instance.completedAt?.toISOString() ?? null,
    completedBy,
    activeAssignment: activeAssignments[0] ?? null,
    activeAssignments,
  };
}

/** `GET /api/tasks/:instanceId` and the `instance` field of every mutation result. */
export async function loadInstanceDetail(
  tx: PrismaTx,
  ctx: ViewerContext,
  instanceId: string,
  viewerBalance: number,
): Promise<TaskInstanceDetailDto | null> {
  const instance = await findInstance(tx, ctx.householdId, instanceId);
  if (instance === null) return null;
  const { config } = await loadCurrentConfig(tx, ctx.householdId);
  return buildInstanceDetail(tx, ctx, instance, config, viewerBalance);
}

/** `GET /api/tasks/available` (§3.4). */
export async function listAvailableTasks(
  tx: PrismaTx,
  ctx: ViewerContext,
  filter: { categoryId?: string; eligibleOnly?: boolean } = {},
): Promise<AvailableTaskDto[]> {
  const { config } = await loadCurrentConfig(tx, ctx.householdId);
  const instances = await tx.taskInstance.findMany({
    where: {
      householdId: ctx.householdId,
      status: 'AVAILABLE',
      ...(filter.categoryId ? { definition: { categoryId: filter.categoryId } } : {}),
    },
    include: INSTANCE_INCLUDE,
    orderBy: [{ dueAt: 'asc' }, { currentValue: 'desc' }],
  });

  const dtos: AvailableTaskDto[] = [];
  for (const instance of instances) {
    const dto = await toAvailableDto(tx, ctx, instance, config);
    if (filter.eligibleOnly && !dto.canVolunteer) continue;
    dtos.push(dto);
  }
  return dtos;
}

/** `GET /api/tasks/assigned-to-me` (§3.4). */
export async function listAssignedToMe(
  tx: PrismaTx,
  ctx: ViewerContext,
  viewerBalance: number,
): Promise<AssignedTaskDto[]> {
  const { config } = await loadCurrentConfig(tx, ctx.householdId);
  const instances = await tx.taskInstance.findMany({
    where: {
      householdId: ctx.householdId,
      status: 'ASSIGNED',
      assignments: { some: { status: 'ACTIVE', memberId: ctx.memberId } },
    },
    include: INSTANCE_INCLUDE,
    orderBy: [{ dueAt: 'asc' }],
  });

  const dtos: AssignedTaskDto[] = [];
  for (const instance of instances) {
    // Multi-worker-tasks (Phase 3): the `where` above only guarantees *some*
    // active slot on this instance belongs to the viewer — with more than one
    // concurrent slot, that need not be `assignments[0]` (lowest slotIndex)
    // any more, so it must be looked up by memberId rather than assumed.
    const base = await toAvailableDto(tx, ctx, instance, config);
    const activeAssignments = await Promise.all(
      instance.assignments.map((a) => toAssignmentSummary(tx, ctx, instance, a, viewerBalance)),
    );
    const mine = activeAssignments.find((a) => a.memberId === ctx.memberId);
    if (mine === undefined) continue;
    dtos.push({ ...base, assignment: mine, activeAssignments });
  }
  return dtos;
}

/**
 * Household-wide row (new tab, "Alle Aufgaben"): the `AvailableTaskDto` base
 * plus who — if anyone — currently holds it. Deliberately lighter than
 * `AssignmentSummaryDto`: this view is read-only for every task that isn't
 * the viewer's own, so it carries no `rewardOnCompletion`/`buyoutQuote` (those
 * are meaningless, and `buyoutQuote` would otherwise need computing per row
 * for members who can never act on it).
 */
async function toHouseholdTaskDto(
  tx: PrismaTx,
  ctx: ViewerContext,
  instance: LoadedInstance,
  cfg: HouseholdConfig,
): Promise<HouseholdTaskDto> {
  // This roster is read-only (no volunteer CTA, see TaskListPage.tsx) and
  // never renders `canVolunteer`/`ineligibleReason` — so skip the real
  // eligibility pass (`viewerEligibility()` -> `loadCandidates()`, a
  // household-wide query) per row, rather than paying its cost for a value
  // nothing consumes.
  const base = await toAvailableDto(tx, ctx, instance, cfg, {
    eligibility: { canVolunteer: false, reason: null },
  });
  // Multi-worker-tasks (Phase 3): every active slot's holder, not just the
  // first. `assignee` is kept as the lowest-`slotIndex` entry for backward
  // compatibility — for an EXACTLY(1) task that is the only slot.
  const assignees = instance.assignments.map((a) => ({
    id: a.member.id,
    displayName: a.member.displayName,
    avatarUrl: a.member.avatarUrl,
    kind: a.kind,
  }));
  return {
    ...base,
    assignee: assignees[0] ?? null,
    assignees,
  };
}

/**
 * `GET /api/tasks/all` — the household-wide "Alle Aufgaben" view: every
 * currently open (`AVAILABLE` or `ASSIGNED`) instance, not scoped to the
 * viewer, with the assignee named for `ASSIGNED` rows (§20, §32-adjacent —
 * "wer hat was", not "warum wurde mir das zugewiesen").
 */
export async function listAllOpenTasks(
  tx: PrismaTx,
  ctx: ViewerContext,
): Promise<HouseholdTaskDto[]> {
  const { config } = await loadCurrentConfig(tx, ctx.householdId);
  const instances = await tx.taskInstance.findMany({
    where: {
      householdId: ctx.householdId,
      status: { in: ['AVAILABLE', 'ASSIGNED'] },
    },
    include: INSTANCE_INCLUDE,
    orderBy: [{ dueAt: 'asc' }, { currentValue: 'desc' }],
  });

  const dtos: HouseholdTaskDto[] = [];
  for (const instance of instances) {
    dtos.push(await toHouseholdTaskDto(tx, ctx, instance, config));
  }
  return dtos;
}

export { findInstance, INSTANCE_INCLUDE };
export type { LoadedInstance };
