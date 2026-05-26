import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "packages/engine/src/A3DApp.ts",
  "packages/engine/src/A3DQualityPresets.ts",
  "packages/engine/src/index.ts",
  "packages/workflows/src/workflow-foundation/index.ts",
  "packages/apps/package.json",
  "packages/apps/src/index.ts",
  "docs/api/app-api.md",
  "tests/unit/engine/external-parity-app-api.test.ts",
  "tests/browser/fixtures/external-parity-public-api-app/index.html",
  "tests/browser/fixtures/external-parity-public-api-app/main.ts",
  "tests/browser/external-parity-public-api-app.spec.ts",
  "tests/reports/external-parity-public-api-app-browser.json"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const exists = (path: string) => existsSync(resolve(path));
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | null => exists(path) ? JSON.parse(text(path)) as Obj : null;
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const includesAll = (source: string, phrases: readonly string[]) => phrases.every((phrase) => source.includes(phrase));

for (const file of requiredFiles) check(`file:${file}`, exists(file), `${file} must exist.`);

const apiSource = text("packages/apps/src/index.ts");
const engineSource = text("packages/engine/src/index.ts");
const appEntrypoint = text("packages/engine/src/A3DApp.ts");
const qualityEntrypoint = text("packages/engine/src/A3DQualityPresets.ts");
const workflowEntrypoint = text("packages/workflows/src/workflow-foundation/index.ts");
check(
  "api-surface",
  includesAll(apiSource, [
    "createA3DApp",
    "A3DAppQualityPreset",
    "A3D_APP_WORKFLOW_PRESETS",
    "resolveA3DAppQualityPreset",
    "renderWorkflow",
    "diagnostics"
  ]),
  "App API must expose createA3DApp, quality presets, workflow presets, renderWorkflow, and diagnostics."
);
check(
  "engine-entrypoints",
  includesAll(engineSource, ["createA3DApp", "workflows", "captureScreenshot", "createDiagnosticsPanel"]) &&
    includesAll(appEntrypoint, ["createA3DApp", "A3DApp", "A3DAppOptions"]) &&
    includesAll(qualityEntrypoint, ["A3D_QUALITY_PRESETS", "A3D_QUALITY_PRESET_SETTINGS", "resolveA3DAppQualityPreset"]) &&
    includesAll(workflowEntrypoint, ["productConfigurator", "materialStudio", "assetViewer", "interactiveScene"]),
  "Engine and workflow V4 entrypoints must exist by filename and expose the public product API."
);
check(
  "workflow-preset-coverage",
  ["asset-viewer", "product-configurator", "material-studio", "scene-showcase", "interactive-scene"].every((preset) => apiSource.includes(preset)),
  "App API must cover every public workflow preset."
);
check(
  "quality-preset-coverage",
  ["draft", "balanced", "production", "rgba16f", "rgba8"].every((preset) => apiSource.includes(preset)),
  "App API must cover draft, balanced, and production quality presets."
);
check(
  "root-package-export",
  text("package.json").includes("\"./apps\": \"./dist/apps/index.js\"") &&
    text("package.json").includes("\"dist/apps\"") &&
    text("package.json").includes("\"@aura3d/apps\": \"workspace:*\""),
  "Root package must include apps dist files, subpath export, and workspace dependency."
);
check(
  "tsconfig-and-browser-server",
  text("tsconfig.base.json").includes("\"@aura3d/apps\"") &&
    text("tests/browser/example-dev-server.ts").includes("[\"@aura3d/apps\", \"/packages/apps/src/index.ts\"]"),
  "TypeScript and browser test server must resolve @aura3d/apps."
);
check(
  "public-docs",
  includesAll(text("docs/api/app-api.md"), ["createA3DApp", "quality presets", "workflow presets", "diagnostics", "full Three.js API parity"]),
  "Public docs must document the API and proof boundary."
);

const browser = json("tests/reports/external-parity-public-api-app-browser.json");
const state = isObj(browser?.state) ? browser.state : {};
const quality = isObj(state.quality) ? state.quality : {};
check(
  "browser-proof",
  browser?.ok === true &&
    state.workflowKind === "scene-showcase" &&
    state.appState === "ready" &&
    quality.preset === "balanced" &&
    state.workflowRuns === 1 &&
    state.lastWorkflow === "scene-showcase" &&
    Number(state.drawCalls ?? 0) > 0,
  "Browser proof must render a workflow through createA3DApp and report diagnostics."
);
check(
  "browser-boundary",
  typeof browser?.productBoundary === "string" &&
    browser.productBoundary.includes("Installable templates") &&
    browser.productBoundary.includes("external packed-package proof") &&
    browser.productBoundary.includes("Three.js parity"),
  "Browser report must preserve template, external package, and Three.js parity boundaries."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-api-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 13 public V4 app API is ready. Installable templates, external package proof, and Three.js parity remain required."
    : "V4 Milestone 13 public V4 app API is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-api-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-api-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
