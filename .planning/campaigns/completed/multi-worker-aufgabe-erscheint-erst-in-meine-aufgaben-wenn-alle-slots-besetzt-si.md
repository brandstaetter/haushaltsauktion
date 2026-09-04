---
version: 1
id: "45c87eb7-de3e-4aad-81e8-96ef0c015c3a"
status: completed
started: "2026-09-04T20:22:23.436Z"
completed_at: null
direction: "Multi-Worker-Aufgabe erscheint erst in „Meine Aufgaben“, wenn alle Slots besetzt sind — nicht sobald der Viewer selbst einen Slot hält"
phase_count: 4
current_phase: 2
branch: null
worktree_status: null
---

# Campaign: Multi-Worker-Aufgabe erscheint erst in „Meine Aufgaben“, wenn alle Slots besetzt sind — nicht sobald der Viewer selbst einen Slot hält

Status: completed
Started: 2026-09-04T20:22:23.436Z
Direction: Multi-Worker-Aufgabe erscheint erst in „Meine Aufgaben“, wenn alle Slots besetzt sind — nicht sobald der Viewer selbst einen Slot hält

## Claimed Scope
- apps/api/src/app/queries/taskDto.ts, apps/web/src/pages/TaskListPage/TaskListPage.tsx

## Intake Source

- File: .planning/intake/multi-worker-task-not-in-my-tasks-until-fully-staffed.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Reproduziert an einer Aufgabe mit `workerCountMode: EXACTLY`, `workerCount: 2`
("2 benötigte Helfer"): Nutzer übernimmt freiwillig einen der beiden Slots.
Danach:

- Die Aufgabe steht weiterhin unter „Verfügbar“ (`/aufgaben`, Tab
  `available`) — **mit** dem „Erledigen“-Button statt „Freiwillig
  übernehmen“.
- Sie taucht auch in „Alle Aufgaben“ auf (dort erwartungsgemäß ohne CTA,
  siehe `renderHouseholdItems` in `TaskListPage.tsx`).
- Sie erscheint **nicht** unter „Meine Aufgaben“ (Tab `mine`) — erst sobald
  der zweite Slot ebenfalls besetzt ist, wechselt sie dorthin.

**Ursache**: `volunteerForTask.ts` (Zeile 240-243) setzt `TaskInstance.status`
für einen `JOIN` nur dann von `AVAILABLE` auf `ASSIGNED`, wenn dieser Beitritt
tatsächlich `minRequired` erreicht (`!outcome.isBelowMin`). Bei
`EXACTLY(2)` bleibt der Status nach dem ersten Beitritt also `AVAILABLE` —
korrekt, denn die Aufgabe braucht noch einen zweiten Freiwilligen.

`listAssignedToMe()` (`apps/api/src/app/queries/taskDto.ts:363-377`,
`GET /tasks/assigned-to-me`) filtert aber hart auf `status: 'ASSIGNED'`
**zusätzlich** zur eigentlich richtigen Bedingung
`assignments: { some: { status: 'ACTIVE', memberId: ctx.memberId } }`:

```ts
where: {
  householdId: ctx.householdId,
  status: 'ASSIGNED',
  assignments: { some: { status: 'ACTIVE', memberId: ctx.memberId } },
},
```

Solange die Instanz noch `AVAILABLE` ist (min noch nicht erreicht), matcht
diese Query nicht — obwohl der Viewer bereits eine `ACTIVE`-Zuweisung hält.
Das ist exakt dieselbe Bugklasse wie das bereits behobene Intake-Item
"multi-worker-task-vanishes-from-available-list-after-first-volunteer": dort
filterte `listAvailableTasks()` hart auf `status: 'AVAILABLE'` und musste um
`ASSIGNED`-mit-freiem-Slot erweitert werden
(`apps/api/src/app/queries/taskDto.ts:337-354`). Die Spiegel-Query
`listAssignedToMe()` hat dieselbe Behandlung nie bekommen — der Kommentar bei
Zeile 381-384 ("Multi-worker-tasks Phase 3") beschreibt zwar, dass `mine`
jetzt korrekt per `memberId` statt `assignments[0]` gesucht wird, aber der
`where`-Filter selbst (`status: 'ASSIGNED'`) wurde dabei nicht angepasst.

Zusätzlich zum reinen Sichtbarkeits-Bug ist auch die UX in der Zwischenzeit
verwirrend: Solange die Aufgabe (mangels korrektem `assigned-to-me`-Eintrag)
nur unter „Verfügbar“ erreichbar ist, mischt dieser Tab für den Viewer zwei
unterschiedliche Rollen im selben Kartenstapel — „hier kann ich noch
beitreten“ und „hier bin ich schon dabei, kann aber nur noch erledigen“
(`TaskCard.tsx` Zeile 53-54, `isHeld` schaltet Label und Aktion um) — ohne
dass der Tabname („Verfügbar“) das für den zweiten Fall ankündigt.

`EXACTLY(1)`-Aufgaben (der Normalfall) sind nicht betroffen: `min === max ===
1`, also crosst der erste (und einzige) Beitritt `minRequired` immer sofort,
und der Status wird sofort `ASSIGNED`.

## Acceptance Criteria

