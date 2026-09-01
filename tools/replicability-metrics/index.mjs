#!/usr/bin/env node
/**
 * Replicability metrics: how much of a new game must be hand-authored per route?
 *
 * ## Why measure this
 *
 * The four showcase games prove that gameplay kits, deterministic runtime behaviour, camera rigs,
 * topology binding and evidence plumbing all exist. They also proved the opposite about *visual* work:
 * roughly 30k lines of route-local authoring against roughly 3k lines of reusable visual layer. A
 * developer starting the fifth game inherits the kits and re-does the art direction by hand.
 *
 * A ratio alone is easy to game — moving route code into a shared file improves it without making
 * anything reusable. So this also counts the things that indicate *genuine* reuse:
 *
 * - **route-local magic constants**: bare numeric literals assigned to route-level `const`s. Each is a
 *   value a future developer must rediscover. Turbo's `CAR_SCENE_HEIGHT` was one of these, hardcoded to
 *   an asset that had already been replaced twice.
 * - **asset-derived values**: references to `assets.<id>.bounds` or the typed framing/grounding helpers.
 *   These are values the code computes instead of restating.
 * - **reusable visual recipes**: declarative entry points a route can call instead of authoring.
 * - **route-specific exceptions in engine code**: the anti-pattern that would make the ratio a lie.
 *
 * Usage:
 *   node tools/replicability-metrics/index.mjs
 *   node tools/replicability-metrics/index.mjs --json
 *   node tools/replicability-metrics/index.mjs --write   # updates the retained report
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeJsonArtifactAtomically } from "../evidence-freshness/index.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const write = args.includes("--write");
const root = resolve(process.cwd());

/** The four showcase games this pass measures. */
const GAME_ROUTES = ["aura-clash-showcase", "showcase-blockfall-reactor", "showcase-skyline-runner", "showcase-turbo-drift-circuit"];

/**
 * Modules that constitute the reusable game/visual layer.
 *
 * ## Two scopes, both reported, because one of them is easy to get wrong
 *
 * `visualOnly` is the art-direction/composition/framing subset — the layer the brief identified as
 * missing. `full` additionally includes the gameplay-kit and evidence modules a new game also inherits.
 *
 * Both are reported because quoting one against a baseline measured over the other produces a
 * meaningless number. That mistake was made once during this pass: a 7.84x "post-pass ratio" was
 * reported by dividing route-local lines by a 5-module visual subset while comparing it to a 3,072-line
 * baseline that had covered a much broader module set. Measuring both scopes with one tool makes the
 * comparison like-for-like and the error unrepeatable.
 */
const REUSABLE_VISUAL_MODULES = [
  "packages/engine/src/agent-api/GameSceneGeometryBindings.ts",
  "packages/engine/src/agent-api/GameSceneGeometryMath.ts",
  "packages/engine/src/agent-api/SceneGroundingUtils.ts",
  "packages/engine/src/agent-api/SubjectFramingUtils.ts",
  "packages/engine/src/agent-api/LayeredSceneComposition.ts",
  // Lighting is art direction: named mood presets, subject-relative placement, and per-subject rim placement
  // are exactly the kind of visual authoring routes were otherwise doing by hand. Omitting it undercounted the
  // reusable layer and hid the fact that Aura Clash already consumes a shared lighting API.
  "packages/rendering/src/LightingRig.ts"
];

/** The wider reusable game layer a new route also inherits. */
const REUSABLE_GAME_MODULES = [
  "packages/engine/src/agent-api/GameRuntime.ts",
  "packages/engine/src/agent-api/GameGenreKits.ts",
  "packages/engine/src/agent-api/GameAssetValidation.ts",
  "packages/engine/src/agent-api/GameEvidence.ts",
  "packages/engine/src/agent-api/GameAppRuntime.ts",
  "packages/engine/src/agent-api/GameSceneBridge.ts",
  "packages/engine/src/agent-api/GameInspector.ts",
  "packages/engine/src/agent-api/SceneSequencer.ts"
];

/** Modules added by this pass, so the delta is attributable rather than asserted. */
const MODULES_ADDED_THIS_PASS = [
  "packages/engine/src/agent-api/SubjectFramingUtils.ts",
  "packages/engine/src/agent-api/LayeredSceneComposition.ts"
];

