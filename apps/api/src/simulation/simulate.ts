/**
 * §34's simulation engine.
 *
 * CLAUDE.md §34 asks for a developer/test tool that simulates "4 Personen, 20
 * Aufgaben, 1000 Zuweisungszyklen" and analyzes the distribution of random
 * assignments, point evolution, buyout frequency, task-value evolution and
 * systematic bias — without needing a database. This module is that engine:
 * pure, in-memory, seeded, and built by *driving the real domain functions*
 * rather than reimplementing their arithmetic:
 *
 *  - `selectAssignee` / `mulberry32` (`domain/assignment/strategies.ts`) do the
 *    actual weighted-fairness draw, including the eligibility relaxation
 *    ladder.
 *  - `buyoutCost` / `evaluateBuyoutRules` (`domain/buyout/{cost,rules}.ts`)
 *    price and permit each buyout exactly as the API would.
 *  - `increasedValue` / `resetValue` / `voluntaryReward`
 *    (`domain/task/value.ts`) escalate, reset and pay exactly as configured.
 *  - `computePosting` / `verifyLedgerIntegrity`
 *    (`domain/points/ledger-math.ts`) post every point change through the
 *    same posting/chain rules the real ledger enforces, so the run's ledger
 *    can be verified for integrity at the end, not merely trusted.
 *
 * No Prisma, no HTTP, no wall clock — exactly the "Entwicklungswerkzeug oder
 * Test Utility" §34 sanctions. Kept in its own `apps/api/src/simulation`
 * directory, which `eslint.config.js`'s `import/no-restricted-paths` zones
 * already forbid from reaching into `app/` or `infra/` — this file may only
 * ever import from `domain/` and `@haushaltsauktion/shared`.
 *
 * ── Documented assumptions (CLAUDE.md §34 mandates neither rate) ──────────
 *
 *   `DEFAULT_VOLUNTARY_UPTAKE_RATE = 0.35` — the share of task offers taken
 *   voluntarily before any random assignment happens. Plausible for a
 *   household that is genuinely trying, not perfectly cooperative and not
 *   apathetic either.
 *
 *   `DEFAULT_BUYOUT_RATE = 0.4` — the share of *random* assignments a member
 *   elects to buy out rather than complete. High enough that the
 *   escalate → re-offer loop (§9/§10) gets exercised many times over 1000
 *   cycles, which is the scenario most likely to concentrate load unfairly if
 *   the fairness weights were mistuned.
 *
 *   `run.ts` re-runs the whole engine under a few other plausible rate
 *   combinations specifically so the §34 exit condition can be checked for
 *   robustness rather than trusted from a single assumption (task point 5).
 *
 * ── A second, load-bearing simplification ──────────────────────────────────
 *
 *   `FairnessMetrics.randomAssignments` / `.voluntaryCompletions` are kept as
 *   running *cumulative* totals for the whole run rather than windowed to
 *   `fairness.windowDays` the way the production system computes them from
 *   real timestamps. `weightedFairnessWeight` only ever consumes the
 *   *deviation* of a candidate from the candidate-set average — a cumulative
 *   counter still drives exactly the same corrective feedback loop a windowed
 *   one would, it only changes the loop's time constant, not its direction or
 *   its fixed point. `daysSinceLastRandomAssignment` (the recency term) *is*
 *   still bounded at `fairness.windowDays`, matching production, by treating
 *   one simulated cycle as one day.
 *
 *   `cyclesSinceLastRandomAssignmentOfTask` (the immediate-reassignment
 *   cooldown, §13) is tracked precisely: against a per-task offer counter,
 *   which is the unit `assignment.reassignmentCooldownCycles` is actually
 *   defined over in `eligibility.ts`.
 */

import {
  AssignmentKind,
  DEFAULT_CONFIG,
  type FairnessMetrics,
  type HouseholdConfig,
  MemberRole,
  PointTransactionType,
} from '@haushaltsauktion/shared';

import type { EligibilityCandidate } from '../domain/assignment/eligibility.js';
import { mulberry32, selectAssignee } from '../domain/assignment/strategies.js';
import { buyoutCost } from '../domain/buyout/cost.js';
import { evaluateBuyoutRules } from '../domain/buyout/rules.js';
import {
  computePosting,
  previousTransactionIdFor,
  verifyLedgerIntegrity,
  type LedgerEntry,
  type LedgerIntegrityFindings,
} from '../domain/points/ledger-math.js';
import { increasedValue, resetValue, voluntaryReward } from '../domain/task/value.js';

