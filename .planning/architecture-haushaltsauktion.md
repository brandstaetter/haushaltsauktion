# Architecture — Haushaltsauktion

Status: proposed, awaiting main-agent review
Authoritative requirements: `CLAUDE.md` (45-section German spec, cited as §n)
Approved decisions: `.planning/prd-haushaltsauktion.md` (cited as PRD §n)
Created: 2026-08-30

## 0. How to read this document

This document is **normative for implementation**. Where it conflicts with a
casual reading of the spec, the conflict is called out explicitly and resolved
in place; nothing is resolved silently.

| Part | Contains | Normative artifact |
|---|---|---|
| 1 | Domain model | the Prisma schema in §1.3 and the SQL constraints in §1.5 |
| 2 | State machine | the transition table in §2.2 and the legality matrix in §2.4 |
| 3 | API surface | the endpoint tables in §3.3–§3.11 and the error codes in §3.13 |
| 4 | Concurrency | the three transaction scripts in §4.3–§4.5 and the lock order in §4.2 |
| 5 | Configuration | the schema in §5.3 and the resolution rule in §5.5 |
| 6 | Formulas & strategies | the grammar in §6.1 and the strategy tables in §6.6–§6.8 |
| 7 | Module structure | the import matrix in §7.3 |
| 8 | Ledger integrity | `postTransaction` in §8.2 and `verifyLedgerIntegrity` in §8.5 |
| 9 | Open questions | numbered, each with a recommendation |

Language: identifiers, code and this document are English. User-facing strings
are German (PRD §7 — no i18n). History and notification records store
**structured data, never prose**, so the German rendering lives in the web app.

### 0.1 The four rules everything else serves

1. **Server-authoritative** (§36). The client never computes a binding number.
   Buyout cost, value increase, reward and eligibility are computed server-side
   and *sent to* the client for display.
2. **Ledger-only points** (§14). No code path writes a balance without writing a
   `PointTransaction` in the same transaction. There is exactly one function
   that touches balances (§8.2).
3. **Invariants are structural** (§44). Where a database constraint can make a
   violation impossible, it does — see §1.5. Where a config knob could break an
   invariant, the knob does not exist.
4. **No overengineering** (§43). 1–20 members, a few thousand instances a year.
   Pessimistic row locks beat optimistic retry loops; a hand-written 120-line
   expression parser beats a library; use-cases talk to Prisma directly instead
   of through repository ports.

---

# 1. Domain model

## 1.1 Entity map

```
Household ─┬─ HouseholdMember ──── User (identity plane, NOT household-scoped)
           │        │                 └── Session
           │        ├── MemberAbsence
           │        └── MemberCategoryExclusion ── TaskCategory
           ├─ HouseholdConfiguration   (append-only, versioned)
           ├─ TaskCategory
           ├─ TaskDefinition ──┬── TaskDefinitionEligibility ── HouseholdMember
           │                   └── TaskInstance ──┬── TaskAssignment ── PointTransaction
           │                                      └── TaskHistoryEvent
           ├─ PointTransaction   (the ledger — append-only)
           ├─ Notification
           └─ AuditEvent
```

## 1.2 Household scoping (§26)

Every household-scoped model carries a non-null `householdId` **and** a
composite index starting with it. Two models deliberately do not:

- **`User`** — §26 requires a person to be a member of several households. A
  `householdId` on `User` would make that impossible by construction. `User` is
  the identity plane; `HouseholdMember` is the household-plane projection of it.
- **`Session`** — belongs to a `User`, and carries `activeHouseholdId` as a
  *pointer* (nullable, non-authoritative) rather than as scoping.

Everything a member can read or write is reached through `HouseholdMember`, and
every query in the data layer takes `householdId` as its first predicate. See
§3.2 for how the request pipeline guarantees it.

## 1.3 Prisma schema

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────── enums ───────────────────────────────
// Strategy enums (buyout cost, value increase, assignment, reset, rounding,
// decay) are NOT Prisma enums — they live inside the configuration JSON and are
// typed by Zod in packages/shared. Only persisted columns get Prisma enums.

enum MemberRole            { MEMBER  ADMIN }
enum TaskStatus            { DRAFT  AVAILABLE  ASSIGNED  COMPLETED  CANCELLED  PAUSED  EXPIRED }
enum AssignmentKind        { VOLUNTARY  RANDOM }
enum AssignmentStatus      { ACTIVE  COMPLETED  BOUGHT_OUT  RELEASED  REVOKED  EXPIRED }
enum AssignmentResponse    { PENDING  ACCEPTED }
enum EligibilityMode       { INCLUDED  EXCLUDED }
enum RecurrenceType        { ONCE  DAILY  WEEKDAYS  WEEKLY  EVERY_N_DAYS  MONTHLY  MANUAL }
enum ActorType             { MEMBER  ADMIN  SYSTEM }

enum PointTransactionType {
  VOLUNTARY_TASK_REWARD
  BUYOUT
  MANUAL_ADJUSTMENT
  DECAY
  BONUS
  PENALTY
  CORRECTION
}

enum HistoryEventType {
  CREATED
  OFFERED
  VOLUNTEERED
  NO_VOLUNTEER
  RANDOMLY_ASSIGNED
  ASSIGNMENT_ACCEPTED
  CONSTRAINT_RELAXED
  NO_ELIGIBLE_CANDIDATES
  BOUGHT_OUT
  VALUE_INCREASED
  RE_OFFERED
  RELEASED
  REVOKED
  COMPLETED
  POINTS_AWARDED
  POINTS_CLAWED_BACK
  VALUE_RESET
  EXPIRED
  CANCELLED
  PAUSED
  RESUMED
}

enum NotificationType {
  TASK_AVAILABLE
  TASK_ASSIGNED
  TASK_DUE_SOON
  TASK_VALUE_INCREASED
  TASK_COMPLETED
  ADMIN_NO_CANDIDATES
}

enum AuditAction {
  LOGIN_SUCCEEDED
  LOGIN_FAILED
  CONFIG_UPDATED
  MEMBER_CREATED
  MEMBER_UPDATED
  MEMBER_DEACTIVATED
  ROLE_CHANGED
  RESTRICTIONS_UPDATED
  POINTS_ADJUSTED
  LEDGER_CACHE_REPAIRED
  CATEGORY_CREATED
  CATEGORY_UPDATED
  TASK_DEFINITION_CREATED
  TASK_DEFINITION_UPDATED
  TASK_DEFINITION_ARCHIVED
  INSTANCE_MATERIALIZED
  INSTANCE_PUBLISHED
  INSTANCE_CANCELLED
  INSTANCE_PAUSED
  INSTANCE_RESUMED
  INSTANCE_EXPIRED
  ASSIGNMENT_SWEEP_RUN
  RANDOM_SELECTION
  ASSIGNMENT_REVOKED
  BUYOUT_EXECUTED
  TASK_COMPLETED
}

// ───────────────────────── identity plane ─────────────────────────

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String                       // argon2id, PRD §2
  displayName  String
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships  HouseholdMember[]
  sessions     Session[]

  @@map("users")
}

model Session {
  id                String   @id @default(cuid())
  userId            String
  tokenHash         String   @unique         // sha256 of the opaque cookie value
  csrfTokenHash     String                   // double-submit companion, §3.1
  activeHouseholdId String?                  // pointer only, re-authorized per request
  createdAt         DateTime @default(now())
  lastSeenAt        DateTime @default(now())
  expiresAt         DateTime
  revokedAt         DateTime?
  ipAddress         String?
  userAgent         String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}

// ───────────────────────── household plane ─────────────────────────

model Household {
  id        String   @id @default(cuid())
  name      String
  timezone  String   @default("Europe/Berlin")  // §5.6 window semantics, OQ-6
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members        HouseholdMember[]
  configurations HouseholdConfiguration[]
  categories     TaskCategory[]
  definitions    TaskDefinition[]
  instances      TaskInstance[]
  assignments    TaskAssignment[]
  transactions   PointTransaction[]
  historyEvents  TaskHistoryEvent[]
  notifications  Notification[]
  auditEvents    AuditEvent[]

  @@map("households")
}

model HouseholdMember {
  id          String     @id @default(cuid())
  householdId String
  userId      String
  displayName String                                 // §3.1 — may differ per household
  avatarUrl   String?
  role        MemberRole @default(MEMBER)
  isActive    Boolean    @default(true)              // §3.1 aktiv/inaktiv

  /// Derived cache of the ledger. NEVER written outside postTransaction (§8.2).
  /// The ledger is the source of truth (§14, PRD §3G).
  pointsCache Int        @default(0)

  /// §3.1 participation restriction: cap on random assignments per week (§5.6).
  maxRandomAssignmentsPerWeek Int?

  joinedAt    DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  household           Household                  @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user                User                       @relation(fields: [userId],      references: [id], onDelete: Restrict)
  absences            MemberAbsence[]
  categoryExclusions  MemberCategoryExclusion[]
  taskEligibility     TaskDefinitionEligibility[]
  assignments         TaskAssignment[]
  transactions        PointTransaction[]         @relation("LedgerOwner")
  initiatedTx         PointTransaction[]         @relation("LedgerInitiator")
  historyEvents       TaskHistoryEvent[]
  notifications       Notification[]
  auditEvents         AuditEvent[]
  completedInstances  TaskInstance[]             @relation("CompletedBy")
  authoredConfigs     HouseholdConfiguration[]

  @@unique([householdId, userId])
  @@index([householdId, isActive])
  @@map("household_members")
}

model MemberAbsence {
  id          String   @id @default(cuid())
  householdId String
  memberId    String
  startsAt    DateTime
  endsAt      DateTime
  reason      String?
  createdAt   DateTime @default(now())

  member HouseholdMember @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([householdId, memberId, startsAt, endsAt])
  @@map("member_absences")
}

model TaskCategory {
  id          String   @id @default(cuid())
  householdId String
  name        String
  colorHex    String?
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  household   Household                 @relation(fields: [householdId], references: [id], onDelete: Cascade)
  definitions TaskDefinition[]
  exclusions  MemberCategoryExclusion[]

  @@unique([householdId, name])
  @@map("task_categories")
}

model MemberCategoryExclusion {
  householdId String
  memberId    String
  categoryId  String
  createdAt   DateTime @default(now())

  member   HouseholdMember @relation(fields: [memberId],   references: [id], onDelete: Cascade)
  category TaskCategory    @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([memberId, categoryId])
  @@index([householdId, categoryId])
  @@map("member_category_exclusions")
}

// ───────────────────────── configuration ─────────────────────────

/// Append-only. The active configuration is MAX(version) for the household.
/// Rollback = append a copy of an older version (§5.2).
model HouseholdConfiguration {
  id                String   @id @default(cuid())
  householdId       String
  version           Int
  values            Json                    // validated by HouseholdConfigSchema (§5.3)
  changeSummary     Json?                   // structured diff vs. previous version
  createdAt         DateTime @default(now())
  createdByMemberId String?

  household Household        @relation(fields: [householdId],       references: [id], onDelete: Cascade)
  createdBy HouseholdMember? @relation(fields: [createdByMemberId], references: [id], onDelete: SetNull)

  instances   TaskInstance[]
  assignments TaskAssignment[]

  @@unique([householdId, version])
  @@index([householdId, version(sort: Desc)])
  @@map("household_configurations")
}

// ───────────────────────── tasks ─────────────────────────

/// The recurring "Bad putzen – jeden Samstag" template (§27).
/// It owns baseValue and the recurrence rule. It NEVER owns currentValue.
model TaskDefinition {
  id          String  @id @default(cuid())
  householdId String
  title       String
  description String?
  categoryId  String?

  /// §3.2 Basiswert. The reset target for every instance of this definition.
  baseValue        Int
  estimatedMinutes Int?
  isActive         Boolean @default(true)     // §3.2 Aktivstatus
  buyoutEnabled    Boolean @default(true)     // §8 "Freikauf bei bestimmten Aufgaben deaktiviert"

  // §18 recurrence — explicit fields, not RRULE (see §1.4).
  recurrenceType     RecurrenceType @default(ONCE)
  recurrenceInterval Int?                     // N, for EVERY_N_DAYS
  recurrenceWeekdays Int[]          @default([]) // 1=Mon .. 7=Sun, for WEEKDAYS / WEEKLY anchor
  recurrenceDayOfMonth Int?                   // 1..28, for MONTHLY
  recurrenceTimeOfDay  String?                // "HH:mm" in household timezone
  dueOffsetMinutes     Int?                   // dueAt = occurrenceStart + offset

  /// §11 resetStrategy carry-over. null ⇒ next instance starts at baseValue.
  /// Only ever non-null under KEEP_CURRENT / DECREASE_PERCENTAGE (§5.7, OQ-1).
  carriedValue Int?

  lastCompletedAt DateTime?                   // §3.2 letzte Erledigung
  nextDueAt       DateTime?                   // §3.2 nächste Fälligkeit
  archivedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  household   Household                  @relation(fields: [householdId], references: [id], onDelete: Cascade)
  category    TaskCategory?              @relation(fields: [categoryId],  references: [id], onDelete: SetNull)
  eligibility TaskDefinitionEligibility[]
  instances   TaskInstance[]

  @@index([householdId, isActive, nextDueAt])
  @@map("task_definitions")
}

/// §3.2 "mögliche Personen" / "ausgeschlossene Personen" in one table.
/// If any INCLUDED row exists for a definition, the pool is restricted to those.
/// EXCLUDED rows always subtract, and win over INCLUDED (§6.9).
model TaskDefinitionEligibility {
  taskDefinitionId String
  memberId         String
  householdId      String
  mode             EligibilityMode
  createdAt        DateTime @default(now())

  definition TaskDefinition  @relation(fields: [taskDefinitionId], references: [id], onDelete: Cascade)
  member     HouseholdMember @relation(fields: [memberId],         references: [id], onDelete: Cascade)

  @@id([taskDefinitionId, memberId])
  @@index([householdId, memberId])
  @@map("task_definition_eligibility")
}

/// One concrete occurrence: "Bad putzen – 29.08.2026" (§27).
/// currentValue lives here and nowhere else.
model TaskInstance {
  id               String     @id @default(cuid())
  householdId      String
  taskDefinitionId String

  status       TaskStatus @default(DRAFT)

  /// §3.2 aktueller Wert. Escalates on buyout, resets on completion (§11).
  currentValue Int
  /// Snapshotted from TaskDefinition.baseValue at materialization so that an
  /// admin editing the definition mid-cycle cannot move the reset target of an
  /// instance already in flight. Display-only fields are NOT snapshotted.
  baseValue    Int

  buyoutCount  Int        @default(0)      // §20 "bisherige Freikäufe"; formula variable

  scheduledFor    DateTime                 // the occurrence this instance represents
  dueAt           DateTime?                // §3.2 optional Fälligkeit
  offerExpiresAt  DateTime?                // §6 — when the random sweep may take it
  publishedAt     DateTime?
  completedAt     DateTime?
  completedByMemberId String?
  closedAt        DateTime?                // set for COMPLETED / CANCELLED / EXPIRED

  /// Config pinned at publication. Governs offer duration and reset strategy
  /// when no assignment exists. See the resolution rule in §5.5.
  configVersion Int

  /// Compare-and-set token. Incremented on EVERY status or value change (§4.3).
  /// Doubles as the ETag exposed to the client for stale-view detection.
  version Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  household     Household              @relation(fields: [householdId],      references: [id], onDelete: Cascade)
  definition    TaskDefinition         @relation(fields: [taskDefinitionId], references: [id], onDelete: Restrict)
  completedBy   HouseholdMember?       @relation("CompletedBy", fields: [completedByMemberId], references: [id], onDelete: SetNull)
  config        HouseholdConfiguration @relation(fields: [householdId, configVersion], references: [householdId, version], onDelete: Restrict)

  assignments   TaskAssignment[]
  historyEvents TaskHistoryEvent[]
  transactions  PointTransaction[]
  notifications Notification[]

  @@index([householdId, status, offerExpiresAt])
  @@index([householdId, status, dueAt])
  @@index([taskDefinitionId, status])
  @@map("task_instances")
}

