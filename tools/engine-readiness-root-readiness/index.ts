import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const reportPath = "tests/reports/engine-readiness-root-readiness.json";
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { readonly scripts?: Record<string, string> };
const requiredFiles = [
  "packages/rendering/src/RenderPipeline.ts",
  "packages/rendering/src/CanonicalSceneFixtures.ts",
  "packages/rendering/src/LightingDefaults.ts",
  "fixtures/engine-readiness/canonical-product-scene.json",
  "packages/assets/src/loadRenderableAsset.ts",
  "packages/assets/src/createRenderableScene.ts",
  "packages/assets/src/AssetRenderDefaults.ts",
  "tests/browser/rendering-canonical-scene.spec.ts",
  "tools/engine-readiness-visual-quality/index.ts",
  "tools/engine-readiness-root-readiness/index.ts",
  "tests/reports/engine-readiness-canonical-scene/canonical.png",
  "tests/reports/engine-readiness-canonical-scene/material-variant.png",
  "tests/reports/engine-readiness-canonical-scene/shadow-toggle.png",
  "tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png",
  "tests/reports/engine-readiness-canonical-scene/manifest.json",
  "tests/reports/engine-readiness-visual-quality.json"
];

const requiredScripts = [
  "engine-readiness:typecheck",
  "engine-readiness:unit-rendering",
  "engine-readiness:truth",
  "engine-readiness:canonical-scene",
  "engine-readiness:visual-quality",
  "engine-readiness:assets",
  "engine-readiness:root",
  "engine-readiness:reports",
  "engine-readiness:product-viewer",
  "engine-readiness:examples",
  "engine-readiness:package-smoke"
];

const checks = [
  ...requiredFiles.map((path) => ({
    id: `file:${path}`,
    ok: existsSync(path),
    evidence: path
  })),
  ...requiredScripts.map((script) => ({
    id: `script:${script}`,
    ok: Boolean(packageJson.scripts?.[script]),
    evidence: `package.json#scripts.${script}`
  })),
  {
    id: "public-examples-disabled",
    ok: readFileIfExists("examples/index.html").includes("Engine readiness examples"),
    evidence: "examples/index.html"
  },
  {
    id: "parity-claims-blocked",
    ok: readFileIfExists("docs/project/v4-engine-readiness-status.md").includes("broad Three.js replacement") &&
      readFileIfExists("docs/project/v4-engine-readiness-status.md").includes("Unity replacement"),
    evidence: "docs/project/v4-engine-readiness-status.md"
  },
  {
    id: "visual-quality-pass-report",
    ok: readJsonOk("tests/reports/engine-readiness-visual-quality.json"),
    evidence: "tests/reports/engine-readiness-visual-quality.json"
  }
];

const report = {
  schemaVersion: "a3d-engine-readiness-root-readiness-v1",
  generatedAt: new Date().toISOString(),
  ok: checks.every((check) => check.ok),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

function readFileIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readJsonOk(path: string): boolean {
  if (!existsSync(path)) return false;
  const report = JSON.parse(readFileSync(path, "utf8")) as { readonly ok?: boolean };
  return report.ok === true;
}
