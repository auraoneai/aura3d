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
