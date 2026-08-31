import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { HouseholdConfig } from '@haushaltsauktion/shared';
import {
  AssignmentStrategy,
  RewardTiming,
  ValueIncreaseStrategy,
} from '@haushaltsauktion/shared';
import { useAdminConfig, useSaveConfig, useRunSweep } from '../../api/hooks';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { MembersSection } from './MembersSection';
import { TaskDefinitionsSection } from './TaskDefinitionsSection';
import { CategoriesSection } from './CategoriesSection';
import styles from './AdminPage.module.css';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function AdminPage() {
  const { de } = useStrings();
  const navigate = useNavigate();
  const { data: config, isLoading } = useAdminConfig();
  const save = useSaveConfig();
  const sweep = useRunSweep();
  const [draft, setDraft] = useState<HouseholdConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setDraft(clone(config.values));
      setMessage(null);
    }
  }, [config]);

  if (isLoading || !config || !draft) {
    return <div className={styles.spinner} aria-label="Wird geladen" />;
  }

  const update = <K extends keyof HouseholdConfig>(
    section: K,
    patch: Partial<HouseholdConfig[K]>,
  ) => {
    setDraft((prev) => (prev ? { ...prev, [section]: { ...prev[section], ...patch } } : prev));
  };

  const handleSave = () => {
    if (!draft) return;
    setMessage(null);
    save.mutate(
      { expectedVersion: config.version, values: draft as unknown as Record<string, unknown> },
      {
        onSuccess: () => setMessage(de.admin.saved),
        onError: (err) => setMessage((err as { message?: string }).message ?? de.admin.saveFailed),
      },
    );
  };

  const handleSweep = (dryRun: boolean) => {
    setMessage(null);
    sweep.mutate(
      { dryRun },
      {
        onSuccess: (report) =>
          setMessage(
            de.admin.sweepResult
              .replace('{materialized}', String(report.materialized))
              .replace('{published}', String(report.published))
              .replace('{assigned}', String(report.assigned))
              .replace('{expired}', String(report.expired))
              .replace('{skipped}', String(report.skipped)),
          ),
        onError: (err) => setMessage((err as { message?: string }).message ?? de.error.title),
      },
    );
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{de.admin.title}</h1>
      <p className={styles.hint}>
        {de.admin.version} {config.version}
        {config.updatedBy && ` · ${de.admin.updatedAt}: ${config.updatedBy.displayName}`}
      </p>

      {message && (
        <div className={styles.message} role="status">
          {message}
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.admin.sections.assignment}</h2>
        <label className={styles.field}>
          <span>{de.admin.fields.offerDurationMinutes}</span>
          <input
            type="number"
            min={1}
            max={20160}
            value={draft.assignment.offerDurationMinutes}
            onChange={(e) =>
              update('assignment', { offerDurationMinutes: parseInt(e.target.value, 10) || 1 })
            }
          />
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.strategy}</span>
          <select
            value={draft.assignment.strategy}
            onChange={(e) =>
              update('assignment', { strategy: e.target.value as HouseholdConfig['assignment']['strategy'] })
            }
          >
            {Object.values(AssignmentStrategy).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.assignment.preventImmediateReassignment}
            onChange={(e) => update('assignment', { preventImmediateReassignment: e.target.checked })}
          />
          <span>{de.admin.fields.preventImmediateReassignment}</span>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.assignment.relaxConstraintsWhenNoCandidates}
            onChange={(e) => update('assignment', { relaxConstraintsWhenNoCandidates: e.target.checked })}
          />
          <span>{de.admin.fields.relaxConstraintsWhenNoCandidates}</span>
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.admin.sections.voluntary}</h2>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.voluntary.rewardEnabled}
            onChange={(e) => update('voluntary', { rewardEnabled: e.target.checked })}
          />
          <span>{de.admin.fields.rewardEnabled}</span>
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.rewardMultiplier}</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={draft.voluntary.rewardMultiplier}
            onChange={(e) =>
              update('voluntary', { rewardMultiplier: parseFloat(e.target.value) || 0 })
            }
          />
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.rewardTiming}</span>
          <select
            value={draft.voluntary.rewardTiming}
            onChange={(e) =>
              update('voluntary', { rewardTiming: e.target.value as HouseholdConfig['voluntary']['rewardTiming'] })
            }
          >
            {Object.values(RewardTiming).map((t) => (
              <option key={t} value={t}>
                {de.admin.timing[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.voluntary.allowRelease}
            onChange={(e) => update('voluntary', { allowRelease: e.target.checked })}
          />
          <span>{de.admin.fields.allowRelease}</span>
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.admin.sections.buyout}</h2>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.buyout.enabled}
            onChange={(e) => update('buyout', { enabled: e.target.checked })}
          />
          <span>{de.admin.fields.enabled}</span>
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={draft.buyout.allowNegativeBalance}
            onChange={(e) => update('buyout', { allowNegativeBalance: e.target.checked })}
          />
          <span>{de.admin.fields.allowNegativeBalance}</span>
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.minimumBalance}</span>
          <input
            type="number"
            value={draft.buyout.minimumBalance}
            onChange={(e) =>
              update('buyout', { minimumBalance: parseInt(e.target.value, 10) || 0 })
            }
          />
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.admin.sections.valueIncrease}</h2>
        <label className={styles.field}>
          <span>{de.admin.fields.strategy}</span>
          <select
            value={draft.valueIncrease.strategy}
            onChange={(e) =>
              update('valueIncrease', {
                strategy: e.target.value as HouseholdConfig['valueIncrease']['strategy'],
              })
            }
          >
            {Object.values(ValueIncreaseStrategy).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.multiplier}</span>
          <input
            type="number"
            min={1}
            step={0.1}
            value={draft.valueIncrease.multiplier}
            onChange={(e) =>
              update('valueIncrease', { multiplier: parseFloat(e.target.value) || 1 })
            }
          />
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.minimumIncrease}</span>
          <input
            type="number"
            min={1}
            value={draft.valueIncrease.minimumIncrease}
            onChange={(e) =>
              update('valueIncrease', { minimumIncrease: parseInt(e.target.value, 10) || 1 })
            }
          />
        </label>
        <label className={styles.field}>
          <span>{de.admin.fields.maximumValue}</span>
          <input
            type="number"
            min={1}
            value={draft.valueIncrease.maximumValue ?? ''}
            onChange={(e) => {
              const value = e.target.value === '' ? null : parseInt(e.target.value, 10) || null;
              update('valueIncrease', { maximumValue: value });
            }}
          />
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{de.admin.sections.tasks}</h2>
        <label className={styles.field}>
          <span>{de.admin.fields.maxOpenInstancesPerDefinition}</span>
          <input
            type="number"
            min={1}
            max={20}
            value={draft.tasks.maxOpenInstancesPerDefinition}
            onChange={(e) =>
              update('tasks', { maxOpenInstancesPerDefinition: parseInt(e.target.value, 10) || 1 })
            }
          />
        </label>
      </section>

      <MembersSection />

      <TaskDefinitionsSection />

      <CategoriesSection />

      <div className={styles.actions}>
        <Button onClick={handleSave} loading={save.isPending}>
          {de.admin.save}
        </Button>
        <Button variant="secondary" onClick={() => handleSweep(false)} loading={sweep.isPending}>
          {de.admin.runSweep}
        </Button>
        <Button variant="secondary" onClick={() => handleSweep(true)} loading={sweep.isPending}>
          {de.admin.dryRun}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/ich')}>
          {de.action.back}
        </Button>
      </div>
    </div>
  );
}
