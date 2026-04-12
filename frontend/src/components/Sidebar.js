import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getInitials } from '../utils/formatters';
import './Sidebar.css';

// ─── Type configuration ──────────────────────────────────────────────────────
const WORKSPACE_TYPES = {
  STOCK: {
    icon: '📦',
    label: 'Stock',
    title: 'En Stock',
    description: 'Lié à la liste des produits finis disponibles importés depuis le fichier xlsx.',
    color: '#059669',
    bg: 'rgba(5,150,105,0.15)',
    badgeBg: 'rgba(5,150,105,0.2)',
    badgeColor: '#6ee7b7',
    avatarBg: '#065f46',
  },
  PREPARATION: {
    icon: '🔄',
    label: 'Préparation',
    title: 'En Préparation',
    description: 'Produits importés du fichier xlsx en cours de préparation (date de disponibilité à venir).',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.15)',
    badgeBg: 'rgba(37,99,235,0.2)',
    badgeColor: '#93c5fd',
    avatarBg: '#1e3a8a',
  },
  RUPTURE: {
    icon: '🚨',
    label: 'Rupture',
    title: 'Rupture de Stock',
    description: 'Produits absents du stock ou en rupture — commandes nécessitant une production urgente.',
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.15)',
    badgeBg: 'rgba(220,38,38,0.2)',
    badgeColor: '#fca5a5',
    avatarBg: '#7f1d1d',
  },
};

const WORKSPACE_TYPE_OPTIONS = [
  { value: 'STOCK', ...WORKSPACE_TYPES.STOCK },
  { value: 'PREPARATION', ...WORKSPACE_TYPES.PREPARATION },
  { value: 'RUPTURE', ...WORKSPACE_TYPES.RUPTURE },
];

// ─── Role labels ─────────────────────────────────────────────────────────────
const getRoleLabel = (role) => {
  const labels = {
    super_admin: { label: 'Suivi', color: '#7c3aed', bg: '#ede9fe' },
    planner: { label: 'Planificateur', color: '#0052cc', bg: '#deebff' },
    commercial: { label: 'Commercial', color: '#b45309', bg: '#fef3c7' },
    user: { label: 'Utilisateur', color: '#374151', bg: '#f3f4f6' },
  };
  return labels[role] || labels.user;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function wsInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const EMPTY_FORM = { name: '', type: 'STOCK', plannedDate: '' };

// ─── Component ───────────────────────────────────────────────────────────────
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
    if (form.type === 'PREPARATION' && !form.plannedDate) {
      setError('La date de préparation est requise pour ce type d\'espace');
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

  const selectedTypeCfg = WORKSPACE_TYPES[form.type] || WORKSPACE_TYPES.STOCK;
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
          options.map((ws) => {
            const id = String(ws.id);
            const active = id === activeId;
            const isAll = ws.id === 'all';
            const wsType = (ws.workspace_type || 'STOCK').toUpperCase();
            const typeCfg = WORKSPACE_TYPES[wsType];

            return (
              <button
                type="button"
                key={ws.id}
                className={`sidebar__item ${active ? 'sidebar__item--active' : ''} ${isAll ? 'sidebar__item--all' : ''}`}
                style={!isAll && typeCfg ? { borderLeftColor: typeCfg.color } : undefined}
                onClick={() => {
                  selectWorkspace(ws.id);
                  if (closeSidebar) closeSidebar();
                }}
              >
                {isAll ? (
                  <span className="sidebar__item-icon">⌂</span>
                ) : (
                  <span
                    className="sidebar__ws-avatar"
                    style={{ background: typeCfg?.avatarBg || '#1e3a8a' }}
                    title={typeCfg ? `Type: ${typeCfg.title}` : ''}
                  >
                    {wsInitials(ws.name)}
                  </span>
                )}

                <span className="sidebar__item-body">
                  <span className="sidebar__item-name">{ws.name}</span>
                  {!isAll && ws.creator_name && (
                    <span className="sidebar__item-creator">par {ws.creator_name}</span>
                  )}
                </span>

                {!isAll && typeCfg && (
                  <span
                    className="sidebar__item-type-badge"
                    style={{ background: typeCfg.badgeBg, color: typeCfg.badgeColor }}
                    title={typeCfg.title}
                  >
                    {typeCfg.icon}
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

      {/* ── Modal: Créer un espace ─────────────────────────────────────── */}
      {createOpen && canCreateWorkspace && (
        <div className="modal-overlay" role="dialog" aria-label="Créer un espace de travail">
          <div className="modal-content sidebar-modal">
            <div className="modal-header">
              <h3 className="modal-title">⊞ Nouvel espace</h3>
              <button type="button" className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={submit}>
              {error && <div className="sidebar__modal-error">{error}</div>}

              {/* ── Sélection du type ── */}
              <div className="form-group">
                <label>Type d'espace</label>
                <div className="ws-type-grid">
                  {WORKSPACE_TYPE_OPTIONS.map((opt) => {
                    const selected = form.type === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`ws-type-card ${selected ? 'ws-type-card--selected' : ''}`}
                        style={selected ? { borderColor: opt.color, background: opt.bg } : undefined}
                      >
                        <input
                          type="radio"
                          name="workspace_type"
                          value={opt.value}
                          checked={selected}
                          onChange={() => setForm((f) => ({ ...f, type: opt.value, plannedDate: '' }))}
                        />
                        <span className="ws-type-card__icon">{opt.icon}</span>
                        <span className="ws-type-card__label" style={selected ? { color: opt.color } : undefined}>
                          {opt.title}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Description contextuelle */}
                <p className="ws-type-hint" style={{ borderLeftColor: selectedTypeCfg.color }}>
                  {selectedTypeCfg.icon} {selectedTypeCfg.description}
                </p>
              </div>

              {/* ── Nom de l'espace ── */}
              <div className="form-group">
                <label>Nom de l'espace</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={
                    form.type === 'RUPTURE' ? 'Ex: Rupture Semaine 42' :
                    form.type === 'PREPARATION' ? 'Ex: Prépa Mai 2025' :
                    'Ex: Stock Ligne 1'
                  }
                  autoFocus
                  required
                />
                {form.name.trim().length >= 2 && (
                  <div className="ws-name-preview">
                    <span
                      className="ws-name-preview__avatar"
                      style={{ background: selectedTypeCfg.avatarBg }}
                    >
                      {wsInitials(form.name)}
                    </span>
                    <span className="ws-name-preview__text">{form.name.trim()}</span>
                    {user?.name && <span className="ws-name-preview__by">par {user.name}</span>}
                  </div>
                )}
              </div>

              {/* ── Date de préparation (PREPARATION uniquement) ── */}
              {form.type === 'PREPARATION' && (
                <div className="form-group">
                  <label>
                    Date de disponibilité prévue <span className="sidebar__required">*</span>
                  </label>
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={creating ? undefined : { background: selectedTypeCfg.color, borderColor: selectedTypeCfg.color }}
                  disabled={creating}
                >
                  {creating ? 'Création…' : `Créer l'espace ${selectedTypeCfg.icon}`}
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