export const DEFAULT_VOLUNTARY_UPTAKE_RATE = 0.35;
export const DEFAULT_BUYOUT_RATE = 0.4;

export interface SimMemberInput {
  id: string;
  displayName: string;
}

export interface SimTaskInput {
  id: string;
  title: string;
  baseValue: number;
  /** Defaults to `true` — §8 "Freikauf bei bestimmten Aufgaben deaktiviert" opted in per task. */
  buyoutEnabled?: boolean;
}

export interface SimulationOptions {
  members: readonly SimMemberInput[];
  tasks: readonly SimTaskInput[];
  cycles: number;
  seed: number;
  cfg?: HouseholdConfig;
  voluntaryUptakeRate?: number;
  buyoutRate?: number;
}

export interface MemberResult {
  memberId: string;
  displayName: string;
  randomAssignments: number;
  voluntaryCompletions: number;
  buyouts: number;
  finalBalance: number;
}

export interface TaskResult {
  taskId: string;
  title: string;
  baseValue: number;
  finalCurrentValue: number;
  maxValueReached: number;
  timesOffered: number;
  timesCompleted: number;
  timesBoughtOut: number;
}

export interface SimulationResult {
  cycles: number;
  seed: number;
  voluntaryUptakeRate: number;
  buyoutRate: number;
  members: MemberResult[];
  tasks: TaskResult[];
  totalVoluntaryCompletions: number;
  totalRandomAssignments: number;
  totalBuyouts: number;
  /** The largest per-member random-assignment count. */
  maxRandomLoad: number;
  /** The mean random-assignment count across all members. */
  meanRandomLoad: number;
  /** §34's exit metric: `maxRandomLoad / meanRandomLoad`. */
  maxMeanRatio: number;
  /** True iff every member absorbed at least one random assignment (ergodicity). */
  everyMemberReached: boolean;
  ledger: LedgerIntegrityFindings;
}

interface InternalMember {
  id: string;
  displayName: string;
  balance: number;
  metrics: FairnessMetrics;
  buyoutsThisWeek: number;
  consecutiveBuyouts: number;
  ledgerTailId: string | null;
}

interface InternalTask {
  id: string;
  title: string;
  baseValue: number;
  currentValue: number;
  maxValueReached: number;
  buyoutCount: number;
  buyoutEnabled: boolean;
  offerCount: number;
  timesCompleted: number;
  timesBoughtOut: number;
}

const DECIDED_AT = '2026-08-30T00:00:00.000Z';

function cooldownKey(memberId: string, taskId: string): string {
  return `${memberId}::${taskId}`;
}

/**
 * Runs the full §34 simulation: `options.cycles` task offers, round-robin
 * across `options.tasks`, each resolved via voluntary uptake or the real
 * `selectAssignee` draw (with a possible buyout), all under a single seeded
 * `mulberry32` RNG so the whole run is bit-for-bit reproducible.
 */
