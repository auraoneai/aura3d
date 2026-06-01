# Aura3D Catch-Up PRD

Visual truth reset (2026-06-01): checked visual rows in this catch-up PRD were audited against the latest PNGs and renderer code. Rows that claim visual quality, screenshot quality, bloom/glow, material readability, humanoid quality, product staging, city/data/solar/particle/neon/mini-golf polish, or human/scorer acceptance are reopened unless backed by fresh pixel evidence and explicit review.


Date: 2026-05-31
Owner: Aura3D
Status: Draft product repair plan
Source evidence: Round 12 and Round 13 prompt benchmark results, scorer notes, and screenshot review.

## Purpose

Aura3D is not yet at practical parity with raw Three.js for the benchmark prompt set. The failure is not only a benchmark-process problem. The repeated rounds exposed real product gaps that cause agents to either generate weaker Aura3D scenes or invent unavailable APIs.

This PRD turns those gaps into engineering work. The goal is not another smoke-sheet tuning pass. The goal is to add the missing engine, API, visual, interaction, and documentation capabilities that let ordinary AI coding agents produce competitive Aura3D apps from the same prompts where raw Three.js currently holds up better.

## Current Evidence

Round 12:

- Codex + Aura3D: 2/10 wins, required 7/10.
- Claude + Aura3D: 6/10 wins, required 7/10.
- Engine benchmark passed separately in Round 12.
- Main prompt benchmark still failed.

Round 13:

- Codex + Aura3D: 2/10 wins, required 7/10.
- Codex + Aura3D hard prompts 07/08/10: 0/3 wins, required 2/3.
- Codex + Aura3D prompt 01 failed compile because generated code imported unavailable root exports from `@aura3d/engine`: `PhysicsDebugAdapter`, `PhysicsWorld`, and `Shape`.
- Claude + Aura3D: 7/10 wins and 2/3 hard-prompt wins, so the Claude side reached the numerical prompt bar.
- Overall Round 13 still failed because the bar requires both agent families to pass.

The gap is therefore both capability and agent reliability:

- Aura3D has usable high-level prefabs, but they are not enough for Codex to consistently beat raw Three.js.
- Aura3D has some lower-level physics code in package internals/subpaths, but the root agent-facing `@aura3d/engine` API does not expose the physics symbols Codex tried to use.
- Some scenes can be made attractive by curated smoke tests, but benchmark agents need robust public primitives and recipes that produce good output without hand tuning.

## Target Outcome

Aura3D can claim prompt parity only when a future signed clean benchmark round proves:

- Codex + Aura3D wins at least 7/10 prompts.
- Claude + Aura3D wins at least 7/10 prompts.
- Each agent has at least 2 Aura3D wins among prompts 07, 08, and 10.
- Each agent has at least 4 Aura visual scores >= 4.
- No Aura visual score is below 3.
- The engine benchmark remains passing or is rerun cleanly if the engine standard changes.

## Non-Goals

- Do not rerun the full prompt benchmark before the P0 tasks in this PRD are implemented and smoke-verified.
- Do not treat static screenshots as release proof.
- Do not weaken the benchmark bar silently.
- Do not mark Aura3D live because Claude passed once while Codex failed badly.
- Do not fabricate sign-off or approval language.

## Prompt Gap Matrix

| Prompt | Round Evidence | Product Gap | Required Capability |
|---|---|---|---|
| 01 Physics Playground | Round 13 Codex/Aura failed compile after inventing root physics exports. Round 12 used visual/fake physics cues. | No clear root-level safe physics API for agents; physics demos can look staged instead of simulated. | Public physics namespace, real rigid bodies, contacts, debug draw, prefab built from real simulation. |
| 02 Particle Fountain | Aura can win/tie, but Three.js often has clearer emitter/ground/control evidence. | Particle defaults need robust visual evidence and real controls. | High-density particles, emitter/nozzle, lifetime color, collision/splash cues, emission-rate UI helper. |
| 03 Solar System | Aura usually competitive, but label artifacts and composition issues appear. | Labels and orbit annotations are primitive geometry hacks. | Real readable label/annotation system, orbit helper, better glow/camera defaults. |
| 04 Neon Tunnel | Three.js often visually stronger, especially bloom/fog/tube depth. | Aura tunnel can read as boxy/static or less cinematic. | Cinematic tunnel prefab with true tube/ring geometry, bloom/fog/reflections, camera path presets. |
| 05 Data Visualization | Round 12 Aura was weak; Round 13 improved but Three.js still richer with hover/axes. | Chart semantics are still prefab geometry, not a full chart interaction system. | Data-viz kit: axes, ticks, real labels, raycast hover, legends, readouts, camera/layout presets. |
| 06 Mini Golf | Round 13 Codex/Aura visual scored 3 vs Three 5; clutter and fake/gameplay weakness. | No game/physics helper strong enough for ball games. | Mini-game physics kit: ball dynamics, aim/shoot control, follow camera, scoring, collision feedback. |
| 07 Material Lab | Aura ties but Three.js often looks cleaner and exposes more physical knobs. | PBR/material scene lacks enough visual polish and inspector semantics. | Material lab kit with IBL, rect softboxes, environment reflections, plinth labels, editable material params. |
| 08 City Block | Aura improved, but Codex ties instead of wins; earlier day/night toggle was text-only. | Procedural city needs richer geometry and real state transitions. | City generator with windows, roads, lights, crosswalks, street props, day/night scene-state API. |
| 09 Humanoid | Round 13 improved but earlier smoke reviews showed disconnected primitive limbs; still stylized. | Independent primitives are the wrong abstraction for characters. | Hierarchical primitive character/rig system with connected joints, gait clips, proportions, IK-friendly transforms. |
| 10 Product Viewer | Aura ties; Three.js often cleaner. Asset workflow can be penalized if generated URLs look invented. | Product viewer needs cleaner default staging and unambiguous typed asset proof. | Product-stage defaults, auto-framing/contact, turntable, asset provenance diagnostics, uncluttered hero mode. |

## Exhaustive Missing/Weak Feature Inventory From The Prompts

This inventory is scoped to the ten benchmark prompts and the observed Round 12/Round 13 examples. "Missing" here means one of three things:

