import { calculateWaterReflectionProjectionError301 } from './muse3jsparity-301-water-quality';
import { measureGlyphEdgeQuality301 } from './muse3jsparity-301-glyph-quality';
import { decalFootprintError, particleTrajectoryProjectionError } from './muse3jsparity-301-visual-geometry-quality';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startExampleDevServer, type ExampleDevServer } from './example-dev-server';
import { VISUAL_CASES_301, VISUAL_SETTINGS_301, captureSettings301, type VisualCapture301 } from './muse3jsparity-301-visual-cases';
import { evaluateVisualMatrix, evaluateVisualWorkload, REQUIRED_VISUAL_QUALITY_METRIC, type VisualObservation } from '../../tools/muse3jsparity-readiness/visual-acceptance';
import { sameSource, sourceIdentity, type SourceIdentity } from '../../tools/muse3jsparity-readiness/evidence-lineage';

const directory = 'tests/reports/muse3jsparity';
const producerPath = 'tests/browser/muse3jsparity-301-visual.spec.ts';
const runSource = sourceIdentity(process.cwd());
const producerSha256 = createHash('sha256').update(readFileSync(producerPath)).digest('hex');
let server: ExampleDevServer;
test.beforeAll(async () => {
  server = await startExampleDevServer();
  mkdirSync(directory, { recursive: true });
  rmSync(`${directory}/visual-matrix-301.json`, { force: true });
  for (const contract of VISUAL_CASES_301) rmSync(fragmentPath(contract.family), { force: true });
});
test.afterAll(async () => { await server?.close(); });

function difference(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error('Mismatched capture dimensions');
  let delta = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) delta += Math.abs(a[i + c]! - b[i + c]!);
  return delta / (a.length / 4 * 3 * 255);
}
function clipped(pixels: readonly number[]): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! >= 250 && pixels[i + 1]! >= 250 && pixels[i + 2]! >= 250) count++;
  return count / (pixels.length / 4);
}
function contrast(on: VisualCapture301, off: VisualCapture301, region: readonly [number, number, number, number]): number {
  let sum = 0, count = 0;
  for (let y = Math.floor(region[1] * on.height); y < region[3] * on.height; y++) {
    for (let x = Math.floor(region[0] * on.width); x < region[2] * on.width; x++) {
      const i = (y * on.width + x) * 4;
      const luma = (p: readonly number[]) => (p[i]! * 0.2126 + p[i + 1]! * 0.7152 + p[i + 2]! * 0.0722) / 255;
      sum += Math.abs(luma(on.pixels) - luma(off.pixels)); count++;
    }
  }
  return sum / count;
}
/** Local 8x8 luminance SSIM, retained as fidelity context, never a win metric. */
function ssim(a: VisualCapture301, b: VisualCapture301): number {
  let sum = 0, blocks = 0;
  for (let y = 0; y + 8 <= a.height; y += 8) for (let x = 0; x + 8 <= a.width; x += 8) {
    const av: number[] = [], bv: number[] = [];
    for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) {
      const i = ((y + j) * a.width + x + k) * 4;
      av.push((a.pixels[i]! * 0.2126 + a.pixels[i + 1]! * 0.7152 + a.pixels[i + 2]! * 0.0722) / 255);
      bv.push((b.pixels[i]! * 0.2126 + b.pixels[i + 1]! * 0.7152 + b.pixels[i + 2]! * 0.0722) / 255);
    }
    const am = av.reduce((s, v) => s + v, 0) / 64, bm = bv.reduce((s, v) => s + v, 0) / 64;
    let va = 0, vb = 0, cov = 0;
    for (let i = 0; i < 64; i++) { va += (av[i]! - am) ** 2 / 63; vb += (bv[i]! - bm) ** 2 / 63; cov += (av[i]! - am) * (bv[i]! - bm) / 63; }
    sum += ((2 * am * bm + 0.0001) * (2 * cov + 0.0009)) / ((am * am + bm * bm + 0.0001) * (va + vb + 0.0009)); blocks++;
  }
  return sum / blocks;
}

interface VisualFamilyFragment {
  readonly family: string;
  readonly source: SourceIdentity;
  readonly producer: { readonly path: string; readonly sha256: string };
  readonly observation: VisualObservation;
  readonly fidelitySSIM: number;
  readonly artifacts: readonly { path: string; sha256: string }[];
}

const fragmentPath = (family: string) => `${directory}/visual-matrix-301-${family}.json`;

