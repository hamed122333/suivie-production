import React, { useState } from 'react';
import api from '../services/api';

const ImportStock = ({ onImported }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) {
      setError('Veuillez sélectionner un fichier.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setError('');
    setMessage('');

    try {
      const response = await api.post('/stock/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setMessage(`Import réussi : ${response.data.importedCount || 0} ligne(s).`);
      setFile(null);
      if (onImported) {
        onImported(response.data);
      }
    } catch (uploadError) {
      setError(uploadError?.response?.data?.error || "Erreur lors de l'import.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Importer stock produits finis</h3>
      <p style={{ marginTop: 0, color: '#64748b' }}>
        Colonnes attendues : DATE ENTREE EN STOCK, CODE ARTICLE, DESIGNATION ARTICLE, CLIENT,
        NOMCLIENT, Somme de QUANTITE, Age.
      </p>

      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(event) => setFile(event.target.files?.[0] || null)}
      />

      <div style={{ marginTop: '0.75rem' }}>
        <button className="btn btn-secondary" type="button" onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? 'Importation...' : 'Importer'}
        </button>
      </div>

      {message && <div style={{ marginTop: '0.75rem', color: '#166534' }}>{message}</div>}
      {error && <div style={{ marginTop: '0.75rem', color: '#b91c1c' }}>{error}</div>}
    </div>
  );
};

export default ImportStock;