- The feature does not exist in Aura3D at the agent-facing `@aura3d/engine` root API.
- The feature exists somewhere in lower-level packages or private/runtime paths but is not exposed in a safe, documented, compile-tested way for benchmark agents.
- The feature exists as a visual prefab but is too weak, too static, too cluttered, or too hard for agents to use competitively against direct Three.js code.

### Graphics And Rendering Features Where Three.js Beats Aura3D

- [ ] Real environment-map/IBL workflow in the agent API, with a one-call default that visibly affects metal, glass, clearcoat, and product materials.
- [x] Rect-area light or softbox equivalents exposed at the root API, not only approximated by emissive rectangles.
- [ ] Contact shadows that read as grounded soft shadows, not dark discs or decorative geometry.
- [ ] Cast/receive shadow defaults for primitives, product plinths, humanoids, mini-golf objects, and city buildings.
- [ ] Tuned tone mapping and exposure presets for bright scenes so white backdrops/product stages do not wash out.
- [ ] Tuned dark-scene exposure presets so neon/city/space scenes do not lose detail in black.
- [ ] Real bloom/glow pipeline exposed as a predictable helper, with threshold/intensity/radius controls that agents can set without overexposure.
- [ ] Fog/depth falloff helpers that make tunnel/city/space depth read in screenshots.
- [ ] Reflective floor/material presets for neon tunnels and product stages.
- [ ] Glass/transmission/refraction material that reliably reads as transparent glass, not opaque blue/white.
- [ ] Clearcoat paint material with layered highlight evidence, not just a glossy color.
- [ ] Emissive material with visible bloom/glow evidence, not only a bright flat sphere.
- [ ] Rubber/matte material with roughness contrast under controlled lighting.
- [ ] Material parameter inspector semantics so generated material-lab code exposes editable roughness/metalness/transmission/clearcoat/emissive controls.
- [ ] Plinth and stage components that look like deliberate scene design, not stray panels.
- [ ] Clean "hero" product stage separate from "inspection" stage so product viewer prompts do not inherit cluttered brackets/cards.
- [x] Procedural building windows as grid/detail geometry, not abstract vertical colored bars.
- [ ] Road markings, lane lines, sidewalks, crosswalks, curbs, and street-prop detail as first-class city components.
- [ ] Street light glow cones/halos that visibly affect night-city composition.
- [ ] Smooth orbit paths and rings for solar scenes without jagged rectangular segment artifacts.
- [ ] Real tube/ring geometry for neon tunnels, not only rectangular box segments.
- [ ] Depth-scaled tunnel rings and vanishing-point composition that screenshot as a flythrough.
- [x] Speed streaks, floor reflections, and wall reflections for cinematic motion evidence.
- [ ] Chart floor, back wall, axis rails, ticks, and legends that read as a chart system rather than loose primitive geometry.
- [ ] Bar caps/outlines/selected state that make hover evidence clear in a still screenshot.
- [ ] Chart color scale/gradient legend that maps values to color in a readable way.
- [ ] Readable 3D labels/annotations, including occlusion-aware placement and screen-size stability.
- [ ] DOM/SDF/billboard label primitives for planet labels, axis labels, material labels, score labels, and callouts.
- [ ] Label leader lines/callouts that look intentional and do not become stray bars.
- [x] Grounded HUD/overlay defaults that do not overlap or disappear at benchmark resolution.
- [x] Primitive shape variety and better defaults for capsules/cylinders/rounded limbs where box limbs look too crude.
- [ ] Instancing or batching for many repeated objects: city windows, stars, orbit segments, particles, chart bars, grid lines.
- [ ] Draw-call/performance budgets attached to large visual helpers so richer visuals do not regress engine parity.

### Physics Features Where Three.js Beats Aura3D

- [x] Root-level `physics` namespace in `@aura3d/engine`.
- [x] Agent-safe rigid-body world creation.
- [x] Dynamic rigid bodies.
- [x] Static colliders.
- [x] Box collider helper.
- [x] Sphere collider helper.
- [x] Capsule collider helper.
- [x] Plane/ramp collider helper.
- [x] Sensor/trigger collider helper.
- [ ] Collider material properties: friction, restitution, density/mass.
- [x] Fixed timestep simulation connected to the app loop.
- [x] Deterministic stepping for capture and replay.
- [ ] Collision/contact event stream.
- [ ] Live contact count helper.
- [ ] Contact normal and contact patch visualization.
- [ ] Velocity/trajectory visualization.
- [x] Reset/reseed helper for physics scenes.
- [ ] Sleep/active state visualization for rigid bodies.
- [x] Raycast helper exposed to interactions.
- [x] Sphere cast helper for ball/game collision probes.
- [x] Constraints/joints exposed safely for chains, ragdolls, hinges, springs, and future character work.
- [ ] Debug draw adapter that can render colliders and contacts in Aura scene nodes.
- [ ] Physics-to-scene binding so visual nodes follow simulated body transforms.
- [x] Scene-to-physics binding so authored ramp/obstacle geometry creates colliders.
- [ ] Ball physics tuned for mini-golf: rolling friction, wall bounce, impulse shots, stop threshold.
- [x] Cup/hole trigger event.
- [ ] Obstacle contact flash/collision feedback driven by real contacts.
- [ ] Physics metrics in route evidence: bodies, colliders, contacts, step count, reset count.

### Animation And Motion Features Where Three.js Beats Aura3D

- [x] Hierarchical transforms/groups in the agent API.
- [x] Parent-child transforms for connected articulated figures.
- [x] Skeleton/rig abstraction for primitive characters.
- [x] Joint anchors for shoulders, elbows, hips, knees, ankles, neck, and wrists.
- [x] Procedural walk-cycle helper with connected limbs.
- [x] Gait clips: idle, walk, run, wave, turn, pose.
- [ ] Screenshot-stable pose selection so capture frames do not land on broken in-between poses.
- [ ] Foot planting and ground-contact cues.
- [x] Pelvis/spine/root bob that moves the body as a unit.
- [x] Limb swing driven by joint hierarchy, not independent object-center rotation.
- [x] Motion trails that attach to the character path without masking body defects.
- [x] Turntable animation helper with deterministic rotation phase.
- [ ] Camera animation path/dolly/flythrough helpers with deterministic capture time.
- [x] Animation timeline controls for start time, duration, loop, easing, and capture frame.
- [x] Per-scene animation diagnostics in route evidence.
- [ ] Particle animation that proves upward emission, gravity falloff, and lifetime color progression in the screenshot.
- [ ] Chart bar height animation from random values with an inspectable final state.
- [ ] City day/night transition animation or state change that visibly changes sky/lights/windows.
- [ ] Solar orbit motion with labels remaining attached and readable.

