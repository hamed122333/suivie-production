import React, { useState, useEffect } from 'react';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import './UsersPage.css';

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', icon: '👑', color: '#7c3aed', bg: '#ede9fe' },
  planner: { label: 'Planificateur', icon: '📋', color: '#0052cc', bg: '#deebff' },
  commercial: { label: 'Commercial', icon: '🧑‍💼', color: '#b45309', bg: '#fef3c7' },
  user: { label: 'Utilisateur', icon: '👤', color: '#374151', bg: '#f3f4f6' },
};

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const UsersPage = () => {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await userAPI.getAll();
      setUsers(res.data);
    } catch (err) {
      console.error('Erreur chargement utilisateurs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    if (isSuperAdmin) fetchUsers(); 
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return <Navigate to="/kanban" replace />;

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('Tous les champs sont obligatoires');
      return;
    }
    setCreating(true);
    try {
      await userAPI.create(form);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'user' });
      fetchUsers();
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Impossible de créer l\'utilisateur');
    } finally {
      setCreating(false);
    }
  };

  const filtered = users.filter(u =>
    !search.trim() ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="users-page">
      <div className="users-page__header">
        <div>
          <h1 className="users-page__title">👥 Gestion des utilisateurs</h1>
          <p className="users-page__subtitle">{users.length} utilisateur{users.length !== 1 ? 's' : ''} dans le système</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nouvel utilisateur
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="users-page__search-wrap">
        <input
          type="search"
          className="users-page__search"
          placeholder="Rechercher par nom ou email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="users-page__loading">
          <div className="users-page__spinner" />
          <p>Chargement des utilisateurs…</p>
        </div>
      ) : (
        <div className="users-page__table-wrap">
          {filtered.length === 0 ? (
            <div className="users-page__empty">
              <div className="users-page__empty-icon">🔍</div>
              <p>Aucun utilisateur trouvé</p>
            </div>
          ) : (
            <table className="users-page__table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Créé le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const role = ROLE_CONFIG[u.role] || ROLE_CONFIG.user;
                  const date = u.created_at
                    ? new Date(u.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="users-page__user-cell">
                          <div className="users-page__avatar" style={{ background: role.bg, color: role.color }}>
                            {initials(u.name)}
                          </div>
                          <span className="users-page__name">{u.name}</span>
                        </div>
                      </td>
                      <td className="users-page__email">{u.email}</td>
                      <td>
                        <span className="users-page__role-badge" style={{ background: role.bg, color: role.color }}>
                          {role.icon} {role.label}
                        </span>
                      </td>
                      <td className="users-page__date">{date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Créer un utilisateur */}
      {showModal && (
        <div className="modal-overlay" role="dialog" aria-label="Créer un utilisateur">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Nouvel utilisateur</h3>
              <button className="modal-close" onClick={() => { setShowModal(false); setFormError(''); }}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              {formError && (
                <div className="users-page__form-error">{formError}</div>
              )}
              <div className="form-group">
                <label>Nom complet</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Jean Dupont" required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jean@exemple.com" required />
              </div>
              <div className="form-group">
                <label>Mot de passe</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimum 6 caractères" required />
              </div>
              <div className="form-group">
                <label>Rôle</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="commercial">🧑‍💼 Commercial (crée les tâches)</option>
                  <option value="planner">📋 Planificateur (gère les statuts)</option>
                  <option value="super_admin">👑 Super Admin (accès complet)</option>
                  <option value="user">👤 Utilisateur</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setFormError(''); }}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Création…' : 'Créer l\'utilisateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
