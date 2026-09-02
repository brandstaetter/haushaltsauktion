---
version: 1
id: "a7564e74-a721-43ed-ae00-44133c2cea9d"
status: active
started: "2026-09-02T06:21:49.716Z"
completed_at: null
direction: "Aktions-Button auf der Aufgaben-Card bricht auf schmalen Handybildschirmen mitten im Wort um"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Aktions-Button auf der Aufgaben-Card bricht auf schmalen Handybildschirmen mitten im Wort um

Status: active
Started: 2026-09-02T06:21:49.716Z
Direction: Aktions-Button auf der Aufgaben-Card bricht auf schmalen Handybildschirmen mitten im Wort um

## Claimed Scope
- apps/web/src/components/TaskCard/TaskCard.tsx, apps/web/src/components/Button/Button.tsx, apps/web/src/components/Button/Button.module.css, e2e/mobile-layout.spec.ts

## Intake Source

- File: .planning/intake/task-card-mobile-button-label-wrap.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Auf schmalen Handybildschirmen sieht die Aufgabenliste kaputt aus: der
Aktions-Button auf jeder `TaskCard` (`apps/web/src/components/TaskCard/
TaskCard.tsx`) bekommt seinen Text ("Freiwillig übernehmen" /
"Als erledigt markieren", `de.action.volunteer` / `de.action.complete`,
`apps/web/src/strings/de.ts:45,49`) in mehrere Zeilen zerrissen, teils
mitten im Wort.

`TaskCard` ist die Component, die sowohl auf `TaskListPage` (die eigentliche
"Aufgaben"-Liste) als auch im "Freiwillig verfügbar"/"Meine Aufgaben"-
Bereich von `DashboardPage` rendert — beide Stellen sind also betroffen.

Ursache in der aktuellen Umsetzung:

- `.row` in `TaskCard.module.css` ist ein `justify-content: space-between`-
  Flex-Container mit `ValueChip` und `Button` als Geschwister, ohne
  `flex-shrink: 0` oder Mindestbreite auf dem Button — auf einem schmalen
  Bildschirm bleibt dem Button wenig Platz.
- `Button.module.css`s `.button` setzt `font: var(--t-h3)` (die `md`-Größe,
  die `TaskCard` hier verwendet) — eine für einen schmalen Button relativ
  große Schrift — und hat kein `white-space`/`overflow-wrap`, das
  kontrolliertes Umbrechen an Wortgrenzen statt mitten im Wort erzwingt.

Der vorgeschlagene Ansatz aus der Meldung: Ab einer bestimmten
Bildschirmbreite auf einen reinen Icon-Button umschalten (mit `aria-label`
für Screenreader/Barrierefreiheit, da `Button` aktuell `children:
ReactNode` als Pflichtfeld hat und keinen Icon-only-Modus kennt — siehe
`ButtonProps` in `Button.tsx`). Das Repo hat bereits einen einzigen
etablierten Breakpoint (`@media (min-width: 900px)`, u. a. in `Layout.module
.css`, `Nav.module.css`, `AdminPage.module.css` — Desktop-vs.-Mobil-
Umschaltung), aber noch keinen engeren "kleines Handy"-Breakpoint.

Zielgerät für die Optimierung: **iPhone 13** (390×844 CSS-Pixel). Das ist
kein Zufallswert, sondern bereits der projekteigene Referenz-Mobil-Viewport:
`e2e/mobile-layout.spec.ts` setzt `test.use({ viewport: { width: 390,
height: 844 } })` und beschreibt ihn im Kommentar dort als "iPhone 14/15,
das kleinste Gerät, das in dieser Familie realistisch vorkommt" — dieselbe
CSS-Viewportgröße gilt für die komplette iPhone-12/13/14-Standardreihe
(nicht mini, nicht Plus/Pro Max), das iPhone 13 eingeschlossen. Diese Datei
enthält bereits einen Test `'Aufgabenliste scrollt nicht seitlich'`, der
`/aufgaben` bei genau dieser Breite aufruft (aktuell wird dort nur auf
horizontales Scrollen geprüft, nicht auf den hier gemeldeten Zeilenumbruch)
— das ist der naheliegende Ort, um eine Prüfung für dieses Problem zu
ergänzen, statt einen neuen, abweichenden Breakpoint zu erfinden.

Alternativ zu einem reinen Breakpoint-Umschalten könnten auch andere
Lösungen die Ursache beheben (z. B. `Button` in diesem Kontext eine engere/
kleinere Variante geben, das Layout von `.row` von nebeneinander auf
gestapelt ändern, `Button` ein `truncate`- oder `hyphens: auto`-Verhalten
geben) — welcher Ansatz umgesetzt wird, entscheidet die Umsetzung; das aus
der Meldung vorgeschlagene "Icon-only unterhalb eines Schwellenwerts" ist
ein akzeptabler, aber nicht der einzig mögliche Lösungsweg.

## Acceptance Criteria

- Bei 390×844 (iPhone 13 — der bereits in `e2e/mobile-layout.spec.ts`
  konfigurierte Referenz-Mobil-Viewport) bricht der Text des Aktions-
  Buttons auf `TaskCard` nicht mehr mitten im Wort um — entweder durch
  Umbruch an Wortgrenzen, durch Kürzung/Icon-only-Darstellung, oder durch
  ein angepasstes Layout, das dem Button genug Platz für den vollen Text
  garantiert. Kein neuer, abweichender Breakpoint für "kleines Handy" ohne
  Bezug zu diesem bereits etablierten Referenzwert.
