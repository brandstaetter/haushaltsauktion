/**
 * Branded id types (Architektur §7.1 `shared/domain/ids.ts`).
 *
 * They are plain strings at runtime; the brand exists so that a `MemberId`
 * cannot be passed where a `TaskInstanceId` is expected. Values arriving from
 * the database or the wire are widened with the `as*` helpers, which are the
 * single documented place where the brand is applied.
 */

declare const brand: unique symbol;

type Branded<T extends string> = string & { readonly [brand]: T };

export type HouseholdId = Branded<'HouseholdId'>;
export type UserId = Branded<'UserId'>;
export type MemberId = Branded<'MemberId'>;
export type TaskCategoryId = Branded<'TaskCategoryId'>;
export type TaskDefinitionId = Branded<'TaskDefinitionId'>;
export type TaskInstanceId = Branded<'TaskInstanceId'>;
export type AssignmentId = Branded<'AssignmentId'>;
export type PointTransactionId = Branded<'PointTransactionId'>;

export const asHouseholdId = (v: string): HouseholdId => v as HouseholdId;
export const asUserId = (v: string): UserId => v as UserId;
export const asMemberId = (v: string): MemberId => v as MemberId;
export const asTaskCategoryId = (v: string): TaskCategoryId => v as TaskCategoryId;
export const asTaskDefinitionId = (v: string): TaskDefinitionId => v as TaskDefinitionId;
export const asTaskInstanceId = (v: string): TaskInstanceId => v as TaskInstanceId;
export const asAssignmentId = (v: string): AssignmentId => v as AssignmentId;
export const asPointTransactionId = (v: string): PointTransactionId => v as PointTransactionId;

/** §8.2 — the sentinel used instead of NULL for the first ledger entry (§8.3). */
export const GENESIS = 'GENESIS';
