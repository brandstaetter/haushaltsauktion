---
version: 1
id: "fd7df0a2-19f7-4de3-a98c-e95aadfdc913"
status: completed
started: "2026-09-02T05:31:01.422Z"
completed_at: null
direction: "Kategorien per Drag-and-Drop sortieren statt Reihenfolge-Feld"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Kategorien per Drag-and-Drop sortieren statt Reihenfolge-Feld

Status: completed
Started: 2026-09-02T05:31:01.422Z
Direction: Kategorien per Drag-and-Drop sortieren statt Reihenfolge-Feld

## Claimed Scope
- apps/web/src/pages/AdminPage/CategoriesSection.tsx

## Intake Source

- File: .planning/intake/categories-drag-drop-reorder.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`CategoriesSection.tsx` (Verwaltung > Kategorien) zeigt `sortOrder` aktuell
als eigenes Zahlenfeld pro Kategorie-Zeile (`de.admin.categories.sortOrder`
= "Reihenfolge", `CategoryRow` → `.memberFields`-Zahleneingabe). Das ist
fehleranfällig — Admins müssen für jede Kategorie eine passende Zahl finden
und im Kopf konsistent halten, um die gewünschte Reihenfolge zu erreichen.

Die Sortierung soll stattdessen per Drag-and-Drop auf der Kategorienliste
erfolgen. Das "Reihenfolge"-Zahlenfeld entfällt aus der UI (Formular und
Zeilenanzeige) vollständig — `sortOrder` bleibt als internes Datenfeld
bestehen, wird aber nur noch durch Drag-and-Drop geschrieben, nicht mehr
direkt editiert.

Backend-Lage: `PUT /admin/categories/:id` (`admin.ts`) nimmt aktuell den
vollen `CategoryBody` (`name`, `colorHex`, `sortOrder`) entgegen; es gibt
noch keinen Bulk-/Reorder-Endpunkt. Bei der erwarteten Kategorienanzahl
(einstellig bis niedriger zweistelliger Bereich pro Haushalt) reicht es
vermutlich, nach einem Drop sequenziell `sortOrder` je verschobener
Kategorie über den bestehenden Endpunkt zu aktualisieren — ein dedizierter
Bulk-Reorder-Endpunkt ist eine mögliche, aber keine zwingende Erweiterung;
das entscheidet die Umsetzung nach Bedarf (z. B. wenn sequenzielle Requests
sich als ruckelig erweisen).

## Acceptance Criteria

- Das "Reihenfolge"-Zahlenfeld ist weder im Add- noch im Edit/Row-UI der
  Kategorienliste sichtbar.
- Kategorien lassen sich per Drag-and-Drop in der Liste neu anordnen
  (Touch- und Maus-Bedienung, da die App primär auf Smartphones genutzt
  wird — §31 UX-Prinzipien).
- Nach einem Drop ist die neue Reihenfolge persistiert (`sortOrder`
  serverseitig aktualisiert) und bleibt nach Reload erhalten.
- Die Kategorienliste ist überall dort, wo sie nach `sortOrder` angezeigt
  wird (z. B. Kategorie-Dropdown bei Aufgaben), weiterhin korrekt sortiert.
- Neue Kategorien erhalten weiterhin automatisch eine sinnvolle `sortOrder`
  (z. B. ans Ende angehängt), ohne dass der Admin sie manuell eingeben muss.
- Bestehende Tests (`CategoriesSection.test.tsx`) sind auf die neue UI
  angepasst; Typecheck und Lint bleiben grün.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | complete | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | `git diff --stat`: 6 files changed, 270 insertions(+), 60 deletions(-) (CategoriesSection.tsx, CategoriesSection.test.tsx, AdminPage.module.css, hooks.ts, de.ts, package.json) | resolved | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | `npm run typecheck --workspace apps/web`: clean. `vitest run` (apps/web): 17 files, 100 tests passed, incl. 6/6 in CategoriesSection.test.tsx (2 existing + 1 new render assertion + 3 new `computeReorder` unit tests). `npm run build --workspace apps/web`: succeeded. Manually verified in a running dev instance (Chrome via claude-in-chrome): dragged "Wäsche & Müll" to the top, reload showed the new order persisted, and the task-form category dropdown re-sorted to match — then dragged it back to restore the seed order. | resolved | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/kategorien-per-drag-and-drop-sortieren-statt-reihenfolge-feld.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T05:31:01.422Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-02T07:45:00.000Z: Implemented drag-and-drop reorder with @dnd-kit
  (core/sortable/utilities). Reason: only React DnD library already
  compatible with React 19 as a peer dep, and its KeyboardSensor gives
  keyboard-accessible reordering for free alongside PointerSensor's touch
  support (§31 mobile-first).
- 2026-09-02T07:45:00.000Z: `useReorderCategories()` persists only the
  categories whose `sortOrder` actually changed (via `PUT
  /admin/categories/:id` per row), not the full list, matching the
  intake brief's "sequenziell sortOrder je verschobener Kategorie". An
  optimistic cache write avoids a visible reorder flicker while those
  requests are in flight; a failure rolls the cache back and surfaces
  `errors.generic`.
- 2026-09-02T07:45:00.000Z: Dropped `sortOrder` from `CategoryDraft`
  entirely (it was the only field driving the removed number input) and
  changed `handleSave` to send the category's own current `sortOrder`
  instead of the draft's. Reason: a draft created before a drag-and-drop
  reorder would otherwise hold a stale `sortOrder` and silently overwrite
  a just-persisted reorder on the next unrelated name/color save.

## Active Context

All four phases complete. Implementation, tests, build, and a manual
browser walkthrough (drag reorder, reload persistence, dependent dropdown
re-sort) all verified against the acceptance criteria. Review package
written. Pre-existing, unrelated lint error in `apps/web/vitest.config.ts`
(triple-slash reference) noted but left alone — out of this campaign's
claimed scope.

## Continuation State

Phase: 4 (complete)
Sub-step: none — ready to close out
Files modified: apps/web/src/pages/AdminPage/CategoriesSection.tsx,
CategoriesSection.test.tsx, AdminPage.module.css; apps/web/src/api/hooks.ts;
apps/web/src/strings/de.ts; apps/web/package.json; package-lock.json
Blocking: none

## Completion Record

- Completed At: 2026-09-02T05:43:40.605Z
- Outcome: review-package
- Verification: npm run typecheck --workspace apps/web clean; vitest run (apps/web) 17 files/100 tests passed; npm run build --workspace apps/web succeeded; manual browser verification of drag reorder, reload persistence, and dependent category dropdown re-sort
- Note: Categories reorder now via drag-and-drop (dnd-kit); sortOrder field removed from admin UI; PUT /admin/categories/:id reused per-moved-row
