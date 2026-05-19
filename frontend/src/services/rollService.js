/**
 * rollService — appels au service OCR (cycle de vie des bobines).
 *
 * POST   /api/rolls       capture (photo + emplacement)
 * GET    /api/rolls       liste + statistiques
 * GET    /api/rolls/:id   détail + photo
 * PUT    /api/rolls/:id   correction + validation
 * DELETE /api/rolls/:id   suppression
 */

const OCR_URL = process.env.REACT_APP_OCR_SERVICE_URL || 'http://localhost:8000';

async function handle(res) {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

export async function captureRoll(file, storageLocation) {
  const form = new FormData();
  form.append('file', file);
  form.append('storage_location', storageLocation || '');
  return handle(await fetch(`${OCR_URL}/api/rolls`, { method: 'POST', body: form }));
}

export async function listRolls() {
  return handle(await fetch(`${OCR_URL}/api/rolls`));
}

export async function getRoll(id) {
  return handle(await fetch(`${OCR_URL}/api/rolls/${id}`));
}

export async function updateRoll(id, data) {
  return handle(await fetch(`${OCR_URL}/api/rolls/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function deleteRoll(id) {
  return handle(await fetch(`${OCR_URL}/api/rolls/${id}`, { method: 'DELETE' }));
}
