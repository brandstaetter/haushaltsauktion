import cn from 'classnames';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  /** Rendered before the label, e.g. `icon={Save}` from `lucide-react`. */
  icon?: LucideIcon;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  loading,
  fullWidth,
  icon: Icon,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {!loading && Icon && <Icon size={18} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
}
