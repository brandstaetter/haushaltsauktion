---
version: 1
id: "2f2c0331-940a-4699-aa01-b7c350e7d983"
status: completed
started: "2026-09-04T11:17:32.604Z"
completed_at: "2026-09-04T13:44:53.000Z"
direction: "Flexiblere Berechtigungen: rollenbasierte Aufgaben-Eligibility und bevorzugte Zuweisung"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Flexiblere Berechtigungen: rollenbasierte Aufgaben-Eligibility und bevorzugte Zuweisung

Status: completed
Started: 2026-09-04T11:17:32.604Z
Direction: Flexiblere Berechtigungen: rollenbasierte Aufgaben-Eligibility und bevorzugte Zuweisung

## Claimed Scope
- apps/api/prisma/schema.prisma, apps/api/src/domain/assignment/eligibility.ts, apps/api/src/app/assignment/candidates.ts, packages/shared/src/domain/enums.ts, apps/api/src/infra/http/routes/admin.ts, apps/web/src/components/TaskMaintenanceCard/

## Intake Source

- File: .planning/intake/task-role-based-eligibility-and-preferred-assignee.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

Das aktuelle Eligibility-Modell (`TaskDefinitionEligibility`, Modi `INCLUDED`/`EXCLUDED`,
ausgewertet in `domain/assignment/eligibility.ts` Regeln 1-5) kennt nur "diese konkrete
Person darf/darf nicht". Es gibt keine rollenbasierte Regel ("nur Admins", "nur normale
Mitglieder") und keine weiche Präferenz ("sollte bevorzugt diese Person bekommen, aber
niemand ist hart ausgeschlossen").

Gewünscht sind zwei neue, unabhängige Ergänzungen zum bestehenden Eligibility-Modell:

1. **Rollenbasierte Berechtigung** — eine Aufgabendefinition kann verlangen "nur Admins"
   oder "nur normale Mitglieder" (`MemberRole.ADMIN`/`MEMBER`, siehe `enums.ts`), zusätzlich
   zu (nicht anstelle von) den bestehenden personenbezogenen INCLUDED/EXCLUDED-Regeln.
   Für Multi-Worker-Aufgaben (siehe laufende Campaign
   `.planning/campaigns/multi-worker-tasks.md`) zusätzlich: "mindestens N der besetzten
   Slots müssen Admins sein" — eine Mindestanzahl, keine feste Zuordnung welcher Slot.

2. **Bevorzugte Zuweisung ("soll idealerweise diese Person bekommen")** — eine weiche
   Präferenz, die weder die freiwillige Übernahme noch die Zufallsvergabe hart einschränkt
   (anders als INCLUDED/EXCLUDED, die harte Regeln 1-5 sind, siehe §6.9). Am ehesten als
   zusätzliches Gewicht in der `WEIGHTED_FAIRNESS`-Strategie (`domain/assignment/weights.ts`)
   denkbar, nicht als Ausschlusskriterium — eine bevorzugte Person, die abwesend oder
   überlastet ist, soll die Aufgabe nicht blockieren.

Beide Ergänzungen sollten, wie alles in diesem Codebase, admin-konfigurierbar pro
Aufgabendefinition sein und über den bestehenden Audit-/Explain-Mechanismus (§32,
`GET /assignments/:id/explain`) nachvollziehbar bleiben — eine rollenbasierte Ablehnung
oder eine wirksame Präferenz sollte im Fairness-Explain genauso sichtbar sein wie die
bestehenden Ausschlussgründe.

## Acceptance Criteria

- Eine Aufgabendefinition kann optional auf eine Rolle beschränkt werden (`ADMIN_ONLY` /
  `MEMBER_ONLY` / kein Filter), ausgewertet als zusätzliche harte Regel neben den
  bestehenden Regeln 1-5 in `hardEligibilityReason` — nicht als Ersatz dafür.
- Für Multi-Worker-Aufgaben (`workerCountMode`/`workerCount`, siehe
  `.planning/architecture-multi-worker-tasks.md`) kann zusätzlich eine
  Mindestanzahl an Admin-Slots konfiguriert werden (z. B. `minAdminSlots: Int?`); die
  Zuweisungslogik (freiwillig und Zufallsvergabe) muss diese Mindestanzahl absichern,
  ohne bereits besetzte Nicht-Admin-Slots nachträglich zu verdrängen.
- Eine "bevorzugte Person" (oder mehrere) kann pro Aufgabendefinition hinterlegt werden;
  sie beeinflusst nur die Gewichtung bei `WEIGHTED_FAIRNESS`, blockiert aber nie eine
  freiwillige Übernahme durch jemand anderen und schließt niemanden von der
  Zufallsvergabe aus.
