import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getInitials } from '../utils/formatters';
import './Sidebar.css';

const WORKSPACE_ICONS = ['🔷', '🟦', '🟩', '🟧', '🟪', '🟥', '⬛'];

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
  const { isSuperAdmin, canCreateWorkspace, user } = useAuth();
  const { workspaces, workspaceId, selectWorkspace, createWorkspace, loadingWorkspaces } = useWorkspace();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const activeId = workspaceId ? String(workspaceId) : '';
  const roleInfo = getRoleLabel(user?.role);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = (name || '').trim();
    if (trimmed.length < 2) {
      setError('Nom trop court (min. 2 caractères)');
      return;
    }
    setCreating(true);
    try {
      await createWorkspace(trimmed);
      setCreateOpen(false);
      setName('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de créer l\'espace');
    } finally {
      setCreating(false);
    }
  };

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
          <span className="sidebar__title-icon">🗂</span>
          Espaces
        </div>
        {canCreateWorkspace && (
          <button type="button" className="sidebar__create-btn" onClick={() => setCreateOpen(true)} title="Créer un espace">
            +
          </button>
        )}
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
            <span>🗃</span>
            <p>Aucun espace créé</p>
          </div>
        ) : (
          options.map((ws, idx) => {
            const id = String(ws.id);
            const active = id === activeId;
            const isAll = ws.id === 'all';
            const icon = isAll ? '🌐' : WORKSPACE_ICONS[(idx - (isAll ? 0 : 1)) % WORKSPACE_ICONS.length];
            return (
              <button
                type="button"
                key={ws.id}
                className={`sidebar__item ${active ? 'sidebar__item--active' : ''} ${isAll ? 'sidebar__item--all' : ''}`}
                onClick={() => {
                  selectWorkspace(ws.id);
                  if (closeSidebar) closeSidebar();
                }}
              >
                <span className="sidebar__item-icon">{icon}</span>
                <span className="sidebar__item-name">{ws.name}</span>
                {active && <span className="sidebar__item-check">✓</span>}
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
          <span>▦</span> Tableau Kanban
        </NavLink>
        <NavLink to="/dashboard" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
          <span>📊</span> Tableau de bord
        </NavLink>
        {isSuperAdmin && (
          <NavLink to="/users" onClick={closeSidebar} className={({ isActive }) => `sidebar__nav-link ${isActive ? 'sidebar__nav-link--active' : ''}`}>
            <span>👥</span> Utilisateurs
          </NavLink>
        )}
      </nav>

      {/* Modal: Créer un espace */}
      {createOpen && canCreateWorkspace && (
        <div className="modal-overlay" role="dialog" aria-label="Créer un espace de travail">
          <div className="modal-content sidebar-modal">
            <div className="modal-header">
              <h3 className="modal-title">🗂 Nouvel espace</h3>
              <button type="button" className="modal-close" onClick={() => { setCreateOpen(false); setError(''); setName(''); }}>
                ✕
              </button>
            </div>
            <form onSubmit={submit}>
              {error && (
                <div className="sidebar__modal-error">{error}</div>
              )}
              <div className="form-group">
                <label>Nom de l'espace</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Production Ligne 1"
                  autoFocus
                  required
                />
              </div>
              <div className="sidebar__modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setCreateOpen(false); setError(''); setName(''); }}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Création…' : 'Créer l\'espace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
