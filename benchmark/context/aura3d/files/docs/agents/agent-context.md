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
  `prefabs.materialSwatches`, `prefabs.productStage`, or
  `prefabs.physicsRamp` before custom primitive placement.
- For physics playground, solar-system, data visualization, neon tunnel, mini-golf, and
  humanoid prompts, start from `prefabs.physicsPlayground`,
  `prefabs.solarSystem`, `prefabs.dataBars3D`, `prefabs.neonTunnel`,
  `prefabs.miniGolfHole`, or `prefabs.primitiveHumanoid`.
- Mini-golf scenes should pair `prefabs.miniGolfHole()` with
  `camera.follow({ targetNode: "white physics golf ball" })` and a visible
  strokes HUD.
- Use `effects.particles(...)` for live particle systems. Do not claim particle
  success from a cone, label, or HUD counter without visible particles.
- For product viewers, place normalized products around
  `position(0, 0.65, -0.65)` after `prefabs.productStage()` so they sit on the
  round plinth.
- Use `.animate({ clip: "float" | "pulse" | "walk", speed })` and
  `timeline.loop(...)` for runtime motion. Build/test, then terminate normally; do not run
  `npm run dev`, Playwright, browser screenshots, or manual visual verification
  from inside the benchmark agent process.
- Create one Aura app per route. Do not animate by repeatedly disposing and
  recreating `createAuraApp(...)`; use scene animations and separate DOM
  overlays instead.
