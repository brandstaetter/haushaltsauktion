/**
 * The stable, machine-readable error vocabulary (Architektur §3.13).
 *
 * `code` never changes wording; `message` is German and safe to display;
 * `details` carries structured context so the UI can react rather than alert.
 */

import type { AssignmentKind, TaskStatus, MemberRole } from '../domain/enums.js';
import type { EligibilityReason } from '../domain/reasons.js';

export const ErrorCode = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  NOT_ASSIGNEE: 'NOT_ASSIGNEE',
  BUYOUT_DISABLED: 'BUYOUT_DISABLED',
  RELEASE_DISABLED: 'RELEASE_DISABLED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  TASK_NOT_AVAILABLE: 'TASK_NOT_AVAILABLE',
  STALE_VIEW: 'STALE_VIEW',
  ASSIGNMENT_CLOSED: 'ASSIGNMENT_CLOSED',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  NOT_RANDOM_ASSIGNMENT: 'NOT_RANDOM_ASSIGNMENT',
  NOT_VOLUNTARY: 'NOT_VOLUNTARY',
  QUOTE_STALE: 'QUOTE_STALE',
  INSUFFICIENT_POINTS: 'INSUFFICIENT_POINTS',
  BUYOUT_LIMIT_REACHED: 'BUYOUT_LIMIT_REACHED',
  BUYOUT_AT_VALUE_CAP: 'BUYOUT_AT_VALUE_CAP',
  CONFIG_VERSION_CONFLICT: 'CONFIG_VERSION_CONFLICT',
  HAS_OPEN_INSTANCES: 'HAS_OPEN_INSTANCES',
  CATEGORY_IN_USE: 'CATEGORY_IN_USE',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  LAST_ADMIN: 'LAST_ADMIN',
  RATE_LIMITED: 'RATE_LIMITED',

  /**
   * Third-party integrations.
   *
   * `INTEGRATION_UNAUTHORIZED` is deliberately NOT the existing
   * `INVALID_CREDENTIALS`, which means *login* credentials: overloading it
   * would make "your Todoist token is stale" indistinguishable from "your
   * session is bad" in the client, and the two need very different UI.
   */
  INTEGRATION_DISABLED: 'INTEGRATION_DISABLED',
  INTEGRATION_UNAUTHORIZED: 'INTEGRATION_UNAUTHORIZED',
  INTEGRATION_UNAVAILABLE: 'INTEGRATION_UNAVAILABLE',

  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const);
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface FieldError {
  path: string;
  message: string;
}

/** Structured `details` payloads, keyed by the code that produces them. */
export interface ErrorDetailsByCode {
  BAD_REQUEST: { fieldErrors: FieldError[] };
  FORBIDDEN: { requiredRole: MemberRole };
  NOT_ELIGIBLE: { reason: EligibilityReason };
  BUYOUT_DISABLED: { scope: 'GLOBAL' | 'TASK' };
  TASK_NOT_AVAILABLE: { currentStatus: TaskStatus; heldBy: string | null };
  STALE_VIEW: { currentVersion: number };
  ASSIGNMENT_CLOSED: { currentStatus: string };
  ILLEGAL_TRANSITION: { from: TaskStatus; event: string; allowedEvents: string[] };
  NOT_RANDOM_ASSIGNMENT: { kind: AssignmentKind };
  NOT_VOLUNTARY: { kind: AssignmentKind };
  INSUFFICIENT_POINTS: { balance: number; cost: number; minimumBalance: number };
  BUYOUT_LIMIT_REACHED: { used: number; limit: number; kind: 'WEEKLY' | 'CONSECUTIVE' };
  BUYOUT_AT_VALUE_CAP: { currentValue: number; maximumValue: number };
  CONFIG_VERSION_CONFLICT: { currentVersion: number };
  HAS_OPEN_INSTANCES: { count: number };
  CATEGORY_IN_USE: { count: number };
  EMAIL_ALREADY_REGISTERED: Record<string, never>;
  VALIDATION_FAILED: { fieldErrors: FieldError[] };
  CONFIG_INVALID: { fieldErrors: FieldError[]; formulaErrors: FieldError[] };
  RATE_LIMITED: { retryAfterSeconds: number };
  INTERNAL_ERROR: { correlationId: string };
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
