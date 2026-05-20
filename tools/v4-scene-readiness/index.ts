import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "fixtures/v4/scenes/interior-gallery/manifest.json",
  "apps/scene-studio-pro/index.html",
  "apps/scene-studio-pro/src/main.ts",
  "examples/interior-scene-v4/index.html",
  "examples/interior-scene-v4/main.ts",
  "examples/interior-scene-v4/InteriorSceneV4.ts",
  "benchmarks/v4/galileo/interior-scene.ts",
  "benchmarks/v4/threejs/interior-scene.ts",
  "tests/browser/v4-interior-scene.spec.ts",
  "tests/reports/v4-interior-scene-browser.json"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const exists = (path: string) => existsSync(resolve(path));
const text = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | null => exists(path) ? JSON.parse(text(path)) as Obj : null;
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const includesAll = (source: string, phrases: readonly string[]) => phrases.every((phrase) => source.includes(phrase));

for (const file of requiredFiles) check(`file:${file}`, exists(file), `${file} must exist.`);

const manifest = json("fixtures/v4/scenes/interior-gallery/manifest.json");
const targets = isObj(manifest?.targets) ? manifest.targets : {};
check("fixture-schema", manifest?.schema === "g3d-v4-interior-gallery/v1", "Interior fixture must use the V4 schema.");
check("fixture-targets", Number(targets.minimumRenderItems ?? 0) >= 28 && Number(targets.minimumMaterialCategories ?? 0) >= 5, "Interior fixture must define complexity targets.");
check("fixture-proof-boundary", typeof manifest?.claimBoundary === "string" && manifest.claimBoundary.includes("same-scene Three.js visual parity"), "Interior fixture must preserve Three.js parity boundary.");

const sceneSource = text("examples/interior-scene-v4/InteriorSceneV4.ts");
check(
  "scene-product-surface",
  includesAll(sceneSource, [
    "createArchitecturalMaterial",
    "createArchitecturalLightingFixture",
    "multi-object-interior",
    "contact-shadow-receiver-geometry",
    "__G3D_V4_INTERIOR_SCENE__",
    "same-scene Three.js visual parity"
  ]),
  "Interior scene must render architectural materials, lighting fixture metadata, contact-shadow receivers, and browser state."
);
check(
  "app-entry-no-example-side-effect",
  text("examples/interior-scene-v4/main.ts").includes("mountInteriorSceneV4(\"interior-scene-v4\")") &&
    text("apps/scene-studio-pro/src/main.ts").includes("InteriorSceneV4") &&
    !text("apps/scene-studio-pro/src/main.ts").includes("interior-scene-v4/main"),
  "Scene Studio Pro must import a side-effect-free shared module."
);

check(
  "benchmark-sources",
  includesAll(text("benchmarks/v4/galileo/interior-scene.ts"), ["createArchitecturalMaterial", "multi-object interior", "lighting presets"]) &&
    includesAll(text("benchmarks/v4/threejs/interior-scene.ts"), ["threejs", "same room layout", "visual diff"]),
  "Milestone 9 must add Galileo and Three.js interior benchmark descriptors."
);

const browser = json("tests/reports/v4-interior-scene-browser.json");
const states = isObj(browser?.states) ? browser.states : {};
const example = isObj(states.example) ? states.example : {};
const night = isObj(states.night) ? states.night : {};
const app = isObj(states.app) ? states.app : {};
const screenshots = arr(browser?.screenshots);
const expectedScreenshots = [
  "tests/reports/v4-gallery/scenes/interior-scene-v4.png",
  "tests/reports/v4-gallery/scenes/interior-scene-v4-night.png",
  "tests/reports/v4-gallery/scenes/scene-studio-pro.png"
];
check("browser-report", browser?.ok === true && statePasses(example, "interior-scene-v4") && statePasses(night, "interior-scene-v4") && statePasses(app, "scene-studio-pro") && night.lightingPreset === "night", "Browser report must prove the example, lighting switch, and app render the interior scene.");
check("browser-screenshots", expectedScreenshots.every((path) => screenshots.includes(path) && exists(path)), "Browser report must include all interior scene screenshots.");
check("browser-proof-boundary", typeof browser?.productBoundary === "string" && browser.productBoundary.includes("same-scene Three.js visual parity") && arr(browser.requiredNextProof).includes("same interior scene rendered in Three.js"), "Browser report must preserve Three.js parity boundary.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-scene-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass ? "V4 Milestone 9 interior scene proof is ready as a real product app/example milestone. Same-scene Three.js parity remains required." : "V4 Milestone 9 interior scene proof is incomplete.",
  checkedFiles: requiredFiles,
  checks
};
mkdirSync(dirname(resolve("tests/reports/v4-scene-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-scene-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function statePasses(state: Obj, id: string): boolean {
  const categories = arr(state.materialCategories);
  const checklist = arr(state.featureChecklist);
  return state.id === id &&
    state.status === "ready" &&
    state.renderer === "webgl2" &&
    state.productSurface === "scene-studio-pro" &&
    state.sceneFixture === "fixtures/v4/scenes/interior-gallery/manifest.json" &&
    state.sceneClass === "interior-gallery" &&
    Number(state.renderItemCount ?? 0) >= 28 &&
    Number(state.architecturalMaterialCount ?? 0) >= 30 &&
    ["wood", "stone", "metal", "fabric", "glass", "ceramic"].every((category) => categories.includes(category)) &&
    Number(state.texturedMaterialCount ?? 0) >= 10 &&
    Number(state.activeInteriorLightCount ?? 0) >= 8 &&
    state.shadowStrategy === "contact-shadow-receiver-geometry" &&
    Number(state.shadowReceiverCount ?? 0) >= 3 &&
    Number(state.spatialDepthMeters ?? 0) >= 6 &&
    Number(state.drawCalls ?? 0) >= 28 &&
    Number(state.pixelBucketCount ?? 0) >= 16 &&
    state.colorManagement === "linear-input-srgb-output" &&
    checklist.includes("multi-object-interior") &&
    checklist.includes("architectural-materials") &&
    checklist.includes("lighting-presets") &&
    checklist.includes("tone-mapping") &&
    checklist.includes("contact-shadow-receivers") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("same-scene Three.js visual parity");
}
