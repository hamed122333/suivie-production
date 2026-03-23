import React, { useState, useEffect } from 'react';
import { dashboardAPI, taskAPI } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';

const StatCard = ({ label, value, icon, color, bg }) => (
  <div style={{
    background: 'white',
    borderRadius: '10px',
    padding: '1.25rem',
    boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)',
    border: '1px solid #dfe1e6',
    borderLeft: `4px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  }}>
    <div style={{ fontSize: '2rem', background: bg, padding: '0.5rem', borderRadius: '8px' }}>{icon}</div>
    <div>
      <div style={{ fontSize: '2rem', fontWeight: '700', color, lineHeight: '1' }}>{value}</div>
      <div style={{ fontSize: '0.875rem', color: '#5e6c84', marginTop: '0.25rem' }}>{label}</div>
    </div>
  </div>
);

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { workspaceId, loadingWorkspaces } = useWorkspace();

  useEffect(() => {
    if (loadingWorkspaces) return;
    if (!workspaceId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, tasksRes] = await Promise.all([
          dashboardAPI.getStats(workspaceId),
          taskAPI.getAll({ workspaceId }),
        ]);
        setStats(statsRes.data);
        setRecentTasks(tasksRes.data.slice(0, 5));
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
      <div style={{ padding: '2rem', textAlign: 'center', color: '#5e6c84' }}>
        Chargement des indicateurs…
      </div>
    );
  }

  const statusLabels = {
    TODO: { label: 'À faire', color: '#6b7280' },
    IN_PROGRESS: { label: 'En cours', color: '#0052cc' },
    DONE: { label: 'Terminé', color: '#006644' },
    BLOCKED: { label: 'Bloqué', color: '#bf2600' },
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#172b4d', marginBottom: '0.35rem' }}>
        Vue d’ensemble
      </h2>
      <p style={{ fontSize: '0.875rem', color: '#5e6c84', marginBottom: '1.5rem' }}>
        Indicateurs et dernières tâches (style rapports Jira).
      </p>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Tâches aujourd’hui" value={stats?.todayTotal || 0} icon="📅" color="#7c3aed" bg="#ede9fe" />
        <StatCard label="Total des tâches" value={stats?.grandTotal || 0} icon="📋" color="#0052cc" bg="#deebff" />
        <StatCard label="Terminées" value={stats?.totalDone || 0} icon="✅" color="#006644" bg="#e3fcef" />
        <StatCard label="En cours" value={stats?.totalInProgress || 0} icon="⚙️" color="#d97706" bg="#fef3c7" />
        <StatCard label="Bloquées" value={stats?.totalBlocked || 0} icon="🚫" color="#bf2600" bg="#ffebe6" />
        <StatCard label="À faire" value={stats?.totalTodo || 0} icon="📌" color="#6b7280" bg="#f4f5f7" />
      </div>

      {/* Recent Tasks */}
      <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)', border: '1px solid #dfe1e6', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f4f5f7', fontWeight: '600', color: '#172b4d' }}>
          Tâches récentes
        </div>
        {recentTasks.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Aucune tâche pour le moment</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#5e6c84', fontWeight: '600' }}>Titre</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#5e6c84', fontWeight: '600' }}>Assigné</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#5e6c84', fontWeight: '600' }}>Priorité</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#5e6c84', fontWeight: '600' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map((task, i) => {
                const s = statusLabels[task.status] || statusLabels.TODO;
                return (
                  <tr key={task.id} style={{ borderTop: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : 'white' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{task.title}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{task.assigned_to_name || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f3f4f6', color: '#374151', fontWeight: '500' }}>
                        {task.priority}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', background: `${s.color}20`, color: s.color, fontWeight: '600' }}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
