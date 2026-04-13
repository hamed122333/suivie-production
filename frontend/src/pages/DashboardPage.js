import React, { useEffect, useState } from 'react';
import { dashboardAPI, taskAPI } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { STATUS_COUNT_FIELDS, TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from '../constants/task';
import { formatDate, formatRelativeDate, getInitials } from '../utils/formatters';
import './DashboardPage.css';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const getMonthKeyFromWorkspaceName = (name) => {
  const match = String(name || '').match(/(\d{4}-\d{2})$/);
  return match ? match[1] : null;
};

const MetricTile = ({ label, value, tone = 'blue', helper }) => (
  <div className={`dashboard-tile dashboard-tile--${tone}`}>
    <strong>{value}</strong>
    <span>{label}</span>
    {helper ? <small>{helper}</small> : null}
  </div>
);

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { workspaceId, loadingWorkspaces, workspaces } = useWorkspace();
  const { user } = useAuth();

  const activeWorkspace = workspaces?.find((workspace) => String(workspace.id) === String(workspaceId));
  const workspaceName = workspaceId === 'all' ? 'Tous les espaces' : activeWorkspace?.name || '';

  const exportMonthlyPdf = async () => {
    if (!workspaceId || workspaceId === 'all') return;

    setExporting(true);
    try {
      const monthKey = getMonthKeyFromWorkspaceName(workspaceName) || new Date().toISOString().slice(0, 7);
      const response = await taskAPI.getAll({ workspaceId });
      const monthlyTasks = (response.data || []).filter((task) =>
        String(task.created_at || '').startsWith(monthKey)
      );

      const rowsHtml = monthlyTasks
        .map(
          (task) => `
            <tr>
              <td>SP-${task.id}</td>
              <td>${escapeHtml(task.title)}</td>
              <td>${escapeHtml(task.client_name || task.order_code || '—')}</td>
              <td>${escapeHtml(task.priority)}</td>
              <td>${escapeHtml(task.status)}</td>
              <td>${escapeHtml(formatDate(task.due_date, { withYear: true }) || '—')}</td>
            </tr>`
        )
        .join('');

      const printWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (!printWindow) return;

      printWindow.document.write(`
        <!doctype html>
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <title>Suivi mensuel ${escapeHtml(monthKey)}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
              h1 { font-size: 20px; margin: 0 0 6px; }
              p { margin: 0 0 16px; color: #475569; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #dbe4ef; padding: 8px; text-align: left; font-size: 12px; }
              th { background: #f8fafc; }
            </style>
          </head>
          <body>
            <h1>Suivi mensuel - ${escapeHtml(workspaceName || monthKey)}</h1>
            <p>Mois: ${escapeHtml(monthKey)} • Généré le ${escapeHtml(new Date().toLocaleDateString('fr-FR'))} • Responsable: ${escapeHtml(user?.name || '—')}</p>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tâche</th>
                  <th>Client / Ordre</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  <th>Échéance</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="6">Aucune tâche sur ce mois.</td></tr>'}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    } finally {
      setExporting(false);
    }
  };

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

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-loading__spinner" />
        <p>Chargement des indicateurs de production...</p>
      </div>
    );
  }

  const counts = stats?.counts || {};
  const totalTasks = counts.totalTasks || 0;
  const completionRate = totalTasks > 0 ? Math.round(((counts.totalDone || 0) / totalTasks) * 100) : 0;
  const activeLines = stats?.lineLoad?.length || 0;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <div className="dashboard__eyebrow">Pilotage production</div>
          <h1 className="dashboard__title">Tableau de bord operationnel</h1>
          <p className="dashboard__subtitle">
            {workspaceName ? <span className="dashboard__workspace-badge">{workspaceName}</span> : null}
            Vue synthese des commandes, du charge-line et des points de blocage.
          </p>
        </div>
        <div className="dashboard__meta">
          <button
            type="button"
            className="dashboard__export-btn"
            onClick={exportMonthlyPdf}
            disabled={!workspaceId || workspaceId === 'all' || exporting}
          >
            {exporting ? 'Export…' : 'Exporter PDF du mois'}
          </button>
          <span className="dashboard__date">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          {user ? <span className="dashboard__user">Responsable: {user.name}</span> : null}
        </div>
      </header>

      <section className="dashboard__overview">
        <div className="dashboard__metrics">
          <MetricTile label="Commandes totales" value={totalTasks} tone="blue" helper="Toutes fiches visibles" />
          <MetricTile label="Echeances du jour" value={counts.dueToday || 0} tone="sky" helper="A traiter aujourd hui" />
          <MetricTile label="Retards" value={counts.overdue || 0} tone="amber" helper="Encore non termines" />
          <MetricTile label="Bloquees" value={counts.totalBlocked || 0} tone="red" helper="Demandes d intervention" />
          <MetricTile label="Terminees aujourd hui" value={counts.completedToday || 0} tone="green" helper={`${completionRate}% du flux cloture`} />
          <MetricTile label="Lignes actives" value={activeLines} tone="slate" helper="Charge detectee" />
        </div>

        <div className="dashboard__workflow">
          <div className="dashboard__workflow-head">
            <div>
              <h2>Flux production</h2>
              <p>Lecture instantanee du portefeuille dans chaque etape.</p>
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
                <div key={status} className="dashboard__stage" style={{ background: config.bg }}>
                  <span className="dashboard__stage-name" style={{ color: config.color }}>
                    {config.label}
                  </span>
                  <strong style={{ color: config.color }}>{counts[countKey] || 0}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dashboard__grid">
        <article className="dashboard-panel">
          <div className="dashboard-panel__head">
            <h3>Charge par ligne</h3>
            <span>{activeLines} lignes</span>
          </div>
          <div className="dashboard-load">
            {stats?.lineLoad?.length ? (
              stats.lineLoad.map((entry) => {
                const ratio = totalTasks > 0 ? Math.min(100, Math.round((entry.taskCount / totalTasks) * 100)) : 0;
                return (
                  <div key={entry.productionLine} className="dashboard-load__row">
                    <div className="dashboard-load__label">
                      <strong>{entry.productionLine}</strong>
                      <span>{entry.taskCount} fiches</span>
                    </div>
                    <div className="dashboard-load__bar">
                      <div className="dashboard-load__fill" style={{ width: `${Math.max(ratio, 8)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="dashboard__empty">Aucune charge active detectee.</div>
            )}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel__head">
            <h3>Echeances proches</h3>
            <span>{stats?.upcomingDue?.length || 0}</span>
          </div>
          <div className="dashboard-list">
            {stats?.upcomingDue?.length ? (
              stats.upcomingDue.map((task) => (
                <div key={task.id} className="dashboard-list__item">
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.client_name || task.order_code || 'Sans detail client'}</p>
                  </div>
                  <span>{formatDate(task.due_date, { withYear: true })}</span>
                </div>
              ))
            ) : (
              <div className="dashboard__empty">Aucune echeance proche.</div>
            )}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel__head">
            <h3>Blocages actifs</h3>
            <span>{stats?.blockedTasks?.length || 0}</span>
          </div>
          <div className="dashboard-list">
            {stats?.blockedTasks?.length ? (
              stats.blockedTasks.map((task) => (
                <div key={task.id} className="dashboard-list__item dashboard-list__item--danger">
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.blocked_reason || 'Blocage sans motif'}</p>
                  </div>
                  <span>{formatRelativeDate(task.blocked_at || task.updated_at, { compact: true })}</span>
                </div>
              ))
            ) : (
              <div className="dashboard__empty">Aucun blocage actif.</div>
            )}
          </div>
        </article>

        <article className="dashboard-panel dashboard-panel--wide">
          <div className="dashboard-panel__head">
            <h3>Activite recente</h3>
            <span>{recentTasks.length} fiches</span>
          </div>
          <div className="dashboard-table">
            {recentTasks.length === 0 ? (
              <div className="dashboard__empty">Aucune fiche recente.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Fiche</th>
                    <th>Client / ordre</th>
                    <th>Priorite</th>
                    <th>Statut</th>
                    <th>Responsable</th>
                    <th>Echeance</th>
                    <th>Maj</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => {
                    const priority = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
                    const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                    return (
                      <tr key={task.id}>
                        <td>
                          <div className="dashboard-table__main">
                            <strong>{`SP-${task.id}`}</strong>
                            <span>{task.title}</span>
                          </div>
                        </td>
                        <td>{task.client_name || task.order_code || '—'}</td>
                        <td>
                          <span className="dashboard-table__pill" style={{ background: priority.bg, color: priority.color }}>
                            {priority.label}
                          </span>
                        </td>
                        <td>
                          <span className="dashboard-table__pill" style={{ background: status.bg, color: status.color }}>
                            {status.shortLabel}
                          </span>
                        </td>
                        <td className="dashboard-table__owner">
                          <span className="dashboard-table__avatar">{getInitials(task.assigned_to_name)}</span>
                          {task.assigned_to_name || 'Non assigne'}
                        </td>
                        <td>{formatDate(task.due_date)}</td>
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