- Falls eine Icon-only-Variante umgesetzt wird: Der Button bleibt für
  Screenreader/Barrierefreiheit über `aria-label` (Text aus
  `de.action.volunteer`/`de.action.complete`) benannt, auch wenn kein
  sichtbarer Text mehr angezeigt wird.
- Die Änderung wirkt auf allen Stellen, an denen `TaskCard` verwendet wird
  (`TaskListPage`, `DashboardPage`), da es sich um dieselbe Component
  handelt.
- `e2e/mobile-layout.spec.ts`s bestehender Test `'Aufgabenliste scrollt
  nicht seitlich'` bekommt eine zusätzliche Prüfung (oder einen neuen Test
  in derselben Datei) für dieses Problem bei 390×844 — z. B. dass der
  Button nicht mehr Zeilen umfasst als erwartet, oder ein Screenshot-
  Vergleich. Nicht nur Unit-Tests — §31 mobile-first verlangt, dass mobile
  Darstellung tatsächlich am Zielgerät geprüft wird, nicht nur angenommen.
- Typecheck und Lint bleiben grün; bestehende Tests (falls vorhanden für
  `TaskCard`/`Button`) bleiben grün oder werden angepasst.

## Map Context

No map index available. Run `node scripts/map-index.js --generate --root .` before delegation.

## Phases

| # | Status | Type | Phase | Done When |
|---|--------|------|-------|-----------|
| 1 | complete | brief | Intake preflight and campaign scaffold | Campaign file exists with scope, acceptance criteria, and evidence contract |
| 2 | complete | build | Implement requested change | Required files are changed and implementation diff is available |
| 3 | complete | verify | Run verification | npm run test passes |
| 4 | pending | package | Package for review | PR link or local review package is recorded |

## Exit Evidence

| Target | ID | Type | Required | Evidence | Status | Retries Remaining | Next Action |
|---|---|---|---|---|---|---|---|
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: Button.module.css +5, TaskCard.module.css +4, TaskCard.tsx size md→sm, e2e/helpers.ts +45 (expectNoMidWordWrap), e2e/mobile-layout.spec.ts +23 (new test) | done | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test: 480/480 unit tests pass (shared 128, api 249, web 103). npx playwright test e2e/mobile-layout.spec.ts: 12/12 pass (2 consecutive clean runs against isolated local Postgres on port 5433). Full e2e suite: 24/24 pass on a freshly reset DB (one earlier run had 1 unrelated pre-existing flaky failure on the login page, not reproduced on rerun). | done | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/aktions-button-auf-der-aufgaben-card-bricht-auf-schmalen-handybildschirmen-mitte.md | pending | 2 | package delivery for review |

## Decision Log

- 2026-09-02T06:21:49.716Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-02: Root cause confirmed: global `hyphens: auto` (apps/web/src/styles/global.css) plus a tight `.row` flex layout with no `flex-shrink: 0` on the ValueChip forced the Button's text into a narrow column, and the browser hyphenated/broke it mid-word. Fix: `.button` in Button.module.css now sets `white-space: normal; overflow-wrap: normal; word-break: normal; hyphens: none; text-align: center;` so wrapping (if any) only happens at word boundaries; TaskCard's action button switched from `size="md"` to the already-designed `size="sm"` variant (its own CSS comment says it exists exactly for dense card action rows); `.row > :first-child` (ValueChip) got `flex-shrink: 0` so it never squeezes the button. No new breakpoint introduced, per the acceptance criteria.
  Reason: Chose word-boundary wrapping + the existing `sm` size over an icon-only variant — simpler, no `Button` API change, and the acceptance criteria explicitly allows this approach.
- 2026-09-02: New e2e test added to e2e/mobile-layout.spec.ts ("Aktions-Button auf der Aufgaben-Card bricht nicht mitten im Wort um") plus a new `expectNoMidWordWrap` helper in e2e/helpers.ts that reads actual rendered line breaks via `Range.getClientRects()` and asserts every break lands on a space, not mid-word.
  Reason: Acceptance criteria requires a real mobile-viewport check, not just a unit test.
- 2026-09-02: While verifying locally, found and killed 7 orphaned `npm run dev -w apps/api` processes (leftover from an offline peer session, "E2e-tests-against-throwaway-deploy PR checks") that were connected to the same test Postgres and periodically running the assignment sweep, corrupting fixture state across runs. Unrelated to this change; flagged for awareness, not fixed as part of this campaign.
  Reason: Needed a clean signal to debug an e2e flake; after cleanup the flake was isolated to the test itself (see next entry), not the orphaned processes.
- 2026-09-02: The e2e test's own `buttons.count()` call read the DOM before the task list finished loading (a plain `.count()` doesn't auto-retry like `expect(locator)` does), causing an intermittent false failure. Fixed by asserting `expect(buttons.first()).toBeVisible()` before counting.
  Reason: Confirmed via failed-run screenshots showing the correct cards/buttons were actually present; the assertion just ran too early.

## Active Context

Implementation, verification, and local e2e verification complete. Next action: package for review (Phase 4).

## Continuation State

Phase: 4
Sub-step: ready to package for review
Files modified: apps/web/src/components/Button/Button.module.css, apps/web/src/components/TaskCard/TaskCard.module.css, apps/web/src/components/TaskCard/TaskCard.tsx, e2e/helpers.ts, e2e/mobile-layout.spec.ts
Blocking: none

<!-- session-end: 2026-09-02T10:29:01.819Z -->
