# Agent Context

Aura3D is a developer library, template system, asset CLI, diagnostics surface,
and deployment checker for AI coding agents that write browser 3D app code.

Primary active areas:

- `packages/engine/src/agent-api/` for public scene helpers
- `packages/aura3d-cli/src/` for assets, agent init, doctor, and deploy checks
- `packages/react/src/` for the optional React adapter
- `packages/create-aura3d/templates/` for starter templates
- `apps/hello-world-typed-asset/`, `apps/material-lighting/`, and
  `apps/camera-path/` for starter examples

Do not use archived `archive/legacy-ai-runtime/` files from active code.

Prompt-to-visual workflow:

- For frozen benchmark prompts, first open
  `docs/agents/benchmark-recipes.md`. Copy the smallest matching recipe and
  make only prompt-required edits.
- Start with `definePromptPlan(...)`.
- Use one supported `sceneType`: `product-viewer`, `cinematic-scene`,
  `mini-game`, or `material-studio`.
- Put the user asset in `subject.asset` from generated typed refs, such as
  `assets.product`. Do not use raw strings or invented URLs.
- Include camera, lighting, effects, interaction, acceptance criteria, and
  negative criteria when the prompt gives them.
- Render with `promptPlanToScene(plan)`.
- Reject output that is only one imported asset on a grid with symbolic lines,
  labels, or unrelated primitives.
- For particle, city, material-lab, product-viewer, and physics-ramp prompts,
  start from `prefabs.particleFountain`, `prefabs.cityBlock`,
  `prefabs.materialSwatches`, `prefabs.productViewer`, or
  `prefabs.physicsRamp` before custom primitive placement.
- For physics playground, solar-system, data visualization, neon tunnel, mini-golf, and
  humanoid prompts, start from `prefabs.physicsPlayground`,
  `prefabs.solarSystem`, `prefabs.dataBars3D`, `prefabs.neonTunnel`,
  `prefabs.miniGolfHole`, or `prefabs.primitiveHumanoid`.
- For solar-system prompts, prefer
  `prefabs.solarSystem({ labels: "attached", orbitSegments: 24 })` so the
  labels render next to the planets rather than as a detached legend.
- For primitive humanoid prompts, prefer
  `prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true })` so
  screenshots show connected limbs, visible hinges, and stride evidence.
- Data visualization scenes should keep the prefab's bars, caps, axes, labels,
  grounded legend, selected-metric callout, and bloom visible. Neon tunnel scenes
  should keep the prefab's octagonal rings, braces, rails, reflections, fog,
  bloom, sparks, particles, and dolly-camera depth visible.
- Mini-golf scenes should pair `prefabs.miniGolfHole()` with
  `camera.follow({ targetNode: "white physics golf ball" })` and a visible
  strokes HUD. The prefab includes aim, shot-power, contact, ball trail, cup,
  obstacle, and follow-camera target cues; keep those in frame.
- Use `effects.particles(...)` for live particle systems. Do not claim particle
  success from a cone, label, or HUD counter without visible particles. For the
  particle-fountain prompt, pair `prefabs.particleFountain({ count: 2400 })`
  with a real `ui.range`/`ui.onInput` emission-rate control and frame the
  nozzle, ground collision/splash evidence, and lifetime color variation.
- For product viewers, prefer `prefabs.productViewer(assets.product)` so the
  typed asset, fit-to-bounds placement, plinth, contact shadow, softboxes, and
  turntable evidence stay together. Use `prefabs.productStage({ style:
  "inspection" })` only when the prompt asks for explicit fit guides.
- Use `.animate({ clip: "float" | "pulse" | "walk" | "turntable", speed })` and
  `timeline.loop(...)` for runtime motion. Build/test, then terminate normally; do not run
  `npm run dev`, Playwright, browser screenshots, or manual visual verification
  from inside the benchmark agent process.
- Create one Aura app per route. Do not animate by repeatedly disposing and
  recreating `createAuraApp(...)`; use scene animations and separate DOM
  overlays instead. One-click remounts for discrete state changes, such as a
  city day/night toggle, are acceptable when the click visibly changes the 3D
  scene.
