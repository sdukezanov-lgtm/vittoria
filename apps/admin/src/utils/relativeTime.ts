export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const diffSec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return 'только что';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ч назад`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'вчера';
  return `${diffDay} дн назад`;
}
