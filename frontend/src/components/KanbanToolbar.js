import React, { useState } from 'react';
import './KanbanToolbar.css';

const PRIORITIES = [
  { id: '', label: 'Toutes priorités' },
  { id: 'LOW', label: 'Basse' },
  { id: 'MEDIUM', label: 'Moyenne' },
  { id: 'HIGH', label: 'Haute' },
  { id: 'URGENT', label: 'Urgente' },
];

const KanbanToolbar = ({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  users,
  isAdmin,
  stats,
  onRefresh,
  onExport,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const counts = stats?.counts || {};

  return (
    <div className="kanban-toolbar">
      <div className="kanban-toolbar__left">
        <div className="kanban-toolbar__search">
          <span className="kanban-toolbar__search-icon" aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Rechercher dans le tableau…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Rechercher des tâches"
          />
        </div>

        <div className="kanban-toolbar__avatars" title="Équipe">
          {users.slice(0, 6).map((u) => (
            <span key={u.id} className="kanban-toolbar__avatar" title={u.name}>
              {u.name
                ?.split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || '?'}
            </span>
          ))}
          {users.length > 6 && (
            <span className="kanban-toolbar__avatar kanban-toolbar__avatar--more">+{users.length - 6}</span>
          )}
        </div>

        <div className="kanban-toolbar__filters">
          <button
            type="button"
            className={`kanban-toolbar__filter-btn ${filtersOpen ? 'kanban-toolbar__filter-btn--open' : ''}`}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <span aria-hidden>⚙</span> Filtres
          </button>
          {filtersOpen && (
            <div className="kanban-toolbar__filter-panel" role="dialog" aria-label="Filtres">
              <label>
                <span>Priorité</span>
                <select value={priority} onChange={(e) => onPriorityChange(e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p.id || 'all'} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin && (
                <div style={{ fontSize: '0.75rem', color: '#5e6c84', fontWeight: 600 }}>
                  Seul le planificateur peut déplacer les cartes.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="kanban-toolbar__stats">
        <button type="button" className="kanban-toolbar__refresh kanban-toolbar__export" title="Exporter Excel" onClick={onExport} style={{ marginRight: '8px' }}>
          📥
        </button>
        <button type="button" className="kanban-toolbar__refresh" title="Rafraîchir" onClick={onRefresh}>
          ↻
        </button>
        <div className="kanban-stat kanban-stat--blue">
          <strong>{counts.dueToday ?? '—'}</strong>
          <span>Echéances du jour</span>
        </div>
        <div className="kanban-stat kanban-stat--amber">
          <strong>{counts.overdue ?? '—'}</strong>
          <span>En retard</span>
        </div>
        <div className="kanban-stat kanban-stat--red">
          <strong>{counts.totalBlocked ?? '—'}</strong>
          <span>Bloquées</span>
        </div>
        <div className="kanban-stat kanban-stat--green">
          <strong>{counts.completedToday ?? '—'}</strong>
          <span>Terminees aujourd&apos;hui</span>
        </div>
      </div>
    </div>
  );
};

export default KanbanToolbar;
