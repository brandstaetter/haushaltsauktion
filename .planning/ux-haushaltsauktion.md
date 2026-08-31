# UX & Component Design — Haushaltsauktion

Status: proposal for main-agent review
Author: Frontend Agent (Phase 2)
Inputs: `CLAUDE.md` (§19–§22, §25, §31, §32, §17), `.planning/prd-haushaltsauktion.md`
Scope: information architecture, screens, flows, component model, design language.
No source code is produced here. Database and API design belong to the Architecture Agent;
this document assumes the REST surface sketched in §29 and lists the additions it needs in §11.

---

## 0. How to read this

Sections 1–4 are product design and should be reviewed by a human. Sections 5–8 are the
build contract for Phase 4 and should be read as instructions. Section 9 is the copy deck —
every German string in the MVP, in one place, so that the "no dark patterns" review (§31)
can be done by reading one file rather than grepping JSX. Section 11 lists what this design
needs from the backend that §29 does not yet promise.

All wireframes are drawn at 390×844 (iPhone 14 / Pixel 7 class) unless labelled otherwise.
Desktop is the adaptation, never the source layout.

---

## 1. Design direction

### 1.1 The problem this design has to solve

The product asks a person to look at unwanted work and choose between doing it for nothing
and paying to escape it. That is an uncomfortable moment, and almost every visual instinct
available makes it worse:

- Colour-coding the choices (green "do it" / red "pay") turns a household arrangement into a
  moral verdict.
- Making the cheap option prominent and the costly option grey nudges, which §31 forbids.
- Making the escalating value red or "urgent" frames a chore nobody wants as a threat, when
  economically it is the opposite: a rising value is a *rising prize* for whoever takes it.
- Any leaderboard, streak, badge or trophy converts a cooperation mechanism into a
  competition, which §19 explicitly rules out.

So the design commits to one idea: **the interface reports, it does not persuade.** It shows
the numbers, states the consequences symmetrically, and gets out of the way. Its warmth comes
from typography and copy, not from encouragement.

### 1.2 The signature element: die Wertleiter

The one thing that makes this product what it is is that a chore has a *price history*. A
value of 9 on a task with base 4 is not just a number, it is a record of two people declining
it. The design surfaces that everywhere as a **Wertleiter** (value ladder) — the chain of
values a task has passed through, with the current step emphasised and the next step, when a
buyout is on the table, shown ghosted:

```
   4  ─▸  6  ─▸ ⟨9⟩
  Basis  jetzt  danach
```

This single device does the work of four paragraphs of explanation. It makes §21's required
sentence ("Danach steigt der Aufgabenwert auf 9 Punkte") visible rather than read, it makes
§22's history legible at a glance, and it is what the admin config preview shows when an
admin changes the multiplier. Everything else in the design language is deliberately quiet so
that the ladder is the thing people remember.

The compact form of the same idea is the **Wertmarke** (value chip), a squircle carrying the
current value plus its base value and buyout count. That is what appears on cards.

### 1.3 Decisions at a glance

| Area | Decision | Rationale (short) |
|---|---|---|
| Component library | **Radix UI primitives (per-package) + hand-written CSS Modules** | §5.7 |
| Styling | CSS Modules + custom-property token layer. No Tailwind, no CSS-in-JS runtime | §5.7 |
| Data fetching | **TanStack Query v5**, no global client store | §5.4 |
| Routing | `react-router` data router, `/admin` subtree lazy-loaded | §2.1 |
| Display + numerals | **Bricolage Grotesque** (variable) | §6.1 |
| Body / UI | **Instrument Sans** | §6.1 |
| Tabular data | system monospace stack (0 bytes) | §6.1 |
| Value colour ramp | brass → gold, never red | §6.4 |
| Icons | `lucide-react`, per-icon imports, `strokeWidth 1.75` + 3 custom SVGs | §6.7 |
| Leaderboard | **omitted from the MVP**; replaced by an unranked fairness bar | §3.8 |
| Optimistic updates | **forbidden** on anything touching points or task value | §5.4 |
| Initial JS budget | ≤ 180 KB gz for the member routes; fonts ≤ 70 KB | §5.7 |

---

## 2. Information architecture

### 2.1 Route map

Member routes are always available; `/verwaltung/*` renders only for `role === 'ADMIN'` and is
a separate lazy chunk, so the majority of users never download it.

| Route | Screen | Spec | Notes |
|---|---|---|---|
| `/anmelden` | Login | §25 | Only unauthenticated route |
| `/` | Dashboard | §19 | Tab 1 · "Start" |
| `/aufgaben` | Open tasks | §20 | Tab 2 · filters: Offen / Meine / Alle |
| `/aufgaben/:instanceId` | Task detail | §20/§21 | Renders the **decision** layout when the instance is assigned to me |
| `/aufgaben/:instanceId/warum` | Fairness transparency | §32 | Also reachable from history |
| `/verlauf` | History | §22 | Tab 3 · household-wide, filterable |
| `/ich` | My account | §14/§19 | Tab 4 · balance, ledger link, fairness bar, settings, logout |
| `/ich/punkte` | Point ledger | §14 | Full `PointTransaction` list, cursor-paginated |
| `/verwaltung` | Admin hub | §17 | Entry point lives inside `/ich`, not in the tab bar |
| `/verwaltung/regeln` | Rules & values | §16/§17 | Tabbed: Freiwillig · Vergabe · Freikauf · Wert · Erledigung · Verfall |
| `/verwaltung/aufgaben` | Task definitions | §18 | List + create |
| `/verwaltung/aufgaben/:id` | Edit definition | §18 | Recurrence, base value, eligibility |
| `/verwaltung/mitglieder` | Members & roles | §3.1 | Restrictions, absence, role |
| `/verwaltung/kategorien` | Categories | §17 | |
| `/verwaltung/vergabe` | Random assignment | §29 | Manual run + dry-run preview |
| `/verwaltung/protokoll` | Audit log | §23 | Filterable, read-only |

Overlays (not routes, but URL-addressable via a `?dialog=` search param so a mis-tap of the
back button closes the sheet rather than leaving the screen): buyout confirm, volunteer
confirm, completion confirm, config save review.

### 2.2 Navigation model

Four bottom tabs. Four is the maximum that keeps 48 px targets comfortable at 390 px and
still leaves room for German labels. Admin deliberately is not a tab: a household has one or
two admins and twenty members, and the member experience should not carry a door most people
must never open.

```
┌──────────────────────────────────────────────┐
│ ☰  Haushaltsauktion          Demo Family ▾   │
├──────────────────────────────────────────────┤
│                                              │
│            Inhalt der Route                  │
│            (scrollt)                         │
│                                              │
├──────────────────────────────────────────────┤
│  Start    Aufgaben    Verlauf    Ich         │
│   ●          ○           ○        ○          │
└──────────────────────────────────────────────┘
```

The "Start" tab carries a small dot badge when a decision is pending. It is a dot, not a
count, and it never turns red — red badges are anxiety devices and the assignment is not an
emergency.

At ≥ 900 px the tab bar becomes a left rail and the content column is capped at 760 px:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Haushaltsauktion                    Anna · 24 Punkte  ▾              │
├──────────────────────────────────────────────────────────────────────┤
│ Start        │                                                       │
│ Aufgaben     │      Inhaltsspalte, max. 760 px,                      │
│ Verlauf      │      im Restraum zentriert                            │
│ Ich          │                                                       │
│              │      Gleiche Komponenten wie mobil,                   │
│ ─────        │      Karten in 2 Spalten ab 1200 px                   │
│ Verwaltung   │                                                       │
│              │                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

The decision screen keeps its single-column layout at every width. Widening it would put the
two options side by side, and side-by-side options acquire a left-is-default reading order
that a vertical stack does not. See §4.3.

### 2.3 Breakpoints

| Token | Range | Layout |
|---|---|---|
| `--bp-base` | 320–599 | Single column, 16 px gutters, bottom nav, sticky action bar |
| `--bp-sm` | 600–899 | Single column, 24 px gutters, cards gain 20 px padding |
| `--bp-md` | 900–1199 | Left rail 220 px, content column 760 px |
| `--bp-lg` | ≥ 1200 | As above; task lists and admin lists go two-column / master-detail |

Below 320 px the layout must still not scroll horizontally; long German compounds get
`hyphens: auto` with `lang="de"` and `overflow-wrap: anywhere` as a backstop.

### 2.4 What wins the top of the screen

One ordering rule, applied everywhere, so nothing has to be decided ad hoc:

1. A decision the server is waiting on from me (a random assignment I have not answered).
2. State I need in order to make that decision (my balance).
3. Work I have already taken on.
4. Work I could take on.
5. What the household is doing.
6. Everything else.

Explicitly rejected: launching the app into a full-screen blocking modal when an assignment
is pending. It would raise the completion rate of the decision and it would be coercive —
people are entitled to look at their balance and the other open tasks before answering. The
pending decision leads the dashboard as a card, and that is enough.

---

## 3. Core screens

Each screen below lists its data, states and calls to action. The buyout decision screen has
its own section (§4) because it is the product.

