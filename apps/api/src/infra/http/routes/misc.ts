/**
 * History, notifications and the public configuration
 * (Architektur §3.8, §3.9; Reconciliation §1.3).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { loadPublicConfig } from '../../../app/config/updateConfig.js';
import type { Deps } from '../../../app/deps.js';
import { listHistory, listNotifications } from '../../../app/queries/reads.js';
import { requireMember } from '../context.js';
import { IdParam, PageQuery, parse } from './_validate.js';

const HistoryQuery = PageQuery.extend({
  taskInstanceId: z.string().max(64).optional(),
  taskDefinitionId: z.string().max(64).optional(),
  memberId: z.string().max(64).optional(),
  type: z.union([z.string(), z.array(z.string())]).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

const NotificationQuery = PageQuery.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export async function registerMiscRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/history', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const query = parse(HistoryQuery, request.query);
    const types =
      query.type === undefined
        ? undefined
        : Array.isArray(query.type)
          ? query.type
          : [query.type];
    return listHistory(deps.db, ctx.householdId, {
      taskInstanceId: query.taskInstanceId,
      taskDefinitionId: query.taskDefinitionId,
      memberId: query.memberId,
      types,
      since: query.since,
      until: query.until,
      cursor: query.cursor,
      limit: query.limit,
    });
  });

  app.get('/notifications', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const query = parse(NotificationQuery, request.query);
    return listNotifications(deps.db, ctx.householdId, ctx.memberId, {
      unreadOnly: query.unreadOnly,
      cursor: query.cursor,
      limit: query.limit,
    });
  });

  app.post('/notifications/:id/read', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(IdParam, request.params);
    await deps.db.notification.updateMany({
      where: { id: params.id, householdId: ctx.householdId, memberId: ctx.memberId },
      data: { readAt: deps.clock.now() },
    });
    return reply.status(204).send();
  });

  app.post('/notifications/read-all', async (request, reply) => {
    const ctx = requireMember(request, reply);
    await deps.db.notification.updateMany({
      where: { householdId: ctx.householdId, memberId: ctx.memberId, readAt: null },
      data: { readAt: deps.clock.now() },
    });
    return reply.status(204).send();
  });

  /**
   * Reconciliation §1.3 — `GET /api/config/public`.
   *
   * §31 forbids hidden rules. Copy that hard-codes "du bekommst die Punkte nach
   * Erledigung" while an admin has set `ON_ACCEPT` *is* a hidden rule, so the
   * member-facing UI reads the real timing from here. The projection is
   * `toPublicConfig` over the very object the server computes with, never a
   * hand-maintained parallel list — which is what guarantees no admin-only key
   * can leak and no member-relevant key can silently go missing.
   */
  app.get('/config/public', async (request, reply) => {
    const ctx = requireMember(request, reply);
    return loadPublicConfig(deps, ctx.householdId);
  });
}
