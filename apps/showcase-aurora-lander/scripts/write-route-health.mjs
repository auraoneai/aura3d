import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const modelAssetIds = ["auroraLanderProbe", "auroraPadBeacon"];
const audioAssetIds = [
  "auroraThrustLoopSfx",
  "auroraRcsPuffSfx",
  "auroraTouchSoftSfx",
  "auroraTouchHardSfx",
  "auroraCrashSfx",
  "auroraPadLockSfx",
  "auroraFuelLowSfx",
  "auroraSiteClearSfx",
  "auroraGustWarnSfx",
  "auroraAmbientWindSfx"
];
const campaignNames = [
  "01-approach",
  "02-gust-correction",
  "03-strongest-whiteout",
  "04-final-extraction",
  "05-hard-contact",
  "06-mobile-active-play",
  "07-reduced-motion-whiteout"
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(join(repoRoot, "aura.assets.json"));
const assetById = new Map((manifest.assets ?? []).map((entry) => [entry.id, entry]));
const performanceReport = readJson(join(appDir, "performance-report.json"));
if (performanceReport.schema !== "aura3d-aurora-lander-performance/1.0" || performanceReport.pass !== true) {
  throw new Error("Aurora Lander performance-report.json is missing, stale, or failing.");
}

const routeGates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const routeGate = routeGates.routes?.find((entry) => entry.id === "showcase-aurora-lander");
if (!routeGate || routeGate.releaseClass !== "prototype-blocked" || routeGate.published !== true) {
  throw new Error("Aurora Lander is not registered as a published prototype-blocked route gate.");
}

for (const id of [...modelAssetIds, ...audioAssetIds]) {
  const asset = assetById.get(id);
  if (!asset?.hash || !asset?.url) throw new Error(`Typed asset ${id} is missing hash/url provenance.`);
  if (asset.provenance?.license !== "CC0-1.0" || asset.provenance?.author !== "Aura3D synthesis") {
    throw new Error(`Typed asset ${id} does not retain the expected original CC0 provenance.`);
  }
}

const campaignArtifacts = campaignNames.map((name) => {
  const reportPath = join(repoRoot, "tests/reports/aurora-lander-campaign", `${name}.json`);
  const artifact = readJson(reportPath);
  const screenshotPath = join(repoRoot, artifact.screenshotPath);
  const actualHash = `sha256-${createHash("sha256").update(readFileSync(screenshotPath)).digest("hex")}`;
  if (artifact.screenshotSha256 !== actualHash) throw new Error(`${name} screenshot hash does not match its artifact JSON.`);
  return artifact;
});
const byName = Object.fromEntries(campaignNames.map((name, index) => [name, campaignArtifacts[index]]));
const contactEvidence = readJson(join(repoRoot, "tests/reports/aurora-lander-terrain/contact-evidence.json"));
if (contactEvidence.schema !== "aura3d-aurora-lander-contact-evidence/1.0") {
  throw new Error("Aurora Lander contact evidence is missing or stale.");
}
const contactPng = readFileSync(join(repoRoot, contactEvidence.screenshotPath));
const contactHash = `sha256-${createHash("sha256").update(contactPng).digest("hex")}`;
if (contactEvidence.screenshotSha256 !== contactHash) throw new Error("Contact evidence screenshot hash mismatch.");

const sourceFiles = walk(join(appDir, "src")).filter((path) => path.endsWith(".ts"));
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const id of modelAssetIds) {
  if (!source.includes(`assets.${id}`)) throw new Error(`Live route does not use typed model assets.${id}.`);
}
for (const id of audioAssetIds) {
  if (!source.includes(`"${id}"`)) throw new Error(`Live route does not register typed audio asset ${id}.`);
}
for (const forbidden of ["from \"three\"", "from 'three'", "GLTFLoader", "OrbitControls", "unsafeModelUrl("]) {
  if (source.includes(forbidden)) throw new Error(`Forbidden public-route source token found: ${forbidden}`);
}
const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > routeGate.primitiveBudget) {
  throw new Error(`Aurora Lander primitive source occurrences ${primitiveOccurrences} exceed budget ${routeGate.primitiveBudget}.`);
}

const campaignComplete = byName["04-final-extraction"].evidence;
const strongestWhiteout = byName["03-strongest-whiteout"].evidence;
const hardContact = byName["05-hard-contact"].evidence;
const mobile = byName["06-mobile-active-play"].evidence;
const reduced = byName["07-reduced-motion-whiteout"].evidence;
const observedContact = contactEvidence.observed;
const machinePass = campaignComplete.state === "campaign-clear"
  && campaignComplete.completedSites === 3
  && campaignComplete.extractionTableau === true
  && strongestWhiteout.whiteoutVisibleNodes >= 40
  && strongestWhiteout.renderer?.drawCalls > 0
  && hardContact.lastGrade === "hard"
  && hardContact.hull === 0.7
  && mobile.prediction?.bounded === true
  && reduced.reducedMotion === true
  && reduced.whiteoutVisibleNodes >= 40
  && observedContact.touchdown?.contactEventSeen === true
  && observedContact.touchdown?.contactQueryAgreement === true
  && observedContact.terrainQueryFps >= 30;
