import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredReports = [
  "tests/reports/v4-truth.json",
  "tests/reports/v4-progress.json",
  "tests/reports/v4-fixture-readiness.json",
  "tests/reports/v4-hdr-readiness.json",
  "tests/reports/v4-ibl-readiness.json",
  "tests/reports/v4-pbr-readiness.json",
  "tests/reports/v4-shadow-readiness.json",
  "tests/reports/v4-postprocess-readiness.json",
  "tests/reports/v4-performance-readiness.json",
  "tests/reports/v4-large-scene-browser.json",
  "tests/reports/v4-gltf-corpus-readiness.json",
  "tests/reports/v4-gltf-corpus-alias.json",
  "tests/reports/v4-product-readiness.json",
  "tests/reports/v4-material-studio-readiness.json",
  "tests/reports/v4-material-readiness.json",
  "tests/reports/v4-material-studio-browser.json",
  "tests/reports/v4-scene-readiness.json",
  "tests/reports/v4-asset-studio-readiness.json",
  "tests/reports/v4-character-readiness.json",
  "tests/reports/v4-interactive-readiness.json",
  "tests/reports/v4-app-suite-readiness.json",
  "tests/reports/v4-api-readiness.json",
  "tests/reports/v4-template-readiness.json",
  "tests/reports/v4-external-vite-build.json",
  "tests/reports/v4-static-preview-smoke.json",
  "tests/reports/v4-threejs-visual-parity.json",
  "tests/reports/v4-examples-readiness.json",
  "tests/reports/v4-visual-quality.json",
  "tests/reports/v4-package-smoke.json",
  "tests/reports/v4-external-consumer.json",
  "tests/reports/v4-docs-readiness.json",
  "tests/reports/v4-claim-registry.json"
] as const;

const requiredScreenshots = [
  "tests/reports/v4-gallery/product/product-configurator-v4.png",
  "tests/reports/v4-gallery/materials/material-studio-v4.png",
  "tests/reports/v4-gallery/assets/asset-gallery-v4.png",
  "tests/reports/v4-gallery/scenes/interior-scene-v4.png",
  "tests/reports/v4-gallery/interior/interior-scene-v4.png",
  "tests/reports/v4-gallery/characters/character-viewer-v4.png",
  "tests/reports/v4-gallery/character/character-viewer-v4.png",
  "tests/reports/v4-gallery/interactive/interactive-showcase-v4.png",
  "tests/reports/v4-gallery/templates/v4-product-viewer.png",
  "tests/reports/v4-gallery/templates/v4-material-studio.png",
  "tests/reports/v4-gallery/templates/v4-asset-gallery.png",
  "tests/reports/v4-gallery/templates/v4-interactive-scene.png",
  "tests/reports/v4-gallery/performance/large-scene-performance.png",
  "tests/reports/v4-gallery/threejs-comparison/product-configurator-threejs.png",
  "tests/reports/v4-gallery/debug-views/product-debug-reference.png",
  "tests/reports/v4-gallery/postprocess/postprocess-gallery-reference.png",
  "tests/reports/v4-threejs-visual-parity/product-configurator-threejs.png",
  "tests/reports/v4-threejs-visual-parity/product-configurator-diff.png",
  "tests/reports/v4-threejs-visual-parity/large-scene-performance-threejs.png",
  "tests/reports/v4-threejs-visual-parity/large-scene-performance-diff.png",
  "tests/reports/v4-external-consumer/external-consumer.png"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const read = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(read(path)) as Obj : undefined;
const ok = (report: Obj | undefined): boolean => report?.pass === true || report?.ok === true;

for (const path of requiredReports) {
  const report = json(path);
  check(`report:${path}`, Boolean(report) && ok(report), `${path} must exist and pass.`);
}

for (const path of requiredScreenshots) {
  const absolute = resolve(path);
  check(`screenshot:${path}`, existsSync(absolute) && statSync(absolute).size > 8_000, `${path} must exist and be non-placeholder.`);
}

const humanReview = existsSync(resolve("docs/project/v4-roadmap-human-visual-review.md")) ? read("docs/project/v4-roadmap-human-visual-review.md") : "";
check(
  "human-visual-review",
  humanReview.includes("No reviewed flagship scene is rejected as primitive test output") &&
    ["Product Configurator", "Material Studio", "Asset Gallery", "Interior Scene", "Character Viewer", "Interactive Showcase", "Template / External Consumer"].every((section) => humanReview.includes(section)),
  "Human visual review must cover every flagship scene and approve bounded release readiness."
);

const releaseScript = read("package.json");
check(
  "release-script",
  releaseScript.includes("\"v4:release\"") &&
    releaseScript.includes("v4:package") &&
    releaseScript.includes("tools/v4-release-readiness/index.ts") &&
    releaseScript.includes("tools/v4-roadmap-completion-audit/index.ts"),
  "package.json must expose the full v4:release command."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-release-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 release readiness evidence is present and passing."
    : "V4 release readiness evidence is incomplete.",
  requiredReports,
  requiredScreenshots,
  checks
};

mkdirSync(dirname(resolve("tests/reports/v4-release-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-release-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
