import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getInitials } from '../utils/formatters';
import './Sidebar.css';

const WORKSPACE_ICONS = ['●', '○', '◎', '◉', '◌', '◍', '⚙'];

const getRoleLabel = (role) => {
  const labels = {
    super_admin: { label: 'Suivi', color: '#7c3aed', bg: '#ede9fe' },
    planner: { label: 'Planificateur', color: '#0052cc', bg: '#deebff' },
    commercial: { label: 'Commercial', color: '#b45309', bg: '#fef3c7' },
    user: { label: 'Utilisateur', color: '#374151', bg: '#f3f4f6' },
  };
  return labels[role] || labels.user;
};

const Sidebar = ({ closeSidebar }) => {
  const { isSuperAdmin, user } = useAuth();
  const { workspaces, workspaceId, selectWorkspace, loadingWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();

  const activeId = workspaceId ? String(workspaceId) : '';
  const roleInfo = getRoleLabel(user?.role);

  const options = workspaces || [];

  return (
    <aside className="sidebar" aria-label="Espaces de travail">
      {/* Profil utilisateur */}
      {user && (
        <div className="sidebar__profile">
        <div className="sidebar__profile-avatar">
            {getInitials(user.name)}
        </div>
          <div className="sidebar__profile-info">
            <div className="sidebar__profile-name">{user.name}</div>
            <span className="sidebar__profile-role" style={{ background: roleInfo.bg, color: roleInfo.color }}>
              {roleInfo.label}
            </span>
          </div>
        </div>
      )}

      {/* En-tête Espaces */}
      <div className="sidebar__header">
        <div className="sidebar__title">
          <span className="sidebar__title-icon">🗂️</span>
          Espaces
        </div>
      </div>

      {/* Liste des workspaces */}
      <div className="sidebar__list">
        {loadingWorkspaces ? (
          <div className="sidebar__loading">
            <div className="sidebar__loading-dot" />
            <div className="sidebar__loading-dot" />
            <div className="sidebar__loading-dot" />
          </div>
        ) : options.length === 0 ? (
          <div className="sidebar__empty">
            <span>⚲</span>
            <p>Aucun espace créé</p>
          </div>
        ) : (
          options.map((ws, idx) => {
            const id = String(ws.id);
            const active = id === activeId;
            const isAll = ws.id === 'all';
            const icon = isAll ? '*' +
                '' : WORKSPACE_ICONS[(idx - (isAll ? 0 : 1)) % WORKSPACE_ICONS.length];
            return (
              <button
                type="button"
                key={ws.id}
                className={`sidebar__item ${active ? 'sidebar__item--active' : ''} ${isAll ? 'sidebar__item--all' : ''}`}
                onClick={() => {
                  selectWorkspace(ws.id);
                  if (location.pathname !== '/kanban') {
                    navigate('/kanban');
                  }
                  if (closeSidebar) closeSidebar();
                }}
              >
                <span className="sidebar__item-icon">{icon}</span>
                <span className="sidebar__item-name">{ws.name}</span>
                {active && <span className="sidebar__item-check">✔</span>}
              </button>
            );
          })
        )}
      </div>

      {/* Séparateur */}
      <div className="sidebar__divider" />

      {/* Navigation */}
      <nav className="sidebar__nav" aria-label="Navigation">
        <NavLink to="/kanban" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>▤</span> Tableau Kanban
        </NavLink>
        <NavLink to="/dashboard" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>◱</span> Tableau de bord
        </NavLink>
        <NavLink to="/stock" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>▦</span> Stock & Produits Finis
        </NavLink>
        {isSuperAdmin && (
          <NavLink to="/users" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
            <span>👥</span> Utilisateurs
          </NavLink>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
