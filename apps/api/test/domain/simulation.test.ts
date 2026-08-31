/**
 * §34 — the simulation is a real regression-checked assertion, not merely a
 * console report.
 *
 * The campaign's Phase 7 exit condition is:
 *
 *   "simulation of 4x20x1000 shows no member above 1.5x mean random-load"
 *
 * This suite runs the exact same engine `npm run sim` prints from
 * (`../../src/simulation/simulate.ts`) with a fixed seed and asserts that
 * threshold directly, plus the weight-floor/ergodicity claim from PRD §3E:
 * no member may go through 1000 cycles with zero random assignments, because
 * a floor of zero reachability would mean the fairness weight has silently
 * become a permanent-exclusion mechanism.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BUYOUT_RATE,
  DEFAULT_VOLUNTARY_UPTAKE_RATE,
  runSimulation,
  type SimMemberInput,
  type SimTaskInput,
} from '../../src/simulation/simulate.js';

const EXIT_CONDITION_RATIO = 1.5;
const CYCLES = 1000;
const SEED = 20260830;

const MEMBERS: SimMemberInput[] = [
  { id: 'elke', displayName: 'Elke' },
  { id: 'arthur', displayName: 'Arthur' },
  { id: 'luise', displayName: 'Luise' },
  { id: 'hannes', displayName: 'Hannes' },
];

// Base values 2..7, same range as §38's seed data, extended to 20 tasks.
const TASKS: SimTaskInput[] = [
  { id: 'geschirrspueler', title: 'Geschirrspüler ausräumen', baseValue: 2 },
  { id: 'muell', title: 'Müll hinausbringen', baseValue: 2 },
  { id: 'waesche-aufhaengen', title: 'Wäsche aufhängen', baseValue: 4 },
  { id: 'staubsaugen', title: 'Staubsaugen', baseValue: 4 },
  { id: 'bad-putzen', title: 'Bad putzen', baseValue: 6 },
  { id: 'kueche-reinigen', title: 'Küche gründlich reinigen', baseValue: 7 },
  { id: 'betten-machen', title: 'Betten machen', baseValue: 2 },
  { id: 'blumen-giessen', title: 'Blumen gießen', baseValue: 2 },
  { id: 'tisch-decken', title: 'Tisch decken', baseValue: 2 },
  { id: 'tisch-abraeumen', title: 'Tisch abräumen', baseValue: 2 },
  { id: 'fenster-putzen', title: 'Fenster putzen', baseValue: 6 },
  { id: 'staub-wischen', title: 'Staub wischen', baseValue: 3 },
  { id: 'boeden-wischen', title: 'Böden wischen', baseValue: 5 },
  { id: 'waesche-falten', title: 'Wäsche zusammenlegen', baseValue: 3 },
  { id: 'einkaufen', title: 'Einkaufen gehen', baseValue: 5 },
  { id: 'altpapier', title: 'Altpapier hinausbringen', baseValue: 2 },
  { id: 'toilette-putzen', title: 'Toilette putzen', baseValue: 5 },
  { id: 'spiegel-putzen', title: 'Spiegel putzen', baseValue: 3 },
  { id: 'keller-aufraeumen', title: 'Keller aufräumen', baseValue: 7 },
  { id: 'auto-waschen', title: 'Auto waschen', baseValue: 6 },
];

describe('§34 — 4 members × 20 tasks × 1000 cycles simulation', () => {
  it('is reproducible under the fixed seed', () => {
    const a = runSimulation({ members: MEMBERS, tasks: TASKS, cycles: CYCLES, seed: SEED });
    const b = runSimulation({ members: MEMBERS, tasks: TASKS, cycles: CYCLES, seed: SEED });
    expect(a.members).toEqual(b.members);
    expect(a.maxMeanRatio).toBe(b.maxMeanRatio);
    expect(a.totalRandomAssignments).toBe(b.totalRandomAssignments);
  });

  it('produces a fully consistent point ledger (§8, §14)', () => {
    const result = runSimulation({ members: MEMBERS, tasks: TASKS, cycles: CYCLES, seed: SEED });
    expect(result.ledger.ok, JSON.stringify(result.ledger.violations)).toBe(true);
  });

  it('never lets any member absorb zero random assignments over 1000 cycles (ergodicity, PRD §3E)', () => {
    const result = runSimulation({ members: MEMBERS, tasks: TASKS, cycles: CYCLES, seed: SEED });
    expect(result.everyMemberReached).toBe(true);
    for (const m of result.members) {
      expect(m.randomAssignments, `${m.displayName} was never randomly assigned`).toBeGreaterThan(
        0,
      );
    }
  });

  it('keeps every member within 1.5x the mean random load — the campaign exit condition', () => {
    const result = runSimulation({
      members: MEMBERS,
      tasks: TASKS,
      cycles: CYCLES,
      seed: SEED,
      voluntaryUptakeRate: DEFAULT_VOLUNTARY_UPTAKE_RATE,
      buyoutRate: DEFAULT_BUYOUT_RATE,
    });

    expect(
      result.maxMeanRatio,
      `max/mean random-load ratio was ${result.maxMeanRatio.toFixed(3)}x ` +
        `(members: ${result.members.map((m) => `${m.displayName}=${m.randomAssignments}`).join(', ')})`,
    ).toBeLessThanOrEqual(EXIT_CONDITION_RATIO);
  });

  it('holds under a couple of other plausible voluntary-uptake/buyout-rate assumptions too', () => {
    const scenarios = [
      { voluntaryUptakeRate: 0.15, buyoutRate: 0.7 },
      { voluntaryUptakeRate: 0.6, buyoutRate: 0.15 },
      { voluntaryUptakeRate: 0, buyoutRate: DEFAULT_BUYOUT_RATE },
    ];

    for (const scenario of scenarios) {
      const result = runSimulation({
        members: MEMBERS,
        tasks: TASKS,
        cycles: CYCLES,
        seed: SEED,
        ...scenario,
      });
      expect(
        result.maxMeanRatio,
        `scenario ${JSON.stringify(scenario)} produced ratio ${result.maxMeanRatio.toFixed(3)}x`,
      ).toBeLessThanOrEqual(EXIT_CONDITION_RATIO);
    }
  });

  it('never pays points for a random completion (§7/§44, checked from the ledger)', () => {
    const result = runSimulation({ members: MEMBERS, tasks: TASKS, cycles: CYCLES, seed: SEED });
    // The ledger integrity check already asserts REWARD_ON_RANDOM cannot occur
    // structurally; this restates the headline invariant at the report level:
    // every point-earning transaction traces back to a voluntary completion.
    const totalEarnedFromVoluntary = result.members.reduce(
      (sum, m) => sum + m.voluntaryCompletions,
      0,
    );
    expect(totalEarnedFromVoluntary).toBeGreaterThan(0);
    expect(result.ledger.violations.some((v) => v.kind === 'REWARD_ON_RANDOM')).toBe(false);
  });
});
