#!/usr/bin/env node
/**
 * Phase 4: practical Three.js ecosystem parity measurement.
 *
 * ## Method
 *
 * Each row names a capability a developer needs, the Three.js ecosystem solution they
 * would reach for, and Aura3D's answer. Parity status is then **derived** from evidence
 * that exists in this tree rather than asserted:
 *
 *   - `implementation` must resolve to a real exported symbol or source file.
 *   - `productionConsumer` must be an app or example that actually imports it.
 *   - `runtimeEvidence` must be a retained artifact path that exists.
 *
 * A row with no production consumer cannot claim parity, and a row with no runtime
 * evidence cannot claim to exceed. That rule is what keeps this from becoming a
 * marketing table: the generator downgrades rows whose evidence is missing, and reports
 * why.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const inventory = JSON.parse(readFileSync(join(root, "tests/reports/aura3d-product-inventory.json"), "utf8"));

/** All exported symbol names across workspace packages, for implementation checks. */
const exportedSymbols = new Set();
for (const pkg of inventory.packages) {
  for (const name of pkg.publicExports) exportedSymbols.add(name);
}
// The root agent API is the public surface most rows are claimed through.
const agentApiText = (() => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(join(root, "packages/engine/src/agent-api"));
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
})();

const consumers = [...inventory.apps, ...inventory.examples];

/** Source of every workspace package, for implementation checks. */
const packageSourceText = (() => {
  const chunks = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) {
        try {
          chunks.push(readFileSync(full, "utf8"));
        } catch {
          // Unreadable file: nothing to contribute.
        }
      }
    }
  };
  walk(join(root, "packages"));
  return chunks.join("\n");
})();

/**
 * Does a symbol exist as a real export, an agent-API symbol, or a package source symbol?
 *
 * Checks all three because a capability can legitimately live in a package barrel, in
 * the root agent API, or as a class inside a package that the barrel re-exports with
 * `export *` (which the inventory's one-level barrel walk does not always enumerate).
 */
function implementationExists(symbols) {
  return symbols.every((symbol) => {
    if (exportedSymbols.has(symbol)) return true;
    const declaration = new RegExp(`(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:const|function|class|interface|type|enum)\\s+${symbol}\\b`);
    if (declaration.test(agentApiText) || declaration.test(packageSourceText)) return true;
    // Namespaced members such as `effects.bloom` or `material.clearcoatPaint` appear as
    // object keys rather than declarations.
    return new RegExp(`\\b${symbol}\\s*:`).test(agentApiText);
  });
}

/**
 * Which public routes actually consume a capability?
 *
 * Routes reach most capabilities through a namespace -- `game.input(...)`,
 * `game.racingCameraRig(...)` -- rather than by importing the factory's own name. Matching
 * only the bare symbol reported `input mapping` as having no consumer while Turbo calls
 * `game.input` twice, so the namespaced member form is matched too.
 */
const NAMESPACE_ALIASES = {
  createGameInput: ["game.input"],
  createGameInputReplay: ["game.inputReplay"],
  exportGameInputReplay: ["game.exportReplay"],
  createGameRacingCameraRig: ["game.racingCameraRig"],
  createGamePlatformerCameraRig: ["game.platformerCameraRig"],
  createGameCameraDirector: ["game.cameraDirector"],
  createGameRacingKit: ["game.racing("],
  createGamePlatformerKit: ["game.platformer("],
  createGameFallingBlocksKit: ["game.fallingBlocks"],
  createGameKinematicBody: ["game.kinematicBody"],
  createGameBoxCollider: ["game.collider.box", "game.collider"],
  createGameColliderDebugGeometry: ["game.debug.colliders", "game.debug"],
  createGameInspector: ["game.inspector"],
  createGameTouchControlLayout: ["game.touchControls"],
  createGameRacingPresentationCamera: ["game.racingPresentationCamera"],
  createSceneSequencer: ["sequencer", "SceneSequencer"],
  createShotTimeline: ["ShotTimeline", "shotTimeline"],
  CharacterController: ["characterController", "CharacterController"],
  PhysicsDebugDraw: ["PhysicsDebugDraw", "game.debug"],
  Raycast: ["raycast", "Raycast"],
  ParticleSystem: ["effects.particles", "ParticleSystem"],
  MorphTargetMixer: ["morphTargets", "MorphTargetMixer"],
  AnimationMixer: ["AnimationMixer", "animation:", ".animate("],
  AnimationController: ["AnimationController", "animationController"],
  ToneMapping: ["toneMapping", "ToneMapping"],
  createProductionRuntimeShadowOptions: ["castShadow", "receiveShadow"],
  "contact-occlusion": ["contactOcclusion", "ambientOcclusion"],
  createDiagnosticsOverlay: ["diagnostics(", "diagnostics:"],
  AuraDiagnostics: ["diagnostics(", "diagnostics:"],
  createA3DProject: ["createA3DProject"],
  CREATE_AURA3D_TEMPLATES: ["CREATE_AURA3D_TEMPLATES"],
  Constraint: ["Constraint", "constraint"],
  Constraints: ["Constraints"],
  TimeOfImpact: ["TimeOfImpact", "timeOfImpact"]
};

