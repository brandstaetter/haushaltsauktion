/**
 * `POST /api/admin/members/:id/points/adjust` (§3.11, §14).
 *
 * A ledger-only operation: it enters at level 3 and takes nothing above it
 * (§4.2), so it can never be the waiting half of a deadlock cycle.
 *
 * The mandatory `reason` is not ceremony. §14's whole point is that a balance
 * never moves without a traceable justification; an adjustment with an empty
 * reason is exactly the "just set the number" edit the ledger exists to
 * prevent, so it is rejected rather than stored blank.
 */

import { ValidationError } from '../../domain/errors.js';
import type { Deps } from '../deps.js';
import { writeAudit } from '../events.js';
import { withTransaction } from '../tx.js';
import { postTransaction } from './postTransaction.js';

export interface AdjustPointsInput {
  householdId: string;
  actorMemberId: string;
  memberId: string;
  amount: number;
  reason: string;
  /** MANUAL_ADJUSTMENT unless the admin explicitly books a BONUS or PENALTY. */
  type?: 'MANUAL_ADJUSTMENT' | 'BONUS' | 'PENALTY' | 'CORRECTION';
}

export async function adjustPoints(
  deps: Deps,
  input: AdjustPointsInput,
): Promise<{ id: string; amount: number; balanceAfter: number }> {
  if (input.reason.trim().length === 0) {
    throw new ValidationError('VALIDATION_FAILED', 'Eine Begründung ist erforderlich.', {
      fieldErrors: [{ path: 'reason', message: 'Begründung darf nicht leer sein.' }],
    });
  }
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new ValidationError('VALIDATION_FAILED', 'Der Betrag muss eine ganze Zahl ungleich 0 sein.', {
      fieldErrors: [{ path: 'amount', message: 'Ganzzahl ungleich 0 erforderlich.' }],
    });
  }

  return withTransaction(deps, async (tx) => {
    const posted = await postTransaction(tx, {
      householdId: input.householdId,
      memberId: input.memberId,
      amount: input.amount,
      type: input.type ?? 'MANUAL_ADJUSTMENT',
      description: input.reason,
      initiatorMemberId: input.actorMemberId,
      initiatorType: 'ADMIN',
    });

    await writeAudit(tx, {
      householdId: input.householdId,
      actorType: 'ADMIN',
      actorMemberId: input.actorMemberId,
      action: 'POINTS_ADJUSTED',
      entityType: 'HouseholdMember',
      entityId: input.memberId,
      payload: {
        amount: input.amount,
        reason: input.reason,
        transactionId: posted.id,
        balanceAfter: posted.balanceAfter,
      },
    });

    return { id: posted.id, amount: posted.amount, balanceAfter: posted.balanceAfter };
  });
}
