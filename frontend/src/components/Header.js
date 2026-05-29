import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { notificationAPI, taskAPI } from '../services/api';
import { formatRelativeDate, getInitials } from '../utils/formatters';
import useServerEvents from '../hooks/useServerEvents';
import logo from '../assets/logo.png';
import './Header.css';

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', icon: '✦', color: '#7c3aed' },
  planner:     { label: 'Planificateur', icon: '⚙', color: '#0052cc' },
  commercial:  { label: 'Commercial', icon: '✉', color: '#b45309' },
  livreur:     { label: 'Livreur', icon: '🚚', color: '#065f46' },
  user:        { label: 'Utilisateur', icon: '○', color: '#374151' },
};
// SSE handles real-time — polling is only a long-interval safety net (H2 fix: no 429)
const NOTIFICATION_POLL_INTERVAL_MS = 60000;

const Header = () => {
  const { user, logout, isSuperAdmin, isPlanner, isCommercial, isLivreur } = useAuth();
  // Keep workspace context imported for notification navigation (selectWorkspace)
  const { selectWorkspace } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const canViewNotifications = isSuperAdmin || isPlanner || isCommercial || isLivreur;
  const canViewPending = isCommercial;
  const [pendingCount, setPendingCount] = useState(0);

  const roleInfo = ROLE_CONFIG[user?.role] || ROLE_CONFIG.user;

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
    // Long-interval fallback only — SSE (notifications-updated) handles real-time delivery
    const interval = window.setInterval(loadNotifications, NOTIFICATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [canViewNotifications, loadNotifications]);

  // Pending approval count for nav badge
  useEffect(() => {
    if (!canViewPending) return;
    const load = async () => {
      try {
        const res = await taskAPI.getPendingApproval();
        setPendingCount(res.data?.length || 0);
      } catch (_) {}
    };
    load();
    const timer = window.setInterval(load, NOTIFICATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canViewPending]);

  // Real-time notifications via SSE
  useServerEvents({
    'notifications-updated': () => loadNotifications(),
  });

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

    setNotifOpen(false);
    // Switch workspace context synchronously before navigating
    if (notification.workspace_id) {
      selectWorkspace(notification.workspace_id);
    }

    // Route to the most relevant page based on notification type
    const taskId = notification.task_id;
    if (notification.type === 'task_created' || notification.type === 'orders_imported') {
      navigate('/my-orders');
    } else if (notification.type === 'ready_to_deliver') {
      // Livreur: go straight to kanban scoped to DONE column
      navigate(taskId ? `/kanban?taskId=${taskId}` : '/kanban');
    } else {
      navigate(taskId ? `/kanban?taskId=${taskId}` : '/kanban');
    }
  };

  const initials = getInitials(user?.name);

  const navItem = (to, label, icon, badge = 0) => {
    const active =
      location.pathname === to ||
      (to === '/kanban' && (location.pathname === '/' || location.pathname === '/kanban'));
    return (
      <Link to={to} className={`header-nav__link ${active ? 'header-nav__link--active' : ''}`}>
        {icon && <span className="header-nav__icon" aria-hidden>{icon}</span>}
        {label}
        {badge > 0 && <span className="header-nav__badge">{badge > 99 ? '99+' : badge}</span>}
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
              <img src={logo} alt="" />
            </span>
            <div className="app-header__brand-text">
              <span className="app-header__title">Suivi Production</span>
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
                              <time dateTime={notification.created_at}>{formatRelativeDate(notification.created_at)}</time>
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
                    ◉ Gestion des utilisateurs
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
        {isSuperAdmin && navItem('/pending-orders', 'Commandes importées', '☰', pendingCount)}
        {canViewPending && navItem('/my-orders', 'Mes commandes', '◈', pendingCount)}
        {navItem('/dashboard', 'Dashboard', '◱')}
        {navItem('/stock', 'Stock', '▦')}
        {isSuperAdmin && navItem('/users', 'Utilisateurs', '◉')}
      </nav>
    </header>
  );
};

export default Header;
