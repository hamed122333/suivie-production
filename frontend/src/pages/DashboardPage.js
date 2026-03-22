import React, { useState, useEffect } from 'react';
import { dashboardAPI, taskAPI } from '../services/api';

const StatCard = ({ label, value, icon, color, bg }) => (
  <div style={{
    background: 'white',
    borderRadius: '10px',
    padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: `4px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  }}>
    <div style={{ fontSize: '2rem', background: bg, padding: '0.5rem', borderRadius: '8px' }}>{icon}</div>
    <div>
      <div style={{ fontSize: '2rem', fontWeight: '700', color, lineHeight: '1' }}>{value}</div>
      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{label}</div>
    </div>
  </div>
);

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, tasksRes] = await Promise.all([
          dashboardAPI.getStats(),
          taskAPI.getAll(),
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
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading dashboard...
      </div>
    );
  }

  const statusLabels = {
    TODO: { label: 'To Do', color: '#6b7280' },
    IN_PROGRESS: { label: 'In Progress', color: '#2563eb' },
    DONE: { label: 'Done', color: '#16a34a' },
    BLOCKED: { label: 'Blocked', color: '#dc2626' },
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '1.5rem' }}>
        📊 Dashboard
      </h2>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard label="Tasks Today" value={stats?.todayTotal || 0} icon="📅" color="#7c3aed" bg="#ede9fe" />
        <StatCard label="Total Tasks" value={stats?.grandTotal || 0} icon="📋" color="#2563eb" bg="#dbeafe" />
        <StatCard label="Completed" value={stats?.totalDone || 0} icon="✅" color="#16a34a" bg="#dcfce7" />
        <StatCard label="In Progress" value={stats?.totalInProgress || 0} icon="⚙️" color="#d97706" bg="#fef3c7" />
        <StatCard label="Blocked" value={stats?.totalBlocked || 0} icon="🚫" color="#dc2626" bg="#fee2e2" />
        <StatCard label="Pending" value={stats?.totalTodo || 0} icon="📌" color="#6b7280" bg="#f3f4f6" />
      </div>

      {/* Recent Tasks */}
      <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f3f4f6', fontWeight: '600', color: '#111827' }}>
          📋 Recent Tasks
        </div>
        {recentTasks.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No tasks yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#6b7280', fontWeight: '600' }}>Title</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#6b7280', fontWeight: '600' }}>Assigned To</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#6b7280', fontWeight: '600' }}>Priority</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#6b7280', fontWeight: '600' }}>Status</th>
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
