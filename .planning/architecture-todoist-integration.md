# Architektur: Todoist-Integration

Phase 2 output of campaign `todoist-integration`. Planning artefact — **no source files were
touched producing this.**

**Revision 9.** r1 → BLOCK (7 critical), r2 → BLOCK (4), r3 → BLOCK (2), r4 → BLOCK (3),
r5 → BLOCK (3), r6 → BLOCK (2), r7 → BLOCK (1, bookkeeping), r8 → BLOCK (1, one false sentence
in prose). **r9 changes no design either:** it corrects the characterisation of the
single-reconciler assumption in §7 — the missing advisory lock is a *correctness* precondition
for horizontal scaling, not the "politeness bug" r8 called it, because a stale read across
another process's completed dispatch can duplicate a task and not merely a notification — and
adds an enforceable configuration guard so the assumption is checkable rather than hoped for.
Earlier: r7 fixed r6's two criticals —
a re-proposable terminal state that manufactured duplicate Todoist tasks, and an un-mechanised
notification cap — plus a `triggers` key-case bug that would have made the whole feature a silent
no-op. The reviewer verified every r7 mechanism as sound and blocked only on two stale sentences
that still said `DEAD` where §3.2/§7/§7.1/§8/§8.2 now say `ORPHANED`. **r8 changes no design:** it
removes that staleness, corrects an index attribution, settles when `ORPHANED` is entered, and
records the single-process assumption behind notification idempotency (§7). §14 has the full
history; §7.1 carries the generalised rule.

Companion documents: `.planning/architecture-haushaltsauktion.md` (*Architektur §x*),
`CLAUDE.md` (*§x*), campaign file `.planning/campaigns/todoist-integration.md`.

---

## 1. The design, and the six wrong turns behind it

r1-r3 shared one premise: **hook the integration onto the moment an event happens.** r1
decorated `Notifier` — but `executeBuyout.ts:275` excludes the buying-out member from the
audience, so the one person whose task must close was unreachable. r2 wrote inside the core
transaction — but `postTransaction.ts:60-64` documents that a Postgres constraint violation
aborts the whole transaction and cannot be caught in place, so a duplicate key would roll back
the buyout. r3 tailed the history log by `seq` — but sequences are allocated at INSERT, not
commit, so a lower `seq` can commit after a higher one and fall permanently below the cursor.

**r4 replaced edge-triggering with level-triggered reconciliation**, and that frame has survived
every review since. The reconciler never observes a transition. It compares:

- **desired** — assignments this member currently owns and should see in Todoist (§6);
- **actual** — open `IntegrationTaskLink` rows;

and acts on the difference. `AssignmentStatus` (`schema.prisma:44-52`) is `ACTIVE | COMPLETED |
BOUGHT_OUT | RELEASED | REVOKED | EXPIRED | REJECTED`, so every way ownership ends collapses to
"no longer ACTIVE" — including `EXPIRED`, which r3 stranded.

**r4 then broke its own central property**: it carried a global `@@unique` on `enqueueKey` with
`skipDuplicates` inserts, so a terminal (`DEAD`/`SKIPPED`) row held the key forever and silently
swallowed every later proposal. A guard added for tidiness defeated self-healing. **r5 fixed
that** — partial unique index over non-terminal statuses only, plus eligibility moved into the
desired set — and the reviewer confirmed both fixes sound.

**r5's remaining three criticals were all one thing: the unresolved-link lifecycle.** That
subsystem existed *only* to compensate for the official SDK being REST-only, and therefore
lacking Todoist's Sync command-`uuid` idempotency. r5 was specifying two mutually exclusive
transport branches at once and doing the harder one badly.

**r6 takes the decision (§8.1): Sync for the two writes, SDK for the read-only project picker.**
Exactly-once delivery removes the reason the repair subsystem existed. Deleted in r6:
nullable `externalTaskId`, `closeReason = 'UNCONFIRMED'`, `INTEGRATION_UNCONFIRMED`,
`repairLinks.ts`, the 10-minute trigger, and the unbounded repair loop. §7's invariant that
**a CLOSE always carries an `externalTaskId`** is restored and true again.

The lesson worth keeping, because it cost five revisions: *complexity was never in the types; it
was in compensating for a missing guarantee.* Choosing the transport that provides the guarantee
deleted more code than any amount of careful specification would have.

**What the frame buys:**

| Prior finding | Why it has no analogue here |
|---|---|
| r3 C-1 — sequence visibility gap | no cursor, no sequence |
| r3 C-2 — `EXPIRED` stranded a task | never asks *how* ownership ended |
| r2 C-1 — constraint abort poisons the core tx | nothing written in a core transaction |
| r2 C-2 — FK `KEY SHARE` on task rows mid-buyout | no integration insert while task locks held |
| r1 C-5 / C-7 — audience and payload | both read from `TaskAssignment`, outside any lock |
| r5 C-1/C-2/C-3 — unresolved-link lifecycle | unresolved links cannot exist (§8.1) |

**No use-case is modified.** Every earlier scope guard is replaced by **zero**.

**Costs, stated plainly.** Up to one interval (default 60 s) of latency. A periodic indexed scan
per household instead of tailing a log — a few rows per household per minute at §43's volume of
1-20 members. The reconciler cannot distinguish *why* a task closed, so completion, buyout and
expiry look identical in Todoist; acceptable for one-way sync. If a member deletes the Todoist
task by hand it is not recreated — correct for one-way sync, worth a line in Phase 8's docs.
And a narrow, bounded id-recovery gap that §8.2 specifies rather than hides.

**`TASK_TAKEN` (D-07) is fully decoupled** — r6 reads `TaskAssignment` directly. It remains a
real in-app gap (`volunteerForTask.ts` and `reopen.ts` emit no notification at all) but is now an
independent improvement. Recommend a separate intake item.

---

## 2. Module layout

`eslint.config.js:84` forbids `app/` importing `infra/`. The convention (`deps.ts:21-47`) is
**interface in `app/`, implementation in `infra/`, composition in `main.ts`** — `main.ts` sits
outside the restricted zone, which is why it may import both.

```
apps/api/src/
  domain/                          UNCHANGED
  app/
    deps.ts                        + TodoistPort, SecretBox in Deps (interfaces declared here)
    integrations/
      ports.ts                     TodoistPort, SecretBox, TodoistFailure
      reconcile.ts                 pure: (desired, actual, inflight) => Plan  — §7
      runReconciliation.ts         reads the three sets, writes outbox rows
      dispatchOutbox.ts            claim → send → record
      connectTodoist.ts / disconnectTodoist.ts / updateTodoistSettings.ts
      testTodoistConnection.ts / pruneOutbox.ts
    queries/integrationReads.ts    status projection — never returns the token
  infra/
    integrations/secret-box.ts     implements SecretBox
    integrations/todoist-sync.ts   implements the two writes (POST /api/v1/sync)
    integrations/todoist-read.ts   implements the project picker via @doist/todoist-sdk
    integrations/todoist-errors.ts HTTP/sync_status → TodoistFailure
    jobs/todoist-worker.ts         setInterval: reconcile → dispatch
    http/routes/integrations.ts    member-scoped routes
  main.ts                          composes impls into Deps
```

`repairLinks.ts` is **gone** (r5 §2 listed it; §8.1 explains why it no longer exists).

`SecretBox` is a port, not a utility import, because `connectTodoist.ts` lives in `app/`.
`reconcile.ts` is a **pure set-difference function** with no I/O, so all trigger semantics are
table-driven unit tests with no database.

---

## 3. Data model

### 3.1 `MemberIntegration`

