import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { taskAPI } from '../services/api';
import { formatDate } from '../utils/formatters';
import Spinner from '../components/Spinner';
import useServerEvents from '../hooks/useServerEvents';
import './PendingOrdersPage.css';

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

function taskAnomalies(task) {
  const issues = [];
  if (!task.commercial_id) {
    issues.push({ type: 'no_commercial', label: 'Commercial non renseigné', severity: 'error' });
  } else if (!task.commercial_name) {
    issues.push({ type: 'unresolved_commercial', label: `Commercial ${task.commercial_id} introuvable`, severity: 'warning' });
  }
  if (!task.client_name && !task.order_code) {
    issues.push({ type: 'no_client', label: 'Client non identifié', severity: 'warning' });
  }
  if (!task.planned_date) {
    issues.push({ type: 'no_date', label: 'Date de livraison manquante', severity: 'warning' });
  }
  return issues;
}

const PendingOrdersPage = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commercialFilter, setCommercialFilter] = useState('');

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taskAPI.getPendingApproval();
      setTasks(res.data || []);
    } catch (err) {
      console.error('getPendingApproval failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useServerEvents({ 'tasks-updated': fetchPending });

  // Attach anomalies to each task
  const tasksWithAnomalies = useMemo(() => {
    return tasks.map(t => ({ ...t, _anomalies: taskAnomalies(t) }));
  }, [tasks]);

  // Separate anomalous tasks
  const anomalousTasks = useMemo(() => {
    return tasksWithAnomalies.filter(t => t._anomalies.length > 0);
  }, [tasksWithAnomalies]);

  const cleanTasks = useMemo(() => {
    return tasksWithAnomalies.filter(t => t._anomalies.length === 0);
  }, [tasksWithAnomalies]);

  // Distinct commercial options for the filter dropdown
  const commercialOptions = useMemo(() => {
    const map = {};
    for (const task of tasks) {
      if (!task.commercial_id) continue;
      if (!map[task.commercial_id]) {
        map[task.commercial_id] = {
          id: task.commercial_id,
          name: task.commercial_name || task.commercial_id,
        };
      }
    }
    return Object.values(map).sort((a, b) => a.id.localeCompare(b.id));
  }, [tasks]);

  // Filtered anomalous tasks
  const filteredAnomalous = useMemo(() => {
    if (!commercialFilter) return anomalousTasks;
    if (commercialFilter === '__anomalies__') return anomalousTasks;
    return anomalousTasks.filter(t => t.commercial_id === commercialFilter);
  }, [anomalousTasks, commercialFilter]);

  // Group clean tasks by commercial
  const groupedByCommercial = useMemo(() => {
    const map = {};
    const source = commercialFilter ? cleanTasks.filter(t => t.commercial_id === commercialFilter) : cleanTasks;
    for (const task of source) {
      const key = task.commercial_id || '__none__';
      if (!map[key]) {
        map[key] = {
          commercialId: task.commercial_id || null,
          commercialName: task.commercial_name || 'Commercial inconnu',
          tasks: [],
        };
      }
      map[key].tasks.push(task);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cleanTasks, commercialFilter]);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      anomalies: anomalousTasks.length,
      clean: cleanTasks.length,
      filtered: commercialFilter ? filteredAnomalous.length + groupedByCommercial.reduce((s, g) => s + g[1].tasks.length, 0) : null,
      commercials: groupedByCommercial.length,
      overdue: tasks.filter(t => urgencyLevel(t) === 'overdue').length,
    };
  }, [tasks, anomalousTasks, cleanTasks, groupedByCommercial, commercialFilter, filteredAnomalous]);

  if (loading) return <Spinner message="Chargement des commandes…" />;

  return (
    <div className="stock-page-container por-page-wrap">
      <div className="stock-page-header">
        <div className="title-section">
          <h2>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Commandes importées
          </h2>
          <p>Suivi des commandes en attente de validation commerciale</p>
        </div>
      </div>

      {tasks.length === 0 && !loading && (
        <div className="cr-empty">
          <strong>Aucune commande en attente</strong>
          <p>Toutes les commandes importées ont été validées ou supprimées.</p>
        </div>
      )}

      {tasks.length > 0 && (
        <>
          <div className="por-stats">
            <div className="por-stat">
              <strong>{stats.total}</strong>
              <span>Total commandes</span>
            </div>
            <div className="por-stat por-stat--warn">
              <strong>{stats.anomalies}</strong>
              <span>Avec anomalies</span>
            </div>
            <div className="por-stat por-stat--ok">
              <strong>{stats.clean}</strong>
              <span>Sans anomalie</span>
            </div>
            <div className="por-stat">
              <strong>{stats.commercials}</strong>
              <span>Commerciaux</span>
            </div>
            <div className="por-stat por-stat--alert">
              <strong>{stats.overdue}</strong>
              <span>En retard</span>
            </div>
            <div className="por-filter">
              <select className="filter-select" value={commercialFilter} onChange={e => setCommercialFilter(e.target.value)}>
                <option value="">Tous les commerciaux</option>
                {anomalousTasks.length > 0 && <option value="__anomalies__">Anomalies ({anomalousTasks.length})</option>}
                {commercialOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                ))}
              </select>
            </div>
          </div>

          {filteredAnomalous.length > 0 && (
            <section className="por-section">
              <div className="por-section__head">
                <h3>Commandes avec anomalies</h3>
                <span className="por-badge por-badge--warn">{filteredAnomalous.length}</span>
              </div>
              <table className="data-table por-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Client / Code</th>
                    <th>Commercial</th>
                    <th>Quantité</th>
                    <th>Date livraison</th>
                    <th>Anomalies</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalous.map(task => {
                    const prefix = getPrefix(task.item_reference);
                    const urgency = urgencyLevel(task);
                    const anomalies = task._anomalies;
                    return (
                      <tr key={task.id} className="por-row por-row--anomaly">
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {prefix && <div className={`article-badge article-badge--${prefix.toLowerCase()}`}>{prefix}</div>}
                            <span className="cr-mono">{task.item_reference || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="article-info">
                            <span className="article-name">{task.client_name || task.order_code || '—'}</span>
                            {task.order_code && task.client_name && <span className="article-subtext">{task.order_code}</span>}
                          </div>
                        </td>
                        <td>
                          {task.commercial_id ? (
                            <span className="por-commercial-tag">
                              {task.commercial_name || `${task.commercial_id} (introuvable)`}
                            </span>
                          ) : (
                            <span className="por-missing">Non renseigné</span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className="qty-badge">{Number(task.quantity || 0).toLocaleString('fr-FR')}</span>
                        </td>
                        <td>
                          {task.planned_date ? (
                            <div className={`date-wrapper cr-date-wrapper`} data-urgency={urgency}>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{formatDate(task.planned_date)}</div>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {anomalies.map((a, i) => (
                              <span key={i} className={`por-anomaly-tag por-anomaly-tag--${a.severity}`}>
                                {a.label}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {groupedByCommercial.map(([key, group]) => (
            <section key={key} className="por-section">
              <div className="por-section__head">
                <div className="por-section__head-left">
                  <h3>{group.commercialName}</h3>
                  {group.commercialId && (
                    <span className="por-commercial-id">{group.commercialId}</span>
                  )}
                </div>
                <span className="por-badge">{group.tasks.length} commande{group.tasks.length > 1 ? 's' : ''}</span>
              </div>
              <table className="data-table por-table">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Client / Code</th>
                    <th>Désignation</th>
                    <th>Quantité</th>
                    <th>Date livraison</th>
                    <th>Stock dispo.</th>
                    <th>Couverture</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map(task => {
                    const prefix = getPrefix(task.item_reference);
                    const urgency = urgencyLevel(task);
                    const days = daysUntil(task.planned_date);
                    const qty = Number(task.quantity || 0);
                    const avail = task.stock?.available ?? 0;
                    const pct = task.stock && qty > 0 ? Math.min(200, Math.round((avail / qty) * 100)) : null;
                    const pctColor = pct === null ? '#94a3b8' : pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

                    let statusLabel = '—';
                    let statusColor = '#94a3b8';
                    if (!task.stock) {
                      statusLabel = 'Stock inconnu';
                      statusColor = '#94a3b8';
                    } else if (!task.stock.isReady) {
                      statusLabel = 'En préparation';
                      statusColor = '#d97706';
                    } else if (avail <= 0) {
                      statusLabel = 'Rupture';
                      statusColor = '#dc2626';
                    } else if (avail < qty) {
                      statusLabel = 'Partiel';
                      statusColor = '#f59e0b';
                    } else {
                      statusLabel = 'Disponible';
                      statusColor = '#16a34a';
                    }

                    return (
                      <tr key={task.id} className={`por-row ${urgency === 'overdue' ? 'cr-row--overdue' : ''} ${urgency === 'critical' ? 'cr-row--critical' : ''}`}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {prefix && <div className={`article-badge article-badge--${prefix.toLowerCase()}`}>{prefix}</div>}
                            <div className="article-info">
                              <span className="article-name">{task.item_reference || '—'}</span>
                              <span className="article-subtext">{prefix ? (ARTICLE_CATEGORIES[prefix] || '—') : '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="article-info">
                            <span className="article-name">{task.client_name || task.order_code || '—'}</span>
                            {task.order_code && task.client_name && <span className="article-subtext">{task.order_code}</span>}
                          </div>
                        </td>
                        <td>
                          <span className="text-sm text-gray">{task.description || task.title || '—'}</span>
                        </td>
                        <td className="text-center">
                          <span className="qty-badge">{qty.toLocaleString('fr-FR')}</span>
                          <div className="text-sm text-gray">{task.quantity_unit || 'pcs'}</div>
                        </td>
                        <td>
                          {task.planned_date ? (
                            <div className={`date-wrapper cr-date-wrapper`} data-urgency={urgency}>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: urgency === 'overdue' ? '#dc2626' : urgency === 'critical' ? '#c2410c' : '#334155' }}>
                                {formatDate(task.planned_date)}
                              </div>
                              {days !== null && (
                                <div style={{ fontSize: '0.68rem', color: days < 0 ? '#dc2626' : days <= 3 ? '#c2410c' : '#94a3b8' }}>
                                  {days < 0 ? `J+${Math.abs(days)}` : days === 0 ? 'Aujourd\'hui' : `J-${days}`}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="text-center">
                          {task.stock ? (
                            <span className={`qty-available${avail <= 0 ? ' empty' : ''}`}>
                              {avail.toLocaleString('fr-FR')}
                            </span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td className="text-center">
                          {pct !== null ? (
                            <div className="coverage-wrapper">
                              <div className="coverage-bar">
                                <div className="coverage-fill" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: pctColor }} />
                              </div>
                              <span className="coverage-text" style={{ color: pctColor }}>{pct}%</span>
                            </div>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <span className="cr-score-badge" style={{ background: statusColor + '15', color: statusColor, borderColor: statusColor + '40' }}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  );
};

export default PendingOrdersPage;
