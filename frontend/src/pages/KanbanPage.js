import React, { startTransition, useCallback, useEffect, useState } from 'react';
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
  const { workspaceId, loadingWorkspaces, activeWorkspace } = useWorkspace();

  const fetchTasks = useCallback(
    async (wsId) => {
      try {
        // Ne passer workspaceId que si c'est une valeur numérique valide
        const params = {};
        if (wsId && wsId !== 'all' && wsId !== null) {
          params.workspaceId = wsId;
        }
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
      // Ne passer workspaceId à l'API que si c'est un ID numérique
      const statsWorkspaceId = workspaceId && workspaceId !== 'all' ? workspaceId : null;
      const res = await dashboardAPI.getStats(statsWorkspaceId);
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
    // Si workspaceId est null (non sélectionné), ne pas charger
    if (workspaceId === null) return;
    setLoading(true);
    Promise.all([fetchTasks(workspaceId), fetchStats()]).finally(() => setLoading(false));
  }, [workspaceId, loadingWorkspaces, fetchTasks, fetchStats]);

  const handleSearchChange = (value) => {
    startTransition(() => {
      setSearch(value);
      if (value.trim()) {
        setSearchParams({ q: value.trim() });
      } else {
        setSearchParams({});
      }
    });
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
        workspace={activeWorkspace}
        filterQuery={search}
        filterPriority={priorityFilter}
        onTasksChange={() => fetchTasks(workspaceId)}
        onStatsRefresh={fetchStats}
      />
    </div>
  );
};

export default KanbanPage;
