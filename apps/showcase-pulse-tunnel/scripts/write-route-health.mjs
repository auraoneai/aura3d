import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = join(repoRoot, "tests/reports/pulse-tunnel");
const audioAssetIds = [
  "pulseDrumsStem", "pulseBassStem", "pulseLeadStem", "pulseAirStem",
  "pulseLaneSwitchSfx", "pulseJumpSfx", "pulseSlideSfx", "pulseGrazeSfx",
  "pulseShieldHitSfx", "pulseShieldBreakSfx", "pulseSectionRiseSfx",
  "pulseRunOverSfx", "pulseUiConfirmSfx"
];
const visualAssetId = "pulseRunnerCraft";
const terminalAssetId = "pulseTerminalSentry";
const worldAssetId = "pulseReactorEncounterWorld";
const acceptanceFiles = [
  "playable-load.png", "playable-lane-switch.png", "playable-jump.png",
  "playable-graze.png", "playable-drop-section.png", "playable-shield-break.png",
  "playable-finale.png", "playable-summary.png", "playable-finished.png", "mobile.png"
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceFiles = readdirSync(join(appDir, "src")).filter((file) => /\.(?:ts|css)$/.test(file)).sort();
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const file of sourceFiles) hash.update(file).update("\0").update(readFileSync(join(appDir, "src", file))).update("\0");
  return hash.digest("hex");
})();
const source = sourceFiles.map((file) => readFileSync(join(appDir, "src", file), "utf8")).join("\n");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map((manifest.assets ?? []).map((entry) => [entry.id, entry]));
for (const id of audioAssetIds) {
  const asset = assetById.get(id);
  if (asset?.type !== "audio" || !asset.hash || !asset.url || asset.quality !== "candidate") throw new Error(`${id} is not a current candidate-quality typed audio asset`);
  if (asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.sourcePage) throw new Error(`${id} lacks complete CC0 synthesis provenance`);
  if (!source.includes(`assets.${id}`) && !source.includes(`"assets.${id}"`)) throw new Error(`Live route does not reference assets.${id}`);
}
const visualAsset = assetById.get(visualAssetId);
if (visualAsset?.type !== "model" || visualAsset.quality !== "release" || visualAsset.role !== "vehicle") throw new Error(`${visualAssetId} is not a release-quality typed vehicle`);
if (!visualAsset.hash || !visualAsset.url || !visualAsset.provenance?.sourcePage || !visualAsset.provenance?.license || !visualAsset.renderedProbe?.sha256) throw new Error(`${visualAssetId} lacks release provenance or rendered-probe evidence`);
if (!source.includes(`assets.${visualAssetId}`)) throw new Error(`Live route does not reference assets.${visualAssetId}`);
const terminalAsset = assetById.get(terminalAssetId);
if (terminalAsset?.type !== "model" || terminalAsset.quality !== "release" || terminalAsset.role !== "character") throw new Error(`${terminalAssetId} is not a release-quality typed terminal character`);
if (!terminalAsset.hash || !terminalAsset.url || !terminalAsset.provenance?.sourcePage || !terminalAsset.provenance?.license || !terminalAsset.renderedProbe?.sha256) throw new Error(`${terminalAssetId} lacks release provenance or rendered-probe evidence`);
if (!source.includes(`assets.${terminalAssetId}`)) throw new Error(`Live route does not reference assets.${terminalAssetId}`);
const worldAsset = assetById.get(worldAssetId);
if (worldAsset?.type !== "model" || worldAsset.quality !== "release" || worldAsset.role !== "world") throw new Error(`${worldAssetId} is not a release-quality typed arena world`);
if (!worldAsset.hash || !worldAsset.url || !worldAsset.provenance?.sourcePage || !worldAsset.provenance?.license || !worldAsset.renderedProbe?.sha256) throw new Error(`${worldAssetId} lacks release provenance or rendered-probe evidence`);
if (!source.includes(`assets.${worldAssetId}`)) throw new Error(`Live route does not reference assets.${worldAssetId}`);

