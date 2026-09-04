---
version: 1
id: "b9993fdc-2bb8-4f02-9251-5067d6dfcfc8"
status: completed
started: "2026-09-04T13:02:30.220Z"
completed_at: "2026-09-04T00:00:00.000Z"
direction: "Admin kann offene Instanzen bei Aufgabendefinitions-Änderung nicht abbrechen oder automatisch aktualisieren"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Admin kann offene Instanzen bei Aufgabendefinitions-Änderung nicht abbrechen oder automatisch aktualisieren

Status: completed
Started: 2026-09-04T13:02:30.220Z
Direction: Admin kann offene Instanzen bei Aufgabendefinitions-Änderung nicht abbrechen oder automatisch aktualisieren

## Claimed Scope
- apps/api/src/infra/http/routes/admin.ts, apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx

## Intake Source

- File: .planning/intake/admin-cancel-or-sync-open-instances-on-definition-change.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Wenn ein Admin eine `TaskDefinition` bearbeitet (`PUT /admin/task-definitions/:id`),
bleiben bereits offene Instanzen (DRAFT/AVAILABLE/ASSIGNED/PAUSED) davon absichtlich
unberührt — siehe Kommentar in `admin.ts` bei diesem Handler: "changing `baseValue`
deliberately does NOT touch open instances: each one snapshotted its reset target at
materialization so an edit mid-cycle cannot move the payout of a chore already in
flight." Das ist eine bewusste Entscheidung (§1.4), aber sie lässt den Admin aktuell
ohne Werkzeug da, wenn er eine Änderung (z. B. neuer Basiswert, neue Berechtigung,
neue Rollenbeschränkung) tatsächlich auf laufende Instanzen durchschlagen lassen will.

Ein Abbrechen-Mechanismus existiert bereits teilweise: `POST
/admin/instances/:id/cancel` (`instanceAction` in `admin.ts`) kann eine Instanz
abbrechen — aber nur aus den Status `DRAFT`, `AVAILABLE` oder `PAUSED`
(`allowed.cancel`). Eine bereits **zugewiesene** (`ASSIGNED`) Instanz kann darüber
nicht abgebrochen werden, und selbst wo es ginge, gibt es dafür keine
Admin-Oberfläche: `LiveInstancesList` in `TaskDefinitionsSection.tsx` zeigt laufende
Instanzen einer Definition an, ist aber laut eigenem Kommentar bewusst "Read-only —
the unassign action itself is a separate ticket".

Gewünscht (zwei mögliche, sich nicht gegenseitig ausschließende Ansätze — welcher(r)
umgesetzt wird, sollte im Briefing entschieden werden):