### Interaction And UI Features Where Three.js Beats Aura3D

- [x] Pointer/raycast hover against 3D objects.
- [x] Hover-highlight helper with selected object state.
- [ ] Click-and-drag vector input for mini-golf aim.
- [x] Pointer impulse helper for physics shots.
- [ ] Slider/range helper tied to particle emission rate.
- [ ] Score counter helper tied to game state.
- [x] Reset button helper tied to physics/game state.
- [ ] Follow-camera target helper for moving objects.
- [x] Orbit-controls helper with diagnostics proving it is enabled.
- [ ] Accessible DOM overlay components that can be combined with 3D scene helpers.
- [x] State controllers for toggles that mutate 3D scene state, not only text.
- [x] Run notes/metrics hooks that document hover/interaction implementation automatically.

### Camera And Composition Features Where Three.js Beats Aura3D

- [x] Auto-frame helper for arbitrary procedural scene bounds.
- [ ] Product bounds auto-scale and plinth seating.
- [ ] Follow camera with smoothing and subject emphasis.
- [ ] Orbit camera presets for physics, charts, materials, city, product, solar, and humanoid prompts.
- [ ] Flythrough/dolly camera with start/end/target/easing and deterministic screenshot frame.
- [ ] Whole-system solar camera framing with labels still readable.
- [ ] Data-grid camera preset that keeps all 36 bars and axis labels in frame.
- [ ] City overview camera that preserves street/window detail.
- [ ] Mini-golf camera that emphasizes the ball while preserving obstacle/cup context.
- [ ] Character camera that makes humanoid proportions readable without clipping feet or hands.

### Asset, Model, And Product-Viewer Features Where Three.js Beats Aura3D

- [ ] Typed asset provenance rendered into metrics so generated hashed asset URLs are clearly traced back to the source GLB.
- [x] Fail-closed prompt-10 asset audit for wrong model, wrong hash, remote URL, string asset id, or unsafe URL usage.
- [ ] Product auto-center and auto-scale based on actual model bounds.
- [ ] Product plinth seating based on bounds minimum Y.
- [ ] Product contact shadow based on projected footprint.
- [ ] Product material readability presets: fabric/mesh, rubber sole, plastic/metal highlights.
- [ ] Clean product hero camera and turntable defaults.
- [ ] Optional inspection overlays that are disabled by default for benchmark product-viewer prompts.
- [x] Runtime diagnostic that proves orbit and turntable were enabled.

### Agent-Ergonomics Features Where Three.js Beats Aura3D

- [x] Every benchmark recipe compiles from the root `@aura3d/engine` import.
- [x] The root API exposes one obvious helper per prompt category.
- [x] The docs tell agents which helper to use first and which low-level APIs not to invent.
- [x] Generated source audits catch unavailable imports before neutral scoring.
- [x] Public API/type docs are synchronized with the context bundle manifest.
- [x] Snippet tests verify that `llms.txt` examples compile in a fresh app.
- [ ] Agent recipes use minimal code paths; no prompt requires custom engine/game/chart/physics logic to be competitive.

## Prompt-By-Prompt Feature Checklist

### Prompt 01: Physics Playground

Three.js beats Aura3D when it can directly express a real falling-cube simulation. Aura3D must provide:

- [x] 50 dynamic cubes falling under gravity.
- [ ] Tilted ramp collider, not only a tilted visual box.
- [x] Static floor/catch platform collider.
- [ ] Collision response with cubes stacking/settling visibly.
- [ ] Live contact count from real collision events.
- [x] Reset button that resets real world state.
- [ ] Orbit camera framing that shows ramp, floor, falling cubes, and settled cubes.
- [ ] Contact patch visualization.
- [ ] Normal vector visualization.
- [ ] Velocity/fall streak visualization.
- [ ] Deterministic capture frame where contact behavior is visible.
- [x] Public root imports that compile without hidden physics package knowledge.

### Prompt 02: Particle Fountain

Aura3D can compete here, but Three.js beats weak Aura outputs when it shows clearer fountain mechanics. Aura3D must provide:

- [x] Identifiable emitter/nozzle/base.
- [ ] Dense point/sprite particles.
- [ ] Upward initial velocity.
- [x] Gravity-driven falling arc.
- [x] Lifetime color gradient.
- [ ] Particle size/opacity over lifetime.
- [x] Ground plane.
- [x] Ground collision/splash/bounce evidence.
- [x] Emission-rate slider/input wired to runtime state.
- [x] Route metrics that prove emission-rate control exists.
- [ ] Camera preset that frames arc, emitter, and ground together.
- [ ] Particle performance budget for high counts.

### Prompt 03: Procedural Solar System

Aura3D is often competitive, but Three.js beats it on clean labels and postprocessing. Aura3D must provide:

- [ ] One sun plus exactly six visible planets by default.
- [x] Different orbital distances with clear orbit paths.
- [x] Different orbital speeds in runtime evidence.
- [ ] Bloom/glow on sun without washing out planets.
- [ ] Readable planet labels anchored to planets.
- [ ] Labels that do not turn into colored bars or occlude planets.
- [ ] Orbit camera preset that frames whole system.
- [x] Optional planet-specific details: Saturn ring, Earth moon, Jupiter band.
- [ ] Starfield/background that does not hide labels.
- [ ] Label collision/overlap avoidance.

### Prompt 04: Neon Tunnel Flythrough

Three.js currently beats Aura3D when the tunnel reads as cinematic. Aura3D must provide:

- [ ] Tube/interior geometry that reads as being inside a tunnel.
- [x] Receding ring segments with depth scaling.
- [x] Emissive strips along walls/floor/ceiling.
- [ ] Bloom/glow that is visible but controlled.
- [x] Fog/depth falloff.
- [x] Reflective/glossy floor.
- [x] Speed streaks or passing-frame evidence.
- [ ] Animated camera flythrough with route evidence.
- [ ] Deterministic first screenshot that reads as a flythrough, not a flat portal.
- [ ] Camera path helpers with start/end/target/fov presets.

