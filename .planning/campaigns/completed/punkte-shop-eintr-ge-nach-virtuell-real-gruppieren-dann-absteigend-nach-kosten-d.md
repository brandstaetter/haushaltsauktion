---
version: 1
id: "5304d9c8-a233-4306-a4d2-3512e680830c"
status: completed
started: "2026-09-04T10:30:39.400Z"
completed_at: "2026-09-04T12:33:17.000Z"
direction: "Punkte-Shop: Einträge nach virtuell/real gruppieren, dann absteigend nach Kosten, dann alphabetisch"
phase_count: 4
current_phase: 4
branch: null
worktree_status: null
---

# Campaign: Punkte-Shop: Einträge nach virtuell/real gruppieren, dann absteigend nach Kosten, dann alphabetisch

Status: completed
Started: 2026-09-04T10:30:39.400Z
Direction: Punkte-Shop: Einträge nach virtuell/real gruppieren, dann absteigend nach Kosten, dann alphabetisch

## Claimed Scope
- apps/api/src/infra/http/routes/rewards.ts

## Intake Source

- File: .planning/intake/rewards-shop-sort-by-kind-then-cost-then-title.md
- Priority: normal
- Initial Status: pending

## Delivery Brief

`GET /rewards` (`apps/api/src/infra/http/routes/rewards.ts:28-30`) sortiert die
Katalogeinträge aktuell mit einem einzelnen `orderBy: { cost: 'asc' }` — flach
aufsteigend nach Preis, ohne Gruppierung nach Art und ohne Tiebreak bei gleichem
Preis. Das Frontend (`RewardsShopPage.tsx`) übernimmt einfach die vom Server
gelieferte Reihenfolge, es gibt dort keine eigene Sortierlogik.

Gewünscht:

1. Gruppierung nach `RewardDefinition.kind` (`MANUAL_FULFILLMENT` = reale Belohnung,
   `VIRTUAL_EFFECT` = virtuelles Gamification-Item, siehe `enums.ts`/`RewardKind`) —
   **virtuelle Items zuerst, reale Belohnungen danach.**
2. Innerhalb jeder Gruppe absteigend nach `cost` sortiert (aktuell aufsteigend).
3. Bei gleichem `cost` innerhalb einer Gruppe alphabetisch nach `title`.

## Acceptance Criteria

- `GET /rewards` liefert die Einträge in der Reihenfolge: `VIRTUAL_EFFECT`-Gruppe
  vor `MANUAL_FULFILLMENT`-Gruppe → `cost` absteigend → `title` alphabetisch
  aufsteigend als Tiebreak.
- Umsetzbar als reine Änderung der Prisma-`orderBy`-Klausel (mehrere Sortierschlüssel
  in Folge, z. B. `[{ kind: 'desc' }, { cost: 'desc' }, { title: 'asc' }]`).
  Achtung bei der Umsetzung: Postgres/Prisma sortieren einen Enum standardmäßig nach
  seiner **Deklarationsreihenfolge** in `schema.prisma`, nicht alphabetisch — `enum
  RewardKind { MANUAL_FULFILLMENT VIRTUAL_EFFECT }` deklariert `MANUAL_FULFILLMENT`
  zuerst, also ergibt `kind: 'desc'` tatsächlich `VIRTUAL_EFFECT` zuerst (nicht
  verlassen auf einen alphabetischen Zufallstreffer). Bei der Implementierung mit
  einem kleinen Testfall verifizieren, nicht nur aus der Deklarationsreihenfolge
  ableiten. Keine Frontend-Änderung nötig, da `RewardsShopPage` die
  Server-Reihenfolge bereits unverändert übernimmt.
- Die Admin-Liste (`AdminRewardsPage`/`RewardsSection.tsx`) ist von dieser Änderung
  bewusst NICHT betroffen, sofern sie eine eigene Sortierung hat — hier nur den
  mitgliederseitigen Shop-Endpunkt (`GET /rewards`) anpassen. Falls die Admin-Liste
  denselben Endpunkt oder dieselbe Query wiederverwendet, entsprechend mitprüfen.
- Bestehende Tests für `GET /rewards` (falls vorhanden, z. B. in
  `apps/api/test/integration/reward-shop.test.ts` oder
  `apps/api/test/integration/virtual-effects.test.ts`) werden um eine Prüfung der
  neuen Sortierreihenfolge ergänzt (mehrere Einträge je Gruppe, inkl. Tiebreak-Fall
  mit identischen Kosten).

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
| phase:2 | implementation-diff | file_diff | yes | apps/api/src/infra/http/routes/rewards.ts (+3/-1), apps/api/test/integration/reward-shop.test.ts (+55) | verified | 2 | implement requested change |
| phase:3 | verification-command | test_result | yes | npm run test: shared 144/144, api 343/343, web 128/128 all passing; npm run typecheck clean | verified | 2 | fix verification failures |
| phase:4 | review-package | review_package | yes | .planning/review-packages/punkte-shop-eintr-ge-nach-virtuell-real-gruppieren-dann-absteigend-nach-kosten-d.md | resolved | 2 | review local handoff package |

## Decision Log

- 2026-09-04T10:30:39.400Z: Created delivery campaign from intake preflight.
  Reason: Convert intake into an evidence-backed delivery loop before implementation.
- 2026-09-04T12:33:17.000Z: Implemented, verified, and packaged in one session.
  Changed `orderBy` in `GET /rewards` from `{ cost: 'asc' }` to
  `[{ kind: 'desc' }, { cost: 'desc' }, { title: 'asc' }]`. Confirmed via
  `schema.prisma` enum declaration order (`MANUAL_FULFILLMENT` then
  `VIRTUAL_EFFECT`) that `kind: 'desc'` puts virtual items first, matching the
  acceptance criteria — did not rely on assumption alone, added a dedicated
  ordering test (`reward-shop.test.ts`) with a same-cost tiebreak case to prove
  it. `/admin/rewards` confirmed untouched (own `orderBy: { title: 'asc' }`).
  Full suite (615 tests) and typecheck pass.

## Active Context

All 4 phases complete. Implementation, verification, and local review package
done. No PR was created — this is a small, single-file backend change; ready
for the user to review the diff and decide on commit/PR.

## Continuation State

Phase: 4 (complete)
Sub-step: campaign finished, awaiting user decision on commit
Files modified: apps/api/src/infra/http/routes/rewards.ts,
apps/api/test/integration/reward-shop.test.ts
Blocking: none