if (!machinePass) throw new Error("Aurora Lander campaign/contact artifacts do not satisfy route-health machine gates.");

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-aurora-lander",
  route: "/apps/showcase-aurora-lander/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  renderer: {
    path: "createAuraApp root safe API",
    mode: "safe-basic",
    observedBackend: strongestWhiteout.renderer.backend,
    nativeWebGPU: false,
    productionRuntime: false
  },
  primaryAssets: modelAssetIds.map((id) => ({
    typedRef: `assets.${id}`,
    role: id === "auroraLanderProbe" ? "primaryVehicle" : "landingZoneProp",
    status: "typed-primary-asset",
    quality: assetById.get(id).quality ?? "ungraded",
    hash: assetById.get(id).hash,
    license: assetById.get(id).provenance.license,
    author: assetById.get(id).provenance.author
  })),
  audioAssets: audioAssetIds.map((id) => ({
    typedRef: `assets.${id}`,
    hash: assetById.get(id).hash,
    license: assetById.get(id).provenance.license,
    author: assetById.get(id).provenance.author
  })),
  primitiveStatus: {
    sourceOccurrences: primitiveOccurrences,
    primitiveBudget: routeGate.primitiveBudget,
    role: "terrain/weather/pad/effect support around typed vehicle and beacon assets",
    pass: true
  },
  claimStatus: {
    status: "prototype-blocked",
    label: "prototype",
    allowed: [
      "authored deterministic arcade landing dynamics",
      "Rapier static-heightfield contact detection witnessed by a route-owned proxy",
      "createMeshSurfaceQuery BVH terrain reads",
      "bounded eight-second current-control landing estimate",
      "player-facing input replay ghost",
      "three-site campaign with gust, whiteout, hull, scoring, and extraction"
    ],
    notAllowed: [
      "physical-simulation parity or orbital mechanics",
      "deformable or dynamic terrain",
      "production rendering, PBR parity, HDR/IBL, or WebGPU claims",
      "reusable lander or precision-flight game kit",
      "public showcase promotion before independent exact-artifact review"
    ]
  },
  performance: {
    report: "apps/showcase-aurora-lander/performance-report.json",
    budgets: performanceReport.budgets,
    observed: performanceReport.observed,
    sitesCompleted: performanceReport.sites.filter((site) => site.completed).length,
    pass: performanceReport.pass
  },
  routeGate: {
    config: "tools/showcase-library/route-gates.json",
    releaseClass: routeGate.releaseClass,
    published: routeGate.published,
    requiresKeyboardDelta: routeGate.requiresKeyboardDelta === true,
    pass: true
  },
  blockers: ["visual-review:aurora-lander-independent-review-pending"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_AURORA_LANDER__",
    detailedGameplayGlobal: "window.__AURORA_LANDER_EVIDENCE__",
    sourceReview: "apps/showcase-aurora-lander/src/main.ts",
    campaignArtifacts: campaignNames.map((name) => ({
      report: `tests/reports/aurora-lander-campaign/${name}.json`,
      screenshot: byName[name].screenshotPath,
      sha256: byName[name].screenshotSha256
    })),
    contactEvidence: "tests/reports/aurora-lander-terrain/contact-evidence.json",
    performanceEvidence: "apps/showcase-aurora-lander/performance-report.json",
    unitSuites: [
      "tests/unit/apps/aurora-lander-touchdown.test.ts",
      "tests/unit/apps/aurora-lander-ghost.test.ts"
    ],
    browserSpecs: [
      "tests/browser/aurora-lander-campaign.spec.ts",
      "tests/browser/aurora-lander-playable.spec.ts",
      "tests/browser/aurora-lander-terrain.spec.ts"
    ],
    observed: {
      completedSites: campaignComplete.completedSites,
      campaignScore: campaignComplete.campaignScore,
      extractionTableau: campaignComplete.extractionTableau,
      strongestWhiteoutDensity: strongestWhiteout.whiteoutDensity,
      strongestWhiteoutVisibleNodes: strongestWhiteout.whiteoutVisibleNodes,
      hardLandingHull: hardContact.hull,
      contactEventSeen: observedContact.touchdown.contactEventSeen,
      contactQueryAgreement: observedContact.touchdown.contactQueryAgreement,
      terrainQueryFps: observedContact.terrainQueryFps,
      reducedMotion: reduced.reducedMotion,
      mobileBoundedPrediction: mobile.prediction.bounded
    },
    notes: "Machine evidence is current and passing. Automated visual checks are not independent human approval; the route remains prototype-blocked and absent from the public card slate.",
    deployCommand: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-aurora-lander/dist --release --source apps/showcase-aurora-lander/src --asset auroraLanderProbe --asset auroraPadBeacon"
  }
};

writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log("Wrote apps/showcase-aurora-lander/route-health.json");
console.log(JSON.stringify({ machinePass: routeHealth.machinePass, primitiveOccurrences }));

function walk(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).sort().flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}
