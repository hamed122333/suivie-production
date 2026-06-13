import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, taskAPI } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { TASK_STATUS_CONFIG, getDeliveryProgress } from '../constants/task';
import { formatDate, formatLongDate, formatQuantity } from '../utils/formatters';
import Spinner from '../components/Spinner';
import useServerEvents from '../hooks/useServerEvents';
import './DashboardPage.css';

const ACTIVE_STATUSES = new Set(['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED']);
const PIPELINE_STATUSES = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'DONE', 'DELIVERED', 'BLOCKED'];

function isoDay(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function daysUntil(dateStr) {
  const day = isoDay(dateStr);
  if (!day) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(day) - today) / 86400000);
}

function buildStatusBreakdown(tasks) {
  const breakdown = { PENDING_APPROVAL: 0 };
  PIPELINE_STATUSES.forEach((status) => { breakdown[status] = 0; });
  tasks.forEach((task) => {
    const status = task.status || 'TODO';
    breakdown[status] = (breakdown[status] || 0) + 1;
  });
  return breakdown;
}

function buildWeeklyDeliveries(tasks, weeks = 4) {
  const buckets = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(now);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const label = i === 0 ? 'Sem. actuelle' : `S-${i}`;
    buckets.push({ label, start, end, count: 0 });
  }

  tasks
    .filter((t) => t.status === 'DELIVERED')
    .forEach((task) => {
      const day = isoDay(task.updated_at || task.created_at);
      if (!day) return;
      const d = new Date(day);
      buckets.forEach((bucket) => {
        if (d >= bucket.start && d <= bucket.end) bucket.count += 1;
      });
    });

  const max = Math.max(1, ...buckets.map((b) => b.count));
  return buckets.map((b) => ({ ...b, pct: Math.round((b.count / max) * 100) }));
}

function buildCommercialInsights(tasks) {
  const delivered = tasks.filter((t) => t.status === 'DELIVERED');
  const onTime = delivered.filter((t) => {
    const planned = isoDay(t.planned_date);
    const done = isoDay(t.updated_at);
    return planned && done && done <= planned;
  });
  const pendingNegotiation = tasks.filter((t) => t.date_negotiation_status === 'PENDING_COMMERCIAL_REVIEW').length;
  const pendingPartial = tasks.filter((t) => t.partial_preparation_status === 'PENDING_CUSTOMER').length;
  const partialDeliveries = tasks.filter((t) => {
    const p = getDeliveryProgress(t);
    return p?.inProgress;
  });
  const inProduction = tasks.filter((t) => ['TODO', 'IN_PROGRESS', 'WAITING_STOCK'].includes(t.status)).length;
  const readyOrDelivered = tasks.filter((t) => ['DONE', 'DELIVERED'].includes(t.status)).length;

  return {
    onTimeRate: delivered.length > 0 ? Math.round((onTime.length / delivered.length) * 100) : null,
    deliveredCount: delivered.length,
    onTimeCount: onTime.length,
    pendingNegotiation,
    pendingPartial,
    partialDeliveryCount: partialDeliveries.length,
    partialDeliveries,
    inProduction,
    readyOrDelivered,
    actionCount: pendingNegotiation + pendingPartial,
  };
}

