/**
 * The buyout quote (Architektur §3.5, CLAUDE.md §21, §31).
 *
 * §31 requires the member to see, *before* deciding: current balance, cost,
 * balance afterwards, task value before, task value after. All five are
 * computed here, server-side, from the **pinned** configuration (§5.5) — the
 * same function the buyout transaction calls, which is what makes
 * `GET /buyout-quote` and `POST /buyout` provably agree.
 *
 * The quote is never stored and never signed. The client echoes the two numbers
 * it displayed and the server recomputes them (§3.5); there is no token to
 * expire or garbage-collect (Reconciliation §1.1).
 */

import {
  BuyoutDenialReason,
  weekKey,
  type BuyoutQuoteDto,
  type HouseholdConfig,
} from '@haushaltsauktion/shared';

import { evaluateBuyoutRules } from '../../domain/buyout/rules.js';
import { buyoutCost } from '../../domain/buyout/cost.js';
import { increasedValue } from '../../domain/task/value.js';
import { ConflictError } from '../../domain/errors.js';
import type { PrismaTx } from '../deps.js';

export interface QuoteSubject {
  assignmentId: string;
  kind: string;
  assignmentStatus: string;
  memberId: string;
  householdId: string;
  currentValue: number;
  baseValue: number;
  buyoutCount: number;
  buyoutEnabledForDefinition: boolean;
  balance: number;
  configVersion: number;
  cfg: HouseholdConfig;
  timezone: string;
  now: Date;
}

/** §8 — buyouts already used in the current ISO week (§5.6). */
export async function countBuyoutsThisWeek(
  tx: PrismaTx,
  householdId: string,
  memberId: string,
  timezone: string,
  now: Date,
): Promise<number> {
  // A fortnight back covers any ISO week whatever the timezone, and the exact
  // boundary is then applied by `weekKey` so the count matches what the UI says.
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const rows = await tx.pointTransaction.findMany({
    where: { householdId, memberId, type: 'BUYOUT', createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const current = weekKey(now, timezone);
  return rows.filter((r) => weekKey(r.createdAt, timezone) === current).length;
}

/**
 * §8 — how many of this member's most recently closed assignments in a row
 * ended in a buyout. Walking back from the newest and stopping at the first
 * non-buyout is what "aufeinanderfolgend" means; counting buyouts anywhere in
 * the history would be a different (and much harsher) rule.
 */
export async function countConsecutiveBuyouts(
  tx: PrismaTx,
  householdId: string,
  memberId: string,
): Promise<number> {
  const recent = await tx.taskAssignment.findMany({
    where: { householdId, memberId, status: { not: 'ACTIVE' } },
    orderBy: { closedAt: 'desc' },
    select: { status: true },
    take: 25,
  });
  let count = 0;
  for (const row of recent) {
    if (row.status !== 'BOUGHT_OUT') break;
    count += 1;
  }
  return count;
}

export interface QuoteCounters {
  buyoutsThisWeek: number;
  consecutiveBuyouts: number;
}

export async function loadQuoteCounters(
  tx: PrismaTx,
  subject: Pick<QuoteSubject, 'householdId' | 'memberId' | 'timezone' | 'now'>,
): Promise<QuoteCounters> {
  const [buyoutsThisWeek, consecutiveBuyouts] = await Promise.all([
    countBuyoutsThisWeek(tx, subject.householdId, subject.memberId, subject.timezone, subject.now),
    countConsecutiveBuyouts(tx, subject.householdId, subject.memberId),
  ]);
  return { buyoutsThisWeek, consecutiveBuyouts };
}

export interface Quote {
  dto: BuyoutQuoteDto;
  cost: number;
  newValue: number;
}

/**
 * Build the quote. Never throws for a *business* denial — an assignment that
 * cannot be bought out still deserves a quote saying why (§21's screen shows
 * the disabled button with a reason rather than hiding it).
 *
 * The one case that cannot produce numbers is the value cap: `increasedValue`
 * refuses to invent an increase that would not happen (OQ-8), so the quote
 * falls back to `taskValueAfter = taskValueBefore` and `allowed: false`.
 */
export function buildQuote(subject: QuoteSubject, counters: QuoteCounters): Quote {
  const ctx = {
    currentValue: subject.currentValue,
    baseValue: subject.baseValue,
    buyoutCount: subject.buyoutCount,
  };

  const cost = buyoutCost(subject.cfg, ctx);

  let newValue: number;
  let capReached = false;
  try {
    newValue = increasedValue(subject.cfg, ctx);
  } catch (error) {
    if (error instanceof ConflictError && error.code === 'BUYOUT_AT_VALUE_CAP') {
      newValue = subject.currentValue;
      capReached = true;
    } else {
      throw error;
    }
  }

  const closed = subject.assignmentStatus !== 'ACTIVE';
  const decision = evaluateBuyoutRules(subject.cfg, {
    kind: subject.kind as never,
    buyoutEnabledForDefinition: subject.buyoutEnabledForDefinition,
    balance: subject.balance,
    cost,
    currentValue: subject.currentValue,
    buyoutsThisWeek: counters.buyoutsThisWeek,
    consecutiveBuyouts: counters.consecutiveBuyouts,
  });

  const reason = closed
    ? BuyoutDenialReason.ASSIGNMENT_CLOSED
    : capReached
      ? BuyoutDenialReason.VALUE_CAP_REACHED
      : decision.reason;

  return {
    cost,
    newValue,
    dto: {
      assignmentId: subject.assignmentId,
      allowed: !closed && !capReached && decision.allowed,
      disallowedReason: reason,
      cost,
      balanceBefore: subject.balance,
      balanceAfter: subject.balance - cost,
      taskValueBefore: subject.currentValue,
      taskValueAfter: newValue,
      costStrategy: subject.cfg.buyout.costStrategy,
      valueIncreaseStrategy: subject.cfg.valueIncrease.strategy,
      buyoutsUsedThisWeek: counters.buyoutsThisWeek,
      buyoutsAllowedThisWeek: subject.cfg.buyout.maximumBuyoutsPerWeek,
      configVersion: subject.configVersion,
    },
  };
}
