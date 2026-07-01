# GitHub Copilot Aura3D Instructions

Use Aura3D as a TypeScript library and asset deployment pipeline for browser 3D.
Read `llms.txt`, use public `@aura3d/engine` imports, and reference generated
typed assets from `src/aura-assets.ts`.

Hard rules for public examples and docs:

- Do not import `three`, `three/examples/...`, `GLTFLoader`, renderer internals,
  or hand-written renderer loops.
- Do not use raw asset IDs, raw `.glb` or `.gltf` URLs, guessed sample-model
  URLs, `model("id")`, or `unsafeModelUrl(...)`.
- Acquire assets with `npx @aura3d/cli@latest assets add ... --name ...` or the
  catalog `assets search` / `assets resolve` flow, then use `model(assets.name)`.
- Do not use primitives as the main character, vehicle, product, creature,
  weapon, world, or hero environment for a named object prompt. Primitives are
  set dressing, debug/collision guides, HUD anchors, or explicitly abstract
  visualization only.
- Do not fake particles, 3D scene effects, labels, or renderer evidence with
  CSS, DOM, or canvas overlays. DOM is UI only.
- Do not claim production renderer, PBR parity, WebGPU, postprocess, skinned
  animation, morph targets, or game-kit behavior from root `createAuraApp`
  unless a browser test imports only `@aura3d/engine` and verifies pixels or
  runtime state.
- For capability wording, follow `docs/agents/claims-and-boundaries.md` and
  label claims as root safe API, production-runtime, rendering internals, CLI
  pipeline, template-only scaffold, prototype, or roadmap.