```prisma
enum IntegrationProvider { TODOIST }
enum IntegrationStatus   { ACTIVE INVALID_CREDENTIALS DISABLED }

model MemberIntegration {
  id          String              @id @default(cuid())
  householdId String              @map("household_id")
  memberId    String              @map("member_id")
  provider    IntegrationProvider
  status      IntegrationStatus   @default(ACTIVE)

  /// AES-256-GCM. Nie geloggt, nie serialisiert, von keiner Route zurückgegeben.
  /// NULL nach dem Trennen (§3.4).
  tokenCiphertext Bytes?  @map("token_ciphertext")
  tokenIv         Bytes?  @map("token_iv")
  tokenAuthTag    Bytes?  @map("token_auth_tag")
  tokenKeyVersion Int?    @map("token_key_version")
  tokenHint       String? @map("token_hint")

  projectId   String? @map("project_id")   // opake v1-ID: String, nicht Int
  projectName String? @map("project_name")

  /// Json, nicht Postgres-Array — schema.prisma nutzt durchgängig Json.
  /// Schlüssel sind EXAKT die AssignmentKind-Werte (schema.prisma:39-42):
  /// VOLUNTARY und RANDOM, GROSSGESCHRIEBEN. §6(5) und §7 indizieren mit
  /// triggers[A.kind]; kleingeschriebene Schlüssel ergäben `undefined` →
  /// falsy → NICHTS wäre je gewünscht und das Feature täte gar nichts.
  /// r6 hatte hier genau diesen Fehler (§14).
  /// Zod-validiert in updateTodoistSettings (§10), da member-geliefert:
  /// z.strictObject({ VOLUNTARY: z.boolean(), RANDOM: z.boolean() }).
  triggers Json @default("{\"VOLUNTARY\":true,\"RANDOM\":true}")

  lastSuccessAt DateTime? @map("last_success_at")
  lastErrorAt   DateTime? @map("last_error_at")
  lastErrorCode String?   @map("last_error_code")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  household Household             @relation(fields: [householdId], references: [id], onDelete: Cascade)
  member    HouseholdMember       @relation(fields: [memberId], references: [id], onDelete: Cascade)
  outbox    IntegrationOutbox[]
  links     IntegrationTaskLink[]

  @@unique([householdId, memberId, provider])
  @@index([householdId, status])
  @@map("member_integrations")
}
```

**Token viability is a derived predicate** used by §6: `status = ACTIVE` **and**
`tokenCiphertext IS NOT NULL`. Both matter — §3.4 nulls the token without deleting the row.

### 3.2 `IntegrationOutbox`

```prisma
/// ORPHANED (neu in r7): der CREATE war bei Todoist erfolgreich, aber die
/// zurückgegebene ID ist unwiederbringlich verloren (§8.2). Der EINZIGE
/// absorbierende Endzustand — Begründung in §8.2.
enum OutboxStatus    { PENDING SENT FAILED DEAD SKIPPED ORPHANED }
enum OutboxOperation { CREATE_TASK CLOSE_TASK }

model IntegrationOutbox {
  /// UUID, nicht cuid: wird VERBATIM als Todoist-Sync-Command-`uuid`
  /// übertragen und liefert damit Exactly-once-Zustellung (§8.1).
  id String @id @default(uuid())

  householdId   String @map("household_id")
  memberId      String @map("member_id")
  integrationId String @map("integration_id")

  operation OutboxOperation
  status    OutboxStatus    @default(PENDING)

  taskInstanceId String @map("task_instance_id")
  assignmentId   String @map("assignment_id")

  /// "todoist:{integrationId}:create:{assignmentId}" bzw. ":close:".
  /// Vorbild: PointTransaction.idempotencyKey (schema.prisma:527, executeBuyout.ts:172).
  /// KEIN globales @@unique — siehe den partiellen Index unten.
  enqueueKey String @map("enqueue_key")

  payload Json   // { content, description, dueAt, priority }

  attempts       Int       @default(0)
  nextAttemptAt  DateTime  @default(now()) @map("next_attempt_at")
  lastErrorCode  String?   @map("last_error_code")
  lastErrorBody  String?   @map("last_error_body")  // gekürzt; nie das Token

  /// Doppelt genutzt, bewusst und dokumentiert:
  ///   CREATE_TASK — NULL bis zum Erfolg, dann die von Todoist gelieferte ID;
  ///   CLOSE_TASK  — beim Einreihen aus IntegrationTaskLink kopiert (§7),
  ///                 also von Anfang an gesetzt.
  /// Deshalb nullable, obwohl IntegrationTaskLink.externalTaskId NOT NULL ist
  /// (§3.3): dort existiert eine Zeile erst NACH bestätigtem CREATE.
  externalTaskId String?   @map("external_task_id")

  createdAt DateTime  @default(now()) @map("created_at")
  /// Übergang in einen Endzustand (SENT/DEAD/SKIPPED/ORPHANED). Trägt die
  /// Sperrfrist und das Deckel-Fenster (§7).
  settledAt DateTime? @map("settled_at")
  /// Wann das Mitglied über diesen Schlüssel benachrichtigt wurde. Gibt dem
  /// zustandslosen 60-s-Reconciler ein Gedächtnis pro Schlüssel (§7):
  /// `notifications` besitzt KEINEN Dedup-Schlüssel (nur
  /// PointTransaction.idempotencyKey, schema.prisma:527), also wäre "genau eine
  /// Benachrichtigung" sonst nur behauptet — r6 hätte ~1440/Tag gesendet.
  memberNotifiedAt DateTime? @map("member_notified_at")

  household   Household         @relation(fields: [householdId], references: [id], onDelete: Cascade)
  member      HouseholdMember   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  integration MemberIntegration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  instance    TaskInstance      @relation(fields: [taskInstanceId], references: [id], onDelete: Cascade)

  /// Trägt Tx A (§8) UND die In-Flight-Abfrage (§7, erste Lesung): das Präfix
  /// (household_id, status) genügt für beide.
  @@index([householdId, status, nextAttemptAt])
  /// Trägt die Sperrfrist- und Deckel-Abfrage (§7, zweite Lesung) — die ist
  /// über settled_at prädiziert. Die ORPHANED-Abfrage (§7, dritte Lesung) hat
  /// KEIN settled_at-Prädikat und wird vom (household_id, status)-Präfix des
  /// Index oben getragen, nicht von diesem.
  @@index([householdId, settledAt])
  @@index([integrationId])
  @@index([taskInstanceId])
  @@map("integration_outbox")
}
```

**The partial unique index** — the r5 C-1 fix, retained. Prisma cannot express a partial unique
index, so it goes in the migration as raw SQL:

```sql
CREATE UNIQUE INDEX integration_outbox_live_key
    ON integration_outbox (household_id, enqueue_key)
 WHERE status IN ('PENDING', 'FAILED');
```

This states the constraint's actual purpose: **do not queue the same work twice while it is in
flight.** Terminal rows are history, not queue, and must not block re-proposal — that was r4's
bug.

**This is the codebase's established idiom, not a novelty.**
`prisma/migrations/20260830000100_constraints/migration.sql:110-112` already ships
`CREATE UNIQUE INDEX "ta_one_active_assignment_per_instance" ON "task_assignments"
("task_instance_id") WHERE "status" = 'ACTIVE'` — structurally identical — and `:67-73` ships two
more. That migration's header states the governing philosophy ("was die Prisma-DSL nicht
ausdrücken kann"), and its comment at `:63-66` describes the same two-layer scheme r6 uses: a
semantic key prevents double-posting on retry, and the partial unique index catches a future code
path that picks a different key.

