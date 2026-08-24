import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const modelAssetIds = ["gravityPostMailPod", "gravityPostDockBeacon"];
const audioAssetIds = [
  "gravityPostLaunchWhooshSfx", "gravityPostBurnLoopSfx", "gravityPostDockLockSfx",
  "gravityPostBounceOffSfx", "gravityPostPodLostSfx", "gravityPostContractClearSfx",
  "gravityPostAssistChimeSfx", "gravityPostWarpHumSfx", "gravityPostUiConfirmSfx",
  "gravityPostAmbientSpaceSfx"
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const walk = (path) => readdirSync(path).sort().flatMap((entry) => {
  const child = join(path, entry);
  return statSync(child).isDirectory() ? walk(child) : [child];
});
const sourceFiles = walk(join(appDir, "src")).filter((path) => /\.(?:ts|css)$/.test(path));
const sourceHash = (() => {
  const hash = createHash("sha256");
  for (const path of sourceFiles) hash.update(relative(join(appDir, "src"), path)).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
})();
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map((manifest.assets ?? []).map((entry) => [entry.id, entry]));
for (const id of [...modelAssetIds, ...audioAssetIds]) {
  const asset = assetById.get(id);
  if (!asset?.hash || !asset?.url || !asset?.provenance?.license) throw new Error(`Missing current typed/provenanced asset ${id}`);
}
for (const id of modelAssetIds) {
  const asset = assetById.get(id);
  if (asset.quality !== "release") throw new Error(`${id} is not release-quality in the generated manifest`);
  if (!source.includes(`assets.${id}`)) throw new Error(`Live route does not use assets.${id}`);
}
for (const id of audioAssetIds) if (!source.includes(`"${id}"`)) throw new Error(`Live route does not reference typed audio ${id}`);

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d-gravity-post-performance/1.0" || performance.pass !== true || performance.routes?.length !== 4) {
  throw new Error("Gravity Post performance report is missing or failing");
}

const routeGates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const routeGate = routeGates.routes?.find((entry) => entry.id === "showcase-gravity-post");
if (!routeGate || routeGate.releaseClass !== "prototype-blocked" || routeGate.published !== true) {
  throw new Error("Gravity Post route gate is missing its published prototype-blocked registration");
}

function validateBrowserEvidence(file, schema) {
  const path = join(repoRoot, "tests/reports/gravity-post", file);
  const report = readJson(path);
  if (report.schema !== schema) throw new Error(`${file} schema is stale`);
  const producer = join(repoRoot, report.producer);
  if (report.producerSourceSha256 !== sha256(producer)) throw new Error(`${file} producer hash is stale`);
  if (report.routeSourceSha256 !== sourceHash) throw new Error(`${file} route source hash is stale`);
  const artifacts = report.artifacts ?? [report.artifact];
  for (const artifact of artifacts) {
    if (!artifact?.path || artifact.sha256 !== sha256(join(repoRoot, artifact.path))) throw new Error(`${file} artifact hash is stale`);
  }
  return report;
}

const campaign = validateBrowserEvidence("full-campaign-evidence.json", "aura3d-gravity-post-full-campaign/1.0");
const mobile = validateBrowserEvidence("mobile-evidence.json", "aura3d-gravity-post-mobile/1.0");
const reduced = validateBrowserEvidence("reduced-motion-evidence.json", "aura3d-gravity-post-reduced-motion/1.0");
const failure = validateBrowserEvidence("failure-evidence.json", "aura3d-gravity-post-failure/1.0");
if (campaign.final?.campaignComplete !== true || campaign.final?.completedContracts !== 4 || campaign.final?.failedContracts !== 0) {
  throw new Error("Full-campaign browser evidence does not prove four clean deliveries");
}
if (mobile.delivered?.completedContracts !== 1 || mobile.touchPointerDriven !== true) throw new Error("Mobile evidence is not a real touch delivery");
if (reduced.planning?.reducedMotion !== true || reduced.planning?.predictionSteps <= 0) throw new Error("Reduced-motion evidence lost planning truth");
if (failure.actualPlanetStrikeDriven !== true || failure.shifted?.failedContracts !== 3 || failure.shifted?.shiftOver !== true) {
  throw new Error("Failure evidence does not prove three actual collision-owned hull losses");
}

