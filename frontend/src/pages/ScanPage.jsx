import React, { useState, useRef } from 'react';
import { scanService } from '../services/api';
import Spinner from '../components/Spinner';
import './ScanPage.css';

/**
 * Page isolée pour le scan d'inventaire avec OCR.
 */
function ScanPage() {
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannedData, setScannedData] = useState({
    supplier: { value: '', confidence: 0 },
    reel_serial_number: { value: '', confidence: 0 },
    weight_kg: { value: '', confidence: 0 },
    width_mm: { value: '', confidence: 0 },
    grammage: { value: '', confidence: 0 },
    bobine_place: { value: '', confidence: 1 } // Manuel
  });

  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      handleScan(file);
    }
  };

  const handleScan = async (file) => {
    setLoading(true);
    setError('');
    try {
      const response = await scanService.scanLabel(file);
      setScannedData(prev => ({
        ...prev,
        ...response.data,
        bobine_place: prev.bobine_place // Préserver le champ manuel
      }));
    } catch (err) {
      setError('Erreur lors de l\'analyse de l\'image. Veuillez réessayer.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setScannedData(prev => ({
      ...prev,
      [field]: { ...prev[field], value }
    }));
  };

  const handleSave = () => {
    // Logique de sauvegarde à implémenter plus tard (ex: POST /api/stock/scanned)
    alert('Données validées : ' + JSON.stringify(scannedData, null, 2));
  };

  const renderField = (label, field, id) => {
    const data = scannedData[field];
    const isLowConfidence = data.confidence < 0.7;

    return (
      <div className={`scan-field ${isLowConfidence ? 'scan-field--low-confidence' : ''}`}>
        <label htmlFor={id}>{label}</label>
        <div className="scan-input-wrapper">
          <input
            id={id}
            type="text"
            value={data.value || ''}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={isLowConfidence ? 'Saisie manuelle nécessaire' : ''}
          />
          {data.confidence > 0 && data.confidence < 1 && (
            <span className="confidence-badge" title={`Confidence: ${Math.round(data.confidence * 100)}%`}>
              {Math.round(data.confidence * 100)}%
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="scan-page">
      <header className="scan-page__header">
        <h1>Scan Inventaire</h1>
        <p>Prenez une photo de l'étiquette de la bobine pour extraire les données.</p>
      </header>

      <main className="scan-page__content">
        <section className="scan-section scan-section--capture">
          <div className="capture-box" onClick={() => fileInputRef.current.click()}>
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="capture-preview" />
            ) : (
              <div className="capture-placeholder">
                <i className="upload-icon">📷</i>
                <span>Prendre une photo ou uploader</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleFileChange}
              hidden
            />
          </div>
          {loading && (
            <div className="scan-loading-overlay">
              <Spinner />
              <span>Analyse en cours...</span>
            </div>
          )}
        </section>

        <section className="scan-section scan-section--data">
          <div className="scan-form">
            {renderField('Fournisseur', 'supplier', 'supplier')}
            {renderField('N° Serial Bobine', 'reel_serial_number', 'reel_serial')}
            {renderField('Poids (kg)', 'weight_kg', 'weight')}
            {renderField('Laize (mm)', 'width_mm', 'width')}
            {renderField('Grammage', 'grammage', 'grammage')}

            <div className="scan-field">
              <label htmlFor="bobine_place">Emplacement (S1, S2...)</label>
              <input
                id="bobine_place"
                type="text"
                value={scannedData.bobine_place.value}
                onChange={(e) => handleChange('bobine_place', e.target.value)}
                placeholder="Ex: S1"
              />
            </div>

            {error && <div className="scan-error">{error}</div>}

            <div className="scan-actions">
              <button
                className="btn btn--secondary"
                onClick={() => { setPreviewUrl(null); setScannedData({ ...scannedData, supplier: { value: '', confidence: 0 } }); }}
              >
                Réessayer
              </button>
              <button
                className="btn btn--primary"
                onClick={handleSave}
                disabled={loading || !scannedData.reel_serial_number.value}
              >
                Confirmer & Enregistrer
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ScanPage;

