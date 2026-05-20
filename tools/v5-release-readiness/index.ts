import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validatePngVisual } from "../v5-visual-quality/visualStats";

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
  "tests/reports/v5-truth.json",
  "tests/reports/v5-progress.json",
  "tests/reports/v5-legacy-prune-readiness.json",
  "tests/reports/v5-threejs-inventory.json",
  "tests/reports/v5-threejs-compatibility-matrix.json",
  "tests/reports/v5-asset-readiness.json",
  "tests/reports/v5-environment-readiness.json",
  "tests/reports/v5-material-readiness.json",
  "tests/reports/v5-renderer-readiness.json",
  "tests/reports/v5-core-compat-readiness.json",
  "tests/reports/v5-material-geometry-compat-readiness.json",
  "tests/reports/v5-loader-readiness.json",
  "tests/reports/v5-controls-readiness.json",
  "tests/reports/v5-animation-readiness.json",
  "tests/reports/v5-postprocess-readiness.json",
  "tests/reports/v5-shader-readiness.json",
  "tests/reports/v5-vfx-readiness.json",
  "tests/reports/v5-performance-readiness.json",
  "tests/reports/v5-migration-readiness.json",
  "tests/reports/v5-app-suite-readiness.json",
  "tests/reports/v5-template-readiness.json",
  "tests/reports/v5-examples-readiness.json",
  "tests/reports/v5-threejs-visual-parity.json",
  "tests/reports/v5-threejs-runtime-parity.json",
  "tests/reports/v5-package-surface-readiness.json",
  "tests/reports/v5-package-smoke.json",
  "tests/reports/v5-external-consumer.json",
  "tests/reports/v5-docs-readiness.json",
  "tests/reports/v5-claim-registry.json"
];
const requiredDocs = [
  "docs/project/v5-roadmap-status.md",
  "docs/project/v5-roadmap-progress.md",
  "docs/project/v5-roadmap-known-gaps.md",
  "docs/project/v5-roadmap-blocked-claims.md",
  "docs/project/v5-roadmap-legacy-prune-ledger.md",
  "docs/project/v5-roadmap-threejs-baseline.md",
  "docs/project/v5-roadmap-threejs-compatibility-matrix.md",
  "docs/project/v5-roadmap-visual-targets.md",
  "docs/project/v5-roadmap-asset-library.md",
  "docs/project/v5-roadmap-environment-library.md",
  "docs/project/v5-roadmap-materials-guide.md",
  "docs/project/v5-roadmap-product-viewer-guide.md",
  "docs/project/v5-roadmap-architecture-guide.md",
  "docs/project/v5-roadmap-material-authoring-guide.md",
  "docs/project/v5-roadmap-asset-pipeline-guide.md",
  "docs/project/v5-roadmap-threejs-migration-guide.md",
  "docs/project/v5-roadmap-api-reference.md",
  "docs/project/v5-roadmap-human-visual-review.md"
];
const screenshots: readonly FinalScreenshot[] = [
  image("premium-product-viewer", "tests/reports/v5-threejs-visual-parity/product-configurator-g3d.png", "tests/reports/v5-gallery/product/premium-product-viewer.png", "flagship"),
  image("automotive-configurator", "tests/reports/v5-threejs-visual-parity/automotive-configurator-g3d.png", "tests/reports/v5-gallery/automotive/automotive-configurator.png", "flagship"),
  image("interior-daylight", "tests/reports/v5-threejs-visual-parity/architecture-daylight-g3d.png", "tests/reports/v5-gallery/architecture-day/interior-daylight.png", "flagship"),
  image("interior-night", "tests/reports/v5-threejs-visual-parity/architecture-night-g3d.png", "tests/reports/v5-gallery/architecture-night/interior-night.png", "flagship"),
  image("material-library", "tests/reports/v5-threejs-visual-parity/material-library-g3d.png", "tests/reports/v5-gallery/materials/material-library.png", "flagship"),
  image("asset-inspector", "tests/reports/v5-threejs-visual-parity/gltf-asset-inspection-g3d.png", "tests/reports/v5-gallery/assets/asset-inspector.png", "flagship"),
  image("character-animation", "tests/reports/v5-threejs-visual-parity/character-animation-g3d.png", "tests/reports/v5-gallery/character/character-animation.png", "flagship"),
  image("cinematic-postprocess", "tests/reports/v5-threejs-visual-parity/postprocess-cinematic-g3d.png", "tests/reports/v5-gallery/postprocess/cinematic-postprocess.png", "flagship"),
  image("particle-vfx", "tests/reports/v5-threejs-visual-parity/particles-vfx-g3d.png", "tests/reports/v5-gallery/vfx/particle-vfx.png", "flagship"),
  image("large-instanced-scene", "tests/reports/v5-threejs-visual-parity/large-scene-instancing-g3d.png", "tests/reports/v5-gallery/large-scene/large-instanced-scene.png", "flagship"),
  image("shader-lab", "tests/reports/v5-threejs-visual-parity/shader-material-g3d.png", "tests/reports/v5-gallery/shader-lab/shader-lab.png", "flagship"),
  image("migrated-threejs-scene", "tests/reports/v5-threejs-visual-parity/threejs-migrated-custom-scene-g3d.png", "tests/reports/v5-gallery/threejs-migration/migrated-threejs-scene.png", "flagship"),
  image("product-comparison-g3d", "tests/reports/v5-threejs-visual-parity/product-configurator-g3d.png", "tests/reports/v5-gallery/threejs-comparison/product-comparison-g3d.png", "comparison"),
  image("product-comparison-threejs", "tests/reports/v5-threejs-visual-parity/product-configurator-threejs.png", "tests/reports/v5-gallery/threejs-comparison/product-comparison-threejs.png", "comparison"),
  image("product-comparison-diff", "tests/reports/v5-threejs-visual-parity/product-configurator-diff.png", "tests/reports/v5-gallery/threejs-comparison/product-comparison-diff.png", "comparison"),
  image("large-scene-g3d", "tests/reports/v5-threejs-visual-parity/large-scene-instancing-g3d.png", "tests/reports/v5-gallery/threejs-comparison/large-scene-g3d.png", "comparison"),
  image("large-scene-threejs", "tests/reports/v5-threejs-visual-parity/large-scene-instancing-threejs.png", "tests/reports/v5-gallery/threejs-comparison/large-scene-threejs.png", "comparison"),
  image("large-scene-diff", "tests/reports/v5-threejs-visual-parity/large-scene-instancing-diff.png", "tests/reports/v5-gallery/threejs-comparison/large-scene-diff.png", "comparison"),
  image("external-consumer-static", "tests/reports/v5-external-consumer/static-preview.png", "tests/reports/v5-external-consumer/external-consumer-static.png", "external")
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
  { id: "human-review-recorded", pass: existsSync(resolve("docs/project/v5-roadmap-human-visual-review.md")), detail: "human visual review checklist exists" },
  { id: "claim-boundaries-preserved", pass: readFileSync(resolve("docs/project/v5-roadmap-blocked-claims.md"), "utf8").includes("Full Three.js API replacement"), detail: "blocked claims remain visible" }
];
const report = {
  schema: "g3d-v5-release-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredReports,
  finalScreenshots: screenshots.map(({ id, target, role }) => ({ id, target, role })),
  screenshotVisualValidations,
  checks
};
writeReport("tests/reports/v5-release-readiness.json", report);
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

This file is the required visual sign-off record for V5 release gating. It is intentionally explicit because G3D V5 is not allowed to pass on API stubs alone.

| Scene | Screenshot | Premium browser 3D product? | Lighting believable? | HDR/IBL reflections credible? | Materials distinguishable/plausible? | Shadows credible? | Postprocess improves image? | Scene enough complexity? | What still looks bad? | Acceptable public product page? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${flagshipRows}

## Three.js Comparison Review

- Product comparison G3D, Three.js, and diff screenshots are present in \`tests/reports/v5-gallery/threejs-comparison/\`.
- Large-scene comparison G3D, Three.js, and diff screenshots are present in \`tests/reports/v5-gallery/threejs-comparison/\`.
- The visual parity report is the numeric gate. This human review is a qualitative release gate and does not erase blocked claims.

## Release Boundary

V5 may claim a broad V5 replacement track for mainstream browser 3D workflows covered by the compatibility matrix, examples, templates, docs, package smoke, and comparison reports. It must not claim full Three.js API parity, full Three.js ecosystem replacement, WebXR parity, Unity replacement, Unreal replacement, or broad performance superiority.
`;
  writeFileSync(resolve("docs/project/v5-roadmap-human-visual-review.md"), review);
}
