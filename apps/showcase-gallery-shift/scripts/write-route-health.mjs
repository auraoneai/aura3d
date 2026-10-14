import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const gateModelIds = [
  "galleryShiftCutawayMuseumWorld",
  "galleryShiftPedestal",
  "galleryShiftExhibitA",
  "galleryShiftExhibitB",
  "galleryShiftExhibitC",
  "galleryShiftDisplayCase"
];
const routeModelIds = ["quaterniusCubeCrate", "quaterniusWallModular"];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function files(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const routeSourceFiles = files(join(appDir, "src")).filter((path) => /\.(?:ts|css)$/.test(path));
const routeSourceSha256 = (() => {
  const hash = createHash("sha256");
  for (const path of routeSourceFiles) {
    hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  }
  return hash.digest("hex");
})();

const sourceText = routeSourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
for (const forbidden of [/\bfrom\s+["']three(?:\/|["'])/, /unsafeModelUrl\s*\(/, /model\s*\(\s*["'][^"']+\.gl(?:b|tf)/]) {
  if (forbidden.test(sourceText)) {
    throw new Error(`Gallery Shift source violates the root-safe asset boundary: ${forbidden}`);
  }
}
if (!existsSync(join(appDir, "README.md"))) throw new Error("Gallery Shift README is missing");

const routeManifest = readJson(join(appDir, "aura.assets.json"));
const routeAssetById = new Map((routeManifest.assets ?? []).map((asset) => [asset.id, asset]));
for (const id of routeModelIds) {
  const asset = routeAssetById.get(id);
  if (!asset || asset.type !== "model") {
    throw new Error(`${id} is missing from apps/showcase-gallery-shift/aura.assets.json`);
  }
  if (!sourceText.includes(`assets.${id}`)) {
    throw new Error(`${id} is not referenced by the live route`);
  }
}

const rootManifest = readJson(join(repoRoot, "aura.assets.json"));
const rootAssetById = new Map((rootManifest.assets ?? []).map((asset) => [asset.id, asset]));

const gates = readJson(join(repoRoot, "tools/showcase-library/route-gates.json"));
const gate = gates.routes.find((route) => route.id === "showcase-gallery-shift");
if (!gate || gate.releaseClass !== "prototype-blocked" || gate.published !== true || gate.requiresTypedPrimaryAssets !== true || gate.gameTemplateStatus?.publicTemplateReady !== false) {
  throw new Error("Gallery Shift route gate is missing or over-promoted");
}
const primitiveOccurrences = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_$][\w$]*/g)).length;
if (primitiveOccurrences > gate.primitiveBudget) {
  throw new Error("Gallery Shift primitive source budget exceeded");
}

const routeHealth = {
  schema: "aura3d-route-health/1.0",
  generatedAt: new Date().toISOString(),
  appId: "showcase-gallery-shift",
  route: "/apps/showcase-gallery-shift/",
  classification: "prototype-blocked",
  publicShowcase: false,
  promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
  machinePass: true,
  routeSourceSha256,
  renderer: {
    path: "createGame root safe API",
    mode: "production with safe-basic fallback",
    nativeWebGPU: false,
    productionRuntimeClaimed: false
  },
  primaryAssets: gateModelIds.map((id) => {
    const asset = rootAssetById.get(id);
    return {
      typedRef: `assets.${id}`,
      hash: asset?.hash ?? null,
      quality: asset?.quality ?? "candidate",
      role: asset?.role ?? gate.primaryAssetRoles?.[id] ?? "prop"
    };
  }),
  admittedAssets: routeModelIds.map((id) => {
    const asset = routeAssetById.get(id);
    return {
      id: asset.id,
      typedRef: `assets.${asset.id}`,
      type: asset.type,
      format: asset.format,
      hash: asset.hash,
      sizeBytes: asset.sizeBytes,
      license: asset.license
    };
  }),
  primitiveStatus: {
    primitiveBudget: gate.primitiveBudget,
    livePrimitiveCount: primitiveOccurrences,
    role: "fresh room construction from salvaged FloorLayout rects using typed Quaternius crate and modular wall props",
    status: "no-primitive-primary-subjects"
  },
  gameplay: {
    exhibits: 2,
    floors: 1,
    controls: ["walk", "sneak", "sprint", "hold lift", "reset"],
    keyboardAndTouch: true,
    rapierBackend: true,
    publicPhysicsLos: true,
    thiefEyeHeightMeters: 1.1,
    guardEyeHeightMeters: 1.55,
    authoredHearingRadii: { walk: 3, sneak: 0, sprint: 6 },
    authoredWaypointNavigation: true,
    recastClaimed: false,
    exactOnceSensors: true,
    reducedMotionPreservesStateTruth: true
  },
  routeGate: {
    config: "tools/showcase-library/route-gates.json",
    releaseClass: gate.releaseClass,
    published: gate.published,
    publicTemplateReady: false,
    pass: true
  },
  claimStatus: {
    status: "blocked-pending-human-review",
    label: "root-safe prototype",
    allowed: [
      "fresh single-path museum interior built from salvaged FloorLayout rects with typed Quaternius crate and modular wall props",
      "route-local public-physics LOS raycasts (1.55 m guard eye to 1.1 m crouched thief eye) and exact-entry sensors",
      "route-local authored hearing radii, collision pushout, gait, and Floor 1 guard patrols",
      "two-exhibit single-floor mission, caught/reset, and north-exit win"
    ],
    notAllowed: [
      "reusable stealth, guard-AI, hearing, or navigation kit",
      "Recast/navmesh ownership",
      "clip-event footsteps",
      "production-runtime-only rendering claims",
      "public promotion before independent exact-artifact review"
    ]
  },
  blockers: ["independent human visual review pending for exact final artifacts"],
  evidence: {
    global: "window.__AURA3D_SHOWCASE_GALLERY_SHIFT__",
    detailedGlobal: "window.__aura3dGameSnapshot",
    sourceReview: "apps/showcase-gallery-shift/src/main.ts",
    unitSpecs: [
      "tests/unit/apps/gallery-shift-vision.test.ts",
      "tests/unit/apps/gallery-shift-patrols.test.ts"
    ],
    browserSpecs: [
      "apps/showcase-gallery-shift/tests/playable.spec.ts",
      "apps/showcase-gallery-shift/tests/route-health.spec.ts",
      "tests/qr/prd14/browser/gallery-shift-dispatch.spec.ts"
    ]
  },
  determinismContract: {
    fixedStep: "1/60",
    guardPatrols: "authored waypoint order without randomness",
    cameraSweep: "authored sine of floor time",
    perception: "range + field angle + public-physics filtered LOS (1.55 m watcher eye to 1.1 m crouched thief eye)",
    hearing: "explicit authored radius events"
  },
  qualityGate: {
    status: "in-rebuild"
  }
};

writeFileSync(join(appDir, "route-health.json"), `${JSON.stringify(routeHealth, null, 2)}\n`);
console.log(JSON.stringify({
  machinePass: true,
  routeSourceSha256,
  admittedModels: routeModelIds.length,
  exhibits: routeHealth.gameplay.exhibits,
  floors: routeHealth.gameplay.floors,
  primitiveOccurrences
}));

