---
version: 1
id: "e000233c-5743-4e91-8c68-562e21e2436e"
status: complete
started: "2026-09-02T07:37:25.326Z"
completed_at: "2026-09-02T09:41:00.000Z"
direction: "Kategorie-Label auf der Aufgabenliste farbig hinterlegen"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Kategorie-Label auf der Aufgabenliste farbig hinterlegen

Status: complete
Started: 2026-09-02T07:37:25.326Z
Direction: Kategorie-Label auf der Aufgabenliste farbig hinterlegen

## Claimed Scope
- apps/web/src/components/TaskCard/TaskCard.tsx, apps/web/src/components/TaskCard/TaskCard.module.css

## Intake Source

- File: .planning/intake/task-card-category-color-badge.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`TaskCard.tsx` (`apps/web/src/components/TaskCard/TaskCard.tsx:38`) zeigt die
Kategorie einer Aufgabe aktuell als reinen Text ohne Farbe:

```tsx
{task.category && <span className={styles.category}>{task.category.name}</span>}
```

`.category` in `TaskCard.module.css` setzt nur `color: var(--ink-3)`, kein
Hintergrund. Dabei ist die Admin-konfigurierte Kategoriefarbe
(`CategoryRefDto.colorHex: string | null`, `packages/shared/src/api/tasks.ts`)
bereits Teil der DTO, die dieser Component ohnehin schon bekommt — sie wird
nur nirgends auf dieser Ansicht benutzt (im Gegensatz zur
Kategorien-Verwaltung, `apps/web/src/pages/AdminPage/CategoriesSection.tsx`,
wo dieselbe `colorHex` bereits als Farbwähler-Swatch dargestellt wird).

`TaskCard` ist eine gemeinsame Component — sie rendert sowohl auf
`TaskListPage` (die eigentliche "Aufgaben"-Liste) als auch im
"Freiwillig verfügbar"/"Meine Aufgaben"-Bereich von `DashboardPage`. Eine
Änderung an `TaskCard` wirkt sich also automatisch auf beide Stellen aus.

Das Repo hat bereits ein Pill/Badge-Muster für farbige Labels
(`apps/web/src/components/StatusBadge/StatusBadge.module.css`: `display:
inline-block`, Padding, `border-radius`, Hintergrundfarbe) — das Kategorie-
Label sollte diesem Muster folgen, nur mit `colorHex` statt einer festen
Akzentfarbe als Hintergrund.

Der Knackpunkt: `colorHex` ist admin-frei wählbar (`apps/web/src/pages/
AdminPage/CategoriesSection.tsx`, `<input type="color">`, kein Contrast-
Check bei der Eingabe) — es kann jede beliebige Farbe sein, hell oder dunkel.
Eine fest codierte Textfarbe (immer Schwarz oder immer Weiß) wird bei vielen
Farben unlesbar. Es gibt im Repo aktuell keine Utility, die aus einer
Hintergrundfarbe eine kontrastsichere Textfarbe berechnet — die muss neu
geschrieben werden (z. B. relative Luminanz nach WCAG-Formel, dann Schwarz
oder Weiß wählen, je nachdem was mehr Kontrast liefert).

## Acceptance Criteria

- Das Kategorie-Label auf der Aufgaben-Card (`TaskCard`) rendert als farbige
  Pille/Badge mit `task.category.colorHex` als Hintergrundfarbe, analog zum
  bestehenden Pill-Muster in `StatusBadge.module.css`.
- Die Textfarbe wird aus der Hintergrundfarbe berechnet (nicht fest codiert)
  und erreicht mindestens WCAG-AA-Kontrast (≥ 4,5:1, oder ≥ 3:1 sofern das
  Label als "large text" im Sinne der WCAG-Definition gilt — die Umsetzung
  legt sich auf einen der beiden Schwellenwerte fest und wendet ihn
  konsequent an) gegenüber der jeweiligen Hintergrundfarbe.
- Kategorien ohne `colorHex` (`null`) fallen auf die heutige schlichte,
  unfarbige Label-Darstellung zurück — kein leerer/kaputter Hintergrund.
- Die Änderung wirkt auf allen Stellen, an denen `TaskCard` verwendet wird
  (`TaskListPage`, `DashboardPage`), da es sich um dieselbe Component
  handelt.
- Die Kontrastberechnung ist als eigene, pure Funktion testbar (unit-testbar
  ohne DOM), mit Tests für mindestens: sehr helle Hintergrundfarbe, sehr
  dunkle Hintergrundfarbe, und `colorHex: null`. Typecheck und Lint bleiben
  grün.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: TaskCard.tsx (+17/-1), TaskCard.module.css (+3), utils/color.ts (new), utils/color.test.ts (new) | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test --workspace=apps/web: 18 files, 107 tests passed (incl. color.test.ts); npm run typecheck --workspace=apps/web: clean; eslint on changed files: clean (pre-existing vitest.config.ts lint error unrelated, tracked by separate intake item) | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/kategorie-label-auf-der-aufgabenliste-farbig-hinterlegen.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T07:37:25.326Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

## Active Context

Delivery complete. Category badge implemented in TaskCard with a new
`readableTextColor` contrast utility, tests added, verification passed, and
a local review package generated. Ready for review/merge.

## Continuation State

Phase: 4 (complete)
Sub-step: none — campaign complete
Files modified: apps/web/src/components/TaskCard/TaskCard.tsx,
apps/web/src/components/TaskCard/TaskCard.module.css,
apps/web/src/utils/color.ts (new), apps/web/src/utils/color.test.ts (new)
Blocking: none
