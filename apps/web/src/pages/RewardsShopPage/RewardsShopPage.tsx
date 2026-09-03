import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMemberMe, usePurchaseReward, useRewardShop } from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { MemberEffectDto, RewardShopItemDto } from '@haushaltsauktion/shared';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Toast } from '../../components/Toast/Toast';
import { RewardPurchaseDisclosure } from '../../components/RewardPurchaseDisclosure/RewardPurchaseDisclosure';
import { formatDurationMinutes, formatNumber, interpolate } from '../../utils/format';
import styles from './RewardsShopPage.module.css';

/** §31 — what this potion would do, shown on the catalog card before purchase. */
function effectSummary(reward: RewardShopItemDto, de: Strings): string | null {
  if (reward.kind !== 'VIRTUAL_EFFECT' || reward.effectType === null) return null;
  const duration = formatDurationMinutes(reward.effectDurationMinutes ?? 0);
  if (reward.effectType === 'IMMUNITY') {
    return interpolate(de.rewards.effectSummary.IMMUNITY, { duration });
  }
  return interpolate(de.rewards.effectSummary.MULTIPLIER, {
    charges: reward.effectCharges ?? 0,
    multiplier: reward.effectMultiplier ?? 0,
    duration,
  });
}

/** The success toast after a `VIRTUAL_EFFECT` purchase — it became active
 * immediately, so the message says so instead of "an admin fulfills it". */
function activatedEffectMessage(effect: MemberEffectDto, de: Strings): string {
  const duration = formatDurationMinutes(
    Math.max(0, Math.round((new Date(effect.expiresAt).getTime() - Date.now()) / 60_000)),
  );
  if (effect.type === 'IMMUNITY') {
    return interpolate(de.rewards.purchaseSuccessImmunity, { duration });
  }
  return interpolate(de.rewards.purchaseSuccessMultiplier, {
    charges: effect.chargesRemaining ?? 0,
    multiplier: effect.multiplierValue ?? 0,
    duration,
  });
}

function rewardApiErrorMessage(err: unknown, de: Strings): string {
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
  const { data, isLoading, error: shopError } = useRewardShop();
  const purchase = usePurchaseReward();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = data?.items ?? [];
  // §31 — the disclosure must always show the real current balance, never a
  // placeholder while it's still loading. Gating the buy flow on this (rather
  // than defaulting to 0) is what stops a slow connection from letting
  // someone open the confirm sheet against a wrong preview.
  const balanceLoaded = me !== undefined;
  const balance = me?.balance ?? 0;
  const confirming = items.find((i) => i.id === confirmingId) ?? null;

  const openConfirm = (reward: RewardShopItemDto) => {
    if (!balanceLoaded) return;
    setError(null);
    setConfirmingId(reward.id);
  };

  const handleConfirm = () => {
    if (!confirming) return;
    setError(null);
    purchase.mutate(confirming.id, {
      onSuccess: (result) => {
        setConfirmingId(null);
        setMessage(
          result.activatedEffect
            ? activatedEffectMessage(result.activatedEffect, de)
            : de.rewards.purchaseSuccess,
        );
      },
      onError: (err) => setError(rewardApiErrorMessage(err, de)),
    });
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.rewards.title}</h1>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>{de.rewards.balance}</span>
        {balanceLoaded ? (
          <span className={styles.balanceValue}>{formatNumber(balance)}</span>
        ) : (
          <div className={styles.spinner} aria-label="Wird geladen" />
        )}
      </div>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : shopError ? (
        <p className={styles.hint}>{rewardApiErrorMessage(shopError, de)}</p>
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
              {reward.kind === 'VIRTUAL_EFFECT' && (
                <span className={styles.hint}>{de.rewards.virtualEffectBadge}</span>
              )}
              {reward.description && <p className={styles.description}>{reward.description}</p>}
              {effectSummary(reward, de) && (
                <p className={styles.hint}>{effectSummary(reward, de)}</p>
              )}
              <Button
                variant="secondary"
                onClick={() => openConfirm(reward)}
                disabled={!balanceLoaded}
                fullWidth
              >
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
