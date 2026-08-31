/**
 * Members and points (Architektur §3.7).
 *
 * `balance` always originates from the ledger's cache (§8.4) — the API never
 * returns a number the client could have computed, and never accepts one.
 */

import type { FastifyInstance } from 'fastify';

import type { Deps } from '../../../app/deps.js';
import { listMembers, listPointTransactions } from '../../../app/queries/reads.js';
import { NotFoundError } from '../../../domain/errors.js';
import { requireAdmin, requireMember } from '../context.js';
import { IdParam, PageQuery, parse } from './_validate.js';

export async function registerMemberRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/members', async (request, reply) => {
    const ctx = requireMember(request, reply);
    return { items: await listMembers(deps.db, ctx.householdId) };
  });

  app.get('/members/me', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const members = await listMembers(deps.db, ctx.householdId);
    const me = members.find((m) => m.id === ctx.memberId);
    if (me === undefined) throw new NotFoundError('Mitglied nicht gefunden.');
    return me;
  });

  app.get('/members/me/points', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const member = await deps.db.householdMember.findFirst({
      where: { id: ctx.memberId, householdId: ctx.householdId },
      select: { pointsCache: true },
    });
    if (member === null) throw new NotFoundError('Mitglied nicht gefunden.');
    return { balance: member.pointsCache, asOf: deps.clock.now().toISOString() };
  });

  app.get('/members/me/point-transactions', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const query = parse(PageQuery, request.query);
    return listPointTransactions(deps.db, ctx.householdId, ctx.memberId, {
      cursor: query.cursor,
      limit: query.limit,
    });
  });

  /** ADMIN — anyone's ledger. A member sees only their own (§3.7). */
  app.get('/members/:id/point-transactions', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const query = parse(PageQuery, request.query);
    return listPointTransactions(deps.db, ctx.householdId, params.id, {
      cursor: query.cursor,
      limit: query.limit,
    });
  });
}