function validateBrowserEvidence(file, schema) {
  const report = readJson(join(reportDir, file));
  if (report.schema !== schema) throw new Error(`${file} schema is stale`);
  if (report.producerSourceSha256 !== sha256(join(repoRoot, report.producer))) throw new Error(`${file} producer hash is stale`);
  if (report.routeSourceSha256 !== routeSourceSha256) throw new Error(`${file} route source hash is stale`);
  for (const artifact of report.artifacts ?? []) {
    if (!artifact.path || artifact.sha256 !== sha256(join(repoRoot, artifact.path))) throw new Error(`${file} artifact hash is stale`);
  }
  return report;
}

const playable = validateBrowserEvidence("playable-evidence.json", "aura3d-pulse-tunnel-playable/1.0");
const mobile = validateBrowserEvidence("mobile-evidence.json", "aura3d-pulse-tunnel-mobile/1.0");
const completion = validateBrowserEvidence("completion-evidence.json", "aura3d-pulse-tunnel-completion/1.0");
const sync = validateBrowserEvidence("sync-report.json", "pulse-tunnel-sync-report/1.0");
if (playable.failure?.reason !== "shields-exhausted" || playable.failure?.collisions !== 3 || playable.restart?.state !== "running" || playable.restart?.shields !== 3) throw new Error("Playable failure/restart evidence is incomplete");
if (playable.captures?.graze !== true || playable.captures?.drop !== true || playable.captures?.shieldBreak !== true || playable.pause?.frozenDistance !== playable.pause?.stillFrozenDistance) throw new Error("Playable mechanic/paused-clock evidence is incomplete");
if (mobile.touchPointerDriven !== true || mobile.viewport?.width !== 390 || mobile.lane?.targetLane !== 2 || mobile.jump?.airborne !== true) throw new Error("Mobile touch evidence is incomplete");
if (completion.summary?.state !== "summary" || completion.summary?.status !== "completed" || completion.summary?.runSeconds < 90 || completion.summary?.reducedMotion !== true || !completion.summary?.sectionsVisited?.includes("finale")) throw new Error("Full-run/reduced-motion evidence is incomplete");
const syncDecisions = new Set(["GO", "GO-WITH-FRAME-SLACK", "NO-GO-BROWSER-PROFILE", "NO-GO-ENVIRONMENT"]);
if (!syncDecisions.has(sync.decision) || sync.toleranceMs !== 80) throw new Error("Sync decision/tolerance is missing or invalid");
if (sync.decision === "NO-GO-BROWSER-PROFILE" && (sync.naturalFlip !== true || sync.fallbackFlip?.proven !== true || sync.fallbackFlip?.reason !== "drift-tolerance-exceeded" || sync.fallbackFlip?.gameplayContinued !== true)) throw new Error("Measured browser-profile fallback is not proven");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d-pulse-tunnel-performance/1.0" || performance.pass !== true) throw new Error("Pulse Tunnel performance report is missing or failing");
if (performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer)) || performance.routeSourceSha256 !== routeSourceSha256) throw new Error("Pulse Tunnel performance report is stale");
const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes?.find((entry) => entry.id === "showcase-pulse-tunnel");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== false || gate.requiresRoutePrimaryProbe !== false || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Pulse Tunnel route gate is missing or over-promoted");
const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Pulse Tunnel primitive source budget exceeded");

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-pulse-tunnel",
  route: "/apps/showcase-pulse-tunnel/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  renderer: { path: "createAuraApp root safe API", mode: "safe-basic", nativeWebGPU: false, productionRuntimeClaimed: false },
  visualSubject: {
    kind: "typed spacecraft in an abstract rhythm arena",
    typedVisualPrimaryClaimed: true,
    statement: "The original release-probed Pulse runner craft, rigid terminal sentry, and continuous reactor encounter world form one non-colliding finale kit; route-local lanes, gates, projectiles, scoring, failure, and reset remain authoritative.",
    primaryAsset: {
      typedRef: `assets.${visualAssetId}`,
      hash: visualAsset.hash,
      quality: visualAsset.quality,
      role: visualAsset.role,
      license: visualAsset.provenance.license,
      sourcePage: visualAsset.provenance.sourcePage,
      renderedProbe: visualAsset.renderedProbe
    },
    terminalSentry: {
      typedRef: `assets.${terminalAssetId}`,
      hash: terminalAsset.hash,
      quality: terminalAsset.quality,
      role: terminalAsset.role,
      license: terminalAsset.provenance.license,
      sourcePage: terminalAsset.provenance.sourcePage,
      renderedProbe: terminalAsset.renderedProbe,
      gameplayAuthority: "none; non-colliding renderer-owned finale endpoint"
    },
    encounterWorld: {
      typedRef: `assets.${worldAssetId}`,
      hash: worldAsset.hash,
      quality: worldAsset.quality,
      role: worldAsset.role,
      license: worldAsset.provenance.license,
      sourcePage: worldAsset.provenance.sourcePage,
      renderedProbe: worldAsset.renderedProbe,
      gameplayAuthority: "none; finale-state-bound non-colliding architectural enclosure"
    }
  },
  audioAssets: audioAssetIds.map((id) => ({ typedRef: `assets.${id}`, quality: assetById.get(id).quality, hash: assetById.get(id).hash, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "abstract tunnel structure, obstacles, arena dressing, telegraph, and state-driven feedback around the typed player craft", status: "within-set-dressing-and-abstract-role-budget" },
  clockContract: { decision: sync.decision, toleranceMs: sync.toleranceMs, naturalFlip: sync.naturalFlip, fallbackFlip: sync.fallbackFlip, measuredDriftSamples: sync.driftSamples, browser: sync.userAgent, claim: "Beat mode is conditional on measured tolerance; this measured profile runs the authored chart in deterministic pattern mode after the proven fallback." },
  gameplay: { runLengthSeconds: 90, sections: ["intro", "build", "drop", "finale"], actions: ["lane-left", "lane-right", "jump", "slide"], mechanics: ["telegraph", "avoid", "collision", "graze", "style", "three-shield-failure", "pause", "restart", "completion"], keyboardAndTouch: true, reducedMotionPreservesTimingAndCollision: true },
  performance,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: { status: "blocked-pending-human-review", label: "root-safe prototype", allowed: ["release-validated typed spacecraft player", "90-second authored obstacle chart", "four typed stems and nine typed state-driven cues", "measured clock tolerance with deterministic pattern fallback", "root-safe abstract tunnel gameplay"], notAllowed: ["perfect or universal beat accuracy", "physical spacecraft simulation", "production renderer, HDR/IBL, native WebGPU, or postprocess parity", "public promotion before independent exact-artifact review"] },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_PULSE_TUNNEL__",
    sourceReview: "apps/showcase-pulse-tunnel/src/main.ts",
    detailedGameplayGlobal: "window.__PULSE_TUNNEL_EVIDENCE__",
    playable: "tests/reports/pulse-tunnel/playable-evidence.json",
    mobile: "tests/reports/pulse-tunnel/mobile-evidence.json",
    completion: "tests/reports/pulse-tunnel/completion-evidence.json",
    sync: "tests/reports/pulse-tunnel/sync-report.json",
    acceptanceArtifacts: acceptanceFiles.map((file) => ({ path: `tests/reports/pulse-tunnel/${file}`, sha256: sha256(join(reportDir, file)) })),
    performance: "apps/showcase-pulse-tunnel/performance-report.json",
    browserSpecs: ["tests/browser/pulse-tunnel-playable.spec.ts", "tests/browser/pulse-tunnel-sync.spec.ts"],
    unitSpecs: ["tests/unit/apps/pulse-tunnel-clock.test.ts"],
    deployCommand: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-pulse-tunnel/dist --release --source apps/showcase-pulse-tunnel/src --asset pulseRunnerCraft --asset pulseTerminalSentry --asset pulseReactorEncounterWorld",
    deployAssetBoundary: "The strict deploy check validates the three original release-quality Pulse model assets. All 13 live typed audio references remain independently hash/provenance/quality-validated by this generator because the model-oriented deploy validator is scoped to the visual encounter kit."
  }
};

writeFileSync(join(appDir, "route-health.json"), JSON.stringify(routeHealth, null, 2) + "\n");
console.log(JSON.stringify({ machinePass: true, primitiveOccurrences, audioAssets: audioAssetIds.length, syncDecision: sync.decision, performancePass: performance.pass }));
