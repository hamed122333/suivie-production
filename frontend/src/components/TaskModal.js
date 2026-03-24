import React, { useState, useEffect } from 'react';

const parseCommercialTasks = (input, priority) => {
  // Split by lines, ignore empty lines
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map((line) => {
    // Format: CLIENT : ref1(qte)-ref2(qte)+... | or special cases
    const [client, rest] = line.split(':').map(s => s.trim());
    let title = client;
    let description = rest || '';
    // Try to extract refs/quantities for description
    if (rest) {
      description = rest.replace(/([a-zA-Z0-9]+\([^)]+\))/g, (m) => m + ' ');
    }
    // Priority: order of appearance (first = highest)
    return {
      title,
      description,
      priority,
    };
  });
};

const TaskModal = ({ task, onSave, onClose }) => {
  const [input, setInput] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [tasksPreview, setTasksPreview] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setInput(task.title + (task.description ? (' : ' + task.description) : ''));
      setPriority(task.priority || 'MEDIUM');
      setTasksPreview([{ title: task.title, description: task.description, priority: task.priority || 'MEDIUM' }]);
    }
  }, [task]);

  useEffect(() => {
    if (input.trim()) {
      setTasksPreview(parseCommercialTasks(input, priority));
    } else {
      setTasksPreview([]);
    }
  }, [input, priority]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) {
      setError('Saisie requise');
      return;
    }
    setError('');
    const tasks = parseCommercialTasks(input, priority);
    for (const t of tasks) {
      await onSave({
        title: t.title,
        description: t.description,
        priority: t.priority,
      });
    }
    // Optionally, clear input or close modal
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">➕ Saisie rapide des tâches commerciales</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.5rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          <div className="form-group">
            <label>Saisie rapide (1 ligne = 1 tâche)</label>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                'Exemple :\nPLASTICUM : ci2682(6p)-dv0275(1p)+plso380580(4p)\nJoubert : ci2505(600) +ci2504(1200)\nBaraka de conditionnement : en stock\n...'
              }
              rows={6}
              style={{ resize: 'vertical' }}
              required
            />
          </div>
          <div className="form-group">
            <label>Priorité</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Haute</option>
              <option value="MEDIUM">Moyenne</option>
              <option value="LOW">Basse</option>
            </select>
          </div>
          {tasksPreview.length > 0 && (
            <div style={{ margin: '1rem 0', background: '#f1f5f9', borderRadius: '6px', padding: '0.5rem' }}>
              <b>Aperçu des tâches à créer :</b>
              <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                {tasksPreview.map((t, i) => (
                  <li key={i}>
                    <b>{t.title}</b> — <span style={{ color: '#64748b' }}>{t.description}</span> <span style={{ fontSize: '0.85em', color: '#0ea5e9' }}>({t.priority})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">
              Créer {tasksPreview.length > 1 ? `${tasksPreview.length} tâches` : 'la tâche'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
