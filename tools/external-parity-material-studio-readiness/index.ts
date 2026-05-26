import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "fixtures/external-parity/materials/material-library.json",
  "fixtures/external-parity/materials/textures/brushed-metal-lines.json",
  "fixtures/external-parity/materials/textures/clearcoat-orange-peel.json",
  "fixtures/external-parity/materials/textures/micro-rubber-grain.json",
  "fixtures/external-parity/materials/textures/woven-fabric.json",
  "fixtures/external-parity/materials/textures/emissive-grid.json",
  "fixtures/external-parity/materials/textures/ceramic-stone.json",
  "apps/material-studio-pro/index.html",
  "apps/material-studio-pro/src/main.ts",
  "examples/external-material-studio/index.html",
  "examples/external-material-studio/main.ts",
  "examples/external-material-studio/ExternalMaterialStudio.ts",
  "benchmarks/external-parity/aura3d/material-studio.ts",
  "benchmarks/external-parity/threejs/material-studio.ts",
  "tests/browser/external-parity-material-studio-pro.spec.ts",
  "tests/reports/external-parity-material-studio-pro-browser.json"
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

const library = readJson("fixtures/external-parity/materials/material-library.json");
const materials = arr(library?.materials);
const textureSets = arr(library?.textureSets);
const materialIds = materials.map((entry) => isObj(entry) ? entry.id : undefined);
check("library-schema", library?.schema === "a3d-external-parity-material-library", "Material library must use the External parity schema.");
check("library-material-count", materials.length === 12, "Material library must include exactly 12 material targets.");
check(
  "library-required-targets",
  ["chrome", "brushed-metal", "gold", "painted-metal", "matte-plastic", "glossy-plastic", "rubber", "glass-transmission", "clearcoat-car-paint", "fabric-sheen", "emissive", "textured-ceramic-stone"].every((id) => materialIds.includes(id)),
  "Material library must include every External parity material target."
);
check(
  "library-texture-provenance",
  textureSets.length >= 6 &&
    textureSets.every((path) => typeof path === "string" && existsSync(resolve(path))),
  "Material library must point to texture provenance descriptors."
);
check(
  "library-claim-boundary",
  typeof library?.claimBoundary === "string" &&
    library.claimBoundary.includes("licensed production material textures") &&
    library.claimBoundary.includes("same-scene Three.js visual parity"),
  "Material library must preserve final proof boundaries."
);

for (const texturePath of textureSets) {
  if (typeof texturePath !== "string") continue;
  const texture = readJson(texturePath);
  check(
    `texture:${texturePath}`,
    texture?.schema === "a3d-external-parity-procedural-texture" &&
      texture.license === "CC0-1.0" &&
      texture.notFinalTextureProof === true &&
      typeof texture.provenance === "string",
    `${texturePath} must record procedural provenance and final-proof limitation.`
  );
}

const shared = readText("examples/external-material-studio/ExternalMaterialStudio.ts");
check(
  "material-studio-product-surface",
  includesAll(shared, [
    "EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX",
    "analyzeExternalParityMaterialMatrix",
    "createLightingDefault",
    "TexturedPBRMaterial",
    "__A3D_EXTERNAL_PARITY_MATERIAL_STUDIO__",
    "12-material-matrix",
    "same-scene Three.js visual parity"
  ]),
  "Material Studio External parity must render the External parity matrix with public rendering APIs and expose browser diagnostics."
);
check(
  "app-entry-no-example-side-effect",
  readText("examples/external-material-studio/main.ts").includes("mountExternalMaterialStudio(\"external-material-studio\")") &&
    readText("apps/material-studio-pro/src/main.ts").includes("ExternalMaterialStudio") &&
    !readText("apps/material-studio-pro/src/main.ts").includes("external-material-studio/main"),
  "Material Studio Pro must import a side-effect-free shared module."
);

