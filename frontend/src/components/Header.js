import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Header.css';

const Header = () => {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const initials =
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';

  const submitSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (location.pathname === '/kanban') {
      navigate(q ? `/kanban?q=${encodeURIComponent(q)}` : '/kanban');
    } else {
      navigate(q ? `/kanban?q=${encodeURIComponent(q)}` : '/kanban');
    }
  };

  const navItem = (to, label, icon) => {
    const active =
      location.pathname === to ||
      (to === '/kanban' && (location.pathname === '/' || location.pathname === '/kanban'));
    return (
      <Link
        to={to}
        className={`header-nav__link ${active ? 'header-nav__link--active' : ''}`}
      >
        {icon && <span className="header-nav__icon" aria-hidden>{icon}</span>}
        {label}
      </Link>
    );
  };

  return (
    <header className="app-header">
      <div className="app-header__top">
        <div className="app-header__brand">
          <Link to="/kanban" className="app-header__logo" title="Suivi Production">
            <span className="app-header__logo-icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="8" height="8" rx="2" fill="#0052CC" />
                <rect x="13" y="3" width="8" height="8" rx="2" fill="#2684FF" />
                <rect x="3" y="13" width="8" height="8" rx="2" fill="#2684FF" />
                <rect x="13" y="13" width="8" height="8" rx="2" fill="#B3D4FF" />
              </svg>
            </span>
            <span className="app-header__title">Suivi Production</span>
          </Link>
        </div>

        <form className="app-header__search" onSubmit={submitSearch} role="search">
          <span className="app-header__search-icon" aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Créer ou rechercher une tâche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Recherche"
          />
        </form>

        <div className="app-header__actions">
          <button
            type="button"
            className="app-header__icon-btn"
            title="Actualiser"
            onClick={() => window.location.reload()}
          >
            ↻
          </button>
          <div className="app-header__user-wrap" ref={menuRef}>
            <button
              type="button"
              className="app-header__avatar"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              title={user?.name}
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="app-header__dropdown" role="menu">
                <div className="app-header__dropdown-user">
                  <strong>{user?.name}</strong>
                  <span className="app-header__dropdown-role">
                    {isAdmin ? 'Administrateur' : 'Utilisateur'}
                  </span>
                </div>
                <button type="button" className="app-header__dropdown-item" onClick={() => { logout(); setMenuOpen(false); }}>
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="header-nav" aria-label="Navigation principale">
        {navItem('/kanban', 'Tableau', '▦')}
        {navItem('/dashboard', 'Graphiques', '📊')}
        {navItem('/reports', 'Rapports', '📑')}
      </nav>
    </header>
  );
};

export default Header;
