/**
 * The assignment sweep — T1, T2, T4, T5, T16–T18 (Architektur §3.11, §6, §4.2).
 *
 * One use-case, two callers: `POST /api/admin/assignments/run` and the interval
 * worker (§7.2). That is deliberate — it is what makes the sweep testable
 * without waiting for a timer, and what guarantees the manual button does
 * exactly what the background job does.
 *
 * **One instance per transaction, each under the level-0 advisory lock.** The
 * lock is what stops the worker and a manual run from both reading "Anna has 2
 * of 3 random assignments this week" and both assigning to her: the weekly cap
 * and the fairness counters are aggregates, not rows, so no row lock covers
 * them. One instance per transaction is what keeps the sweep from ever holding
 * two level-1 locks at once (§4.2).
 */

import type { SelectionTrace } from '@haushaltsauktion/shared';

import { selectAssignee } from '../../domain/assignment/strategies.js';
import {
  dueAtFor,
  expiryDeadline,
  nextOccurrence,
  offerExpiresAt,
  type RecurrenceRule,
} from '../../domain/recurrence/next-occurrence.js';
import type { Deps } from '../deps.js';
import { loadCurrentConfig, loadConfigVersion } from '../config/load.js';
import { writeAudit, writeHistory } from '../events.js';
import { acquireSweepLock, lockActiveAssignmentOfInstance, lockInstance, withTransaction } from '../tx.js';
import { loadCandidates } from './candidates.js';

export interface SweepInput {
  householdId: string;
  dryRun?: boolean;
}

export interface SweepReport {
  materialized: number;
  published: number;
  assigned: number;
  expired: number;
  skipped: number;
  traces: Array<{ taskInstanceId: string; trace: SelectionTrace }>;
}

const OPEN_STATUSES = ['DRAFT', 'AVAILABLE', 'ASSIGNED', 'PAUSED'] as const;

function ruleOf(definition: {
  recurrenceType: string;
  recurrenceInterval: number | null;
  recurrenceWeekdays: number[];
  recurrenceDayOfMonth: number | null;
  recurrenceTimeOfDay: string | null;
  dueOffsetMinutes: number | null;
}): RecurrenceRule {
  return {
    type: definition.recurrenceType as never,
    interval: definition.recurrenceInterval,
    weekdays: definition.recurrenceWeekdays,
    dayOfMonth: definition.recurrenceDayOfMonth,
    timeOfDay: definition.recurrenceTimeOfDay,
    dueOffsetMinutes: definition.dueOffsetMinutes,
  };
}

