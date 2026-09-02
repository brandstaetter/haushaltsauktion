import { readableTextColor } from '../../utils/color';
import styles from './CategoryBadge.module.css';

interface CategoryBadgeProps {
  name: string;
  colorHex: string | null;
}

export function CategoryBadge({ name, colorHex }: CategoryBadgeProps) {
  return (
    <span
      className={styles.badge}
      style={
        colorHex
          ? {
              background: colorHex,
              color: readableTextColor(colorHex) ?? undefined,
            }
          : undefined
      }
    >
      {name}
    </span>
  );
}
