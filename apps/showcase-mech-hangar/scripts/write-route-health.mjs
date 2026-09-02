import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const reportDir = join(repoRoot, "tests/reports/mech-hangar");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const assetIds = [
  "mechChassisA", "mechChassisB", "mechChassisC", "mechChassisD",
  "mechArmsA", "mechArmsB", "mechArmsC", "mechArmsD",
  "mechLegsA", "mechLegsB", "mechLegsC", "mechLegsD",
  "mechWeaponA", "mechWeaponB", "mechWeaponC", "mechWeaponD"
];
const initialPrimaryAssets = ["robotcand", "mechChassisA", "mechArmsA", "mechLegsA", "mechWeaponA"];
const visualPrimaryAssetIds = ["robotcand"];
const audioIds = [
  "mechServoCycleSfx", "mechLockInSfx", "mechWalkHeavySfx", "mechLightHitSfx", "mechHeavyHitSfx",
  "mechGuardBlockSfx", "mechGuardBreakSfx", "mechSpecialFireSfx", "mechKoStingSfx", "mechAmbientHangarSfx"
];
const artifactFiles = [
  "hangar-default.png", "hangar-swap.png", "hangar-build.png", "hangar-stat-panel.png", "part-swap-chassis.png", "part-swap-arms.png",
  "part-swap-legs.png", "part-swap-weapon.png", "hangar-arena-opening.png", "arena-opening.png", "arena-hit.png", "arena-paused.png",
  "ko-card.png", "hangar-mobile.png", "arena-mobile.png", "arena-reduced-motion.png", "part-matrix.json"
];
const browserReceipts = ["build-core-evidence.json", "arena-evidence.json", "mobile-evidence.json", "reduced-motion-evidence.json"];

