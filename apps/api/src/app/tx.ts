/**
 * Transaction boundary and row locks (Architektur §4.1, §4.2).
 *
 * `READ COMMITTED` plus explicit `SELECT … FOR UPDATE`. Not `SERIALIZABLE`:
 * at 1–20 members the contention is a single hot row, not read-write skew, and
 * pessimistic locking gives a clean "you lost" answer instead of a 40001 retry
 * storm the application would have to own (§43).
 *
 * **Lock ordering is the entire deadlock argument.** Locks are acquired in
 * strictly ascending level order and never downwards:
 *
 * | level | resource                      | helper              |
 * |-------|-------------------------------|---------------------|
 * | 0     | `pg_advisory_xact_lock(sweep)`| `acquireSweepLock`  |
 * | 1     | `task_instances` row          | `lockInstance`      |
 * | 2     | `task_assignments` row        | `lockAssignment`    |
 * | 3     | `household_members` row       | `lockMember`        |
 *
 * `eslint-rules/lock-order.js` checks this statically (§7.4), because the
 * property is static: buyout and completion both acquire 1→2→3, so the loser
 * simply blocks on the level-1 row until the winner commits.
 */

import { Prisma } from '@prisma/client';

import type { Deps, PrismaTx } from './deps.js';

/** §4.1 — one interactive transaction per operation. */
export async function withTransaction<T>(
  deps: Deps,
  fn: (tx: PrismaTx) => Promise<T>,
): Promise<T> {
  return deps.db.$transaction(fn, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 15_000,
    maxWait: 10_000,
  });
}

// ───────────────────────── level 0 ─────────────────────────

/**
 * The sweep's household-wide advisory lock.
 *
 * It is taken **before** any instance lock and held for one instance's
 * transaction, so two concurrent sweeps (the interval worker plus a manual
 * `POST /admin/assignments/run`) serialize per household. This matters because
 * the weekly cap and the fairness counters are read *outside* a row lock:
 * without it, two sweeps could both see "Anna has 2 of 3" and both pick her.
 */
export async function acquireSweepLock(tx: PrismaTx, householdId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sweep:${householdId}`}))`;
}

// ───────────────────────── level 1 ─────────────────────────

export interface InstanceLockRow {
  id: string;
  householdId: string;
  taskDefinitionId: string;
  status: string;
  currentValue: number;
  baseValue: number;
  buyoutCount: number;
  configVersion: number;
  version: number;
  scheduledFor: Date;
  dueAt: Date | null;
  offerExpiresAt: Date | null;
  publishedAt: Date | null;
}

/**
 * Prisma's typed API cannot express `FOR UPDATE`, so this is raw SQL. The
 * `household_id` predicate is part of the lock query rather than a later check:
 * a foreign instance is then indistinguishable from an absent one (§3.13), and
 * no row of another household is ever even locked.
 */
export async function lockInstance(
  tx: PrismaTx,
  householdId: string,
  instanceId: string,
): Promise<InstanceLockRow | null> {
  const rows = await tx.$queryRaw<InstanceLockRow[]>`
    SELECT id,
           household_id       AS "householdId",
           task_definition_id AS "taskDefinitionId",
           status::text       AS "status",
           current_value      AS "currentValue",
           base_value         AS "baseValue",
           buyout_count       AS "buyoutCount",
           config_version     AS "configVersion",
           version,
           scheduled_for      AS "scheduledFor",
           due_at             AS "dueAt",
           offer_expires_at   AS "offerExpiresAt",
           published_at       AS "publishedAt"
      FROM task_instances
     WHERE id = ${instanceId} AND household_id = ${householdId}
       FOR UPDATE`;
  return rows[0] ?? null;
}

// ───────────────────────── level 2 ─────────────────────────

export interface AssignmentLockRow {
  id: string;
  householdId: string;
  taskInstanceId: string;
  memberId: string;
  kind: string;
  status: string;
  response: string;
  valueAtAssignment: number;
  configVersion: number;
}

export async function lockAssignment(
  tx: PrismaTx,
  householdId: string,
  assignmentId: string,
): Promise<AssignmentLockRow | null> {
  const rows = await tx.$queryRaw<AssignmentLockRow[]>`
    SELECT id,
           household_id        AS "householdId",
           task_instance_id    AS "taskInstanceId",
           member_id           AS "memberId",
           kind::text          AS "kind",
           status::text        AS "status",
           response::text      AS "response",
           value_at_assignment AS "valueAtAssignment",
           config_version      AS "configVersion"
      FROM task_assignments
     WHERE id = ${assignmentId} AND household_id = ${householdId}
       FOR UPDATE`;
  return rows[0] ?? null;
}

/** The ACTIVE assignment of an instance, locked. Level 2. */
export async function lockActiveAssignmentOfInstance(
  tx: PrismaTx,
  householdId: string,
  instanceId: string,
): Promise<AssignmentLockRow | null> {
  const rows = await tx.$queryRaw<AssignmentLockRow[]>`
    SELECT id,
           household_id        AS "householdId",
           task_instance_id    AS "taskInstanceId",
           member_id           AS "memberId",
           kind::text          AS "kind",
           status::text        AS "status",
           response::text      AS "response",
           value_at_assignment AS "valueAtAssignment",
           config_version      AS "configVersion"
      FROM task_assignments
     WHERE household_id = ${householdId}
       AND task_instance_id = ${instanceId}
       AND status = 'ACTIVE'
       FOR UPDATE`;
  return rows[0] ?? null;
}

// ───────────────────────── level 3 ─────────────────────────

export interface MemberLockRow {
  id: string;
  householdId: string;
  pointsCache: number;
  isActive: boolean;
  role: string;
  displayName: string;
}

/**
 * The only lock a ledger write takes (§8.2 step 2). Ledger-only operations —
 * manual adjustment, decay, bonus — enter here and take nothing above, so they
 * can never be the waiting half of a cycle.
 */
export async function lockMember(
  tx: PrismaTx,
  householdId: string,
  memberId: string,
): Promise<MemberLockRow | null> {
  const rows = await tx.$queryRaw<MemberLockRow[]>`
    SELECT id,
           household_id  AS "householdId",
           points_cache  AS "pointsCache",
           is_active     AS "isActive",
           role::text    AS "role",
           display_name  AS "displayName"
      FROM household_members
     WHERE id = ${memberId} AND household_id = ${householdId}
       FOR UPDATE`;
  return rows[0] ?? null;
}
