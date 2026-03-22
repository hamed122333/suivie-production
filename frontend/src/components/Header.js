import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Header = () => {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();

  const navLink = (to, label) => (
    <Link
      to={to}
      style={{
        padding: '0.5rem 1rem',
        borderRadius: '6px',
        textDecoration: 'none',
        fontWeight: '500',
        fontSize: '0.9rem',
        background: location.pathname === to ? '#1d4ed8' : 'transparent',
        color: location.pathname === to ? 'white' : '#bfdbfe',
        transition: 'background 0.2s',
      }}
    >
      {label}
    </Link>
  );

  return (
    <header style={{
      background: '#1e40af',
      color: 'white',
      padding: '0 1.5rem',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🏭</span>
          <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>Suivi Production</span>
        </div>
        <nav style={{ display: 'flex', gap: '0.25rem' }}>
          {navLink('/dashboard', '📊 Dashboard')}
          {navLink('/kanban', '📋 Kanban')}
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#bfdbfe' }}>
          👤 {user?.name}
          <span style={{
            marginLeft: '0.5rem',
            padding: '0.1rem 0.4rem',
            background: isAdmin ? '#f59e0b' : '#6b7280',
            borderRadius: '9999px',
            fontSize: '0.7rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            color: 'white',
          }}>
            {user?.role}
          </span>
        </span>
        <button
          onClick={logout}
          style={{
            padding: '0.375rem 0.75rem',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;
