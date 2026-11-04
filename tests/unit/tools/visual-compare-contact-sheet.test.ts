import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { GAME_LUMA_TARGETS } from '../../browser/game-luma-targets';
import {
  buildSheet, compareRgb, findAttachment, findCatalogShot, frameFor, heatmapRgb, indexFrames, matchSize, resolveBaseline
} from '../../../tools/release/visual-compare-5.0/contact-sheet.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'vc-sheet-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const solid = (width: number, height: number, value: number, rect?: { x: number; y: number; w: number; h: number; v: number }) => {
  const data = new Uint8Array(width * height * 3).fill(value);
  if (rect) for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) data.fill(rect.v, (y * width + x) * 3, (y * width + x) * 3 + 3);
  return { width, height, data };
};
const png = (img: { width: number; height: number; data: Uint8Array }, file: string, kind: 'png' | 'jpg' = 'png') => {
  mkdirSync(dirname(file), { recursive: true });
  const s = sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 3 } });
  return (kind === 'png' ? s.png() : s.jpeg({ quality: 95 })).toFile(file);
};
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('visual compare metrics', () => {
  it('reports zero for identical frames and a black heat map', () => {
    const a = solid(160, 120, 100);
    const m = compareRgb(a, solid(160, 120, 100));
    expect(m).toMatchObject({ meanAbsDiff: 0, pctChanged: 0, lumaMean: { delta: 0 } });
    expect(Math.max(...heatmapRgb(a, a).data)).toBe(0);
  });

  it('finds the changed rectangle: percent over threshold, mean difference and the max cell', () => {
    const a = solid(160, 120, 100);
    const b = solid(160, 120, 100, { x: 40, y: 60, w: 40, h: 30, v: 160 }); // 1200 of 19200 pixels, +60 in every channel
    const m = compareRgb(a, b, { threshold: 24 });
    expect(m.pctChanged).toBe(6.25);
    expect(m.meanAbsDiff).toBe(3.75);
    expect(m.maxRegion).toMatchObject({ cell: { col: 2, row: 3 }, x: 40, y: 60, width: 20, height: 20, meanAbsDiff: 60 });
    expect(m.lumaMean.delta).toBe(3.75);
    expect(compareRgb(a, b, { threshold: 60 }).pctChanged).toBe(0); // threshold is exclusive: a change of exactly 60 is not over 60
    const heat = heatmapRgb(a, b, { amplify: 4 });
    expect(heat.data[(70 * 160 + 50) * 3]).toBe(255); // changed pixel is hot
    expect(heat.data[0]).toBe(0);
  });

  it('reports band deltas for the static sky and foreground rows', () => {
    const a = solid(128, 720, 80);
    const b = solid(128, 720, 80, { x: 0, y: 0, w: 128, h: 120, v: 90 });
    const m = compareRgb(a, b);
    expect(m.bandDelta.sky).toEqual([10, 10, 10]);
    expect(m.bandDelta.foreground).toEqual([0, 0, 0]);
  });

  it('resizes a mismatched frame to the reference size and says so', async () => {
    const { img, resized } = await matchSize(solid(80, 60, 50), 160, 120);
    expect(resized).toBe(true);
    expect([img.width, img.height]).toEqual([160, 120]);
    expect((await matchSize(solid(160, 120, 50), 160, 120)).resized).toBe(false);
  });
});

