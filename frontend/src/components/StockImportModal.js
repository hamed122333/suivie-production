import React, { useRef, useState } from 'react';
import { stockImportAPI } from '../services/api';
import './StockImportModal.css';

const StockImportModal = ({ onClose, onImported }) => {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setError('');
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Veuillez sélectionner un fichier Excel.');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await stockImportAPI.upload(formData);
      setResult(response.data);
      if (onImported) onImported(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur lors de l'importation.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="modal-overlay stock-import-modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-content stock-import-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Importer des articles depuis Excel"
      >
        <div className="modal-header stock-import-modal__header">
          <h3 className="modal-title">
            <span role="img" aria-label="package" style={{ marginRight: '8px' }}>📦</span>
            Importer des articles (Excel)
          </h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={uploading} title="Fermer">
            ✕
          </button>
        </div>

        <div className="stock-import-modal__body">
          <p className="stock-import-modal__hint">
            Le fichier Excel doit contenir au minimum les colonnes :
            <strong> CODE ARTICLE</strong> et <strong>Somme de QUANTITE</strong>.
            <br/><br/>
            Colonnes recommandées pour faciliter le travail des commerciaux :
            <br/>
            <span className="badge badge--gray">DESIGNATION ARTICLE</span>
            <span className="badge badge--gray">CLIENT</span>
            <span className="badge badge--gray">NOMCLIENT</span>
            <span className="badge badge--gray">DATE ENTREE EN STOCK</span>
          </p>


          {error && <div className="stock-import-modal__error">{error}</div>}

          {result ? (
            <div className="stock-import-modal__success">
              <strong>✓ {result.imported} article(s) importé(s) avec succès.</strong>
              <ul className="stock-import-modal__imported-list">
                {result.records.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    {r.article} — {r.quantity} pcs
                    <span className="stock-import-modal__ready-date">
                      (Prêt le {new Date(r.ready_date).toLocaleDateString('fr-FR')})
                    </span>
                  </li>
                ))}
                {result.records.length > 10 && (
                  <li className="stock-import-modal__more">
                    + {result.records.length - 10} autres articles…
                  </li>
                )}
              </ul>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Fermer
              </button>
            </div>
          ) : (
            <div className="stock-import-modal__upload">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={handleFileChange}
                className="stock-import-modal__file-input"
                id="stock-import-file"
              />
              <label htmlFor="stock-import-file" className="stock-import-modal__file-label">
                <span style={{ fontSize: '1.2rem', marginBottom: '4px', display: 'block' }}>📁</span>
                {selectedFile ? (
                  <strong style={{ color: '#7c3aed' }}>{selectedFile.name}</strong>
                ) : (
                  <span>Cliquez ici pour choisir un fichier <strong>.xls</strong> ou <strong>.xlsx</strong></span>
                )}
              </label>

              <div className="stock-import-modal__actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={uploading}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile}
                >
                  {uploading ? 'Importation…' : 'Importer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockImportModal;
