import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRecastNavigation } from '../../../packages/navigation-recast/src/index';
import { ALLOWED_ENGINE_SUBPATHS } from '../../../tools/arch-gates/rules/exportBudget';

const read = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const registry = read('aura.exports.json') as { paths: [string, string][] };
const root = read('package.json');

describe('native package entrypoints', () => {
  it('publishes the synchronous Node CommonJS math bridge alongside ESM and declarations', () => {
    expect(root.exports['./math']).toMatchObject({
      types: './dist/math/index.d.ts',
      import: './dist/math/index.js',
      require: './dist/math/index.cjs'
    });
    expect(registry.paths.some(([specifier]) => specifier === '@aura3d/engine/math')).toBe(true);
  });

  it('maps each supported optional entrypoint to a real typed source and package export', () => {
    const expected = [
      '@aura3d/assets/exporters', '@aura3d/assets/importers', '@aura3d/debug/helpers',
      '@aura3d/rendering/webgpu', '@aura3d/rendering/shader-graph',
      '@aura3d/rendering/lighting', '@aura3d/rendering/volumetrics',
      '@aura3d/engine/scatter', '@aura3d/engine/worker', '@aura3d/engine/lighting', '@aura3d/engine/shader-graph-runtime',
      '@aura3d/addons', '@aura3d/addons/utils/WorkerPool'
    ];
    const addons = read('packages/addons/package.json');
    for (const key of Object.keys(addons.exports).filter(key => key !== '.')) expected.push(`@aura3d/addons/${key.slice(2)}`);
    for (const specifier of expected) {
      const entry = registry.paths.find(([name]) => name === specifier);
      expect(entry, `${specifier} lacks a source alias`).toBeDefined();
      expect(existsSync(entry![1]), `${specifier} source is missing`).toBe(true);
      const parts = specifier.split('/');
      const name = parts.slice(0, 2).join('/');
      const short = parts.slice(2).join('/');
      const manifest = name === '@aura3d/engine' ? root : read(`packages/${name.slice('@aura3d/'.length)}/package.json`);
      const target = manifest.exports[short ? `./${short}` : '.'];
      expect(target, `${specifier} is not published`).toBeDefined();
      if (typeof target === 'object') expect(target.types, `${specifier} has no declarations`).toMatch(/^\.\/dist\/.*\.d\.ts$/);
    }
  });

  it('keeps lighting opt-in and allows only explicitly named package entrypoints', () => {
    expect(root.exports['./lighting']).toEqual({
      types: './dist/rendering/lighting/index.d.ts',
      browser: './dist/rendering/lighting/index.js',
      import: './dist/rendering/lighting/index.js',
      default: './dist/rendering/lighting/index.js'
    });
    expect(readFileSync('packages/engine/src/public/index.ts', 'utf8')).not.toMatch(/\bNativeLightmapBake\b/);
    const allowed = new Set<string>(ALLOWED_ENGINE_SUBPATHS);
    expect(allowed.has('./lighting')).toBe(true);
    expect(allowed.has('./lighting/private')).toBe(false);
    expect(allowed.has('./unapproved')).toBe(false);
    for (const existing of ['./scatter', './worker', './shader-graph-runtime']) expect(allowed.has(existing)).toBe(true);
  });

  it('reports an unavailable optional navigation peer at the actual call site', async () => {
    await expect(createRecastNavigation({ moduleLoader: async () => { throw new Error('peer not present'); } })).rejects.toThrow(/optional "recast-navigation".*Install it/s);
  });
});