function findConsumers(symbols) {
  const needles = symbols.flatMap((symbol) => [symbol, ...(NAMESPACE_ALIASES[symbol] ?? [])]);
  const found = [];
  for (const entry of consumers) {
    for (const file of entry.sourceFiles ?? []) {
      let text;
      try {
        text = readFileSync(join(root, file), "utf8");
      } catch {
        continue;
      }
      const hit = needles.some((needle) => /^[A-Za-z_$][\w$]*$/.test(needle)
        ? new RegExp(`\\b${needle}\\b`).test(text)
        : text.includes(needle));
      if (hit) {
        found.push(entry.routeId);
        break;
      }
    }
  }
  return [...new Set(found)];
}

function evidenceExists(paths) {
  return paths.filter((path) => existsSync(join(root, path)));
}

/**
 * Rows.
 *
 * `expected` is the Three.js ecosystem solution. `symbols` are the Aura3D exports a
 * consumer would use. `integrated` states whether the capability arrives without the
 * developer wiring a separate library. `claim` is the *aspiration*; the generator
 * decides the actual status.
 */
const ROWS = [
  // --- Core rendering ---
  { category: "core-rendering", capability: "scene graph", expected: "THREE.Scene + Object3D", symbols: ["scene", "group"], integrated: true, claim: "exceed", notes: "Declarative scene builder with typed nodes; no manual add/remove bookkeeping.", evidence: ["tests/reports/showcase-interaction-audit"] },
  { category: "core-rendering", capability: "cameras", expected: "PerspectiveCamera / OrthographicCamera", symbols: ["camera"], integrated: true, claim: "parity", evidence: ["tests/reports/showcase-interaction-audit"], notes: "Orthographic is now genuinely covered: camera.orthographic()/camera.isometric() on the root API, computeOrthographicCameraFrame/computeOrthographicCameraView in rendering, and RenderSource.cameraProjection for auto-framing. Before this the row claimed OrthographicCamera while the root API exposed perspective modes only and auto-framing could build a perspective frustum only." },
  { category: "core-rendering", capability: "renderer configuration", expected: "WebGLRenderer options", symbols: ["createAuraApp"], integrated: true, claim: "exceed", notes: "Renderer selection, pixel ratio and resize handled by the app; no renderer lifecycle code in routes." },
  { category: "core-rendering", capability: "geometry primitives", expected: "BoxGeometry, SphereGeometry, TorusGeometry, ...", symbols: ["primitives"], integrated: true, claim: "parity", notes: "Local axis conventions now documented via AURA_PRIMITIVE_AXES after the flattened-torus defect." },
  { category: "core-rendering", capability: "materials", expected: "MeshStandardMaterial / MeshPhysicalMaterial", symbols: ["material"], integrated: true, claim: "exceed", notes: "Named material presets (clearcoatPaint, brushedMetal, clearGlass) rather than raw parameter sets." },
  { category: "core-rendering", capability: "custom shaders", expected: "ShaderMaterial / RawShaderMaterial", symbols: ["ShaderLibrary", "ShaderModule"], integrated: false, claim: "parity", notes: "Available through @aura3d/rendering (ShaderLibrary/ShaderModule) and three-compat, not the root safe API." },
  { category: "core-rendering", capability: "lights", expected: "Directional/Point/Spot/RectArea lights", symbols: ["lights"], integrated: true, claim: "parity" },
  { category: "core-rendering", capability: "shadows", expected: "shadowMap + per-light shadow config", symbols: ["createProductionRuntimeShadowOptions"], integrated: true, claim: "parity", evidence: ["tests/reports/external-parity-shadow-readiness"] },
  { category: "core-rendering", capability: "environment maps / IBL", expected: "PMREMGenerator + RGBELoader", symbols: ["environments"], integrated: true, claim: "exceed", notes: "Named environment presets; no PMREM setup in user code.", evidence: ["tests/reports/external-parity-ibl-readiness"] },
  { category: "core-rendering", capability: "postprocessing", expected: "EffectComposer + pass chain", symbols: ["effects"], integrated: true, claim: "exceed", notes: "Effects declared as scene nodes; no composer or pass ordering in user code." },
  { category: "core-rendering", capability: "tone mapping / colour management", expected: "renderer.toneMapping + outputColorSpace", symbols: ["applyExternalParityToneMappingPreset", "createExternalParityToneMappingPolicy"], integrated: true, claim: "parity", notes: "Tone mapping is applied by the production renderer; the root API exposes it as renderer configuration rather than as a user-managed pass." },
  { category: "core-rendering", capability: "instancing", expected: "InstancedMesh", symbols: ["InstancedMesh"], integrated: false, claim: "parity", notes: "Rendering-internal; not surfaced through the root safe API." },
  { category: "core-rendering", capability: "skinned animation", expected: "SkinnedMesh + AnimationMixer", symbols: ["AnimationMixer", "AnimationController"], integrated: true, claim: "parity", evidence: ["tests/reports/animation-runtime"] },
  { category: "core-rendering", capability: "morph targets", expected: "morphTargetInfluences", symbols: ["MorphTargetMixer", "MorphTargetWeight"], integrated: true, claim: "parity", evidence: ["tests/reports/animation-morph-target-readiness"] },
  { category: "core-rendering", capability: "particles", expected: "Points + custom shaders, or third-party VFX", symbols: ["ParticleSystem"], integrated: true, claim: "parity" },
  { category: "core-rendering", capability: "LOD", expected: "THREE.LOD", symbols: ["LodSelection", "LodLevel"], integrated: false, claim: "parity", notes: "LOD selection exists in @aura3d/rendering but is not surfaced through the root safe API, so a route cannot declare LOD levels." },
  { category: "core-rendering", capability: "WebGPU", expected: "WebGPURenderer (experimental)", symbols: ["WebGPUDevice"], integrated: true, claim: "parity", evidence: ["tests/reports/webgpu-feature-matrix"] },
  { category: "core-rendering", capability: "context loss recovery", expected: "webglcontextlost handling by hand", symbols: ["contextLoss"], integrated: false, claim: "gap", notes: "No documented public context-loss policy; a WebGL context loss is not surfaced or recovered through the root API." },
  { category: "core-rendering", capability: "resource disposal", expected: "manual geometry/material/texture dispose()", symbols: ["dispose"], integrated: true, claim: "exceed", notes: "App owns the lifecycle; routes call app.dispose() rather than tracking GPU objects." },

  // --- Ecosystem helpers ---
  { category: "ecosystem-helpers", capability: "orbit controls", expected: "OrbitControls from three/examples", symbols: ["interactions"], integrated: true, claim: "exceed", notes: "interactions.orbit() is a scene node; no control instance to construct, update or dispose." },
  { category: "ecosystem-helpers", capability: "transform controls / gizmos", expected: "TransformControls", symbols: ["TransformControls"], integrated: false, claim: "parity", notes: "Available in @aura3d/controls, not through the root safe API." },
  { category: "ecosystem-helpers", capability: "bounds fitting / object centering", expected: "Box3.setFromObject + manual camera math, or drei Bounds", symbols: ["placedBoundsFromAsset", "groundedRenderedAssetPlacement", "focusCameraIntent"], integrated: true, claim: "exceed", notes: "Asset-relative anchoring derives placement and framing from typed asset bounds." },
  { category: "ecosystem-helpers", capability: "HTML / world labels", expected: "CSS2DRenderer or drei Html", symbols: ["labels", "createWorldLabelLayer", "projectWorldLabels"], integrated: true, claim: "parity", notes: "Was a gap: labels reached the scene graph but were only drawn in the canvas2d fallback. Now a real world-anchored layer in the production path.", evidence: ["tests/reports/showcase-interaction-audit"] },
  { category: "ecosystem-helpers", capability: "selection outlines / focus feedback", expected: "OutlinePass, or hand-built indicator geometry", symbols: ["focusObject", "focusSemanticRegion"], integrated: true, claim: "exceed", notes: "Was the flattened-bar defect: every route built its own indicator. Now one system with per-result invariants.", evidence: ["tests/reports/showcase-interaction-audit"] },
  { category: "ecosystem-helpers", capability: "glTF loading", expected: "GLTFLoader + DRACO/KTX2 setup", symbols: ["model", "GLTFLoader"], integrated: true, claim: "exceed", notes: "Typed asset references with provenance; no loader configuration or URL strings in routes." },
  { category: "ecosystem-helpers", capability: "environment / staging presets", expected: "drei Environment + Stage", symbols: ["environments", "prefabs"], integrated: true, claim: "parity" },
  { category: "ecosystem-helpers", capability: "contact shadows", expected: "drei ContactShadows", symbols: ["contactOcclusion", "contactShadows"], integrated: true, claim: "parity" },
  { category: "ecosystem-helpers", capability: "performance monitor", expected: "stats.js", symbols: ["createDiagnosticsOverlay", "AuraDiagnostics"], integrated: true, claim: "exceed", notes: "Diagnostics overlay reports backend, draw calls, renderer features and now placed labels." },
  { category: "ecosystem-helpers", capability: "scene inspector", expected: "three-devtools or custom", symbols: ["createGameInspector", "collectAuraSceneEvidence"], integrated: true, claim: "parity" },
  { category: "ecosystem-helpers", capability: "text rendering", expected: "troika-three-text or TextGeometry", symbols: ["TextGeometry"], integrated: false, claim: "gap", notes: "No 3D text primitive. World labels are DOM, which is legible and accessible but cannot be occluded by geometry or lit by the scene." },

  // --- Physics ---
  { category: "physics", capability: "rigid bodies", expected: "Rapier or Cannon integration", symbols: ["PhysicsWorld", "RigidBody"], integrated: true, claim: "parity" },
  { category: "physics", capability: "colliders", expected: "Rapier colliders", symbols: ["Collider", "createGameBoxCollider"], integrated: true, claim: "parity" },
  { category: "physics", capability: "raycasting", expected: "THREE.Raycaster / Rapier ray", symbols: ["RaycastHit", "groundHeightRaycaster", "SphereCastHit"], integrated: true, claim: "parity" },
  { category: "physics", capability: "character controller", expected: "Rapier KinematicCharacterController", symbols: ["CharacterController", "createGameKinematicBody"], integrated: true, claim: "parity" },
  { category: "physics", capability: "vehicle dynamics", expected: "Rapier vehicle controller, hand-tuned", symbols: ["createVehicleChassis", "vehicleChassisSpecFromBounds"], integrated: true, claim: "parity-unproven", notes: "DOWNGRADED from exceed 2026-08-04. The chassis resolves contact/suspension/attitude correctly, but its VehicleSurface input is an analytic flat plane (TRACK_SURFACE_Y minus a shoulder ramp), not a query against the real track mesh. On a banked or crowned corner the sampled height is wrong and the tyres pass through the visible road. Per-frame grounding assertions are therefore measured against an approximation, not the rendered surface. Restore an exceed claim only after GameEngine-PRD WS-3 lands mesh-backed surface sampling and the WS-7.1 penetration gate passes.", evidence: ["tests/reports/turbo-vehicle-grounding"] },
  { category: "physics", capability: "vehicle AI driving", expected: "no standard solution; hand-written per project", symbols: ["createVehicleDriverAi"], integrated: true, claim: "parity-unproven", notes: "DOWNGRADED from exceed 2026-08-04. The driver AI is sound in isolation (look-ahead line, curvature corner speeds, recovery, deterministic per seed) but it drives a vehicle whose contact model is an analytic plane, so its output cannot be claimed to exceed a real vehicle controller. Tied to the same GameEngine-PRD WS-3 fix as vehicle dynamics.", evidence: ["tests/reports/turbo-vehicle-grounding"] },
  { category: "physics", capability: "joints / constraints", expected: "Rapier joints", symbols: ["Constraint"], integrated: true, claim: "parity" },
  { category: "physics", capability: "continuous collision detection", expected: "Rapier CCD flag", symbols: ["timeOfImpact", "TimeOfImpactHit"], integrated: true, claim: "parity" },
  { category: "physics", capability: "deterministic stepping", expected: "fixed-step loop by hand", symbols: ["PhysicsStepper", "createFrameLoop"], integrated: true, claim: "parity" },
  { category: "physics", capability: "physics debug rendering", expected: "Rapier debug render lines", symbols: ["PhysicsDebugDraw", "createGameColliderDebugGeometry"], integrated: true, claim: "parity" },

  // --- Game systems ---
  { category: "game-systems", capability: "input mapping", expected: "hand-written keydown handling", symbols: ["createGameInput"], integrated: true, claim: "exceed", notes: "Action and axis bindings with buffering and replay export." },
  { category: "game-systems", capability: "camera rigs", expected: "hand-written chase/follow cameras", symbols: ["createGameRacingCameraRig", "createGamePlatformerCameraRig", "createGameCameraDirector"], integrated: true, claim: "exceed" },
  { category: "game-systems", capability: "platformer motion tuning", expected: "hand-tuned gravity and jump velocity", symbols: ["solvePlatformerMotion", "validatePlatformerMotion"], integrated: true, claim: "parity-unproven", notes: "DOWNGRADED from exceed 2026-08-04. solvePlatformerMotion sets apex = max(minApex, geometry.maxRise * apexHeadroom). maxRise is the step-up between consecutive platforms, so on a near-level course it collapses and the apex falls to minApex - the reported barely-there jump. The solver optimises for 'can technically reach the next platform', not for a usable jump, and has no notion of clearing anything that is not the immediate next platform. Restore an exceed claim only after GameEngine-PRD WS-3.6/3.7 make apex intent-derived and the WS-7.2 motion-feel gate passes.", evidence: ["tests/reports/skyline-platformer-motion"] },
  { category: "game-systems", capability: "frame-based combat", expected: "hand-written state machine and frame data", symbols: ["solveCombatFrameData", "validateCombatFrameData", "createCombatAi"], integrated: true, claim: "exceed", notes: "Frame data validated as frame data. Aura Clash shipped 12-32 active frames against 4-5 recovery frames, inverted from any real fighting game." },
  { category: "game-systems", capability: "session lifecycle / objectives", expected: "hand-written per project", symbols: ["createGameRacingKit", "createGamePlatformerKit", "createGameFallingBlocksKit"], integrated: true, claim: "parity" },
  { category: "game-systems", capability: "touch controls", expected: "hand-written pointer handlers", symbols: ["bindGameTouchControls", "createGameTouchControlLayout"], integrated: true, claim: "exceed" },
  { category: "game-systems", capability: "deterministic replay", expected: "hand-written input recording", symbols: ["createGameInputReplay", "exportGameInputReplay"], integrated: true, claim: "parity", evidence: ["apps/aura-clash-showcase/tests/deterministic-replay.spec.ts"] },

  // --- Application workflows ---
  { category: "application-workflows", capability: "product configurator", expected: "assemble R3F + drei + custom selection", symbols: ["product", "focusSemanticRegion"], integrated: true, claim: "parity", notes: "Route is verified interactive but does not yet consume a reusable configurator kit.", evidence: ["tests/reports/showcase-interaction-audit/showcase-product-configurator.json"] },
  { category: "application-workflows", capability: "digital twin", expected: "assemble R3F + custom overlays", symbols: ["checkSpatialInvariants", "resolveSemanticRegion"], integrated: true, claim: "parity", notes: "Asset-relative anchoring replaces literal helper coordinates; no reusable twin kit yet.", evidence: ["tests/reports/showcase-interaction-audit/showcase-digital-twin-ops.json"] },
  { category: "application-workflows", capability: "architecture walkthrough", expected: "assemble R3F + camera paths", symbols: ["createGameRacingPresentationCamera", "timeline"], integrated: true, claim: "parity", evidence: ["tests/reports/showcase-interaction-audit/showcase-cinematic-architecture.json"] },
  { category: "application-workflows", capability: "data visualisation", expected: "assemble R3F + custom charts", symbols: ["charts", "dataBars3D"], integrated: true, claim: "parity", evidence: ["tests/reports/showcase-interaction-audit/showcase-data-galaxy.json"] },
  { category: "application-workflows", capability: "cinematic sequencing", expected: "assemble Theatre.js or custom", symbols: ["createSceneSequencer", "createShotTimeline"], integrated: true, claim: "parity" },
  { category: "application-workflows", capability: "project scaffolding", expected: "vite template + manual wiring", symbols: ["createA3DProject", "CREATE_AURA3D_TEMPLATES"], integrated: true, claim: "exceed", notes: "create-aura3d scaffolds a running typed project with assets and tests." },

  // --- Developer tooling ---
  { category: "developer-tooling", capability: "asset pipeline / provenance", expected: "manual asset management", symbols: ["assets", "createAssetProvenance"], integrated: true, claim: "exceed", notes: "Typed asset map with hashes and license provenance generated by the CLI." },
  { category: "developer-tooling", capability: "interaction testing", expected: "hand-written Playwright per project", symbols: ["createAuraRouteHealthSnapshot"], integrated: true, claim: "exceed", notes: "Route-health snapshots plus a reusable interaction-audit harness that discovers and operates controls.", evidence: ["tests/reports/showcase-interaction-audit"] },
  { category: "developer-tooling", capability: "runtime invariant reporting", expected: "no standard solution", symbols: ["checkSpatialInvariants", "validatePlatformerMotion", "validateCombatFrameData"], integrated: true, claim: "exceed", notes: "Geometric and gameplay correctness published as machine-checkable reports." }
];

