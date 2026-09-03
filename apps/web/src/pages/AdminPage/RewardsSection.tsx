import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAdminRewards, useCreateReward, useUpdateReward } from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { AdminRewardDto, RewardWriteBody } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Toast } from '../../components/Toast/Toast';
import { formatNumber } from '../../utils/format';
import styles from './AdminPage.module.css';

/** Mirrors `taskDefinitionErrorMessage` in `TaskDefinitionsSection.tsx`. */
function rewardErrorMessage(err: unknown, de: Strings): string {
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.rewards.errors.generic;
}

type RewardKind = 'MANUAL_FULFILLMENT' | 'VIRTUAL_EFFECT';
type EffectType = 'IMMUNITY' | 'MULTIPLIER';

interface RewardDraft {
  title: string;
  description: string;
  cost: number;
  isActive: boolean;
  kind: RewardKind;
  effectType: EffectType | null;
  effectDurationMinutes: number | null;
  effectCharges: number | null;
  effectMultiplier: number | null;
}

function emptyDraft(): RewardDraft {
  return {
    title: '',
    description: '',
    cost: 1,
    isActive: true,
    kind: 'MANUAL_FULFILLMENT',
    effectType: null,
    effectDurationMinutes: null,
    effectCharges: null,
    effectMultiplier: null,
  };
}

function draftFromReward(reward: AdminRewardDto): RewardDraft {
  return {
    title: reward.title,
    description: reward.description ?? '',
    cost: reward.cost,
    isActive: reward.isActive,
    kind: reward.kind,
    effectType: reward.effectType,
    effectDurationMinutes: reward.effectDurationMinutes,
    effectCharges: reward.effectCharges,
    effectMultiplier: reward.effectMultiplier,
  };
}

/** §36 — clears the effect fields the current kind/effectType combination
 * does not use, mirroring the server's `RewardBody.superRefine`: the client
 * never sends a stray value the server would reject anyway. */
function toWriteBody(draft: RewardDraft): RewardWriteBody {
  if (draft.kind === 'MANUAL_FULFILLMENT') {
    return {
      title: draft.title,
      description: draft.description.trim() === '' ? null : draft.description,
      cost: draft.cost,
      isActive: draft.isActive,
      kind: 'MANUAL_FULFILLMENT',
      effectType: null,
      effectDurationMinutes: null,
      effectCharges: null,
      effectMultiplier: null,
    };
  }
  const isMultiplier = draft.effectType === 'MULTIPLIER';
  return {
    title: draft.title,
    description: draft.description.trim() === '' ? null : draft.description,
    cost: draft.cost,
    isActive: draft.isActive,
    kind: 'VIRTUAL_EFFECT',
    effectType: draft.effectType,
    effectDurationMinutes: draft.effectDurationMinutes,
    effectCharges: isMultiplier ? draft.effectCharges : null,
    effectMultiplier: isMultiplier ? draft.effectMultiplier : null,
  };
}

function RewardForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminRewardDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { de } = useStrings();
  const createReward = useCreateReward();
  const updateReward = useUpdateReward();
  const [draft, setDraft] = useState<RewardDraft>(() =>
    initial ? draftFromReward(initial) : emptyDraft(),
  );
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<RewardDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const pending = createReward.isPending || updateReward.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = toWriteBody(draft);
    if (initial) {
      updateReward.mutate(
        { id: initial.id, body },
        { onSuccess: onSaved, onError: (err) => setError(rewardErrorMessage(err, de)) },
      );
    } else {
      createReward.mutate(body, {
        onSuccess: onSaved,
        onError: (err) => setError(rewardErrorMessage(err, de)),
      });
    }
  };

  return (
    <form className={styles.restrictionsForm} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <label className={styles.field}>
        <span>{de.admin.rewards.titleField}</span>
        <input
          type="text"
          required
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.rewards.description}</span>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.rewards.cost}</span>
        <input
          type="number"
          min={1}
          required
          value={draft.cost}
          onChange={(e) => update({ cost: parseInt(e.target.value, 10) || 1 })}
        />
      </label>
      <label className={styles.field}>
        <span>{de.admin.rewards.kind}</span>
        <select
          value={draft.kind}
          onChange={(e) => {
            const kind = e.target.value as RewardKind;
            update(
              kind === 'MANUAL_FULFILLMENT'
                ? {
                    kind,
                    effectType: null,
                    effectDurationMinutes: null,
                    effectCharges: null,
                    effectMultiplier: null,
                  }
                : { kind, effectType: draft.effectType ?? 'IMMUNITY' },
            );
          }}
        >
          <option value="MANUAL_FULFILLMENT">{de.admin.rewards.kindOptions.MANUAL_FULFILLMENT}</option>
          <option value="VIRTUAL_EFFECT">{de.admin.rewards.kindOptions.VIRTUAL_EFFECT}</option>
        </select>
      </label>

      {draft.kind === 'VIRTUAL_EFFECT' && (
        <>
          <label className={styles.field}>
            <span>{de.admin.rewards.effectType}</span>
            <select
              value={draft.effectType ?? 'IMMUNITY'}
              onChange={(e) => update({ effectType: e.target.value as EffectType })}
            >
              <option value="IMMUNITY">{de.admin.rewards.effectTypeOptions.IMMUNITY}</option>
              <option value="MULTIPLIER">{de.admin.rewards.effectTypeOptions.MULTIPLIER}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>{de.admin.rewards.effectDurationMinutes}</span>
            <input
              type="number"
              min={1}
              required
              value={draft.effectDurationMinutes ?? ''}
              onChange={(e) =>
                update({ effectDurationMinutes: parseInt(e.target.value, 10) || null })
              }
            />
          </label>
          {draft.effectType === 'MULTIPLIER' && (
            <>
              <label className={styles.field}>
                <span>{de.admin.rewards.effectCharges}</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={draft.effectCharges ?? ''}
                  onChange={(e) => update({ effectCharges: parseInt(e.target.value, 10) || null })}
                />
              </label>
              <label className={styles.field}>
                <span>{de.admin.rewards.effectMultiplier}</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={draft.effectMultiplier ?? ''}
                  onChange={(e) => update({ effectMultiplier: parseFloat(e.target.value) || null })}
                />
              </label>
            </>
          )}
        </>
      )}

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => update({ isActive: e.target.checked })}
        />
        <span>{de.admin.rewards.active}</span>
      </label>

      <div className={styles.actions}>
        <Button type="submit" loading={pending}>
          {initial ? de.admin.rewards.save : de.admin.rewards.create}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {de.admin.rewards.cancel}
        </Button>
      </div>
    </form>
  );
}

function RewardRow({
  reward,
  onEdit,
}: {
  reward: AdminRewardDto;
  onEdit: () => void;
}) {
  const { de } = useStrings();
  return (
    <li className={styles.memberRow}>
      <div className={styles.memberHeader}>
        <span className={styles.memberName}>{reward.title}</span>
        <span className={styles.hint}>{!reward.isActive && `(${de.admin.taskDefinitions.archivedBadge})`}</span>
      </div>
      <div className={styles.memberFields}>
        <div className={styles.field}>
          <span>{de.admin.rewards.cost}</span>
          <span>{formatNumber(reward.cost)}</span>
        </div>
        {reward.kind === 'VIRTUAL_EFFECT' && (
          <div className={styles.field}>
            <span>{de.admin.rewards.kind}</span>
            <span>{de.admin.rewards.virtualEffectBadge}</span>
          </div>
        )}
      </div>
      <div className={styles.rowActions}>
        <Button variant="secondary" onClick={onEdit}>
          {de.admin.rewards.edit}
        </Button>
      </div>
    </li>
  );
}

export function RewardsSection() {
  const { de } = useStrings();
  const { data, isLoading } = useAdminRewards();
  const rewards = data?.items ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const editing = rewards.find((r) => r.id === editingId) ?? null;

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setFormOpen(true);
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.rewards}</h2>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : rewards.length === 0 ? (
        <p className={styles.hint}>{de.admin.rewards.empty}</p>
      ) : (
        <ul className={styles.list}>
          {rewards.map((reward) => (
            <RewardRow key={reward.id} reward={reward} onEdit={() => openEdit(reward.id)} />
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={openCreate}
        aria-label={de.admin.rewards.addButton}
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      <Sheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? de.admin.rewards.editTitle : de.admin.rewards.addTitle}
      >
        <RewardForm
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setMessage(editing ? de.admin.rewards.saved : de.admin.rewards.createSuccess);
          }}
        />
      </Sheet>
    </section>
  );
}