/**
 * Modules that existed before this pass but gained reusable capability during it.
 *
 * Counted as pre-existing lines so the "added this pass" delta stays attributable to genuinely new modules
 * rather than being inflated by extending a file that was already there.
 */
const MODULES_EXTENDED_THIS_PASS = ["packages/rendering/src/LightingRig.ts"];

/**
 * Declarative reusable visual recipes a route can call instead of hand-authoring.
 *
 * Counted by name rather than inferred, because "is this genuinely reusable?" is a judgement about the
 * API's shape that a line count cannot make. Each entry must be parameterised and proven against at
 * least two materially different inputs by its own tests.
 */
const REUSABLE_VISUAL_RECIPES = [
  { id: "chase-subject-framing", api: "resolveChaseFraming", module: "packages/engine/src/agent-api/SubjectFramingUtils.ts" },
  { id: "platformer-depth-composition", api: "platformerCompositionSpec", module: "packages/engine/src/agent-api/LayeredSceneComposition.ts" }
];

/**
 * Baseline measured before this pass, retained so the delta is auditable.
 *
 * `reportedRouteLocalLines` / `reportedReusableLines` are the figures the assignment brief cited. They
 * are kept verbatim rather than corrected, because the point of a baseline is to be comparable, and
 * the note records why the derived 9.8x is not reproducible by this tool: the brief's 3,072 covered an
 * unstated module set, so its ratio cannot be recomputed. The `measured*` fields below are what this
 * tool actually derives, and are the numbers any claim should quote.
 */
const BASELINE = {
  reportedRouteLocalLines: 30_141,
  reportedReusableLines: 3_072,
  reportedRatio: 9.8,
  note: "The brief's 3,072-line reusable figure covered an unstated module set, so its 9.8x ratio is not reproducible from source. Quote the measured ratios below instead.",
  reusableVisualRecipes: 0
};

function countLines(absolutePath) {
  return readFileSync(absolutePath, "utf8").split("\n").length;
}

function listTsFiles(directory) {
  if (!existsSync(directory)) return [];
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(absolute);
  }
  return out;
}

/**
 * WS4 constant categories.
 *
 * The brief requires each route-local constant be *classified*, not merely counted, and that categories 2 and 3
 * be moved into reusable code. A bare count cannot distinguish "14 constants, all legitimate game design" from
 * "14 constants, half of them frozen asset dimensions" -- and those demand opposite responses. Counting alone was
 * how `CAR_SCENE_HEIGHT` survived two asset swaps while looking like a design decision.
 *
 * Classification is declared per constant rather than inferred, because the distinction is about *intent*: `35`
 * seconds of lap time and `0.439` units of road width are both bare numbers, and only one of them is a design
 * choice. A heuristic cannot tell them apart; a human decision recorded here can, and a reviewer can audit it.
 */
