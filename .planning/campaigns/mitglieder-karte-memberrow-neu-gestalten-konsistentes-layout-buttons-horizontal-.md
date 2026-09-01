---
version: 1
id: "e4c8acfc-ea48-46fa-bf65-746ccee3b331"
status: active
started: "2026-09-01T18:59:12.241Z"
completed_at: null
direction: "Mitglieder-Karte (MemberRow) neu gestalten: konsistentes Layout, Buttons horizontal mit Icons"
phase_count: 4
current_phase: 4
branch: "feat/member-row-card-redesign"
worktree_status: null
---

# Campaign: Mitglieder-Karte (MemberRow) neu gestalten: konsistentes Layout, Buttons horizontal mit Icons

Status: active
Started: 2026-09-01T18:59:12.241Z
Direction: Mitglieder-Karte (MemberRow) neu gestalten: konsistentes Layout, Buttons horizontal mit Icons

## Claimed Scope
- apps/web/src/pages/AdminPage/MembersSection.tsx, apps/web/src/pages/AdminPage/AdminPage.module.css, apps/web/src/components/Button/

## Intake Source

- File: .planning/intake/member-row-card-redesign.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Die Mitglieder-Karte in der Mitgliederverwaltung (`MemberRow` in
`MembersSection.tsx`, Layout in `AdminPage.module.css`) wirkt aktuell
inkonsistent und kopflastig:

- Die Rollen-Dropdown (`<select>`) ist deutlich größer/prominenter als die
  Checkbox ("Aktiv") und die Text-/Zahleneingaben daneben, obwohl sie
  inhaltlich gleichrangig sind (`.field select` bekommt dieselbe Padding wie
  `.field input`, wirkt aber durch das native Select-Rendering wuchtiger).