**`skipDuplicates` is safe against a partial index** — confirmed: Prisma emits bare
`INSERT … ON CONFLICT DO NOTHING` with *no* conflict target, so Postgres uses every usable unique
index as an arbiter, partial ones included, and `DO NOTHING` cannot raise. (The inference error
that demands `index_predicate` only occurs with an explicit conflict target, which Prisma never
emits.) Inserted rows default to `PENDING`, so they always satisfy the predicate; and the CREATE
and CLOSE keys differ (`:create:` / `:close:`), so the two directions never collide.

**Considered and rejected:** a per-household reconciler advisory lock (mirroring
`acquireSweepLock`, `tx.ts:51-53`) to make the index redundant. The single-threaded worker's
`running` guard plus §7's in-flight read plus this index already suffice; adding a fourth
mechanism would be §43 overengineering.

### 3.3 `IntegrationTaskLink`

```prisma
model IntegrationTaskLink {
  id             String @id @default(cuid())
  householdId    String @map("household_id")
  memberId       String @map("member_id")
  integrationId  String @map("integration_id")
  taskInstanceId String @map("task_instance_id")
  /// Schlüssel ist die ZUWEISUNG, nicht die Instanz: nach einem Freikauf wird
  /// dieselbe Instanz erneut angeboten (executeBuyout.ts:199-213) und kann
  /// derselben Person erneut zufallen — als NEUE TaskAssignment-Zeile.
  assignmentId   String @map("assignment_id")

  /// NOT NULL. Eine Verknüpfung entsteht ausschliesslich NACH einem
  /// bestätigten CREATE mit bekannter Todoist-ID (§8.1). r5 erlaubte hier NULL
  /// und brauchte dafür ein ganzes Reparatursubsystem — siehe §14.
  externalTaskId String @map("external_task_id")

  createdAt DateTime  @default(now()) @map("created_at")
  closedAt  DateTime? @map("closed_at")
  /// RECONCILED (normal) | DISCONNECTED (§3.4). Kein UNCONFIRMED mehr.
  closeReason String? @map("close_reason")

  household   Household         @relation(fields: [householdId], references: [id], onDelete: Cascade)
  member      HouseholdMember   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  integration MemberIntegration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  instance    TaskInstance      @relation(fields: [taskInstanceId], references: [id], onDelete: Cascade)

  @@unique([householdId, assignmentId])
  @@index([taskInstanceId])
  @@map("integration_task_links")
}
```

Plus a **partial index matching the actual-set query** (§7), which filters `closed_at IS NULL`:

```sql
CREATE INDEX integration_task_links_open
    ON integration_task_links (household_id, integration_id)
 WHERE closed_at IS NULL;
```

Keyed on `assignmentId` and `householdId`-leading: the first fixes r2's re-offer bug (a buyout
re-offers the instance and a later volunteer creates a **new** `TaskAssignment`, so the key is
fresh each cycle); the second keeps the natural lookup lint-legal
(`eslint-rules/index.js:167` accepts only `householdId_`-prefixed compound keys).

This table is the **authoritative actual-state set** and is never pruned.

### 3.4 Disconnect — flush, scrub, force-close

r5 claimed leaving tasks behind was "the only achievable behaviour". **That was overstated, and
the reviewer was right to flag it:** at the moment of disconnect the token is *still valid*, so a
best-effort CLOSE flush is achievable. r6 does it in three steps:

1. **Flush (best-effort, bounded).** Synchronously attempt a Sync `item_close` for every open
   link of that integration, in one batched Sync request (up to 100 commands — the one place
   batching earns its keep, since this is user-facing and one-shot). Bounded by a short timeout.
   Failures are not retried: the credential is about to be destroyed.
2. **Scrub.** `status = DISABLED`, null the five token columns. The credential is genuinely
   destroyed; the row survives so every FK stays valid.
3. **Force-close.** Close every remaining open link with `closeReason = 'DISCONNECTED'` and mark
   non-terminal outbox rows `SKIPPED`.

Step 3 is not tidiness — it is required. Once the token is null no CLOSE can ever be delivered
for that member again, so leaving links open would mean the reconciler proposes work forever that
can never succeed. r4 nulled the token and left the links, which is unrecoverable by
construction.

The UI must state the honest outcome (§10): **we try to clear your Todoist tasks first; any we
could not reach are left behind and Hausarbeitsbörse will no longer touch them.**

### 3.5 Existing-model changes

```prisma
enum NotificationType { … INTEGRATION_FAILED }
enum AuditAction      { … INTEGRATION_CONNECTED, INTEGRATION_DISCONNECTED, INTEGRATION_SETTINGS_UPDATED }
```

`INTEGRATION_UNCONFIRMED` is **gone** — it existed only for r5's repair path.
`INTEGRATION_FAILED` now also carries the §8.2 id-recovery case.

Back-relations are required (`prisma validate` fails otherwise) on `Household`
(`schema.prisma:205-214`), `HouseholdMember` (`:238-250`), `TaskInstance` (`:434-436`). The SQL is
additive; the schema file is not untouched. `TASK_TAKEN` is not here — it left with D-07 (§1).

Lint: `SCOPED_MODELS` (`eslint-rules/index.js:95`) `+= memberIntegration, integrationOutbox,
integrationTaskLink`.

**Coverage limits, stated not claimed away.** `householdScope` matches only
`prisma.<model>.<method>(…)` (`index.js:175-188`), and `SCOPED_METHODS` (`index.js:111-112`) omits
both `createMany` and `create` — so the reconciler's insert and all raw SQL get **zero** lint
coverage. Discipline follows `tx.ts:79-101`, where `household_id` is part of the predicate itself.

---

## 4. Encryption

`aes-256-gcm` from `node:crypto`; no new dependency; authenticated, so `open` throws on tamper
rather than returning garbage that would be sent as a bearer token. 12 random IV bytes per seal.

`INTEGRATION_ENCRYPTION_KEY` must be base64 decoding to **exactly 32 bytes**, enforced with
`.refine()` — not `SESSION_SECRET`'s `z.string().min(8)` (`config.ts:17`), which would accept a
9-character string and fail later inside `createCipheriv`. Rotation via `tokenKeyVersion` +
`INTEGRATION_ENCRYPTION_KEYS=1:<b64>,2:<b64>`, lazy re-seal on next write. **Not argon2** —
passwords are one-way, this must be replayed verbatim; stated in the module header so nobody
"fixes" it into a hash.

**Explicit non-claim.** This defends a database-only compromise — a dump, a stray backup, a
restored snapshot. It does not defend an attacker holding both the database and the process
environment. Under §37 app and DB almost certainly share a host, so the realistic threat is a
**leaked backup**, not a rooted server. Phase 8 must say this plainly.

A Todoist personal token is unscopeable and grants full account access (Phase 1). The connect UI
must say so before the member pastes one.

---

## 5. Locking

The integration subsystem is **write-disjoint** from core transactions: no use-case touches an
integration table.

What remains is one-directional. Reconciler and dispatcher inserts carry FKs to `task_instances`
and `household_members`, taking implicit `FOR KEY SHARE` on level-1 and level-3 rows;
`lockInstance` uses `FOR UPDATE` (`tx.ts:100`), which conflicts. So a background insert can
**block** behind a live buyout. It cannot **deadlock**, because no core transaction ever waits on
an integration row. A background job blocking for milliseconds is invisible.

`LOCK_LEVELS` (`eslint-rules/index.js:16-22`) gains `lockIntegration: 10`, `lockOutboxBatch: 11`.
The rule reports only when `held > level` (`index.js:76`), so ascending jumps with gaps are legal
and descending order is flagged.

**Limit of that check.** `lock-order` is intra-procedural — a per-function stack, no call-graph
analysis — so it proves ordering only within one function body. It is a guardrail, not a proof.
Actual safety rests on write-disjointness, which a reviewer must check by hand.

