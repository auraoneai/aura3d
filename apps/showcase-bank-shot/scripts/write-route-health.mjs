import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = join(repoRoot, "tests/reports/bank-shot");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const modelIds = [
  "bankShotTable", "bankShotCue",
  ...Array.from({ length: 16 }, (_, number) => `bankShotBall${String(number).padStart(2, "0")}`)
];
const initialPrimaryAssets = ["bankShotTable", "bankShotCue", "bankShotBall00"];
const audioIds = [
  "bankShotAmbientHallSfx", "bankShotBallHitSfx", "bankShotComboChimeSfx", "bankShotCueStrikeSfx",
  "bankShotCushionHitSfx", "bankShotEightWinSfx", "bankShotFoulWhistleSfx", "bankShotPocketDropSfx",
  "bankShotRackClearSfx", "bankShotRackFailSfx"
];

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
  if (forbidden.test(sourceText)) throw new Error(`Bank Shot source violates the root-safe asset boundary: ${forbidden}`);
}

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
for (const id of modelIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release") throw new Error(`${id} is not a release-grade model`);
  if (asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} durable CC0 provenance is incomplete`);
  if (!asset.renderedProbe?.url || asset.renderedProbe.assetHash !== asset.hash || !existsSync(join(repoRoot, asset.renderedProbe.url))) throw new Error(`${id} rendered probe is missing or stale`);
  if (!sourceText.includes(`assets.${id}`) && !sourceText.includes("typedAsset")) throw new Error(`${id} is not reachable from the typed live route`);
}
for (const id of audioIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "audio" || asset.quality !== "candidate" || asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} typed audio provenance/quality is incomplete`);
  if (!sourceText.includes(`"${id}"`)) throw new Error(`${id} is not referenced by the live audio manifest`);
}

function validateReceipt(path, schema) {
  const receipt = readJson(path);
  if (receipt.schema !== schema || receipt.pass !== true) throw new Error(`${relative(repoRoot, path)} is missing or failing`);
  if (receipt.producerSourceSha256 !== sha256(join(repoRoot, receipt.producer))) throw new Error(`${relative(repoRoot, path)} producer binding is stale`);
  if (receipt.routeSourceSha256 !== routeSourceSha256) throw new Error(`${relative(repoRoot, path)} route-source binding is stale`);
  for (const artifact of receipt.artifacts ?? []) {
    if (!existsSync(join(repoRoot, artifact.path)) || artifact.sha256 !== sha256(join(repoRoot, artifact.path))) throw new Error(`${relative(repoRoot, path)} artifact binding is stale: ${artifact.path}`);
  }
  return receipt;
}
const visualReceipt = validateReceipt(join(reportDir, "browser-evidence.json"), "aura3d.bank-shot.browser-evidence/1.0");
const playableReceipt = validateReceipt(join(reportDir, "playable/browser-evidence.json"), "aura3d.bank-shot.playable-evidence/1.0");
for (const scenario of ["attract", "aim", "cue-contact", "motion", "pocket", "foul", "rack-fail", "eight-finish", "mobile-attract", "mobile-touch-active", "reduced-motion-aim"]) {
  if (!visualReceipt.scenarios?.includes(scenario)) throw new Error(`visual receipt is missing ${scenario}`);
}
for (const scenario of ["keyboard-aim", "keyboard-strike", "public-rapier-break", "settled-lock", "second-shot", "full-reset", "pause-freeze-resume"]) {
  if (!playableReceipt.scenarios?.includes(scenario)) throw new Error(`playable receipt is missing ${scenario}`);
}

const visual = readJson(join(reportDir, "visual.json"));
if (visual.scenarios?.finishEvidence?.rack !== 3 || visual.scenarios?.finishEvidence?.sessionComplete !== true || visual.scenarios?.finishEvidence?.state !== "rack-won") throw new Error("three-rack session-clear browser outcome is missing");
if (visual.scenarios?.foulEvidence?.state !== "ball-in-hand" || visual.scenarios?.failEvidence?.state !== "rack-lost") throw new Error("foul/rack-fail browser outcomes are missing");
if (visual.scenarios?.mobileActiveEvidence?.state !== "shooting" || visual.scenarios?.reducedEvidence?.state !== "aiming") throw new Error("mobile/reduced browser outcomes are missing");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d.bank-shot.performance/1.0" || performance.pass !== true || performance.routeSourceSha256 !== routeSourceSha256 || performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer))) throw new Error("performance report is missing, failing, or stale");
const deploy = readJson(join(appDir, "deploy-report.json"));
if (deploy.schema !== "aura3d.bank-shot.deploy/1.0" || deploy.pass !== true || deploy.checks?.strictModels?.ok !== true || deploy.checks?.strictModels?.assetCount !== 18 || deploy.checks?.strictDistAndSource?.ok !== true || deploy.producerSourceSha256 !== sha256(join(repoRoot, deploy.producer))) throw new Error("strict deploy report is missing, failing, or stale");
if ([...(deploy.checks.strictModels.warnings ?? []), ...(deploy.checks.strictModels.failures ?? []), ...(deploy.checks.strictDistAndSource.warnings ?? []), ...(deploy.checks.strictDistAndSource.failures ?? [])].length > 0) throw new Error("strict deploy report contains warnings or failures");

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-bank-shot");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Bank Shot route gate is missing or over-promoted");
if (JSON.stringify(gate.primaryAssets) !== JSON.stringify(initialPrimaryAssets)) throw new Error("Bank Shot route-primary asset gate is stale");
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Bank Shot primitive source budget exceeded");

