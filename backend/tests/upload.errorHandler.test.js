const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { excelUpload, MAX_FILE_SIZE } = require('../src/middleware/upload');
const errorHandler = require('../src/middleware/errorHandler');

// ── Mini-application isolée : prouve le comportement upload + errorHandler ────
// sans base de données ni authentification.

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());

  app.post('/upload', excelUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    res.json({ ok: true, name: req.file.originalname, size: req.file.size });
  });

  app.post('/echo', (req, res) => res.json({ received: req.body }));

  // createHttpError simulé : prouve le mapping statut → réponse JSON
  app.get('/boom', (_req, _res, next) => {
    const err = new Error('Ressource introuvable');
    err.status = 404;
    next(err);
  });

  // Erreur inattendue : prouve le fallback 500 générique
  app.get('/crash', () => { throw new Error('secret interne stacktrace'); });

  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => new Promise((resolve) => server.close(resolve)));

function uploadFile({ buffer, name, type }) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], type ? { type } : {}), name);
  return fetch(`${baseUrl}/upload`, { method: 'POST', body: fd });
}

// ── Champ obligatoire manquant ───────────────────────────────────────────────

test('upload sans fichier → 400', async () => {
  const fd = new FormData();
  fd.append('autre', 'valeur');
  const res = await fetch(`${baseUrl}/upload`, { method: 'POST', body: fd });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Aucun fichier/);
});

// ── Format / type MIME non autorisé ──────────────────────────────────────────

test('upload .exe → 415 (format non autorisé)', async () => {
  const res = await uploadFile({ buffer: Buffer.from('MZ'), name: 'virus.exe', type: 'application/x-msdownload' });
  assert.equal(res.status, 415);
  const body = await res.json();
  assert.match(body.error, /Format de fichier non autorisé/);
});

test('upload .txt → 415', async () => {
  const res = await uploadFile({ buffer: Buffer.from('hello'), name: 'notes.txt', type: 'text/plain' });
  assert.equal(res.status, 415);
});

// ── Extensions autorisées acceptées ──────────────────────────────────────────

test('upload .xlsx accepté → 200', async () => {
  const res = await uploadFile({ buffer: Buffer.from('PKfake'), name: 'commandes.xlsx', type: 'application/octet-stream' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.name, 'commandes.xlsx');
});

test('upload .csv accepté → 200', async () => {
  const res = await uploadFile({ buffer: Buffer.from('a,b,c'), name: 'data.csv', type: 'text/csv' });
  assert.equal(res.status, 200);
});

// ── Taille maximale dépassée ─────────────────────────────────────────────────

test('upload > 10 Mo → 413 (trop volumineux)', async () => {
  const tooBig = Buffer.alloc(MAX_FILE_SIZE + 1024, 0x41);
  const res = await uploadFile({ buffer: tooBig, name: 'enorme.xlsx', type: 'application/octet-stream' });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.match(body.error, /trop volumineux/i);
});

// ── JSON malformé ────────────────────────────────────────────────────────────

test('corps JSON malformé → 400 contrôlé', async () => {
  const res = await fetch(`${baseUrl}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ ceci n est pas du json',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /JSON invalide/);
});

// ── Mapping createHttpError ──────────────────────────────────────────────────

test('erreur HTTP explicite (404) correctement mappée', async () => {
  const res = await fetch(`${baseUrl}/boom`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'Ressource introuvable');
});

// ── Fallback 500 sans fuite de détails ───────────────────────────────────────

test('erreur inattendue → 500 générique sans fuite de stacktrace', async () => {
  const res = await fetch(`${baseUrl}/crash`);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, 'Erreur serveur interne. Veuillez réessayer plus tard.');
  assert.ok(!/secret interne/.test(JSON.stringify(body)), 'les détails internes ne doivent pas fuiter');
});
