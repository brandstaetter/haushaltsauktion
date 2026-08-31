/**
 * `npm run sim -w apps/api` (root: `npm run sim`) — CLAUDE.md §34's CLI.
 *
 * Builds 4 members and 20 task definitions, runs 1000 assignment cycles
 * through `runSimulation` (see `simulate.ts` for the engine and its
 * documented rate assumptions), and prints a report to stdout: per-member
 * random-assignment/voluntary-completion/buyout counts and final balances,
 * the max/mean random-load ratio, and a PASS/FAIL line against the phase's
 * exit condition (§34 / campaign metric_threshold: no member above 1.5x mean
 * random load).
 *
 * Then re-runs the same 1000 cycles under a few other plausible
 * voluntary-uptake/buyout-rate combinations (task instructions, point 5) so
 * the headline result can be checked for robustness rather than trusted from
 * one assumption. If the primary run — or any scenario — fails the
 * threshold, this prints that loudly; it does not adjust the simulation to
 * make it pass.
 */

import { DEFAULT_CONFIG } from '@haushaltsauktion/shared';

import {
  DEFAULT_BUYOUT_RATE,
  DEFAULT_VOLUNTARY_UPTAKE_RATE,
  runSimulation,
  type SimMemberInput,
  type SimTaskInput,
  type SimulationResult,
} from './simulate.js';

const EXIT_CONDITION_RATIO = 1.5;
const CYCLES = 1000;
/** Same seed `fairness.test.ts` uses for its own distribution assertions. */
const SEED = 20260830;

/** §38 — the demo household's four members. */
const MEMBERS: SimMemberInput[] = [
  { id: 'elke', displayName: 'Elke' },
  { id: 'arthur', displayName: 'Arthur' },
  { id: 'luise', displayName: 'Luise' },
  { id: 'hannes', displayName: 'Hannes' },
];

/**
 * 20 task definitions. §38 seeds six of these verbatim (values 2/2/4/4/6/7);
 * the rest extend the same base-value range (2..7) with plausible household
 * chores rather than cloning one task twenty times, so the fairness/value
 * dynamics are exercised across a realistic spread of stakes.
 */
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

function printMemberTable(result: SimulationResult): void {
  console.log('');
  console.log('Per-member results:');
  console.log(
    '  ' +
      ['Member', 'Random', 'Voluntary', 'Buyouts', 'Balance'].map((h) => h.padEnd(11)).join(''),
  );
  for (const m of result.members) {
    console.log(
      '  ' +
        [
          m.displayName,
          String(m.randomAssignments),
          String(m.voluntaryCompletions),
          String(m.buyouts),
          String(m.finalBalance),
        ]
          .map((v) => v.padEnd(11))
          .join(''),
    );
  }
}

function printScenario(label: string, result: SimulationResult): boolean {
  const pass = result.maxMeanRatio <= EXIT_CONDITION_RATIO;
  console.log('');
  console.log(
    `── ${label} (voluntaryUptakeRate=${result.voluntaryUptakeRate}, buyoutRate=${result.buyoutRate}) ──`,
  );
  console.log(
    `  random assignments: total=${result.totalRandomAssignments} max=${result.maxRandomLoad} mean=${result.meanRandomLoad.toFixed(2)}`,
  );
  console.log(`  max/mean random-load ratio: ${result.maxMeanRatio.toFixed(3)}x`);
  console.log(`  every member reached at least once: ${result.everyMemberReached}`);
  console.log(`  ledger integrity: ${result.ledger.ok ? 'OK' : `FAILED (${result.ledger.violations.length} violations)`}`);
  console.log(
    `  ${pass ? 'PASS' : 'FAIL'} — max/mean ratio ${pass ? '<=' : '>'} ${EXIT_CONDITION_RATIO}x threshold`,
  );
  return pass;
}

