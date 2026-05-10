import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dashboardAPI, taskAPI } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { TASK_STATUS_CONFIG } from '../constants/task';
import { formatDate, formatLongDate } from '../utils/formatters';
import Spinner from '../components/Spinner';
import { useNavigate } from 'react-router-dom';
import useServerEvents from '../hooks/useServerEvents';
import './DashboardPage.css';

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
      <div className="dashboard-tile-action" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
        {content}
      </div>
    );
  }
  return content;
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importBanner, setImportBanner] = useState(null);

  const { workspaceId, loadingWorkspaces, workspaces, refreshWorkspaces, selectWorkspace } = useWorkspace();
  const { isCommercial } = useAuth();
  const importInputRef = useRef(null);

  const activeWorkspace = workspaces?.find((workspace) => String(workspace.id) === String(workspaceId));
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
      setRecentTasks(
        [...tasksResponse.data]
          .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime())
          .slice(0, 6)
      );
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

  useServerEvents({
    'stock-updated': () => fetchData(false),
    'tasks-updated': () => fetchData(false),
  });

  const counts = stats?.counts || {};
  const totalTasks = counts.totalTasks || 0;
  const completionRate = totalTasks > 0 ? Math.round(((counts.totalDone || 0) / totalTasks) * 100) : 0;
  const todayISO = new Date().toISOString().slice(0, 10);

  const dayPlus7 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const derived = useMemo(() => {
    const tasks = Array.isArray(allTasks) ? allTasks : [];
    const orderCodes = tasks.map((t) => t.order_code).filter(Boolean);
    const uniqueOrders = new Set(orderCodes);
    const waiting = tasks.filter((t) => t.status === 'WAITING_STOCK');

    const overdue = tasks.filter(
      (t) => t.status !== 'DONE' && t.planned_date && String(t.planned_date).slice(0, 10) < todayISO
    ).sort((a, b) => String(a.planned_date || '').localeCompare(String(b.planned_date || '')));

    const upcoming = tasks
      .filter((t) => t.status !== 'DONE' && t.planned_date && String(t.planned_date).slice(0, 10) >= todayISO && String(t.planned_date).slice(0, 10) <= dayPlus7)
      .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)))
      .slice(0, 8);

    return {
      totalLines: tasks.length,
      totalOrders: uniqueOrders.size,
      waitingCount: waiting.length,
      overdueCount: overdue.length,
      overdueTasks: overdue.slice(0, 5),
      upcomingTasks: upcoming,
    };
  }, [allTasks, todayISO, dayPlus7]);

  const stockSummary = stats?.analytics?.stockSummary || {};

  const canImportOrders = Boolean(isCommercial);

  const handleImportOrders = async (file) => {
    if (!file || !canImportOrders) return;
    setImporting(true);
    setImportBanner(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await taskAPI.importOrders(formData);
      const importedWorkspaces = response?.data?.workspaces || [];
      const importedCount = response?.data?.imported ?? '?';
      await refreshWorkspaces();
      if (importedWorkspaces.length > 0) selectWorkspace(importedWorkspaces[0].id);
      await fetchData(false);
      setImportBanner({ type: 'success', message: `${importedCount} ligne(s) importee(s)` });
      setTimeout(() => setImportBanner(null), 5000);
    } catch (err) {
      setImportBanner({ type: 'error', message: err?.response?.data?.error || 'Erreur import' });
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <Spinner message="Chargement..." />;

  return (
    <div className="dashboard">
      {importBanner && (
        <div className={`dashboard-banner dashboard-banner--${importBanner.type}`}>
          <span>{importBanner.type === 'success' ? '✓' : '⚠'} {importBanner.message}</span>
          {importBanner.type === 'success' && (
            <button className="dashboard-banner__btn" onClick={() => navigate('/kanban')}>Voir</button>
          )}
          <button className="dashboard-banner__close" onClick={() => setImportBanner(null)}>✕</button>
        </div>
      )}

      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <h1 className="dashboard__title">Dashboard</h1>
          {workspaceName && <span className="dashboard__workspace-badge">{workspaceName}</span>}
          <span className="dashboard__date">{formatLongDate()}</span>
        </div>
        <div className="dashboard__header-right">
          {canImportOrders && (
            <>
              <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { handleImportOrders(e.target.files?.[0]); e.target.value = ''; }} />
              <button className="dashboard__btn dashboard__btn--primary" onClick={() => importInputRef.current?.click()} disabled={importing}>
                {importing ? '...' : '+ Import'}
              </button>
            </>
          )}
          <button className="dashboard__btn" onClick={() => navigate('/kanban')}>Kanban</button>
          <button className="dashboard__btn" onClick={() => navigate('/stock')}>Stock</button>
        </div>
      </header>

      <section className="dashboard__metrics-grid">
        <MetricTile label="Total" value={derived.totalLines} tone="blue" onClick={() => navigate('/kanban')} />
        <MetricTile label="Commandes" value={derived.totalOrders} tone="sky" />
        <MetricTile label="Hors stock" value={derived.waitingCount} tone="amber" onClick={() => navigate('/kanban?status=WAITING_STOCK')} />
        <MetricTile label="Retards" value={derived.overdueCount} tone="red" onClick={() => navigate('/kanban')} />
        <MetricTile label="Termine" value={`${completionRate}%`} tone="green" helper={`${counts.totalDone || 0}/${totalTasks}`} />
      </section>

      <section className="dashboard__main-grid">
        <div className="dashboard__column dashboard__column--main">
          <div className="dashboard-card">
            <div className="dashboard-card__header">
              <h3>Aujourd'hui & 7 jours</h3>
              <span className="dashboard-card__badge">{derived.upcomingTasks.length}</span>
            </div>
            <div className="dashboard-list">
              {derived.upcomingTasks.length > 0 ? (
                derived.upcomingTasks.map((task) => {
                  const isToday = task.planned_date === todayISO;
                  return (
                    <div key={task.id} className="dashboard-list__item" onClick={() => navigate(`/kanban?taskId=${task.id}`)}>
                      <div className="dashboard-list__item-content">
                        <span className="dashboard-list__item-title">{task.client_name || task.order_code || '—'}</span>
                        <span className="dashboard-list__item-subtitle">{task.item_reference} × {task.quantity}</span>
                      </div>
                      <span className={`dashboard-list__item-date ${isToday ? 'dashboard-list__item-date--today' : ''}`}>
                        {formatDate(task.planned_date)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="dashboard-list__empty">Aucune tache cette semaine</div>
              )}
            </div>
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card__header">
              <h3>Activite recente</h3>
            </div>
            <div className="dashboard-table">
              {recentTasks.length > 0 ? (
                <table>
                  <thead>
                    <tr><th>ID</th><th>Client</th><th>Statut</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((task) => {
                      const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                      return (
                        <tr key={task.id} onClick={() => navigate(`/kanban?taskId=${task.id}`)}>
                          <td><strong>SP-{task.id}</strong></td>
                          <td>{task.client_name || '—'}</td>
                          <td><span className="dashboard-pill" style={{ background: status.bg, color: status.color }}>{status.shortLabel}</span></td>
                          <td>{formatDate(task.planned_date)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="dashboard-list__empty">Aucune activite</div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard__column dashboard__column--side">
          <div className="dashboard-card dashboard-card--highlight">
            <div className="dashboard-card__header">
              <h3>Stock</h3>
              <button className="dashboard-link" onClick={() => navigate('/stock')}>Voir →</button>
            </div>
            <div className="stock-summary">
              <div className="stock-summary__row">
                <span>Articles</span>
                <strong>{stockSummary.totalArticles || 0}</strong>
              </div>
              <div className="stock-summary__row stock-summary__row--success">
                <span>Disponible</span>
                <strong>{stockSummary.availableQuantity?.toLocaleString('fr-FR') || 0}</strong>
              </div>
              <div className="stock-summary__row stock-summary__row--warning">
                <span>Reserve</span>
                <strong>{stockSummary.reservedQuantity?.toLocaleString('fr-FR') || 0}</strong>
              </div>
              <div className="stock-summary__row stock-summary__row--danger">
                <span>Faible</span>
                <strong>{stockSummary.lowStockCount || 0}</strong>
              </div>
            </div>
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card__header">
              <h3>Hors stock</h3>
              <span className="dashboard-card__badge dashboard-card__badge--amber">{derived.waitingCount}</span>
            </div>
            <div className="dashboard-list">
              {allTasks.filter((t) => t.status === 'WAITING_STOCK').slice(0, 5).length > 0 ? (
                allTasks.filter((t) => t.status === 'WAITING_STOCK').slice(0, 5).map((task) => (
                  <div key={task.id} className="dashboard-list__item dashboard-list__item--warning" onClick={() => navigate(`/kanban?taskId=${task.id}`)}>
                    <div className="dashboard-list__item-content">
                      <span className="dashboard-list__item-title">{task.client_name || task.order_code || '—'}</span>
                      <span className="dashboard-list__item-subtitle">{task.item_reference} · {task.quantity} pcs</span>
                    </div>
                    <span className="dashboard-list__item-deficit">-{task.stock_deficit}</span>
                  </div>
                ))
              ) : (
                <div className="dashboard-list__empty">Tout est OK</div>
              )}
            </div>
          </div>

          <div className="dashboard-card">
            <div className="dashboard-card__header">
              <h3>Retards</h3>
              <span className="dashboard-card__badge dashboard-card__badge--red">{derived.overdueCount}</span>
            </div>
            <div className="dashboard-list">
              {derived.overdueTasks.length > 0 ? (
                derived.overdueTasks.map((task) => (
                  <div key={task.id} className="dashboard-list__item dashboard-list__item--danger" onClick={() => navigate(`/kanban?taskId=${task.id}`)}>
                    <div className="dashboard-list__item-content">
                      <span className="dashboard-list__item-title">{task.client_name || task.order_code || '—'}</span>
                      <span className="dashboard-list__item-subtitle">{formatDate(task.planned_date)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="dashboard-list__empty">Aucun retard</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;