---

## 6. Desired state — the single load-bearing predicate

> A Todoist task should exist for assignment *A* iff
> 1. `A.status = ACTIVE`; **and**
> 2. `A.instance.status = ASSIGNED`; **and**
> 3. the member is active (`HouseholdMember.isActive = true`); **and**
> 4. the member's integration is *viable* — `status = ACTIVE` **and** `tokenCiphertext IS NOT
>    NULL` (§3.1); **and**
> 5. `integration.triggers[A.kind]` is true; **and**
> 6. `householdConfig.integrations.todoist.enabled` at the **current** config version.

The reviewer confirmed this predicate is equivalent to "this member owns this chore right now",
with no remaining mechanical gap: condition 2's exclusion matches `TaskStatus`
(`schema.prisma:29-37`) exactly, and `volunteerForTask.ts:134`, `runAssignmentSweep.ts:446` and
`rejectCompletion.ts:183` all pair an `ASSIGNED` instance with an `ACTIVE` assignment, with every
closer moving both.

**Four decisions recorded explicitly, so none is later "fixed" by someone assuming otherwise:**

**(a) Condition 2 defends a divergence the domain already sanctions.** `admin.ts:914,917` are the
only writers of `PAUSED`/`CANCELLED`, and `admin.ts:898,900` restrict them to
`pause: ['DRAFT','AVAILABLE']`, `cancel: ['DRAFT','AVAILABLE','PAUSED']` — neither includes
`ASSIGNED`. So this is not reachable today. But `state-machine.ts:66` permits
`ASSIGNED → PAUSED` and `:70` permits `ASSIGNED → CANCELLED`: the route layer is stricter than
the domain model. Depending on that gap would be depending on an accident. One predicate.

**(b) `AssignmentResponse.PENDING` is deliberately included.**
`runAssignmentSweep.ts:457` sets `PENDING` for random assignments; `volunteerForTask.ts:151` and
`rejectCompletion.ts:203` set `ACCEPTED`. `reopen.ts:220` notes that `response` "records
accountability and drives the UI" — it does not gate ownership. Per §21 a randomly-assigned
member *does* own the chore pending their decision (do it, or buy out), so the task appears
immediately: it *is* the reminder that a decision is due. Buying out moves status to
`BOUGHT_OUT`, leaving `ACTIVE`, and the task closes.

**(c) Condition 3 closes the task of a deactivated member** who still holds an `ACTIVE`
assignment — no use-case revokes on deactivation. This is intended: a deactivated member should
not be nagged by a stale Todoist task. Recorded because it is a policy choice, not a mechanism.

**(d) Condition 6 reads the CURRENT config version, diverging from the pinning convention.**
Everywhere else pins (`schema.prisma:487`, `admin.ts:895` `loadConfigVersion`). Pinning exists to
freeze the *economics* a member was shown — cost, reward, reset. Whether a side channel is
switched on is not part of that bargain, and an operational kill-switch that in-flight instances
ignore is not a kill-switch. Stated here because the divergence is deliberate.

Consequences, all falling out rather than being enumerated:
- Random assignment and voluntary pickup create — both produce an `ACTIVE` assignment.
- Completion, buyout, release, revoke, expiry and rejection all close — each leaves
  `status ≠ ACTIVE`. **`EXPIRED` (r3's C-2) is covered without being mentioned.**
- `REOPENED_TO_ASSIGNEE` creates a new assignment (`rejectCompletion.ts:196`), so a new task
  appears; the old link closed when the old assignment did.

**Closes are unconditional.** Conditions 5 and 6 gate only the *desired* side, so a member who
switches a trigger off still has existing tasks closed rather than stranded.

`AVAILABLE` broadcast remains cut (§43 ruling): fan-out create to every eligible member, off by
default, with no coherent close story.

---

## 7. The reconciler

Runs per household, before the dispatcher. No cursor, no task-row lock, no transaction across
I/O.

**Desired** — carried by `@@index([householdId, memberId, status])` at `schema.prisma:496`,
joined to the instance for condition 2:

```sql
SELECT a.id, a.member_id, a.task_instance_id, a.kind
  FROM task_assignments a
  JOIN task_instances i
    ON i.id = a.task_instance_id AND i.household_id = a.household_id
 WHERE a.household_id = $1
   AND a.status = 'ACTIVE'
   AND i.status  = 'ASSIGNED'
```

then joined in memory to the household's viable integrations and filtered by `triggers[kind]`.
Bounded by open assignments — single digits for a family.

**Actual** — carried by the partial index `integration_task_links_open` (§3.3):

```sql
SELECT assignment_id, integration_id, external_task_id
  FROM integration_task_links
 WHERE household_id = $1 AND closed_at IS NULL
```

Every row here has a non-null `external_task_id` by construction (§3.3), which is what makes the
CLOSE invariant below true.

**Suppression inputs** — three indexed reads, no disjunction (r5 claimed a single three-column
index served an `OR`, which it cannot):

```sql
-- (1) live work; prefix of (household_id, status, next_attempt_at)
SELECT enqueue_key FROM integration_outbox
 WHERE household_id = $1 AND status IN ('PENDING','FAILED');

-- (2) cooldown + failure cap; carried by (household_id, settled_at)
SELECT enqueue_key, status, member_notified_at FROM integration_outbox
 WHERE household_id = $1 AND settled_at > now() - interval '24 hours';

-- (3) permanently absorbed keys (§8.2); NO time bound, deliberately
SELECT enqueue_key, member_notified_at FROM integration_outbox
 WHERE household_id = $1 AND status = 'ORPHANED';
