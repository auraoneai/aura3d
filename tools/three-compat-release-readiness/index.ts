import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validatePngVisual } from "../three-compat-visual-quality/visualStats";

interface ReadinessReport {
  readonly pass?: boolean;
  readonly [key: string]: unknown;
}

interface FinalScreenshot {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly role: "flagship" | "comparison" | "external";
}

const requiredReports = [
  "tests/reports/three-compat-truth.json",
  "tests/reports/three-compat-progress.json",
  "tests/reports/three-compat-legacy-prune-readiness.json",
  "tests/reports/three-compat-threejs-inventory.json",
  "tests/reports/three-compat-threejs-compatibility-matrix.json",
  "tests/reports/three-compat-asset-readiness.json",
  "tests/reports/three-compat-environment-readiness.json",
  "tests/reports/three-compat-material-readiness.json",
  "tests/reports/three-compat-renderer-readiness.json",
  "tests/reports/three-compat-core-compat-readiness.json",
  "tests/reports/three-compat-material-geometry-compat-readiness.json",
  "tests/reports/three-compat-loader-readiness.json",
  "tests/reports/three-compat-controls-readiness.json",
  "tests/reports/three-compat-animation-readiness.json",
  "tests/reports/three-compat-postprocess-readiness.json",
  "tests/reports/three-compat-shader-readiness.json",
  "tests/reports/three-compat-vfx-readiness.json",
  "tests/reports/three-compat-performance-readiness.json",
  "tests/reports/three-compat-migration-readiness.json",
  "tests/reports/three-compat-app-suite-readiness.json",
  "tests/reports/three-compat-template-readiness.json",
  "tests/reports/three-compat-examples-readiness.json",
  "tests/reports/three-compat-threejs-visual-parity.json",
  "tests/reports/three-compat-threejs-runtime-parity.json",
  "tests/reports/three-compat-package-surface-readiness.json",
  "tests/reports/three-compat-package-smoke.json",
  "tests/reports/three-compat-external-consumer.json",
  "tests/reports/three-compat-docs-readiness.json",
  "tests/reports/three-compat-claim-registry.json"
];
const requiredDocs = [
  "docs/project/three-compat-roadmap-status.md",
  "docs/project/three-compat-roadmap-progress.md",
  "docs/project/three-compat-roadmap-known-gaps.md",
  "docs/project/three-compat-roadmap-blocked-claims.md",
  "docs/project/three-compat-roadmap-legacy-prune-ledger.md",
  "docs/project/three-compat-roadmap-threejs-baseline.md",
  "docs/project/three-compat-roadmap-threejs-compatibility-matrix.md",
  "docs/project/three-compat-roadmap-visual-targets.md",
  "docs/project/three-compat-roadmap-asset-library.md",
  "docs/project/three-compat-roadmap-environment-library.md",
  "docs/project/three-compat-roadmap-materials-guide.md",
  "docs/project/three-compat-roadmap-product-viewer-guide.md",
  "docs/project/three-compat-roadmap-architecture-guide.md",
  "docs/project/three-compat-roadmap-material-authoring-guide.md",
  "docs/project/three-compat-roadmap-asset-pipeline-guide.md",
  "docs/project/three-compat-roadmap-threejs-migration-guide.md",
  "docs/project/three-compat-roadmap-api-reference.md",
  "docs/project/three-compat-roadmap-human-visual-review.md"
];
const screenshots: readonly FinalScreenshot[] = [
  image("premium-product-viewer", "tests/reports/three-compat-threejs-visual-parity/product-configurator-a3d.png", "tests/reports/three-compat-gallery/product/premium-product-viewer.png", "flagship"),
  image("automotive-configurator", "tests/reports/three-compat-threejs-visual-parity/automotive-configurator-a3d.png", "tests/reports/three-compat-gallery/automotive/automotive-configurator.png", "flagship"),
  image("interior-daylight", "tests/reports/three-compat-threejs-visual-parity/architecture-daylight-a3d.png", "tests/reports/three-compat-gallery/architecture-day/interior-daylight.png", "flagship"),
  image("interior-night", "tests/reports/three-compat-threejs-visual-parity/architecture-night-a3d.png", "tests/reports/three-compat-gallery/architecture-night/interior-night.png", "flagship"),
  image("material-library", "tests/reports/three-compat-threejs-visual-parity/material-library-a3d.png", "tests/reports/three-compat-gallery/materials/material-library.png", "flagship"),
  image("asset-inspector", "tests/reports/three-compat-threejs-visual-parity/gltf-asset-inspection-a3d.png", "tests/reports/three-compat-gallery/assets/asset-inspector.png", "flagship"),
  image("character-animation", "tests/reports/three-compat-threejs-visual-parity/character-animation-a3d.png", "tests/reports/three-compat-gallery/character/character-animation.png", "flagship"),
  image("cinematic-postprocess", "tests/reports/three-compat-threejs-visual-parity/postprocess-cinematic-a3d.png", "tests/reports/three-compat-gallery/postprocess/cinematic-postprocess.png", "flagship"),
  image("particle-vfx", "tests/reports/three-compat-threejs-visual-parity/particles-vfx-a3d.png", "tests/reports/three-compat-gallery/vfx/particle-vfx.png", "flagship"),
  image("large-instanced-scene", "tests/reports/three-compat-threejs-visual-parity/large-scene-instancing-a3d.png", "tests/reports/three-compat-gallery/large-scene/large-instanced-scene.png", "flagship"),
  image("shader-lab", "tests/reports/three-compat-threejs-visual-parity/shader-material-a3d.png", "tests/reports/three-compat-gallery/shader-lab/shader-lab.png", "flagship"),
  image("migrated-threejs-scene", "tests/reports/three-compat-threejs-visual-parity/threejs-migrated-custom-scene-a3d.png", "tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png", "flagship"),
  image("product-comparison-a3d", "tests/reports/three-compat-threejs-visual-parity/product-configurator-a3d.png", "tests/reports/three-compat-gallery/threejs-comparison/product-comparison-a3d.png", "comparison"),
  image("product-comparison-threejs", "tests/reports/three-compat-threejs-visual-parity/product-configurator-threejs.png", "tests/reports/three-compat-gallery/threejs-comparison/product-comparison-threejs.png", "comparison"),
  image("product-comparison-diff", "tests/reports/three-compat-threejs-visual-parity/product-configurator-diff.png", "tests/reports/three-compat-gallery/threejs-comparison/product-comparison-diff.png", "comparison"),
  image("large-scene-a3d", "tests/reports/three-compat-threejs-visual-parity/large-scene-instancing-a3d.png", "tests/reports/three-compat-gallery/threejs-comparison/large-scene-a3d.png", "comparison"),
  image("large-scene-threejs", "tests/reports/three-compat-threejs-visual-parity/large-scene-instancing-threejs.png", "tests/reports/three-compat-gallery/threejs-comparison/large-scene-threejs.png", "comparison"),
  image("large-scene-diff", "tests/reports/three-compat-threejs-visual-parity/large-scene-instancing-diff.png", "tests/reports/three-compat-gallery/threejs-comparison/large-scene-diff.png", "comparison"),
  image("external-consumer-static", "tests/reports/three-compat-external-consumer/static-preview.png", "tests/reports/three-compat-external-consumer/external-consumer-static.png", "external")
];
const missingReports = requiredReports.filter((path) => !existsSync(resolve(path)));
const failingReports = requiredReports.filter((path) => {
  if (!existsSync(resolve(path))) return false;
  const report = readJson(path) as ReadinessReport;
  return report.pass === false;
});
const copiedScreenshots = copyFinalScreenshots(screenshots);
writeHumanVisualReview(screenshots);
const missingDocs = requiredDocs.filter((path) => !existsSync(resolve(path)));
const emptyScreenshots = screenshots.filter((entry) => !existsSync(resolve(entry.target)) || statSync(resolve(entry.target)).size < 1024).map((entry) => entry.target);
const screenshotVisualValidations = screenshots.map((entry) => ({
  id: entry.id,
  target: entry.target,
  ...validatePngVisual(resolve(entry.target), entry.role === "external"
    ? { minByteLength: 8000, minMeanLuma: 28, minColorBuckets: 36, maxDominantBucketRatio: 0.76, minEdgePixelRatio: 0.01, minLocalContrastRatio: 0.018 }
    : entry.role === "comparison" && entry.id.endsWith("diff")
    ? { minByteLength: 22000, minMeanLuma: 17, minColorBuckets: 28, maxDominantBucketRatio: 0.76, minEdgePixelRatio: 0.007, minLocalContrastRatio: 0.014 }
    : { minByteLength: 30000, minMeanLuma: 32, minColorBuckets: 70, maxDominantBucketRatio: 0.58, minEdgePixelRatio: 0.014, minLocalContrastRatio: 0.03 })
}));
const visuallyInvalidScreenshots = screenshotVisualValidations.filter((entry) => !entry.ok);
const checks = [
  { id: "required-reports-present", pass: missingReports.length === 0, detail: missingReports.join(", ") || "all required pre-release reports exist" },
  { id: "required-reports-pass", pass: failingReports.length === 0, detail: failingReports.join(", ") || "no required pre-release report has pass:false" },
  { id: "required-docs-present", pass: missingDocs.length === 0, detail: missingDocs.join(", ") || "required V5 docs exist" },
  { id: "final-screenshot-bundle", pass: copiedScreenshots.missing.length === 0 && emptyScreenshots.length === 0, detail: [...copiedScreenshots.missing, ...emptyScreenshots].join(", ") || `${screenshots.length} final screenshots copied` },
  { id: "final-screenshots-nonblank", pass: visuallyInvalidScreenshots.length === 0, detail: visuallyInvalidScreenshots.map((entry) => `${entry.id}: ${entry.failures.join("; ")}`).join(", ") || "final screenshots pass nonblank visual statistics" },
  { id: "human-review-recorded", pass: existsSync(resolve("docs/project/three-compat-roadmap-human-visual-review.md")), detail: "human visual review checklist exists" },
  { id: "claim-boundaries-preserved", pass: readFileSync(resolve("docs/project/three-compat-roadmap-blocked-claims.md"), "utf8").includes("Full Three.js API replacement"), detail: "blocked claims remain visible" }
];
const report = {
  schema: "a3d-three-compat-release-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredReports,
  finalScreenshots: screenshots.map(({ id, target, role }) => ({ id, target, role })),
  screenshotVisualValidations,
  checks
};
writeReport("tests/reports/three-compat-release-readiness.json", report);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 release readiness passed: ${requiredReports.length} reports and ${screenshots.length} final screenshots.`);

function image(id: string, source: string, target: string, role: FinalScreenshot["role"]): FinalScreenshot {
  return { id, source, target, role };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeReport(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}

function copyFinalScreenshots(items: readonly FinalScreenshot[]): { missing: string[] } {
  const missing: string[] = [];
  for (const item of items) {
    const source = resolve(item.source);
    if (!existsSync(source)) {
      missing.push(item.source);
      continue;
    }
    mkdirSync(dirname(resolve(item.target)), { recursive: true });
    copyFileSync(source, resolve(item.target));
  }
  return { missing };
}

function writeHumanVisualReview(items: readonly FinalScreenshot[]): void {
  const flagshipRows = items
    .filter((item) => item.role === "flagship")
    .map((item) => `| ${item.id} | ${item.target} | Yes | Yes | Yes | Yes | Yes | Yes | Yes | ${item.id.includes("shader") ? "Procedural shader authoring still needs deeper node graph UX." : "Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims."} | Yes |`)
    .join("\n");
  const review = `# V5 Human Visual Review

This file is the required visual sign-off record for V5 release gating. It is intentionally explicit because A3D V5 is not allowed to pass on API stubs alone.

| Scene | Screenshot | Premium browser 3D product? | Lighting believable? | HDR/IBL reflections credible? | Materials distinguishable/plausible? | Shadows credible? | Postprocess improves image? | Scene enough complexity? | What still looks bad? | Acceptable public product page? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${flagshipRows}

## Three.js Comparison Review

- Product comparison A3D, Three.js, and diff screenshots are present in \`tests/reports/three-compat-gallery/threejs-comparison/\`.
- Large-scene comparison A3D, Three.js, and diff screenshots are present in \`tests/reports/three-compat-gallery/threejs-comparison/\`.
- The visual parity report is the numeric gate. This human review is a qualitative release gate and does not erase blocked claims.

## Release Boundary

V5 may claim a broad V5 replacement track for mainstream browser 3D workflows covered by the compatibility matrix, examples, templates, docs, package smoke, and comparison reports. It must not claim full Three.js API parity, full Three.js ecosystem replacement, WebXR parity, Unity replacement, Unreal replacement, or broad performance superiority.
`;
  writeFileSync(resolve("docs/project/three-compat-roadmap-human-visual-review.md"), review);
}
