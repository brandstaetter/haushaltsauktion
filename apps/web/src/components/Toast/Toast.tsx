import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import cn from 'classnames';
import { useStrings } from '../../context/StringsContext';
import styles from './Toast.module.css';

interface ToastProps {
  message: string | null;
  variant?: 'status' | 'error';
  onDismiss: () => void;
  duration?: number;
}

/**
 * Fixed-position, auto-dismissing status message — replaces an inline
 * `role="status"`/`role="alert"` block that scrolls out of view on a long
 * page (e.g. the admin task list).
 */
export function Toast({ message, variant = 'status', onDismiss, duration = 5000 }: ToastProps) {
  const { de } = useStrings();
  // Read via ref rather than a `useEffect` dependency: `onDismiss` is
  // typically a fresh inline closure on every render, and depending on it
  // directly would restart the auto-dismiss timer on any unrelated
  // re-render of the caller (e.g. typing into a filter box next to it).
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => onDismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);

  if (!message) return null;

  return (
    <div
      className={cn(styles.toast, variant === 'error' && styles.error)}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        className={styles.close}
        onClick={onDismiss}
        aria-label={de.components.dismiss}
      >
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