describe('visual compare sheet', () => {
  it('builds panels, summary, html and metrics from synthetic frames and harvested showcase output', async () => {
    const repo = join(tmp, 'repo');
    const baseA = join(repo, 'evidence/a.png'), baseB = join(repo, 'evidence/b.png');
    await png(solid(160, 120, 100), baseA); await png(solid(160, 120, 100), baseB);
    const run = join(tmp, 'frames-run/shard1');
    await png(solid(160, 120, 100, { x: 40, y: 60, w: 40, h: 30, v: 160 }), join(run, 'frames/va.png'));
    await png(solid(160, 120, 100, { x: 40, y: 60, w: 40, h: 30, v: 160 }), join(run, 'frames/va.jpg'), 'jpg');
    writeFileSync(join(run, 'environment.json'), JSON.stringify({ run: 'x', gl: { renderer: 'ANGLE SwiftShader' } }));
    // harvested showcase: a catalog screenshot, plus an inline attachment body and a fallback
    const acc = join(tmp, 'acc');
    await png(solid(160, 120, 200), join(acc, 'shard1/artifacts/test-results/native-examples-catalog-x/template-premium-product-viewer.png'));
    await png(solid(160, 120, 40), join(acc, 'shard1/artifacts/test-results/native-examples-catalog-x/capability-example-typed-model.png'));
    const attach = await sharp(Buffer.from(solid(32, 32, 77).data), { raw: { width: 32, height: 32, channels: 3 } }).png().toBuffer();
    const reportFile = join(acc, 'shard2/artifacts/aura3d-browser-artifacts/reports/remote-acr-report.json');
    mkdirSync(dirname(reportFile), { recursive: true });
    writeFileSync(reportFile, JSON.stringify({ suites: [{ suites: [{ specs: [{ file: 'tests/browser/native-alternative-outputs.spec.ts',
      tests: [{ results: [{ attachments: [{ name: 'vector-output.png', contentType: 'image/png', body: attach.toString('base64') }] }] }] }] }] }] }));
    const plan = {
      schema: 'aura3d.visual-compare-plan/1', from: { environment: 'baseline env' }, to: { environment: '5.0 env' }, baselineRoots: { repo: 'repo' },
      views: [
        { kind: 'paired', id: 'va', target: 't--a', categories: ['x'], motion: 'static', capture: { primaryShot: 'settle-25s', output: 'frames/va.png' },
          baselines: { 'settle-25s': { root: 'repo', path: 'evidence/a.png', sha256: sha(baseA) } }, settle: { defaultShots: ['settle-25s'] } },
        { kind: 'paired', id: 'vb', target: 't--b', categories: ['x'], motion: 'animated', changedIn4710: 'two towers', expectedDelta: 'localized', capture: { primaryShot: 'settle-60s', output: 'frames/vb.png' },
          baselines: { 'settle-60s': { root: 'repo', path: 'evidence/b.png', sha256: 'f'.repeat(64) } }, settle: { defaultShots: ['settle-60s'] } }
      ],
      showcase: [
        { kind: 'showcase', id: 'sc1', title: 'Product', capability: 'neutral env', enable: 'looks.preset', source: { type: 'examples-catalog', item: 'template:premium-product-viewer' }, fallback: { type: 'examples-catalog', item: 'capability-example:typed-model', note: 'n' } },
        { kind: 'showcase', id: 'sc2', title: 'Alt outputs', capability: 'vector', enable: '@aura3d/addons', source: { type: 'spec-attachment', spec: 'native-alternative-outputs', names: ['vector-output.png'] }, fallback: null },
        { kind: 'showcase', id: 'sc3', title: 'Gone', capability: 'none', enable: '-', source: { type: 'examples-catalog', item: 'template:nope' }, fallback: null }
      ],
      showcaseNotShown: [{ feature: 'WebGPU', why: 'no adapter' }], missingBaselines: [{ want: 'template', why: 'none' }]
    };
    const out = join(tmp, 'out');
    const metrics = await buildSheet({ plan, frameRoots: [join(tmp, 'frames-run')], out, acceptanceRun: acc, repoRoot: tmp });
    expect(metrics.counts).toEqual({ paired: 2, pairedCompared: 1, showcase: 3, showcaseFound: 2 });
    const va = metrics.views.find((v: { id: string }) => v.id === 'va');
    expect(va.metrics.pctChanged).toBe(6.25);
    expect(va.frame5.comparedAs).toBe('jpeg');
    expect(va.baseline.status).toBe('ok');
    const vb = metrics.views.find((v: { id: string }) => v.id === 'vb');
    expect(vb.baseline.status).toBe('baseline-sha-mismatch');
    expect(vb.frame5).toBeNull();
    expect(metrics.problems.join('\n')).toMatch(/vb: baseline baseline-sha-mismatch/);
    expect(metrics.problems.join('\n')).toMatch(/vb: no 5\.0 frame/);
    expect(metrics.problems.join('\n')).toMatch(/sc3: showcase frame not found/);
    expect(metrics.views.find((v: { id: string }) => v.id === 'sc1')).toMatchObject({ found: true, fallbackFound: true });
    expect(metrics.views.find((v: { id: string }) => v.id === 'sc1').metrics.meanAbsDiff).toBe(160);
    expect(metrics.views.find((v: { id: string }) => v.id === 'sc2')).toMatchObject({ found: true });
    expect(metrics.environment.fiveZero[0].gl.renderer).toBe('ANGLE SwiftShader');
    for (const f of ['summary.png', 'index.html', 'metrics.json', 'panels/va.png', 'panels/sc1.png', 'panels/sc3.png']) expect(existsSync(join(out, f))).toBe(true);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('class="paired"');
    expect(html).toContain('class="showcase"');
    expect(html).toContain('WebGPU');
    expect((await sharp(join(out, 'panels/va.png')).metadata()).width).toBe(640 * 3);
    expect(JSON.parse(readFileSync(join(out, 'metrics.json'), 'utf8')).schema).toBe('aura3d.visual-compare-metrics/1');
  });

  it('resolves baselines, frame names and harvest paths', async () => {
    const f = join(tmp, 'res/base.png');
    await png(solid(8, 8, 5), f);
    expect(resolveBaseline({ root: 'r', path: 'base.png', sha256: sha(f) }, { r: join(tmp, 'res') }).status).toBe('ok');
    expect(resolveBaseline({ root: 'r', path: 'nope.png', sha256: 'x' }, { r: join(tmp, 'res') }).status).toBe('baseline-missing');
    expect(resolveBaseline({ root: 'q', path: 'base.png', sha256: 'x' }, { r: join(tmp, 'res') }).status).toBe('baseline-root-unknown');
    expect(resolveBaseline(null, {}).status).toBe('no-baseline');
    const dir = join(tmp, 'idx/run/frames');
    await png(solid(8, 8, 1), join(dir, 'v1.png')); await png(solid(8, 8, 1), join(dir, 'v1--settle-60s.png'));
    const index = indexFrames([join(tmp, 'idx')]);
    const view = { id: 'v1', capture: { primaryShot: 'settle-25s' } };
    expect(frameFor(index, view, 'settle-25s')?.comparedAs).toBe('png');
    expect(frameFor(index, view, 'settle-60s')?.file.endsWith('v1--settle-60s.png')).toBe(true);
    expect(frameFor(index, view, 'settle-60s', { lossless: true })?.comparedAs).toBe('png');
    expect(findCatalogShot(join(tmp, 'acc'), 'template:premium-product-viewer')).not.toBeNull();
    expect(findCatalogShot(join(tmp, 'acc'), 'template:absent')).toBeNull();
    expect(findAttachment(join(tmp, 'acc'), 'native-alternative-outputs', 'stereo-output.png')).toBeNull();
    expect(findAttachment(join(tmp, 'acc'), 'native-alternative-outputs', 'vector-output.png')?.buffer).toBeInstanceOf(Buffer);
  });
});

