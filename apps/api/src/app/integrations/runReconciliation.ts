/**
 * The reconciler's I/O half (Architektur Todoist §7).
 *
 * Reads desired state, actual state and the three suppression sets, hands them
 * to the pure `reconcile`, and writes the resulting plan. Runs per household,
 * outside every core transaction and holding no task-row lock — which is what
 * makes a Todoist outage structurally incapable of touching §28's atomicity
 * guarantees for volunteer / buyout / completion.
 *
 * Note what is absent: this file reads no event log and observes no transition.
 * Whatever the cause of a divergence — a crash, a bug, a dropped row, a member
 * who was briefly inactive — the next pass recomputes the difference and repairs
 * it. That self-healing property is the reason the design is level-triggered,
 * and an earlier revision destroyed it by adding a well-meant unique constraint
 * that let terminal rows swallow re-proposals forever.
 */

import type { Deps } from '../deps.js';
import {
  reconcile,
  triggerEnabled,
  type ActualTask,
  type AssignmentKindName,
  type DesiredTask,
  type Suppression,
} from './reconcile.js';

/** How long a terminal row suppresses re-proposal of its key. */
const COOLDOWN_MINUTES = 60;
/** Window over which DEAD rows are counted toward the cap. */
const CAP_WINDOW_HOURS = 24;

export interface ReconcileOutcome {
  desired: number;
  actual: number;
  enqueued: number;
  capNotifications: number;
}

interface PayloadSource {
  content: string;
  description: string;
  dueAt: Date | null;
  timezone: string;
  projectId: string | null;
  /** `integrations.todoist.priority` — see `TodoistIntegrationConfig` for the
   * direction convention. `null` means "send no `priority` argument". */
  priority: number | null;
}