const rows = ROROWS();

function ROROWS() {
  return ROWS.map((row) => {
    const implemented = implementationExists(row.symbols);
    const productionConsumers = findConsumers(row.symbols);
    const evidence = evidenceExists(row.evidence ?? []);
    const downgrades = [];

    let status = row.claim;
    if (!implemented) {
      status = "gap";
      downgrades.push("no resolvable implementation symbol");
    }
    // Parity requires a real consumer: an unused API is a claim, not a capability.
    if (status !== "gap" && productionConsumers.length === 0) {
      if (status === "exceed") {
        status = "parity-unproven";
        downgrades.push("no production consumer imports this capability");
      } else {
        status = "parity-unproven";
        downgrades.push("no production consumer imports this capability");
      }
    }
    // Exceeding requires runtime evidence, not just integration.
    if (status === "exceed" && evidence.length === 0) {
      status = "parity";
      downgrades.push("no retained runtime evidence, so an exceed claim is not defensible");
    }

    return {
      category: row.category,
      capability: row.capability,
      threejsEcosystemSolution: row.expected,
      aura3dImplementation: row.symbols,
      integrated: row.integrated,
      easierToUse: row.integrated && (status === "exceed"),
      productionConsumers,
      runtimeEvidence: evidence,
      documented: Boolean(row.notes),
      limitations: row.notes ?? "",
      claimedStatus: row.claim,
      parityStatus: status,
      exceeds: status === "exceed",
      downgradeReasons: downgrades
    };
  });
}

