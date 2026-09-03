import type { ReactNode } from 'react';
import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  children: ReactNode;
}

/**
 * Inline error banner for a form/card's own rejected action (a failed save,
 * delete, or archive) — not a page-level `Toast`. Bootstrap-warning-style
 * amber, shared by CategoryCard and TaskMaintenanceCard.
 */
export function ErrorBanner({ children }: ErrorBannerProps) {
  return (
    <div className={styles.banner} role="alert">
      {children}
    </div>
  );
}