### 3.1 Login (§25)

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│            Haushaltsauktion                  │
│            Anmelden                          │
│                                              │
│  Benutzername oder E-Mail                    │
│  [                                        ]  │
│                                              │
│  Passwort                                    │
│  [                                      ◉ ]  │
│                                              │
│  [           Anmelden                     ]  │
│                                              │
│  Passwort vergessen?                         │
│                                              │
│  ────────────  nur in der Demo  ─────────    │
│  ( Anna )  ( Paul )  ( Maria )  ( Hannes )   │
│                                              │
└──────────────────────────────────────────────┘
```

- **Data:** none on load. `POST /api/auth/login` → session cookie; then `GET /api/members/me`.
- **CTA:** *Anmelden*. Single primary button, 56 px, full width.
- **States:** idle · submitting (button label → "Wird angemeldet…", disabled, spinner inside)
  · error · rate-limited.
- **Error copy** never says which field was wrong: "Benutzername oder Passwort stimmt nicht."
  Rendered above the form in a `role="alert"` region.
- `autocomplete="username"` / `"current-password"`, `inputMode` set, 16 px input font so iOS
  does not zoom on focus.
- The demo quick-switch row is compiled out via `import.meta.env.DEV` plus an explicit
  `VITE_DEMO_LOGIN` flag. It exists because the Playwright suite and the manual demo both
  need to change identity constantly, and a four-tap login is a real cost in that loop. It
  must be impossible to ship: the flag is asserted absent in the production build check.
- After login, redirect to the route the user originally requested, else `/`.

### 3.2 Dashboard (§19)

```
┌──────────────────────────────────────────────┐
│ ☰  Haushaltsauktion          Demo Family ▾   │
├──────────────────────────────────────────────┤
│                                              │
│  Hallo Anna                                  │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Zu entscheiden                         │  │
│  │                                        │  │
│  │ Bad putzen — dir zugelost              │  │
│  │ Wert 6  ·  dein Kontostand 24          │  │
│  │                                        │  │
│  │ ▸ Entscheiden                          │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Dein Punktestand                       │  │
│  │                                        │  │
│  │        24                              │  │
│  │                                        │  │
│  │ +6 diese Woche          Punktekonto ›  │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  Für mich                                    │
│                                              │
│  Meine Aufgaben                     1        │
│  ╭────────────────────────────────────────╮  │
│  │ Wäsche aufhängen        freiwillig · 4 │  │
│  │ Als erledigt markieren               › │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  Freiwillig verfügbar               3   Alle›│
│  ╭────────────────────────────────────────╮  │
│  │ Küche gründlich reinigen      Küche    │  │
│  │ fällig heute · ca. 40 Min · 2× freige- │  │
│  │ kauft                                  │  │
│  │                                        │  │
│  │ Wert  7 ─▸ 16          Basiswert 7     │  │
│  │                                        │  │
│  │ [    Freiwillig übernehmen         ]   │  │
│  ╰────────────────────────────────────────╯  │
│                    · · ·                     │
│                                              │
│  Nächste Fälligkeiten                        │
│  Müll hinausbringen        morgen, Wert 2    │
│  Staubsaugen               Sa, Wert 4        │
│                                              │
│  ────────────────────────────────────────    │
│                                              │
│  Familie                                     │
│                                              │
│  Offen im Haushalt   3 Aufgaben · 13 Punkte  │
│  Zugewiesen          1 Aufgabe               │
│                                              │
│  Kürzlich erledigt                  Verlauf ›│
│  ╭────────────────────────────────────────╮  │
│  │ Gestern 20:37                          │  │
│  │ Paul hat Bad putzen erledigt   +6      │  │
│  │                                        │  │
│  │ Gestern 19:45                          │  │
│  │ Anna hat sich freigekauft      −4      │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
├──────────────────────────────────────────────┤
│  Start    Aufgaben    Verlauf    Ich         │
│   ●          ○           ○        ○          │
└──────────────────────────────────────────────┘
```

- **Data:** one `GET /api/dashboard` aggregate is strongly preferred over five parallel
  requests — on a phone on mobile data, five round trips is the difference between a snappy
  and a sluggish start. See §11.1. Payload: `{ me, balance, weekDelta, pendingDecisions[],
  myAssignments[], available[] (top 3), upcomingDue[], householdSummary, recentEvents[] (5) }`.
- **CTAs:** *Entscheiden* (→ `/aufgaben/:id`), *Als erledigt markieren*, *Freiwillig
  übernehmen*, *Alle*, *Punktekonto*, *Verlauf*.
- **Ordering:** when `pendingDecisions.length === 0`, the balance card moves to the top and
  the "Zu entscheiden" card is absent. With more than one pending decision, the first is shown
  expanded and the rest as one-line rows underneath — decisions are answered one at a time.
- **Refresh:** `refetchOnWindowFocus`, `staleTime: 15 s`, plus a 30 s interval while the tab is
  visible. Values change because other people act; a stale dashboard is a wrong dashboard.
- **The §19 "Familie" block is a summary, not a feed.** Counts and a value total, then three
  recent events. Anything longer belongs in `/verlauf`.
- **Deliberately absent:** ranking, points-per-person comparison, "you are behind" language,
  streaks. §19's "Rangliste darf nicht im Zentrum stehen" is honoured by not building one at
  all in the MVP (§3.8).

### 3.3 Open tasks (§20)

```
┌──────────────────────────────────────────────┐
│ ←  Aufgaben                            ⌕     │
├──────────────────────────────────────────────┤
│  ( Offen )  ( Meine )  ( Alle )              │
│  Kategorie ▾      Sortierung: Wert ▾         │
├──────────────────────────────────────────────┤
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Bad putzen                   Badezimmer│  │
│  │ fällig heute · ca. 25 Min              │  │
│  │                                        │  │
│  │   ┏━━━━━┓                              │  │
│  │   ┃  9  ┃  ×2 freigekauft              │  │
│  │   ┗━━━━━┛  Basiswert 4                 │  │
│  │                                        │  │
│  │ [    Freiwillig übernehmen         ]   │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Müll hinausbringen                Haus │  │
│  │ fällig morgen · ca. 5 Min              │  │
│  │                                        │  │
│  │   ┏━━━━━┓                              │  │
│  │   ┃  2  ┃  Basiswert 2                 │  │
│  │   ┗━━━━━┛                              │  │
│  │                                        │  │
│  │ [    Freiwillig übernehmen         ]   │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Staubsaugen                 zugewiesen │  │
│  │ an Paul · seit 19:43                   │  │
│  │                                        │  │
│  │   ┏━━━━━┓                              │  │
│  │   ┃  4  ┃  Basiswert 4                 │  │
│  │   ┗━━━━━┛                              │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
├──────────────────────────────────────────────┤
│  Start    Aufgaben    Verlauf    Ich         │
│   ○          ●           ○        ○          │
└──────────────────────────────────────────────┘
```

Card anatomy, top to bottom: title · category tag (right-aligned) · meta line (due, duration)
· value chip with base value and buyout count · single CTA. §20 asks for all of these fields
and every one of them is on the card. `Status` is implicit for AVAILABLE cards and explicit
as a badge for anything else ("zugewiesen", "pausiert", "überfällig").

- **Data:** `GET /api/tasks/available` and, for the "Meine"/"Alle" filters,
  `GET /api/tasks/assigned-to-me` and a household-scoped list.
- **CTA:** *Freiwillig übernehmen* → confirmation sheet → `POST /api/tasks/:id/volunteer`.
  Once held, the same card's CTA becomes *Als erledigt markieren* (§20: "Erledigt").
- **CTA copy depends on config.** With `voluntary.rewardTiming = ON_COMPLETE` (the default)
  the sheet says "Du bekommst 9 Punkte, sobald du sie als erledigt markierst." With
  `ON_ACCEPT` it says "Du bekommst 9 Punkte sofort. Wenn du die Aufgabe später abgibst,
  werden sie wieder abgezogen." The client reads this from the public config (§11.2). Copy
  that contradicts configuration is a hidden rule, and §31 forbids hidden rules.
- **Overdue** tasks show "Fällig seit gestern" in muted ink with a small clock icon. Not red,
  not bold, no exclamation mark. Nobody is scolded by this app.
- **Buyout counts are shown without names** on this screen ("×2 freigekauft"). Who bought out
  is a matter of record and lives in `/verlauf` and the fairness view; putting it on the card
  everyone browses turns the history into a public reprimand.
- **Sorting** defaults to due date, with "Wert" as an option. Value-descending is not the
  default: leading with the most lucrative task frames the list as a marketplace to be gamed
  rather than as work to be shared.

### 3.4 Assigned task / decision screen (§21)

See §4. It is the same route as task detail (`/aufgaben/:instanceId`), rendered in decision
mode when `instance.assignment.memberId === me.id && instance.assignment.origin === 'RANDOM'
&& assignment.status === 'PENDING'`.

### 3.5 History (§22)

```
┌──────────────────────────────────────────────┐
│ ←  Verlauf                             ⌕     │
├──────────────────────────────────────────────┤
│  ( Alles )  ( Meine )  ( Aufgabe ▾ )         │
├──────────────────────────────────────────────┤
│                                              │
│  Heute                                       │
│                                              │
│  20:37 │ Aufgabenwert auf 4 zurückgesetzt    │
│  20:37 │ Paul erhält 6 Punkte                │
│  20:37 │ Bad putzen von Paul erledigt        │
│  20:01 │ Bad putzen freiwillig von Paul      │
│        │ übernommen                          │
│  19:45 │ Neuer Wert: 6                       │
│  19:45 │ Anna kaufte sich für 4 Punkte frei  │
│  19:43 │ Zufallszuweisung an Anna  Warum? ›  │
│  19:43 │ Keine freiwillige Übernahme         │
│  19:01 │ Bad putzen angeboten — Wert 4       │
│                                              │
│  Gestern                                     │
│  21:10 │ Müll hinausbringen erledigt         │
│                                              │
│  [           Mehr laden                 ]    │
│                                              │
├──────────────────────────────────────────────┤
│  Start    Aufgaben    Verlauf    Ich         │
│   ○          ○           ●        ○          │
└──────────────────────────────────────────────┘
```

This reproduces §22's example sequence verbatim, in reverse-chronological order with sticky
day headers. Timestamps are `HH:MM` in the monospace stack at 13 px so the column aligns
without a table.

- **Data:** `GET /api/history?cursor=&taskId=&memberId=` returning `TaskHistoryEvent[]`.
  Events carry a discriminated `type`; the client owns the German sentence for each type
  (§9.4) rather than the server sending prose — that keeps the copy reviewable in one file and
  keeps the API free of presentation.
- **CTA:** each row is tappable where it has a destination — task events open the task,
  `RANDOM_ASSIGNMENT` rows carry an explicit "Warum? ›" affordance into the fairness view.
- **Pagination:** cursor-based, with an explicit *Mehr laden* button. Infinite scroll alone is
  not acceptable: it is unreachable by keyboard-driven readers and it makes the end of the
  list impossible to find.
- **Filters** are chips, `role="radiogroup"`, 40 px tall with 48 px touch slop.
- **Empty:** see §7.2.

### 3.6 Fairness transparency (§32)

```
┌──────────────────────────────────────────────┐
│ ←  Warum ich?                                │
├──────────────────────────────────────────────┤
│                                              │
│  Bad putzen · zugewiesen 19:43               │
│                                              │
│  Für diese Aufgabe waren 4 Personen          │
│  verfügbar. 1 Person wurde ausgeschlossen.   │
│                                              │
│  Ausgeschlossen                              │
│  Anna    hat diese Aufgabe zuletzt erledigt  │
│                                              │
│  Gewichtung der übrigen Personen             │
│  ╭────────────────────────────────────────╮  │
│  │ Maria    ████████████████████   1,2    │  │
│  │ Hannes   ████████████████       1,0  ● │  │
│  │ Paul     █████████████          0,8    │  │
│  ╰────────────────────────────────────────╯  │
│  ● ausgewählt                                │
│                                              │
│  Strategie: Ausgleichende Gewichtung         │
│  Wer zuletzt seltener zugelost wurde, wird   │
│  wahrscheinlicher ausgewählt.                │
│                                              │
│  ▸ Wie wird gewichtet?                       │
│                                              │
│  Die Auswahl erfolgte zufällig, gewichtet    │
│  nach diesen Werten.                         │
│                                              │
└──────────────────────────────────────────────┘
```

- **Data:** `GET /api/assignments/:id/explanation` → `{ strategy, candidates: [{memberId,
  displayName, weight}], excluded: [{memberId, displayName, reason}], selectedMemberId,
  relaxedConstraints: [{constraint, reason}] }`. All of this is already required in the audit
  log by §6, so the endpoint is a projection, not new bookkeeping.
- Exclusion reasons arrive as an enum (`LAST_COMPLETED`, `INACTIVE`, `ABSENT`,
  `CATEGORY_EXCLUDED`, `TASK_EXCLUDED`, `MAX_ASSIGNMENTS_REACHED`, `COOLDOWN`) and are mapped
  to German in the client (§9.5). Never free text from the server.
- Bars are proportional to weight and are **not** a ranking: sort order is weight-descending
  because that is the quantity being explained, and the selected person is marked with a
  filled dot, never with a trophy, crown, or first place.
- The random number itself is not shown (§32 permits this). The closing sentence states that
  selection was weighted-random, so nobody has to guess whether the highest weight always wins.
- **`relaxedConstraints` gets a prominent panel** when non-empty. This is the PRD's item D:
  if `preventImmediateReassignment` had to be dropped because nobody else was eligible, the
  person who got the task twice in a row deserves to be told why, in the first screen they
  look at: "Die Regel *nicht zweimal hintereinander* musste ausgesetzt werden — sonst wäre
  niemand übrig geblieben."
- **The disclosure "Wie wird gewichtet?"** shows the configured formula in plain German plus
  the current coefficient values. That is §12's "die genaue Formel soll konfigurierbar und
  dokumentiert sein" made visible to the people it affects, not only to admins.
- **Tone rule:** exclusion reasons are facts about circumstances, never about people. "Anna
  ist gerade abwesend", not "Anna macht gerade nichts".

### 3.7 Admin configuration (§17)

```
┌──────────────────────────────────────────────┐
│ ←  Regeln & Werte                            │
├──────────────────────────────────────────────┤
│ Freiwillig  Vergabe  Freikauf  Wert  …       │
├──────────────────────────────────────────────┤
│                                              │
│  Wertsteigerung nach Freikauf                │
│                                              │
│  Strategie                                   │
│  [ Multiplikator                        ▾ ]  │
│                                              │
│  Multiplikator                               │
│  [ − ]        1,5        [ + ]               │
│                                              │
│  Rundung                                     │
│  [ Aufrunden (CEIL)                     ▾ ]  │
│                                              │
│  Mindeststeigerung                           │
│  [ − ]          1        [ + ]               │
│                                              │
│  Höchstwert                                  │
│  [ ohne Begrenzung                        ]  │
│                                              │
│  ╭─────────────────────────────────────────╮ │
│  │ Beispiel (vom Server berechnet)         │ │
│  │                                         │ │
│  │ Bad putzen, Basiswert 4                 │ │
│  │ 4 ─▸ 6 ─▸ 9 ─▸ 14 ─▸ 21                 │ │
│  │                                         │ │
│  │ Freikauf bei Wert 6 kostet 6 Punkte.    │ │
│  ╰─────────────────────────────────────────╯ │
│                                              │
│  ⚠ Diese Regel bestimmt, wie schnell         │
│    Aufgabenwerte steigen.                    │
│                                              │
├──────────────────────────────────────────────┤
│  3 Änderungen   [ Prüfen & speichern ]       │
└──────────────────────────────────────────────┘
```

Six tab groups mirroring §16: *Freiwillig · Vergabe · Freikauf · Wert · Erledigung · Verfall*.
Members, categories and task definitions are separate routes because they are collections,
not settings.

Four decisions matter here:

1. **Every rule group carries a live, server-computed worked example.** Changing the
   multiplier from 1,5 to 2,0 immediately shows `4 ─▸ 8 ─▸ 16 ─▸ 32 ─▸ 64` — the same
   Wertleiter component as the rest of the app. This is the single best defence against an
   admin accidentally making the household economy absurd, and it is far more informative than
   a validation message. It is computed by `POST /api/admin/config/preview` (§11.3), never in
   the browser: §36 says binding values are server-side, and a preview that disagrees with
   reality is worse than no preview.
2. **Explicit save with a diff review.** No autosave on rules that move points. *Prüfen &
   speichern* opens a sheet listing every changed key as `alt → neu`. Config changes are
   audited (§23); the person signing them should see what they are signing. The sticky footer
   shows the pending change count so the state is never ambiguous.
3. **Invariant warnings (§44).** Toggles that touch a core invariant carry a plain-language
   consequence, e.g. switching `voluntary.rewardEnabled` off: "Damit lassen sich keine Punkte
   mehr verdienen. Freikäufe wären dann für niemanden mehr bezahlbar." The server still
   validates and may refuse; the UI's job is to make the refusal unsurprising.
4. **Formula fields** use a restricted expression input with a visible token list
   (`currentValue`, `baseValue`, `buyoutCount`, `+ − × ÷`, `ceil() floor() round() min() max()`)
   and validate on blur through the same preview endpoint, returning either a computed example
   or a parse error with a character offset. No client-side evaluation of any kind exists in
   the codebase — the parser lives on the server (PRD §2).

Numeric inputs are stepper controls with 48 × 48 px −/+ buttons and a centred value, not a
bare `<input type="number">`. Native spinners are 12 px tall on desktop and inconsistent on
mobile, and this form is mostly small integers where a stepper is faster anyway. The value is
still a real text input with `inputMode="decimal"` for direct entry.

Admin sub-screens (summarised — same card, form and table primitives):

- **Aufgaben** — TaskDefinition list; edit form covers title, description, category, base
  value, duration estimate, active flag, eligibility (allow/deny by member), buyout-disabled
  flag, and recurrence. Recurrence is a segmented control (Einmalig · Täglich · Wochentage ·
  Wöchentlich · Alle N Tage · Monatlich · Manuell) that reveals only the fields the chosen mode
  needs, with a plain-German summary line underneath ("Jeden Montag und Donnerstag").
- **Mitglieder** — role, active/inactive, absence window, category and task exclusions, max
  random assignments per period. Each restriction shows its effect: "Paul kann derzeit nicht
  zugelost werden (abwesend bis 04.09.)".
- **Vergabe** — a *Probelauf* button that returns the candidate set and weights **without**
  assigning, rendered with the same fairness component as §3.6, and a *Jetzt zuweisen* button
  that runs it for real behind a confirmation. Being able to inspect the lottery before pulling
  it is what makes an admin trust it.
- **Protokoll** — audit log, filter by actor / type / date, read-only, monospace payload diffs.

### 3.8 My account, and the leaderboard question

`/ich` carries: balance, week delta, a link to the full ledger, notification settings, logout,
and — for admins — the entry into `/verwaltung`.

It also carries a **Fairnessindikator**: one horizontal bar per member showing their share of
*random* assignments this month against the equal-share line, sorted **alphabetically**, with
no totals, no points, and no ordering by performance. It answers "is this actually fair?",
which is the question the product exists to answer, and it refuses to answer "who is winning",
which §19 says must not be central.

**Recommendation: ship no leaderboard in the MVP.** §19 lists "Rangliste" as optional and then
says the goal is cooperation, not competition. A ranked list of points is a competition device
regardless of where it is placed, and once present it is the thing people screenshot. The
fairness bar delivers the legitimate use (am I carrying more than my share?) without it. This
is a deliberate reading of an optional requirement and is flagged here for the main agent to
accept or overrule.

### 3.9 User flows

```
F1  Freiwillige Übernahme
    /aufgaben ─▸ Karte ─▸ [Freiwillig übernehmen] ─▸ Sheet (Folgen) ─▸ bestätigen
              ─▸ POST /volunteer ─▸ Karte wird "Meine Aufgabe"
              ─▸ [Als erledigt markieren] ─▸ Sheet ─▸ POST /complete
              ─▸ +Wert Punkte, Wert auf Basiswert zurück, Verlauf ergänzt
    Taps: 2 zum Übernehmen, 2 zum Abschließen.

