import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectInstalledRelease, loadValidatedReleasePlan } from '../../tools/release/exact-release-plan.mjs';

// This suite installs only the candidate archives already built and verified by
// the source job. It never launches a browser, renders a frame, or repacks.
let project: string;
let plan: NonNullable<ReturnType<typeof loadValidatedReleasePlan>>;

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
  afterAll(() => { if (project) rmSync(project, { recursive: true, force: true }); });

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
    const output = execFileSync(process.execPath, [join(project, 'consumer.mjs')], { cwd: project, encoding: 'utf8', timeout: 120_000 });
    expect(output).toContain('native-consumer-ok');
  }, 180_000);

  it('validates same-package bake identity through the installed root lighting provider', () => {
    const fixture = join(project, 'javascript-esm.mjs');
    copyFileSync(resolve('tests/fixtures/native-consumer/javascript-esm.mjs'), fixture);
    expect(() => execFileSync(process.execPath, [fixture], { cwd: project, encoding: 'utf8', timeout: 120_000 })).not.toThrow();
  }, 180_000);

  it('runs the real CommonJS math condition and agrees with ESM', () => {
    const source = `
      const assert = require('node:assert/strict');
      const { Vector3 } = require('@aura3d/engine/math');
      assert.equal(new Vector3(1, 2, 3).add(new Vector3(2, 1, 0)).x, 3);
      import('@aura3d/engine/math').then(esm => assert.equal(esm.Vector3, Vector3)).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    writeFileSync(join(project, 'consumer.cjs'), source);
    expect(() => execFileSync(process.execPath, [join(project, 'consumer.cjs')], { cwd: project, encoding: 'utf8', timeout: 120_000 })).not.toThrow();
  }, 180_000);
});
