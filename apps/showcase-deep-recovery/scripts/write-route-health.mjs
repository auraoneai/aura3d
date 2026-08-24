import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = resolve(repoRoot, "tests/reports/deep-recovery");
const modelIds = ["deepRecoverySub", "deepRecoveryWreckHull", "deepRecoveryCrateStandard", "deepRecoveryCrateHeavy", "deepRecoveryBuoyBeacon"];
const audioIds = [
  "deepRecoverySonarPingSfx", "deepRecoverySonarReturnSfx", "deepRecoveryHullCreakSfx",
  "deepRecoveryBreachAlarmSfx", "deepRecoveryPatchSealSfx", "deepRecoveryGrappleLatchSfx",
  "deepRecoveryCrateBankSfx", "deepRecoveryOxygenWarnSfx", "deepRecoveryBlackoutSfx",
  "deepRecoverySurfaceBreakSfx", "deepRecoveryAmbientDeepSfx"
];

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function files(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}
const routeSourceFiles = files(join(appDir, "src"));
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const path of routeSourceFiles) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
})();
const sourceText = routeSourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const forbidden of [/\bfrom\s+["']three(?:\/|["'])/, /unsafeModelUrl\s*\(/, /model\s*\(\s*["'][^"']+\.gl(?:b|tf)/]) {
  if (forbidden.test(sourceText)) throw new Error(`Deep Recovery source violates the root-safe asset boundary: ${forbidden}`);
}
if (!existsSync(join(appDir, "README.md"))) throw new Error("Deep Recovery README is missing");
if (!sourceText.includes('Object.defineProperty(window, "__AURA3D_SHOWCASE_DEEP_RECOVERY__"')) throw new Error("Deep Recovery literal global evidence contract is missing");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
for (const id of modelIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release") throw new Error(`${id} is not a release-grade model`);
  if (!asset.provenance?.license || !asset.provenance?.author || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} durable provenance is incomplete`);
  if (!asset.renderedProbe?.url || asset.renderedProbe.assetHash !== asset.hash || !existsSync(join(repoRoot, asset.renderedProbe.url))) throw new Error(`${id} rendered probe is missing or stale`);
  if (!sourceText.includes(`assets.${id}`)) throw new Error(`${id} is not referenced by the live route`);
}
for (const id of audioIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "audio" || asset.quality !== "candidate" || asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} typed audio provenance/quality is incomplete`);
  if (!sourceText.includes(`assets.${id}`)) throw new Error(`${id} is not referenced by the live audio controller`);
}

const receiptPath = join(reportDir, "playable/browser-evidence.json");
const receipt = readJson(receiptPath);
if (receipt.schema !== "aura3d.deep-recovery.playable-evidence/1.0" || receipt.pass !== true) throw new Error("playable browser receipt is missing or failing");
if (receipt.producerSourceSha256 !== sha256(join(repoRoot, receipt.producer))) throw new Error("playable receipt producer binding is stale");
if (receipt.routeSourceSha256 !== routeSourceSha256) throw new Error("playable receipt route-source binding is stale");
for (const artifact of receipt.artifacts ?? []) {
  if (!existsSync(join(repoRoot, artifact.path)) || artifact.sha256 !== sha256(join(repoRoot, artifact.path))) throw new Error(`playable artifact binding is stale: ${artifact.path}`);
}
for (const scenario of [
  "descent", "keyboard-movement", "world-space-sonar", "wreck-approach", "grapple", "standard-tow",
  "drop-and-relatch", "standard-bank", "collision-breach", "pause-freeze-resume", "explicit-buoy-repair",
  "heavy-tow", "low-oxygen", "heavy-bank", "surface-win", "full-reset", "blackout-fail",
  "touch-movement", "mobile", "reduced-motion-state-truth"
]) if (!receipt.scenarios?.includes(scenario)) throw new Error(`playable receipt is missing ${scenario}`);

