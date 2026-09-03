---
version: 1
id: "238d5c57-a2b0-4927-8d6e-9ab445640b63"
status: completed
started: "2026-09-02T20:04:55.263Z"
completed_at: "2026-09-02T22:25:00.000Z"
direction: "Admin-Bottom-Navigation: „Einstellungen“ bricht auf schmalen Handybildschirmen um und verschiebt die Ausrichtung"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Admin-Bottom-Navigation: „Einstellungen“ bricht auf schmalen Handybildschirmen um und verschiebt die Ausrichtung

Status: completed
Started: 2026-09-02T20:04:55.263Z
Direction: Admin-Bottom-Navigation: „Einstellungen“ bricht auf schmalen Handybildschirmen um und verschiebt die Ausrichtung

## Claimed Scope
- apps/web/src/components/Nav/Nav.tsx, apps/web/src/components/Nav/Nav.module.css, e2e/mobile-layout.spec.ts

## Intake Source

- File: .planning/intake/admin-bottom-nav-label-wrap-narrow-screens.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Auf einem iPhone 13 (390×844 CSS-Pixel — der projekteigene Referenz-Mobil-
Viewport, siehe `e2e/mobile-layout.spec.ts`) ist die untere Navigation
verrutscht: das Label "Einstellungen" bricht in eine zweite Zeile um,
wodurch dieser Eintrag höher wird als die anderen und die ganze Leiste
optisch aus der Ausrichtung gerät.

Betroffen ist nur die **ADMIN**-Ansicht: `Nav.tsx` (`apps/web/src/
components/Nav/Nav.tsx:12-23`) rendert für normale Mitglieder 3 Einträge
(Start/Verlauf/Ich), aber für Admins zusätzlich 4 weitere
(`adminItems`: Einstellungen/Benutzer/Aufgaben/Kategorien) — macht 7
Einträge in derselben schmalen Leiste. "Einstellungen" (`de.nav
.adminSettings`, `apps/web/src/strings/de.ts:8`) ist mit 13 Zeichen das
längste Label aller sieben.

Ursache in `Nav.module.css`:

- `.list` ist `display: flex; justify-content: space-around` ohne
  `flex-wrap`-Kontrolle auf den Kindern.
- `.link` hat `min-width: 56px`, aber keine Regel, die Umbruch am Label
  verhindert (kein `white-space: nowrap`, kein `overflow: hidden`/
  `text-overflow: ellipsis`, keine kleinere Schrift oder Kürzung für den
  schmalen 7-Spalten-Fall).
- `.link span` setzt `font-size: 11px` — bereits recht klein — aber bei 7
  Spalten auf 390px bleiben pro Spalte nur ~50-55px, zu wenig für
  "Einstellungen" bei dieser Schriftgröße.

