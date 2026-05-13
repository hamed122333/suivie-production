import React, { useState, useRef, useEffect } from 'react';
import './InventoryScanPage.css';
import inventoryScanService from '../services/inventoryScanService';

const InventoryScanPage = () => {
    const [image, setImage] = useState(null);
    const [preview, setPreview] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [rawResponse, setRawResponse] = useState('');
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState(null);
    const [configs, setConfigs] = useState([]);
    const [ollamaStatus, setOllamaStatus] = useState(null);
    const [learningStatus, setLearningStatus] = useState({ learning: false, learnedCodes: [] });
    const [dragActive, setDragActive] = useState(false);
    const [activeTab, setActiveTab] = useState('scan');
    const [showCorrectionModal, setShowCorrectionModal] = useState(false);
    const [correctedCodes, setCorrectedCodes] = useState('');
    const fileInputRef = useRef(null);

    const loadData = async () => {
        try {
            const [historyRes, statsRes, configsRes, ollamaRes, learningRes] = await Promise.all([
                inventoryScanService.getHistory(),
                inventoryScanService.getStats(),
                inventoryScanService.getCodeConfigs(),
                inventoryScanService.checkOllamaStatus(),
                inventoryScanService.getLearningStatus()
            ]);
            
            setHistory(historyRes.scans || []);
            setStats(statsRes.stats);
            setConfigs(configsRes.configs || []);
            setOllamaStatus(ollamaRes);
            setLearningStatus(learningRes);
        } catch (error) {
            console.error('Load data error:', error);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

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
        setRawResponse('');
    };

    const handleScan = async () => {
        if (!image) return;
        
        setIsProcessing(true);
        setResult(null);
        
        try {
            const response = await inventoryScanService.uploadAndScan(image);
            setResult(response.scan);
            setRawResponse(response.rawResponse || '');
            await loadData();
        } catch (error) {
            console.error('Scan error:', error);
            alert('Erreur lors du scan: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveCorrection = async () => {
        if (!correctedCodes.trim()) return;
        
        const codes = correctedCodes.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        if (codes.length === 0) return;
        
        try {
            await inventoryScanService.learnCodes(codes);
            await loadData();
            setShowCorrectionModal(false);
            setCorrectedCodes('');
            alert(`L'IA a appris ${codes.length} code(s). Les prochaines images utiliseront ces codes comme référence.`);
        } catch (error) {
            console.error('Learn error:', error);
            alert('Erreur lors de l\'apprentissage');
        }
    };

    const handleClearLearning = async () => {
        try {
            await inventoryScanService.clearLearning();
            await loadData();
        } catch (error) {
            console.error('Clear learning error:', error);
        }
    };

    const handleToggleConfig = async (id, isActive) => {
        try {
            await inventoryScanService.toggleCodeConfig(id, !isActive);
            await loadData();
        } catch (error) {
            console.error('Toggle config error:', error);
        }
    };

    const handleReset = () => {
        setImage(null);
        setPreview(null);
        setResult(null);
        setRawResponse('');
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Supprimer ce scan ?')) return;
        
        try {
            await inventoryScanService.deleteScan(id);
            await loadData();
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const copyToClipboard = (code) => {
        navigator.clipboard.writeText(code);
    };

    const copyAllCodes = () => {
        if (!result?.codes) return;
        const allCodes = result.codes.map(c => c.code).join('\n');
        navigator.clipboard.writeText(allCodes);
    };

    const handleExport = () => {
        inventoryScanService.exportCSV();
    };

    const openCorrectionModal = () => {
        const detectedCodes = result?.codes?.map(c => c.code).join('\n') || '';
        setCorrectedCodes(detectedCodes);
        setShowCorrectionModal(true);
    };

    return (
        <div className="inventory-scan-page">
            <div className="scan-header">
                <h1>Inventaire - Scan Image</h1>
                <div className="header-actions">
                    {learningStatus.learning && (
                        <div className="learning-indicator">
                            <span className="learning-dot"></span>
                            AI Apprendra: {learningStatus.learnedCodes.length} code(s)
                            <button onClick={handleClearLearning}>✕</button>
                        </div>
                    )}
                    <div className={`ollama-status ${ollamaStatus?.connected ? 'connected' : 'disconnected'}`}>
                        <span className="status-dot"></span>
                        {ollamaStatus?.connected ? 'IA Connectée' : 'IA Non Connectée'}
                    </div>
                    <button className="btn-export" onClick={handleExport}>
                        Exporter CSV
                    </button>
                </div>
            </div>

            <div className="scan-tabs">
                <button 
                    className={`tab-btn ${activeTab === 'scan' ? 'active' : ''}`}
                    onClick={() => setActiveTab('scan')}
                >
                    Scan
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    Configuration Codes
                </button>
            </div>

            {activeTab === 'scan' ? (
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
                                        Analyse IA en cours...
                                    </>
                                ) : (
                                    <>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="11" cy="11" r="8"/>
                                            <path d="m21 21-4.35-4.35"/>
                                        </svg>
                                        Analyser avec IA
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
                                <div className="result-header">
                                    <h3>Codes détectés ({result.totalCodes})</h3>
                                    <div className="result-actions">
                                        {result.totalCodes > 0 && (
                                            <button className="btn-copy-all" onClick={copyAllCodes}>
                                                Copier tous
                                            </button>
                                        )}
                                        <button className="btn-correct" onClick={openCorrectionModal}>
                                            Corriger si incomplet
                                        </button>
                                    </div>
                                </div>
                                
                                {result.totalCodes === 0 ? (
                                    <div className="no-codes">
                                        <p>Aucun code détecté automatiquement.</p>
                                        <button onClick={openCorrectionModal}>
                                            Saisir les codes manuellement
                                        </button>
                                        {rawResponse && (
                                            <details className="raw-response">
                                                <summary>Voir la réponse brute de l'IA</summary>
                                                <pre>{rawResponse}</pre>
                                            </details>
                                        )}
                                    </div>
                                ) : (
                                    <div className="codes-list">
                                        {result.codes && result.codes.map((item, index) => (
                                            <div key={index} className="code-item">
                                                <span className="code-value">{item.code}</span>
                                                <span className="code-type">{item.type || 'Code'}</span>
                                                <span className="code-confidence">
                                                    {item.confidence || 80}%
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
                                )}

                                <div className="result-meta">
                                    <span>Temps: {result.processingTime}ms</span>
                                    <span>Méthode: {result.method || 'regex'}</span>
                                    {learningStatus.learning && (
                                        <span className="meta-learning">Mode apprentissage actif</span>
                                    )}
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
            ) : (
                <div className="config-section">
                    <div className="config-info">
                        <p>Configurez les types de codes à détecter. Activez ou désactivez chaque type de pattern.</p>
                    </div>
                    
                    <div className="config-list">
                        {configs.map(config => (
                            <div key={config.id} className={`config-item ${config.is_active ? 'active' : 'inactive'}`}>
                                <div className="config-toggle">
                                    <button 
                                        className={`toggle-btn ${config.is_active ? 'on' : 'off'}`}
                                        onClick={() => handleToggleConfig(config.id, config.is_active)}
                                    >
                                        {config.is_active ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="config-info">
                                    <span className="config-label">{config.label}</span>
                                    <span className="config-name">{config.name}</span>
                                    <span className="config-pattern">{config.pattern_regex}</span>
                                    {config.example_code && (
                                        <span className="config-example">Ex: {config.example_code}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showCorrectionModal && (
                <div className="modal-overlay" onClick={() => setShowCorrectionModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Corrections des Codes</h2>
                            <button className="modal-close" onClick={() => setShowCorrectionModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p>Saisissez les codes corrects (un par ligne). Ces codes seront utilisés pour améliorer la détection des prochaines images.</p>
                            <textarea
                                value={correctedCodes}
                                onChange={e => setCorrectedCodes(e.target.value)}
                                placeholder="426856004&#10;GA25-1462&#10;911152050267411096"
                                rows={10}
                            />
                            <p className="modal-hint">L'IA utilisera ces codes comme référence pour les prochaines analyses.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowCorrectionModal(false)}>
                                Annuler
                            </button>
                            <button className="btn-save" onClick={handleSaveCorrection}>
                                Enregistrer et Apprendre
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryScanPage;