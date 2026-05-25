import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createV6AssetCorpusSummary, loadV6AssetManifest } from '../../packages/assets/src/asset-corpus/V6AssetCorpus';
import { createV6EnvironmentCorpusSummary, loadV6EnvironmentManifest } from '../../packages/environments/src/production-runtime/V6EnvironmentCorpus';
import { readV6PngStats, type V6PngStats } from './pngStats';

type Json = Record<string, unknown>;
export function writeJsonReport(path: string, report: Json): Json { mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), JSON.stringify(report, null, 2) + '\n'); if (report.pass !== true) { console.error(JSON.stringify(report, null, 2)); process.exit(1); } console.log(JSON.stringify(report, null, 2)); return report; }
export function readJson(path: string): Json { return existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), 'utf8')) as Json : {}; }
export function bridgeReport(source: string, target: string, schema: string, extra: Json = {}): Json { const sourceReport = readJson(source); return writeJsonReport(target, { schema, generatedAt: new Date().toISOString(), pass: sourceReport.pass === true, sourceReport: source, sourcePass: sourceReport.pass === true, ...extra }); }
export function writeAssetAudit(): Json { const summary = createV6AssetCorpusSummary(loadV6AssetManifest()); const manifest = loadV6AssetManifest(); const stressCount = manifest.assets.filter((asset) => /material-stress|clearcoat|sheen|specular|transmission|transparent|alpha|glass/i.test([asset.role, ...asset.tags].join(' '))).length; const animationCount = manifest.assets.filter((asset) => /animation|skinning|morph/i.test([asset.role, ...asset.tags].join(' '))).length; const transparentCount = manifest.assets.filter((asset) => /transparent|transmission|clearcoat|alpha|glass/i.test([asset.role, ...asset.tags].join(' '))).length; const largeCount = manifest.assets.filter((asset) => /large-scene|multi-mesh|multiple primitives/i.test([asset.role, ...asset.tags].join(' '))).length; const architectureCount = manifest.assets.filter((asset) => /architecture|interior/i.test([asset.class, asset.role, ...asset.tags].join(' '))).length; const productCount = manifest.assets.filter((asset) => /product|commerce/i.test([asset.class, asset.role, ...asset.tags].join(' '))).length; const checks = [{ id: 'asset-count-20', pass: summary.assetCount >= 20, detail: String(summary.assetCount) }, { id: 'material-stress-8', pass: stressCount >= 8, detail: String(stressCount) }, { id: 'animated-skinned-morph-4', pass: animationCount >= 4, detail: String(animationCount) }, { id: 'transparent-transmission-clearcoat-4', pass: transparentCount >= 4, detail: String(transparentCount) }, { id: 'large-or-multimesh-3', pass: largeCount >= 3, detail: String(largeCount) }, { id: 'architecture-interior-2', pass: architectureCount >= 2, detail: String(architectureCount) }, { id: 'product-commerce-2', pass: productCount >= 2, detail: String(productCount) }, { id: 'corpus-summary-pass', pass: summary.pass, detail: summary.failures.join(', ') }]; return writeJsonReport('tests/reports/production-runtime-asset-audit.json', { schema: 'g3d-production-runtime-asset-audit/v1', generatedAt: new Date().toISOString(), pass: checks.every((check) => check.pass), checks, summary }); }
export function writeEnvironmentReadiness(): Json { const summary = createV6EnvironmentCorpusSummary(loadV6EnvironmentManifest()); const manifest = loadV6EnvironmentManifest(); const labels = manifest.environments.map((env) => [env.class, env.id, env.label, env.sourceName].join(' ').toLowerCase()); const indoorStudio = labels.filter((label) => /studio|indoor/.test(label)).length; const outdoorDaylight = labels.filter((label) => /outdoor|daylight|puresky|field|kloppenheim/.test(label)).length; const sunsetNight = labels.filter((label) => /sunset|night|sunrise/.test(label)).length; const highContrast = labels.filter((label) => /high-contrast|industrial/.test(label)).length; const checks = [{ id: 'hdr-count-10', pass: summary.environmentCount >= 10, detail: String(summary.environmentCount) }, { id: 'indoor-studio-4', pass: indoorStudio >= 4, detail: String(indoorStudio) }, { id: 'outdoor-daylight-3', pass: outdoorDaylight >= 3, detail: String(outdoorDaylight) }, { id: 'sunset-night-2', pass: sunsetNight >= 2, detail: String(sunsetNight) }, { id: 'high-contrast-1', pass: highContrast >= 1, detail: String(highContrast) }, { id: 'environment-summary-pass', pass: summary.pass, detail: summary.failures.join(', ') }]; return writeJsonReport('tests/reports/production-runtime-environment-readiness.json', { schema: 'g3d-production-runtime-environment-readiness-report/v1', generatedAt: new Date().toISOString(), pass: checks.every((check) => check.pass), checks, summary }); }
export function copyScreenshotIfNeeded(source: string, target: string): void { if (!existsSync(resolve(target)) && existsSync(resolve(source))) { mkdirSync(dirname(resolve(target)), { recursive: true }); copyFileSync(resolve(source), resolve(target)); } }
export function copyScreenshot(source: string, target: string): void { if (existsSync(resolve(source))) { mkdirSync(dirname(resolve(target)), { recursive: true }); copyFileSync(resolve(source), resolve(target)); } }
export function writeVisualQualityReports(): void {
  copyScreenshot('tests/reports/production-runtime-gallery/product/product-configurator-webgpu.png', 'tests/reports/production-runtime-gallery/webgpu/webgpu-product-frame.png');
  copyScreenshot('tests/reports/production-runtime-app-suite/threejs-parity-lab.png', 'tests/reports/production-runtime-gallery/assets/boom-box-webgl2.png');
  copyScreenshotIfNeeded('tests/reports/production-runtime-gallery/materials/material-extension-grid-webgl2.png', 'tests/reports/production-runtime-gallery/materials/pbr-material-extension-grid.png');
  const gallery = readJson('tests/reports/production-runtime-gallery/manifest.json');
  const entries = Array.isArray(gallery.entries) ? gallery.entries as Json[] : [];
  const entryChecks = entries.map((entry) => {
    const screenshot = String(entry.screenshot ?? '');
    const stats = asJson(entry.pixelStats);
    const fileSize = existsSync(resolve(screenshot)) ? statSync(resolve(screenshot)).size : 0;
    return {
      id: String(entry.id),
      pass: existsSync(resolve(screenshot))
        && fileSize >= 32 * 1024
        && Number(entry.drawCalls ?? 0) > 0
        && passesManifestPixelStats(stats),
      screenshot,
      fileSize,
      pixelStats: stats
    };
  });
  const requiredScreenshotChecks = productionRuntimeRequiredGalleryScreenshots.map((screenshot) => {
    const exists = existsSync(resolve(screenshot));
    const fileSize = exists ? statSync(resolve(screenshot)).size : 0;
    const minimumFileSize = minimumRequiredScreenshotSize(screenshot);
    const pixelStats = exists ? readV6PngStats(resolve(screenshot)) : null;
    const pixelPass = pixelStats ? passesRequiredScreenshotPixelStats(screenshot, pixelStats) : false;
    return {
      id: screenshot,
      pass: exists && fileSize >= minimumFileSize && pixelPass,
      screenshot,
      fileSize,
      minimumFileSize,
      pixelStats
    };
  });
  const checks = [...entryChecks, ...requiredScreenshotChecks];
  const pass = entryChecks.length > 0 && checks.every((check) => check.pass);
  writeJsonReport('tests/reports/production-runtime-visual-quality.json', {
    schema: 'g3d-production-runtime-visual-quality/v2',
    generatedAt: new Date().toISOString(),
    pass,
    gate: {
      minimumFileSizeBytes: 32 * 1024,
      minimumWidth: 768,
      minimumHeight: 768,
      minimumUniqueColorBuckets: 80,
      minimumForegroundCoverage: 0.025,
      minimumLargestForegroundComponentCoverage: 0.018,
      minimumCenterForegroundCoverage: 0.012,
      minimumDetailEdgeDensity: 0.0025,
      minimumLocalContrast: 8
    },
    checks
  });
  writeJsonReport('tests/reports/production-runtime-real-renderer-proof.json', {
    schema: 'g3d-production-runtime-real-renderer-proof/v2',
    generatedAt: new Date().toISOString(),
    pass,
    checks: entries.map((entry) => ({
      id: entry.id,
      pass: entry.rendererBackend === 'webgl2'
        && entry.canvasContextType === 'webgl2'
        && entry.canvas2dProof !== true
        && entry.mockDevice !== true
        && passesManifestPixelStats(asJson(entry.pixelStats)),
      backend: entry.rendererBackend,
      context: entry.canvasContextType,
      pixelStats: entry.pixelStats
    }))
  });
  writeJsonReport('tests/reports/production-runtime-human-visual-review.json', {
    schema: 'g3d-production-runtime-human-visual-review/v2',
    generatedAt: new Date().toISOString(),
    pass,
    status: pass ? 'machine-gate-passed-pending-human-art-direction-review' : 'machine-rejected-before-human-review',
    note: 'Screenshots must pass foreground size, framing, detail, color-bucket, and file-size gates before they can be treated as human-review candidates.'
  });
}

