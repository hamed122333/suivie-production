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
  livreur: { label: 'Livreur', icon: '🚚', color: '#065f46', bg: '#d1fae5' },
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
    key: 'livreur',
    title: 'Livreur',
    summary: 'Livraison des commandes',
    items: [
      'Voir les tâches En cours / Terminées',
      'Marquer une tâche comme Livrée',
      'Pas de modification de statut autre',
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
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', commercialId: '' });
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

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
      const payload = { ...form };
      if (payload.role !== 'commercial') delete payload.commercialId;
      await userAPI.create(payload);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'user', commercialId: '' });
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

  const handleImportCommercials = async (e) => {
    e.preventDefault();
    if (!importFile) {
      setImportError('Veuillez sélectionner un fichier');
      return;
    }
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await userAPI.importCommercials(formData);
      setImportResult(res.data);
      setImportFile(null);
      await fetchUsers();
    } catch (err) {
      setImportError(err?.response?.data?.error || 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
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
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
            📥 Importer commerciaux
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nouvel utilisateur
          </button>
        </div>
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
                <th>ID Commercial</th>
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
                    <td className="users-page__commercial-id">
                      {u.commercial_id || '—'}
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
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, commercialId: '' }))}>
                  <option value="commercial">✉ Commercial (crée les tâches)</option>
                  <option value="planner">⚙ Planificateur (gère les statuts)</option>
                  <option value="livreur">🚚 Livreur (marque les livraisons)</option>
                  <option value="super_admin">✦ Super Admin (accès complet)</option>
                  <option value="user">○ Utilisateur</option>
                </select>
              </div>

              {form.role === 'commercial' && (
                <div className="form-group">
                  <label>ID Commercial</label>
                  <input
                    type="text"
                    value={form.commercialId}
                    onChange={e => setForm(f => ({ ...f, commercialId: e.target.value.toUpperCase() }))}
                    placeholder="Ex: VL000011"
                    required
                  />
                  <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    Format: VL suivi de 6 chiffres (VL000001, VL000002, ...)
                  </small>
                </div>
              )}
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

      {/* Modal Importer commerciaux */}
      {showImportModal && (
        <div className="modal-overlay" role="dialog" aria-label="Importer une liste commerciale">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Importer commerciaux</h3>
              <button className="modal-close" onClick={() => {
                setShowImportModal(false);
                setImportError('');
                setImportResult(null);
                setImportFile(null);
              }}>✕</button>
            </div>

            {importResult ? (
              <div style={{ padding: '1.5rem' }}>
                <div style={{
                  background: '#ecfdf3',
                  border: '1px solid #6ee7b7',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ color: '#065f46', fontWeight: 600, marginBottom: '0.5rem' }}>
                    ✓ Import terminé
                  </div>
                  <div style={{ color: '#047857', fontSize: '0.875rem' }}>
                    {importResult.message}
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#059669' }}>
                    <div>📊 {importResult.imported} importés · {importResult.updated} mis à jour · {importResult.skipped} sautés</div>
                  </div>
                </div>

                {importResult.errors && importResult.errors.length > 0 && (
                  <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: '#b91c1c'
                  }}>
                    <strong>Erreurs ({importResult.errors.length}):</strong>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem' }}>
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {importResult.errors.length > 5 && <li>... et {importResult.errors.length - 5} autres</li>}
                    </ul>
                  </div>
                )}

                {importResult.duplicates && importResult.duplicates.length > 0 && (
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: '#92400e'
                  }}>
                    <strong>Doublons ({importResult.duplicates.length}):</strong>
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem' }}>
                      {importResult.duplicates.slice(0, 5).map((dup, i) => (
                        <li key={i}>{dup}</li>
                      ))}
                      {importResult.duplicates.length > 5 && <li>... et {importResult.duplicates.length - 5} autres</li>}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setShowImportModal(false);
                      setImportResult(null);
                      setImportFile(null);
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleImportCommercials}>
                {importError && (
                  <div className="users-page__form-error" style={{ margin: '1.5rem 1.5rem 0' }}>{importError}</div>
                )}
                <div className="form-group" style={{ padding: '1.5rem', paddingTop: importError ? '0.5rem' : '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                    Fichier Excel (Commercial | Nom)
                  </label>
                  <div style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '2rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: importFile ? '#f0fdf4' : '#f9fafb',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => {
                        setImportFile(e.target.files?.[0] || null);
                        setImportError('');
                      }}
                      style={{ display: 'none' }}
                      id="commercials-file-input"
                    />
                    <label htmlFor="commercials-file-input" style={{ cursor: 'pointer', display: 'block' }}>
                      {importFile ? (
                        <div>
                          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>✓</div>
                          <strong>{importFile.name}</strong>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📄</div>
                          <div><strong>Cliquez ou déposez votre fichier</strong></div>
                          <small style={{ color: 'var(--color-text-muted)' }}>Format: .xlsx ou .xls</small>
                        </div>
                      )}
                    </label>
                  </div>
                  <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.5rem', display: 'block' }}>
                    Format attendu: Colonne A = Code (VL000001), Colonne B = Nom (Jean Dupont)
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', padding: '0 1.5rem 1.5rem', paddingTop: 0 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowImportModal(false);
                    setImportError('');
                    setImportFile(null);
                  }}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={importing || !importFile}>
                    {importing ? 'Import en cours…' : 'Importer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
