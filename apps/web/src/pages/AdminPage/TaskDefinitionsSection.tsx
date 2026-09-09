import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  useAdminCategories,
  useAdminMembers,
  useAdminTaskDefinitions,
  useArchiveTaskDefinition,
  useMaterializeTaskDefinition,
  useReactivateTaskDefinition,
  useUpdateTaskEligibility,
} from '../../api/hooks';
import type { AdminMemberDto, AdminTaskDefinitionDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { TaskMaintenanceCard } from '../../components/TaskMaintenanceCard/TaskMaintenanceCard';
import { Toast } from '../../components/Toast/Toast';
import { interpolate } from '../../utils/format';
import { taskDefinitionErrorMessage } from './taskDefinitionErrors';
import { TaskDefinitionForm } from './TaskDefinitionForm';
import styles from './AdminPage.module.css';

// ───────────────────────── eligibility sheet ─────────────────────────

interface EligibilityDraft {
  included: string[];
  excluded: string[];
  /** Intake "task-role-based-eligibility-and-preferred-assignee" — soft, so
   * kept independent of included/excluded rather than sharing their toggle. */
  preferred: string[];
}

function eligibilityDraftFromDefinition(def: AdminTaskDefinitionDto): EligibilityDraft {
  return {
    included: def.eligibility.filter((e) => e.mode === 'INCLUDED').map((e) => e.memberId),
    excluded: def.eligibility.filter((e) => e.mode === 'EXCLUDED').map((e) => e.memberId),
    preferred: def.preferredAssignees.map((p) => p.memberId),
  };
}

function EligibilityForm({
  definition,
  members,
  onClose,
}: {
  definition: AdminTaskDefinitionDto;
  members: AdminMemberDto[];
  onClose: () => void;
}) {
  const { de } = useStrings();
  const updateEligibility = useUpdateTaskEligibility();
  const [draft, setDraft] = useState<EligibilityDraft>(() =>
    eligibilityDraftFromDefinition(definition),
  );
  const [error, setError] = useState<string | null>(null);

  const toggleIncluded = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      included: prev.included.includes(id)
        ? prev.included.filter((m) => m !== id)
        : [...prev.included, id],
      excluded: prev.excluded.filter((m) => m !== id),
    }));
  };

  const toggleExcluded = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      excluded: prev.excluded.includes(id)
        ? prev.excluded.filter((m) => m !== id)
        : [...prev.excluded, id],
      included: prev.included.filter((m) => m !== id),
    }));
  };

  // Independent of included/excluded — a preference is soft and never
  // exclusive with a hard rule (see EligibilityDraft's comment).
  const togglePreferred = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      preferred: prev.preferred.includes(id)
        ? prev.preferred.filter((m) => m !== id)
        : [...prev.preferred, id],
    }));
  };

  const handleSubmit = () => {
    setError(null);
    updateEligibility.mutate(
      { id: definition.id, body: draft },
      { onSuccess: onClose, onError: (err) => setError(taskDefinitionErrorMessage(err, de)) },
    );
  };

  return (
    <div className={styles.restrictionsForm}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <p className={styles.hint}>{de.admin.taskDefinitions.eligibilityHint}</p>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.taskDefinitions.eligibilityIncluded}</h3>
        {members.length === 0 ? (
          <p className={styles.hint}>{de.admin.taskDefinitions.eligibilityIncludedEmpty}</p>
        ) : (
          <div className={styles.checkboxList}>
            {members.map((member) => (
              <label key={member.id} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={draft.included.includes(member.id)}
                  onChange={() => toggleIncluded(member.id)}
                />
                <span>{member.displayName}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.taskDefinitions.eligibilityExcluded}</h3>
        <div className={styles.checkboxList}>
          {members.map((member) => (
            <label key={member.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.excluded.includes(member.id)}
                onChange={() => toggleExcluded(member.id)}
              />
              <span>{member.displayName}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>{de.admin.taskDefinitions.eligibilityPreferred}</h3>
        <p className={styles.hint}>{de.admin.taskDefinitions.eligibilityPreferredHint}</p>
        <div className={styles.checkboxList}>
          {members.map((member) => (
            <label key={member.id} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.preferred.includes(member.id)}
                onChange={() => togglePreferred(member.id)}
              />
              <span>{member.displayName}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <Button onClick={handleSubmit} loading={updateEligibility.isPending}>
          {de.admin.taskDefinitions.saveEligibility}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {de.admin.taskDefinitions.cancel}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── section ─────────────────────────

export function TaskDefinitionsSection() {
  const { de } = useStrings();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading } = useAdminTaskDefinitions(includeArchived);
  const { data: categoriesData } = useAdminCategories();
  const { data: membersData } = useAdminMembers();
  const archiveDefinition = useArchiveTaskDefinition();
  const materializeDefinition = useMaterializeTaskDefinition();
  const reactivateDefinition = useReactivateTaskDefinition();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eligibilityForId, setEligibilityForId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [materializingId, setMaterializingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const definitions = data?.items ?? [];
  const categories = categoriesData?.items ?? [];
  const members = (membersData?.items ?? []).filter((m) => m.isActive);
  const editing = definitions.find((d) => d.id === editingId) ?? null;
  const eligibilityFor = definitions.find((d) => d.id === eligibilityForId) ?? null;

  const query = filter.trim().toLowerCase();
  const filteredDefinitions =
    query === ''
      ? definitions
      : definitions.filter(
          (definition) =>
            definition.title.toLowerCase().includes(query) ||
            (definition.category?.name.toLowerCase().includes(query) ?? false),
        );

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setFormOpen(true);
  };

  const handleArchive = (definition: AdminTaskDefinitionDto) => {
    setRowErrors((prev) => ({ ...prev, [definition.id]: null }));
    setArchivingId(definition.id);
    archiveDefinition.mutate(definition.id, {
      onSuccess: () => {
        setArchivingId(null);
        setMessage(de.admin.taskDefinitions.archivedSuccess);
      },
      onError: (err) => {
        setArchivingId(null);
        setRowErrors((prev) => ({
          ...prev,
          [definition.id]: taskDefinitionErrorMessage(err, de),
        }));
      },
    });
  };

  const handleMaterialize = (definition: AdminTaskDefinitionDto) => {
    setRowErrors((prev) => ({ ...prev, [definition.id]: null }));
    setMaterializingId(definition.id);
    materializeDefinition.mutate(definition.id, {
      onSuccess: () => {
        setMaterializingId(null);
        setMessage(de.admin.taskDefinitions.materializedSuccess);
      },
      onError: (err) => {
        setMaterializingId(null);
        setRowErrors((prev) => ({
          ...prev,
          [definition.id]: taskDefinitionErrorMessage(err, de),
        }));
      },
    });
  };

  const handleReactivate = (definition: AdminTaskDefinitionDto) => {
    setRowErrors((prev) => ({ ...prev, [definition.id]: null }));
    setReactivatingId(definition.id);
    reactivateDefinition.mutate(definition.id, {
      onSuccess: () => {
        setReactivatingId(null);
        setMessage(de.admin.taskDefinitions.reactivatedSuccess);
      },
      onError: (err) => {
        setReactivatingId(null);
        setRowErrors((prev) => ({
          ...prev,
          [definition.id]: taskDefinitionErrorMessage(err, de),
        }));
      },
    });
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.taskDefinitions}</h2>

      <Toast message={message} onDismiss={() => setMessage(null)} />

      <label className={styles.field}>
        <span className="visually-hidden">{de.admin.taskDefinitions.filterLabel}</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={de.admin.taskDefinitions.filterPlaceholder}
        />
      </label>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        <span>{de.admin.taskDefinitions.includeArchived}</span>
      </label>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : definitions.length === 0 ? (
        <p className={styles.hint}>{de.admin.taskDefinitions.empty}</p>
      ) : filteredDefinitions.length === 0 ? (
        <p className={styles.hint}>{de.admin.taskDefinitions.filterEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {filteredDefinitions.map((definition) => (
            <TaskMaintenanceCard
              key={definition.id}
              definition={definition}
              error={rowErrors[definition.id] ?? null}
              archiving={archivingId === definition.id}
              materializing={materializingId === definition.id}
              reactivating={reactivatingId === definition.id}
              onEdit={() => openEdit(definition.id)}
              onEligibility={() => setEligibilityForId(definition.id)}
              onArchive={() => handleArchive(definition)}
              onMaterialize={() => handleMaterialize(definition)}
              onReactivate={() => handleReactivate(definition)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={openCreate}
        aria-label={de.admin.taskDefinitions.addButton}
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      <Sheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? de.admin.taskDefinitions.editTitle : de.admin.taskDefinitions.addTitle}
      >
        <TaskDefinitionForm
          initial={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setMessage(
              editing ? de.admin.taskDefinitions.saved : de.admin.taskDefinitions.createSuccess,
            );
          }}
        />
      </Sheet>

      <Sheet
        open={eligibilityFor !== null}
        onOpenChange={(open) => !open && setEligibilityForId(null)}
        title={
          eligibilityFor
            ? interpolate(de.admin.taskDefinitions.eligibilityTitle, { title: eligibilityFor.title })
            : de.admin.taskDefinitions.eligibilityButton
        }
      >
        {eligibilityFor && (
          <EligibilityForm
            definition={eligibilityFor}
            members={members}
            onClose={() => setEligibilityForId(null)}
          />
        )}
      </Sheet>
    </section>
  );
}
