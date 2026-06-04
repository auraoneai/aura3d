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
- Do not `import * as THREE`, import from `three` / `three/examples/...`, or
  instantiate `new GLTFLoader()`. Write `@aura3d/engine` public APIs and let
  `createAuraApp(...)` own the renderer, scene graph, camera, and loop.
- Do not paste memorized or guessed GLB URLs such as
  `raw.githubusercontent.com/.../KhronosGroup/.../DamagedHelmet.glb`. A
  remembered URL is hallucinated provenance, not a verified asset.
- When a prompt names a real-world object and no typed asset exists yet, resolve
  it through the asset catalog with `npx @aura3d/cli@latest assets search
  "<object>"`, pick an auto-pullable candidate (CC0 / CC-BY, verified,
  direct-download; everything else is a deep-link you license yourself), and use
  the generated `model(assets.x)`. Do not fall back to a primitive puppet or an
  invented URL for a named real object.
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
  works until the relevant finite build/test/check command passes.
- Do not describe Aura3D as an AI model, asset store, or runtime for arbitrary
  generated code. Aura3D is a public TypeScript/JavaScript engine API, asset CLI,
  template system, diagnostics surface, and deployment checker.

- Do not revive legacy provider-runtime or `AuraSceneIR` plans in new examples. Agents should write source code against public Aura3D APIs. If an old runtime idea is useful, rename it around the current product purpose, such as route evidence, diagnostics snapshots, typed asset metadata, camera helpers, or scene kits.
- Do not name new files, docs, routes, packages, tests, tools, or APIs after legacy release numbers such as `v2`, `v3`, or `v4`. Name artifacts by what they do.
