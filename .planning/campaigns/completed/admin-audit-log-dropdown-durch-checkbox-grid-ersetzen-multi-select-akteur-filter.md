---
version: 1
id: "a2753c77-eb1b-491d-9da0-eb4e05276af1"
status: completed
started: "2026-09-04T18:30:01.473Z"
completed_at: null
direction: "Admin-Audit-Log: Dropdown durch Checkbox-Grid ersetzen, Multi-Select + Akteur-Filter + Session-Merken"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Admin-Audit-Log: Dropdown durch Checkbox-Grid ersetzen, Multi-Select + Akteur-Filter + Session-Merken

Status: completed
Started: 2026-09-04T18:30:01.473Z
Direction: Admin-Audit-Log: Dropdown durch Checkbox-Grid ersetzen, Multi-Select + Akteur-Filter + Session-Merken

## Claimed Scope
- apps/web/src/pages/AdminPage/AuditLogSection.tsx, apps/web/src/api/hooks.ts, apps/web/src/strings/de.ts

## Intake Source

- File: .planning/intake/admin-audit-log-checkbox-grid-filters.md
- Priority: high
- Initial Status: pending

## Delivery Brief

`AuditLogSection.tsx` (`apps/web/src/pages/AdminPage/AuditLogSection.tsx:22-42`)
filtert das Audit-Log aktuell über ein einzelnes `<select>` — genau eine
`AuditAction` oder "Alle Aktionen" (`useState<AuditAction | ''>`). Das
`AuditAction`-Enum (`packages/shared/src/domain/enums.ts:164-206`) hat 37
Werte, was das Dropdown für "zeig mir POINTS_ADJUSTED und ROLE_CHANGED
zusammen" unbrauchbar macht — nur eine Aktion gleichzeitig ist wählbar.

Gewünschte Änderung:

1. **Dropdown → Checkbox-Grid**: die einzelne `<select>` wird durch ein
   3- oder 4-spaltiges Grid aus Checkboxen ersetzt, eine pro `AuditAction`
   (`Object.values(AuditAction)`, siehe aktuelles `.map()` in der Datei), so
   dass jede Kombination von Aktionen gleichzeitig ausgewählt werden kann.
2. **"Alle"/"Keine" Aktion**: zwei Buttons/Links über oder neben dem Grid, um
   in einem Klick alle Checkboxen zu setzen bzw. zu leeren.
3. **Akteur-Filter**: zusätzliche Checkboxen, um nach einzelnen Personen
   und/oder "System" zu filtern. `AdminAuditEventDto` trägt bereits
   `actorType` (`'MEMBER' | 'SYSTEM'`, siehe Rendering-Zweig
   `event.actorType === 'SYSTEM' ? de.admin.auditLog.actorSystem : event.actor?.displayName`
   in der aktuellen Datei) und für `MEMBER`-Events `actor.{id, displayName}`.
   Die Haushaltsmitglieder-Liste ist bereits über einen bestehenden Hook
   verfügbar (siehe Verwendung in anderen Admin-Sections, z. B. `useMembers`)
   — kein neuer Endpunkt nötig, um die Namen für die Checkboxen zu befüllen.
4. **Zustand merken**: nach jeder Änderung (Aktion an/aus, Akteur an/aus,
   Alle/Keine) wird der Filterzustand im Browser gemerkt — laut Anfrage
   reicht Session- oder `localStorage`, keine Server-Persistenz pro Nutzer
   nötig. `InstallPrompt.tsx` (`apps/web/src/components/InstallPrompt/InstallPrompt.tsx`)
   verwendet bereits direktes `localStorage.getItem`/`setItem` ohne
   Wrapper-Utility — dieses Muster kann übernommen werden, statt eine neue
   Abstraktion einzuführen.

Offene Designfrage fürs Briefing: aktuell akzeptiert
`GET /admin/audit-events` (`apps/api/src/infra/http/routes/admin.ts:1421-1449`)
serverseitig nur **eine** `action` und **eine** `memberId` als Query-Parameter
(kein `actorType`-Filter). Zwei Wege sind denkbar:

- (a) Backend-Route um Mehrfachwerte (`action[]`, `memberId[]`) und einen
  `actorType`-Parameter erweitern, oder
