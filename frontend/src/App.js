import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import KanbanPage from './pages/KanbanPage';
import './App.css';
import { WorkspaceProvider } from './context/WorkspaceContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
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
      <Route path="/" element={<Navigate to="/kanban" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

export default App;
