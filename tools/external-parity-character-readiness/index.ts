import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }
const requiredFiles = [
  "fixtures/v4/characters/animated-character/manifest.json",
  "apps/animation-studio-pro/index.html",
  "apps/animation-studio-pro/src/main.ts",
  "examples/external-character-viewer/index.html",
  "examples/external-character-viewer/main.ts",
  "examples/external-character-viewer/CharacterViewerV4.ts",
  "tests/browser/external-parity-character-viewer.spec.ts",
  "tests/reports/external-parity-character-viewer-browser.json"
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
const fixture = json("fixtures/v4/characters/animated-character/manifest.json");
const source = isObj(fixture?.source) ? fixture.source : {};
check("fixture-schema", fixture?.schema === "g3d-v4-character/v1" && fixture.id === "animated-character-cesium-man", "Character fixture must use V4 schema.");
check("fixture-source", source.corpusAssetId === "cesium-man" && source.revision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" && source.licenseReviewRequired === true, "Character fixture must pin Cesium Man source and license review.");
check("fixture-boundary", typeof fixture?.claimBoundary === "string" && fixture.claimBoundary.includes("Three.js"), "Character fixture must preserve Three.js parity boundary.");
check("viewer-source", includesAll(text("examples/external-character-viewer/CharacterViewerV4.ts"), ["timeline-scrub", "play-pause", "__G3D_V4_CHARACTER_VIEWER__", "real skinned glTF rendered animation parity"]), "Character viewer must expose timeline/play state and proof boundary.");
check("app-entry-no-example-side-effect", text("examples/external-character-viewer/main.ts").includes("mountCharacterViewerV4(\"external-character-viewer\")") && text("apps/animation-studio-pro/src/main.ts").includes("CharacterViewerV4") && !text("apps/animation-studio-pro/src/main.ts").includes("external-character-viewer/main"), "Animation Studio Pro must import side-effect-free shared module.");

const browser = json("tests/reports/external-parity-character-viewer-browser.json");
const states = isObj(browser?.states) ? browser.states : {};
const example = isObj(states.example) ? states.example : {};
const scrubbed = isObj(states.scrubbed) ? states.scrubbed : {};
const app = isObj(states.app) ? states.app : {};
const screenshots = arr(browser?.screenshots);
const expectedScreenshots = ["tests/reports/external-gallery/characters/external-character-viewer.png", "tests/reports/external-gallery/characters/external-character-viewer-scrubbed.png", "tests/reports/external-gallery/characters/animation-studio-pro.png"];
check("browser-report", browser?.ok === true && statePasses(example, "external-character-viewer") && statePasses(scrubbed, "external-character-viewer") && statePasses(app, "animation-studio-pro") && scrubbed.playing === false, "Browser report must prove example, scrubbed state, and app.");
check("browser-screenshots", expectedScreenshots.every((path) => screenshots.includes(path) && exists(path)), "Browser report must include character screenshots.");
check("browser-boundary", typeof browser?.productBoundary === "string" && browser.productBoundary.includes("real skinned glTF rendered animation parity"), "Browser report must preserve real animation parity boundary.");

const pass = checks.every((entry) => entry.pass);
const report = { schema: "g3d-external-parity-character-readiness/v1", generatedAt: new Date().toISOString(), pass, summary: pass ? "V4 Milestone 11 character product surface is ready. Real skinned glTF/Three.js animation parity remains required." : "V4 Milestone 11 character proof is incomplete.", checkedFiles: requiredFiles, checks };
mkdirSync(dirname(resolve("tests/reports/external-parity-character-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-character-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(JSON.stringify(report, null, 2));

function statePasses(state: Obj, id: string): boolean {
  const checklist = arr(state.featureChecklist);
  return state.id === id && state.status === "ready" && state.productSurface === "animation-studio-pro" && state.fixture === "fixtures/v4/characters/animated-character/manifest.json" && state.characterId === "animated-character-cesium-man" && state.sourceAsset === "cesium-man" && state.sourceRevision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf" && state.licenseReviewRequired === true && Number(state.clipCount ?? 0) >= 1 && Number(state.skeletonJointCount ?? 0) >= 10 && Number(state.skinnedMeshCount ?? 0) >= 1 && state.timelineScrub === true && state.playPause === true && checklist.includes("character-fixture") && checklist.includes("timeline-scrub") && checklist.includes("clip-diagnostics") && typeof state.claimBoundary === "string" && state.claimBoundary.includes("Three.js");
}
