import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODE_ENGINE_RANGE, SUPPORTED_NODE_MAJORS, assertDeclaredNodeEngines, resolveNodeMatrix, satisfiesNodeEngine } from './node-support.mjs';

test('root manifest declares the supported Node range', () => {
  assert.equal(assertDeclaredNodeEngines(process.cwd()), NODE_ENGINE_RANGE);
});

test('engine floor matches synchronous require(esm) availability', () => {
  assert.equal(satisfiesNodeEngine('v22.12.0'), true);
  assert.equal(satisfiesNodeEngine('v22.11.9'), false);
  assert.equal(satisfiesNodeEngine('v20.19.0'), false);
  assert.equal(satisfiesNodeEngine('v26.0.0'), true);
});

test('package engines that disagree with the root range fail', () => {
  const root = mkdtempSync(join(tmpdir(), 'aura-node-engines-'));
  try {
    mkdirSync(join(root, 'packages/a'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: NODE_ENGINE_RANGE } }));
    writeFileSync(join(root, 'packages/a/package.json'), JSON.stringify({ engines: { node: '>=18' } }));
    assert.throws(() => assertDeclaredNodeEngines(root), /packages\/a\/package.json: >=18/);
    writeFileSync(join(root, 'package.json'), JSON.stringify({}));
    writeFileSync(join(root, 'packages/a/package.json'), JSON.stringify({}));
    assert.throws(() => assertDeclaredNodeEngines(root), /package.json: missing/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('matrix records every supported major as executed or explicitly unavailable', () => {
  const versions = { '/n22': 'v22.12.0', '/n26': 'v26.1.0' };
  const matrix = resolveNodeMatrix({ env: { A3D_NODE_MATRIX: '/n26' }, execPath: '/n22', run: file => versions[file] });
  assert.deepEqual(matrix.map(cell => [cell.major, cell.status]), SUPPORTED_NODE_MAJORS.map(major => [major, major === 24 ? 'unavailable' : 'available']));
  assert.match(matrix.find(cell => cell.major === 24).reason, /A3D_NODE_MATRIX/);
  assert.throws(() => resolveNodeMatrix({ env: {}, execPath: '/old', run: () => 'v20.19.0' }), /outside/);
  assert.throws(() => resolveNodeMatrix({ env: { A3D_NODE_MATRIX: '/b' }, execPath: '/a', run: () => 'v22.13.0' }), /two executables/);
  assert.throws(() => resolveNodeMatrix({ env: {}, execPath: '/odd', run: () => 'v23.1.0' }), /not a supported matrix major/);
});
