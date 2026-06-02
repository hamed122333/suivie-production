import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { taskAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { formatDate } from '../utils/formatters';
import Spinner from '../components/Spinner';
import OrderEditModal from '../components/OrderEditModal';
import useServerEvents from '../hooks/useServerEvents';
import './CommercialReviewPage.css';
import './PendingOrdersPage.css';

// Anomalies bloquant la bonne prise en charge (corrigeables par le super admin)
function taskAnomalies(task) {
  const issues = [];
  if (!task.commercial_id) issues.push('Commercial non renseigné');
  else if (!task.commercial_name) issues.push(`Commercial ${task.commercial_id} introuvable`);
  if (!task.client_name && !task.order_code) issues.push('Client non identifié');
  if (!task.planned_date) issues.push('Date de livraison manquante');
  if (!task.item_reference || task.item_reference === 'INCONNU') issues.push('Référence invalide');
  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLE_CATEGORIES = {
  CI: 'Carterie', CV: 'Carterie',
  DI: 'Divers',   DV: 'Divers',
  FC: 'Feraille', FD: 'Feraille',
  PL: 'Plastique',
};

function getPrefix(ref) {
  return ref ? ref.substring(0, 2).toUpperCase() : null;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const t = new Date();        t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

function urgencyLevel(task) {
  const d = daysUntil(task.planned_date);
  if (d === null)  return 'none';
  if (d < 0)       return 'overdue';
  if (d <= 3)      return 'critical';
  if (d <= 7)      return 'soon';
  return 'ok';
}

function readinessScore(task) {
  const qty   = Number(task.quantity || 0);
  const avail = task.stock?.available ?? 0;
  const ready = task.stock?.isReady ?? false;
  const days  = daysUntil(task.planned_date);

  if (!task.stock)       return { level: 'unknown', label: '— Inconnu',          color: '#94a3b8' };
  if (!ready)            return { level: 'waiting', label: '⏳ Stock en attente', color: '#d97706' };
  if (avail <= 0)        return { level: 'empty',   label: '✕ Rupture stock',     color: '#dc2626' };
  if (avail < qty)       return { level: 'partial', label: '⚠ Stock partiel',     color: '#f59e0b' };
  if (days !== null && days < 0) return { level: 'late', label: '🔴 En retard',   color: '#dc2626' };
  return { level: 'ready', label: '✓ Prêt', color: '#16a34a' };
}

function coveragePct(stock, qty) {
  if (!stock || !qty) return null;
  return Math.min(200, Math.round((stock.available / qty) * 100));
}

function highlightMatch(text, query) {
  if (!text || !query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#fef08a', borderRadius: '2px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Modal
// ─────────────────────────────────────────────────────────────────────────────

function DetailModal({ task, onClose, onApprove, onReject, working, canApprove }) {
  const prefix   = getPrefix(task.item_reference);
  const days     = daysUntil(task.planned_date);
  const urgency  = urgencyLevel(task);
  const score    = readinessScore(task);
  const pct      = coveragePct(task.stock, Number(task.quantity || 0));
  const coverageColor = pct === null ? '#94a3b8' : pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div className="cr-overlay" onClick={onClose}>
      <div className="cr-modal" onClick={e => e.stopPropagation()}>

        <div className="cr-modal__head">
          <div className="cr-modal__head-left">
            {prefix && (
              <div className={`article-badge article-badge--${prefix.toLowerCase()} cr-modal__badge`}>{prefix}</div>
            )}
            <div>
              <div className="cr-modal__title">{task.client_name || task.title || '—'}</div>
              <div className="cr-modal__meta">
                {task.item_reference && <span className="cr-mono">{task.item_reference}</span>}
                {task.order_code    && <span className="cr-sep">·</span>}
                {task.order_code    && <span style={{ color: '#64748b' }}>N° {task.order_code}</span>}
                {task.commercial_name && (
                  <>
                    <span className="cr-sep">·</span>
                    <span className="cr-commercial-tag">✉ {task.commercial_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="cr-modal__head-right">
            <span className="cr-readiness-pill" style={{ background: score.color + '18', color: score.color, border: `1px solid ${score.color}40` }}>
              {score.label}
            </span>
            <button type="button" className="cr-modal__close" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </div>

        <div className="cr-modal__body">
          {/* Left — order details */}
          <div className="cr-modal__col">
            <div className="cr-modal__section">Détails commande</div>
            <div className="cr-modal__kv">
              <span>Désignation</span>
              <strong>{task.description || task.title || '—'}</strong>
            </div>
            <div className="cr-modal__kv">
              <span>Quantité</span>
              <strong>{Number(task.quantity || 0).toLocaleString('fr-FR')} {task.quantity_unit || 'pcs'}</strong>
            </div>
            <div className="cr-modal__kv">
              <span>Catégorie article</span>
              <span>{prefix ? (ARTICLE_CATEGORIES[prefix] || '—') : '—'}</span>
            </div>
            {task.commercial_name && (
              <div className="cr-modal__kv">
                <span>Commercial</span>
                <span>{task.commercial_name}{task.commercial_id ? ` (${task.commercial_id})` : ''}</span>
              </div>
            )}
            <div className="cr-modal__date-block" data-urgency={urgency}>
              <div className="cr-modal__date-label">Date de livraison demandée</div>
              <div className="cr-modal__date-value">
                {task.planned_date ? formatDate(task.planned_date) : '—'}
              </div>
              {days !== null && (
                <div className="cr-modal__date-badge" data-urgency={urgency}>
                  {days < 0
                    ? `⚠ En retard de ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`
                    : days === 0 ? '🔴 Livraison aujourd\'hui !'
                    : days <= 3 ? `🟠 Urgent — J-${days}`
                    : days <= 7 ? `🟡 Proche — J-${days}`
                    : `J-${days}`}
                </div>
              )}
            </div>
          </div>

          {/* Right — stock info */}
          <div className="cr-modal__col">
            <div className="cr-modal__section">Stock disponible</div>
            {task.stock ? (
              <>
                <div className="cr-modal__kv">
                  <span>Stock total</span>
                  <span className={`qty-badge ${task.stock.stockQty > 0 ? 'status-full' : 'status-empty'}`}>
                    {task.stock.stockQty.toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="cr-modal__kv">
                  <span>Réservé (autres)</span>
                  <span className="qty-reserved">{task.stock.reserved.toLocaleString('fr-FR')} pcs</span>
                </div>
                <div className="cr-modal__kv">
                  <span>Disponible net</span>
                  <span className={`qty-available${task.stock.available <= 0 ? ' empty' : ''}`} style={{ fontSize: '1rem', fontWeight: 800 }}>
                    {task.stock.available.toLocaleString('fr-FR')} pcs
                  </span>
                </div>
                {pct !== null && (
                  <div className="cr-modal__kv cr-modal__kv--col">
                    <span>Couverture commande ({Number(task.quantity || 0).toLocaleString('fr-FR')} pcs)</span>
                    <div className="coverage-wrapper" style={{ marginTop: '0.4rem', width: '100%' }}>
                      <div className="coverage-bar" style={{ width: '100%', height: 8 }}>
                        <div className="coverage-fill" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: coverageColor }} />
                      </div>
                      <span className="coverage-text" style={{ color: coverageColor }}>{pct}%</span>
                    </div>
                  </div>
                )}
                <div className="cr-modal__kv">
                  <span>État stock</span>
                  <span>
                    {task.stock.isReady
                      ? <span className="status-pill status-pill--ready">✓ Disponible</span>
                      : <span className="days-badge">⏳ En préparation</span>}
                  </span>
                </div>
                {task.stock.readyDate && !task.stock.isReady && (
                  <div className="cr-modal__kv">
                    <span>Disponible à partir du</span>
                    <span className="date-wrapper" style={{ padding: '0.25rem 0.6rem', fontSize: '0.82rem' }}>
                      <span className="date-icon">📅</span>
                      {formatDate(task.stock.readyDate)}
                    </span>
                  </div>
                )}
                {task.stock.designation && (
                  <div className="cr-modal__kv">
                    <span>Désignation stock</span>
                    <span style={{ color: '#475569', fontSize: '0.8rem' }}>{task.stock.designation}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="cr-modal__no-stock">
                <span>📦</span>
                <strong>Article non trouvé dans le stock</strong>
                <p>Après validation, la commande sera mise en file d'attente FIFO jusqu'à la prochaine importation de stock.</p>
              </div>
            )}
          </div>
        </div>

        {canApprove && (
          <div className="cr-modal__foot">
            <button type="button" className="btn btn-outline cr-btn-modal-reject" onClick={() => onReject(task.id)} disabled={working}>
              ✕ Rejeter cette commande
            </button>
            <button type="button" className="btn btn-secondary cr-btn-modal-approve" onClick={() => onApprove(task.id)} disabled={working}>
              {working ? 'Traitement…' : '✓ Valider → Production'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const OrdersReviewPage = () => {
  const { isSuperAdmin, isPlanner, isCommercial } = useAuth();
  const { refreshWorkspaces, selectWorkspace } = useWorkspace();

  // Permissions
  const canManage   = isSuperAdmin;                 // import (correction = héritage à l'import)
  const canApprove  = isSuperAdmin || isCommercial; // approve / reject
  const isGrouped   = isSuperAdmin || isPlanner;    // grouped-by-commercial view

  const [tasks, setTasks]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState(new Set());
  const [working, setWorking]             = useState(false);
  const [banner, setBanner]               = useState(null);
  const [detailTask, setDetailTask]       = useState(null);

  // Toolbar
  const [inputValue, setInputValue]       = useState('');
  const [searchTerm, setSearchTerm]       = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [stockFilter, setStockFilter]     = useState('');
  const [commercialFilter, setCommercialFilter] = useState('');
  const [sortConfig, setSortConfig]       = useState({ key: 'date', dir: 'asc' });
  const [currentPage, setCurrentPage]     = useState(1);
  const [pageSize, setPageSize]           = useState(50);

  // Import + correction (super_admin)
  const [importing, setImporting]         = useState(false);
  const [isDragOver, setIsDragOver]       = useState(false);
  const importInputRef                    = useRef(null);
  const [commercialUsers, setCommercialUsers] = useState([]);
  const [editTask, setEditTask]           = useState(null);
  const [editWorking, setEditWorking]     = useState(false);

  const inputRef    = useRef(null);
  const bannerTimer = useRef(null);

  // ── Data ────────────────────────────────────────────────────────────────

  const showBanner = useCallback((type, message) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ type, message });
    bannerTimer.current = setTimeout(() => setBanner(null), 6000);
  }, []);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const reqs = [taskAPI.getPendingApproval()];
      if (canManage) reqs.push(userAPI.getAll());
      const [tasksRes, usersRes] = await Promise.all(reqs);
      setTasks(tasksRes.data || []);
      setSelected(new Set());
      if (usersRes) {
        setCommercialUsers((usersRes.data || []).filter(u => u.role === 'commercial' && u.commercial_id));
      }
    } catch (err) {
      console.error('getPendingApproval failed', err);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useServerEvents({ 'tasks-updated': fetchPending });

  // ── Import (super_admin) ──────────────────────────────────────────────────

  const handleImportOrders = useCallback(async (file) => {
    if (!file || !canManage) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await taskAPI.importOrders(formData);
      const imported  = res?.data?.imported ?? 0;
      const skipped   = (res?.data?.skipped ?? 0) + (res?.data?.skippedExisting ?? 0);
      const warnings  = res?.data?.warnings || [];

      await refreshWorkspaces();
      selectWorkspace('all');

      let msg = imported === 0 && skipped > 0
        ? `Aucune nouvelle ligne — les ${skipped} lignes existent déjà.`
        : `${imported} ligne(s) importée(s) avec succès.`;
      if (skipped > 0 && imported > 0) msg += ` • ${skipped} ignorée(s).`;
      if (warnings.length > 0)         msg += ` ⚠ ${warnings.join(' | ')}`;

      showBanner('success', msg);
      await fetchPending();
    } catch (err) {
      showBanner('error', err?.response?.data?.error || "Échec de l'import.");
    } finally {
      setImporting(false);
    }
  }, [canManage, fetchPending, refreshWorkspaces, selectWorkspace, showBanner]);

  const handleDragOver  = useCallback((e) => { if (canManage) { e.preventDefault(); setIsDragOver(true); } }, [canManage]);
  const handleDragLeave = useCallback((e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }, []);
  const handleDrop      = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false);
    if (!canManage) return;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) handleImportOrders(file);
  }, [canManage, handleImportOrders]);

  // ── Approve / Reject ──────────────────────────────────────────────────────

  const handleApprove = async (idOrIds) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (!ids.length) return;
    setWorking(true);
    try {
      const res = await taskAPI.approveOrders(ids);
      selectWorkspace('all');
      showBanner('success', res.data.message);
      setDetailTask(null);
      await fetchPending();
    } catch (err) {
      showBanner('error', err?.response?.data?.error || 'Erreur lors de la validation');
    } finally { setWorking(false); }
  };

  const handleReject = async (idOrIds) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (!ids.length) return;
    if (!window.confirm(`Supprimer ${ids.length} commande${ids.length > 1 ? 's' : ''} définitivement ?`)) return;
    setWorking(true);
    try {
      const res = await taskAPI.rejectOrders(ids);
      showBanner('success', res.data.message);
      setDetailTask(null);
      await fetchPending();
    } catch (err) {
      showBanner('error', err?.response?.data?.error || 'Erreur lors du rejet');
    } finally { setWorking(false); }
  };

  // ── Correction des anomalies (super admin) ────────────────────────────────
  const handleSaveEdit = async (form) => {
    const t = editTask;
    if (!t) return;
    const payload = {};
    if ((form.clientName || '') !== (t.client_name || '')) payload.clientName = form.clientName || null;
    if ((form.commercialId || '') !== (t.commercial_id || '')) payload.commercialId = form.commercialId || null;
    if ((form.plannedDate || '') !== (t.planned_date ? String(t.planned_date).slice(0, 10) : '')) payload.plannedDate = form.plannedDate || null;
    if ((form.itemReference || '') !== (t.item_reference || '')) payload.itemReference = form.itemReference || null;
    if (String(form.quantity ?? '') !== String(t.quantity ?? '')) payload.quantity = form.quantity;
    if (Object.keys(payload).length === 0) { setEditTask(null); return; }
    setEditWorking(true);
    try {
      await taskAPI.update(t.id, payload);
      setEditTask(null);
      showBanner('success', 'Commande corrigée.');
      await fetchPending();
    } catch (err) {
      showBanner('error', err?.response?.data?.error || 'Échec de la correction.');
    } finally { setEditWorking(false); }
  };

  // ── Search ────────────────────────────────────────────────────────────────

  const applySearch = () => { setSearchTerm(inputValue.trim()); setCurrentPage(1); };
  const clearSearch = () => { setInputValue(''); setSearchTerm(''); setCurrentPage(1); inputRef.current?.focus(); };
  const handleKey   = (e) => {
    if (e.key === 'Enter') applySearch();
    if (e.key === 'Escape') clearSearch();
  };

  // ── Filtering + sorting ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let items = tasks;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(t =>
        (t.client_name     || '').toLowerCase().includes(q) ||
        (t.item_reference  || '').toLowerCase().includes(q) ||
        (t.order_code      || '').toLowerCase().includes(q) ||
        (t.commercial_name || '').toLowerCase().includes(q) ||
        (t.commercial_id   || '').toLowerCase().includes(q) ||
        (t.description || t.title || '').toLowerCase().includes(q)
      );
    }
    if (urgencyFilter)  items = items.filter(t => urgencyLevel(t) === urgencyFilter);
    if (commercialFilter) items = items.filter(t => (t.commercial_id || '') === commercialFilter);

    if (stockFilter === 'ready')   items = items.filter(t => t.stock?.available > 0 && t.stock?.isReady);
    if (stockFilter === 'partial') items = items.filter(t => t.stock?.available > 0 && t.stock.available < Number(t.quantity || 0));
    if (stockFilter === 'waiting') items = items.filter(t => t.stock && !t.stock.isReady);
    if (stockFilter === 'empty')   items = items.filter(t => !t.stock || t.stock.available <= 0);

    const sorted = [...items].sort((a, b) => {
      let av, bv;
      switch (sortConfig.key) {
        case 'client':   av = (a.client_name || '').toLowerCase(); bv = (b.client_name || '').toLowerCase(); break;
        case 'ref':      av = (a.item_reference || '').toLowerCase(); bv = (b.item_reference || '').toLowerCase(); break;
        case 'qty':      av = Number(a.quantity || 0); bv = Number(b.quantity || 0); break;
        case 'coverage': av = coveragePct(a.stock, Number(a.quantity || 0)) ?? -1; bv = coveragePct(b.stock, Number(b.quantity || 0)) ?? -1; break;
        case 'date':
        default:         av = a.planned_date || '9999-99-99'; bv = b.planned_date || '9999-99-99'; break;
      }
      if (av < bv) return sortConfig.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.dir === 'asc' ?  1 : -1;
      return 0;
    });
    return sorted;
  }, [tasks, searchTerm, urgencyFilter, stockFilter, commercialFilter, sortConfig]);

  // Liste affichée (l'héritage à l'import corrige déjà les lignes — pas d'anomalies)
  const cleanTasks = filtered;

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const t = tasks;
    return {
      total:    t.length,
      overdue:  t.filter(x => urgencyLevel(x) === 'overdue').length,
      critical: t.filter(x => urgencyLevel(x) === 'critical').length,
      ready:    t.filter(x => readinessScore(x).level === 'ready').length,
      noStock:  t.filter(x => ['empty', 'waiting'].includes(readinessScore(x).level)).length,
      totalQty: t.reduce((s, x) => s + Number(x.quantity || 0), 0),
      groups:   new Set(t.map(x => x.commercial_id).filter(Boolean)).size,
      anomalies: canManage ? t.filter(x => taskAnomalies(x).length > 0).length : 0,
    };
  }, [tasks, canManage]);

  // ── Groups (grouped view) ─────────────────────────────────────────────────

  const groups = useMemo(() => {
    const map = {};
    for (const task of cleanTasks) {
      const key = task.commercial_id || '__none__';
      if (!map[key]) map[key] = { label: task.commercial_name || task.commercial_id || 'Commercial non assigné', tasks: [] };
      map[key].tasks.push(task);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cleanTasks]);

  // ── Pagination (commercial flat view) ─────────────────────────────────────

  const totalPages = Math.ceil(cleanTasks.length / pageSize) || 1;
  const paginatedFlat = cleanTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── Selection ─────────────────────────────────────────────────────────────

  const allVisibleIds = filtered.map(t => t.id);
  const allSelected   = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const someSelected  = selected.size > 0;

  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(allVisibleIds));
  const toggleOne   = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectGroup = (ids) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });

  const requestSort = (key) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    setCurrentPage(1);
  };
  const sortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="sort-icon-hidden">↕</span>;
    return sortConfig.dir === 'asc' ? '↑' : '↓';
  };

  const commercialOptions = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.commercial_id) continue;
      if (!map[t.commercial_id]) map[t.commercial_id] = { id: t.commercial_id, name: t.commercial_name || t.commercial_id };
    }
    return Object.values(map).sort((a, b) => a.id.localeCompare(b.id));
  }, [tasks]);

  const hasFilters = searchTerm || urgencyFilter || stockFilter || commercialFilter;
  const clearFilters = () => { clearSearch(); setUrgencyFilter(''); setStockFilter(''); setCommercialFilter(''); };

  // ── Row + head renderers ──────────────────────────────────────────────────

  const renderTableHead = () => (
    <thead>
      <tr>
        {canApprove && (
          <th className="cr-col-check">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Tout sélectionner" />
          </th>
        )}
        <th className="sortable-header" onClick={() => requestSort('client')}>Client / Commande {sortIcon('client')}</th>
        <th className="sortable-header" onClick={() => requestSort('ref')}>Référence {sortIcon('ref')}</th>
        <th className="cr-col-hide-md">Désignation</th>
        <th className="text-center sortable-header" onClick={() => requestSort('qty')}>Quantité {sortIcon('qty')}</th>
        <th className="sortable-header" onClick={() => requestSort('date')}>Date livraison {sortIcon('date')}</th>
        <th className="text-center">Stock dispo.</th>
        <th className="text-center sortable-header cr-col-hide-sm" onClick={() => requestSort('coverage')}>Couverture {sortIcon('coverage')}</th>
        <th className="cr-col-hide-sm">Statut</th>
        {canApprove && <th style={{ width: 90 }}></th>}
      </tr>
    </thead>
  );

  const renderRow = (task) => {
    const prefix    = getPrefix(task.item_reference);
    const isChecked = selected.has(task.id);
    const urgency   = urgencyLevel(task);
    const days      = daysUntil(task.planned_date);
    const score     = readinessScore(task);
    const pct       = coveragePct(task.stock, Number(task.quantity || 0));
    const coverageColor = pct === null ? '#94a3b8' : pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const qtyClass  = !task.stock ? '' : pct >= 100 ? 'status-full' : pct >= 50 ? 'status-partial' : 'status-empty';
    const anomalies = canManage ? taskAnomalies(task) : [];

    return (
      <tr
        key={task.id}
        className={[
          'cr-row',
          isChecked ? 'cr-row--checked' : '',
          anomalies.length ? 'por-row--anomaly' : '',
          urgency === 'overdue'  ? 'cr-row--overdue'  : '',
          urgency === 'critical' ? 'cr-row--critical' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setDetailTask(task)}
      >
        {canApprove && (
          <td className="cr-col-check" onClick={e => { e.stopPropagation(); toggleOne(task.id); }}>
            <input type="checkbox" checked={isChecked} onChange={() => toggleOne(task.id)} />
          </td>
        )}

        {/* Client */}
        <td>
          <div className="item-article">
            {prefix
              ? <div className={`article-badge article-badge--${prefix.toLowerCase()}`}>{prefix}</div>
              : <div className="article-badge article-badge--default">??</div>}
            <div className="article-info">
              <span className="article-name">
                {searchTerm ? highlightMatch(task.client_name || '—', searchTerm) : (task.client_name || '—')}
              </span>
              {task.order_code && <span className="article-subtext">{task.order_code}</span>}
              {anomalies.length > 0 && (
                <span className="por-anomaly-tag por-anomaly-tag--warning" title={anomalies.join(' · ')}>
                  ⚠ {anomalies.length} anomalie{anomalies.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Reference */}
        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span className="cr-mono">
              {searchTerm ? highlightMatch(task.item_reference || '—', searchTerm) : (task.item_reference || '—')}
            </span>
            <span className="category-badge">{prefix ? (ARTICLE_CATEGORIES[prefix] || '—') : '—'}</span>
          </div>
        </td>

        {/* Designation */}
        <td className="cr-col-hide-md">
          <span className="item-designation text-sm text-gray">
            {searchTerm && task.description
              ? highlightMatch(task.description, searchTerm)
              : (task.description || task.title || <span className="text-muted italic">—</span>)}
          </span>
        </td>

        {/* Quantity */}
        <td className="text-center">
          <span className={`qty-badge ${qtyClass}`}>{Number(task.quantity || 0).toLocaleString('fr-FR')}</span>
          <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.15rem' }}>{task.quantity_unit || 'pcs'}</div>
        </td>

        {/* Delivery date */}
        <td>
          {task.planned_date ? (
            <div className="date-wrapper cr-date-wrapper" data-urgency={urgency}>
              <span className="date-icon">
                {urgency === 'overdue' ? '🔴' : urgency === 'critical' ? '🟠' : urgency === 'soon' ? '🟡' : '📅'}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: urgency === 'overdue' ? '#dc2626' : urgency === 'critical' ? '#c2410c' : '#334155' }}>
                  {formatDate(task.planned_date)}
                </div>
                {days !== null && (
                  <div style={{ fontSize: '0.68rem', color: days < 0 ? '#dc2626' : days <= 3 ? '#c2410c' : '#94a3b8', fontWeight: 600 }}>
                    {days < 0 ? `J+${Math.abs(days)} retard` : days === 0 ? "Aujourd'hui" : `J-${days}`}
                  </div>
                )}
              </div>
            </div>
          ) : <span className="text-muted">—</span>}
        </td>

        {/* Stock available */}
        <td className="text-center">
          {task.stock ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
              <span className={`qty-available${task.stock.available <= 0 ? ' empty' : ''}`}>
                {task.stock.available.toLocaleString('fr-FR')}
              </span>
              {task.stock.reserved > 0 && (
                <span className="waiting-badge" title="Réservé par d'autres commandes">
                  -{task.stock.reserved.toLocaleString('fr-FR')} rés.
                </span>
              )}
            </div>
          ) : <span className="text-muted italic">—</span>}
        </td>

        {/* Coverage */}
        <td className="text-center cr-col-hide-sm">
          {pct !== null ? (
            <div className="coverage-wrapper">
              <div className="coverage-bar">
                <div className="coverage-fill" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: coverageColor }} />
              </div>
              <span className="coverage-text" style={{ color: coverageColor }}>{pct}%</span>
            </div>
          ) : <span className="text-muted">—</span>}
        </td>

        {/* Readiness */}
        <td className="cr-col-hide-sm">
          <span className="cr-score-badge" style={{ background: score.color + '15', color: score.color, borderColor: score.color + '40' }}>
            {score.label}
          </span>
        </td>

        {/* Actions */}
        {(canApprove || canManage) && (
          <td className="cr-col-actions" onClick={e => e.stopPropagation()}>
            <div className="cr-quick-actions">
              {canManage && (
                <button type="button" className="por-fix-btn por-fix-btn--edit" title="Corriger la commande" onClick={() => setEditTask(task)}>✎</button>
              )}
              {canApprove && (
                <>
                  <button type="button" className="cr-quick-btn cr-quick-btn--reject" title="Rejeter" onClick={() => handleReject(task.id)} disabled={working}>✕</button>
                  <button type="button" className="cr-quick-btn cr-quick-btn--approve" title="Valider → Production" onClick={() => handleApprove(task.id)} disabled={working}>✓</button>
                </>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  // ── Page title by role ────────────────────────────────────────────────────

  const pageTitle = canManage ? 'Commandes importées'
    : isPlanner ? 'Commandes en cours de validation'
    : 'Mes commandes à valider';
  const pageSubtitle = isPlanner
    ? 'Vue lecture seule — les commandes sont validées par les commerciaux'
    : 'Sélectionnez les commandes à envoyer en production';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={`stock-page-container cr-page-wrap${isDragOver ? ' por-page-wrap--drop' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {canManage && (
        <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportOrders(f); e.target.value = ''; }} />
      )}

      {isDragOver && canManage && (
        <div className="por-drop-overlay">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Déposer le fichier Excel pour importer
        </div>
      )}

      {/* ── Header ── */}
      <div className="stock-page-header">
        <div className="title-section">
          <h2>{pageTitle}</h2>
          <p>
            {loading ? 'Chargement…' : tasks.length === 0
              ? (canManage ? 'Aucune commande — importez un fichier Excel pour commencer' : 'Aucune commande en attente de validation')
              : `${tasks.length} commande${tasks.length !== 1 ? 's' : ''} — ${pageSubtitle}`}
          </p>
        </div>
        <div className="actions-section">
          <div className="stock-search-bar">
            <span className="stock-search-bar__icon" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
              </svg>
            </span>
            <input ref={inputRef} type="text" className="stock-search-bar__input"
              placeholder="Client, référence, commercial… (Entrée)"
              value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKey} />
            {inputValue && <button type="button" className="stock-search-bar__clear" onClick={clearSearch} aria-label="Effacer">×</button>}
            <button type="button" className="stock-search-bar__btn" onClick={applySearch}>Chercher</button>
          </div>

          <div className="stock-filters">
            <select className="filter-select" value={urgencyFilter} onChange={e => { setUrgencyFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">Toutes dates</option>
              <option value="overdue">🔴 En retard</option>
              <option value="critical">🟠 Urgent ≤3j</option>
              <option value="soon">🟡 Proche ≤7j</option>
              <option value="ok">🟢 Normal</option>
            </select>
            <select className="filter-select" value={stockFilter} onChange={e => { setStockFilter(e.target.value); setCurrentPage(1); }}>
              <option value="">Tout le stock</option>
              <option value="ready">✓ Stock dispo.</option>
              <option value="partial">⚠ Stock partiel</option>
              <option value="waiting">⏳ En attente</option>
              <option value="empty">✕ Rupture</option>
            </select>
            {isGrouped && commercialOptions.length > 0 && (
              <select className="filter-select" value={commercialFilter} onChange={e => { setCommercialFilter(e.target.value); setCurrentPage(1); }}>
                <option value="">Tous les commerciaux</option>
                {commercialOptions.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
              </select>
            )}
          </div>

          <div className="buttons-group">
            {canManage && (
              <button type="button" className={`btn btn-secondary${importing ? ' por-btn-loading' : ''}`}
                onClick={() => importInputRef.current?.click()} disabled={importing}
                title="Importer commandes Excel (.xlsx) — ou glisser-déposer">
                {importing
                  ? <><span className="por-spinner" aria-hidden /> Import…</>
                  : <>📥 Importer</>}
              </button>
            )}
            <button className="btn btn-outline" onClick={fetchPending} disabled={loading || working}>↺ Actualiser</button>
          </div>
        </div>
      </div>

      {/* ── Banner ── */}
      {banner && (
        <div className={`cr-banner cr-banner--${banner.type}`}>
          {banner.type === 'success' ? '✓' : '✕'} {banner.message}
        </div>
      )}

      {loading ? <Spinner message="Chargement des commandes..." /> : tasks.length === 0 ? (
        <div className="cr-empty">
          <div className="cr-empty__icon">{canManage ? '📥' : '✓'}</div>
          <strong>{canManage ? 'Aucune commande en attente' : 'Toutes les commandes ont été traitées'}</strong>
          <p>{canManage
            ? 'Importez un fichier Excel ou glissez-le sur cette page.'
            : 'Les nouvelles commandes apparaissent ici après import par l\'administrateur.'}</p>
          {canManage && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => importInputRef.current?.click()}>
              Choisir un fichier…
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Stats strip ── */}
          <div className="stock-stats-strip">
            <div className="stock-stat">
              <strong>{stats.total}</strong>
              <span>commande{stats.total !== 1 ? 's' : ''}</span>
            </div>
            {isGrouped && stats.groups > 0 && (
              <div className="stock-stat">
                <strong>{stats.groups}</strong>
                <span>commercial{stats.groups !== 1 ? 'x' : ''}</span>
              </div>
            )}
            <div className="stock-stat stock-stat--danger">
              <strong>{stats.overdue + stats.critical}</strong>
              <span>urgent{stats.overdue + stats.critical !== 1 ? 'es' : 'e'}</span>
            </div>
            <div className="stock-stat stock-stat--success">
              <strong>{stats.ready}</strong>
              <span>prête{stats.ready !== 1 ? 's' : ''}</span>
            </div>
            <div className="stock-stat stock-stat--warning">
              <strong>{stats.noStock}</strong>
              <span>hors stock</span>
            </div>
            {canManage && stats.anomalies > 0 && (
              <div className="stock-stat stock-stat--danger">
                <strong>{stats.anomalies}</strong>
                <span>⚠ anomalie{stats.anomalies !== 1 ? 's' : ''}</span>
              </div>
            )}
            <div className="stock-stat--divider" />
            <div className="stock-stat">
              <strong>{stats.totalQty.toLocaleString('fr-FR')}</strong>
              <span>pcs total</span>
            </div>
            {hasFilters && (
              <button type="button" className="stock-stats-strip__clear" onClick={clearFilters}>✕ Effacer les filtres</button>
            )}
          </div>

          {/* ── Sticky action bar (approvers only) ── */}
          {canApprove && (
            <div className={`cr-actionbar ${someSelected ? 'cr-actionbar--visible' : ''}`}>
              <div className="cr-actionbar__left">
                <span className="cr-actionbar__count">{selected.size} sélectionnée{selected.size !== 1 ? 's' : ''}</span>
                <button type="button" className="cr-link-btn" onClick={toggleAll}>
                  {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>
              <div className="cr-actionbar__right">
                <button type="button" className="btn btn-outline cr-btn-reject"
                  onClick={() => handleReject([...selected])} disabled={!someSelected || working}>
                  ✕ Rejeter ({selected.size})
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => handleApprove([...selected])} disabled={!someSelected || working}>
                  {working ? 'Traitement…' : `✓ Valider (${selected.size}) → Production`}
                </button>
              </div>
            </div>
          )}

          {/* ── No results ── */}
          {filtered.length === 0 && (
            <div className="cr-empty" style={{ padding: '2rem 1rem' }}>
              <div className="cr-empty__icon" style={{ fontSize: '1.4rem' }}>🔍</div>
              <strong>Aucun résultat</strong>
              <p><button type="button" className="cr-link-btn" onClick={clearFilters}>Effacer les filtres</button></p>
            </div>
          )}

          {/* ── Main listing ── */}
          {cleanTasks.length > 0 && (isGrouped ? (
            groups.map(([key, group]) => (
              <div key={key} className="table-card" style={{ marginBottom: '1.25rem' }}>
                <div className="cr-group-header">
                  <div className="cr-group-header__left">
                    <div className="cr-commercial-avatar">{group.label.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="cr-group-name">{group.label}</div>
                      <div className="cr-group-meta">
                        {group.tasks.length} commande{group.tasks.length !== 1 ? 's' : ''}
                        {' · '}
                        {group.tasks.filter(t => readinessScore(t).level === 'ready').length} prête(s)
                        {' · '}
                        {group.tasks.reduce((s, t) => s + Number(t.quantity || 0), 0).toLocaleString('fr-FR')} pcs
                      </div>
                    </div>
                  </div>
                  {canApprove && (
                    <div className="cr-group-header__right">
                      <button type="button" className="btn btn-outline cr-btn-sm" onClick={() => selectGroup(group.tasks.map(t => t.id))}>
                        Sélectionner le groupe
                      </button>
                      <button type="button" className="btn btn-outline cr-btn-sm cr-btn-reject" onClick={() => handleReject(group.tasks.map(t => t.id))} disabled={working}>
                        ✕ Rejeter tout
                      </button>
                      <button type="button" className="btn btn-secondary cr-btn-sm" onClick={() => handleApprove(group.tasks.map(t => t.id))} disabled={working}>
                        ✓ Valider tout
                      </button>
                    </div>
                  )}
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    {renderTableHead()}
                    <tbody>{group.tasks.map(renderRow)}</tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div className="table-card">
              <div className="table-responsive">
                <table className="data-table">
                  {renderTableHead()}
                  <tbody>{paginatedFlat.map(renderRow)}</tbody>
                </table>
              </div>
              {cleanTasks.length > pageSize && (
                <div className="pagination-container" style={{ justifyContent: 'space-between' }}>
                  <div className="pagination-controls">
                    <select className="page-size-select" value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
                      <option value={15}>15 par page</option>
                      <option value={50}>50 par page</option>
                      <option value={100}>100 par page</option>
                      <option value={10000}>Toutes</option>
                    </select>
                    <span className="page-indicator" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, cleanTasks.length)} sur {cleanTasks.length}
                    </span>
                  </div>
                  {totalPages > 1 && (
                    <div className="pagination-buttons">
                      <button className="btn-page" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</button>
                      <button className="btn-page" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>‹ Préc.</button>
                      <span className="page-indicator">Page {currentPage}/{totalPages}</span>
                      <button className="btn-page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Suiv. ›</button>
                      <button className="btn-page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Detail modal ── */}
      {detailTask && (
        <DetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          working={working}
          canApprove={canApprove}
        />
      )}

      {/* ── Correction d'une commande (super admin) ── */}
      {editTask && (
        <OrderEditModal
          task={editTask}
          commercials={commercialUsers}
          working={editWorking}
          onClose={() => setEditTask(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};

export default OrdersReviewPage;
