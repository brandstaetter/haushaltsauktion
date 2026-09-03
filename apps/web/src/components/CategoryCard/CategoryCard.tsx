import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { CategoryDto } from '../../api/types';
import { useStrings } from '../../context/StringsContext';
import { Button } from '../Button/Button';
import styles from './CategoryCard.module.css';

export interface CategoryDraft {
  name: string;
  colorHex: string;
}

export function draftFromCategory(category: CategoryDto): CategoryDraft {
  return {
    name: category.name,
    colorHex: category.colorHex ?? '#888888',
  };
}

export function sameDraft(a: CategoryDraft, b: CategoryDraft): boolean {
  return a.name === b.name && a.colorHex === b.colorHex;
}

interface CategoryCardProps {
  category: CategoryDto;
  draft: CategoryDraft;
  error: string | null;
  saving: boolean;
  deleting: boolean;
  /** Disabled while a filter narrows the list — see CategoriesSection. */
  dragDisabled: boolean;
  onChange: (patch: Partial<CategoryDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
}

/**
 * Editable category row used on `/verwaltung/kategorien` (§17 admin config).
 * Sortable via drag handle (dnd-kit) inside a parent `SortableContext`;
 * outside one, dragging is inert but the card still renders normally.
 */
export function CategoryCard({
  category,
  draft,
  error,
  saving,
  deleting,
  dragDisabled,
  onChange,
  onSave,
  onDelete,
}: CategoryCardProps) {
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
    <li ref={setNodeRef} style={style} className={styles.card}>
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
      <div className={styles.content}>
        {error && (
          <div className={styles.message} role="alert">
            {error}
          </div>
        )}
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.nameField}`}>
            <span>{de.admin.categories.name}</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>
          <label className={`${styles.field} ${styles.colorField}`}>
            <span>{de.admin.categories.color}</span>
            <input
              type="color"
              value={draft.colorHex}
              onChange={(e) => onChange({ colorHex: e.target.value })}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty}>
            {de.admin.categories.save}
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} loading={deleting}>
            {de.admin.categories.delete}
          </Button>
        </div>
      </div>
    </li>
  );
}
