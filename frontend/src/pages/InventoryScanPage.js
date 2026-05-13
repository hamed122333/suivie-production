import React, { useState, useRef } from 'react';
import './InventoryScanPage.css';
import inventoryScanService from '../services/inventoryScanService';

const InventoryScanPage = () => {
    const [image, setImage] = useState(null);
    const [preview, setPreview] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (file) => {
        if (!file.type.startsWith('image/')) {
            alert('Veuillez sélectionner une image');
            return;
        }
        
        setImage(file);
        setPreview(URL.createObjectURL(file));
        setResult(null);
    };

    const handleScan = async () => {
        if (!image) return;
        
        setIsProcessing(true);
        setResult(null);
        
        try {
            const response = await inventoryScanService.uploadAndScan(image);
            setResult(response.scan);
            loadHistory();
            loadStats();
        } catch (error) {
            console.error('Scan error:', error);
            alert('Erreur lors du scan: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsProcessing(false);
        }
    };

    const loadHistory = async () => {
        try {
            const response = await inventoryScanService.getHistory();
            setHistory(response.scans || []);
        } catch (error) {
            console.error('Load history error:', error);
        }
    };

    const loadStats = async () => {
        try {
            const response = await inventoryScanService.getStats();
            setStats(response.stats);
        } catch (error) {
            console.error('Load stats error:', error);
        }
    };

    const handleExport = () => {
        inventoryScanService.exportCSV();
    };

    const handleReset = () => {
        setImage(null);
        setPreview(null);
        setResult(null);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Supprimer ce scan ?')) return;
        
        try {
            await inventoryScanService.deleteScan(id);
            loadHistory();
            loadStats();
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    React.useEffect(() => {
        loadHistory();
        loadStats();
    }, []);

    const copyToClipboard = (code) => {
        navigator.clipboard.writeText(code);
    };

    return (
        <div className="inventory-scan-page">
            <div className="scan-header">
                <h1>Inventaire - Scan Image</h1>
                <button className="btn-export" onClick={handleExport}>
                    Exporter CSV
                </button>
            </div>

            <div className="scan-content">
                <div className="scan-upload-section">
                    <div 
                        className={`drop-zone ${dragActive ? 'drag-active' : ''} ${preview ? 'has-preview' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input 
                            ref={fileInputRef}
                            type="file" 
                            accept="image/*"
                            onChange={handleFileSelect}
                            hidden
                        />
                        
                        {preview ? (
                            <div className="preview-container">
                                <img src={preview} alt="Preview" className="image-preview" />
                                <button className="btn-change" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                                    Changer l'image
                                </button>
                            </div>
                        ) : (
                            <div className="drop-content">
                                <div className="upload-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="17 8 12 3 7 8"/>
                                        <line x1="12" y1="3" x2="12" y2="15"/>
                                    </svg>
                                </div>
                                <p>Glissez une image ici ou cliquez pour sélectionner</p>
                                <span>Formats: JPG, PNG, GIF, WEBP (max 10MB)</span>
                            </div>
                        )}
                    </div>

                    <div className="scan-actions">
                        <button 
                            className="btn-scan" 
                            onClick={handleScan}
                            disabled={!image || isProcessing}
                        >
                            {isProcessing ? (
                                <>
                                    <span className="spinner"></span>
                                    Analyse en cours...
                                </>
                            ) : (
                                <>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8"/>
                                        <path d="m21 21-4.35-4.35"/>
                                    </svg>
                                    Analyser l'image
                                </>
                            )}
                        </button>
                        
                        {image && (
                            <button className="btn-reset" onClick={handleReset}>
                                Réinitialiser
                            </button>
                        )}
                    </div>

                    {result && (
                        <div className="result-section">
                            <h3>Codes détectés ({result.totalCodes})</h3>
                            
                            <div className="codes-list">
                                {result.codes && result.codes.map((item, index) => (
                                    <div key={index} className="code-item">
                                        <span className="code-value">{item.code}</span>
                                        <span className="code-confidence">
                                            {Math.round(item.confidence * 100)}%
                                        </span>
                                        <button 
                                            className="btn-copy"
                                            onClick={() => copyToClipboard(item.code)}
                                            title="Copier"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="result-meta">
                                <span>Temps: {result.processingTime}ms</span>
                                <span>Confiance OCR: {Math.round(result.confidence * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="scan-history-section">
                    <h3>Historique des scans</h3>
                    
                    {stats && (
                        <div className="stats-bar">
                            <div className="stat-item">
                                <span className="stat-value">{stats.total_scans || 0}</span>
                                <span className="stat-label">Scans</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.total_codes_detected || 0}</span>
                                <span className="stat-label">Codes</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.scan_days || 0}</span>
                                <span className="stat-label">Jours</span>
                            </div>
                        </div>
                    )}

                    <div className="history-list">
                        {history.length === 0 ? (
                            <p className="no-history">Aucun scan pour le moment</p>
                        ) : (
                            history.map(scan => (
                                <div key={scan.id} className="history-item">
                                    <div className="history-info">
                                        <span className="history-date">
                                            {new Date(scan.scanned_at).toLocaleString('fr-FR')}
                                        </span>
                                        <span className="history-codes">
                                            {scan.total_codes} code(s) détecté(s)
                                        </span>
                                    </div>
                                    <div className="history-actions">
                                        <button 
                                            className="btn-view"
                                            onClick={() => {
                                                setImage(null);
                                                setPreview(null);
                                                setResult(scan);
                                            }}
                                            title="Voir"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                                <circle cx="12" cy="12" r="3"/>
                                            </svg>
                                        </button>
                                        <button 
                                            className="btn-delete"
                                            onClick={() => handleDelete(scan.id)}
                                            title="Supprimer"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6"/>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventoryScanPage;