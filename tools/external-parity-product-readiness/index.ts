import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "fixtures/v4/products/premium-product/manifest.json",
  "apps/product-studio-pro/index.html",
  "apps/product-studio-pro/src/main.ts",
  "examples/external-product-configurator/index.html",
  "examples/external-product-configurator/main.ts",
  "examples/external-product-configurator/ProductConfiguratorV4.ts",
  "benchmarks/external-parity/galileo/product-configurator.ts",
  "benchmarks/external-parity/threejs/product-configurator.ts",
  "tests/browser/external-parity-product-configurator.spec.ts",
  "tests/reports/external-parity-product-configurator-browser.json"
] as const;

const checks: Check[] = [];

function check(id: string, pass: boolean, detail: string): void {
  checks.push({ id, pass, detail });
}

function readText(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function readJson(path: string): Obj | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8")) as Obj;
}

function isObj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function includesAll(text: string, phrases: readonly string[]): boolean {
  return phrases.every((phrase) => text.includes(phrase));
}

for (const file of requiredFiles) {
  check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
}

const manifest = readJson("fixtures/v4/products/premium-product/manifest.json");
const source = isObj(manifest?.source) ? manifest.source : {};
check("fixture-schema", manifest?.schema === "g3d-v4-premium-product/v1", "Premium product fixture must use the V4 schema.");
check("fixture-product-id", manifest?.id === "premium-boom-box" && manifest?.category === "consumer-audio", "Premium product fixture must identify the product and category.");
check(
  "fixture-external-source",
  source.kind === "external-gltf-reference" &&
    source.repository === "https://github.com/KhronosGroup/glTF-Sample-Assets" &&
    source.revision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    source.path === "Models/BoomBox/glTF-Binary/BoomBox.glb" &&
    typeof source.uri === "string" &&
    source.uri.includes("BoomBox.glb") &&
    typeof source.sha256 === "string" &&
    source.sha256.length === 64 &&
    source.license === "CC0-1.0" &&
    typeof source.provenance === "string",
  "Premium product fixture must pin an external Khronos glTF asset with revision, URI, SHA-256, license, and provenance."
);
check(
  "fixture-proof-boundary",
  typeof manifest?.claimBoundary === "string" &&
    manifest.claimBoundary.includes("same-scene Three.js visual parity"),
  "Premium product fixture must state that same-scene Three.js visual parity remains required."
);

const shared = readText("examples/external-product-configurator/ProductConfiguratorV4.ts");
check(
  "public-workflow-example",
  includesAll(shared, [
    "createProductConfiguratorWorkflow",
    "premium-boom-box",
    "KhronosGroup/glTF-Sample-Assets",
    "__G3D_V4_PRODUCT_CONFIGURATOR__",
    "featureChecklist",
    "V4 release still requires"
  ]),
  "Product configurator example must call the public workflow, use the pinned external product, expose diagnostics, and preserve proof boundaries."
);
check(
  "example-entry-no-app-side-effect",
  readText("examples/external-product-configurator/main.ts").includes("mountProductConfiguratorV4(\"external-product-configurator\")") &&
    readText("apps/product-studio-pro/src/main.ts").includes("ProductConfiguratorV4") &&
    !readText("apps/product-studio-pro/src/main.ts").includes("external-product-configurator/main"),
  "Example and app must share a side-effect-free module instead of importing the example entry."
);

const galileoBenchmark = readText("benchmarks/external-parity/galileo/product-configurator.ts");
const threeBenchmark = readText("benchmarks/external-parity/threejs/product-configurator.ts");
check(
  "benchmark-sources",
  includesAll(galileoBenchmark, ["createProductConfiguratorWorkflow", "premium-boom-box-product-configurator", "material variants", "environment lighting"]) &&
    includesAll(threeBenchmark, ["threejs", "same asset", "same camera intent", "same material/environment intent"]),
  "Milestone 7 must add Galileo and Three.js same-scene benchmark source placeholders."
);

const browser = readJson("tests/reports/external-parity-product-configurator-browser.json");
const states = isObj(browser?.states) ? browser.states : {};
const example = isObj(states.example) ? states.example : {};
const variant = isObj(states.variant) ? states.variant : {};
const app = isObj(states.app) ? states.app : {};
const screenshots = arr(browser?.screenshots);
const expectedScreenshots = [
  "tests/reports/external-gallery/product/external-product-configurator.png",
  "tests/reports/external-gallery/product/external-product-configurator-variant.png",
  "tests/reports/external-gallery/product/product-studio-pro.png"
];
check(
  "browser-report",
  browser?.ok === true &&
    statePasses(example, "external-product-configurator") &&
    statePasses(variant, "external-product-configurator") &&
    statePasses(app, "product-studio-pro") &&
    variant.materialMode === "contrast" &&
    variant.lighting === "hero-contrast",
  "Browser report must prove the example, variant controls, and app all render the public product workflow."
);
check(
  "browser-screenshots",
  expectedScreenshots.every((path) => screenshots.includes(path) && existsSync(resolve(path))),
  "Browser report must include all product configurator screenshots."
);
check(
  "browser-proof-boundary",
  typeof browser?.productBoundary === "string" &&
    browser.productBoundary.includes("installable SDK/templates") &&
    browser.productBoundary.includes("same-scene Three.js parity") &&
    arr(browser.requiredNextProof).includes("same-scene Three.js rendered comparison"),
  "Browser report must preserve release and Three.js parity boundaries."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-external-parity-product-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 7 flagship product configurator proof is ready as a real product workflow/app milestone. Full release still requires installable SDK/templates and same-scene Three.js parity."
    : "V4 Milestone 7 flagship product configurator proof is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

const reportPath = resolve("tests/reports/external-parity-product-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function statePasses(state: Obj, id: string): boolean {
  const checklist = arr(state.featureChecklist);
  return state.id === id &&
    state.status === "ready" &&
    state.productId === "premium-boom-box" &&
    state.sourceLicense === "CC0-1.0" &&
    state.publicWorkflow === true &&
    state.workflowKind === "product-configurator" &&
    Number(state.meshCount ?? 0) > 0 &&
    Number(state.materialCount ?? 0) > 0 &&
    Number(state.drawCalls ?? 0) > 0 &&
    checklist.includes("product-asset") &&
    checklist.includes("material-modes") &&
    checklist.includes("lighting-presets") &&
    checklist.includes("camera-presets") &&
    checklist.includes("export-ready") &&
    typeof state.externalSource === "string" &&
    state.externalSource.includes("KhronosGroup/glTF-Sample-Assets") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("V4 release still requires");
}
