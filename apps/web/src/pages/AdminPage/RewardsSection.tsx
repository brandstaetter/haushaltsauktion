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

interface RewardDraft {
  title: string;
  description: string;
  cost: number;
  isActive: boolean;
}

function emptyDraft(): RewardDraft {
  return { title: '', description: '', cost: 1, isActive: true };
}

function draftFromReward(reward: AdminRewardDto): RewardDraft {
  return {
    title: reward.title,
    description: reward.description ?? '',
    cost: reward.cost,
    isActive: reward.isActive,
  };
}

function toWriteBody(draft: RewardDraft): RewardWriteBody {
  return {
    title: draft.title,
    description: draft.description.trim() === '' ? null : draft.description,
    cost: draft.cost,
    isActive: draft.isActive,
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
