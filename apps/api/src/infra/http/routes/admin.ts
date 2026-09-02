/**
 * Admin routes (Architektur §3.10, §3.11; CLAUDE.md §17, §23).
 *
 * §17 requires that every rule be changeable without a deployment, and §31's
 * "show the consequence first" applies to admins too: `/config/preview` and
 * `/config/validate` run the *same* validation and worked-example code that
 * `PUT /config` runs, so a preview is never a preview of different behaviour.
 *
 * Formulas are parsed and probed **here, on the server** (§6.5). §17 and §36
 * both forbid evaluating a configured expression in the browser, so the admin
 * UI's live preview is this endpoint rather than a client-side evaluator.
 */

import { DEFAULT_CONFIG, HouseholdConfigSchema } from '@haushaltsauktion/shared';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { releaseOrRevokeAssignment } from '../../../app/assignment/reopen.js';
import { runAssignmentSweep } from '../../../app/assignment/runAssignmentSweep.js';
import { loadConfigVersion, loadCurrentConfig } from '../../../app/config/load.js';
import { rollbackConfig, updateConfig } from '../../../app/config/updateConfig.js';
import { validateAndPreview } from '../../../app/config/validateConfig.js';
import type { Deps } from '../../../app/deps.js';
import { adjustPoints } from '../../../app/points/adjustPoints.js';
import { verifyLedgerIntegrity } from '../../../app/points/verifyLedgerIntegrity.js';
import { completeTask } from '../../../app/tasks/completeTask.js';
import { rejectCompletion } from '../../../app/tasks/rejectCompletion.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../domain/errors.js';
import {
  dueAtFor,
  nextOccurrence,
  offerExpiresAt,
} from '../../../domain/recurrence/next-occurrence.js';
import { generateTemporaryPassword, hashPassword } from '../../auth/password.js';
import { requireAdmin } from '../context.js';
import { IdParam, PageQuery, parse } from './_validate.js';

const RecurrenceBody = z.object({
  type: z.enum(['ONCE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'EVERY_N_DAYS', 'MONTHLY', 'MANUAL']),
  interval: z.number().int().min(1).max(365).nullable().default(null),
  weekdays: z.array(z.number().int().min(1).max(7)).default([]),
  dayOfMonth: z.number().int().min(1).max(28).nullable().default(null),
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Format HH:mm')
    .nullable()
    .default(null),
  dueOffsetMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().default(null),
});

const DefinitionBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  categoryId: z.string().max(64).nullable().default(null),
  baseValue: z.number().int().min(0).max(100_000),
  estimatedMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
  buyoutEnabled: z.boolean().default(true),
  isActive: z.boolean().default(true),
  recurrence: RecurrenceBody,
});

const EligibilityBody = z.object({
  included: z.array(z.string().min(1).max(64)).default([]),
  excluded: z.array(z.string().min(1).max(64)).default([]),
});

const ConfigPutBody = z.object({
  expectedVersion: z.number().int().min(1),
  values: z.unknown(),
});

const ConfigDryRunBody = z.object({
  values: z.unknown(),
  sampleBaseValue: z.number().int().min(0).max(10_000).optional(),
});

const MemberCreateBody = z.object({
  email: z.string().min(3).max(320),
  displayName: z.string().min(1).max(100),
  password: z.string().min(8).max(512).optional(),
  role: z.enum(['MEMBER', 'ADMIN']).default('MEMBER'),
});

const MemberPatchBody = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  role: z.enum(['MEMBER', 'ADMIN']).optional(),
  maxRandomAssignmentsPerWeek: z.number().int().min(0).max(1000).nullable().optional(),
});

const PasswordResetBody = z.object({
  password: z.string().min(8).max(512).optional(),
});

const RestrictionsBody = z.object({
  excludedCategoryIds: z.array(z.string().min(1).max(64)).default([]),
  excludedTaskDefinitionIds: z.array(z.string().min(1).max(64)).default([]),
  absences: z
    .array(
      z.object({
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        reason: z.string().max(500).nullable().default(null),
      }),
    )
    .default([]),
});

const AdjustBody = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(500),
  type: z.enum(['MANUAL_ADJUSTMENT', 'BONUS', 'PENALTY', 'CORRECTION']).optional(),
});

/** §3.12 — config writes and sweeps are cheap to call and expensive to run. */
const ADMIN_WRITE_LIMIT = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
      keyGenerator: (request: { ctx?: { memberId: string }; ip: string }) =>
        request.ctx?.memberId ?? request.ip,
    },
  },
};

