import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = resolve(repoRoot, "tests/reports/gallery-shift");
const modelIds = ["galleryShiftMuseumInterior", "galleryShiftPedestal", "galleryShiftExhibitA", "galleryShiftExhibitB", "galleryShiftExhibitC", "galleryShiftDisplayCase"];
const supportingModelIds = ["showcaseKenneyOobiPlatformerHero", "showcaseExpressiveRobot"];
const audioIds = ["galleryShiftSneakStepSfx", "galleryShiftWalkStepSfx", "galleryShiftGuardAlertSfx", "galleryShiftAlertRiseSfx", "galleryShiftExhibitLiftSfx", "galleryShiftLaserTripSfx", "galleryShiftCameraWhirSfx", "galleryShiftCaughtStingSfx", "galleryShiftFloorClearSfx", "galleryShiftAmbientHallSfx", "galleryShiftExitWinSfx"];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function files(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const routeSourceFiles = files(join(appDir, "src")).filter((path) => /\.(?:ts|css)$/.test(path));
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const path of routeSourceFiles) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
})();
const sourceText = routeSourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const forbidden of [/\bfrom\s+["']three(?:\/|["'])/, /unsafeModelUrl\s*\(/, /model\s*\(\s*["'][^"']+\.gl(?:b|tf)/]) {
  if (forbidden.test(sourceText)) throw new Error(`Gallery Shift source violates the root-safe asset boundary: ${forbidden}`);
}
if (!existsSync(join(appDir, "README.md"))) throw new Error("Gallery Shift README is missing");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
for (const id of [...modelIds, ...supportingModelIds]) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release") throw new Error(`${id} is not a release-grade model`);
  if (!asset.provenance?.license || !asset.provenance?.author || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} durable provenance is incomplete`);
  if (!asset.renderedProbe?.url || asset.renderedProbe.assetHash !== asset.hash || !existsSync(join(repoRoot, asset.renderedProbe.url))) throw new Error(`${id} rendered probe is missing or stale`);
  if (!sourceText.includes(`assets.${id}`)) throw new Error(`${id} is not referenced by the live route`);
}
for (const id of audioIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "audio" || asset.quality !== "candidate" || asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} typed audio provenance/quality is incomplete`);
  if (!sourceText.includes(`"${id}"`)) throw new Error(`${id} is not referenced by the live audio controller`);
}

function validateReceipt(path, schema) {
  const receipt = readJson(path);
  if (receipt.schema !== schema || receipt.pass !== true) throw new Error(`${relative(repoRoot, path)} is missing or failing`);
  if (receipt.producerSourceSha256 !== sha256(join(repoRoot, receipt.producer))) throw new Error(`${relative(repoRoot, path)} producer binding is stale`);
  if (receipt.routeSourceSha256 !== routeSourceSha256) throw new Error(`${relative(repoRoot, path)} route-source binding is stale`);
  for (const artifact of receipt.artifacts ?? []) if (!existsSync(join(repoRoot, artifact.path)) || artifact.sha256 !== sha256(join(repoRoot, artifact.path))) throw new Error(`${relative(repoRoot, path)} artifact binding is stale: ${artifact.path}`);
  return receipt;
}
const visualReceipt = validateReceipt(join(reportDir, "browser-evidence.json"), "aura3d.gallery-shift.browser-evidence/1.0");
const playableReceipt = validateReceipt(join(reportDir, "playable/browser-evidence.json"), "aura3d.gallery-shift.playable-evidence/1.0");
for (const scenario of ["lobby", "cover-sneak", "near-detection", "caught", "exhibit-lift", "stair-transition", "camera-sweep", "alarm-return", "exit-win", "mobile", "reduced-motion"]) if (!visualReceipt.scenarios?.includes(scenario)) throw new Error(`visual receipt is missing ${scenario}`);
for (const scenario of ["walk", "sneak", "LOS-detection", "real-occluder", "caught", "floor-reset", "three-exhibit-mission", "floor-transition", "camera-and-laser", "alarm-return", "win", "touch-move", "touch-lift", "pause-freeze-resume"]) if (!playableReceipt.scenarios?.includes(scenario)) throw new Error(`playable receipt is missing ${scenario}`);

