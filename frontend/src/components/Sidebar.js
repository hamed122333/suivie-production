import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getInitials } from '../utils/formatters';
import './Sidebar.css';

const WORKSPACE_ICONS = {
  STANDARD: '●',
  PLANNED: '◷',
  URGENT: '⚠',
};

const FALLBACK_ICONS = ['●', '○', '◎', '◉', '◌', '◍', '⚙'];

const WORKSPACE_TYPE_OPTIONS = [
  { value: 'STANDARD', label: '📦 Standard — lié aux produits finis', shortLabel: 'Standard' },
  { value: 'PLANNED', label: '📅 Planifié — date ultérieure, non limité', shortLabel: 'Planifié' },
  { value: 'URGENT', label: '🚨 Urgent — commandes très urgentes', shortLabel: 'Urgent' },
];

const getRoleLabel = (role) => {
  const labels = {
    super_admin: { label: 'Suivi', color: '#7c3aed', bg: '#ede9fe' },
    planner: { label: 'Planificateur', color: '#0052cc', bg: '#deebff' },
    commercial: { label: 'Commercial', color: '#b45309', bg: '#fef3c7' },
    user: { label: 'Utilisateur', color: '#374151', bg: '#f3f4f6' },
  };
  return labels[role] || labels.user;
};

const EMPTY_FORM = { name: '', type: 'STANDARD', plannedDate: '' };

const Sidebar = ({ closeSidebar }) => {
  const { isSuperAdmin, canCreateWorkspace, user } = useAuth();
  const { workspaces, workspaceId, selectWorkspace, createWorkspace, loadingWorkspaces } = useWorkspace();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const activeId = workspaceId ? String(workspaceId) : '';
  const roleInfo = getRoleLabel(user?.role);

  const closeModal = () => {
    setCreateOpen(false);
    setError('');
    setForm(EMPTY_FORM);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = (form.name || '').trim();
    if (trimmed.length < 2) {
      setError('Nom trop court (min. 2 caractères)');
      return;
    }
    if (form.type === 'PLANNED' && !form.plannedDate) {
      setError('La date planifiée est requise pour un espace Planifié');
      return;
    }
    setCreating(true);
    try {
      await createWorkspace({ name: trimmed, type: form.type, plannedDate: form.plannedDate || null });
      closeModal();
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
          <span className="sidebar__title-icon">⊞</span>
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
            <span>⚲</span>
            <p>Aucun espace créé</p>
          </div>
        ) : (
          options.map((ws, idx) => {
            const id = String(ws.id);
            const active = id === activeId;
            const isAll = ws.id === 'all';
            const wsType = ws.workspace_type || 'STANDARD';
            let icon;
            if (isAll) {
              icon = '⌂';
            } else if (wsType === 'URGENT') {
              icon = WORKSPACE_ICONS.URGENT;
            } else if (wsType === 'PLANNED') {
              icon = WORKSPACE_ICONS.PLANNED;
            } else {
              icon = FALLBACK_ICONS[(idx - (isAll ? 0 : 1)) % FALLBACK_ICONS.length];
            }
            return (
              <button
                type="button"
                key={ws.id}
                className={`sidebar__item ${active ? 'sidebar__item--active' : ''} ${isAll ? 'sidebar__item--all' : ''} ${wsType === 'URGENT' ? 'sidebar__item--urgent' : ''} ${wsType === 'PLANNED' ? 'sidebar__item--planned' : ''}`}
                onClick={() => {
                  selectWorkspace(ws.id);
                  if (closeSidebar) closeSidebar();
                }}
              >
                <span className="sidebar__item-icon">{icon}</span>
                <span className="sidebar__item-name">{ws.name}</span>
                {!isAll && wsType !== 'STANDARD' && (
                  <span className={`sidebar__item-type-badge sidebar__item-type-badge--${wsType.toLowerCase()}`}>
                    {wsType === 'URGENT' ? 'Urgent' : 'Planifié'}
                  </span>
                )}
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
            <span>👤</span> Utilisateurs
          </NavLink>
        )}
      </nav>

      {/* Modal: Créer un espace */}
      {createOpen && canCreateWorkspace && (
        <div className="modal-overlay" role="dialog" aria-label="Créer un espace de travail">
          <div className="modal-content sidebar-modal">
            <div className="modal-header">
              <h3 className="modal-title">⊞ Nouvel espace</h3>
              <button type="button" className="modal-close" onClick={closeModal}>
                ✕
              </button>
            </div>
            <form onSubmit={submit}>
              {error && (
                <div className="sidebar__modal-error">{error}</div>
              )}

              {/* Type d'espace */}
              <div className="form-group">
                <label>Type d'espace</label>
                <div className="sidebar__type-options">
                  {WORKSPACE_TYPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`sidebar__type-option sidebar__type-option--${opt.value.toLowerCase()} ${form.type === opt.value ? 'sidebar__type-option--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="workspace_type"
                        value={opt.value}
                        checked={form.type === opt.value}
                        onChange={() => setForm((f) => ({ ...f, type: opt.value, plannedDate: '' }))}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                {/* Description contextuelle selon le type */}
                {form.type === 'STANDARD' && (
                  <p className="sidebar__type-hint">
                    📦 Les commandes de cet espace seront liées à la liste des produits finis importés depuis le stock.
                  </p>
                )}
                {form.type === 'PLANNED' && (
                  <p className="sidebar__type-hint">
                    📅 Cet espace est destiné aux commandes planifiées à une date ultérieure, sans restriction de stock.
                  </p>
                )}
                {form.type === 'URGENT' && (
                  <p className="sidebar__type-hint sidebar__type-hint--urgent">
                    🚨 Espace dédié aux commandes très urgentes. Il sera clairement mis en évidence pour une identification rapide.
                  </p>
                )}
              </div>

              {/* Nom de l'espace */}
              <div className="form-group">
                <label>Nom de l'espace</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={
                    form.type === 'URGENT' ? 'Ex: Urgences Semaine 42' :
                    form.type === 'PLANNED' ? 'Ex: Production Mai 2025' :
                    'Ex: Production Ligne 1'
                  }
                  autoFocus
                  required
                />
              </div>

              {/* Date planifiée (uniquement pour le type PLANNED) */}
              {form.type === 'PLANNED' && (
                <div className="form-group">
                  <label>Date planifiée <span className="sidebar__required">*</span></label>
                  <input
                    type="date"
                    value={form.plannedDate}
                    onChange={(e) => setForm((f) => ({ ...f, plannedDate: e.target.value }))}
                    required
                  />
                </div>
              )}

              <div className="sidebar__modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Annuler
                </button>
                <button type="submit" className={`btn btn-primary${form.type === 'URGENT' ? ' btn-urgent' : ''}`} disabled={creating}>
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
