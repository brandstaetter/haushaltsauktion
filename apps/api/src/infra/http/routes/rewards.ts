/**
 * Punkte-Shop, member-facing (intake "points-shop-real-life-rewards").
 *
 * `cost` on the list comes straight from `RewardDefinition` — the client
 * never computes or sends a price back (§36); the purchase route takes no
 * body at all.
 */

import type { FastifyInstance } from 'fastify';

import { ForbiddenError } from '../../../domain/errors.js';
import { loadCurrentConfig } from '../../../app/config/load.js';
import type { Deps } from '../../../app/deps.js';
import { purchaseReward } from '../../../app/rewards/purchaseReward.js';
import { requireMember } from '../context.js';
import { IdParam, parse } from './_validate.js';

export async function registerRewardRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/rewards', async (request, reply) => {
    const ctx = requireMember(request, reply);
    // Mirrors the enforcement `purchaseReward` already does: the list route
    // is the browse half of the same "is the shop on" gate, not just the
    // buy half, so a disabled shop must not leak its catalog either.
    const { config } = await loadCurrentConfig(deps.db, ctx.householdId);
    if (!config.rewards.enabled) {
      throw new ForbiddenError('REWARDS_DISABLED', 'Der Punkte-Shop ist im Haushalt deaktiviert.');
    }
    const items = await deps.db.rewardDefinition.findMany({
      where: { householdId: ctx.householdId, isActive: true },
      orderBy: { cost: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        cost: true,
        kind: true,
        effectType: true,
        effectDurationMinutes: true,
        effectCharges: true,
        effectMultiplier: true,
      },
    });
    return { items };
  });

  app.post('/rewards/:id/purchase', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(IdParam, request.params);
    return purchaseReward(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      rewardDefinitionId: params.id,
    });
  });
}