```

**Plan** = pure set difference in `reconcile.ts`:
- *desired ∖ actual* → `CREATE_TASK`;
- *actual ∖ desired* → `CLOSE_TASK`, **always carrying `external_task_id` from the link** —
  the invariant r5 broke and r6 restores.

A proposal is suppressed if its key is live (1), within the 1 h cooldown of its last terminal row
(2), over the failure cap (2), or **absorbed** (3). **Symmetric across CREATE and CLOSE** —
r4's absorbing-key bug applied to both directions and every fix must too.

### 7.1 Four suppression regimes, and why they differ

The governing principle is *suppression must come from the cause, never from the corpse*. Causes
differ in reversibility, so suppression differs in duration. r4's bug was applying permanent
suppression to reversible causes; r7's `ORPHANED` is the one case where the cause genuinely is
irreversible.

| Regime | Cause | Reversible? | Suppression |
|---|---|---|---|
| Cooldown (1 h) | transient failure — 5xx, timeout, 429 | yes | temporary; heals automatically |
| Failure cap (3 `DEAD` in 24 h) | our malformed request — 400/422 | maybe (a code fix) | bounded; lapses when rows age out |
| **Absorbed (`ORPHANED`)** | **a task was created at Todoist whose id is lost (§8.2)** | **no — the task exists and we can never address it** | **permanent for that `enqueueKey`** |
| No suppression needed | bad token — 401/403 | n/a | condition 4 removes desired state entirely |

Note the 401/403 row: it needs no suppression mechanism at all, because the *cause* removes the
desired state. That is the shape to aim for, and the reason the other three rows are as narrow as
possible.

**`ORPHANED` rows are exempt from `pruneOutbox`** (§8). Pruning them would resurrect exactly the
r4 bug in reverse — the absorbing fact would vanish and the reconciler would create a duplicate.
Volume is one row per irrecoverable CREATE, keyed to an immutable historical `assignmentId`.

**Failure cap — closes the r5 warning about 400/422 looping silently.** 400/422 means *our*
request was malformed, so the integration is deliberately left untouched (§8) and desired state
persists; without a cap the key would be re-proposed every cooldown, forever, invisibly. After
**3 `DEAD` rows for the same `enqueueKey` within the 24 h window**, stop proposing. Because the
unique index is partial, multiple `DEAD` rows per key legitimately coexist and are simply counted.
`ORPHANED` rows are **not** counted — they are absorbed, not failed.

Honest caveat: §8's ladder is ~2 h to `DEAD` plus 1 h cooldown, so a Todoist outage lasting ~9 h
can produce 3 `DEAD` rows and trip the cap on a genuinely *transient* fault. The cap self-releases
as rows age out of 24 h, so this costs a delay, not correctness — but the notification must
therefore say **"wiederholt fehlgeschlagen"**, never "permanently broken". The cap is not a
diagnosis.

**The cap suppresses CLOSE as well, and that strands a task.** A repeatedly-failing CLOSE is
capped like a CREATE — the alternative is an unbounded loop. The consequence is a Todoist task
that stays open for a chore already finished, so the notification for a capped **CLOSE** must say
so plainly and ask the member to remove it by hand. Leaving it unsaid would be an invisible
failure, which §31 forbids. This asymmetry in *consequence* (a capped CREATE means a missing task;
a capped CLOSE means a stale one) is why the two notifications carry different copy.

**Notification idempotency.** The reconciler is stateless and runs every 60 s while a cap or
absorb condition stays true, and `notifications` has **no** unique or dedup key
(`schema.prisma:581-597`; only `PointTransaction.idempotencyKey` at `:527` exists). So "one
durable notification" must be *mechanised*, not asserted: before emitting, check whether any row
for that `enqueueKey` has `memberNotifiedAt` set; if not, emit exactly one `INTEGRATION_FAILED`
and stamp `memberNotifiedAt` on the newest row for that key, in the same transaction as the plan
write. r6 asserted this and would have sent ~1440 notifications per day per capped key.

**Stated assumption: exactly one reconciler process.** The check-then-stamp reads
`memberNotifiedAt` *outside* a row lock, so idempotency rests on the worker's `running` guard
(§8) plus the single transaction — both of which are per-process. Two concurrent reconcilers
could each read "not yet notified" under `READ COMMITTED` and both notify.

This is the same shape of hazard `acquireSweepLock` exists to prevent (`tx.ts:42-53`: *"the
weekly cap and the fairness counters are read outside a row lock: without it, two sweeps could
both see 'Anna has 2 of 3' and both pick her"*), and an advisory lock would close it. It is
**deliberately not built**, for two reasons: unlike the sweep there is no second trigger path
(no manual run route), and §37's deployment is a single container on one host, so a second
reconciler cannot exist. A fourth suppression mechanism against an out-of-scope deployment shape
is the §43 overengineering r6 §3.2 already declined.

**The exposure is a correctness hazard, not a politeness one.** An earlier draft of this section
claimed the worst case was a duplicated *notification* and never a duplicated task. **That was
wrong, and it contradicted §8.2's own reasoning.** Two reconcilers can also manufacture a
duplicate Todoist task, by a stale read spanning another process's *completed* dispatch:

1. Reconciler B reads desired / actual / suppression at t0 — no link, no live row for key K.
2. Reconciler A, in another process, inserts the CREATE row for K, dispatches it (a full HTTP
   round-trip), and commits `SENT` plus the link.
3. B writes its plan. `integration_outbox_live_key` covers only `status IN ('PENDING','FAILED')`
   (§3.2), and A's row is now `SENT` — so the predicate is false and `ON CONFLICT DO NOTHING`
   finds no arbiter to conflict with. B's stale read also missed A's `settledAt`, so the 1 h
   cooldown does not suppress either.
4. B's row is a **new row with a new command `uuid`**, and Todoist dedups on the `uuid` — which is
   exactly the mechanism §8.2 identifies as producing a second real task.

The window is narrow (B's read→write gap must span A's entire dispatch) but real, and it is the
same failure class r6 was blocked for. **The partial unique index guards the in-flight interval
only; it cannot guard against a stale read across a completed dispatch.** So the lock is a
*precondition* of horizontal scaling, not an optimisation of it.

**If the API is ever scaled horizontally, add the lock first:**
`acquireReconcileLock(tx, householdId)` on `pg_advisory_xact_lock(hashtext('todoist:' ||
householdId))`, mirroring `acquireSweepLock`, registered in `LOCK_LEVELS` at level 0 — a second
level-0 helper is legal (`index.js:76` reports only on `held > level`, and `:84` updates via
`Math.max`), and ascending 0 → 10 → 11 stays legal with gaps. The advisory keys are disjoint
(`todoist:` vs `sweep:`), so the two locks never contend.

**Enforceable guard, so the assumption is not merely documented.** The worker starts only where
`TODOIST_INTERVAL_SECONDS > 0` (§8, §11). Any deployment that runs more than one API instance
must therefore set it to `0` on all but one — which makes single-reconciler operation a
configuration fact rather than a hope. Phase 8's deployment docs must state this next to the
variable, and `docker-compose.yml` must not be scaled past one `api` replica without it.

**Write** — one transaction, `createMany({ data, skipDuplicates: true })`. No cursor to advance,
so nothing to keep consistent with the write and no window in which a crash loses work.

**Self-healing.** A crash, a bug, a dropped row, a hand-edited database, an exhausted retry
sequence, or a member briefly inactive all converge on a later tick — bounded by the cooldown and
the cap, and suppressed only by the *cause* rather than by a terminal artefact.

**Payload** is read for CREATE rows only, from `TaskInstance` + `TaskDefinition`, outside any
lock.

---

## 8. Dispatcher

**Three transactions, HTTP outside all of them.** Tx A claims, per household — never a global
poll:

```sql
SELECT id FROM integration_outbox
 WHERE household_id = $1 AND status IN ('PENDING','FAILED') AND next_attempt_at <= now()
 ORDER BY created_at
 LIMIT 20
   FOR UPDATE SKIP LOCKED