export const CONSTANT_CATEGORIES = Object.freeze({
  /** 1: Legitimate game-design constants. Stay in the route. */
  "gameplay-design": [
    "KO_FREEZE_TIME", "CLIP_BLEND_DURATION", "INPUT_BUFFER_LIFETIME_MS",
    "FOOT_IK_WEIGHT", "SPRING_LEAN_SCALE",
    "authoredLapSeconds", "gameplayPaceMultiplier", "opponentStartProgress", "opponentRacingLineOffset",
    /*
     * `TRACK_REFERENCE_Y` replaced `TRACK_SURFACE_Y` in WS-4.
     *
     * The old name claimed to *be* the track surface, and the route sampled wheel contact from it
     * — a frozen plane that could not represent camber, so tyres passed through the visible road.
     * The new constant is only the reference elevation the scene binding seats the track asset
     * against; per-wheel contact now comes from `racingScene.vehicleSurface()` sampling the road
     * mesh. That makes it a genuine scene-composition choice rather than a baked physical
     * approximation, which is why it stays classified here while the thing it replaced was a defect.
     */
    "TRACK_REFERENCE_Y", "CAR_TARGET_MAX_DIMENSION", "cabinetTargetSize", "SCENE_SIZE",
    // The *input* depth of the world plane. Consumers read the resolved value back from the binding.
    "WORLD_PLANE_DEPTH", "GAMEPLAY_ACTOR_DEPTH", "opponentTargetMaxDimension", "CONTACT_CLEARANCE", "chaseSmoothing", "chaseFov",
    "raceLapsToWin", "SIGNAGE_TEXT_SIZE", "TRACK_PROP_MAX_SPEED_SCENE", "TELEGRAPH_SECONDS",
    // Turbo's certified route and drift presentation choices are intentional
    // design inputs, not stale asset dimensions. The track width is consumed by
    // the route-bound racing kit; plume count and review backdrop distance tune
    // the visible feedback family.
    "FORMULA_ASPHALT_WIDTH", "VISUAL_DRIFT_PLUME_COUNT", "reviewBackdropDistance", "HEADING_CORRECTION_GAIN",
    "PUNCH_DURATION", "SHARD_LIFETIME", "SHARD_SPEED_MIN", "SHARD_SPEED_MAX", "ATTRACT_IDLE_SECONDS", "DEFAULT_WINDOW_SECONDS"
  ],
  /**
   * 2: Reusable genre defaults. Belong in a shared preset.
   *
   * `AURA_CLASH_FPS` is the frame rate the route's frame data is expressed in. It is a
   * genre default rather than a design choice -- fighting-game frame data is universally
   * quoted at 60fps -- and it exists in the route because `solveCombatFrameData` returns
   * frames while the route's move table is in seconds. The engine could own the
   * conversion; until it does, this is honestly a genre default sitting in a route.
   */
  "genre-default": [
    "AURA_CLASH_FPS", "DEFAULT_FPS", "QUANT_DECIMALS", "SCATTER_QUANT",
    "BACKDROP_LOD_HYSTERESIS", "BACKDROP_NEAR_LOD_MAX_DISTANCE", "MAX_DT", "QUANTUM", "RELAY_SENSOR_MARGIN"
  ],
  /** 3: Asset-derived values that must be computed, never restated. */
  "asset-derived": [],
  /** 4: Temporary visual patches that should be removed. */
  "temporary-patch": [],
  /**
   * 5: Public API gaps -- a value a route must hardcode because no API exposes it.
   *
   * Empty: `WORLD_DEPTH_Z` was the only entry, and it existed because `GamePlatformerSceneBinding` accepted
   * `worldZ` as an input without surfacing the resolved value, forcing a second copy in the route. The binding
   * now exposes `worldZ`, so the gap is closed rather than reclassified.
   */
  "api-gap": []
});

/** Reverse lookup: constant name -> category. */
function categoryForConstant(name) {
  for (const [category, names] of Object.entries(CONSTANT_CATEGORIES)) {
    if (names.includes(name)) return category;
  }
  return "unclassified";
}

/**
 * Bare numeric literals bound to a route-level `const`.
 *
 * Deliberately narrow: this matches `const NAME = 1.23;` at top level, which is the shape a
 * rediscovered magic value takes. It does not match values derived from an expression, because those
 * already show their derivation.
 */
/**
 * Paths whose contents are machine-generated and must not count as hand-authored.
 *
 * ## Why this needed widening
 *
 * The original rule was `path.includes("/generated/")`, which misses the CLI's typed asset map. That map is
 * `DEFAULT_AURA_ASSET_TYPEGEN` (`src/aura-assets.ts`), written by `writeTypedAssets` from
 * `aura.assets.json` — the root repository copy is 43,643 lines of it. Aura Clash keeps its own copy at
 * `apps/aura-clash-showcase/src/aura-assets.ts`, and at **12,943 lines that was 55% of everything the metric
 * attributed to Aura Clash as route-local authoring**.
 *
 * Counting it inflated the headline ratio and, worse, pointed remediation at the wrong target: it made Aura
 * Clash look like an art-direction problem when more than half the measured bulk was a typegen artifact no
 * developer writes or reads. A metric that misdirects effort is worse than no metric.
 */
function isGeneratedSource(relativePath) {
  if (relativePath.includes("/generated/")) return true;
  // CLI typed asset map, wherever a project keeps it.
  if (/(^|\/)src\/aura-assets\.ts$/.test(relativePath)) return true;
  return false;
}

const MAGIC_CONSTANT_PATTERN = /^const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*-?\d+(?:\.\d+)?\s*;/gm;

