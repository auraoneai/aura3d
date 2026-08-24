import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const modelAssetIds = ["neonCourierAvatar", "neonBarricadeProp", "neonStreetLampProp"];
const audioAssetIds = [
  "neonPulseFireSfx", "neonDroneHitSfx", "neonDroneDieSfx", "neonPlayerHurtSfx",
  "neonDashSfx", "neonPickupSfx", "neonWaveStartSfx", "neonWaveClearSfx",
  "neonDeathStingSfx", "neonAmbientHumSfx", "neonBurstSfx", "neonGrazeSfx",
  "neonComboBreakSfx"
];
const reportPaths = [
  "tests/reports/neon-swarm/playable.json",
  "tests/reports/neon-swarm/playable-mid-wave.json",
  "tests/reports/neon-swarm/campaign-completion.json",
  "tests/reports/neon-swarm/mobile-playable.json",
  "tests/reports/neon-swarm/reduced-motion.json",
  "tests/reports/neon-swarm/instancing-telemetry.json"
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const normalizeHash = (value) => String(value ?? "").replace(/^sha256-/, "");
const routeSourceFiles = readdirSync(join(appDir, "src"))
  .filter((entry) => /\.(?:ts|css)$/.test(entry))
  .sort();
const routeSourceHash = (() => {
  const hash = createHash("sha256");
  for (const name of routeSourceFiles) {
    hash.update(name).update("\0").update(readFileSync(join(appDir, "src", name))).update("\0");
  }
  return hash.digest("hex");
})();

const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map((manifest.assets ?? []).map((entry) => [entry.id, entry]));
const routeGates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const routeGate = routeGates.routes?.find((entry) => entry.id === "showcase-neon-swarm");
if (!routeGate || routeGate.releaseClass !== "prototype-blocked" || routeGate.published !== true) {
  throw new Error("Neon Swarm is not registered as a published prototype-blocked route gate.");
}

for (const id of modelAssetIds) {
  const asset = assetById.get(id);
  if (!asset?.hash || !asset?.url || asset.quality !== "release") {
    throw new Error(`Typed model ${id} is missing release hash/url metadata.`);
  }
  const license = asset.provenance?.licenseRaw ?? asset.provenance?.licenseName ?? asset.provenance?.license;
  const author = asset.provenance?.attribution ?? asset.provenance?.author;
  if (license !== "CC-BY-4.0" || !author
      || !asset.provenance?.sourcePage || !asset.provenance?.downloadUrl) {
    throw new Error(`Typed model ${id} is missing durable CC-BY provenance.`);
  }
  const probe = readJson(join(repoRoot, `tests/reports/showcase-release-asset-probes/${id}.json`));
  if (probe.evidence?.pass !== true || probe.evidence?.asset?.hash !== asset.hash
      || normalizeHash(probe.renderedProbe?.sha256) !== sha256(join(repoRoot, probe.screenshotPath))) {
    throw new Error(`Typed model ${id} does not have a current passing rendered probe.`);
  }
}

for (const id of audioAssetIds) {
  const asset = assetById.get(id);
  if (!asset?.hash || !asset?.url || asset.provenance?.license !== "CC0-1.0"
      || asset.provenance?.author !== "Aura3D synthesis") {
    throw new Error(`Typed audio ${id} is missing deterministic-synthesis provenance.`);
  }
}

const reports = Object.fromEntries(reportPaths.map((relativePath) => {
  const report = readJson(join(repoRoot, relativePath));
  const producer = report.producer;
  if (!producer || !report.producerSourceSha256
      || normalizeHash(report.producerSourceSha256) !== sha256(join(repoRoot, producer))) {
    throw new Error(`${relativePath} is not bound to its current producer source.`);
  }
  if (normalizeHash(report.routeSourceSha256) !== routeSourceHash) {
    throw new Error(`${relativePath} is not bound to the current Neon Swarm route source tree.`);
  }
  const artifacts = [report.artifact, ...(report.artifacts ?? [])].filter(Boolean);
  for (const artifact of artifacts) {
    if (!artifact.path || normalizeHash(artifact.sha256) !== sha256(join(repoRoot, artifact.path))) {
      throw new Error(`${relativePath} has a missing or stale artifact hash for ${artifact.path ?? "unknown"}.`);
    }
  }
  return [relativePath.split("/").at(-1).replace(/\.json$/, ""), report];
}));

const performanceReport = readJson(join(appDir, "performance-report.json"));
if (performanceReport.schema !== "aura3d-neon-swarm-performance/1.0" || performanceReport.pass !== true) {
  throw new Error("Neon Swarm performance evidence is missing or failing.");
}

const sourceFiles = walk(join(appDir, "src")).filter((path) => path.endsWith(".ts"));
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const id of modelAssetIds) {
  if (!source.includes(`assets.${id}`)) throw new Error(`Live route does not use assets.${id}.`);
}
for (const id of audioAssetIds) {
  if (!source.includes(`"${id}"`) || !source.includes("assets[key]")) {
    throw new Error(`Live route does not register typed audio ${id}.`);
  }
}
for (const token of ["from \"three\"", "from 'three'", "GLTFLoader", "OrbitControls", "unsafeModelUrl("]) {
  if (source.includes(token)) throw new Error(`Forbidden public-route token found: ${token}`);
}
for (const globalName of ["__NEON_SWARM_EVIDENCE__", "__AURA3D_SHOWCASE_NEON_SWARM__", "__AURA3D_COMPOSITION_PROBE__"]) {
  if (!source.includes(globalName)) throw new Error(`Live route does not publish ${globalName}.`);
}
const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > routeGate.primitiveBudget) {
  throw new Error(`Primitive occurrences ${primitiveOccurrences} exceed budget ${routeGate.primitiveBudget}.`);
}

