/**
 * CLAUDE.md §35 — the seven required test cases, plus the §44 invariants they
 * exist to protect.
 *
 * These are the acceptance criteria for the economic core. Everything runs
 * against the real domain functions and the real ledger arithmetic; only the
 * database is absent, and no rule under test needs one.
 */

import { describe, expect, it } from 'vitest';

import {
  AssignmentKind,
  BuyoutDenialReason,
  DEFAULT_CONFIG,
  PointTransactionType,
  TaskStatus,
  cloneDefaultConfig,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { ConflictError } from '../../src/domain/errors.js';
import { buyoutCost, MINIMUM_BUYOUT_COST } from '../../src/domain/buyout/cost.js';
import { assertBuyoutAllowed, evaluateBuyoutRules } from '../../src/domain/buyout/rules.js';
import {
  carriedValueAfterCompletion,
  increasedValue,
  resetValue,
  voluntaryReward,
} from '../../src/domain/task/value.js';
import { resolve, TaskEvent } from '../../src/domain/task/state-machine.js';
import { TestLedger } from './_ledger.js';

const cfg = DEFAULT_CONFIG;
const ANNA = 'member-anna';
const PAUL = 'member-paul';
const ASSIGNMENT = 'assignment-1';

const ctxOf = (currentValue: number, baseValue = currentValue, buyoutCount = 0) => ({
  currentValue,
  baseValue,
  buyoutCount,
});

const patch = (mutate: (c: HouseholdConfig) => void): HouseholdConfig => {
  const next = cloneDefaultConfig();
  mutate(next);
  return next;
};

// ─────────────────────────────────────────────────────────────────────────────
describe('§35 — Freiwillige Übernahme: value 6, take, complete, +6', () => {
  it('credits the current value on completion and resets the task value', () => {
    const ledger = new TestLedger();
    const task = { currentValue: 6, baseValue: 6 };

    // T3: AVAILABLE -> ASSIGNED, voluntary. Default timing is ON_COMPLETE, so
    // nothing is paid at takeover.
    expect(resolve(TaskStatus.AVAILABLE, TaskEvent.VOLUNTEER)).toBe(TaskStatus.ASSIGNED);
    expect(
      voluntaryReward(cfg, {
        kind: AssignmentKind.VOLUNTARY,
        currentValue: task.currentValue,
        timing: 'ON_ACCEPT',
      }),
    ).toBe(0);
    expect(ledger.count()).toBe(0);

    // T7: ASSIGNED -> COMPLETED, award, reset.
    expect(resolve(TaskStatus.ASSIGNED, TaskEvent.COMPLETE)).toBe(TaskStatus.COMPLETED);
    const award = voluntaryReward(cfg, {
      kind: AssignmentKind.VOLUNTARY,
      currentValue: task.currentValue,
      timing: 'ON_COMPLETE',
    });
    expect(award).toBe(6);

    ledger.post({
      memberId: PAUL,
      amount: award,
      type: PointTransactionType.VOLUNTARY_TASK_REWARD,
      taskAssignmentId: ASSIGNMENT,
      assignmentKind: AssignmentKind.VOLUNTARY,
    });

    expect(ledger.balanceOf(PAUL)).toBe(6);
    expect(resetValue(cfg, task)).toBe(6);
    expect(ledger.verify([PAUL]).ok).toBe(true);
  });

  it('honours ON_ACCEPT when an admin configures it', () => {
    const onAccept = patch((c) => (c.voluntary.rewardTiming = 'ON_ACCEPT'));
    const input = { kind: AssignmentKind.VOLUNTARY, currentValue: 6 } as const;
    expect(voluntaryReward(onAccept, { ...input, timing: 'ON_ACCEPT' })).toBe(6);
    expect(voluntaryReward(onAccept, { ...input, timing: 'ON_COMPLETE' })).toBe(0);
  });

  it('applies the reward multiplier with the configured rounding', () => {
    const generous = patch((c) => (c.voluntary.rewardMultiplier = 1.5));
    expect(
      voluntaryReward(generous, {
        kind: AssignmentKind.VOLUNTARY,
        currentValue: 7,
        timing: 'ON_COMPLETE',
      }),
    ).toBe(11); // round(10.5)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§35 / §44 — Zufallsaufgabe: value 6, assigned, complete, exactly 0', () => {
  it('pays nothing and writes no ledger row at all', () => {
    const ledger = new TestLedger();
    const before = ledger.balanceOf(ANNA);

    const award = voluntaryReward(cfg, {
      kind: AssignmentKind.RANDOM,
      currentValue: 6,
      timing: 'ON_COMPLETE',
    });

    expect(award).toBe(0);
    // §4.5: the zero is an ABSENCE of a row, not a zero-amount entry that could
    // later be mistaken for a payout.
    expect(ledger.count()).toBe(0);
    expect(ledger.balanceOf(ANNA) - before).toBe(0);
  });

  it('cannot be switched on by any combination of configuration', () => {
    // §5.4 — the invariant holds by omission: no key grants points for a random
    // completion, and `voluntaryReward` tests the kind before reading any config.
    for (const rewardEnabled of [true, false]) {
      for (const rewardTiming of ['ON_ACCEPT', 'ON_COMPLETE'] as const) {
        for (const rewardMultiplier of [0, 1, 2.5, 10]) {
          const hostile = patch((c) => {
            c.voluntary.rewardEnabled = rewardEnabled;
            c.voluntary.rewardTiming = rewardTiming;
            c.voluntary.rewardMultiplier = rewardMultiplier;
          });
          expect(
            voluntaryReward(hostile, {
              kind: AssignmentKind.RANDOM,
              currentValue: 99,
              timing: rewardTiming,
            }),
          ).toBe(0);
        }
      }
    }
  });

  it('refuses to post a reward against a random assignment even if asked directly', () => {
    const ledger = new TestLedger();
    expect(() =>
      ledger.post({
        memberId: ANNA,
        amount: 6,
        type: PointTransactionType.VOLUNTARY_TASK_REWARD,
        taskAssignmentId: ASSIGNMENT,
        assignmentKind: AssignmentKind.RANDOM,
      }),
    ).toThrow(ConflictError);
    expect(ledger.count()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§35 — Freikauf: 10 points, value 6', () => {
  it('debits 6, raises the value to 9 and re-offers the task', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 10, type: PointTransactionType.MANUAL_ADJUSTMENT });
    expect(ledger.balanceOf(ANNA)).toBe(10);

    const task = ctxOf(6);
    const cost = buyoutCost(cfg, task);
    expect(cost).toBe(6); // default CURRENT_TASK_VALUE, §21's worked example

    const decision = evaluateBuyoutRules(cfg, {
      kind: AssignmentKind.RANDOM,
      buyoutEnabledForDefinition: true,
      balance: ledger.balanceOf(ANNA),
      cost,
      currentValue: task.currentValue,
      buyoutsThisWeek: 0,
      consecutiveBuyouts: 0,
    });
    expect(decision).toEqual({ allowed: true, reason: null });

    // PRD §3A: charge the pre-increase value, THEN raise it.
    ledger.post({
      memberId: ANNA,
      amount: -cost,
      type: PointTransactionType.BUYOUT,
      taskAssignmentId: ASSIGNMENT,
      assignmentKind: AssignmentKind.RANDOM,
    });
    const newValue = increasedValue(cfg, task);

    expect(ledger.balanceOf(ANNA)).toBe(4);
    expect(newValue).toBe(9);
    expect(newValue).toBeGreaterThan(task.currentValue);
    // T8: the task returns to AVAILABLE — a target state, not a config choice.
    expect(resolve(TaskStatus.ASSIGNED, TaskEvent.BUYOUT)).toBe(TaskStatus.AVAILABLE);
    expect(ledger.verify([ANNA]).ok).toBe(true);
  });

  it('costs at least one point even when the task is worth nothing', () => {
    // §44 "ein Freikauf kostet Punkte" must hold at currentValue = 0 too.
    expect(buyoutCost(cfg, ctxOf(0))).toBe(MINIMUM_BUYOUT_COST);
    expect(buyoutCost(cfg, ctxOf(0))).toBeGreaterThan(0);
  });

  it('refuses a buyout on a voluntary takeover (PRD §3B)', () => {
    const decision = evaluateBuyoutRules(cfg, {
      kind: AssignmentKind.VOLUNTARY,
      buyoutEnabledForDefinition: true,
      balance: 100,
      cost: 6,
      currentValue: 6,
      buyoutsThisWeek: 0,
      consecutiveBuyouts: 0,
    });
    expect(decision.reason).toBe(BuyoutDenialReason.NOT_RANDOM_ASSIGNMENT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§35 — Nicht genügend Punkte: 4 points, cost 6, negative disallowed', () => {
  const input = {
    kind: AssignmentKind.RANDOM,
    buyoutEnabledForDefinition: true,
    balance: 4,
    cost: 6,
    currentValue: 6,
    buyoutsThisWeek: 0,
    consecutiveBuyouts: 0,
  } as const;

  it('rejects the buyout', () => {
    expect(evaluateBuyoutRules(cfg, input)).toEqual({
      allowed: false,
      reason: BuyoutDenialReason.INSUFFICIENT_POINTS,
    });
  });

  it('throws 409 INSUFFICIENT_POINTS carrying the numbers the UI needs', () => {
    try {
      assertBuyoutAllowed(cfg, input);
      expect.unreachable('assertBuyoutAllowed should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      const conflict = error as ConflictError;
      expect(conflict.code).toBe('INSUFFICIENT_POINTS');
      expect(conflict.details).toMatchObject({ balance: 4, cost: 6, minimumBalance: 0 });
    }
  });

  it('leaves the balance untouched — nothing is written on a rejected buyout', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 4, type: PointTransactionType.MANUAL_ADJUSTMENT });
    expect(() => assertBuyoutAllowed(cfg, input)).toThrow(ConflictError);
    expect(ledger.balanceOf(ANNA)).toBe(4);
    expect(ledger.count()).toBe(1);
    expect(ledger.verify([ANNA]).ok).toBe(true);
  });

  it('allows the same buyout once a negative balance is configured', () => {
    const permissive = patch((c) => {
      c.buyout.allowNegativeBalance = true;
      c.buyout.maximumDebt = 10;
    });
    expect(evaluateBuyoutRules(permissive, input).allowed).toBe(true);
    // ... but still not past the debt ceiling.
    expect(evaluateBuyoutRules(permissive, { ...input, cost: 15 }).reason).toBe(
      BuyoutDenialReason.INSUFFICIENT_POINTS,
    );
  });

  it('enforces the weekly and consecutive caps', () => {
    const capped = patch((c) => {
      c.buyout.maximumBuyoutsPerWeek = 2;
      c.buyout.maximumConsecutiveBuyouts = 3;
    });
    const affordable = { ...input, balance: 100 };
    expect(evaluateBuyoutRules(capped, { ...affordable, buyoutsThisWeek: 2 }).reason).toBe(
      BuyoutDenialReason.WEEKLY_LIMIT_REACHED,
    );
    expect(evaluateBuyoutRules(capped, { ...affordable, consecutiveBuyouts: 3 }).reason).toBe(
      BuyoutDenialReason.CONSECUTIVE_LIMIT_REACHED,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§35 — Mehrfacher Freikauf: 4 -> 6 -> 9 -> 14', () => {
  it('escalates exactly as ceil(v * 1.5) with minimumIncrease 1', () => {
    let value = 4;
    const chain = [value];
    for (let buyoutCount = 0; buyoutCount < 3; buyoutCount += 1) {
      value = increasedValue(cfg, ctxOf(value, 4, buyoutCount));
      chain.push(value);
    }
    expect(chain).toEqual([4, 6, 9, 14]);
  });

  it('asserts every individual step', () => {
    expect(increasedValue(cfg, ctxOf(4, 4, 0))).toBe(6);
    expect(increasedValue(cfg, ctxOf(6, 4, 1))).toBe(9);
    expect(increasedValue(cfg, ctxOf(9, 4, 2))).toBe(14);
  });

  it('charges the pre-increase value at every step', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 40, type: PointTransactionType.MANUAL_ADJUSTMENT });

    let value = 4;
    const costs: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const task = ctxOf(value, 4, i);
      const cost = buyoutCost(cfg, task);
      costs.push(cost);
      ledger.post({
        memberId: ANNA,
        amount: -cost,
        type: PointTransactionType.BUYOUT,
        taskAssignmentId: `assignment-${i}`,
        assignmentKind: AssignmentKind.RANDOM,
      });
      value = increasedValue(cfg, task);
    }

    expect(costs).toEqual([4, 6, 9]);
    expect(value).toBe(14);
    expect(ledger.balanceOf(ANNA)).toBe(40 - 19);
    expect(ledger.verify([ANNA]).ok).toBe(true);
  });

  it('always increases the value, whatever the strategy is set to', () => {
    const strategies: Array<(c: HouseholdConfig) => void> = [
      (c) => {
        c.valueIncrease.strategy = 'FIXED_INCREMENT';
        c.valueIncrease.increment = 2;
      },
      (c) => {
        c.valueIncrease.strategy = 'PERCENTAGE';
        c.valueIncrease.percentage = 50;
      },
      (c) => {
        c.valueIncrease.strategy = 'MULTIPLIER';
        c.valueIncrease.multiplier = 1.5;
      },
      (c) => {
        c.valueIncrease.strategy = 'CUSTOM_FORMULA';
        c.valueIncrease.formula = 'ceil(currentValue * 1.5)';
      },
    ];

    for (const mutate of strategies) {
      const config = patch(mutate);
      for (const value of [0, 1, 2, 4, 7, 50]) {
        // §44: a buyout raises the value. minimumIncrease >= 1 makes this true
        // even where the strategy alone would have returned the same number.
        expect(increasedValue(config, ctxOf(value, 4, 0))).toBeGreaterThan(value);
      }
    }
  });

  it('rejects the buyout at the configured value cap instead of charging for nothing', () => {
    // OQ-8: clamping silently would charge points without raising the value.
    const capped = patch((c) => (c.valueIncrease.maximumValue = 10));
    expect(increasedValue(capped, ctxOf(9))).toBe(10);
    expect(() => increasedValue(capped, ctxOf(10))).toThrow(ConflictError);
    try {
      increasedValue(capped, ctxOf(12));
      expect.unreachable('should have thrown at the cap');
    } catch (error) {
      expect((error as ConflictError).code).toBe('BUYOUT_AT_VALUE_CAP');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§35 — Erledigung nach Wertsteigerung: base 4, current 9', () => {
  it('pays the escalated value and resets to the base value', () => {
    const ledger = new TestLedger();
    const task = { currentValue: 9, baseValue: 4 };

    const award = voluntaryReward(cfg, {
      kind: AssignmentKind.VOLUNTARY,
      currentValue: task.currentValue,
      timing: 'ON_COMPLETE',
    });
    expect(award).toBe(9);

    ledger.post({
      memberId: PAUL,
      amount: award,
      type: PointTransactionType.VOLUNTARY_TASK_REWARD,
      taskAssignmentId: ASSIGNMENT,
      assignmentKind: AssignmentKind.VOLUNTARY,
    });

    expect(ledger.balanceOf(PAUL)).toBe(9);
    expect(resetValue(cfg, task)).toBe(4);
    // The default leaves the carry-over mechanism inert (§5.7, OQ-1).
    expect(carriedValueAfterCompletion(cfg, task)).toBeNull();
    expect(ledger.verify([PAUL]).ok).toBe(true);
  });

  it('supports the two non-default reset strategies with carry-over', () => {
    const task = { currentValue: 9, baseValue: 4 };

    const keep = patch((c) => (c.completion.resetStrategy = 'KEEP_CURRENT'));
    expect(resetValue(keep, task)).toBe(9);
    expect(carriedValueAfterCompletion(keep, task)).toBe(9);

    const decrease = patch((c) => {
      c.completion.resetStrategy = 'DECREASE_PERCENTAGE';
      c.completion.decreasePercentage = 25;
    });
    expect(resetValue(decrease, task)).toBe(7); // ceil(9 * 0.75)
    expect(carriedValueAfterCompletion(decrease, task)).toBe(7);
    // Never below the base value.
    expect(resetValue(decrease, { currentValue: 4, baseValue: 4 })).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the full §22 cycle, end to end', () => {
  it('offer -> random -> buyout -> re-offer -> voluntary -> complete', () => {
    const ledger = new TestLedger();
    ledger.post({ memberId: ANNA, amount: 10, type: PointTransactionType.MANUAL_ADJUSTMENT });

    const base = 4;
    let value = base;
    let status: TaskStatus = TaskStatus.AVAILABLE;

    // 19:43 no volunteer -> randomly assigned to Anna
    status = resolve(status, TaskEvent.ASSIGN_RANDOM);
    expect(status).toBe(TaskStatus.ASSIGNED);

    // 19:45 Anna buys herself out for 4
    const cost = buyoutCost(cfg, ctxOf(value, base, 0));
    expect(cost).toBe(4);
    ledger.post({
      memberId: ANNA,
      amount: -cost,
      type: PointTransactionType.BUYOUT,
      taskAssignmentId: ASSIGNMENT,
      assignmentKind: AssignmentKind.RANDOM,
    });
    value = increasedValue(cfg, ctxOf(value, base, 0));
    status = resolve(status, TaskEvent.BUYOUT);

    expect(ledger.balanceOf(ANNA)).toBe(6);
    expect(value).toBe(6); // "Neuer Wert: 6"
    expect(status).toBe(TaskStatus.AVAILABLE);

    // 20:01 Paul volunteers, 20:37 Paul completes
    status = resolve(status, TaskEvent.VOLUNTEER);
    status = resolve(status, TaskEvent.COMPLETE);
    const award = voluntaryReward(cfg, {
      kind: AssignmentKind.VOLUNTARY,
      currentValue: value,
      timing: 'ON_COMPLETE',
    });
    ledger.post({
      memberId: PAUL,
      amount: award,
      type: PointTransactionType.VOLUNTARY_TASK_REWARD,
      taskAssignmentId: 'assignment-2',
      assignmentKind: AssignmentKind.VOLUNTARY,
    });
    value = resetValue(cfg, { currentValue: value, baseValue: base });

    expect(status).toBe(TaskStatus.COMPLETED);
    expect(award).toBe(6); // "Paul erhält 6 Punkte"
    expect(ledger.balanceOf(PAUL)).toBe(6);
    expect(value).toBe(4); // "Aufgabenwert auf 4 zurückgesetzt"

    // The escalated value was Anna's cost and Paul's reward — the whole point
    // of the economy, and the ledger balances on both sides.
    expect(ledger.verify([ANNA, PAUL]).ok).toBe(true);
    expect(ledger.balanceOf(ANNA) + ledger.balanceOf(PAUL)).toBe(12);
  });
});
