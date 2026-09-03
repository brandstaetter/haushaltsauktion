const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
const dtfDate = new Intl.DateTimeFormat('de', { weekday: 'long', day: 'numeric', month: 'short' });
const dtfTime = new Intl.DateTimeFormat('de', { hour: '2-digit', minute: '2-digit' });
const dtfShortDate = new Intl.DateTimeFormat('de', { day: 'numeric', month: 'short' });
const dtfWeekday = new Intl.DateTimeFormat('de', { weekday: 'short' });

export function formatTime(iso: string): string {
  return dtfTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dtfDate.format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (isToday) return 'heute';
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTomorrow) return 'morgen';
  return dtfWeekday.format(date) + ', ' + dtfShortDate.format(date);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, 'day');
}

export function formatNumber(n: number): string {
  return n.toLocaleString('de-DE');
}

export function signedNumber(n: number): string {
  if (n > 0) return `+${n.toLocaleString('de-DE')}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString('de-DE')}`;
  return '0';
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => String(values[key] ?? ''));
}

/** "24 Stunden" / "1 Minute" / "3 Tage" — a fixed duration (not a countdown). */
export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} ${totalMinutes === 1 ? 'Minute' : 'Minuten'}`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * "3 Std. 12 Min." / "45 Min." / "2 Tage" — the remaining time until `iso`,
 * for §31's "show the consequence up front" applied to a potion's countdown
 * (intake "points-shop-virtual-gamification-items"). Never negative: an
 * effect the dashboard still lists as active but whose clock just ran out
 * reads as "0 Min." rather than a confusing negative duration.
 */
export function formatRemaining(iso: string): string {
  const totalMinutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} Min.`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const dayWord = days === 1 ? 'Tag' : 'Tage';
  return remHours > 0 ? `${days} ${dayWord} ${remHours} Std.` : `${days} ${dayWord}`;
}
