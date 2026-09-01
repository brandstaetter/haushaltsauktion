/**
 * History (Architektur §2.6, §3.8; CLAUDE.md §22).
 *
 * A discriminated union with typed payloads rather than pre-rendered sentences
 * (Reconciliation §1.4). The store holds structured data only; the German
 * wording lives in the web app's copy deck, which is what lets a task be
 * renamed without rewriting its history.
 */

import type { AssignmentKind, AssignmentStrategy, HistoryEventType } from '../domain/enums.js';
import type { RelaxableConstraint } from '../domain/reasons.js';

interface Event<T extends HistoryEventType, P> {
  type: T;
  payload: P;
}

export type HistoryEventPayload =
  | Event<'CREATED', { title: string; value: number }>
  | Event<'OFFERED', { title: string; value: number }>
  | Event<'NO_VOLUNTEER', { leadMinutesBeforeDue: number }>
  | Event<
      'RANDOMLY_ASSIGNED',
      { memberId: string; memberName: string; strategy: AssignmentStrategy; candidateCount: number }
    >
  | Event<'ASSIGNMENT_ACCEPTED', { memberId: string; memberName: string }>
  | Event<'CONSTRAINT_RELAXED', { constraint: RelaxableConstraint; reason: string }>
  | Event<'NO_ELIGIBLE_CANDIDATES', { consideredCount: number }>
  | Event<'VOLUNTEERED', { memberId: string; memberName: string; value: number }>
  | Event<
      'BOUGHT_OUT',
      { memberId: string; memberName: string; cost: number; transactionId: string }
    >
  | Event<'VALUE_INCREASED', { from: number; to: number; strategy: string; multiplier?: number }>
  | Event<'RE_OFFERED', { value: number; offerExpiresAt: string | null }>
  | Event<'RELEASED', { memberId: string; memberName: string }>
  | Event<'REVOKED', { memberId: string; memberName: string; reason: string | null }>
  | Event<'COMPLETED', { memberId: string; memberName: string; kind: AssignmentKind }>
  | Event<'POINTS_AWARDED', { memberId: string; amount: number; transactionId: string }>
  | Event<'POINTS_CLAWED_BACK', { memberId: string; amount: number; transactionId: string }>
  | Event<'VALUE_RESET', { from: number; to: number; strategy: string }>
  | Event<'EXPIRED', { value: number }>
  | Event<'CANCELLED', { reason: string | null }>
  | Event<'PAUSED', Record<string, never>>
  | Event<'RESUMED', Record<string, never>>;

export type HistoryEventDto = HistoryEventPayload & {
  id: string;
  seq: string;
  createdAt: string;
  taskInstanceId: string;
  taskTitle: string;
  member: { id: string; displayName: string } | null;
};