1. **Manuelles Abbrechen/Beenden laufender Instanzen** — eine Admin-Aktion, um offene
   Instanzen einer Definition gezielt abzubrechen, inklusive `ASSIGNED`-Instanzen
   (was den aktuellen `cancel`-Übergang erweitern würde; zu klären, was mit bereits
   aktiven `TaskAssignment`-Zeilen dabei passiert — für multi-worker-Aufgaben
   vermutlich analog zur bestehenden Ablauf-Logik in `runAssignmentSweep.ts`, die
   beim Verfall einer `ASSIGNED`-Instanz jede aktive Zuweisung schließt). Braucht
   eine sichtbare Aktion im Admin-UI (Einzelinstanz und/oder "alle offenen Instanzen
   dieser Definition abbrechen").

2. **Automatische Aktualisierung offener Instanzen bei Definitionsänderung** — z. B.
   `currentValue` einer offenen (noch nicht angenommenen) Instanz neu berechnen, wenn
   sich `baseValue` ändert. Deutlich größerer Eingriff: verletzt möglicherweise die
   oben zitierte §1.4-Invariante ("ein Edit mitten im Zyklus darf den Auszahlungswert
   einer bereits laufenden Aufgabe nicht verschieben") und müsste sorgfältig
   abgegrenzt werden (z. B. nur `AVAILABLE`, nie `ASSIGNED`; nur bestimmte Felder wie
   `baseValue`/Berechtigung, nie Wiederholungsregeln).

## Acceptance Criteria

- Ein Admin hat einen Weg, offene Instanzen einer Aufgabendefinition gezielt zu
  beenden, ohne die Instanz-Detailseite oder Rohdaten manuell zu manipulieren.
- Falls Ansatz 1 (manuelles Abbrechen) umgesetzt wird: auch `ASSIGNED`-Instanzen
  können abgebrochen werden, inklusive korrektem Schließen aktiver Zuweisungen
  (Punkte-Ledger, Historie, Multi-Worker-Slots).
- Falls Ansatz 2 (Auto-Sync) umgesetzt wird: die §1.4-Invariante bleibt für bereits
  angenommene/zugewiesene Instanzen gewahrt — nur unangenommene (`AVAILABLE`)
  Instanzen dürfen sich automatisch anpassen, und das Verhalten ist entweder fest
  vorgegeben oder admin-konfigurierbar (§16/§17 — keine versteckten Regeln, §31).
- Serverseitig verbindlich (§36) — keine rein clientseitige Bestätigung.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 6 files modified, 2 files added (apps/api/src/app/tasks/cancelInstance.ts new; apps/api/test/integration/cancel-instance.test.ts new) | complete | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run typecheck clean; npm run lint clean; npm run test — shared 144/144, api 367/367 (incl. 6 new cancel-instance integration tests + ledger integrity check), web 136/136 (incl. 1 new cancel-UI test); live browser verification: published a real instance of "Bad putzen", confirmed "Laufende Instanzen" renders the row with an "Instanz abbrechen" button and the bulk "Alle offenen Instanzen abbrechen" button, clicked cancel, confirmed toast "Instanz wurde abgebrochen." and list returned to empty state | complete | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T13:02:30.220Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Chose Option 1 (manual cancel of open instances, including ASSIGNED) over
  Option 2 (auto-sync currentValue on definition edit) from the two directions proposed
  in the Delivery Brief. Reason: Option 2 risks violating the §1.4 invariant that an
  edit mid-cycle must not move the payout of a chore already in flight, and would need
  careful per-field/per-status scoping to avoid it; Option 1 satisfies the acceptance
  criteria directly, is lower risk, and is fully server-side enforced. Documented as a
  deferred future item in cancelInstance.ts's module docstring.
- 2026-09-04: Discovered that the existing `POST /admin/instances/:id/cancel` action
  (via `instanceAction` in admin.ts) does NOT cover this need — it only allows
  DRAFT/AVAILABLE/PAUSED and, more importantly, the *other* existing revoke path
  (`releaseOrRevokeAssignment` in reopen.ts, REVOKE mode) reopens an ASSIGNED instance
  for a fresh offer cycle rather than terminating it. Since "cancel/end this instance"
  and "revoke this assignment so the instance can be reoffered" are different outcomes,
  wrote a new dedicated use-case (`cancelInstance.ts`) rather than extending/looping the
  revoke endpoint. `cancelInstance` handles ASSIGNED instances by revoking every active
  assignment (with ON_ACCEPT clawback where applicable) and then ending the instance as
  CANCELLED (terminal), not AVAILABLE.
- 2026-09-04: Added the bulk `cancelOpenInstancesOfDefinition` endpoint/hook/UI button
  proactively, beyond the letter of the acceptance criteria. Reason: the intake item's
  own named trigger case (admin edits a definition and wants its currently-open
  instances ended) is inherently a bulk operation, not a one-instance-at-a-time click,
  even though the acceptance criteria phrased single vs. bulk as "und/oder" (and/or).
- 2026-09-04: Renamed the per-row button label from "Abbrechen" to "Instanz abbrechen".
  Reason: the sheet's own generic close button is already labelled "Abbrechen" in the
  same dialog — a real accessibility problem (two same-labelled, very
  different-consequence buttons), caught via a frontend test failure and fixed at the
  string level rather than by narrowing the test query.

## Active Context

Campaign complete. Backend use-case, routes, frontend hooks/UI, integration tests, and
a frontend UI test are all implemented and verified (typecheck/lint/full test suite
green, plus live browser exercise of the actual cancel flow). Work is currently
uncommitted on `main`; a feature branch will be created before committing, and a PR
will be opened only if/when the user explicitly asks.

## Continuation State

Phase: 4 (package) — implementation and verification complete; review-package (PR)
deferred pending explicit user request.
Sub-step: none — campaign work finished
Files modified: apps/api/src/app/tasks/cancelInstance.ts (new),
apps/api/src/infra/http/routes/admin.ts, apps/api/test/integration/cancel-instance.test.ts (new),
apps/web/src/api/hooks.ts, apps/web/src/strings/de.ts,
apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx,
apps/web/src/pages/AdminPage/TaskDefinitionsSection.test.tsx
Blocking: none
