/**
 * CapturePage — Capture rapide des bobines.
 *
 * L'opérateur photographie l'étiquette + choisit l'emplacement.
 * L'enregistrement est INSTANTANÉ : l'extraction des données se fait
 * en arrière-plan. L'opérateur enchaîne immédiatement la bobine suivante.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { captureRoll } from '../services/rollService';
import './CapturePage.css';

const LOCATIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'];

export default function CapturePage() {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [location, setLocation] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [session, setSession] = useState([]);   // bobines capturées dans la session

  // ── Sélection image ──────────────────────────────────────────────────────
  const selectFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image.');
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    setImageFile(file);
    setError(null);
  }, []);

  // ── Caméra ───────────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      videoRef.current.srcObject = stream;
      setCameraActive(true);
      setError(null);
    } catch (err) {
      setError(`Caméra inaccessible : ${err.message}`);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const snapPhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      selectFile(new File([blob], `bobine_${Date.now()}.jpg`, { type: 'image/jpeg' }));
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  // ── Capture (enregistrement instantané) ──────────────────────────────────
  const handleCapture = async () => {
    if (!imageFile) { setError("Prenez d'abord une photo de l'étiquette."); return; }
    if (!location) { setError("Choisissez l'emplacement de la bobine."); return; }

    setSaving(true);
    setError(null);
    try {
      const row = await captureRoll(imageFile, location);
      setSession((prev) => [{ id: row.id, location, at: new Date() }, ...prev]);
      // Réinitialiser uniquement l'image — l'emplacement reste (souvent identique)
      setImagePreview(null);
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(`Échec de la capture : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="capture-page">
      <div className="capture-page__header">
        <div>
          <h1>📷 Capture de bobines</h1>
          <p className="capture-page__subtitle">
            Photographiez l'étiquette — l'extraction des données se fait
            automatiquement en arrière-plan.
          </p>
        </div>
        <Link to="/bobines" className="capture-page__table-link">
          📋 Voir le tableau
        </Link>
      </div>

      {error && <div className="capture-alert capture-alert--error">⚠ {error}</div>}

      <div className="capture-layout">
        {/* ── Capture ── */}
        <div className="capture-card">
          {/* Emplacement */}
          <label className="capture-label">Emplacement de stockage</label>
          <div className="capture-locations">
            {LOCATIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                className={`capture-loc ${location === loc ? 'capture-loc--active' : ''}`}
                onClick={() => setLocation(loc)}
              >
                {loc}
              </button>
            ))}
          </div>

          {/* Image */}
          <label className="capture-label">Photo de l'étiquette</label>
          {cameraActive ? (
            <div className="capture-camera">
              <video ref={videoRef} autoPlay playsInline className="capture-camera__video" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="capture-camera__controls">
                <button onClick={snapPhoto} className="btn-cap btn-cap--primary">📸 Prendre</button>
                <button onClick={stopCamera} className="btn-cap btn-cap--ghost">✕ Annuler</button>
              </div>
            </div>
          ) : (
            <div
              className={`capture-drop ${imagePreview ? 'capture-drop--filled' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); selectFile(e.dataTransfer.files[0]); }}
              onDragOver={(e) => e.preventDefault()}
            >
              {imagePreview
                ? <img src={imagePreview} alt="Étiquette" className="capture-drop__img" />
                : (
                  <div className="capture-drop__empty">
                    <span className="capture-drop__icon">🏷️</span>
                    <p>Cliquer pour choisir une photo</p>
                    <p className="capture-drop__hint">ou glisser-déposer une image</p>
                  </div>
                )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*"
                 onChange={(e) => selectFile(e.target.files[0])} style={{ display: 'none' }} />

          {!cameraActive && (
            <div className="capture-actions">
              <button onClick={() => fileInputRef.current?.click()} className="btn-cap btn-cap--ghost">
                📁 Choisir un fichier
              </button>
              <button onClick={startCamera} className="btn-cap btn-cap--ghost">
                📱 Caméra
              </button>
            </div>
          )}

          <button
            onClick={handleCapture}
            disabled={saving || !imageFile || !location}
            className="btn-cap btn-cap--capture"
          >
            {saving ? '⏳ Enregistrement…' : '✓ Capturer la bobine'}
          </button>
        </div>

        {/* ── Session ── */}
        <div className="capture-session">
          <div className="capture-session__head">
            <h2>Capturées</h2>
            <span className="capture-session__count">{session.length}</span>
          </div>
          {session.length === 0 ? (
            <p className="capture-session__empty">
              Aucune bobine capturée pour l'instant.<br />
              Prenez une photo et choisissez un emplacement.
            </p>
          ) : (
            <ul className="capture-session__list">
              {session.map((s) => (
                <li key={s.id} className="capture-session__item">
                  <span className="capture-session__id">Bobine #{s.id}</span>
                  <span className="capture-session__loc">{s.location}</span>
                  <span className="capture-session__time">
                    {s.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {session.length > 0 && (
            <Link to="/bobines" className="capture-session__link">
              Vérifier les données →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
