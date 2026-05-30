const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeArticleCode, isValidArticleCode } = require('../src/utils/articleCode');

// ── normalizeArticleCode : valeurs nulles / vides / types invalides ──────────

test('normalizeArticleCode gère null, undefined et chaîne vide', () => {
  assert.equal(normalizeArticleCode(null), '');
  assert.equal(normalizeArticleCode(undefined), '');
  assert.equal(normalizeArticleCode(''), '');
  assert.equal(normalizeArticleCode('   '), '');
});

test('normalizeArticleCode met en majuscules et supprime les espaces', () => {
  assert.equal(normalizeArticleCode(' ci2939 '), 'CI2939');
  assert.equal(normalizeArticleCode('pl-001'), 'PL-001');
});

test('normalizeArticleCode accepte les nombres sans planter', () => {
  assert.equal(normalizeArticleCode(12345), '12345');
});

// ── isValidArticleCode : cas valides ─────────────────────────────────────────

test('isValidArticleCode accepte les préfixes autorisés', () => {
  for (const code of ['CI2939', 'CVD0956', 'DI1', 'DV9', 'FC100', 'FD-22', 'PL-001']) {
    assert.equal(isValidArticleCode(code), true, `${code} devrait être valide`);
  }
});

test('isValidArticleCode normalise la casse', () => {
  assert.equal(isValidArticleCode('ci2939'), true);
});

// ── isValidArticleCode : cas invalides (ne doit jamais planter) ───────────────

test('isValidArticleCode rejette null / undefined / vide sans exception', () => {
  assert.equal(isValidArticleCode(null), false);
  assert.equal(isValidArticleCode(undefined), false);
  assert.equal(isValidArticleCode(''), false);
  assert.equal(isValidArticleCode('   '), false);
});

test('isValidArticleCode rejette les préfixes non autorisés', () => {
  assert.equal(isValidArticleCode('XX123'), false);
  assert.equal(isValidArticleCode('AB-001'), false);
});

test('isValidArticleCode rejette un préfixe seul sans suffixe', () => {
  assert.equal(isValidArticleCode('CI'), false);
  assert.equal(isValidArticleCode('PL'), false);
});

test('isValidArticleCode rejette les caractères interdits', () => {
  assert.equal(isValidArticleCode('CI 2939'), false);
  assert.equal(isValidArticleCode('CI@939'), false);
  assert.equal(isValidArticleCode('CI_939'), false);
});

test('isValidArticleCode ne plante pas sur des types inattendus', () => {
  assert.equal(isValidArticleCode(12345), false);
  assert.equal(isValidArticleCode({}), false);
  assert.equal(isValidArticleCode([]), false);
});
