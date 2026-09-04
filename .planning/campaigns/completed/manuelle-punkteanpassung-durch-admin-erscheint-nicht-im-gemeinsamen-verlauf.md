---
version: 1
id: "36c54a73-f694-40b3-ba0c-0b868bac4f0d"
status: completed
started: "2026-09-04T12:26:46.286Z"
completed_at: "2026-09-04T14:39:22.000Z"
direction: "Manuelle Punkteanpassung durch Admin erscheint nicht im gemeinsamen Verlauf"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Manuelle Punkteanpassung durch Admin erscheint nicht im gemeinsamen Verlauf

Status: completed
Started: 2026-09-04T12:26:46.286Z
Direction: Manuelle Punkteanpassung durch Admin erscheint nicht im gemeinsamen Verlauf

## Claimed Scope
- apps/api/src/app/points/adjustPoints.ts, apps/api/src/app/events.ts, apps/api/src/infra/http/routes/misc.ts, apps/web/src/pages/HistoryPage/

## Intake Source

- File: .planning/intake/manual-point-adjustment-missing-from-shared-history.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`adjustPoints.ts` (die Businesslogik hinter `POST /admin/members/:id/points/adjust`,
Ziel des kürzlich abgeschlossenen Intake-Items
"admin-manual-points-adjustment-ui-missing") schreibt bei jeder manuellen Anpassung
korrekt einen `AuditEvent` mit `action: 'POINTS_ADJUSTED'`
(`adjustPoints.ts:55-68`) — aber **keinen `TaskHistoryEvent`**. `writeHistory()`
wird dort nirgendwo aufgerufen.

Das hat einen strukturellen Grund, keinen Bug im engeren Sinn: `TaskHistoryEvent`
(§22, "Verlauf" — `GET /api/history`, `HistoryPage.tsx`) ist zwingend an eine
`taskInstanceId` gebunden (`HistoryDraft.taskInstanceId: string`, nicht optional,
siehe `events.ts:15`). Eine manuelle Punkteanpassung hat aber keine zugehörige
Task-Instanz — sie ist reine Ledger-Buchhaltung (§14) mit Grund, ohne Aufgabenbezug.
`AuditEvent` (§23) ist dafür die architektonisch korrekte Senke und tut genau das,
wofür es gedacht ist.

Das eigentliche Transparenzproblem: **es gibt aktuell keine UI, die `AuditEvent`
überhaupt anzeigt** — weder für Admins noch für Mitglieder. `GET /api/history`
(`misc.ts:32`) ist für jedes Haushaltsmitglied erreichbar (`requireMember`, nicht nur
Admins) und zeigt den gemeinsamen Aufgaben-Verlauf — aber eben nur `TaskHistoryEvent`,
nie `AuditEvent`. Die einzige Stelle, an der eine Anpassung überhaupt sichtbar wird,
ist das persönliche Punktekonto (`LedgerPage.tsx`) der betroffenen Person selbst
— andere Haushaltsmitglieder haben aktuell keine Möglichkeit zu sehen, dass (und
warum) ein Admin jemandem Punkte gutgeschrieben oder abgezogen hat. Das widerspricht
§31 ("keine versteckten Regeln") und dem in diesem Ticket beschriebenen
Transparenzbedürfnis.

Mögliche Lösungsrichtungen (Entscheidung gehört ins Briefing, nicht hierher
vorweggenommen):

1. **Admin-Audit-Log-UI** (§23 wörtlich umgesetzt) — eine neue, admin-only Ansicht,
   die `AuditEvent` liest. Sauberste Trennung, ändert nichts an der Bedeutung von
   `TaskHistoryEvent`/Verlauf als reinem Aufgaben-Zeitstrahl. Deckt aber nur Admins
   ab, nicht "jedes Mitglied sieht es im gemeinsamen Verlauf".
2. **`TaskHistoryEvent` für taskslose Ereignisse öffnen** — `taskInstanceId` nullable
   machen und eine manuelle Anpassung dort mit eintragen. Größerer Eingriff:
   `HistoryPage.tsx`/`renderEvent()` und jeder andere Konsument von
   `TaskHistoryEvent` müsste den Fall "kein Task" beherrschen; verwässert den bisher
   klaren Aufgaben-Fokus des Verlaufs.