const routePrimaryPath = join(repoRoot, "tests/reports/showcase-route-primary-probes/showcase-bank-shot.json");
const routePrimary = readJson(routePrimaryPath);
if (routePrimary.routeId !== "showcase-bank-shot" || routePrimary.pass !== true || (routePrimary.failures?.length ?? 0) > 0) throw new Error("Bank Shot route-primary probe is missing or failing");

const exactArtifacts = visualReceipt.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 }));
const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-bank-shot",
  route: "/apps/showcase-bank-shot/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  routeSourceSha256,
  renderer: { path: "createGameApp root safe API", mode: "production with safe-basic fallback", nativeWebGPU: false, productionRuntimeClaimed: false },
  primaryAssets: initialPrimaryAssets.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  typedModelFamily: modelIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  audioAssets: audioIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "pool-hall architecture, rail sights, chalk, aim/bank guides, contact marker, and lighting only", status: "no-primitive-primary-subjects" },
  gameplay: {
    racks: 3, rackClocksMs: [240000, 210000, 180000], publicRapierBodies: 34, pocketSensors: 6,
    controls: ["aim", "top/draw authored contact nudge", "charge/strike", "ball-in-hand placement", "pause", "full reset"],
    keyboardAndTouch: true, settledStateLock: true, oncePerEntryPocketTruth: true,
    deterministicOutcomes: ["legal pot", "scratch", "no-rail", "wrong-ball-first", "three fouls", "early eight", "legal eight", "three-rack session clear"],
    reducedMotionPreservesAimAndContactTruth: true
  },
  performance,
  deploy,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: {
    status: "blocked-pending-human-review", label: "root-safe prototype",
    allowed: ["typed original billiards asset family", "public Rapier sphere/cushion/pocket-sensor path", "route-local deterministic three-rack rules", "bounded first-contact prediction", "authored spin velocity nudge"],
    notAllowed: ["reusable cue-sports or billiards kit", "angular ball simulation", "multi-contact prediction certainty", "production-runtime-only rendering claims", "public promotion before independent exact-artifact review"]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_BANK_SHOT__",
    detailedGlobal: "window.__BANK_SHOT_EVIDENCE__",
    sourceReview: "apps/showcase-bank-shot/src/main.ts",
    exactArtifacts,
    browserReceipts: ["tests/reports/bank-shot/browser-evidence.json", "tests/reports/bank-shot/playable/browser-evidence.json"],
    assetProbes: modelIds.map((id) => ({ asset: id, metadata: `tests/reports/showcase-release-asset-probes/${id}.json`, screenshot: assetById.get(id).renderedProbe.url, assetHash: assetById.get(id).hash })),
    performance: "apps/showcase-bank-shot/performance-report.json",
    deploy: "apps/showcase-bank-shot/deploy-report.json",
    routePrimary: "tests/reports/showcase-route-primary-probes/showcase-bank-shot.json",
    browserSpecs: ["tests/browser/bank-shot-playable.spec.ts", "tests/browser/bank-shot-shot-visual.spec.ts"],
    unitSpecs: ["tests/unit/apps/bank-shot-determinism.test.ts", "tests/unit/apps/bank-shot-rules.test.ts"],
    deployCommands: ["check-deploy --release --source apps/showcase-bank-shot/src --asset <18 model assets>", "check-deploy --release --source apps/showcase-bank-shot/src --no-assets"]
  }
};
writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({ machinePass: true, models: modelIds.length, audio: audioIds.length, exactArtifacts: exactArtifacts.length, primitiveOccurrences, performancePass: performance.pass }));