const playable = reports.playable;
const midWave = reports["playable-mid-wave"];
const campaign = reports["campaign-completion"];
const mobile = reports["mobile-playable"];
const reduced = reports["reduced-motion"];
const telemetry = reports["instancing-telemetry"];
const machinePass = playable.afterPickup?.pickupsCollected > playable.beforePickup?.pickupsCollected
  && playable.afterKills?.kills > 0
  && playable.afterDamage?.damageEvents > playable.beforeDamage?.damageEvents
  && playable.afterDamage?.hp < playable.beforeDamage?.hp
  && playable.afterPickup?.audioCues?.includes("pickup")
  && playable.afterDamage?.audioCues?.includes("player-hurt")
  && playable.afterGraze?.audioCues?.includes("graze")
  && playable.afterBurst?.audioCues?.includes("burst")
  && playable.afterComboBreak?.audioCues?.includes("combo-break")
  && playable.afterWaveClear?.audioCues?.includes("wave-clear")
  && playable.afterKills?.audio?.typedAssetCount === 13
  && playable.afterKills?.audio?.audioErrors?.length === 0
  && playable.dead?.state === "dead"
  && playable.reset?.state === "wave-active"
  && midWave.alive > 300
  && midWave.pickupActive === true
  && campaign.finale?.wave === 5
  && campaign.finale?.instanceCount === 320
  && campaign.finale?.pickupActive === true
  && campaign.completeA?.state === "complete"
  && campaign.completeA?.outcomeHash === campaign.completeB?.outcomeHash
  && /^fnv1a32-[0-9a-f]{8}$/.test(campaign.deterministicOutcomeHash)
  && mobile.final?.bursts >= 1
  && mobile.final?.state !== "booting"
  && reduced.reduced?.reducedMotion === true
  && reduced.reduced?.instanceCount === 320
  && telemetry.instanceCount === 320
  && telemetry.nativeInstancedSubmissions > 0
  && telemetry.drawCalls < performanceReport.budgets.drawCalls
  && telemetry.consoleErrors?.length === 0;
if (!machinePass) throw new Error("Neon Swarm retained gameplay evidence does not satisfy machine gates.");

