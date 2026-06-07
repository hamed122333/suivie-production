import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import KanbanBoard from '../components/KanbanBoard';
import KanbanToolbar from '../components/KanbanToolbar';
import ExportModal from '../components/ExportModal';
import Spinner from '../components/Spinner';
import { taskAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useServerEvents from '../hooks/useServerEvents';

const KanbanPage = () => {
  // La liste d'utilisateurs (filtre « Commercial ») est réservée au planificateur
  // et au super_admin (GET /api/users). On ne l'appelle PAS pour les autres rôles
  // afin d'éviter un 403 inutile à la connexion.
  const { isPlanner, isSuperAdmin } = useAuth();
  const canSeeUsers = isPlanner || isSuperAdmin;
  const [tasks, setTasks]         = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [priorityFilter, setPriorityFilter]           = useState('');
  const [categoryFilter, setCategoryFilter]           = useState('');
  const [criticalDeficitFilter, setCriticalDeficitFilter] = useState(false);
  const [predictiveOnlyFilter, setPredictiveOnlyFilter]   = useState(false);
  const [commercialFilter, setCommercialFilter]       = useState('');
  const [selectedDayFilter, setSelectedDayFilter]     = useState(null);
  const [plannedFrom, setPlannedFrom] = useState('');
  const [plannedTo, setPlannedTo]     = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Keep latest date range in a ref so SSE handlers always use current values
  const dateRef = useRef({ plannedFrom: '', plannedTo: '' });
  dateRef.current = { plannedFrom, plannedTo };

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (from, to) => {
    try {
      const params = {};
      const status = searchParams.get('status');
      if (status)  params.status      = status;
      if (from)    params.plannedFrom = from;
      if (to)      params.plannedTo   = to;
      const res = await taskAPI.getAll(params);
      setTasks(res.data);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, [searchParams]);

  // Real-time: refetch with current date range on any task/stock change
  useServerEvents({
    'stock-updated': () => fetchTasks(dateRef.current.plannedFrom, dateRef.current.plannedTo),
    'tasks-updated': () => fetchTasks(dateRef.current.plannedFrom, dateRef.current.plannedTo),
  });

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const tasksRes = await taskAPI.getAll({});
        setTasks(tasksRes.data);
        // Liste d'utilisateurs uniquement pour les rôles autorisés (sinon 403).
        if (canSeeUsers) {
          const usersRes = await userAPI.getAll().catch(() => ({ data: [] }));
          setUsers(usersRes.data || []);
        }
      } catch (err) {
        console.error('Failed to load kanban', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canSeeUsers]);

  // ── Sync search from URL ──────────────────────────────────────────────────

  useEffect(() => {
    setSearch(searchParams.get('q') || '');
  }, [searchParams]);

  // ── Date range from toolbar → refetch ─────────────────────────────────────
  // Skip on first render (initial load already done above)

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    fetchTasks(plannedFrom, plannedTo);
  }, [plannedFrom, plannedTo, fetchTasks]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDateChange = (from, to) => {
    setPlannedFrom(from || '');
    setPlannedTo(to || '');
    // Also clear the day-bar selection when the window changes
    setSelectedDayFilter(null);
  };

  const handleSearchChange = (value) => {
    startTransition(() => {
      setSearch(value);
      if (value.trim()) setSearchParams({ q: value.trim() });
      else setSearchParams({});
    });
  };

  const handleExport = async (startDate, endDate) => {
    try {
      const params = {};
      if (startDate) params.createdFrom = startDate;
      if (endDate)   params.createdTo   = endDate;
      const res = await taskAPI.exportExcel(params);
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `Export_Taches_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      console.error('Failed to export tasks', err);
    }
  };

  if (loading) return <Spinner message="Chargement du tableau…" />;

  return (
    <div className="kanban-page">
      <KanbanToolbar
        search={search}
        onSearchChange={handleSearchChange}
        priority={priorityFilter}
        onPriorityChange={setPriorityFilter}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        criticalDeficit={criticalDeficitFilter}
        onCriticalDeficitChange={setCriticalDeficitFilter}
        predictiveOnly={predictiveOnlyFilter}
        onPredictiveOnlyChange={setPredictiveOnlyFilter}
        commercialFilter={commercialFilter}
        onCommercialFilterChange={setCommercialFilter}
        commercials={users.filter(u => u.role === 'commercial' && u.commercial_id)}
        tasks={tasks}
        onDateChange={handleDateChange}
        onDaySelect={setSelectedDayFilter}
        onRefresh={() => fetchTasks(plannedFrom, plannedTo)}
        onExport={() => setExportModalOpen(true)}
      />
      <KanbanBoard
        tasks={tasks}
        setTasks={setTasks}
        users={users}
        filterQuery={search}
        filterPriority={priorityFilter}
        filterCategory={categoryFilter}
        filterCriticalDeficit={criticalDeficitFilter}
        filterPredictiveOnly={predictiveOnlyFilter}
        filterCommercial={commercialFilter}
        filterDate={selectedDayFilter}
        onTasksChange={() => fetchTasks(plannedFrom, plannedTo)}
      />
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExport}
      />
    </div>
  );
};

export default KanbanPage;