function filesRecursively(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesRecursively(path) : [path];
  });
}
const routeSourceFiles = filesRecursively(join(appDir, "src")).filter((path) => /\.(?:ts|css)$/.test(path));
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const path of routeSourceFiles) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return hash.digest("hex");
})();
const sourceText = routeSourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
for (const id of assetIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release" || asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis") throw new Error(`${id} is not a release-grade original CC0 model`);
  if (!asset.renderedProbe?.url || asset.renderedProbe.assetHash !== asset.hash || !existsSync(join(repoRoot, asset.renderedProbe.url))) throw new Error(`${id} rendered probe is missing or stale`);
  if (!sourceText.includes(`assets.${id}`) && !sourceText.includes(`record.name`)) throw new Error(`${id} is not reachable through the live typed catalog`);
}
for (const id of visualPrimaryAssetIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "model" || asset.quality !== "release" || !asset.renderedProbe?.url || asset.renderedProbe.assetHash !== asset.hash || !existsSync(join(repoRoot, asset.renderedProbe.url))) throw new Error(`${id} visual primary asset is missing, not release-probed, or stale`);
  if (!sourceText.includes(`assets.${id}`)) throw new Error(`${id} is not reachable through the live typed catalog`);
}
for (const id of audioIds) {
  const asset = assetById.get(id);
  if (!asset || asset.type !== "audio" || asset.quality !== "candidate" || asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis" || !asset.provenance?.downloadUrl) throw new Error(`${id} audio provenance/quality is incomplete`);
  if (!sourceText.includes(`"${id}"`)) throw new Error(`${id} is not referenced by the live audio manifest`);
}

const curation = readJson(join(appDir, "parts-curation-report.json"));
if (curation.schema !== "aura3d.mech-hangar.part-curation/2.0" || curation.gate?.verdict !== "GO" || curation.gate?.compatibilityAccepted !== 16 || curation.gate?.releaseAccepted !== 16 || curation.gate?.uniqueGeometryHashes !== 16) throw new Error("MH-2M curation gate is incomplete");
const currentCurationHashes = new Set(curation.parts.map((part) => part.hash));
if (currentCurationHashes.size !== 16 || assetIds.some((id) => !currentCurationHashes.has(assetById.get(id).hash))) throw new Error("Curation report hashes do not match the root manifest");

for (const file of artifactFiles) if (!existsSync(join(reportDir, file))) throw new Error(`required exact artifact missing: ${file}`);
for (const file of browserReceipts) {
  const receipt = readJson(join(reportDir, file));
  if (receipt.schema !== "aura3d.mech-hangar.browser-evidence/1.0" || receipt.pass !== true) throw new Error(`${file} is missing or failing`);
  if (receipt.producerSourceSha256 !== sha256(join(repoRoot, receipt.producer))) throw new Error(`${file} producer binding is stale`);
  if (receipt.routeSourceSha256 !== routeSourceSha256) throw new Error(`${file} route-source binding is stale`);
  for (const retained of receipt.artifacts ?? []) if (retained.sha256 !== sha256(join(repoRoot, retained.path))) throw new Error(`${file} artifact hash is stale: ${retained.path}`);
}
const buildReceipt = readJson(join(reportDir, "build-core-evidence.json"));
const buildDetails = buildReceipt.details ?? {};
const visualBindings = buildDetails.visualPrimaryAssetBindings ?? [];
if (visualBindings.length !== visualPrimaryAssetIds.length || visualPrimaryAssetIds.some((id) => {
  const binding = visualBindings.find((entry) => entry.id === id);
  return !binding || binding.hash !== assetById.get(id).hash || binding.renderedProbe !== assetById.get(id).renderedProbe.url;
})) throw new Error("default hangar receipt is not bound to the current visual primary asset hash/probe");
const visualChecks = buildDetails.visualChecks ?? {};
if (visualChecks.defaultAndSwapDiffer !== true || visualChecks.defaultArtifact !== "tests/reports/mech-hangar/hangar-default.png" || visualChecks.swapArtifact !== "tests/reports/mech-hangar/hangar-swap.png") throw new Error("default hangar receipt does not prove a distinct valid swap artifact");
for (const [label, composition] of [["default", visualChecks.defaultComposition], ["swap", visualChecks.swapComposition]]) {
  if (!composition || composition.clipped !== false || composition.foregroundCoverageRatio <= 0.22 || composition.distinctBuckets <= 70) throw new Error(`${label} hangar visual assembly checks are missing or below the authored subject/material bar`);
}
const matrix = readJson(join(reportDir, "part-matrix.json"));
if (matrix.schema !== "aura3d.mech-hangar.part-matrix/1.0" || matrix.pass !== true || matrix.matrixSize !== 16 || matrix.entries?.length !== 16) throw new Error("16-selection browser matrix is missing or failing");
if (matrix.producerSourceSha256 !== sha256(join(repoRoot, matrix.producer))) throw new Error("part-matrix producer binding is stale");
if (matrix.routeSourceSha256 !== routeSourceSha256) throw new Error("part-matrix route source binding is stale");
for (const slot of ["chassis", "arms", "legs", "weapon"]) {
  const rows = matrix.entries.filter((entry) => entry.slot === slot);
  if (rows.length !== 4 || new Set(rows.map((entry) => entry.partId)).size !== 4 || new Set(rows.map((entry) => entry.pixelSha256)).size !== 4 || new Set(rows.map((entry) => entry.statValue)).size !== 4 || rows.some((entry) => entry.assemblyValidated !== true)) throw new Error(`${slot} matrix does not prove four distinct valid rendered/stat selections`);
}

const performance = readJson(join(appDir, "performance-report.json"));
if (performance.schema !== "aura3d-mech-hangar-performance/1.0" || performance.pass !== true) throw new Error("performance report is missing or failing");
if (performance.producerSourceSha256 !== sha256(join(repoRoot, performance.producer))) throw new Error("performance producer binding is stale");
const performanceHash = createHash("sha256");
for (const full of performance.routeSourceFiles) {
  const short = full.replace("apps/showcase-mech-hangar/", "");
  performanceHash.update(short).update("\0").update(readFileSync(join(repoRoot, full))).update("\0");
}
if (performance.routeSourceSha256 !== performanceHash.digest("hex")) throw new Error("performance route-source binding is stale");

const deploy = readJson(join(appDir, "deploy-report.json"));
if (deploy.schema !== "aura3d.mech-hangar.deploy/1.0" || deploy.pass !== true || deploy.checks?.strictModels?.ok !== true || deploy.checks?.strictModels?.assetCount !== 16 || deploy.checks?.strictDistAndSource?.ok !== true) throw new Error("strict deploy report is missing or failing");
if (deploy.producerSourceSha256 !== sha256(join(repoRoot, deploy.producer))) throw new Error("deploy producer binding is stale");
if ((deploy.checks.strictModels.warnings?.length ?? 0) > 0 || (deploy.checks.strictModels.failures?.length ?? 0) > 0 || (deploy.checks.strictDistAndSource.warnings?.length ?? 0) > 0 || (deploy.checks.strictDistAndSource.failures?.length ?? 0) > 0) throw new Error("strict deploy report contains warnings or failures");
const deployedModelIds = new Set(deploy.checks.strictModels.assets.map((asset) => asset.id));
if (assetIds.some((id) => !deployedModelIds.has(id))) throw new Error("strict deploy report does not contain all sixteen MH-2M models");

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-mech-hangar");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) throw new Error("Mech Hangar route gate is missing or over-promoted");
if (JSON.stringify(gate.primaryAssets) !== JSON.stringify(initialPrimaryAssets)) throw new Error("Mech Hangar initial primary assembly gate is stale");
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) throw new Error("Mech Hangar primitive source budget exceeded");

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-mech-hangar",
  route: "/apps/showcase-mech-hangar/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  routeSourceSha256,
  renderer: { path: "createAuraApp root safe API", mode: "production with safe-basic fallback", nativeWebGPU: false, productionRuntimeClaimed: false },
  primaryAssets: initialPrimaryAssets.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role })),
  visualPrimaryAssets: visualPrimaryAssetIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, role: assetById.get(id).role, renderedProbe: assetById.get(id).renderedProbe.url })),
  partFamily: {
    id: "MH-2M", required: 16, compatible: 16, releaseProven: 16, uniqueGeometryHashes: 16,
    source: "apps/showcase-mech-hangar/scripts/build-models.mjs", curation: "apps/showcase-mech-hangar/parts-curation-report.json",
    contract: "metre-scale centered origins with root/chest/hips/right-hand sockets; +Z forward and +Y up"
  },
  audioAssets: audioIds.map((id) => ({ typedRef: `assets.${id}`, hash: assetById.get(id).hash, quality: assetById.get(id).quality, license: assetById.get(id).provenance.license, author: assetById.get(id).provenance.author })),
  primitiveStatus: { sourceOccurrences: primitiveOccurrences, primitiveBudget: gate.primitiveBudget, role: "hangar/pit set dressing, invisible camera anchor, and renderer-owned hit/dust feedback only", status: "no-primitive-primary-subjects" },
  gameplay: { modes: ["hangar", "arena"], slots: ["chassis", "arms", "legs", "weapon"], choicesPerSlot: 4, selectionMatrixProven: 16, controls: ["move", "jump-thrust", "light", "heavy", "special", "guard", "pause", "rematch", "back-to-hangar"], keyboardAndTouch: true, invalidPlanRejection: true, deterministicAggressionPresets: ["keep-away", "balanced", "rushdown"], reducedMotionGatesCameraFeedback: true },
  performance,
  deploy,
  routeGate: { config: "tools/showcase-library/route-gates.json", releaseClass: gate.releaseClass, published: gate.published, publicTemplateReady: false, pass: true },
  claimStatus: {
    status: "blocked-pending-human-review", label: "root-safe prototype",
    allowed: ["typed original modular part assembly", "validated characterAssembly plans", "route-local deterministic mech combat", "seeded createCombatAi aggression roles"],
    notAllowed: ["reusable fighting, character, mech, or combat kit", "skinning or animation support", "production-runtime-only rendering claims", "public promotion before independent exact-artifact review"]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_MECH_HANGAR__",
    detailedGlobal: "window.__MECH_HANGAR_EVIDENCE__",
    sourceReview: "apps/showcase-mech-hangar/src/main.ts",
    curation: "apps/showcase-mech-hangar/parts-curation-report.json",
    partMatrix: "tests/reports/mech-hangar/part-matrix.json",
    exactArtifacts: artifactFiles.map((file) => ({ path: `tests/reports/mech-hangar/${file}`, sha256: sha256(join(reportDir, file)) })),
    browserReceipts: browserReceipts.map((file) => `tests/reports/mech-hangar/${file}`),
    assetProbes: [...assetIds, ...visualPrimaryAssetIds].map((id) => ({ asset: id, metadata: `tests/reports/showcase-release-asset-probes/${id}.json`, screenshot: assetById.get(id).renderedProbe.url, assetHash: assetById.get(id).hash })),
    performance: "apps/showcase-mech-hangar/performance-report.json",
    deploy: "apps/showcase-mech-hangar/deploy-report.json",
    routePrimary: "tests/reports/showcase-route-primary-probes/showcase-mech-hangar.json",
    browserSpecs: ["tests/browser/mech-hangar-build.spec.ts", "tests/browser/mech-hangar-arena.spec.ts"],
    unitSpecs: ["tests/unit/apps/mech-hangar-assembly.test.ts", "tests/unit/apps/mech-hangar-combat.test.ts"],
    deployCommands: [
      "check-deploy --release --source apps/showcase-mech-hangar/src --asset <each of 16 MH-2M models>",
      "check-deploy --release --source apps/showcase-mech-hangar/src --no-assets"
    ]
  }
};

writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({ machinePass: true, parts: assetIds.length, audio: audioIds.length, matrix: matrix.matrixSize, primitiveOccurrences, performancePass: performance.pass }));