```

Ordered by `created_at`, preserving CREATE-before-CLOSE within an integration. Then the HTTP call
with no transaction open and no locks held. Then Tx B records the outcome: update the row (setting
`settledAt` on any terminal transition), write or close the `IntegrationTaskLink`, and on
permanent-auth set the integration to `INVALID_CREDENTIALS` — ascending 10 → 11.

**Eligibility re-check at dispatch is a race guard only** (§6 owns the decision): if the member or
integration became ineligible since reconciliation, mark `SKIPPED` with `settledAt`. Because the
key is not absorbing (§3.2), that does not prevent later re-proposal.

**Backoff:** capped exponential 1, 2, 4, 8, 16, 32, cap 60 min; `DEAD` after 8 attempts. On 429,
`Retry-After` overrides; Phase 1 found it documented as "*may* be returned", so its absence must
fall through to the computed value, never to `NaN`.

| Response | Class | Action |
|---|---|---|
| 2xx, command ok, id known | success | `SENT`; write/close the link |
| 2xx, command ok, **id unrecoverable** | **absorbed** | **`ORPHANED`** (§8.2); no link row; notify once via §7 |
| 401, 403 | permanent-auth | `DEAD`; integration → `INVALID_CREDENTIALS`; notify member |
| 400, 422, command error | permanent-request | `DEAD`; log; integration untouched; §7's cap applies |
| CLOSE of an unknown id | benign | `SENT`; close the link — already gone from Todoist |
| 429 | transient | `FAILED`, honour `Retry-After` |
| 5xx, timeout, network | transient | `FAILED`, exponential backoff |

Every terminal transition — `SENT`, `DEAD`, `SKIPPED`, `ORPHANED` — stamps `settledAt`.

401/403 must produce a visible `INTEGRATION_FAILED` notification, not only a log line: silent
permanent failure leaves a member believing their chores are in Todoist when they are not.

**Worker.** `startTodoistWorker(deps, intervalSeconds)` modelled on `startSweepWorker`
(`worker.ts:21-56`): `setInterval`, `running` overlap guard, `handle.unref?.()` (optional-called,
as at `:53`), per-household try/catch. Reconcile → dispatch. Wired in `main.ts` beside the sweep;
`TODOIST_INTERVAL_SECONDS=0` disables it, mirroring `SWEEP_INTERVAL_SECONDS` (`config.ts:25`).

Rate limits (1000 REST req/15 min/user; 1000 partial-sync/15 min) are ~2 orders of magnitude above
need, so the dispatcher is serial and gentle. **Do not batch**, except §3.4's one-shot disconnect
flush. `pruneOutbox` deletes `SENT`/`SKIPPED` rows older than 30 days — safe because
`IntegrationTaskLink` is the durable authority and never pruned, and the §7 cooldown (1 h) and cap
window (24 h) are far shorter than the prune horizon. **`ORPHANED` rows are never pruned:** they
carry the absorbing fact §7.1 depends on, and deleting one would resurrect the duplicate it exists
to prevent — the r5 W-1 coupling in reverse. This is the one place retention is load-bearing
rather than tidy, and `pruneOutbox.ts` must say so.

### 8.1 Transport and typing — the decision

**Decision (coordinator, Phase 2): Sync for the two writes; official SDK for the read.**

| Operation | Transport | Types |
|---|---|---|
| create task | `POST /api/v1/sync`, command `item_add` | hand-written `{type, uuid, args}` envelope |
| close task | `POST /api/v1/sync`, command `item_close` | same envelope |
| list projects | `GET /projects` via `@doist/todoist-sdk` | official SDK types |

**Why, and what it cost to learn.** Todoist publishes **no downloadable OpenAPI document** —
`openapi.json` and `openapi.yaml` both 404, and the docs are Redoc-rendered with no exposed
spec link. The only OpenAPI file that exists is a third-party scrape (`api-evangelist/todoist`),
self-described as assembled from public browsing; generating from it would carry drift risk with
none of the maintenance guarantee and its errors would look authoritative. So codegen was never
available for the write path.

That left official-SDK-REST versus Sync. The SDK is REST-only, so it has **no idempotency
mechanism**, and r4/r5 spent three review cycles building and failing to specify a compensating
repair subsystem (pre-call link insert, unresolved links, a repair rule, a loop bound). Sync's
command `uuid` provides exactly-once delivery outright — *"Todoist will not execute a command that
has the same UUID as a previously executed command."*

**This is a deliberate, scoped exception to the codegen preference.** The constraint exists to
prevent error-prone hand transcription of large response schemas. A 3-field command envelope is a
different risk profile — small, stable, and covered by a Phase 4 contract test — and choosing it
**deleted an entire failure-handling subsystem** rather than adding one. The complexity was never
in the types.

**Deleted from r5 by this decision:** nullable `externalTaskId`, `closeReason = 'UNCONFIRMED'`,
`INTEGRATION_UNCONFIRMED`, `repairLinks.ts`, the 10-minute repair trigger, and the unbounded
repair loop — along with all three r5 criticals, which existed only to serve the REST branch.

### 8.2 The one residual gap, specified rather than hidden

**RESOLVED IN PHASE 4 BY LIVE MEASUREMENT — the gap is smaller than this section assumed.**

The open question was: if the process crashes between Todoist committing and our Tx B
committing, the row stays `PENDING` and is retried with the same command `uuid` — does the
deduplicated response still return `temp_id_mapping`, or do we lose the id forever?

**Measured against a real account (Phase 4): it does still return it.** Sending a byte-identical
`item_add` twice with the same `uuid` produced, on both responses,
`sync_status[uuid] = "ok"` **and** `temp_id_mapping` carrying the *same* id
(`6hPrwqr8GXQ7RR9M`). A sweep of live tasks afterwards confirmed only **one** task had been
created, so the dedup is real and not merely a cosmetic `"ok"`.

**Consequence: the crash window closes by itself.** A retry after an ambiguous crash resolves
normally, writes its link, and reaches `SENT`. Delivery is exactly-once end to end, not just at
Todoist. The `ORPHANED` path is therefore **not** reached by the failure mode that motivated it.

**It is nonetheless kept, deliberately.** The behaviour is *undocumented* — Todoist states only
that a duplicate `uuid` will not be re-executed, never what the response then contains — and was
measured on one account, at one API version, at one moment. It is an observation, not a contract.
The cost of keeping the guard is one enum value, one branch and one suppression read; the cost of
being wrong is a task sitting in a member's Todoist that Hausarbeitsbörse can never manage again,
invisibly and permanently. Under that asymmetry the hedge is worth more than the deletion.

What changed is the *claim*, not the code: `ORPHANED` is now documented as guarding a contract
violation that should never occur, rather than a routine crash window.

**r6 got the bound wrong here, and the correction is the substance of r7.** r6 said the failure
mode was "one orphaned task, member informed" and routed it to `DEAD`. But `DEAD` is
*re-proposable*: desired ∖ actual stays true (no link exists), so §7 re-proposes after the
cooldown as a **new outbox row with a new `uuid`** — and Todoist's dedup keys on the command
`uuid`, so it does **not** apply. A second real task is created. r6's cap stopped it at three, and
the 24 h window let even that lapse. The true r6 bound was *up to 3 duplicate tasks per
assignment, recurring* — not one.

That was r6 applying its own principle inconsistently: 400/422 is safely re-proposable because
**nothing was created**; this case is not.

Handling, in order:
1. If a deduped Sync response still returns `temp_id_mapping` — Phase 4 must establish this
   (§13.2) — the retry resolves normally and there is **no gap at all**. This is the outcome to
   hope for and the reason §13.2 is a gate rather than a formality.
2. If it does not, the CREATE can never produce a link. Mark the row **`ORPHANED`**
   — not `DEAD` — **immediately, on the attempt that observes the missing mapping**, and emit one
   `INTEGRATION_FAILED` via §7's `memberNotifiedAt` mechanism: *"Eine Aufgabe wurde in Todoist
   angelegt, kann von Hausarbeitsbörse aber nicht mehr verwaltet werden — bitte dort selbst
   entfernen."*

   **Immediately, not after the ladder.** Retrying cannot help: a deduped Sync response will not
   begin returning `temp_id_mapping` on attempt 6 having withheld it on attempt 1. Exhausting the
   ladder first would only delay the member's notification by ~2 h and burn eight requests to
   learn nothing. (Either reading is *safe* — retries reuse the same row and therefore the same
   command `uuid`, so no duplicate can arise — but §8's table and this step must agree on one, and
   this is the better one.)

**Why `ORPHANED` may be absorbing when r4's rows may not.** r4's central bug was terminal rows
that permanently swallowed re-proposals, and r5 fixed it by making the unique index partial. So a
new absorbing state needs justification, not just a name.

The distinction is **reversibility of the cause**. r4 absorbed on causes that were transient or
external — an exhausted retry ladder, a member who happened to be inactive that minute — and those
must heal, which is why absorbing them was a bug. `ORPHANED` records a *permanent fact about the
outside world*: a task exists in the member's Todoist and we have irrecoverably lost the only
handle by which we could ever address it. No later tick can change that. Re-proposing cannot
repair anything; it can only create another duplicate.

So this is not an exception to *suppression must come from the cause, never from the corpse* — it
is that rule applied to a cause that is genuinely irreversible. **Absorbing is correct exactly
when the cause cannot change.** §7.1 tabulates all four regimes against that test.

**Note what this deliberately is not.** No link row is ever written without an id, so §3.3's
`NOT NULL` and §7's CLOSE invariant both hold, and r5's unresolved-link lifecycle is **not**
reintroduced by the back door. The failure mode is exactly one orphaned Todoist task per
irrecoverable CREATE, with the member told once and asked to delete it — bounded, visible, and
needing no repair subsystem. Strictly better than an unresolved row in our own database requiring
a race-free repair rule with a loop bound.

---

## 9. Configuration

All three config files change together; `strictObject` (12 uses) makes an unknown key an error,
and `schema.ts:364-367` turns that into a compile-time proof.

```ts
// types.ts — HouseholdConfig AND PublicHouseholdConfig both gain it
export interface IntegrationsConfig { todoist: { enabled: boolean } }
// defaults.ts
integrations: Object.freeze({ todoist: Object.freeze({ enabled: false }) }),
// schema.ts — modelled on NotificationsSchema (schema.ts:164-174)
```

Every field has `.default()` and each section `.default(DEFAULT_CONFIG.x)`, so existing
`HouseholdConfiguration.values` JSON keeps validating. **No data migration.** Default `false`.
`toPublicConfig` (`defaults.ts:106`) exposes that boolean and nothing else.

**What `enabled = false` does, unambiguously.** It is condition 6 of §6, gating the *desired*
set, so under level-triggered reconciliation **disabling closes every open Todoist task in the
household** on the next tick — clean teardown, not a freeze. The reviewer accepted this as the
only reading consistent with level-triggering. A disabled integration that left tasks behind
would give every member orphans nobody would ever touch again: "off" must mean "not operating",
not "operating invisibly". Consequence to state in the admin UI: **toggling off and on will
re-create tasks.** Predictable, and cheap at family volume.

Per-member settings live on `MemberIntegration`, not household config: they are personal, and
household config is admin-editable (§36, D-06).

---

## 10. API and web

Routes use `requireMember`, which enforces CSRF on unsafe methods (`context.ts:132-140`).
**No admin variant, no `:memberId` path parameter** — the member id comes from the proved session
context (`context.ts:101`), so routes are self-scoping by construction.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/integrations/todoist` | status projection — **never the token** |
| `PUT` | `/integrations/todoist` | `{ token }` → probe, seal, persist, audit |
| `PATCH` | `/integrations/todoist` | `{ projectId?, triggers? }` — Zod-validated (member-supplied Json) |
| `DELETE` | `/integrations/todoist` | flush → scrub → force-close (§3.4), audit |
| `POST` | `/integrations/todoist/test` | live probe; refreshes `projectName` |
| `GET` | `/integrations/todoist/projects` | project picker (SDK) |

