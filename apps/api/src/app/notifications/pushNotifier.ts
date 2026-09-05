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
 * These three types are pushed. The first two — both already worked in-app,
 * so "did the push text match the in-app text" was easy to verify by hand.
 * `TASK_AVAILABLE` (Phase 3, .planning/research-push-notifications.md) closes
 * a pre-existing gap: nothing ever emitted this type before
 * `runAssignmentSweep.ts`'s T1/T2 sites started doing so, so both the in-app
 * and push channels were silently missing it equally. Further types
 * (`TASK_DUE_SOON`, `TASK_VALUE_INCREASED`, …) remain future work — not
 * required by this campaign's acceptance criteria.
 */
export const PUSH_ENABLED_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'TASK_ASSIGNED',
  'TASK_TAKEN',
  'TASK_AVAILABLE',
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