### Prompt 05: 3D Data Visualization

Three.js beats Aura3D when it looks like a real chart instead of a pile of primitives. Aura3D must provide:

- [ ] Exactly or clearly approximately 36 bars from a 6x6 data model.
- [ ] Bar heights from data values.
- [x] Animated height transition from initial/random values.
- [x] Height-based color gradient.
- [ ] X-axis labels.
- [ ] Z-axis labels.
- [ ] Height/Y-axis labels and tick marks.
- [ ] Chart title.
- [x] Grounded legend/color scale.
- [x] Raycast hover detection.
- [x] Hover-highlighted bar cap/outline.
- [x] Hover readout with row/column/value.
- [ ] Orbit camera that keeps labels readable.
- [x] No floating stray legend bars, cobweb trend lines, or unanchored geometry by default.
- [x] Notes/metrics that document hover behavior.

### Prompt 06: Mini-Golf Hole

Three.js beats Aura3D when it has cleaner gameplay and ball physics. Aura3D must provide:

- [x] Flat green.
- [x] Course boundaries.
- [x] Exactly one clear obstacle by default.
- [x] White golf ball.
- [x] Ball rigid-body physics.
- [x] Click/drag aim interaction.
- [x] Aim line.
- [x] Shot power meter.
- [ ] Shot counter/score counter.
- [x] Cup/hole and flag.
- [x] Ball trail.
- [x] Collision feedback at obstacle/walls.
- [ ] Follow camera on ball.
- [x] Clean composition with no ambiguous loose planks, extra balls, or stray bars unless explicitly requested.
- [ ] Route evidence that the ball can move and the score changes.

### Prompt 07: Material Lab

Three.js beats Aura3D when materials look physically distinct and tweakable. Aura3D must provide:

- [x] Five spheres by default.
- [x] Metal sphere with clear reflection/highlight.
- [x] Glass sphere with transmission/refraction/transparent readability.
- [x] Rubber sphere with matte roughness.
- [ ] Emissive sphere with visible glow/bloom.
- [x] Clearcoat sphere with layered glossy highlight.
- [x] Studio softboxes/rect lights.
- [ ] Environment map/IBL reflections.
- [ ] Soft shadows/contact grounding.
- [ ] Labels or plinths that do not clutter.
- [x] Orbit controls.
- [ ] Editable material parameter object for modifiability scoring.
- [ ] Balanced exposure so bright material stage does not wash out.

### Prompt 08: Procedural City Block

Three.js beats Aura3D when city detail and day/night behavior are obvious. Aura3D must provide:

- [x] About 20 buildings by default.
- [x] Varied building heights.
- [x] Window grids on buildings.
- [x] Lit night windows.
- [x] Streets with lane markings.
- [x] Sidewalks/curbs.
- [x] Crosswalks.
- [x] Street lights.
- [ ] Street light glow at night.
- [x] Optional cars/storefront accents for scale.
- [x] Day sky/background.
- [x] Night sky/background.
- [x] Sun/moon or state marker.
- [ ] Day/night toggle visible in UI.
- [x] Toggle mutates actual 3D sky, lighting, windows, and street lights.
- [ ] Camera preset that shows both buildings and street network.

### Prompt 09: Animated Primitive Humanoid

Three.js beats Aura3D when it builds a clean, coherent primitive character. Aura3D must provide:

- [x] Sphere head.
- [x] Cylinder torso/body.
- [x] Box or capsule limbs.
- [x] Connected shoulder joints.
- [x] Connected elbows/forearms.
- [x] Connected hips/thighs.
- [x] Connected knees/shins.
- [x] Hands and feet sized proportionally.
- [x] Ground plane.
- [x] Walk path.
- [x] Procedural walk cycle.
- [x] Pose at capture time that implies movement.
- [x] Hierarchical animation so limbs stay connected.
- [ ] Foot planting/contact shadows.
- [x] Motion trail/path cue that supports the animation without hiding defects.
- [x] Proportion presets that avoid huge head/hands or stiff T-pose silhouettes.
- [ ] Frame-to-frame visual QA for disconnected parts.

### Prompt 10: Product Viewer With Sneaker

Three.js beats Aura3D when it gives a clean product shot with less clutter and correct asset handling. Aura3D must provide:

- [x] Use only provided `benchmark/assets/sneaker.glb`.
- [x] Typed asset manifest workflow.
- [x] Asset provenance metrics proving generated URL came from provided GLB.
- [x] Auto-center model.
- [x] Auto-scale model.
- [ ] Seat model on plinth by bounds.
- [ ] Clean product plinth/base.
- [ ] Contact shadow.
- [x] Studio softbox lighting.
- [x] Environment/reflection setup.
- [x] Orbit controls.
- [x] Turntable rotation.
- [x] Deterministic turntable capture frame.
- [ ] Clean hero stage with no floating backdrop panels by default.
- [x] Optional inspection overlays only when requested.

## Product Pillars

### Pillar 1: Public Physics And Gameplay API

Problem:

Prompt 01 and prompt 06 expose a real gap. Agents expect Aura3D to support physics and game interactions. Current public root imports do not make that obvious or safe.

Required features:

- Add a root-exported, agent-safe physics namespace from `@aura3d/engine`.
- Expose stable public APIs instead of raw internals:
  - `physics.world(...)`
  - `physics.body(...)`
  - `physics.collider(...)`
  - `physics.box(...)`
  - `physics.sphere(...)`
  - `physics.capsule(...)`
  - `physics.plane(...)`
  - `physics.constraint(...)`
  - `physics.step(...)`
  - `physics.debug(...)`
  - `physics.contacts(...)`
  - `physics.raycast(...)`
  - `physics.sphereCast(...)`
- Bind physics bodies to Aura scene nodes with a simple pattern:
  - `primitives.box(...).physics({ type: "dynamic", shape: "box", mass: 1 })`
  - `primitives.sphere(...).physics({ type: "dynamic", shape: "sphere" })`
  - `scene().physics(physics.world(...))`