export async function runReconciliation(
  deps: Deps,
  input: { householdId: string },
): Promise<ReconcileOutcome> {
  const outcome: ReconcileOutcome = { desired: 0, actual: 0, enqueued: 0, capNotifications: 0 };
  // Nothing to do when the integration was never composed — a household with no
  // encryption key configured is a normal state, not an error.
  if (deps.todoist === undefined || deps.secrets === undefined) return outcome;

  const now = deps.clock.now();

  // Household-level kill switch, read at the CURRENT config version rather than
  // an instance's pinned one: pinning freezes the *economics* a member was shown
  // (cost, reward, reset), and a kill switch that in-flight instances ignore is
  // not a kill switch.
  const household = await deps.db.household.findUnique({
    where: { id: input.householdId },
    select: { timezone: true },
  });
  if (household === null) return outcome;

  const configRow = await deps.db.householdConfiguration.findFirst({
    where: { householdId: input.householdId },
    orderBy: { version: 'desc' },
    select: { values: true },
  });
  const values = (configRow?.values ?? {}) as Record<string, unknown>;
  const integrations = (values.integrations ?? {}) as Record<string, unknown>;
  const todoistConfig = (integrations.todoist ?? {}) as Record<string, unknown>;
  const householdEnabled = todoistConfig.enabled === true;
  // §16/§17: admin-configurable, not hardcoded. Raw Todoist API priority
  // (4=urgent .. 1=normal), forwarded as-is — see `TodoistIntegrationConfig`.
  const configuredPriority =
    typeof todoistConfig.priority === 'number' ? todoistConfig.priority : null;

  // ── viable integrations ────────────────────────────────────────────────
  // "Viable" is status ACTIVE *and* a token that still exists: disconnect nulls
  // the token without deleting the row, so status alone is not enough.
  const viable = householdEnabled
    ? await deps.db.memberIntegration.findMany({
        where: {
          householdId: input.householdId,
          provider: 'TODOIST',
          status: 'ACTIVE',
          NOT: { tokenCiphertext: null },
          member: { isActive: true },
        },
        select: { id: true, memberId: true, triggers: true, projectId: true },
      })
    : [];

  const byMember = new Map(viable.map((row) => [row.memberId, row]));

  // ── desired ────────────────────────────────────────────────────────────
  // Carried by @@index([householdId, memberId, status]). The instance join is
  // condition 2: an ACTIVE assignment on a PAUSED or CANCELLED instance is not
  // ownership. That is currently unreachable through the admin routes, which
  // forbid pausing an ASSIGNED instance — but the domain state machine permits
  // the transition, so depending on the route layer would be depending on an
  // accident.
  const assignments =
    viable.length === 0
      ? []
      : await deps.db.taskAssignment.findMany({
          where: {
            householdId: input.householdId,
            status: 'ACTIVE',
            memberId: { in: viable.map((row) => row.memberId) },
            instance: { status: 'ASSIGNED' },
          },
          select: {
            id: true,
            memberId: true,
            taskInstanceId: true,
            kind: true,
            instance: {
              select: {
                dueAt: true,
                currentValue: true,
                definition: { select: { title: true, description: true } },
              },
            },
          },
        });

  const desired: DesiredTask[] = [];
  const payloads = new Map<string, PayloadSource>();
  for (const assignment of assignments) {
    const integration = byMember.get(assignment.memberId);
    if (integration === undefined) continue;
    const kind = assignment.kind as AssignmentKindName;
    if (!triggerEnabled(integration.triggers, kind)) continue;

    desired.push({
      assignmentId: assignment.id,
      memberId: assignment.memberId,
      integrationId: integration.id,
      taskInstanceId: assignment.taskInstanceId,
      kind,
    });
    payloads.set(assignment.id, {
      content: assignment.instance.definition.title,
      description: describe(assignment.instance.currentValue, kind),
      dueAt: assignment.instance.dueAt,
      timezone: household.timezone,
      projectId: integration.projectId,
      priority: configuredPriority,
    });
  }
  outcome.desired = desired.length;

  // ── actual ─────────────────────────────────────────────────────────────
  // Carried by the partial index `integration_task_links_open`.
  const links = await deps.db.integrationTaskLink.findMany({
    where: { householdId: input.householdId, closedAt: null },
    select: {
      assignmentId: true,
      memberId: true,
      integrationId: true,
      taskInstanceId: true,
      externalTaskId: true,
    },
  });
  const actual: ActualTask[] = links;
  outcome.actual = actual.length;

  if (desired.length === 0 && actual.length === 0) return outcome;

  // ── suppression: three reads, no disjunction ───────────────────────────
  const [liveRows, settledRows, absorbedRows] = await Promise.all([
    // (1) live work — prefix of (householdId, status, nextAttemptAt)
    deps.db.integrationOutbox.findMany({
      where: { householdId: input.householdId, status: { in: ['PENDING', 'FAILED'] } },
      select: { enqueueKey: true },
    }),
    // (2) cooldown + cap window — carried by (householdId, settledAt)
    deps.db.integrationOutbox.findMany({
      where: {
        householdId: input.householdId,
        settledAt: { gt: new Date(now.getTime() - CAP_WINDOW_HOURS * 3600_000) },
      },
      select: { enqueueKey: true, status: true, settledAt: true, memberNotifiedAt: true },
    }),
    // (3) permanently absorbed — deliberately NO time bound
    deps.db.integrationOutbox.findMany({
      where: { householdId: input.householdId, status: 'ORPHANED' },
      select: { enqueueKey: true, memberNotifiedAt: true },
    }),
  ]);

  const cooldownFrom = new Date(now.getTime() - COOLDOWN_MINUTES * 60_000);
  const live = new Set(liveRows.map((row) => row.enqueueKey));
  const cooldown = new Set<string>();
  const deadCounts = new Map<string, number>();
  const notified = new Set<string>();

  for (const row of settledRows) {
    if (row.settledAt !== null && row.settledAt > cooldownFrom) cooldown.add(row.enqueueKey);
    if (row.status === 'DEAD') {
      deadCounts.set(row.enqueueKey, (deadCounts.get(row.enqueueKey) ?? 0) + 1);
    }
    if (row.memberNotifiedAt !== null) notified.add(row.enqueueKey);
  }
  const absorbed = new Set(absorbedRows.map((row) => row.enqueueKey));
  for (const row of absorbedRows) {
    if (row.memberNotifiedAt !== null) notified.add(row.enqueueKey);
  }

  const suppression: Suppression = { live, cooldown, absorbed, deadCounts, notified };

  // ── plan ───────────────────────────────────────────────────────────────
  const plan = reconcile(desired, actual, suppression);
  if (plan.items.length === 0 && plan.capNotifications.length === 0) return outcome;

  const rows = plan.items.map((item) => {
    const source = payloads.get(item.assignmentId);
    return {
      householdId: input.householdId,
      memberId: item.memberId,
      integrationId: item.integrationId,
      operation: item.operation,
      taskInstanceId: item.taskInstanceId,
      assignmentId: item.assignmentId,
      enqueueKey: item.enqueueKey,
      externalTaskId: item.externalTaskId,
      payload: {
        content: source?.content ?? '',
        description: source?.description ?? '',
        dueAt: source?.dueAt?.toISOString() ?? null,
        timezone: source?.timezone ?? 'UTC',
        projectId: source?.projectId ?? null,
        priority: source?.priority ?? null,
      } as never,
    };
  });

  await deps.db.$transaction(async (tx) => {
    if (rows.length > 0) {
      // `skipDuplicates` compiles to ON CONFLICT DO NOTHING, which cannot abort
      // the transaction — the lesson from `postTransaction.ts`, where a unique
      // violation is documented as poisoning the whole transaction beyond any
      // try/catch. The partial unique index is the arbiter; terminal rows are
      // outside its predicate and so never block a re-proposal.
      await tx.integrationOutbox.createMany({ data: rows, skipDuplicates: true });
    }

    for (const capped of plan.capNotifications) {
      // Mechanised idempotency: the reconciler is stateless and runs every
      // interval while the cap condition holds, and `notifications` has no
      // dedup key of its own — so "exactly one notification" has to be recorded
      // somewhere. Stamping the newest row for the key is that record.
      const newest = await tx.integrationOutbox.findFirst({
        where: { householdId: input.householdId, enqueueKey: capped.enqueueKey },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (newest === null) continue;

      await tx.integrationOutbox.updateMany({
        where: { id: newest.id, householdId: input.householdId },
        data: { memberNotifiedAt: now },
      });
      await deps.notifier.emit(tx, [
        {
          householdId: input.householdId,
          memberId: capped.memberId,
          type: 'INTEGRATION_FAILED',
          payload: {
            provider: 'TODOIST',
            operation: capped.operation,
            // "repeatedly failed", never "permanently broken": a long Todoist
            // outage can trip the cap on a genuinely transient fault, and the
            // cap self-releases as rows age out of the window.
            reason: 'REPEATED_FAILURE',
            // A capped close leaves a task open in the member's Todoist for a
            // chore already done, so the UI must ask them to remove it by hand.
            stranded: capped.operation === 'CLOSE_TASK',
          },
        },
      ]);
    }
  });

  outcome.enqueued = rows.length;
  outcome.capNotifications = plan.capNotifications.length;
  return outcome;
}

/** The Todoist task body. Kept short; the value is what the member cares about. */
function describe(currentValue: number, kind: AssignmentKindName): string {
  const origin =
    kind === 'VOLUNTARY' ? 'Freiwillig übernommen' : 'Zufällig zugewiesen — 0 Punkte bei Erledigung';
  return `${origin}. Aktueller Wert: ${currentValue} Punkte.\nErledigen in Hausarbeitsbörse — ein Häkchen hier wirkt dort nicht.`;
}