- (b) da die Route ohnehin auf max. 100 Zeilen begrenzt ist
  (`Math.min(query.limit ?? 50, 100)`), den kompletten ungefilterten Datensatz
  einmal laden (`useAdminAuditEvents()` ohne `action`) und Mehrfach-Aktion- +
  Akteur-Filterung rein clientseitig in `AuditLogSection.tsx` anwenden.

Option (b) vermeidet API-Änderungen komplett und passt zur Größenordnung
dieser Seite (§43, 1–20 Mitglieder, Admin-only Ansicht) — zu entscheiden im
Briefing, falls sich daraus doch Pagination-Probleme ergeben sollten.

## Acceptance Criteria

- Das Dropdown ist durch ein 3- oder 4-spaltiges Grid aus Checkboxen ersetzt,
  eine pro `AuditAction`; beliebige Kombinationen sind gleichzeitig wählbar,
  und das Log zeigt genau die Events, deren `action` in der gewählten Menge
  liegt (leere Auswahl = alle Aktionen, wie heute "Alle Aktionen").
- Ein "Alle auswählen" und ein "Keine auswählen" Control setzt/leert alle
  Checkboxen in einem Klick.
- Zusätzliche Checkboxen erlauben das Filtern nach einzelnen Haushaltsmitgliedern
  und/oder "System" (`actorType === 'SYSTEM'`); auch hier sind beliebige
  Kombinationen wählbar.
- Nach jeder Filteränderung (Aktion, Akteur, Alle/Keine) bleibt der gewählte
  Zustand erhalten, wenn die Seite neu geladen wird oder der Nutzer sie
  verlässt und zurückkehrt — mindestens für die aktuelle Browser-Session,
  idealerweise über `localStorage` auch über Sessions hinweg. Keine
  Server-Persistenz pro Nutzer erforderlich.
- Bestehendes Verhalten bleibt erhalten: Ladeindikator, Empty-State
  (`de.admin.auditLog.empty`), und die Event-Darstellung (Aktion, Zeitstempel,
  Akteur, `amount`/`reason` aus dem Payload) ändern sich nicht.
- Serverseitig verbindlich (§36): kein zusätzliches Vertrauen in clientseitig
  berechnete Filterergebnisse — falls Filterung serverseitig erfolgt, muss
  die Route weiterhin nur householdeigene Events zurückgeben
  (`requireAdmin` + `householdId`-Scoping bleibt unverändert).

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 |   complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 6 files changed, 286 insertions(+), 70 deletions(-) | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test --workspaces: 144+371+155 tests passed, 0 failed | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/admin-audit-log-dropdown-durch-checkbox-grid-ersetzen-multi-select-akteur-filter.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T18:30:01.473Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Chose option (b) from the brief's open design question: client-side
  multi-select filtering over one unfiltered fetch (`limit=100`), instead of adding
  `action[]`/`actorType` query params to `GET /admin/audit-events`.
  Reason: the route already caps at 100 rows and is admin-only (§43 scale); no
  API change needed, and `requireAdmin` + household scoping stays untouched
  (§36 unaffected — filtering is display-only, never trust-bearing).

## Active Context

Phase 2 (build) and Phase 3 (verify) complete. `useAdminAuditEvents()` now
fetches unconditionally; `AuditLogSection.tsx` renders a checkbox grid per
`AuditAction` (with "Alle auswählen"/"Keine auswählen"), a second checkbox
grid per household member plus "System", and persists both selections to
`localStorage` (`hh-audit-log-filters`) using the same
try/catch-wrapped direct-localStorage idiom as `InstallPrompt.tsx`. Full
workspace test suite (`npm run test --workspaces`) passes: 144 + 371 + 155
tests. Typecheck and lint clean on all changed files. Next action: Phase 4,
package for review.

## Continuation State

Phase: 4
Sub-step: implementation and verification done, packaging not started
Files modified: apps/web/src/api/hooks.ts, apps/web/src/pages/AdminPage/AuditLogSection.tsx,
  apps/web/src/pages/AdminPage/AuditLogSection.test.tsx, apps/web/src/pages/AdminPage/AdminPage.module.css,
  apps/web/src/strings/de.ts
Blocking: none

## Completion Record

- Completed At: 2026-09-04T18:37:44.517Z
- Outcome: review-package
- Verification: npm run test --workspaces: 144+371+155 tests passed
- Note: Checkbox-grid multi-select action filter + actor filter (members + System) + localStorage persistence. Client-side filtering, no API changes.
