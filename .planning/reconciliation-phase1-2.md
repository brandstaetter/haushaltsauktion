# Reconciliation — Architecture ↔ UX (Phases 1 & 2)

Main agent, 2026-08-30. Both design documents are accepted. This file records
where they disagreed, who won, and the rulings on the architecture's eight open
questions. It is normative: where this file and either document differ, this
file wins.

---

## 1. Where the two documents collided

**1.1 Buyout quote staleness — architecture wins.**
UX §11.4 asked for a server-issued opaque `quoteToken` plus `409 QUOTE_STALE`.
Architecture §3.5 instead requires the client to echo `acceptedCost` and
`acceptedNewValue` — the exact numbers it displayed — and the server recomputes
both from the pinned config and rejects with `409 QUOTE_STALE` (carrying the
fresh quote) on any mismatch.

The echo design is better and is adopted. It gives the same informed-consent
guarantee with no server-side quote storage, no token lifetime, and nothing to
garbage-collect. It does not trust the client: the submitted numbers are only
ever *compared*, never used in the computation. The frontend adapts — the sheet
holds the two numbers it rendered and submits them; on `409 QUOTE_STALE` it swaps
in the fresh quote and requires a new tap, exactly as UX §4.6 already specified.

**1.2 Endpoint naming — architecture wins.**
UX §11.5 asked for `GET /api/assignments/:id/explanation`; architecture defines
`GET /api/assignments/:id/explain`. Same payload, same enum-reason requirement.
Frontend uses `/explain`.

**1.3 Two endpoints the architecture is missing — UX wins, add them.**
Both were requested after the Architecture Agent had started, so their absence is
a sequencing artefact, not a rejection. Both are required:

- **`GET /api/config/public`** — the member-readable subset of configuration:
  `voluntary.rewardTiming`, `voluntary.rewardEnabled`, `buyout.enabled`,
  `buyout.allowNegativeBalance`, `assignment.strategy`, a `valueIncrease`
  summary, and whether decay is on. Rationale: §31 forbids hidden rules. Copy
  that hard-codes "du bekommst die Punkte nach Erledigung" while an admin has set
  `ON_ACCEPT` *is* a hidden rule. Must expose no admin-only field, and must be
  derived from the same config object the server computes with — not a
  hand-maintained parallel list.
- **`POST /api/admin/config/preview`** — ADMIN. Dry-run evaluation of a proposed
  config patch. Returns worked examples (the escalation chain for a sample task,
  a sample buyout cost, a decay projection) plus formula parse errors with a
  character offset. Rationale: this is what makes the admin live preview possible
  without ever evaluating a formula in the browser, which §17 and §36 both
  forbid. Writes nothing; shares the validation path with `PUT /admin/config`.

**1.4 Accepted from UX §11 without conflict:** `GET /api/dashboard` (already
present), a stable machine-readable `code` on every 4xx (architecture §3.13
already delivers this), and `TaskHistoryEvent` as a discriminated union with
typed payloads rather than pre-rendered sentences (architecture §2.6 already
delivers this, and it is what lets the German wording live in the UX copy deck).

---

## 2. Rulings on the architecture's eight open questions

All eight recommendations are accepted. Reasoning recorded so they are not
reopened in a later session.

| OQ | Ruling | Why |
|---|---|---|
| 1 | Accept `TaskDefinition.carriedValue` | §11 offers `KEEP_CURRENT` and `DECREASE_PERCENTAGE`; without carry-over both are no-ops. Shipping config options that silently do nothing is worse than the one nullable column. Default `BASE_VALUE` leaves it permanently null. |
| 2 | Accept: no automatic expiry penalty in the MVP | See §3 below — this one has a real consequence and is flagged, not buried. |
| 3 | Accept: acceptance is assignment-level, not an instance state | Adding an `ACCEPTED` instance state costs 11 legality-matrix rows to encode a distinction nothing queries. |
| 4 | Accept clamped offer window, `leadMinutesBeforeDue` default 0 | At the default this is exactly the spec's implicit behaviour. A `MANUAL`/`ONCE` task with no due date never expiring is correct — an ad-hoc chore should stay open until done. |
| 5 | Accept `maxOpenInstancesPerDefinition`, default 1 | Two identical cards at different values makes "the value of this chore" ambiguous, which undermines §33's Market Value and confuses §19's phone-first dashboard. |
| 6 | Accept ISO week in household timezone | "One buyout left this week" is only meaningful if the week visibly resets. A rolling 7-day window cannot state when the limit lifts. |
| 7 | Accept `fairness.windowDays`, default 28 | Lifetime counts make the system unresponsive within months. The instruction that §34's simulation sweep 7/28/90 and report distribution spread is adopted — it turns the default into a measured choice rather than a guess. |
| 8 | Accept `409 BUYOUT_AT_VALUE_CAP` | Charging points without raising the value would break a §44 invariant silently. Default `maximumValue: null` means this never fires unless an admin opts in. |

---

## 3. Flagged for the user — the one economic hole

**OQ-2 leaves a free exit.** A member who is randomly assigned a chore can simply
ignore it until the instance expires, and pay nothing. That is cheaper than the
buyout the whole economy is built around, so a rational actor never buys out —
they wait.

The Architecture Agent's reasoning for deferring is sound and I have accepted it:
automatic punishment for a missed chore is a family-dynamics decision rather than
an architectural one, and §31 forbids dark patterns. The MVP therefore expires
the assignment with no charge, and `PENALTY` remains an admin-manual transaction
type.

What keeps this honest in the meantime: every expiry is written to the history
and the audit log, so ignoring a chore is *visible* to the household even though
it is not automatically priced. Social consequence replaces the mechanical one.

The hooks are in place to close it later without a migration —
`assignment.expiryPenalty` slots into the existing config model and
`PointTransactionType.PENALTY` already exists. Worth revisiting once real usage
shows whether waiting-it-out is actually being exploited.

---

## 4. Consequences for the build

- Phase 5 adds `GET /api/config/public` and `POST /api/admin/config/preview`.
- Phase 6 uses `/explain`, not `/explanation`, and implements the echo-confirm
  buyout rather than a token.
- Phase 4 adds `TaskDefinition.carriedValue`, `fairness.windowDays`,
  `assignment.leadMinutesBeforeDue`, and `tasks.maxOpenInstancesPerDefinition`
  to the config schema and defaults.
- Phase 7's simulation sweeps `fairness.windowDays` over 7 / 28 / 90 and reports
  the distribution spread for each.
