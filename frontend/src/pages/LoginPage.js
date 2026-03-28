import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'admin@example.com', password: 'admin123', icon: '👑', color: '#7c3aed', desc: 'Gestion complète' },
  { role: 'Planificateur', email: 'planner@example.com', password: 'admin123', icon: '📋', color: '#0052cc', desc: 'Gestion des statuts' },
  { role: 'Commercial', email: 'commercial@example.com', password: 'admin123', icon: '🧑‍💼', color: '#b45309', desc: 'Création tâches' },
];

const LoginPage = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.login(form.email, form.password);
      login(response.data.user, response.data.token);
      navigate('/kanban');
    } catch (err) {
      setError(err.response?.data?.error || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (email, password) => {
    setForm({ email, password });
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1929 0%, #0d2137 50%, #0f2b47 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      padding: '1rem',
    }}>
      {/* Decorative background blobs */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0
      }}>
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(0,82,204,0.12)', filter: 'blur(80px)', top: '-100px', left: '-100px' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(124,58,237,0.1)', filter: 'blur(60px)', bottom: '10%', right: '5%' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '420px' }}>
        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: '2.5rem',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        }}>
          {/* Logo & Title */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #0052cc, #2684ff)',
              marginBottom: '1rem',
              boxShadow: '0 8px 24px rgba(0,82,204,0.4)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="2" fill="white" fillOpacity="0.9" />
                <rect x="13" y="3" width="8" height="8" rx="2" fill="white" fillOpacity="0.6" />
                <rect x="3" y="13" width="8" height="8" rx="2" fill="white" fillOpacity="0.6" />
                <rect x="13" y="13" width="8" height="8" rx="2" fill="white" fillOpacity="0.3" />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f1f5f9', margin: '0 0 0.3rem', letterSpacing: '-0.02em' }}>
              Suivi Production
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
              Plateforme de gestion des tâches
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              color: '#fca5a5',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.78rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="votre@email.com"
                required
                style={{
                  width: '100%', padding: '0.7rem 0.9rem',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.78rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Mot de passe
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', padding: '0.7rem 0.9rem',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.8rem',
                background: loading ? 'rgba(37,99,235,0.5)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.95rem',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
                transition: 'all 0.2s',
                letterSpacing: '0.01em',
              }}
            >
              {loading ? '⏳ Connexion…' : '🔐 Se connecter'}
            </button>
          </form>

          {/* Demo accounts */}
          <div style={{ marginTop: '1.75rem' }}>
            <p style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600', marginBottom: '0.6rem', textAlign: 'center' }}>
              Comptes de démonstration
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc.email, acc.password)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 0.875rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s, border-color 0.15s',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
                >
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: `${acc.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                    {acc.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#e2e8f0' }}>{acc.role}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{acc.desc} · {acc.email}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: '#334155' }}>
          Suivi Production © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
