const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePartialPreparationQuantity, validateDeliveryQuantity } = require('../src/utils/taskValidation');

// ── Préparation partielle : 0 < prepared < total ────────────────────────────

test('préparation partielle : quantité valide (entre 1 et total-1)', () => {
  assert.deepEqual(validatePartialPreparationQuantity(600, 1000), { ok: true, value: 600 });
  assert.deepEqual(validatePartialPreparationQuantity(1, 2), { ok: true, value: 1 });
  assert.deepEqual(validatePartialPreparationQuantity('600', 1000), { ok: true, value: 600 });
});

test('préparation partielle : rejette 0, négatif, >= total, non numérique', () => {
  assert.equal(validatePartialPreparationQuantity(0, 1000).ok, false);
  assert.equal(validatePartialPreparationQuantity(-5, 1000).ok, false);
  assert.equal(validatePartialPreparationQuantity(1000, 1000).ok, false); // = total
  assert.equal(validatePartialPreparationQuantity(1500, 1000).ok, false); // > total
  assert.equal(validatePartialPreparationQuantity('abc', 1000).ok, false);
});

// ── Livraison : 1 <= ship <= remaining ──────────────────────────────────────

test('livraison : quantité valide (entre 1 et remaining)', () => {
  assert.deepEqual(validateDeliveryQuantity(400, 1000), { ok: true, value: 400 });
  assert.deepEqual(validateDeliveryQuantity(1000, 1000), { ok: true, value: 1000 }); // complète
  assert.deepEqual(validateDeliveryQuantity(1, 1), { ok: true, value: 1 });
});

test('livraison : rejette 0, négatif, > remaining, non numérique', () => {
  assert.equal(validateDeliveryQuantity(0, 1000).ok, false);
  assert.equal(validateDeliveryQuantity(-1, 1000).ok, false);
  assert.equal(validateDeliveryQuantity(1200, 1000).ok, false); // > remaining
  assert.equal(validateDeliveryQuantity('x', 1000).ok, false);
});

test('livraison : message dédié quand il ne reste qu’1 pièce', () => {
  const r = validateDeliveryQuantity(5, 1); // > remaining(1)
  assert.equal(r.ok, false);
  assert.match(r.error, /1 pièce/);
});
