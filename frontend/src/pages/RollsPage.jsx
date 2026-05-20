/**
 * RollsPage — Tableau des bobines + modal de vérification.
 *
 * Le tableau se rafraîchit tout seul : les lignes « en attente » se
 * remplissent au fur et à mesure que le worker extrait les données.
 * Clic sur une ligne → modal : photo + champs éditables → validation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listRolls, getRoll, updateRoll, deleteRoll } from '../services/rollService';
import './RollsPage.css';

const STATUS = {
  pending:    { label: 'En attente', cls: 'pending', icon: '⏳' },
  processing: { label: 'En cours',   cls: 'pending', icon: '⏳' },
  extracted:  { label: 'À vérifier', cls: 'extracted', icon: '🔵' },
  verified:   { label: 'Vérifié',    cls: 'verified', icon: '✅' },
};

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v);

/* Export CSV (séparateur ';' + BOM UTF-8 → ouverture directe dans Excel) */
function exportCsv(rolls) {
  const headers = ['ID', 'Fournisseur', 'N° Bobine', 'Grammage (g/m²)',
    'Laize (mm)', 'Poids (kg)', 'Emplacement', 'Statut',
    'Capturé le', 'Vérifié le'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const dt = (v) => (v ? new Date(v).toLocaleString('fr-FR') : '');
  const rows = rolls.map((r) => [
    r.id, r.supplier, r.reel_serial_number, r.grammage, r.width_mm,
    r.weight_kg, r.storage_location, (STATUS[r.status] || {}).label || r.status,
    dt(r.captured_at), dt(r.verified_at),
  ]);
  const csv = '﻿' + [headers, ...rows]
    .map((row) => row.map(esc).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bobines_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RollsPage() {
  const [rolls, setRolls] = useState([]);
  const [stats, setStats] = useState({ pending: 0, extracted: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listRolls();
      setRolls(data.rolls || []);
      setStats(data.stats || { pending: 0, extracted: 0, verified: 0 });
    } catch {
      /* le service OCR est peut-être indisponible — on réessaiera */
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement + rafraîchissement automatique toutes les 5 s
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="rolls-page">
      <div className="rolls-page__header">
        <div>
          <h1>📋 Bobines scannées</h1>
          <p className="rolls-page__subtitle">
            Les données s'extraient automatiquement. Vérifiez puis validez chaque bobine.
          </p>
        </div>
        <div className="rolls-page__actions">
          <button
            className="rolls-btn rolls-btn--ghost"
            onClick={() => exportCsv(rolls)}
            disabled={rolls.length === 0}
          >
            ⬇ Exporter
          </button>
          <Link to="/scan-roll" className="rolls-btn rolls-btn--primary">
            + Capturer
          </Link>
        </div>
      </div>

      {/* Statistiques */}
      <div className="rolls-stats">
        <div className="rolls-stat rolls-stat--pending">
          <span className="rolls-stat__value">{stats.pending}</span>
          <span className="rolls-stat__label">⏳ En attente</span>
        </div>
        <div className="rolls-stat rolls-stat--extracted">
          <span className="rolls-stat__value">{stats.extracted}</span>
          <span className="rolls-stat__label">🔵 À vérifier</span>
        </div>
        <div className="rolls-stat rolls-stat--verified">
          <span className="rolls-stat__value">{stats.verified}</span>
          <span className="rolls-stat__label">✅ Vérifiées</span>
        </div>
      </div>

      {/* Tableau */}
      {loading ? (
        <p className="rolls-empty">Chargement…</p>
      ) : rolls.length === 0 ? (
        <p className="rolls-empty">
          Aucune bobine. <Link to="/scan-roll">Capturez votre première bobine →</Link>
        </p>
      ) : (
        <div className="rolls-table-wrap">
          <table className="rolls-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Fournisseur</th>
                <th>N° Bobine</th>
                <th>Grammage</th>
                <th>Laize</th>
                <th>Poids</th>
                <th>Empl.</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rolls.map((r) => {
                const st = STATUS[r.status] || STATUS.pending;
                return (
                  <tr key={r.id} onClick={() => setSelectedId(r.id)} className="rolls-row">
                    <td>
                      {r.thumbnail
                        ? <img className="rolls-thumb"
                               src={`data:image/jpeg;base64,${r.thumbnail}`} alt="" />
                        : <div className="rolls-thumb rolls-thumb--empty">📷</div>}
                    </td>
                    <td>{fmt(r.supplier)}</td>
                    <td>{fmt(r.reel_serial_number)}</td>
                    <td>{r.grammage != null ? `${r.grammage} g/m²` : '—'}</td>
                    <td>{r.width_mm != null ? `${r.width_mm} mm` : '—'}</td>
                    <td>{r.weight_kg != null ? `${r.weight_kg} kg` : '—'}</td>
                    <td>{fmt(r.storage_location)}</td>
                    <td>
                      <span className={`rolls-badge rolls-badge--${st.cls}`}>
                        {st.icon} {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <VerifyModal
          rollId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ─── Modal de vérification ──────────────────────────────────────────────── */

function VerifyModal({ rollId, onClose, onSaved }) {
  const [roll, setRoll] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRoll(rollId)
      .then((data) => {
        setRoll(data);
        setForm({
          supplier: data.supplier || '',
          reel_serial_number: data.reel_serial_number || '',
          grammage: data.grammage ?? '',
          width_mm: data.width_mm ?? '',
          weight_kg: data.weight_kg ?? '',
          storage_location: data.storage_location || '',
        });
      })
      .catch((e) => setError(e.message));
  }, [rollId]);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateRoll(rollId, {
        supplier: form.supplier || null,
        reel_serial_number: form.reel_serial_number || null,
        grammage: form.grammage === '' ? null : parseFloat(form.grammage),
        width_mm: form.width_mm === '' ? null : parseFloat(form.width_mm),
        weight_kg: form.weight_kg === '' ? null : parseFloat(form.weight_kg),
        storage_location: form.storage_location || null,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cette bobine ?')) return;
    setBusy(true);
    try {
      await deleteRoll(rollId);
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const conf = (roll && roll.confidence) || {};

  return (
    <div className="vmodal-overlay" onClick={onClose}>
      <div className="vmodal" onClick={(e) => e.stopPropagation()}>
        <div className="vmodal__head">
          <h2>Bobine #{rollId}</h2>
          <button className="vmodal__close" onClick={onClose}>✕</button>
        </div>

        {!roll ? (
          <p className="vmodal__loading">Chargement…</p>
        ) : (
          <div className="vmodal__body">
            <div className="vmodal__photo">
              {roll.image_data
                ? <img src={`data:image/jpeg;base64,${roll.image_data}`} alt="Étiquette" />
                : <div className="vmodal__photo-empty">Pas d'image</div>}
            </div>

            <div className="vmodal__form">
              {roll.status === 'pending' || roll.status === 'processing' ? (
                <p className="vmodal__hint">⏳ Extraction en cours… revenez dans un instant.</p>
              ) : (
                <p className="vmodal__hint">
                  Vérifiez les valeurs (orange = à confirmer) puis validez.
                </p>
              )}

              <Field label="Fournisseur" name="supplier" value={form.supplier}
                     onChange={change} confidence={conf.supplier} />
              <Field label="N° Bobine" name="reel_serial_number" value={form.reel_serial_number}
                     onChange={change} confidence={conf.reel_serial_number} />
              <div className="vmodal__row">
                <Field label="Grammage" name="grammage" value={form.grammage}
                       onChange={change} confidence={conf.grammage} unit="g/m²" type="number" />
                <Field label="Laize" name="width_mm" value={form.width_mm}
                       onChange={change} confidence={conf.width_mm} unit="mm" type="number" />
              </div>
              <Field label="Poids" name="weight_kg" value={form.weight_kg}
                     onChange={change} confidence={conf.weight_kg} unit="kg" type="number" />

              <div className="vmodal__field">
                <label>Emplacement</label>
                <div className="vmodal__input-wrap">
                  <input type="text" name="storage_location"
                         value={form.storage_location} onChange={change}
                         placeholder="Emplacement de la bobine" />
                </div>
              </div>

              {error && <p className="vmodal__error">⚠ {error}</p>}

              <div className="vmodal__actions">
                <button className="vbtn vbtn--danger" onClick={handleDelete} disabled={busy}>
                  Supprimer
                </button>
                <button className="vbtn vbtn--primary" onClick={handleSave} disabled={busy}>
                  {busy ? '⏳…' : '✅ Valider'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, confidence, unit, type = 'text' }) {
  let level = 'none';
  if (confidence != null) level = confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
  return (
    <div className={`vmodal__field vmodal__field--${level}`}>
      <label>
        {label}
        {confidence != null && (
          <span className={`vmodal__conf vmodal__conf--${level}`}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </label>
      <div className="vmodal__input-wrap">
        <input type={type} name={name} value={value} onChange={onChange} />
        {unit && <span className="vmodal__unit">{unit}</span>}
      </div>
    </div>
  );
}
