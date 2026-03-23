import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import './Sidebar.css';

const Sidebar = () => {
  const { isSuperAdmin } = useAuth();
  const { workspaces, workspaceId, selectWorkspace, createWorkspace, loadingWorkspaces } = useWorkspace();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const activeId = workspaceId ? String(workspaceId) : '';

  const canCreate = isSuperAdmin;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const trimmed = (name || '').trim();
      if (trimmed.length < 2) {
        setError('Nom de workspace trop court');
        return;
      }
      await createWorkspace(trimmed);
      setCreateOpen(false);
      setName('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de créer le workspace');
    }
  };

  const options = useMemo(() => workspaces || [], [workspaces]);

  return (
    <aside className="sidebar" aria-label="Workspaces">
      <div className="sidebar__header">
        <div className="sidebar__title">Workspaces</div>
        {canCreate && (
          <button type="button" className="sidebar__create-btn" onClick={() => setCreateOpen(true)}>
            + Créer
          </button>
        )}
      </div>

      <div className="sidebar__list">
        {loadingWorkspaces ? (
          <div className="sidebar__loading">Chargement…</div>
        ) : options.length === 0 ? (
          <div className="sidebar__empty">Aucun workspace</div>
        ) : (
          options.map((ws) => {
            const id = String(ws.id);
            const active = id === activeId;
            return (
              <button
                type="button"
                key={ws.id}
                className={`sidebar__item ${active ? 'sidebar__item--active' : ''}`}
                onClick={() => selectWorkspace(ws.id)}
              >
                <span className="sidebar__item-name">{ws.name}</span>
              </button>
            );
          })
        )}
      </div>

      {createOpen && (
        <div className="modal-overlay" role="dialog" aria-label="Créer un workspace">
          <div className="modal-content sidebar-modal">
            <div className="modal-header">
              <h3 className="modal-title">Créer un workspace</h3>
              <button type="button" className="modal-close" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={submit}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.5rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label>Nom</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Production" required />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary">
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

