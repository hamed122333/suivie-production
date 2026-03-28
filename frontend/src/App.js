import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import KanbanPage from './pages/KanbanPage';
import UsersPage from './pages/UsersPage';
import './App.css';
import { WorkspaceProvider } from './context/WorkspaceContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a1929' }}>
      <div style={{ textAlign: 'center', color: '#60a5fa' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(96,165,250,0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
        <p style={{ fontSize: '0.9rem' }}>Chargement…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const Layout = ({ children }) => (
  <>
    <Header />
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">{children}</main>
    </div>
  </>
);

const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/kanban" replace /> : <LoginPage />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><DashboardPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <Layout><DashboardPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/kanban" element={
        <ProtectedRoute>
          <Layout><KanbanPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute>
          <Layout><UsersPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/" element={<Navigate to="/kanban" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AppRoutes />
        </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

export default App;
