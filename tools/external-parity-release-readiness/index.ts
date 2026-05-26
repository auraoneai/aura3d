import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredReports = [
  "tests/reports/external-parity-truth.json",
  "tests/reports/external-parity-progress.json",
  "tests/reports/external-parity-fixture-readiness.json",
  "tests/reports/external-parity-hdr-readiness.json",
  "tests/reports/external-parity-ibl-readiness.json",
  "tests/reports/external-parity-pbr-readiness.json",
  "tests/reports/external-parity-shadow-readiness.json",
  "tests/reports/external-parity-postprocess-readiness.json",
  "tests/reports/external-parity-performance-readiness.json",
  "tests/reports/external-parity-large-scene-browser.json",
  "tests/reports/external-parity-gltf-corpus-readiness.json",
  "tests/reports/external-parity-gltf-corpus-alias.json",
  "tests/reports/external-parity-product-readiness.json",
  "tests/reports/external-parity-material-studio-readiness.json",
  "tests/reports/external-parity-material-readiness.json",
  "tests/reports/external-parity-material-studio-browser.json",
  "tests/reports/external-parity-scene-readiness.json",
  "tests/reports/external-parity-asset-studio-readiness.json",
  "tests/reports/external-parity-character-readiness.json",
  "tests/reports/external-parity-interactive-readiness.json",
  "tests/reports/external-parity-app-suite-readiness.json",
  "tests/reports/external-parity-api-readiness.json",
  "tests/reports/external-parity-template-readiness.json",
  "tests/reports/external-parity-external-vite-build.json",
  "tests/reports/external-parity-static-preview-smoke.json",
  "tests/reports/external-parity-threejs-visual-parity.json",
  "tests/reports/external-parity-visual-quality.json",
  "tests/reports/external-parity-package-smoke.json",
  "tests/reports/external-parity-external-consumer.json",
  "tests/reports/external-parity-docs-readiness.json",
  "tests/reports/external-parity-claim-registry.json"
] as const;

const requiredScreenshots = [
  "tests/reports/external-gallery/product/external-product-configurator.png",
  "tests/reports/external-gallery/materials/external-material-studio.png",
  "tests/reports/external-gallery/assets/external-asset-gallery.png",
  "tests/reports/external-gallery/scenes/external-interior-scene.png",
  "tests/reports/external-gallery/interior/external-interior-scene.png",
  "tests/reports/external-gallery/characters/external-character-viewer.png",
  "tests/reports/external-gallery/character/external-character-viewer.png",
  "tests/reports/external-gallery/interactive/external-interactive-showcase.png",
  "tests/reports/external-gallery/templates/external-parity-product-viewer.png",
  "tests/reports/external-gallery/templates/external-parity-material-studio.png",
  "tests/reports/external-gallery/templates/external-parity-asset-gallery.png",
  "tests/reports/external-gallery/templates/external-parity-interactive-scene.png",
  "tests/reports/external-gallery/performance/large-scene-performance.png",
  "tests/reports/external-gallery/threejs-comparison/product-configurator-threejs.png",
  "tests/reports/external-gallery/debug-views/product-debug-reference.png",
  "tests/reports/external-gallery/postprocess/postprocess-gallery-reference.png",
  "tests/reports/external-parity-threejs-visual-parity/product-configurator-threejs.png",
  "tests/reports/external-parity-threejs-visual-parity/product-configurator-diff.png",
  "tests/reports/external-parity-threejs-visual-parity/large-scene-performance-threejs.png",
  "tests/reports/external-parity-threejs-visual-parity/large-scene-performance-diff.png",
  "tests/reports/external-parity-external-consumer/external-consumer.png"
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

const humanReview = existsSync(resolve("docs/project/verification-evidence.md")) ? read("docs/project/verification-evidence.md") : "";
check(
  "human-visual-review",
  humanReview.includes("No reviewed flagship scene is rejected as primitive test output") &&
    ["Product Configurator", "Material Studio", "Asset Gallery", "Interior Scene", "Character Viewer", "Interactive Showcase", "Template / External Consumer"].every((section) => humanReview.includes(section)),
  "Human visual review must cover every flagship scene and approve bounded release readiness."
);

const releaseScript = read("package.json");
check(
  "release-script",
  releaseScript.includes("\"external-parity:release\"") &&
    releaseScript.includes("external-parity:package") &&
    releaseScript.includes("tools/external-parity-release-readiness/index.ts") &&
    releaseScript.includes("tools/external-parity-roadmap-completion-audit/index.ts"),
  "package.json must expose the full external-parity:release command."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-release-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "External parity release readiness evidence is present and passing."
    : "External parity release readiness evidence is incomplete.",
  requiredReports,
  requiredScreenshots,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-release-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-release-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
