import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const manifestPath = "tests/reports/engine-readiness-canonical-scene/manifest.json";
const reportPath = "tests/reports/engine-readiness-visual-quality.json";

interface Capture {
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly diagnostics: { readonly lastError?: string | null; readonly drawCalls?: number };
  readonly metrics: {
    readonly nonDarkRatio: number;
    readonly salientRatio: number;
    readonly occupiedAreaRatio: number;
    readonly occupiedQuadrants: number;
    readonly colorBuckets: number;
    readonly dominantBucketRatio: number;
    readonly edgePixelRatio: number;
    readonly maxLuma: number;
    readonly flatPixelRatio: number;
    readonly localContrastRatio: number;
  };
}

const failures: string[] = [];
const captures: Capture[] = [];
if (!existsSync(manifestPath)) {
  failures.push(`missing ${manifestPath}`);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { readonly captures?: readonly Capture[] };
  captures.push(...(manifest.captures ?? []));
}

for (const expected of ["canonical", "material-variant", "shadow-toggle", "postprocess-toggle"]) {
  if (!captures.some((capture) => capture.id === expected)) {
    failures.push(`missing capture ${expected}`);
  }
}

for (const capture of captures) {
  if (!existsSync(capture.path)) failures.push(`${capture.id}: missing screenshot ${capture.path}`);
  else if (statSync(capture.path).size < 5_000) failures.push(`${capture.id}: screenshot is too small to be credible`);
  if (capture.diagnostics.lastError) failures.push(`${capture.id}: renderer reported ${capture.diagnostics.lastError}`);
  if ((capture.diagnostics.drawCalls ?? 0) < 30) failures.push(`${capture.id}: drawCalls below renderer-scene threshold`);
  const metrics = capture.metrics;
  const relaxedVariant = capture.id === "postprocess-toggle";
  if (metrics.nonDarkRatio < 0.1) failures.push(`${capture.id}: mostly dark or empty`);
  if (metrics.salientRatio < 0.08) failures.push(`${capture.id}: subject is not salient`);
  if (metrics.occupiedAreaRatio < 0.2) failures.push(`${capture.id}: subject coverage too small`);
  if (metrics.occupiedQuadrants < 4) failures.push(`${capture.id}: subject is not distributed across the viewport`);
  if (metrics.colorBuckets < 100) failures.push(`${capture.id}: insufficient material/color variation`);
  if (!relaxedVariant && metrics.dominantBucketRatio > 0.72) failures.push(`${capture.id}: dominated by one color bucket`);
  if (metrics.edgePixelRatio < 0.008) failures.push(`${capture.id}: insufficient real detail edges`);
  if (metrics.flatPixelRatio > (relaxedVariant ? 0.97 : 0.94)) failures.push(`${capture.id}: too flat`);
  if (metrics.localContrastRatio < (relaxedVariant ? 0.015 : 0.03)) failures.push(`${capture.id}: too little local contrast`);
  if (metrics.maxLuma < 120) failures.push(`${capture.id}: no bright material/light response`);
}

const hashes = new Set(captures.map((capture) => capture.hash));
if (captures.length >= 4 && hashes.size < 4) {
  failures.push("canonical variants did not produce distinct screenshots");
}

const report = {
  schemaVersion: "a3d-engine-readiness-visual-quality-v1",
  generatedAt: new Date().toISOString(),
  ok: failures.length === 0,
  manifestPath,
  captures: captures.map((capture) => ({
    id: capture.id,
    path: capture.path,
    hash: capture.hash,
    drawCalls: capture.diagnostics.drawCalls,
    metrics: capture.metrics
  })),
  failures
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