const MetricTile = ({ label, value, tone = 'blue', helper, onClick }) => {
  const content = (
    <div className={`dashboard-tile dashboard-tile--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
  if (onClick) {
    return (
      <div
        className="dashboard-tile-action"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
      >
        {content}
      </div>
    );
  }
  return content;
};

const SectionCard = ({ title, badge, badgeTone, action, actionLabel, children }) => (
  <div className="dashboard-card">
    <div className="dashboard-card__header">
      <h3>{title}</h3>
      <div className="dashboard-card__header-right">
        {badge != null && (
          <span className={`dashboard-card__badge${badgeTone ? ` dashboard-card__badge--${badgeTone}` : ''}`}>
            {badge}
          </span>
        )}
        {action && actionLabel && (
          <button type="button" className="dashboard-link" onClick={action}>{actionLabel}</button>
        )}
      </div>
    </div>
    {children}
  </div>
);

const StatusPipeline = ({ breakdown, total }) => {
  if (!total) {
    return <div className="dashboard-list__empty">Aucune commande dans le périmètre sélectionné.</div>;
  }

  return (
    <div className="dash-pipeline">
      {PIPELINE_STATUSES.map((status) => {
        const count = breakdown[status] || 0;
        if (!count) return null;
        const cfg = TASK_STATUS_CONFIG[status];
        const pct = Math.max(4, Math.round((count / total) * 100));
        return (
          <div key={status} className="dash-pipeline__row">
            <span className="dash-pipeline__label" style={{ color: cfg.color }}>{cfg.shortLabel}</span>
            <div className="dash-pipeline__track">
              <div
                className="dash-pipeline__fill"
                style={{ width: `${pct}%`, background: cfg.bg, borderColor: cfg.color }}
              />
            </div>
            <strong className="dash-pipeline__value">{count}</strong>
          </div>
        );
      })}
    </div>
  );
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importBanner, setImportBanner] = useState(null);

  const { workspaceId, loadingWorkspaces, workspaces, refreshWorkspaces, selectWorkspace } = useWorkspace();
  const { isSuperAdmin, isCommercial, isPlanner, isLivreur } = useAuth();
  const importInputRef = useRef(null);
  const bannerTimer = useRef(null);

  const activeWorkspace = workspaces?.find((ws) => String(ws.id) === String(workspaceId));
  const workspaceName = workspaceId === 'all' ? 'Tous les espaces' : activeWorkspace?.name || '';

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const apiWorkspaceId = workspaceId !== 'all' ? workspaceId : null;
      const taskParams = apiWorkspaceId ? { workspaceId: apiWorkspaceId } : {};
      const [statsResponse, tasksResponse] = await Promise.all([
        dashboardAPI.getStats(apiWorkspaceId),
        taskAPI.getAll(taskParams),
      ]);
      setStats(statsResponse.data);
      setAllTasks(tasksResponse.data || []);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (loadingWorkspaces || workspaceId === null) return;
    fetchData(true);
  }, [workspaceId, loadingWorkspaces, fetchData]);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  useServerEvents({
    'stock-updated': () => fetchData(false),
    'tasks-updated': () => fetchData(false),
  });

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const dayPlus7 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const derived = useMemo(() => {
    const tasks = Array.isArray(allTasks) ? allTasks : [];
    const orderCodes = tasks.map((t) => t.order_code).filter(Boolean);
    const statusBreakdown = buildStatusBreakdown(tasks);
    const activeTasks = tasks.filter((t) => ACTIVE_STATUSES.has(t.status));

    const overdue = tasks
      .filter((t) => ACTIVE_STATUSES.has(t.status) && isoDay(t.planned_date) && isoDay(t.planned_date) < todayISO)
      .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)));

    const upcoming = tasks
      .filter((t) => {
        const day = isoDay(t.planned_date);
        return ACTIVE_STATUSES.has(t.status) && day && day >= todayISO && day <= dayPlus7;
      })
      .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)))
      .slice(0, 8);

    const recentTasks = [...tasks]
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 8);

    const waitingStock = tasks.filter((t) => t.status === 'WAITING_STOCK');

    return {
      totalLines: tasks.length,
      totalOrders: new Set(orderCodes).size,
      waitingCount: waitingStock.length,
      waitingTasks: waitingStock.slice(0, 5),
      overdueCount: overdue.length,
      overdueTasks: overdue.slice(0, 5),
      upcomingTasks: upcoming,
      recentTasks,
      statusBreakdown,
      activeCount: activeTasks.length,
      deliveredCount: statusBreakdown.DELIVERED || 0,
      doneCount: statusBreakdown.DONE || 0,
      weeklyDeliveries: buildWeeklyDeliveries(tasks),
      commercialInsights: isCommercial ? buildCommercialInsights(tasks) : null,
    };
  }, [allTasks, todayISO, dayPlus7, isCommercial]);

  const counts = stats?.counts || {};
  const totalTasks = counts.totalTasks || derived.totalLines || 0;
  const finishedCount = (counts.totalDone || 0) + (derived.statusBreakdown.DELIVERED || 0);
  const completionRate = totalTasks > 0 ? Math.round((finishedCount / totalTasks) * 100) : 0;
  const pendingByCommercial = stats?.analytics?.pendingByCommercial || [];
  const categoryBreakdown = stats?.analytics?.categoryBreakdown || {};
  const stockSummary = stats?.analytics?.stockSummary || {};
  const topClients = stats?.analytics?.topClients || [];

  const canImportOrders = Boolean(isSuperAdmin);
  const showStockPanel = !isCommercial && !isLivreur;
  const showCommercialLeaderboard = isSuperAdmin && pendingByCommercial.length > 0;

  const roleSubtitle = useMemo(() => {
    if (isCommercial) return 'Suivi de votre portefeuille client et des actions en attente.';
    if (isPlanner) return 'Vue opérationnelle de la production et des échéances.';
    if (isLivreur) return 'Commandes prêtes à livrer et livraisons récentes.';
    if (isSuperAdmin) return 'Pilotage global de la production, des stocks et des validations.';
    return 'Synthèse de l\'activité de production.';
  }, [isCommercial, isPlanner, isLivreur, isSuperAdmin]);

  const handleImportOrders = async (file) => {
    if (!file || !canImportOrders) return;
    setImporting(true);
    setImportBanner(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await taskAPI.importOrders(formData);
      const importedWorkspaces = response?.data?.workspaces || [];
      const importedCount = response?.data?.imported ?? 0;
      const skippedCount = response?.data?.skipped ?? 0;
      await refreshWorkspaces();
      if (importedWorkspaces.length > 0) selectWorkspace(importedWorkspaces[0].id);
      await fetchData(false);
      const msg = importedCount === 0 && skippedCount > 0
        ? `Aucune nouvelle ligne importée. ${skippedCount} ligne(s) déjà existante(s).`
        : `${importedCount} ligne(s) importée(s).${skippedCount > 0 ? ` ${skippedCount} ignorée(s).` : ''}`;
      setImportBanner({ type: 'success', message: msg });
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setImportBanner(null), 5000);
    } catch (err) {
      setImportBanner({ type: 'error', message: err?.response?.data?.error || 'Erreur lors de l\'import.' });
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <Spinner message="Chargement du tableau de bord…" />;

  return (
    <div className="dashboard">
      {importBanner && (
        <div className={`dashboard-banner dashboard-banner--${importBanner.type}`} role="status">
          <span>{importBanner.type === 'success' ? '✓' : '⚠'} {importBanner.message}</span>
          {importBanner.type === 'success' && (
            <button type="button" className="dashboard-banner__btn" onClick={() => navigate('/kanban')}>Voir le Kanban</button>
          )}
          <button type="button" className="dashboard-banner__close" onClick={() => setImportBanner(null)} aria-label="Fermer">×</button>
        </div>
      )}

      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <div>
            <h1 className="dashboard__title">Tableau de bord</h1>
            <p className="dashboard__subtitle">{roleSubtitle}</p>
          </div>
          {workspaceName && <span className="dashboard__workspace-badge">{workspaceName}</span>}
          <span className="dashboard__date">{formatLongDate()}</span>
        </div>
        <div className="dashboard__header-right">
          {canImportOrders && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="dashboard__file-input"
                onChange={(e) => { handleImportOrders(e.target.files?.[0]); e.target.value = ''; }}
              />
              <button type="button" className="dashboard__btn dashboard__btn--primary" onClick={() => importInputRef.current?.click()} disabled={importing}>
                {importing ? 'Import…' : 'Importer commandes'}
              </button>
            </>
          )}
          {isCommercial && (
            <button type="button" className="dashboard__btn dashboard__btn--primary" onClick={() => navigate('/orders')}>
              Mes commandes
            </button>
          )}
          <button type="button" className="dashboard__btn" onClick={() => navigate('/kanban')}>Kanban</button>
          {showStockPanel && (
            <button type="button" className="dashboard__btn" onClick={() => navigate('/stock')}>Stock</button>
          )}
        </div>
      </header>

      <section className="dashboard__metrics-grid" aria-label="Indicateurs clés">
        {isCommercial ? (
          <>
            <MetricTile label="Mon portefeuille" value={derived.totalLines} tone="sky" onClick={() => navigate('/kanban')} />
            <MetricTile label="En production" value={derived.commercialInsights?.inProduction ?? 0} tone="blue" onClick={() => navigate('/kanban')} />
            <MetricTile label="Prêtes / livrées" value={derived.commercialInsights?.readyOrDelivered ?? 0} tone="green" />
            <MetricTile
              label="Actions requises"
              value={derived.commercialInsights?.actionCount ?? 0}
              tone="purple"
              helper="Dates & partiels"
              onClick={() => navigate('/orders')}
            />
            <MetricTile label="Retards" value={derived.overdueCount} tone="red" onClick={() => navigate('/kanban')} />
            <MetricTile
              label="Livraison à temps"
              value={derived.commercialInsights?.onTimeRate != null ? `${derived.commercialInsights.onTimeRate}%` : '—'}
              tone="green"
              helper={derived.commercialInsights?.deliveredCount
                ? `${derived.commercialInsights.onTimeCount}/${derived.commercialInsights.deliveredCount} livrées`
                : 'Pas encore de livraison'}
            />
          </>
        ) : (
          <>
            <MetricTile label="Commandes" value={derived.totalOrders} tone="sky" helper={`${derived.totalLines} lignes`} />
            <MetricTile label="Actives" value={derived.activeCount} tone="blue" onClick={() => navigate('/kanban')} />
            {isSuperAdmin && (
              <MetricTile label="À valider" value={counts.pendingCount || 0} tone="purple" onClick={() => navigate('/orders')} />
            )}
            <MetricTile label="Hors stock PF" value={derived.waitingCount} tone="amber" onClick={() => navigate('/kanban?status=WAITING_STOCK')} />
            <MetricTile label="Retards" value={derived.overdueCount} tone="red" onClick={() => navigate('/kanban')} />
            <MetricTile label="Taux d'achèvement" value={`${completionRate}%`} tone="green" helper={`${finishedCount}/${totalTasks}`} />
          </>
        )}
      </section>

      <section className="dashboard__main-grid">
        <div className="dashboard__column dashboard__column--main">
          <SectionCard
            title="Échéances — 7 prochains jours"
            badge={derived.upcomingTasks.length}
          >
            <div className="dashboard-list">
              {derived.upcomingTasks.length > 0 ? (
                derived.upcomingTasks.map((task) => {
                  const dayLeft = daysUntil(task.planned_date);
                  const isToday = isoDay(task.planned_date) === todayISO;
                  const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                  return (
                    <div
                      key={task.id}
                      className="dashboard-list__item"
                      onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/kanban?taskId=${task.id}`)}
                    >
                      <div className="dashboard-list__item-content">
                        <span className="dashboard-list__item-title">{task.client_name || task.order_code || '—'}</span>
                        <span className="dashboard-list__item-subtitle">
                          {task.item_reference || '—'} · {formatQuantity(task.quantity)} pcs
                        </span>
                      </div>
                      <div className="dashboard-list__item-meta">
                        <span className="dashboard-pill" style={{ background: status.bg, color: status.color }}>
                          {status.shortLabel}
                        </span>
                        <span className={`dashboard-list__item-date${isToday ? ' dashboard-list__item-date--today' : ''}`}>
                          {isToday ? "Aujourd'hui" : formatDate(task.planned_date)}
                          {dayLeft != null && !isToday ? ` · J${dayLeft >= 0 ? `−${dayLeft}` : `+${Math.abs(dayLeft)}`}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="dashboard-list__empty">Aucune échéance sur les 7 prochains jours.</div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Répartition par statut" badge={derived.totalLines}>
            <StatusPipeline breakdown={derived.statusBreakdown} total={derived.totalLines} />
          </SectionCard>

          <SectionCard title="Activité récente">
            <div className="dashboard-table">
              {derived.recentTasks.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Réf.</th>
                      <th>Client</th>
                      <th>Statut</th>
                      <th>Livraison</th>
                      <th>Mise à jour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.recentTasks.map((task) => {
                      const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                      return (
                        <tr key={task.id} onClick={() => navigate(`/kanban?taskId=${task.id}`)}>
                          <td><strong>SP-{task.id}</strong></td>
                          <td>{task.client_name || '—'}</td>
                          <td>
                            <span className="dashboard-pill" style={{ background: status.bg, color: status.color }}>
                              {status.shortLabel}
                            </span>
                          </td>
                          <td>{formatDate(task.planned_date)}</td>
                          <td className="dashboard-table__muted">{formatDate(task.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="dashboard-list__empty">Aucune activité récente.</div>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="dashboard__column dashboard__column--side">
          {isCommercial && derived.commercialInsights && (
            <>
              <SectionCard
                title="Mes actions en attente"
                badge={derived.commercialInsights.actionCount}
                badgeTone="purple"
                action={() => navigate('/orders')}
                actionLabel="Ouvrir"
              >
                <div className="dashboard-actions">
                  <div className="dashboard-actions__row">
                    <span>Dates à valider</span>
                    <strong>{derived.commercialInsights.pendingNegotiation}</strong>
                  </div>
                  <div className="dashboard-actions__row">
                    <span>Préparations partielles</span>
                    <strong>{derived.commercialInsights.pendingPartial}</strong>
                  </div>
                </div>
              </SectionCard>

              {derived.commercialInsights.partialDeliveryCount > 0 && (
                <SectionCard
                  title="Livraisons partielles en cours"
                  badge={derived.commercialInsights.partialDeliveryCount}
                  badgeTone="green"
                  action={() => navigate('/kanban')}
                  actionLabel="Kanban"
                >
                  <div className="dashboard-list">
                    {derived.commercialInsights.partialDeliveries.map((task) => {
                      const p = getDeliveryProgress(task);
                      return (
                        <div
                          key={task.id}
                          className="dashboard-list__item"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                          onKeyDown={(e) => e.key === 'Enter' && navigate(`/kanban?taskId=${task.id}`)}
                        >
                          <div className="dashboard-list__item-content">
                            <span className="dashboard-list__item-title">{task.title}</span>
                            <span className="dashboard-list__item-subtitle">
                              SP-{task.id} · {p.delivered}/{p.total} livrés ({p.pct} %)
                            </span>
                          </div>
                          <div className="dashboard-list__item-meta">
                            <span className="dashboard-pill" style={{ background: '#dcfce7', color: '#15803d' }}>
                              {p.remaining} pcs restants
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              <SectionCard title="Performance — livraisons (4 sem.)">
                <div className="dash-weekly">
                  {derived.weeklyDeliveries.map((week) => (
                    <div key={week.label} className="dash-weekly__row">
                      <span className="dash-weekly__label">{week.label}</span>
                      <div className="dash-weekly__track">
                        <div className="dash-weekly__fill" style={{ width: `${week.pct}%` }} />
                      </div>
                      <strong>{week.count}</strong>
                    </div>
                  ))}
                </div>
                <p className="dashboard-card__footnote">
                  Volume de commandes passées en « Livré » par semaine (périmètre actuel).
                </p>
              </SectionCard>
            </>
          )}

          {showStockPanel && (
            <SectionCard title="Synthèse stock PF" action={() => navigate('/stock')} actionLabel="Détail">
              <div className="stock-summary">
                <div className="stock-summary__row">
                  <span>Articles référencés</span>
                  <strong>{stockSummary.totalArticles || 0}</strong>
                </div>
                <div className="stock-summary__row stock-summary__row--success">
                  <span>Quantité disponible</span>
                  <strong>{stockSummary.availableQuantity?.toLocaleString('fr-FR') || 0}</strong>
                </div>
                <div className="stock-summary__row stock-summary__row--warning">
                  <span>Quantité réservée</span>
                  <strong>{stockSummary.reservedQuantity?.toLocaleString('fr-FR') || 0}</strong>
                </div>
                <div className="stock-summary__row stock-summary__row--danger">
                  <span>Références sous seuil</span>
                  <strong>{stockSummary.lowStockCount || 0}</strong>
                </div>
              </div>
            </SectionCard>
          )}

          {!isCommercial && (
            <SectionCard title="Flux de production">
              <div className="dash-flow">
                <div className="dash-flow__bar">
                  {[
                    { key: 'WAITING_STOCK', count: counts.totalWaitingStock, cls: 'waiting' },
                    { key: 'TODO', count: counts.totalTodo, cls: 'todo' },
                    { key: 'IN_PROGRESS', count: counts.totalInProgress, cls: 'progress' },
                    { key: 'DONE', count: counts.totalDone, cls: 'done' },
                    { key: 'BLOCKED', count: counts.totalBlocked, cls: 'blocked' },
                  ].map(({ key, count, cls }) => {
                    const cfg = TASK_STATUS_CONFIG[key];
                    return (
                      <div
                        key={key}
                        className={`dash-flow__segment dash-flow__segment--${cls}`}
                        style={{ flex: count || 0.5 }}
                        title={cfg.label}
                      >
                        <strong>{(count || 0).toLocaleString('fr-FR')}</strong>
                        <span>{cfg.shortLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>
          )}

          {showCommercialLeaderboard && (
            <SectionCard title="Validations commerciales en attente" badge={counts.pendingCount} badgeTone="purple" action={() => navigate('/orders')} actionLabel="Gérer">
              <div className="dashboard-list">
                {pendingByCommercial.map((c) => (
                  <div key={c.cid} className="dashboard-list__item" onClick={() => navigate('/orders')} role="button" tabIndex={0}>
                    <div className="dashboard-list__item-content">
                      <span className="dashboard-list__item-title">{c.cname}</span>
                      {c.cid !== '__none__' && <span className="dashboard-list__item-subtitle">{c.cid}</span>}
                    </div>
                    <span className="dash-badge-count">{c.count}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {topClients.length > 0 && (
            <SectionCard title={isCommercial ? 'Mes clients principaux' : 'Clients les plus actifs'}>
              <div className="dashboard-list">
                {topClients.map((client) => (
                  <div key={client.name} className="dashboard-list__item dashboard-list__item--static">
                    <div className="dashboard-list__item-content">
                      <span className="dashboard-list__item-title">{client.name}</span>
                    </div>
                    <span className="dash-badge-count">{client.count}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Répartition par famille article">
            <div className="dash-categories">
              {Object.entries(categoryBreakdown).filter(([, n]) => n > 0).map(([cat, n]) => {
                const total = Object.values(categoryBreakdown).reduce((s, v) => s + v, 0);
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                return (
                  <div key={cat} className="dash-cat">
                    <div className="dash-cat__head">
                      <span className={`article-badge article-badge--${cat.toLowerCase()}`}>{cat}</span>
                      <strong>{n}</strong>
                      <span className="dash-cat__pct">{pct}%</span>
                    </div>
                    <div className="dash-cat__bar"><div className="dash-cat__fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Alertes — hors stock PF" badge={derived.waitingCount} badgeTone="amber">
            <div className="dashboard-list">
              {derived.waitingTasks.length > 0 ? (
                derived.waitingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="dashboard-list__item dashboard-list__item--warning"
                    onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="dashboard-list__item-content">
                      <span className="dashboard-list__item-title">{task.client_name || task.order_code || '—'}</span>
                      <span className="dashboard-list__item-subtitle">
                        {task.item_reference || '—'} · {formatQuantity(task.quantity)} pcs
                      </span>
                    </div>
                    {task.stock_deficit != null && (
                      <span className="dashboard-list__item-deficit">−{task.stock_deficit}</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="dashboard-list__empty">Couverture stock PF satisfaisante.</div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Alertes — retards" badge={derived.overdueCount} badgeTone="red">
            <div className="dashboard-list">
              {derived.overdueTasks.length > 0 ? (
                derived.overdueTasks.map((task) => {
                  const late = Math.abs(daysUntil(task.planned_date) || 0);
                  return (
                    <div
                      key={task.id}
                      className="dashboard-list__item dashboard-list__item--danger"
                      onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="dashboard-list__item-content">
                        <span className="dashboard-list__item-title">{task.client_name || task.order_code || '—'}</span>
                        <span className="dashboard-list__item-subtitle">{formatDate(task.planned_date)}</span>
                      </div>
                      <span className="dashboard-list__item-deficit">{late}j</span>
                    </div>
                  );
                })
              ) : (
                <div className="dashboard-list__empty">Aucun retard sur le périmètre actuel.</div>
              )}
            </div>
          </SectionCard>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
