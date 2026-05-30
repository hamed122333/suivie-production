const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyTaskVisibility,
  buildTaskFilters,
  canAccessTask,
  parseWorkspaceId,
  parseOptionalInteger,
} = require('../src/utils/taskScope');

function assertHttp400(fn) {
  let thrown = null;
  try { fn(); } catch (e) { thrown = e; }
  assert.ok(thrown, 'une erreur aurait dû être levée');
  assert.equal(thrown.status, 400);
}

// ── parseWorkspaceId ─────────────────────────────────────────────────────────

test('parseWorkspaceId : vide/null → null', () => {
  assert.equal(parseWorkspaceId(''), null);
  assert.equal(parseWorkspaceId(null), null);
  assert.equal(parseWorkspaceId(undefined), null);
});

test('parseWorkspaceId : entier valide', () => {
  assert.equal(parseWorkspaceId('5'), 5);
  assert.equal(parseWorkspaceId(7), 7);
});

test('parseWorkspaceId : non numérique → 400', () => {
  assertHttp400(() => parseWorkspaceId('abc'));
  assertHttp400(() => parseWorkspaceId('xyz'));
});

test('parseWorkspaceId : requis mais absent → 400', () => {
  assertHttp400(() => parseWorkspaceId('', { required: true }));
  assertHttp400(() => parseWorkspaceId(null, { required: true }));
});

// ── parseOptionalInteger ─────────────────────────────────────────────────────

test('parseOptionalInteger : vide → null, valide → nombre, invalide → 400', () => {
  assert.equal(parseOptionalInteger(''), null);
  assert.equal(parseOptionalInteger(null), null);
  assert.equal(parseOptionalInteger('7'), 7);
  assertHttp400(() => parseOptionalInteger('abc'));
});

// ── buildTaskFilters ─────────────────────────────────────────────────────────

test('buildTaskFilters : query vide → objet vide', () => {
  assert.deepEqual(buildTaskFilters({}), {});
});

test('buildTaskFilters : workspaceId invalide → 400', () => {
  assertHttp400(() => buildTaskFilters({ workspaceId: 'abc' }));
});

test('buildTaskFilters : commercialId normalisé en majuscules', () => {
  const f = buildTaskFilters({ commercialId: ' vl000001 ' });
  assert.equal(f.commercialId, 'VL000001');
});

// ── applyTaskVisibility : règles par rôle ────────────────────────────────────

test('super_admin : voit tout sauf PENDING_APPROVAL', () => {
  const f = applyTaskVisibility({}, { role: 'super_admin' });
  assert.deepEqual(f.statusNotIn, ['PENDING_APPROVAL']);
});

test('planner : voit tout sauf PENDING_APPROVAL', () => {
  const f = applyTaskVisibility({}, { role: 'planner' });
  assert.deepEqual(f.statusNotIn, ['PENDING_APPROVAL']);
});

test('commercial avec commercial_id : filtré sur son code', () => {
  const f = applyTaskVisibility({}, { role: 'commercial', commercial_id: 'VL000001' });
  assert.equal(f.commercialId, 'VL000001');
  assert.deepEqual(f.statusNotIn, ['PENDING_APPROVAL']);
});

test('commercial SANS commercial_id : ne voit rien (assignedTo -1)', () => {
  const f = applyTaskVisibility({}, { role: 'commercial' });
  assert.equal(f.assignedTo, -1);
});

test('livreur : restreint aux statuts actifs/livraison', () => {
  const f = applyTaskVisibility({}, { role: 'livreur' });
  assert.deepEqual(f.statusIn, ['IN_PROGRESS', 'DONE', 'DELIVERED']);
});

test('user simple : seulement ses propres tâches', () => {
  const f = applyTaskVisibility({}, { role: 'user', id: 42 });
  assert.equal(f.createdBy, 42);
});

test('filtre PENDING_APPROVAL explicite préservé (page de revue)', () => {
  const f = applyTaskVisibility({ status: 'PENDING_APPROVAL' }, { role: 'super_admin' });
  assert.equal(f.status, 'PENDING_APPROVAL');
  assert.equal(f.statusNotIn, undefined);
});

// ── canAccessTask : permissions ──────────────────────────────────────────────

test('canAccessTask : null → false', () => {
  assert.equal(canAccessTask({ role: 'super_admin' }, null), false);
});

test('canAccessTask : super_admin accède à tout', () => {
  assert.equal(canAccessTask({ role: 'super_admin' }, { id: 1, status: 'TODO' }), true);
});

test('canAccessTask : commercial limité à son code', () => {
  const user = { role: 'commercial', commercial_id: 'VL000001' };
  assert.equal(canAccessTask(user, { commercial_id: 'VL000001' }), true);
  assert.equal(canAccessTask(user, { commercial_id: 'VL000002' }), false);
});

test('canAccessTask : livreur limité aux statuts livraison', () => {
  const user = { role: 'livreur' };
  assert.equal(canAccessTask(user, { status: 'DONE' }), true);
  assert.equal(canAccessTask(user, { status: 'TODO' }), false);
});