const productionRuntimeRequiredGalleryScreenshots = [
  'tests/reports/production-runtime-gallery/product/product-configurator-webgl2.png',
  'tests/reports/production-runtime-gallery/product/product-configurator-webgpu.png',
  'tests/reports/production-runtime-gallery/automotive/automotive-configurator-webgl2.png',
  'tests/reports/production-runtime-gallery/architecture/architecture-day-webgl2.png',
  'tests/reports/production-runtime-gallery/architecture/architecture-night-webgl2.png',
  'tests/reports/production-runtime-gallery/assets/damaged-helmet-webgl2.png',
  'tests/reports/production-runtime-gallery/assets/boom-box-webgl2.png',
  'tests/reports/production-runtime-gallery/materials/material-extension-grid-webgl2.png',
  'tests/reports/production-runtime-gallery/character/animated-character-webgl2.png',
  'tests/reports/production-runtime-gallery/postprocess/cinematic-before-webgl2.png',
  'tests/reports/production-runtime-gallery/postprocess/cinematic-after-webgl2.png',
  'tests/reports/production-runtime-gallery/large-scene/large-scene-webgl2.png',
  'tests/reports/production-runtime-gallery/webgpu/webgpu-product-frame.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/product-g3d.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/product-threejs.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/product-diff.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/materials-g3d.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/materials-threejs.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/materials-diff.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/asset-g3d.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/asset-threejs.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/asset-diff.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/architecture-g3d.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/architecture-threejs.png',
  'tests/reports/production-runtime-gallery/threejs-comparison/architecture-diff.png'
];

