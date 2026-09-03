/**
 * Punkte-Shop, member-facing (intake "points-shop-real-life-rewards").
 *
 * `cost` on the list comes straight from `RewardDefinition` — the client
 * never computes or sends a price back (§36); the purchase route takes no
 * body at all.
 */

import type { FastifyInstance } from 'fastify';

import type { Deps } from '../../../app/deps.js';
import { purchaseReward } from '../../../app/rewards/purchaseReward.js';
import { requireMember } from '../context.js';
import { IdParam, parse } from './_validate.js';

export async function registerRewardRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/rewards', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const items = await deps.db.rewardDefinition.findMany({
      where: { householdId: ctx.householdId, isActive: true },
      orderBy: { cost: 'asc' },
      select: { id: true, title: true, description: true, cost: true },
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