Error codes `INTEGRATION_DISABLED`, `INTEGRATION_UNAUTHORIZED`, `INTEGRATION_UNAVAILABLE` —
deliberately **not** reusing `INVALID_CREDENTIALS` (`packages/shared/src/api/errors.ts:14`), which
means *login* credentials. `PUT`, `/test`, `/projects` sit behind the existing `rateLimit` plugin
(`server.ts:48`) with a tight per-member budget (§36). Audit payloads carry
`{ provider, projectId?, triggers? }` — never the token, never the hint.

**Web.** `AccountPage/TodoistSection.tsx`, rendered only when
`publicConfig.integrations.todoist.enabled`. Disconnected state: explanation, link to Todoist's
integrations settings, password-type field, and **before** the field a plain statement that the
token grants full access to their Todoist account and that ticking a task off in Todoist will
**not** complete it in Hausarbeitsbörse (§31, D-04). Connected: `Verbunden · …a3f9`, project
picker, trigger checkboxes, test, disconnect; on `INVALID_CREDENTIALS` a prominent reconnect
prompt. **Disconnect confirmation states the §3.4 outcome:** we try to clear your Todoist tasks
first; any we cannot reach are left behind. Mutation pattern from `AdminSettingsPage.tsx`; all
German copy in `strings/de.ts`. Admin page gains the household toggle plus the §9 teardown
warning.

---

## 11. Environment

`config.ts` (pattern at `:25`) gains `INTEGRATION_ENCRYPTION_KEY` (base64 → exactly 32 bytes,
`.refine()`d), optional `INTEGRATION_ENCRYPTION_KEYS`, and `TODOIST_INTERVAL_SECONDS` (int ≥ 0,
default 60; `0` disables). `.env.example`, `docker-compose.yml` and `deploy/` updated in Phase 8
so §37's one-command start holds. r6 reads no history, so r3's `TaskHistoryEvent` retention
coupling is gone.

---

## 12. Testing

The injected `TodoistPort` means no test touches the network.

- **Unit:** `reconcile.ts` is pure — table-driven over desired/actual/in-flight, one case per §6
  condition; secret-box round-trip, tamper detection, wrong-key rejection, key-version selection;
  the §8 classification table; backoff with `Retry-After` present *and* absent; the Sync command
  envelope shape (`{type, uuid, args}`) with `uuid` equal to the outbox row id.
- **Integration:**
  - **§28 guarantee, provable by construction:** with the Todoist port and the worker throwing,
    volunteer/buyout/complete still commit — nothing in their path touches an integration table;
  - **idempotency, corrected in r5 and retained:** (a) two ticks with no state change enqueue
    exactly one row; (b) **after a row goes `DEAD` and the cooldown elapses, a still-desired
    assignment IS re-proposed** — the r4 C-1 regression; (c) within the cooldown it is not;
  - **CLOSE is re-proposed after a DEAD CLOSE** — the symmetric half of r4 C-1;
  - **ineligible member produces no desired state**, and re-eligibility restores it — r4 C-2;
  - **`INTEGRATION_FAILED` after 3 DEAD rows for one key, and no 4th proposal** — the §7 cap,
    covering the 400/422 silent-loop warning;
  - **notification idempotency:** with a cap condition held true across 20 consecutive ticks,
    **exactly one** notification is emitted — the r6 C-2 regression (r6 would have sent 20);
  - **`ORPHANED` is absorbing:** a CREATE that succeeds at Todoist with an unrecoverable id →
    `ORPHANED`, one notification, and **no further CREATE is ever proposed for that key**, even
    after the cooldown and even after 30 days of pruning runs — the r6 C-1 regression, which is
    the difference between one orphaned task and three duplicates;
  - **`ORPHANED` survives `pruneOutbox`** while `SENT`/`SKIPPED` do not (§8);
  - **`ORPHANED` rows are not counted toward the 3-`DEAD` cap;**
  - **`triggers` key case:** an integration whose `triggers` are `{"VOLUNTARY":true,"RANDOM":true}`
    yields desired state for both kinds. A regression test with lowercase keys must assert the
    Zod validator **rejects** them at the `PATCH` boundary (§10) — r6 shipped lowercase defaults
    against an uppercase `AssignmentKind`, which would have made the whole feature a silent no-op;
  - **a capped CLOSE notifies with stranding copy**, distinct from a capped CREATE (§7.1);
  - **disconnect flushes, scrubs, then force-closes** open links and marks live rows `SKIPPED`
    (§3.4), including the case where the flush itself fails;
  - **every open link has a non-null `externalTaskId`** — a schema-level assertion standing in for
    r5's whole repair subsystem, and the test that the §7 CLOSE invariant actually holds;
  - **`ACTIVE` assignment on a `PAUSED` instance yields no desired state** — §6(a), guarding the
    `state-machine.ts:66` transition the route layer currently forbids;
  - **`PENDING` response still yields a task** — §6(b), pinning the product decision;
  - **deactivated member's task closes** — §6(c);
  - **`enabled = false` closes all open tasks** — §9;
  - `EXPIRED` closes the task (r3 C-2); re-offer cycle yields two distinct links (r2 C-3);
  - 401 → `DEAD` + `INVALID_CREDENTIALS` + notification; authz: member A cannot touch member B's
    integration.
  - **No test for unresolved-link repair** — that path no longer exists (§8.1). Its replacement is
    the §8.2 case: CREATE succeeds, id unrecoverable → `ORPHANED` +
    `INTEGRATION_FAILED`, and **no link row written**.
