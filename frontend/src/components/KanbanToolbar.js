import React, { useRef } from 'react';
import { TASK_PRIORITY_OPTIONS } from '../constants/task';
import './KanbanToolbar.css';

const PRIORITIES = [
  { value: '', label: 'Toutes les priorites' },
  ...TASK_PRIORITY_OPTIONS,
];

const KanbanToolbar = ({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  stats,
  onRefresh,
  onExport,
  onImportOrders,
}) => {
  const importInputRef = useRef(null);
  const counts = stats?.counts || {};
  const activeFilters = [search.trim(), priority].filter(Boolean).length;

  return (
    <div className="kanban-toolbar">
      {onImportOrders ? (
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="kanban-toolbar__file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportOrders(file);
            event.target.value = '';
          }}
        />
      ) : null}

      <div className="kanban-toolbar__main">
        <div className="kanban-toolbar__search">
          <span className="kanban-toolbar__search-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.8-3.8" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Rechercher commande, client, article, atelier..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Rechercher des tâches"
          />
          {search && (
            <button type="button" className="kanban-toolbar__clear-search" onClick={() => onSearchChange('')} aria-label="Effacer la recherche">
              ×
            </button>
          )}
        </div>

        <label className="kanban-toolbar__filter">
          <span>Priorite</span>
          <select value={priority} onChange={(e) => onPriorityChange(e.target.value)}>
            {PRIORITIES.map((item) => (
              <option key={item.value || 'all'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {activeFilters > 0 && (
          <button type="button" className="kanban-toolbar__reset" onClick={() => { onSearchChange(''); onPriorityChange(''); }}>
            Effacer
          </button>
        )}
      </div>

      <div className="kanban-toolbar__signals" aria-label="Indicateurs de suivi">
        <div className="kanban-toolbar__signal kanban-toolbar__signal--blue">
          <strong>{counts.dueToday ?? '—'}</strong>
          <span>Aujourd'hui</span>
        </div>
        <div className="kanban-toolbar__signal kanban-toolbar__signal--amber">
          <strong>{counts.overdue ?? '—'}</strong>
          <span>Retard</span>
        </div>
        <div className="kanban-toolbar__signal kanban-toolbar__signal--red">
          <strong>{counts.totalBlocked ?? '—'}</strong>
          <span>Bloquees</span>
        </div>
      </div>

      <div className="kanban-toolbar__actions">
        {onImportOrders ? (
          <button
            type="button"
            className="kanban-toolbar__action"
            title="Importer commandes client"
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </button>
        ) : null}
        <button type="button" className="kanban-toolbar__action" title="Exporter Excel" onClick={onExport}>
          Export
        </button>
        <button type="button" className="kanban-toolbar__action kanban-toolbar__action--primary" title="Rafraichir" onClick={onRefresh}>
          Actualiser
        </button>
      </div>
    </div>
  );
};

export default KanbanToolbar;
