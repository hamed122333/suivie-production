import React, { useState, useEffect } from 'react';
import { dashboardAPI, taskAPI } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import './DashboardPage.css';

const StatCard = ({ label, value, icon, color, bg, trend }) => (
  <div className="stat-card" style={{ borderLeftColor: color }}>
    <div className="stat-card__icon" style={{ background: bg, color }}>
      {icon}
    </div>
    <div className="stat-card__body">
      <div className="stat-card__value" style={{ color }}>{value}</div>
      <div className="stat-card__label">{label}</div>
      {trend !== undefined && (
        <div className={`stat-card__trend ${trend >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  </div>
);

const statusConfig = {
  TODO: { label: 'À faire', color: '#6b7280', bg: '#f3f4f6', icon: '📌' },
  IN_PROGRESS: { label: 'En cours', color: '#0052cc', bg: '#deebff', icon: '⚙️' },
  DONE: { label: 'Terminé', color: '#006644', bg: '#e3fcef', icon: '✅' },
  BLOCKED: { label: 'Bloqué', color: '#bf2600', bg: '#ffebe6', icon: '🚫' },
};

const priorityConfig = {
  URGENT: { label: 'Urgente', color: '#7c3aed', bg: '#ede9fe' },
  HIGH: { label: 'Haute', color: '#dc2626', bg: '#fee2e2' },
  MEDIUM: { label: 'Moyenne', color: '#d97706', bg: '#fef3c7' },
  LOW: { label: 'Basse', color: '#6b7280', bg: '#f3f4f6' },
};

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { workspaceId, loadingWorkspaces, workspaces } = useWorkspace();
  const { user } = useAuth();

  const activeWorkspace = workspaces?.find(w => String(w.id) === String(workspaceId));
  const workspaceName = workspaceId === 'all' ? 'Tous les espaces' : (activeWorkspace?.name || '');

  useEffect(() => {
    if (loadingWorkspaces) return;
    if (workspaceId === null) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Ne passer workspaceId à l'API que si c'est un nombre valide
        const apiWorkspaceId = workspaceId !== 'all' ? workspaceId : null;
        const taskParams = apiWorkspaceId ? { workspaceId: apiWorkspaceId } : {};

        const [statsRes, tasksRes] = await Promise.all([
          dashboardAPI.getStats(apiWorkspaceId),
          taskAPI.getAll(taskParams),
        ]);
        setStats(statsRes.data);
        setRecentTasks(tasksRes.data.slice(0, 10));
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
        <p>Chargement des indicateurs…</p>
      </div>
    );
  }

  const completionRate = stats?.grandTotal > 0
    ? Math.round((parseInt(stats.totalDone) / parseInt(stats.grandTotal)) * 100)
    : 0;

  return (
    <div className="dashboard">
      {/* En-tête */}
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Vue d'ensemble</h1>
          <p className="dashboard__subtitle">
            {workspaceName && <span className="dashboard__workspace-badge">{workspaceName}</span>}
            Indicateurs de production en temps réel
          </p>
        </div>
        <div className="dashboard__meta">
          <span className="dashboard__date">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          {user && <span className="dashboard__user">👤 {user.name}</span>}
        </div>
      </div>

      {/* KPIs */}
      <div className="dashboard__kpis">
        <StatCard label="Total des tâches" value={stats?.grandTotal || 0} icon="📋" color="#0052cc" bg="#deebff" />
        <StatCard label="Terminées" value={stats?.totalDone || 0} icon="✅" color="#006644" bg="#e3fcef" />
        <StatCard label="En cours" value={stats?.totalInProgress || 0} icon="⚙️" color="#d97706" bg="#fef3c7" />
        <StatCard label="Bloquées" value={stats?.totalBlocked || 0} icon="🚫" color="#bf2600" bg="#ffebe6" />
        <StatCard label="À faire" value={stats?.totalTodo || 0} icon="📌" color="#6b7280" bg="#f4f5f7" />
        <StatCard label="Créées aujourd'hui" value={stats?.todayTotal || 0} icon="📅" color="#7c3aed" bg="#ede9fe" />
      </div>

      {/* Progress bar */}
      <div className="dashboard__progress-card">
        <div className="dashboard__progress-header">
          <span>Taux de complétion global</span>
          <strong style={{ color: '#006644' }}>{completionRate}%</strong>
        </div>
        <div className="dashboard__progress-bar">
          <div
            className="dashboard__progress-fill"
            style={{ width: `${completionRate}%` }}
          />
        </div>
        <div className="dashboard__progress-legend">
          {Object.entries(statusConfig).map(([key, cfg]) => {
            const count = key === 'TODO' ? stats?.totalTodo
              : key === 'IN_PROGRESS' ? stats?.totalInProgress
              : key === 'DONE' ? stats?.totalDone
              : stats?.totalBlocked;
            const pct = stats?.grandTotal > 0 ? Math.round((parseInt(count || 0) / parseInt(stats.grandTotal)) * 100) : 0;
            return (
              <div key={key} className="dashboard__progress-item">
                <span className="dashboard__progress-dot" style={{ background: cfg.color }} />
                <span style={{ color: cfg.color, fontWeight: 600 }}>{count || 0}</span>
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{cfg.label} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tâches récentes */}
      <div className="dashboard__section">
        <div className="dashboard__section-header">
          <h2 className="dashboard__section-title">Tâches récentes</h2>
          <span className="dashboard__section-count">{recentTasks.length} tâches affichées</span>
        </div>
        <div className="dashboard__table-wrap">
          {recentTasks.length === 0 ? (
            <div className="dashboard__empty">
              <div className="dashboard__empty-icon">📭</div>
              <p>Aucune tâche pour le moment</p>
            </div>
          ) : (
            <table className="dashboard__table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Titre</th>
                  <th>Assigné à</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  <th>Modifié</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => {
                  const s = statusConfig[task.status] || statusConfig.TODO;
                  const p = priorityConfig[task.priority] || priorityConfig.MEDIUM;
                  const when = formatRelative(task.updated_at || task.created_at);
                  return (
                    <tr key={task.id}>
                      <td className="dashboard__table-ref">SP-{task.id}</td>
                      <td className="dashboard__table-title">{task.title}</td>
                      <td className="dashboard__table-user">
                        {task.assigned_to_name
                          ? <><span className="dashboard__avatar">{initials(task.assigned_to_name)}</span> {task.assigned_to_name}</>
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td>
                        <span className="dashboard__badge" style={{ background: p.bg, color: p.color }}>
                          {p.label}
                        </span>
                      </td>
                      <td>
                        <span className="dashboard__badge dashboard__badge--status" style={{ background: s.bg, color: s.color }}>
                          {s.icon} {s.label}
                        </span>
                      </td>
                      <td className="dashboard__table-when">{when}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now - d;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "À l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `Il y a ${days}j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default DashboardPage;
