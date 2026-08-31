/**
 * The reconciler's decision function (Architektur Todoist §6, §7).
 *
 * `reconcile` is pure, so every trigger rule and every suppression regime is
 * testable here with no database at all. That matters: these rules survived nine
 * architecture revisions, and several of the cases below encode bugs that were
 * actually shipped in earlier drafts and caught in review.
 */

import { describe, expect, it } from 'vitest';

import {
  DEAD_CAP,
  enqueueKeyFor,
  reconcile,
  triggerEnabled,
  type ActualTask,
  type DesiredTask,
  type Suppression,
} from '../../src/app/integrations/reconcile.js';

const INTEGRATION = 'int-1';

function desiredTask(overrides: Partial<DesiredTask> = {}): DesiredTask {
  return {
    assignmentId: 'assign-1',
    memberId: 'member-1',
    integrationId: INTEGRATION,
    taskInstanceId: 'inst-1',
    kind: 'RANDOM',
    ...overrides,
  };
}

function actualTask(overrides: Partial<ActualTask> = {}): ActualTask {
  return {
    assignmentId: 'assign-1',
    memberId: 'member-1',
    integrationId: INTEGRATION,
    taskInstanceId: 'inst-1',
    externalTaskId: 'todoist-1',
    ...overrides,
  };
}

function noSuppression(overrides: Partial<Suppression> = {}): Suppression {
  return {
    live: new Set(),
    cooldown: new Set(),
    absorbed: new Set(),
    deadCounts: new Map(),
    notified: new Set(),
    ...overrides,
  };
}

const createKey = (assignmentId = 'assign-1'): string =>
  enqueueKeyFor(INTEGRATION, 'CREATE_TASK', assignmentId);
const closeKey = (assignmentId = 'assign-1'): string =>
  enqueueKeyFor(INTEGRATION, 'CLOSE_TASK', assignmentId);

describe('reconcile — the set difference', () => {
  it('desired without actual produces a create', () => {
    const plan = reconcile([desiredTask()], [], noSuppression());
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      operation: 'CREATE_TASK',
      assignmentId: 'assign-1',
      externalTaskId: null,
    });
  });

  it('actual without desired produces a close carrying the external id', () => {
    const plan = reconcile([], [actualTask()], noSuppression());
    expect(plan.items).toHaveLength(1);
    // The invariant an earlier revision broke: a close ALWAYS has its id,
    // because a link only exists after a confirmed create.
    expect(plan.items[0]).toMatchObject({
      operation: 'CLOSE_TASK',
      externalTaskId: 'todoist-1',
    });
  });

  it('desired and actual agreeing produces nothing', () => {
    const plan = reconcile([desiredTask()], [actualTask()], noSuppression());
    expect(plan.items).toEqual([]);
  });

  it('is idempotent — the same inputs twice yield the same plan', () => {
    const a = reconcile([desiredTask()], [], noSuppression());
    const b = reconcile([desiredTask()], [], noSuppression());
    expect(a).toEqual(b);
  });

  it('handles a swap: one member loses the chore, another gains it', () => {
    const plan = reconcile(
      [desiredTask({ assignmentId: 'assign-2', memberId: 'member-2' })],
      [actualTask({ assignmentId: 'assign-1', memberId: 'member-1' })],
      noSuppression(),
    );
    expect(plan.items).toHaveLength(2);
    expect(plan.items.filter((i) => i.operation === 'CREATE_TASK')).toHaveLength(1);
    expect(plan.items.filter((i) => i.operation === 'CLOSE_TASK')).toHaveLength(1);
  });

  it('re-offer cycle: a new assignment for the same instance is a fresh key', () => {
    // Buyout re-offers the instance and a later volunteer creates a NEW
    // TaskAssignment row. Keying on the instance would have blocked the second
    // cycle forever — a bug an earlier revision shipped.
    const plan = reconcile(
      [desiredTask({ assignmentId: 'assign-2' })],
      [actualTask({ assignmentId: 'assign-1' })],
      noSuppression(),
    );
    const create = plan.items.find((i) => i.operation === 'CREATE_TASK');
    expect(create?.enqueueKey).toBe(createKey('assign-2'));
    expect(create?.enqueueKey).not.toBe(createKey('assign-1'));
  });
});

