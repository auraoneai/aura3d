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
  /*
   * WS-1.6 — symbols corrected. This row reported `gap` for a generator fault, not a product one:
   * it grepped `MorphTargetMixer` and `MorphTargetWeight`, and NEITHER SYMBOL EXISTS. The real ones
   * are `MorphTargetMixerThreeCompat` (packages/animation/src/threejs-compatibility/MorphTargetMixer.ts,
   * exported from both the barrel and browser-index) and the `applyMorphTargets` /
   * `computeMorphTargetEnvelopeBounds` / `computeMorphTargetWeightedBounds` family in
   * packages/rendering/src/MorphTarget.ts. There is also a full public browser contract test:
   * tests/browser/createAuraApp-morph-targets.spec.ts, driving a harness that imports @aura3d/engine.
   *
   * So Aura3D had morph targets, a public API for them, and a browser test proving it, while the
   * parity table published "gap" — the mirror image of the fabrication defects elsewhere in P1, and
   * a reminder that a generator can understate as easily as overstate.
   */
  { category: "core-rendering", capability: "morph targets", expected: "morphTargetInfluences", symbols: ["MorphTargetMixerThreeCompat", "applyMorphTargets"], integrated: true, claim: "parity", evidence: ["tests/reports/animation-morph-target-readiness"] },
  { category: "core-rendering", capability: "particles", expected: "Points + custom shaders, or third-party VFX", symbols: ["ParticleSystem"], integrated: true, claim: "parity" },
  { category: "core-rendering", capability: "LOD", expected: "THREE.LOD", symbols: ["LodSelection", "LodLevel"], integrated: false, claim: "parity", notes: "LOD selection exists in @aura3d/rendering but is not surfaced through the root safe API, so a route cannot declare LOD levels." },
  { category: "core-rendering", capability: "WebGPU", expected: "WebGPURenderer (experimental)", symbols: ["WebGPUDevice"], integrated: true, claim: "parity", evidence: ["tests/reports/webgpu-feature-matrix"] },
  /*
   * WS-2.6 — CLOSED. Status moves `gap` -> `parity`, and the history is worth keeping.
   *
   * The row was correctly a gap, for a reason WS-1.6 had to sharpen first: `WebGL2Device.ts:349-350` had
   * listened for `webglcontextlost`/`webglcontextrestored` and acted on them for a long time. The device
   * layer was never the gap — nothing *surfaced* it, so the only symptom reaching a developer was a canvas
   * that quietly stopped updating. The vaguer original note ("context loss is not handled") would have
   * invited closing this row by pointing at those listeners.
   *
   * Now surfaced through the root API as `app.onDeviceLost()`, `app.onDeviceRestored()` and
   * `app.deviceLost()`, on BOTH render paths — the production bridge and the agent-runtime path. Wiring
   * only the production one would have shipped an API that does nothing for the common case, since a
   * primitive-only scene is not production-eligible; the test reported zero events until the second path
   * was wired.
   *
   * Evidence: `tests/browser/context-loss-recovery.spec.ts` provokes a real loss with
   * `WEBGL_lose_context` through a harness that imports only `@aura3d/engine`, and asserts the event
   * fires, the flag flips, restoration is observed, and unsubscribing detaches.
   */
{ category: "core-rendering", capability: "context loss recovery", expected: "webglcontextlost handling by hand", symbols: ["onDeviceLost", "onDeviceRestored"], integrated: true, claim: "parity", notes: "Closed by WS-2.6. app.onDeviceLost(), app.onDeviceRestored() and app.deviceLost() surface WebGL context loss through the root API, on both the production bridge and the agent-runtime path — the latter matters because a primitive-only scene is not production-eligible, so wiring only the bridge would have delivered an API that does nothing for the common case. Subscriptions registered before the renderer mounts are held and attached on arrival, so a developer does not have to await ready() first. Unsubscribe is keyed per listener rather than a flat list, which fixed a double-subscription leak: a listener registered pre-mount got two controller subscriptions and kept firing after unsubscribe. Not claimed: automatic resource recreation. Aura3D reports the loss and lets the app decide; a route that must recover recreates its scene.", evidence: ["tests/reports/browser.json"] },
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
    /*
   * WS-2.7 — stays a `gap`, deliberately, and the note now distinguishes what is delivered from what is
   * not. `docs/architecture/text-requirements.md` records the decision and its reasoning.
   *
   * We are not shipping a text renderer in 1.6 and must not imply we are. What the requirement analysis
   * found is that of the five things called "text", four are already delivered by the DOM label layer —
   * world-anchored placement, accessibility, crisp scaling, collision avoidance — and the fifth, lit 3D
   * geometry text, has no consumer in this repository. Building `TextGeometry` would close this row and
   * change nothing a developer can use, which is exactly the mistake WS-2.7 was written to prevent.
   *
   * The one genuine gap was occlusion, and it is closed as its OWN capability row below rather than by
   * relabelling this one — a reader must not conclude from "occlusion works" that 3D text exists.
   */
  { category: "ecosystem-helpers", capability: "text rendering", expected: "troika-three-text or TextGeometry", symbols: ["TextGeometry"], integrated: false, claim: "gap", notes: "No 3D text primitive, and 1.6 deliberately does not add one: see docs/architecture/text-requirements.md. World labels are DOM — legible, accessible, crisply scaled, collision-avoiding, and now occlusion-aware (WS-2.7) — but they are not lit by the scene and cannot be extruded. Lit 3D geometry text has no consumer in this repository; adopting SDF/MSDF for the label layer would have traded accessibility and UI crispness for occlusion obtainable far more cheaply. Both deferrals carry the conditions that would make them correct." },
  { category: "ecosystem-helpers", capability: "occlusion-aware annotations", expected: "drei Html with occlude, or a hand-written depth test", symbols: ["labels", "projectWorldLabels"], integrated: true, claim: "parity", notes: "WS-2.7. A label whose subject is behind geometry is dimmed (default) or hidden, per occlusionPolicy. The gap this closed was not missing code but a DECLARED option that did nothing: occlusionAware defaulted to true on every labels.billboard/anchor/axisTick, was accepted by AuraLabelOptions and set by FocusSelection, and worldLabelsFromSnapshot never read it — WorldLabel had no field for it. Implemented as a world-space segment-vs-box test from the camera eye rather than a depth-buffer read, because WebGL2 cannot read depth from the default framebuffer and because the real question is whether the annotated subject is hidden, which is a scene property rather than a pixel property. The subject\'s own box is skipped so a label cannot occlude itself.", evidence: ["tests/reports/browser.json"] },

  // --- Physics ---
  { category: "physics", capability: "rigid bodies", expected: "Rapier or Cannon integration", symbols: ["PhysicsWorld", "RigidBody"], integrated: true, claim: "parity" },
  { category: "physics", capability: "colliders", expected: "Rapier colliders", symbols: ["Collider", "createGameBoxCollider"], integrated: true, claim: "parity" },
  { category: "physics", capability: "raycasting", expected: "THREE.Raycaster / Rapier ray", symbols: ["RaycastHit", "groundHeightRaycaster", "SphereCastHit"], integrated: true, claim: "parity" },
  { category: "physics", capability: "character controller", expected: "Rapier KinematicCharacterController", symbols: ["CharacterController", "createGameKinematicBody"], integrated: true, claim: "parity" },
  { category: "physics", capability: "vehicle dynamics", expected: "Rapier vehicle controller, hand-tuned", symbols: ["createVehicleChassis", "vehicleChassisSpecFromBounds", "createGameArcadeVehicle"], integrated: true, claim: "parity-unproven", notes: "The public racing kit delegates pose integration to the shared arcade vehicle owner and its wheel contacts query the extracted circuit mesh. The unreleased force-motion prototype was removed after ADR 0003 established that its physical-unit contract cannot implement game.racing's arbitrary-unit 0.5-4x arcade pace honestly. This remains parity-unproven because it is explicitly arcade handling, not a claim of physical tyre simulation.", evidence: ["tests/reports/turbo-vehicle-grounding"] },
  { category: "physics", capability: "vehicle AI driving", expected: "no standard solution; hand-written per project", symbols: ["createVehicleDriverAi"], integrated: true, claim: "parity-unproven", notes: "The shipped arcade driver path has lineage tests for deterministic seeded steering, route recovery and the certified 60-second race. Mesh-backed wheel contact and the penetration gate also pass. The unreleased force-model-only racing-line/path-follow experiment was removed with that model. This remains parity-unproven because understeer and physical tyre slip are not represented.", evidence: ["tests/reports/turbo-vehicle-grounding"] },
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

