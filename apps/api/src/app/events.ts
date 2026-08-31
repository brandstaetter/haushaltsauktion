/**
 * History and audit writers (Architektur §2.6, §23).
 *
 * Two distinct streams, deliberately: `TaskHistoryEvent` is what a family
 * member reads on the task timeline (§22), `AuditEvent` is what an admin reads
 * when they need to know who changed what (§23). Both store **structured data,
 * never prose** (§0) — the German rendering lives in the web app, which is what
 * lets a task be renamed without rewriting its own history.
 */

import type { PrismaTx } from './deps.js';

export interface HistoryDraft {
  householdId: string;
  taskInstanceId: string;
  assignmentId?: string | null;
  memberId?: string | null;
  type: string;
  payload: Record<string, unknown>;
}

export async function writeHistory(
  tx: PrismaTx,
  drafts: readonly HistoryDraft[],
): Promise<void> {
  if (drafts.length === 0) return;
  // createMany preserves insertion order for `seq`, which is what makes the §22
  // timeline read in the order the events actually happened.
  await tx.taskHistoryEvent.createMany({
    data: drafts.map((d) => ({
      householdId: d.householdId,
      taskInstanceId: d.taskInstanceId,
      assignmentId: d.assignmentId ?? null,
      memberId: d.memberId ?? null,
      type: d.type as never,
      payload: d.payload as never,
    })),
  });
}

export interface AuditDraft {
  householdId: string;
  actorType: 'MEMBER' | 'ADMIN' | 'SYSTEM';
  actorMemberId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAudit(tx: PrismaTx, draft: AuditDraft): Promise<void> {
  await tx.auditEvent.create({
    data: {
      householdId: draft.householdId,
      actorType: draft.actorType as never,
      actorMemberId: draft.actorMemberId ?? null,
      action: draft.action as never,
      entityType: draft.entityType,
      entityId: draft.entityId ?? null,
      payload: draft.payload as never,
      ipAddress: draft.ipAddress ?? null,
    },
  });
}
