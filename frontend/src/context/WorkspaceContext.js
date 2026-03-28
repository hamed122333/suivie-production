import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { workspaceAPI } from '../services/api';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem('workspaceId') || '');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    try {
      const res = await workspaceAPI.getAll();
      const list = res.data || [];
      setWorkspaces(list);

      const stored = localStorage.getItem('workspaceId');
      // Gérer la valeur spéciale 'all'
      if (stored === 'all') {
        setWorkspaceId('all');
        return;
      }
      const storedId = stored ? parseInt(stored, 10) : null;
      const exists = storedId && !isNaN(storedId) && list.some((w) => w.id === storedId);

      if (exists) {
        setWorkspaceId(String(storedId));
      } else if (list.length > 0) {
        setWorkspaceId(String(list[0].id));
        localStorage.setItem('workspaceId', String(list[0].id));
      } else {
        setWorkspaceId('');
        localStorage.removeItem('workspaceId');
      }
    } catch (err) {
      setWorkspaces([]);
      setWorkspaceId('');
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    refreshWorkspaces();
  }, [authLoading, user, refreshWorkspaces]);

  // Ajout de la vue globale pour super_admin et planificateur
  const workspacesWithAll = useMemo(() => {
    if (!user) return workspaces;
    if (user.role === 'super_admin' || user.role === 'planner') {
      return [{ id: 'all', name: '🌐 Tous les espaces' }, ...workspaces];
    }
    return workspaces;
  }, [user, workspaces]);

  const selectWorkspace = useCallback((id) => {
    // Gérer l'option spéciale 'all'
    if (id === 'all' || String(id) === 'all') {
      setWorkspaceId('all');
      localStorage.setItem('workspaceId', 'all');
      return;
    }
    const wid = parseInt(id, 10);
    if (isNaN(wid) || !Number.isInteger(wid)) return;
    setWorkspaceId(String(wid));
    localStorage.setItem('workspaceId', String(wid));
  }, []);

  const createWorkspace = useCallback(
    async (name) => {
      const res = await workspaceAPI.create({ name });
      await refreshWorkspaces();
      selectWorkspace(res.data.id);
      return res.data;
    },
    [refreshWorkspaces, selectWorkspace]
  );

  // workspaceId numérique ou 'all' ou null
  const resolvedWorkspaceId = useMemo(() => {
    if (!workspaceId) return null;
    if (workspaceId === 'all') return 'all';
    const n = parseInt(workspaceId, 10);
    return isNaN(n) ? null : n;
  }, [workspaceId]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces: workspacesWithAll,
        workspaceId: resolvedWorkspaceId,
        selectWorkspace,
        createWorkspace,
        refreshWorkspaces,
        loadingWorkspaces,
        setWorkspaceId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
};

export default WorkspaceContext;