/// One offer accepted or imposed. At most ONE may be ACTIVE per instance —
/// enforced by the activeForInstanceId sentinel unique index (§1.5).
model TaskAssignment {
  id             String             @id @default(cuid())
  householdId    String
  taskInstanceId String
  memberId       String

  kind   AssignmentKind
  status AssignmentStatus   @default(ACTIVE)
  response AssignmentResponse @default(PENDING)   // §21 "Aufgabe übernehmen", OQ-3

  /// Sentinel: equals taskInstanceId while ACTIVE, NULL once closed.
  /// UNIQUE ⇒ a second concurrent assignment is a 23505, not a double-booking.
  activeForInstanceId String? @unique

  /// The instance's currentValue at the moment of assignment. What the member
  /// was shown. Used to detect quote drift.
  valueAtAssignment Int

  /// Config pinned at assignment creation (PRD §6). Governs buyout cost, value
  /// increase, reward multiplier and reset strategy for THIS assignment.
  configVersion Int

  /// Only for kind = RANDOM. Feeds GET /assignments/:id/explain (§32).
  /// Shape: SelectionTrace (§6.10). Never contains the raw random draw.
  selectionTrace Json?

  // Buyout outcome. CHECK enforces valueAfterBuyout > valueBeforeBuyout (§1.5).
  buyoutCost        Int?
  valueBeforeBuyout Int?
  valueAfterBuyout  Int?

  assignedAt  DateTime  @default(now())
  respondedAt DateTime?
  completedAt DateTime?
  closedAt    DateTime?

  household  Household              @relation(fields: [householdId],    references: [id], onDelete: Cascade)
  instance   TaskInstance           @relation(fields: [taskInstanceId], references: [id], onDelete: Cascade)
  member     HouseholdMember        @relation(fields: [memberId],       references: [id], onDelete: Restrict)
  config     HouseholdConfiguration @relation(fields: [householdId, configVersion], references: [householdId, version], onDelete: Restrict)

  transactions  PointTransaction[]
  historyEvents TaskHistoryEvent[]

  /// Target of PointTransaction's composite FK. Makes it structurally
  /// impossible to attach a VOLUNTARY_TASK_REWARD to a RANDOM assignment (§1.5).
  @@unique([id, kind])
  @@index([householdId, memberId, status])
  @@index([taskInstanceId, status])
  @@index([householdId, kind, assignedAt])
  @@map("task_assignments")
}

// ───────────────────────── ledger ─────────────────────────

/// Append-only. The source of truth for every point balance (§14, PRD §3G).
/// The runtime database role has no UPDATE/DELETE grant on this table (§8.6).
model PointTransaction {
  id          String  @id @default(cuid())
  /// Global monotonic order. createdAt can tie; seq cannot.
  seq         BigInt  @default(autoincrement())
  householdId String
  memberId    String

  amount        Int    // signed; sign rules enforced by CHECK per type (§1.5)
  balanceBefore Int
  balanceAfter  Int    // CHECK (balanceAfter = balanceBefore + amount)

  type PointTransactionType

  /// Hash-chain-lite. 'GENESIS' for a member's first entry, otherwise the id of
  /// the previous entry for that member. UNIQUE(memberId, previousTransactionId)
  /// makes forking the chain impossible even if a row lock were lost (§8.3).
  previousTransactionId String

  /// Deduplication for retried writes: 'reward:<assignmentId>',
  /// 'buyout:<assignmentId>', 'clawback:<assignmentId>', 'decay:<memberId>:<periodKey>'.
  idempotencyKey String? @unique

  taskInstanceId   String?
  taskAssignmentId String?
  /// Denormalized from TaskAssignment.kind and bound to it by a composite FK,
  /// so a CHECK can forbid rewards on random assignments (§1.5, §44).
  assignmentKind   AssignmentKind?

  description       String?
  initiatorMemberId String?          // null ⇒ SYSTEM (§14 "Initiator")
  initiatorType     ActorType  @default(MEMBER)
  createdAt         DateTime   @default(now())

  household   Household        @relation(fields: [householdId], references: [id], onDelete: Cascade)
  member      HouseholdMember  @relation("LedgerOwner",     fields: [memberId],          references: [id], onDelete: Restrict)
  initiator   HouseholdMember? @relation("LedgerInitiator", fields: [initiatorMemberId], references: [id], onDelete: SetNull)
  instance    TaskInstance?    @relation(fields: [taskInstanceId], references: [id], onDelete: Restrict)
  assignment  TaskAssignment?  @relation(fields: [taskAssignmentId, assignmentKind], references: [id, kind], onDelete: Restrict)

  @@unique([memberId, previousTransactionId])
  @@index([householdId, memberId, seq])
  @@index([householdId, createdAt])
  @@index([taskAssignmentId])
  @@map("point_transactions")
}

// ───────────────────────── history, notifications, audit ─────────────────────────

/// The member-facing timeline of §22. Structured, not prose.
model TaskHistoryEvent {
  id             String           @id @default(cuid())
  seq            BigInt           @default(autoincrement())
  householdId    String
  taskInstanceId String
  assignmentId   String?
  memberId       String?
  type           HistoryEventType
  /// Typed per event kind — see the payload table in §2.5.
  payload        Json
  createdAt      DateTime         @default(now())

  household  Household       @relation(fields: [householdId],    references: [id], onDelete: Cascade)
  instance   TaskInstance    @relation(fields: [taskInstanceId], references: [id], onDelete: Cascade)
  assignment TaskAssignment? @relation(fields: [assignmentId],   references: [id], onDelete: SetNull)
  member     HouseholdMember? @relation(fields: [memberId],      references: [id], onDelete: SetNull)

  @@index([householdId, seq])
  @@index([taskInstanceId, seq])
  @@map("task_history_events")
}

model Notification {
  id             String           @id @default(cuid())
  householdId    String
  memberId       String
  type           NotificationType
  payload        Json
  taskInstanceId String?
  readAt         DateTime?
  createdAt      DateTime         @default(now())

  household Household       @relation(fields: [householdId],    references: [id], onDelete: Cascade)
  member    HouseholdMember @relation(fields: [memberId],       references: [id], onDelete: Cascade)
  instance  TaskInstance?   @relation(fields: [taskInstanceId], references: [id], onDelete: Cascade)

  @@index([householdId, memberId, readAt, createdAt])
  @@map("notifications")
}

/// §23. Admin/system-facing. Distinct from TaskHistoryEvent, which is what a
/// family member reads. Append-only; no DELETE grant at runtime (§8.6).
model AuditEvent {
  id            String      @id @default(cuid())
  seq           BigInt      @default(autoincrement())
  householdId   String
  actorType     ActorType
  actorMemberId String?
  action        AuditAction
  entityType    String
  entityId      String?
  /// { before?, after?, diff?, reason?, ... } — see §6.10 for RANDOM_SELECTION.
  payload       Json
  ipAddress     String?
  createdAt     DateTime    @default(now())

  household Household        @relation(fields: [householdId],   references: [id], onDelete: Cascade)
  actor     HouseholdMember? @relation(fields: [actorMemberId], references: [id], onDelete: SetNull)

  @@index([householdId, seq])
  @@index([householdId, action, createdAt])
  @@index([householdId, entityType, entityId])
  @@map("audit_events")
}
```

## 1.4 Modelling decisions and why

| Decision | Rationale |
|---|---|
| `currentValue` on `TaskInstance` only | §27 and the user's explicit callout. Escalation is a property of *this Saturday's* bathroom clean, not of the chore itself. |
| `baseValue` snapshotted onto the instance | §11 resets to base. If the reset target lived only on the definition, an admin edit mid-cycle would silently change the payout of an in-flight instance. Snapshot what the business logic reads; reference what is only displayed. |
| Title/description NOT snapshotted | Display-only. `TaskHistoryEvent.payload` carries the title at event time, so §22's history stays readable after a rename without denormalizing every instance. |
| Explicit recurrence columns, not RRULE | §18 lists exactly seven cases. An RRULE dependency plus a parser is more surface than the feature is worth (§43). See the semantics table below. |
| `TaskDefinitionEligibility` as one table with a `mode` | §3.2 needs both an allowlist and a denylist, and §6 needs the per-member view of the same relation. One table, two modes, one index each way. |
| `MemberAbsence` as a window, not a boolean | §3.1 "vorübergehend nicht verfügbar" needs an end date, or somebody stays excluded forever after a holiday. |
| `activeForInstanceId` sentinel instead of a partial unique index | Postgres partial unique indexes are not expressible in the Prisma DSL. A nullable column with `@unique` gives the identical guarantee (NULLs do not conflict) and stays in the schema file where reviewers see it. |
| `PointTransaction.previousTransactionId` | Turns "the ledger is a chain" from a convention into a uniqueness constraint. One nullable-free column, one index. §8.3. |
| Composite FK `(taskAssignmentId, assignmentKind)` | The only trigger-free way to let a CHECK constraint see the assignment's kind. Makes §44's headline invariant a database fact. |
| `version` on `TaskInstance` | The compare-and-set predicate (§4.3) and the client-facing ETag. Distinguishes "someone beat you" from "your screen is stale" — two different messages for the user (§3.13). |
| No `OVERDUE` status | It is derivable (`dueAt < now AND status IN (AVAILABLE, ASSIGNED)`). Persisting it would double every transition in §2 and add a background job whose only output is a badge colour. Exposed as a computed `isOverdue` flag on the DTO. |
| `COMPLETED` is terminal to every ordinary event — reopenable only by an admin's explicit rejection | **Superseded 2026-08-31**: an admin who judges a completion unsatisfactory can reject it. The clawback is still a `CORRECTION` ledger entry plus an `AuditEvent`, exactly as originally decided — but the admin also chooses one of two narrow, audited state-machine events that *do* leave `COMPLETED`: `REOPEN_TO_ASSIGNEE` (→ `ASSIGNED`, a fresh `VOLUNTARY` assignment for the same member, so a genuine redo earns the normal reward) or `REOPEN_TO_MARKET` (→ `AVAILABLE`, re-offered to anyone, same shape as a release/revoke re-offer). No *ordinary* event (VOLUNTEER, ASSIGN_RANDOM, PUBLISH, RESUME, …) is legal from `COMPLETED` — only these two, and only through that one moderation use-case. Implementation: `apps/api/src/app/tasks/rejectCompletion.ts`, `apps/api/src/domain/task/state-machine.ts`. The matrix and diagram below predate this change and are not re-transcribed here. |

### Recurrence semantics (§18)

All computed in `Household.timezone`, at `recurrenceTimeOfDay` (default 06:00).

| `recurrenceType` | Fields used | Next occurrence after `t` |
|---|---|---|
| `ONCE` | — | none; the definition is archived after its instance closes |
| `DAILY` | — | next calendar day |
| `WEEKDAYS` | `recurrenceWeekdays[]` | next listed weekday strictly after `t` (e.g. Müll = `[1,4]`) |
| `WEEKLY` | `recurrenceWeekdays[0]` | same weekday next week |
| `EVERY_N_DAYS` | `recurrenceInterval` | `t + N` days |
| `MONTHLY` | `recurrenceDayOfMonth` (1–28) | that day next month |
| `MANUAL` | — | never automatic; admin calls `POST /admin/task-definitions/:id/materialize` |

`recurrenceDayOfMonth` is capped at 28 so no month is skipped and no DST/short-
month special case is needed. Materialization anchors on the **scheduled**
occurrence, not on `lastCompletedAt`, so a missed week does not shift the series.

## 1.5 Database constraints not expressible in the Prisma DSL

Added by a raw-SQL step in the initial migration
(`prisma/migrations/.../constraints.sql`). These are the structural enforcement
of §44 — each one makes an invariant violation a database error rather than a
test failure.

```sql
-- ── §44: a buyout costs points; a reward gives points ──
ALTER TABLE point_transactions
  ADD CONSTRAINT pt_balance_arithmetic
  CHECK (balance_after = balance_before + amount);

ALTER TABLE point_transactions
  ADD CONSTRAINT pt_buyout_costs_points
  CHECK (type <> 'BUYOUT' OR amount < 0);

ALTER TABLE point_transactions
  ADD CONSTRAINT pt_reward_gives_points
  CHECK (type <> 'VOLUNTARY_TASK_REWARD' OR amount > 0);

ALTER TABLE point_transactions
  ADD CONSTRAINT pt_decay_never_positive
  CHECK (type <> 'DECAY' OR amount <= 0);

-- ── §44 headline: a randomly assigned, completed task yields no points ──
-- assignment_kind is bound to the referenced assignment by the composite FK, so
-- this CHECK cannot be bypassed by lying about the kind.
ALTER TABLE point_transactions
  ADD CONSTRAINT pt_reward_only_for_voluntary
  CHECK (type <> 'VOLUNTARY_TASK_REWARD' OR assignment_kind = 'VOLUNTARY');

-- Every work-derived transaction must name the assignment it came from.
ALTER TABLE point_transactions
  ADD CONSTRAINT pt_work_tx_has_assignment
  CHECK (type NOT IN ('VOLUNTARY_TASK_REWARD','BUYOUT') OR task_assignment_id IS NOT NULL);

-- ── §44: a buyout raises the current value ──
ALTER TABLE task_assignments
  ADD CONSTRAINT ta_buyout_raises_value
  CHECK (value_after_buyout IS NULL OR value_after_buyout > value_before_buyout);

ALTER TABLE task_assignments
  ADD CONSTRAINT ta_buyout_fields_together
  CHECK ((status = 'BOUGHT_OUT') = (buyout_cost IS NOT NULL));

ALTER TABLE task_assignments
  ADD CONSTRAINT ta_buyout_cost_positive
  CHECK (buyout_cost IS NULL OR buyout_cost > 0);

-- ── at most one ACTIVE assignment per instance ──
-- (the UNIQUE index on active_for_instance_id is generated by Prisma;
--  these two keep the sentinel honest)
ALTER TABLE task_assignments
  ADD CONSTRAINT ta_active_sentinel_set_iff_active
  CHECK ((status = 'ACTIVE') = (active_for_instance_id IS NOT NULL));

ALTER TABLE task_assignments
  ADD CONSTRAINT ta_active_sentinel_matches_instance
  CHECK (active_for_instance_id IS NULL OR active_for_instance_id = task_instance_id);

-- ── value sanity ──
ALTER TABLE task_instances
  ADD CONSTRAINT ti_values_non_negative
  CHECK (current_value >= 0 AND base_value >= 0);

ALTER TABLE task_definitions
  ADD CONSTRAINT td_base_value_non_negative
  CHECK (base_value >= 0);

ALTER TABLE task_definitions
  ADD CONSTRAINT td_recurrence_day_of_month_range
  CHECK (recurrence_day_of_month IS NULL
         OR (recurrence_day_of_month BETWEEN 1 AND 28));

ALTER TABLE member_absences
  ADD CONSTRAINT ma_window_ordered CHECK (ends_at > starts_at);
