import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { taskAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';
import Spinner from '../components/Spinner';
import useServerEvents from '../hooks/useServerEvents';
import './CommercialReviewPage.css';

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
  if (d < 0)       return 'overdue';   // red
  if (d <= 3)      return 'critical';  // orange
  if (d <= 7)      return 'soon';      // yellow
  return 'ok';
}

// "Readiness" = can this order be sent to production right now?
function readinessScore(task) {
  const qty   = Number(task.quantity || 0);
  const avail = task.stock?.available ?? 0;
  const ready = task.stock?.isReady ?? false;
  const days  = daysUntil(task.planned_date);

  if (!task.stock)       return { level: 'unknown', label: '— Inconnu',       color: '#94a3b8' };
  if (!ready)            return { level: 'waiting', label: '⏳ Stock en attente', color: '#d97706' };
  if (avail <= 0)        return { level: 'empty',   label: '✕ Rupture stock',  color: '#dc2626' };
  if (avail < qty)       return { level: 'partial', label: '⚠ Stock partiel',  color: '#f59e0b' };
  if (days !== null && days < 0) return { level: 'late', label: '🔴 En retard', color: '#dc2626' };
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

function DetailModal({ task, onClose, onApprove, onReject, working }) {
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

        {/* ── Modal header ── */}
        <div className="cr-modal__head">
          <div className="cr-modal__head-left">
            {prefix && (
              <div className={`article-badge article-badge--${prefix.toLowerCase()} cr-modal__badge`}>
                {prefix}
              </div>
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

        {/* ── Two columns ── */}
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

            {/* Date delivery — prominent */}
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

                {/* Coverage bar */}
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

        {/* ── Footer ── */}
        <div className="cr-modal__foot">
          <button type="button" className="btn btn-outline cr-btn-modal-reject" onClick={() => onReject(task.id)} disabled={working}>
            ✕ Rejeter cette commande
          </button>
          <button type="button" className="btn btn-secondary cr-btn-modal-approve" onClick={() => onApprove(task.id)} disabled={working}>
            {working ? 'Traitement…' : '✓ Valider → Production'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const CommercialReviewPage = () => {
  const { user } = useAuth();
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(new Set());
  const [working, setWorking]     = useState(false);
  const [banner, setBanner]       = useState(null);      // { type, message }
  const [detailTask, setDetailTask] = useState(null);

  // Toolbar
  const [inputValue, setInputValue]     = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [stockFilter, setStockFilter]   = useState('');
  const [sortConfig, setSortConfig]     = useState({ key: 'date', dir: 'asc' });
  const [currentPage, setCurrentPage]   = useState(1);
  const [pageSize, setPageSize]         = useState(50);
  const inputRef    = useRef(null);
  const bannerTimer = useRef(null);

  const isPrivileged = ['super_admin', 'planner'].includes(user?.role);

  // ── Data ──────────────────────────────────────────────────────────────────

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taskAPI.getPendingApproval();
      setTasks(res.data || []);
      setSelected(new Set());
    } catch (err) {
      console.error('getPendingApproval failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Real-time refresh when the planner approves/rejects from the kanban side
  useServerEvents({ 'tasks-updated': fetchPending });

  const showBanner = (type, message) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ type, message });
    bannerTimer.current = setTimeout(() => setBanner(null), 6000);
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleApprove = async (idOrIds) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (!ids.length) return;
    setWorking(true);
    try {
      const res = await taskAPI.approveOrders(ids);
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
        (t.client_name      || '').toLowerCase().includes(q) ||
        (t.item_reference   || '').toLowerCase().includes(q) ||
        (t.order_code       || '').toLowerCase().includes(q) ||
        (t.commercial_name  || '').toLowerCase().includes(q) ||
        (t.commercial_id    || '').toLowerCase().includes(q) ||
        (t.description || t.title || '').toLowerCase().includes(q)
      );
    }

    if (urgencyFilter) {
      items = items.filter(t => urgencyLevel(t) === urgencyFilter);
    }

    if (stockFilter === 'ready')   items = items.filter(t => t.stock?.available > 0 && t.stock?.isReady);
    if (stockFilter === 'partial') items = items.filter(t => t.stock?.available > 0 && t.stock.available < Number(t.quantity || 0));
    if (stockFilter === 'waiting') items = items.filter(t => t.stock && !t.stock.isReady);
    if (stockFilter === 'empty')   items = items.filter(t => !t.stock || t.stock.available <= 0);

    // Sort
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
  }, [tasks, searchTerm, urgencyFilter, stockFilter, sortConfig]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const t = tasks;
    return {
      total:    t.length,
      overdue:  t.filter(x => urgencyLevel(x) === 'overdue').length,
      critical: t.filter(x => urgencyLevel(x) === 'critical').length,
      ready:    t.filter(x => readinessScore(x).level === 'ready').length,
      noStock:  t.filter(x => ['empty','waiting'].includes(readinessScore(x).level)).length,
      totalQty: t.reduce((s, x) => s + Number(x.quantity || 0), 0),
      groups:   new Set(t.map(x => x.commercial_id).filter(Boolean)).size,
    };
  }, [tasks]);

  // ── Groups (admin/planner) ────────────────────────────────────────────────

  const groups = useMemo(() => {
    const map = {};
    for (const task of filtered) {
      const key = task.commercial_id || '__none__';
      if (!map[key]) map[key] = { label: task.commercial_name || task.commercial_id || '—', tasks: [] };
      map[key].tasks.push(task);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // ── Pagination (single flat list for commercial, grouped stays full) ──────

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedFlat = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── Selection helpers ─────────────────────────────────────────────────────

  const allVisibleIds  = filtered.map(t => t.id);
  const allSelected    = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const someSelected   = selected.size > 0;

  const toggleAll  = () => setSelected(allSelected ? new Set() : new Set(allVisibleIds));
  const toggleOne  = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectGroup = (ids) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });

  const requestSort = (key) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    setCurrentPage(1);
  };

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="sort-icon-hidden">↕</span>;
    return sortConfig.dir === 'asc' ? '↑' : '↓';
  };

  const hasFilters = searchTerm || urgencyFilter || stockFilter;
  const clearFilters = () => { clearSearch(); setUrgencyFilter(''); setStockFilter(''); };

  // ─────────────────────────────────────────────────────────────────────────
  // Row renderer (shared between grouped and flat views)
  // ─────────────────────────────────────────────────────────────────────────

  const renderRow = (task) => {
    const prefix   = getPrefix(task.item_reference);
    const isChecked = selected.has(task.id);
    const urgency  = urgencyLevel(task);
    const days     = daysUntil(task.planned_date);
    const score    = readinessScore(task);
    const pct      = coveragePct(task.stock, Number(task.quantity || 0));
    const coverageColor = pct === null ? '#94a3b8' : pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

    const qtyClass = !task.stock ? '' : pct >= 100 ? 'status-full' : pct >= 50 ? 'status-partial' : 'status-empty';

    return (
      <tr
        key={task.id}
        className={[
          'cr-row',
          isChecked     ? 'cr-row--checked'  : '',
          urgency === 'overdue'  ? 'cr-row--overdue'  : '',
          urgency === 'critical' ? 'cr-row--critical' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setDetailTask(task)}
      >
        {/* Checkbox */}
        <td className="cr-col-check" onClick={e => { e.stopPropagation(); toggleOne(task.id); }}>
          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(task.id)} />
        </td>

        {/* Article badge + client */}
        <td>
          <div className="item-article">
            {prefix
              ? <div className={`article-badge article-badge--${prefix.toLowerCase()}`}>{prefix}</div>
              : <div className="article-badge article-badge--default">??</div>
            }
            <div className="article-info">
              <span className="article-name">
                {searchTerm ? highlightMatch(task.client_name || '—', searchTerm) : (task.client_name || '—')}
              </span>
              {task.order_code && <span className="article-subtext">{task.order_code}</span>}
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
          <span className={`qty-badge ${qtyClass}`}>
            {Number(task.quantity || 0).toLocaleString('fr-FR')}
          </span>
          <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.15rem' }}>{task.quantity_unit || 'pcs'}</div>
        </td>

        {/* Delivery date */}
        <td>
          {task.planned_date ? (
            <div className="date-wrapper cr-date-wrapper" data-urgency={urgency}>
              <span className="date-icon">
                {urgency === 'overdue'  ? '🔴' :
                 urgency === 'critical' ? '🟠' :
                 urgency === 'soon'     ? '🟡' : '📅'}
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

        {/* Coverage bar */}
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

        {/* Readiness score */}
        <td className="cr-col-hide-sm">
          <span className="cr-score-badge" style={{ background: score.color + '15', color: score.color, borderColor: score.color + '40' }}>
            {score.label}
          </span>
        </td>

        {/* Quick actions (visible on hover) */}
        <td className="cr-col-actions" onClick={e => e.stopPropagation()}>
          <div className="cr-quick-actions">
            <button type="button" className="cr-quick-btn cr-quick-btn--reject"
              title="Rejeter" onClick={() => handleReject(task.id)} disabled={working}>✕</button>
            <button type="button" className="cr-quick-btn cr-quick-btn--approve"
              title="Valider → Production" onClick={() => handleApprove(task.id)} disabled={working}>✓</button>
          </div>
        </td>
      </tr>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="stock-page-container cr-page-wrap">

      {/* ── Page header ── */}
      <div className="stock-page-header">
        <div className="title-section">
          <h2>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}>
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Mes commandes à valider</h2>
          <p>
            {loading ? 'Chargement…' : tasks.length === 0
              ? 'Aucune commande en attente de validation'
              : `${tasks.length} commande${tasks.length !== 1 ? 's' : ''} importée${tasks.length !== 1 ? 's' : ''} — sélectionnez celles à envoyer en production`}
          </p>
        </div>
        <div className="actions-section">
          {/* Search */}
          <div className="stock-search-bar">
            <span className="stock-search-bar__icon" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              className="stock-search-bar__input"
              placeholder="Client, référence, commercial… (Entrée)"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKey}
            />
            {inputValue && (
              <button type="button" className="stock-search-bar__clear" onClick={clearSearch} aria-label="Effacer">×</button>
            )}
            <button type="button" className="stock-search-bar__btn" onClick={applySearch}>Chercher</button>
          </div>

          {/* Filters */}
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
          </div>

          <div className="buttons-group">
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

        /* ── Empty state ── */
        <div className="cr-empty">
          <div className="cr-empty__icon">✓</div>
          <strong>Toutes les commandes ont été traitées</strong>
          <p>Les nouvelles commandes apparaissent ici après import par l'administrateur.</p>
        </div>

      ) : (
        <>
          {/* ── Stats strip ── */}
          <div className="stock-stats-strip">
            <div className="stock-stat">
              <strong>{stats.total}</strong>
              <span>commande{stats.total !== 1 ? 's' : ''}</span>
            </div>
            {isPrivileged && stats.groups > 0 && (
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
            <div className="stock-stat--divider" />
            <div className="stock-stat">
              <strong>{stats.totalQty.toLocaleString('fr-FR')}</strong>
              <span>pcs total</span>
            </div>
            {hasFilters && (
              <button type="button" className="stock-stats-strip__clear" onClick={clearFilters}>
                ✕ Effacer les filtres
              </button>
            )}
          </div>

          {/* ── Sticky action bar (appears when rows selected) ── */}
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

          {/* ── No results after filter ── */}
          {filtered.length === 0 && (
            <div className="cr-empty" style={{ padding: '2rem 1rem' }}>
              <div className="cr-empty__icon" style={{ fontSize: '1.4rem' }}>🔍</div>
              <strong>Aucun résultat</strong>
              <p><button type="button" className="cr-link-btn" onClick={clearFilters}>Effacer les filtres</button></p>
            </div>
          )}

          {/* ── Table(s) ── */}
          {filtered.length > 0 && (isPrivileged ? (

            /* Admin / planner: one table per commercial group */
            groups.map(([key, group]) => (
              <div key={key} className="table-card" style={{ marginBottom: '1.25rem' }}>
                {/* Group header */}
                <div className="cr-group-header">
                  <div className="cr-group-header__left">
                    <div className="cr-commercial-avatar">
                      {group.label.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="cr-group-name">{group.label}</div>
                      <div className="cr-group-meta">
                        {group.tasks.length} commande{group.tasks.length !== 1 ? 's' : ''}
                        {' · '}
                        {group.tasks.filter(t => readinessScore(t).level === 'ready').length} prête{group.tasks.filter(t => readinessScore(t).level === 'ready').length !== 1 ? 's' : ''}
                        {' · '}
                        {group.tasks.reduce((s, t) => s + Number(t.quantity || 0), 0).toLocaleString('fr-FR')} pcs
                      </div>
                    </div>
                  </div>
                  <div className="cr-group-header__right">
                    <button type="button" className="btn btn-outline cr-btn-sm"
                      onClick={() => selectGroup(group.tasks.map(t => t.id))}>
                      Sélectionner le groupe
                    </button>
                    <button type="button" className="btn btn-outline cr-btn-sm cr-btn-reject"
                      onClick={() => handleReject(group.tasks.map(t => t.id))} disabled={working}>
                      ✕ Rejeter tout
                    </button>
                    <button type="button" className="btn btn-secondary cr-btn-sm"
                      onClick={() => handleApprove(group.tasks.map(t => t.id))} disabled={working}>
                      ✓ Valider tout
                    </button>
                  </div>
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

            /* Commercial: flat table with pagination */
            <div className="table-card">
              <div className="table-responsive">
                <table className="data-table">
                  {renderTableHead()}
                  <tbody>{paginatedFlat.map(renderRow)}</tbody>
                </table>
              </div>

              {/* Pagination */}
              {filtered.length > pageSize && (
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
                      {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filtered.length)} sur {filtered.length}
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
        />
      )}
    </div>
  );

  function renderTableHead() {
    return (
      <thead>
        <tr>
          <th className="cr-col-check">
            <input type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              title="Tout sélectionner"
            />
          </th>
          <th className="sortable-header" onClick={() => requestSort('client')}>
            Client / Commande {sortIcon('client')}
          </th>
          <th className="sortable-header" onClick={() => requestSort('ref')}>
            Référence {sortIcon('ref')}
          </th>
          <th className="cr-col-hide-md">Désignation</th>
          <th className="text-center sortable-header" onClick={() => requestSort('qty')}>
            Quantité {sortIcon('qty')}
          </th>
          <th className="sortable-header" onClick={() => requestSort('date')}>
            Date livraison {sortIcon('date')}
          </th>
          <th className="text-center">Stock dispo.</th>
          <th className="text-center sortable-header cr-col-hide-sm" onClick={() => requestSort('coverage')}>
            Couverture {sortIcon('coverage')}
          </th>
          <th className="cr-col-hide-sm">Statut</th>
          <th style={{ width: 80 }}></th>
        </tr>
      </thead>
    );
  }
};

export default CommercialReviewPage;
