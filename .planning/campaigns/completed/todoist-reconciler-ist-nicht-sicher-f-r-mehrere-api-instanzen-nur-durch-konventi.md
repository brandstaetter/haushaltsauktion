---
version: 1
id: "c8ef9052-acfa-4c83-8efb-be13869d38b8"
status: completed
started: "2026-09-04T18:43:23.559Z"
completed_at: null
direction: "Todoist-Reconciler ist nicht sicher für mehrere API-Instanzen (nur durch Konvention geschützt)"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Todoist-Reconciler ist nicht sicher für mehrere API-Instanzen (nur durch Konvention geschützt)

Status: completed
Started: 2026-09-04T18:43:23.559Z
Direction: Todoist-Reconciler ist nicht sicher für mehrere API-Instanzen (nur durch Konvention geschützt)

## Claimed Scope
- apps/api/src/infra/jobs/todoist-worker.ts, apps/api/src/main.ts

## Intake Source

- File: .planning/intake/todoist-worker-not-multi-instance-safe.md
- Priority: low
- Initial Status: pending

## Delivery Brief

Bei der Architektur-Review fiel ein selbst-dokumentierter, aber
unadressierter Schwachpunkt auf: der Todoist-Reconciliation-/Dispatch-Worker
ist — anders als der Zuweisungs-Sweep — **nicht** durch einen
Advisory-Lock gegen gleichzeitigen Lauf mehrerer API-Instanzen geschützt.

`apps/api/src/infra/jobs/todoist-worker.ts` (Zeilen 15-17) sagt es selbst:

> Any deployment running more than one API instance must therefore set
> `TODOIST_INTERVAL_SECONDS=0` on all but one. Before scaling out, add a
> per-household advisory lock mirroring `acquireSweepLock`.

Und `apps/api/src/main.ts` (Zeilen 74-78) bestätigt: die
Notification-Idempotenz des Reconcilers setzt voraus, dass **genau eine**
Instanz ihn laufen lässt — durchgesetzt einzig durch die operative Disziplin,
`TODOIST_INTERVAL_SECONDS=0` manuell auf allen Instanzen außer einer zu
setzen. Es gibt (anders als bei `acquireSweepLock` in `app/tx.ts`, das
`pg_advisory_xact_lock` pro Haushalt nimmt) keinen technischen Mechanismus,
der eine versehentliche Doppelausführung verhindert.

Aktuell besteht **kein akutes Risiko**: `deploy/docker-compose.prod.yml` und
`docker-compose.yml` konfigurieren keine Replikation (kein `replicas:`,
kein `scale:`), es läuft also nur eine API-Instanz. Das Risiko ist rein
latent — es aktiviert sich erst, falls das Deployment jemals horizontal
skaliert wird, was bei der in CLAUDE.md §43 beschriebenen Zielgröße
(1-20 Mitglieder, keine Hochlastplattform) unwahrscheinlich, aber nicht
ausgeschlossen ist.

## Acceptance Criteria

- Entweder: ein `pg_advisory_xact_lock`-basierter Lock (analog
  `acquireSweepLock` in `apps/api/src/app/tx.ts`) wird um den
  Todoist-Reconciliation-/Dispatch-Lauf gelegt, sodass eine zweite Instanz
  den Lauf überspringt statt doppelt zu reconcilen/dispatchen.
- Oder: falls der Aufwand für die aktuelle Ein-Instanz-Realität nicht
  gerechtfertigt ist, wird der bestehende Kommentar in `todoist-worker.ts`
  und `main.ts` um einen expliziten Verweis auf dieses Intake-Item ergänzt,
  damit die Einschränkung beim nächsten Skalierungs-Vorhaben nicht erneut
  recherchiert werden muss.
- Die Wahl zwischen beiden Optionen liegt bei der Umsetzung.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |  complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 2 files changed, 28 insertions(+), 3 deletions(-) | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test --workspaces: 144+371+155 tests passed, 0 failed | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/todoist-reconciler-ist-nicht-sicher-f-r-mehrere-api-instanzen-nur-durch-konventi.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T18:43:23.559Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Chose the acceptance criteria's second option (documentation,
  not a real lock) over implementing `pg_advisory_xact_lock` per household.
  Reason: investigated the real fix and found it's harder than the original
  comment's "mirror `acquireSweepLock`" implied. `acquireSweepLock` works
  because `runAssignmentSweep` does its whole unit of work inside one
  advisory-lock-guarded interactive transaction; this tick can't, because
  `dispatchOutbox` deliberately makes its Todoist HTTP call with **no**
  transaction open per row (§28 — an outage must never hold a lock across a
  third-party round trip). A correct lock therefore needs either an
  interactive transaction held open across up to 20 sequential HTTP calls
  (a connection-pool/timeout risk of its own) or a session-level
  `pg_try_advisory_lock` on a connection kept outside Prisma's pool (new
  moving part, more surface to get wrong). Given the risk is currently latent
  only (single-instance deployment, §43 target size), implementing that for
  real belongs in its own reviewed change, not folded into an autopilot pass —
  so this delivers the fallback the acceptance criteria explicitly sanctions:
  a precise, findable writeup (including the `dispatchOutbox` claim-window
  subtlety this investigation surfaced, which the original comment did not
  know about) so the next scale-out effort starts from a correct analysis
  instead of re-deriving it.

## Active Context

Phase 2 (build) and Phase 3 (verify) complete. Updated the module doc in
`apps/api/src/infra/jobs/todoist-worker.ts` and the inline comment in
`apps/api/src/main.ts` to reference this intake item by name and explain,
precisely, why `acquireSweepLock`'s pattern doesn't transfer directly:
`runReconciliation`'s reads happen outside a lock and `dispatchOutbox`'s HTTP
call intentionally holds no transaction (§28). Also documented a related
subtlety found during investigation: `lockOutboxBatch`'s `FOR UPDATE SKIP
LOCKED` claim transaction commits (releasing the row lock) before the row's
status is flipped in a later transaction, leaving a narrow window where a
second concurrent claim could re-select the same still-PENDING/FAILED rows —
context a future implementer of the real fix will need. No behavior change;
comment-only. Full workspace test suite still passes (144+371+155), typecheck
and lint clean on both edited files. Next action: Phase 4, package for review.

## Continuation State

Phase: 4
Sub-step: implementation and verification done, packaging not started
Files modified: apps/api/src/infra/jobs/todoist-worker.ts, apps/api/src/main.ts
Blocking: none

## Completion Record

- Completed At: 2026-09-04T18:46:34.562Z
- Outcome: review-package
- Verification: npm run test --workspaces: 144+371+155 tests passed
- Note: Documented the multi-instance safety gap precisely (acceptance criteria's sanctioned fallback), including a lockOutboxBatch claim-window subtlety found during investigation that a real fix will need to address.