```

### What is deliberately *not* a constraint

- **"Completion resets the value to base."** It depends on the pinned
  configuration, so it is not a row-local predicate. It is enforced by the
  single `resetValue()` function (§6.7) called from the one completion
  transaction (§4.5), and asserted by end-condition 13.
- **"Points arise only from voluntary work."** Partly structural
  (`pt_reward_only_for_voluntary`), partly by *omission*: there is no
  configuration key anywhere that grants points for a random completion. See
  §5.4.

---

# 2. State machine — `TaskInstance`

## 2.1 States

| State | Meaning | Terminal | Has ACTIVE assignment |
|---|---|---|---|
| `DRAFT` | Materialized but not yet offered. Admin can still edit. | no | no |
| `AVAILABLE` | Offered to the household. Anyone eligible may volunteer (§5). After `offerExpiresAt` the sweep may impose it (§6). | no | no |
| `ASSIGNED` | Exactly one member holds it, voluntarily or by draw. | no | **yes** |
| `COMPLETED` | Done. Value reset applied (§11). | **yes** | no |
| `CANCELLED` | Admin called it off. No points, no value change. | **yes** | no |
| `PAUSED` | Admin suspended it. Not offered, not assignable, not swept. | no | no |
| `EXPIRED` | The occurrence passed without completion. Value reset to base (PRD §3F). | **yes** | no |

`EXPIRED` is **required**, not optional. PRD §3F states that an instance which
expires uncompleted resets its value; without a distinct state, "the daily
dishwasher nobody did yesterday" would either linger as `AVAILABLE` forever or
be indistinguishable from a completed one in the history.

`OVERDUE` is **not** a state — see §1.4.

## 2.2 Transition table (normative)

`cfg` = the configuration resolved per §5.5. `now` = injected `Clock.now()`.
Side effects listed here happen *inside the same transaction* as the state change.

| # | From | Event | To | Guards | Side effects | Actor |
|---|---|---|---|---|---|---|
| T1 | — | `MATERIALIZE` | `DRAFT` | definition active and not archived; open-instance cap not exceeded (`tasks.maxOpenInstancesPerDefinition`, §5.3) | create instance; `currentValue = definition.carriedValue ?? definition.baseValue`; `baseValue = definition.baseValue`; pin `configVersion`; history `CREATED`; audit `INSTANCE_MATERIALIZED` | SYSTEM / ADMIN |
| T2 | `DRAFT` | `PUBLISH` | `AVAILABLE` | instance not closed | set `publishedAt = now`, `offerExpiresAt` per §5.8; history `OFFERED {value}`; notify eligible members `TASK_AVAILABLE`; audit `INSTANCE_PUBLISHED` | SYSTEM / ADMIN |
| T3 | `AVAILABLE` | `VOLUNTEER` | `ASSIGNED` | caller passes the **hard** eligibility rules (§6.9 rules 1–5; caps and cooldowns do not block volunteering); no ACTIVE assignment exists | create assignment `kind=VOLUNTARY, response=ACCEPTED, valueAtAssignment=currentValue`, pin `configVersion`; history `VOLUNTEERED`; if `cfg.voluntary.rewardTiming = ON_ACCEPT` and `rewardEnabled`: credit via §8.2 + history `POINTS_AWARDED` | MEMBER |
| T4 | `AVAILABLE` | `ASSIGN_RANDOM` | `ASSIGNED` | `now >= offerExpiresAt`; eligible set non-empty after the relaxation ladder (§6.9); household advisory lock held | select per `cfg.assignment.strategy` (§6.8); create assignment `kind=RANDOM, response=PENDING`, store `selectionTrace`; history `NO_VOLUNTEER`, `RANDOMLY_ASSIGNED`, optionally `CONSTRAINT_RELAXED`; audit `RANDOM_SELECTION` with the full candidate set (§6); notify assignee `TASK_ASSIGNED` | SYSTEM |
| T5 | `AVAILABLE` | `ASSIGN_RANDOM` (no candidates) | `AVAILABLE` (no change) | eligible set empty even after relaxation | history `NO_ELIGIBLE_CANDIDATES`; notify admins `ADMIN_NO_CANDIDATES`; push `offerExpiresAt` forward by `offerDurationMinutes` so the sweep retries instead of spinning | SYSTEM |
| T6 | `ASSIGNED` | `ACCEPT` | `ASSIGNED` (no change) | caller owns the ACTIVE assignment; `response = PENDING` | `response = ACCEPTED`, `respondedAt = now`; history `ASSIGNMENT_ACCEPTED`. **Not a state transition** — see OQ-3 | MEMBER |
| T7 | `ASSIGNED` | `COMPLETE` | `COMPLETED` | caller owns the ACTIVE assignment, or is ADMIN acting on behalf | close assignment `COMPLETED`; award **iff** `kind = VOLUNTARY` and `rewardEnabled` and `rewardTiming = ON_COMPLETE` — otherwise **exactly zero, and no ledger row at all** (§7, §44); `currentValue = resetValue(cfg)` (§6.7); set `definition.carriedValue` per §5.7, plus `lastCompletedAt`, `nextDueAt`; history `COMPLETED` [+ `POINTS_AWARDED`] + `VALUE_RESET`; notify household `TASK_COMPLETED`; audit `TASK_COMPLETED` | MEMBER / ADMIN |
| T8 | `ASSIGNED` | `BUYOUT` | `AVAILABLE` | `kind = RANDOM` (PRD §3B); `cfg.buyout.enabled`; `definition.buyoutEnabled`; balance rule passes; weekly and consecutive caps pass; `currentValue < cfg.valueIncrease.maximumValue` (OQ-1); client-quoted cost equals the server cost | debit via §8.2 (`BUYOUT`, negative); close assignment `BOUGHT_OUT` recording `buyoutCost`, `valueBeforeBuyout`, `valueAfterBuyout`; `currentValue = increasedValue(cfg)`; `buyoutCount += 1`; `offerExpiresAt = now + offerDurationMinutes`; history `BOUGHT_OUT`, `VALUE_INCREASED`, `RE_OFFERED`; notify household `TASK_VALUE_INCREASED`; audit `BUYOUT_EXECUTED` | MEMBER |
| T9 | `ASSIGNED` | `RELEASE` | `AVAILABLE` | `kind = VOLUNTARY`; caller owns it; `cfg.voluntary.allowRelease` | close assignment `RELEASED`; **no charge, no value change** (PRD §3B); if an `ON_ACCEPT` reward was paid, claw it back as `CORRECTION` (PRD §3C) + history `POINTS_CLAWED_BACK`; `offerExpiresAt = now + offerDurationMinutes`; history `RELEASED`, `RE_OFFERED` | MEMBER |
| T10 | `ASSIGNED` | `REVOKE` | `AVAILABLE` | caller is ADMIN | close assignment `REVOKED`; clawback as in T9; history `REVOKED`, `RE_OFFERED`; audit `ASSIGNMENT_REVOKED` with reason | ADMIN |
| T11 | `DRAFT` or `AVAILABLE` | `PAUSE` | `PAUSED` | caller is ADMIN | history `PAUSED`; audit `INSTANCE_PAUSED` | ADMIN |
| T12 | `ASSIGNED` | `PAUSE` | `PAUSED` | caller is ADMIN | first close the ACTIVE assignment as `REVOKED` (with clawback), then pause; history `REVOKED`, `PAUSED` | ADMIN |
| T13 | `PAUSED` | `RESUME` | `AVAILABLE` | caller is ADMIN; instance not past its expiry deadline | `offerExpiresAt = now + offerDurationMinutes`; history `RESUMED`, `RE_OFFERED` | ADMIN |
| T14 | `DRAFT`, `AVAILABLE` or `PAUSED` | `CANCEL` | `CANCELLED` | caller is ADMIN | `closedAt = now`; history `CANCELLED`; audit `INSTANCE_CANCELLED` | ADMIN |
| T15 | `ASSIGNED` | `CANCEL` | `CANCELLED` | caller is ADMIN | close assignment `REVOKED` (see note); clawback as in T9; history `REVOKED`, `CANCELLED` | ADMIN |
| T16 | `AVAILABLE` or `PAUSED` | `EXPIRE` | `EXPIRED` | `now > expiryDeadline` (§5.8) | `currentValue = baseValue` and `definition.carriedValue = null` (PRD §3F); `closedAt = now`; history `EXPIRED`, `VALUE_RESET`; audit `INSTANCE_EXPIRED` | SYSTEM |
| T17 | `ASSIGNED` | `EXPIRE` | `EXPIRED` | `now > expiryDeadline`; assignment still ACTIVE | close assignment `EXPIRED`; clawback if `ON_ACCEPT` was paid; **no automatic penalty** (OQ-2); value reset as T16; history `EXPIRED` | SYSTEM |
| T18 | `DRAFT` | `EXPIRE` | `EXPIRED` | never published and `now > expiryDeadline` | as T16 | SYSTEM |

**Note on T15.** `AssignmentStatus` has no `CANCELLED` member. Assignments closed
because the instance was cancelled use `REVOKED` — the outcome for the member is
identical (released without charge, reward clawed back if any). A seventh
assignment status to distinguish "revoked by admin" from "revoked because the
instance died" buys nothing the `AuditEvent` reason does not already carry.

## 2.3 Diagram (orientation only — §2.2 is normative)

```
                       MATERIALIZE
                            |
                            v
                       +---------+
                       |  DRAFT  |
                       +---------+
                            | PUBLISH
                            v
  BUYOUT / RELEASE     +-----------+       PAUSE        +--------+
  REVOKE          +--> | AVAILABLE | -----------------> | PAUSED |
                  |    +-----------+ <----------------- +--------+
                  |          |            RESUME             |
                  |          | VOLUNTEER                     |
                  |          | ASSIGN_RANDOM                 |
                  |          v                               |
                  |    +-----------+        PAUSE            |
                  +--- | ASSIGNED  | ------------------------+
                       +-----------+
                            | COMPLETE
                            v
                       +-----------+
                       | COMPLETED |   terminal
                       +-----------+

  CANCEL : DRAFT | AVAILABLE | ASSIGNED | PAUSED  ->  CANCELLED   terminal
  EXPIRE : DRAFT | AVAILABLE | ASSIGNED | PAUSED  ->  EXPIRED     terminal
```

## 2.4 Legality matrix — illegal transitions are enumerable

The implementation defines exactly one table and derives everything from it:

```ts
// apps/api/src/domain/task/state-machine.ts   (pure — no Prisma, no Fastify)

export const TRANSITIONS = [
  { from: 'DRAFT',     event: 'PUBLISH',       to: 'AVAILABLE' },
  { from: 'AVAILABLE', event: 'VOLUNTEER',     to: 'ASSIGNED'  },
  { from: 'AVAILABLE', event: 'ASSIGN_RANDOM', to: 'ASSIGNED'  },
  { from: 'ASSIGNED',  event: 'COMPLETE',      to: 'COMPLETED' },
  { from: 'ASSIGNED',  event: 'BUYOUT',        to: 'AVAILABLE' },
  { from: 'ASSIGNED',  event: 'RELEASE',       to: 'AVAILABLE' },
  { from: 'ASSIGNED',  event: 'REVOKE',        to: 'AVAILABLE' },
  { from: 'DRAFT',     event: 'PAUSE',         to: 'PAUSED'    },
  { from: 'AVAILABLE', event: 'PAUSE',         to: 'PAUSED'    },
  { from: 'ASSIGNED',  event: 'PAUSE',         to: 'PAUSED'    },
  { from: 'PAUSED',    event: 'RESUME',        to: 'AVAILABLE' },
  { from: 'DRAFT',     event: 'CANCEL',        to: 'CANCELLED' },
  { from: 'AVAILABLE', event: 'CANCEL',        to: 'CANCELLED' },
  { from: 'ASSIGNED',  event: 'CANCEL',        to: 'CANCELLED' },
  { from: 'PAUSED',    event: 'CANCEL',        to: 'CANCELLED' },
  { from: 'DRAFT',     event: 'EXPIRE',        to: 'EXPIRED'   },
  { from: 'AVAILABLE', event: 'EXPIRE',        to: 'EXPIRED'   },
  { from: 'ASSIGNED',  event: 'EXPIRE',        to: 'EXPIRED'   },
  { from: 'PAUSED',    event: 'EXPIRE',        to: 'EXPIRED'   },
] as const satisfies readonly Transition[];

export function resolve(from: TaskStatus, event: TaskEvent): TaskStatus; // throws IllegalTransitionError
export function isLegal(from: TaskStatus, event: TaskEvent): boolean;
export function legalEvents(from: TaskStatus): TaskEvent[];
/** Every (from, event) pair NOT in TRANSITIONS. Consumed by the test suite. */
export function illegalPairs(): Array<{ from: TaskStatus; event: TaskEvent }>;
```

`IllegalTransitionError` carries `{ from, event, allowedEvents }` and maps to
HTTP 409 `ILLEGAL_TRANSITION` (§3.13) with those fields in `details`, so the UI
can say what *is* possible rather than only what failed.

Full `from × event` grid. `·` marks a pair the machine must reject — 7 states ×
11 events = 77 pairs, 19 legal, **58 illegal**. Terminal states accept no event
at all; that is what makes them terminal.

| from \ event | PUBLISH | VOLUNTEER | ASSIGN_RANDOM | COMPLETE | BUYOUT | RELEASE | REVOKE | PAUSE | RESUME | CANCEL | EXPIRE |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `DRAFT` | ✓ | · | · | · | · | · | · | ✓ | · | ✓ | ✓ |
| `AVAILABLE` | · | ✓ | ✓ | · | · | · | · | ✓ | · | ✓ | ✓ |
| `ASSIGNED` | · | · | · | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ |
| `PAUSED` | · | · | · | · | · | · | · | · | ✓ | ✓ | ✓ |
| `COMPLETED` | · | · | · | · | · | · | · | · | · | · | · |
| `CANCELLED` | · | · | · | · | · | · | · | · | · | · | · |
| `EXPIRED` | · | · | · | · | · | · | · | · | · | · | · |

A test asserts `illegalPairs().length === 58` and that every one of them throws,
so the matrix and the table cannot drift apart.

`ACCEPT` (T6) is deliberately absent from `TaskEvent`: it changes
`TaskAssignment.response`, not `TaskInstance.status`.

## 2.5 Assignment sub-machine

`TaskAssignment.status` only ever leaves `ACTIVE`, and always inside the same
transaction that transitions the instance:

| From | To | Triggered by | `activeForInstanceId` |
|---|---|---|---|
| `ACTIVE` | `COMPLETED` | T7 | set to `NULL` |
| `ACTIVE` | `BOUGHT_OUT` | T8 | set to `NULL` |
| `ACTIVE` | `RELEASED` | T9 | set to `NULL` |
| `ACTIVE` | `REVOKED` | T10, T12, T15 | set to `NULL` |
| `ACTIVE` | `EXPIRED` | T17 | set to `NULL` |

Closed assignments are immutable. Nothing transitions *into* `ACTIVE` except row
creation, which the unique index on `activeForInstanceId` serializes (§4.3).

## 2.6 History event payloads

The §22 example maps one-to-one onto stored events. German rendering is
client-side; the store holds structured data only.

| §22 line | `type` | `payload` |
|---|---|---|
| `Bad putzen wurde angeboten – Wert 4` | `OFFERED` | `{ title, value: 4 }` |
| `Keine freiwillige Übernahme` | `NO_VOLUNTEER` | `{ offerDurationMinutes }` |
| `Zufallszuweisung an Anna` | `RANDOMLY_ASSIGNED` | `{ memberId, memberName, strategy, candidateCount }` |
| `Anna kaufte sich für 4 Punkte frei` | `BOUGHT_OUT` | `{ memberId, memberName, cost: 4, transactionId }` |
| `Neuer Wert: 6` | `VALUE_INCREASED` | `{ from: 4, to: 6, strategy: 'MULTIPLIER', multiplier: 1.5 }` |
| *(implicit)* | `RE_OFFERED` | `{ value: 6, offerExpiresAt }` |
| `Aufgabe freiwillig von Paul übernommen` | `VOLUNTEERED` | `{ memberId, memberName, value: 6 }` |
| `Aufgabe von Paul erledigt` | `COMPLETED` | `{ memberId, memberName, kind: 'VOLUNTARY' }` |
| `Paul erhält 6 Punkte` | `POINTS_AWARDED` | `{ memberId, amount: 6, transactionId }` |
| `Aufgabenwert auf 4 zurückgesetzt` | `VALUE_RESET` | `{ from: 6, to: 4, strategy: 'BASE_VALUE' }` |

This makes end-condition 15 verifiable by construction: the integration test
drives the scenario and asserts exactly this event-type sequence.

---

# 3. API surface

## 3.1 Conventions

- Base path `/api`. JSON in, JSON out, UTF-8.
- **Auth**: opaque session id in an `httpOnly; Secure; SameSite=Lax; Path=/`
  cookie named `hh_session`. The raw value is never stored — only its SHA-256
  (`Session.tokenHash`). Password hashing is argon2id (PRD §2).
- **CSRF**: every non-`GET`/`HEAD` request must carry `X-CSRF-Token` matching
  the session's `csrfTokenHash`. Double-submit on top of `SameSite=Lax`.
  Returned by `POST /auth/login` and `GET /auth/me`.
- **Auth column** in the tables below: `PUBLIC` (no session), `MEMBER` (any
  active member of the active household), `ADMIN` (member with `role = ADMIN`).
- **Ids** are cuid strings. Timestamps are RFC 3339 UTC.
- **Pagination** is cursor-based: `?cursor=<opaque>&limit=<1..100>` →
  `{ items: [...], nextCursor: string | null }`. The cursor encodes `seq`.
- **Concurrency**: mutating task endpoints accept an optional `expectedVersion`.
  Mismatch → `409 STALE_VIEW` (your screen is out of date) as distinct from
  `409 TASK_NOT_AVAILABLE` (someone beat you). See §4.6.
- **No client-computed binding values** (§36). Every price, reward and resulting
  value in a response was computed server-side. The client echoes them back for
  confirmation; it never originates them.

## 3.2 Household scoping

Routes are **not** path-prefixed with the household id. The session carries
`activeHouseholdId`; a Fastify `preHandler` resolves it to a `HouseholdMember`
row and attaches `request.ctx = { user, member, householdId, role }`. Every
query in the data layer takes `householdId` as its first predicate, and a
repository-level lint rule (§7.4) rejects any `prisma.<model>.find*` on a
household-scoped model whose `where` lacks `householdId`.

Rationale: §29's sketch uses flat paths; PRD §4 defers the multi-household
switching UI; and a session-resolved scope makes "no access to a foreign
household" a single choke point rather than a per-route obligation (§36).
Switching households is `POST /api/session/household`. If path-scoped routes are
ever needed, `/api/households/:hid/*` can be added as an alias that sets the same
`request.ctx` — no data-model change.

## 3.3 Auth and session

| Method | Path | Auth | Request | Response 2xx | Errors |
|---|---|---|---|---|---|
| `POST` | `/api/auth/login` | PUBLIC | `{ email, password }` | `200 { user, member, household, csrfToken }` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429 RATE_LIMITED` |
| `POST` | `/api/auth/logout` | MEMBER | — | `204` | — |
| `GET` | `/api/auth/me` | MEMBER | — | `200 { user, member, household, role, csrfToken }` | `401 UNAUTHENTICATED` |
| `POST` | `/api/auth/password` | MEMBER | `{ currentPassword, newPassword }` | `204` | `401 INVALID_CREDENTIALS`, `422 VALIDATION_FAILED` |
| `GET` | `/api/households` | MEMBER | — | `200 { items: [{ householdId, name, role }] }` | — |
| `POST` | `/api/session/household` | MEMBER | `{ householdId }` | `200 { household, member, role }` | `403 NOT_A_MEMBER` |

Login responds identically (timing-padded, same body) for unknown email and wrong
password. Failed attempts write `AuditAction.LOGIN_FAILED` without the password.

## 3.4 Task read endpoints (member)

| Method | Path | Auth | Query | Response 2xx |
|---|---|---|---|---|
| `GET` | `/api/tasks/available` | MEMBER | `categoryId?`, `eligibleOnly?=true` | `200 { items: AvailableTaskDto[] }` |
| `GET` | `/api/tasks/assigned-to-me` | MEMBER | — | `200 { items: AssignedTaskDto[] }` |
| `GET` | `/api/tasks/board` | MEMBER | — | `200 { open, assigned, recentlyCompleted, members }` — the §19 family panel |
| `GET` | `/api/tasks/:instanceId` | MEMBER | — | `200 TaskInstanceDetailDto` |
| `GET` | `/api/dashboard` | MEMBER | — | `200 { me, family }` — one round trip for §19 |

```ts
// packages/shared/src/api/tasks.ts

interface AvailableTaskDto {
  id: string;
  version: number;                 // ETag for expectedVersion
  title: string;
  description: string | null;
  category: { id: string; name: string; colorHex: string | null } | null;
  currentValue: number;            // §20
  baseValue: number;               // §20
  buyoutCount: number;             // §20 "bisherige Freikäufe"
  estimatedMinutes: number | null; // §20
  dueAt: string | null;
  isOverdue: boolean;              // computed, not stored (§1.4)
  offerExpiresAt: string | null;
  status: TaskStatus;
  /** Server-computed. If false, the volunteer CTA is disabled with a reason. */
  canVolunteer: boolean;
  ineligibleReason: EligibilityReason | null;
  /** What the caller would earn by volunteering and completing. Server-computed. */
  potentialReward: number;
}