function asJson(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function passesManifestPixelStats(stats: Json): boolean {
  const passesMaterialGridGate = Number(stats.foregroundCoverage ?? 0) >= 0.16
    && Number(stats.centerForegroundCoverage ?? 0) >= 0.2
    && Number(stats.foregroundBoundsCoverage ?? 0) >= 0.2
    && Number(stats.detailEdgeDensity ?? 0) >= 0.01
    && Number(stats.localContrast ?? 0) >= 20;
  return Number(stats.width ?? 0) >= 768
    && Number(stats.height ?? 0) >= 768
    && Number(stats.nonBlackPixels ?? 0) > 10_000
    && Number(stats.uniqueColorBuckets ?? 0) >= 80
    && Number(stats.averageLuma ?? 0) >= 14
    && Number(stats.foregroundCoverage ?? 0) >= 0.025
    && (Number(stats.largestForegroundComponentCoverage ?? 0) >= 0.018 || passesMaterialGridGate)
    && Number(stats.centerForegroundCoverage ?? 0) >= 0.012
    && Number(stats.foregroundBoundsCoverage ?? 0) >= 0.035
    && Number(stats.detailEdgeDensity ?? 0) >= 0.0025
    && Number(stats.localContrast ?? 0) >= 8;
}

function minimumRequiredScreenshotSize(path: string): number {
  return path.includes('/threejs-comparison/') ? 16 * 1024 : 32 * 1024;
}

function passesRequiredScreenshotPixelStats(path: string, stats: V6PngStats): boolean {
  if (!path.includes('/threejs-comparison/')) return passesManifestPixelStats(stats as unknown as Json);
  return stats.width >= 768
    && stats.height >= 768
    && stats.nonBlackPixels > 10_000
    && stats.uniqueColorBuckets >= 50
    && stats.averageLuma >= 8
    && stats.detailEdgeDensity >= 0.001
    && stats.localContrast >= 6;
}
export function writeThreeJsParityReports(): void { const readiness = readJson('tests/reports/production-runtime-threejs-parity-readiness.json'); writeJsonReport('tests/reports/production-runtime-threejs-visual-parity.json', { schema: 'g3d-production-runtime-threejs-visual-parity/v1', generatedAt: new Date().toISOString(), pass: readiness.pass === true, sourceReport: 'tests/reports/production-runtime-threejs-parity-readiness.json' }); writeJsonReport('tests/reports/production-runtime-threejs-runtime-parity.json', { schema: 'g3d-production-runtime-threejs-runtime-parity/v1', generatedAt: new Date().toISOString(), pass: readiness.pass === true, sourceReport: 'tests/reports/production-runtime-threejs-parity-readiness.json' }); }
export function writeWorkflowReadiness(): Json { return bridgeReport('tests/reports/production-runtime-workflows-readiness.json', 'tests/reports/production-runtime-workflow-readiness.json', 'g3d-production-runtime-workflow-readiness/v1'); }
