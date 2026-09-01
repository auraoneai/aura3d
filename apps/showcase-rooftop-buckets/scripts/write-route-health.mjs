import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = join(repoRoot, "tests/reports/rooftop-buckets");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const modelIds = ["rooftopCourt", "rooftopBackboard", "rooftopRim", "rooftopBall", "rooftopLayupScorer", "rooftopDefender"];
const audioIds = [
  "rooftopBucketsAmbientRooftopSfx", "rooftopBucketsBoardThudSfx", "rooftopBucketsBrickMissSfx",
  "rooftopBucketsBuzzerFailSfx", "rooftopBucketsChargeTickSfx", "rooftopBucketsFireIgniteSfx",
  "rooftopBucketsGoldBallSfx", "rooftopBucketsHeatAdvanceSfx", "rooftopBucketsRimClankSfx",
  "rooftopBucketsSwishSfx"
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
  if (forbidden.test(sourceText)) throw new Error(`Rooftop Buckets source violates the root-safe asset boundary: ${forbidden}`);
}
if (!existsSync(join(appDir, "README.md"))) throw new Error("Rooftop Buckets README is missing");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
for (const id of modelIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release") throw new Error(`${id} is not a release-grade model`);
  const approvedProvenance = asset.provenance?.license === "CC0-1.0"
    ? ["Aura3D synthesis", "Kenney"].includes(asset.provenance?.author)
    : asset.provenance?.license?.startsWith("CC-BY-4.0")
      && ["Daniel Darko", "Daffa Haekal", "3DDomino"].some((author) => asset.provenance?.author?.startsWith(author));
  if (!approvedProvenance || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} durable model provenance is incomplete`);
  if (!asset.renderedProbe?.url || asset.renderedProbe.assetHash !== asset.hash || !existsSync(join(repoRoot, asset.renderedProbe.url))) throw new Error(`${id} rendered probe is missing or stale`);
  if (!sourceText.includes(`assets.${id}`)) throw new Error(`${id} is not referenced by the live route`);
}
for (const id of audioIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "audio" || asset.quality !== "candidate" || asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) throw new Error(`${id} typed audio provenance/quality is incomplete`);
  if (!sourceText.includes(`assets.${id}`)) throw new Error(`${id} is not referenced by the live audio controller`);
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
const visualReceipt = validateReceipt(join(reportDir, "browser-evidence.json"), "aura3d.rooftop-buckets.browser-evidence/1.0");
const playableReceipt = validateReceipt(join(reportDir, "playable/browser-evidence.json"), "aura3d.rooftop-buckets.playable-evidence/1.0");
for (const scenario of ["opening", "charge-arc", "release", "swish", "miss", "defender-contest", "fire", "buzzer", "gold-win", "mobile-opening", "mobile-touch-active", "reduced-motion-arc"]) {
  if (!visualReceipt.scenarios?.includes(scenario)) throw new Error(`visual receipt is missing ${scenario}`);
}
for (const scenario of ["keyboard-spot", "keyboard-aim", "keyboard-charge-release", "authored-flight-settle", "pause-freeze-resume", "full-reset", "open-clear", "three-unique-spots", "pressure-telegraph-offset", "pressure-clear", "fire-three-streak", "gold-miss", "gold-win", "buzzer", "touch-spot", "touch-aim", "touch-charge-release", "touch-pause-reset", "mobile-accessibility"]) {
  if (!playableReceipt.scenarios?.includes(scenario)) throw new Error(`playable receipt is missing ${scenario}`);
}

const visual = readJson(join(reportDir, "visual.json"));
if (visual.contest?.hoopMode !== "pressure" || visual.contest?.defenderTelegraph !== "contest" || Math.abs(visual.contest?.contestAimOffset ?? 0) <= 0) throw new Error("defender contest visual state is missing");
if (visual.fire?.onFire !== true || visual.fire?.fireAchieved !== true || visual.fire?.lastShotResult !== "swish") throw new Error("fire visual state is missing");
if (visual.buzzer?.state !== "game-over" || visual.buzzer?.lastShotResult !== "violation") throw new Error("buzzer failure visual state is missing");
if (visual.goldWin?.state !== "victory" || visual.goldWin?.goldMade !== true) throw new Error("gold victory visual state is missing");
if (visual.mobileActive?.ballInFlight !== true || visual.reduced?.reducedMotion !== true) throw new Error("mobile or reduced-mode visual state is missing");

const playable = readJson(join(reportDir, "playable/five-heats-touch.json"));
if (playable.open?.state !== "heat-cleared" || playable.spots?.madeSpotIds?.join(",") !== "1,2,3" || playable.pressureClear?.state !== "heat-cleared" || playable.fire?.state !== "heat-cleared" || playable.goldWin?.state !== "victory") throw new Error("complete five-heat browser arc is missing");
if (playable.goldMiss?.state !== "game-over" || playable.touchPaused?.state !== "paused" || playable.touchReset?.state !== "playing") throw new Error("gold failure or touch pause/reset proof is missing");
if (!Array.isArray(playable.touchTargets) || playable.touchTargets.length !== 7 || playable.touchTargets.some((target) => target.width < 44 || target.height < 44)) throw new Error("44px mobile touch target proof is missing");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d.rooftop-buckets.performance/1.0" || performance.pass !== true || performance.routeSourceSha256 !== routeSourceSha256 || performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer))) throw new Error("performance report is missing, failing, or stale");
const deploy = readJson(join(appDir, "deploy-report.json"));
if (deploy.schema !== "aura3d.rooftop-buckets.deploy/1.0" || deploy.pass !== true || deploy.checks?.strictModels?.ok !== true || deploy.checks?.strictModels?.assetCount !== modelIds.length || deploy.checks?.strictDistAndSource?.ok !== true || deploy.producerSourceSha256 !== sha256(join(repoRoot, deploy.producer))) throw new Error("strict deploy report is missing, failing, or stale");
if ([...(deploy.checks.strictModels.warnings ?? []), ...(deploy.checks.strictModels.failures ?? []), ...(deploy.checks.strictDistAndSource.warnings ?? []), ...(deploy.checks.strictDistAndSource.failures ?? [])].length > 0) throw new Error("strict deploy report contains warnings or failures");

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-rooftop-buckets");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Rooftop Buckets route gate is missing or over-promoted");
if (JSON.stringify(gate.primaryAssets) !== JSON.stringify(modelIds) || gate.routePrimaryHeroAsset !== "rooftopBackboard") throw new Error("Rooftop Buckets route-primary asset gate is stale");
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Rooftop Buckets primitive source budget exceeded");

const routePrimaryPath = join(repoRoot, "tests/reports/showcase-route-primary-probes/showcase-rooftop-buckets.json");
const routePrimary = readJson(routePrimaryPath);
if (routePrimary.routeId !== "showcase-rooftop-buckets" || routePrimary.pass !== true || (routePrimary.failures?.length ?? 0) > 0 || routePrimary.routePrimaryHeroAsset !== "rooftopBackboard") throw new Error("Rooftop Buckets route-primary probe is missing or failing");

const exactArtifacts = visualReceipt.artifacts.map((artifact) => ({ path: artifact.path, sha256: artifact.sha256 }));
const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-rooftop-buckets",
  route: "/apps/showcase-rooftop-buckets/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  routeSourceSha256,
  renderer: { path: "createGameApp root safe API", mode: "production with safe-basic fallback", nativeWebGPU: false, productionRuntimeClaimed: false },
  primaryAssets: modelIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  audioAssets: audioIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "subordinate skyline/court dressing, painted markings, stanchion/net, trajectory guides, and state feedback only", status: "no-primitive-primary-subjects" },
  gameplay: {
    heats: 5,
    heatModes: ["open", "spots", "pressure", "fire", "gold"],
    controls: ["spot", "aim arc", "charge/release", "pause", "full reset"],
    keyboardAndTouch: true,
    deterministicAuthoredFlight: true,
    sharedPreviewIntegrator: true,
    topToBottomRimSequence: true,
    physicsBodies: 0,
    defenderInfluence: "visible deterministic pre-launch aim offset",
    deterministicOutcomes: ["swish", "bank", "rim-in", "rim-out", "brick", "blocked", "clock violation", "heat clear", "gold fail", "gold victory"],
    reducedMotionPreservesAimAndOutcomeTruth: true
  },
  accessibility: { semanticMainAndHeading: true, namedCanvasRegion: true, namedTouchControls: 7, minimumTouchTargetPx: 44, sequentialFocusProven: true, liveHeatFireAndResultStatus: true, pass: true },
  performance,
  deploy,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: {
    status: "blocked-pending-human-review",
    label: "root-safe prototype",
    allowed: ["typed original court/target/ball/defender assets", "route-local deterministic authored basketball flight", "composed route-local rim/board/defender regions", "five route-local heat objectives", "bounded first-flight prediction"],
    notAllowed: ["reusable basketball or sports kit", "Rapier or rigid-body basketball simulation", "generic rim or collision system", "prediction after first contact", "production-runtime-only rendering claims", "public promotion before independent exact-artifact review"]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_ROOFTOP_BUCKETS__",
    detailedGlobal: "window.__ROOFTOP_BUCKETS_EVIDENCE__",
    sourceReview: "apps/showcase-rooftop-buckets/src/main.ts",
    exactArtifacts,
    browserReceipts: ["tests/reports/rooftop-buckets/browser-evidence.json", "tests/reports/rooftop-buckets/playable/browser-evidence.json"],
    assetProbes: modelIds.map((id) => ({ asset: id, metadata: `tests/reports/showcase-release-asset-probes/${id}.json`, screenshot: assetById.get(id).renderedProbe.url, assetHash: assetById.get(id).hash })),
    performance: "apps/showcase-rooftop-buckets/performance-report.json",
    deploy: "apps/showcase-rooftop-buckets/deploy-report.json",
    routePrimary: "tests/reports/showcase-route-primary-probes/showcase-rooftop-buckets.json",
    browserSpecs: ["tests/browser/rooftop-buckets-playable.spec.ts", "tests/browser/rooftop-buckets-shot-visual.spec.ts"],
    unitSpecs: ["tests/unit/apps/rooftop-buckets-heats.test.ts", "tests/unit/apps/rooftop-buckets-scoring.test.ts"],
    deployCommands: ["check-deploy --release --source apps/showcase-rooftop-buckets/src --asset <5 model assets>", "check-deploy --release --source apps/showcase-rooftop-buckets/src --no-assets"]
  }
};
writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({ machinePass: true, models: modelIds.length, audio: audioIds.length, exactArtifacts: exactArtifacts.length, primitiveOccurrences, performancePass: performance.pass }));