interface AssignedTaskDto extends AvailableTaskDto {
  assignment: {
    id: string;
    kind: AssignmentKind;
    response: AssignmentResponse;
    assignedAt: string;
    valueAtAssignment: number;
    /** §7: exactly 0 for RANDOM. Never derived on the client. */
    rewardOnCompletion: number;
    /** null when buyout is not permitted; the reason says why. §21, §31. */
    buyoutQuote: BuyoutQuoteDto | null;
  };
}
```

## 3.5 Task mutations (member)

| Method | Path | Auth | Request | Response 2xx | Errors |
|---|---|---|---|---|---|
| `POST` | `/api/tasks/:instanceId/volunteer` | MEMBER | `{ expectedVersion? }` | `200 { instance, assignment, pointsAwarded }` | `409 TASK_NOT_AVAILABLE`, `409 STALE_VIEW`, `403 NOT_ELIGIBLE`, `404 NOT_FOUND`, `429 RATE_LIMITED` |
| `POST` | `/api/assignments/:id/accept` | MEMBER | — | `200 { assignment }` | `409 ASSIGNMENT_CLOSED`, `403 NOT_ASSIGNEE` |
| `POST` | `/api/tasks/:instanceId/complete` | MEMBER | `{ assignmentId, expectedVersion? }` | `200 CompletionResultDto` | `409 ASSIGNMENT_CLOSED`, `409 ILLEGAL_TRANSITION`, `403 NOT_ASSIGNEE` |
| `POST` | `/api/tasks/:instanceId/release` | MEMBER | `{ assignmentId }` | `200 { instance }` | `409 NOT_VOLUNTARY`, `403 RELEASE_DISABLED`, `409 ASSIGNMENT_CLOSED` |
| `GET` | `/api/assignments/:id` | MEMBER | — | `200 AssignedTaskDto` | `404 NOT_FOUND` |
| `GET` | `/api/assignments/:id/buyout-quote` | MEMBER | — | `200 BuyoutQuoteDto` | `403 NOT_ASSIGNEE`, `409 ASSIGNMENT_CLOSED` |
| `POST` | `/api/assignments/:id/buyout` | MEMBER | `{ acceptedCost, acceptedNewValue }` | `200 BuyoutResultDto` | `409 QUOTE_STALE`, `409 INSUFFICIENT_POINTS`, `403 BUYOUT_DISABLED`, `409 BUYOUT_LIMIT_REACHED`, `409 NOT_RANDOM_ASSIGNMENT`, `409 BUYOUT_AT_VALUE_CAP`, `409 ASSIGNMENT_CLOSED`, `429 RATE_LIMITED` |
| `GET` | `/api/assignments/:id/explain` | MEMBER | — | `200 SelectionExplanationDto` | `404 NOT_FOUND`, `409 NOT_RANDOM_ASSIGNMENT` |

```ts
/** Everything §31 requires the user to see before deciding — all server-computed. */
interface BuyoutQuoteDto {
  assignmentId: string;
  allowed: boolean;
  disallowedReason: BuyoutDenialReason | null;   // BUYOUT_DISABLED | INSUFFICIENT_POINTS | ...
  cost: number;                 // §31 Freikaufkosten
  balanceBefore: number;        // §31 aktueller Punktestand
  balanceAfter: number;         // §31 Punktestand danach
  taskValueBefore: number;      // §31 Aufgabenwert vorher
  taskValueAfter: number;       // §31 Aufgabenwert danach ("Danach steigt der Wert auf 9")
  costStrategy: BuyoutCostStrategy;
  valueIncreaseStrategy: ValueIncreaseStrategy;
  buyoutsUsedThisWeek: number;
  buyoutsAllowedThisWeek: number | null;
  configVersion: number;        // the pinned version the quote was computed from
}

interface BuyoutResultDto {
  instance: TaskInstanceDetailDto;   // now AVAILABLE, currentValue raised
  transaction: PointTransactionDto;  // the BUYOUT debit
  balanceAfter: number;
  taskValueBefore: number;
  taskValueAfter: number;
}

interface CompletionResultDto {
  instance: TaskInstanceDetailDto;   // COMPLETED, currentValue reset
  pointsAwarded: number;             // exactly 0 for RANDOM (§7, §44)
  transaction: PointTransactionDto | null;  // null when nothing was awarded
  balanceAfter: number;
  valueResetFrom: number;
  valueResetTo: number;
}
```

**Buyout confirmation protocol.** `POST /buyout` requires `acceptedCost` and
`acceptedNewValue` — the exact numbers the client displayed. The server
recomputes both from the pinned config and rejects with `409 QUOTE_STALE`
(carrying the fresh quote) if either differs. Nothing is written on mismatch.
This gives informed consent (§31) without server-side quote storage or signed
tokens, and it does **not** trust the client: the client's numbers are only ever
compared, never used.

## 3.6 Fairness transparency (§32)

`GET /api/assignments/:id/explain` — MEMBER. Answers *"Warum wurde mir diese
Aufgabe zugewiesen?"* from the `selectionTrace` stored at assignment time, so
the answer stays true even after weights change.

```ts
interface SelectionExplanationDto {
  assignmentId: string;
  strategy: AssignmentStrategy;
  decidedAt: string;
  configVersion: number;
  eligibleCount: number;                 // "Für diese Aufgabe waren 4 Personen verfügbar."
  constraintsRelaxed: RelaxedConstraint[]; // PRD §3D — why a rule was dropped
  candidates: Array<{
    memberId: string;
    displayName: string;
    included: boolean;
    exclusionReason: EligibilityReason | null;  // "hat diese Aufgabe zuletzt erledigt"
    weight: number | null;                       // "Gewicht 0,8"
    probability: number | null;                  // normalized weight
    selected: boolean;
    /** Per-term breakdown of §6.8's formula, so the number is explainable. */
    weightTerms: Record<string, number> | null;
  }>;
}
```

The raw random draw is **not** in this response (§32 says it need not be shown).
It *is* recorded in the `AuditEvent` payload for admin-side reproducibility.

## 3.7 Points and members

| Method | Path | Auth | Response 2xx |
|---|---|---|---|
| `GET` | `/api/members` | MEMBER | `200 { items: MemberDto[] }` — roster with balances for the §19 family panel |
| `GET` | `/api/members/me` | MEMBER | `200 MemberDto` |
| `GET` | `/api/members/me/points` | MEMBER | `200 { balance, asOf }` |
| `GET` | `/api/members/me/point-transactions` | MEMBER | `200 { items: PointTransactionDto[], nextCursor }` |
| `GET` | `/api/members/:id/point-transactions` | ADMIN | as above, for any member |

`PointTransactionDto` = `{ id, seq, amount, balanceBefore, balanceAfter, type,
taskInstanceId, taskInstanceTitle, taskAssignmentId, description, createdAt,
initiator: { memberId, displayName } | null }`.

## 3.8 History (§22)

| Method | Path | Auth | Query | Response 2xx |
|---|---|---|---|---|
| `GET` | `/api/history` | MEMBER | `taskInstanceId?`, `taskDefinitionId?`, `memberId?`, `type?` (repeatable), `since?`, `until?`, `cursor?`, `limit?` | `200 { items: HistoryEventDto[], nextCursor }` |
| `GET` | `/api/tasks/:instanceId/history` | MEMBER | `cursor?`, `limit?` | `200 { items, nextCursor }` — the per-task timeline |

`HistoryEventDto` = `{ id, seq, type, createdAt, taskInstanceId, taskTitle,
member: { id, displayName } | null, payload }`. Payload shapes are in §2.6;
they are a discriminated union in `packages/shared`, so the German renderer is
exhaustively type-checked.

## 3.9 Notifications (§24, in-app only for MVP)

| Method | Path | Auth | Request | Response 2xx |
|---|---|---|---|---|
| `GET` | `/api/notifications` | MEMBER | `?unreadOnly`, `cursor`, `limit` | `200 { items, unreadCount, nextCursor }` |
| `POST` | `/api/notifications/:id/read` | MEMBER | — | `204` |
| `POST` | `/api/notifications/read-all` | MEMBER | — | `204` |

## 3.10 Admin — configuration (§17)

| Method | Path | Auth | Request | Response 2xx | Errors |
|---|---|---|---|---|---|
| `GET` | `/api/admin/config` | ADMIN | — | `200 { version, values, defaults, updatedAt, updatedBy }` | — |
| `GET` | `/api/admin/config/schema` | ADMIN | — | `200 { jsonSchema }` — drives the admin form | — |
| `GET` | `/api/admin/config/versions` | ADMIN | `cursor`, `limit` | `200 { items: [{ version, createdAt, createdBy, changeSummary }] }` | — |
| `GET` | `/api/admin/config/versions/:version` | ADMIN | — | `200 { version, values }` | `404` |
| `POST` | `/api/admin/config/validate` | ADMIN | `{ values }` | `200 { valid, errors, previews }` — dry run incl. formula parse and worked examples | `422 CONFIG_INVALID` |
| `PUT` | `/api/admin/config` | ADMIN | `{ expectedVersion, values }` | `200 { version, values, changeSummary }` | `409 CONFIG_VERSION_CONFLICT`, `422 CONFIG_INVALID` |
| `POST` | `/api/admin/config/rollback` | ADMIN | `{ toVersion }` | `200 { version }` — appends a copy, never rewrites history | `404`, `422` |

`POST /config/validate` returns `previews`: for a task at value 4 it shows the
resulting buyout cost and the escalation chain `4 → 6 → 9 → 14`, so an admin sees
the consequence of a multiplier change before saving. This is the §31 "show the
consequence first" principle applied to the admin surface.

## 3.11 Admin — tasks, members, operations

| Method | Path | Auth | Request / Notes |
|---|---|---|---|
| `GET` | `/api/admin/task-definitions` | ADMIN | `?includeArchived` |
| `POST` | `/api/admin/task-definitions` | ADMIN | `{ title, description?, categoryId?, baseValue, estimatedMinutes?, recurrence, buyoutEnabled?, eligibility? }` → `201` |
| `GET` | `/api/admin/task-definitions/:id` | ADMIN | includes open instances and market-value stats stub |
| `PUT` | `/api/admin/task-definitions/:id` | ADMIN | full replace; `baseValue` change does **not** touch open instances (§1.4) |
| `DELETE` | `/api/admin/task-definitions/:id` | ADMIN | soft archive (`archivedAt`); `409 HAS_OPEN_INSTANCES` if any instance is open |
| `PUT` | `/api/admin/task-definitions/:id/eligibility` | ADMIN | `{ included: memberId[], excluded: memberId[] }` |
| `POST` | `/api/admin/task-definitions/:id/materialize` | ADMIN | `{ scheduledFor?, publishImmediately? }` → `201 { instance }` (T1 + optionally T2) |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/admin/categories[/:id]` | ADMIN | `409 CATEGORY_IN_USE` on delete |
| `GET` | `/api/admin/members` | ADMIN | roster incl. restrictions and balances |
| `POST` | `/api/admin/members` | ADMIN | `{ email, displayName, password?, role }` — creates `User` if absent, then `HouseholdMember` |
| `PATCH` | `/api/admin/members/:id` | ADMIN | `{ displayName?, avatarUrl?, isActive?, role?, maxRandomAssignmentsPerWeek? }`; `422 LAST_ADMIN` when demoting the only admin |
| `PUT` | `/api/admin/members/:id/restrictions` | ADMIN | `{ excludedCategoryIds, excludedTaskDefinitionIds, absences: [{startsAt, endsAt, reason?}] }` |
| `POST` | `/api/admin/members/:id/points/adjust` | ADMIN | `{ amount, reason }` → `MANUAL_ADJUSTMENT` via §8.2; `422` if `reason` is blank |
| `POST` | `/api/admin/instances/:id/publish` | ADMIN | T2 |
| `POST` | `/api/admin/instances/:id/pause` \| `/resume` \| `/cancel` | ADMIN | T11–T14 |
| `POST` | `/api/admin/instances/:id/revoke-assignment` | ADMIN | `{ reason }` → T10 |
| `POST` | `/api/admin/instances/:id/complete` | ADMIN | `{ onBehalfOfMemberId }` → T7 acting for a member |
| `POST` | `/api/admin/assignments/run` | ADMIN | `{ dryRun?: boolean }` → `200 { materialized, published, assigned, expired, skipped, traces }`. Same use-case the interval worker calls (§7.2), which is what makes the sweep testable (§29). |
| `GET` | `/api/admin/audit-events` | ADMIN | `?action, entityType, entityId, memberId, since, cursor, limit` |
| `GET` | `/api/admin/ledger/integrity` | ADMIN | `200 LedgerIntegrityReport` (§8.5) |
| `POST` | `/api/admin/ledger/repair-cache` | ADMIN | recomputes `pointsCache` from the ledger; never edits the ledger; audited as `LEDGER_CACHE_REPAIRED` |

Health probes, outside `/api` and unauthenticated: `GET /healthz` (process up),
`GET /readyz` (database reachable, migrations applied).

## 3.12 Rate limits (§36)

`@fastify/rate-limit`, keyed as noted. Exceeding a limit → `429 RATE_LIMITED`
with `Retry-After`.

| Scope | Limit | Key |
|---|---|---|
| `POST /auth/login` | 5 / 5 min | IP + email |
| `POST /auth/password` | 5 / hour | session |
| `POST /tasks/*/volunteer`, `/complete`, `/release` | 30 / min | member |
| `POST /assignments/*/buyout` | 10 / min | member |
| `PUT /admin/config`, `POST /admin/config/*` | 10 / min | member |
| `POST /admin/assignments/run` | 6 / min | household |
| everything else | 300 / min | session or IP |

## 3.13 Error model

```json
{ "error": { "code": "INSUFFICIENT_POINTS", "message": "…", "details": { } } }
```

`code` is stable and machine-readable; `message` is German and safe to display.
`details` carries structured context so the UI can react rather than just alert.