export async function runAssignmentSweep(
  deps: Deps,
  input: SweepInput,
): Promise<SweepReport> {
  const now = deps.clock.now();
  const report: SweepReport = {
    materialized: 0,
    published: 0,
    assigned: 0,
    expired: 0,
    skipped: 0,
    traces: [],
  };

  const household = await deps.db.household.findUnique({
    where: { id: input.householdId },
    select: { timezone: true },
  });
  if (household === null) return report;
  const timezone = household.timezone;

  // ── T1: materialize due occurrences ─────────────────────────────────
  const dueDefinitions = await deps.db.taskDefinition.findMany({
    where: {
      householdId: input.householdId,
      isActive: true,
      archivedAt: null,
      nextDueAt: { lte: now },
    },
    select: {
      id: true,
      baseValue: true,
      carriedValue: true,
      nextDueAt: true,
      recurrenceType: true,
      recurrenceInterval: true,
      recurrenceWeekdays: true,
      recurrenceDayOfMonth: true,
      recurrenceTimeOfDay: true,
      dueOffsetMinutes: true,
      title: true,
    },
  });

  for (const definition of dueDefinitions) {
    await withTransaction(deps, async (tx) => {
      await acquireSweepLock(tx, input.householdId);
      const { version, config } = await loadCurrentConfig(tx, input.householdId);

      const openCount = await tx.taskInstance.count({
        where: {
          householdId: input.householdId,
          taskDefinitionId: definition.id,
          status: { in: [...OPEN_STATUSES] },
        },
      });
      // OQ-5: two open cards for one chore make "the value of this chore"
      // ambiguous, so the cap is respected rather than piling instances up.
      if (openCount >= config.tasks.maxOpenInstancesPerDefinition) {
        report.skipped += 1;
        return;
      }
      if (input.dryRun) {
        report.materialized += 1;
        return;
      }

      const rule = ruleOf(definition);
      const scheduledFor = definition.nextDueAt ?? now;
      const dueAt = dueAtFor(rule, scheduledFor);
      const expires = offerExpiresAt({
        publishedAt: now,
        dueAt,
        offerDurationMinutes: config.assignment.offerDurationMinutes,
        leadMinutesBeforeDue: config.assignment.leadMinutesBeforeDue,
      });

      const instance = await tx.taskInstance.create({
        data: {
          householdId: input.householdId,
          taskDefinitionId: definition.id,
          status: 'AVAILABLE',
          // T1 — `carriedValue ?? baseValue` (§5.7). Under the default reset
          // strategy `carriedValue` is permanently null and this is `baseValue`.
          currentValue: definition.carriedValue ?? definition.baseValue,
          baseValue: definition.baseValue,
          scheduledFor,
          dueAt,
          publishedAt: now,
          offerExpiresAt: expires,
          configVersion: version,
        },
      });

      await tx.taskDefinition.updateMany({
        where: { id: definition.id, householdId: input.householdId },
        data: { nextDueAt: nextOccurrence(rule, scheduledFor, timezone) },
      });

      await writeHistory(tx, [
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'CREATED',
          payload: { title: definition.title, value: instance.currentValue },
        },
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'OFFERED',
          payload: { title: definition.title, value: instance.currentValue },
        },
      ]);
      report.materialized += 1;
      report.published += 1;
    });
  }

  // ── T2: publish drafts whose occurrence has arrived ─────────────────
  const drafts = await deps.db.taskInstance.findMany({
    where: { householdId: input.householdId, status: 'DRAFT', scheduledFor: { lte: now } },
    select: { id: true },
  });
  for (const draft of drafts) {
    if (input.dryRun) {
      report.published += 1;
      continue;
    }
    await withTransaction(deps, async (tx) => {
      await acquireSweepLock(tx, input.householdId);
      const instance = await lockInstance(tx, input.householdId, draft.id);
      if (instance === null || instance.status !== 'DRAFT') {
        report.skipped += 1;
        return;
      }
      const draftDefinition = await tx.taskDefinition.findFirst({
        where: { id: instance.taskDefinitionId, householdId: input.householdId },
        select: { title: true },
      });
      const cfg = await loadConfigVersion(tx, input.householdId, instance.configVersion);
      const expires = offerExpiresAt({
        publishedAt: now,
        dueAt: instance.dueAt,
        offerDurationMinutes: cfg.assignment.offerDurationMinutes,
        leadMinutesBeforeDue: cfg.assignment.leadMinutesBeforeDue,
      });
      await tx.taskInstance.updateMany({
        where: { id: instance.id, householdId: input.householdId, version: instance.version },
        data: {
          status: 'AVAILABLE',
          publishedAt: now,
          offerExpiresAt: expires,
          version: { increment: 1 },
        },
      });
      await writeHistory(tx, [
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'OFFERED',
          payload: { title: draftDefinition?.title ?? '', value: instance.currentValue },
        },
      ]);
      report.published += 1;
    });
  }

  // ── T16–T18: expire instances past their deadline ───────────────────
  const openInstances = await deps.db.taskInstance.findMany({
    where: { householdId: input.householdId, status: { in: [...OPEN_STATUSES] } },
    select: {
      id: true,
      scheduledFor: true,
      dueAt: true,
      definition: {
        select: {
          recurrenceType: true,
          recurrenceInterval: true,
          recurrenceWeekdays: true,
          recurrenceDayOfMonth: true,
          recurrenceTimeOfDay: true,
          dueOffsetMinutes: true,
        },
      },
    },
  });

  for (const candidate of openInstances) {
    const deadline = expiryDeadline(
      ruleOf(candidate.definition),
      { scheduledFor: candidate.scheduledFor, dueAt: candidate.dueAt },
      timezone,
    );
    // `null` means the instance never expires on its own — intended for a
    // MANUAL/ONCE chore with no due date (OQ-4).
    if (deadline === null || deadline.getTime() >= now.getTime()) continue;
    if (input.dryRun) {
      report.expired += 1;
      continue;
    }

    await withTransaction(deps, async (tx) => {
      await acquireSweepLock(tx, input.householdId);
      const instance = await lockInstance(tx, input.householdId, candidate.id);
      if (instance === null || !OPEN_STATUSES.includes(instance.status as never)) {
        report.skipped += 1;
        return;
      }

      if (instance.status === 'ASSIGNED') {
        const assignment = await lockActiveAssignmentOfInstance(
          tx,
          input.householdId,
          instance.id,
        );
        if (assignment !== null) {
          await tx.taskAssignment.updateMany({
            where: { id: assignment.id, householdId: input.householdId, status: 'ACTIVE' },
            data: { status: 'EXPIRED', closedAt: now, activeForInstanceId: null },
          });
        }
      }

      // PRD §3F — an instance that expires uncompleted always resets to its base
      // value and clears any carry-over. The escalated value of an abandoned
      // chore is correctly discarded rather than inherited.
      await tx.taskInstance.updateMany({
        where: { id: instance.id, householdId: input.householdId, version: instance.version },
        data: {
          status: 'EXPIRED',
          currentValue: instance.baseValue,
          closedAt: now,
          version: { increment: 1 },
        },
      });
      await tx.taskDefinition.updateMany({
        where: { id: instance.taskDefinitionId, householdId: input.householdId },
        data: { carriedValue: null },
      });

      await writeHistory(tx, [
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'EXPIRED',
          payload: { value: instance.currentValue },
        },
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'VALUE_RESET',
          payload: { from: instance.currentValue, to: instance.baseValue, strategy: 'BASE_VALUE' },
        },
      ]);
      await writeAudit(tx, {
        householdId: input.householdId,
        actorType: 'SYSTEM',
        action: 'INSTANCE_EXPIRED',
        entityType: 'TaskInstance',
        entityId: instance.id,
        payload: { deadline: deadline.toISOString() },
      });
      report.expired += 1;
    });
  }

  // ── T4 / T5: the random draw ────────────────────────────────────────
  const ripe = await deps.db.taskInstance.findMany({
    where: {
      householdId: input.householdId,
      status: 'AVAILABLE',
      offerExpiresAt: { lte: now },
    },
    select: { id: true },
    orderBy: { offerExpiresAt: 'asc' },
  });

  for (const target of ripe) {
    const outcome = await withTransaction(deps, async (tx) => {
      await acquireSweepLock(tx, input.householdId);
      const instance = await lockInstance(tx, input.householdId, target.id);
      if (instance === null || instance.status !== 'AVAILABLE') return null;
      if (instance.offerExpiresAt === null || instance.offerExpiresAt.getTime() > now.getTime()) {
        return null;
      }

      const { version, config } = await loadCurrentConfig(tx, input.householdId);
      const definition = await tx.taskDefinition.findFirst({
        where: { id: instance.taskDefinitionId, householdId: input.householdId },
        select: { categoryId: true, title: true },
      });
      if (definition === null) return null;

      const { candidates, definitionHasAllowlist } = await loadCandidates(tx, {
        householdId: input.householdId,
        timezone,
        taskDefinitionId: instance.taskDefinitionId,
        categoryId: definition.categoryId,
        now,
        cfg: config,
      });

      // The whole of §6 in one call: filter, relax if starving, weight, draw,
      // and record why — so the audit requirement is satisfied by construction
      // rather than by remembering to log.
      const selection = selectAssignee({
        cfg: config,
        candidates,
        options: { definitionHasAllowlist },
        configVersion: version,
        decidedAt: now.toISOString(),
        rng: deps.rng,
      });

      if (input.dryRun) {
        return { kind: 'DRY' as const, trace: selection.trace, instanceId: instance.id };
      }

      await writeHistory(tx, [
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'NO_VOLUNTEER',
          payload: { offerDurationMinutes: config.assignment.offerDurationMinutes },
        },
        ...selection.trace.constraintsRelaxed.map((c) => ({
          householdId: input.householdId,
          taskInstanceId: instance.id,
          type: 'CONSTRAINT_RELAXED',
          payload: { constraint: c.constraint, reason: c.reason },
        })),
      ]);

      // ── T5: nobody may be given this chore ───────────────────────────
      if (selection.selectedMemberId === null) {
        await writeHistory(tx, [
          {
            householdId: input.householdId,
            taskInstanceId: instance.id,
            type: 'NO_ELIGIBLE_CANDIDATES',
            payload: { consideredCount: candidates.length },
          },
        ]);
        // Push the window forward so the sweep retries next time instead of
        // spinning on the same instance every tick.
        await tx.taskInstance.updateMany({
          where: { id: instance.id, householdId: input.householdId, version: instance.version },
          data: {
            offerExpiresAt: new Date(
              now.getTime() + config.assignment.offerDurationMinutes * 60_000,
            ),
            version: { increment: 1 },
          },
        });
        const admins = await tx.householdMember.findMany({
          where: { householdId: input.householdId, role: 'ADMIN', isActive: true },
          select: { id: true },
        });
        await deps.notifier.emit(
          tx,
          admins.map((a) => ({
            householdId: input.householdId,
            memberId: a.id,
            type: 'ADMIN_NO_CANDIDATES',
            payload: { taskInstanceId: instance.id },
            taskInstanceId: instance.id,
          })),
        );
        return { kind: 'NONE' as const, trace: selection.trace, instanceId: instance.id };
      }

      // ── T4 ───────────────────────────────────────────────────────────
      const moved = await tx.taskInstance.updateMany({
        where: {
          id: instance.id,
          householdId: input.householdId,
          status: 'AVAILABLE',
          version: instance.version,
        },
        data: { status: 'ASSIGNED', version: { increment: 1 } },
      });
      if (moved.count === 0) return null;

      const assignment = await tx.taskAssignment.create({
        data: {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          memberId: selection.selectedMemberId,
          kind: 'RANDOM',
          status: 'ACTIVE',
          response: 'PENDING',
          activeForInstanceId: instance.id,
          valueAtAssignment: instance.currentValue,
          configVersion: version,
          assignedAt: now,
          selectionTrace: selection.trace as never,
        },
      });

      const assignee = await tx.householdMember.findFirst({
        where: { id: selection.selectedMemberId, householdId: input.householdId },
        select: { displayName: true },
      });

      await writeHistory(tx, [
        {
          householdId: input.householdId,
          taskInstanceId: instance.id,
          assignmentId: assignment.id,
          memberId: selection.selectedMemberId,
          type: 'RANDOMLY_ASSIGNED',
          payload: {
            memberId: selection.selectedMemberId,
            memberName: assignee?.displayName ?? '',
            strategy: config.assignment.strategy,
            candidateCount: selection.trace.candidates.filter((c) => c.included).length,
          },
        },
      ]);

      // §6 requires the full candidate set in the audit log. The raw draw goes
      // here and *only* here — `/explain` omits it (§32), which keeps the
      // member-facing view about fairness rather than second-guessing the dice.
      await writeAudit(tx, {
        householdId: input.householdId,
        actorType: 'SYSTEM',
        action: 'RANDOM_SELECTION',
        entityType: 'TaskAssignment',
        entityId: assignment.id,
        payload: { trace: selection.trace as never, draw: selection.draw },
      });

      await deps.notifier.emit(tx, [
        {
          householdId: input.householdId,
          memberId: selection.selectedMemberId,
          type: 'TASK_ASSIGNED',
          payload: { taskInstanceId: instance.id, value: instance.currentValue },
          taskInstanceId: instance.id,
        },
      ]);

      return { kind: 'ASSIGNED' as const, trace: selection.trace, instanceId: instance.id };
    });

    if (outcome === null) {
      report.skipped += 1;
      continue;
    }
    report.traces.push({ taskInstanceId: outcome.instanceId, trace: outcome.trace });
    if (outcome.kind === 'ASSIGNED' || outcome.kind === 'DRY') report.assigned += 1;
    else report.skipped += 1;
  }

  if (!input.dryRun) {
    await deps.db.auditEvent.create({
      data: {
        householdId: input.householdId,
        actorType: 'SYSTEM',
        action: 'ASSIGNMENT_SWEEP_RUN',
        entityType: 'Household',
        entityId: input.householdId,
        payload: {
          materialized: report.materialized,
          published: report.published,
          assigned: report.assigned,
          expired: report.expired,
          skipped: report.skipped,
        },
      },
    });
  }

  return report;
}
