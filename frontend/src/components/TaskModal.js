import React, { useEffect, useMemo, useState } from 'react';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_CONFIG } from '../constants/task';
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
}) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState([EMPTY_LINE]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(task);

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
