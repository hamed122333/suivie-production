import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import KanbanPage from "./pages/KanbanPage";
import UsersPage from "./pages/UsersPage";
import StockPage from "./pages/StockPage";
import ScanPage from "./pages/ScanPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";
import { WorkspaceProvider } from "./context/WorkspaceContext";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#0a1929",
        }}
      >
        <div style={{ textAlign: "center", color: "#60a5fa" }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: "3px solid rgba(96,165,250,0.2)",
              borderTopColor: "#60a5fa",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          <p style={{ fontSize: "0.9rem" }}>Chargement…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const Layout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      <Header
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />
      <div className="app-layout">
        {/* Overlay for mobile when sidebar is open */}
        {isSidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setIsSidebarOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: 90,
              display: "block",
            }}
          />
        )}
        <div
          className={`sidebar-container ${isSidebarOpen ? "sidebar-open" : ""}`}
        >
          <Sidebar closeSidebar={() => setIsSidebarOpen(false)} />
        </div>
        <main className="app-main">{children}</main>
      </div>
    </>
  );
};

const AppRoutes = () => {
  const { user } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/kanban" replace /> : <LoginPage />}
      />
      <Route
        path="/forgot-password"
        element={user ? <Navigate to="/kanban" replace /> : <ForgotPasswordPage />}
      />
      <Route
        path="/reset-password"
        element={user ? <Navigate to="/kanban" replace /> : <ResetPasswordPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/reports" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/kanban"
        element={
          <ProtectedRoute>
            <Layout>
              <KanbanPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <Layout>
              <UsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock"
        element={
          <ProtectedRoute>
            <Layout>
              <StockPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scan"
        element={
          <ProtectedRoute>
            <Layout>
              <ScanPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/kanban" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter
            future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
          >
            <AppRoutes />
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