- Die drei Aktions-Buttons ("Speichern", "Einschränkungen", "Passwort
  zurücksetzen" — `.rowActions` in `MemberRow`) sind `size="lg"` und
  brechen auf schmalen Karten/Mobile per `flex-wrap` untereinander um. In
  Summe nehmen sie dadurch mehr als die Hälfte der Kartenfläche ein.

Gewünschtes Ergebnis:

1. Konsistenteres Layout der Eingabefelder (Rollen-Dropdown, Aktiv-Checkbox,
   Zahleneingabe max. Zufallszuweisungen) — vergleichbare visuelle Größe/
   Gewichtung statt einer überdimensionierten Dropdown neben kleinen
   Checkbox-/Text-Elementen.
2. Die drei Buttons werden nebeneinander (horizontal) angeordnet statt
   untereinander zu stapeln, mit deutlich reduziertem Flächenanteil an der
   Karte.
3. Jeder der drei Buttons bekommt zusätzlich zum Label ein passendes Icon
   (Icon + Text), z. B. Speichern/Save-Icon, Einschränkungen/Filter- oder
   Sperr-Icon, Passwort-zurücksetzen/Schlüssel-Icon. Im Projekt existiert
   aktuell keine Icon-Komponente/-Bibliothek — es muss eine leichtgewichtige,
   konsistente Lösung eingeführt werden (z. B. kleine Inline-SVGs analog zu
   den in `split-verwaltung-nav-pages.md` erwähnten Nav-Icons), keine neue
   schwere Icon-Font-Abhängigkeit ohne Rücksprache.

## Acceptance Criteria

- `MemberRow` zeigt Rollen-Dropdown, Aktiv-Checkbox und Zahleneingabe in
  konsistenter visueller Größe/Ausrichtung (kein deutlicher Größensprung
  zwischen Dropdown und den übrigen Feldern).
- Die drei Buttons ("Speichern", "Einschränkungen", "Passwort
  zurücksetzen") stehen nebeneinander in einer Reihe (horizontal), auch auf
  typischen Mobile-Breiten, und beanspruchen sichtbar weniger vertikale
  Fläche der Karte als zuvor.
- Jeder Button zeigt Icon + Label (kein reiner Icon-Button ohne Text).
- Bestehende Funktionalität (Speichern nur bei `dirty`, Öffnen der
  Restrictions-/Reset-Password-Sheets) bleibt unverändert.
- Responsives Verhalten geprüft (schmale Mobile-Breite und Desktop).
- Typecheck, Lint und bestehende Unit-Tests (u.a.
  `MembersSection.test.tsx`) bleiben grün; betroffene Selektoren/Snapshots
  ggf. anpassen.

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
| phase:2 | implementation-diff | file_diff | yes | `apps/web/src/components/Button/Button.tsx` (+`sm` size, +`icon` prop), `apps/web/src/components/Button/Button.module.css` (+`.sm`), `apps/web/src/pages/AdminPage/MembersSection.tsx` (boxed Aktiv-checkbox + balance cells, horizontal icon buttons via `lucide-react`'s `Save`/`Ban`/`KeyRound`), `apps/web/src/pages/AdminPage/AdminPage.module.css` (+`.memberFieldBox`, `.memberActiveBox`, `.rowActions` now flex-row equal-width) | pass | 2 | — |
| phase:3 | verification-command | test_result | yes | `npm run typecheck` clean, `npm run lint` clean, `npm run test` — 465/465 passed (shared 128, api 248, web 89, incl. `MembersSection.test.tsx` unchanged/passing); visually verified against the real dev server (Playwright screenshot, not just unit tests) at desktop width and at 390×844 (the project's own mobile e2e viewport) — role/active/max-assignments/balance cells render as visually equal boxed fields, and the three action buttons sit in one horizontal row with icon+label at both widths | pass | 2 | — |
| phase:4 | review-package | pr_link | yes | https://github.com/brandstaetter/haushaltsauktion/pull/32 | resolved | 2 | review pull request |

## Decision Log

- 2026-09-01T18:59:12.241Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-01T19:05:00Z: The intake note assumed no icon library existed in the project. That was wrong — `lucide-react` (^0.485.0) is already a dependency and already used in `Nav.tsx` (and `Bell`/`Clock`/`X` elsewhere), just never inside the shared `Button` component. Used it instead of inventing an inline-SVG icon set: added an optional `icon?: LucideIcon` prop to `Button` (rendered before the label, `size={18} strokeWidth={1.75}` matching `Nav.tsx`'s existing convention) rather than duplicating icon+label markup per call site.
  Reason: Reusing the existing, already-installed icon library is strictly less risk and less code than introducing a second icon mechanism, and keeps the new buttons visually consistent with the nav icons already on screen.
- 2026-09-01T19:05:00Z: The three action buttons used the default `lg` size, whose CSS forces `width: 100%` — that's what stacked them full-width, not just `flex-wrap` on the container. Fixing `.rowActions` alone wasn't enough; added a new `Button` `size="sm"` (smaller min-height, `--t-body-sm` font instead of `--t-h3`) so three of them plus icons fit in one row without needing a one-off override.
  Reason: `lg`'s forced full width was the actual root cause of "more than half the card," not a symptom the container CSS alone could fix.
- 2026-09-01T19:05:00Z: At 390px width, the global `hyphens: auto` (`global.css`) hyphenates long labels like "Einschränkungen" across 2-3 lines inside their now-narrower button cell. Left as-is rather than disabling hyphenation for buttons: without it, that single unbroken German compound word would overflow its flex cell instead (no natural space to wrap at), which is worse. Confirmed via screenshot that it still reads clearly and doesn't overflow or break the layout.
  Reason: This is the same site-wide hyphenation convention already relied on elsewhere for long German compound words — narrowing the button row just made it visible here, it isn't a new defect.

## Active Context

Implementation, local verification, and visual verification are complete.
PR #32 is open (branched from `main` before PR #31's CI changes were
merged, so only `scan`/CodeQL/Analyze run on it — all pass; this PR carries
no `test`/`e2e` job of its own since `main`'s `deploy.yml` doesn't yet have
the `pull_request` trigger). PR #32 is ready for human review/merge — this
session does not merge it. The campaign stays `active` (not `completed`)
until the PR is actually merged, matching this repo's delivery-campaign
convention.

## Continuation State

Phase: 4 (implementation, verification, and available CI all green; PR open for review)
Sub-step: none pending from this session — next action belongs to the reviewer (merge PR #32)
Files modified: apps/web/src/components/Button/Button.tsx,
  apps/web/src/components/Button/Button.module.css,
  apps/web/src/pages/AdminPage/MembersSection.tsx,
  apps/web/src/pages/AdminPage/AdminPage.module.css
Blocking: none — awaiting PR review/merge (human decision)
