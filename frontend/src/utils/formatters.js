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

function pad(n) {
  return String(n).padStart(2, '0');
}

function toSafeDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(dateStr) {
  const d = toSafeDate(dateStr);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(dateStr) {
  const d = toSafeDate(dateStr);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRelativeDate(dateStr, { compact = false } = {}) {
  const date = toSafeDate(dateStr);
  if (!date) return compact ? '—' : '';

  const now = new Date();
  const diffMs = Math.abs(now - date);
  const future = date > now;
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return "A l'instant";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return compact ? `${minutes}min` : `Il y a ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return compact ? `${hours}h` : `Il y a ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  if (days === 0) return compact ? "Auj." : "Aujourd'hui";
  if (days === 1) return compact ? '1j' : (future ? 'Demain' : 'Hier');
  if (days < 7) {
    if (compact) return `${days}j`;
    return future ? `Dans ${days} jours` : `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  }

  return formatDate(dateStr);
}

export function formatLongDate(dateStr) {
  const d = toSafeDate(dateStr || new Date());
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
