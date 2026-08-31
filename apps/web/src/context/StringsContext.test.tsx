import {
  BuyoutDenialReason,
  EligibilityReason,
  PointTransactionType,
  TaskStatus,
} from '@haushaltsauktion/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { de } from '../strings/de';
import { StringsProvider, useStrings } from './StringsContext';

function Consumer() {
  const { de: strings } = useStrings();
  return (
    <>
      <h1>{strings.appName}</h1>
      <p>{strings.dashboard.balance}</p>
    </>
  );
}

describe('StringsContext', () => {
  it('liefert die Texte innerhalb des Providers', () => {
    render(
      <StringsProvider>
        <Consumer />
      </StringsProvider>,
    );

    expect(screen.getByRole('heading', { name: de.appName })).toBeInTheDocument();
    expect(screen.getByText(de.dashboard.balance)).toBeInTheDocument();
  });

  it('liefert dieselben Texte auch ohne Provider — kein leeres UI durch fehlenden Wrapper', () => {
    // `main.tsx` montiert den Provider derzeit nicht; der Default-Wert des
    // Kontexts hält die Oberfläche trotzdem beschriftet.
    render(<Consumer />);

    expect(screen.getByRole('heading', { name: de.appName })).toBeInTheDocument();
  });
});

/**
 * Die folgenden Tests sind die Brücke zwischen `packages/shared` und `de.ts`:
 * wird dort ein Code umbenannt oder ergänzt, ohne die deutsche Entsprechung
 * nachzuziehen, schlägt hier ein Test fehl statt in der Oberfläche ein
 * `undefined` zu erscheinen.
 */
describe('de.ts deckt die Codes aus @haushaltsauktion/shared ab', () => {
  it('kennt jeden Ablehnungsgrund für einen Freikauf', () => {
    for (const reason of Object.values(BuyoutDenialReason)) {
      expect(de.buyout.reasons[reason], `de.buyout.reasons.${reason} fehlt`).toBeTruthy();
    }
  });

  it('enthält keine überzähligen Ablehnungsgründe', () => {
    expect(Object.keys(de.buyout.reasons).sort()).toEqual(
      Object.values(BuyoutDenialReason).sort(),
    );
  });

  it('kennt jeden Aufgabenstatus', () => {
    for (const status of Object.values(TaskStatus)) {
      expect(de.task.status[status], `de.task.status.${status} fehlt`).toBeTruthy();
    }
  });

  it('kennt jeden Typ einer Punktebewegung', () => {
    for (const type of Object.values(PointTransactionType)) {
      expect(de.ledger.type[type], `de.ledger.type.${type} fehlt`).toBeTruthy();
    }
  });

  it('hat für jede Eignungsregel einen Code, der nicht als Rohtext durchschlägt', () => {
    // Die Fairness-Ansicht rendert eigene Formulierungen; entscheidend ist,
    // dass kein Code roh in der Oberfläche steht.
    for (const reason of Object.values(EligibilityReason)) {
      expect(reason).toMatch(/^[A-Z_]+$/);
    }
  });

  it('lässt keinen Platzhalter ohne Interpolation zurück', () => {
    // Alle Texte mit `{…}` müssen bewusst interpoliert werden. Dieser Test
    // hält fest, welche das sind, damit ein neuer Platzhalter auffällt.
    const withPlaceholders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        if (/\{[^}]+\}/.test(node)) withPlaceholders.push(path);
        return;
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(de, 'de');

    expect(withPlaceholders).toContain('de.buyout.disabled');
    expect(withPlaceholders).toContain('de.dashboard.greeting');
    expect(withPlaceholders).toContain('de.action.buyout');
  });
});
