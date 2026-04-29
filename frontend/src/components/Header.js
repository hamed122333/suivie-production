import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { notificationAPI } from '../services/api';
import { getInitials } from '../utils/formatters';
import logo from '../assets/logo.png';
import './Header.css';

const ROLE_CONFIG = {
  super_admin: { label: 'Suivi', icon: '✦', color: '#7c3aed' },
  planner: { label: 'Planificateur', icon: '⚙', color: '#0052cc' },
  commercial: { label: 'Commercial', icon: '✉', color: '#b45309' },
  user: { label: 'Utilisateur', icon: '○', color: '#374151' },
};
const NOTIFICATION_POLL_INTERVAL_MS = 30000;

function formatNotificationTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  const formatter = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  if (Math.abs(diffDays) < 7) return formatter.format(diffDays, 'day');

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

const Header = ({ toggleSidebar, isSidebarOpen }) => {
  const { user, logout, isSuperAdmin, isPlanner } = useAuth();
  const { workspaceId, workspaces, selectWorkspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
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

  const initials = getInitials(user?.name);

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
              <img src={logo} alt="" />
            </span>
            <div className="app-header__brand-text">
              <span className="app-header__title">Suivi Production</span>
              {wsName && (
                <span className="app-header__workspace-tag">{wsName}</span>
              )}
            </div>
          </Link>
        </div>

        {/* Actions */}
        <div className="app-header__actions">
          {canViewNotifications && (
            <div className="app-header__notif-wrap" ref={notifRef}>
              <button
                type="button"
                className={`app-header__icon-btn app-header__notif-btn ${notifOpen ? 'app-header__icon-btn--active' : ''}`}
                title="Notifications"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} non lues` : ''}`}
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
                    <div>
                      <strong>Notifications</strong>
                      <span>{unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est à jour'}</span>
                    </div>
                    {unreadCount > 0 && (
                      <button type="button" className="app-header__notif-mark-all" onClick={handleMarkAllRead}>
                        Tout lire
                      </button>
                    )}
                  </div>

                  <div className="app-header__notif-list">
                    {notifLoading ? (
                      <div className="app-header__notif-loading" aria-label="Chargement des notifications">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="app-header__notif-empty">
                        <span aria-hidden>✓</span>
                        <strong>Aucune notification</strong>
                        <p>Les alertes de production apparaitront ici.</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          type="button"
                          key={notification.id}
                          className={`app-header__notif-item ${notification.is_read ? '' : 'app-header__notif-item--unread'}`}
                          onClick={() => handleOpenNotification(notification)}
                        >
                          <span className="app-header__notif-status" aria-hidden />
                          <div className="app-header__notif-content">
                            <div className="app-header__notif-row">
                              <span className="app-header__notif-title">{notification.title}</span>
                              {!notification.is_read && <span className="app-header__notif-pill">Nouveau</span>}
                            </div>
                            <div className="app-header__notif-body">{notification.body}</div>
                            <div className="app-header__notif-meta">
                              {notification.workspace_name && <span>{notification.workspace_name}</span>}
                              <time dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
        {navItem('/kanban', 'Production', '▤')}
        {navItem('/dashboard', 'Dashboard', '◱')}
        {navItem('/stock', 'Stock', '▦')}
        {isSuperAdmin && navItem('/users', 'Utilisateurs', '👤')}
      </nav>
    </header>
  );
};

export default Header;