F2  Zufallszuweisung ─▸ übernehmen
    Push/Dashboard "Zu entscheiden" ─▸ /aufgaben/:id (Entscheidung)
              ─▸ [Aufgabe übernehmen] ─▸ Sheet ─▸ POST /accept
              ─▸ später [Als erledigt markieren] ─▸ 0 Punkte, klar benannt

F3  Zufallszuweisung ─▸ Freikauf
    Entscheidung ─▸ [Für 6 Punkte freikaufen] ─▸ Sheet mit 24→18 / 6→9
              ─▸ POST /buyout {quoteToken}
              ─▸ 200: Bestätigung + Verlauf, Aufgabe wieder AVAILABLE mit Wert 9
              ─▸ 409: Panel "Der Preis hat sich geändert" (§4.6)

F4  Rennen verloren
    [Freiwillig übernehmen] ─▸ POST /volunteer ─▸ 409
              ─▸ Sheet wird zu "Paul war schneller" ─▸ Liste lädt neu

F5  Admin ändert eine Regel
    /verwaltung/regeln ─▸ Feld ändern ─▸ Vorschau aktualisiert sich (Server)
              ─▸ [Prüfen & speichern] ─▸ Diff-Sheet ─▸ PUT /admin/config
              ─▸ Audit-Eintrag, alle offenen Aufgabenlisten invalidiert