- Provide deterministic fixed-step updates inside `createAuraApp`.
- Provide contact/debug visual nodes:
  - contact patches
  - normal vectors
  - velocity trails
  - sleeping/active body indicators
- Provide game-ready helpers:
  - ball body
  - ramp body
  - obstacle body
  - cup/sensor trigger
  - score events
  - aim vector
  - shot power
  - follow camera target

Acceptance checklist:

- [x] `import { physics } from "@aura3d/engine"` typechecks and works in browser apps.
- [x] `PhysicsWorld`, `Shape`, and debug functionality are either exported intentionally or replaced by documented safe equivalents.
- [ ] Prompt 01 can be built without custom physics code and visibly shows 50 simulated cubes, contact count, reset, gravity, contact patches, and normals.
- [ ] Prompt 06 can be built without custom game physics and visibly shows a ball, obstacle, aim/shoot, score, follow camera, cup, and collision feedback.
- [x] Physics examples run at benchmark resolution without p50 FPS below the agreed floor.
- [x] Unit tests cover world stepping, collision events, sensors, raycast, sphere cast, and scene-node binding.
- [x] Browser tests capture a real falling/settled frame, not just pre-positioned cubes.
- [x] Agent docs show only the safe public API and contain no references to unavailable root exports.

Priority: P0.

### Pillar 2: Agent API Contract Guardrails

Problem:

Codex imported unavailable APIs. That is not just a Codex issue; the package must make the safe API obvious and machine-checkable.

Required features:

- Generate a public API allowlist from built `dist/engine/index.d.ts`.
- Add a benchmark source audit that fails any generated Aura source importing unavailable names from `@aura3d/engine`.
- Add an agent-doc check that every symbol shown in `llms.txt` and `docs/agents/*` exists in the published root API.
- Add recipes that start with the highest-level safe helper and avoid raw internals.
- Add "Do not import" examples for common hallucinations:
  - `PhysicsWorld`
  - `Shape`
  - `PhysicsDebugAdapter`
  - direct Three.js classes unless explicitly supported
  - unsafe string asset IDs
- Add a package smoke test that installs the packed package into a fresh Vite app and typechecks the exact snippets shown in `llms.txt`.

Acceptance checklist:

- [x] `pnpm run check:agent-docs` verifies every documented import exists.
- [x] Benchmark capture records `unavailablePublicImports` separately from general hallucinated APIs.
- [ ] A generated app that imports a non-exported root symbol fails with a clear metric reason before visual scoring.
- [x] Context bundles are regenerated from docs and manifests verified after every public API/docs change.
- [x] The safe snippets in `llms.txt` compile in a fresh external app.

Priority: P0.

### Pillar 3: Character And Humanoid System

Problem:

The humanoid prompt should not rely on 20-30 independent primitives with per-part animations. That structure creates detached limbs and inconsistent silhouettes. Even when the latest smoke improved, the underlying abstraction is still fragile.

Required features:

- Add `character.primitiveHumanoid(...)` or upgrade `prefabs.primitiveHumanoid(...)` to use hierarchical transforms:
  - root
  - pelvis
  - spine
  - neck/head
  - shoulders
  - upper/lower arms
  - hands
  - hips
  - upper/lower legs
  - feet
- Child parts inherit parent transforms so limbs cannot drift apart during animation.
- Add gait clips:
  - `idle`
  - `walk`
  - `run`
  - `wave`
  - `pose`
- Add pose snapshots optimized for screenshots:
  - mid-stride
  - planted foot
  - side view
  - three-quarter view
- Add proportions and style presets:
  - `simple`
  - `athletic`
  - `robot`
  - `mannequin`
- Add character visual quality defaults:
  - capsule/cylinder limbs with joint covers
  - coherent neck/shoulder/hip connections
  - hands/feet sized proportionally
  - face markers optional but aligned
  - contact shadows
  - path marker and motion trail optional, never used to hide broken anatomy
- Add a "freeze animation for benchmark screenshot" option so captured frames are coherent.

Acceptance checklist:

- [x] No daylight gaps between shoulders/arms, hips/legs, torso/neck/head in default view.
- [x] Walk animation keeps all limb segments connected over a full loop.
- [ ] The default benchmark screenshot reads as a humanoid without explanatory HUD text.
- [ ] A neutral visual check should not score the humanoid below 4 against a basic Three.js primitive humanoid.
- [x] Browser test captures frame 1 and frame 2 and performs basic screen-space gap checks.
- [x] Unit tests validate parent-child transform continuity.

Priority: P0.

### Pillar 4: Mini-Game And Interaction Kit

Problem:

Mini-golf is where raw Three.js can win by implementing straightforward physics and interaction. Aura3D needs a higher-level game kit so agents do not hand-roll weak interactions or cluttered visuals.

Required features:

- Add `games.miniGolf(...)` or a stronger `prefabs.miniGolfHole(...)` with runtime state:
  - green/course bounds
  - one obstacle
  - ball physics
  - aim line
  - click/drag or pointer aim
  - shot power meter
  - shot counter
  - cup trigger
  - collision flash
  - ball trail
  - follow camera
- Add generic interaction helpers:
  - `interactions.dragVector(...)`
  - `interactions.clickImpulse(...)`
  - `camera.follow(...)`
  - `ui.scoreCounter(...)`
  - `ui.powerMeter(...)`
- Keep default visuals clean. Avoid extra ghost balls, loose bars, or ambiguous debris unless explicitly requested.

Acceptance checklist:

- [ ] Default mini-golf screenshot scores visual >=4 without DOM explanation.
- [x] Ball moves under physics after shot input in browser test.
- [ ] Score increments on shot and cup trigger.
- [ ] Follow camera target stays in frame.
- [x] Generated app source stays under benchmark complexity targets.
- [x] No stray geometry appears on the green.

Priority: P0.

### Pillar 5: Data Visualization Kit

Problem:

Three.js wins data-viz when it provides clear axes, labels, hover behavior, and a polished chart composition. Aura3D needs a real chart abstraction, not only bar geometry.

Required features:

- Add `charts.barGrid3D(...)` or expand `prefabs.dataBars3D(...)` into a data-viz kit.
- Support data input:
  - 2D matrix values
  - row/column labels
  - height scale
  - color scale
  - selected cell
