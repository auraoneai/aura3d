import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const modelAssetIds = ["siegeGolfCourseWorld", "siegeGolfBall", "siegeWoodenCrate", "siegeWoodenBarrel", "siegePlankSet"];
const audioAssetIds = [
  "siegeDriveHitSfx",
  "siegeWoodCrackSfx",
  "siegeMetalClangSfx",
  "siegeTargetDownSfx",
  "siegeCupSinkSfx",
  "siegeParChimeSfx",
  "siegeBogeyStingSfx",
  "siegeUiConfirmSfx",
  "siegeAmbientWindSfx"
];

const manifest = JSON.parse(readFileSync(join(repoRoot, "aura.assets.json"), "utf8"));
const assetById = new Map((manifest.assets ?? []).map((entry) => [entry.id, entry]));
const performanceReport = JSON.parse(readFileSync(join(appDir, "performance-report.json"), "utf8"));
if (performanceReport.schema !== "aura3d-siege-golf-performance/1.0" || performanceReport.pass !== true || performanceReport.holes?.length !== 9) {
  throw new Error("Siege Golf performance-report.json is missing, stale, or failing");
}
const routeGates = JSON.parse(readFileSync(join(repoRoot, "tools/showcase-library/route-gates.json"), "utf8"));
const routeGate = routeGates.routes?.find((entry) => entry.id === "showcase-siege-golf");
if (!routeGate || routeGate.releaseClass !== "prototype-blocked" || routeGate.published !== true) {
  throw new Error("Siege Golf is not registered as a published prototype-blocked route gate");
}

for (const id of [...modelAssetIds, ...audioAssetIds]) {
  const asset = assetById.get(id);
  if (!asset) throw new Error("Missing typed asset " + id + " from aura.assets.json");
  if (!asset.hash || !asset.url) throw new Error("Typed asset " + id + " is missing hash/url provenance");
}

const sourceFiles = walk(join(appDir, "src")).filter((path) => path.endsWith(".ts"));
const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");

for (const id of modelAssetIds) {
  // Models render through typed refs (assets.siegeGolfBall etc.); the audio
  // layer resolves its cues through assets[KEY] with quoted typed keys.
  if (!source.includes("assets." + id) && !source.includes("\"" + id + "\"")) {
    throw new Error("Live route does not reference assets." + id);
  }
}
for (const id of audioAssetIds) {
  if (!source.includes("\"" + id + "\"") || !source.includes("assets[key]")) {
    throw new Error("Live route does not reference typed audio asset " + id);
  }
}
if (!source.includes("__SIEGE_GOLF_EVIDENCE__")) {
  throw new Error("Live route does not publish window.__SIEGE_GOLF_EVIDENCE__");
}

