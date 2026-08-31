/**
 * Task read and mutation routes (Architektur §3.4, §3.5).
 *
 * Each handler validates, resolves the context and calls **one** use-case. The
 * business logic — who may volunteer, what a completion pays, what a value
 * resets to — is entirely in `app/` and `domain/`; a handler that computed one
 * of those numbers would be a §7.2 review failure and a §36 violation.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Deps } from '../../../app/deps.js';
import { releaseOrRevokeAssignment } from '../../../app/assignment/reopen.js';
import { NotFoundError } from '../../../domain/errors.js';
import { listHistory, loadDashboard, listMembers } from '../../../app/queries/reads.js';
import {
  listAssignedToMe,
  listAvailableTasks,
  loadInstanceDetail,
} from '../../../app/queries/taskDto.js';
import { completeTask } from '../../../app/tasks/completeTask.js';
import { volunteerForTask } from '../../../app/tasks/volunteerForTask.js';
import { requireMember, type RequestContext } from '../context.js';
import { ExpectedVersion, InstanceIdParam, PageQuery, parse } from './_validate.js';

const VolunteerBody = z
  .object({ expectedVersion: ExpectedVersion })
  .nullish()
  .transform((v) => v ?? {});

const CompleteBody = z.object({
  assignmentId: z.string().min(1).max(64),
  expectedVersion: ExpectedVersion,
});

const ReleaseBody = z.object({ assignmentId: z.string().min(1).max(64) });

const AvailableQuery = z.object({
  categoryId: z.string().max(64).optional(),
  eligibleOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Balance for the DTOs. Read from the cache, which the ledger maintains (§8.4). */
async function viewerBalance(deps: Deps, ctx: RequestContext): Promise<number> {
  const member = await deps.db.householdMember.findFirst({
    where: { id: ctx.memberId, householdId: ctx.householdId },
    select: { pointsCache: true },
  });
  return member?.pointsCache ?? 0;
}

function viewerContext(deps: Deps, ctx: RequestContext) {
  return {
    householdId: ctx.householdId,
    memberId: ctx.memberId,
    timezone: ctx.householdTimezone,
    now: deps.clock.now(),
  };
}

/** §3.12 — 30 mutations per minute per member. */
const MEMBER_ACTION_LIMIT = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request: { ctx?: { memberId: string }; ip: string }) =>
        request.ctx?.memberId ?? request.ip,
    },
  },
};

export async function registerTaskRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/tasks/available', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const query = parse(AvailableQuery, request.query);
    const items = await listAvailableTasks(deps.db, viewerContext(deps, ctx), {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      eligibleOnly: query.eligibleOnly,
    });
    return { items };
  });

  app.get('/tasks/assigned-to-me', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const items = await listAssignedToMe(
      deps.db,
      viewerContext(deps, ctx),
      await viewerBalance(deps, ctx),
    );
    return { items };
  });

  /** §19's family panel. */
  app.get('/tasks/board', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const view = viewerContext(deps, ctx);
    const balance = await viewerBalance(deps, ctx);
    const [open, assigned, members, recentlyCompleted] = await Promise.all([
      listAvailableTasks(deps.db, view),
      listAssignedToMe(deps.db, view, balance),
      listMembers(deps.db, ctx.householdId),
      deps.db.taskInstance.findMany({
        where: { householdId: ctx.householdId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          completedAt: true,
          currentValue: true,
          definition: { select: { title: true } },
          completedBy: { select: { displayName: true } },
        },
      }),
    ]);
    return {
      open,
      assigned,
      members,
      recentlyCompleted: recentlyCompleted.map((c) => ({
        id: c.id,
        title: c.definition.title,
        completedAt: c.completedAt?.toISOString() ?? '',
        completedBy: c.completedBy?.displayName ?? null,
        value: c.currentValue,
      })),
    };
  });

  /** One round trip for §19. */
  app.get('/dashboard', async (request, reply) => {
    const ctx = requireMember(request, reply);
    return loadDashboard(deps.db, viewerContext(deps, ctx));
  });

  app.get('/tasks/:instanceId', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(InstanceIdParam, request.params);
    const detail = await loadInstanceDetail(
      deps.db,
      viewerContext(deps, ctx),
      params.instanceId,
      await viewerBalance(deps, ctx),
    );
    // Absent and foreign are the same answer (§3.13, §36).
    if (detail === null) throw new NotFoundError('Aufgabe nicht gefunden.');
    return detail;
  });

  app.get('/tasks/:instanceId/history', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(InstanceIdParam, request.params);
    const query = parse(PageQuery, request.query);
    return listHistory(deps.db, ctx.householdId, {
      taskInstanceId: params.instanceId,
      cursor: query.cursor,
      limit: query.limit,
    });
  });

  app.post('/tasks/:instanceId/volunteer', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(InstanceIdParam, request.params);
    const body = parse(VolunteerBody, request.body);
    const result = await volunteerForTask(deps, {
      householdId: ctx.householdId,
      timezone: ctx.householdTimezone,
      memberId: ctx.memberId,
      instanceId: params.instanceId,
      expectedVersion: body.expectedVersion,
    });
    return {
      instance: result.instance,
      assignment: result.instance.activeAssignment,
      pointsAwarded: result.pointsAwarded,
    };
  });

  app.post('/tasks/:instanceId/complete', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(InstanceIdParam, request.params);
    const body = parse(CompleteBody, request.body);
    return completeTask(deps, {
      householdId: ctx.householdId,
      timezone: ctx.householdTimezone,
      actorMemberId: ctx.memberId,
      actorIsAdmin: false,
      instanceId: params.instanceId,
      assignmentId: body.assignmentId,
      expectedVersion: body.expectedVersion,
    });
  });

  app.post('/tasks/:instanceId/release', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    const params = parse(InstanceIdParam, request.params);
    const body = parse(ReleaseBody, request.body);
    const result = await releaseOrRevokeAssignment(deps, {
      householdId: ctx.householdId,
      timezone: ctx.householdTimezone,
      actorMemberId: ctx.memberId,
      actorIsAdmin: false,
      instanceId: params.instanceId,
      assignmentId: body.assignmentId,
      mode: 'RELEASE',
    });
    const detail = await loadInstanceDetail(
      deps.db,
      viewerContext(deps, ctx),
      result.instanceId,
      await viewerBalance(deps, ctx),
    );
    return { instance: detail, clawedBack: result.clawedBack };
  });
}

export { viewerBalance, viewerContext, MEMBER_ACTION_LIMIT };