- Provide chart annotation primitives:
  - real DOM/SDF labels anchored to 3D positions
  - axis titles
  - tick values
  - legend
  - hover readout
  - selected-bar outline/cap
- Provide raycast hover and keyboard-accessible selected-cell fallback.
- Keep visual helpers grounded and chart-like. No floating unexplained swatches or trend strands.

Acceptance checklist:

- [ ] Default 6x6 chart has readable X, Z, and Height labels.
- [ ] Hover/selection visibly changes a bar and updates a readout.
- [x] Legend is grounded or clearly overlayed, not floating as stray geometry.
- [ ] No trend/cobweb lines unless explicitly requested and visually styled as a chart layer.
- [ ] Neutral scorer should not prefer raw Three.js by more than one visual point.
- [x] Browser test simulates hover and verifies selected bar/readout state.

Priority: P0.

### Pillar 6: Cinematic Scene And Postprocessing Defaults

Problem:

The neon tunnel prompt repeatedly rewards polished Three.js effects: glow, fog, depth, and motion. Aura3D needs stronger default cinematic primitives.

Required features:

- Upgrade `prefabs.neonTunnel(...)`:
  - true circular/octagonal tube option
  - receding ring spacing with depth falloff
  - wall/floor reflections
  - speed streaks
  - fog density tuned for tunnel depth
  - bloom tuned to avoid flat overexposure
  - camera dolly path that starts inside the tunnel
- Add `camera.path(...)` and `camera.flythrough(...)` helpers that produce screenshot-friendly first frames.
- Add material/postprocess presets:
  - `effects.cinematicBloom(...)`
  - `effects.volumetricFog(...)`
  - `material.neon(...)`
  - `material.reflectiveFloor(...)`

Acceptance checklist:

- [ ] Default tunnel screenshot reads as an inside-the-tube flythrough, not a rectangular box.
- [x] Frame 1 and frame 2 show forward motion without losing composition.
- [ ] Bloom/fog are visible but do not wash out geometry.
- [ ] Aura output can tie or beat raw Three.js neon tunnel in both Codex and Claude scoring.

Priority: P1.

### Pillar 7: Material, Lighting, And Product Presentation

Problem:

Aura3D can produce attractive material/product scenes, but Three.js often wins on clean lighting, physical material clarity, and uncluttered product framing.

Required features:

- Material lab:
  - environment reflections
  - rect softboxes
  - visible plinths/labels
  - stronger emissive sphere glow
  - physically distinct glass, metal, rubber, clearcoat
  - editable material parameter object returned by helper
- Product viewer:
  - `stageStyle: "hero-clean"` default with no floating backdrop artifacts
  - `stageStyle: "inspection"` optional for brackets/cards
  - automatic model bounds normalization
  - plinth seating and contact shadow
  - turntable state and frame-stable camera
  - typed asset provenance diagnostics
- Lighting:
  - `lights.productStudio(...)`
  - `lights.materialLab(...)`
  - `environments.studio(...)`

Acceptance checklist:

- [ ] Material lab default screenshot shows five unmistakably distinct materials.
- [ ] Product viewer default screenshot centers the product cleanly on a plinth with contact shadow.
- [ ] No default product backdrop/card geometry looks like stray planes.
- [x] Prompt 10 asset audit passes for typed Aura asset output and does not count hashed generated URLs as invented when provenance is valid.
- [ ] Material/product helpers are documented with complete snippets that compile from `@aura3d/engine`.

Priority: P1.

### Pillar 8: Procedural City And State Transitions

Problem:

Aura city output improved, but raw Three.js can still win on detail and day/night behavior. City helpers need to behave like a small scene system, not static geometry.

Required features:

- Upgrade `prefabs.cityBlock(...)`:
  - building variety
  - window grids with emissive night material
  - road network
  - lane markings
  - crosswalks
  - sidewalks
  - street lights
  - storefront accents
  - parked/moving car markers
  - sun/moon state marker
- Add `city.createState(...)` or `prefabs.cityBlockState(...)`:
  - `timeOfDay: "day" | "night"`
  - `toggleTimeOfDay()`
  - sky/background change
  - light intensity change
  - window emissive change
  - streetlight emissive change
- Make the day/night control visibly mutate 3D scene state, not only text.

Acceptance checklist:

- [ ] Default city screenshot shows about 20 buildings with readable windows and streets.
- [ ] Day and night screenshots are visibly different.
- [ ] Toggle changes 3D materials/lights/background in the running app.
- [ ] City output reaches visual >=4 in both Codex and Claude generated apps.

Priority: P1.

### Pillar 9: Labels, Text, And Annotations

Problem:

Several prompts use labels: solar system, data axes, material labels, HUDs, score counters. Current geometry-label hacks can look like artifacts.

Required features:

- Add a first-class label system:
  - `labels.billboard(...)`
  - `labels.anchor(...)`
  - `labels.axisTick(...)`
  - `labels.callout(...)`
  - `labels.hud(...)`
- Support DOM overlay labels that track 3D anchors.
- Support collision/overlap avoidance for common benchmark scenes.
- Provide readable defaults for screenshots.

Acceptance checklist:

- [ ] Solar planet labels read as labels, not colored bars.
- [ ] Data chart axes/ticks are readable.
- [ ] Material/product labels can be enabled without clutter.
- [ ] HUD text stays inside viewport at benchmark screenshot resolution.

Priority: P1.

### Pillar 10: Benchmark And Visual QA Tooling

Problem:

The project currently discovers many problems only after a full expensive benchmark round. Catch-up work needs targeted gates that fail before full prompt execution.

Required features:

- Add visual smoke tests for each benchmark-relevant prefab:
  - physics playground
  - particle fountain
  - solar system
  - neon tunnel
  - data grid default and hover
  - mini golf
  - material lab
  - city day/night
  - primitive humanoid frame 1/frame 2
  - product viewer
- Add screenshot-level checks:
  - nonblank
  - object count/draw call sanity
  - no missing screenshot
  - no all-white/all-black renders
  - basic connected-humanoid gap checks
  - hover state differs from default
  - day/night screenshots differ
- Add prompt-specific source audits:
  - physics prompt uses public physics helper or prefab
  - mini-golf prompt uses game/physics helper
  - hard prompts 07/08/10 use recommended helpers
  - prompt 10 uses typed asset manifest
