import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectInstalledRelease, loadValidatedReleasePlan } from '../../tools/release/exact-release-plan.mjs';
import { NODE_ENGINE_RANGE, resolveNodeMatrix } from '../../tools/release/node-support.mjs';
import { assertPackedWorkerAssets } from '../../tools/finalize-dist/worker-bundle.mjs';

// This suite installs only the candidate archives already built and verified by
// the source job. It never launches a browser, renders a frame, or repacks.
let project: string;
let plan: NonNullable<ReturnType<typeof loadValidatedReleasePlan>>;
// Every supported Node major is either executed against the packed install or
// recorded as unavailable in this job (tools/release/node-support.mjs).
const nodeMatrix = resolveNodeMatrix();
const availableNodes = nodeMatrix.filter((cell): cell is Extract<typeof cell, { status: 'available' }> => cell.status === 'available');
const matrixResults: { major: number; version?: string; check: string; status: 'passed' | 'failed' | 'unavailable'; reason?: string }[] = [];
const runEachNode = (check: string, file: string): void => {
  for (const cell of availableNodes) {
    try {
      const output = execFileSync(cell.executable, [file], { cwd: project, encoding: 'utf8', timeout: 120_000 });
      matrixResults.push({ major: cell.major, version: cell.version, check, status: 'passed' });
      if (check === 'esm-root') expect(output).toContain('native-consumer-ok');
    } catch (error) {
      matrixResults.push({ major: cell.major, version: cell.version, check, status: 'failed', reason: error instanceof Error ? error.message.slice(0, 2000) : String(error) });
      throw error;
    }
  }
};

describe('installed native capability consumer', () => {
  beforeAll(() => {
    const candidate = loadValidatedReleasePlan();
    if (!candidate) throw new Error('A3D_RELEASE_PLAN is required for the native packed consumer');
    plan = candidate;
    project = mkdtempSync(join(tmpdir(), 'aura-native-consumer-'));
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'aura-native-consumer', private: true, type: 'module' }));
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...plan.packages.map(p => resolve(p.tarball))], {
      cwd: project, encoding: 'utf8', stdio: 'pipe', timeout: 240_000, maxBuffer: 16 * 1024 * 1024
    });
    const installed = inspectInstalledRelease(process.cwd(), project, plan);
    expect(new Set(installed.packages.map((p: any) => p.name))).toEqual(new Set(plan.packages.map(p => p.name)));
  }, 300_000);
  afterAll(() => {
    if (project) rmSync(project, { recursive: true, force: true });
    const reportDir = process.env.NATIVE_REPORT_DIR ?? resolve('tests/reports');
    mkdirSync(reportDir, { recursive: true });
    const unavailable = nodeMatrix.filter(cell => cell.status === 'unavailable').map(cell => ({ major: cell.major, check: '*', status: 'unavailable' as const, reason: cell.reason }));
    writeFileSync(join(reportDir, 'node-support-matrix.json'), `${JSON.stringify({ schema: 'aura3d.node-support-matrix/1', engines: NODE_ENGINE_RANGE,
      candidate: plan?.reference ?? null, results: [...matrixResults, ...unavailable] }, null, 2)}\n`);
  });

  it('declares the supported Node range in the installed root manifest', () => {
    const installed = JSON.parse(readFileSync(join(project, 'node_modules/@aura3d/engine/package.json'), 'utf8')) as { engines?: { node?: string } };
    expect(installed.engines?.node).toBe(NODE_ENGINE_RANGE);
    expect(availableNodes.length).toBeGreaterThan(0);
  });

  it('ships self-contained emitted worker entrypoints and their static asset manifest', () => {
    const { files } = assertPackedWorkerAssets(join(project, 'node_modules/@aura3d/engine'));
    expect(files).toEqual(expect.arrayContaining(['render.worker.bundle.js', 'retarget.worker.bundle.js', 'zstd.worker.bundle.js']));
  });

  it('compiles and imports the real root and opt-in package APIs', () => {
    const source = `
      import { scene } from '@aura3d/engine';
      import { Vector3 } from '@aura3d/engine/math';
      import { createWorkerRenderer } from '@aura3d/engine/worker';
      import { SelectionBox } from '@aura3d/controls';
      import { createExternalAudioNodeAdapter } from '@aura3d/audio';
      import { parsePLY } from '@aura3d/assets/importers';
      import { exportGLTF } from '@aura3d/assets/exporters';
      import { buildProbeHelper } from '@aura3d/debug/helpers';
      import { DeferredPipeline } from '@aura3d/rendering/webgpu';
      import { NativeLightProbeGrid } from '@aura3d/rendering/lighting';
      import { compileShaderGraph } from '@aura3d/rendering/shader-graph';
      import { VolumeRenderer } from '@aura3d/rendering/volumetrics';
      import { WorkerPool } from '@aura3d/addons/utils/WorkerPool';
      const values = [scene, Vector3, createWorkerRenderer, SelectionBox, createExternalAudioNodeAdapter, parsePLY, exportGLTF, buildProbeHelper, DeferredPipeline, NativeLightProbeGrid, compileShaderGraph, VolumeRenderer, WorkerPool];
      if (values.some(value => typeof value !== 'function')) throw new Error('missing installed native API');
      if (new Vector3(1, 2, 3).add(new Vector3(2, 1, 0)).x !== 3) throw new Error('math result mismatch');
      console.log('native-consumer-ok');
    `;
    writeFileSync(join(project, 'consumer.mts'), source);
    execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--noEmit', '--skipLibCheck', join(project, 'consumer.mts')], { cwd: project, encoding: 'utf8', stdio: 'pipe', timeout: 120_000 });
    writeFileSync(join(project, 'consumer.mjs'), source);
    runEachNode('esm-root', join(project, 'consumer.mjs'));
  }, 180_000);

  it('validates same-package bake identity through the installed root lighting provider', () => {
    const fixture = join(project, 'javascript-esm.mjs');
    copyFileSync(resolve('tests/fixtures/native-consumer/javascript-esm.mjs'), fixture);
    expect(() => runEachNode('esm-lighting-identity', fixture)).not.toThrow();
  }, 180_000);

  it('runs the real CommonJS math condition and agrees with ESM', () => {
    const source = `
      const assert = require('node:assert/strict');
      const { Vector3 } = require('@aura3d/engine/math');
      assert.equal(new Vector3(1, 2, 3).add(new Vector3(2, 1, 0)).x, 3);
      import('@aura3d/engine/math').then(esm => assert.equal(esm.Vector3, Vector3)).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    writeFileSync(join(project, 'consumer.cjs'), source);
    expect(() => runEachNode('cjs-math', join(project, 'consumer.cjs'))).not.toThrow();
  }, 180_000);
});
