import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMemberMe, usePurchaseReward, useRewardShop } from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { RewardShopItemDto } from '@haushaltsauktion/shared';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Toast } from '../../components/Toast/Toast';
import { RewardPurchaseDisclosure } from '../../components/RewardPurchaseDisclosure/RewardPurchaseDisclosure';
import { formatNumber, interpolate } from '../../utils/format';
import styles from './RewardsShopPage.module.css';

function purchaseErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string; details?: { balance?: number; cost?: number } };
  if (apiErr.code === 'REWARDS_DISABLED') return de.rewards.errors.disabled;
  if (apiErr.code === 'INSUFFICIENT_POINTS') {
    return interpolate(de.rewards.errors.insufficientPoints, {
      balance: apiErr.details?.balance ?? 0,
      cost: apiErr.details?.cost ?? 0,
    });
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.rewards.errors.generic;
}

export function RewardsShopPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const { data: me } = useMemberMe();
  const { data, isLoading } = useRewardShop();
  const purchase = usePurchaseReward();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = data?.items ?? [];
  const balance = me?.balance ?? 0;
  const confirming = items.find((i) => i.id === confirmingId) ?? null;

  const openConfirm = (reward: RewardShopItemDto) => {
    setError(null);
    setConfirmingId(reward.id);
  };

  const handleConfirm = () => {
    if (!confirming) return;
    setError(null);
    purchase.mutate(confirming.id, {
      onSuccess: () => {
        setConfirmingId(null);
        setMessage(de.rewards.purchaseSuccess);
      },
      onError: (err) => setError(purchaseErrorMessage(err, de)),
    });
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.rewards.title}</h1>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>{de.rewards.balance}</span>
        <span className={styles.balanceValue}>{formatNumber(balance)}</span>
      </div>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : items.length === 0 ? (
        <p className={styles.hint}>{de.rewards.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((reward) => (
            <li key={reward.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{reward.title}</h2>
                <span className={styles.cost}>{formatNumber(reward.cost)}</span>
              </div>
              {reward.description && <p className={styles.description}>{reward.description}</p>}
              <Button variant="secondary" onClick={() => openConfirm(reward)} fullWidth>
                {de.rewards.buy}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="ghost" onClick={() => navigate('/ich')} fullWidth>
        {de.action.back}
      </Button>

      <Sheet
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirmingId(null)}
        title={de.rewards.confirmTitle}
      >
        {confirming && (
          <div className={styles.confirmBody}>
            {error && (
              <div className={styles.message} role="alert">
                {error}
              </div>
            )}
            <RewardPurchaseDisclosure balance={balance} cost={confirming.cost} />
            <div className={styles.actions}>
              <Button onClick={handleConfirm} loading={purchase.isPending}>
                {de.rewards.confirm}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingId(null)}>
                {de.rewards.cancel}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
