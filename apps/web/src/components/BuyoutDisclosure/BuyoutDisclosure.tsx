/**
 * Die Freikauf-Offenlegung (§21, §31).
 *
 * §31 verlangt, dass eine Person *vor* einem Freikauf genau fünf Werte sieht:
 * aktueller Punktestand, Freikaufkosten, Punktestand danach, Aufgabenwert
 * vorher, Aufgabenwert danach. Alle fünf kommen unverändert aus dem
 * serverseitig berechneten `BuyoutQuoteDto` — hier wird nichts gerechnet,
 * weil ein clientseitig ermittelter Preis vom verbindlichen abweichen könnte
 * (§36).
 *
 * Ist ein Freikauf nicht erlaubt, wird der Grund genannt statt die Option
 * kommentarlos zu verstecken (§31 „keine versteckten Regeln“).
 */

import type { BuyoutQuoteDto } from '@haushaltsauktion/shared';

import { useStrings } from '../../context/StringsContext';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './BuyoutDisclosure.module.css';

export function BuyoutDisclosure({ quote }: { quote: BuyoutQuoteDto }) {
  const { de } = useStrings();

  const reasonText =
    quote.disallowedReason === null ? null : de.buyout.reasons[quote.disallowedReason];

  const rows: Array<[label: string, value: number]> = [
    [de.buyout.balanceBefore, quote.balanceBefore],
    [de.buyout.cost, quote.cost],
    [de.buyout.balanceAfter, quote.balanceAfter],
    [de.buyout.valueBefore, quote.taskValueBefore],
    [de.buyout.valueAfter, quote.taskValueAfter],
  ];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.buyout.heading}</h2>

      {!quote.allowed && (
        <p className={styles.denied} role="note">
          {reasonText
            ? interpolate(de.buyout.disabled, { reason: reasonText })
            : de.buyout.disabledUnknown}
        </p>
      )}

      <dl className={styles.dl}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
