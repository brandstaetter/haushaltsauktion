# PRD — Haushaltsauktion (Household Chore Auction)

Status: awaiting approval
Source of truth: `CLAUDE.md` (45-section German specification)
Created: 2026-08-30

This PRD does not restate `CLAUDE.md`. It records the decisions the spec
deliberately left open, resolves the ambiguities found while reading it, and
defines machine-verifiable end conditions for the campaign.

---

## 1. Product in one line

A mobile-first web app that distributes household chores fairly by making
voluntary work the only way to earn points, randomly assigning the leftovers,
and letting people buy their way out at a price that makes the chore more
attractive to everyone else.

The economic loop is the product. Everything else serves it.

---

## 2. Stack decisions (spec left these open)

| Area | Decision | Why |
|---|---|---|
| Backend framework | **Fastify** | Spec picked TS/Node but no framework. Fastify has first-class TS types, built-in schema validation (serves §36 server-side validation), and native rate limiting (§36). Express needs several plugins for the same. |
| ORM / migrations | **Prisma** | §37 requires real migrations. Prisma's migration story is the strongest in TS, and its generated types serve §37 "vollständig typisiert". Its interactive transaction API supports §28 atomicity. |
| Frontend build | **Vite SPA** (React + TS) | Backend is a separate API, so Next.js SSR earns nothing here and doubles the deploy surface. §30 lists Vite as acceptable. PWA via `vite-plugin-pwa` (§24). |
| Repo layout | **npm workspaces monolith** — `apps/api`, `apps/web`, `packages/shared` | §30 "modularer Monolith, keine Microservices". The shared package carries domain types and the value/cost formulas so client and server cannot drift. |
| Auth | **httpOnly cookie sessions**, argon2id hashing | §25 + §36. Cookie sessions avoid client-stored tokens entirely; CSRF handled by SameSite=Lax plus a double-submit token on mutations. |
| Formula evaluation | **Hand-rolled arithmetic AST evaluator** — whitelist `+ - * / ceil floor round min max`, variables `currentValue`, `baseValue`, `buyoutCount` | §17 forbids eval(). A dependency-free parser of roughly 120 lines is auditable; a general expression library is a larger attack surface than this feature deserves. |
| Scheduling | **`POST /api/admin/assignments/run` plus an in-process interval worker** | §6 needs offer expiry. A cron dependency is overkill at 1–20 members (§43). The endpoint makes it testable; the worker makes it automatic. |
| Tests | **Vitest** (unit + integration against a real Postgres), **Playwright** (E2E) | Matches `harness.json`. |

---

## 3. Ambiguities resolved

These are real gaps found in `CLAUDE.md`. Each needed a decision before code.

**A. Buyout cost is computed on the pre-increase value.**
§21's worked example (cost 6, resulting value 9) fixes this. The order is:
charge `currentValue`, then raise `currentValue`. Documented because the reverse
order is an easy and expensive mistake to make.

**B. Voluntary takeovers cannot be bought out.**
§8 scopes buyout to randomly assigned tasks. A voluntary taker who wants out
*releases* the task — no charge, no value increase, no points — and it returns
to AVAILABLE. Charging for release would punish volunteering, which is the
opposite of what the product is for.

**C. `ON_ACCEPT` reward timing needs a clawback.**
§5 allows crediting points at takeover. If the taker then abandons the task or
it expires, the credit is reversed with a `CORRECTION` ledger entry. Without
this, `ON_ACCEPT` is farmable: take, collect, never do the work. The default
stays `ON_COMPLETE` (§39), so this path is inactive unless an admin enables it.

**D. `preventImmediateReassignment` needs a starvation fallback.**
§13 forbids reassigning to the person who just had the task. If they are the
*only* eligible candidate, strict enforcement deadlocks the task permanently.
Resolution: the constraint degrades. If the eligible set empties, drop the
cooldown, assign anyway, and record `constraint_relaxed` with the reason in the
audit log — §6 requires the exclusion reasoning be visible, and this is exactly
the case where a person deserves to see why they were picked again.

**E. `WEIGHTED_FAIRNESS` had no formula.**
§12 names the strategy and requires the formula be documented and configurable,
but never states one. Default:

```
weight(person) = max(0.1,
    1.0
  + fairness.randomAssignmentWeight  * (avgRandomAssignments - personRandomAssignments)
  + fairness.voluntaryWorkWeight     * (personVoluntaryCompletions - avgVoluntaryCompletions)
  - fairness.recentAssignmentPenalty * recencyFactor(person)
)

recencyFactor(person) = 1 / (1 + daysSinceLastRandomAssignment)
```

Selection is weighted-random over the normalized weights. Someone who has
absorbed fewer random assignments than average becomes likelier to be picked;
recent victims are protected; the floor of 0.1 keeps every eligible person
reachable, so the distribution stays ergodic and §34's simulation cannot show
permanent exclusion. All three coefficients are admin-configurable (§16).