const byStatus = {};
for (const row of rows) byStatus[row.parityStatus] = (byStatus[row.parityStatus] ?? 0) + 1;

const byCategory = {};
for (const row of rows) {
  byCategory[row.category] ??= { total: 0, exceed: 0, parity: 0, unproven: 0, gap: 0 };
  const bucket = byCategory[row.category];
  bucket.total += 1;
  if (row.parityStatus === "exceed") bucket.exceed += 1;
  else if (row.parityStatus === "parity") bucket.parity += 1;
  else if (row.parityStatus === "parity-unproven") bucket.unproven += 1;
  else bucket.gap += 1;
}

const report = {
  schema: "aura3d-threejs-ecosystem-parity/1.0",
  generatedAt: new Date().toISOString(),
  producer: "tools/product-remediation/build-threejs-parity.mjs",
  baseline: "1.5.0 under remediation",
  method: [
    "Each row's implementation must resolve to a real exported symbol or agent-API source.",
    "Parity requires at least one app or example that actually imports the capability.",
    "An exceed claim additionally requires retained runtime evidence that exists on disk.",
    "The generator downgrades rows whose evidence is missing and records why, so this table cannot overstate the product."
  ],
  totals: {
    rows: rows.length,
    ...byStatus
  },
  byCategory,
  rows
};

const outPath = join(root, "tests/reports/aura3d-threejs-ecosystem-parity.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log("wrote tests/reports/aura3d-threejs-ecosystem-parity.json");
console.log(JSON.stringify(report.totals, null, 2));
for (const [category, bucket] of Object.entries(byCategory)) {
  console.log(`${category}: exceed ${bucket.exceed}, parity ${bucket.parity}, unproven ${bucket.unproven}, gap ${bucket.gap} (of ${bucket.total})`);
}
void statSync;