const primitiveOccurrences = Array.from(source.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;

// Mirrors the sanctioned pre-promotion pattern (showcase-neon-swarm): fully
// built and evidenced, held out of the public showcase slate until independent
// human visual review. The PRD's `prototype` label stays unchanged.
const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-siege-golf",
  route: "/apps/showcase-siege-golf/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  renderer: {
    path: "createAuraApp root safe API",
    mode: "safe-basic",
    nativeWebGPU: false,
    productionRuntime: false
  },
  primaryAssets: [
    {
      typedRef: "assets.siegeGolfCourseWorld",
      role: "primaryWorld",
      status: "typed-primary-asset",
      quality: assetById.get("siegeGolfCourseWorld").quality ?? "candidate"
    },
    {
      typedRef: "assets.siegeGolfBall",
      role: "primaryCharacter",
      status: "typed-primary-asset",
      quality: assetById.get("siegeGolfBall").quality ?? "candidate"
    },
    {
      typedRef: "assets.siegePlankSet",
      role: "world",
      status: "typed-primary-asset",
      quality: assetById.get("siegePlankSet").quality ?? "candidate"
    },
    {
      typedRef: "assets.siegeWoodenCrate",
      role: "world",
      status: "typed-primary-asset",
      quality: assetById.get("siegeWoodenCrate").quality ?? "candidate"
    },
    {
      typedRef: "assets.siegeWoodenBarrel",
      role: "world",
      status: "typed-primary-asset",
      quality: assetById.get("siegeWoodenBarrel").quality ?? "candidate"
    }
  ],
  audioAssets: audioAssetIds.map((id) => ({
    typedRef: "assets." + id,
    bus: id === "siegeAmbientWindSfx" ? "ambient" : "sfx",
    license: "CC0-1.0",
    author: "Aura3D synthesis"
  })),
  primitiveStatus: {
    sourceOccurrences: primitiveOccurrences,
    primitiveBudget: 40,
    role: "physics guides, cup rings, renderer-owned shot-club aim cue, aim ticks, and trail puffs as set dressing around the typed continuous world plus ball/crate/barrel/plank models",
    status: "set-dressing-with-typed-primary-assets"
  },
  claimStatus: {
    status: "blocked-pending-human-review",
    label: "prototype",
    allowed: [
      "prototype nine-hole rigid-body golf demolition sketch",
      "route-local Rapier physics: dynamic bodies, hinge/spring/fixed constraints, sensor cups",
      "deterministic fixed-step topple with pre-shot hash and byte-identical reset proof",
      "games.createMiniGolfState launch contract reuse",
      "catalog-sourced typed ball/crate/barrel/plank models",
      "nine authored holes with par, stroke-limit fail, star ratings, round totals",
      "keyboard + touch input with charge-to-power meter mapping",
      "player-facing precision aim/power controls for deliberate puzzle solutions",
      "compact mobile safe-area controls with direct aim and hold-to-charge input",
      "distinct opening, aim, flight, and settle cameras on the root-safe camera surface",
      "best completed solution retained as renderer-only dotted trajectory with no physics/scoring ownership",
      "compact continuous causeway composition with tee, live obstacle bay, and fortified sensor court readable in one frame",
      "typed audio cues on sfx/ambient/ui buses with gesture unlock",
      "reduced-motion gating for trail particles and camera smoothing"
    ],
    notAllowed: [
      "public showcase promotion before independent human visual review",
      "reusable golf or physics game kit",
      "destruction/fracture simulation (not implemented in the engine)",
      "production rendering, PBR parity, HDR/IBL, WebGPU claims",
      "ball spin physics beyond impulses"
    ]
  },
  blockers: [
    "independent human visual review pending for exact final artifacts"
  ],
  bodyJointPerformance: {
    report: "apps/showcase-siege-golf/performance-report.json",
    scope: performanceReport.scope,
    budgets: performanceReport.budgets,
    observed: performanceReport.observed,
    holesCompleted: performanceReport.holes.filter((hole) => hole.completed).length,
    pass: performanceReport.pass
  },
  routeGate: {
    config: "tools/showcase-library/route-gates.json",
    releaseClass: routeGate.releaseClass,
    published: routeGate.published,
    requiresKeyboardDelta: routeGate.requiresKeyboardDelta === true,
    pass: true
  },
  evidence: {
    global: "window.__AURA3D_SHOWCASE_SIEGE_GOLF__",
    detailedGameplayGlobal: "window.__SIEGE_GOLF_EVIDENCE__",
    sourceReview: "apps/showcase-siege-golf/src/main.ts",
    desktopScreenshot: "tests/reports/siege-golf/screenshots/siege-golf-desktop-01-first-load.png",
    mobileScreenshot: "tests/reports/siege-golf/screenshots/siege-golf-mobile-01-first-load.png",
    screenshots: "tests/reports/siege-golf/screenshots/",
    gameplayProof: "tests/reports/siege-golf/playable/",
    unitProofs: [
      "tests/unit/apps/siege-golf-physics.test.ts",
      "tests/unit/apps/siege-golf-scoring.test.ts",
      "tests/unit/apps/siege-golf-replay.test.ts"
    ],
    browserSpecs: [
      "tests/browser/siege-golf-playable.spec.ts",
      "tests/browser/siege-golf-shot-visual.spec.ts",
      "tests/browser/siege-golf-captures.spec.ts",
      "tests/browser/siege-golf-course-completion.spec.ts"
    ],
    bestReplayProof: "tests/reports/siege-golf/best-replay/",
    courseCompletionProof: "tests/reports/siege-golf/course-completion/",
    performanceProof: "apps/showcase-siege-golf/performance-report.json",
    notes: "Route is registered in route gates and internal remediation/index metadata, but publicShowcase remains false and no public card is promoted until independent review; label stays `prototype` pending approval.",
    deployCommand: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-siege-golf/dist --release --source apps/showcase-siege-golf/src --asset siegeGolfCourseWorld --asset siegeGolfBall --asset siegePlankSet --asset siegeWoodenCrate --asset siegeWoodenBarrel"
  },
  determinismContract: {
    fixedStep: "1/60 via physics.world fixedDelta; mounted low-FPS catch-up remains bounded to four fixed substeps",
    preShotHash: "FNV-1a pose hash captured at strike time",
    resetProof: "resetHole() rebuilds from the hole definition and asserts hash equality",
    unitPins: "tests/unit/apps/siege-golf-physics.test.ts"
  },
  sessionLength: {
    target: ">=60s meaningful play per hole",
    proof: "deterministic 3600-frame (60 s) replay through the route's own HoleFlow; mechanics flags derived, not declared",
    module: "apps/showcase-siege-golf/src/replay-proof.ts",
    unitPins: "tests/unit/apps/siege-golf-replay.test.ts",
    publishedAs: "window.__SIEGE_GOLF_EVIDENCE__.sixtySecondReplayProof",
    provesMountedKitPlayback: false
  }
};

writeFileSync(join(appDir, "route-health.json"), JSON.stringify(routeHealth, null, 2) + "\n");
console.log("Wrote apps/showcase-siege-golf/route-health.json");
console.log("primitive occurrences:", primitiveOccurrences);

function walk(path) {
  const entries = readdirSync(path).sort();
  return entries.flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}
