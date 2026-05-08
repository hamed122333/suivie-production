import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import KanbanBoard from '../components/KanbanBoard';
import KanbanToolbar from '../components/KanbanToolbar';
import ExportModal from '../components/ExportModal';
import Spinner from '../components/Spinner';
import { taskAPI, userAPI, dashboardAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import useServerEvents from '../hooks/useServerEvents';

const KanbanPage = () => {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importBanner, setImportBanner] = useState(null);
  const skipNextLoadingRef = useRef(false);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
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

  // Real-time: refetch when stock or task allocations change
  useServerEvents({
    'stock-updated': () => {
      fetchTasks(workspaceId);
      fetchStats();
    },
    'tasks-updated': () => {
      fetchTasks(workspaceId);
      fetchStats();
    },
  });

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
    setImporting(true);
    setImportBanner(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await taskAPI.importOrders(formData);
      const importedWorkspaces = response?.data?.workspaces || [];
      const importedCount = response?.data?.imported ?? response?.data?.tasks?.length ?? '?';
      const skippedCount = (response?.data?.skipped ?? 0) + (response?.data?.skippedExisting ?? 0);
      await refreshWorkspaces();
      const targetWsId = importedWorkspaces.length > 0 ? importedWorkspaces[0].id : workspaceId;
      if (importedWorkspaces.length > 0) {
        skipNextLoadingRef.current = true;
        selectWorkspace(targetWsId);
      }
      await Promise.all([fetchTasks(targetWsId), fetchStats()]);
      const skippedNote = skippedCount > 0 ? ` • ${skippedCount} ligne(s) ignorée(s) (référence non reconnue ou doublon).` : '';
      setImportBanner({ type: 'success', message: `${importedCount} ligne(s) importée(s) avec succès.${skippedNote}` });
      setTimeout(() => setImportBanner(null), 5000);
    } catch (err) {
      setImportBanner({ type: 'error', message: err?.response?.data?.error || 'Echec import commandes client.' });
    } finally {
      setImporting(false);
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
    if (workspaceId === null) return;
    if (skipNextLoadingRef.current) {
      skipNextLoadingRef.current = false;
      return;
    }
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
      <Spinner message="Chargement du tableau…" />
    );
  }

  return (
    <div className="kanban-page">
      {importBanner && (
        <div style={{
          padding: '0.65rem 1.25rem',
          background: importBanner.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: importBanner.type === 'success' ? '#065f46' : '#991b1b',
          borderBottom: `1px solid ${importBanner.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {importBanner.type === 'success' ? '✓' : '⚠'} {importBanner.message}
        </div>
      )}
      <KanbanToolbar
        search={search}
        onSearchChange={handleSearchChange}
        priority={priorityFilter}
        onPriorityChange={setPriorityFilter}
        criticalDeficit={criticalDeficitFilter}
        onCriticalDeficitChange={setCriticalDeficitFilter}
        predictiveOnly={predictiveOnlyFilter}
        onPredictiveOnlyChange={setPredictiveOnlyFilter}
        users={users}
        stats={stats}
        importing={importing}
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
