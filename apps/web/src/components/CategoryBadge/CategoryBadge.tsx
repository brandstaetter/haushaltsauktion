import { readableTextColor } from '../../utils/color';
import styles from './CategoryBadge.module.css';

interface CategoryBadgeProps {
  name: string;
  colorHex: string | null;
}

export function CategoryBadge({ name, colorHex }: CategoryBadgeProps) {
  const textColor = readableTextColor(colorHex);
  return (
    <span
      className={styles.badge}
      style={
        colorHex && textColor
          ? {
              background: colorHex,
              color: textColor,
            }
          : undefined
      }
    >
      {name}
    </span>
  );
}
