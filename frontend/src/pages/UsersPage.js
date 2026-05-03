import React, { useState, useEffect } from 'react';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { formatDate, getInitials } from '../utils/formatters';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import './UsersPage.css';

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', icon: '✦', color: '#7c3aed', bg: '#ede9fe' },
  planner: { label: 'Planificateur', icon: '⚙', color: '#0052cc', bg: '#deebff' },
  commercial: { label: 'Commercial', icon: '✉', color: '#b45309', bg: '#fef3c7' },
  user: { label: 'Utilisateur', icon: '○', color: '#374151', bg: '#f3f4f6' },
};

const ROLE_PERMISSIONS = [
  {
    key: 'super_admin',
    title: 'Super Admin',
    summary: 'Acces complet',
    items: [
      'Creer des utilisateurs',
      'Gerer toutes les taches',
      'Mettre a jour tous les statuts',
    ],
  },
  {
    key: 'planner',
    title: 'Planificateur',
    summary: 'Pilotage du flux',
    items: [
      'Mettre a jour les statuts',
      'Modifier les fiches',
      'Reordonner le kanban',
    ],
  },
  {
    key: 'commercial',
    title: 'Commercial',
    summary: 'Creation des commandes',
    items: [
      'Creer des taches',
      'Uniquement dans "A faire"',
      'Pas de modification de statut',
    ],
  },
  {
    key: 'user',
    title: 'Utilisateur',
    summary: 'Consultation',
    items: [
      'Voir les tableaux',
      'Voir les fiches',
      'Pas de modification',
    ],
  },
];

const UsersPage = () => {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');

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

  const handleDelete = (id, name) => {
    setPendingDelete({ id, name });
    setDeleteError('');
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    try {
      await userAPI.delete(pendingDelete.id);
      setPendingDelete(null);
      fetchUsers();
    } catch (err) {
      setDeleteError(err?.response?.data?.error || 'Impossible de supprimer cet utilisateur.');
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

      <section className="users-page__roles" aria-label="Roles et permissions">
        <div className="users-page__roles-head">
          <div>
            <h2>Roles et permissions</h2>
            <p>Chaque role debloque des actions specifiques dans le projet.</p>
          </div>
        </div>
        <div className="users-page__roles-grid">
          {ROLE_PERMISSIONS.map((role) => {
            const styleRole = ROLE_CONFIG[role.key] || ROLE_CONFIG.user;
            return (
              <div key={role.key} className="users-page__role-card">
                <div className="users-page__role-title" style={{ color: styleRole.color }}>
                  <span className="users-page__role-icon" style={{ background: styleRole.bg, color: styleRole.color }}>
                    {styleRole.icon}
                  </span>
                  <div>
                    <strong>{role.title}</strong>
                    <span>{role.summary}</span>
                  </div>
                </div>
                <div className="users-page__role-items">
                  {role.items.map((item) => (
                    <span key={item} className="users-page__role-item">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Barre de recherche */}
      <div className="users-page__search-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="Rechercher par nom, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Spinner message="Chargement des utilisateurs..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon="⚲" message="Aucun utilisateur trouvé." />
      ) : (
        <div className="users-page__table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Créé le</th>
                <th style={{ width: '60px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const role = ROLE_CONFIG[u.role] || ROLE_CONFIG.user;
                const date = formatDate(u.created_at);
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="users-page__user-cell">
                        <div className="users-page__avatar" style={{ background: role.bg, color: role.color }}>
                          {getInitials(u.name)}
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
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id, u.name)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '1.2rem',
                          lineHeight: 1
                        }}
                        title="Supprimer l'utilisateur"
                        onMouseOver={(e) => (e.target.style.backgroundColor = '#fef2f2')}
                        onMouseOut={(e) => (e.target.style.backgroundColor = 'transparent')}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  <option value="commercial">✉ Commercial (crée les tâches)</option>
                  <option value="planner">⚙ Planificateur (gère les statuts)</option>
                  <option value="super_admin">✦ Super Admin (accès complet)</option>
                  <option value="user">○ Utilisateur</option>
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

      {pendingDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
          <div className="modal-content" style={{ maxWidth: 400, textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Supprimer «&nbsp;{pendingDelete.name}&nbsp;» ?
            </p>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Cette action est irréversible.
            </p>
            {deleteError && (
              <div className="users-page__form-error" style={{ marginBottom: '1rem' }}>{deleteError}</div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setPendingDelete(null); setDeleteError(''); }}>Annuler</button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
