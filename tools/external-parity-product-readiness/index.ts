import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "examples/external-product-configurator/headphones.manifest.json",
  "apps/product-studio-pro/index.html",
  "apps/product-studio-pro/src/main.ts",
  "tests/fixtures/external-product-configurator/index.html",
  "examples/external-product-configurator/main.ts",
  "examples/external-product-configurator/ExternalProductConfigurator.ts",
  "benchmarks/external-parity/aura3d/product-configurator.ts",
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

const manifest = readJson("examples/external-product-configurator/headphones.manifest.json");
check("fixture-schema", manifest?.schema === "a3d-product-manifest/1", "Headphones must use the current product-manifest schema.");
check("fixture-product-id", manifest?.id === "showcaseHeadphones" && manifest?.category === "consumer-audio", "Product fixture must identify the typed headphones and category.");
check("fixture-typed-url", manifest?.gltf === "/aura-assets/showcaseHeadphones.40b1fdf7.glb", "Product fixture must bind the exact generated catalog URL.");

const shared = readText("examples/external-product-configurator/ExternalProductConfigurator.ts");
check(
  "public-workflow-example",
  includesAll(shared, [
    "createProductConfiguratorWorkflow",
    "assets.showcaseHeadphones",
    "productAsset.hash",
    "productAsset.metadata?.provenance",
    "__A3D_EXTERNAL_PARITY_PRODUCT_CONFIGURATOR__",
    "featureChecklist",
    "root createAuraApp product parity is not claimed"
  ]),
  "Product configurator example must call the public workflow, use the exact typed catalog product, expose provenance diagnostics, and preserve proof boundaries."
);
check(
  "example-entry-no-app-side-effect",
  readText("examples/external-product-configurator/main.ts").includes("mountExternalProductConfigurator(\"external-product-configurator\")") &&
    readText("apps/product-studio-pro/src/main.ts").includes("ExternalProductConfigurator") &&
    !readText("apps/product-studio-pro/src/main.ts").includes("external-product-configurator/main"),
  "Example and app must share a side-effect-free module instead of importing the example entry."
);

const aura3dBenchmark = readText("benchmarks/external-parity/aura3d/product-configurator.ts");
const threeBenchmark = readText("benchmarks/external-parity/threejs/product-configurator.ts");
check(
  "benchmark-sources",
  includesAll(aura3dBenchmark, ["createProductConfiguratorWorkflow", "premium-boom-box-product-configurator", "material variants", "environment lighting"]) &&
    includesAll(threeBenchmark, ["threejs", "same asset", "same camera intent", "same material/environment intent"]),
  "Milestone 7 must add Aura3D and Three.js same-scene benchmark source placeholders."
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
    browser.productBoundary.includes("typed, provenance-backed headphones asset") &&
    browser.productBoundary.includes("root createAuraApp product parity is not claimed") &&
    arr(browser.requiredNextProof).includes("same-scene Three.js rendered comparison"),
  "Browser report must preserve the public-surface and Three.js comparison boundaries."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-product-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "The production-runtime product workflow and app render an exact typed, provenance-backed catalog asset with visible variant evidence."
    : "The production-runtime typed product workflow proof is incomplete.",
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
    state.productId === "showcaseHeadphones" &&
    state.assetHash === "sha256-40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833" &&
    typeof state.sourceLicense === "string" && state.sourceLicense.includes("CC-BY-4.0") &&
    typeof state.sourceAuthor === "string" && state.sourceAuthor.includes("Ankledot") &&
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
    state.typedAssetUrl === "/aura-assets/showcaseHeadphones.40b1fdf7.glb" &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("root createAuraApp product parity is not claimed");
}