describe('visual-compare plan.json', () => {
  const plan = JSON.parse(readFileSync(join(ROOT, 'tools/release/visual-compare-5.0/plan.json'), 'utf8'));
  const targets = new Map(GAME_LUMA_TARGETS.map((t) => [t.name, t]));

  it('lists 16 paired views whose route and query equal the game-luma target the baseline was captured from', () => {
    expect(plan.views).toHaveLength(16);
    expect(new Set(plan.views.map((v: { id: string }) => v.id)).size).toBe(16);
    for (const v of plan.views) {
      expect(v.kind).toBe('paired');
      expect(targets.get(v.target)?.url, v.id).toBe(`${v.route}${v.query}`);
      expect(v.viewport).toEqual({ width: 1280, height: 720 });
      expect(v.deviceScaleFactor).toBe(1);
      expect(v.settle.defaultShots).toHaveLength(1);
      expect(v.baselines[v.capture.primaryShot], v.id).toBeTruthy();
      expect(v.capture.spec).toBe('tests/browser/visual-compare-5.0.spec.ts');
    }
  });

  it('pins baselines by sha256 (checked wherever the frame is on this machine) and covers the requested categories', () => {
    const roots: Record<string, string> = { repo: ROOT, 'gu47-integration': join(ROOT, '../aura3d-gu47/integration') };
    for (const v of plan.views) for (const b of Object.values(v.baselines) as Array<{ root: string; path: string; sha256: string } | null>) {
      if (!b) continue;
      expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
      const file = join(roots[b.root], b.path);
      if (existsSync(file)) expect(sha(file), `${v.id} ${b.path}`).toBe(b.sha256);
    }
    const cats = new Set(plan.views.flatMap((v: { categories: string[] }) => v.categories));
    for (const c of ['neutral-env-pbr', 'sky-daylight', 'night', 'indoor', 'transparent', 'glass', 'particles-vfx', 'text-ui', 'skinned']) expect(cats.has(c), c).toBe(true);
    expect(plan.missingBaselines.length).toBeGreaterThan(0);
  });

  it('showcase entries name real catalog cases, native specs and a fallback only where one exists', () => {
    const catalog = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/native-examples-catalog/expectations.json'), 'utf8')).cases;
    const ids = new Set((Array.isArray(catalog) ? catalog.map((c: { id: string }) => c.id) : Object.keys(catalog)) as string[]);
    expect(plan.showcase.length).toBeGreaterThanOrEqual(8);
    for (const s of plan.showcase) {
      expect(s.kind).toBe('showcase');
      for (const src of [s.source, s.fallback].filter(Boolean)) {
        if (src.type === 'examples-catalog') expect(ids.has(src.item), `${s.id}: ${src.item}`).toBe(true);
        else expect(existsSync(join(ROOT, 'tests/browser', `${src.spec}.spec.ts`)), `${s.id}: ${src.spec}`).toBe(true);
      }
      expect(s.enable.length).toBeGreaterThan(10);
    }
    expect(plan.showcaseNotShown.length).toBeGreaterThan(0);
  });
});
