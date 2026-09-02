import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import {
  useAdminCategories,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
} from '../../api/hooks';
import { ApiError } from '../../api/client';
import type { CategoryDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import type { Strings } from '../../strings/de';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { Toast } from '../../components/Toast/Toast';
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

/**
 * Given the current server order and a drag's `active`/`over` ids, returns
 * the full list with sequential `sortOrder` (0..n-1) plus the subset whose
 * `sortOrder` actually moved — the only ones a caller needs to `PUT` (the
 * delivery brief: "sequenziell sortOrder je verschobener Kategorie"). Pure
 * so it's testable without simulating a real pointer/keyboard drag.
 */
export function computeReorder(
  categories: CategoryDto[],
  activeId: string,
  overId: string,
): { full: CategoryDto[]; changed: CategoryDto[] } {
  const oldIndex = categories.findIndex((c) => c.id === activeId);
  const newIndex = categories.findIndex((c) => c.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return { full: categories, changed: [] };
  }
  const full = arrayMove(categories, oldIndex, newIndex).map((c, index) => ({
    ...c,
    sortOrder: index,
  }));
  const originalSortOrder = new Map(categories.map((c) => [c.id, c.sortOrder]));
  const changed = full.filter((c) => originalSortOrder.get(c.id) !== c.sortOrder);
  return { full, changed };
}

// ───────────────────────── add-category sheet ─────────────────────────

function AddCategoryForm({
  nextSortOrder,
  onClose,
  onCreated,
}: {
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { de } = useStrings();
  const createCategory = useCreateCategory();
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState('#888888');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createCategory.mutate(
      { name, colorHex, sortOrder: nextSortOrder },
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
}

function draftFromCategory(category: CategoryDto): CategoryDraft {
  return {
    name: category.name,
    colorHex: category.colorHex ?? '#888888',
  };
}

function sameDraft(a: CategoryDraft, b: CategoryDraft): boolean {
  return a.name === b.name && a.colorHex === b.colorHex;
}

function CategoryRow({
  category,
  draft,
  error,
  saving,
  deleting,
  dragDisabled,
  onChange,
  onSave,
  onDelete,
}: {
  category: CategoryDto;
  draft: CategoryDraft;
  error: string | null;
  saving: boolean;
  deleting: boolean;
  dragDisabled: boolean;
  onChange: (patch: Partial<CategoryDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { de } = useStrings();
  const dirty = !sameDraft(draft, draftFromCategory(category));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: dragDisabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className={styles.memberRow}>
      {error && (
        <div className={styles.message} role="alert">
          {error}
        </div>
      )}
      <div className={styles.categoryRowHeader}>
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={de.admin.categories.dragHandle}
          disabled={dragDisabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={20} aria-hidden="true" />
        </button>
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
        </div>
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
  const reorderCategories = useReorderCategories();

  const [addOpen, setAddOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [toast, setToast] = useState<{ text: string; variant: 'status' | 'error' } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const categories = data?.items ?? [];
  const query = filter.trim().toLowerCase();
  // Reordering by drag only makes sense against the *full* list — dnd-kit's
  // active/over indices would otherwise be positions within this filtered
  // subset, not the real sortOrder range, so dragging is disabled (below)
  // whenever this narrows the list.
  const filteredCategories =
    query === '' ? categories : categories.filter((c) => c.name.toLowerCase().includes(query));
  const draftFor = (category: CategoryDto): CategoryDraft =>
    drafts[category.id] ?? draftFromCategory(category);

  const handleChange = (category: CategoryDto, patch: Partial<CategoryDraft>) => {
    setDrafts((prev) => ({ ...prev, [category.id]: { ...draftFor(category), ...patch } }));
  };

  const handleSave = (category: CategoryDto) => {
    const draft = draftFor(category);
    setRowErrors((prev) => ({ ...prev, [category.id]: null }));
    updateCategory.mutate(
      // The category's own `sortOrder` (not the draft's) is authoritative
      // here — a draft can outlive a drag-and-drop reorder that already
      // moved this row, and re-sending a stale draft value would clobber it.
      { id: category.id, body: { name: draft.name, colorHex: draft.colorHex, sortOrder: category.sortOrder } },
      {
        onSuccess: () => {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[category.id];
            return next;
          });
          setToast({ text: de.admin.categories.saved, variant: 'status' });
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
        setToast({ text: de.admin.categories.deletedSuccess, variant: 'status' });
      },
      onError: (err) => {
        setDeletingId(null);
        setRowErrors((prev) => ({ ...prev, [category.id]: categoryErrorMessage(err, de) }));
      },
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over === null || active.id === over.id) return;
    const { full, changed } = computeReorder(categories, String(active.id), String(over.id));
    if (changed.length === 0) return;
    reorderCategories.mutate(
      { full, changed },
      {
        onError: () =>
          setToast({ text: de.admin.categories.errors.generic, variant: 'error' }),
      },
    );
  };

  const nextSortOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{de.admin.sections.categories}</h2>

      <Toast
        message={toast?.text ?? null}
        variant={toast?.variant}
        onDismiss={() => setToast(null)}
      />

      <label className={styles.field}>
        <span className="visually-hidden">{de.admin.categories.filterLabel}</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={de.admin.categories.filterPlaceholder}
        />
      </label>

      {isLoading ? (
        <div className={styles.spinner} aria-label="Wird geladen" />
      ) : categories.length === 0 ? (
        <p className={styles.hint}>{de.admin.categories.empty}</p>
      ) : filteredCategories.length === 0 ? (
        <p className={styles.hint}>{de.admin.categories.filterEmpty}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredCategories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className={styles.list}>
              {filteredCategories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  draft={draftFor(category)}
                  error={rowErrors[category.id] ?? null}
                  saving={updateCategory.isPending && updateCategory.variables?.id === category.id}
                  deleting={deletingId === category.id}
                  dragDisabled={query !== ''}
                  onChange={(patch) => handleChange(category, patch)}
                  onSave={() => handleSave(category)}
                  onDelete={() => handleDelete(category)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={() => setAddOpen(true)}
        aria-label={de.admin.categories.addButton}
      >
        <Plus size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      <Sheet open={addOpen} onOpenChange={setAddOpen} title={de.admin.categories.addTitle}>
        <AddCategoryForm
          nextSortOrder={nextSortOrder}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            setToast({ text: de.admin.categories.createSuccess, variant: 'status' });
          }}
        />
      </Sheet>
    </section>
  );
}