**F. Escalated value does not survive to the next occurrence.**
`currentValue` lives on `TaskInstance`, never on `TaskDefinition`. §11 resets it
to base on completion. An instance that expires *uncompleted* also resets —
carrying an inflated value into a fresh week would let value ratchet upward
forever without anyone ever doing the work.

**G. Points are never stored as an authoritative scalar.**
§14 makes the ledger the source of truth. `HouseholdMember.pointsCache` exists
for read performance only. It is recomputed from the ledger inside the same
transaction that writes each entry, and `verifyLedgerIntegrity()` asserts
`sum(transactions) == cache` for every member — run in tests and exposed to
admins.

---

## 4. MVP scope (§40) — all 17 items in scope

Household, members, tasks, base and current value, voluntary takeover, points on
voluntary completion, random assignment, zero points for random completion,
buyout, value increase, re-offer, reset on completion, point ledger, history,
admin configuration of core parameters, responsive web UI, automated tests.

**Explicitly deferred** — the spec marks these as later stages: statistics and
Market Value (§33), point decay (§15, default off, config surface only, no
scheduler), push and email notifications (§24 — in-app only), OAuth/OIDC (§25),
multi-household switching UI (§26 — the data model carries `householdId`
throughout, but the UI serves one household).

---

## 5. End conditions (machine-verifiable)

Derived from §42's Definition of Done. Each is a command or an assertion, not a
judgement call.

| # | Condition | Verified by |
|---|---|---|
| 1 | Stack starts from a clean checkout | `docker compose up` → api healthy, web served |
| 2 | Schema initializes automatically | `prisma migrate deploy` exit 0 on an empty database |
| 3 | Seed data loads (§38: 4 members, 6 tasks) | `npm run seed` → row-count assertions |
| 4 | Login works | Playwright: log in as Anna → dashboard renders |
| 5 | Open tasks are visible | `GET /api/tasks/available` returns the seeded tasks |
| 6 | Voluntary takeover works | `POST /tasks/:id/volunteer` → status ASSIGNED, voluntary true |
| 7 | Voluntary completion credits points | value 6 → complete → balance +6, ledger entry `VOLUNTARY_TASK_REWARD` |
| 8 | Random assignment works | `POST /admin/assignments/run` → task ASSIGNED to an eligible member |
| 9 | Random completion credits nothing | complete a random assignment → balance delta exactly 0 |
| 10 | Buyout debits correctly | 10 points, value 6 → buyout → balance 4, ledger entry `BUYOUT` |
| 11 | Buyout raises the value | 6 → 9, from `ceil(6 * 1.5)` |
| 12 | Task is re-offered after buyout | status returns to AVAILABLE, assignment closed |
| 13 | Value resets after completion | base 4, current 9 → complete → current 4 |
| 14 | Ledger is complete | `verifyLedgerIntegrity()` passes for every member |
| 15 | History is readable | `GET /api/history` reproduces the §22 event sequence |
| 16 | Core parameters are admin-configurable | `PUT /admin/config` changes the multiplier → the next buyout uses it |
| 17 | Race conditions hold | 2 concurrent volunteers on one task → exactly 1 success, 1 rejection |
| 18 | Escalation chain is correct | 4 → 6 → 9 → 14 (§35) |
| 19 | Insufficient points are rejected | 4 points, cost 6, negative balance disallowed → 409, balance unchanged |
| 20 | Tests pass | `npm test` exit 0 |
| 21 | Typecheck is clean | `npx tsc --noEmit` exit 0 |
| 22 | Mobile rendering works | Playwright at 390×844 → no horizontal scroll, CTAs reachable |
| 23 | README is complete | documents install, start, configuration, architecture |
| 24 | Simulation runs (§34) | 4 people × 20 tasks × 1000 cycles → no member above 1.5× the mean random load |

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Race conditions on takeover (§28, §35) | Postgres transaction with `SELECT … FOR UPDATE` on the instance row, plus a conditional update asserting the expected current status. The concurrency test is an end condition, not an afterthought. |
| Fairness formula produces systematic bias | §34's simulation is a build phase, not optional tooling. Chi-square on the resulting distribution. |
| Config changes corrupt in-flight state | Configuration is versioned, and an assignment records the config version it was created under — so a mid-cycle multiplier change cannot retroactively alter a buyout price already quoted to someone. |
| 24 end conditions against a 3-session cap | Phases are ordered so the economic core is correct and tested before any UI polish. A truncated campaign still leaves a working, tested domain layer. |

---

## 7. Out of scope

Native apps, real money, photo proof of chores, per-household theming,
internationalization (German UI strings only), horizontal scaling, and a
multi-household switching UI.
