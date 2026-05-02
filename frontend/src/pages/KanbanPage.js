import React, { startTransition, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import KanbanBoard from '../components/KanbanBoard';
import KanbanToolbar from '../components/KanbanToolbar';
import ExportModal from '../components/ExportModal';
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
  const [hasConflictFilter, setHasConflictFilter] = useState(false);
  const [criticalDeficitFilter, setCriticalDeficitFilter] = useState(false);
  const [predictiveOnlyFilter, setPredictiveOnlyFilter] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { isCommercial } = useAuth();
  const { workspaceId, loadingWorkspaces, refreshWorkspaces, selectWorkspace } = useWorkspace();

  const fetchTasks = useCallback(
    async (wsId) => {
      try {
        // Ne passer workspaceId que si c'est une valeur numérique valide
        const params = {};
        if (wsId && wsId !== 'all' && wsId !== null) {
          params.workspaceId = wsId;
        }
        const status = searchParams.get('status');
        if (status) params.status = status;
        const res = await taskAPI.getAll(params);
        setTasks(res.data);
      } catch (err) {
        console.error('Failed to fetch tasks', err);
      }
    },
    [setTasks, searchParams]
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

  const handleExport = async (startDate, endDate, exportAll) => {
    try {
      const params = {};
      if (!exportAll && workspaceId !== 'all' && workspaceId !== null) {
        params.workspaceId = workspaceId;
      }
      if (startDate) params.createdFrom = startDate;
      if (endDate) params.createdTo = endDate;

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

  const handleImportOrders = async (file) => {
    if (!file || !isCommercial) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await taskAPI.importOrders(formData);
      const importedWorkspaces = response?.data?.workspaces || [];
      await refreshWorkspaces();
      if (importedWorkspaces.length > 0) {
        selectWorkspace(importedWorkspaces[0].id);
        await Promise.all([fetchTasks(importedWorkspaces[0].id), fetchStats()]);
      } else {
        await Promise.all([fetchTasks(workspaceId), fetchStats()]);
      }
      window.alert('Import commandes client terminé avec succès.');
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Echec import commandes client.');
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
        hasConflict={hasConflictFilter}
        onHasConflictChange={setHasConflictFilter}
        criticalDeficit={criticalDeficitFilter}
        onCriticalDeficitChange={setCriticalDeficitFilter}
        predictiveOnly={predictiveOnlyFilter}
        onPredictiveOnlyChange={setPredictiveOnlyFilter}
        users={users}
        stats={stats}
        onRefresh={() => Promise.all([fetchTasks(workspaceId), fetchStats()])}
        onExport={() => setExportModalOpen(true)}
        onImportOrders={isCommercial ? handleImportOrders : null}
      />
      <KanbanBoard
        tasks={tasks}
        setTasks={setTasks}
        users={users}
        workspaceId={workspaceId}
        filterQuery={search}
        filterPriority={priorityFilter}
        filterHasConflict={hasConflictFilter}
        filterCriticalDeficit={criticalDeficitFilter}
        filterPredictiveOnly={predictiveOnlyFilter}
        onTasksChange={() => fetchTasks(workspaceId)}
        onStatsRefresh={fetchStats}
      />
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExport}
        currentWorkspaceId={workspaceId}
      />
    </div>
  );
};

export default KanbanPage;