test.describe('V01 frozen seven-family native paired visual matrix', () => {
  test.describe.configure({ mode: 'serial' });

  for (const contract of VISUAL_CASES_301) {
    test(`retains native paired ${contract.family} evidence`, async ({ page }, testInfo) => {
      // A family keeps its complete enabled/disabled/repeat/broken oracle in one
      // source-bound fragment. A later family cannot discard completed evidence.
      testInfo.setTimeout(900_000);
      await page.goto(`${server.origin}/tests/browser/game-visual-superiority-harness.html?matrix301=1`);
      await page.waitForFunction(() => Boolean(window.__AURA3D_VISUAL_MATRIX_301__), undefined, { timeout: 120_000 });
      const fragment = await captureFamily(page, contract);
      const path = fragmentPath(contract.family);
      writeFileSync(path, `${JSON.stringify(fragment, null, 2)}\n`);
      await testInfo.attach(`visual-matrix-${contract.family}`, { path, contentType: 'application/json' });
      const result = evaluateVisualWorkload(contract, fragment.observation);
      expect(result.verdict, JSON.stringify(result)).not.toBe('inconclusive');
    });
  }

  test('assembles all seven source-frozen family fragments', async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const fragments = VISUAL_CASES_301.map(contract => {
      const path = fragmentPath(contract.family);
      expect(existsSync(path), `Missing current-run ${contract.family} fragment`).toBe(true);
      const fragment = JSON.parse(readFileSync(path, 'utf8')) as VisualFamilyFragment;
      expect(fragment.family).toBe(contract.family);
      expect(sameSource(fragment.source, runSource), `${contract.family} source identity`).toBe(true);
      expect(fragment.producer).toEqual({ path: producerPath, sha256: producerSha256 });
      return fragment;
    });
    const observations = fragments.map(fragment => fragment.observation);
    const artifacts = fragments.flatMap(fragment => [...fragment.artifacts]);
    const fidelity = Object.fromEntries(fragments.map(fragment => [fragment.family, fragment.fidelitySSIM]));
    const result = evaluateVisualMatrix(VISUAL_CASES_301, observations);
    const featureQualityCoverage = Object.fromEntries(VISUAL_CASES_301.map(contract => {
      const observation = observations.find(value => value.family === contract.family);
      const metric = contract.metrics.find(value => value.id === REQUIRED_VISUAL_QUALITY_METRIC[contract.family]);
      const value = observation?.aura[metric?.id ?? ''];
      const accepted = Boolean(observation?.controls.brokenRejected && metric && value !== undefined && Number.isFinite(value)
        && (metric.maximum === undefined || value <= metric.maximum)
        && (metric.minimum === undefined || value >= metric.minimum));
      return [contract.family, accepted];
    }));
    const qualityTargetsMet = Object.values(featureQualityCoverage).every(Boolean)
      && result.outcomes.every(outcome => outcome.verdict !== 'inconclusive');
    // K1 requires every superiority sentence to cite a measured win. It also
    // explicitly requires ties and losses to remain visible rather than turning
    // a bounded comparison loss into an aggregate failure or a false claim.
    const superiorityClaims = result.outcomes
      .filter(outcome => outcome.verdict === 'win')
      .map(outcome => ({ family: outcome.family, verdict: outcome.verdict, winningMetrics: outcome.reasons.filter(reason => reason.endsWith(': win')) }));
    const superiorityTargetsMet = superiorityClaims.every(claim =>
      claim.verdict === 'win' && claim.winningMetrics.length > 0
    );
    const failures = [
      ...result.errors,
      ...Object.entries(featureQualityCoverage).filter(([, accepted]) => !accepted).map(([family]) => `${family}: Aura misses the frozen feature-quality target`)
    ];
    const report = {
      schema: 'aura3d.visual-matrix-301/v1',
      producer: { path: producerPath, sha256: producerSha256 },
      source: runSource,
      generatedAt: new Date().toISOString(),
      contracts: VISUAL_CASES_301,
      observations,
      ...result,
      complete: result.complete,
      qualityTargetsMet,
      superiorityTargetsMet,
      superiorityClaims,
      featureQualityCoverage,
      failures,
      fidelitySSIM: fidelity,
      artifacts,
      independentReview: 'pending'
    };
    const path = `${directory}/visual-matrix-301.json`;
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    await testInfo.attach('visual-matrix-301', { path, contentType: 'application/json' });
    expect(report.complete, JSON.stringify(report)).toBe(true);
    expect(report.qualityTargetsMet, JSON.stringify(report)).toBe(true);
    expect(report.superiorityTargetsMet, JSON.stringify(report)).toBe(true);
    expect(report.failures, JSON.stringify(report)).toEqual([]);
  });
});

