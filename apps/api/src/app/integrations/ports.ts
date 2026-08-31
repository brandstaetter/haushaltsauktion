/**
 * Ports for the integration subsystem (Architektur Todoist §2).
 *
 * **These interfaces live in `app/` on purpose.** `eslint.config.js:84` forbids
 * `app/` from importing `infra/`, and `import/no-restricted-paths` does not
 * exempt type-only imports — so a port declared in `infra/` and consumed by a
 * use-case would be a build error, not a style question. The convention this
 * follows is the one already in `app/deps.ts`: the interface is declared here,
 * the implementation lives in `infra/`, and `main.ts` (which sits outside the
 * restricted zone) composes the two.
 *
 * `SecretBox` is therefore a **port, not a utility module**. Were `seal`/`open`
 * imported directly from `infra/integrations/secret-box.ts` by a use-case in
 * `app/integrations/`, that would be the same violation.
 *
 * `TodoistPort` (below) keeps the SDK's own types out of `app/` entirely: the
 * use-cases see only the shapes declared here, so swapping transport or SDK
 * version cannot ripple into orchestration.
 */

/**
 * A token encrypted at rest. Carries its own key version so a key can be
 * rotated without rewriting every row (§4).
 */
export interface SealedSecret {
  // `Uint8Array`, not `Buffer`: Prisma hands back `Uint8Array` for a `Bytes`
  // column, and `Buffer` is assignable to `Uint8Array` but not the reverse. The
  // port asks for the minimal type that works, so a caller never has to wrap a
  // database row just to satisfy an interface.
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
}

/**
 * Reversible, authenticated encryption for third-party credentials.
 *
 * **Not a hash, and not interchangeable with one.** `User.passwordHash` is
 * argon2id because the system never needs the original. A Todoist token must be
 * replayed to Todoist verbatim, so it needs encryption that can be undone.
 * Anyone "fixing" this into a hash breaks the integration entirely.
 */
export interface SecretBox {
  /** Encrypts with the highest configured key version. */
  seal(plaintext: string): SealedSecret;
  /**
   * Decrypts, verifying the GCM auth tag.
   *
   * Throws on a tampered ciphertext, a wrong key, or an unknown key version —
   * never returns a corrupted string, because a corrupted string here would be
   * sent to Todoist as a bearer token.
   */
  open(sealed: SealedSecret): string;
}

// ───────────────────────── Todoist ─────────────────────────

/**
 * How a Todoist failure must be treated (Architektur Todoist §8).
 *
 * Classification is by **HTTP status**, never by the body's `error_code` — a
 * live probe of `GET /api/v1/projects` returned `"error_code": 477` alongside
 * `"http_code": 401`, so `error_code` is a Todoist-internal number and
 * switching on it would be nonsense.
 */
export type TodoistFailureKind =
  /** 401/403 — the token is bad. Integration goes INVALID_CREDENTIALS; no retry storm. */
  | 'PERMANENT_AUTH'
  /** 400/422 or a rejected command — *our* request was malformed. §7's cap applies. */
  | 'PERMANENT_REQUEST'
  /** 429/5xx/network/timeout — retry with backoff. */
  | 'TRANSIENT'
  /** Closing a task Todoist no longer knows. Nothing to do; treat as done. */
  | 'BENIGN_GONE';

export interface TodoistFailure {
  kind: TodoistFailureKind;
  // `| undefined` throughout: the project sets `exactOptionalPropertyTypes`, so
  // an absent property and an explicitly-undefined one are different types.
  /** HTTP status, when there was a response. */
  status?: number | undefined;
  /** Todoist's `error_tag`, e.g. `AUTH_INVALID_TOKEN`. Diagnostics only. */
  errorTag?: string | undefined;
  /** `error_extra.event_id` — the handle Todoist support asks for. */
  eventId?: string | undefined;
  /**
   * Only ever set for a **429**.
   *
   * Deliberately not populated from any other status: the live probe showed
   * Todoist sends `Retry-After` on **401** too, so "header present ⇒ retryable"
   * would keep retrying a dead token forever and never surface it to the member.
   */
  retryAfterSeconds?: number | undefined;
  /** Safe to log. Never contains the token. */
  message: string;
}

export type TodoistResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: TodoistFailure };

/**
 * Outcome of an `item_add`.
 *
 * `ACCEPTED_WITHOUT_ID` is the case the architecture's §8.2 exists for: Todoist
 * reported the command `ok` but returned no `temp_id_mapping` entry, so the task
 * exists and we have irrecoverably lost the only handle to it. The caller must
 * map this to `OutboxStatus.ORPHANED` — the one absorbing terminal state.
 *
 * It is a distinct variant rather than a null id so the compiler forces the
 * caller to decide.
 */
export type CreateTaskOutcome =
  | { kind: 'CREATED'; externalTaskId: string }
  | { kind: 'ACCEPTED_WITHOUT_ID' };

export interface CreateTaskCommand {
  /** The outbox row id, sent verbatim as the Sync command `uuid`. */
  commandUuid: string;
  content: string;
  description: string;
  /** `null` = the member's Todoist Inbox. */
  projectId: string | null;
  dueAt: Date | null;
  /** `Household.timezone`, so an all-day due date lands on the right day. */
  timezone: string;
  priority?: number;
}

export interface CloseTaskCommand {
  commandUuid: string;
  externalTaskId: string;
}

export interface TodoistProject {
  id: string;
  name: string;
}

/**
 * The two writes go through the **Sync** endpoint, whose per-command `uuid`
 * gives exactly-once delivery; the read uses the official SDK. See §8.1 for why
 * that split, and why it deleted an entire repair subsystem.
 */
export interface TodoistPort {
  createTask(token: string, command: CreateTaskCommand): Promise<TodoistResult<CreateTaskOutcome>>;
  closeTask(token: string, command: CloseTaskCommand): Promise<TodoistResult<void>>;
  listProjects(token: string): Promise<TodoistResult<TodoistProject[]>>;
}
