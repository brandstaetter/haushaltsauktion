/**
 * Points and members (Architektur §3.7).
 *
 * `balance` always originates from the ledger (§14, §8): the API never returns
 * a number the client could have computed, and never accepts one.
 */

import type { MemberRole, PointTransactionType } from '../domain/enums.js';

export interface MemberDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
  isActive: boolean;
  /** Derived from the ledger (§8.4); repairable, never authoritative. */
  balance: number;
  maxRandomAssignmentsPerWeek: number | null;
}

export interface PointTransactionDto {
  id: string;
  seq: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: PointTransactionType;
  taskInstanceId: string | null;
  taskInstanceTitle: string | null;
  taskAssignmentId: string | null;
  description: string | null;
  createdAt: string;
  initiator: { memberId: string; displayName: string } | null;
}

export interface PointsBalanceDto {
  balance: number;
  asOf: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