export async function registerAdminRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // ───────────────────────── configuration (§3.10) ─────────────────────────

  app.get('/admin/config', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const current = await loadCurrentConfig(deps.db, ctx.householdId);
    const row = await deps.db.householdConfiguration.findUnique({
      where: { householdId_version: { householdId: ctx.householdId, version: current.version } },
      select: { createdAt: true, createdBy: { select: { id: true, displayName: true } } },
    });
    return {
      version: current.version,
      values: current.config,
      defaults: DEFAULT_CONFIG,
      updatedAt: row?.createdAt.toISOString() ?? null,
      updatedBy: row?.createdBy ?? null,
      // Lets the admin UI show the consequence *before* flipping the switch
      // (§31), rather than after the write is rejected or, worse, silently
      // accepted with no member ever able to connect.
      integrationsAvailable: { todoist: deps.todoist !== undefined && deps.secrets !== undefined },
    };
  });

  /** Drives the admin form (§3.10) — one source of truth for the field list. */
  app.get('/admin/config/schema', async (request, reply) => {
    requireAdmin(request, reply);
    return { jsonSchema: z.toJSONSchema(HouseholdConfigSchema, { io: 'input' }) };
  });

  app.get('/admin/config/versions', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const query = parse(PageQuery, request.query);
    const rows = await deps.db.householdConfiguration.findMany({
      where: { householdId: ctx.householdId },
      orderBy: { version: 'desc' },
      take: Math.min(query.limit ?? 25, 100),
      select: {
        version: true,
        createdAt: true,
        changeSummary: true,
        createdBy: { select: { id: true, displayName: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        version: r.version,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
        changeSummary: r.changeSummary,
      })),
    };
  });

  app.get('/admin/config/versions/:version', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(z.object({ version: z.coerce.number().int().min(1) }), request.params);
    return {
      version: params.version,
      values: await loadConfigVersion(deps.db, ctx.householdId, params.version),
    };
  });

  /**
   * Dry run. Writes nothing, shares the validation path with `PUT`, and returns
   * formula parse errors carrying the character offset the editor underlines.
   */
  const dryRun = async (request: unknown, reply: unknown) => {
    requireAdmin(request as never, reply as never);
    const body = parse(ConfigDryRunBody, (request as { body: unknown }).body);
    const result = validateAndPreview(
      body.values,
      body.sampleBaseValue === undefined ? {} : { sampleBaseValue: body.sampleBaseValue },
    );
    return {
      valid: result.valid,
      errors: result.fieldErrors,
      formulaErrors: result.formulaErrors,
      previews: result.previews,
    };
  };

  app.post('/admin/config/validate', ADMIN_WRITE_LIMIT, dryRun);
  /** Reconciliation §1.3 — the same dry run, named as the admin UI expects it. */
  app.post('/admin/config/preview', ADMIN_WRITE_LIMIT, dryRun);

  app.put('/admin/config', ADMIN_WRITE_LIMIT, async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const body = parse(ConfigPutBody, request.body);
    return updateConfig(deps, {
      householdId: ctx.householdId,
      actorMemberId: ctx.memberId,
      expectedVersion: body.expectedVersion,
      values: body.values,
      ipAddress: request.ip,
    });
  });

  app.post('/admin/config/rollback', ADMIN_WRITE_LIMIT, async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const body = parse(z.object({ toVersion: z.number().int().min(1) }), request.body);
    return rollbackConfig(deps, {
      householdId: ctx.householdId,
      actorMemberId: ctx.memberId,
      toVersion: body.toVersion,
    });
  });

  // ───────────────────────── task definitions (§3.11) ─────────────────────────

  app.get('/admin/task-definitions', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const query = parse(
      z.object({ includeArchived: z.enum(['true', 'false']).optional() }),
      request.query,
    );
    const rows = await deps.db.taskDefinition.findMany({
      where: {
        householdId: ctx.householdId,
        ...(query.includeArchived === 'true' ? {} : { archivedAt: null }),
      },
      orderBy: { title: 'asc' },
      include: {
        category: { select: { id: true, name: true, colorHex: true } },
        eligibility: { select: { memberId: true, mode: true } },
      },
    });
    return { items: rows };
  });

  app.post('/admin/task-definitions', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const body = parse(DefinitionBody, request.body);
    const created = await deps.db.taskDefinition.create({
      data: {
        householdId: ctx.householdId,
        title: body.title,
        description: body.description,
        categoryId: body.categoryId,
        baseValue: body.baseValue,
        estimatedMinutes: body.estimatedMinutes,
        buyoutEnabled: body.buyoutEnabled,
        isActive: body.isActive,
        recurrenceType: body.recurrence.type,
        recurrenceInterval: body.recurrence.interval,
        recurrenceWeekdays: body.recurrence.weekdays,
        recurrenceDayOfMonth: body.recurrence.dayOfMonth,
        recurrenceTimeOfDay: body.recurrence.timeOfDay,
        dueOffsetMinutes: body.recurrence.dueOffsetMinutes,
        nextDueAt: nextOccurrence(
          { ...body.recurrence },
          deps.clock.now(),
          ctx.householdTimezone,
        ),
      },
    });
    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action: 'TASK_DEFINITION_CREATED',
        entityType: 'TaskDefinition',
        entityId: created.id,
        payload: { title: created.title, baseValue: created.baseValue },
      },
    });
    return reply.status(201).send(created);
  });

  app.get('/admin/task-definitions/:id', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const row = await deps.db.taskDefinition.findFirst({
      where: { id: params.id, householdId: ctx.householdId },
      include: {
        category: true,
        eligibility: true,
        instances: {
          where: { status: { in: ['DRAFT', 'AVAILABLE', 'ASSIGNED', 'PAUSED'] } },
          select: {
            id: true,
            status: true,
            currentValue: true,
            dueAt: true,
            // Same shape as `INSTANCE_INCLUDE.assignments` in taskDto.ts, minus
            // the buyout-quote fields the admin list doesn't need — one active
            // assignment per instance, joined for the member's display name.
            assignments: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                kind: true,
                member: { select: { id: true, displayName: true } },
              },
            },
          },
        },
      },
    });
    if (row === null) throw new NotFoundError('Aufgabendefinition nicht gefunden.');

    // §33's Market Value: the average value at which this chore was actually
    // taken on voluntarily, which is what tells an admin their base value is
    // too low far better than an opinion does.
    const taken = await deps.db.taskAssignment.aggregate({
      where: {
        householdId: ctx.householdId,
        kind: 'VOLUNTARY',
        instance: { taskDefinitionId: params.id },
      },
      _avg: { valueAtAssignment: true },
      _count: true,
    });

    return {
      ...row,
      marketValue: {
        averageVoluntaryTakeoverValue: taken._avg.valueAtAssignment,
        sampleSize: taken._count,
      },
    };
  });

  app.put('/admin/task-definitions/:id', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(DefinitionBody, request.body);
    // §1.4 — changing `baseValue` deliberately does NOT touch open instances:
    // each one snapshotted its reset target at materialization so an edit
    // mid-cycle cannot move the payout of a chore already in flight.
    const { count } = await deps.db.taskDefinition.updateMany({
      where: { id: params.id, householdId: ctx.householdId },
      data: {
        title: body.title,
        description: body.description,
        categoryId: body.categoryId,
        baseValue: body.baseValue,
        estimatedMinutes: body.estimatedMinutes,
        buyoutEnabled: body.buyoutEnabled,
        isActive: body.isActive,
        recurrenceType: body.recurrence.type,
        recurrenceInterval: body.recurrence.interval,
        recurrenceWeekdays: body.recurrence.weekdays,
        recurrenceDayOfMonth: body.recurrence.dayOfMonth,
        recurrenceTimeOfDay: body.recurrence.timeOfDay,
        dueOffsetMinutes: body.recurrence.dueOffsetMinutes,
      },
    });
    if (count === 0) throw new NotFoundError('Aufgabendefinition nicht gefunden.');
    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action: 'TASK_DEFINITION_UPDATED',
        entityType: 'TaskDefinition',
        entityId: params.id,
        payload: { title: body.title, baseValue: body.baseValue },
      },
    });
    return { id: params.id };
  });

  app.delete('/admin/task-definitions/:id', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const open = await deps.db.taskInstance.count({
      where: {
        householdId: ctx.householdId,
        taskDefinitionId: params.id,
        status: { in: ['DRAFT', 'AVAILABLE', 'ASSIGNED', 'PAUSED'] },
      },
    });
    if (open > 0) {
      throw new ConflictError('HAS_OPEN_INSTANCES', 'Es gibt noch offene Instanzen.', {
        count: open,
      });
    }
    // Soft archive: a hard delete would orphan the history of every instance
    // this definition ever produced, which §22 needs to stay readable.
    const { count } = await deps.db.taskDefinition.updateMany({
      where: { id: params.id, householdId: ctx.householdId },
      data: { archivedAt: deps.clock.now(), isActive: false, nextDueAt: null },
    });
    if (count === 0) throw new NotFoundError('Aufgabendefinition nicht gefunden.');
    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action: 'TASK_DEFINITION_ARCHIVED',
        entityType: 'TaskDefinition',
        entityId: params.id,
        payload: {},
      },
    });
    return reply.status(204).send();
  });

  app.put('/admin/task-definitions/:id/eligibility', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(EligibilityBody, request.body);

    const definition = await deps.db.taskDefinition.findFirst({
      where: { id: params.id, householdId: ctx.householdId },
      select: { id: true },
    });
    if (definition === null) throw new NotFoundError('Aufgabendefinition nicht gefunden.');

    await deps.db.$transaction(async (tx) => {
      await tx.taskDefinitionEligibility.deleteMany({
        where: { householdId: ctx.householdId, taskDefinitionId: params.id },
      });
      await tx.taskDefinitionEligibility.createMany({
        data: [
          ...body.included.map((memberId) => ({
            householdId: ctx.householdId,
            taskDefinitionId: params.id,
            memberId,
            mode: 'INCLUDED' as const,
          })),
          ...body.excluded.map((memberId) => ({
            householdId: ctx.householdId,
            taskDefinitionId: params.id,
            memberId,
            mode: 'EXCLUDED' as const,
          })),
        ],
        skipDuplicates: true,
      });
    });
    return { id: params.id };
  });

  /**
   * T1 (+ optionally T2) on demand (§18) — usable for any recurrence type,
   * not just `MANUAL`: an auto-scheduled definition can also be materialized
   * ahead of its next scheduled occurrence. Still subject to the open-instance
   * cap below, so it can't be used to bypass `maxOpenInstancesPerDefinition`.
   */
  app.post('/admin/task-definitions/:id/materialize', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(
      z.object({
        scheduledFor: z.coerce.date().optional(),
        publishImmediately: z.boolean().default(true),
      }),
      request.body ?? {},
    );

    const definition = await deps.db.taskDefinition.findFirst({
      where: { id: params.id, householdId: ctx.householdId, archivedAt: null },
      select: {
        id: true,
        title: true,
        baseValue: true,
        carriedValue: true,
        recurrenceType: true,
        recurrenceInterval: true,
        recurrenceWeekdays: true,
        recurrenceDayOfMonth: true,
        recurrenceTimeOfDay: true,
        dueOffsetMinutes: true,
      },
    });
    if (definition === null) throw new NotFoundError('Aufgabendefinition nicht gefunden.');

    const now = deps.clock.now();
    const current = await loadCurrentConfig(deps.db, ctx.householdId);
    const openCount = await deps.db.taskInstance.count({
      where: {
        householdId: ctx.householdId,
        taskDefinitionId: params.id,
        status: { in: ['DRAFT', 'AVAILABLE', 'ASSIGNED', 'PAUSED'] },
      },
    });
    if (openCount >= current.config.tasks.maxOpenInstancesPerDefinition) {
      throw new ConflictError('HAS_OPEN_INSTANCES', 'Obergrenze offener Instanzen erreicht.', {
        count: openCount,
      });
    }

    const rule = {
      type: definition.recurrenceType,
      interval: definition.recurrenceInterval,
      weekdays: definition.recurrenceWeekdays,
      dayOfMonth: definition.recurrenceDayOfMonth,
      timeOfDay: definition.recurrenceTimeOfDay,
      dueOffsetMinutes: definition.dueOffsetMinutes,
    };
    const scheduledFor = body.scheduledFor ?? now;
    const dueAt = dueAtFor(rule, scheduledFor);

    const instance = await deps.db.taskInstance.create({
      data: {
        householdId: ctx.householdId,
        taskDefinitionId: params.id,
        status: body.publishImmediately ? 'AVAILABLE' : 'DRAFT',
        currentValue: definition.carriedValue ?? definition.baseValue,
        baseValue: definition.baseValue,
        scheduledFor,
        dueAt,
        publishedAt: body.publishImmediately ? now : null,
        offerExpiresAt: body.publishImmediately
          ? offerExpiresAt({
              publishedAt: now,
              dueAt,
              leadMinutesBeforeDue: current.config.assignment.leadMinutesBeforeDue,
            })
          : null,
        configVersion: current.version,
      },
    });

    await deps.db.taskHistoryEvent.createMany({
      data: [
        {
          householdId: ctx.householdId,
          taskInstanceId: instance.id,
          type: 'CREATED',
          payload: { title: definition.title, value: instance.currentValue },
        },
        ...(body.publishImmediately
          ? [
              {
                householdId: ctx.householdId,
                taskInstanceId: instance.id,
                type: 'OFFERED' as const,
                payload: { title: definition.title, value: instance.currentValue },
              },
            ]
          : []),
      ],
    });

    return reply.status(201).send({ instance });
  });

  // ───────────────────────── categories ─────────────────────────

  app.get('/admin/categories', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    return {
      items: await deps.db.taskCategory.findMany({
        where: { householdId: ctx.householdId },
        orderBy: { sortOrder: 'asc' },
      }),
    };
  });

  const CategoryBody = z.object({
    name: z.string().min(1).max(100),
    colorHex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .default(null),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  });

  app.post('/admin/categories', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const body = parse(CategoryBody, request.body);
    const created = await deps.db.taskCategory.create({
      data: { householdId: ctx.householdId, ...body },
    });
    return reply.status(201).send(created);
  });

  app.put('/admin/categories/:id', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(CategoryBody, request.body);
    const { count } = await deps.db.taskCategory.updateMany({
      where: { id: params.id, householdId: ctx.householdId },
      data: body,
    });
    if (count === 0) throw new NotFoundError('Kategorie nicht gefunden.');
    return { id: params.id };
  });

  app.delete('/admin/categories/:id', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const inUse = await deps.db.taskDefinition.count({
      where: { householdId: ctx.householdId, categoryId: params.id },
    });
    if (inUse > 0) {
      throw new ConflictError('CATEGORY_IN_USE', 'Kategorie wird noch verwendet.', {
        count: inUse,
      });
    }
    await deps.db.taskCategory.deleteMany({
      where: { id: params.id, householdId: ctx.householdId },
    });
    return reply.status(204).send();
  });

  // ───────────────────────── members ─────────────────────────

  app.get('/admin/members', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    return {
      items: await deps.db.householdMember.findMany({
        where: { householdId: ctx.householdId },
        include: {
          user: { select: { email: true, isActive: true } },
          categoryExclusions: { select: { categoryId: true } },
          absences: { select: { id: true, startsAt: true, endsAt: true, reason: true } },
          taskEligibility: { select: { taskDefinitionId: true, mode: true } },
        },
        orderBy: { displayName: 'asc' },
      }),
    };
  });

  app.post('/admin/members', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const body = parse(MemberCreateBody, request.body);
    const email = body.email.trim().toLowerCase();

    // §26 — a person may belong to several households, so an existing user is
    // reused rather than duplicated. Only the membership is new — and only a
    // genuinely new user gets a generated password, since `temporaryPassword`
    // below must never claim to have changed an existing account's password.
    const preexisting = await deps.db.user.findUnique({ where: { email }, select: { id: true } });
    const isNewUser = preexisting === null;
    const temporaryPassword = isNewUser && body.password === undefined ? generateTemporaryPassword() : null;
    const newAccountPassword = body.password ?? temporaryPassword;

    const user = await deps.db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        displayName: body.displayName,
        // Prisma only evaluates `create` when no row matched `where`, i.e. when
        // `isNewUser` is true — the branch that always leaves
        // `newAccountPassword` defined, despite the static type.
        passwordHash: await hashPassword(newAccountPassword!),
      },
      select: { id: true },
    });

    const existing = await deps.db.householdMember.findFirst({
      where: { householdId: ctx.householdId, userId: user.id },
      select: { id: true },
    });
    if (existing !== null) {
      throw new ConflictError('CATEGORY_IN_USE', 'Diese Person ist bereits Mitglied.', {
        count: 1,
      });
    }

    const member = await deps.db.householdMember.create({
      data: {
        householdId: ctx.householdId,
        userId: user.id,
        displayName: body.displayName,
        role: body.role,
      },
    });
    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action: 'MEMBER_CREATED',
        entityType: 'HouseholdMember',
        entityId: member.id,
        payload: { email, role: body.role },
      },
    });
    // Shown to the admin exactly once (§25) — nothing persists the plaintext,
    // so this response is the only place it will ever be visible again.
    return reply.status(201).send({ ...member, temporaryPassword });
  });

  app.patch('/admin/members/:id', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(MemberPatchBody, request.body);

    const target = await deps.db.householdMember.findFirst({
      where: { id: params.id, householdId: ctx.householdId },
      select: { id: true, role: true, isActive: true },
    });
    if (target === null) throw new NotFoundError('Mitglied nicht gefunden.');

    // A household with no admin can never be administered again — there is no
    // route back short of a database edit, so the demotion is refused.
    const losesAdmin =
      target.role === 'ADMIN' && (body.role === 'MEMBER' || body.isActive === false);
    if (losesAdmin) {
      const admins = await deps.db.householdMember.count({
        where: { householdId: ctx.householdId, role: 'ADMIN', isActive: true },
      });
      if (admins <= 1) {
        throw new ValidationError('LAST_ADMIN', 'Der letzte Admin kann nicht entfernt werden.');
      }
    }

    await deps.db.householdMember.updateMany({
      where: { id: params.id, householdId: ctx.householdId },
      data: {
        ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
        ...(body.avatarUrl === undefined ? {} : { avatarUrl: body.avatarUrl }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
        ...(body.role === undefined ? {} : { role: body.role }),
        ...(body.maxRandomAssignmentsPerWeek === undefined
          ? {}
          : { maxRandomAssignmentsPerWeek: body.maxRandomAssignmentsPerWeek }),
      },
    });
    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action: body.role === undefined ? 'MEMBER_UPDATED' : 'ROLE_CHANGED',
        entityType: 'HouseholdMember',
        entityId: params.id,
        payload: { ...body },
      },
    });
    return { id: params.id };
  });

  /**
   * Admin-forced password reset. §25 needs this: without it a locked-out
   * member has no recovery path in a household with no email/SMTP setup.
   * Rate-limited like `/auth/password` (§36 — no unlimited guesses against
   * the argon2id hash this ultimately rewrites) and keyed by household so one
   * admin's resets cannot exhaust another household's budget.
   */
  app.post(
    '/admin/members/:id/reset-password',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
          keyGenerator: (request: { ctx?: { householdId: string }; ip: string }) =>
            request.ctx?.householdId ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const ctx = requireAdmin(request, reply);
      const params = parse(IdParam, request.params);
      const body = parse(PasswordResetBody, request.body ?? {});

      const target = await deps.db.householdMember.findFirst({
        where: { id: params.id, householdId: ctx.householdId },
        select: { userId: true },
      });
      if (target === null) throw new NotFoundError('Mitglied nicht gefunden.');

      const temporaryPassword = body.password ?? generateTemporaryPassword();
      await deps.db.user.update({
        where: { id: target.userId },
        data: { passwordHash: await hashPassword(temporaryPassword) },
      });
      // The old password must stop working everywhere immediately — mirrors
      // the self-service `/auth/password` invalidation in auth.ts.
      await deps.db.session.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: deps.clock.now() },
      });

      await deps.db.auditEvent.create({
        data: {
          householdId: ctx.householdId,
          actorType: 'ADMIN',
          actorMemberId: ctx.memberId,
          action: 'PASSWORD_RESET',
          entityType: 'HouseholdMember',
          entityId: params.id,
          // Never the plaintext or its hash — only whether the admin chose it
          // or it was generated (§36).
          payload: { generated: body.password === undefined },
        },
      });

      // Shown once, same as the create-member temporary password (§25).
      return reply.status(200).send({ id: params.id, temporaryPassword });
    },
  );

  app.put('/admin/members/:id/restrictions', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(RestrictionsBody, request.body);

    const member = await deps.db.householdMember.findFirst({
      where: { id: params.id, householdId: ctx.householdId },
      select: { id: true },
    });
    if (member === null) throw new NotFoundError('Mitglied nicht gefunden.');
    for (const absence of body.absences) {
      if (absence.endsAt <= absence.startsAt) {
        throw new ValidationError('VALIDATION_FAILED', 'Abwesenheit: Ende muss nach Beginn liegen.', {
          fieldErrors: [{ path: 'absences', message: 'endsAt muss nach startsAt liegen.' }],
        });
      }
    }

    await deps.db.$transaction(async (tx) => {
      await tx.memberCategoryExclusion.deleteMany({
        where: { householdId: ctx.householdId, memberId: params.id },
      });
      await tx.memberCategoryExclusion.createMany({
        data: body.excludedCategoryIds.map((categoryId) => ({
          householdId: ctx.householdId,
          memberId: params.id,
          categoryId,
        })),
        skipDuplicates: true,
      });

      await tx.taskDefinitionEligibility.deleteMany({
        where: { householdId: ctx.householdId, memberId: params.id, mode: 'EXCLUDED' },
      });
      await tx.taskDefinitionEligibility.createMany({
        data: body.excludedTaskDefinitionIds.map((taskDefinitionId) => ({
          householdId: ctx.householdId,
          memberId: params.id,
          taskDefinitionId,
          mode: 'EXCLUDED' as const,
        })),
        skipDuplicates: true,
      });

      await tx.memberAbsence.deleteMany({
        where: { householdId: ctx.householdId, memberId: params.id },
      });
      await tx.memberAbsence.createMany({
        data: body.absences.map((a) => ({
          householdId: ctx.householdId,
          memberId: params.id,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          reason: a.reason,
        })),
      });
    });

    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action: 'RESTRICTIONS_UPDATED',
        entityType: 'HouseholdMember',
        entityId: params.id,
        payload: { ...body },
      },
    });
    return { id: params.id };
  });

  app.post('/admin/members/:id/points/adjust', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(AdjustBody, request.body);
    return adjustPoints(deps, {
      householdId: ctx.householdId,
      actorMemberId: ctx.memberId,
      memberId: params.id,
      amount: body.amount,
      reason: body.reason,
      ...(body.type === undefined ? {} : { type: body.type }),
    });
  });

  // ───────────────────────── instances ─────────────────────────

  const instanceAction = async (
    ctx: { householdId: string; memberId: string },
    instanceId: string,
    action: 'publish' | 'pause' | 'resume' | 'cancel',
    now: Date,
  ) => {
    const instance = await deps.db.taskInstance.findFirst({
      where: { id: instanceId, householdId: ctx.householdId },
      select: { id: true, status: true, configVersion: true, dueAt: true, version: true },
    });
    if (instance === null) throw new NotFoundError('Aufgabe nicht gefunden.');

    const cfg = await loadConfigVersion(deps.db, ctx.householdId, instance.configVersion);
    const allowed: Record<typeof action, string[]> = {
      publish: ['DRAFT'],
      pause: ['DRAFT', 'AVAILABLE'],
      resume: ['PAUSED'],
      cancel: ['DRAFT', 'AVAILABLE', 'PAUSED'],
    };
    if (!allowed[action].includes(instance.status)) {
      throw new ConflictError('ILLEGAL_TRANSITION', `Aktion im Status ${instance.status} unzulässig.`, {
        from: instance.status,
        event: action.toUpperCase(),
      });
    }

    const offer = new Date(now.getTime() + cfg.assignment.offerDurationMinutes * 60_000);
    const data =
      action === 'publish'
        ? { status: 'AVAILABLE' as const, publishedAt: now, offerExpiresAt: offer }
        : action === 'pause'
          ? { status: 'PAUSED' as const }
          : action === 'resume'
            ? { status: 'AVAILABLE' as const, offerExpiresAt: offer }
            : { status: 'CANCELLED' as const, closedAt: now };

    await deps.db.taskInstance.updateMany({
      where: { id: instanceId, householdId: ctx.householdId, version: instance.version },
      data: { ...data, version: { increment: 1 } },
    });

    const historyType =
      action === 'publish'
        ? 'OFFERED'
        : action === 'pause'
          ? 'PAUSED'
          : action === 'resume'
            ? 'RESUMED'
            : 'CANCELLED';
    await deps.db.taskHistoryEvent.create({
      data: {
        householdId: ctx.householdId,
        taskInstanceId: instanceId,
        type: historyType,
        payload: action === 'cancel' ? { reason: null } : {},
      },
    });
    await deps.db.auditEvent.create({
      data: {
        householdId: ctx.householdId,
        actorType: 'ADMIN',
        actorMemberId: ctx.memberId,
        action:
          action === 'publish'
            ? 'INSTANCE_PUBLISHED'
            : action === 'pause'
              ? 'INSTANCE_PAUSED'
              : action === 'resume'
                ? 'INSTANCE_RESUMED'
                : 'INSTANCE_CANCELLED',
        entityType: 'TaskInstance',
        entityId: instanceId,
        payload: {},
      },
    });
    return { id: instanceId, status: data.status };
  };

  for (const action of ['publish', 'pause', 'resume', 'cancel'] as const) {
    app.post(`/admin/instances/:id/${action}`, async (request, reply) => {
      const ctx = requireAdmin(request, reply);
      const params = parse(IdParam, request.params);
      return instanceAction(ctx, params.id, action, deps.clock.now());
    });
  }

  app.post('/admin/instances/:id/revoke-assignment', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(
      z.object({ reason: z.string().max(500).nullable().default(null) }),
      request.body ?? {},
    );
    const active = await deps.db.taskAssignment.findFirst({
      where: { householdId: ctx.householdId, taskInstanceId: params.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (active === null) throw new NotFoundError('Keine aktive Zuweisung.');

    return releaseOrRevokeAssignment(deps, {
      householdId: ctx.householdId,
      timezone: ctx.householdTimezone,
      actorMemberId: ctx.memberId,
      actorIsAdmin: true,
      instanceId: params.id,
      assignmentId: active.id,
      reason: body.reason,
      mode: 'REVOKE',
    });
  });

  app.post('/admin/instances/:id/complete', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const active = await deps.db.taskAssignment.findFirst({
      where: { householdId: ctx.householdId, taskInstanceId: params.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (active === null) throw new NotFoundError('Keine aktive Zuweisung.');

    return completeTask(deps, {
      householdId: ctx.householdId,
      timezone: ctx.householdTimezone,
      actorMemberId: ctx.memberId,
      actorIsAdmin: true,
      instanceId: params.id,
      assignmentId: active.id,
    });
  });

  app.post('/admin/instances/:id/reject-completion', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const params = parse(IdParam, request.params);
    const body = parse(
      z.object({
        reason: z.string().max(500).nullable().default(null),
        outcome: z.enum(['REASSIGN_TO_MEMBER', 'REOFFER_MARKET']),
      }),
      request.body ?? {},
    );
    const completed = await deps.db.taskAssignment.findFirst({
      where: { householdId: ctx.householdId, taskInstanceId: params.id, status: 'COMPLETED' },
      select: { id: true },
    });
    if (completed === null) throw new NotFoundError('Keine abgeschlossene Zuweisung.');

    return rejectCompletion(deps, {
      householdId: ctx.householdId,
      actorMemberId: ctx.memberId,
      instanceId: params.id,
      assignmentId: completed.id,
      reason: body.reason,
      outcome: body.outcome,
    });
  });

  // ───────────────────────── operations ─────────────────────────

  /**
   * The same use-case the interval worker calls (§7.2). That is what makes the
   * sweep testable without a timer and what guarantees the button and the job
   * behave identically.
   */
  app.post(
    '/admin/assignments/run',
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: '1 minute',
          keyGenerator: (request: { ctx?: { householdId: string }; ip: string }) =>
            request.ctx?.householdId ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const ctx = requireAdmin(request, reply);
      const body = parse(
        z.object({ dryRun: z.boolean().default(false) }),
        request.body ?? {},
      );
      return runAssignmentSweep(deps, {
        householdId: ctx.householdId,
        dryRun: body.dryRun,
      });
    },
  );

  app.get('/admin/audit-events', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    const query = parse(
      PageQuery.extend({
        action: z.string().max(64).optional(),
        entityType: z.string().max(64).optional(),
        entityId: z.string().max(64).optional(),
        memberId: z.string().max(64).optional(),
        since: z.coerce.date().optional(),
      }),
      request.query,
    );
    const rows = await deps.db.auditEvent.findMany({
      where: {
        householdId: ctx.householdId,
        ...(query.action ? { action: query.action as never } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.memberId ? { actorMemberId: query.memberId } : {}),
        ...(query.since ? { createdAt: { gte: query.since } } : {}),
      },
      orderBy: { seq: 'desc' },
      take: Math.min(query.limit ?? 50, 100),
      include: { actor: { select: { id: true, displayName: true } } },
    });
    return {
      items: rows.map((r) => ({ ...r, seq: String(r.seq), createdAt: r.createdAt.toISOString() })),
    };
  });

  app.get('/admin/ledger/integrity', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    return verifyLedgerIntegrity(deps.db, { householdId: ctx.householdId });
  });

  app.post('/admin/ledger/repair-cache', async (request, reply) => {
    const ctx = requireAdmin(request, reply);
    // Repair rewrites the *cache* from the ledger and nothing else. A bad
    // ledger entry is only ever answered with a compensating CORRECTION, which
    // is itself an audited row (§14, §8.5).
    return verifyLedgerIntegrity(deps.db, {
      householdId: ctx.householdId,
      repairCache: true,
      actorMemberId: ctx.memberId,
    });
  });
}
