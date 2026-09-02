---
version: 1
id: "14d44211-92f7-44d3-9103-f52888b2e8bb"
status: completed
started: "2026-09-02T05:44:16.018Z"
completed_at: null
direction: "Floating Toast, Filter und Floating-Add-Button auch für Kategorien und Benutzer"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Floating Toast, Filter und Floating-Add-Button auch für Kategorien und Benutzer

Status: completed
Started: 2026-09-02T05:44:16.018Z
Direction: Floating Toast, Filter und Floating-Add-Button auch für Kategorien und Benutzer

## Claimed Scope
- apps/web/src/pages/AdminPage/CategoriesSection.tsx, apps/web/src/pages/AdminPage/MembersSection.tsx

## Intake Source

- File: .planning/intake/admin-categories-members-fab-toast-filter.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`f54585c` (`fix: floating toast, filter box, and floating add button on admin
Aufgaben page`) hat drei UX-Verbesserungen auf `TaskDefinitionsSection.tsx`
angewendet: den wiederverwendbaren `Toast`-Component (fixed-position,
auto-dismiss nach 5s, dismissible) statt einer inline scrollenden
Erfolgs-/Fehlermeldung, ein Filter-Eingabefeld über der Liste mit eigenem
"keine Treffer"-Leerzustand, und einen fixed Floating Action Button
(`styles.fab`, unten rechts, über der Bottom-Nav) statt eines Buttons am
Ende der Liste.

`CategoriesSection.tsx` und `MembersSection.tsx` (beide unter
`Verwaltung > Kategorien` bzw. `Verwaltung > Benutzer`, siehe
`AdminCategoriesPage.tsx` / `AdminMembersPage.tsx`) haben dieselben drei
Lücken noch nicht geschlossen:

- Beide zeigen `message` weiterhin als inline `<div className={styles.message} role="status">`
  am Seitenanfang statt über `<Toast message={message} onDismiss={...} />`
  (der Component existiert bereits unter `apps/web/src/components/Toast/Toast.tsx`
  und wird in `AdminTasksPage.tsx`/`TaskDefinitionsSection.tsx` bereits so verwendet).
- Beide haben keinerlei Filter-Eingabefeld — bei wachsender Mitglieder- oder
  Kategorienliste gibt es keine Möglichkeit, sie einzugrenzen.
- Beide rendern den "Hinzufügen"-Button (`de.admin.categories.addButton` /
  `de.admin.members.addButton`) als normalen `<Button variant="secondary">`
  unterhalb der Liste statt als fixed `.fab`-Button mit `Plus`-Icon
  (`lucide-react`) analog zu `TaskDefinitionsSection.tsx`. Die `.fab`-CSS-Klasse
  ist bereits gemeinsam in `AdminPage.module.css` definiert — es muss nichts
  Neues gestylt werden, nur die JSX-Struktur angepasst werden.

## Acceptance Criteria

- `CategoriesSection` und `MembersSection` verwenden `Toast` statt der
  inline `message`-`<div>` für Erfolgs-/Fehlermeldungen auf Sektionsebene.
- Beide Sektionen haben ein Filter-Eingabefeld (analog `filterLabel` /
  `filterPlaceholder` / `filterEmpty` in `de.admin.taskDefinitions`) — für
  Kategorien mind. nach Name, für Benutzer mind. nach Anzeigename/E-Mail —
  mit eigenem "keine Treffer"-Leerzustand getrennt vom "keine Einträge
  vorhanden"-Leerzustand.
- Der "Hinzufügen"-Button beider Sektionen ist ein fixed `.fab`-Button
  (`Plus`-Icon, `aria-label` aus dem bestehenden `addButton`-String) statt
  eines Inline-Buttons am Listenende.
- Neue i18n-Strings folgen dem bestehenden Muster in `de.ts` unter
  `admin.categories.*` bzw. `admin.members.*`.
