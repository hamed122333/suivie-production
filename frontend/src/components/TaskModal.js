import React, { useEffect, useMemo, useState } from 'react';
import { TASK_PRIORITY_OPTIONS } from '../constants/task';
import { stockImportAPI } from '../services/api';
import { ALLOWED_ARTICLE_PREFIXES, isValidArticleCode, normalizeArticleCode } from '../utils/articleCode';
import './TaskModal.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  plannedDate: '',
  quantity: '',
  quantityUnit: 'pcs',
  clientName: '',
  itemReference: '',
  assignedTo: '',
};

const EMPTY_LINE = '';
const STOCK_PREVIEW_LIMIT = 120;

const CREATE_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Basse' },
  { value: 'MEDIUM', label: 'Moyenne (Normale)' },
  { value: 'HIGH', label: 'Haute' },
  { value: 'URGENT', label: 'Urgente' },
];

function buildTaskTitleFromLine(line) {
  const normalized = `${line || ''}`.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Nouvelle commande';
  }

  return normalized.length > 84 ? `${normalized.slice(0, 81).trim()}...` : normalized;
}

const TaskModal = ({ show, onClose, onSave, task = null, isCommercialMode = false, isCommercial = false, users = [], canAssign = false, defaultStatus = 'TODO' }) => {
  const isCommMode = isCommercialMode || isCommercial;
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
  const [showAllStockRows, setShowAllStockRows] = useState(false);

  const isEditing = Boolean(task);

  useEffect(() => {
    if (task) {
      setForm({
        ...EMPTY_FORM,
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'MEDIUM',
        plannedDate: task.planned_date ? String(task.planned_date).slice(0, 10) : '',
        clientName: task.client_name || '',
        itemReference: task.item_reference || '',
        quantity: task.quantity?.toString() || '',
        quantityUnit: task.quantity_unit || 'pcs',
        assignedTo: task.assigned_to ? String(task.assigned_to) : '',
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setLines([EMPTY_LINE]);
    setShowAllStockRows(false);
    setError('');
  }, [task]);

  // Load stock import articles when commercial opens the create modal
  useEffect(() => {
    if (!isCommMode || isEditing) return;
    setStockLoading(true);
    stockImportAPI
      .getAll()
      .then((res) => setStockArticles(res.data || []))
      .catch(() => setStockArticles([]))
      .finally(() => setStockLoading(false));
  }, [isCommMode, isEditing]);

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
    const raw = event.target.value;
    const value = field === 'itemReference' ? normalizeArticleCode(raw) : raw;
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
    const isAdding = !selectedArticleIds.has(article.id);

    if (isAdding) {
      // Si on ajoute l'article, on essaie de remplir les infos
      const fetchedClientName = article.client_name || article.clientName;
      if (fetchedClientName) {
        setForm((f) => {
          if (!f.clientName || f.clientName.trim() === '') {
            return { ...f, clientName: fetchedClientName };
          }
          return f;
        });
      }
    }

    setSelectedArticleIds((current) => {
      const next = new Set(current);
      if (next.has(article.id)) {
        next.delete(article.id);
        setRequestedQuantities((q) => {
          const newQ = { ...q };
          delete newQ[article.id];
          return newQ;
        });
      } else {
        next.add(article.id);
        setRequestedQuantities((q) => ({
          ...q,
          [article.id]: Number(article.quantity)
        }));
      }
      return next;
    });
  };

  const updateArticleQuantity = (articleId, value) => {
    setRequestedQuantities((q) => ({ ...q, [articleId]: value }));
  };

  // Number of ready articles that are available but unused
  const availableReadyCount = useMemo(
    () => stockArticles.filter((a) => a.is_ready && !a.is_used).length,
    [stockArticles]
  );

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return stockArticles;
    const q = searchQuery.toLowerCase().trim();
    return stockArticles.filter((article) => 
      article.article?.toLowerCase().includes(q)
    );
  }, [stockArticles, searchQuery]);

  const visibleArticles = useMemo(() => {
    if (showAllStockRows || searchQuery.trim()) return filteredArticles;
    return filteredArticles.slice(0, STOCK_PREVIEW_LIMIT);
  }, [filteredArticles, showAllStockRows, searchQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() && !isCommMode) {
      alert('Le titre est requis');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form };

      // Normaliser la quantité
      if (payload.quantity) {
        payload.quantity = Number(payload.quantity);
        if (isNaN(payload.quantity)) {
          alert('La quantité doit être un nombre valide');
          return;
        }
      } else {
        payload.quantity = null;
      }

      const normalizeOptionalString = (val) => val?.trim() || null;
      payload.description = normalizeOptionalString(payload.description);
      payload.clientName = normalizeOptionalString(payload.clientName);
      payload.itemReference = normalizeOptionalString(payload.itemReference);
      if (payload.itemReference) {
        payload.itemReference = normalizeArticleCode(payload.itemReference);
        if (!isValidArticleCode(payload.itemReference)) {
          throw new Error(`Code article invalide. Préfixes autorisés: ${ALLOWED_ARTICLE_PREFIXES.join(', ')}`);
        }
      }
      payload.quantityUnit = normalizeOptionalString(payload.quantityUnit) || 'pcs';
      payload.assignedTo = payload.assignedTo ? Number(payload.assignedTo) : null;

      if (isCommMode) {
        // Commercial create mode: tasks from selected stock import articles
        const clientName = `${form.clientName || ''}`.trim();
        if (!clientName) {
          throw new Error('Le nom du client est obligatoire.');
        }

        if (selectedArticleIds.size === 0) {
          throw new Error('Sélectionnez au moins un article existant.');
        }

        const selectedArticles = stockArticles.filter((a) => selectedArticleIds.has(a.id));
        const fromStockTasks = selectedArticles.map((article) => {
          const reqQty = Number(requestedQuantities[article.id] || article.quantity);
          return {
            title: `${clientName} • ${article.article}`,
            description: `${reqQty} pcs commandés (Stock initial: ${Number(article.quantity)} pcs)`,
            priority: form.priority,
            plannedDate: form.plannedDate || null,
            expectedAction: 'EXISTING_PRODUCT_AUTO_STOCK_CHECK',
            clientName,
            itemReference: article.article,
            quantity: reqQty,
            quantityUnit: 'pcs',
            stockImportId: article.id,
          };
        });

        const preparedTasks = fromStockTasks;
        if (preparedTasks.length === 0) {
          throw new Error('Sélectionnez au moins un article existant.');
        }

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
      if (
        err.message &&
        err.message !== 'Le nom du client est obligatoire.' &&
        err.message !== 'Sélectionnez au moins un article existant.' &&
        err.message !== 'Ajoute au moins une ligne d article.'
      ) {
        setError(err.message);
      } else if (err.message) {
        alert(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing && isCommMode) {
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
              <label>Niveau de priorité</label>
              <select value={form.priority} onChange={updateForm('priority')}>
                {CREATE_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group task-modal-classic__group">
              <label>Date prévue de livraison</label>
              <input type="date" value={form.plannedDate || ''} onChange={updateForm('plannedDate')} required />
            </div>

            <div className="form-group task-modal-classic__group">
              <label>
                Articles produits finis (existants)
                {availableReadyCount > 0 && (
                  <span className="stock-article-ready-badge">{availableReadyCount} prêt(s)</span>
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
                  Aucun article trouvé pour "{searchQuery}".
                </div>
              ) : (
                <div className="stock-article-list">
                  {visibleArticles.map((article) => {
                    const readyDate = new Date(article.ready_date);
                    const isReady = article.is_ready;
                    const isUsed = article.is_used;
                    const isDisabled = false;
                    const isSelected = selectedArticleIds.has(article.id);
                    const reqQty = requestedQuantities[article.id] ?? Number(article.quantity);

                    return (
                      <div
                        key={article.id}
                        className={[
                          'stock-article-item',
                          isDisabled ? 'stock-article-item--disabled' : 'stock-article-item--ready',
                          isSelected ? 'stock-article-item--selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => !isDisabled && toggleArticle(article)}
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-disabled={isDisabled}
                        tabIndex={isDisabled ? -1 : 0}
                        onKeyDown={(e) => {
                          if (!isDisabled && (e.key === ' ' || e.key === 'Enter')) {
                            e.preventDefault();
                            toggleArticle(article);
                          }
                        }}
                      >
                        <div className="stock-article-item__check">
                          {isUsed ? (
                            <span className="stock-article-item__used-mark" title="Déjà utilisé">✓</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabled}
                              onChange={() => toggleArticle(article)}
                              onClick={(e) => e.stopPropagation()}
                              tabIndex={-1}
                              aria-hidden
                            />
                          )}
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
                              onChange={(e) => updateArticleQuantity(article.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>
                        <div className="stock-article-item__status">
                          {isUsed ? (
                            <span className="stock-article-item__tag stock-article-item__tag--used">
                              Déjà utilisé
                            </span>
                          ) : isReady ? (
                            <span className="stock-article-item__tag stock-article-item__tag--ready">
                              Disponible
                            </span>
                          ) : (
                            <span className="stock-article-item__tag stock-article-item__tag--pending">
                              Prêt le {readyDate.toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!searchQuery.trim() && filteredArticles.length > STOCK_PREVIEW_LIMIT && (
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowAllStockRows((current) => !current)}
                  >
                    {showAllStockRows
                      ? `Afficher moins (${STOCK_PREVIEW_LIMIT})`
                      : `Afficher toute la liste (${filteredArticles.length})`}
                  </button>
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
                disabled={saving}
              >
                {saving
                  ? 'Création…'
                  : 'Créer les commandes'}
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

            <div className="form-group task-modal-classic__group">
              <label>Date prevue de livraison</label>
              <input type="date" value={form.plannedDate || ''} onChange={updateForm('plannedDate')} required />
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
            <label>Référence article</label>
            <input type="text" value={form.itemReference} onChange={updateForm('itemReference')} />
          </div>

          <div className="form-group task-modal-classic__group">
            <label>Quantité</label>
            <input type="number" min="0" step="0.01" value={form.quantity} onChange={updateForm('quantity')} />
          </div>

          <div className="form-group task-modal-classic__group">
            <label>Unité</label>
            <input type="text" value={form.quantityUnit} onChange={updateForm('quantityUnit')} />
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

          <div className="form-group task-modal-classic__group">
            <label>Date prevue de livraison</label>
            <input
              type="date"
              value={form.plannedDate || ''}
              onChange={updateForm('plannedDate')}
              required={task?.status === 'WAITING_STOCK'}
            />
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
