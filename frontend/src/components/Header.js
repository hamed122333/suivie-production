import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { notificationAPI } from '../services/api';
import { getInitials } from '../utils/formatters';
import './Header.css';

const ROLE_CONFIG = {
  super_admin: { label: 'Suivi', icon: '✦', color: '#7c3aed' },
  planner: { label: 'Planificateur', icon: '⚙', color: '#0052cc' },
  commercial: { label: 'Commercial', icon: '✉', color: '#b45309' },
  user: { label: 'Utilisateur', icon: '○', color: '#374151' },
};
const NOTIFICATION_POLL_INTERVAL_MS = 30000;

const Header = ({ toggleSidebar, isSidebarOpen }) => {
  const { user, logout, isSuperAdmin, isPlanner } = useAuth();
  const { workspaceId, workspaces, selectWorkspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const canViewNotifications = isSuperAdmin || isPlanner;

  const roleInfo = ROLE_CONFIG[user?.role] || ROLE_CONFIG.user;

  const activeWorkspace = workspaces?.find(w => String(w.id) === String(workspaceId));
  const wsName = workspaceId === 'all' ? 'Tous les espaces' : (activeWorkspace?.name || '');

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!canViewNotifications) return;
    setNotifLoading(true);
    try {
      const response = await notificationAPI.getAll({ page: 1, perPage: 10 });
      setNotifications(response.data?.items || []);
      setUnreadCount(response.data?.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setNotifLoading(false);
    }
  }, [canViewNotifications]);

  useEffect(() => {
    if (!canViewNotifications) return;
    loadNotifications();

    const interval = window.setInterval(loadNotifications, NOTIFICATION_POLL_INTERVAL_MS);
    const onFocus = () => loadNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [canViewNotifications, loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setNotifications((prev) => prev.map((entry) => ({ ...entry, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read', err);
    }
  };

  const handleOpenNotification = async (notification) => {
    if (!notification.is_read) {
      try {
        await notificationAPI.markRead(notification.id);
        setNotifications((prev) =>
          prev.map((entry) =>
            entry.id === notification.id
              ? { ...entry, is_read: true, read_at: entry.read_at || new Date().toISOString() }
              : entry
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Failed to mark notification as read', err);
      }
    }

    // Changer le workspace vers celui associé à la notification
    if (notification.workspace_id) {
      selectWorkspace(notification.workspace_id);
    }
    
    // Seulement naviguer vers la page Kanban, sans ouvrir le volet de détail
    navigate('/kanban');
    setNotifOpen(false);
  };

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

        {/* Toggle Sidebar Button (Mobile Only) */}
        <button
          className="app-header__hamburger"
          onClick={toggleSidebar}
          aria-label="Menu"
          aria-expanded={isSidebarOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isSidebarOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </>
            ) : (
              <>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </>
            )}
          </svg>
        </button>

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
          {canViewNotifications && (
            <div className="app-header__notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="app-header__icon-btn"
                title="Notifications"
                aria-label="Notifications"
                onClick={() => {
                  const nextState = !notifOpen;
                  setNotifOpen(nextState);
                  if (nextState) loadNotifications();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v3.2c0 .53-.21 1.04-.59 1.4L4 17h5" />
                  <path d="M9 17a3 3 0 0 0 6 0" />
                </svg>
                {unreadCount > 0 && <span className="app-header__notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>

              {notifOpen && (
                <div className="app-header__notif-dropdown">
                  <div className="app-header__notif-head">
                    <strong>Notifications</strong>
                    {unreadCount > 0 && (
                      <button type="button" className="app-header__notif-mark-all" onClick={handleMarkAllRead}>
                        Tout lire
                      </button>
                    )}
                  </div>

                  <div className="app-header__notif-list">
                    {notifLoading ? (
                      <div className="app-header__notif-empty">Chargement...</div>
                    ) : notifications.length === 0 ? (
                      <div className="app-header__notif-empty">Aucune notification.</div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          type="button"
                          key={notification.id}
                          className={`app-header__notif-item ${notification.is_read ? '' : 'app-header__notif-item--unread'}`}
                          onClick={() => handleOpenNotification(notification)}
                        >
                          <div className="app-header__notif-title">{notification.title}</div>
                          <div className="app-header__notif-body">{notification.body}</div>
                          <div className="app-header__notif-meta">
                            {notification.workspace_name ? `${notification.workspace_name} • ` : ''}
                            {new Date(notification.created_at).toLocaleString('fr-FR')}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
                    👤 Gestion des utilisateurs
                  </Link>
                )}
                <button
                  type="button"
                  className="app-header__dropdown-item app-header__dropdown-item--danger"
                  onClick={() => { logout(); setMenuOpen(false); }}
                >
                  ⎋ Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="header-nav" aria-label="Navigation principale">
        {navItem('/kanban', 'Tableau', '▤')}
        {navItem('/dashboard', 'Tableau de bord', '◱')}
        {isSuperAdmin && navItem('/users', 'Utilisateurs', '👤')}
      </nav>
    </header>
  );
};

export default Header;
