import { BuyoutDenialReason, type BuyoutQuoteDto } from '@haushaltsauktion/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { de } from '../../strings/de';
import { BuyoutDisclosure } from './BuyoutDisclosure';

/**
 * Ein Angebot, wie es der Server liefert. Bewusst mit fünf unterschiedlichen
 * Zahlen, damit ein vertauschtes Feld auffällt und nicht durch einen
 * zufälligen Gleichstand durchrutscht.
 */
function quoteFixture(overrides: Partial<BuyoutQuoteDto> = {}): BuyoutQuoteDto {
  return {
    assignmentId: 'assignment-1',
    allowed: true,
    disallowedReason: null,
    cost: 6,
    balanceBefore: 10,
    balanceAfter: 4,
    taskValueBefore: 6,
    taskValueAfter: 9,
    costStrategy: 'CURRENT_TASK_VALUE',
    valueIncreaseStrategy: 'MULTIPLIER',
    buyoutsUsedThisWeek: 1,
    buyoutsAllowedThisWeek: 3,
    configVersion: 4,
    ...overrides,
  };
}

/** Liest den Wert, der im `<dd>` neben einem `<dt>` mit diesem Text steht. */
function valueFor(label: string): string {
  const term = screen.getByText(label);
  const pair = term.closest('div');
  if (!pair) throw new Error(`Kein <div> um "${label}" gefunden.`);
  return within(pair).getByRole('definition').textContent ?? '';
}

describe('BuyoutDisclosure', () => {
  it('zeigt alle fünf von §31 geforderten Werte', () => {
    render(<BuyoutDisclosure quote={quoteFixture()} />);

    expect(valueFor(de.buyout.balanceBefore)).toBe('10');
    expect(valueFor(de.buyout.cost)).toBe('6');
    expect(valueFor(de.buyout.balanceAfter)).toBe('4');
    expect(valueFor(de.buyout.valueBefore)).toBe('6');
    expect(valueFor(de.buyout.valueAfter)).toBe('9');
  });

  it('übernimmt die Zahlen unverändert vom Server, statt sie nachzurechnen (§36)', () => {
    // Absichtlich inkonsistent: 12 − 5 wäre 7, der Server sagt aber 2.
    // Angezeigt werden muss, was der Server sagt.
    render(
      <BuyoutDisclosure
        quote={quoteFixture({ balanceBefore: 12, cost: 5, balanceAfter: 2 })}
      />,
    );

    expect(valueFor(de.buyout.balanceAfter)).toBe('2');
  });

  it('formatiert große Zahlen deutsch', () => {
    render(<BuyoutDisclosure quote={quoteFixture({ balanceBefore: 1234 })} />);

    expect(valueFor(de.buyout.balanceBefore)).toBe('1.234');
  });

  it('nennt keinen Hinderungsgrund, solange der Freikauf erlaubt ist', () => {
    render(<BuyoutDisclosure quote={quoteFixture()} />);

    expect(screen.queryByRole('note')).toBeNull();
  });

  it('nennt den Grund, wenn der Freikauf nicht erlaubt ist (§31 keine versteckten Regeln)', () => {
    render(
      <BuyoutDisclosure
        quote={quoteFixture({
          allowed: false,
          disallowedReason: BuyoutDenialReason.WEEKLY_LIMIT_REACHED,
        })}
      />,
    );

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(de.buyout.reasons.WEEKLY_LIMIT_REACHED);
    expect(note.textContent).not.toContain('{reason}');
  });

  it.each(Object.values(BuyoutDenialReason))(
    'erklärt den Ablehnungsgrund %s auf Deutsch',
    (reason) => {
      render(
        <BuyoutDisclosure quote={quoteFixture({ allowed: false, disallowedReason: reason })} />,
      );

      const note = screen.getByRole('note');
      expect(note).toHaveTextContent(de.buyout.reasons[reason]);
      // Der rohe Code darf nie in der Oberfläche landen.
      expect(note.textContent).not.toContain(reason);
    },
  );

  it('bleibt verständlich, wenn der Server keinen Grund mitliefert', () => {
    render(<BuyoutDisclosure quote={quoteFixture({ allowed: false, disallowedReason: null })} />);

    expect(screen.getByRole('note')).toHaveTextContent(de.buyout.disabledUnknown);
  });

  it('zeigt die fünf Werte auch bei abgelehntem Freikauf — die Konsequenz bleibt sichtbar', () => {
    render(
      <BuyoutDisclosure
        quote={quoteFixture({
          allowed: false,
          disallowedReason: BuyoutDenialReason.INSUFFICIENT_POINTS,
          balanceBefore: 4,
          cost: 6,
          balanceAfter: -2,
        })}
      />,
    );

    expect(valueFor(de.buyout.balanceBefore)).toBe('4');
    expect(valueFor(de.buyout.cost)).toBe('6');
    expect(valueFor(de.buyout.balanceAfter)).toBe('-2');
  });
});
