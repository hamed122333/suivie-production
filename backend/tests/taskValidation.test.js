const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTaskDraft,
  normalizeTaskBatch,
  normalizeTaskUpdatePayload,
  normalizeCommentBody,
} = require('../src/utils/taskValidation');

// Helper : vérifie qu'un appel lève une erreur HTTP 400 avec message
function assertHttp400(fn, messagePart) {
  let thrown = null;
  try { fn(); } catch (e) { thrown = e; }
  assert.ok(thrown, 'une erreur aurait dû être levée');
  assert.equal(thrown.status, 400, `statut attendu 400, reçu ${thrown.status}`);
  assert.ok(thrown.message, 'un message d\'erreur est requis');
  if (messagePart) {
    assert.ok(thrown.message.includes(messagePart), `message « ${thrown.message} » devrait contenir « ${messagePart} »`);
  }
}

// ── Titre obligatoire ────────────────────────────────────────────────────────

test('normalizeTaskDraft : titre manquant → 400', () => {
  assertHttp400(() => normalizeTaskDraft({}), 'titre');
  assertHttp400(() => normalizeTaskDraft({ title: '' }), 'titre');
  assertHttp400(() => normalizeTaskDraft({ title: '   ' }), 'titre');
  assertHttp400(() => normalizeTaskDraft({ title: null }), 'titre');
});

test('normalizeTaskDraft : valeurs par défaut appliquées', () => {
  const d = normalizeTaskDraft({ title: 'Commande X' });
  assert.equal(d.title, 'Commande X');
  assert.equal(d.priority, 'MEDIUM');
  assert.equal(d.taskType, 'PRODUCTION_ORDER');
  assert.equal(d.quantity, null);
  assert.equal(d.quantityUnit, 'pcs');
});

// ── Types de données invalides ───────────────────────────────────────────────

test('normalizeTaskDraft : priorité invalide → 400', () => {
  assertHttp400(() => normalizeTaskDraft({ title: 'X', priority: 'SUPER_URGENT' }), 'Priorite');
});

test('normalizeTaskDraft : type de tâche invalide → 400', () => {
  assertHttp400(() => normalizeTaskDraft({ title: 'X', taskType: 'BOGUS' }), 'Type');
});

test('normalizeTaskDraft : quantité invalide / négative → 400', () => {
  assertHttp400(() => normalizeTaskDraft({ title: 'X', quantity: 'abc' }), 'Quantite');
  assertHttp400(() => normalizeTaskDraft({ title: 'X', quantity: -5 }), 'Quantite');
});

test('normalizeTaskDraft : référence article invalide → 400', () => {
  assertHttp400(() => normalizeTaskDraft({ title: 'X', itemReference: 'ZZ999' }), 'Code article');
});

test('normalizeTaskDraft : date invalide → 400', () => {
  assertHttp400(() => normalizeTaskDraft({ title: 'X', dueDate: 'pas-une-date' }), 'invalide');
  assertHttp400(() => normalizeTaskDraft({ title: 'X', plannedDate: '32/13/2026' }), 'invalide');
});

test('normalizeTaskDraft : données valides complètes → ok', () => {
  const d = normalizeTaskDraft({
    title: 'Cmd', priority: 'HIGH', quantity: '12.5',
    itemReference: 'ci2939', plannedDate: '2026-05-30',
  });
  assert.equal(d.priority, 'HIGH');
  assert.equal(d.quantity, 12.5);
  assert.equal(d.itemReference, 'CI2939');
  assert.equal(d.plannedDate, '2026-05-30');
});

// ── Lots (batch) ─────────────────────────────────────────────────────────────

test('normalizeTaskBatch : liste vide / non-tableau → 400', () => {
  assertHttp400(() => normalizeTaskBatch([]), 'liste');
  assertHttp400(() => normalizeTaskBatch(null), 'liste');
  assertHttp400(() => normalizeTaskBatch('x'), 'liste');
  assertHttp400(() => normalizeTaskBatch(undefined), 'liste');
});

test('normalizeTaskBatch : propage la validation par élément → 400', () => {
  assertHttp400(() => normalizeTaskBatch([{ title: 'ok' }, { title: '' }]), 'titre');
});

// ── Mise à jour ──────────────────────────────────────────────────────────────

test('normalizeTaskUpdatePayload : statut invalide → 400', () => {
  assertHttp400(() => normalizeTaskUpdatePayload({ status: 'BOGUS' }), 'Statut');
});

test('normalizeTaskUpdatePayload : assignedTo non numérique → 400', () => {
  assertHttp400(() => normalizeTaskUpdatePayload({ assignedTo: 'abc' }), 'assignedTo');
});

test('normalizeTaskUpdatePayload : champ absent = non modifié (pas d\'erreur)', () => {
  const p = normalizeTaskUpdatePayload({});
  assert.deepEqual(p, {});
});

test('normalizeTaskUpdatePayload : assignedTo vide → null', () => {
  assert.equal(normalizeTaskUpdatePayload({ assignedTo: '' }).assignedTo, null);
  assert.equal(normalizeTaskUpdatePayload({ assignedTo: null }).assignedTo, null);
});

// ── Commentaires ─────────────────────────────────────────────────────────────

test('normalizeCommentBody : vide → 400', () => {
  assertHttp400(() => normalizeCommentBody(''), 'commentaire');
  assertHttp400(() => normalizeCommentBody('   '), 'commentaire');
  assertHttp400(() => normalizeCommentBody(null), 'commentaire');
});

test('normalizeCommentBody : texte valide → trim', () => {
  assert.equal(normalizeCommentBody('  bonjour  '), 'bonjour');
});
