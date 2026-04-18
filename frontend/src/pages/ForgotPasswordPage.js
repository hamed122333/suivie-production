import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await authAPI.forgotPassword(email);
      setMessage(response.data?.message || 'Si votre email existe, un lien a été envoyé.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la demande.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a1929', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.25rem' }}>
        <h1 style={{ color: '#f1f5f9', marginTop: 0 }}>Mot de passe oublié</h1>
        <p style={{ color: '#94a3b8', marginTop: 0 }}>Entrez votre email pour recevoir un lien de réinitialisation.</p>

        {message ? <div style={{ marginBottom: '1rem', color: '#86efac' }}>{message}</div> : null}
        {error ? <div style={{ marginBottom: '1rem', color: '#fca5a5' }}>{error}</div> : null}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="votre@email.com"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#f8fafc', marginBottom: '0.75rem' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: '#2563eb', color: 'white', fontWeight: 700 }}
          >
            {loading ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>

        <div style={{ marginTop: '1rem' }}>
          <Link to="/login" style={{ color: '#93c5fd' }}>Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
