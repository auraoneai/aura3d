import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "packages/engine/package.json",
  "packages/engine/src/index.ts",
  "packages/create-aura3d/package.json",
  "packages/create-aura3d/src/index.ts",
  "packages/create-aura3d/src/cli.ts",
  "packages/create-aura3d/templates/product-viewer/README.md",
  "packages/create-aura3d/templates/material-studio/README.md",
  "packages/create-aura3d/templates/asset-gallery/README.md",
  "packages/create-aura3d/templates/interactive-scene/README.md",
  "templates/external-parity-product-viewer/package.json",
  "templates/external-parity-product-viewer/index.html",
  "templates/external-parity-product-viewer/src/main.ts",
  "templates/external-parity-product-viewer/README.md",
  "templates/external-parity-material-studio/package.json",
  "templates/external-parity-material-studio/index.html",
  "templates/external-parity-material-studio/src/main.ts",
  "templates/external-parity-material-studio/README.md",
  "templates/external-parity-asset-gallery/package.json",
  "templates/external-parity-asset-gallery/index.html",
  "templates/external-parity-asset-gallery/src/main.ts",
  "templates/external-parity-asset-gallery/README.md",
  "templates/external-parity-interactive-scene/package.json",
  "templates/external-parity-interactive-scene/index.html",
  "templates/external-parity-interactive-scene/src/main.ts",
  "templates/external-parity-interactive-scene/README.md",
  "docs/templates/create-aura3d-templates.md",
  "tests/unit/engine/external-parity-public-api-stability.test.ts",
  "tests/integration/external-parity-create-aura3d.test.ts",
  "tests/browser/external-parity-template-product-viewer.spec.ts",
  "tests/reports/external-parity-create-aura3d.json",
  "tests/reports/external-parity-create-aura3d-templates.json",
  "tests/reports/external-parity-template-product-viewer-browser.json",
  "tests/reports/external-parity-external-vite-build.json",
  "tests/reports/external-parity-static-preview-smoke.json",
  "tests/reports/external-gallery/templates/external-parity-product-viewer.png",
  "tests/reports/external-gallery/templates/external-parity-material-studio.png",
  "tests/reports/external-gallery/templates/external-parity-asset-gallery.png",
  "tests/reports/external-gallery/templates/external-parity-interactive-scene.png"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const path = (entry: string) => resolve(entry);
const exists = (entry: string) => existsSync(path(entry));
const text = (entry: string) => readFileSync(path(entry), "utf8");
const json = (entry: string): Obj | null => exists(entry) ? JSON.parse(text(entry)) as Obj : null;
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

for (const file of requiredFiles) {
  check(`file:${file}`, exists(file), `${file} must exist.`);
}

const engineSource = text("packages/engine/src/index.ts");
check(
  "root-product-api",
  [
    "createA3DApp",
    "workflows",
    "loadAsset",
    "createEnvironment",
    "createMaterialVariantController",
    "captureScreenshot",
    "createDiagnosticsPanel",
    "createAssetDiagnostics",
    "createRenderDiagnostics",
    "createCompatibilityReport"
  ].every((marker) => engineSource.includes(marker)),
  "packages/engine must expose the root developer product API required by V4."
);

const rootPackage = json("package.json");
const rootExports = obj(rootPackage?.exports);
check(
  "package-exports",
  rootExports["."] === "./dist/engine/index.js" &&
    rootExports["./engine"] === "./dist/engine/index.js" &&
    rootExports["./apps"] === "./dist/apps/index.js" &&
    rootExports["./create-aura3d"] === "./dist/create-aura3d/index.js",
  "Root package must export installable product, apps, and create-aura3d paths."
);
check(
  "package-files",
  ["dist/apps", "dist/engine", "dist/create-aura3d"].every((file) => arr(rootPackage?.files).includes(file)),
  "Root package files must include apps, engine, and create-aura3d dist directories."
);

check(
  "template-no-workspace-protocol",
  ["external-parity-product-viewer", "external-parity-material-studio", "external-parity-asset-gallery", "external-parity-interactive-scene"].every((template) => !JSON.stringify(json(`templates/${template}/package.json`)).includes("workspace:")),
  "Template package.json files must not use workspace aliases."
);
check(
  "template-public-imports",
  ["external-parity-product-viewer", "external-parity-material-studio", "external-parity-asset-gallery", "external-parity-interactive-scene"].every((template) => {
    const source = text(`templates/${template}/src/main.ts`);
    return source.includes("from \"@aura3d/engine\"") && !source.includes("@aura3d/engine/apps") && !source.includes("/packages/");
  }),
  "Template sources must consume the public root @aura3d/engine API."
);
check(
  "template-real-api-usage",
  [
    ["templates/external-parity-product-viewer/src/main.ts", "workflows.sceneShowcase"],
    ["templates/external-parity-material-studio/src/main.ts", "workflows.materialStudio"],
    ["templates/external-parity-asset-gallery/src/main.ts", "workflows.assetViewer"],
    ["templates/external-parity-interactive-scene/src/main.ts", "workflows.interactiveScene"]
  ].every(([file, workflow]) => ["createA3DApp", workflow, "createEnvironment", "createDiagnosticsPanel"].every((marker) => text(file!).includes(marker!))),
  "Templates must exercise runtime, workflow, environment, and diagnostics APIs."
);

const browser = json("tests/reports/external-parity-template-product-viewer-browser.json");
const browserTemplates = arr(browser?.templates).map((entry) => obj(entry));
check(
  "browser-template-proof",
  browser?.ok === true &&
    browserTemplates.length === 4 &&
    browserTemplates.every((entry) => {
      const state = obj(entry.state);
      const screenshotPath = String(entry.screenshotPath ?? "");
      return state.quality === "production" &&
        Number(state.drawCalls ?? 0) > 0 &&
        exists(screenshotPath) &&
        statSync(path(screenshotPath)).size > 10_000;
    }),
  "Template browser proof must render non-empty flagship screenshots for every V4 template."
);

const externalBuild = json("tests/reports/external-parity-external-vite-build.json");
check(
  "external-vite-build",
  externalBuild?.ok === true &&
    typeof externalBuild.tarballPath === "string" &&
    arr(externalBuild.builds).length === 4 &&
    arr(externalBuild.builds).every((build) => {
      const entry = obj(build);
      return entry.ok === true && typeof entry.outputDir === "string" && exists(String(entry.outputDir)) && arr(entry.outputFiles).some((file) => String(file).endsWith(".js"));
    }),
  "External Vite proof must build every V4 template from a packed @aura3d/engine package."
);

const staticSmoke = json("tests/reports/external-parity-static-preview-smoke.json");
check(
  "static-preview-proof",
  staticSmoke?.ok === true &&
    arr(staticSmoke.previews).length === 4 &&
    arr(staticSmoke.previews).every((preview) => {
      const entry = obj(preview);
      return entry.ok === true && typeof entry.previewDir === "string" && exists(String(entry.previewDir)) && arr(entry.files).includes("index.html");
    }),
  "Static preview smoke must verify every built V4 template."
);

check(
  "docs",
  ["npm create aura3d@latest", "@aura3d/engine", "full Three.js"].every((marker) => text("docs/templates/create-aura3d-templates.md").includes(marker)),
  "Template docs must explain install path, public API, and remaining boundary."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-template-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 14 installable SDK/template proof is ready. Three.js visual parity and release readiness remain open."
    : "V4 Milestone 14 installable SDK/template proof is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(path("tests/reports/external-parity-template-readiness.json")), { recursive: true });
writeFileSync(path("tests/reports/external-parity-template-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