const mission = readJson(join(reportDir, "playable/mission-touch.json"));
if (mission.alarm?.totalExhibitsLifted !== 3 || mission.alarm?.alarmActive !== true || mission.won?.state !== "won" || mission.touchMoved?.thiefGait !== "sneak" || mission.touchLift?.exhibitsLifted !== 1) throw new Error("mission, alarm, win, or touch proof is incomplete");
const pause = readJson(join(reportDir, "playable/pause.json"));
if (pause.pausedFrame?.state !== "paused" || pause.pausedFrame?.frameCount !== pause.stillPaused?.frameCount || pause.resumed?.state !== "playing") throw new Error("pause freeze/resume proof is incomplete");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d.gallery-shift.performance/1.0" || performance.pass !== true || performance.routeSourceSha256 !== routeSourceSha256 || performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer))) throw new Error("performance report is missing, failing, or stale");
const deploy = readJson(join(appDir, "deploy-report.json"));
if (deploy.schema !== "aura3d.gallery-shift.deploy/1.0" || deploy.pass !== true || deploy.checks?.strictModels?.ok !== true || deploy.checks?.strictModels?.assetCount !== modelIds.length || deploy.checks?.strictDistAndSource?.ok !== true || deploy.producerSourceSha256 !== sha256(join(repoRoot, deploy.producer))) throw new Error("strict deploy report is missing, failing, or stale");
if ([...(deploy.checks.strictModels.warnings ?? []), ...(deploy.checks.strictModels.failures ?? []), ...(deploy.checks.strictDistAndSource.warnings ?? []), ...(deploy.checks.strictDistAndSource.failures ?? [])].length > 0) throw new Error("strict deploy report contains warnings or failures");

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-gallery-shift");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Gallery Shift route gate is missing or over-promoted");
if (JSON.stringify(gate.primaryAssets) !== JSON.stringify(modelIds) || gate.routePrimaryHeroAsset !== "galleryShiftMuseumInterior") throw new Error("Gallery Shift route-primary asset gate is stale");
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Gallery Shift primitive source budget exceeded");
const routePrimary = readJson(join(repoRoot, "tests/reports/showcase-route-primary-probes/showcase-gallery-shift.json"));
if (routePrimary.routeId !== "showcase-gallery-shift" || routePrimary.pass !== true || (routePrimary.failures?.length ?? 0) > 0 || routePrimary.routePrimaryHeroAsset !== "galleryShiftMuseumInterior") throw new Error("Gallery Shift route-primary probe is missing or failing");

const exactArtifacts = visualReceipt.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 }));
const routeHealth = {
  schema: "aura3d-route-health/1.0", generatedAt: new Date().toISOString(), appId: "showcase-gallery-shift", route: "/apps/showcase-gallery-shift/",
  classification: "prototype-blocked", publicShowcase: false, promotionStatus: "hold-public-showcase-until-independent-human-visual-review", machinePass: true, routeSourceSha256,
  renderer: { path: "createGameApp root safe API", mode: "production with safe-basic fallback", nativeWebGPU: false, productionRuntimeClaimed: false },
  primaryAssets: modelIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  supportingCharacterAssets: supportingModelIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  audioAssets: audioIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "subordinate floor-two shell, light pools, laser beams, exit/alarm markers, frames, inlays, fixtures, debug-only diagnostics, and UI around typed primary assets", status: "no-primitive-primary-subjects" },
  gameplay: { exhibits: 3, floors: 2, controls: ["walk", "sneak", "sprint", "hold lift", "pause", "floor/full reset"], keyboardAndTouch: true, rapierBackend: true, publicPhysicsLos: true, authoredHearingRadii: { walk: 3, sneak: 0, sprint: 6 }, authoredWaypointNavigation: true, recastClaimed: false, exactOnceSensors: true, alarmEscapeGraceSeconds: 2, reducedMotionPreservesStateTruth: true },
  accessibility: { semanticHeading: true, namedStatusRegions: true, namedTouchControls: 8, minimumTouchTargetPx: 44, keyboardAndTouchParity: true, colorIndependentStatusText: true, pass: true },
  performance, deploy,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: { status: "blocked-pending-human-review", label: "root-safe prototype", allowed: ["typed museum, pedestal, exhibit, display-case, thief, and guard assets", "route-local public-physics LOS and exact-entry sensors", "route-local authored hearing radii, collision pushout, gait, guard patrols, and two-floor navigation", "three-exhibit mission, third-lift alarm, caught/reset, and win"], notAllowed: ["reusable stealth, guard-AI, hearing, or navigation kit", "Recast/navmesh ownership", "clip-event footsteps", "production-runtime-only rendering claims", "public promotion before independent exact-artifact review"] },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: { global: "window.__AURA3D_SHOWCASE_GALLERY_SHIFT__", detailedGlobal: "window.__GALLERY_SHIFT_EVIDENCE__", sourceReview: "apps/showcase-gallery-shift/src/main.ts", exactArtifacts, browserReceipts: ["tests/reports/gallery-shift/browser-evidence.json", "tests/reports/gallery-shift/playable/browser-evidence.json"], assetProbes: [...modelIds, ...supportingModelIds].map((id) => ({ asset: id, metadata: `tests/reports/showcase-release-asset-probes/${id}.json`, screenshot: assetById.get(id).renderedProbe.url, assetHash: assetById.get(id).hash })), performance: "apps/showcase-gallery-shift/performance-report.json", deploy: "apps/showcase-gallery-shift/deploy-report.json", routePrimary: "tests/reports/showcase-route-primary-probes/showcase-gallery-shift.json", unitSpecs: ["tests/unit/apps/gallery-shift-vision.test.ts", "tests/unit/apps/gallery-shift-patrols.test.ts"], browserSpecs: ["tests/browser/gallery-shift-playable.spec.ts", "tests/browser/gallery-shift-scene.spec.ts"] },
  determinismContract: { fixedStep: "1/60", guardPatrols: "authored waypoint order without randomness", cameraSweep: "authored sine of floor time", perception: "range + field angle + public-physics filtered LOS", hearing: "explicit authored radius events", animationBoundary: "embedded clips for presentation; authored gait because clip event metadata is absent" }
};
writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({ machinePass: true, models: modelIds.length, supportingModels: supportingModelIds.length, audio: audioIds.length, exactArtifacts: exactArtifacts.length, primitiveOccurrences, performancePass: performance.pass }));
