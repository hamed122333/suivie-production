import React, { useEffect, useState } from 'react';
import { stockImportAPI, taskAPI } from '../services/api';
import { ALLOWED_ARTICLE_PREFIXES, isValidArticleCode, normalizeArticleCode } from '../utils/articleCode';
import './StockImportModal.css'; // We will reuse the styles of the existing modal

const ManualStockModal = ({ onClose, onAdded }) => {
  const [existingArticles, setExistingArticles] = useState([]);
  const [waitingStockHints, setWaitingStockHints] = useState({});
  const [matchedArticle, setMatchedArticle] = useState(null);
  const [formData, setFormData] = useState({
    article: '',
    quantity: '',
    designation: '',
    clientCode: '',
    clientName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    stockImportAPI
      .getAll()
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        setExistingArticles(items);
      })
      .catch(() => setExistingArticles([]));
  }, []);

  useEffect(() => {
    taskAPI
      .getAll({ status: 'WAITING_STOCK' })
      .then((res) => {
        const tasks = Array.isArray(res.data) ? res.data : [];
        const hints = {};
        for (const task of tasks) {
          const ref = `${task.item_reference || ''}`.trim().toUpperCase();
          if (!ref || hints[ref]) continue;
          const description = `${task.description || ''}`;
          const designationFromDescription =
            description.match(/article hors liste stock\s*•\s*([^•]+)/i)?.[1]?.trim() || '';
          const clientCodeFromDescription =
            description.match(/Code client:\s*([^•]+)/i)?.[1]?.trim() || '';
          hints[ref] = {
            designation: `${task.notes || designationFromDescription || ''}`.trim(),
            clientCode: `${task.order_code || clientCodeFromDescription || ''}`.trim(),
            clientName: `${task.client_name || ''}`.trim(),
          };
        }
        setWaitingStockHints(hints);
      })
      .catch(() => setWaitingStockHints({}));
  }, []);

  const handleChange = (e) => {
    const { name } = e.target;
    const value = name === 'article' ? normalizeArticleCode(e.target.value) : e.target.value;
    setFormData((current) => ({ ...current, [name]: value }));

    if (name === 'article') {
      const normalized = `${value || ''}`.trim().toUpperCase();
      const found = existingArticles.find((item) => `${item.article || ''}`.trim().toUpperCase() === normalized) || null;
      const waitingHint = waitingStockHints[normalized] || null;
      setMatchedArticle(found);
      if (found) {
        setFormData((current) => ({
          ...current,
          article: value,
          designation: found.designation || current.designation,
          clientCode: found.client_code || current.clientCode,
          clientName: found.client_name || current.clientName,
        }));
      } else if (waitingHint) {
        setFormData((current) => ({
          ...current,
          article: value,
          designation: waitingHint.designation || current.designation,
          clientCode: waitingHint.clientCode || current.clientCode,
          clientName: waitingHint.clientName || current.clientName,
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const article = normalizeArticleCode(formData.article);
    if (!article || !formData.quantity) {
      setError('Veuillez renseigner un article et une quantité.');
      return;
    }
    if (!isValidArticleCode(article)) {
      setError(`Code article invalide. Préfixes autorisés: ${ALLOWED_ARTICLE_PREFIXES.join(', ')}`);
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess(null);

    try {
      const response = await stockImportAPI.createManual({
        article,
        quantity: Number(formData.quantity),
        designation: !matchedArticle ? formData.designation || undefined : undefined,
        clientCode: !matchedArticle ? formData.clientCode || undefined : undefined,
        clientName: !matchedArticle ? formData.clientName || undefined : undefined,
      });
      setSuccess(
        response?.data?.mode === 'new_product'
          ? 'Nouveau produit fini créé avec succès !'
          : 'Stock ajouté avec succès !'
      );
      if (onAdded) onAdded(response.data);
      // Reset form after success
      setFormData({ article: '', quantity: '', designation: '', clientCode: '', clientName: '' });
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
            Gestion manuelle stock PF
          </h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={submitting} title="Fermer">✕</button>
        </div>

        <div className="stock-import-modal__body">
          <p className="stock-import-modal__hint" style={{marginBottom: "1.5rem"}}>
            Saisissez le code article. Le système détecte automatiquement si c'est un produit existant (ajout stock) ou un nouveau produit fini.
          </p>

          {error && <div className="stock-import-modal__error">{error}</div>}
          {success && <div className="stock-import-modal__success" style={{marginBottom: "1rem"}}><strong>✓ {success}</strong></div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="article" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Article / Référence *</label>
              <input
                id="article"
                name="article"
                type="text"
                list="existing-stock-articles"
                value={formData.article}
                onChange={handleChange}
                placeholder="Tapez le code article (ex: PL12345)"
                style={{ textTransform: 'uppercase', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0' }}
                required
              />
              <datalist id="existing-stock-articles">
                {existingArticles.map((item) => (
                  <option key={item.id} value={item.article}>
                    {item.designation || ''} {item.client_name ? `- ${item.client_name}` : ''}
                  </option>
                ))}
              </datalist>
              <small style={{color: '#718096', fontSize: '0.8rem'}}>
                Code article en MAJUSCULE obligatoire (CI, CV, DI, DV, PL).
              </small>
              {matchedArticle && (
                <div style={{ fontSize: '0.82rem', color: '#4a5568', marginTop: '0.35rem' }}>
                  Produit existant détecté: {matchedArticle.article} | Stock actuel: {Number(matchedArticle.quantity || 0)} pcs
                </div>
              )}
              {!matchedArticle && formData.article.trim() && (
                <div style={{ fontSize: '0.82rem', color: '#7c3aed', marginTop: '0.35rem' }}>
                  {waitingStockHints[`${formData.article || ''}`.trim().toUpperCase()]
                    ? 'Référence trouvée dans les tâches Hors stock: données pré-remplies.'
                    : 'Nouveau produit: il sera créé dans le stock.'}
                </div>
              )}
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
            {!matchedArticle && formData.article.trim() && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label htmlFor="designation" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Désignation</label>
                  <input
                    id="designation"
                    name="designation"
                    type="text"
                    value={formData.designation}
                    onChange={handleChange}
                    placeholder="Désignation article"
                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label htmlFor="clientCode" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Code client</label>
                  <input
                    id="clientCode"
                    name="clientCode"
                    type="text"
                    value={formData.clientCode}
                    onChange={handleChange}
                    placeholder="Code client"
                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label htmlFor="clientName" style={{fontWeight: '600', color: '#2d3748', fontSize: '0.9rem'}}>Nom client</label>
                  <input
                    id="clientName"
                    name="clientName"
                    type="text"
                    value={formData.clientName}
                    onChange={handleChange}
                    placeholder="Nom client"
                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e0' }}
                  />
                </div>
              </>
            )}

            <div className="stock-import-modal__actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                Fermer
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !formData.article || !formData.quantity}>
                {submitting ? 'Ajout...' : matchedArticle ? 'Ajouter au stock' : 'Créer produit fini'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ManualStockModal;

