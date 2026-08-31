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
