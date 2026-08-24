import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = join(repoRoot, "tests/reports/showcase-courier-rush");
const modelAssetIds = ["courierVan", "courierParcel", "courierTrafficSedan", "courierTrafficHatch", "courierZoneAwning", "courierZoneBollard"];
const primaryAssetIds = ["courierVan", "courierParcel"];
const supportingAssetIds = modelAssetIds.filter((id) => !primaryAssetIds.includes(id));
const audioAssetIds = ["courierAmbientCitySfx", "courierDispatchBlipSfx", "courierEarlyBonusSfx", "courierEngineSfx", "courierHornNearSfx", "courierParcelDropSfx", "courierParcelPickupSfx", "courierShiftClearSfx", "courierShiftFailSfx", "courierStrikeHitSfx"];
const acceptanceFiles = ["load.png", "pickup-zone.png", "parcel-in-bed.png", "busy-intersection.png", "drop-flash.png", "traffic-strike-fail.png", "timer-fail-summary.png", "shift-clear.png", "mobile.png", "reduced-motion.png"];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceFiles = readdirSync(join(appDir, "src")).filter((file) => /\.(?:ts|css)$/.test(file)).sort();
const sourceHash = (() => {
  const hash = createHash("sha256");
  for (const file of sourceFiles) hash.update(file).update("\0").update(readFileSync(join(appDir, "src", file))).update("\0");
  return hash.digest("hex");
})();
const source = sourceFiles.map((file) => readFileSync(join(appDir, "src", file), "utf8")).join("\n");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map((manifest.assets ?? []).map((entry) => [entry.id, entry]));
for (const id of [...modelAssetIds, ...audioAssetIds]) {
  const asset = assetById.get(id);
  if (!asset?.hash || !asset?.url || !asset?.provenance?.license) throw new Error(`Missing current typed/provenanced asset ${id}`);
}
for (const id of modelAssetIds) {
  const asset = assetById.get(id);
  if (asset.quality !== "release" || !asset.renderedProbe?.sha256) throw new Error(`${id} lacks release-quality rendered-probe evidence`);
  if (!source.includes(`assets.${id}`)) throw new Error(`Live route does not use assets.${id}`);
}
for (const id of audioAssetIds) if (!source.includes(`"${id}"`)) throw new Error(`Live route does not reference typed audio ${id}`);

function validateBrowserEvidence(file, schema) {
  const report = readJson(join(reportDir, file));
  if (report.schema !== schema) throw new Error(`${file} schema is stale`);
  if (report.producerSourceSha256 !== sha256(join(repoRoot, report.producer))) throw new Error(`${file} producer hash is stale`);
  if (report.routeSourceSha256 !== sourceHash) throw new Error(`${file} route source hash is stale`);
  for (const artifact of report.artifacts ?? []) {
    if (!artifact.path || artifact.sha256 !== sha256(join(repoRoot, artifact.path))) throw new Error(`${file} artifact hash is stale`);
  }
  return report;
}

