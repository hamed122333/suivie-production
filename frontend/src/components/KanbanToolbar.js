import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { TASK_PRIORITY_OPTIONS } from '../constants/task';
import './KanbanToolbar.css';

const PRIORITIES = [
  { value: '', label: 'Toutes les priorites' },
  ...TASK_PRIORITY_OPTIONS,
];

const CATEGORIES = [
  { value: '', label: 'Toutes categories' },
  { value: 'CI', label: 'Carterie (CI)' },
  { value: 'CV', label: 'Carterie (CV)' },
  { value: 'DI', label: 'Divers (DI)' },
  { value: 'DV', label: 'Divers (DV)' },
  { value: 'FC', label: 'Feraille (FC)' },
  { value: 'FD', label: 'Feraille (FD)' },
  { value: 'PL', label: 'Plastique (PL)' },
];

const WINDOW_SIZES = [
  { key: 'week',   label: 'Semaine',  title: 'Vue semaine — lun. à dim.' },
  { key: '2weeks', label: '2 Sem.',   title: 'Vue bi-hebdomadaire' },
  { key: 'month',  label: 'Mois',     title: 'Vue mensuelle' },
  { key: 'all',    label: 'Tout',     title: 'Toutes les fiches, sans filtre de date' },
];

const FR_DAY_SHORT  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FR_MONTHS_ABB = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
const FR_MONTHS_FULL = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

// ── Date helpers ─────────────────────────────────────────────────────────────

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getMonday(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function normaliseAnchor(date, size) {
  const d = new Date(date); d.setHours(0,0,0,0);
  if (size === 'week' || size === '2weeks') return getMonday(d);
  if (size === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return d;
}

function getWindowBounds(anchor, size) {
  const start = new Date(anchor); start.setHours(0,0,0,0);
  if (size === 'all') return { start: null, end: null };
  if (size === 'week')   { const end = new Date(start); end.setDate(end.getDate()+6);  return { start, end }; }
  if (size === '2weeks') { const end = new Date(start); end.setDate(end.getDate()+13); return { start, end }; }
  if (size === 'month')  { return { start, end: new Date(start.getFullYear(), start.getMonth()+1, 0) }; }
  return { start, end: start };
}

function shiftAnchor(anchor, size, dir) {
  const d = new Date(anchor);
  if (size === 'week')   { d.setDate(d.getDate() + dir*7);  return d; }
  if (size === '2weeks') { d.setDate(d.getDate() + dir*14); return d; }
  if (size === 'month')  { d.setMonth(d.getMonth() + dir);  return new Date(d.getFullYear(), d.getMonth(), 1); }
  return d;
}

function isCurrentPeriod(anchor, size) {
  const now = new Date(); now.setHours(0,0,0,0);
  if (size === 'week' || size === '2weeks') return getMonday(now).getTime() === anchor.getTime();
  if (size === 'month') return now.getFullYear() === anchor.getFullYear() && now.getMonth() === anchor.getMonth();
  return false;
}

function formatWindowLabel(start, end, size) {
  if (!start) return 'Toutes les périodes';
  const curYear = new Date().getFullYear();
  const yr = start.getFullYear() !== curYear ? ` ${start.getFullYear()}` : '';
  if (size === 'month') return `${FR_MONTHS_FULL[start.getMonth()]}${yr}`;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear())
    return `${start.getDate()} – ${end.getDate()} ${FR_MONTHS_ABB[start.getMonth()]}${yr}`;
  const endYr = end.getFullYear() !== start.getFullYear() ? ` ${end.getFullYear()}` : '';
  return `${start.getDate()} ${FR_MONTHS_ABB[start.getMonth()]}${yr} – ${end.getDate()} ${FR_MONTHS_ABB[end.getMonth()]}${endYr}`;
}

function localISO(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  return isNaN(d) ? null : toISODate(d);
}

function buildDayBars(start, end, tasks) {
  if (!start || !end) return { days: [], noDateCount: 0 };
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const countByDay = {};
  let noDateCount = 0;
  for (const task of tasks) {
    const k = localISO(task.planned_date);
    if (!k) { noDateCount++; continue; }
    countByDay[k] = (countByDay[k] || 0) + 1;
  }
  const maxCount = Math.max(1, ...Object.values(countByDay));
  const dayList = days.map(d => {
    const iso = toISODate(d);
    const count = countByDay[iso] || 0;
    const isToday    = d.getTime() === today.getTime();
    const isPast     = d < today;
    const isSunday   = d.getDay() === 0;
    const isSaturday = d.getDay() === 6;
    return { iso, date: d, count, heightPct: Math.round((count / maxCount) * 100), isToday, isPast, isSunday, isSaturday };
  });
  const outsideCount = Object.entries(countByDay)
    .filter(([iso]) => iso < toISODate(start) || iso > toISODate(end))
    .reduce((s, [, c]) => s + c, 0);
  return { days: dayList, noDateCount: noDateCount + outsideCount };
}

function computeWindowStats(tasks) {
  const today = new Date(); today.setHours(0,0,0,0);
  const total   = tasks.length;
  const done    = tasks.filter(t => t.status === 'DONE' || t.status === 'DELIVERED').length;
  const blocked = tasks.filter(t => t.status === 'BLOCKED').length;
  const overdue = tasks.filter(t => {
    if (t.status === 'DONE' || t.status === 'DELIVERED' || t.status === 'BLOCKED') return false;
    if (!t.planned_date) return false;
    return new Date(t.planned_date) < today;
  }).length;
  const donePercent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, blocked, overdue, donePercent };
}

