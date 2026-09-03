import type { ReactNode } from 'react';
import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  children: ReactNode;
}

/**
 * Inline error banner for a form/card's own rejected action (a failed save,
 * delete, or archive) — not a page-level `Toast`. Bootstrap-warning-style
 * amber, shared across the admin maintenance cards (CategoryCard,
 * TaskMaintenanceCard, UserMaintenanceCard, and any future ones).
 */
export function ErrorBanner({ children }: ErrorBannerProps) {
  return (
    <div className={styles.banner} role="alert">
      {children}
    </div>
  );
}
