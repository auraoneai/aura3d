import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }
const requiredFiles = [
  "src/aura-assets.ts",
  "apps/animation-studio-pro/index.html",
  "apps/animation-studio-pro/src/main.ts",
  "tests/fixtures/external-character-viewer/index.html",
  "tests/fixtures/external-character-viewer/main.ts",
  "examples/external-character-viewer/ExternalCharacterViewer.ts",
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
check("typed-asset", includesAll(text("src/aura-assets.ts"), ["showcaseExpressiveRobot", "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319"]), "Generated assets must bind the exact expressive robot hash.");
check("viewer-source", includesAll(text("examples/external-character-viewer/ExternalCharacterViewer.ts"), ["createAuraApp", "assets.showcaseExpressiveRobot", "timeline-scrub", "play-pause", "__A3D_EXTERNAL_PARITY_CHARACTER_VIEWER__", "universal Three.js animation parity is not claimed"]), "Character viewer must render the typed GLB through the root API and expose timeline/play evidence with a scoped boundary.");
check("app-entry-no-fixture-side-effect", text("tests/fixtures/external-character-viewer/main.ts").includes("mountExternalCharacterViewer(\"external-character-viewer\")") && text("apps/animation-studio-pro/src/main.ts").includes("ExternalCharacterViewer") && !text("apps/animation-studio-pro/src/main.ts").includes("tests/fixtures"), "Animation Studio Pro must import the side-effect-free shared module while the redundant standalone host remains test-only.");

const browser = json("tests/reports/external-parity-character-viewer-browser.json");
const states = isObj(browser?.states) ? browser.states : {};
const example = isObj(states.example) ? states.example : {};
const scrubbed = isObj(states.scrubbed) ? states.scrubbed : {};
const app = isObj(states.app) ? states.app : {};
const screenshots = arr(browser?.screenshots);
const expectedScreenshots = ["tests/reports/external-gallery/characters/external-character-viewer.png", "tests/reports/external-gallery/characters/external-character-viewer-scrubbed.png", "tests/reports/external-gallery/characters/animation-studio-pro.png"];
check("browser-report", browser?.ok === true && statePasses(example, "external-character-viewer") && statePasses(scrubbed, "external-character-viewer") && statePasses(app, "animation-studio-pro") && scrubbed.playing === false, "Browser report must prove example, scrubbed state, and app.");
check("browser-screenshots", expectedScreenshots.every((path) => screenshots.includes(path) && exists(path)), "Browser report must include character screenshots.");
check("browser-boundary", typeof browser?.productBoundary === "string" && browser.productBoundary.includes("universal Three.js animation parity is not claimed"), "Browser report must preserve the scoped animation parity boundary.");

const pass = checks.every((entry) => entry.pass);
const report = { schema: "a3d-external-parity-character-readiness", generatedAt: new Date().toISOString(), pass, summary: pass ? "The root character surface renders the exact typed expressive robot with named clips and browser-visible timeline changes." : "The typed root character proof is incomplete.", checkedFiles: requiredFiles, checks };
mkdirSync(dirname(resolve("tests/reports/external-parity-character-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-character-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(JSON.stringify(report, null, 2));

function statePasses(state: Obj, id: string): boolean {
  const checklist = arr(state.featureChecklist);
  return state.id === id && state.status === "ready" && state.productSurface === "animation-studio-pro" && state.characterId === "showcaseExpressiveRobot" && state.assetHash === "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319" && state.sourceLicense === "CC0-1.0" && state.licenseReviewRequired === false && Number(state.clipCount ?? 0) >= 14 && Number(state.skeletonJointCount ?? 0) >= 10 && Number(state.skinnedMeshCount ?? 0) >= 1 && Number(state.drawCalls ?? 0) >= 1 && Number(state.litPixels ?? 0) > 20_000 && state.timelineScrub === true && state.playPause === true && checklist.includes("typed-character-asset") && checklist.includes("timeline-scrub") && checklist.includes("named-clip-diagnostics") && typeof state.claimBoundary === "string" && state.claimBoundary.includes("Three.js");
}