const fullShift = validateBrowserEvidence("full-shift-evidence.json", "aura3d-courier-rush-full-shift/1.0");
const failure = validateBrowserEvidence("failure-evidence.json", "aura3d-courier-rush-failure/1.0");
const mobile = validateBrowserEvidence("mobile-evidence.json", "aura3d-courier-rush-mobile/1.0");
const reduced = validateBrowserEvidence("reduced-motion-evidence.json", "aura3d-courier-rush-reduced-motion/1.0");
if (fullShift.final?.state !== "shiftClear" || fullShift.pickupEvents !== 5 || fullShift.dropEvents !== 5 || fullShift.allFiveDeliveriesInsideTimers !== true) throw new Error("Full-shift evidence does not prove five timely deliveries");
if (failure.trafficStrikeFailure?.state !== "shiftOver" || failure.trafficStrikeFailure?.strikes !== 3 || failure.timerFailure?.timerFailObserved !== true || failure.reset?.state !== "awaitingPickup") throw new Error("Failure evidence is incomplete");
if (mobile.touchPointerDriven !== true || mobile.driveChangedState !== true || Math.abs(mobile.vanSpeed ?? 0) <= 0.4) throw new Error("Mobile evidence is not touch-driven");
if (reduced.reducedMotion !== true || reduced.gameplayState !== "awaitingPickup") throw new Error("Reduced-motion evidence is incomplete");

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d-courier-rush-performance/1.0" || performance.pass !== true) throw new Error("Courier performance report is missing or failing");
const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes?.find((entry) => entry.id === "showcase-courier-rush");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Courier route gate is missing or over-promoted");
const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Courier primitive source budget exceeded");

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-courier-rush",
  route: "/apps/showcase-courier-rush/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  renderer: { path: "createAuraApp root safe API", mode: "safe-basic", nativeWebGPU: false, productionRuntime: false },
  primaryAssets: primaryAssetIds.map((id) => ({
    typedRef: `assets.${id}`,
    role: id === "courierVan" ? "primary-vehicle" : id === "courierParcel" ? "visible-cargo" : id.includes("Traffic") ? "authored-lane-loop-traffic" : "zone-landmark-prop",
    status: "release-validated-typed-asset",
    quality: assetById.get(id).quality,
    hash: assetById.get(id).hash,
    license: assetById.get(id).provenance.license,
    author: assetById.get(id).provenance.author,
    renderedProbeSha256: assetById.get(id).renderedProbe.sha256
  })),
  supportingAssets: supportingAssetIds.map((id) => ({
    typedRef: `assets.${id}`,
    role: id.includes("Traffic") ? "authored-lane-loop-traffic" : "zone-landmark-prop",
    status: "release-validated-typed-supporting-asset",
    quality: assetById.get(id).quality,
    hash: assetById.get(id).hash,
    license: assetById.get(id).provenance.license,
    author: assetById.get(id).provenance.author,
    renderedProbeSha256: assetById.get(id).renderedProbe.sha256
  })),
  audioAssets: audioAssetIds.map((id) => ({ typedRef: `assets.${id}`, quality: assetById.get(id).quality, hash: assetById.get(id).hash, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "street/zone guides, light pools, feedback, and non-subject set dressing", status: "within-stated-role-and-budget" },
  gameplay: {
    deliveries: 5,
    arc: ["nearby-zone-teach", "cross-traffic", "two-route-choice", "fragile-express-pressure", "combined-final-run"],
    traffic: "eight seeded cars on two authored lane loops with courtesy windows; no navmesh or free-roam claim",
    sensors: "route-local pickup/drop containment transitions scene-visible typed parcel state exactly once",
    failures: "three pinned collision strikes or one expired dispatch timer ends the shift",
    fullShiftEvidence: "tests/reports/showcase-courier-rush/full-shift-evidence.json"
  },
  performance,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: {
    status: "blocked-pending-human-review",
    label: "prototype",
    allowed: ["five-delivery route-local arcade courier prototype", "seeded authored lane-loop traffic with courtesy windows", "typed van, parcel, traffic, landmarks, and ten state-driven audio cues", "root-safe pickup/drop scene state and deterministic scoring/failure rules"],
    notAllowed: ["physical suspension, tyre, damage, or open-world navigation claims", "production renderer, HDR/IBL, WebGPU, or postprocess claims", "public promotion before independent exact-artifact review"]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_COURIER_RUSH__",
    sourceReview: "apps/showcase-courier-rush/src/main.ts",
    detailedGameplayGlobal: "window.__COURIER_RUSH_EVIDENCE__",
    fullShift: "tests/reports/showcase-courier-rush/full-shift-evidence.json",
    failure: "tests/reports/showcase-courier-rush/failure-evidence.json",
    mobile: "tests/reports/showcase-courier-rush/mobile-evidence.json",
    reducedMotion: "tests/reports/showcase-courier-rush/reduced-motion-evidence.json",
    acceptanceArtifacts: acceptanceFiles.map((file) => ({
      path: `tests/reports/showcase-courier-rush/${file}`,
      sha256: sha256(join(reportDir, file))
    })),
    performance: "apps/showcase-courier-rush/performance-report.json",
    browserSpecs: ["tests/browser/courier-rush-playable.spec.ts", "tests/browser/courier-rush-scene.spec.ts"],
    unitSpecs: ["tests/unit/apps/courier-rush-dispatch.test.ts", "tests/unit/apps/courier-rush-traffic.test.ts"],
    deployCommand: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-courier-rush/dist --release --source apps/showcase-courier-rush/src --asset courierVan --asset courierParcel --asset courierTrafficSedan --asset courierTrafficHatch --asset courierZoneAwning --asset courierZoneBollard"
  }
};

writeFileSync(join(appDir, "route-health.json"), JSON.stringify(routeHealth, null, 2) + "\n");
console.log(JSON.stringify({ machinePass: true, primitiveOccurrences, performancePass: performance.pass }));
