import type { MemberDto } from '@haushaltsauktion/shared';
import { useStrings } from '../../context/StringsContext';
import { Leaderboard } from '../Leaderboard/Leaderboard';
import styles from './LeaderboardCard.module.css';

interface LeaderboardCardProps {
  members: MemberDto[];
}

/** `Leaderboard` in a bordered card with its own heading (§19 "Rangliste") — the card shell any page embeds. */
export function LeaderboardCard({ members }: LeaderboardCardProps) {
  const { de } = useStrings();

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>{de.dashboard.leaderboard}</h2>
      <Leaderboard members={members} />
    </div>
  );
}
