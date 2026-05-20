import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }
const requiredFiles = [
  "apps/asset-studio-pro/index.html",
  "apps/asset-studio-pro/src/main.ts",
  "examples/asset-gallery-v4/index.html",
  "examples/asset-gallery-v4/main.ts",
  "examples/asset-gallery-v4/AssetGalleryV4.ts",
  "fixtures/v4/gltf-corpus/manifest.json",
  "tests/browser/v4-asset-studio-pro.spec.ts",
  "tests/reports/v4-asset-studio-pro-browser.json"
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

const source = text("examples/asset-gallery-v4/AssetGalleryV4.ts");
check("asset-studio-source", includesAll(source, ["summarizeV4Corpus", "corpus-browser", "asset-diagnostics", "__G3D_V4_ASSET_STUDIO__", "same-scene Three.js parity"]), "Asset Studio must use corpus APIs, expose diagnostics, and preserve proof boundaries.");
check("app-entry-no-example-side-effect", text("examples/asset-gallery-v4/main.ts").includes("mountAssetGalleryV4(\"asset-gallery-v4\")") && text("apps/asset-studio-pro/src/main.ts").includes("AssetGalleryV4") && !text("apps/asset-studio-pro/src/main.ts").includes("asset-gallery-v4/main"), "Asset Studio Pro must import a side-effect-free shared module.");

const manifest = json("fixtures/v4/gltf-corpus/manifest.json");
const assets = arr(manifest?.assets).filter(isObj);
check("corpus-manifest", manifest?.schema === "g3d-v4-gltf-corpus/v1" && assets.length >= 25 && typeof manifest?.claimBoundary === "string" && manifest.claimBoundary.includes("not final flagship product visual proof"), "Corpus manifest must remain present and bounded.");

const browser = json("tests/reports/v4-asset-studio-pro-browser.json");
const states = isObj(browser?.states) ? browser.states : {};
const example = isObj(states.example) ? states.example : {};
const selected = isObj(states.selected) ? states.selected : {};
const app = isObj(states.app) ? states.app : {};
const screenshots = arr(browser?.screenshots);
const expectedScreenshots = [
  "tests/reports/v4-gallery/assets/asset-gallery-v4.png",
  "tests/reports/v4-gallery/assets/asset-gallery-v4-cesium-man.png",
  "tests/reports/v4-gallery/assets/asset-studio-pro.png"
];
check("browser-report", browser?.ok === true && statePasses(example, "asset-gallery-v4") && statePasses(selected, "asset-gallery-v4") && statePasses(app, "asset-studio-pro") && isObj(selected.selectedAsset) && selected.selectedAsset.id === "cesium-man", "Browser report must prove example, selection, and app diagnostics UI.");
check("browser-screenshots", expectedScreenshots.every((path) => screenshots.includes(path) && exists(path)), "Browser report must include Asset Studio screenshots.");
check("browser-proof-boundary", typeof browser?.productBoundary === "string" && browser.productBoundary.includes("actual rendered screenshots") && browser.productBoundary.includes("same-scene Three.js parity"), "Browser report must preserve selected-asset render and parity boundaries.");

const pass = checks.every((entry) => entry.pass);
const report = { schema: "g3d-v4-asset-studio-readiness/v1", generatedAt: new Date().toISOString(), pass, summary: pass ? "V4 Milestone 10 Asset Studio Pro proof is ready as a corpus browser and diagnostics product milestone. Rendered asset parity remains required." : "V4 Milestone 10 Asset Studio Pro proof is incomplete.", checkedFiles: requiredFiles, checks };
mkdirSync(dirname(resolve("tests/reports/v4-asset-studio-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-asset-studio-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function statePasses(state: Obj, id: string): boolean {
  const features = arr(state.featureCoverage);
  const checklist = arr(state.featureChecklist);
  const selectedAsset = isObj(state.selectedAsset) ? state.selectedAsset : {};
  return state.id === id &&
    state.status === "ready" &&
    state.productSurface === "asset-studio-pro" &&
    state.corpusManifest === "fixtures/v4/gltf-corpus/manifest.json" &&
    typeof state.sourceRepository === "string" &&
    state.sourceRepository.includes("KhronosGroup/glTF-Sample-Assets") &&
    state.sourceRevision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" &&
    Number(state.assetCount ?? 0) >= 25 &&
    Number(state.visualEvidenceSlots ?? 0) >= 12 &&
    Number(state.advancedMaterialAssets ?? 0) >= 5 &&
    Number(state.animationSkinMorphAssets ?? 0) >= 2 &&
    Number(state.licenseReviewRequired ?? 0) >= 1 &&
    ["pbr", "texture", "extension", "animation"].every((feature) => features.includes(feature)) &&
    state.corpusBrowserUi === true &&
    state.diagnosticsUi === true &&
    state.releaseProofComplete === false &&
    typeof selectedAsset.license === "string" &&
    typeof selectedAsset.provenance === "string" &&
    selectedAsset.renderStatus === "queued-for-milestone-15-threejs-parity" &&
    checklist.includes("corpus-browser") &&
    checklist.includes("asset-diagnostics") &&
    checklist.includes("license-provenance") &&
    typeof state.claimBoundary === "string" &&
    state.claimBoundary.includes("same-scene Three.js parity");
}