- Add a pre-benchmark readiness command:
  - `pnpm check:prompt-parity-readiness`

Acceptance checklist:

- [x] Catch-up work cannot start a full benchmark unless `pnpm check:prompt-parity-readiness` passes.
- [x] Readiness output names the weak prompt/helper instead of giving a generic failure.
- [x] The readiness command does not replace neutral scoring; it only prevents obviously doomed rounds.

Priority: P0.

## Implementation Task List

### P0: Stop Compile Failures And Fake Physics

- [x] A3D-CU-001: Design the public root physics API for `@aura3d/engine`.
- [x] A3D-CU-002: Decide whether raw classes are exported directly or hidden behind `physics.*`; document the decision.
- [x] A3D-CU-003: Implement root `physics` namespace in `packages/engine/src/agent-api/index.ts`.
- [x] A3D-CU-004: Add scene-node physics binding API.
- [x] A3D-CU-005: Build real simulated `prefabs.physicsPlayground(...)`.
- [x] A3D-CU-006: Build real simulated `prefabs.physicsRamp(...)`.
- [ ] A3D-CU-007: Add physics debug draw/contact helpers.
- [x] A3D-CU-008: Add tests for physics world, collisions, sensors, and scene binding.
- [x] A3D-CU-009: Add benchmark source audit for unavailable root imports.
- [x] A3D-CU-010: Regenerate agent docs/context and verify manifests.

### P0: Build Mini-Game Capability

- [x] A3D-CU-011: Implement `games.miniGolf(...)` or equivalent runtime prefab.
- [x] A3D-CU-012: Add `interactions.dragVector(...)`.
- [x] A3D-CU-013: Add `interactions.clickImpulse(...)`.
- [ ] A3D-CU-014: Add `camera.follow(...)` with screenshot-stable default framing.
- [ ] A3D-CU-015: Add `ui.scoreCounter(...)` and `ui.powerMeter(...)`.
- [ ] A3D-CU-016: Add browser test that shoots the ball and updates score.
- [ ] A3D-CU-017: Replace cluttered default mini-golf helper geometry with clean course composition.

### P0: Replace Primitive Humanoid With A Real Character Abstraction

- [x] A3D-CU-018: Implement hierarchical transform/group support if current scene nodes cannot parent parts safely.
- [x] A3D-CU-019: Implement character skeleton schema.
- [ ] A3D-CU-020: Implement `character.primitiveHumanoid(...)` or rewrite `prefabs.primitiveHumanoid(...)` on top of hierarchy.
- [x] A3D-CU-021: Add walk/idle/run/wave pose clips.
- [ ] A3D-CU-022: Add screenshot-pose presets.
- [ ] A3D-CU-023: Add connected-limb visual tests across two animation frames.
- [x] A3D-CU-024: Add proportion/style presets.

### P0: Make Data Viz Competitive

- [ ] A3D-CU-025: Add chart data model for 3D grid charts.
- [ ] A3D-CU-026: Add anchored label/callout support required by charts.
- [x] A3D-CU-027: Add hover/raycast selected-cell interaction.
- [x] A3D-CU-028: Add grounded legend and axis/tick defaults.
- [ ] A3D-CU-029: Add data-grid default and hover screenshot tests.
- [ ] A3D-CU-030: Remove or disable visual layers that read as stray geometry by default.

### P1: Upgrade Cinematic And Scene Quality

- [ ] A3D-CU-031: Upgrade neon tunnel geometry and postprocessing defaults.
- [ ] A3D-CU-032: Add `camera.path(...)` and `camera.flythrough(...)`.
- [ ] A3D-CU-033: Add tuned cinematic bloom/fog/neon materials.
- [ ] A3D-CU-034: Add two-frame neon screenshot test.
- [ ] A3D-CU-035: Upgrade solar labels and orbit annotations.

### P1: Upgrade Material/Product/City Presentation

- [ ] A3D-CU-036: Upgrade material lab lighting and material parameter API.
- [ ] A3D-CU-037: Add clean product hero stage separate from inspection stage.
- [ ] A3D-CU-038: Add product bounds/contact validation.
- [ ] A3D-CU-039: Add product asset provenance diagnostics in app/runtime output.
- [ ] A3D-CU-040: Upgrade city geometry detail.
- [ ] A3D-CU-041: Add city day/night state object with real 3D mutations.
- [ ] A3D-CU-042: Add city day/night screenshot diff test.

### P1: Agent Docs And Context

- [x] A3D-CU-043: Rewrite `llms.txt` around the new safe API names.
- [x] A3D-CU-044: Add one minimal compile-tested recipe per benchmark prompt.
- [x] A3D-CU-045: Add "do not import unavailable symbols" guardrail examples.
- [x] A3D-CU-046: Add fresh-app snippet typecheck for every documented import.
- [x] A3D-CU-047: Regenerate context bundle and manifest.
- [ ] A3D-CU-048: Require explicit sign-off before any new full benchmark.

### P2: Polish And Performance

- [x] A3D-CU-049: Add draw-call and bundle budgets for each helper.
- [ ] A3D-CU-050: Add LOD or instancing for city/windows/particles where needed.
- [x] A3D-CU-051: Add stable color-management presets aligned with Three.js expectations.
- [ ] A3D-CU-052: Add screenshot contact sheets for all helper smoke tests.
- [x] A3D-CU-053: Add a side-by-side local comparison app for Aura helper vs raw Three.js reference.

### Expanded Graphics/Physics/Animation Feature Backlog

These tasks cover the explicit feature inventory above. Some overlap with the P0/P1 pillars; the point is to make sure every concrete gap has an ownerable backlog item.

