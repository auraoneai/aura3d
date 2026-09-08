import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { analyzePngDifferenceBounds } from '../../tests/browser/showcase-visual-quality.js';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { readAssetManifest, writeTypedAssets } from '../../packages/aura3d-cli/src/asset-manifest.js';
import { validateAssets } from '../../packages/aura3d-cli/src/index.js';
import { listShowcaseRouteGates } from '../showcase-library/route-gates.mjs';
import { validateRoutePrimaryProbeEvidence, routePrimaryProbeThresholds } from '../showcase-library/route-primary-probes.mjs';
import { validateReleaseGameAssetPairEvidence } from '../showcase-library/showcase-game-release-gates.mjs';

export const Q02_TARGET_ROUTES = ['showcase-turbo-drift-circuit', 'showcase-skyline-runner', 'showcase-smart-city-control'] as const;
export interface RetainedFile { path: string; sha256: string; bytes: number }
export interface RouteAcceptanceResult { schema: 'aura3d-301-route-acceptance/v1'; failures: string[]; files: RetainedFile[]; routes: string[] }
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function confined(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`Absolute artifact path: ${path}`);
  const absolute = resolve(root, path), rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`Escaping artifact: ${path}`);
  if (existsSync(absolute)) {
    const actual = relative(realpathSync(root), realpathSync(absolute));
    if (actual === '..' || actual.startsWith(`..${sep}`)) throw new Error(`Escaping symlink artifact: ${path}`);
  }
  return absolute;
}
function bind(root: string, path: string): RetainedFile {
  const bytes = readFileSync(confined(root, path));
  return { path, bytes: bytes.length, sha256: sha(bytes) };
}
function sourceFiles(root: string): string[] {
  return readdirSync(root).sort().flatMap(name => {
    const path = resolve(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}

/** Re-run the real CLI validator and generator in a disposable directory. No generated
 * evidence is repaired or trusted just because its reported status says "pass". */
export function validateTypedAssetProject(root: string, project: string): { failures: string[]; files: RetainedFile[]; assetIds: string[] } {
  const failures: string[] = [], files: RetainedFile[] = [];
  let scratch: string | undefined;
  try {
    const projectDir = confined(root, project);
    const manifest = readAssetManifest(projectDir);
    confined(projectDir, manifest.typegen);
    for (const asset of manifest.assets) confined(projectDir, asset.outputPath);
    const validation = validateAssets({ projectDir, noPlaceholders: true, requireLicense: true });
    failures.push(...validation.failures);
    scratch = mkdtempSync(resolve(tmpdir(), 'aura301-typegen-'));
    const packagePath = resolve(projectDir, 'package.json');
    if (existsSync(packagePath)) writeFileSync(resolve(scratch, 'package.json'), readFileSync(packagePath));
    const generated = writeTypedAssets(scratch, manifest);
    const retained = readFileSync(resolve(projectDir, manifest.typegen));
    if (!retained.equals(readFileSync(generated))) failures.push(`${project}: generated references differ from current CLI output; run assets typegen`);
    for (const path of ['aura.assets.json', manifest.typegen, ...manifest.assets.map(a => a.outputPath)]) files.push(bind(root, relative(root, resolve(projectDir, path))));
    for (const asset of manifest.assets) {
      if (statSync(resolve(projectDir, asset.outputPath)).size !== asset.sizeBytes) failures.push(`${project}:${asset.id}: size mismatch`);
    }
    if (new Set(manifest.assets.map(a => a.id)).size !== manifest.assets.length) failures.push(`${project}: duplicate asset IDs`);
    return { failures, files, assetIds: manifest.assets.map(a => a.id) };
  } catch (error) {
    failures.push(`${project}: ${String(error)}`);
    return { failures, files, assetIds: [] };
  } finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
}

/** Raw transition checks supplement the canonical image/composition validator. */
export function validateRouteGameplayStates(routeId: string, evidence: any): string[] {
  const failures: string[] = [], e = evidence ?? {}, b = e.before, a = e.after, r = e.reset;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!b || !a || !r) return ['missing before/after/reset gameplay states'];
  if (routeId === 'showcase-turbo-drift-circuit') {
    if (!finite(a.speed) || !finite(b.speed) || a.speed <= b.speed + .04) failures.push('throttle speed transition absent');
    if (!finite(a.raceState?.heading) || !finite(b.raceState?.heading) || Math.abs(a.raceState.heading - b.raceState.heading) <= .008) failures.push('steering heading transition absent');
    const states = Object.values(e).filter((v: any) => v && typeof v === 'object' && finite(v.checkpoint)) as any[];
    if (!states.some(s => s.checkpoint > b.checkpoint || s.lap > b.lap)) failures.push('raw checkpoint/lap progression absent');
    if (r.speed !== 0 || r.lap !== 1 || r.checkpoint !== 0 || !finite(r.raceState?.progress) || r.raceState.progress >= .005) failures.push('reset did not restore racing state');
  } else if (routeId === 'showcase-skyline-runner') {
    if (!finite(a.player?.x) || !finite(b.player?.x) || Math.abs(a.player.x - b.player.x) <= .04) failures.push('movement transition absent');
    if (!finite(e.respawned?.deaths) || e.respawned.deaths <= b.deaths) failures.push('hazard/respawn transition absent');
    if (e.completed?.platformerStateStatus !== 'completed' || e.completed?.checkpointId === b.checkpointId) failures.push('checkpoint/finish transition absent');
    if (r.player?.x !== b.player?.x || r.player?.y !== b.player?.y || r.deaths !== 0 || r.checkpointId !== b.checkpointId) failures.push('reset did not restore platformer state');
  } else failures.push(`unsupported gameplay contract: ${routeId}`);
  return failures;
}

/** This producer replays retained source-bound probes, composition and gameplay images.
 * Run remotely: the canonical image validators decode full desktop/mobile captures. */
export function produceRouteAcceptance(root: string, expectedSource?: { readonly commit: string; readonly tree: string; readonly lockfileSha256: string; readonly fingerprint: string }): RouteAcceptanceResult {
  const result: RouteAcceptanceResult = { schema: 'aura3d-301-route-acceptance/v1', failures: [], files: [], routes: [...Q02_TARGET_ROUTES] };
  const routes = listShowcaseRouteGates(root);
  for (const id of Q02_TARGET_ROUTES) {
    try {
      const route = routes.find((r: any) => r.id === id);
      if (!route) throw new Error('target route absent from canonical inventory');
      const probe = validateRoutePrimaryProbeEvidence(route, { root, requireScreenshot: true });
      result.failures.push(...probe.failures.map((f: string) => `${id}: ${f}`));
      const healthPath = `apps/${id}/route-health.json`;
      const health = JSON.parse(readFileSync(confined(root, healthPath), 'utf8'));
      result.files.push(bind(root, healthPath), bind(root, `tests/reports/showcase-route-primary-probes/${id}.json`));
      if (id === 'showcase-smart-city-control') {
        const city = validateSmartCityComposition(root, expectedSource);
        result.failures.push(...city.failures); result.files.push(...city.files);
        continue;
      }
      result.failures.push(...validateReleaseGameAssetPairEvidence({ root, route, routeHealth: health, requirePublicTemplateReady: false, requireFinalPromotion: false }).map((f: string) => `${id}: ${f}`));
      const reportPath = `tests/reports/showcase-gameplay/${id}.json`;
      const report = JSON.parse(readFileSync(confined(root, reportPath), 'utf8'));
      result.files.push(bind(root, reportPath));
      if (report.schema !== 'aura3d-showcase-gameplay-proof' || report.appId !== id || report.pass !== true || report.blockers?.length !== 0 || report.browserErrors?.length !== 0) result.failures.push(`${id}: failed gameplay producer`);
      const appDir = resolve(root, `apps/${id}`), sources = sourceFiles(resolve(appDir, 'src'));
      const digest = createHash('sha256');
      for (const path of sources) digest.update(relative(appDir, path)).update('\0').update(normalizeCompositionOwnedDigests(readFileSync(path, 'utf8'))).update('\0');
      if (report.routeSourceSha256 !== digest.digest('hex') || JSON.stringify(report.routeSourceFiles) !== JSON.stringify(sources.map(p => relative(root, p)))) result.failures.push(`${id}: stale/missing gameplay source binding`);
      if (report.producer !== 'tests/browser/showcase-gameplay-proof.spec.ts' || report.producerSourceSha256 !== bind(root, 'tests/browser/showcase-gameplay-proof.spec.ts').sha256) result.failures.push(`${id}: stale/missing gameplay producer binding`);
      result.failures.push(...validateRouteGameplayStates(id, report.evidence).map(f => `${id}: ${f}`));
      for (const capture of [...Object.values(report.screenshots ?? {}), ...Object.values(report.evidence?.namedCaptures ?? {})] as any[]) {
        // Legacy absolute paths cannot be rebound by suffix guessing; regenerate with relative paths.
        const actual = bind(root, capture.path);
        result.files.push(actual);
        if (actual.sha256 !== capture.sha256 || actual.bytes !== capture.bytes) result.failures.push(`${id}: gameplay capture bytes differ: ${capture.path}`);
      }
    } catch (error) { result.failures.push(`${id}: ${String(error)}`); }
  }
  return result;
}

/** Enumerates the root and every active app-local manifest, including routes outside
 * the three camera targets whose assets changed under I03/I04/E01/R04. */
export function produceTypedAssetAcceptance(root: string): RouteAcceptanceResult {
  const projects = ['.', ...readdirSync(resolve(root, 'apps')).sort()
    .filter(name => existsSync(resolve(root, 'apps', name, 'aura.assets.json')) && !existsSync(resolve(root, 'apps', name, 'RETIRED.md')))
    .map(name => `apps/${name}`)];
  const result: RouteAcceptanceResult = { schema: 'aura3d-301-route-acceptance/v1', failures: [], files: [], routes: projects };
  for (const project of projects) {
    const checked = validateTypedAssetProject(root, project);
    result.failures.push(...checked.failures.map(f => `${project}: ${f}`));
    result.files.push(...checked.files);
  }
  return result;
}

export function validateSmartCityComposition(root: string, expectedSource?: { readonly commit: string; readonly tree: string; readonly lockfileSha256: string; readonly fingerprint: string }): { failures: string[]; files: RetainedFile[] } {
  const failures: string[] = [], files: RetainedFile[] = [];
  try {
    const path = 'tests/reports/smart-city-composition-301/report.json';
    const report = JSON.parse(readFileSync(confined(root, path), 'utf8'));
    files.push(bind(root, path));
    if (report.schema !== 'aura3d.smart-city-composition-301/v1' || report.pass !== true || report.errors?.length !== 0) failures.push('Smart City composition producer failed');
    if (!expectedSource || !isDeepStrictEqual(report.source, expectedSource)) failures.push('Smart City full source identity differs');
    const producer = bind(root, 'tests/browser/smart-city-composition-301.spec.ts'); files.push(producer);
    if (report.producer?.path !== producer.path || report.producer?.sha256 !== producer.sha256) failures.push('Smart City producer hash differs');
    const cases = Array.isArray(report.cases) ? report.cases : [];
    const expected = ['desktop:command', 'desktop:coreselected', 'desktop:flythrough', 'mobile:command', 'mobile:coreselected', 'mobile:flythrough'];
    if (cases.length !== 6 || new Set(cases.map((c: any) => c.id)).size !== 6 || expected.some(id => !cases.some((c: any) => c.id === id))) failures.push('Smart City requires exact six camera/viewport cases');
    for (const c of cases) {
      const visible = bind(root, c.visible.path), hidden = bind(root, c.suppressed.path); files.push(visible, hidden);
      if (visible.sha256 !== c.visible.sha256 || hidden.sha256 !== c.suppressed.sha256 || visible.sha256 === hidden.sha256) failures.push(`${c.id}: missing actual suppression image control`);
      const metrics = analyzePngDifferenceBounds(readFileSync(confined(root, visible.path)), readFileSync(confined(root, hidden.path)), c.analysisCrop);
      if (!isDeepStrictEqual(metrics, c.metrics)) failures.push(`${c.id}: retained image metrics differ`);
      const mobile = c.id.startsWith('mobile:');
      const state = c.id.split(':')[1];
      if (c.state !== state || c.interactionState?.cameraMode !== (state === 'flythrough' ? 'flythrough' : 'command') || (state === 'coreselected' && c.interactionState?.selectedBuildingId !== 'core-tower-3') || c.rendererRuntime?.backend !== 'production-runtime') failures.push(`${c.id}: actual camera/selection/backend state differs`);
      if (metrics.width !== (mobile ? 390 : 1440) || metrics.height !== (mobile ? 844 : 900)) failures.push(`${c.id}: wrong viewport`);
      if (!metrics.bounds || metrics.changedPixels < routePrimaryProbeThresholds.minNonBlankPixels || (metrics.bounds?.width ?? 0) < routePrimaryProbeThresholds.minForegroundWidth || (metrics.bounds?.height ?? 0) < routePrimaryProbeThresholds.minForegroundHeight || metrics.colorBuckets < routePrimaryProbeThresholds.minColorBuckets || metrics.readabilityScore < routePrimaryProbeThresholds.minReadabilityScore || metrics.clipped) failures.push(`${c.id}: hero unreadable/clipped`);
      if (!Array.isArray(c.panels) || c.panels.length === 0) failures.push(`${c.id}: panel rectangles missing`);
      let maxOverlap = 0;
      for (const panel of c.panels ?? []) {
        const r = panel.rect, b = metrics.bounds;
        if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) { failures.push(`${c.id}: invalid panel rectangle`); continue; }
        const overlap = b ? Math.max(0, Math.min(b.x + b.width, r.x + r.width) - Math.max(b.x, r.x)) * Math.max(0, Math.min(b.y + b.height, r.y + r.height) - Math.max(b.y, r.y)) / (b.width * b.height) : 1;
        maxOverlap = Math.max(maxOverlap, overlap);
        if (!Number.isFinite(panel.overlapRatio) || Math.abs(overlap - panel.overlapRatio) > 1e-9) failures.push(`${c.id}: panel overlap calculation differs`);
      }
      if (!Array.isArray(c.controls) || c.controls.length === 0) failures.push(`${c.id}: measured control rectangles missing`);
      for (const control of c.controls ?? []) {
        const r = control.rect;
        if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0 || r.x < 0 || r.y < 0 || r.x + r.width > metrics.width || r.y + r.height > metrics.height) failures.push(`${c.id}: control rectangle outside viewport`);
      }
      if (maxOverlap > .08 || !Number.isFinite(c.maxPanelOverlap) || Math.abs(maxOverlap - c.maxPanelOverlap) > 1e-9 || c.controlsInViewport !== true) failures.push(`${c.id}: panel occlusion/control viewport failed`);
    }
  } catch (error) { failures.push(`Smart City composition: ${String(error)}`); }
  return { failures, files };
}

function normalizeCompositionOwnedDigests(source: string): string {
  return source.replace(
    /("(?:routePrimaryScreenshotSha256|screenshotSha256)":\s*")sha256-[a-f0-9]{64}(")/g,
    '$1<composition-owned>$2'
  );
}
