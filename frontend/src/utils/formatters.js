export function getInitials(name) {
  if (!name) return '?';

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function formatRelativeDate(dateStr, { compact = false } = {}) {
  if (!dateStr) return compact ? '—' : '';

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return compact ? '—' : '';

  const now = new Date();
  const diffMs = now - date;
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return "A l'instant";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return compact ? `Il y a ${days}j` : `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  }

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function formatDate(dateStr, { withYear = false } = {}) {
  if (!dateStr) return '—';

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value) {
  if (value == null || value === '') return '—';

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';

  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
  }).format(numericValue);
}