| HTTP | Code | Meaning | `details` |
|---|---|---|---|
| 400 | `BAD_REQUEST` | malformed body or query | `fieldErrors` |
| 401 | `UNAUTHENTICATED` | no or expired session | — |
| 401 | `INVALID_CREDENTIALS` | login failed | — |
| 403 | `FORBIDDEN` | authenticated but not permitted | `requiredRole` |
| 403 | `NOT_A_MEMBER` | household not accessible to this user | — |
| 403 | `NOT_ELIGIBLE` | hard eligibility rule blocks volunteering | `reason: EligibilityReason` |
| 403 | `NOT_ASSIGNEE` | not the holder of this assignment | — |
| 403 | `BUYOUT_DISABLED` | buyout off globally or for this definition | `scope: 'GLOBAL' \| 'TASK'` |
| 403 | `RELEASE_DISABLED` | `voluntary.allowRelease = false` | — |
| 403 | `ACCOUNT_DISABLED` | user or membership inactive | — |
| 404 | `NOT_FOUND` | absent, or in another household (indistinguishable by design) | — |
| 409 | `TASK_NOT_AVAILABLE` | someone else took it first | `currentStatus`, `heldBy` |
| 409 | `STALE_VIEW` | `expectedVersion` mismatch | `currentVersion` |
| 409 | `ASSIGNMENT_CLOSED` | already completed, bought out, released or revoked | `currentStatus` |
| 409 | `ILLEGAL_TRANSITION` | event not legal from the current state | `from`, `event`, `allowedEvents` |
| 409 | `NOT_RANDOM_ASSIGNMENT` | buyout or explain on a voluntary assignment (PRD §3B) | `kind` |
| 409 | `NOT_VOLUNTARY` | release attempted on a random assignment | `kind` |
| 409 | `QUOTE_STALE` | quoted cost or resulting value no longer matches | `quote: BuyoutQuoteDto` |
| 409 | `INSUFFICIENT_POINTS` | balance rule would be violated | `balance`, `cost`, `minimumBalance` |
| 409 | `BUYOUT_LIMIT_REACHED` | weekly or consecutive cap hit | `used`, `limit`, `kind` |
| 409 | `BUYOUT_AT_VALUE_CAP` | value already at `maximumValue`; raising it is impossible (OQ-1) | `currentValue`, `maximumValue` |
| 409 | `CONFIG_VERSION_CONFLICT` | another admin saved first | `currentVersion` |
| 409 | `HAS_OPEN_INSTANCES` / `CATEGORY_IN_USE` | delete blocked by references | `count` |
| 422 | `VALIDATION_FAILED` | schema violation | `fieldErrors` |
| 422 | `CONFIG_INVALID` | config schema, cross-field rule or formula error | `fieldErrors`, `formulaErrors` |
| 422 | `LAST_ADMIN` | would leave the household without an admin | — |
| 429 | `RATE_LIMITED` | see §3.12 | `retryAfterSeconds` |
| 500 | `INTERNAL_ERROR` | unexpected; correlation id logged, never leaked to the body | `correlationId` |

Absent and forbidden both return `404 NOT_FOUND` for cross-household ids, so the
API cannot be used to probe another household's contents (§36).

---

# 4. Concurrency design

## 4.1 Isolation level and why

**`READ COMMITTED`** — the Postgres default — **plus explicit `SELECT … FOR
UPDATE` row locks.**

Not `SERIALIZABLE`: it would push every conflict into a `40001` retry loop the
application has to own, and at 1–20 members the contention is a single hot row,
not a pattern of read-write skew. Pessimistic locking on that one row is simpler
to reason about, deterministic, and produces a clean "you lost" answer instead of
a retry storm (§43).

Not optimistic-only (`version` compare-and-set without a lock): correct for the
single-row case, but the buyout and completion transactions each mutate three
rows, and without a lock two transactions can interleave their *reads* and both
compute a valid-looking balance before either writes. The lock makes the
read-then-write sequence atomic; the conditional update is kept as a second,
independent guard (§4.7).

Every operation below runs inside one `prisma.$transaction(async tx => …, {
isolationLevel: 'ReadCommitted', timeout: 5000, maxWait: 2000 })`.

## 4.2 Lock ordering (deadlock prevention)

Locks are acquired in strictly ascending **level** order. No operation may take a
lower-level lock after a higher-level one.

| Level | Resource | Acquired by |
|---|---|---|
| 0 | `pg_advisory_xact_lock(hashtext('sweep:' \|\| householdId))` | the assignment sweep only |
| 1 | `task_instances` row | volunteer, buyout, complete, release, revoke, expire, pause, cancel |
| 2 | `task_assignments` row | buyout, complete, release, revoke, expire |
| 3 | `household_members` row | every ledger write (`postTransaction`, §8.2) |

Additional rules:

- **Never hold two locks of the same level.** The one operation that touches
  many instances — the sweep — processes **one instance per transaction**, so it
  never holds two level-1 locks. Where a future operation genuinely needs two
  rows of one level, it must lock them in ascending `id` order.
- **Ledger-only operations enter at level 3.** Manual adjustment, decay and
  bonus/penalty lock a member row and nothing above it, so they can never be the
  waiting half of a cycle.
- **The sweep takes level 0 first**, before any instance lock, and holds it for
  the duration of one instance's transaction. Two concurrent sweeps (the interval
  worker plus a manual `POST /admin/assignments/run`) therefore serialize per
  household. This matters because the per-member weekly cap and the fairness
  counters are read outside a row lock: without the advisory lock, two sweeps
  could both see "Anna has 2 of 3 random assignments" and both assign to her.

Because buyout (1→2→3) and completion (1→2→3) acquire in the identical order,
they cannot deadlock against each other — the loser simply blocks on the level-1
instance row until the winner commits. This is the whole of the deadlock
argument, and it holds only as long as the ordering rule does; §7.4 makes it a
lint-enforced code review rule.

## 4.3 Voluntary takeover (§28, §35 "exactly one winner")

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;

-- (1) LEVEL 1: lock the instance. A concurrent volunteer blocks here.
SELECT id, status, current_value, base_value, config_version, version
  FROM task_instances
 WHERE id = $instanceId AND household_id = $householdId
   FOR UPDATE;
-- 0 rows  -> 404 NOT_FOUND (absent, or another household)

-- (2) guards, evaluated on the locked row:
--     status = 'AVAILABLE'                      else 409 TASK_NOT_AVAILABLE
--     $expectedVersion IS NULL OR = version     else 409 STALE_VIEW
--     caller passes hard eligibility (§6.9 1-5) else 403 NOT_ELIGIBLE

-- (3) compare-and-set. Redundant under the lock, kept as guard #2 (§4.7).
UPDATE task_instances
   SET status = 'ASSIGNED', version = version + 1, updated_at = now()
 WHERE id = $instanceId AND status = 'AVAILABLE' AND version = $version;
-- rowcount = 0 -> abort, 409 TASK_NOT_AVAILABLE

-- (4) guard #3: the sentinel unique index. A second ACTIVE assignment for this
--     instance raises SQLSTATE 23505, which maps to the same 409.
INSERT INTO task_assignments
  (id, household_id, task_instance_id, member_id, kind, status, response,
   active_for_instance_id, value_at_assignment, config_version, assigned_at)
VALUES
  ($id, $householdId, $instanceId, $memberId, 'VOLUNTARY', 'ACTIVE', 'ACCEPTED',
   $instanceId, $currentValue, $configVersion, now());

-- (5) history
INSERT INTO task_history_events (…, type='VOLUNTEERED', payload=…);

-- (6) ON_ACCEPT only: LEVEL 3 ledger credit via postTransaction (§8.2)
COMMIT;
```

Prisma form — the two idioms that matter:

```ts
// Row lock: Prisma's typed API cannot express FOR UPDATE. Use raw SQL.
const [locked] = await tx.$queryRaw<InstanceLockRow[]>`
  SELECT id, status, current_value, base_value, config_version, version
    FROM task_instances
   WHERE id = ${instanceId} AND household_id = ${householdId}
     FOR UPDATE`;

// Compare-and-set: updateMany returns { count }. update() would throw P2025 and
// lose the ability to distinguish "lost the race" from a real error.
const { count } = await tx.taskInstance.updateMany({
  where: { id: instanceId, status: 'AVAILABLE', version: locked.version },
  data:  { status: 'ASSIGNED', version: { increment: 1 } },
});
if (count === 0) throw new ConflictError('TASK_NOT_AVAILABLE');
```

**What the loser sees.** Volunteer B blocks at step (1) — no error, no spin —
until A commits. B then re-reads the row inside its own snapshot, sees
`status = 'ASSIGNED'`, fails guard (2), rolls back having written nothing, and
receives:

```
409 { "error": { "code": "TASK_NOT_AVAILABLE",
                 "details": { "currentStatus": "ASSIGNED", "heldBy": "Anna" } } }
```

The UI replaces the card with "Anna hat die Aufgabe übernommen". Exactly one
winner, no partial writes, no 500 — end-condition 17.

## 4.4 Buyout (§28)

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;

-- LEVEL 1
SELECT … FROM task_instances
 WHERE id = $instanceId AND household_id = $householdId FOR UPDATE;
-- LEVEL 2
SELECT … FROM task_assignments
 WHERE id = $assignmentId AND task_instance_id = $instanceId FOR UPDATE;
-- LEVEL 3
SELECT id, points_cache FROM household_members
 WHERE id = $memberId AND household_id = $householdId FOR UPDATE;

-- guards, all on locked rows:
--   instance.status   = 'ASSIGNED'                 else 409 ILLEGAL_TRANSITION
--   assignment.status = 'ACTIVE'                   else 409 ASSIGNMENT_CLOSED
--   assignment.member_id = caller                  else 403 NOT_ASSIGNEE
--   assignment.kind   = 'RANDOM'                   else 409 NOT_RANDOM_ASSIGNMENT
--   cfg.buyout.enabled AND definition.buyout_enabled  else 403 BUYOUT_DISABLED
--   weekly / consecutive caps                      else 409 BUYOUT_LIMIT_REACHED
--   currentValue < cfg.valueIncrease.maximumValue  else 409 BUYOUT_AT_VALUE_CAP

--   cfg is HouseholdConfiguration[assignment.config_version]  <-- PINNED (§5.5)
--   cost     = buyoutCost(cfg, instance)      >= 1  (§6.6)
--   newValue = increasedValue(cfg, instance)  >  currentValue  (§6.7)
--   balance rule: points_cache - cost >= minimumBalance,
--                 or allowNegativeBalance with maximumDebt  else 409 INSUFFICIENT_POINTS
--   $acceptedCost = cost AND $acceptedNewValue = newValue    else 409 QUOTE_STALE

-- writes, in lock order:
--   LEVEL 3: postTransaction(BUYOUT, -cost, idempotencyKey='buyout:'||$assignmentId)
--            -> inserts point_transactions, updates household_members.points_cache
UPDATE task_assignments
   SET status='BOUGHT_OUT', closed_at=now(), active_for_instance_id=NULL,
       buyout_cost=$cost, value_before_buyout=$currentValue, value_after_buyout=$newValue
 WHERE id=$assignmentId AND status='ACTIVE';        -- rowcount 0 -> abort
UPDATE task_instances
   SET status='AVAILABLE', current_value=$newValue, buyout_count=buyout_count+1,
       offer_expires_at = now() + ($offerDurationMinutes || ' minutes')::interval,
       version = version + 1
 WHERE id=$instanceId AND status='ASSIGNED' AND version=$version;  -- rowcount 0 -> abort

INSERT INTO task_history_events …   -- BOUGHT_OUT, VALUE_INCREASED, RE_OFFERED
INSERT INTO audit_events …          -- BUYOUT_EXECUTED
INSERT INTO notifications …         -- TASK_VALUE_INCREASED to all active members
COMMIT;
```

