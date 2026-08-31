/**
 * The reconciler's decision function (Architektur Todoist §6, §7).
 *
 * **Pure. No I/O.** Every trigger semantic lives here, so the whole rule set is
 * table-driven unit tests with no database — which matters because these rules
 * were the subject of nine architecture revisions and are the part most likely
 * to be misremembered later.
 *
 * The design is **level-triggered**: it never observes an event. It compares the
 * set of assignments a member currently owns against the set of Todoist tasks
 * that currently exist for them, and acts on the difference. Three earlier
 * designs were edge-triggered and each failed at a different link in that chain
 * — observing the event, writing on the event, and reading the event log.
 *
 * The governing rule for suppression, learned the hard way:
 * **suppression must come from the cause, never from the corpse.** A terminal
 * outbox row is evidence that an attempt ended, not a reason to stop wanting the
 * outcome. The single exception is `ORPHANED`, whose cause — a task exists in
 * Todoist whose id we lost — cannot become false.
 */

export type AssignmentKindName = 'VOLUNTARY' | 'RANDOM';
export type OutboxOperationName = 'CREATE_TASK' | 'CLOSE_TASK';

/** How many DEAD rows for one key before we stop proposing and tell the member. */
export const DEAD_CAP = 3;

/** An assignment the member currently owns, joined to a viable integration. */
export interface DesiredTask {
  assignmentId: string;
  memberId: string;
  integrationId: string;
  taskInstanceId: string;
  kind: AssignmentKindName;
}

/** An open link: a Todoist task that exists and which we can still address. */
export interface ActualTask {
  assignmentId: string;
  memberId: string;
  integrationId: string;
  taskInstanceId: string;
  externalTaskId: string;
}

/**
 * Everything the outbox knows that should stop us proposing work.
 *
 * Separated from the sets above so the caller's three indexed reads map onto
 * three explicit inputs rather than an opaque "context" blob.
 */
export interface Suppression {
  /** `PENDING`/`FAILED` — the work is already queued. */
  live: ReadonlySet<string>;
  /** Terminal within the cooldown window — do not hammer. */
  cooldown: ReadonlySet<string>;
  /** `ORPHANED` — permanently absorbed; the cause cannot become false. */
  absorbed: ReadonlySet<string>;
  /** `DEAD` counts within the cap window. */
  deadCounts: ReadonlyMap<string, number>;
  /** Keys whose member has already been told; prevents notification spam. */
  notified: ReadonlySet<string>;
}

export interface PlanItem {
  operation: OutboxOperationName;
  enqueueKey: string;
  assignmentId: string;
  memberId: string;
  integrationId: string;
  taskInstanceId: string;
  /** Only for a close: the id to act on, taken from the open link. */
  externalTaskId: string | null;
}

export interface CapNotification {
  enqueueKey: string;
  memberId: string;
  operation: OutboxOperationName;
}

export interface Plan {
  items: PlanItem[];
  /** One per capped key that has not been reported yet. */
  capNotifications: CapNotification[];
}

export function enqueueKeyFor(
  integrationId: string,
  operation: OutboxOperationName,
  assignmentId: string,
): string {
  const verb = operation === 'CREATE_TASK' ? 'create' : 'close';
  return `todoist:${integrationId}:${verb}:${assignmentId}`;
}

/** Which trigger toggle governs an assignment of this kind. */
export function triggerEnabled(triggers: unknown, kind: AssignmentKindName): boolean {
  if (typeof triggers !== 'object' || triggers === null) return false;
  // Keys are EXACTLY the AssignmentKind values — uppercase. Lowercase keys
  // would silently yield `undefined` here and the integration would do nothing
  // at all, which is a real bug an earlier revision shipped.
  const value = (triggers as Record<string, unknown>)[kind];
  return value === true;
}

interface Decision {
  suppressed: boolean;
  capped: boolean;
}

function decide(key: string, suppression: Suppression): Decision {
  if (suppression.absorbed.has(key)) return { suppressed: true, capped: false };
  if (suppression.live.has(key)) return { suppressed: true, capped: false };
  if ((suppression.deadCounts.get(key) ?? 0) >= DEAD_CAP) {
    return { suppressed: true, capped: true };
  }
  if (suppression.cooldown.has(key)) return { suppressed: true, capped: false };
  return { suppressed: false, capped: false };
}

/**
 * desired ∖ actual → create; actual ∖ desired → close.
 *
 * Both directions run through the same suppression check: the absorbing-key bug
 * that broke an earlier revision applied to creates *and* closes, so the fix has
 * to be symmetric too.
 *
 * A capped **close** is worth noticing: it strands a task in the member's
 * Todoist for a chore already finished. The caller's notification copy differs
 * for that reason, which is why `CapNotification` carries the operation.
 */
export function reconcile(
  desired: readonly DesiredTask[],
  actual: readonly ActualTask[],
  suppression: Suppression,
): Plan {
  const items: PlanItem[] = [];
  const capNotifications: CapNotification[] = [];
  const seenCapKeys = new Set<string>();

  const actualByAssignment = new Map<string, ActualTask>();
  for (const link of actual) actualByAssignment.set(link.assignmentId, link);

  const desiredByAssignment = new Set(desired.map((task) => task.assignmentId));

  const noteCap = (key: string, memberId: string, operation: OutboxOperationName): void => {
    if (suppression.notified.has(key) || seenCapKeys.has(key)) return;
    seenCapKeys.add(key);
    capNotifications.push({ enqueueKey: key, memberId, operation });
  };

  // ── desired ∖ actual → CREATE ──────────────────────────────────────────
  for (const task of desired) {
    if (actualByAssignment.has(task.assignmentId)) continue;
    const key = enqueueKeyFor(task.integrationId, 'CREATE_TASK', task.assignmentId);
    const decision = decide(key, suppression);
    if (decision.capped) noteCap(key, task.memberId, 'CREATE_TASK');
    if (decision.suppressed) continue;
    items.push({
      operation: 'CREATE_TASK',
      enqueueKey: key,
      assignmentId: task.assignmentId,
      memberId: task.memberId,
      integrationId: task.integrationId,
      taskInstanceId: task.taskInstanceId,
      externalTaskId: null,
    });
  }

  // ── actual ∖ desired → CLOSE ───────────────────────────────────────────
  for (const link of actual) {
    if (desiredByAssignment.has(link.assignmentId)) continue;
    const key = enqueueKeyFor(link.integrationId, 'CLOSE_TASK', link.assignmentId);
    const decision = decide(key, suppression);
    if (decision.capped) noteCap(key, link.memberId, 'CLOSE_TASK');
    if (decision.suppressed) continue;
    items.push({
      operation: 'CLOSE_TASK',
      enqueueKey: key,
      assignmentId: link.assignmentId,
      memberId: link.memberId,
      integrationId: link.integrationId,
      taskInstanceId: link.taskInstanceId,
      // Always present: a link only exists after a confirmed create, so a close
      // can never be proposed without the id it needs.
      externalTaskId: link.externalTaskId,
    });
  }

  return { items, capNotifications };
}