async function captureFamily(
  page: import('@playwright/test').Page,
  contract: (typeof VISUAL_CASES_301)[number]
): Promise<VisualFamilyFragment> {
  const artifacts: { path: string; sha256: string }[] = [];
  const captures: VisualCapture301[] = [];
  for (const engine of ['aura', 'three'] as const) for (const enabled of [false, true]) {
    const result = await page.evaluate(async ({ family, engine, enabled }) => {
      return window.__AURA3D_VISUAL_MATRIX_301__!.capture(family, engine, enabled, family === 'camera-game-feel' ? 15 : 0);
    }, { family: contract.family, engine, enabled });
    expect(result.errors).toEqual([]);
    expect([result.width, result.height]).toEqual(contract.family === 'particles'
      ? [640, 360]
      : [VISUAL_SETTINGS_301.width, VISUAL_SETTINGS_301.height]);
    expect(result.settings).toEqual(VISUAL_SETTINGS_301);
    expect(result.actualSettings).toEqual(captureSettings301(contract.family));
    retainCapture(result, `${directory}/visual-301-${contract.family}-${engine}-${enabled ? 'on' : 'off'}.png`, artifacts);
    captures.push(result);
  }
  const [aoff, aon, toff, ton] = captures as [VisualCapture301, VisualCapture301, VisualCapture301, VisualCapture301];
  const metric = (on: VisualCapture301, off: VisualCapture301): Record<string, number> => ({
    clipping: clipped(on.pixels),
    shadowContrast: contrast(on, off, [0.18, 0.45, 0.82, 0.94]),
    reflectionContrast: contrast(on, off, [0.18, 0.45, 0.82, 0.94]),
    decalContrast: contrast(on, off, [0.3, 0.5, 0.7, 0.95]),
    textContrast: contrast(on, off, [0.1, 0, 0.9, 0.5]),
    particleContrast: contrast(on, off, [0.1, 0.1, 0.9, 0.9])
  });
  const auraMetrics = metric(aon, aoff);
  const threeMetrics = metric(ton, toff);
  if (contract.family === 'water-reflections') {
    auraMetrics.reflectionProjectionError = calculateWaterReflectionProjectionError301(aon, aoff);
    threeMetrics.reflectionProjectionError = calculateWaterReflectionProjectionError301(ton, toff);
  }
  if (contract.family === 'sdf-text') {
    auraMetrics.glyphEdgeError = measureGlyphEdgeQuality301(aon.pixels, aoff.pixels).glyphEdgeError;
    threeMetrics.glyphEdgeError = measureGlyphEdgeQuality301(ton.pixels, toff.pixels).glyphEdgeError;
  }
  if (contract.family === 'decals') {
    auraMetrics.footprintError = decalFootprintError(aon, aoff);
    threeMetrics.footprintError = decalFootprintError(ton, toff);
  }
  if (contract.family === 'particles') {
    auraMetrics.trajectoryProjectionError = particleTrajectoryProjectionError(aon);
    threeMetrics.trajectoryProjectionError = particleTrajectoryProjectionError(ton);
  }
  for (const engine of ['aura', 'three'] as const) {
    const repeat = await page.evaluate(async ({ family, engine }) =>
      window.__AURA3D_VISUAL_MATRIX_301__!.capture(family, engine, true, family === 'camera-game-feel' ? 15 : 0),
    { family: contract.family, engine });
    retainCapture(repeat, `${directory}/visual-301-${contract.family}-${engine}-repeat.png`, artifacts);
    (engine === 'aura' ? auraMetrics : threeMetrics).replayInstability = difference(
      repeat.pixels,
      (engine === 'aura' ? aon : ton).pixels
    );
    if (contract.family === 'night-lighting') {
      (engine === 'aura' ? auraMetrics : threeMetrics).shadowEdgeInstability = shadowEdgeInstability301(
        repeat,
        engine === 'aura' ? aon : ton
      );
    }
  }
  if (contract.family === 'camera-game-feel') {
    for (const engine of ['aura', 'three'] as const) {
      const displacements: number[] = [];
      for (const frame of VISUAL_SETTINGS_301.frames) {
        const shot = await page.evaluate(async ({ engine, frame }) =>
          window.__AURA3D_VISUAL_MATRIX_301__!.capture('camera-game-feel', engine, true, frame),
        { engine, frame });
        retainCapture(shot, `${directory}/visual-301-camera-game-feel-${engine}-frame-${frame}.png`, artifacts);
        displacements.push(difference(shot.pixels, (engine === 'aura' ? aoff : toff).pixels));
      }
      let jerk = 0;
      for (let index = 3; index < displacements.length; index++) {
        jerk = Math.max(jerk, Math.abs(
          displacements[index]! - 3 * displacements[index - 1]!
          + 3 * displacements[index - 2]! - displacements[index - 3]!
        ));
      }
      (engine === 'aura' ? auraMetrics : threeMetrics).temporalJerk = jerk;
      (engine === 'aura' ? auraMetrics : threeMetrics).settlingError = displacements.at(-1)!;
    }
  }
  const observation: VisualObservation = {
    family: contract.family,
    workloadFingerprint: JSON.stringify({ settings: aon.settings, family: aon.family, capture: aon.actualSettings }),
    opponentWorkloadFingerprint: JSON.stringify({ settings: ton.settings, family: ton.family, capture: ton.actualSettings }),
    aura: auraMetrics,
    three: threeMetrics,
    controls: {
      auraEnabledVsDisabled: difference(aon.pixels, aoff.pixels),
      threeEnabledVsDisabled: difference(ton.pixels, toff.pixels),
      brokenRejected: false
    }
  };
  let brokenRejected = true;
  for (const engine of ['aura', 'three'] as const) {
    const broken = await page.evaluate(async ({ family, engine }) =>
      window.__AURA3D_VISUAL_MATRIX_301__!.capture(
        family, engine, true, family === 'camera-game-feel' ? 60 : 0, true
      ),
    { family: contract.family, engine });
    retainCapture(broken, `${directory}/visual-301-${contract.family}-${engine}-broken.png`, artifacts);
    const enabledCapture = engine === 'aura' ? aon : ton;
    const disabledCapture = engine === 'aura' ? aoff : toff;
    const bad = metric(broken, disabledCapture);
    if (contract.family === 'water-reflections') bad.reflectionProjectionError = calculateWaterReflectionProjectionError301(broken, disabledCapture);
    if (contract.family === 'camera-game-feel') bad.settlingError = difference(broken.pixels, enabledCapture.pixels);
    if (contract.family === 'sdf-text') bad.glyphEdgeError = measureGlyphEdgeQuality301(broken.pixels, disabledCapture.pixels).glyphEdgeError;
    if (contract.family === 'night-lighting') {
      const shifted = await page.evaluate(async ({ engine }) =>
        window.__AURA3D_VISUAL_MATRIX_301__!.capture('night-lighting', engine, true, 1, true), { engine });
      bad.shadowEdgeInstability = shadowEdgeInstability301(shifted, broken);
    }
    if (contract.family === 'decals') bad.footprintError = decalFootprintError(broken, disabledCapture);
    if (contract.family === 'particles') bad.trajectoryProjectionError = particleTrajectoryProjectionError(broken);
    const target = contract.metrics.find(metric => metric.id === REQUIRED_VISUAL_QUALITY_METRIC[contract.family])!;
    // A soft-shoulder bloom implementation can correctly resist white clipping
    // even when anti-blowout is disabled. Reject its deliberately broken stress
    // case by the gross image-energy change instead: the frozen 0.10 threshold
    // is almost 4x the normal Aura bloom delta and still catches a no-op oracle.
    brokenRejected &&= contract.family === 'bloom'
      ? difference(broken.pixels, enabledCapture.pixels) >= 0.10
      : contract.family === 'camera-game-feel'
        // The frozen broken camera re-injects full trauma after the normal
        // decay window. Its contract violation is failure to settle, whereas
        // temporal jerk is evaluated from the complete valid frame sequence
        // above. Require both a visible delta and the predeclared settling
        // ceiling so a no-op broken control cannot pass.
        ? bad.settlingError! > contract.metrics.find(metric => metric.id === 'settlingError')!.maximum!
          && difference(broken.pixels, enabledCapture.pixels) >= contract.minimumEffectDelta
        : Number.isFinite(bad[target.id]) && bad[target.id]! > target.maximum!;
  }
  const finalObservation = { ...observation, controls: { ...observation.controls, brokenRejected } };
  return {
    family: contract.family,
    source: runSource,
    producer: { path: producerPath, sha256: producerSha256 },
    observation: finalObservation,
    fidelitySSIM: ssim(aon, ton),
    artifacts
  };
}

function retainCapture(
  capture: VisualCapture301,
  path: string,
  artifacts: { path: string; sha256: string }[]
): void {
  const bytes = Buffer.from(capture.dataUrl.split(',')[1]!, 'base64');
  writeFileSync(path, bytes);
  artifacts.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}

/** Receiver-region edge changes under identical camera/state; stable shadow edges score zero. */
function shadowEdgeInstability301(a: VisualCapture301, b: VisualCapture301): number {
  const edge = (pixels: number[], x: number, y: number) => {
    const luma = (x: number, y: number) => { const i = (y * a.width + x) * 4; return (pixels[i]! * .2126 + pixels[i + 1]! * .7152 + pixels[i + 2]! * .0722) / 255; };
    return Math.abs(luma(x+1,y)-luma(x-1,y))+Math.abs(luma(x,y+1)-luma(x,y-1));
  };
  let sum = 0, count = 0;
  for (let y=Math.floor(a.height*.55);y<a.height*.9;y++) for(let x=Math.floor(a.width*.18);x<a.width*.82;x++) { sum += Math.abs(edge(a.pixels,x,y)-edge(b.pixels,x,y)); count++; }
  return sum/count;
}
