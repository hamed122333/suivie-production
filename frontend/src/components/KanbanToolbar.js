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
  filterUser,
  onFilterUserChange,
  users,
  isAdmin,
  stats,
  onRefresh,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

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
                <label>
                  <span>Assigné à</span>
                  <select value={filterUser} onChange={(e) => onFilterUserChange(e.target.value)}>
                    <option value="">Tous</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="kanban-toolbar__stats">
        <button type="button" className="kanban-toolbar__refresh" title="Rafraîchir" onClick={onRefresh}>
          ↻
        </button>
        <div className="kanban-stat kanban-stat--blue">
          <strong>{stats?.todayTotal ?? '—'}</strong>
          <span>Tâches aujourd&apos;hui</span>
        </div>
        <div className="kanban-stat kanban-stat--green">
          <strong>{stats?.totalDone ?? '—'}</strong>
          <span>Terminées</span>
        </div>
        <div className="kanban-stat kanban-stat--red">
          <strong>{stats?.totalBlocked ?? '—'}</strong>
          <span>Bloquées</span>
        </div>
      </div>
    </div>
  );
};

export default KanbanToolbar;