// ── Component ────────────────────────────────────────────────────────────────

const KanbanToolbar = ({
  search,
  onSearchChange,
  priority,
  onPriorityChange,
  category,
  onCategoryChange,
  criticalDeficit,
  onCriticalDeficitChange,
  predictiveOnly,
  onPredictiveOnlyChange,
  dateFrom,
  onDateChange = () => {},
  onDaySelect,
  tasks = [],
  importing = false,
  onRefresh,
  onExport,
  onImportOrders,
  commercialFilter = '',
  onCommercialFilterChange,
  commercials = [],
}) => {
  const importInputRef = useRef(null);
  const [inputValue, setInputValue] = useState(search);
  const [isDragOver, setIsDragOver] = useState(false);
  // Default to 'all' so the board shows every task; date window is opt-in
  const [windowSize, setWindowSize] = useState('all');
  const [anchor, setAnchor] = useState(() =>
    dateFrom ? normaliseAnchor(new Date(dateFrom+'T00:00:00'), 'week') : getMonday(new Date())
  );
  const [selectedDay, setSelectedDay] = useState(null);

  const activeFilters = [search.trim(), priority, category, criticalDeficit, predictiveOnly, commercialFilter].filter(Boolean).length;

  useEffect(() => {
    const { start, end } = getWindowBounds(anchor, windowSize);
    onDateChange(start ? toISODate(start) : '', end ? toISODate(end) : '');
  }, [anchor, windowSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const { start: winStart, end: winEnd } = getWindowBounds(anchor, windowSize);
  const windowLabel    = formatWindowLabel(winStart, winEnd, windowSize);
  const onCurPeriod    = isCurrentPeriod(anchor, windowSize);
  const today          = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayInWindow  = winStart && winEnd && today >= winStart && today <= winEnd;

  const showDayBars = windowSize === 'week' || windowSize === '2weeks';
  const { days: dayBars, noDateCount } = useMemo(
    () => (showDayBars ? buildDayBars(winStart, winEnd, tasks) : { days: [], noDateCount: 0 }),
    [showDayBars, winStart?.getTime(), winEnd?.getTime(), tasks] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const stats = useMemo(() => computeWindowStats(tasks), [tasks]);

  const clearDay = () => { setSelectedDay(null); onDaySelect?.(null); };

  const handleSizeChange = (size) => {
    clearDay();
    setWindowSize(size);
    if (size !== 'all') setAnchor(normaliseAnchor(anchor, size));
  };
  const navigate    = (dir) => { clearDay(); setAnchor(prev => shiftAnchor(prev, windowSize, dir)); };
  const jumpToToday = ()    => { clearDay(); setAnchor(normaliseAnchor(new Date(), windowSize)); };

  const handleDayClick = (iso) => {
    setSelectedDay(prev => {
      const next = prev === iso ? null : iso;
      onDaySelect?.(next);
      return next;
    });
  };

  const applySearch = () => onSearchChange(inputValue.trim());
  const clearSearch = () => { setInputValue(''); onSearchChange(''); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applySearch();
    if (e.key === 'Escape') clearSearch();
  };

  const handleDragOver = useCallback((e) => { if (!onImportOrders) return; e.preventDefault(); setIsDragOver(true); }, [onImportOrders]);
  const handleDragLeave = useCallback((e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false);
    if (!onImportOrders) return;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) onImportOrders(file);
  }, [onImportOrders]);

  return (
    <div
      className={`kanban-toolbar${isDragOver ? ' kanban-toolbar--drop-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {onImportOrders && (
        <input ref={importInputRef} type="file" accept=".xlsx,.xls" className="kanban-toolbar__file-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportOrders(f); e.target.value = ''; }} />
      )}

      {isDragOver && (
        <div className="kanban-toolbar__drop-overlay" aria-live="polite">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Déposer pour importer
        </div>
      )}

      {/* ── Row 1: search + filters ── */}
      <div className="kanban-toolbar__main">
        <div className="kanban-toolbar__search">
          <span className="kanban-toolbar__search-icon" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>
            </svg>
          </span>
          <input type="text" placeholder="Commande, client, article… (Entrée)"
            value={inputValue} onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown} aria-label="Rechercher" />
          {inputValue && <button type="button" className="kanban-toolbar__clear-search" onClick={clearSearch} aria-label="Effacer">Effacer</button>}
        </div>

        <label className="kanban-toolbar__filter">
          <span>Priorité</span>
          <select value={priority} onChange={e => onPriorityChange(e.target.value)}>
            {PRIORITIES.map(item => <option key={item.value||'all'} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        <label className="kanban-toolbar__filter">
          <span>Catégorie</span>
          <select value={category} onChange={e => onCategoryChange(e.target.value)}>
            {CATEGORIES.map(item => <option key={item.value||'all'} value={item.value}>{item.label}</option>)}
          </select>
        </label>

        {commercials.length > 0 && onCommercialFilterChange && (
          <label className="kanban-toolbar__filter">
            <span>Commercial</span>
            <select value={commercialFilter} onChange={e => onCommercialFilterChange(e.target.value)}>
              <option value="">Tous</option>
              {commercials.map(c => (
                <option key={c.commercial_id} value={c.commercial_id}>
                  {c.name} ({c.commercial_id})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="kanban-toolbar__checkboxes">
          <label className="kanban-toolbar__checkbox">
            <input type="checkbox" checked={criticalDeficit} onChange={e => onCriticalDeficitChange(e.target.checked)}/>
            <span title="Fiches avec stock insuffisant">Déficit</span>
          </label>
          <label className="kanban-toolbar__checkbox">
            <input type="checkbox" checked={predictiveOnly} onChange={e => onPredictiveOnlyChange(e.target.checked)}/>
            <span title="Commandes prévisionnelles uniquement">Prév.</span>
          </label>
        </div>

        {activeFilters > 0 && (
          <button type="button" className="kanban-toolbar__reset" onClick={() => {
            setInputValue(''); onSearchChange('');
            onPriorityChange(''); onCategoryChange('');
            onCriticalDeficitChange(false); onPredictiveOnlyChange(false);
            onCommercialFilterChange?.('');
          }}>Effacer</button>
        )}
      </div>

      {/* ── Row 2: nav | day bars | stats + actions ── */}
      <div className="kanban-toolbar__window-row">

        <div className="kanban-toolbar__window">
          <div className="kanban-toolbar__window-sizes" role="group" aria-label="Fenêtre temporelle">
            {WINDOW_SIZES.map(s => {
              const isActive = windowSize === s.key;
              return (
                <button key={s.key} type="button" title={s.title}
                  className={`kanban-toolbar__size-tab${isActive ? ' kanban-toolbar__size-tab--active' : ''}`}
                  onClick={() => handleSizeChange(s.key)}
                  aria-pressed={isActive}>
                  {s.label}
                </button>
              );
            })}
          </div>

          {windowSize !== 'all' && (
            <div className="kanban-toolbar__nav">
              <button type="button" className="kanban-toolbar__nav-arrow"
                onClick={() => navigate(-1)} aria-label="Période précédente">‹</button>
              <div className="kanban-toolbar__window-label">
                <span className="kanban-toolbar__window-range">{windowLabel}</span>
                {todayInWindow && <span className="kanban-toolbar__today-dot">auj.</span>}
              </div>
              <button type="button" className="kanban-toolbar__nav-arrow"
                onClick={() => navigate(+1)} aria-label="Période suivante">›</button>
              {!onCurPeriod && (
                <button type="button" className="kanban-toolbar__now-btn" onClick={jumpToToday}>
                  Période actuelle
                </button>
              )}
            </div>
          )}
        </div>

        {showDayBars && dayBars.length > 0 ? (
          <div className="kanban-toolbar__daybars" aria-label="Répartition par jour — cliquer pour filtrer" role="group">
            {dayBars.map(day => {
              const isSelected = selectedDay === day.iso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  className={[
                    'kanban-toolbar__daybar',
                    day.isToday ? 'kanban-toolbar__daybar--today' : '',
                    day.isPast && !day.isToday ? 'kanban-toolbar__daybar--past' : '',
                    day.isSunday || day.isSaturday ? 'kanban-toolbar__daybar--weekend' : '',
                    isSelected ? 'kanban-toolbar__daybar--selected' : '',
                  ].filter(Boolean).join(' ')}
                  title={`${FR_DAY_SHORT[day.date.getDay()]} ${day.date.getDate()} ${FR_MONTHS_ABB[day.date.getMonth()]} — ${day.count} fiche${day.count !== 1 ? 's' : ''}`}
                  onClick={() => handleDayClick(day.iso)}
                  aria-pressed={isSelected}
                >
                  <span className="kanban-toolbar__daybar-count">{day.count > 0 ? day.count : ''}</span>
                  <div className="kanban-toolbar__daybar-track">
                    <div className="kanban-toolbar__daybar-fill"
                      style={{ height: day.count > 0 ? `${Math.max(15, day.heightPct)}%` : '0%' }} />
                  </div>
                  <div className="kanban-toolbar__daybar-meta">
                    <span className="kanban-toolbar__daybar-label">{FR_DAY_SHORT[day.date.getDay()]}</span>
                    <span className="kanban-toolbar__daybar-num">{day.date.getDate()}</span>
                  </div>
                </button>
              );
            })}

            {noDateCount > 0 && (
              <div className="kanban-toolbar__daybar-nodate"
                title={`${noDateCount} fiche${noDateCount > 1 ? 's' : ''} sans date de livraison`}>
                <span className="kanban-toolbar__daybar-nodate-count">{noDateCount}</span>
                <span>sans date</span>
              </div>
            )}

            {selectedDay && (
              <button type="button" className="kanban-toolbar__daybar-clear" onClick={clearDay}>
                Effacer
              </button>
            )}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* Right: stats + actions */}
        <div className="kanban-toolbar__right">
          {stats.total > 0 && (
            <div className="kanban-toolbar__wstats" aria-label="Statistiques">
              <div className="kanban-toolbar__wstat" title="Total fiches">
                <strong>{stats.total}</strong><span>fiches</span>
              </div>
              <div className="kanban-toolbar__wstat-sep" aria-hidden>·</div>
              <div className="kanban-toolbar__wstat kanban-toolbar__wstat--done" title="Terminées / livrées">
                <strong>{stats.donePercent}%</strong><span>faites</span>
              </div>
              {stats.overdue > 0 && <>
                <div className="kanban-toolbar__wstat-sep" aria-hidden>·</div>
                <div className="kanban-toolbar__wstat kanban-toolbar__wstat--late" title="En retard">
                  <strong>{stats.overdue}</strong><span>retard</span>
                </div>
              </>}
              {stats.blocked > 0 && <>
                <div className="kanban-toolbar__wstat-sep" aria-hidden>·</div>
                <div className="kanban-toolbar__wstat kanban-toolbar__wstat--blocked" title="Bloquées">
                  <strong>{stats.blocked}</strong><span>bloquées</span>
                </div>
              </>}
              <div className="kanban-toolbar__progress" title={`${stats.done} / ${stats.total}`}>
                <div className="kanban-toolbar__progress-fill" style={{ width: `${stats.donePercent}%` }} />
              </div>
            </div>
          )}

          <div className="kanban-toolbar__actions">
            {onImportOrders && (
              <button type="button" disabled={importing}
                className={`kanban-toolbar__action kanban-toolbar__action--import${importing ? ' kanban-toolbar__action--loading' : ''}`}
                title="Importer commandes (.xlsx) — ou glisser-déposer"
                onClick={() => importInputRef.current?.click()}>
                {importing
                  ? <><span className="kanban-toolbar__spinner" aria-hidden /> Import…</>
                  : 'Importer'}
              </button>
            )}
            <button type="button" className="kanban-toolbar__action" title="Exporter Excel" onClick={onExport}>
              Exporter
            </button>
            <button type="button" className="kanban-toolbar__action kanban-toolbar__action--primary" title="Actualiser" onClick={onRefresh}>
              Actualiser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KanbanToolbar;
