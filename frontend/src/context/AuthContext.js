import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, [token]);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspaceId');
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
        // Le commercial ET le super_admin peuvent créer des tâches
        canCreateTask: user?.role === 'commercial' || user?.role === 'super_admin',
        // Le super_admin ET le planner peuvent voir toutes les tâches et changer les statuts
        canViewAll: user?.role === 'super_admin' || user?.role === 'planner',
        canChangeStatus: user?.role === 'super_admin' || user?.role === 'planner',
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
