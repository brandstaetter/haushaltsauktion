import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PointTransactionDto } from '@haushaltsauktion/shared';

import { LedgerRow } from './LedgerRow';

const transaction: PointTransactionDto = {
  id: 'tx-1',
  seq: '1',
  amount: 6,
  balanceBefore: 36,
  balanceAfter: 42,
  type: 'VOLUNTARY_TASK_REWARD',
  taskInstanceId: 'instance-bathroom-1',
  taskInstanceTitle: 'Bad putzen',
  taskAssignmentId: 'assignment-1',
  description: 'Freiwillige Übernahme erledigt',
  createdAt: new Date('2026-01-01T12:00:00Z').toISOString(),
  initiator: { memberId: 'member-elke', displayName: 'Elke' },
};

function renderRow(tx: PointTransactionDto) {
  return render(
    <ol>
      <LedgerRow transaction={tx} />
    </ol>,
  );
}

describe('LedgerRow', () => {
  it('zeigt Typ, Aufgabentitel, Betrag und Saldo danach', () => {
    renderRow(transaction);
    expect(screen.getByText('Freiwillige Aufgabe')).toBeInTheDocument();
    expect(screen.getByText('Bad putzen')).toBeInTheDocument();
    expect(screen.getByText('+6')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('zeigt keine Aufgabenzeile ohne verknüpfte Aufgabe', () => {
    renderRow({ ...transaction, taskInstanceTitle: null });
    expect(screen.queryByText('Bad putzen')).not.toBeInTheDocument();
  });

  it('stellt negative Beträge mit Vorzeichen dar', () => {
    renderRow({ ...transaction, amount: -2, type: 'BUYOUT' });
    expect(screen.getByText('−2')).toBeInTheDocument();
  });
});
