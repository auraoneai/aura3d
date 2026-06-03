# Agent Context

Aura3D is a developer library, template system, asset CLI, diagnostics surface,
and deployment checker for AI coding agents that write browser 3D app code.

Primary active areas:

- `packages/engine/src/agent-api/` for public scene helpers and scene kits
- `packages/aura3d-cli/src/` for assets, agent init, doctor, and deploy checks
- `packages/react/src/` for the optional React adapter
- `packages/create-aura3d/templates/` for starter templates
- `apps/hello-world-typed-asset/`, `apps/material-lighting/`, and
  `apps/camera-path/` for starter examples

Do not use archived `archive/legacy-ai-runtime/` files from active code.

Prompt-to-visual workflow:

- For ordinary product apps, follow `docs/agents/prompt-to-3d-workflow.md` before dropping into low-level primitives.

- For frozen benchmark prompts, first open
  `docs/agents/benchmark-recipes.md`. Copy the smallest matching scene-kit
  recipe and make only prompt-required edits.
- Use `sceneKits.<name>()` before prefabs or primitives. Scene kits return scene
  nodes, camera, lights, effects, interactions, UI, diagnostics, acceptance
  evidence, `customize(...)`, and `toAppOptions()`.
- Scene-kit mapping: physics playground -> `sceneKits.physicsPlayground()`,
  particle fountain -> `sceneKits.particleFountain(...)`, solar system ->
  `sceneKits.solarSystem()`, neon tunnel -> `sceneKits.neonTunnel()`, data
  visualization -> `sceneKits.dataViz({ dataset })`, mini-golf ->
  `sceneKits.miniGolf()`, material lab -> `sceneKits.materialLab()`, city block
  -> `sceneKits.cityBlock({ timeOfDay })`, humanoid ->
  `sceneKits.humanoidWalk({ animationState: "benchmark-pose" })`, product
  viewer -> `sceneKits.productViewer(assets.product)`.
- Put user assets through the asset CLI first. Import typed refs such as
  `assets.product`; do not use raw strings, invented URLs, or unrelated copied
  assets.
- Include camera, lighting, effects, interaction, acceptance criteria, and
  negative criteria when the prompt gives them. If the prompt is covered by a
  scene kit, prefer `kit.customize(...)` over rebuilding systems.
- Prompt plans are still supported for app planning: use `definePromptPlan(...)`,
  `compilePromptPlan(plan)`, inspect `report.repairHints`, then render with
  `promptPlanToScene(plan)`. Do not treat a weak render as done because it
  compiled.
- Reject output that is only one imported asset on a grid with symbolic lines,
  labels, or unrelated primitives.

Expected screenshot requirements:

- Physics playground: falling cubes, settled pile, ramp/catch geometry, contact
  patches, gravity/velocity cue, reset affordance, and grounded lighting.
- Particle fountain: dense upward flow, lifetime color variation, emitter base,
  splash/collision context, and an emission-rate UI that changes a real value.
- Solar system: sun glow, six labeled planets, orbit paths, stars/dust, distinct
  material classes, and whole-system framing.
- Neon tunnel: inside-the-tube camera, receding rings, rails, reflections, fog
  depth, sparks/motes, and controlled bloom.
- Data visualization: bars, axes, numeric ticks, title, legend, selected value or
  hover readout, and no orphaned labels.
- Mini-golf: ball, cup, aim/power state, score, obstacle, boundaries, ball trail
  or contact cue, and follow-camera target evidence.
- Material lab: mirror metal, transparent glass, matte rubber, emissive glow,
  clearcoat highlights, contact shadows, and class distinction.
- City block: many buildings, windows, roads, sidewalks, crosswalks, props,
  traffic/street lights, and visible day/night state.
- Humanoid: one connected character, planted feet, sockets, hands/feet attached,
  face cues, and motion/path evidence.
- Product viewer: typed model centered, scaled, seated, lit by softboxes, on a
  plinth/stage with contact shadow and orbit/turntable cues.

Do not submit:

- Primitive humanoid puppets made from disconnected primitives.
- Toy mini-golf with no score, obstacle, cup rim, aim/power, or physics evidence.
- Stray chart geometry with detached labels, ticks, guide lines, or bars without
  axes/title/legend.
- Blown-out neon that reads as a white portal, rectangle, or CSS background.
- Washed material labs where all materials look identical.
- Product placeholders using string asset ids, invented URLs, missing contact
  shadows, or inspection clutter by default.

Physics API boundary:

- Use visible scene kits and prefabs first.
- Call simulation helpers through the safe root `physics` namespace:
  `physics.world(...)`, `physics.box(...)`, `physics.sphere(...)`,
  `physics.step(...)`, `physics.debugNodes(...)`, and
  `physics.worldFromScene(...)`.
- Do not import `PhysicsWorld`, `Shape`, or `PhysicsDebugAdapter` from
  `@aura3d/engine`.
- Use `games.createMiniGolfState()` for mini-golf shots, score, collisions, cup
  trigger, reset, and follow-camera metrics.

Runtime and verification:

- Build/test, then terminate normally. Do not run `npm run dev`, Playwright,
  browser screenshots, or manual visual verification from inside the benchmark
  agent process.
- Create one Aura app per route. Do not animate by repeatedly disposing and
  recreating `createAuraApp(...)`; use scene animations and separate DOM overlays
  instead.
- One-click remounts for discrete state changes, such as a city day/night toggle,
  are acceptable when the click visibly changes the 3D scene.