export function runSimulation(options: SimulationOptions): SimulationResult {
  const cfg = options.cfg ?? DEFAULT_CONFIG;
  const voluntaryUptakeRate = options.voluntaryUptakeRate ?? DEFAULT_VOLUNTARY_UPTAKE_RATE;
  const buyoutRate = options.buyoutRate ?? DEFAULT_BUYOUT_RATE;

  if (options.members.length === 0) throw new Error('runSimulation: no members configured.');
  if (options.tasks.length === 0) throw new Error('runSimulation: no tasks configured.');

  const rng = mulberry32(options.seed);

  const members: InternalMember[] = options.members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    balance: 0,
    metrics: {
      randomAssignments: 0,
      voluntaryCompletions: 0,
      buyouts: 0,
      completedTasks: 0,
      totalEstimatedMinutes: 0,
      daysSinceLastRandomAssignment: cfg.fairness.windowDays,
    },
    buyoutsThisWeek: 0,
    consecutiveBuyouts: 0,
    ledgerTailId: null,
  }));
  const membersById = new Map(members.map((m) => [m.id, m]));

  const tasks: InternalTask[] = options.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    baseValue: t.baseValue,
    currentValue: t.baseValue,
    maxValueReached: t.baseValue,
    buyoutCount: 0,
    buyoutEnabled: t.buyoutEnabled ?? true,
    offerCount: 0,
    timesCompleted: 0,
    timesBoughtOut: 0,
  }));

  // Per (member, task): the task's own offer-index at which this member was
  // last *randomly* assigned it. Absent = never (§13's cooldown reads `null`).
  const lastRandomOfferIndex = new Map<string, number>();

  const ledger: LedgerEntry[] = [];
  let assignmentCounter = 0;
  let transactionCounter = 0;

  function postLedgerEntry(
    member: InternalMember,
    amount: number,
    type: PointTransactionType,
    assignmentId: string,
    kind: AssignmentKind,
  ): void {
    const posting = computePosting({
      balanceBefore: member.balance,
      amount,
      type,
      taskAssignmentId: assignmentId,
      assignmentKind: kind,
    });
    transactionCounter += 1;
    const id = `tx-${transactionCounter}`;
    ledger.push({
      id,
      seq: BigInt(transactionCounter),
      memberId: member.id,
      amount: posting.amount,
      balanceBefore: posting.balanceBefore,
      balanceAfter: posting.balanceAfter,
      type,
      previousTransactionId: previousTransactionIdFor(
        member.ledgerTailId ? { id: member.ledgerTailId } : null,
      ),
      taskAssignmentId: assignmentId,
      assignmentKind: kind,
      rewardRedemptionId: null,
    });
    member.ledgerTailId = id;
    member.balance = posting.balanceAfter;
  }

  function tickRecency(assignedMemberId: string | null): void {
    for (const m of members) {
      if (m.id === assignedMemberId) {
        m.metrics.daysSinceLastRandomAssignment = 0;
      } else {
        m.metrics.daysSinceLastRandomAssignment = Math.min(
          cfg.fairness.windowDays,
          m.metrics.daysSinceLastRandomAssignment + 1,
        );
      }
    }
  }

  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    const task = tasks[cycle % tasks.length];
    if (!task) throw new Error('runSimulation: task index out of bounds.');
    const offerIndex = task.offerCount;

    const voluntaryDraw = rng.next();
    if (voluntaryDraw < voluntaryUptakeRate) {
      // ── Voluntary uptake: no random draw happens at all (§5). ──────────
      const volunteerIndex = Math.min(
        members.length - 1,
        Math.floor(rng.next() * members.length),
      );
      const volunteer = members[volunteerIndex];
      if (!volunteer) throw new Error('runSimulation: volunteer index out of bounds.');

      const reward = voluntaryReward(cfg, {
        kind: AssignmentKind.VOLUNTARY,
        currentValue: task.currentValue,
        timing: cfg.voluntary.rewardTiming,
      });
      if (reward > 0) {
        assignmentCounter += 1;
        postLedgerEntry(
          volunteer,
          reward,
          PointTransactionType.VOLUNTARY_TASK_REWARD,
          `asg-${assignmentCounter}`,
          AssignmentKind.VOLUNTARY,
        );
      }
      volunteer.metrics.voluntaryCompletions += 1;
      volunteer.metrics.completedTasks += 1;
      task.timesCompleted += 1;
      task.currentValue = resetValue(cfg, {
        currentValue: task.currentValue,
        baseValue: task.baseValue,
      });

      tickRecency(null);
    } else {
      // ── Nobody volunteered: run the real weighted-fairness draw. ───────
      const candidates: EligibilityCandidate[] = members.map((m) => {
        const last = lastRandomOfferIndex.get(cooldownKey(m.id, task.id));
        return {
          memberId: m.id,
          // The simulation module has no role/preference concept of its own
          // (§34 is about assignment-count fairness, not the newer
          // role/preference intake) — every candidate is a plain, unpreferred
          // member, reproducing today's simulation exactly.
          role: MemberRole.MEMBER,
          isPreferredAssignee: false,
          isActive: true,
          isAbsent: false,
          hasActiveImmunity: false,
          excludedFromTask: false,
          inAllowlist: true,
          categoryExcluded: false,
          randomAssignmentsThisWeek: 0,
          maxRandomAssignmentsPerWeek: null,
          cyclesSinceLastRandomAssignmentOfTask: last === undefined ? null : offerIndex - last - 1,
          metrics: m.metrics,
        };
      });

      const outcome = selectAssignee({
        cfg,
        candidates,
        options: { definitionHasAllowlist: false, requiredRole: null, adminSlotReserved: false },
        configVersion: 1,
        decidedAt: DECIDED_AT,
        rng,
      });

      if (outcome.selectedMemberId === null) {
        // T5 — the relaxation ladder still found nobody eligible. With four
        // always-active, never-absent members this should be impossible; if
        // it ever happens that is itself a §34 finding worth surfacing loudly
        // rather than silently skipping the cycle.
        throw new Error(
          `runSimulation: no eligible candidate for task "${task.id}" at cycle ${cycle} — ` +
            'this would falsify §34\'s ergodicity requirement.',
        );
      }

      const selected = membersById.get(outcome.selectedMemberId);
      if (!selected) throw new Error('runSimulation: selected member not found.');

      lastRandomOfferIndex.set(cooldownKey(selected.id, task.id), offerIndex);
      selected.metrics.randomAssignments += 1;

      const buyoutDraw = rng.next();
      let didBuyout = false;

      if (buyoutDraw < buyoutRate) {
        const ctx = {
          currentValue: task.currentValue,
          baseValue: task.baseValue,
          buyoutCount: task.buyoutCount,
        };
        const cost = buyoutCost(cfg, ctx);
        const decision = evaluateBuyoutRules(cfg, {
          kind: AssignmentKind.RANDOM,
          buyoutEnabledForDefinition: task.buyoutEnabled,
          balance: selected.balance,
          cost,
          currentValue: task.currentValue,
          buyoutsThisWeek: selected.buyoutsThisWeek,
          consecutiveBuyouts: selected.consecutiveBuyouts,
        });

        if (decision.allowed) {
          didBuyout = true;
          assignmentCounter += 1;
          postLedgerEntry(
            selected,
            -cost,
            PointTransactionType.BUYOUT,
            `asg-${assignmentCounter}`,
            AssignmentKind.RANDOM,
          );
          task.currentValue = increasedValue(cfg, ctx);
          task.maxValueReached = Math.max(task.maxValueReached, task.currentValue);
          task.buyoutCount += 1;
          task.timesBoughtOut += 1;
          selected.metrics.buyouts += 1;
          selected.buyoutsThisWeek += 1;
          selected.consecutiveBuyouts += 1;
        }
      }

      if (!didBuyout) {
        // Accepted and completed: §7/§44 — zero points for a random completion.
        selected.metrics.completedTasks += 1;
        selected.consecutiveBuyouts = 0;
        task.timesCompleted += 1;
        task.currentValue = resetValue(cfg, {
          currentValue: task.currentValue,
          baseValue: task.baseValue,
        });
      }

      tickRecency(selected.id);
    }

    task.offerCount += 1;
  }

  const maxRandomLoad = Math.max(...members.map((m) => m.metrics.randomAssignments));
  const totalRandomAssignments = members.reduce((sum, m) => sum + m.metrics.randomAssignments, 0);
  const meanRandomLoad = totalRandomAssignments / members.length;
  const maxMeanRatio = meanRandomLoad > 0 ? maxRandomLoad / meanRandomLoad : 0;
  const everyMemberReached = members.every((m) => m.metrics.randomAssignments > 0);

  const ledgerFindings = verifyLedgerIntegrity({
    entries: ledger,
    members: members.map((m) => ({ memberId: m.id, pointsCache: m.balance })),
    // `exactOptionalPropertyTypes` — omit the key entirely rather than set it
    // to `undefined` when negative balances are allowed and there is no floor.
    ...(cfg.buyout.allowNegativeBalance ? {} : { minimumBalance: cfg.buyout.minimumBalance }),
  });

  return {
    cycles: options.cycles,
    seed: options.seed,
    voluntaryUptakeRate,
    buyoutRate,
    members: members.map((m) => ({
      memberId: m.id,
      displayName: m.displayName,
      randomAssignments: m.metrics.randomAssignments,
      voluntaryCompletions: m.metrics.voluntaryCompletions,
      buyouts: m.metrics.buyouts,
      finalBalance: m.balance,
    })),
    tasks: tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      baseValue: t.baseValue,
      finalCurrentValue: t.currentValue,
      maxValueReached: t.maxValueReached,
      timesOffered: t.offerCount,
      timesCompleted: t.timesCompleted,
      timesBoughtOut: t.timesBoughtOut,
    })),
    totalVoluntaryCompletions: members.reduce((sum, m) => sum + m.metrics.voluntaryCompletions, 0),
    totalRandomAssignments,
    totalBuyouts: members.reduce((sum, m) => sum + m.metrics.buyouts, 0),
    maxRandomLoad,
    meanRandomLoad,
    maxMeanRatio,
    everyMemberReached,
    ledger: ledgerFindings,
  };
}
