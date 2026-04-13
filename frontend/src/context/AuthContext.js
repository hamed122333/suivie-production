import React, { createContext, useContext, useEffect, useState } from 'react';
import { authAPI } from '../services/api';
import { AUTH_CHANGED_EVENT, clearAuthSession, readStoredAuth, saveAuthSession } from '../utils/authStorage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const storedAuth = readStoredAuth();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(storedAuth.token);
  const [loading, setLoading] = useState(Boolean(storedAuth.token));

  useEffect(() => {
    const syncFromStorage = () => {
      const nextSession = readStoredAuth();
      setToken(nextSession.token);
      setUser(nextSession.user);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncFromStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setUser(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    authAPI.me()
      .then((response) => {
        if (cancelled) return;
        setUser(response.data);
        saveAuthSession(response.data, token);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthSession();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    setLoading(false);
    saveAuthSession(userData, authToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearAuthSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        loading,
        isSuperAdmin: user?.role === 'super_admin',
        isPlanner: user?.role === 'planner',
        isCommercial: user?.role === 'commercial',
        // Le commercial crée les tâches, uniquement dans TODO.
        canCreateTask: user?.role === 'commercial',
        canCreateWorkspace: user?.role === 'super_admin' || user?.role === 'planner',
        // Le super_admin et le planner ont une vue globale.
        canViewAll: user?.role === 'super_admin' || user?.role === 'planner',
        // Le planificateur gère les mouvements et les statuts.
        canChangeStatus: user?.role === 'planner',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export default AuthContext;