const aura3dBenchmark = readText("benchmarks/external-parity/aura3d/material-studio.ts");
const threeBenchmark = readText("benchmarks/external-parity/threejs/material-studio.ts");
check(
  "benchmark-sources",
  includesAll(aura3dBenchmark, ["EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX", "12 material balls", "HDR/IBL-sensitive lighting"]) &&
    includesAll(threeBenchmark, ["threejs", "same 12 material targets", "same HDR/IBL intent", "visual diff"]),
  "Milestone 8 must add Aura3D and Three.js material benchmark source descriptors."
);

const browser = readJson("tests/reports/external-parity-material-studio-pro-browser.json");
const states = isObj(browser?.states) ? browser.states : {};
const example = isObj(states.example) ? states.example : {};
const outdoor = isObj(states.outdoor) ? states.outdoor : {};
const app = isObj(states.app) ? states.app : {};
const screenshots = arr(browser?.screenshots);
const expectedScreenshots = [
  "tests/reports/external-gallery/materials/external-material-studio.png",
  "tests/reports/external-gallery/materials/external-material-studio-outdoor.png",
  "tests/reports/external-gallery/materials/material-studio-pro.png"
];
check(
  "browser-report",
  browser?.ok === true &&
    statePasses(example, "external-material-studio") &&
    statePasses(outdoor, "external-material-studio") &&
    statePasses(app, "material-studio-pro") &&
    outdoor.environmentPreset === "outdoorDay",
  "Browser report must prove the example, environment switch, and app all render the material matrix."
);
check(
  "browser-screenshots",
  expectedScreenshots.every((path) => screenshots.includes(path) && existsSync(resolve(path))),
  "Browser report must include all Material Studio screenshots."
);
check(
  "browser-proof-boundary",
  typeof browser?.productBoundary === "string" &&
    browser.productBoundary.includes("licensed production textures") &&
    browser.productBoundary.includes("same-scene Three.js visual parity") &&
    arr(browser.requiredNextProof).includes("same material matrix rendered in Three.js"),
  "Browser report must preserve texture and Three.js parity boundaries."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-material-studio-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "External parity Milestone 8 Material Studio Pro proof is ready as a real product app/example milestone. Full release still requires licensed production textures and same-scene Three.js parity."
    : "External parity Milestone 8 Material Studio Pro proof is incomplete.",
  checkedFiles: requiredFiles,
  checks
};

const reportPath = resolve("tests/reports/external-parity-material-studio-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function statePasses(state: Obj, id: string): boolean {
  const materialIds = arr(state.materialIds);
  const checklist = arr(state.featureChecklist);
  const bounded = arr(state.boundedDiagnostics);
  const reflectance = new Set(arr(state.reflectanceClasses));
  return state.id === id &&
    state.status === "ready" &&
    state.renderer === "webgl2" &&
    state.productSurface === "material-studio-pro" &&
    state.materialLibrary === "fixtures/external-parity/materials/material-library.json" &&
    state.textureDirectory === "fixtures/external-parity/materials/textures" &&
    state.materialCount === 12 &&
    materialIds.includes("chrome") &&
    materialIds.includes("glass-transmission") &&
    materialIds.includes("clearcoat-car-paint") &&
    materialIds.includes("fabric-sheen") &&
    materialIds.includes("textured-ceramic-stone") &&
    reflectance.has("mirror-metal") &&
    reflectance.has("rough-metal") &&
    reflectance.has("dielectric") &&
    reflectance.has("transparent") &&
    reflectance.has("emissive") &&
    bounded.includes("clearcoat") &&
    bounded.includes("transmission") &&
    bounded.includes("sheen") &&
    state.hdrIbl === true &&
    state.colorManagement === "linear-input-srgb-output" &&
    Number(state.drawCalls ?? 0) >= 12 &&
    Number(state.textureCount ?? 0) >= 6 &&
    Number(state.pixelBucketCount ?? 0) >= 8 &&
    checklist.includes("12-material-matrix") &&
    checklist.includes("hdr-ibl") &&
    checklist.includes("texture-backed-materials") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("same-scene Three.js visual parity");
}
