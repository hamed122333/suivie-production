import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Token manquant.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.resetPassword(token, password);
      setMessage(response.data?.message || 'Mot de passe mis à jour.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de réinitialiser le mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a1929', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem' }}>
        <h1 style={{ color: '#f1f5f9', marginTop: 0 }}>Réinitialiser le mot de passe</h1>
        <p style={{ color: '#94a3b8', marginTop: 0 }}>Entrez votre nouveau mot de passe.</p>

        {message ? <div style={{ marginBottom: '1rem', color: '#86efac' }}>{message}</div> : null}
        {error ? <div style={{ marginBottom: '1rem', color: '#fca5a5' }}>{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nouveau mot de passe"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#f8fafc', marginBottom: '0.75rem' }}
          />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirmer le mot de passe"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#f8fafc', marginBottom: '0.75rem' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: '#2563eb', color: 'white', fontWeight: 700 }}
          >
            {loading ? 'Mise à jour...' : 'Mettre à jour'}
          </button>
        </form>

        <div style={{ marginTop: '1rem' }}>
          <Link to="/login" style={{ color: '#93c5fd' }}>Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
