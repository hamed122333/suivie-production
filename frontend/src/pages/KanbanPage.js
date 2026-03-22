import React, { useState, useEffect } from 'react';
import KanbanBoard from '../components/KanbanBoard';
import { taskAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const KanbanPage = () => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const { isAdmin } = useAuth();

  const fetchTasks = async (userId) => {
    try {
      const params = {};
      if (userId) params.assignedTo = userId;
      const res = await taskAPI.getAll(params);
      setTasks(res.data);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [tasksRes, usersRes] = await Promise.all([
          taskAPI.getAll({}),
          userAPI.getAll(),
        ]);
        setTasks(tasksRes.data);
        setUsers(usersRes.data);
      } catch (err) {
        console.error('Failed to load data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchTasks(filterUser);
    }
  }, [filterUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading tasks...
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      {/* Filter bar */}
      {isAdmin && (
        <div style={{ padding: '0.5rem 1rem', background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            🔍 Filter by user:
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
            >
              <option value="">All users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <KanbanBoard tasks={tasks} users={users} onTasksChange={() => fetchTasks(filterUser)} />
    </div>
  );
};

export default KanbanPage;
