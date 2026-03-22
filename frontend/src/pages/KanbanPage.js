import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import KanbanBoard from '../components/KanbanBoard';
import KanbanToolbar from '../components/KanbanToolbar';
import { taskAPI, userAPI, dashboardAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const KanbanPage = () => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  const fetchTasks = useCallback(async (userId) => {
    try {
      const params = {};
      if (userId) params.assignedTo = userId;
      const res = await taskAPI.getAll(params);
      setTasks(res.data);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await dashboardAPI.getStats();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchTasks(filterUser), fetchStats()]);
  }, [fetchTasks, fetchStats, filterUser]);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tasksRes, usersRes, statsRes] = await Promise.all([
          taskAPI.getAll({}),
          userAPI.getAll(),
          dashboardAPI.getStats(),
        ]);
        setTasks(tasksRes.data);
        setUsers(usersRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error('Failed to load data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchTasks(filterUser);
    }
  }, [filterUser, loading, fetchTasks]);

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
        filterUser={filterUser}
        onFilterUserChange={setFilterUser}
        users={users}
        isAdmin={isAdmin}
        stats={stats}
        onRefresh={refreshAll}
      />
      <KanbanBoard
        tasks={tasks}
        setTasks={setTasks}
        users={users}
        filterQuery={search}
        filterPriority={priorityFilter}
        onTasksChange={() => fetchTasks(filterUser)}
        onStatsRefresh={fetchStats}
      />
    </div>
  );
};

export default KanbanPage;