/**
 * WS-1.6 — the R1 lineage map, read from the single source of truth rather than duplicated here.
 *
 * `tools/claim-lineage/production-path-tests.json` is also what `check:claim-lineage` reads, so the
 * table and the gate cannot drift apart into two different opinions about what proves what.
 */
const PRODUCTION_PATH_TESTS = (() => {
  const path = join(root, "tools/claim-lineage/production-path-tests.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")).productionPathTests ?? {};
})();

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
      /*
       * WS-1.6 — R1 lineage. The named test must execute the public production path for this
       * capability; `tools/claim-lineage/index.ts` resolves reachability and fails the build for any
       * row whose named test cannot reach a documented public entry point. `gap` rows carry null:
       * a gap is the honest absence of a capability, so a test proving it does not exist would be
       * incoherent.
       */
      productionPathTest: status === "gap" ? null : (PRODUCTION_PATH_TESTS[row.capability] ?? null),
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
  baseline: "three@0.165.0 historical capability inventory",
  currentCompetitiveBaseline: "benchmark/context/threejs-r185.1-20260808.json",
  claimBoundary: "This inventory is historical lineage evidence. It is not a current r185 rendering, performance, workflow, or ecosystem-parity verdict.",
  method: [
    "Each row's implementation must resolve to a real exported symbol or agent-API source.",
    "Parity requires at least one app or example that actually imports the capability.",
    "An exceed claim additionally requires retained runtime evidence that exists on disk.",
    "The generator downgrades rows whose evidence is missing and records why, so this table cannot overstate the product.",
    "WS-1.6/R1: every non-gap row names a productionPathTest that must execute the public production path. tools/claim-lineage/index.ts resolves that reachability and fails the build otherwise. A consumer proves someone imports a symbol and an artifact proves a file exists; neither proves a test observed the claimed behaviour through the public API, which is why this fourth rule exists."
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
const markdownPath = join(root, "docs/project/plans/aura3d-threejs-ecosystem-parity.md");
writeFileSync(markdownPath, renderMarkdown(report));
console.log("wrote tests/reports/aura3d-threejs-ecosystem-parity.json");
console.log("wrote docs/project/plans/aura3d-threejs-ecosystem-parity.md");
console.log(JSON.stringify(report.totals, null, 2));
for (const [category, bucket] of Object.entries(byCategory)) {
  console.log(`${category}: exceed ${bucket.exceed}, parity ${bucket.parity}, unproven ${bucket.unproven}, gap ${bucket.gap} (of ${bucket.total})`);
}
void statSync;

function renderMarkdown(value) {
  const statusOrder = ["exceed", "parity", "parity-unproven", "gap"];
  const categoryLabels = {
    "core-rendering": "core rendering",
    "ecosystem-helpers": "ecosystem helpers",
    physics: "physics",
    "game-systems": "game systems",
    "application-workflows": "application workflows",
    "developer-tooling": "developer tooling"
  };
  const escapeCell = (input) => String(input ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
  const listPaths = (paths) => paths.length > 0 ? paths.map((path) => `\`${path}\``).join(", ") : "none retained";
  const lines = [
    "# Aura3D vs the practical Three.js ecosystem",
    "",
    "**Generated report:** `tests/reports/aura3d-threejs-ecosystem-parity.json`",
    "**Regenerate JSON and Markdown:** `node tools/product-remediation/build-threejs-parity.mjs`",
    `**Frozen baseline:** ${value.baseline}`,
    "**Current comparison lock:** `benchmark/context/threejs-r185.1-20260808.json`",
    "",
    "> This is historical capability-lineage evidence. It does not establish current",
    "> Three.js r185 renderer quality, performance, workflow, or ecosystem parity.",
    "",
    "## Method, and why it is adversarial",
    "",
    "The comparison inventory covers the practical stack developers assemble around",
    "Three.js, but its expected-solution column was authored against `three@0.165.0`.",
    "The final competitive program must use the separate current-baseline lock and",
    "like-for-like workload evidence before making a current claim.",
    "",
    "Every row is derived under these rules:",
    ""
  ];
  value.method.forEach((rule, index) => lines.push(`${index + 1}. ${rule}`));
  lines.push(
    "",
    "This method proves implementation lineage and retained evidence. It does not, by",
    "itself, prove equivalent pixels, runtime performance, ecosystem breadth, maintenance",
    "risk, or installed-consumer ergonomics.",
    "",
    "## Headline result",
    "",
    "| Status | Rows |",
    "| --- | ---: |"
  );
  for (const status of statusOrder) lines.push(`| ${status} | ${value.totals[status] ?? 0} |`);
  lines.push(`| **total** | **${value.totals.rows}** |`, "", "### By category", "", "| Category | exceed | parity | unproven | gap | total |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const [category, bucket] of Object.entries(value.byCategory)) {
    lines.push(`| ${categoryLabels[category] ?? category} | ${bucket.exceed} | ${bucket.parity} | ${bucket.unproven} | ${bucket.gap} | ${bucket.total} |`);
  }
  const exceeds = value.rows.filter((row) => row.parityStatus === "exceed");
  lines.push(
    "",
    "## Where Aura3D genuinely exceeds in this historical inventory",
    "",
    `${exceeds.length} rows survive the implementation, consumer, evidence, and lineage rules.`,
    "These are bounded workflow or integration results, not a universal renderer verdict.",
    "",
    "| Capability | Why it exceeds | Evidence |",
    "| --- | --- | --- |"
  );
  for (const row of exceeds) {
    lines.push(`| ${escapeCell(row.capability)} | ${escapeCell(row.limitations || "Integrated public workflow with a retained production consumer.")} | ${escapeCell(listPaths(row.runtimeEvidence))} |`);
  }
  const incomplete = value.rows.filter((row) => row.parityStatus === "gap" || row.parityStatus === "parity-unproven");
  lines.push("", "## Remaining gaps and unproven rows", "", "| Capability | Status | Why it is not proven |", "| --- | --- | --- |");
  for (const row of incomplete) {
    const reasons = [...row.downgradeReasons, row.limitations].filter(Boolean).join(" ");
    lines.push(`| ${escapeCell(row.capability)} | ${row.parityStatus} | ${escapeCell(reasons || "No current workload evidence establishes this row.")} |`);
  }
  lines.push(
    "",
    "## Categories where the current Three.js ecosystem remains ahead",
    "",
    "- **Ecosystem breadth:** official examples, addons, loaders, community libraries,",
    "  integrations, learning material, hiring familiarity, and production history.",
    "- **Rendering feature depth:** current WebGPURenderer, TSL/node materials, node-based",
    "  postprocessing, and maintained WebGL2 remain moving targets outside this historical",
    "  inventory.",
    "- **Escape hatches:** raw Three.js and React Three Fiber expose lower-level composition",
    "  directly; Aura3D must prove its public extension path from installed packages.",
    "- **Adoption risk:** this inventory does not erase Three.js's larger maintainer, user,",
    "  example, and third-party integration base.",
    "",
    "## Full row detail"
  );
  for (const [category] of Object.entries(value.byCategory)) {
    lines.push("", `### ${categoryLabels[category] ?? category}`, "", "| Capability | Three.js ecosystem | Aura3D | Integrated | Consumers | Status | Production-path test | Notes |", "| --- | --- | --- | --- | ---: | --- | --- | --- |");
    for (const row of value.rows.filter((candidate) => candidate.category === category)) {
      lines.push(`| ${escapeCell(row.capability)} | ${escapeCell(row.threejsEcosystemSolution)} | ${escapeCell(row.aura3dImplementation.map((symbol) => `\`${symbol}\``).join(", "))} | ${row.integrated ? "yes" : "no"} | ${row.productionConsumers.length} | ${row.parityStatus === "exceed" ? "**exceed**" : row.parityStatus} | ${escapeCell(row.productionPathTest ? `\`${row.productionPathTest}\`` : "none")} | ${escapeCell(row.limitations)} |`);
    }
  }
  lines.push(
    "",
    "## Claim boundary",
    "",
    "This generated inventory may support a statement about a specifically named row and",
    "its retained historical evidence. It may not support `current`, `head-to-head`, broad",
    "`parity`, `replacement`, or performance wording. Those claims require the r185 current",
    "comparison program defined in `1.6-FINAL-PRD-Finishes.md`."
  );
  return `${lines.join("\n")}\n`;
}