- [ ] A3D-CU-054: Add root `labels` namespace with billboard, anchor, axis tick, callout, and HUD label helpers.
- [ ] A3D-CU-055: Implement DOM/SDF label anchoring to 3D positions with viewport-safe layout.
- [ ] A3D-CU-056: Add label-overlap and label-occlusion handling for solar/data/material scenes.
- [ ] A3D-CU-057: Add root `charts` namespace with `barGrid3D(...)`, data model, color scale, axes, legend, and hover state.
- [ ] A3D-CU-058: Add raycast/pointer hover helper that works with chart bars, material swatches, and general primitives.
- [x] A3D-CU-059: Add selected-object outline/cap/highlight primitives that do not look like stray geometry.
- [ ] A3D-CU-060: Add root `games` namespace with mini-golf as the first shipped helper.
- [ ] A3D-CU-061: Add physics-driven mini-golf course state: ball, impulse shot, walls, obstacle, cup sensor, score, and reset.
- [ ] A3D-CU-062: Add game interaction metrics: shots, score, selected/aim vector, collisions, and follow-camera target.
- [ ] A3D-CU-063: Add root `character` namespace with hierarchical primitive humanoid support.
- [x] A3D-CU-064: Add scene graph grouping/parent-child transforms to the public agent API if not already available.
- [x] A3D-CU-065: Add primitive skeleton joints and connector geometry so shoulders, elbows, hips, knees, neck, hands, and feet stay attached.
- [x] A3D-CU-066: Add procedural gait controller with foot planting, body bob, limb swing, and deterministic capture pose.
- [ ] A3D-CU-067: Add character visual QA that detects disconnected limbs and impossible proportions.
- [ ] A3D-CU-068: Add root `effects.cinematicBloom(...)`, `effects.volumetricFog(...)`, and `material.neon(...)` helpers.
- [ ] A3D-CU-069: Add reflective/glossy floor helper for neon and product scenes.
- [ ] A3D-CU-070: Add neon tube geometry helper with circular/octagonal rings, receding depth, wall chords, speed streaks, and floor reflections.
- [ ] A3D-CU-071: Add particle emitter primitives with point/nozzle emitter, gravity, lifetime color, size over lifetime, opacity over lifetime, and ground collision evidence.
- [ ] A3D-CU-072: Add particle emission-rate UI binding and runtime metric evidence.
- [ ] A3D-CU-073: Add particle performance path using instancing/batching for benchmark-scale counts.
- [ ] A3D-CU-074: Add material-lab lighting preset with environment map, rect/softbox lights, plinths, shadows, and labels.
- [ ] A3D-CU-075: Add physically distinct material presets: metal, glass/transmission, rubber, emissive+bloom, clearcoat paint.
- [ ] A3D-CU-076: Add editable material parameter objects and route evidence for material modifiability.
- [ ] A3D-CU-077: Add root `lights.softbox(...)`, `lights.rect(...)`, `lights.productStudio(...)`, and `lights.materialLab(...)` helpers.
- [ ] A3D-CU-078: Add environment/IBL helper reachable from root `@aura3d/engine` snippets.
- [ ] A3D-CU-079: Add contact-shadow helper based on subject footprint, not decorative cylinders.
- [ ] A3D-CU-080: Add cast/receive shadow defaults for primitives, products, humanoids, cities, and mini-game objects.
- [ ] A3D-CU-081: Add clean product hero stage and keep inspection overlays opt-in.
- [ ] A3D-CU-082: Add product bounds auto-center, auto-scale, plinth-seat, contact-shadow, and deterministic turntable frame utilities.
- [ ] A3D-CU-083: Add product asset provenance diagnostics to route metrics and asset audit.
- [ ] A3D-CU-084: Add city building-window generator with rows/columns, emissive night material, and per-building variation.
- [ ] A3D-CU-085: Add city street kit: roads, lane markings, sidewalks, curbs, crosswalks, street lights, storefront accents, and cars.
- [ ] A3D-CU-086: Add city state controller with day/night sky, sun/moon, ambient/key lights, windows, and street lights.
- [ ] A3D-CU-087: Add solar-system helper improvements: real labels, label leaders, orbit rings, planet details, sun bloom, starfield, and whole-system camera.
- [ ] A3D-CU-088: Add camera auto-framing by scene bounds for procedural helpers.
- [ ] A3D-CU-089: Add camera presets for physics, charts, materials, city, product, solar, humanoid, mini-golf, and neon.
- [ ] A3D-CU-090: Add `camera.follow(...)`, `camera.path(...)`, and `camera.flythrough(...)` with deterministic capture-time support.
- [ ] A3D-CU-091: Add UI state helpers for reset, slider, toggle, score counter, power meter, and hover readout.
- [ ] A3D-CU-092: Add route evidence hooks for controls/interactions so scorers can verify behavior from metrics and notes.
- [x] A3D-CU-093: Add public API snippet tests that compile every helper used in benchmark recipes from a packed external install.
- [ ] A3D-CU-094: Add pre-benchmark source audit for unavailable public imports, non-public subpath imports, unsafe asset URLs, missing controls, missing labels, and missing interaction evidence.
- [ ] A3D-CU-095: Add prompt-specific visual smoke assertions: physics contacts visible, particle arc visible, solar labels readable, tunnel depth visible, chart hover differs, golf ball emphasized, material classes distinct, city day/night differs, humanoid connected, product seated.

## Pre-Benchmark Readiness Checklist

Before another full prompt benchmark is authorized:

- [x] Public root `@aura3d/engine` imports are documented and compile-tested.
- [x] Physics prompt can be implemented with documented public Aura API only.
- [ ] Mini-golf prompt can be implemented with documented public Aura API only.
- [ ] Humanoid output is hierarchical and visually connected across animation frames.
- [ ] Data grid default and hover screenshots are clean.
- [ ] Material lab default screenshot has five distinct readable materials.
- [ ] City day/night toggle changes real 3D scene state.
- [ ] Product viewer default is clean and typed-asset provenance is auditable.
- [x] Prompt recipes compile in a fresh app.
- [x] Context manifests match.
- [x] `pnpm check:prompt-parity-readiness` passes.
- [ ] A human explicitly signs the next benchmark standard. Ambiguous messages like "proceed" are not enough.

## Definition Of Done

This PRD is complete only when:

- P0 tasks are implemented, tested, and documented.
- P1 tasks that affect prompts 04, 07, 08, and 10 are implemented or explicitly deferred with owner approval.
- A focused smoke suite proves each benchmark helper renders cleanly.
- The public API/docs/context bundle are internally consistent.
- A new clean benchmark round, started only after explicit sign-off, passes Task 12 for both Codex and Claude.

Until then, Aura3D should be described as improving toward Three.js prompt parity, not as a proven Three.js competitor.
