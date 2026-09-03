/**
 * Die Kauf-Offenlegung des Punkte-Shops (§31, mirrors `BuyoutDisclosure` —
 * intake "points-shop-real-life-rewards").
 *
 * §31 verlangt, dass eine Person vor einer Ausgabe von Punkten den
 * Punktestand davor, die Kosten und den Punktestand danach sieht. Anders als
 * beim Freikauf ist der Preis hier kein Formel-Ergebnis, sondern ein fester,
 * admin-gepflegter Wert (`RewardShopItemDto.cost`) — die Vorschau ist damit
 * reine Anzeige-Arithmetik über zwei bereits serverseitigen Zahlen, keine
 * clientseitige Neuberechnung eines verbindlichen Preises (§36): der Server
 * bucht bei der eigentlichen Anfrage den zu diesem Zeitpunkt aktuellen Preis.
 */

import { useStrings } from '../../context/StringsContext';
import { formatNumber } from '../../utils/format';
import styles from './RewardPurchaseDisclosure.module.css';

export function RewardPurchaseDisclosure({ balance, cost }: { balance: number; cost: number }) {
  const { de } = useStrings();

  const rows: Array<[label: string, value: number]> = [
    [de.rewards.balanceBefore, balance],
    [de.rewards.cost, cost],
    [de.rewards.balanceAfter, balance - cost],
  ];

  return (
    <dl className={styles.dl}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatNumber(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
