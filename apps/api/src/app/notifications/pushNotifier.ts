/**
 * Web Push enqueue decorator (push-notifications §Architekturvorschlag,
 * Phase 2 — "Notifier-Erweiterung"; rollback-safety fix).
 *
 * Wraps the existing in-app `Notifier` (normally `dbNotifier`) without
 * changing it. `inner.emit(tx, drafts)` runs first and is awaited exactly as
 * today — the §24 guarantee ("ein committeter Vorgang benachrichtigt immer,
 * ein zurückgerollter nie") stays entirely on that call and is untouched by
 * anything below it.
 *
 * **The fix.** An earlier version of this decorator sent the actual Web Push
 * HTTP request synchronously, still inside the caller's `await`, using the
 * plain `db` client instead of `tx`. That meant a push could reach a
 * member's phone for an operation whose transaction later failed and rolled
 * back — the in-app `Notification` row would vanish, but the push had
 * already gone out. This violates this feature's own acceptance criterion
 * ("Rollback des auslösenden Vorgangs löst keinen Push aus") and the wider
 * §24 invariant.
 *
 * The fix is the same shape the Todoist integration already uses for an
 * analogous problem (`app/integrations/dispatchOutbox.ts` +
 * `IntegrationOutbox`): **write, don't send, inside the transaction; send,
 * don't write, outside it.** `emit` now does nothing but insert
 * `PushOutboxItem` rows using `tx` — the same transaction `inner.emit` just
 * used — so a rollback of the caller's transaction takes the outbox rows
 * with it, exactly like the `Notification` rows. The actual HTTP delivery
 * moved to `dispatchPushOutbox.ts`, which runs later, with no transaction
 * open, on a `setInterval` (`infra/jobs/push-outbox-worker.ts`) — mirroring
 * `dispatchOutbox.ts`'s "HTTP call outside every transaction" shape.
 *
 * Deliberately much simpler than the Todoist outbox: no status machine, no
 * retries, no backoff. A push is best-effort (research doc) — losing one on
 * a transient network blip is an accepted outcome, not a bug to defend
 * against with machinery.
 *
 * This write is *not* wrapped in its own try/catch: it is meant to be
 * atomic with the notification rows it accompanies. If it fails, the whole
 * transaction should fail along with it, same as any other write inside
 * `tx`.
 */

import type { NotificationDraft, Notifier } from '../deps.js';

/**
 * These three externally actionable types are pushed. Their recipients need
 * to know about an available, assigned, or soon-due task even when they are
 * not currently using the app. Member-initiated changes such as volunteering
 * for or completing a task remain in-app only.
 * `TASK_AVAILABLE` (Phase 3, .planning/research-push-notifications.md) closes
 * a pre-existing gap: nothing ever emitted this type before
 * `runAssignmentSweep.ts`'s T1/T2 sites started doing so, so both the in-app
 * and push channels were silently missing it equally. Further types
 * (`TASK_VALUE_INCREASED`, …) remain future work.
 *
 * `TASK_DUE_SOON` (intake "due-soon-reminder-for-assigned-tasks"): a
 * due-*soon* reminder that only reaches someone already looking at the app
 * largely defeats its purpose, so it is pushed too.
 */
export const PUSH_ENABLED_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'TASK_ASSIGNED',
  'TASK_AVAILABLE',
  'TASK_DUE_SOON',
]);

/**
 * `HistoryEventType`s (§22) whose row is written in the same use-case call as
 * a push-eligible notification above, so the Verlauf can show "this was also
 * pushed": `OFFERED` next to `TASK_AVAILABLE` (`runAssignmentSweep.ts`'s T1/T2
 * sites) and `RANDOMLY_ASSIGNED` next to `TASK_ASSIGNED`
 * (`runAssignmentSweep.ts`'s T4/T5 random draw). `TASK_DUE_SOON` has no
 * corresponding history row at all (informational nudge only, see the T19
 * site).
 *
 * A display hint, not a delivery receipt: whether the push actually reached a
 * device depends on the household's/member's push configuration at dispatch
 * time, which `PushOutboxItem` deliberately never persists (its rows are
 * deleted after one attempt, success or not — see that model's doc comment).
 * This only reflects "was push-eligible by event type", the same thing
 * `PUSH_ENABLED_NOTIFICATION_TYPES` above already decides for notifications.
 */
export const PUSH_NOTIFIED_HISTORY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'OFFERED',
  'RANDOMLY_ASSIGNED',
]);

/**
 * No household `notifications.pushEnabled` check happens here. A household
 * could flip that setting between enqueue and dispatch, and checking fresh
 * at dispatch time (`dispatchPushOutbox.ts`) is both simpler — this function
 * needs no `db`/config read at all — and strictly more correct, since it
 * always reflects the *current* configuration rather than a value read at
 * enqueue time.
 */
export const pushNotifier = (inner: Notifier): Notifier => ({
  async emit(tx, drafts) {
    // Unchanged: the in-app path's transactional guarantee is exactly as
    // before this decorator existed.
    await inner.emit(tx, drafts);

    const eligible = drafts.filter((d) => PUSH_ENABLED_NOTIFICATION_TYPES.has(d.type));
    if (eligible.length === 0) return;

    // Same `tx` as `inner.emit` above — this is what makes the enqueue roll
    // back with everything else in the caller's transaction.
    await tx.pushOutboxItem.createMany({
      data: eligible.map((d) => rowFor(d)),
    });
  },
});

function rowFor(draft: NotificationDraft) {
  return {
    householdId: draft.householdId,
    memberId: draft.memberId,
    type: draft.type,
    payload: draft.payload as never,
    taskInstanceId: draft.taskInstanceId ?? null,
  };
}
