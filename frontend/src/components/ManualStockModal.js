import React, { useState } from 'react';
import { stockImportAPI } from '../services/api';
import './StockImportModal.css'; // We will reuse the styles of the existing modal

const ManualStockModal = ({ onClose, onAdded }) => {
  const [formData, setFormData] = useState({
    article: '',
    quantity: '',
    baseDate: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.article || !formData.quantity) {
      setError('Veuillez renseigner un article et une quantité.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess(null);

    try {
      const response = await stockImportAPI.createManual({
        article: formData.article,
        quantity: Number(formData.quantity),
        baseDate: formData.baseDate || undefined
      });
      setSuccess('Produit ajouté (ou mis à jour) avec succès !');
      if (onAdded) onAdded(response.data);
      // Reset form after success
      setFormData({ article: '', quantity: '', baseDate: '' });
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur lors de l'ajout manuel.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay stock-import-modal-overlay" onClick={onClose}>
      <div className="modal-content stock-import-modal" onClick={e => e.stopPropagation()} role="dialog">
        <div className="modal-header stock-import-modal__header">
          <h3 className="modal-title">
            <span role="img" aria-label="pen" style={{ marginRight: '8px' }}>✍️</span>
            Ajout manuel au stock
          </h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={submitting} title="Fermer">✕</button>
        </div>

        <div className="stock-import-modal__body">
          <p className="stock-import-modal__hint" style={{marginBottom: "1.5rem"}}>
            Ajoutez rapidement un produit fini. Si l'article existe déjà, la quantité sera additionnée.
          </p>

          <div className="stock-import-modal__rules">
            <p className="stock-import-modal__rules-title">Règles de délai appliquées automatiquement :</p>
            <ul>
              <li><span className="badge badge--blue">ci / cv</span> +6 jours</li>
              <li><span className="badge badge--orange">di / dv</span> +9 jours</li>
              <li><span className="badge badge--green">pl</span> +4 jours</li>
              <li><span className="badge badge--gray">autres</span> immédiat</li>
            </ul>
          </div>

          {error && <div className="stock-import-modal__error">{error}</div>}
          {success && <div className="stock-import-modal__success" style={{marginBottom: "1rem"}}><strong>✓ {success}</strong></div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="article" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Article / Référence *</label>
              <input 
                id="article"
                name="article"
                type="text" 
                value={formData.article}
                onChange={handleChange}
                placeholder="Ex: PL12345"
                style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0' }}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="quantity" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Quantité *</label>
              <input 
                id="quantity"
                name="quantity"
                type="number"
                step="0.01" 
                min="0.01"
                value={formData.quantity}
                onChange={handleChange}
                placeholder="Ex: 50"
                style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0' }}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="baseDate" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Date de base (Optionnel)</label>
              <input 
                id="baseDate"
                name="baseDate"
                type="date" 
                value={formData.baseDate}
                onChange={handleChange}
                style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0', color: '#4a5568' }}
              />
              <small style={{color: '#718096', fontSize: '0.8rem'}}>Laissez vide pour utiliser la date d'aujourd'hui.</small>
            </div>

            <div className="stock-import-modal__actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                Fermer
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !formData.article || !formData.quantity}>
                {submitting ? 'Ajout...' : 'Ajouter au stock'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ManualStockModal;