3. **`GET /history` um `AuditEvent`-Einträge erweitern** (gemergter Feed) — zeigt es
   allen Mitgliedern, ohne `TaskHistoryEvent`s Schema anzufassen, aber vermischt
   zwei bewusst getrennte Streams (§2.6: "Zwei distinct streams, deliberately").

## Acceptance Criteria

- Eine manuelle Punkteanpassung durch einen Admin ist für mindestens die
  betroffene Person hinaus auch für andere Haushaltsmitglieder (oder zumindest alle
  Admins) nachvollziehbar sichtbar, nicht nur im eigenen Punktekonto der
  betroffenen Person.
- Betrag, Begründung und ausführender Admin sind in der gewählten Ansicht sichtbar
  (alle drei stehen bereits im `AuditEvent.payload`, siehe `adjustPoints.ts:62-67`).
- Kein rohes Enum-Literal, falls ein neuer Anzeige-Pfad entsteht (gleiche i18n-Disziplin
  wie beim bestehenden Verlauf).
- Die bestehende Bedeutung von `TaskHistoryEvent` als Aufgaben-Zeitstrahl bleibt klar,
  unabhängig davon, welche der drei Lösungsrichtungen gewählt wird.

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
| phase:2 | implementation-diff | file_diff | yes | 9 files changed (~370 lines): new admin-only Audit-Log page/section/hook/route/nav entry, full 38-value AuditAction i18n label map, AuditAction shared enum synced to the Prisma schema (was missing 5 values) | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test: shared 144/144, api 343/343, web 135/135 all passing; npm run typecheck clean; npm run lint clean; verified live in browser against real seed data | verified | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/manuelle-punkteanpassung-durch-admin-erscheint-nicht-im-gemeinsamen-verlauf.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T12:26:46.286Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04T14:39:22.000Z: Chose solution direction 1 (admin-only Audit-Log UI)
  over 2 and 3. Deciding factor: the acceptance criteria explicitly permits
  "or at least all admins" as sufficient, and `events.ts`'s own header comment
  documents `TaskHistoryEvent`/`AuditEvent` as "two distinct streams,
  deliberately" — merging them (option 3) or making `taskInstanceId` nullable
  (option 2) would both work against an explicit prior architectural decision
  in the codebase, for no benefit option 1 doesn't already deliver.
  Discovery that changed the plan: `GET /admin/audit-events` already existed,
  fully implemented (admin.ts, filterable by action/entityType/entityId/
  memberId/since, paginated up to 100) — zero backend work needed, this was
  purely a missing frontend surface. Also discovered and fixed in passing:
  `packages/shared/src/domain/enums.ts`'s `AuditAction` was missing 5 values
  that exist in the Prisma schema's enum (`HOUSEHOLD_REGISTERED`,
  `PASSWORD_RESET`, `INTEGRATION_CONNECTED`, `INTEGRATION_DISCONNECTED`,
  `INTEGRATION_SETTINGS_UPDATED`) — synced it, since the new page's i18n
  label map needed to type-check against the complete, real set of values the
  endpoint can actually return, not a stale subset. Verified live in a
  browser against real seed/E2E data (not just unit tests): the two existing
  historical `POINTS_ADJUSTED` audit rows (Elke, +21 and +24, with their
  original reasons) render correctly through the new filter and card layout.
  A test-authoring bug surfaced along the way, worth remembering: the action
  label also appears as an always-present `<option>` in the filter dropdown,
  so `findByText(actionLabel)` resolves on the very first synchronous render
  and never actually waits for the query to settle — tests must wait on
  content that only the loaded row can produce (e.g. the actor's name).

## Active Context

All 4 phases complete. Implementation, verification (including a live
browser check against real data), and local review package done. No PR was
created yet — ready for the user to review the diff and decide on commit/PR.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign finished, awaiting user decision on commit
Files modified: apps/web/src/pages/AdminPage/{AdminAuditLogPage,
AuditLogSection,AuditLogSection.test}.tsx, apps/web/src/api/{hooks,types}.ts,
apps/web/src/router.tsx, apps/web/src/components/Nav/Nav.tsx,
apps/web/src/strings/de.ts, packages/shared/src/domain/enums.ts
Blocking: none