const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > routeGate.primitiveBudget) throw new Error("Gravity Post primitive source budget exceeded");

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-gravity-post",
  route: "/apps/showcase-gravity-post/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  renderer: {
    path: "createAuraApp root safe API",
    mode: "safe-basic",
    nativeWebGPU: false,
    productionRuntime: false
  },
  primaryAssets: modelAssetIds.map((id) => ({
    typedRef: `assets.${id}`,
    role: id === "gravityPostMailPod" ? "primary-vehicle" : "dock-landmark-prop",
    status: "release-validated-typed-primary-asset",
    quality: assetById.get(id).quality,
    hash: assetById.get(id).hash,
    license: assetById.get(id).provenance.license,
    author: assetById.get(id).provenance.author
  })),
  audioAssets: audioAssetIds.map((id) => ({
    typedRef: `assets.${id}`,
    quality: assetById.get(id).quality,
    hash: assetById.get(id).hash,
    license: assetById.get(id).provenance.license,
    author: assetById.get(id).provenance.author
  })),
  primitiveStatus: {
    sourceOccurrences: primitiveOccurrences,
    primitiveBudget: routeGate.primitiveBudget,
    role: "authored planets, well/capture guides, prediction beads, dock sparks, and flyby presentation around typed pod/beacons",
    status: "within-stated-role-and-budget"
  },
  physics: {
    sensors: "six static dock sensors; capture truth originates from app.physics.onTriggerEnter",
    pod: "kinematic physics mirror of the route-local fixed-step authored integrator",
    claim: "sensor ownership only; authored arcade gravity is explicitly non-physical"
  },
  gameplay: {
    deliveries: 4,
    arc: ["direct", "single-assist", "chained-assist", "hazard-avoidance"],
    correction: "zero tokens on the teaching route, exactly one bounded prograde/retrograde token on routes 2-4",
    timeout: "per-contract real-time limit consumes one of three hulls",
    predictionTolerance: 0.02,
    campaignEvidence: "tests/reports/gravity-post/full-campaign-evidence.json"
  },
  performance,
  routeGate: {
    config: "tools/showcase-library/route-gates.json",
    releaseClass: routeGate.releaseClass,
    published: routeGate.published,
    publicTemplateReady: routeGate.gameTemplateStatus.publicTemplateReady,
    pass: true
  },
  claimStatus: {
    status: "blocked-pending-human-review",
    label: "prototype",
    allowed: [
      "four-delivery authored arcade-gravity courier prototype",
      "fixed-step live/prediction integration with published 0.02 positional tolerance",
      "real root-safe dock sensor entry with route-local capture-speed evaluation",
      "typed registered pod, beacon, and ten deterministic synthesized audio cues"
    ],
    notAllowed: [
      "orbital mechanics, n-body, or physical simulation claims",
      "production renderer, HDR/IBL, WebGPU, or physics-parity claims",
      "public promotion before independent exact-artifact review"
    ]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_GRAVITY_POST__",
    sourceReview: "apps/showcase-gravity-post/src/main.ts",
    detailedGameplayGlobal: "window.__GRAVITY_POST_EVIDENCE__",
    campaign: "tests/reports/gravity-post/full-campaign-evidence.json",
    mobile: "tests/reports/gravity-post/mobile-evidence.json",
    reducedMotion: "tests/reports/gravity-post/reduced-motion-evidence.json",
    collisionFailure: "tests/reports/gravity-post/failure-evidence.json",
    performance: "apps/showcase-gravity-post/performance-report.json",
    unitSpecs: [
      "tests/unit/apps/gravity-post-wells.test.ts",
      "tests/unit/apps/gravity-post-scoring.test.ts",
      "tests/unit/apps/gravity-post-flyby.test.ts"
    ],
    browserSpecs: [
      "tests/browser/gravity-post-playable.spec.ts",
      "tests/browser/gravity-post-scene.spec.ts"
    ],
    deployCommand: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-gravity-post/dist --release --source apps/showcase-gravity-post/src --asset gravityPostMailPod --asset gravityPostDockBeacon"
  }
};

writeFileSync(join(appDir, "route-health.json"), JSON.stringify(routeHealth, null, 2) + "\n");
console.log("Wrote apps/showcase-gravity-post/route-health.json");
console.log(JSON.stringify({ machinePass: true, primitiveOccurrences, performancePass: performance.pass }));
