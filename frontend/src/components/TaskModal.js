import React, { useEffect, useMemo, useState } from 'react';
import { TASK_PRIORITY_OPTIONS } from '../constants/task';
import { useWorkspace } from '../context/WorkspaceContext';
import { stockImportAPI } from '../services/api';
import './TaskModal.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  clientName: '',
  orderCode: '',
  itemReference: '',
  quantity: '',
  quantityUnit: 'pcs',
  dueDate: '',
  plannedDate: '',
  productionLine: '',
  machine: '',
  workshop: '',
  notes: '',
  expectedAction: '',
  assignedTo: '',
};

const EMPTY_LINE = '';

const CREATE_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Basse' },
  { value: 'MEDIUM', label: 'Moyenne (Normale)' },
  { value: 'HIGH', label: 'Haute' },
  { value: 'URGENT', label: 'Urgente' },
];

function toInputDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function normalizeOptionalString(value) {
  const normalized = `${value || ''}`.trim();
  return normalized || null;
}

function normalizeOptionalNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTaskTitleFromLine(line) {
  const normalized = `${line || ''}`.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Nouvelle commande';
  }

  return normalized.length > 84 ? `${normalized.slice(0, 81).trim()}...` : normalized;
}

const TaskModal = ({
  task,
  defaultStatus = 'TODO',
  onSave,
  onClose,
  users = [],
  canAssign = false,
  isCommercial = false,
}) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState([EMPTY_LINE]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Stock import state (commercial create mode)
  const [stockArticles, setStockArticles] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [selectedArticleIds, setSelectedArticleIds] = useState(new Set());
  const [requestedQuantities, setRequestedQuantities] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  const isEditing = Boolean(task);

  // Workspace type detection for commercial mode
  const { workspaceId, workspaces } = useWorkspace();
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => String(w.id) === String(workspaceId)),
    [workspaces, workspaceId]
  );
  const workspaceName = (activeWorkspace?.name || '').toLowerCase();
  const isPlanned = workspaceName.includes('planif');
  const isUrgent = workspaceName.includes('urgent');

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'MEDIUM',
        clientName: task.client_name || '',
        orderCode: task.order_code || '',
        itemReference: task.item_reference || '',
        quantity: task.quantity ?? '',
        quantityUnit: task.quantity_unit || 'pcs',
        dueDate: toInputDate(task.due_date),
        plannedDate: toInputDate(task.planned_date),
        productionLine: task.production_line || '',
        machine: task.machine || '',
        workshop: task.workshop || '',
        notes: task.notes || '',
        expectedAction: task.expected_action || '',
        assignedTo: task.assigned_to ? String(task.assigned_to) : '',
      });
      setLines([EMPTY_LINE]);
      setError('');
      return;
    }

    setForm(EMPTY_FORM);
    setLines([EMPTY_LINE]);
    setError('');
  }, [task]);

  // Load stock import articles when commercial opens the create modal
  useEffect(() => {
    if (!isCommercial || isEditing) return;
    setStockLoading(true);
    stockImportAPI
      .getAll()
      .then((res) => setStockArticles(res.data || []))
      .catch(() => setStockArticles([]))
      .finally(() => setStockLoading(false));
  }, [isCommercial, isEditing]);

  // Force URGENT priority when in Urgent workspace (commercial create mode)
  useEffect(() => {
    if (isUrgent && isCommercial && !isEditing) {
      setForm((prev) => ({ ...prev, priority: 'URGENT' }));
    }
  }, [isUrgent, isCommercial, isEditing]);

  const assignableUsers = useMemo(
    () =>
      users
        .filter((user) => ['planner', 'user'].includes(user.role))
        .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    [users]
  );

  const validLineCount = useMemo(
    () =>
      lines.filter((line) => `${line || ''}`.trim()).length,
    [lines]
  );

  const updateForm = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateLine = (index, value) => {
    setLines((current) =>
      current.map((line, currentIndex) => (currentIndex === index ? value : line))
    );
  };

  const addLine = () => {
    setLines((current) => [...current, EMPTY_LINE]);
  };

  const removeLine = (index) => {
    setLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const toggleArticle = (article) => {
    setSelectedArticleIds((current) => {
      const next = new Set(current);
      if (next.has(article.id)) {
        next.delete(article.id);
        setRequestedQuantities((q) => {
          const newQ = { ...q };
          delete newQ[article.id];
          return newQ;
        });
        // Clear plannedDate if no articles remain selected in Planifié mode
        if (isPlanned && next.size === 0) {
          setForm((f) => ({ ...f, plannedDate: '' }));
        }
      } else {
        next.add(article.id);
        setRequestedQuantities((q) => ({
          ...q,
          [article.id]: Number(article.quantity)
        }));
        // Auto-fill plannedDate from the article's ready_date in Planifié mode
        if (isPlanned && article.ready_date) {
          setForm((f) => ({ ...f, plannedDate: toInputDate(article.ready_date) }));
        }
      }
      return next;
    });
  };

  const updateArticleQuantity = (articleId, value) => {
    setRequestedQuantities((q) => ({ ...q, [articleId]: value }));
  };

  // Workspace-filtered articles for commercial mode
  const workspaceArticles = useMemo(() => {
    return stockArticles.filter((article) => {
      if (article.is_used) return false;
      if (isPlanned) {
        // Planifié: show only articles with a future date (not yet ready)
        return !article.is_ready;
      }
      // Standard / Urgent (and default): show only immediately available articles
      return article.is_ready;
    });
  }, [stockArticles, isPlanned]);

  // Number of workspace-relevant articles available
  const availableReadyCount = useMemo(
    () => workspaceArticles.length,
    [workspaceArticles]
  );

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return workspaceArticles;
    const q = searchQuery.toLowerCase().trim();
    return workspaceArticles.filter((article) =>
      article.article?.toLowerCase().includes(q)
    );
  }, [workspaceArticles, searchQuery]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (isEditing) {
        if (!form.title.trim()) {
          throw new Error('Le titre de la fiche est obligatoire.');
        }

        await onSave({
          title: form.title.trim(),
          description: normalizeOptionalString(form.description),
          priority: form.priority,
          clientName: normalizeOptionalString(form.clientName),
          orderCode: normalizeOptionalString(form.orderCode),
          itemReference: normalizeOptionalString(form.itemReference),
          quantity: normalizeOptionalNumber(form.quantity),
          quantityUnit: normalizeOptionalString(form.quantityUnit) || 'pcs',
          dueDate: form.dueDate || null,
          plannedDate: form.plannedDate || null,
          productionLine: normalizeOptionalString(form.productionLine),
          machine: normalizeOptionalString(form.machine),
          workshop: normalizeOptionalString(form.workshop),
          notes: normalizeOptionalString(form.notes),
          expectedAction: normalizeOptionalString(form.expectedAction),
          ...(canAssign ? { assignedTo: form.assignedTo || null } : {}),
        });
      } else if (isCommercial) {
        // Commercial create mode: tasks from selected stock import articles
        const clientName = `${form.clientName || ''}`.trim();
        if (!clientName) {
          throw new Error('Le nom du client est obligatoire.');
        }

        if (selectedArticleIds.size === 0) {
          throw new Error('Sélectionnez au moins un article disponible.');
        }

        // Planifié workspace: plannedDate is required
        if (isPlanned && !form.plannedDate) {
          throw new Error('Pour une commande planifiée, sélectionnez un article (la date sera automatiquement remplie).');
        }

        const selectedArticles = stockArticles.filter((a) => selectedArticleIds.has(a.id));
        const preparedTasks = selectedArticles.map((article) => {
          const reqQty = Number(requestedQuantities[article.id] || article.quantity);
          return {
            title: `${article.article} — ${clientName}`,
            description: `Réf. ${article.article} · ${reqQty} pcs commandés (Stock initial: ${Number(article.quantity)} pcs importées le ${new Date(article.imported_at).toLocaleDateString('fr-FR')})`,
            priority: form.priority,
            clientName,
            itemReference: article.article,
            quantity: reqQty,
            quantityUnit: 'pcs',
            stockImportId: article.id,
            ...(isPlanned ? { plannedDate: toInputDate(article.ready_date) } : {}),
          };
        });

        await onSave({
          status: defaultStatus,
          tasks: preparedTasks,
        });
      } else {
        const clientName = `${form.clientName || ''}`.trim();
        const preparedTasks = lines
          .map((line) => `${line || ''}`.trim())
          .filter(Boolean)
          .map((line) => ({
            title: buildTaskTitleFromLine(line),
            description: line,
            priority: form.priority,
            clientName,
          }));

        if (!clientName) {
          throw new Error('Le nom du client est obligatoire.');
        }

        if (preparedTasks.length === 0) {
          throw new Error('Ajoute au moins une ligne d article.');
        }

        await onSave({
          status: defaultStatus,
          tasks: preparedTasks,
        });
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing && isCommercial) {
    // Commercial create mode: show imported articles list
    return (
      <div className="modal-overlay task-modal-classic-overlay" onClick={onClose}>
        <div
          className="modal-content task-modal-classic task-modal-classic--wide"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Saisir une commande client"
        >
          <div className="modal-header task-modal-classic__header">
            <div className="task-modal-classic__title-wrap">
              <span className="task-modal-classic__title-mark" aria-hidden>+</span>
              <h3 className="modal-title task-modal-classic__title">Nouvelle commande client</h3>
            </div>
            <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
              ✕
            </button>
          </div>

          <form className="task-modal-classic__form" onSubmit={handleSubmit}>
            {error && <div className="task-modal__error">{error}</div>}

            {isUrgent && (
              <div className="task-modal-classic__workspace-banner task-modal-classic__workspace-banner--urgent">
                🚨 Espace Urgent — La priorité est automatiquement fixée sur <strong>Urgente</strong>.
              </div>
            )}

            {isPlanned && (
              <div className="task-modal-classic__workspace-banner task-modal-classic__workspace-banner--planned">
                📅 Espace Planifié — Seuls les produits à venir sont affichés. La date planifiée est remplie automatiquement.
              </div>
            )}

            <div className="form-group task-modal-classic__group">
              <label>Nom du client</label>
              <input
                type="text"
                value={form.clientName}
                onChange={updateForm('clientName')}
                placeholder="Ex: PLASTICUM, EJM, Gargouri…"
                required
              />
            </div>

            <div className="form-group task-modal-classic__group">
              <label>Niveau de priorité{isUrgent ? ' (forcé)' : ''}</label>
              <select value={form.priority} onChange={updateForm('priority')} disabled={isUrgent}>
                {isUrgent ? (
                  <option value="URGENT">🚨 Urgente (Forcé)</option>
                ) : (
                  CREATE_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            {isPlanned && (
              <div className="form-group task-modal-classic__group">
                <label>Date planifiée (automatique) *</label>
                <input
                  type="date"
                  value={form.plannedDate}
                  onChange={updateForm('plannedDate')}
                  readOnly
                  required={isPlanned}
                  style={{ background: '#f0fdf4', borderColor: '#86efac' }}
                />
                {form.plannedDate ? (
                  <small className="task-modal-classic__hint">
                    Remplie automatiquement depuis la date de disponibilité du produit sélectionné.
                  </small>
                ) : (
                  <small className="task-modal-classic__hint">
                    Sélectionnez un article ci-dessous pour remplir cette date.
                  </small>
                )}
              </div>
            )}

            <div className="form-group task-modal-classic__group">
              <label>
                {isPlanned ? 'Articles à venir (en cours de fabrication)' : 'Articles disponibles'}
                {availableReadyCount > 0 && (
                  <span className="stock-article-ready-badge">{availableReadyCount} disponible(s)</span>
                )}
              </label>

              {!stockLoading && stockArticles.length > 0 && (
                <div className="task-modal-classic__search">
                  <input
                    type="text"
                    placeholder="Rechercher un article..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="stock-article-search-input"
                  />
                </div>
              )}

              {stockLoading ? (
                <div className="stock-article-loading">Chargement des articles…</div>
              ) : stockArticles.length === 0 ? (
                <div className="stock-article-empty">
                  Aucun article importé. Demandez à votre planificateur d'importer le stock Excel.
                </div>
              ) : filteredArticles.length === 0 ? (
                <div className="stock-article-empty">
                  {searchQuery.trim()
                    ? `Aucun article trouvé pour "${searchQuery}".`
                    : isPlanned
                    ? 'Aucun article en cours de fabrication pour le moment.'
                    : 'Aucun article disponible en stock immédiat.'}
                </div>
              ) : (
                <div className="stock-article-list">
                  {filteredArticles.map((article) => {
                    const isSelected = selectedArticleIds.has(article.id);
                    const reqQty = requestedQuantities[article.id] ?? Number(article.quantity);
                    const articleDate = article.ready_date
                      ? new Date(article.ready_date).toLocaleDateString('fr-FR')
                      : null;

                    return (
                      <div
                        key={article.id}
                        className={[
                          'stock-article-item',
                          'stock-article-item--ready',
                          isSelected ? 'stock-article-item--selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => toggleArticle(article)}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            toggleArticle(article);
                          }
                        }}
                      >
                        <div className="stock-article-item__check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleArticle(article)}
                            onClick={(e) => e.stopPropagation()}
                            tabIndex={-1}
                            aria-hidden
                          />
                        </div>
                        <div className="stock-article-item__info">
                          <span className="stock-article-item__name">{article.article}</span>
                          <span className="stock-article-item__qty">Stock: {Number(article.quantity)} pcs</span>
                          {isSelected && (
                            <input
                              type="number"
                              className="stock-article-item__input-qty"
                              value={reqQty}
                              min="1"
                              max={Number(article.quantity)}
                              onChange={(e) => updateArticleQuantity(article.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>
                        <div className="stock-article-item__status">
                          {isPlanned && articleDate ? (
                            <span className="stock-article-item__tag stock-article-item__tag--pending">
                              Prévu le {articleDate}
                            </span>
                          ) : (
                            <span className="stock-article-item__tag stock-article-item__tag--ready">
                              En stock immédiat
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="task-modal-classic__footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || selectedArticleIds.size === 0}
              >
                {saving
                  ? 'Création…'
                  : `Créer ${selectedArticleIds.size > 0 ? `${selectedArticleIds.size} commande(s)` : 'la commande'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!isEditing) {
    return (
      <div className="modal-overlay task-modal-classic-overlay" onClick={onClose}>
        <div
          className="modal-content task-modal-classic"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Saisir une commande client"
        >
          <div className="modal-header task-modal-classic__header">
            <div className="task-modal-classic__title-wrap">
              <span className="task-modal-classic__title-mark" aria-hidden>
                +
              </span>
              <h3 className="modal-title task-modal-classic__title">Saisir une commande client</h3>
            </div>
            <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
              ✕
            </button>
          </div>

          <form className="task-modal-classic__form" onSubmit={handleSubmit}>
            {error && <div className="task-modal__error">{error}</div>}

            <div className="form-group task-modal-classic__group">
              <label>Nom du client</label>
              <input
                type="text"
                value={form.clientName}
                onChange={updateForm('clientName')}
                placeholder="Ex: PLASTICUM, EJM, Gargouri..."
                required
              />
            </div>

            <div className="form-group task-modal-classic__group">
              <label>
                Lignes d articles / consignes <span className="task-modal-classic__label-hint">(1 ligne = 1 carte kanban)</span>
              </label>
              <div className="task-modal-classic__lines">
                {lines.map((line, index) => (
                  <div key={`line-${index}`} className="task-modal-classic__line">
                    <textarea
                      value={line}
                      onChange={(event) => updateLine(index, event.target.value)}
                      placeholder="Ex: ci2682(6p) - dv0275(1p) + plso380580(4p) OU ci0157 le 25-03-26"
                      rows={2}
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="task-modal-classic__remove"
                        onClick={() => removeLine(index)}
                        aria-label={`Supprimer la ligne ${index + 1}`}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="task-modal-classic__line-actions">
                <button type="button" className="btn btn-secondary task-modal-classic__add" onClick={addLine}>
                  + Ajouter une autre ligne d article
                </button>
                <span className="task-modal-classic__count">
                  {validLineCount} ligne{validLineCount > 1 ? 's' : ''} prete{validLineCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="form-group task-modal-classic__group">
              <label>Niveau de priorite</label>
              <select value={form.priority} onChange={updateForm('priority')}>
                {CREATE_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="task-modal-classic__footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creation...' : 'Creer la commande'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay task-modal-classic-overlay" onClick={onClose}>
      <div className="modal-content task-modal-classic" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header task-modal-classic__header">
          <div className="task-modal-classic__title-wrap">
            <h3 className="modal-title task-modal-classic__title">Modifier la fiche</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>

        <form className="task-modal-classic__form" onSubmit={handleSubmit}>
          {error && <div className="task-modal__error">{error}</div>}

          <div className="form-group task-modal-classic__group">
            <label>Nom du client</label>
            <input type="text" value={form.clientName} onChange={updateForm('clientName')} required />
          </div>

          <div className="form-group task-modal-classic__group">
            <label>Titre de la fiche</label>
            <input type="text" value={form.title} onChange={updateForm('title')} required />
          </div>

          <div className="form-group task-modal-classic__group">
            <label>Consignes / Ligne d'article (Description)</label>
            <textarea rows={3} value={form.description} onChange={updateForm('description')} />
          </div>

          <div className="form-group task-modal-classic__group">
            <label>Niveau de priorite</label>
            <select value={form.priority} onChange={updateForm('priority')}>
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {canAssign && (
            <div className="form-group task-modal-classic__group">
              <label>Assigne a (Responsable)</label>
              <select value={form.assignedTo} onChange={updateForm('assignedTo')}>
                <option value="">Non assigne</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="task-modal-classic__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer la fiche'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