- Beide neuen Regeln sind serverseitig verbindlich (§36 — keine clientseitig
  vertraute Berechtigungslogik) und im Fairness-Explain (§32) sichtbar, wenn sie
  eine Auswahl beeinflusst haben.
- Admin-Oberfläche (`TaskMaintenanceCard`) erlaubt das Setzen beider Optionen beim
  Anlegen/Bearbeiten einer Aufgabendefinition.
- Bestehende Aufgaben ohne diese neuen Felder verhalten sich unverändert (kein Rollenfilter,
  keine Präferenz — reiner Opt-in).

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
| phase:2 | implementation-diff | file_diff | yes | 28 files changed, 876 insertions(+), 67 deletions(-) across schema/migration, domain (eligibility.ts, weights.ts, strategies.ts, worker-slots.ts), app layer (candidates.ts, volunteerForTask.ts, runAssignmentSweep.ts, taskDto.ts), admin routes, shared config/reasons, and web UI (TaskDefinitionsSection, TaskMaintenanceCard, AssignmentExplanation) | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test: shared 144/144, api 360/360, web 132/132 all passing; npm run typecheck clean; npm run lint clean | verified | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T11:17:32.604Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04T13:44:53.000Z: Implemented, verified, and packaged in one session.
  Both additions land as new *hard* rules alongside 1-5 in
  `hardEligibilityReason` (`ROLE_NOT_ELIGIBLE`, `ADMIN_SLOT_RESERVED`), never
  as relaxable soft rules — so they gate volunteering too, per the acceptance
  criteria. `minAdminSlots` reservation is deliberately conservative: a new
  pure helper (`worker-slots.ts` `adminSlotReservationActive`) only forces
  admin-only once every remaining slot is needed to close the deficit
  (`deficit >= remainingToMin`), recomputed fresh before *each* fill attempt
  in both `volunteerForTask.ts` and `runAssignmentSweep.ts`'s fill loop — this
  is what guarantees an already-filled non-admin slot is never retroactively
  evicted, satisfying that specific acceptance-criteria clause by
  construction rather than by a special case. Preferred assignee is a new
  `preferredTerm` in `weights.ts`, scoped to `WEIGHTED_FAIRNESS` only (per the
  brief's explicit direction) via a new `fairness.preferredAssigneeWeight`
  config value (default 1) — `WEIGHTED_RANDOM` and the other strategies are
  untouched. Preferred assignees live in their own new table
  (`TaskDefinitionPreferredAssignee`), not a third `EligibilityMode`: a member
  can be both included/excluded (hard) and preferred (soft) simultaneously,
  which one shared `mode` column could not represent. `/explain` needed no
  DTO changes — `weightTerms` is already a generic `Record<string, number>`
  and `exclusionReason` a generic `EligibilityReason`, so both new reason
  codes and the new weight term flow through untouched; only the frontend's
  German label maps needed the two new entries (TypeScript enforces this at
  compile time via `AssignmentExplanation.tsx`'s indexed lookup, since
  `EligibilityReason` gained members `de.fairness.reasons` doesn't have yet).
  Added a 5-test integration suite plus unit tests for the new domain
  functions/hard rules and 6 new frontend tests. Full suite (636 tests) +
  typecheck + lint pass. One local-environment note: `apps/web`'s typecheck
  resolves `@haushaltsauktion/shared` via its compiled `dist/` (package.json
  `exports`), not source — editing `packages/shared/src` requires
  `npm run build -w packages/shared` before apps/web's typecheck reflects it
  (CI's `npm ci` triggers this automatically via the shared package's
  `prepare` script; a long local session editing shared repeatedly does not
  re-trigger it).

## Active Context

All 4 phases complete. Implementation, verification, and local review package
done. No PR was created yet — ready for the user to review the diff and
decide on commit/PR.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign finished, awaiting user decision on commit
Files modified: apps/api/prisma/schema.prisma + migration,
apps/api/src/domain/assignment/{eligibility,weights,strategies}.ts,
apps/api/src/domain/task/worker-slots.ts,
apps/api/src/app/assignment/{candidates,runAssignmentSweep}.ts,
apps/api/src/app/tasks/volunteerForTask.ts,
apps/api/src/app/queries/taskDto.ts,
apps/api/src/infra/http/routes/admin.ts,
apps/api/src/simulation/simulate.ts,
packages/shared/src/{domain/reasons,config/types,config/defaults,config/schema}.ts,
apps/web/src/api/{hooks,types}.ts,
apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx,
apps/web/src/components/{TaskMaintenanceCard,AssignmentExplanation}/*.tsx,
apps/web/src/strings/de.ts, plus test files for each.
Blocking: none
