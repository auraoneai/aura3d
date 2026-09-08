/** Executes inside an isolated exact-installed consumer, never with workspace aliases. */
export function optionalPeerFixture(mode) {
  if (!['absent','present'].includes(mode)) throw new Error('Unknown optional peer leg');
  return `import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createAuraApp, navigation } from '@aura3d/engine';
assert.equal(typeof createAuraApp, 'function');
const soup = { positions: [-5,0,-5,5,0,-5,5,0,5,-5,0,5], indices: [0,2,1,0,3,2] };
const mode = ${JSON.stringify(mode)};
let resolved = null;
try { resolved = import.meta.resolve('@aura3d/navigation-recast'); } catch (error) { assert.equal(error.code,'ERR_MODULE_NOT_FOUND'); }
const available = await navigation.isAvailable();
let missingRequestRejected = false, pathPoints = 0, disposed = false;
if (mode === 'absent') {
  assert.equal(resolved, null, 'absent consumer resolved a navigation package from another installation');
  assert.equal(available, false);
  await assert.rejects(() => navigation.bake(soup), error => { missingRequestRejected = /navigation-recast|navigation peer unavailable/.test(String(error)); return missingRequestRejected; });
} else {
  assert.ok(resolved);
  assert.equal(available, true);
  const mesh = await navigation.bake(soup);
  try {
    const result = navigation.path(mesh,[-4,0,-4],[4,0,4]);
    assert.equal(result.success, true);
    assert.ok(result.points.length >= 2);
    pathPoints = result.points.length;
  } finally { mesh.dispose(); disposed = mesh.disposed; }
  assert.equal(disposed, true);
}
writeFileSync('optional-peer-result.json',JSON.stringify({mode,rootImport:true,available,resolved,missingRequestRejected,pathPoints,disposed}));
`;
}
export function validateOptionalPeerObservation(result, mode) {
  if (!result || result.mode !== mode || result.rootImport !== true) throw new Error('Missing optional-peer runtime observation');
  if (mode === 'absent' && (result.available !== false || result.resolved !== null || result.missingRequestRejected !== true)) throw new Error('Optional peer absence was not exercised');
  if (mode === 'present' && (result.available !== true || typeof result.resolved !== 'string' || result.pathPoints < 2 || result.disposed !== true)) throw new Error('Installed Recast was not exercised');
  if (!['absent','present'].includes(mode)) throw new Error('Unknown optional peer leg');
}
