import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext'; 
import './Sidebar.css';

const Sidebar = ({ closeSidebar }) => {
  const { isSuperAdmin } = useAuth();
  const { workspaces, workspaceId, selectWorkspace, loadingWorkspaces } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  

  const activeId = workspaceId ? String(workspaceId) : '';
  const options = workspaces || [];
  const workspaceCount = options.filter((workspace) => workspace.id !== 'all').length;

  return (
    <aside className="sidebar" aria-label="Espaces de travail">
      <div className="sidebar__header">
        <div className="sidebar__title">
          <span>Espaces de production</span>
          <strong>{workspaceCount}</strong>
        </div>
        <p>Choisissez le périmètre du tableau Kanban.</p>
      </div>

      <div className="sidebar__list">
        {loadingWorkspaces ? (
          <div className="sidebar__loading">
            <span />
            <span />
            <span />
          </div>
        ) : options.length === 0 ? (
          <div className="sidebar__empty">
            <strong>Aucun espace</strong>
            <p>Les espaces importés ou créés s’afficheront ici.</p>
          </div>
        ) : (
          options.map((ws) => {
            const id = String(ws.id);
            const active = id === activeId;
            const isAll = ws.id === 'all';
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
                <span className="sidebar__item-icon" aria-hidden />
                <span className="sidebar__item-name">{ws.name}</span>
                {active && <span className="sidebar__item-check">Actif</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="sidebar__divider" />

      <nav className="sidebar__nav" aria-label="Navigation">
        <span className="sidebar__nav-title">Navigation</span>
        <NavLink to="/kanban" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>▤</span> Production
        </NavLink>
        <NavLink to="/dashboard" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>◱</span> Dashboard
        </NavLink>
        <NavLink to="/stock" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>▦</span> Stock
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
