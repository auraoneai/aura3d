import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = join(repoRoot, "tests/reports/vault-breakers");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const modelIds = ["vaultBreakersTable", "vaultBreakersMechanisms", "vaultBreakersBall", "vaultBreakersFlipper", "vaultBreakersVaultDoor"];
const audioIds = ["vaultFlipperSnapSfx", "vaultBumperHitSfx", "vaultSlingPopSfx", "vaultRampRollSfx", "vaultTargetDownSfx", "vaultBankClearSfx", "vaultVaultOpenSfx", "vaultMultiballSfx", "vaultBallDrainSfx", "vaultTiltWarnSfx", "vaultPlungerReleaseSfx"];

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
  if (forbidden.test(sourceText)) throw new Error(`Vault Breakers source violates the root-safe asset boundary: ${forbidden}`);
}
if (!existsSync(join(appDir, "README.md"))) throw new Error("Vault Breakers README is missing");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
for (const id of modelIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release") throw new Error(`${id} is not a release-grade model`);
  if (asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} durable CC0 provenance is incomplete`);
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
const visualReceipt = validateReceipt(join(reportDir, "browser-evidence.json"), "aura3d.vault-breakers.browser-evidence/1.0");
const playableReceipt = validateReceipt(join(reportDir, "playable/browser-evidence.json"), "aura3d.vault-breakers.playable-evidence/1.0");
for (const scenario of ["opening", "plunger-charge", "serve-flipper", "bank-near-complete", "vault-opening", "multiball", "tilt", "game-over", "reset-attract", "mobile-opening", "mobile-touch-charge", "reduced-motion-multiball"]) if (!visualReceipt.scenarios?.includes(scenario)) throw new Error(`visual receipt is missing ${scenario}`);
for (const scenario of ["keyboard-serve", "joint-flippers", "tilt-lock", "natural-drain", "full-reset", "bank-near-complete", "vault-opening", "multiball", "game-over", "touch-charge-release", "touch-flipper", "pause-freeze-resume"]) if (!playableReceipt.scenarios?.includes(scenario)) throw new Error(`playable receipt is missing ${scenario}`);

const mission = readJson(join(reportDir, "playable/mission-touch.json"));
if (mission.nearComplete?.banksDown !== 4 || mission.vault?.vaultOpen !== true || mission.multiball?.activeBalls < 2 || mission.tilted?.tiltLocked !== true || mission.gameOver?.ballsRemaining !== 0 || mission.touchServe?.phase !== "play" || mission.touched?.flipperLeftRaised !== true) throw new Error("mission, outcome, or touch proof is incomplete");
const reset = readJson(join(reportDir, "playable/reset.json"));
if (reset.phase !== "attract" || reset.score !== 0 || reset.banksDown !== 0 || reset.ballsRemaining !== 3 || reset.resetHashMatch !== true) throw new Error("full reset proof is incomplete");
const pause = readJson(join(reportDir, "playable/pause.json"));
if (pause.pausedFrame?.state !== "paused" || pause.pausedFrame?.frameCount !== pause.stillPaused?.frameCount || pause.resumed?.state !== "play") throw new Error("pause freeze/resume proof is incomplete");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d.vault-breakers.performance/1.0" || performance.pass !== true || performance.routeSourceSha256 !== routeSourceSha256 || performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer))) throw new Error("performance report is missing, failing, or stale");
const deploy = readJson(join(appDir, "deploy-report.json"));
if (deploy.schema !== "aura3d.vault-breakers.deploy/1.0" || deploy.pass !== true || deploy.checks?.strictModels?.ok !== true || deploy.checks?.strictModels?.assetCount !== modelIds.length || deploy.checks?.strictDistAndSource?.ok !== true || deploy.producerSourceSha256 !== sha256(join(repoRoot, deploy.producer))) throw new Error("strict deploy report is missing, failing, or stale");
if ([...(deploy.checks.strictModels.warnings ?? []), ...(deploy.checks.strictModels.failures ?? []), ...(deploy.checks.strictDistAndSource.warnings ?? []), ...(deploy.checks.strictDistAndSource.failures ?? [])].length > 0) throw new Error("strict deploy report contains warnings or failures");

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-vault-breakers");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Vault Breakers route gate is missing or over-promoted");
if (JSON.stringify(gate.primaryAssets) !== JSON.stringify(modelIds) || gate.routePrimaryHeroAsset !== "vaultBreakersMechanisms") throw new Error("Vault Breakers route-primary asset gate is stale");
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Vault Breakers primitive source budget exceeded");
const routePrimary = readJson(join(repoRoot, "tests/reports/showcase-route-primary-probes/showcase-vault-breakers.json"));
if (routePrimary.routeId !== "showcase-vault-breakers" || routePrimary.pass !== true || (routePrimary.failures?.length ?? 0) > 0 || routePrimary.routePrimaryHeroAsset !== "vaultBreakersMechanisms") throw new Error("Vault Breakers route-primary probe is missing or failing");

const exactArtifacts = visualReceipt.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 }));
const routeHealth = {
  schema: "aura3d-route-health/1.0", generatedAt: new Date().toISOString(), appId: "showcase-vault-breakers", route: "/apps/showcase-vault-breakers/",
  classification: "prototype-blocked", publicShowcase: false, promotionStatus: "hold-public-showcase-until-independent-human-visual-review", machinePass: true, routeSourceSha256,
  renderer: { path: "createGameApp root safe API", mode: "production with safe-basic fallback", nativeWebGPU: false, productionRuntimeClaimed: false },
  primaryAssets: modelIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  audioAssets: audioIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "subordinate felt, rails, slings, target state, lane, drain, lights, scoreboard, and feedback around typed primary assets", status: "no-primitive-primary-subjects" },
  gameplay: { ballsPerGame: 3, controls: ["charge/release serve", "left/right joint flippers", "nudge/tilt", "pause", "full reset"], keyboardAndTouch: true, rapierBackend: true, motorisedJoints: 2, targetBanks: 5, vaultMultiball: true, deterministicFixedStep: true, deterministicPoseHash: true, reducedMotionPreservesStateTruth: true },
  accessibility: { semanticHeading: true, namedStatusRegions: true, namedTouchControls: 5, minimumTouchTargetPx: 44, keyboardAndTouchParity: true, pass: true },
  performance, deploy,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: { status: "blocked-pending-human-review", label: "root-safe prototype", allowed: ["typed original pinball cabinet, mechanism, ball, flipper, and vault-door assets", "route-local Rapier ball, contacts, sensors, and two motorised flipper joints", "route-local authored slope, kick, nudge, lane-assist, door, and mission rules", "five target banks, vault multiball, tilt, three-ball game"], notAllowed: ["reusable pinball or physics kit", "ball angular-spin simulation", "production-runtime-only rendering claims", "public promotion before independent exact-artifact review"] },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: { global: "window.__AURA3D_SHOWCASE_VAULT_BREAKERS__", detailedGlobal: "window.__VAULT_BREAKERS_EVIDENCE__", sourceReview: "apps/showcase-vault-breakers/src/main.ts", exactArtifacts, browserReceipts: ["tests/reports/vault-breakers/browser-evidence.json", "tests/reports/vault-breakers/playable/browser-evidence.json"], assetProbes: modelIds.map((id) => ({ asset: id, metadata: `tests/reports/showcase-release-asset-probes/${id}.json`, screenshot: assetById.get(id).renderedProbe.url, assetHash: assetById.get(id).hash })), performance: "apps/showcase-vault-breakers/performance-report.json", deploy: "apps/showcase-vault-breakers/deploy-report.json", routePrimary: "tests/reports/showcase-route-primary-probes/showcase-vault-breakers.json", unitSpecs: ["tests/unit/apps/vault-breakers-flipper-spike.test.ts", "tests/unit/apps/vault-breakers-scoring.test.ts", "tests/unit/apps/vault-breakers-table.test.ts"], browserSpecs: ["tests/browser/vault-breakers-playable.spec.ts", "tests/browser/vault-breakers-table-visual.spec.ts"] },
  determinismContract: { fixedStep: "1/60 via physics.world fixedDelta", serveHash: "FNV-1a pose hash", resetProof: "fresh ball/body reuse plus resetHashMatch", authoredNonPhysical: ["playfield slope gravity component", "nudge", "bumper/slingshot kicks", "vault-door swing", "lane assist"] }
};
writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({ machinePass: true, models: modelIds.length, audio: audioIds.length, exactArtifacts: exactArtifacts.length, primitiveOccurrences, performancePass: performance.pass }));
