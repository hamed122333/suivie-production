const { test } = require('node:test');
const assert = require('node:assert/strict');
const userController = require('../src/controllers/userController');

// Verrouille la régression : le rôle 'livreur' DOIT rester un rôle valide à la
// création/édition (sinon il est silencieusement rétrogradé en 'user').
test('VALID_ROLES contient les 5 rôles, dont livreur', () => {
  const roles = userController.VALID_ROLES;
  assert.ok(Array.isArray(roles), 'VALID_ROLES doit être un tableau');
  for (const r of ['super_admin', 'planner', 'commercial', 'livreur', 'user']) {
    assert.ok(roles.includes(r), `le rôle "${r}" doit être valide`);
  }
});

// Le format d'ID commercial reste VL + 6 chiffres.
test('COMMERCIAL_ID_REGEX valide VL000001 et rejette les mauvais formats', () => {
  const re = userController.COMMERCIAL_ID_REGEX;
  assert.equal(re.test('VL000001'), true);
  assert.equal(re.test('VL123456'), true);
  assert.equal(re.test('VL00001'), false);   // 5 chiffres
  assert.equal(re.test('VL0000011'), false);  // 7 chiffres
  assert.equal(re.test('vl000001'), false);   // minuscules
  assert.equal(re.test('AB000001'), false);   // mauvais préfixe
});