- Sobald ein Mitglied eine `ACTIVE`-Zuweisung auf einer `TaskInstance` hält,
  erscheint diese Instanz unter „Meine Aufgaben“ — unabhängig davon, ob
  `TaskInstance.status` bereits `ASSIGNED` ist oder (bei `EXACTLY`/`AT_LEAST`
  unterhalb `minRequired`) noch `AVAILABLE`. `listAssignedToMe()`s
  `where`-Filter muss dafür allein auf die `assignments`-Bedingung abstellen,
  nicht zusätzlich auf `TaskInstance.status`.
- Solange eine Multi-Worker-Aufgabe noch offene Slots für **andere** Personen
  hat, bleibt sie weiterhin zusätzlich unter „Verfügbar“ sichtbar (damit sich
  weitere Freiwillige melden können) — dieses bereits behobene Verhalten aus
  "multi-worker-task-vanishes-from-available-list-after-first-volunteer"
  darf durch diese Änderung nicht regressieren.
- Zu entscheiden im Briefing, ob die „Verfügbar“-Karte für eine Instanz, bei
  der der Viewer selbst schon einen Slot hält, weiterhin dort auftaucht (jetzt
  redundant zu „Meine Aufgaben“) oder ab dann aus „Verfügbar“ verschwinden
  soll, weil der Viewer für sich selbst nichts mehr zu „übernehmen“ hat — in
  beiden Fällen darf die Sichtbarkeit für die *übrigen* Mitglieder (Slot noch
  offen) unverändert bleiben.
- `EXACTLY(1)`-Aufgaben (heutiger Normalfall) verhalten sich unverändert.
- Serverseitig verbindlich (§36): keine neue clientseitige Filterlogik nötig
  — der Fix gehört in die Leseabfrage, nicht ins Frontend.

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
| phase:2 | implementation-diff | file_diff | yes | git diff --stat: taskDto.ts 15 insertions/2 deletions + new 256-line integration test file | pass | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test --workspaces: 144+373+152 tests passed, 0 failed (api +2 for the new test file) | pass | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T20:22:23.436Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04: Fixed only `listAssignedToMe`'s `where` filter
  (`status: 'ASSIGNED'` → `status: { in: ['AVAILABLE', 'ASSIGNED'] }`,
  mirroring `listAvailableTasks`'s already-established pattern immediately
  below it in the same file) — no `TaskListPage.tsx` change, even though it
  was in the claimed scope.
  Reason: `TaskListPage.tsx`'s "mine" tab already renders directly from
  whatever `listAssignedToMe` returns (`renderOwnItems`) — once the query
  returns the right rows, the tab is correct with zero frontend changes.
  The acceptance criteria's third bullet (whether to also *hide* the
  now-redundant "Verfügbar" card for an instance the viewer already joined)
  was explicitly left "to decide in the brief." Decided against it: removing
  it would need `listAvailableTasks` to start excluding
  `viewerHasActiveSlot: true` rows, which isn't required by the bug report
  (both tabs simply showing the same still-recruiting task is redundant, not
  wrong) and would expand blast radius into a query several other read paths
  share (`/tasks/board`, dashboard `openTasks`) for a cosmetic improvement,
  not the reported defect. The AC's second bullet — visibility for *other*
  members while a slot stays open — was the hard requirement, and it is
  unaffected by leaving `listAvailableTasks` alone.

## Active Context

Phase 2 (build) and Phase 3 (verify) complete. `listAssignedToMe()` in
`apps/api/src/app/queries/taskDto.ts` now matches on
`status: { in: ['AVAILABLE', 'ASSIGNED'] }` instead of `status: 'ASSIGNED'`,
symmetric with `listAvailableTasks`'s existing fix a few lines below. New
integration test `apps/api/test/integration/multi-worker-assigned-to-me.test.ts`
(mirrors `multi-worker-available-list.test.ts`'s structure) locks in: an
`EXACTLY(2)` instance's first volunteer sees it under `/tasks/assigned-to-me`
immediately (while the instance is still `AVAILABLE` and recruiting a second
worker), a non-joined member does not, it remains reachable under
`/tasks/available` for the still-open slot, and once fully staffed both
holders see it under assigned-to-me with `status: ASSIGNED`. A second test
confirms `EXACTLY(1)` (today's default) is unaffected. Full workspace test
suite passes (144+373+152 — api count is +2 for the new file; the web count
differs from the audit-log PR's branch because that work lives on an
unmerged branch, not a regression). Typecheck and lint clean. Next action:
Phase 4, package for review.

## Continuation State

Phase: 4
Sub-step: implementation and verification done, packaging not started
Files modified: apps/api/src/app/queries/taskDto.ts, apps/api/test/integration/multi-worker-assigned-to-me.test.ts
Blocking: none

## Completion Record

- Completed At: 2026-09-04T20:25:41.075Z
- Outcome: review-package
- Verification: npm run test --workspaces: 144+373+152 tests passed
- Note: Fixed listAssignedToMe's where filter to include AVAILABLE (not just ASSIGNED) so a multi-worker task's first volunteer sees it under Meine Aufgaben immediately, mirroring listAvailableTasks's existing fix. New integration test locks in EXACTLY(2) and EXACTLY(1) behavior.