Order is load-bearing: **charge the pre-increase value, then raise it**
(PRD §3A, §21's worked example: cost 6, resulting value 9).

**What the loser sees.**

| Competing operation | Where it blocks | Outcome |
|---|---|---|
| A second buyout of the same assignment (double-tap, two devices) | level 2 | `assignment.status = 'BOUGHT_OUT'` → `409 ASSIGNMENT_CLOSED`. The `idempotencyKey` unique index is the backstop: even if the guard were removed, the second debit is a 23505, never a double charge. |
| Completion of the same assignment racing the buyout | level 1 | whichever commits first wins; the other sees `ASSIGNMENT_CLOSED` (if buyout won, the instance is `AVAILABLE` again and the completer gets `409 ILLEGAL_TRANSITION`) |
| The sweep trying to re-assign this instance | level 0 then 1 | blocks, then sees `ASSIGNED` and skips |
| An admin changing the multiplier mid-transaction | no lock contention | irrelevant — the cost came from `assignment.configVersion` (§5.5) |

## 4.5 Completion (§28)

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;

SELECT … FROM task_instances   WHERE id=$instanceId   … FOR UPDATE;  -- LEVEL 1
SELECT … FROM task_assignments WHERE id=$assignmentId … FOR UPDATE;  -- LEVEL 2

-- guards: instance.status='ASSIGNED'; assignment.status='ACTIVE';
--         assignment.member_id = caller OR caller is ADMIN

-- cfg = HouseholdConfiguration[assignment.config_version]   <-- PINNED
-- award = (assignment.kind = 'VOLUNTARY'
--          AND cfg.voluntary.rewardEnabled
--          AND cfg.voluntary.rewardTiming = 'ON_COMPLETE')
--       ? round(instance.current_value * cfg.voluntary.rewardMultiplier)
--       : 0                                   -- RANDOM: always 0, §7 / §44

UPDATE task_assignments
   SET status='COMPLETED', completed_at=now(), closed_at=now(),
       active_for_instance_id=NULL
 WHERE id=$assignmentId AND status='ACTIVE';               -- rowcount 0 -> abort

-- LEVEL 3, only when award > 0. For a RANDOM assignment no member row is
-- locked and NO ledger row is written at all -- the zero is an absence, not a
-- zero-amount entry, so it cannot be mistaken for a payout later.
--   postTransaction(VOLUNTARY_TASK_REWARD, +award,
--                   idempotencyKey='reward:'||$assignmentId)

UPDATE task_instances
   SET status='COMPLETED', completed_at=now(), closed_at=now(),
       completed_by_member_id=$memberId,
       current_value=$resetValue,                          -- resetValue(cfg), §6.7
       version=version+1
 WHERE id=$instanceId AND status='ASSIGNED' AND version=$version;  -- rowcount 0 -> abort

UPDATE task_definitions
   SET last_completed_at=now(), next_due_at=$nextDueAt, carried_value=$carriedValue
 WHERE id=$definitionId;                                   -- §5.7

INSERT INTO task_history_events …  -- COMPLETED [, POINTS_AWARDED], VALUE_RESET
INSERT INTO audit_events …         -- TASK_COMPLETED
INSERT INTO notifications …        -- TASK_COMPLETED to the household
COMMIT;
```

Two concurrent completions of the same assignment: the second blocks at level 1,
then fails the level-2 guard → `409 ASSIGNMENT_CLOSED`. Even with both guards
removed, `idempotencyKey = 'reward:<assignmentId>'` makes the second credit a
unique-violation. Three independent barriers against a double payout.

## 4.6 Two distinct 409s

The client distinguishes them and the UI reacts differently:

| Code | Cause | UI |
|---|---|---|
| `STALE_VIEW` | `expectedVersion` did not match; the row changed since the list was fetched | silently refetch and re-render; no message |
| `TASK_NOT_AVAILABLE` | the row is genuinely no longer available | show "X hat die Aufgabe übernommen" and remove the card |

`expectedVersion` is **optional**. Omitting it means "I accept whatever the
current state is" — the status guard still protects correctness. It exists so the
mobile UI can avoid acting on a card the user has been staring at for ten
minutes.

## 4.7 Defence in depth — three independent guards

Each mutation is protected by three mechanisms that fail independently:

| # | Guard | Fails safe by |
|---|---|---|
| 1 | `SELECT … FOR UPDATE` + status check | serializing the readers so only one passes |
| 2 | conditional `updateMany` (`status = expected AND version = expected`) | rowcount 0 → abort, even if the lock were removed |
| 3 | unique index (`activeForInstanceId`, `idempotencyKey`, `(memberId, previousTransactionId)`) | SQLSTATE 23505 → abort, even if 1 and 2 were both removed |

Guard 2 is redundant while guard 1 is present. It is kept deliberately: it is the
guard that survives a future refactor that drops the lock, and it costs one
`WHERE` clause. A test suite deliberately disables guard 1 and asserts that the
concurrency invariants still hold — that is how the redundancy is proven live
rather than assumed.

## 4.8 Testing the races (end-condition 17)

Prisma interactive transactions run on separate connections, so a real
interleaving is reproducible without mocks:

```ts
// apps/api/test/integration/concurrency/volunteer-race.test.ts
const barrier = new Barrier(2);   // both transactions past their guard read
const [a, b] = await Promise.allSettled([
  volunteerForTask(depsWith({ afterLock: () => barrier.wait() }), { instanceId, memberId: anna }),
  volunteerForTask(depsWith({ afterLock: () => barrier.wait() }), { instanceId, memberId: paul }),
]);
expect([a, b].filter(r => r.status === 'fulfilled')).toHaveLength(1);
expect(rejectionOf(a, b).code).toBe('TASK_NOT_AVAILABLE');
await expectAssignmentCount(instanceId, 1);
await expectLedgerIntegrity();                    // §8.5, run as a global afterEach
```

`afterLock` is a no-op hook on the injected `Deps` (§7.2) — a test seam, not
production branching. Because both transactions genuinely block on the same
Postgres row lock, the barrier makes the race deterministic instead of hoping a
loop hits the window. The same pattern covers concurrent buyout-vs-complete and
two concurrent sweeps.

---

# 5. Configuration model

## 5.1 Principles

- Nothing in §16/§17/§39 is hard-coded (§16). The code reads a resolved config
  object; the defaults live in one file in `packages/shared`.
- Configuration is **data, versioned and append-only** — never mutated in place.
  §23 requires config changes be auditable, and §28-style pinning requires old
  versions to remain readable.
- Validation is a Zod schema plus cross-field rules plus formula parsing, all
  run before a version is written (§17 "Änderungen sollen validiert werden").
- **Invariant safety by omission** (§44): there is no key that grants points for
  a random completion, no key that makes a buyout free, and no key that lets a
  buyout leave the value unchanged. Those are not validated — they are absent.

## 5.2 Storage

`HouseholdConfiguration(householdId, version, values Json, changeSummary Json,
createdAt, createdByMemberId)` with `@@unique([householdId, version])`.

- The **active** configuration is `MAX(version)` for the household. There is no
  `isActive` flag to keep consistent.
- Version 1 is written by the seed/bootstrap from `DEFAULT_CONFIG` (§5.4).
- `PUT /admin/config` reads the current max, compares it to `expectedVersion`
  (→ `409 CONFIG_VERSION_CONFLICT` on mismatch), validates, and inserts
  `version + 1`. The insert relies on the unique constraint, so two admins
  saving simultaneously produce one winner and one 409 — same pattern as §4.
- **Rollback appends.** `POST /admin/config/rollback {toVersion}` copies old
  values forward as a new version. History is never rewritten.
- `changeSummary` stores a structured diff (`[{ path, from, to }]`) which the
  `CONFIG_UPDATED` audit event references and the admin UI renders.

## 5.3 Schema and defaults

Typed and validated in `packages/shared/src/config/schema.ts`. Values below are
`DEFAULT_CONFIG` — §39 verbatim, plus the keys §16/§17 imply and the six the
implementation needs (marked **+**).

```yaml
tasks:
  maxOpenInstancesPerDefinition: 1        # + OQ-5

voluntary:
  rewardEnabled: true                     # §16
  rewardMultiplier: 1.0                   # §39   0 .. 10
  rewardTiming: ON_COMPLETE               # §39   ON_ACCEPT | ON_COMPLETE
  rewardRounding: ROUND                   # +     CEIL | FLOOR | ROUND
  allowRelease: true                      # +     PRD §3B

assignment:
  strategy: WEIGHTED_FAIRNESS             # §39   PURE_RANDOM | WEIGHTED_RANDOM
                                          #       | LEAST_ASSIGNED_FIRST | WEIGHTED_FAIRNESS
  preventImmediateReassignment: true      # §39
  reassignmentCooldownCycles: 1           # §13
  offerDurationMinutes: 60                # §16   1 .. 20160
  leadMinutesBeforeDue: 0                 # + OQ-4
  relaxConstraintsWhenNoCandidates: true  # +     PRD §3D

buyout:
  enabled: true                           # §39
  costStrategy: CURRENT_TASK_VALUE        # §39   FIXED | CURRENT_TASK_VALUE
                                          #       | MULTIPLIER | FORMULA
  fixedCost: 5                            # §8    used iff FIXED
  multiplier: 1.0                         # §16   used iff MULTIPLIER
  costFormula: null                       # §8    used iff FORMULA
  costRounding: CEIL                      # +
  allowNegativeBalance: false             # §39
  minimumBalance: 0                       # §16
  maximumDebt: null                       # §8    used iff allowNegativeBalance
  maximumBuyoutsPerWeek: null             # §16
  maximumConsecutiveBuyouts: null         # §8

valueIncrease:
  strategy: MULTIPLIER                    # §39   FIXED_INCREMENT | PERCENTAGE
                                          #       | MULTIPLIER | CUSTOM_FORMULA
  increment: 2                            # §9    used iff FIXED_INCREMENT
  percentage: 50                          # §9    used iff PERCENTAGE
  multiplier: 1.5                         # §39   used iff MULTIPLIER
  formula: null                           # §9    used iff CUSTOM_FORMULA
  rounding: CEIL                          # §39
  minimumIncrease: 1                      # §39   >= 1, not configurable to 0
  maximumValue: null                      # §9

completion:
  resetStrategy: BASE_VALUE               # §11   BASE_VALUE | DECREASE_PERCENTAGE
                                          #       | KEEP_CURRENT
  decreasePercentage: 25                  # §11   used iff DECREASE_PERCENTAGE

points:
  decay:                                  # §15 — surface only for MVP (PRD §4)
    enabled: false
    type: NONE                            # NONE | PERCENTAGE | FIXED | MAX_BALANCE
    value: 0
    intervalDays: 7
    minimumBalance: 0

fairness:                                 # §16 / PRD §3E
  randomAssignmentWeight: 1
  voluntaryWorkWeight: 0
  recentAssignmentPenalty: 1
  windowDays: 28                          # + OQ-7
  weightFloor: 0.1                        # PRD §3E

notifications:
  inAppEnabled: true                      # §24
  dueSoonLeadMinutes: 120
```

§39's `completion.resetValueToBase: true` is expressed as
`completion.resetStrategy: BASE_VALUE`, which subsumes both §11 keys
(`resetValueAfterCompletion` and `resetStrategy`) into one. `PUT` accepts the
boolean as a legacy alias and normalizes it.

### Validation rules

| Rule | Failure |
|---|---|
| `voluntary.rewardMultiplier` ∈ [0, 10] | `CONFIG_INVALID` |
| `assignment.offerDurationMinutes` ∈ [1, 20160] | `CONFIG_INVALID` |
| `buyout.costStrategy = FIXED` ⇒ `fixedCost >= 1` | field error on `buyout.fixedCost` |
| `buyout.costStrategy = MULTIPLIER` ⇒ `multiplier > 0` | field error |
| `buyout.costStrategy = FORMULA` ⇒ `costFormula` parses and dry-runs (§6.5) | `formulaErrors` |
| `buyout.allowNegativeBalance = false` ⇒ `minimumBalance >= 0` | cross-field error |
| `buyout.allowNegativeBalance = true` ⇒ `maximumDebt` set and `> 0` | cross-field error |
| `buyout.maximumBuyoutsPerWeek` null or `>= 1` | field error |
| `valueIncrease.minimumIncrease >= 1` | field error — **0 would break §44** |
| `valueIncrease.strategy = MULTIPLIER` ⇒ `multiplier > 1.0` | field error — `<= 1` cannot raise the value |
| `valueIncrease.strategy = PERCENTAGE` ⇒ `percentage > 0` | field error |
| `valueIncrease.strategy = FIXED_INCREMENT` ⇒ `increment >= 1` | field error |
| `valueIncrease.strategy = CUSTOM_FORMULA` ⇒ formula parses **and** the probe suite (§6.5) shows a strict increase at every probe value | `formulaErrors` |
| `valueIncrease.maximumValue` null or `>= max(all definition baseValues) + minimumIncrease` | warning, plus the `BUYOUT_AT_VALUE_CAP` note (OQ-1) |
| `completion.resetStrategy = DECREASE_PERCENTAGE` ⇒ `decreasePercentage` ∈ [1, 99] | field error |
| `points.decay.enabled = true` ⇒ `type ≠ NONE`, `value > 0`, `intervalDays >= 1` | cross-field error |
| `fairness.weightFloor` ∈ (0, 1] | field error — 0 would make a person unreachable, breaking PRD §3E ergodicity |
| `fairness.windowDays` ∈ [7, 365] | field error |
| unknown key present | `CONFIG_INVALID` (`.strict()` — silently ignoring typos is how a rule "stops working") |

The multiplier and formula rules are what make §44's "a buyout raises the value"
unbreakable *by configuration*, complementing the `ta_buyout_raises_value` CHECK
that makes it unbreakable *by code*.

## 5.4 Invariants enforced by absence

| §44 invariant | Why no configuration can break it |
|---|---|
| Random completion yields no points | No key exists to enable it. The award expression tests `kind === 'VOLUNTARY'` before consulting any config value, and the `pt_reward_only_for_voluntary` CHECK backs it. |
| Points for work come only from voluntary takeover | The only positive work-derived type is `VOLUNTARY_TASK_REWARD`; `BONUS` is admin-manual and audited. |
| A buyout costs points | `buyoutCost()` clamps to `>= 1` (§6.6) and `pt_buyout_costs_points` requires `amount < 0`. |
| A buyout raises the value | `increasedValue()` clamps to `>= currentValue + minimumIncrease` with `minimumIncrease >= 1`, and `ta_buyout_raises_value` requires strict increase. |
| The task is re-offered after a buyout | T8's target state is `AVAILABLE`, not a config choice. |
| Completion resets to base by default | `completion.resetStrategy` defaults to `BASE_VALUE`; the other two options are opt-in and audited. |
| Every point change is in the ledger | One writer (§8.2); the runtime DB role has no `UPDATE`/`DELETE` on the table (§8.6). |

## 5.5 Config pinning — the resolution rule

```
resolveConfig(ctx):
  if the decision concerns an EXISTING assignment
        (buyout cost, value increase on buyout, reward multiplier and timing,
         reset strategy at completion, clawback)
    -> HouseholdConfiguration[assignment.configVersion]        PINNED

  else if the decision concerns an instance with NO active assignment
        (offer duration, expiry deadline, reset on expiry)
    -> HouseholdConfiguration[instance.configVersion]          PINNED

  else (scheduling and selection: which strategy the sweep uses, fairness
        weights, eligibility caps, decay, notification timing)
    -> HouseholdConfiguration[MAX(version)]                    CURRENT
```

The line: **a number that was quoted to a person is honoured; the system's
future behaviour follows the admin's latest intent.** Concretely — an admin
changing `valueIncrease.multiplier` from 1.5 to 3.0 while Anna is looking at a
"Freikaufen: 6 Punkte, danach steigt der Wert auf 9" screen cannot make Anna pay
a different price or cause a different resulting value; her assignment pinned
version 7 at creation and every arm of the buyout transaction reads version 7.
The *next* assignment pins version 8 and uses 3.0.

`TaskInstance.configVersion` and `TaskAssignment.configVersion` are real foreign
keys to `(householdId, version)` with `onDelete: Restrict`, so a pinned version
can never be removed while anything references it.

Because the version is on the row, `GET /assignments/:id/buyout-quote` and
`POST /assignments/:id/buyout` provably compute from the same inputs, and
`BuyoutQuoteDto.configVersion` lets the client and the audit log prove it too.

## 5.6 Week windows

`maximumBuyoutsPerWeek`, `maxRandomAssignmentsPerWeek` and the fairness counters
need a "week". **ISO week (Mon 00:00 – Sun 23:59:59) in `Household.timezone`**,
default `Europe/Berlin`. Computed with `date-fns-tz`; the boundary is a pure
function `weekKey(now, timezone) -> '2026-W35'` in `packages/shared` so client
and server agree on what "diese Woche" means. Rolling 7-day windows were rejected
because "you have one buyout left this week" is only comprehensible if the week
visibly resets. See OQ-7 for the separate fairness lookback window.

## 5.7 Reset strategy and the carry-over field

§11's non-default reset strategies are meaningless without somewhere to put the
result, because the completed instance is terminal and the next occurrence is a
fresh row. `TaskDefinition.carriedValue` is that place:

| `completion.resetStrategy` | Completed instance's `currentValue` | `definition.carriedValue` | Next instance starts at |
|---|---|---|---|
| `BASE_VALUE` (default) | `baseValue` | `null` | `baseValue` |
| `DECREASE_PERCENTAGE` | `max(baseValue, ceil(currentValue × (1 − p/100)))` | same value | that value |
| `KEEP_CURRENT` | `currentValue` (unchanged) | `currentValue` | that value |

On **expiry** (T16/T17), `carriedValue` is always cleared and the instance resets
to `baseValue` — PRD §3F, unchanged. This *extends* PRD §3F (which governs
uncompleted instances) rather than contradicting it; see OQ-1 for confirmation.

With the default, `carriedValue` is permanently `null` and the mechanism is inert.

## 5.8 Derived timing

```
offerExpiresAt = min( publishedAt + cfg.assignment.offerDurationMinutes,
                      dueAt - cfg.assignment.leadMinutesBeforeDue )      -- if dueAt set
expiryDeadline = dueAt ?? (scheduledFor + nextOccurrenceGap)             -- OQ-4
```

`leadMinutesBeforeDue` (default 0) exists so a household can guarantee the random
draw happens *before* the chore is already late; at 0 the clamp reduces to
`dueAt`, which is the spec's implicit behaviour.

---

# 6. Formula subsystem and pluggable strategies

§17: complex formulas may only be configured through a safe, restricted
expression language. **No `eval`, no `new Function`, no `vm`, no dependency.**
Roughly 150 lines of hand-written tokenizer + recursive-descent parser +
tree-walking evaluator, living in `packages/shared/src/formula/` so the admin UI
can parse and preview a formula with the identical code the server enforces
with. The client parse is a convenience; the server parse is the authority (§36).

## 6.1 Grammar

```ebnf
expression := term       ( ( "+" | "-" ) term )*
term       := unary      ( ( "*" | "/" ) unary )*
unary      := ( "-" | "+" )? primary
primary    := NUMBER
            | IDENT
            | IDENT "(" [ expression ( "," expression )* ] ")"
            | "(" expression ")"

NUMBER     := [0-9]+ ( "." [0-9]+ )?
IDENT      := [a-zA-Z] [a-zA-Z0-9_]*
```

Left-associative `+ - * /`, standard precedence, unary minus binds tighter than
binary. There is deliberately no exponentiation, no modulo, no comparison, no
ternary, no assignment, no string, no member access and no indexing. Adding `^`
would introduce a cheap denial-of-service (`9^9^9`) for a feature nobody asked
for; `min`/`max` cover the real cases.

## 6.2 Tokenizer

```ts
type TokenKind = 'NUMBER' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';
interface Token { kind: TokenKind; value: string; pos: number }
```

Whitespace is skipped. **Any character outside `[0-9a-zA-Z_. \t+\-*/(),]` is a
`FormulaError` at position `pos`** — an allowlist, not a denylist, so nothing
exotic can slip through. A lone `.`, a double `..`, and a number with two dots
are all tokenizer errors.

## 6.3 AST

```ts
type Node =
  | { type: 'Number';   value: number }
  | { type: 'Variable'; name: string }
  | { type: 'Unary';    op: '-' | '+';           operand: Node }
  | { type: 'Binary';   op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { type: 'Call';     name: FunctionName;      args: Node[] };
```

## 6.4 Whitelists and limits

| Whitelist | Members |
|---|---|
| Binary operators | `+`, `-`, `*`, `/` |
| Unary operators | `-`, `+` |
| Functions | `ceil/1`, `floor/1`, `round/1`, `min/2`, `max/2` |
| Variables | context-dependent — §6.5 |

Anything else — an unknown identifier, an unknown function, a wrong arity, a
call on a non-whitelisted name — is a **parse-time** `FormulaError`.

| Limit | Value | Reason |
|---|---|---|
| source length | 200 chars | admin config, not a programming surface |
| token count | 100 | |
| AST node count | 100 | |
| AST depth | 16 | bounds recursion; no stack overflow from nested parens |

Evaluation is a single tree walk with no loops, recursion into user data or
allocation beyond the AST, so the work is bounded by node count and no timeout
mechanism is needed.

## 6.5 Variable environments and validation-time probing

```ts
const FORMULA_CONTEXTS = {
  buyoutCost:    ['currentValue', 'baseValue', 'buyoutCount'],
  valueIncrease: ['currentValue', 'baseValue', 'buyoutCount'],
} as const;
```

Exactly PRD §2's three variables. `memberBalance` was considered and rejected:
means-tested pricing is a product decision nobody asked for, and it would couple
formula evaluation to a locked row.

**Formulas are validated when the config is saved, never first seen at runtime.**
`POST /admin/config/validate` and `PUT /admin/config` both run:

1. tokenize + parse (unknown variable or function → `formulaErrors`);
2. **probe evaluation** over a fixed grid —
   `currentValue ∈ {0,1,2,4,7,50,999}` × `baseValue ∈ {1,4,7}` ×
   `buyoutCount ∈ {0,1,5}` — asserting the result is finite, non-NaN, and (for
   `valueIncrease`) **strictly greater than `currentValue`** at every probe;
3. return `previews` so the admin sees the `4 → 6 → 9 → 14` chain their formula
   produces before saving (§31 applied to admins).

A formula that reaches the buyout hot path has therefore already been proven
parseable and increase-preserving. Runtime evaluation failures are still handled
(`FormulaError` → `500 INTERNAL_ERROR` with the config version logged) but are
unreachable by construction.

## 6.6 Buyout cost strategies (§8)

```ts
function buyoutCost(cfg: Config, ctx: FormulaContext): number
```

| Strategy | Raw expression | Then |
|---|---|---|
| `FIXED` | `cfg.buyout.fixedCost` | — |
| `CURRENT_TASK_VALUE` **(default)** | `ctx.currentValue` | — |
| `MULTIPLIER` | `ctx.currentValue * cfg.buyout.multiplier` | round by `cfg.buyout.costRounding` |
| `FORMULA` | `evaluate(cfg.buyout.costFormula, ctx)` | round by `cfg.buyout.costRounding` |

Normalization, always: `cost = clamp(round(raw), 1, MAX_SAFE_INTEGER)`.
The floor of **1** is what makes §44's "a buyout costs points" true even for a
task whose `currentValue` is 0 — and it agrees with the `pt_buyout_costs_points`
CHECK, so the two can never disagree.

Default (`CURRENT_TASK_VALUE`) reproduces §8's `buyoutCost = currentTaskValue`
and §21's worked example exactly.

## 6.7 Value strategies (§9, §11)

```ts
function increasedValue(cfg: Config, ctx: FormulaContext): number
function resetValue(cfg: Config, ctx: { currentValue: number; baseValue: number }): number
```

| `valueIncrease.strategy` | Raw |
|---|---|
| `FIXED_INCREMENT` | `cur + cfg.valueIncrease.increment` |
| `PERCENTAGE` | `cur * (1 + cfg.valueIncrease.percentage / 100)` |
| `MULTIPLIER` **(default)** | `cur * cfg.valueIncrease.multiplier` |
| `CUSTOM_FORMULA` | `evaluate(cfg.valueIncrease.formula, ctx)` |

Normalization pipeline, in order:

```
v = applyRounding(raw, cfg.valueIncrease.rounding)      // CEIL default (§39)
v = max(v, cur + cfg.valueIncrease.minimumIncrease)     // minimumIncrease >= 1 -> §44
if (cfg.valueIncrease.maximumValue !== null) {
  if (cur >= cfg.valueIncrease.maximumValue) throw ConflictError('BUYOUT_AT_VALUE_CAP')  // OQ-1
  v = min(v, cfg.valueIncrease.maximumValue)
}
```

Note the cap is checked **before** clamping, not after: silently clamping to the
same value would produce a buyout that charged points without raising the value,
violating §44. Rejecting is the only behaviour consistent with the invariant.

Default chain, verifying §35: `4 → ceil(4×1.5)=6 → ceil(6×1.5)=9 →
ceil(9×1.5)=14` — end-condition 18.

`resetValue`, per §11 / §5.7:

| `completion.resetStrategy` | Result |
|---|---|
| `BASE_VALUE` **(default)** | `baseValue` |
| `DECREASE_PERCENTAGE` | `max(baseValue, ceil(cur × (1 − p/100)))` |
| `KEEP_CURRENT` | `cur` |

## 6.8 Assignment selection strategies (§12)

```ts
interface Rng { next(): number }            // [0, 1)
interface SelectionResult { selected: Candidate; trace: SelectionTrace }
function select(strategy, candidates: Candidate[], metrics: FairnessMetrics, cfg, rng): SelectionResult
```

`Candidate` carries the per-member metrics §12 lists, computed over
`cfg.fairness.windowDays`: `randomAssignments`, `voluntaryCompletions`,
`buyouts`, `completedTasks`, `totalEstimatedMinutes`,
`daysSinceLastRandomAssignment`.

| Strategy | Weight |
|---|---|
| `PURE_RANDOM` | every eligible candidate weight `1` |
| `WEIGHTED_RANDOM` | `max(floor, 1 + Σ coefficient_k × normalized(metric_k))` over the §12 criteria, coefficients from `fairness.*` |
| `LEAST_ASSIGNED_FIRST` | weight `1` for every candidate at `min(randomAssignments)`, `0` for the rest; ties broken uniformly at random |
| `WEIGHTED_FAIRNESS` **(default)** | PRD §3E, verbatim below |

**`WEIGHTED_FAIRNESS` — PRD §3E, used verbatim:**

```
weight(person) = max(0.1,
    1.0
  + fairness.randomAssignmentWeight  * (avgRandomAssignments - personRandomAssignments)
  + fairness.voluntaryWorkWeight     * (personVoluntaryCompletions - avgVoluntaryCompletions)
  - fairness.recentAssignmentPenalty * recencyFactor(person)
)

recencyFactor(person) = 1 / (1 + daysSinceLastRandomAssignment)
```

The literal `0.1` floor is `cfg.fairness.weightFloor` (default `0.1`, validated
`> 0`), and the averages are taken over the eligible candidate set within
`cfg.fairness.windowDays` (OQ-7). A member who has never had a random assignment
gets `daysSinceLastRandomAssignment = windowDays`, so `recencyFactor → ~0` and
they are not penalized for having no history.

**Drawing.** Cumulative-sum over normalized weights and one `rng.next()` draw —
O(n) for n ≤ 20; an alias table would be pure ceremony (§43).

```ts
const total = weights.reduce((a, b) => a + b, 0);
let r = rng.next() * total, i = 0;
while (r >= weights[i] && i < weights.length - 1) { r -= weights[i]; i += 1; }
```

**RNG injection.** `Rng` is part of `Deps` (§7.2). Production uses
`crypto.randomInt`-backed uniform doubles; tests and the §34 simulation use a
seeded `mulberry32`, which is what makes the distribution tests and
end-condition 24 reproducible.

## 6.9 Eligibility filter and the relaxation ladder

Ordered predicates. Each rejection records an `EligibilityReason`, which is what
§6's audit requirement and §32's transparency view both consume.

| # | Reason code | Hard? | Applies to volunteering? |
|---|---|---|---|
| 1 | `MEMBER_INACTIVE` | **hard** | yes |
| 2 | `MEMBER_ABSENT` (an absence window covers now) | **hard** | yes |
| 3 | `EXCLUDED_FROM_TASK` (`TaskDefinitionEligibility.EXCLUDED`) | **hard** | yes |
| 4 | `NOT_IN_ALLOWLIST` (definition has `INCLUDED` rows, member is not one) | **hard** | yes |
| 5 | `CATEGORY_EXCLUDED` (`MemberCategoryExclusion`) | **hard** | yes |
| 6 | `RANDOM_ASSIGNMENT_CAP_REACHED` (`maxRandomAssignmentsPerWeek`) | soft | **no** |
| 7 | `IMMEDIATE_REASSIGNMENT_BLOCKED` (`preventImmediateReassignment` / `reassignmentCooldownCycles`) | soft | **no** |

Rules 6 and 7 are fairness protections against being *given* work. They never
block someone who *wants* the task, so §5 volunteering only checks rules 1–5.

**Relaxation ladder (PRD §3D).** If the eligible set is empty and
`cfg.assignment.relaxConstraintsWhenNoCandidates`:

```
1. drop rule 7  -> record CONSTRAINT_RELAXED { constraint: 'IMMEDIATE_REASSIGNMENT' }
2. drop rule 6  -> record CONSTRAINT_RELAXED { constraint: 'ASSIGNMENT_CAP' }
3. still empty  -> T5: no assignment; NO_ELIGIBLE_CANDIDATES; notify admins;
                   push offerExpiresAt forward and retry next sweep
```

Rules 1–5 are **never** relaxed: assigning a chore to someone who is on holiday
or explicitly excluded is worse than leaving it unassigned. Every relaxation is
in the history and in `SelectionExplanationDto.constraintsRelaxed`, so the person
picked twice in a row sees exactly why — which is the case §6 and §32 most need
to explain.

## 6.10 Selection trace

Written to `TaskAssignment.selectionTrace` and, with more detail, to the
`RANDOM_SELECTION` audit event.

```ts
interface SelectionTrace {
  strategy: AssignmentStrategy;
  configVersion: number;
  decidedAt: string;
  windowDays: number;
  constraintsRelaxed: Array<{ constraint: string; reason: string }>;
  candidates: Array<{
    memberId: string;
    included: boolean;
    exclusionReason: EligibilityReason | null;
    metrics: FairnessMetrics | null;
    weightTerms: Record<string, number> | null;   // per-term breakdown of §6.8
    weight: number | null;
    probability: number | null;
    selected: boolean;
  }>;
}
```

The audit event additionally stores `{ rngSeed, draw }` so an admin can replay a
selection exactly. The member-facing `/explain` response omits both (§32: the
random number need not be shown), which keeps the transparency view about
*fairness* rather than about second-guessing the draw.

## 6.11 Strategy registration

Each family is a `Record<StrategyName, StrategyFn>` in `apps/api/src/domain/`,
looked up by the config string. Adding a strategy means adding a key and a pure
function; the config schema's enum and the record's keys are checked against each
other at compile time (`satisfies Record<AssignmentStrategy, …>`), so a strategy
can never be configurable but unimplemented.

---

# 7. Module structure

## 7.1 Workspace layout

```
haushaltsauktion/
├─ package.json                  # npm workspaces: apps/*, packages/*
├─ docker-compose.yml            # postgres + api + web, one command (§30)
├─ .env.example
├─ README.md
├─ packages/
│  └─ shared/                    # imported by BOTH api and web
│     └─ src/
│        ├─ domain/
│        │  ├─ enums.ts          # TaskStatus, AssignmentKind, … (mirror of Prisma enums)
│        │  ├─ ids.ts            # branded id types
│        │  └─ reasons.ts        # EligibilityReason, BuyoutDenialReason
│        ├─ config/
│        │  ├─ schema.ts         # Zod HouseholdConfigSchema (§5.3)
│        │  ├─ defaults.ts       # DEFAULT_CONFIG (§39)
│        │  └─ types.ts
│        ├─ formula/
│        │  ├─ tokenizer.ts      # §6.2
│        │  ├─ parser.ts         # §6.1, §6.3
│        │  ├─ evaluator.ts      # §6.4
│        │  ├─ contexts.ts       # §6.5 variable whitelists
│        │  └─ index.ts
│        ├─ api/                 # request + response contracts (Zod schemas + inferred types)
│        │  ├─ auth.ts  tasks.ts  assignments.ts  points.ts
│        │  ├─ history.ts  admin.ts  errors.ts    # ErrorCode union (§3.13)
│        └─ time/
│           └─ week.ts           # weekKey(now, tz) (§5.6)
└─ apps/
   ├─ api/
   │  ├─ prisma/
   │  │  ├─ schema.prisma
   │  │  ├─ migrations/         # incl. the raw-SQL constraints of §1.5
   │  │  └─ seed.ts             # §38 Demo Family
   │  └─ src/
   │     ├─ domain/             # PURE. No Prisma, no Fastify, no I/O.
   │     │  ├─ task/
   │     │  │  ├─ state-machine.ts    # §2.4 TRANSITIONS, resolve, illegalPairs
   │     │  │  └─ value.ts            # increasedValue, resetValue (§6.7)
   │     │  ├─ buyout/
   │     │  │  ├─ cost.ts             # buyoutCost (§6.6)
   │     │  │  └─ rules.ts            # balance + cap checks, pure predicates
   │     │  ├─ assignment/
   │     │  │  ├─ eligibility.ts      # §6.9 filter + relaxation ladder
   │     │  │  ├─ strategies.ts       # §6.8 strategy record
   │     │  │  └─ weights.ts          # WEIGHTED_FAIRNESS formula
   │     │  ├─ points/
   │     │  │  └─ ledger-math.ts      # balance arithmetic, chain assertions
   │     │  ├─ recurrence/
   │     │  │  └─ next-occurrence.ts  # §1.4 recurrence table
   │     │  ├─ config/
   │     │  │  └─ resolve.ts          # §5.5 pinning rule
   │     │  └─ errors.ts              # DomainError hierarchy
   │     ├─ app/                # use-cases: orchestration + transactions
   │     │  ├─ deps.ts                # Deps { db, clock, rng, logger, notifier, hooks }
   │     │  ├─ tx.ts                  # withTransaction, lockInstance, lockAssignment, lockMember
   │     │  ├─ tasks/ volunteerForTask.ts  completeTask.ts  releaseTask.ts
   │     │  ├─ buyout/ quoteBuyout.ts  executeBuyout.ts
   │     │  ├─ assignment/ runAssignmentSweep.ts  materializeInstances.ts  revokeAssignment.ts
   │     │  ├─ points/ postTransaction.ts  adjustPoints.ts  verifyLedgerIntegrity.ts
   │     │  ├─ config/ updateConfig.ts  validateConfig.ts
   │     │  ├─ queries/               # read models for the DTOs of §3
   │     │  └─ notifications/ notify.ts
   │     ├─ infra/
   │     │  ├─ prisma/ client.ts  raw-locks.ts
   │     │  ├─ auth/ password.ts  session.ts  csrf.ts
   │     │  ├─ http/ server.ts  plugins/  routes/  error-mapper.ts  context.ts
   │     │  ├─ jobs/ worker.ts        # the interval sweep (PRD §2)
   │     │  └─ logging/ logger.ts     # pino, correlation ids
   │     ├─ simulation/               # §34 dev tool — imports domain/ only
   │     │  ├─ simulate.ts  report.ts  cli.ts
   │     ├─ config.ts                 # env parsing (Zod)
   │     └─ main.ts
   └─ web/                            # Vite React SPA — owned by the Frontend Agent
      └─ src/ {api-client, features/{dashboard,tasks,assignment,history,admin}, components, hooks}
```

## 7.2 Layer contract

**`domain/` is pure.** Every function is `(inputs) => output`, total, and
deterministic. No `Date.now()`, no `Math.random()`, no database, no HTTP. Time
and randomness arrive as parameters. This is what makes the value chain, the
fairness weights, the eligibility ladder and the state machine testable with
plain Vitest unit tests and no fixtures — and it is what the §34 simulation
imports to run 1000 cycles in milliseconds without a database.

**`app/` orchestrates.** Use-cases take `(deps, input)` and own the transaction
boundary, the lock order (§4.2) and the audit/history writes. They talk to
Prisma **directly** — no repository interfaces.

That is a deliberate departure from textbook hexagonal architecture. Repository
ports would add an interface, an implementation and a fake for every entity, and
buy an ability to swap the database that this project will never use. The
requirement is that *domain logic* be testable in isolation from Prisma and
Fastify, and it is — `domain/` never imports either. Use-cases are covered by
integration tests against a real Postgres, which is where transaction and lock
behaviour has to be tested anyway (§43).

Only four things are injected, because only these four break determinism or
reach outside:

```ts
interface Deps {
  db: PrismaClient;
  clock: { now(): Date };
  rng: Rng;                                   // §6.8
  logger: Logger;
  notifier: Notifier;
  hooks?: { afterLock?(): Promise<void> };    // §4.8 test seam only
}
```

**`infra/http/` maps.** Routes validate with the shared Zod contracts, build
`request.ctx` (§3.2), call one use-case, and map `DomainError` subclasses to the
codes of §3.13. Routes contain no business logic — a route body that computes a
number is a review failure.

## 7.3 Import matrix

Rows may import columns marked ✓.

| ↓ imports → | `shared/*` | `api/domain` | `api/app` | `api/infra` | `@prisma/client` | `fastify` |
|---|---|---|---|---|---|---|
| `packages/shared` | ✓ (within) | ✗ | ✗ | ✗ | ✗ | ✗ |
| `api/domain` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `api/app` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| `api/infra` | ✓ | ✓ (errors + enums only) | ✓ | ✓ | ✓ | ✓ |
| `api/simulation` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `apps/web` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Two entries carry most of the weight:

- **`api/app` → `api/infra` is ✗.** Use-cases must not reach into HTTP, auth or
  the job runner. Everything they need arrives in `Deps`. This is what lets an
  integration test call `executeBuyout(deps, input)` with no server running.
- **`apps/web` → `api/*` is ✗.** The web app sees `packages/shared` and nothing
  else. It gets the enums, the error codes, the DTO types and the formula parser
  (for admin previews) — and cannot import a domain function and start computing
  a binding value client-side, which §36 forbids.

## 7.4 Enforcement

Not a convention — a build failure.

```jsonc
// .eslintrc.cjs — eslint-plugin-import
"import/no-restricted-paths": ["error", { "zones": [
  { "target": "./apps/api/src/domain", "from": "./apps/api/src/app" },
  { "target": "./apps/api/src/domain", "from": "./apps/api/src/infra" },
  { "target": "./apps/api/src/domain", "from": "./node_modules/@prisma/client" },
  { "target": "./apps/api/src/domain", "from": "./node_modules/fastify" },
  { "target": "./apps/api/src/app",    "from": "./apps/api/src/infra" },
  { "target": "./packages/shared",     "from": "./apps/" }
]}]
```

Plus three project-specific rules:

1. **`no-restricted-globals` in `domain/`** for `Date`, `Math.random`,
   `process` — purity is checked, not trusted.
2. **A household-scope lint rule**: any `prisma.<householdScopedModel>.find*` /
   `update*` / `delete*` whose `where` lacks `householdId` is an error. This is
   the mechanical half of §36's "no access to foreign households".
3. **A lock-order lint rule**: within one `withTransaction` callback,
   `lockAssignment` may not appear before `lockInstance`, and `lockMember` may
   not appear before either (§4.2). Deadlock freedom is a static property here,
   so it is checked statically.

---

# 8. Ledger integrity

## 8.1 The property

`PointTransaction` is the source of truth (§14). `HouseholdMember.pointsCache`
is a derived read cache (PRD §3G). For every member, ordering by `seq`:

```
t[0].balanceBefore = 0
t[i].balanceBefore = t[i-1].balanceAfter            (chain)
t[i].balanceAfter  = t[i].balanceBefore + t[i].amount  (arithmetic)
member.pointsCache = t[last].balanceAfter = Σ amount   (cache)
```

## 8.2 The single writer

Nothing anywhere else touches `pointsCache`. One function, in
`apps/api/src/app/points/postTransaction.ts`:

```ts
export async function postTransaction(
  tx: PrismaTx,
  input: {
    householdId: string;
    memberId: string;
    amount: number;                  // signed; 0 is rejected
    type: PointTransactionType;
    taskInstanceId?: string;
    taskAssignmentId?: string;
    assignmentKind?: AssignmentKind; // required iff taskAssignmentId is set
    description?: string;
    initiatorMemberId?: string | null;
    initiatorType?: ActorType;
    idempotencyKey?: string;
  },
): Promise<PointTransaction>;
```

Steps, all inside the caller's transaction:

1. **Reject `amount === 0`.** A zero entry would blur §7's "no points" (which is
   the *absence* of a row) with a real event.
2. **Lock the member (level 3, §4.2):**
   `SELECT id, points_cache FROM household_members WHERE id = $memberId AND household_id = $householdId FOR UPDATE`.
   Missing row → `NotFoundError`, which also enforces household scope.
3. `balanceBefore = row.points_cache`; `balanceAfter = balanceBefore + amount`.
   Because the row is locked, no concurrent writer can interleave, so the cache
   is authoritative for the duration.
4. Read `previousTransactionId`: the id of this member's highest-`seq` entry, or
   the literal `'GENESIS'`.
5. `INSERT` the row. Three constraints fire here if anything is wrong:
   `pt_balance_arithmetic`, the per-type sign checks, and
   `UNIQUE(memberId, previousTransactionId)`.
6. `UPDATE household_members SET points_cache = $balanceAfter WHERE id = $memberId`
   — an absolute write of the value just recorded, never `{ decrement }`, so the
   cache cannot drift from the row.
7. On `idempotencyKey` unique violation (23505), return the **existing** row
   instead of throwing. A retried buyout is then a no-op that reports the same
   result, not a double charge.

Callers: `volunteerForTask` (ON_ACCEPT only), `completeTask` (voluntary only),
`executeBuyout`, `releaseTask`/`revokeAssignment` (clawback), `adjustPoints`,
and a future decay job. That list is closed and greppable.

## 8.3 Why the chain column

`previousTransactionId` with `@@unique([memberId, previousTransactionId])` makes
a forked ledger a database error. If two writers ever both read the same tail —
because someone removed a lock, or a future code path forgot one — the second
insert violates the unique constraint and its whole transaction aborts. Without
it, two transactions could each write a plausible-looking row and the ledger
would silently contain two "next" entries for the same predecessor.

`'GENESIS'` is used instead of `NULL` for the first entry deliberately: Postgres
does not treat two `NULL`s as equal, so a nullable column would permit two
competing first entries — the exact case the constraint exists to prevent.

Cost: one non-null string column and one composite index. Benefit: the ledger's
core structural property is enforced by Postgres rather than by review.

## 8.4 Why the cache at all

Every §19 dashboard and §3.7 roster response needs balances for every member. A
`SUM(amount)` per member per request is correct but re-reads the whole ledger for
a value that changes a few times a day. The cache is maintained inside the same
transaction as the row that justifies it, verified by §8.5, and repairable from
the ledger — so it is a cache in the strict sense: derivable, never authoritative.

## 8.5 `verifyLedgerIntegrity()`

```ts
// apps/api/src/app/points/verifyLedgerIntegrity.ts

export type LedgerViolation =
  | { kind: 'CACHE_MISMATCH';      memberId: string; cachedBalance: number; ledgerSum: number }
  | { kind: 'CHAIN_BREAK';         memberId: string; transactionId: string;
                                   expectedBalanceBefore: number; actualBalanceBefore: number }
  | { kind: 'CHAIN_FORK';          memberId: string; previousTransactionId: string; transactionIds: string[] }
  | { kind: 'MULTIPLE_GENESIS';    memberId: string; transactionIds: string[] }
  | { kind: 'ARITHMETIC_BREAK';    transactionId: string; balanceBefore: number; amount: number; balanceAfter: number }
  | { kind: 'SIGN_VIOLATION';      transactionId: string; type: PointTransactionType; amount: number }
  | { kind: 'ZERO_AMOUNT';         transactionId: string }
  | { kind: 'REWARD_ON_RANDOM';    transactionId: string; assignmentId: string }
  | { kind: 'DUPLICATE_REWARD';    assignmentId: string; transactionIds: string[] }
  | { kind: 'DUPLICATE_BUYOUT';    assignmentId: string; transactionIds: string[] }
  | { kind: 'ORPHAN_WORK_TX';      transactionId: string; type: PointTransactionType }
  | { kind: 'BALANCE_BELOW_MINIMUM'; memberId: string; balance: number; minimumBalance: number };
  //         ^ config-dependent; reported as a warning, since a config change can
  //           legitimately raise minimumBalance above an existing balance.

export interface LedgerIntegrityReport {
  checkedAt: string;
  householdId: string | null;         // null = every household
  memberCount: number;
  transactionCount: number;
  violations: LedgerViolation[];
  warnings: LedgerViolation[];
  ok: boolean;                        // violations.length === 0
  durationMs: number;
}

export async function verifyLedgerIntegrity(
  db: PrismaClient,
  opts?: { householdId?: string; repairCache?: boolean },
): Promise<LedgerIntegrityReport>;
```

Implementation: for each member, stream transactions ordered by `seq` and walk
the chain once — O(total transactions), no per-row query. `repairCache: true`
rewrites `pointsCache` from the computed sum, writes a `LEDGER_CACHE_REPAIRED`
audit event, and is the **only** thing repair does. The ledger itself is never
auto-corrected; the only remedy for a bad entry is a compensating `CORRECTION`
transaction, which is itself an audited ledger row (§14).

Three call sites:

1. `GET /api/admin/ledger/integrity` (ADMIN) — §3.11.
2. A global `afterEach` in the integration suite, so **every** integration test
   proves the ledger is consistent after whatever it just did. This is
   end-condition 14, applied continuously rather than once.
3. `npm run verify:ledger` — a CLI for an operator.

## 8.6 Append-only at the database level

Two database roles in `docker-compose` and the migration bootstrap:

| Role | Grants |
|---|---|
| `haushalt_migrator` | owner; used only by `prisma migrate deploy` |
| `haushalt_app` | runtime; `SELECT, INSERT, UPDATE, DELETE` on all tables **except**: no `UPDATE`/`DELETE` on `point_transactions`, `audit_events`, `task_history_events` |

```sql
REVOKE UPDATE, DELETE ON point_transactions, audit_events, task_history_events
  FROM haushalt_app;
```

A bug that tries to "fix" a balance by editing a ledger row fails at the database
with a permission error rather than silently succeeding. This is the strongest
available form of §14's "Punkte dürfen niemals einfach als numerischer Wert ohne
Historie verändert werden", and it costs one SQL statement.

`DATABASE_URL` uses `haushalt_app`; `DATABASE_MIGRATION_URL` uses
`haushalt_migrator`. For a single-user local setup, `SKIP_ROLE_SEPARATION=true`
runs everything as the owner — documented in the README, off by default in
compose.

---

# 9. Open questions

Genuinely unsettled by `CLAUDE.md` and the PRD. Each has a recommendation, and
each recommendation is what the document above already assumes — so a "yes" to
all seven needs no edits, and a "no" to any one has a bounded blast radius.

**OQ-1 — Does `resetStrategy: KEEP_CURRENT` carry the escalated value into the
next occurrence?**
§11 offers `KEEP_CURRENT` and `DECREASE_PERCENTAGE`, but with `TaskDefinition` /
`TaskInstance` separated, the completed instance is terminal, so both options are
no-ops unless the next instance inherits. PRD §3F says escalated value does not
survive — but §3F is about instances that *expire uncompleted*, a different case.
**Recommendation: `TaskDefinition.carriedValue` (§5.7).** Non-default strategies
carry forward on completion; expiry always clears. Extends PRD §3F rather than
contradicting it. Default `BASE_VALUE` leaves the field permanently null.
*If rejected:* drop `carriedValue` and remove `KEEP_CURRENT` /
`DECREASE_PERCENTAGE` from the config enum — do not keep options that do nothing.

**OQ-2 — Is there a penalty for letting an assigned task expire?**
`PointTransactionType.PENALTY` exists in §14 but nothing in the spec ever fires
it. Without a consequence, a random assignee can simply ignore the task and pay
nothing — which is a cheaper exit than the buyout the economy is built around.
**Recommendation: no automatic penalty in the MVP.** T17 expires the assignment
with no charge; `PENALTY` stays admin-manual. Automatic punishment for a missed
chore is a family-dynamics decision, not an architectural one, and §31 forbids
dark patterns. Revisit with `assignment.expiryPenalty` config once real usage
shows whether ignoring is actually being exploited.

**OQ-3 — Is "Aufgabe übernehmen" on an assigned task a state transition?**
§4 writes `ASSIGNED → akzeptiert → COMPLETED` and §21 shows an "Aufgabe
übernehmen" button, which reads like a third state.
**Recommendation: no.** Acceptance sets `TaskAssignment.response = ACCEPTED` and
`respondedAt` (T6) without touching `TaskInstance.status`. It records
accountability and drives the UI, but adding an `ACCEPTED` instance state would
add 11 rows to the legality matrix and a second "is it really assigned" question
to every query for a distinction nothing else consumes.

**OQ-4 — When does an instance expire, and can the offer window outlive the due
date?** §6 gives an offer duration; §3.2 gives an optional due date; nothing says
what happens when `publishedAt + offerDuration > dueAt`, or when an instance has
no due date at all.
**Recommendation:** `offerExpiresAt = min(publishedAt + offerDurationMinutes,
dueAt − leadMinutesBeforeDue)` and `expiryDeadline = dueAt ?? next occurrence
start` (§5.8), with a new `assignment.leadMinutesBeforeDue` key defaulting to 0.
At the default this is exactly the spec's implicit behaviour; households that
want the draw to happen before the chore is late can raise it.
*Needs confirmation:* a `MANUAL`/`ONCE` task with no due date then never expires.
That is intended — an ad-hoc chore should stay open until done or cancelled.

**OQ-5 — Can two open instances of the same definition coexist?**
If Monday's "Müll rausbringen" is still `AVAILABLE` when Thursday's materializes,
the spec does not say whether both are offered.
**Recommendation:** `tasks.maxOpenInstancesPerDefinition`, default **1**. A new
occurrence expires the older open instance (T16, value reset per PRD §3F). Two
identical cards with different values is confusing on a phone (§19, §31), and the
escalated value of the abandoned one is correctly discarded.
*Alternative if rejected:* default 2 or 3 and show them grouped — but then the
value of "the" chore becomes ambiguous, and §33's Market Value gets murkier.

**OQ-6 — What is "a week" for the buyout and assignment caps?**
§8 and §3.1 both cap "per week" without defining the boundary.
**Recommendation: ISO calendar week in `Household.timezone` (default
Europe/Berlin)**, not a rolling 7 days — "you have one buyout left this week"
only makes sense if the week visibly resets, and a rolling window makes the UI
unable to state when the limit lifts. Requires the `Household.timezone` column,
which is in the schema.

**OQ-7 — Over what window are the `WEIGHTED_FAIRNESS` averages computed?**
PRD §3E fixes the formula (used verbatim, §6.8) but not the lookback for
`avgRandomAssignments` / `personVoluntaryCompletions`. Lifetime counts make the
system unresponsive after a few months — someone who did a lot in March stays
protected in September.
**Recommendation: `fairness.windowDays`, default 28.** Long enough to smooth a
holiday, short enough to react within a month. Members with no history in the
window get `daysSinceLastRandomAssignment = windowDays`, so they are not punished
for being new. §34's simulation should sweep this value (7 / 28 / 90) and report
the resulting distribution spread, which turns the default into a measured choice
rather than a guessed one.

**OQ-8 — Behaviour when `valueIncrease.maximumValue` is reached.**
§9 allows a cap; §44 requires a buyout to raise the value. At the cap the two
collide.
**Recommendation: reject the buyout** with `409 BUYOUT_AT_VALUE_CAP` (§6.7)
rather than charging points without raising the value. Rejecting preserves the
invariant; the alternative breaks it silently. Default `maximumValue: null` means
this never fires unless an admin opts in, and the admin UI warns when a cap is
set below the tallest reachable value.
*Product call:* it does leave a member stuck with a task they cannot buy out.
That is honest but may surprise; if unacceptable, the answer is to forbid
`maximumValue` entirely rather than to weaken §44.

---

## Appendix A — spec coverage

| Spec section | Where addressed |
|---|---|
| §3.1 persons, restrictions | §1.3 `HouseholdMember`, `MemberAbsence`, `MemberCategoryExclusion`; §6.9 |
| §3.2 task fields | §1.3 `TaskDefinition` + `TaskInstance`; §1.4 |
| §4 state machine | §2 |
| §5 voluntary takeover | T3; §4.3; `voluntary.*` |
| §6 random assignment + audit | T4/T5; §6.8–§6.10 |
| §7 zero points for random | T7; §1.5 `pt_reward_only_for_voluntary`; §5.4 |
| §8 buyout | T8; §4.4; §6.6 |
| §9 value increase | §6.7 |
| §10 re-offer cycle | T8 side effects |
| §11 reset after completion | §6.7; §5.7 |
| §12 fairness strategies | §6.8 |
| §13 repeat-assignment prevention | §6.9 rule 7 + relaxation ladder |
| §14 ledger | §1.3 `PointTransaction`; §8 |
| §15 point decay | §5.3 `points.decay` (surface only, PRD §4) |
| §16 / §17 configuration | §5 |
| §18 recurrence | §1.4 |
| §19 dashboard | `GET /api/dashboard`, `/tasks/board` |
| §20 open-task card | `AvailableTaskDto` |
| §21 assigned-task screen | `AssignedTaskDto`, `BuyoutQuoteDto` |
| §22 history | §2.6; `GET /api/history` |
| §23 audit log | §1.3 `AuditEvent`; `AuditAction` enum |
| §24 notifications | §1.3 `Notification`; §3.9 |
| §25 auth | §3.1, §3.3 |
| §26 multi-household | §1.2, §3.2 |
| §27 domain model | §1.3 |
| §28 atomicity | §4.3–§4.5 |
| §29 API | §3 |
| §30 stack / monolith | §7 |
| §31 UX consequences | `BuyoutQuoteDto`; §3.5 confirmation protocol |
| §32 fairness transparency | §3.6; §6.10 |
| §33 statistics | deferred (PRD §4); `TaskAssignment.valueAtAssignment` is the data Market Value needs |
| §34 simulation | `apps/api/src/simulation` (§7.1), pure-domain by construction |
| §35 test cases | §4.8; end-conditions 6–19 |
| §36 security | §3.1, §3.2, §3.12, §7.3, §8.6 |
| §37 non-functional | §7; Prisma migrations; pino |
| §38 seed data | `prisma/seed.ts` |
| §39 defaults | §5.3 |
| §43 anti-overengineering | §7.2 (no repository ports), §6.8 (no alias method), §1.4 (no RRULE) |
| §44 invariants | §1.5, §5.4 |
