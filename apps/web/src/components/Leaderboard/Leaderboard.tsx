import cn from 'classnames';
import type { MemberDto } from '@haushaltsauktion/shared';
import { useStrings } from '../../context/StringsContext';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './Leaderboard.module.css';

interface LeaderboardProps {
  members: MemberDto[];
}

export interface RankedMember {
  member: MemberDto;
  rank: number;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
/**
 * Gold/Silber/Bronze wirken in manchen Emoji-Schriften (v.a. klein und ohne
 * Farbfilter) verwechselbar ähnlich — die Hintergrundfarbe macht Platz 1-3
 * deshalb zusätzlich unabhängig vom Emoji selbst unterscheidbar.
 */
const MEDAL_TIER_CLASS: Record<number, string> = { 1: styles.gold, 2: styles.silver, 3: styles.bronze };

/**
 * Standard-Wettkampf-Rangfolge ("1-2-2-4"): bei Punktegleichstand teilen sich
 * mehrere Mitglieder denselben Rang (und damit dieselbe Medaille); die dadurch
 * belegten Folgeränge werden übersprungen — zwei Erste lassen Rang 2 aus,
 * der/die Nächste ist bereits Dritte(r). Mitglieder mit genau 0 Punkten
 * scheinen gar nicht auf.
 */
export function rankMembers(members: MemberDto[]): RankedMember[] {
  const sorted = [...members].filter((m) => m.balance !== 0).sort((a, b) => b.balance - a.balance);

  const ranked: RankedMember[] = [];
  let lastBalance: number | null = null;
  let lastRank = 0;
  sorted.forEach((member, index) => {
    const rank = member.balance === lastBalance ? lastRank : index + 1;
    ranked.push({ member, rank });
    lastBalance = member.balance;
    lastRank = rank;
  });
  return ranked;
}

export function Leaderboard({ members }: LeaderboardProps) {
  const { de } = useStrings();
  const ranked = rankMembers(members);

  if (ranked.length === 0) return <p className={styles.empty}>{de.leaderboard.empty}</p>;

  return (
    <ol className={styles.list}>
      {ranked.map(({ member, rank }) => (
        <li
          key={member.id}
          className={styles.row}
          aria-label={interpolate(de.leaderboard.row, {
            rank,
            name: member.displayName,
            points: formatNumber(member.balance),
          })}
        >
          <span className={cn(styles.rank, MEDAL_TIER_CLASS[rank])} aria-hidden="true">
            {MEDALS[rank] ?? `${rank}.`}
          </span>
          <span className={styles.name} aria-hidden="true">
            {member.displayName}
            {rank === 1 && <span className={styles.crown}> 👑</span>}
          </span>
          <span className={`${styles.points} numeric`} aria-hidden="true">
            {formatNumber(member.balance)}
          </span>
        </li>
      ))}
    </ol>
  );
}
