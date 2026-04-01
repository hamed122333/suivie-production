import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getInitials } from '../utils/formatters';
import './Header.css';

const ROLE_CONFIG = {
  super_admin: { label: 'Suivi', icon: '👁', color: '#7c3aed' },
  planner: { label: 'Planificateur', icon: '📋', color: '#0052cc' },
  commercial: { label: 'Commercial', icon: '🧑‍💼', color: '#b45309' },
  user: { label: 'Utilisateur', icon: '👤', color: '#374151' },
};

const Header = () => {
  const { user, logout, isSuperAdmin, isPlanner } = useAuth();
  const { workspaceId, workspaces } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const roleInfo = ROLE_CONFIG[user?.role] || ROLE_CONFIG.user;

  const activeWorkspace = workspaces?.find(w => String(w.id) === String(workspaceId));
  const wsName = workspaceId === 'all' ? 'Tous les espaces' : (activeWorkspace?.name || '');

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    if (location.pathname !== '/kanban') {
      setSearch('');
      return;
    }

    const params = new URLSearchParams(location.search);
    setSearch(params.get('q') || '');
  }, [location.pathname, location.search]);

  const initials = getInitials(user?.name);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/kanban?q=${encodeURIComponent(q)}` : '/kanban');
  };

  const navItem = (to, label, icon) => {
    const active =
      location.pathname === to ||
      (to === '/kanban' && (location.pathname === '/' || location.pathname === '/kanban'));
    return (
      <Link to={to} className={`header-nav__link ${active ? 'header-nav__link--active' : ''}`}>
        {icon && <span className="header-nav__icon" aria-hidden>{icon}</span>}
        {label}
      </Link>
    );
  };

  return (
    <header className="app-header">
      <div className="app-header__top">
        {/* Brand */}
        <div className="app-header__brand">
          <Link to="/kanban" className="app-header__logo" title="Suivi Production">
            <span className="app-header__logo-icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="2" fill="#0052CC" />
                <rect x="13" y="3" width="8" height="8" rx="2" fill="#2684FF" />
                <rect x="3" y="13" width="8" height="8" rx="2" fill="#2684FF" />
                <rect x="13" y="13" width="8" height="8" rx="2" fill="#B3D4FF" />
              </svg>
            </span>
            <div className="app-header__brand-text">
              <span className="app-header__title">Suivi Production</span>
              {wsName && (
                <span className="app-header__workspace-tag">{wsName}</span>
              )}
            </div>
          </Link>
        </div>

        {/* Search */}
        <form className="app-header__search" onSubmit={submitSearch} role="search">
          <span className="app-header__search-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Rechercher une tâche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Recherche"
          />
          {search && (
            <button
              type="button"
              className="app-header__search-clear"
              onClick={() => {
                setSearch('');
                if (location.pathname === '/kanban') {
                  navigate('/kanban');
                }
              }}
              aria-label="Effacer"
            >
              ✕
            </button>
          )}
        </form>

        {/* Actions */}
        <div className="app-header__actions">
          {/* Notifications placeholder */}
          <button type="button" className="app-header__icon-btn" title="Actualiser la page" onClick={() => window.location.reload()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
          </button>

          {/* User menu */}
          <div className="app-header__user-wrap" ref={menuRef}>
            <button
              type="button"
              className="app-header__avatar"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              title={user?.name}
              style={{ background: `linear-gradient(135deg, ${roleInfo.color}33, ${roleInfo.color}66)`, color: roleInfo.color, border: `2px solid ${roleInfo.color}33` }}
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="app-header__dropdown" role="menu">
                <div className="app-header__dropdown-user">
                  <div className="app-header__dropdown-avatar" style={{ background: roleInfo.color }}>
                    {initials}
                  </div>
                  <div>
                    <strong>{user?.name}</strong>
                    <span className="app-header__dropdown-role">
                      {roleInfo.icon} {roleInfo.label}
                    </span>
                    <span className="app-header__dropdown-email">{user?.email}</span>
                  </div>
                </div>
                <div className="app-header__dropdown-divider" />
                {isSuperAdmin && (
                  <Link to="/users" className="app-header__dropdown-item" onClick={() => setMenuOpen(false)}>
                    👥 Gestion des utilisateurs
                  </Link>
                )}
                <button
                  type="button"
                  className="app-header__dropdown-item app-header__dropdown-item--danger"
                  onClick={() => { logout(); setMenuOpen(false); }}
                >
                  🚪 Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="header-nav" aria-label="Navigation principale">
        {navItem('/kanban', 'Tableau', '▦')}
        {navItem('/dashboard', 'Tableau de bord', '📊')}
        {(isSuperAdmin || isPlanner) && navItem('/reports', 'Rapports', '📑')}
        {isSuperAdmin && navItem('/users', 'Utilisateurs', '👥')}
      </nav>
    </header>
  );
};

export default Header;
