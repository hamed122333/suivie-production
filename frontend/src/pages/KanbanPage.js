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
  const { workspaceId, loadingWorkspaces } = useWorkspace();

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
      // Ne passer workspaceId a l'API que si c'est un ID numerique
      const statsWorkspaceId = workspaceId && workspaceId !== 'all' ? workspaceId : null;
      const res = await dashboardAPI.getStats(statsWorkspaceId);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }, [workspaceId]);

  const handleExport = async () => {
    try {
      const params = {};
      if (workspaceId && workspaceId !== 'all' && workspaceId !== null) {
        params.workspaceId = workspaceId;
      }
      const res = await taskAPI.exportExcel(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Export_Taches_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      console.error('Failed to export tasks', err);
    }
  };

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
        onExport={handleExport}
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