describe('reconcile — suppression regimes', () => {
  it('suppresses when the work is already in flight', () => {
    const plan = reconcile(
      [desiredTask()],
      [],
      noSuppression({ live: new Set([createKey()]) }),
    );
    expect(plan.items).toEqual([]);
  });

  it('suppresses within the cooldown window', () => {
    const plan = reconcile(
      [desiredTask()],
      [],
      noSuppression({ cooldown: new Set([createKey()]) }),
    );
    expect(plan.items).toEqual([]);
  });

  it('re-proposes once the cooldown has elapsed — self-healing', () => {
    // The property an earlier revision destroyed by letting terminal rows hold
    // the key forever. A dead attempt must not become a permanent veto.
    const plan = reconcile([desiredTask()], [], noSuppression());
    expect(plan.items).toHaveLength(1);
  });

  it('ORPHANED absorbs permanently, with no time bound', () => {
    const plan = reconcile(
      [desiredTask()],
      [],
      noSuppression({ absorbed: new Set([createKey()]) }),
    );
    expect(plan.items).toEqual([]);
  });

  it('suppression is symmetric across create and close', () => {
    // The absorbing-key bug applied to both directions, so the fix must too.
    const suppressed = reconcile(
      [],
      [actualTask()],
      noSuppression({ absorbed: new Set([closeKey()]) }),
    );
    expect(suppressed.items).toEqual([]);

    const allowed = reconcile([], [actualTask()], noSuppression());
    expect(allowed.items).toHaveLength(1);
  });

  it('a create key and a close key for one assignment never collide', () => {
    expect(createKey()).not.toBe(closeKey());
    const plan = reconcile([], [actualTask()], noSuppression({ live: new Set([createKey()]) }));
    // A live CREATE must not suppress the CLOSE.
    expect(plan.items).toHaveLength(1);
  });
});

describe('reconcile — the DEAD cap', () => {
  it('stops proposing at the cap and reports it once', () => {
    const plan = reconcile(
      [desiredTask()],
      [],
      noSuppression({ deadCounts: new Map([[createKey(), DEAD_CAP]]) }),
    );
    expect(plan.items).toEqual([]);
    expect(plan.capNotifications).toEqual([
      { enqueueKey: createKey(), memberId: 'member-1', operation: 'CREATE_TASK' },
    ]);
  });

  it('still proposes below the cap', () => {
    const plan = reconcile(
      [desiredTask()],
      [],
      noSuppression({ deadCounts: new Map([[createKey(), DEAD_CAP - 1]]) }),
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.capNotifications).toEqual([]);
  });

  it('does not re-notify a key the member was already told about', () => {
    // Without this the stateless loop would emit a notification every interval
    // for the whole cap window — roughly 1440 a day.
    const plan = reconcile(
      [desiredTask()],
      [],
      noSuppression({
        deadCounts: new Map([[createKey(), DEAD_CAP]]),
        notified: new Set([createKey()]),
      }),
    );
    expect(plan.capNotifications).toEqual([]);
  });

  it('marks a capped CLOSE as stranding, distinct from a capped CREATE', () => {
    const plan = reconcile(
      [],
      [actualTask()],
      noSuppression({ deadCounts: new Map([[closeKey(), DEAD_CAP]]) }),
    );
    expect(plan.items).toEqual([]);
    // The caller uses `operation` to pick copy: a capped close leaves a task
    // open in the member's Todoist for a chore already finished.
    expect(plan.capNotifications[0]?.operation).toBe('CLOSE_TASK');
  });

  it('reports a capped key only once per pass even with repeated input', () => {
    const plan = reconcile(
      [desiredTask(), desiredTask()],
      [],
      noSuppression({ deadCounts: new Map([[createKey(), DEAD_CAP]]) }),
    );
    expect(plan.capNotifications).toHaveLength(1);
  });
});

describe('triggerEnabled — the key-case trap', () => {
  it('accepts the uppercase AssignmentKind values', () => {
    expect(triggerEnabled({ VOLUNTARY: true, RANDOM: true }, 'RANDOM')).toBe(true);
    expect(triggerEnabled({ VOLUNTARY: true, RANDOM: false }, 'RANDOM')).toBe(false);
  });

  it('rejects lowercase keys — the bug that would silently disable everything', () => {
    // An earlier revision defaulted to {"random":true,"voluntary":true} while
    // indexing with assignment.kind ("RANDOM"), so every lookup was undefined,
    // nothing was ever desired, and the whole feature did nothing at all.
    expect(triggerEnabled({ random: true, voluntary: true }, 'RANDOM')).toBe(false);
  });

  it('rejects junk rather than throwing', () => {
    expect(triggerEnabled(null, 'RANDOM')).toBe(false);
    expect(triggerEnabled('yes', 'RANDOM')).toBe(false);
    expect(triggerEnabled({ RANDOM: 'true' }, 'RANDOM')).toBe(false);
  });
});