function main(): void {
  console.log('§34 simulation — Haushaltsauktion');
  console.log(`members=${MEMBERS.length} tasks=${TASKS.length} cycles=${CYCLES} seed=${SEED}`);
  console.log(`strategy=${DEFAULT_CONFIG.assignment.strategy} weightFloor=${DEFAULT_CONFIG.fairness.weightFloor}`);

  const primary = runSimulation({
    members: MEMBERS,
    tasks: TASKS,
    cycles: CYCLES,
    seed: SEED,
  });

  printMemberTable(primary);
  const primaryPass = printScenario('Primary run (documented default assumptions)', primary);

  if (!primary.everyMemberReached) {
    console.log('');
    console.log(
      'FINDING: at least one member received zero random assignments over ' +
        `${CYCLES} cycles — this falsifies §34's ergodicity requirement (the weight ` +
        'floor is supposed to keep every eligible member reachable).',
    );
  }
  if (!primary.ledger.ok) {
    console.log('');
    console.log('FINDING: the simulated point ledger failed integrity verification:');
    for (const v of primary.ledger.violations) {
      console.log(`  - ${JSON.stringify(v)}`);
    }
  }

  // Robustness check (task instructions, point 5): re-run under a few other
  // plausible rate combinations to make sure the headline result is not an
  // artifact of one specific voluntary-uptake/buyout-rate assumption.
  const scenarios: Array<{ label: string; voluntaryUptakeRate: number; buyoutRate: number }> = [
    { label: 'Low cooperation, high buyout', voluntaryUptakeRate: 0.15, buyoutRate: 0.7 },
    { label: 'High cooperation, low buyout', voluntaryUptakeRate: 0.6, buyoutRate: 0.15 },
    { label: 'No voluntary uptake at all', voluntaryUptakeRate: 0, buyoutRate: DEFAULT_BUYOUT_RATE },
  ];

  const scenarioResults = scenarios.map((s) => {
    const result = runSimulation({
      members: MEMBERS,
      tasks: TASKS,
      cycles: CYCLES,
      seed: SEED,
      voluntaryUptakeRate: s.voluntaryUptakeRate,
      buyoutRate: s.buyoutRate,
    });
    const pass = printScenario(s.label, result);
    return { label: s.label, pass, ratio: result.maxMeanRatio };
  });

  const allPass = primaryPass && scenarioResults.every((s) => s.pass);

  console.log('');
  console.log('═'.repeat(60));
  console.log(
    `EXIT CONDITION (metric_threshold: max member random-load <= ${EXIT_CONDITION_RATIO}x mean):`,
  );
  console.log(
    `  primary run (uptake=${DEFAULT_VOLUNTARY_UPTAKE_RATE}, buyout=${DEFAULT_BUYOUT_RATE}): ` +
      `${primary.maxMeanRatio.toFixed(3)}x — ${primaryPass ? 'PASS' : 'FAIL'}`,
  );
  for (const s of scenarioResults) {
    console.log(`  scenario "${s.label}": ${s.ratio.toFixed(3)}x — ${s.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log('═'.repeat(60));
  console.log(allPass ? 'OVERALL: PASS' : 'OVERALL: FAIL');

  if (!allPass) {
    console.log('');
    console.log(
      'FINDING: the 1.5x max/mean random-load threshold does NOT hold under all ' +
        'tested assumptions with DEFAULT_CONFIG\'s actual WEIGHTED_FAIRNESS ' +
        'parameters (fairness.randomAssignmentWeight=' +
        `${DEFAULT_CONFIG.fairness.randomAssignmentWeight}, ` +
        `recentAssignmentPenalty=${DEFAULT_CONFIG.fairness.recentAssignmentPenalty}, ` +
        `weightFloor=${DEFAULT_CONFIG.fairness.weightFloor}). This may indicate a ` +
        'tuning issue in the fairness weights rather than a bug in this simulation — ' +
        'see the per-scenario ratios above.',
    );
    process.exitCode = 1;
  }
}

main();