Das Projekt hat bereits genau dieses Muster einmal gelöst (siehe die
gemergte PR #38, `fix: TaskCard action button no longer wraps mid-word on
narrow phones` — dort wurde für `Button` kontrolliertes Wortgrenzen-
Verhalten statt Mitten-im-Wort-Umbruch erzwungen). Hier reicht das
vermutlich nicht: selbst am Wortende umgebrochen bliebe "Einstellungen"
zweizeilig und würde die Zeile weiterhin verschieben, weil es keinen
Zwei-Wort-Fallback gibt.

Vom Melder vorgeschlagener Lösungsansatz: nur Icons ohne Labels anzeigen
(zumindest ab einer bestimmten Eintragsanzahl oder Bildschirmbreite) —
`item.icon` wird bereits gerendert (`Nav.tsx:31`/`40`), `<span>{item
.label}</span>` müsste dann per CSS ausgeblendet werden, wobei das Label
für Screenreader/Barrierefreiheit erhalten bleiben muss (`aria-label`
oder `sr-only`-Klasse statt vollständigem Entfernen — `nav` selbst hat
bereits `aria-label="Hauptnavigation"`, die einzelnen Links aktuell
keines). Alternativen, die dieselbe Ursache beheben, sind ebenfalls
denkbar (z. B. eine kleinere Schrift/kompaktere `min-width` speziell für
den 7-Spalten-Admin-Fall, ein zweizeiliges Nav-Layout, horizontales
Scrollen der Leiste) — welcher Ansatz umgesetzt wird, entscheidet die
Umsetzung.

## Acceptance Criteria

- Bei 390×844 (iPhone 13, Referenz-Mobil-Viewport) bricht kein Label der
  unteren Navigation mehr um — weder als Admin (7 Einträge) noch als
  normales Mitglied (3 Einträge) — und alle Einträge bleiben in einer
  gemeinsamen, gleich hohen Zeile ausgerichtet.
- Falls Labels ausgeblendet werden (Icon-only): jeder Navigationslink
  bleibt für Screenreader/Barrierefreiheit benannt (z. B. `aria-label`
  aus `de.nav.*`), auch ohne sichtbaren Text.
- Die Desktop-Darstellung (`@media (min-width: 900px)` in `Nav.module
  .css:42-68`, seitliche Navigation mit Text) bleibt unverändert.
- `e2e/mobile-layout.spec.ts` bekommt eine zusätzliche Prüfung (oder
  einen neuen Test in derselben Datei) für diesen Fall bei 390×844 als
  ADMIN — analog zum bereits vorhandenen Muster für den TaskCard-Button-
  Umbruch (dieselbe Datei, gleicher Referenz-Viewport).
- Typecheck und Lint bleiben grün; bestehende Nav-Tests (falls
  vorhanden) bleiben grün oder werden angepasst.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: 4 files changed, 138 insertions(+), 12 deletions(-) across Nav.module.css (+33), Nav.tsx (23 changed), e2e/helpers.ts (+37), e2e/mobile-layout.spec.ts (+57 -1) — see Decision Log for detail | verified | 2 | none |
| phase:3 | verification-command | test_result | yes | npm run typecheck: clean. npm run lint: clean. npm run test -w apps/web: 19 files, 110/110 pass. npx playwright test e2e/mobile-layout.spec.ts (real stack, alternate ports 3101/8180 to avoid a port clash with an unrelated local docker-compose stack): 14/14 pass, incl. the new admin (7-item, icon-only) and member (3-item, still labeled) no-wrap checks. Independently re-run outside the build agent's own session, matching its reported results exactly. | verified | 2 | none |
| phase:4 | review-package | review_package | yes | .planning/review-packages/admin-bottom-navigation-einstellungen-bricht-auf-schmalen-handybildschirmen-um-u.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T20:04:55.263Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.

- 2026-09-02T20:18:05.000Z: Implemented an item-count-based icon-only fallback
  instead of the reporter's "always icon-only on mobile" suggestion or a
  smaller-font/tighter-min-width tweak.
  Reason: `Nav.tsx` now computes `compact = visibleItems.length > 4` and adds
  a `.compact` modifier class in `Nav.module.css` that visually hides
  (not `display:none` — a standard clip/1x1px "visually hidden" pattern, so
  the accessible name stays intact) the `<span>` label whenever more than 4
  columns are rendered. At 3 items (regular members) the bar is unaffected —
  labels stay visible, exactly as before, since that case already fit
  comfortably. At 7 items (ADMIN) the bar goes icon-only, which structurally
  eliminates wrapping (no visible text = nothing to wrap) rather than
  depending on a font size or `min-width` that happens to fit today's exact
  label lengths — the fix generalizes to any future admin nav item without
  re-tuning pixel values. A two-row nav or horizontal scroll were considered
  and rejected as more complex for no added benefit at this item count.
  Verified the fix is load-bearing by temporarily stashing it and re-running
  the new e2e test: it failed as expected (heights `48, 48, 48, 53, 48, 48,
  48` — "Einstellungen" wrapping to 2 lines), then passed again once
  restored.

- 2026-09-02T22:20:00Z: Phase 3 (verify) run independently, outside the build
  agent's own session. First attempt with `API_PORT=3101 WEB_PORT=8180` alone
  timed out (`config.webServer` health check never came up) — root cause:
  `apps/api/src/main.ts` listens on `env.PORT` (`apps/api/src/config.ts:13`),
  not `API_PORT`; the latter only feeds Playwright's own health-check URL and
  the web dev server's API proxy target (`apps/web/vite.config.ts:6`). Retried
  with `PORT=3101` also set (child processes inherit shell env, and `--env-file`
  only fills values not already in `process.env`, per the existing comment in
  `playwright.config.ts` about `SWEEP_INTERVAL_SECONDS`) — server came up and
  all 14 e2e tests passed. Noting this here since it isn't documented anywhere
  and would trip up the next person trying to run this suite standalone against
  a non-default port.
  Reason: independent re-verification per Archon protocol step 5, rather than
  trusting the build agent's self-report alone.

- 2026-09-02T22:25:00Z: Package-delivery's Exit Evidence Status column initially
  used "verified" (correct — a PASS_STATUSES value) but the phase:2 evidence
  cell contained literal `|` characters from a raw `git diff --stat` string,
  which broke the markdown table's column parsing and made the row read as
  a failure despite the correct status word. Rewrote the evidence text in
  prose (no literal pipes) instead of pasting raw diff-stat output into a
  table cell. Readiness flipped to `ready` immediately after.
  Reason: same class of bug hit the aktions-button and streak-bonus campaigns
  earlier this session (there for a different reason — "done" not being a
  recognized status word); this is the pipe-character variant of the same
  general lesson: evidence text destined for a markdown table cell needs to
  avoid `|` and other table-breaking characters, not just use a recognized
  status word.

## Active Context

All four phases complete. Local review package generated and readiness
confirmed `ready`.

## Completion Record

- Completed At: 2026-09-02T22:25:00.000Z
- Outcome: local-review-package (not committed, not pushed, no PR opened —
  awaiting the same commit/PR go-ahead pattern as the streak-bonus campaign)
- Review package: .planning/review-packages/admin-bottom-navigation-einstellungen-bricht-auf-schmalen-handybildschirmen-um-u.md
- Verification: npm run typecheck, npm run lint, npm run test -w apps/web
  (110/110), npx playwright test e2e/mobile-layout.spec.ts (14/14) — all
  independently re-run outside the build agent's own session
- Open items for reviewer: (1) the `compact` threshold (`visibleItems.length
  > 4`) is a judgment call with no explicit spec for where "too many columns"
  starts; (2) icon-only for the ADMIN nav is a UX change beyond the literal
  "don't wrap" ask — admins lose visible labels for Einstellungen/Benutzer/
  Aufgaben/Kategorien on phones; worth a quick manual look to confirm the
  icon set alone reads clearly for occasional admin use on a phone.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign complete, awaiting user decision on commit/PR
Files modified: apps/web/src/components/Nav/Nav.tsx, apps/web/src/components/Nav/Nav.module.css, e2e/helpers.ts, e2e/mobile-layout.spec.ts
Blocking: none
