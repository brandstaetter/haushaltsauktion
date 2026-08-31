/**
 * Assignment routes (Architektur §3.5, §3.6).
 *
 * The buyout is the one endpoint where the client sends numbers. It sends the
 * two it *displayed* — `acceptedCost` and `acceptedNewValue` — and the server
 * recomputes both from the pinned config and compares (§3.5, Reconciliation
 * §1.1). They are never used in the computation, so this is informed consent
 * (§31), not client-side pricing (§36).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { executeBuyout } from '../../../app/buyout/executeBuyout.js';
import { buildQuote, loadQuoteCounters } from '../../../app/buyout/quote.js';
import { acceptAssignment } from '../../../app/assignment/reopen.js';
import { loadConfigVersion } from '../../../app/config/load.js';
import type { Deps } from '../../../app/deps.js';
import { explainAssignment } from '../../../app/queries/reads.js';
import { ForbiddenError, NotFoundError } from '../../../domain/errors.js';
import { requireMember } from '../context.js';
import { IdParam, parse } from './_validate.js';
import { MEMBER_ACTION_LIMIT } from './tasks.js';

const BuyoutBody = z.object({
  /** Echoed, never trusted (§3.5). */
  acceptedCost: z.number().int().min(0),
  acceptedNewValue: z.number().int().min(0),
});

export async function registerAssignmentRoutes(
  app: FastifyInstance,
  deps: Deps,
): Promise<void> {
  app.get('/assignments/:id/buyout-quote', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(IdParam, request.params);
    const now = deps.clock.now();

    const assignment = await deps.db.taskAssignment.findFirst({
      where: { id: params.id, householdId: ctx.householdId },
      select: {
        id: true,
        kind: true,
        status: true,
        memberId: true,
        configVersion: true,
        instance: {
          select: {
            currentValue: true,
            baseValue: true,
            buyoutCount: true,
            definition: { select: { buyoutEnabled: true } },
          },
        },
        member: { select: { pointsCache: true } },
      },
    });
    if (assignment === null) throw new NotFoundError('Zuweisung nicht gefunden.');
    if (assignment.memberId !== ctx.memberId) {
      throw new ForbiddenError('NOT_ASSIGNEE', 'Diese Zuweisung gehört dir nicht.');
    }

    // The same pinned version the buyout transaction will read (§5.5), which is
    // what makes the quote and the charge provably equal.
    const cfg = await loadConfigVersion(deps.db, ctx.householdId, assignment.configVersion);
    const counters = await loadQuoteCounters(deps.db, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      timezone: ctx.householdTimezone,
      now,
    });

    return buildQuote(
      {
        assignmentId: assignment.id,
        kind: assignment.kind,
        assignmentStatus: assignment.status,
        memberId: assignment.memberId,
        householdId: ctx.householdId,
        currentValue: assignment.instance.currentValue,
        baseValue: assignment.instance.baseValue,
        buyoutCount: assignment.instance.buyoutCount,
        buyoutEnabledForDefinition: assignment.instance.definition.buyoutEnabled,
        balance: assignment.member.pointsCache,
        configVersion: assignment.configVersion,
        cfg,
        timezone: ctx.householdTimezone,
        now,
      },
      counters,
    ).dto;
  });

  app.post(
    '/assignments/:id/buyout',
    // §3.12 — 10 per minute per member. Tighter than the general mutation
    // budget because every call moves points.
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (request: { ctx?: { memberId: string }; ip: string }) =>
            request.ctx?.memberId ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const ctx = requireMember(request, reply);
      const params = parse(IdParam, request.params);
      const body = parse(BuyoutBody, request.body);
      return executeBuyout(deps, {
        householdId: ctx.householdId,
        timezone: ctx.householdTimezone,
        memberId: ctx.memberId,
        assignmentId: params.id,
        acceptedCost: body.acceptedCost,
        acceptedNewValue: body.acceptedNewValue,
        ipAddress: request.ip,
      });
    },
  );

  app.post('/assignments/:id/accept', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(IdParam, request.params);
    const assignment = await acceptAssignment(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      assignmentId: params.id,
    });
    return { assignment };
  });

  /** §32 — "Warum wurde mir diese Aufgabe zugewiesen?" (Reconciliation §1.2). */
  app.get('/assignments/:id/explain', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(IdParam, request.params);
    return explainAssignment(deps.db, ctx.householdId, params.id);
  });
}
