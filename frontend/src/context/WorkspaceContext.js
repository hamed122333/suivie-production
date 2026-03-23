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
      const storedId = stored ? parseInt(stored, 10) : null;
      const exists = storedId && list.some((w) => w.id === storedId);

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

  const selectWorkspace = useCallback((id) => {
    const wid = parseInt(id, 10);
    if (!Number.isInteger(wid)) return;
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

  const value = useMemo(
    () => ({
      workspaces,
      workspaceId: workspaceId ? parseInt(workspaceId, 10) : null,
      loadingWorkspaces,
      refreshWorkspaces,
      selectWorkspace,
      createWorkspace,
    }),
    [workspaces, workspaceId, loadingWorkspaces, refreshWorkspaces, selectWorkspace, createWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
};

export default WorkspaceContext;