```

---

## 4. The buyout decision screen

This is the screen the product is judged on. §21 gives the copy, §31 gives the required
disclosures, and the ethical constraint is that neither answer may be nudged.

```
┌──────────────────────────────────────────────┐
│ ←  Zugewiesene Aufgabe                       │
├──────────────────────────────────────────────┤
│                                              │
│  Du wurdest ausgewählt                       │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Bad putzen                   Badezimmer│  │
│  │ fällig heute · ca. 25 Min              │  │
│  │                                        │  │
│  │ Aktueller Wert                         │  │
│  │   ┏━━━━━┓                              │  │
│  │   ┃  6  ┃   Basiswert 4 · 1× freigek.  │  │
│  │   ┗━━━━━┛                              │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  Warum wurde mir das zugewiesen?           › │
│                                              │
│  Dein Punktestand                     24     │
│                                              │
│  Zwei Möglichkeiten                          │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Aufgabe übernehmen                     │  │
│  │ ────────────────────────────────────── │  │
│  │ Punkte                 0               │  │
│  │ Kontostand danach     24  unverändert  │  │
│  │ Aufgabenwert danach    6  unverändert  │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  ╭────────────────────────────────────────╮  │
│  │ Für 6 Punkte freikaufen                │  │
│  │ ────────────────────────────────────── │  │
│  │ Punkte                −6               │  │
│  │ Kontostand danach     18  von 24       │  │
│  │ Aufgabenwert danach    9  von 6        │  │
│  ╰────────────────────────────────────────╯  │
│                                              │
│  Nach einem Freikauf wird die Aufgabe erneut │
│  angeboten. Wer sie dann freiwillig über-    │
│  nimmt, erhält 9 Punkte.                     │
│                                              │
│  Später entscheiden                          │
│                                              │
└──────────────────────────────────────────────┘
```

### 4.1 The five required disclosures (§31)

§31 requires the user to see, before deciding: current balance, buyout cost, balance after,
task value before, task value after. All five are on screen simultaneously, above the fold on
a 390 × 844 viewport, without expanding anything:

| §31 requirement | Where it is |
|---|---|
| Aktueller Punktestand | "Dein Punktestand 24", directly above the options |
| Freikaufkosten | In the option's own label: "Für 6 Punkte freikaufen"; and as `Punkte −6` |
| Punktestand danach | `Kontostand danach 18 von 24` |
| Aufgabenwert vorher | The value chip in the task card, `6`, with base `4` |
| Aufgabenwert danach | `Aufgabenwert danach 9 von 6` |

§21's exact copy is preserved: the heading is "Du wurdest ausgewählt", the value is labelled
"Aktueller Wert", the take-it option costs `0 Punkte`, the buyout costs `−6 Punkte`, the button
reads "Für 6 Punkte freikaufen", and the consequence sentence about the value rising to 9 is
present. The design adds the balance-after figure, which §21 omits but §31 requires.

### 4.2 Why every number appears in both options

The `ConsequenceList` inside each option renders the **same three rows with the same labels in
the same order**, even where a value does not change. "Aufgabenwert danach 6 unverändert" is
information a reader would otherwise have to infer from an absence — and inferring from
absence is exactly how people miss consequences. Symmetry of information is what makes
symmetry of weight legible; if one card had three rows and the other had one, the shorter one
would read as the simpler, safer, default answer.

### 4.3 Equal visual weight — the rules

These are checkable in review, which is the point.

1. **Same component.** Both options are one `ChoiceCard` instance. There is no
   `variant="primary"` prop. A reviewer can confirm parity by reading two lines of JSX.
2. **Identical geometry.** Same width, same padding, same corner radius, same 2 px border,
   same minimum height, same type sizes and weights for label and rows.
3. **Identical colour.** Both cards are `--surface` with a `--ink-secondary` 2 px border.
   Neither is filled, neither is outlined-secondary, neither carries a hue. Colour differences
   between options were considered and rejected: any hue pair carries connotation (green/red
   moralises, blue/amber implies house-preferred vs. costly), and matching perceived weight
   across two hues is guesswork. Removing colour from the comparison removes the problem.
4. **Neither is a filled "primary" button.** Filled buttons exist elsewhere in the app, where
   there is exactly one action and nothing to nudge away from.
5. **Vertical stack at every breakpoint.** Side-by-side buttons acquire a left-is-primary
   reading order in LTR. Stacking makes the order a sequence rather than a hierarchy.
6. **Fixed, disclosed order.** Free-of-charge option first, always, for every user and every
   task — never A/B-ordered, never reordered by affordability or by past behaviour. The
   ordering rule is stated in the heading above them ("Zwei Möglichkeiten") and documented
   here; it is a tiebreak, not a recommendation.
7. **No urgency.** No countdown, no "nur noch 12 Minuten", no pulsing. If a decision deadline
   exists it is rendered as an absolute time ("Antwort bis 21:00") in muted body text. Ticking
   clocks manufacture pressure, and the deadline's real consequence (the assignment simply
   stands) is not severe enough to warrant one.
8. **A third, cost-free exit.** *Später entscheiden* returns to the dashboard, charges nothing
   and changes nothing. Its presence is what stops the screen feeling like a trap; a two-option
   screen with no way out is coercive regardless of how balanced the two options are. It is
   styled as a plain text link, below both cards — quieter than the options, because it is not
   an answer to the question.

### 4.4 There is no default

- **No autofocus on either option.** On mount, focus moves programmatically to the panel's
  `<h1>` (`tabIndex={-1}`). Pressing Enter on arrival does nothing.
- **No autofocus on the confirm button** inside either sheet either; initial focus goes to the
  sheet heading. Radix's `onOpenAutoFocus` is intercepted for this.
- **No pre-selection, no default-checked radio, no "empfohlen" tag.**
- **No memory of the last choice.** The screen does not learn that you usually buy out and
  pre-emphasise it.
- **No differential friction.** Both options open a confirmation sheet with the same structure
  and the same tap count. Making the costly option harder to reach is the mirror image of
  making it easier, and both are nudges. Total cost either way: two taps.

The two-tap cost is a deliberate trade against §31's "wenige Klicks". A single tap that
immediately debits points is worse: a mis-tap on a phone would cost real points and there is
no undo for a buyout (the value has already risen and may already have been taken by someone
else). One confirmation, symmetric, is the floor.

### 4.5 The confirmation sheets

```
┌──────────────────────────────────────────────┐
│                  ────                        │
│                                              │
│  Freikauf bestätigen                         │
│  Bad putzen                                  │
│                                              │
│  Dein Punktestand        24  →  18           │
│  Aufgabenwert             6  →   9           │
│                                              │
│  Die Aufgabe wird danach wieder allen        │
│  angeboten. Wer sie freiwillig übernimmt,    │
│  erhält 9 Punkte.                            │
│                                              │
│  Preis vom Server bestätigt · gerade eben    │
│                                              │
│  [        Freikauf bestätigen           ]    │
│  [        Abbrechen                     ]    │
│                                              │
└──────────────────────────────────────────────┘
```

The take-it sheet is the same component with the same shape:

> **Aufgabe übernehmen** / Bad putzen / Dein Punktestand 24 → 24 / Aufgabenwert 6 → 6 /
> "Diese Aufgabe wurde dir zugelost. Für zugeloste Aufgaben gibt es keine Punkte." /
> `[ Übernehmen ] [ Abbrechen ]`

That last sentence is stated plainly and without apology. §7 and §44 make zero points for
random work a core rule; a UI that soft-pedals it would be hiding a rule.

"Preis vom Server bestätigt · gerade eben" is a small muted line, and it is load-bearing: it
tells the user the number in front of them is the number that will be charged, and it is the
visible half of the mechanism in §4.6.

### 4.6 When the server's quote differs from what the client last saw

**Rule: the client never computes a binding number.** It never evaluates `ceil(currentValue *
multiplier)`, never derives the cost from the value, and never derives the balance-after. Every
figure on this screen comes from a server quote:

```ts
type BuyoutQuote = {
  assignmentId: string;
  quoteToken: string;      // opaque; identifies (assignment, cost, config version)
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  valueBefore: number;
  valueAfter: number;
  allowed: boolean;
  blockedReason?: BuyoutBlockedReason;
  quotedAt: string;        // ISO
};
```

The quote is fetched with the task detail and refreshed on window focus and every 30 s while
the screen is open. `POST /api/assignments/:id/buyout` carries `{ quoteToken }`. The server
rejects a stale or unknown token with `409` and the current quote in the body.

Three ways the numbers can move under the user, and one response to all of them:

| Cause | Effect |
|---|---|
| Someone else bought out the same task first | Assignment gone, or value and cost higher |
| An admin changed `valueIncrease` or `buyout` config | Cost and value-after change |
| The user's balance changed elsewhere (decay, admin correction) | `balanceAfter`, possibly `allowed` |

**Response — never silently re-render the numbers under the user's finger.** If a background
refetch returns a quote whose `cost`, `valueAfter` or `allowed` differs from the one currently
displayed:

- If **no sheet is open**, the decision screen updates its figures and shows one muted line
  beneath the options: "Die Werte wurden gerade aktualisiert." The user has not committed to
  anything yet, so updating is honest; the note explains why a number moved while they were
  reading.
- If **a sheet is open**, the sheet's confirm button is disabled and its body is replaced by
  the change panel below. A quote must never mutate behind an armed confirm button.
- If the **mutation itself returns 409**, the same panel replaces the sheet body, with the
  server's new quote. Nothing has been charged.

```
┌──────────────────────────────────────────────┐
│                  ────                        │
│                                              │
│  Der Preis hat sich geändert                 │
│                                              │
│  Angezeigt war ein Freikauf für 6 Punkte.    │
│  Er kostet jetzt 9 Punkte, weil sich in der  │
│  Zwischenzeit jemand freigekauft hat.        │
│                                              │
│  Dein Punktestand        24  →  15           │
│  Aufgabenwert             9  →  14           │
│                                              │
│  [   Zum neuen Preis freikaufen         ]    │
│  [   Abbrechen                          ]    │
│                                              │
└──────────────────────────────────────────────┘
```

The new price requires a fresh, deliberate tap. There is no auto-retry with the new token —
auto-retrying a payment at a price the user did not agree to is the definition of the pattern
this design exists to avoid. `Abbrechen` is present and equally reachable. Where the server
supplies a reason for the change it is stated; where it does not, the panel says only "Der
Preis wurde neu berechnet."

If the assignment has disappeared entirely (someone else's action closed it), the sheet becomes
informational — "Diese Aufgabe ist nicht mehr dir zugewiesen." — with a single *Schließen*
action, and the list refetches.

### 4.7 When buying out is not possible

Not enough points, `maximumBuyoutsPerWeek` reached, buyout disabled for this task, or buyout
disabled household-wide. In all of these cases the option is **shown, visibly unavailable, with
the reason spelled out**. It is never hidden and never silently disabled:

> **Freikauf nicht möglich** — Du hast 4 Punkte, der Freikauf kostet 6. In diesem Haushalt
> sind negative Punktestände nicht erlaubt.

> **Freikauf nicht möglich** — Du hast diese Woche schon 2 Aufgaben abgegeben. Mehr sind nicht
> vorgesehen.

> **Freikauf nicht möglich** — Für diese Aufgabe ist das Abgeben abgeschaltet.

Hiding the option would make the rule invisible, and §31 forbids hidden rules. A greyed-out
button with no explanation is the same failure with extra steps. The card keeps its full
geometry so the layout does not shift, is rendered at reduced contrast with
`aria-disabled="true"` (focusable, so a screen reader can reach the explanation), and the
reason sits inside it. `blockedReason` comes from the server as an enum; the German text is
client-side (§9.3).

### 4.8 Deliberately not done

- No animated points counter ticking down. It dramatises a loss.
- No confetti, sound, or celebration when a task is completed. A quiet confirmation and a
  ledger entry.
- No "Bist du sicher? Du verlierst 6 Punkte!" — one confirmation, neutral wording, no
  exclamation marks.
- No social pressure copy ("Sonst muss es jemand anderes machen", "Deine Familie wartet").
- No comparison to other members anywhere on this screen.
- No badge, streak, or level attached to accepting assignments.

---

## 5. Component model

### 5.1 Tree

```
<QueryClientProvider>
  <SessionGate>                     ← blocks render until GET /members/me settles
    <ToastProvider>                 ← owns the single aria-live region
      <RouterProvider>
        <AppShell>                  ← AppBar · <Outlet/> · BottomNav | SideRail
          ├── LoginPage
          ├── DashboardPage
          │     ├── PendingDecisionCard
          │     ├── BalanceCard
          │     ├── SectionHeader ("Für mich" / "Familie")
          │     ├── MyTaskRow[]
          │     ├── TaskCard[]           (top 3)
          │     ├── DueSoonList
          │     ├── HouseholdSummary
          │     └── RecentEventsCard
          ├── TaskListPage
          │     ├── FilterChips · SortSelect
          │     └── TaskCard[]
          ├── TaskDetailPage
          │     ├── TaskSummaryCard         (ValueChip, ValueLadder)
          │     ├── DecisionPanel  ← only when assigned to me & origin RANDOM
          │     │     ├── BalanceLine
          │     │     ├── ChoiceCard  ×2   (identical component)
          │     │     │     └── ConsequenceList
          │     │     └── LaterLink
          │     ├── VolunteerAction         (when AVAILABLE)
          │     ├── CompleteAction          (when held by me)
          │     └── ConfirmSheet            (portal; one instance, driven by state)
          │           ├── ConsequenceList
          │           └── QuoteChangedPanel
          ├── FairnessPage
          │     ├── ExcludedList
          │     ├── WeightBars
          │     ├── RelaxedConstraintNotice
          │     └── Disclosure "Wie wird gewichtet?"
          ├── HistoryPage
          │     ├── FilterChips
          │     └── HistoryTimeline → DayGroup → HistoryEntry[]
          ├── AccountPage
          │     ├── BalanceCard · FairnessIndicator · SettingsList
          │     └── (admin) AdminEntry
          ├── LedgerPage → TransactionRow[]
          └── admin/*  (lazy chunk)
                ├── RulesPage → RuleGroupTabs → Field* + RulePreviewCard + SaveDiffSheet
                ├── TaskDefinitionsPage / TaskDefinitionForm (RecurrenceField)
                ├── MembersPage / MemberForm (RestrictionFields)
                ├── CategoriesPage
                ├── AssignmentRunPage (reuses WeightBars for Probelauf)
                └── AuditLogPage
```

### 5.2 Shared components and prop shapes

Identifiers are English; every user-visible string comes from `strings/de.ts`. Mixed-language
identifiers age badly, and putting all copy in one module is what makes the dark-pattern review
in §9 possible.

```ts
// ---- domain view types (mirror the API; live in packages/shared) ----
type TaskStatus = 'DRAFT'|'AVAILABLE'|'ASSIGNED'|'COMPLETED'|'CANCELLED'|'PAUSED'|'EXPIRED'|'OVERDUE';
type AssignmentOrigin = 'VOLUNTARY' | 'RANDOM';

type TaskInstanceView = {
  id: string; definitionId: string;
  title: string; description?: string;
  category: { id: string; name: string };
  baseValue: number; currentValue: number; buyoutCount: number;
  status: TaskStatus;
  dueAt?: string; estimatedMinutes?: number;
  assignment?: {
    id: string; memberId: string; displayName: string;
    origin: AssignmentOrigin; assignedAt: string; respondByAt?: string;
    status: 'PENDING'|'ACCEPTED'|'COMPLETED'|'BOUGHT_OUT'|'RELEASED';
  };
  canVolunteer: boolean;                 // server-decided, never inferred client-side
  blockedReason?: ActionBlockedReason;
};

// ---- the signature pair ----
type ValueChipProps = {
  value: number; baseValue: number; buyoutCount: number;
  size?: 'sm'|'md'|'lg';
  showBase?: boolean;                    // default true
};

type ValueLadderProps = {
  steps: number[];                       // e.g. [4, 6]  — history including current
  next?: number;                         // ghosted preview, e.g. 9
  emphasis?: 'current'|'next';
  ariaLabel?: string;                    // overrides the generated sentence
};

// ---- the fairness-critical pair ----
type ConsequenceRow = {
  label: string;                         // "Kontostand danach"
  value: string;                         // "18"
  note?: string;                         // "von 24" | "unverändert"
  tone?: 'neutral'|'debit'|'credit';     // affects the sign glyph only, never the weight
};

type ChoiceCardProps = {
  label: string;                         // "Für 6 Punkte freikaufen"
  consequences: ConsequenceRow[];        // always the same rows in the same order
  onSelect: () => void;
  disabled?: boolean;
  disabledTitle?: string;                // "Freikauf nicht möglich"
  disabledReason?: string;               // full sentence, rendered inside the card
  describedById: string;                 // -> the ConsequenceList, for aria-describedby
};
// NOTE: there is intentionally no `variant`, `tone`, `emphasis` or `primary` prop.
// Weight parity between the two options is guaranteed structurally, not by discipline.

type ConfirmSheetProps = {
  open: boolean; onOpenChange: (o: boolean) => void;
  title: string; subtitle?: string;
  transitions: Array<{ label: string; from: number; to: number }>;  // 24 → 18
  body?: React.ReactNode;                // the consequence sentence
  freshness?: { checkedAt: string };     // "Preis vom Server bestätigt · gerade eben"
  confirmLabel: string; onConfirm: () => void;
  state: 'idle'|'submitting'|'quote-changed'|'gone'|'error';
  newQuote?: BuyoutQuote;                // drives QuoteChangedPanel
  error?: ApiError;
};

// ---- the rest ----
type TaskCardProps   = { task: TaskInstanceView; onAction?: (a: TaskAction) => void; compact?: boolean };
type StatusBadgeProps= { status: TaskStatus; overdueSince?: string };
type CategoryTagProps= { name: string };
type PointsAmountProps = { amount: number; showSign?: boolean };          // tabular, ±
type MemberAvatarProps = { member: MemberRef; size?: 'sm'|'md'; showName?: boolean };
type WeightBarsProps = { rows: Array<{ memberId: string; name: string; weight: number; selected: boolean; isMe: boolean }> };
type HistoryEntryProps = { event: TaskHistoryEvent; onOpen?: (e: TaskHistoryEvent) => void };
type EmptyStateProps = { title: string; body: string; action?: { label: string; onPress: () => void }; illustration?: 'tasks'|'history'|'ledger'|'filter' };
type ErrorStateProps = { error: ApiError; onRetry?: () => void };
type SkeletonProps   = { variant: 'card'|'row'|'timeline'|'form'; count?: number };
type FieldProps      = { id: string; label: string; hint?: string; error?: string; children: React.ReactNode };
type StepperFieldProps = { id: string; label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string };
type SheetProps      = { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode };
```

`ConsequenceList`, `ConfirmSheet`, `ValueChip`, `ValueLadder`, `TaskCard`, `StatusBadge`,
`EmptyState`, `ErrorState`, `Skeleton`, `Field` and the form primitives are shared across
member and admin routes. `ChoiceCard` is used only on the decision screen — deliberately, so
that no other screen can grow a "primary option" habit that leaks back into it.

### 5.3 Where state lives

| Kind | Owner | Examples |
|---|---|---|
| Server state | TanStack Query cache — the only copy | tasks, quotes, balance, ledger, history, config, members, audit |
| Session identity | `SessionGate` context, hydrated from `['session']` query | `me`, `household`, `role` |
| Ephemeral UI | local `useState` in the owning component | sheet open, filter chips, disclosure open, sort |
| Form drafts | `useState` in the form (admin only), reset on server confirm | rules form, task definition form |
| Announcements | `ToastProvider` context + one `aria-live` node | "Freikauf durchgeführt." |

There is no Redux, Zustand, Jotai or context-based domain store. Every candidate for global
client state in this app turned out to be server state; adding a store would create a second
copy of numbers whose whole point is that the server owns them.

### 5.4 Data fetching: TanStack Query v5

Chosen over hand-rolled `useEffect` fetching and over a router loader-only approach because
this app's central problem is **cache invalidation across users**: any mutation by anyone can
change what everyone else sees. Query gives declarative invalidation, focus refetching,
request deduplication, and a retry policy per query — roughly 13 KB gz for machinery that
would otherwise be written badly by hand.

Configuration:

```
defaultOptions.queries = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: true,
  retry: (count, err) => err.status >= 500 && count < 2,   // never retry 4xx
}
```

Three standing rules:

1. **No optimistic updates on anything that touches points or task value.** Not on volunteer,
   not on complete, not on buyout. An optimistic balance that snaps back after a 409 shows the
   user a number that was never true — a cosmetic version of exactly the client-authoritative
   points §36 prohibits. Mutations show in-button progress and wait for the server. Optimistic
   updates are permitted only for genuinely local, non-binding state (marking a notification
   read).
2. **Mutations return the authoritative post-state** and it is written into the cache with
   `setQueryData` before the invalidations fire, so the screen never flashes stale numbers.
3. **`retry: false` on all mutations.** A silently retried buyout is a double charge risk;
   idempotency is the server's business (PRD §6) but the client should not be generating
   duplicates.

### 5.5 Query keys and invalidation

```
['session']
['dashboard']
['tasks','available']
['tasks','assigned-to-me']
['tasks', instanceId]
['assignments', assignmentId, 'quote']
['assignments', assignmentId, 'explanation']
['members','me','points']
['members','me','transactions', cursor]
['history', { taskId, memberId, cursor }]
['config','public']
['admin','config'] ['admin','tasks'] ['admin','members'] ['admin','categories'] ['admin','audit', filters]
```

| Mutation | `setQueryData` | `invalidateQueries` |
|---|---|---|
| `volunteer(instanceId)` | `['tasks', id]` | `['dashboard']`, `['tasks']`, `['history']` |
| `accept(assignmentId)` | `['tasks', id]` | `['dashboard']`, `['tasks','assigned-to-me']`, `['history']` |
| `complete(assignmentId)` | `['tasks', id]` | `['dashboard']`, `['tasks']`, `['history']`, `['members','me']` |
| `buyout(assignmentId)` | `['tasks', id]`, `['assignments', id,'quote']` | `['dashboard']`, `['tasks']`, `['history']`, `['members','me']` |
| `release(assignmentId)` | `['tasks', id]` | `['dashboard']`, `['tasks']`, `['history']` |
| `runAssignments()` (admin) | — | `['dashboard']`, `['tasks']`, `['history']`, `['admin','audit']` |
| `saveConfig(patch)` | `['admin','config']` | `['config','public']`, `['tasks']`, `['assignments']`, `['dashboard']`, `['admin','audit']` |
| `saveTaskDefinition()` | `['admin','tasks']` | `['tasks']`, `['dashboard']` |
| `saveMember()` | `['admin','members']` | `['dashboard']`, `['admin','audit']` |

`saveConfig` invalidating `['assignments']` matters: a multiplier change makes every open
buyout quote wrong, and §4.6's stale-quote path must fire rather than let someone confirm an
obsolete price.

### 5.6 Error mapping

One `ApiError = { status: number; code: string; message?: string; data?: unknown }` and one
mapping table, so every screen fails the same way.

| Status / code | Handling |
|---|---|
| `401` | Clear session cache, redirect `/anmelden?next=<path>` |
| `403` | Inline `ErrorState`: "Dafür fehlen dir die Rechte." |
| `404` | Inline: "Diese Aufgabe gibt es nicht mehr." + back |
| `409 TASK_ALREADY_TAKEN` | Sheet → "{Name} war schneller — die Aufgabe ist schon vergeben."; refetch list |
| `409 QUOTE_STALE` | Sheet → `QuoteChangedPanel` with the server's new quote (§4.6) |
| `409 ASSIGNMENT_CLOSED` | Sheet → "Diese Aufgabe ist nicht mehr dir zugewiesen." |
| `422` | Field-level errors + a summary at the top of the form linking to the first invalid field |
| `429` | "Zu viele Versuche. Bitte in {n} Sekunden erneut." Actions disabled until then |
| `5xx` / network | `ErrorState` with retry; the last good cached data stays visible underneath |
| offline | Persistent banner; all mutating controls disabled with that reason as their title |

### 5.7 Component library, styling and bundle

**Recommendation: Radix UI primitives (per-package, only what is used) plus hand-written CSS
Modules over a custom-property token layer. No Tailwind, no CSS-in-JS, no full component kit.**

*Why not a full kit.* MUI, Chakra and Mantine each cost 80–110 KB gz before a single line of
product code, and every one of them ships an opinionated button hierarchy — `contained` vs
`outlined`, `filled` vs `light` — that encodes a primary/secondary relationship in its API. The
decision screen's central requirement is that two options carry equal weight. Building that on
top of a system whose defaults assume a primary action means fighting the library at the exact
point where a mistake is most costly. Their default touch targets are also wrong for this app:
MUI's `IconButton` is 40 px; this design's floor is 48 px.

*Why not shadcn/ui.* It is not a dependency, which is genuinely appealing, but it arrives with
Tailwind, `class-variance-authority`, and a large set of pre-styled components with a widely
recognisable default look. For a design that is trying to be specific to this product, more
effort would go into removing its identity than into writing the CSS.

*Why not fully hand-rolled.* Four things in this app are hard to get right and easy to get
subtly wrong: modal focus trapping and restoration, scroll locking behind a sheet, roving
tabindex in the tab bars, and listbox keyboard semantics. Those are precisely the parts of the
decision screen a screen-reader user depends on. Radix ships them, unstyled, tested, and per
primitive.

*What ships:* `@radix-ui/react-dialog` (sheets, confirmations), `react-tabs`, `react-select`,
`react-switch`, `react-accordion` (disclosures), `react-radio-group` (filter chips),
`react-visually-hidden`, `react-toast`. Roughly 25–30 KB gz combined.

*Styling.* CSS Modules with a `:root` custom-property token layer. Zero runtime, first-class in
Vite with no config, scoped class names, and a single place where colour and type tokens live —
which is what dark mode, `prefers-contrast` and any future household theming would all need
anyway. Tailwind was rejected mainly because the "equal visual weight" constraint has to be
reviewable: `.choiceCard { border: 2px solid var(--ink-2) }` used twice is auditable in a way
that two long utility strings are not.

*Budget.* React 18 ≈ 45 · react-router ≈ 12 · TanStack Query ≈ 13 · Radix subset ≈ 28 ·
lucide (≈ 18 icons) ≈ 4 · app code ≈ 45 → **≈ 147 KB gz** for member routes, inside the 180 KB
target. `/verwaltung/*` is a separate lazy chunk. Fonts: two variable faces, self-hosted, woff2,
subset to `latin` + `latin-ext` → ≈ 65 KB.

*PWA.* `vite-plugin-pwa`, standalone display, maskable icon, `theme-color` per colour scheme.
Service worker precaches the shell and serves GETs `NetworkFirst` with a cache fallback.
**Mutations are never queued for background sync.** A buyout replayed after reconnection would
execute at a price the user cannot have seen and against a task that may already have moved on
— exactly what §4.6 exists to prevent. Offline, the app is readable and honest about it.

---

## 6. Design language

### 6.1 Typography

Two self-hosted variable webfonts plus the system monospace stack. Self-hosted rather than via
Google's CDN: no third-party request from a family's private app, a simpler CSP, and the PWA
works offline on first repeat visit.

| Role | Face | Notes |
|---|---|---|
| Display, headings, all numerals | **Bricolage Grotesque** (variable, `wght` 400–800, `wdth` 75–100, `opsz`) | SIL OFL. Engineered but slightly irregular letterforms; its digits have real character, which matters when a number is the product. Full `latin-ext` coverage for umlauts and ß. |
| Body, UI, labels | **Instrument Sans** (variable, `wght` 400–700) | SIL OFL. Humanist, holds up at 13–16 px, wide enough for German compounds without looking cramped. |
| Timestamps, ledger, audit payloads | `ui-monospace, SFMono-Regular, "Segoe UI Mono", Menlo, Consolas, monospace` | 0 bytes. Gives the history and ledger the Kontoauszug quality they should have. |

Fallbacks: `Bricolage Grotesque, "Segoe UI", system-ui, sans-serif` and
`Instrument Sans, "Segoe UI", system-ui, sans-serif`; `font-display: swap`; metric-adjusted
fallback via `size-adjust` to keep CLS near zero.

Scale (16 px root, mobile values; `--bp-md` adds one step to display and h1 only):

| Token | Size / line | Face & weight | Use |
|---|---|---|---|
| `--t-display` | 40 / 1.05, `-0.02em` | Bricolage 700 | Balance figure, value chip at `lg` |
| `--t-h1` | 28 / 1.15, `-0.015em` | Bricolage 600 | Screen titles, "Du wurdest ausgewählt" |
| `--t-h2` | 22 / 1.2 | Bricolage 600 | Card titles, section heads |
| `--t-h3` | 18 / 1.3 | Instrument 600 | Choice card labels, task titles |
| `--t-body` | 16 / 1.5 | Instrument 400 | Everything prose |
| `--t-body-sm` | 14 / 1.45 | Instrument 400 | Meta lines, consequence rows |
| `--t-label` | 13 / 1.3, `+0.01em` | Instrument 500 | Field labels, eyebrows |
| `--t-mono` | 13 / 1.5 | system mono | Timestamps, amounts in the ledger |

Rules:

- **No uppercase anything.** German compounds in caps (`AUFGABENWERT DANACH`) are close to
  unreadable and read as shouting. Eyebrows are sentence case at `--t-label` in muted ink.
- `font-variant-numeric: tabular-nums lining` on every numeric element so ledger columns align
  and a value does not shift horizontally when it changes 9 → 14.
- German typographic conventions: `−` (U+2212) for negative amounts, not a hyphen; `·` as the
  meta separator; decimal comma ("1,5"); `–` for ranges. Copy uses `„…"` only where a quotation
  is unavoidable.
- Body copy `max-width: 62ch`; `hyphens: auto` with `lang="de"` on `<html>`.
- The `wdth` axis is used once, deliberately: the value chip's numeral widens by one step at
  escalation tier ≥ 2, so a highly-escalated value is physically larger without changing the
  chip's box.

### 6.2 Spacing and layout

4 px base scale: `--s-1 4`, `--s-2 8`, `--s-3 12`, `--s-4 16`, `--s-5 20`, `--s-6 24`,
`--s-7 32`, `--s-8 40`, `--s-9 56`, `--s-10 72`.

- Screen gutter 16 (base) / 24 (`--bp-sm` and up).
- Card padding 16 / 20; gap between cards 12; gap between sections 32.
- Radii: `--r-sm 8` (chips, inputs), `--r-md 12` (cards), `--r-lg 16` (sheets),
  `--r-full 999` (avatars only). No 4 px or 24 px radii — three steps is enough.
- Elevation is restrained: cards use a 1 px hairline plus `0 1px 2px rgba(20,26,34,.06)`;
  sheets get `0 -8px 32px rgba(20,26,34,.16)`. No elevation is used to signal importance —
  that would reintroduce hierarchy on the decision screen through the back door.
- Sticky bottom action bars carry `padding-bottom: max(var(--s-4), env(safe-area-inset-bottom))`.
- `dvh`, not `vh`, for full-height layouts, so the mobile URL bar does not clip the last button.

### 6.3 Colour roles

The neutral is a cool tile grey, the interactive accent is **Waschblau** — the ultramarine
laundry blueing that German households used to whiten linen, which is a more specific place to
start than a default product blue — and the value ramp is brass. Contrast ratios below are
against the stated background.

**Light**

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--ground` | `#EEF1F4` | page background | — |
| `--surface` | `#FFFFFF` | cards, sheets | — |
| `--hairline` | `#D5DDE5` | non-essential separators | — |
| `--ink` | `#141A22` | primary text | 17.5:1 on surface |
| `--ink-2` | `#4A5765` | secondary text, **ChoiceCard borders** | 8.0:1 |
| `--ink-3` | `#5C6B7A` | muted meta text | 5.7:1 |
| `--accent` | `#2B3FA0` | links, focus ring, single-action buttons | 8.9:1 |
| `--accent-soft` | `#EDF0FA` | info surfaces | — |
| `--success` | `#2F6B4F` | completion confirmations only | 6.4:1 |
| `--danger` | `#A8231F` | destructive admin actions, validation errors only | 7.3:1 |

`--danger` never appears on the buyout path, on an overdue task, or on a badge. It is reserved
for "this will delete data" and "this input is invalid".

**Value ramp** (fill / numeral / border), tier = buyout count on the instance:

| Tier | Fill | Numeral | Border | Contrast |
|---|---|---|---|---|
| 0 (at base) | `#FFFFFF` | `--ink` | `--hairline` | 17.5:1 |
| 1 | `#FBF0D8` | `#71510F` | `#E4CF9B` | 6.7:1 |
| 2 | `#F8E5B8` | `#5F420A` | `#D9BC72` | 7.6:1 |
| 3+ | `#F2D48D` | `#4C340A` | `#C9A44E` | 8.1:1 |

**Dark** (`prefers-color-scheme: dark`, plus an explicit toggle in `/ich`): `--ground #141A22`,
`--surface #1D2530`, `--hairline #2E3846`, `--ink #EAEFF5`, `--ink-2 #B3BECB`,
`--ink-3 #94A1B0`, `--accent #8E9DF0` (7.0:1 on ground), value fills `#3A2E12 / #4A3A14 /
#5A4616` with numerals `#F5DFA3 / #F7E4AE / #FAEBC0`. Every colour is defined on bare `:root`
first and only redefined inside the dark block.

`prefers-contrast: more` promotes `--hairline` to `--ink-3` and thickens focus rings to 4 px.

### 6.4 Representing task value — rising must read as attractive

This is the design's central colour problem. A task at 14 when its base is 4 is the *best paid
work in the household*, and the interface must say so without cheerleading.

1. **The ramp never leaves the gold family** (hue ≈ 35–45°). Red and orange-red are excluded
   from the ramp entirely. Escalation increases *saturation and depth*, which reads as denser,
   more valuable material — brass going to gold — rather than as a rising alarm.
2. **Escalation increases weight, not urgency.** The chip fill darkens, the border strengthens,
   and at tier ≥ 2 the numeral gains one `wdth` step. Nothing pulses, flashes, or animates on
   its own.
3. **The base value is always adjacent.** `9 · Basiswert 4` means the reader sees a *rise*,
   which is a fact about the task's history, rather than a large number with no reference point.
4. **The ladder tells the story.** `4 ─▸ 6 ─▸ 9` on detail screens; `×2 freigekauft` on cards.
5. **Copy states facts, in the second person, about the reward.** "Wer sie freiwillig übernimmt,
   erhält 9 Punkte." Not "Niemand will diese Aufgabe" (shaming) and not "Jetzt zuschlagen!"
   (selling).
6. **No names on the public card.** Who escalated a task is in the history, where it belongs.
7. **Colour is never the only carrier.** The buyout count and the base value are always present
   as text, so the ramp is decoration on top of information, and a colour-blind reader loses
   nothing.

### 6.5 Touch targets and ergonomics

- Minimum interactive size **48 × 48 px** including invisible slop (WCAG 2.2 AA asks 24; 48 is
  the comfortable floor on a phone held one-handed). Primary CTAs are 56 px tall and full width
  minus gutters.
- Minimum 8 px between adjacent targets; the two `ChoiceCard`s sit 12 px apart so a thumb
  cannot bridge them.
- Bottom nav 56 px plus the safe-area inset; nothing interactive within 16 px of the bottom
  edge before the inset is applied.
- Decision and confirmation actions sit in the lower half of the screen, inside the natural
  thumb arc. Destructive admin actions deliberately do not — they live at the end of a scroll.
- No swipe-to-act, anywhere. Every action has a visible, labelled control; hidden gestures are
  hidden rules.
- `touch-action: manipulation` on controls to remove the 300 ms tap delay; `user-select: none`
  on buttons.

### 6.6 Motion

Motion is used for orientation, never for delight and never to draw attention to one option.

| Movement | Duration / easing |
|---|---|
| Sheet in | 220 ms `cubic-bezier(.32,.72,0,1)`, translateY |
| Sheet out | 160 ms ease-in |
| Card press | 90 ms, `translateY(1px)` + border darken |
| Route change | 120 ms opacity only, no slide |
| Value ladder step reveal | 180 ms opacity + 4 px translate on the ghosted step |
| Skeleton shimmer | 1.4 s linear, opacity only |

Under `prefers-reduced-motion: reduce`: all durations drop to 1 ms except opacity fades, which
drop to 100 ms; sheets fade instead of sliding; the shimmer becomes a static tint; nothing
auto-scrolls. **No information is carried by motion** — the ladder's ghosted next step is a
static visual state, so a reader who never sees the transition sees the same facts.

### 6.7 Iconography

`lucide-react` with per-icon imports and `strokeWidth={1.75}` (lighter than the 2 px default, to
sit with Instrument Sans rather than shout over it), roughly 18 icons: back, search, filter,
chevron, check, clock, calendar, repeat, user, users, settings, shield, info, alert-triangle,
x, plus, minus, external-link. Three custom inline SVGs carry the product's own vocabulary: the
value chip mark, the ladder step arrow, and the fairness balance.

Icons are always paired with a text label except for back, close and search, which are
universally understood and carry `aria-label`. No icon ever encodes a state that is not also in
text.

### 6.8 "Spielerisch, aber nicht kindlich" — concretely

**Playful is:** Bricolage Grotesque's slightly irregular, engineered letterforms in headings and
numerals; a warm brass value ramp instead of a corporate blue-only palette; 12 px radii and a
squircle value chip; the ladder as a small piece of visual storytelling; copy with a light,
direct voice ("Paul war schneller").

**Childish would be, and is excluded:** emoji as functional UI (avatars only, user-chosen);
cartoon mascots or illustrated characters; confetti, sound effects, or celebration animation;
rounded-bubble display faces (Nunito, Quicksand, Baloo, Comic-anything); rainbow category
colours — categories get muted tints from one hue family at matched chroma; exclamation marks
in system copy; badges, streaks, levels, XP, trophies, medals, or "Du bist auf Platz 2";
diminutives and baby-talk in German copy; filled cartoon glyph icons.

The test that decides borderline cases: *would this feel patronising to the adult in the
household who is doing the most work?* If yes, it is out.

---

## 7. Empty, loading and error states

### 7.1 Loading

- **Route load:** skeletons matching the final layout's box model — card-shaped for lists,
  row-shaped for the timeline, never a centred spinner. Skeletons render only after 150 ms
  (nothing flashes for fast responses) and then stay at least 250 ms (nothing flickers).
- **Mutation:** the invoking button becomes disabled with an inline spinner and a
  present-progressive label — "Wird übernommen…", "Wird freigekauft…", "Wird gespeichert…".
  Surrounding content does not move, blur, or grey out.
- **Background refetch:** no visual change at all, except the "Die Werte wurden gerade
  aktualisiert." note on the decision screen when figures actually changed.

### 7.2 Empty states

Every empty state names what is missing and, where the user can act, offers the action.

| Where | Copy |
|---|---|
| **First run, admin** | "Noch keine Aufgaben" · the three-step explanation (below) · `[Erste Aufgabe anlegen]` `[Beispielaufgaben übernehmen]` |
| **First run, member** | "Noch keine Aufgaben. Sobald {Admin} welche anlegt, erscheinen sie hier." |
| No available tasks | "Gerade nichts offen. Die nächste Aufgabe ist {Titel} am {Datum}." |
| Nothing assigned to me | "Dir ist gerade nichts zugewiesen." |
| No tasks I hold | "Du hast gerade keine Aufgabe übernommen." |
| Empty history | "Noch nichts passiert. Sobald eine Aufgabe angeboten wird, steht es hier." |
| Empty ledger | "Noch keine Punktebewegungen." |
| Filtered to nothing | "Keine Einträge für diesen Filter." · `[Filter zurücksetzen]` |
| Empty audit log | "Noch keine Einträge im Protokoll." |

None of these congratulate ("Super, alles erledigt!") or reproach. An empty task list means the
household is up to date, and that is a fact, not an achievement.

**The first-run screen** is the one that has to teach the whole economy, because the rules are
unusual and nobody reads a manual:

```
┌──────────────────────────────────────────────┐
│ ☰  Haushaltsauktion          Demo Family ▾   │
├──────────────────────────────────────────────┤
│                                              │
│  Noch keine Aufgaben                         │
│                                              │
│  So funktioniert es:                         │
│                                              │
│  1  Wer eine Aufgabe freiwillig übernimmt    │
│     und erledigt, bekommt ihren Wert als     │
│     Punkte.                                  │
│                                              │
│  2  Was niemand übernimmt, wird verlost.     │
│     Zugeloste Aufgaben bringen keine Punkte. │
│                                              │
│  3  Wer eine zugeloste Aufgabe abgibt, zahlt │
│     Punkte — und ihr Wert steigt für alle    │
│     anderen.                                 │
│                                              │
│  [       Erste Aufgabe anlegen            ]  │
│  [       Beispielaufgaben übernehmen      ]  │
│                                              │
└──────────────────────────────────────────────┘
```

Three numbered steps, because this *is* a sequence — the loop's order is the information, which
is the only condition under which numbered markers earn their place. *Beispielaufgaben
übernehmen* installs the six §38 seed tasks into a real household; a fresh household with
nothing in it cannot demonstrate anything, and typing six chores before seeing the app work is a
poor first five minutes. The same three sentences remain available afterwards under
`/ich → Wie funktioniert das?`.

### 7.3 Errors

Covered as a table in §5.6. Three principles behind it:

- **The last good data stays visible.** A failed refetch renders an error strip above stale
  content, never a blank screen — a stale task list is more useful than nothing.
- **Errors say what happened and what to do**, in the interface's voice, without apologising:
  "Die Aufgaben konnten nicht geladen werden. Prüfe deine Verbindung." + `[Erneut versuchen]`.
- **Conflicts are not failures.** Losing a race to a volunteer is a normal outcome of a shared
  system. "Paul war schneller — die Aufgabe ist schon vergeben." is neutral information, styled
  as a notice, not as an error.

Offline is a persistent, dismissible-per-session banner beneath the app bar: "Offline — du
kannst Aufgaben ansehen, aber gerade nichts übernehmen." All mutating controls become disabled
with that sentence as their accessible description.

---

## 8. Accessibility

Target: WCAG 2.2 AA, verified in CI with axe-core in the Playwright run on the dashboard, the
task list, the decision screen with a sheet open, and the admin rules form.

**Contrast.** Every pair in §6.3 is listed with its measured ratio and every one is ≥ 4.5:1 for
text. Non-text boundaries that identify a control — the two `ChoiceCard` borders, input borders,
the focus ring — are ≥ 3:1 against both their fill and the page ground (WCAG 1.4.11).
`--hairline` is used only for decorative separation, never to delimit a control.

**Focus.** `:focus-visible` only, a 3 px `--accent` outline with a 2 px offset in the surface
colour so it reads on both white cards and the grey ground (4 px under `prefers-contrast:
more`). `outline: none` without a replacement is banned by lint. Focus is never trapped outside
a dialog; Radix restores focus to the invoking element when a sheet closes.

**Focus order on the decision screen** — the screen this section exists for:

1. `<h1>` "Du wurdest ausgewählt" — receives programmatic focus on mount, `tabIndex={-1}`
2. Task summary card (static; the value chip carries an `aria-label`, see below)
3. "Warum wurde mir das zugewiesen?" link
4. `ChoiceCard` "Aufgabe übernehmen"
5. `ChoiceCard` "Für 6 Punkte freikaufen"
6. "Später entscheiden"

No autofocus on 4 or 5. Enter on arrival does nothing.

**Screen-reader labelling of the decision.** Each option is a real `<button>`. Its accessible
*name* is the short label; its accessible *description* is the consequence list, wired with
`aria-describedby`, so a screen reader announces:

> "Für 6 Punkte freikaufen, Schaltfläche. Punkte minus 6. Kontostand danach 18, von 24.
> Aufgabenwert danach 9, von 6."

and for the other option:

> "Aufgabe übernehmen, Schaltfläche. Punkte 0. Kontostand danach 24, unverändert.
> Aufgabenwert danach 6, unverändert."

The consequences are therefore never visual-only, and the two announcements are the same length
and structure — the auditory equivalent of equal visual weight. Additional labelling:

- The value chip: `aria-label="Aktueller Wert 6 Punkte, Basiswert 4, einmal freigekauft"`, with
  the decorative numeral marked `aria-hidden`.
- The value ladder: `aria-label="Wertverlauf: 4, dann 6, nach einem Freikauf 9"` on the
  container, children `aria-hidden`. The ghosted "next" step is announced as a prediction, not
  a fact.
- `−6` uses the minus sign U+2212, which is announced as "minus"; a hyphen-minus is often
  announced as "Bindestrich" or skipped entirely. This is why `PointsAmount` owns the glyph.
- A disabled buyout option keeps `aria-disabled="true"` rather than the `disabled` attribute, so
  it stays focusable and its reason is reachable.
- Result announcements go to a polite `aria-live` region: "Freikauf durchgeführt. Neuer
  Punktestand 18. Neuer Aufgabenwert 9." Failures use `role="alert"`.
- The `QuoteChangedPanel` mounts with `role="alert"` — a price change while a confirm button is
  armed must interrupt.

**Structure.** One `<h1>` per screen; sections use `<section aria-labelledby>`; the history is
an `<ol>` of day groups each containing an `<ol>` of events; consequence lists are `<dl>`; the
bottom nav is `<nav aria-label="Hauptnavigation">` with `aria-current="page"`. The dialog is
Radix's, so `aria-modal`, Escape, scroll lock and focus restoration come with it.

**Language and input.** `lang="de"` on `<html>` so screen readers use German pronunciation and
`hyphens: auto` works. Form controls always have a real `<label>`; hints and errors are wired
with `aria-describedby`; `aria-invalid` on failed fields; the 422 summary links to the first
invalid field.

**Motion and orientation.** `prefers-reduced-motion` handled as in §6.6. Nothing depends on
device orientation. Text reflows to 320 px CSS width without horizontal scrolling and survives
200 % zoom (WCAG 1.4.10) — verified by the Playwright mobile assertion the PRD already lists as
end condition 22.

**Keyboard.** Every action reachable and operable by keyboard; filter chips are a radiogroup
with arrow-key navigation; the admin steppers respond to arrow keys and accept direct typing.

---

## 9. Copy deck (German)

All user-visible strings live in `apps/web/src/strings/de.ts`. One file, so the §31 review is a
single read. Conventions: sentence case, no exclamation marks, `Du`-form throughout (a family
app), `−` U+2212 for negatives, decimal comma, `·` as separator.

### 9.1 Navigation and actions

| Key | Text |
|---|---|
| `nav.start` / `nav.tasks` / `nav.history` / `nav.account` | Start · Aufgaben · Verlauf · Ich |
| `nav.admin` | Verwaltung |
| `action.volunteer` | Freiwillig übernehmen |
| `action.accept` | Aufgabe übernehmen |
| `action.buyout` | Für {cost} Punkte freikaufen |
| `action.complete` | Als erledigt markieren |
| `action.release` | Aufgabe zurückgeben |
| `action.later` | Später entscheiden |
| `action.cancel` | Abbrechen |
| `action.retry` | Erneut versuchen |
| `action.loadMore` | Mehr laden |
| `action.saveConfig` | Prüfen & speichern |

### 9.2 Decision screen (§21, §31)

| Key | Text |
|---|---|
| `decision.title` | Du wurdest ausgewählt |
| `decision.currentValue` | Aktueller Wert |
| `decision.balance` | Dein Punktestand |
| `decision.optionsHeading` | Zwei Möglichkeiten |
| `decision.row.points` | Punkte |
| `decision.row.balanceAfter` | Kontostand danach |
| `decision.row.valueAfter` | Aufgabenwert danach |
| `decision.note.unchanged` | unverändert |
| `decision.note.from` | von {value} |
| `decision.afterBuyout` | Nach einem Freikauf wird die Aufgabe erneut angeboten. Wer sie dann freiwillig übernimmt, erhält {newValue} Punkte. |
| `decision.noPointsForRandom` | Diese Aufgabe wurde dir zugelost. Für zugeloste Aufgaben gibt es keine Punkte. |
| `decision.why` | Warum wurde mir das zugewiesen? |
| `confirm.buyout.title` | Freikauf bestätigen |
| `confirm.accept.title` | Aufgabe übernehmen |
| `confirm.freshness` | Preis vom Server bestätigt · {relativeTime} |
| `quote.changed.title` | Der Preis hat sich geändert |
| `quote.changed.body` | Angezeigt war ein Freikauf für {oldCost} Punkte. Er kostet jetzt {newCost} Punkte{reason}. |
| `quote.changed.reason.buyout` | , weil sich in der Zwischenzeit jemand freigekauft hat |
| `quote.changed.reason.config` | , weil eine Regel geändert wurde |
| `quote.changed.confirm` | Zum neuen Preis freikaufen |
| `decision.updated` | Die Werte wurden gerade aktualisiert. |

### 9.3 Blocked actions (§4.7)

| Key | Text |
|---|---|
| `blocked.title` | Freikauf nicht möglich |
| `blocked.insufficientPoints` | Du hast {balance} Punkte, der Freikauf kostet {cost}. In diesem Haushalt sind negative Punktestände nicht erlaubt. |
| `blocked.minimumBalance` | Dein Punktestand darf nicht unter {min} fallen. |
| `blocked.weeklyLimit` | Du hast diese Woche schon {n} Aufgaben abgegeben. Mehr sind nicht vorgesehen. |
| `blocked.consecutiveLimit` | Nach {n} Freikäufen hintereinander ist erst wieder eine erledigte Aufgabe nötig. |
| `blocked.taskDisabled` | Für diese Aufgabe ist das Abgeben abgeschaltet. |
| `blocked.householdDisabled` | In diesem Haushalt ist Freikaufen abgeschaltet. |

### 9.4 History sentences (§22)

| Event type | Sentence |
|---|---|
| `OFFERED` | {task} wurde angeboten — Wert {value} |
| `NO_VOLUNTEER` | Keine freiwillige Übernahme |
| `RANDOM_ASSIGNED` | Zufallszuweisung an {member} |
| `VOLUNTEERED` | {task} freiwillig von {member} übernommen |
| `ACCEPTED` | {member} hat die zugeloste Aufgabe übernommen |
| `BOUGHT_OUT` | {member} kaufte sich für {cost} Punkte frei |
| `VALUE_INCREASED` | Neuer Wert: {value} |
| `COMPLETED` | {task} von {member} erledigt |
| `POINTS_AWARDED` | {member} erhält {points} Punkte |
| `VALUE_RESET` | Aufgabenwert auf {value} zurückgesetzt |
| `RELEASED` | {member} hat die Aufgabe zurückgegeben |
| `EXPIRED` | Angebot abgelaufen |
| `CONFIG_CHANGED` | {member} hat eine Regel geändert: {key} |

### 9.5 Fairness (§32)

| Key | Text |
|---|---|
| `fairness.title` | Warum ich? |
| `fairness.availableCount` | Für diese Aufgabe waren {n} Personen verfügbar. |
| `fairness.excludedCount` | {n} Person(en) wurden ausgeschlossen. |
| `fairness.weightsHeading` | Gewichtung der übrigen Personen |
| `fairness.selected` | ausgewählt |
| `fairness.closing` | Die Auswahl erfolgte zufällig, gewichtet nach diesen Werten. |
| `fairness.strategy.WEIGHTED_FAIRNESS` | Ausgleichende Gewichtung — wer zuletzt seltener zugelost wurde, wird wahrscheinlicher ausgewählt. |
| `fairness.strategy.PURE_RANDOM` | Reiner Zufall — alle berechtigten Personen sind gleich wahrscheinlich. |
| `fairness.strategy.LEAST_ASSIGNED_FIRST` | Wer bisher am seltensten zugelost wurde, kommt zuerst. |
| `fairness.strategy.WEIGHTED_RANDOM` | Gewichteter Zufall nach den eingestellten Kriterien. |
| `reason.LAST_COMPLETED` | hat diese Aufgabe zuletzt erledigt |
| `reason.COOLDOWN` | hatte diese Aufgabe zuletzt zugelost |
| `reason.INACTIVE` | ist derzeit nicht aktiv |
| `reason.ABSENT` | ist gerade abwesend |
| `reason.CATEGORY_EXCLUDED` | ist für diese Kategorie ausgenommen |
| `reason.TASK_EXCLUDED` | ist für diese Aufgabe ausgenommen |
| `reason.MAX_ASSIGNMENTS_REACHED` | hat das Limit für Zuweisungen erreicht |
| `fairness.relaxed` | Die Regel „nicht zweimal hintereinander" musste ausgesetzt werden — sonst wäre niemand übrig geblieben. |

### 9.6 Copy rules for anything not listed

- Never use an exclamation mark in system copy.
- Never praise or reproach: no "Super!", no "Endlich!", no "Das wartet noch auf dich".
- Never invoke other people as pressure ("Deine Familie wartet", "Sonst muss es Maria machen").
- Name the action the same way through the whole flow: the button says *Freikaufen*, the sheet
  says *Freikauf bestätigen*, the confirmation says *Freikauf durchgeführt*, the history says
  *kaufte sich frei*.
- State costs before benefits when both appear in one sentence.
- Errors describe the situation and the next step; they do not apologise.

---

## 10. Build order for Phase 4

Suggested sequence so that the riskiest screen is exercised against the real API early:

1. Token layer, type scale, `AppShell`, bottom nav, login, session gate.
2. `ValueChip`, `ValueLadder`, `ConsequenceList`, `TaskCard`, `Sheet` — the shared vocabulary.
3. **Decision screen end to end**, including the 409 quote-change path. Build this third, not
   last: it is the screen that most constrains the API contract, and finding a gap in the quote
   design in week three is expensive.
4. Task list + volunteer + complete flows.
5. Dashboard (aggregates the above).
6. History and fairness.
7. Admin: rules with the server-side preview, then task definitions, members, categories,
   assignment run, audit log.
8. Empty / error / offline passes; axe-core sweep; 390 × 844 and 320 px checks; reduced-motion
   and dark-mode passes.

---

## 11. What this design needs from the Architecture Agent

Not a redesign of the API — five specific additions to §29, each with the reason it exists.

**11.1 `GET /api/dashboard`** — one aggregate for the dashboard, rather than five parallel
requests on a phone's first paint. Payload listed in §3.2.

**11.2 `GET /api/config/public`** — the member-readable subset of configuration
(`voluntary.rewardTiming`, `voluntary.rewardEnabled`, `buyout.enabled`,
`buyout.allowNegativeBalance`, `assignment.strategy`, `valueIncrease` summary, decay on/off).
The client's copy has to match the household's actual rules; §31 forbids hidden rules, and
hard-coding "du bekommst die Punkte nach Erledigung" while an admin has set `ON_ACCEPT` is a
hidden rule. Must not expose admin-only fields.

**11.3 `POST /api/admin/config/preview`** — dry-run evaluation of a proposed config patch,
returning worked examples (the escalation chain for a sample task, a buyout cost, a decay
projection) and formula parse errors with a character offset. This is what makes §3.7's live
preview possible without ever evaluating a formula in the browser, which §17 and §36 both
forbid.

**11.4 A quote token on buyout.** `GET /api/assignments/:id` (or the task detail) returns the
`BuyoutQuote` in §4.6 including an opaque `quoteToken`; `POST /api/assignments/:id/buyout`
accepts `{ quoteToken }` and responds `409 QUOTE_STALE` with the current quote when it no longer
matches. Without this the client cannot guarantee that the price the user saw is the price they
paid — the core §36 requirement on this screen. The PRD's config-versioning note (§6, Risks)
already implies most of the machinery.

**11.5 `GET /api/assignments/:id/explanation`** — the §32 projection of the audit record:
candidates with weights, exclusions with enum reasons, the selected member, the strategy, and
any relaxed constraints. Reasons must be enums, not prose, so the German lives in the copy deck.

Two smaller requests: a stable machine-readable `code` on every 4xx (§5.6 maps on `code`, not on
message text), and `TaskHistoryEvent` as a discriminated union with typed payload fields rather
than a pre-rendered sentence, so §9.4 owns the wording.

---

## 12. Open questions for the main agent

1. **No leaderboard in the MVP** (§3.8) — a deliberate reading of §19's "optional" plus "darf
   nicht im Zentrum stehen". The unranked fairness bar replaces it. Confirm or overrule.
2. **Symmetric confirmation friction** (§4.4) — both decision options cost two taps. This trades
   against §31's "wenige Klicks" in exchange for removing an asymmetric nudge and protecting
   against a mis-tap that costs points. Confirm.
3. **`Beispielaufgaben übernehmen` on the first-run screen** (§7.2) seeds the six §38 tasks into
   a real household. Confirm that this belongs in the product rather than only in the seed
   script.
4. **The demo login row** (§3.1) is dev-only and flag-guarded. Confirm the build check that
   asserts its absence in production is worth the small amount of tooling.
5. **Two webfonts (~65 KB)** rather than a system stack. If the main agent prefers zero webfont
   bytes, the fallback plan is `system-ui` throughout with the `wdth` escalation cue replaced by
   a weight step; the design survives it but loses most of its character.
