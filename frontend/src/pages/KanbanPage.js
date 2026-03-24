import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import KanbanBoard from '../components/KanbanBoard';
import KanbanToolbar from '../components/KanbanToolbar';
import { taskAPI, userAPI, dashboardAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

const KanbanPage = () => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { isPlanner } = useAuth();
  const { workspaceId, loadingWorkspaces } = useWorkspace();

  const fetchTasks = useCallback(
    async (wsId) => {
      try {
        const params = {};
        if (wsId && wsId !== 'all') params.workspaceId = wsId;
        const res = await taskAPI.getAll(params);
        setTasks(res.data);
      } catch (err) {
        console.error('Failed to fetch tasks', err);
      }
    },
    [setTasks]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await dashboardAPI.getStats(workspaceId);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }, [workspaceId]);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        const usersRes = await userAPI.getAll();
        setUsers(usersRes.data);
      } catch (err) {
        console.error('Failed to load data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (loadingWorkspaces) return;
    if (!workspaceId) return;
    setLoading(true);
    Promise.all([fetchTasks(workspaceId), fetchStats()]).finally(() => setLoading(false));
  }, [workspaceId, loadingWorkspaces, fetchTasks, fetchStats]);

  const handleSearchChange = (value) => {
    setSearch(value);
    if (value.trim()) {
      setSearchParams({ q: value.trim() });
    } else {
      setSearchParams({});
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="page-loading__spinner" aria-hidden />
        <p>Chargement du tableau…</p>
      </div>
    );
  }

  return (
    <div className="kanban-page">
      <KanbanToolbar
        search={search}
        onSearchChange={handleSearchChange}
        priority={priorityFilter}
        onPriorityChange={setPriorityFilter}
        users={users}
        isAdmin={isPlanner}
        stats={stats}
        onRefresh={() => Promise.all([fetchTasks(workspaceId), fetchStats()])}
      />
      <KanbanBoard
        tasks={tasks}
        setTasks={setTasks}
        users={users}
        workspaceId={workspaceId}
        filterQuery={search}
        filterPriority={priorityFilter}
        onTasksChange={() => fetchTasks(workspaceId)}
        onStatsRefresh={fetchStats}
      />
    </div>
  );
};

export default KanbanPage;