const allArtifacts = reportPaths.flatMap((relativePath) => {
  const report = reports[relativePath.split("/").at(-1).replace(/\.json$/, "")];
  return [report.artifact, ...(report.artifacts ?? [])].filter(Boolean);
});

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-neon-swarm",
  route: "/apps/showcase-neon-swarm/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  renderer: {
    path: "createAuraApp root safe API", mode: "safe-basic",
    nativeWebGPU: false, productionRuntime: false
  },
  primaryAssets: modelAssetIds.map((id) => {
    const asset = assetById.get(id);
    return {
      typedRef: `assets.${id}`,
      role: id === "neonCourierAvatar" ? "primaryCharacter" : "primaryWorld",
      quality: asset.quality, hash: asset.hash,
      license: asset.provenance.licenseRaw ?? asset.provenance.licenseName,
      author: asset.provenance.attribution ?? asset.provenance.author,
      sourcePage: asset.provenance.sourcePage
    };
  }),
  audioAssets: audioAssetIds.map((id) => {
    const asset = assetById.get(id);
    return {
      typedRef: `assets.${id}`, hash: asset.hash,
      license: asset.provenance.license, author: asset.provenance.author
    };
  }),
  primitiveStatus: {
    sourceOccurrences: primitiveOccurrences,
    primitiveBudget: routeGate.primitiveBudget,
    role: "arena, player guides, collectible, boundaries, and effects around typed primary assets and abstract instanced enemies",
    pass: true
  },
  instancingStatus: {
    enemyPools: [
      { name: "drone swarm grunt pool", api: "instances.capsule", capacity: 360 },
      { name: "drone swarm elite pool", api: "instances.box", capacity: 96 }
    ],
    droneLabel: "abstract-instanced-geometry",
    observedLiveInstances: telemetry.instanceCount,
    observedDrawCalls: telemetry.drawCalls,
    observedNativeInstancedSubmissions: telemetry.nativeInstancedSubmissions,
    pass: true
  },
  campaign: {
    stages: ["opening", "upgrade", "compression", "elite", "finale"],
    finaleLiveInstances: campaign.finale.instanceCount,
    deterministicOutcomeHash: campaign.deterministicOutcomeHash,
    pickupCollectionsProven: playable.afterPickup.pickupsCollected,
    pass: true
  },
  performance: {
    report: "apps/showcase-neon-swarm/performance-report.json",
    budgets: performanceReport.budgets,
    observed: performanceReport.observed,
    pass: performanceReport.pass
  },
  routeGate: {
    config: "tools/showcase-library/route-gates.json",
    releaseClass: routeGate.releaseClass, published: routeGate.published,
    requiresKeyboardDelta: routeGate.requiresKeyboardDelta === true, pass: true
  },
  claimStatus: {
    status: "prototype-blocked",
    label: "prototype",
    allowed: [
      "finite five-wave top-down horde-survival prototype",
      "root-safe native instancing with two bounded enemy pools",
      "route-local deterministic seek, separation, orbit, flee, and elite steering",
      "real 320-live-enemy finale with current draw and simulation timing evidence",
      "typed courier, street props, and thirteen registered audio assets",
      "abstract-instanced-drone labeling"
    ],
    notAllowed: [
      "Recast navigation or crowd-simulation claims", "reusable horde-survival game kit",
      "production rendering, PBR parity, HDR/IBL, WebGPU, or compute claims",
      "character-model drones", "public promotion before independent exact-artifact review"
    ]
  },
  blockers: ["visual-review:neon-swarm-independent-review-pending"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_NEON_SWARM__",
    detailedGameplayGlobal: "window.__NEON_SWARM_EVIDENCE__",
    sourceReview: "apps/showcase-neon-swarm/src/main.ts",
    gameplayReports: reportPaths,
    artifacts: allArtifacts,
    renderedAssetProbes: modelAssetIds.map((id) => `tests/reports/showcase-release-asset-probes/${id}.json`),
    performanceEvidence: "apps/showcase-neon-swarm/performance-report.json",
    unitSuite: "tests/unit/apps/neon-swarm-steering.test.ts",
    browserSpecs: ["tests/browser/neon-swarm-playable.spec.ts", "tests/browser/neon-swarm-instancing.spec.ts"],
    observed: {
      campaignStages: campaign.finale.waveChecksums.length,
      finaleLiveInstances: campaign.finale.instanceCount,
      drawCalls: telemetry.drawCalls,
      nativeInstancedSubmissions: telemetry.nativeInstancedSubmissions,
      outcomeHash: campaign.deterministicOutcomeHash,
      pickupsCollected: playable.afterPickup.pickupsCollected,
      mobileBursts: mobile.final.bursts,
      reducedMotion: reduced.reduced.reducedMotion
    },
    notes: "Machine evidence is current and passing. Automated and agent visual inspection are not independent approval; publicShowcase remains false.",
    deployCommand: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-neon-swarm/dist --release --source apps/showcase-neon-swarm/src --asset neonCourierAvatar --asset neonBarricadeProp --asset neonStreetLampProp"
  },
  steeringDisclaimer: "Steering is route-local deterministic math; no Recast navigation or crowd-simulation capability is used or claimed."
};

writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log("Wrote apps/showcase-neon-swarm/route-health.json");
console.log(JSON.stringify({ machinePass: true, artifacts: allArtifacts.length, primitiveOccurrences }));

function walk(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).sort().flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}
