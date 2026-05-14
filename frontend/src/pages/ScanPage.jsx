import React, { useState, useRef } from 'react';
import scanService from '../services/scanService';

const FIELD_LABELS = {
    supplier: 'Fournisseur',
    width: 'Largeur (mm)',
    weight: 'Poids (kg)',
    reel_serial_number: 'N° Bobine',
    bobine_place: 'Place Bobine'
};

const ScanPage = () => {
    const [step, setStep] = useState('start');
    const [imagePreview, setImagePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [scanData, setScanData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: 1280, height: 720 }
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            setError('Erreur caméra: ' + err.message);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                const previewUrl = URL.createObjectURL(file);
                setImageFile(file);
                setImagePreview(previewUrl);
                stopCamera();
                setStep('preview');
            }
        }, 'image/jpeg', 0.9);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const previewUrl = URL.createObjectURL(file);
            setImageFile(file);
            setImagePreview(previewUrl);
            setStep('preview');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const previewUrl = URL.createObjectURL(file);
            setImageFile(file);
            setImagePreview(previewUrl);
            setStep('preview');
        }
    };

    const processImage = async () => {
        if (!imageFile) return;
        
        setLoading(true);
        setError(null);

        try {
            const uploadResult = await scanService.uploadImage(imageFile);
            const processResult = await scanService.processScan(uploadResult.scan_id);
            
            setScanData({
                scan_id: uploadResult.scan_id,
                fields: processResult.fields,
                confidences: processResult.confidences,
                raw_text: processResult.raw_text
            });
            setStep('result');
        } catch (err) {
            console.error('Erreur:', err);
            setError(err.response?.data?.error || err.message || 'Erreur lors du traitement');
        } finally {
            setLoading(false);
        }
    };

    const updateField = (field, value) => {
        setScanData(prev => ({
            ...prev,
            fields: { ...prev.fields, [field]: value }
        }));
    };

    const saveScan = async () => {
        if (!scanData?.scan_id) return;
        
        setLoading(true);
        try {
            await scanService.updateScan(scanData.scan_id, scanData.fields);
            await scanService.validateScan(scanData.scan_id);
            setStep('saved');
        } catch (err) {
            setError('Erreur sauvegarde');
        } finally {
            setLoading(false);
        }
    };

    const resetAll = () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setStep('start');
        setImagePreview(null);
        setImageFile(null);
        setScanData(null);
        setError(null);
    };

    return (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ 
                background: 'linear-gradient(135deg, #0066CC, #004999)', 
                color: 'white', 
                padding: '24px', 
                borderRadius: '12px',
                marginBottom: '20px'
            }}>
                <h1 style={{ margin: 0 }}>📷 Scan Bobine</h1>
                <p style={{ margin: '8px 0 0', opacity: 0.9 }}>Extraction automatique des données d'étiquette</p>
            </div>

            {error && (
                <div style={{ 
                    background: '#fee2e2', 
                    color: '#dc2626', 
                    padding: '12px 16px', 
                    borderRadius: '8px',
                    marginBottom: '16px'
                }}>
                    ⚠️ {error}
                    <button onClick={() => setError(null)} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                </div>
            )}

            {/* STEP 1: Start - Select Image */}
            {step === 'start' && (
                <div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                        <button 
                            onClick={startCamera}
                            style={{
                                flex: 1,
                                padding: '40px 20px',
                                fontSize: '18px',
                                background: 'linear-gradient(135deg, #0066CC, #0052a3)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px'
                            }}
                        >
                            <span style={{ fontSize: '48px' }}>📷</span>
                            <span>Ouvrir Caméra</span>
                        </button>

                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                flex: 1,
                                padding: '40px 20px',
                                fontSize: '18px',
                                background: 'white',
                                color: '#0066CC',
                                border: '2px dashed #0066CC',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px'
                            }}
                        >
                            <span style={{ fontSize: '48px' }}>📁</span>
                            <span>Importer Image</span>
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div 
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        style={{
                            border: '2px dashed #cbd5e1',
                            borderRadius: '12px',
                            padding: '40px',
                            textAlign: 'center',
                            background: '#f8fafc'
                        }}
                    >
                        <p style={{ color: '#64748b', margin: 0 }}>
                            Glissez une image ici ou cliquez sur les boutons ci-dessus
                        </p>
                    </div>
                </div>
            )}

            {/* Camera Preview */}
            {stream && (
                <div style={{ marginBottom: '20px' }}>
                    <video 
                        ref={videoRef}
                        autoPlay
                        playsInline
                        style={{ 
                            width: '100%', 
                            maxHeight: '400px',
                            borderRadius: '12px',
                            background: '#000'
                        }}
                    />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                        <button 
                            onClick={capturePhoto}
                            style={{
                                flex: 1,
                                padding: '16px',
                                fontSize: '16px',
                                background: '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            📸 Capturer
                        </button>
                        <button 
                            onClick={stopCamera}
                            style={{
                                padding: '16px 32px',
                                fontSize: '16px',
                                background: '#6b7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            ✕ Fermer
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: Preview Image */}
            {step === 'preview' && imagePreview && (
                <div>
                    <img 
                        src={imagePreview} 
                        alt="Aperçu" 
                        style={{ 
                            width: '100%', 
                            maxHeight: '300px',
                            objectFit: 'contain',
                            borderRadius: '12px',
                            background: '#f8fafc',
                            marginBottom: '20px'
                        }}
                    />
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            onClick={processImage}
                            disabled={loading}
                            style={{
                                flex: 1,
                                padding: '16px',
                                fontSize: '16px',
                                background: '#0066CC',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.6 : 1
                            }}
                        >
                            {loading ? '⏳ Traitement...' : '🔍 Analyser l\'image'}
                        </button>
                        <button 
                            onClick={resetAll}
                            style={{
                                padding: '16px 32px',
                                fontSize: '16px',
                                background: '#6b7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            ← Retour
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: Result Form */}
            {step === 'result' && scanData && (
                <div>
                    <h2 style={{ marginTop: 0, color: '#1e293b' }}>📋 Données extraites</h2>
                    <p style={{ color: '#64748b', marginTop: 0 }}>Vérifiez et corrigez si nécessaire</p>

                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '16px',
                        marginBottom: '24px'
                    }}>
                        {Object.keys(FIELD_LABELS).map(field => {
                            const confidence = scanData.confidences?.[field]?.value;
                            const isManual = field === 'bobine_place';
                            
                            let confColor = '#ef4444';
                            if (confidence >= 80) {
                                confColor = '#16a34a';
                            } else if (confidence >= 50) {
                                confColor = '#d97706';
                            }

                            return (
                                <div 
                                    key={field}
                                    style={{
                                        padding: '16px',
                                        background: isManual ? '#eff6ff' : '#f8fafc',
                                        borderRadius: '10px',
                                        borderLeft: `4px solid ${isManual ? '#0066CC' : confColor}`
                                    }}
                                >
                                    <div style={{ 
                                        fontSize: '13px', 
                                        fontWeight: 600, 
                                        color: '#475569',
                                        marginBottom: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        {FIELD_LABELS[field]}
                                        {isManual && (
                                            <span style={{
                                                fontSize: '10px',
                                                padding: '2px 6px',
                                                background: '#0066CC',
                                                color: 'white',
                                                borderRadius: '10px'
                                            }}>
                                                Manuel
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={scanData.fields?.[field] || ''}
                                        onChange={(e) => updateField(field, e.target.value)}
                                        placeholder={isManual ? 'Ex: S1, A2...' : 'Non détecté'}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '6px',
                                            fontSize: '15px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    {!isManual && confidence !== undefined && (
                                        <div style={{
                                            fontSize: '11px',
                                            color: confColor,
                                            marginTop: '6px'
                                        }}>
                                            Confiance: {Math.round(confidence)}%
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            onClick={saveScan}
                            disabled={loading}
                            style={{
                                flex: 1,
                                padding: '16px',
                                fontSize: '16px',
                                background: '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.6 : 1
                            }}
                        >
                            {loading ? '⏳ Sauvegarde...' : '✓ Valider et Sauvegarder'}
                        </button>
                        <button 
                            onClick={resetAll}
                            style={{
                                padding: '16px 32px',
                                fontSize: '16px',
                                background: '#6b7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: Saved */}
            {step === 'saved' && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        background: '#22c55e',
                        color: 'white',
                        fontSize: '40px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px'
                    }}>
                        ✓
                    </div>
                    <h2 style={{ color: '#16a34a', marginTop: 0 }}>Scan enregistré!</h2>
                    <p style={{ color: '#64748b' }}>Les données ont été sauvegardées.</p>
                    
                    <div style={{
                        background: '#f8fafc',
                        borderRadius: '12px',
                        padding: '20px',
                        margin: '24px 0',
                        textAlign: 'left'
                    }}>
                        {Object.keys(FIELD_LABELS).map(field => (
                            <div key={field} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '10px 0',
                                borderBottom: '1px solid #e2e8f0'
                            }}>
                                <span style={{ color: '#64748b' }}>{FIELD_LABELS[field]}</span>
                                <span style={{ fontWeight: 600 }}>{scanData?.fields?.[field] || '-'}</span>
                            </div>
                        ))}
                    </div>

                    <button 
                        onClick={resetAll}
                        style={{
                            padding: '16px 32px',
                            fontSize: '16px',
                            background: '#0066CC',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        📷 Nouveau Scan
                    </button>
                </div>
            )}
        </div>
    );
};

export default ScanPage;