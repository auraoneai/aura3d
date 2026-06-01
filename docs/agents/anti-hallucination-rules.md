# Anti-Hallucination Rules

- Do not invent Aura3D APIs. Use only public exports documented in
  `docs/agents/api-surface.md` and the root `@aura3d/engine` imports shown in
  `llms.txt`.
- Do not invent asset paths, ids, URLs, or GLB filenames. If a prompt supplies a
  model, run `npx @aura3d/cli@latest assets add ./assets/model.glb --name model`,
  read `src/aura-assets.ts`, import `assets` from `./aura-assets`, and use the
  exact generated key.
- Do not write `model("robot")`, `model("sneaker")`, or string asset ids. Use
  `model(assets.robot)` or `sceneKits.productViewer(assets.sneaker)`.
- Do not use `unsafeModelUrl(...)` for benchmark product proof unless the prompt
  explicitly asks for an unsafe temporary URL escape hatch.
- Do not import `PhysicsWorld`, `Shape`, or `PhysicsDebugAdapter` from
  `@aura3d/engine`. Use benchmark-visible scene kits/prefabs and the documented
  root `physics` namespace, including `physics.world(...)`, `physics.box(...)`,
  `physics.sphere(...)`, `physics.step(...)`, `physics.worldFromScene(scene)`,
  and `physics.debugNodes(world)`.
- Do not hand-roll mini-golf physics when `sceneKits.miniGolf()` and
  `games.createMiniGolfState()` cover shots, score, collisions, cup trigger,
  reset, and follow-camera metrics.
- Do not build custom chart, city, material, neon, particle, physics, product, or
  humanoid systems when a matching `sceneKits.*` helper exists. Start from the
  scene kit, then make only prompt-required edits.
- Do not submit primitive humanoid puppets, toy mini-golf, stray chart geometry,
  blown-out neon, washed material labs, bare product GLBs, or one-asset scenes
  with symbolic labels as production-quality benchmark answers.
- Do not claim an example, route, template, deployment path, or benchmark recipe
  works until the relevant finite build/test/check command passes.
- Do not describe Aura3D as an AI model, asset store, or runtime for arbitrary
  generated code. Aura3D is a public TypeScript/JavaScript engine API, asset CLI,
  template system, diagnostics surface, and deployment checker.
