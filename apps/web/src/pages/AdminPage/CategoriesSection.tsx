import { useState } from 'react';
import {
  useAdminCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { CategoryDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { interpolate } from '../../utils/format';
import styles from './AdminPage.module.css';

/**
 * Maps a category mutation's rejection onto a readable German message
 * (§31 — no raw error objects surfaced), mirroring `memberErrorMessage` in
 * `MembersSection.tsx`. `CATEGORY_IN_USE` here is this route's *own* code
 * (unlike `admin/members`'s unrelated reuse of the same string) — thrown by
 * `DELETE /admin/categories/:id` when a task definition still references it.
 */
function categoryErrorMessage(err: unknown, de: Strings): string {
  const apiErr = err as { code?: string; details?: { count?: number }; message?: string };
  if (apiErr.code === 'CATEGORY_IN_USE') {
    return interpolate(de.admin.categories.errors.inUse, { count: apiErr.details?.count ?? 0 });
  }
  if (err instanceof ApiError && err.message) return err.message;
  return de.admin.categories.errors.generic;
}

// ───────────────────────── add-category sheet ─────────────────────────

function AddCategoryForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { de } = useStrings();
  const createCategory = useCreateCategory();
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState('#888888');
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createCategory.mutate(
      { name, colorHex, sortOrder },
      {
        onSuccess: onCreated,
        onError: (err) => setError(categoryErrorMessage(err, de)),
      },
    );
  };

  return (
    <form className={styles.restrictionsForm} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <label className={styles.field}>
        <span>{de.admin.categories.name}</span>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>{de.admin.categories.color}</span>
        <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>{de.admin.categories.sortOrder}</span>
        <input
          type="number"
          min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <div className={styles.actions}>
        <Button type="submit" loading={createCategory.isPending}>
          {de.admin.categories.create}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {de.admin.categories.cancel}
        </Button>
      </div>
    </form>
  );
}

// ───────────────────────── category row ─────────────────────────

interface CategoryDraft {
  name: string;
  colorHex: string;
  sortOrder: number;
}

function draftFromCategory(category: CategoryDto): CategoryDraft {
  return {
    name: category.name,
    colorHex: category.colorHex ?? '#888888',
    sortOrder: category.sortOrder,
  };
}

function sameDraft(a: CategoryDraft, b: CategoryDraft): boolean {
  return a.name === b.name && a.colorHex === b.colorHex && a.sortOrder === b.sortOrder;
}

function CategoryRow({
  category,
  draft,
  error,
  saving,
  deleting,
  onChange,
  onSave,
  onDelete,
}: {
  category: CategoryDto;
  draft: CategoryDraft;
  error: string | null;
  saving: boolean;
  deleting: boolean;
  onChange: (patch: Partial<CategoryDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { de } = useStrings();
  const dirty = !sameDraft(draft, draftFromCategory(category));

  return (
    <li className={styles.memberRow}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <div className={styles.memberFields}>
        <label className={styles.field}>
          <span>{de.admin.categories.name}</span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{de.admin.categories.color}</span>
          <input
            type="color"
            value={draft.colorHex}
            onChange={(e) => onChange({ colorHex: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{de.admin.categories.sortOrder}</span>
          <input
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(e) => onChange({ sortOrder: parseInt(e.target.value, 10) || 0 })}
          />
        </label>
      </div>
      <div className={styles.rowActions}>
        <Button onClick={onSave} loading={saving} disabled={!dirty}>
          {de.admin.categories.save}
        </Button>
        <Button variant="danger" onClick={onDelete} loading={deleting}>
          {de.admin.categories.delete}
        </Button>
      </div>
    </li>
  );
}

// ───────────────────────── section ─────────────────────────

export function CategoriesSection() {
  const { de } = useStrings();
  const { data, isLoading } = useAdminCategories();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [addOpen, setAddOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categories = data?.items ?? [];
  const draftFor = (category: CategoryDto): CategoryDraft =>
    drafts[category.id] ?? draftFromCategory(category);

  const handleChange = (category: CategoryDto, patch: Partial<CategoryDraft>) => {
    setDrafts((prev) => ({ ...prev, [category.id]: { ...draftFor(category), ...patch } }));
  };

  const handleSave = (category: CategoryDto) => {
    const draft = draftFor(category);
    setRowErrors((prev) => ({ ...prev, [category.id]: null }));
    updateCategory.mutate(
      { id: category.id, body: draft },
      {
        onSuccess: () => {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[category.id];
            return next;
          });
          setMessage(de.admin.categories.saved);
        },
        onError: (err) =>
          setRowErrors((prev) => ({ ...prev, [category.id]: categoryErrorMessage(err, de) })),
      },
    );
  };

  const handleDelete = (category: CategoryDto) => {
    setRowErrors((prev) => ({ ...prev, [category.id]: null }));
    setDeletingId(category.id);
    deleteCategory.mutate(category.id, {
      onSuccess: () => {
        setDeletingId(null);
        setMessage(de.admin.categories.deletedSuccess);
      },
      onError: (err) => {
        setDeletingId(null);
        setRowErrors((prev) => ({ ...prev, [category.id]: categoryErrorMessage(err, de) }));
      },
    });
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.categories}</h2>

      {message && (
        <div className={styles.message} role="status">
          {message}
        </div>
      )}

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : categories.length === 0 ? (
        <p className={styles.hint}>{de.admin.categories.empty}</p>
      ) : (
        <ul className={styles.list}>
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              draft={draftFor(category)}
              error={rowErrors[category.id] ?? null}
              saving={updateCategory.isPending && updateCategory.variables?.id === category.id}
              deleting={deletingId === category.id}
              onChange={(patch) => handleChange(category, patch)}
              onSave={() => handleSave(category)}
              onDelete={() => handleDelete(category)}
            />
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={() => setAddOpen(true)}>
        {de.admin.categories.addButton}
      </Button>

      <Sheet open={addOpen} onOpenChange={setAddOpen} title={de.admin.categories.addTitle}>
        <AddCategoryForm
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            setMessage(de.admin.categories.createSuccess);
          }}
        />
      </Sheet>
    </section>
  );
}