- Bestehende Tests für `CategoriesSection`/`MembersSection` (falls vorhanden)
  bleiben grün bzw. werden auf die neue Struktur angepasst; Typecheck und
  Lint bleiben grün.

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
| phase:2 | implementation-diff | file_diff | yes | `git diff --stat` (cumulative with the prior drag-and-drop campaign, both uncommitted on the working tree): 8 files changed, 430 insertions(+), 82 deletions(-) — MembersSection.tsx/.test.tsx are new to this campaign; CategoriesSection.tsx/.test.tsx, AdminPage.module.css, hooks.ts (`filterLabel`/`filterPlaceholder`/`filterEmpty` unaffected — reused existing hooks), de.ts carry this campaign's changes on top of the prior one's | resolved | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | `npm run typecheck --workspace apps/web`: clean. `vitest run` (apps/web): 17 files, 103 tests passed (100 prior + 3 new: 2 in CategoriesSection.test.tsx for filter/FAB, 1 in MembersSection.test.tsx for filter). `eslint src` (apps/web): clean. `npm run build --workspace apps/web`: succeeded. Manually verified in a running dev instance (Chrome via claude-in-chrome) on both `/verwaltung/kategorien` and `/verwaltung/benutzer`: filter narrows the list and shows the dedicated "keine Treffer" empty state, the FAB replaces the inline add button, the drag handle dims and disables while a filter is active (Kategorien only), and saving a row shows the floating auto-dismissing Toast instead of an inline banner — then reverted the one row edited for the check. | resolved | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/floating-toast-filter-und-floating-add-button-auch-f-r-kategorien-und-benutzer.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-02T05:44:16.018Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-02T08:00:00.000Z: Unified `CategoriesSection`'s two separate
  section-level message states (`message` for success, `reorderError` from
  the prior drag-and-drop campaign) into one `toast: {text, variant} | null`
  state feeding the single `<Toast>`. Reason: `Toast` only renders one
  message at a time, and the reorder failure is a section-level error by
  the same definition the intake brief uses for the success messages, so it
  belongs in the same component instead of staying an inline `role="alert"`
  survivor.
- 2026-09-02T08:00:00.000Z: Drag-and-drop reordering is disabled (via
  `useSortable({ disabled })`, not hidden) whenever the categories filter is
  non-empty. Reason: dnd-kit's active/over indices during a drag are
  positions within whatever list is actually rendered — filtered, they no
  longer correspond to the real `sortOrder` range `computeReorder` needs,
  so allowing a drag under a filter would silently reorder the wrong
  categories. Disabling (dimmed handle, `aria-disabled`) rather than hiding
  keeps the row's other actions (save/delete) unaffected.
- 2026-09-02T08:00:00.000Z: `MembersSection`'s filter matches on
  `displayName` OR `user.email` per the acceptance criteria's "mind. nach
  Anzeigename/E-Mail"; `CategoriesSection`'s matches on `name` only (no
  second field exists on `CategoryDto` worth matching).

## Active Context

All four phases complete. Implementation, tests, build, lint, and a manual
browser walkthrough of both admin sections (filter narrowing, empty state,
FAB, Toast, and — Kategorien only — drag-disable-while-filtered) all
verified against the acceptance criteria. Review package written.

## Continuation State

Phase: 4 (complete)
Sub-step: none — ready to close out
Files modified: apps/web/src/pages/AdminPage/CategoriesSection.tsx,
CategoriesSection.test.tsx, MembersSection.tsx, MembersSection.test.tsx,
AdminPage.module.css; apps/web/src/strings/de.ts
Blocking: none

## Completion Record

- Completed At: 2026-09-02T05:53:32.037Z
- Outcome: review-package
- Verification: npm run typecheck --workspace apps/web clean; eslint src clean; vitest run (apps/web) 17 files/103 tests passed; npm run build --workspace apps/web succeeded; manual browser verification of filter/FAB/Toast on both Kategorien and Benutzer admin pages
- Note: CategoriesSection and MembersSection now use Toast, a filter input, and a FAB add button matching TaskDefinitionsSection's established pattern; drag-and-drop reorder is disabled while a categories filter is active