- **E2E:** connect a fake Todoist, assign a task, assert the outbox row reaches `SENT`.
- **Lint:** `npm run lint` passes with the new `SCOPED_MODELS` and `LOCK_LEVELS` entries.
- **Migration:** there are exactly **two** raw-SQL indexes — `integration_outbox_live_key` (§3.2)
  and `integration_task_links_open` (§3.3). Both must be asserted by **property, not name**: a
  full index of the same name would pass a name check, and — the sibling flaw — a *non-unique*
  index with the identical predicate would pass a predicate-only check. So assert all three
  properties from `pg_index`/`pg_class`:
  1. `indpred IS NOT NULL` (it is genuinely partial);
  2. `indisunique` is `true` for `integration_outbox_live_key` and `false` for the other;
  3. `pg_get_expr(indpred, indrelid)` contains `PENDING` and `FAILED` / `closed_at IS NULL`
     respectively — matched by substring, **not** by an exact literal, because Postgres renders
     enum casts (`'PENDING'::"OutboxStatus"`) and the rendering is not stable to transcribe.

  No existing test asserts index existence, so this is new scaffolding with no precedent to copy.

---

## 13. Open items

1. ~~**Phase 4:** confirm the `item_add` / `item_close` arg schemas and the `/api/v1/sync`
   response shape against the live API.~~ **CLOSED.** `item_add` with
   `{type, uuid, temp_id, args}` form-encoded under `commands` returns HTTP 200 with
   `sync_status[uuid] = "ok"` and `temp_id_mapping[temp_id] = <opaque string id>`; response
   top-level keys are `full_sync, full_sync_date_utc, sync_status, sync_token, temp_id_mapping`.
   `item_delete` (and by the same envelope `item_close`) round-tripped `ok`. Ids are short
   alphanumeric strings (`6hPrwqr8GXQ7RR9M`) — empirically confirming the `String` column choice.
2. ~~**Phase 4, the one unquantified risk (§8.2):** does a Sync response for an already-executed
   command `uuid` still return `temp_id_mapping`?~~ **CLOSED — YES, it does.** A byte-identical
   replay returned `"ok"` *and* the same `temp_id_mapping` id, and created no second task. §8.2's
   crash window therefore closes on retry, and delivery is exactly-once end to end. The
   `ORPHANED` branch is **kept as a defensive guard** — the behaviour is undocumented and was
   measured once, so it is an observation rather than a contract (reasoning in §8.2).
3. ~~**Phase 4:** due-date mapping.~~ **CLOSED.** Midnight-in-household-timezone → all-day
   `{date, timezone}`; any other time → absolute UTC instant. The all-day date is derived from
   *zoned* parts, so a Berlin household's "due Saturday" (`2026-09-04T22:00Z`) is not sent as
   Friday.
4. **Split out:** `TASK_TAKEN` for `volunteerForTask.ts` / `reopen.ts` (D-07) — no longer part of
   this campaign (§1).

*(r5's item on whether raw SQL fits the Prisma migration workflow is closed: it does, with
in-repo precedent at `20260830000100_constraints/migration.sql:67-73` and `:110-112`.)*

---

## 14. Revision history

| Rev | Verdict | Fatal defect |
|---|---|---|
| r1 | BLOCK ×7 | ports in `infra/` imported by `app/` (`eslint.config.js:84`); `Notifier` decorator cannot reach the buying-out member (`executeBuyout.ts:275`); disconnect `DELETE` vs `NOT NULL` FK could roll back a buyout |
| r2 | BLOCK ×4 | try/catch cannot contain a Postgres constraint abort (`postTransaction.ts:60-64`); FK inserts take `KEY SHARE` on task rows; link keyed on `taskInstanceId` broke the re-offer cycle |
| r3 | BLOCK ×2 | `seq > lastSeq` cursor loses events — sequences allocated at INSERT, not commit; `EXPIRED` stranded a task |
| r4 | BLOCK ×3 | terminal outbox rows permanently absorbed the `enqueueKey`, falsifying r4's own self-healing claim in both directions; eligibility checked only at dispatch; §8.1's null-id mitigation contradicted §7's CLOSE invariant |
| r5 | BLOCK ×3 | all three were the unresolved-link lifecycle: §8 never created an unresolved link so the repair path was dead code and the crash window unmitigated; the 10-min trigger raced the ~3 h retry ladder and could collide with `@@unique([householdId, assignmentId])`; the repair loop was unbounded |
| r6 | BLOCK ×2 | §8.2 routed the lost-id CREATE to `DEAD`, which is re-proposable — a fresh outbox row means a fresh command `uuid`, defeating Todoist's dedup, so the real bound was up to 3 duplicate tasks per assignment rather than 1 orphan; and "one cap notification" was asserted rather than mechanised in a stateless 60 s loop against a `notifications` table with no dedup key (~1440/day). Warning, higher impact than either: `triggers` defaulted to lowercase keys against an uppercase `AssignmentKind`, so `triggers[A.kind]` was always `undefined` and **nothing would ever have been desired** |
| r7 | BLOCK ×1 | pure bookkeeping: §12 and §13 still specified `DEAD` for the case r7 exists to move to `ORPHANED`, contradicting §12's own bullet five lines above and encoding the removed re-proposable state as an asserted test expectation. All r7 mechanisms verified sound — absorption airtight (incl. the disconnect/reconnect escape), `memberNotifiedAt` genuinely idempotent, `triggers` correct everywhere indexed |
| r8 | BLOCK ×1 | one paragraph of prose: the newly-added single-process assumption claimed the missing advisory lock was "a politeness bug, not a correctness one — a duplicated notification, never a duplicated task". False, and self-contradictory against §8.2 — two reconcilers can also duplicate a **task** via a stale read spanning another process's completed dispatch, because the partial index guards the in-flight interval only. All four r8 bookkeeping fixes verified complete; no design defect |
| r9 | **unreviewed** | — |

**The through-line.** r1-r3 were edge-triggered and each failed at a different link in that
chain. r4 fixed the frame, then broke its own central property with a guard added for tidiness.
r5 fixed that correctly but kept two mutually exclusive transports alive and specified the harder
one badly. r6's single change — take the transport that provides the guarantee — **deleted** the
subsystem that produced r5's three criticals rather than specifying it more carefully.

r6 then mis-classified its one residual failure: it routed "a task exists that we can no longer
address" to a re-proposable terminal state, so the design's own healing machinery manufactured
duplicates. r7 gives that cause its own absorbing state and generalises the rule in §7.1.

Three principles earned the hard way, worth keeping in the code comments:

1. ***Suppression must come from the cause, never from the corpse*** (r4→r5). A terminal row is
   evidence that an attempt ended, not a reason to stop wanting the outcome.
2. ***Prefer the transport that gives you the guarantee over the abstraction that gives you nicer
   types*** (r5→r6). Choosing Sync deleted an entire subsystem that no amount of careful
   specification had managed to make correct.
3. ***Absorbing is correct exactly when the cause cannot change*** (r6→r7). This is not an
   exception to (1) but its completion: the question is never "did this fail?" but "can the fact
   that made it fail ever become false?" §7.1 tabulates every regime against that single test.