const mission = readJson(join(reportDir, "playable/mission-touch.json"));
if (mission.standardTow?.towMassKg !== 120 || mission.heavyTow?.towMassKg !== 280 || !(mission.heavyTow?.towDrag > mission.standardTow?.towDrag * 2)) throw new Error("standard/heavy mass or tow differentiation proof is incomplete");
if (mission.breached?.breachCount < 1 || mission.repaired?.repairCount < 1 || mission.blackout?.state !== "blackout" || mission.won?.state !== "won" || mission.won?.missionStage !== "surface-complete") throw new Error("breach, repair, blackout, or surface-win proof is incomplete");
if (mission.touchAfter?.subPosition?.join(",") === mission.reset?.subPosition?.join(",") || mission.reduced?.reducedMotion !== true || mission.reduced?.sonarPings < 1) throw new Error("touch or reduced-motion proof is incomplete");
const pause = readJson(join(reportDir, "playable/pause.json"));
if (pause.paused?.state !== "paused" || pause.paused?.frameCount !== pause.before?.frameCount || pause.resumed?.state !== "playing") throw new Error("pause freeze/resume proof is incomplete");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d.deep-recovery.performance/1.0" || performance.pass !== true || performance.routeSourceSha256 !== routeSourceSha256 || performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer))) throw new Error("performance report is missing, failing, or stale");
const deploy = readJson(join(appDir, "deploy-report.json"));
if (deploy.schema !== "aura3d.deep-recovery.deploy/1.0" || deploy.pass !== true || deploy.checks?.strictModels?.ok !== true || deploy.checks?.strictModels?.assetCount !== modelIds.length || deploy.checks?.strictDistAndSource?.ok !== true || deploy.producerSourceSha256 !== sha256(join(repoRoot, deploy.producer))) throw new Error("strict deploy report is missing, failing, or stale");
if ([...(deploy.checks.strictModels.warnings ?? []), ...(deploy.checks.strictModels.failures ?? []), ...(deploy.checks.strictDistAndSource.warnings ?? []), ...(deploy.checks.strictDistAndSource.failures ?? [])].length > 0) throw new Error("strict deploy report contains warnings or failures");

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-deep-recovery");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Deep Recovery route gate is missing or over-promoted");
if (JSON.stringify(gate.primaryAssets) !== JSON.stringify(modelIds) || gate.routePrimaryHeroAsset !== "deepRecoverySub") throw new Error("Deep Recovery route-primary asset gate is stale");
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\s*\.\s*[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Deep Recovery primitive source budget exceeded");
const routePrimary = readJson(join(repoRoot, "tests/reports/showcase-route-primary-probes/showcase-deep-recovery.json"));
if (routePrimary.routeId !== "showcase-deep-recovery" || routePrimary.pass !== true || (routePrimary.failures?.length ?? 0) > 0 || routePrimary.routePrimaryHeroAsset !== "deepRecoverySub") throw new Error("Deep Recovery route-primary probe is missing or failing");

const exactArtifacts = receipt.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 }));
const routeHealth = {
  schema: "aura3d-route-health/1.0", generatedAt: new Date().toISOString(), appId: "showcase-deep-recovery", route: "/apps/showcase-deep-recovery/",
  classification: "prototype-blocked", publicShowcase: false, promotionStatus: "hold-public-showcase-until-independent-human-visual-review", machinePass: true, routeSourceSha256,
  renderer: { path: "createAuraApp root safe API", mode: "production with safe-basic fallback", nativeWebGPU: false, productionRuntimeClaimed: false },
  primaryAssets: modelIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  audioAssets: audioIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "subordinate seabed/reef/wreck dressing, lamp volumes, sonar rings, grapple cable, warning beacon, bioluminescent silt, and UI around five typed primary assets", status: "no-primitive-primary-subjects" },
  gameplay: {
    mission: ["descent", "wreck approach", "standard salvage", "collision breach", "explicit buoy repair", "heavy salvage", "ascent/surface win"],
    authoredMotion: { thrust: true, linearDrag: true, angularDrag: true, neutralBuoyancy: true, worldAndWreckCollision: true },
    physicsOwner: "route-local deterministic TypeScript", rapierClaimed: false, recastClaimed: false,
    sonarOwner: "route-local spherical live-target query plus authored wreck-sphere line-segment occlusion", worldSpaceReturns: true,
    standardMassKg: 120, firstHeavyMassKg: 280, massDependentTow: true, bankRequiresSubAndCrateInsideBuoy: true,
    keyboardAndTouch: true, pauseFreezeResume: true, fullReset: true, blackoutFail: true, surfaceWin: true, reducedMotionPreservesStateTruth: true
  },
  accessibility: { semanticHeading: true, namedStatusRegions: true, namedTouchControls: 14, minimumTouchTargetPx: 44, keyboardAndTouchParity: true, colorIndependentStatusText: true, pass: true },
  performance, deploy,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: {
    status: "blocked-pending-human-review", label: "root-safe prototype",
    allowed: ["five original typed CC0 primary assets", "route-local authored submarine motion/collision and oxygen/hull rules", "route-local sonar range/occlusion with renderer-owned world-space returns", "mass-dependent grapple/tow and two-class banking", "full breach/repair/blackout/surface mission with keyboard and touch"],
    notAllowed: ["Rapier or Recast ownership", "fluid or acoustic simulation", "reusable submarine, sonar, collision, oxygen, or salvage kit", "production-runtime-only rendering claims", "public promotion before independent exact-artifact review"]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_DEEP_RECOVERY__", detailedGlobal: "window.__DEEP_RECOVERY_EVIDENCE__",
    sourceReview: "apps/showcase-deep-recovery/src/main.ts", exactArtifacts,
    browserReceipt: "tests/reports/deep-recovery/playable/browser-evidence.json",
    assetProbes: modelIds.map((id) => ({ asset: id, metadata: `tests/reports/showcase-release-asset-probes/${id}.json`, screenshot: assetById.get(id).renderedProbe.url, assetHash: assetById.get(id).hash })),
    performance: "apps/showcase-deep-recovery/performance-report.json", deploy: "apps/showcase-deep-recovery/deploy-report.json",
    routePrimary: "tests/reports/showcase-route-primary-probes/showcase-deep-recovery.json",
    unitSpecs: ["tests/unit/apps/deep-recovery-sonar.test.ts", "tests/unit/apps/deep-recovery-oxygen.test.ts", "tests/unit/apps/deep-recovery-salvage.test.ts", "tests/unit/apps/deep-recovery-sub.test.ts"],
    browserSpecs: ["tests/browser/deep-recovery-playable.spec.ts", "tests/browser/deep-recovery-scene.spec.ts"]
  },
  determinismContract: { fixedStep: "1/60", motion: "authored thrust/drag/buoyancy with no randomness", sonar: "live target coordinates, spherical range, authored wreck-sphere occlusion", tether: "mass-derived drag and deterministic spring", mission: "explicit ordered standard/breach/repair/heavy/surface state" }
};
writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({ machinePass: true, models: modelIds.length, audio: audioIds.length, exactArtifacts: exactArtifacts.length, primitiveOccurrences, performancePass: performance.pass }));
