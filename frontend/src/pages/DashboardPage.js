import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dashboardAPI, taskAPI } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { STATUS_COUNT_FIELDS, TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from '../constants/task';
import { formatDate, formatRelativeDate } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';
import './DashboardPage.css';

const MetricTile = ({ label, value, tone = 'blue', helper }) => (
  <div className={`dashboard-tile dashboard-tile--${tone}`}>
    <strong>{value}</strong>
    <span>{label}</span>
    {helper ? <small>{helper}</small> : null}
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();

  // ─── 1. TOUS LES HOOKS EN PREMIER ────────────────────────────────────────
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const { workspaceId, loadingWorkspaces, workspaces, refreshWorkspaces, selectWorkspace } = useWorkspace();
  const { user, isCommercial, isPlanner, isSuperAdmin } = useAuth();

  const importInputRef = useRef(null);

  const activeWorkspace = workspaces?.find((workspace) => String(workspace.id) === String(workspaceId));
  const workspaceName = workspaceId === 'all' ? 'Tous les espaces' : activeWorkspace?.name || '';

  useEffect(() => {
    if (loadingWorkspaces) return;
    if (workspaceId === null) return;

    const fetchData = async () => {
      setLoading(true);
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
            .sort((left, right) => {
              const leftDate = new Date(left.updated_at || left.created_at).getTime();
              const rightDate = new Date(right.updated_at || right.created_at).getTime();
              return rightDate - leftDate;
            })
            .slice(0, 8)
        );
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId, loadingWorkspaces]);

  // ─── 2. CALCULS ET useMemo — AVANT TOUT RETURN ANTICIPÉ ──────────────────
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
    const waitingUnconfirmed = waiting.filter((t) => t.date_negotiation_status !== 'ACCEPTED');
    const waitingModified = waiting.filter(
      (t) =>
        t.date_negotiation_status === 'PENDING_COMMERCIAL_REVIEW' &&
        `${t.proposed_by_role || ''}`.toLowerCase() === 'planner'
    );

    const overdue = tasks.filter(
      (t) => t.status !== 'DONE' && t.planned_date && String(t.planned_date).slice(0, 10) < todayISO
    );
    const upcoming = tasks
      .filter(
        (t) =>
          t.status !== 'DONE' &&
          t.planned_date &&
          String(t.planned_date).slice(0, 10) >= todayISO &&
          String(t.planned_date).slice(0, 10) <= dayPlus7
      )
      .sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)))
      .slice(0, 10);

    return {
      totalLines: tasks.length,
      totalOrders: uniqueOrders.size,
      waitingCount: waiting.length,
      waitingUnconfirmedCount: waitingUnconfirmed.length,
      waitingModifiedCount: waitingModified.length,
      overdueCount: overdue.length,
      overdueTasks: overdue.slice(0, 10),
      upcomingTasks: upcoming,
    };
  }, [allTasks, todayISO, dayPlus7]);

  const canImportOrders = Boolean(isCommercial || isPlanner || isSuperAdmin);

  // ─── 3. RETURN ANTICIPÉ — APRÈS TOUS LES HOOKS ───────────────────────────
  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-loading__spinner" />
        <p>Chargement des indicateurs de production...</p>
      </div>
    );
  }

  // ─── 4. HANDLERS ─────────────────────────────────────────────────────────
  const handleImportOrders = async (file) => {
    if (!file) return;
    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', file);
      const response = await taskAPI.importOrders(formData);
      const importedWorkspaces = response?.data?.workspaces || [];
      await refreshWorkspaces();
      if (importedWorkspaces.length > 0) {
        selectWorkspace(importedWorkspaces[0].id);
        navigate('/kanban');
      }
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Echec import commandes client.');
    } finally {
      setImporting(false);
    }
  };

  // ─── 5. RENDU ─────────────────────────────────────────────────────────────
  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <div className="dashboard__eyebrow">Pilotage production</div>
          <h1 className="dashboard__title">Tableau de bord operationnel</h1>
          <p className="dashboard__subtitle">
            {workspaceName ? <span className="dashboard__workspace-badge">{workspaceName}</span> : null}
            Import commandes client, suivi Hors stock et dates, relance production.
          </p>
        </div>
        <div className="dashboard__meta">
          <span className="dashboard__date">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          {user ? <span className="dashboard__user">Responsable: {user.name}</span> : null}
          <div className="dashboard__actions">
            {canImportOrders && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    handleImportOrders(file);
                  }}
                />
                <button
                  type="button"
                  className="dashboard__action-btn"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? 'Import…' : 'Importer commandes'}
                </button>
              </>
            )}
            <button
              type="button"
              className="dashboard__action-btn dashboard__action-btn--secondary"
              onClick={() => navigate('/kanban')}
            >
              Ouvrir Kanban
            </button>
            <button
              type="button"
              className="dashboard__action-btn dashboard__action-btn--secondary"
              onClick={() => navigate('/stock')}
            >
              Stock PF
            </button>
          </div>
        </div>
      </header>

      <section className="dashboard__overview">
        <div className="dashboard__metrics">
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/kanban')}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/kanban')}
          >
            <MetricTile label="Lignes (import + manuel)" value={derived.totalLines} tone="blue" helper="Toutes les lignes visibles" />
          </div>
          <MetricTile label="Commandes (Pièce no)" value={derived.totalOrders} tone="sky" helper="Distinct par ordre" />
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/kanban?status=WAITING_STOCK')}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/kanban?status=WAITING_STOCK')}
          >
            <MetricTile label="Hors stock PF" value={derived.waitingCount} tone="amber" helper="En attente stock / date" />
          </div>
          <MetricTile label="Dates non confirmées" value={derived.waitingUnconfirmedCount} tone="red" helper="À valider commercial/planner" />
          <MetricTile label="Dates modifiées (planner)" value={derived.waitingModifiedCount} tone="slate" helper="Attente OK commercial" />
          <MetricTile label="Retards livraison" value={derived.overdueCount} tone="green" helper={`${completionRate}% clôturé`} />
        </div>

        <div className="dashboard__workflow">
          <div className="dashboard__workflow-head">
            <div>
              <h2>Flux production</h2>
              <p>Cliquer sur une colonne pour ouvrir le Kanban filtré.</p>
            </div>
            <div className="dashboard__completion">
              <strong>{completionRate}%</strong>
              <span>taux de completion</span>
            </div>
          </div>
          <div className="dashboard__workflow-grid">
            {TASK_STATUS_ORDER.map((status) => {
              const config = TASK_STATUS_CONFIG[status];
              const countKey = STATUS_COUNT_FIELDS[status];
              return (
                <button
                  type="button"
                  key={status}
                  className="dashboard__stage"
                  style={{ background: config.bg, border: 'none', cursor: 'pointer' }}
                  onClick={() => navigate(`/kanban?status=${encodeURIComponent(status)}`)}
                  title="Ouvrir le Kanban filtré"
                >
                  <span className="dashboard__stage-name" style={{ color: config.color }}>
                    {config.label}
                  </span>
                  <strong style={{ color: config.color }}>{counts[countKey] || 0}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dashboard__grid">
        <article className="dashboard-panel">
          <div className="dashboard-panel__head">
            <h3>Livraisons (7 jours)</h3>
            <span>{derived.upcomingTasks.length}</span>
          </div>
          <div className="dashboard-list">
            {derived.upcomingTasks.length ? (
              derived.upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  className="dashboard-list__item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/kanban?taskId=${task.id}`)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.client_name || task.order_code || 'Sans detail client'}</p>
                  </div>
                  <span>{formatDate(task.planned_date, { withYear: true })}</span>
                </div>
              ))
            ) : (
              <div className="dashboard__empty">Aucune echeance proche.</div>
            )}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel__head">
            <h3>Hors stock à traiter</h3>
            <span>{derived.waitingUnconfirmedCount}</span>
          </div>
          <div className="dashboard-list">
            {allTasks.filter((t) => t.status === 'WAITING_STOCK').slice(0, 8).length ? (
              allTasks
                .filter((t) => t.status === 'WAITING_STOCK')
                .sort((a, b) => String(a.planned_date || '').localeCompare(String(b.planned_date || '')))
                .slice(0, 8)
                .map((task) => (
                  <div
                    key={task.id}
                    className="dashboard-list__item dashboard-list__item--danger"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/kanban?taskId=${task.id}`)}
                  >
                    <div>
                      <strong>{task.title}</strong>
                      <p>{task.client_name || task.order_code || '—'}</p>
                    </div>
                    <span>{task.planned_date ? formatDate(task.planned_date, { withYear: true }) : '—'}</span>
                  </div>
                ))
            ) : (
              <div className="dashboard__empty">Aucune fiche Hors stock.</div>
            )}
          </div>
        </article>

        <article className="dashboard-panel dashboard-panel--wide">
          <div className="dashboard-panel__head">
            <h3>Activité récente</h3>
            <span>{recentTasks.length} lignes</span>
          </div>
          <div className="dashboard-table">
            {recentTasks.length === 0 ? (
              <div className="dashboard__empty">Aucune fiche recente.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ligne</th>
                    <th>Client / Pièce</th>
                    <th>Statut</th>
                    <th>Date prévue</th>
                    <th>Maj</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => {
                    const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                    return (
                      <tr
                        key={task.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/kanban?taskId=${task.id}`)}
                        title="Ouvrir la fiche dans le Kanban"
                      >
                        <td>
                          <div className="dashboard-table__main">
                            <strong>{`SP-${task.id}`}</strong>
                            <span>{task.title}</span>
                          </div>
                        </td>
                        <td>{task.client_name || task.order_code || '—'}</td>
                        <td>
                          <span
                            className="dashboard-table__pill"
                            style={{ background: status.bg, color: status.color }}
                          >
                            {status.shortLabel}
                          </span>
                        </td>
                        <td>{formatDate(task.planned_date)}</td>
                        <td>{formatRelativeDate(task.updated_at || task.created_at, { compact: true })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </section>
    </div>
  );
};

export default DashboardPage;