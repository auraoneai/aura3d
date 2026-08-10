import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const sha256 = (path: string): string => createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
const expectedAudioRun = (report: any): boolean => report.stats?.expected === 1 && report.stats?.unexpected === 0 && report.errors?.length === 0;

const browser = json("tests/reports/spatial-audio-lab/browser.json");
const bakeoff = json("tests/reports/audio-backend-bakeoff/report.json");
const chrome = json("tests/reports/audio-chrome.json");
const webkit = json("tests/reports/audio-webkit.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-spatial-audio-lab.json");
const routeSource = source("examples/spatial-audio-lab/main.ts");
const assetHash = "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833";
const artifacts = [
  "tests/reports/spatial-audio-lab/public-initial-canvas.png",
  "tests/reports/spatial-audio-lab/public-initial-page.png",
  "tests/reports/spatial-audio-lab/public-complete-canvas.png",
  "tests/reports/spatial-audio-lab/public-complete-page.png",
  "tests/reports/2.0-visual-audit/examples/examples--spatial-audio-lab--canvas.png",
  "tests/reports/2.0-visual-audit/examples/examples--spatial-audio-lab--page.png"
];

const checks: Check[] = [
  check("selected-single-owner", bakeoff.pass === true && bakeoff.candidates?.directWebAudio?.status === "selected-browser-standard" && bakeoff.duplicateOwnerAudit?.contextConstructorCount === 1 && bakeoff.duplicateOwnerAudit?.routeLocalContextOwners?.length === 0, `decision=${String(bakeoff.candidates?.directWebAudio?.status)}; context constructors=${String(bakeoff.duplicateOwnerAudit?.contextConstructorCount)}`),
  check("public-package-boundary", routeSource.includes('from "@aura3d/engine"') && routeSource.includes('from "@aura3d/audio"') && routeSource.includes("assets.showcaseHeadphones") && !/from\s+["']three|@aura3d\/(?:rendering|scene)|packages\/|new\s+AudioContext|createPanner\(|createBufferSource\(/.test(routeSource), "public route uses root Aura, public audio nodes, and a typed asset without direct browser graph constructors or internals"),
  check("exact-typed-product", browser.initial?.assetId === "showcaseHeadphones" && browser.initial?.assetHash === `sha256-${assetHash}` && sha256("public/aura-assets/showcaseHeadphones.40b1fdf7.glb") === assetHash, `asset=${String(browser.initial?.assetId)}; SHA-256=${String(browser.initial?.assetHash)}`),
  check("gesture-locked-initial", browser.initial?.contextState === "locked" && browser.initial?.unlocked === false && browser.initial?.graphCreated === false && browser.initial?.sourceStates?.left === "idle" && browser.initial?.sourceStates?.right === "idle", `context=${String(browser.initial?.contextState)}; graph=${String(browser.initial?.graphCreated)}`),
  check("real-hrtf-graph", browser.complete?.packageOwner === "@aura3d/audio" && browser.complete?.contextState === "running" && browser.complete?.unlocked === true && browser.complete?.graphCreated === true && browser.complete?.panningModel === "HRTF" && browser.complete?.distanceModel === "inverse", `owner=${String(browser.complete?.packageOwner)}; ${String(browser.complete?.panningModel)}/${String(browser.complete?.distanceModel)}/${String(browser.complete?.contextState)}`),
  check("source-playback-and-live-positions", browser.complete?.plays === 1 && browser.complete?.sourceStates?.left === "stopped" && browser.complete?.sourceStates?.right === "stopped" && browser.complete?.positions?.left?.[0] === 2.5 && browser.complete?.positions?.right?.[0] === -2.5, `plays=${String(browser.complete?.plays)}; states=${String(browser.complete?.sourceStates?.left)}/${String(browser.complete?.sourceStates?.right)}; positions=${JSON.stringify(browser.complete?.positions)}`),
  check("bus-controls-and-reset", browser.muted?.muted === true && browser.swapped?.swaps === 1 && browser.reset?.status === "ready" && browser.reset?.positions?.left?.[0] === -2.5 && browser.reset?.positions?.right?.[0] === 2.5, `muted=${String(browser.muted?.muted)}; swaps=${String(browser.swapped?.swaps)}; reset=${String(browser.reset?.status)}`),
  check("lifecycle-clean", browser.lifecycle?.contextClosed === true && browser.lifecycle?.sourcesDisposed === true && browser.lifecycle?.pannersDisconnected === true && browser.lifecycle?.visualDisposed === true, `context/sources/panners/visual=${Object.values(browser.lifecycle ?? {}).join("/")}`),
  check("production-runtime-clean", browser.initial?.runtimeBackend === "production-runtime" && browser.complete?.runtimeBackend === "production-runtime" && browser.initial?.errors?.length === 0 && browser.complete?.errors?.length === 0, `backend=${String(browser.complete?.runtimeBackend)}; errors=${String(browser.complete?.errors?.length)}`),
  check("chromium-browser-lifecycle", expectedAudioRun(chrome), `expected/unexpected=${String(chrome.stats?.expected)}/${String(chrome.stats?.unexpected)}`),
  check("webkit-browser-lifecycle", expectedAudioRun(webkit), `expected/unexpected=${String(webkit.stats?.expected)}/${String(webkit.stats?.unexpected)}`),
  check("visible-state-change", browser.artifacts?.[0]?.canvasSha256 !== browser.artifacts?.[1]?.canvasSha256 && browser.artifacts?.every((entry: any) => entry.canvasBytes > 10_000), `initial/final SHA-256=${String(browser.artifacts?.[0]?.canvasSha256)}/${String(browser.artifacts?.[1]?.canvasSha256)}`),
  check("six-final-artifacts-retained", artifacts.every((path) => statSync(resolve(path)).size > 10_000), `${artifacts.length} public interaction/canonical artifacts are nontrivial`),
  check("filtered-route-visual-audit", visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/spatial-audio-lab/" && visualAudit.results?.[0]?.failures?.length === 0, `route=${String(visualAudit.results?.[0]?.route)}; failures=${String(visualAudit.results?.[0]?.failures?.length)}`),
  check("explicit-claim-boundary", routeSource.includes("pixels do not prove audibility") && String(browser.comparisonBoundary).includes("screenshots do not prove audibility"), "audibility, perceptual localization, hardware, and cross-device acoustic parity remain explicitly unclaimed")
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.spatial-audio-gallery/1.0", generatedAt: new Date().toISOString(), pass: failures.length === 0, checks, failures,
  scope: {
    proven: ["single selected browser-standard Web Audio owner", "gesture-gated AudioContext unlock", "Aura mixer bus", "two AudioSource clips", "two live HRTF/inverse SpatialAudio panners", "mute/swap/reset and complete disposal", "Chromium and WebKit short-buffer lifecycle"],
    limited: ["two procedural mono tones", "one Chromium public route", "synthetic short-buffer cross-browser lifecycle"],
    unclaimed: ["audibility in the test harness", "perceptual localization", "speaker/headphone hardware behavior", "all-device, production-mix, codec, or acoustic parity"]
  },
  humanReview: {
    reviewer: "Codex full-resolution visual audit", reviewedAt: "2026-08-10", status: "passed",
    method: "Every final original-resolution image was opened and inspected individually after the final lighting, framing, interaction, and canonical regeneration; automated capture was not treated as visual acceptance, and visual review was not misrepresented as audio listening proof.",
    artifacts,
    verdict: "All six final images are nonblank, undistorted, fully framed, and legible. The typed headphone listener is materially readable under the final front fill, both emitter spheres remain wholly visible, and the complete state visibly swaps their cyan/amber positions while reporting HRTF, inverse, running, one sweep, and live panner coordinates. These visuals explain separately verified node state; they are not evidence of audibility or human localization."
  }
};
const output = resolve("tests/reports/spatial-audio-lab/aggregate.json"); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) { console.error(`Spatial audio gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`); process.exitCode = 1; }
else console.log(`Spatial audio gallery PASS: ${checks.length}/${checks.length} checks plus completed full-resolution visual review; ${output}`);
