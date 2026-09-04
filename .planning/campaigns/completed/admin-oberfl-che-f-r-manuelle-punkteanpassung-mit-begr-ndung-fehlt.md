---
version: 1
id: "067e7b1f-9644-468a-8794-31366d09abfb"
status: completed
started: "2026-09-04T10:55:25.421Z"
completed_at: "2026-09-04T13:01:23.000Z"
direction: "Admin-Oberfläche für manuelle Punkteanpassung mit Begründung fehlt"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Admin-Oberfläche für manuelle Punkteanpassung mit Begründung fehlt

Status: completed
Started: 2026-09-04T10:55:25.421Z
Direction: Admin-Oberfläche für manuelle Punkteanpassung mit Begründung fehlt

## Claimed Scope
- apps/web/src/components/UserMaintenanceCard/, apps/web/src/api/

## Intake Source

- File: .planning/intake/admin-manual-points-adjustment-ui-missing.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Gewünscht: als Admin einer Person Punkte mit Pflicht-Begründung gutschreiben oder
abziehen können — zum Beispiel wenn bereits etwas erledigt wurde, für das keine
Aufgabe existierte, und sich für einen einmaligen Vorgang keine eigene
`TaskDefinition` lohnt.

Das Backend dafür existiert bereits vollständig und macht genau das:
`POST /admin/members/:id/points/adjust` (`apps/api/src/app/points/adjustPoints.ts`,
Route registriert in `infra/http/routes/admin.ts:1119`) verlangt eine nicht-leere
`reason` (leer wird mit `VALIDATION_FAILED` abgelehnt — siehe Kommentar im Code:
"eine Anpassung mit leerer Begründung ist genau die 'setz einfach die Zahl'-Änderung,
die das Ledger verhindern soll"), bucht die Anpassung als `MANUAL_ADJUSTMENT`,
`BONUS`, `PENALTY` oder `CORRECTION` über das reguläre Ledger (`postTransaction`,
§14) und schreibt zusätzlich einen `POINTS_ADJUSTED`-Audit-Eintrag mit Betrag,
Begründung und neuem Saldo.

Es gibt aber **keine Frontend-Oberfläche** dafür — eine Suche über `apps/web/src`
nach dem Endpunkt/den Funktionsnamen ergibt keine Treffer. Der einzige Weg, die
Route aktuell auszulösen, ist ein direkter API-Call. `UserMaintenanceCard.tsx`
zeigt den Punktestand aktuell explizit als **read-only** an (siehe kürzliche
Commits "fix: visually distinguish Punktestand as read-only on
UserMaintenanceCard") — das ist der naheliegende Ort für eine neue Aktion, die
diese Lücke schließt.

## Acceptance Criteria

- In `UserMaintenanceCard` (oder einem von dort erreichbaren Dialog) gibt es eine
  Admin-Aktion "Punkte anpassen", die Betrag (positiv oder negativ, ganzzahlig,
  ≠ 0) und eine Pflicht-Begründung abfragt.
- Der Dialog ruft `POST /admin/members/:id/points/adjust` mit diesen Werten auf
  und zeigt serverseitige Validierungsfehler (leere Begründung, Betrag 0) inline
  an, statt sie nur als generischen Fehler zu zeigen.
- Nach erfolgreicher Anpassung aktualisiert sich der angezeigte Punktestand ohne
  vollständigen Seitenreload.
- Die Anpassung ist über die Punkte-Historie/den Audit-Log der Person nachvollziehbar
  sichtbar (bereits vorhanden über `POINTS_ADJUSTED`/`MANUAL_ADJUSTMENT` — hier nur
  sicherstellen, dass die UI diese neuen Einträge korrekt anzeigt und nicht als
  rohes Enum, siehe verwandtes, bereits behobenes Intake-Item
  `benachrichtigung-task-taken-erscheint-als-roh-enum-statt-als-text`).
- Nur Admins sehen/erreichen diese Aktion (serverseitige Autorisierung existiert
  bereits über die Admin-Route; hier nur UI-seitig absichern, keine neue
  Berechtigungslogik nötig).

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
| phase:2 | implementation-diff | file_diff | yes | apps/web/src/api/hooks.ts (+18), UserMaintenanceCard.tsx (+5), MembersSection.tsx (+114), MembersSection.test.tsx (+101), strings/de.ts (+9), UserMaintenanceCard.stories.tsx (+1) | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test: shared 144/144, api 342/342, web 131/131 all passing; npm run typecheck clean; npm run lint clean | verified | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/admin-oberfl-che-f-r-manuelle-punkteanpassung-mit-begr-ndung-fehlt.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T10:55:25.421Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04T13:01:23.000Z: Implemented, verified, and packaged in one session.
  Added an "Punkte anpassen" action on `UserMaintenanceCard` opening a Sheet
  (`AdjustPointsForm` in `MembersSection.tsx`) that posts amount + reason to
  the existing `POST /admin/members/:id/points/adjust`. Client-side mirrors
  the server's validation (integer amount ≠ 0, non-empty reason) and a
  dedicated `adjustPointsErrorMessage` helper maps a server `VALIDATION_FAILED`
  response's `fieldErrors` path back to the same specific message, so a
  round-tripped rejection reads the same as the client-side catch — never the
  generic fallback. Success invalidates the admin members query, so the
  displayed balance updates without a reload. No changes needed to
  `LedgerPage`/`de.ledger.type` — `MANUAL_ADJUSTMENT` was already mapped to a
  German label, not a raw enum. Added 3 new tests to `MembersSection.test.tsx`
  covering the happy path (balance updates live), client-side reason
  rejection (no API call made), and the server-fieldErrors path. Full suite
  (617 tests) and typecheck + lint pass.

## Active Context

All 4 phases complete. Implementation, verification, and local review package
done. No PR was created yet — ready for the user to review the diff and
decide on commit/PR.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign finished, awaiting user decision on commit
Files modified: apps/web/src/api/hooks.ts,
apps/web/src/components/UserMaintenanceCard/UserMaintenanceCard.tsx,
apps/web/src/components/UserMaintenanceCard/UserMaintenanceCard.stories.tsx,
apps/web/src/pages/AdminPage/MembersSection.tsx,
apps/web/src/pages/AdminPage/MembersSection.test.tsx,
apps/web/src/strings/de.ts
Blocking: none
