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
  /** When this assignment's completion happened, or `null` if it never did. */
  completedAt: Date | null;
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
           config_version      AS "configVersion",
           completed_at        AS "completedAt"
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
  /** Daily completion streak (intake "daily-completion-streak-bonus"). */
  streakLength: number;
  streakLastActiveDate: string | null;
  streakBonusPaidDate: string | null;
}

/**
 * The only lock a ledger write takes (§8.2 step 2). Ledger-only operations —
 * manual adjustment, decay, bonus — enter here and take nothing above, so they
 * can never be the waiting half of a cycle.
 *
 * Also the lock a completion's streak update takes (`completeTask.ts`): the
 * streak fields are ordinary member columns, not ledger rows, but they are
 * read-then-written across the same transaction a ledger write happens in, so
 * they need the same row lock a concurrent second completion by this member
 * would otherwise race past.
 */
export async function lockMember(
  tx: PrismaTx,
  householdId: string,
  memberId: string,
): Promise<MemberLockRow | null> {
  const rows = await tx.$queryRaw<MemberLockRow[]>`
    SELECT id,
           household_id             AS "householdId",
           points_cache             AS "pointsCache",
           is_active                AS "isActive",
           role::text               AS "role",
           display_name             AS "displayName",
           streak_length            AS "streakLength",
           streak_last_active_date  AS "streakLastActiveDate",
           streak_bonus_paid_date   AS "streakBonusPaidDate"
      FROM household_members
     WHERE id = ${memberId} AND household_id = ${householdId}
       FOR UPDATE`;
  return rows[0] ?? null;
}

// ───────────────────── levels 10-11: integrations ─────────────────────
//
// Diese Locks liegen VOLLSTÄNDIG ÜBER der Aufgaben-Leiter (§4.2). Die
// Begründung ist gerichtet, nicht symmetrisch:
//
//   - Kein Integrationspfad nimmt je ein Lock auf Level 0-3. Alles, was der
//     Dispatcher über eine Aufgabe wissen muss, wurde beim Einreihen in
//     `payload` gesnapshottet.
//   - Ein Insert in integration_outbox / integration_task_links nimmt über
//     seine Fremdschlüssel implizit FOR KEY SHARE auf task_instances und
//     household_members. Das kollidiert mit dem FOR UPDATE von `lockInstance`.
//     Ein Hintergrund-Insert kann also HINTER einem laufenden Freikauf WARTEN.
//   - Er kann aber nicht VERKLEMMEN, weil keine Kerntransaktion je auf eine
//     Integrationszeile wartet. Millisekunden Wartezeit in einem Hintergrundjob
//     sind unsichtbar.
//
// eslint-rules/index.js erzwingt die Reihenfolge statisch (10 vor 11).

export interface IntegrationLockRow {
  id: string;
  householdId: string;
  memberId: string;
  status: string;
  hasToken: boolean;
}

/**
 * Level 10. Sperrt die Verbindung eines Mitglieds, bevor ihr Status oder ihre
 * Zeitstempel geschrieben werden.
 *
 * FOR NO KEY UPDATE, nicht FOR UPDATE: ein reiner Statuswechsel ändert keinen
 * Schlüssel, und die schwächere Sperre kollidiert NICHT mit dem FOR KEY SHARE,
 * das ein gleichzeitiger Outbox-Insert über seinen Fremdschlüssel nimmt. Mit
 * FOR UPDATE wäre genau das ein vermeidbarer Konflikt.
 */
export async function lockIntegration(
  tx: PrismaTx,
  householdId: string,
  integrationId: string,
): Promise<IntegrationLockRow | null> {
  const rows = await tx.$queryRaw<IntegrationLockRow[]>`
    SELECT id,
           household_id AS "householdId",
           member_id    AS "memberId",
           status::text  AS "status",
           (token_ciphertext IS NOT NULL) AS "hasToken"
      FROM member_integrations
     WHERE id = ${integrationId} AND household_id = ${householdId}
       FOR NO KEY UPDATE`;
  return rows[0] ?? null;
}

export interface OutboxClaimRow {
  id: string;
  householdId: string;
  memberId: string;
  integrationId: string;
  operation: string;
  taskInstanceId: string;
  assignmentId: string;
  enqueueKey: string;
  attempts: number;
  externalTaskId: string | null;
  payload: unknown;
}

/**
 * Level 11. Beansprucht fällige Outbox-Zeilen eines Haushalts.
 *
 * `FOR UPDATE SKIP LOCKED`, damit ein zweiter Durchlauf nicht hinter dem ersten
 * blockiert, sondern die nächsten freien Zeilen nimmt. `household_id` ist Teil
 * des Prädikats — die household-scope-ESLint-Regel greift bei Roh-SQL NICHT
 * (sie matcht nur prisma.<model>.<method>), die Disziplin muss also hier im
 * Code stehen, so wie bei lockInstance.
 *
 * Reihenfolge nach created_at: damit bleibt CREATE vor CLOSE innerhalb einer
 * Verbindung erhalten.
 */
export async function lockOutboxBatch(
  tx: PrismaTx,
  householdId: string,
  now: Date,
  limit: number,
): Promise<OutboxClaimRow[]> {
  return tx.$queryRaw<OutboxClaimRow[]>`
    SELECT id,
           household_id     AS "householdId",
           member_id        AS "memberId",
           integration_id   AS "integrationId",
           operation::text  AS "operation",
           task_instance_id AS "taskInstanceId",
           assignment_id    AS "assignmentId",
           enqueue_key      AS "enqueueKey",
           attempts,
           external_task_id AS "externalTaskId",
           payload
      FROM integration_outbox
     WHERE household_id = ${householdId}
       AND status IN ('PENDING', 'FAILED')
       AND next_attempt_at <= ${now}
     ORDER BY created_at
     LIMIT ${limit}
       FOR UPDATE SKIP LOCKED`;
}
