import { useState } from 'react';
import { useAdminRedemptions, useFulfillRedemption } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Toast } from '../../components/Toast/Toast';
import { formatDate, formatNumber, interpolate } from '../../utils/format';
import styles from './AdminPage.module.css';

function redemptionErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string };
  if (apiErr.code === 'REDEMPTION_CLOSED') return de.admin.redemptions.errors.alreadyHandled;
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.redemptions.errors.generic;
}

/** Admin fulfillment queue (§23-style entry, intake "points-shop-real-life-rewards"). */
export function RewardRedemptionsSection() {
  const { de } = useStrings();
  const { data, isLoading } = useAdminRedemptions('PENDING');
  const fulfill = useFulfillRedemption();
  const redemptions = data?.items ?? [];

  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleFulfill = (id: string) => {
    setRowErrors((prev) => ({ ...prev, [id]: null }));
    setFulfillingId(id);
    fulfill.mutate(id, {
      onSuccess: () => {
        setFulfillingId(null);
        setMessage(de.admin.redemptions.fulfilledSuccess);
      },
      onError: (err) => {
        setFulfillingId(null);
        setRowErrors((prev) => ({ ...prev, [id]: redemptionErrorMessage(err, de) }));
      },
    });
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.redemptions}</h2>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : redemptions.length === 0 ? (
        <p className={styles.hint}>{de.admin.redemptions.empty}</p>
      ) : (
        <ul className={styles.list}>
          {redemptions.map((redemption) => (
            <li key={redemption.id} className={styles.memberRow}>
              <div className={styles.memberHeader}>
                <span className={styles.memberName}>{redemption.reward.title}</span>
                <span className={styles.hint}>{redemption.member.displayName}</span>
              </div>

              {rowErrors[redemption.id] && (
                <div className={styles.message} role="alert">
                  {rowErrors[redemption.id]}
                </div>
              )}

              <div className={styles.memberFields}>
                <div className={styles.field}>
                  <span>{de.admin.rewards.cost}</span>
                  <span>{formatNumber(redemption.costAtPurchase)}</span>
                </div>
                <div className={styles.field}>
                  <span>{interpolate(de.admin.redemptions.purchasedAt, { when: formatDate(redemption.purchasedAt) })}</span>
                </div>
              </div>

              <div className={styles.rowActions}>
                <Button
                  variant="secondary"
                  onClick={() => handleFulfill(redemption.id)}
                  loading={fulfillingId === redemption.id}
                >
                  {de.admin.redemptions.fulfill}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
