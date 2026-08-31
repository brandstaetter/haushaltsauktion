/**
 * Member-scoped integration routes (Architektur Todoist §10).
 *
 * **No `:memberId` path parameter anywhere, deliberately.** The member id comes
 * from `requireMember`, which resolves it from the session and re-checks
 * membership on every request (`context.ts`). That makes these routes
 * self-scoping by construction: there is simply no URL an admin could type to
 * reach another adult's Todoist credential. A personal token grants full access
 * to that person's account, so this is §36, not tidiness.
 *
 * Every response body is the `TodoistIntegrationView` projection, which never
 * reads the token columns. `integration-secrecy.test.ts` asserts that across
 * every route.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  connectTodoist,
  disconnectTodoist,
  listTodoistProjects,
  testTodoistConnection,
  updateTodoistSettings,
} from '../../../app/integrations/connectTodoist.js';
import type { Deps } from '../../../app/deps.js';
import { readTodoistIntegration } from '../../../app/queries/integrationReads.js';
import { requireMember } from '../context.js';
import { parse } from './_validate.js';
import { MEMBER_ACTION_LIMIT } from './tasks.js';

const ConnectBody = z.object({
  // Generous upper bound rather than a format guess: Todoist has changed token
  // shapes before, and rejecting a valid token would be worse than letting the
  // live probe be the judge.
  token: z.string().min(8).max(512),
});

/**
 * Keys are exactly the `AssignmentKind` values, uppercase.
 *
 * `strictObject` matters here: a client sending `{random: true}` would
 * otherwise be silently accepted and then read as "off" by the reconciler,
 * which is a bug that shipped once already and made the whole feature inert.
 * Better a 422 than a feature that quietly does nothing.
 */
const TriggersBody = z.strictObject({
  VOLUNTARY: z.boolean(),
  RANDOM: z.boolean(),
});

const PatchBody = z.object({
  projectId: z.string().min(1).max(64).nullable().optional(),
  triggers: TriggersBody.optional(),
});

export async function registerIntegrationRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/integrations/todoist', async (request, reply) => {
    const ctx = requireMember(request, reply);
    return readTodoistIntegration(deps.db, ctx.householdId, ctx.memberId);
  });

  // Rate-limited: it reaches a third party on member-supplied input (§36).
  app.put('/integrations/todoist', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    const body = parse(ConnectBody, request.body);
    return connectTodoist(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      token: body.token,
      ipAddress: request.ip,
    });
  });

  app.patch('/integrations/todoist', async (request, reply) => {
    const ctx = requireMember(request, reply);
    const body = parse(PatchBody, request.body);
    return updateTodoistSettings(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      ...(body.projectId === undefined ? {} : { projectId: body.projectId }),
      ...(body.triggers === undefined ? {} : { triggers: body.triggers }),
      ipAddress: request.ip,
    });
  });

  app.delete('/integrations/todoist', async (request, reply) => {
    const ctx = requireMember(request, reply);
    return disconnectTodoist(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
      ipAddress: request.ip,
    });
  });

  app.post('/integrations/todoist/test', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    return testTodoistConnection(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
    });
  });

  app.get('/integrations/todoist/projects', MEMBER_ACTION_LIMIT, async (request, reply) => {
    const ctx = requireMember(request, reply);
    return listTodoistProjects(deps, {
      householdId: ctx.householdId,
      memberId: ctx.memberId,
    });
  });
}