/** References that prove a value is computed from typed asset metadata rather than restated. */
const ASSET_DERIVED_PATTERNS = [
  /assets\.[A-Za-z0-9_]+\.bounds/g,
  /\bresolveChaseFraming\s*\(/g,
  /\bresolveSubjectRenderedSize\s*\(/g,
  /\bgroundedRenderedAssetPlacement\s*\(/g,
  /\bgroundedAssetPlacement\s*\(/g,
  /\bboundsFromAsset\s*\(/g,
  /\bnormalizedRenderScaleForTarget[A-Za-z]*\s*\(/g
];

function measureRoute(routeId) {
  const srcDir = resolve(root, "apps", routeId, "src");
  const files = listTsFiles(srcDir);
  let handAuthored = 0;
  let generated = 0;
  const magicConstants = [];
  let assetDerived = 0;

  for (const file of files) {
    const relativePath = file.slice(root.length + 1).replace(/\\/g, "/");
    const lines = countLines(file);
    if (isGeneratedSource(relativePath)) {
      generated += lines;
      continue;
    }
    handAuthored += lines;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(MAGIC_CONSTANT_PATTERN)) {
      magicConstants.push({
        file: relativePath,
        name: match[1],
        literal: match[0].trim(),
        category: categoryForConstant(match[1])
      });
    }
    for (const pattern of ASSET_DERIVED_PATTERNS) {
      assetDerived += [...source.matchAll(pattern)].length;
    }
  }

  return {
    routeId,
    handAuthoredLines: handAuthored,
    generatedLines: generated,
    magicConstantCount: magicConstants.length,
    magicConstants,
    assetDerivedValueCount: assetDerived
  };
}

/**
 * Route ids appearing inside reusable engine modules.
 *
 * A named showcase route inside engine code is a route-specific exception: it makes the shared module
 * carry knowledge of one consumer, which is precisely how a shared file stops being reusable while
 * still improving the line-count ratio.
 */
function findRouteSpecificExceptionsInEngine() {
  const exceptions = [];
  for (const relativePath of REUSABLE_VISUAL_MODULES) {
    const absolute = resolve(root, relativePath);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, "utf8");
    // Strip comments: a comment naming the route that motivated a rule is documentation, not a branch.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const routeId of GAME_ROUTES) {
      if (code.includes(routeId)) exceptions.push({ module: relativePath, routeId });
    }
    for (const bareName of ["turbo", "skyline", "blockfall", "auraClash", "aura-clash"]) {
      if (new RegExp(`["'\`][^"'\`]*${bareName}`, "i").test(code)) {
        exceptions.push({ module: relativePath, routeId: `string-literal:${bareName}` });
      }
    }
  }
  return exceptions;
}

const routes = GAME_ROUTES.map(measureRoute).sort((a, b) => b.handAuthoredLines - a.handAuthoredLines);
/*
 * Hand-authored source paths, kept OUT of the report.
 *
 * Cluster detection needs the file list, but absolute paths are machine-specific and would make the retained
 * report fail its own "matches a fresh measurement" check on another checkout. Generated typegen is excluded so
 * duplication is never reported against CLI output.
 */
const routeSourcePaths = GAME_ROUTES.flatMap((routeId) => collectHandAuthoredFiles(routeId));
const routeLocalLines = routes.reduce((sum, route) => sum + route.handAuthoredLines, 0);
const generatedLines = routes.reduce((sum, route) => sum + route.generatedLines, 0);

function measureModules(relativePaths) {
  return relativePaths
    .filter((relativePath) => existsSync(resolve(root, relativePath)))
    .map((relativePath) => ({
      module: relativePath,
      lines: countLines(resolve(root, relativePath)),
      addedThisPass: MODULES_ADDED_THIS_PASS.includes(relativePath),
      extendedThisPass: MODULES_EXTENDED_THIS_PASS.includes(relativePath)
    }));
}

const visualModules = measureModules(REUSABLE_VISUAL_MODULES);
const gameModules = measureModules(REUSABLE_GAME_MODULES);
const reusableModules = [...visualModules, ...gameModules];
const reusableVisualLines = visualModules.reduce((sum, entry) => sum + entry.lines, 0);
const reusableFullLines = reusableModules.reduce((sum, entry) => sum + entry.lines, 0);
const addedThisPassLines = reusableModules
  .filter((entry) => entry.addedThisPass)
  .reduce((sum, entry) => sum + entry.lines, 0);
// Pre-pass totals, derived by subtraction so the delta is attributable to named modules.
const priorVisualLines = reusableVisualLines - addedThisPassLines;
const priorFullLines = reusableFullLines - addedThisPassLines;

const recipes = REUSABLE_VISUAL_RECIPES.map((recipe) => {
  const absolute = resolve(root, recipe.module);
  const present = existsSync(absolute) && readFileSync(absolute, "utf8").includes(`export function ${recipe.api}`);
  return { ...recipe, present };
});

/**
 * Asset-admission pass/fail counts and average candidate screening attempts.
 *
 * ## Why these come from retained screening reports
 *
 * The brief names both as replicability measures, and they answer the question the whole asset pipeline
 * exists to answer: *how many candidates does a developer have to try before one is usable?* Three unusable
 * hero vehicles shipped before deterministic selection existed, and a metric that cannot see that count
 * cannot show it improving.
 *
 * Read from `tests/reports/asset-screening/*.json` rather than recomputed, because those are the retained
 * records of real screening runs. A recomputation would measure this tool's opinion instead of what the
 * pipeline actually did.
 */
function measureAssetAdmission() {
  const dir = resolve(root, "tests/reports/asset-screening");
  if (!existsSync(dir)) return { intents: 0, candidatesScreened: 0, admitted: 0, rejected: 0, averageAttemptsPerIntent: null, rejectionReasonsPreserved: 0 };
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  let candidatesScreened = 0;
  let admitted = 0;
  let rejected = 0;
  let reasonsPreserved = 0;
  let intentsWithCandidates = 0;
  for (const name of files) {
    let record;
    try { record = JSON.parse(readFileSync(join(dir, name), "utf8")); } catch { continue; }
    const candidates = Array.isArray(record?.candidates) ? record.candidates : [];
    if (candidates.length > 0) intentsWithCandidates += 1;
    for (const candidate of candidates) {
      candidatesScreened += 1;
      if (candidate?.accepted === true) admitted += 1;
      else {
        rejected += 1;
        // The brief requires every rejection keep machine-readable reasons; count the ones that did.
        if (Array.isArray(candidate?.reasons) && candidate.reasons.length > 0) reasonsPreserved += 1;
      }
    }
  }
  return {
    intents: files.length,
    candidatesScreened,
    admitted,
    rejected,
    // Attempts per intent: the headline "how many tries to find a usable asset" figure.
    averageAttemptsPerIntent: intentsWithCandidates > 0 ? round2(candidatesScreened / intentsWithCandidates) : null,
    rejectionReasonsPreserved: reasonsPreserved
  };
}

/**
 * Evidence-freshness failures, read from the same explainer the release gate uses.
 *
 * Recomputing freshness here would create a second producer of the same judgement -- the exact ownership
 * ambiguity the evidence system exists to prevent. So this shells the authoritative explainer and parses
 * its own summary line.
 */
function measureEvidenceFreshness() {
  try {
    const stdout = execFileSync("node", [resolve(root, "tools/evidence-freshness/explain-staleness.mjs")], {
      cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024
    });
    const match = /(\d+) of (\d+) artifact\(s\) are not provably current/.exec(stdout);
    if (!match) return { stale: null, audited: null, note: "explainer output did not include a summary line" };
    return { stale: Number(match[1]), audited: Number(match[2]) };
  } catch (error) {
    const stdout = (error?.stdout ?? "").toString();
    const match = /(\d+) of (\d+) artifact\(s\) are not provably current/.exec(stdout);
    if (match) return { stale: Number(match[1]), audited: Number(match[2]) };
    return { stale: null, audited: null, note: "explainer failed to run" };
  }
}

/**
 * Repeated code clusters across route sources.
 *
 * "Where practical" in the brief, and this is the practical form: normalised runs of >= 6 consecutive
 * non-trivial lines appearing in more than one route file. That length is long enough to skip shared idiom
 * (imports, a `.position(...)` call) and short enough to catch a copied scene-setup block, which is the
 * duplication this pass set out to replace with reusable calls.
 *
 * Deliberately not a similarity metric: an exact-run count is reproducible and explainable, and a fuzzy
 * score would invite tuning it until the number looked good.
 */
/** Hand-authored source files for one route, excluding generated output. */
function collectHandAuthoredFiles(routeId) {
  return listTsFiles(resolve(root, "apps", routeId, "src"))
    .filter((file) => !isGeneratedSource(file.slice(root.length + 1).replace(/\\/g, "/")))
    .map((path) => ({ routeId, path }));
}

function measureRepeatedClusters(routeFiles, windowSize = 6) {
  const seen = new Map();
  for (const { routeId, path } of routeFiles) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 24 && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*"));
    for (let index = 0; index + windowSize <= lines.length; index += 1) {
      const key = lines.slice(index, index + windowSize).join("\n");
      const entry = seen.get(key) ?? new Set();
      entry.add(routeId);
      seen.set(key, entry);
    }
  }
  const shared = [...seen.entries()].filter(([, routeIds]) => routeIds.size > 1);
  return {
    windowSize,
    clusters: shared.length,
    routesInvolved: [...new Set(shared.flatMap(([, routeIds]) => [...routeIds]))].sort()
  };
}

const assetAdmission = measureAssetAdmission();
const evidenceFreshness = measureEvidenceFreshness();
const repeatedClusters = measureRepeatedClusters(routeSourcePaths);

const exceptions = findRouteSpecificExceptionsInEngine();
const magicConstants = routes.flatMap((route) => route.magicConstants.map((entry) => ({ routeId: route.routeId, ...entry })));
const assetDerivedValues = routes.reduce((sum, route) => sum + route.assetDerivedValueCount, 0);

// Aura Clash dominates the aggregate and was not part of this pass; reporting both keeps the headline
// number honest without hiding the outlier.
const outlier = routes.find((route) => route.routeId === "aura-clash-showcase");
const routeLocalExcludingOutlier = routeLocalLines - (outlier?.handAuthoredLines ?? 0);

const report = {
  schema: "aura3d-replicability-metrics/1.0",
  generatedAt: new Date().toISOString(),
  baseline: BASELINE,
  current: {
    routeLocalLines,
    generatedLines,
    reusableVisualLines,
    reusableFullLayerLines: reusableFullLines,
    reusableLinesAddedThisPass: addedThisPassLines,
    routeLocalMagicConstants: magicConstants.length,
    constantsByCategory: Object.fromEntries(
      [...new Set(magicConstants.map((entry) => entry.category))]
        .sort()
        .map((category) => [category, magicConstants.filter((entry) => entry.category === category).length])
    ),
    unclassifiedConstants: magicConstants.filter((entry) => entry.category === "unclassified").length,
    assetDerivedValues,
    reusableVisualRecipes: recipes.filter((recipe) => recipe.present).length,
    routeSpecificExceptionsInEngine: exceptions.length,
    // The four measures the brief names that this report previously omitted (defect 113).
    repeatedCodeClusters: repeatedClusters.clusters,
    assetAdmission,
    averageCandidateScreeningAttempts: assetAdmission.averageAttemptsPerIntent,
    evidenceFreshnessFailures: evidenceFreshness.stale
  },
  ratios: {
    // Visual-only scope: the art-direction layer the brief identified as missing.
    visualOnlyBefore: round2(routeLocalLines / priorVisualLines),
    visualOnlyAfter: round2(routeLocalLines / reusableVisualLines),
    visualOnlyAfterExcludingAuraClashOutlier: round2(routeLocalExcludingOutlier / reusableVisualLines),
    // Full reusable game layer, which is what a new route actually inherits.
    fullLayerBefore: round2(routeLocalLines / priorFullLines),
    fullLayerAfter: round2(routeLocalLines / reusableFullLines),
    fullLayerAfterExcludingAuraClashOutlier: round2(routeLocalExcludingOutlier / reusableFullLines)
  },
  routes,
  reusableModules,
  recipes,
  magicConstants,
  routeSpecificExceptionsInEngine: exceptions,
  repeatedClusters,
  evidenceFreshness
};

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

const reportPath = resolve(root, "tests/reports/replicability-metrics/report.json");
if (write) writeJsonArtifactAtomically(reportPath, report);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Replicability metrics\n");
  console.log("route-local (hand-authored) lines, by route:");
  for (const route of routes) {
    console.log(`  ${route.routeId.padEnd(30)} hand=${String(route.handAuthoredLines).padStart(6)} generated=${String(route.generatedLines).padStart(5)} magicConsts=${String(route.magicConstantCount).padStart(3)} assetDerived=${String(route.assetDerivedValueCount).padStart(3)}`);
  }
  console.log(`\nreusable visual/art-direction layer: ${reusableVisualLines} lines`);
  for (const entry of visualModules) {
    const note = entry.addedThisPass ? "  (added this pass)" : entry.extendedThisPass ? "  (extended this pass)" : "";
    console.log(`  ${entry.module.padEnd(62)} ${String(entry.lines).padStart(5)}${note}`);
  }
  console.log(`reusable wider game layer:           ${reusableFullLines - reusableVisualLines} lines`);
  for (const entry of gameModules) console.log(`  ${entry.module.padEnd(62)} ${String(entry.lines).padStart(5)}`);
  console.log(`reusable total:                      ${reusableFullLines} lines (+${addedThisPassLines} this pass)`);
  console.log(`\nratio route-local : reusable        before -> after`);
  console.log(`  visual-only scope                 ${report.ratios.visualOnlyBefore}x -> ${report.ratios.visualOnlyAfter}x`);
  console.log(`  visual-only excl. Aura Clash             -> ${report.ratios.visualOnlyAfterExcludingAuraClashOutlier}x`);
  console.log(`  full reusable game layer          ${report.ratios.fullLayerBefore}x -> ${report.ratios.fullLayerAfter}x`);
  console.log(`  full layer excl. Aura Clash              -> ${report.ratios.fullLayerAfterExcludingAuraClashOutlier}x`);
  console.log(`  brief's reported baseline         ${BASELINE.reportedRatio}x (not reproducible: ${BASELINE.note})`);
  console.log(`\nroute-local magic constants      ${magicConstants.length}`);
  for (const [category, count] of Object.entries(report.current.constantsByCategory)) {
    console.log(`  [${category}] ${count}`);
    for (const entry of magicConstants.filter((constant) => constant.category === category)) {
      console.log(`      ${entry.routeId}: ${entry.name}`);
    }
  }
  if (report.current.unclassifiedConstants > 0) {
    console.log(`  ${report.current.unclassifiedConstants} constant(s) are UNCLASSIFIED -- classify them in CONSTANT_CATEGORIES`);
  }
  console.log(`asset-derived values             ${assetDerivedValues}`);
  console.log(`reusable visual recipes          ${report.current.reusableVisualRecipes}`);
  for (const recipe of recipes) console.log(`  ${recipe.present ? "present" : "MISSING"}  ${recipe.id} -> ${recipe.api}()`);
  console.log(`route-specific exceptions in engine code  ${exceptions.length}`);
  // The four measures the brief names that this report previously omitted.
  console.log(`repeated code clusters (>=${repeatedClusters.windowSize} lines, 2+ routes)  ${repeatedClusters.clusters}` +
    (repeatedClusters.clusters > 0 ? `  [${repeatedClusters.routesInvolved.join(", ")}]` : ""));
  console.log(`asset admission                  ${assetAdmission.admitted} admitted / ${assetAdmission.rejected} rejected ` +
    `across ${assetAdmission.candidatesScreened} candidates in ${assetAdmission.intents} intent(s)`);
  console.log(`  rejection reasons preserved     ${assetAdmission.rejectionReasonsPreserved}/${assetAdmission.rejected}`);
  console.log(`average screening attempts/intent ${assetAdmission.averageAttemptsPerIntent ?? "n/a"}`);
  console.log(`evidence freshness failures      ${evidenceFreshness.stale ?? "n/a"}` +
    (evidenceFreshness.audited === null ? "" : ` of ${evidenceFreshness.audited} audited`) +
    (evidenceFreshness.note ? `  (${evidenceFreshness.note})` : ""));
  for (const exception of exceptions) console.log(`  ${exception.module}: ${exception.routeId}`);
  if (write) console.log(`\nwrote ${reportPath.slice(root.length + 1)}`);
}

// A route-specific exception inside the reusable layer defeats the purpose of the measurement.
if (exceptions.length > 0) process.exitCode = 1;
/*
 * An unclassified route-local constant fails the gate.
 *
 * Without this, a new hardcoded value would simply appear in the count and nobody would decide whether it is a
 * design choice or a frozen asset dimension. Forcing classification is what keeps the WS4 audit alive instead of
 * being a snapshot that decays.
 */
if (report.current.unclassifiedConstants > 0) process.exitCode = 1;
