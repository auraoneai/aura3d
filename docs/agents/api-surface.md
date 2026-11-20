# API surface for agents

Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first. Every live root export is yours to use; a public rendering or gameplay claim about it ships with its capture. Label any capability as root safe API, production-runtime, rendering internals, CLI asset pipeline, template-only scaffold, prototype or roadmap.

## Where the real list lives

- **`docs/api/root-exports.md`**: every value export of `@aura3d/engine`, generated from `packages/engine/src/public/index.ts`, with kind, area, namespace members and a DEPRECATED section. This is the source of truth for names. Regenerate with `node tools/docs/gen-root-exports.mjs --write`; `node tools/docs/check-root-exports.mjs` fails when it is stale.
- `docs/api/public-api.md`: exhaustive declaration dump for all packages. Do not read it whole (about 40k tokens). Its `@aura3d/engine` section lists a legacy entry file, not the root.
- Topic docs: `docs/api/game-kit.md`, `qa-kit.md`, `model-loader.md`, `scatter-merge.md`, `toon.md`, `skinned-actors.md`, `safety-net.md`, `shader-diagnostics.md`, `sculpt.md`, `quality-governor.md`, `motion-camera-clear.md`, `humanoid-motion.md`.

Rule: if a name is not in `root-exports.md` as live, do not import it from `@aura3d/engine`.

## The import you start from

```ts
import { createAuraApp, scene, camera, lights, primitives, material, model, effects, environments } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene({ background: "#07080a" })
    .add(model(assets.robot, { targetHeight: 1.8 }))
    .add(lights.studio())
    .camera(camera.orbit({ distance: 4, target: [0, 0, 0] }))
});
```

The typed-asset form is `model(assets.robot)`; `targetHeight` and other options go in the second argument.

React apps use `@aura3d/react` around the same root API.

## Pick the name by task (all live at the root)

| Task | Names |
|---|---|
| Mount and run | `createAuraApp`, `createGameApp`, `createFrameLoop`, `app.diagnostics()`, `app.evidence()`, `app.screenshot()`, `app.screenshotAsync()` |
| Scene structure | `scene`, `group`, `groups`, `model`, `primitives`, `text3D`, `geometry`, `line`, `points`, `sprite`, `texture` |
| Look | `material`, `lights`, `environments`, `looks`, `effects`, `postPresets`, `shadows`, `camera`, `cameras` |
| Many objects | `instances`, `batched`, `distanceLod`, `planScatterInstances` |
| Input and UI | `interactions`, `ui`, `labels`, `raycast`, `raycastFirst`, `bindGameTouchControls` |
| Motion | `AnimationController`, `cloneSkinned`, `characters`, `timeline`, `physics`, `computeCameraClearance` (follow-camera clearance, 5.5.6) |
| Games | `game`, `games`, `racketSports`, `arcadeKart`, `carSoccer`, `gameFeel`, `createGameAudio`, `createVehicleChassis`, `createCombatAi`; the real HUD/touch/session kit is `@aura3d/engine/game` |
| QA and replay | `installQaHooks`, `readQaParams`, `createFixedStepLoop`, `createCountedRng`; telemetry (5.5.5): `installQaTelemetryHooks`, `createQaRunMonitor`, `findNonFinitePaths`, `hashQaPixels`, `installVirtualGamepads`, `createQaOfflineAudio`, `analyzeQaAudioSamples` |

`app.diagnostics().fps` is the average over the frames presented in the last second, rounded to 0.01; renders issued in one task (a loop of `app.step()` calls) count as one frame. On software GL it reads well below 1. `app.screenshot()` is synchronous and re-renders before it reads; an app with `frameMode: "async"` uses `await app.screenshotAsync()`, which waits for the in-flight frame first (`screenshot()` during an async frame warns `SCREENSHOT_DURING_ASYNC_FRAME`).
| Typed assets | `defineAuraAssets`, `defineModelAssets` |
| Prompt to scene | `sceneKits`, `prefabs`, `definePromptPlan`, `promptPlanToScene`, `compilePromptPlanV2` |
| Data and product scenes | `charts`, `city`, `product`, `solar` (each has `visualQA`) |
| Advanced | `tsl`, `compute` (WebGPU only), `xr`, `registerNodeHandler`, `attachRootRenderSource` |

Members of each namespace (for example `effects.bloom`, `camera.orbit`, `ui.slider`) are listed in `root-exports.md`.

## Do not use these in new code

| Do not use | Use instead |
|---|---|
| `createGame` from `@aura3d/engine` | The root export throws `AuraGameMigrationError` (`code: "CREATE_GAME_ROOT_UNAVAILABLE"`, `version: 1`, message prefix `CREATE_GAME_ROOT_UNAVAILABLE_V1`) before mounting anything. Import `createGame` from `@aura3d/engine/game` |
| `compilePromptPlan` | `compilePromptPlanV2` |
| `collectAuraSceneEvidence`, `captureAuraAppScreenshot`, `createAssetCompatibilityReport` | `@aura3d/engine/devtools` (the last two left the root in 5.0.0) |
| `character.*` | `characters`, `AnimationController`, `prefabs.lowPolyHumanoid` |
| `unsafeModelUrl`, `loadAsset`, `GLTFLoader` | Typed assets and `model(assets.name)`. All three left the root in 5.0.0 ([migration guide](../migration/4-to-5.md), B14) |
| `createDiagnosticsPanel`, `createEnvironment` | `app.diagnostics()`, `environments.*` |

Do not import `three`, `three/examples/...`, `GLTFLoader`, renderer internals or `@aura3d/engine/renderer` production-runtime internals to make a public example look better. If a feature needs internals, the right output is a library task or a roadmap item, not route-local workaround code.

## Behaviour you can rely on (5.6 and later)

- `sky`, `water`, `weather` and `workflows` are live root exports (not deprecated). `sky.gradient(...)` is the painted game sky; pass `captureEnvironment: false` to keep it from becoming the scene's image-based light (the flag is honoured since 5.6.0, and a failed sky capture logs one warning instead of throwing).
- `handle.part(name)` on a `model(...)` handle returns the GLB node named `name` as its own handle (local `setPosition` / `setRotation` / `setScale` / `setVisible`, world reads from the last drawn frame), also for models read during the first mount. It returns `undefined` when the GLB has no such node or `consolidateStaticMeshes` merged it, and a clip that animates the node overwrites your writes.
- `opacity < 1` on `model(asset, { material })` or `materialOverrides` draws see-through (alpha blending, no depth write, base-colour alpha scaled). Runtime `setMaterialOverrides` cannot change blend state: set opacity on the node.
- `texture.data(...)` keeps your array by reference, like a three.js `DataTexture`: paint into the same array and set `needsUpdate` to re-upload it (WebGL2 and WebGPU).
- Transient-light fallback (5.6.0): adding or removing a short-lived light (a VFX flash) no longer blanks lit meshes while their new shader variants compile; each draw reuses the material's last ready program that differs only in light counts and was built for at least as many direct lights, until the new variant is ready.
- Instances under a parent: `instances.*` and model instances inside a static `group(...)` draw at parent transform x instance transform (5.6.0; before, the parent was dropped and wind-swayed batches drew at the world origin). Wind-only instance batches accept `setInstances(...)` (clearing or moving trees no longer throws `INSTANCE_SCATTER_RUNTIME_UNSUPPORTED`).
- Thumbnails: `aura3d assets thumbnail` (run by `assets add`) writes `<id>.thumb.png` (a CPU base-colour preview for models, a downscale for textures). From code use `createAssetThumbnailsAsync({ projectDir, assetIds })` from `@aura3d/cli`; the synchronous `createAssetThumbnails` only writes placeholder cards and is deprecated.
- Model tints multiply. `model(asset, { material: { color } })` and `materialOverrides: [{ color }]` multiply the GLB's base-colour factor and keep its textures. For a flat colour use `materialOverrides: [{ target, color, colorMode: "replace", replaceTextures: true }]`; `replaceTextures` turns off the slot's base-colour and metallic-roughness textures.

## Asset-safe pattern

Use generated typed assets (`aura3d assets add`, then `src/aura-assets.ts`) and `model(assets.name)`. Never use raw model strings or URLs in public examples: `model("product")`, `model("/assets/product.glb")`, `model("https://.../product.glb")`, `unsafeModelUrl(...)`. The public-example boundary test (`tests/unit/agent-api/public-example-boundary.test.ts`) fails on them.

For a game with several GLBs, declare them once with `defineModelAssets` (same-origin URL plus 64-character sha256; see `docs/api/model-loader.md`). The production bridge draws nothing for a model without valid provenance.

## Claim evidence for root `createAuraApp`

Root `createAuraApp` claims are backed by a browser test through `@aura3d/engine`. These go public with root-only screenshots and runtime evidence of the exact result: renderer parity, full PBR parity, HDR/IBL lighting parity, bloom, SSAO, DOF, FXAA/TAA or color grading, native WebGPU or compute rendering, skinned GLB animation, morph targets, and finished platformer, racing, falling-block or character-controller games. Until that evidence exists, label the example `prototype`, `template-only scaffold`, `production-runtime`, `rendering` internals or `roadmap`.

## Scene kits, prefabs and primitives

- `sceneKits.*(...).toAppOptions()` is the preferred route for benchmark-style prompts: `physicsPlayground`, `particleFountain`, `solarSystem`, `neonTunnel`, `dataViz`, `miniGolf`, `materialLab`, `cityBlock`, `humanoidWalk`, `productViewer`.
- Verify a kit's returned nodes, app options and browser pixels before a public claim about the feature in its name; when a kit uses primitives, declarative effects or simulated behaviour, describe it that way.
- `prefabs.*` are lower-level pieces for custom composition (`particleFountain`, `cityBlock`, `materialSwatches`, `productViewer`, `physicsRamp`, `physicsPlayground`, `solarSystem`, `dataBars3D`, `neonTunnel`, `miniGolfHole`, `lowPolyHumanoid`).
- Primitives are for set dressing, ground and court surfaces, debug and collision guides, HUD anchors and abstract visualisation. Never build the main character, vehicle, product or hero environment from primitives; use a real GLB admitted as a typed asset (`model(assets.x)`).
- `primitives.box/sphere/plane/cylinder/capsule/torus` reject a `params` key the kind does not use (`invalid-primitive-params`). See `troubleshooting.md`.

## Physics

Use `physics.world(...)`, `physics.body(...)`, `physics.box(...)`, `physics.sphere(...)`, `physics.step(...)`, `physics.debug(...)`, `physics.debugNodes(...)`. After authoring `.physics(...)` on nodes use `physics.worldFromScene(scene)`. Do not import `PhysicsWorld`, `Shape` or `PhysicsDebugAdapter` from `@aura3d/engine`. Start from `sceneKits.physicsPlayground()` or `sceneKits.miniGolf()` for benchmark scenes.

## Cameras, HUDs and evidence

- Camera presets: `camera.physics()`, `charts()`, `materials()`, `city()`, `product()`, `solar()`, `humanoid()`, `miniGolf()`, `neon()`. For known bounds use `camera.autoFrame({ bounds })`. For a typed GLB use `camera.frameAsset(assets.name, { targetHeight })`; it frames, it does not ground (do not claim wheel, foot or road contact from it).
- HUDs: `ui.html("#app", markup)` inserts inside the target; then `ui.onClick`, `ui.setText`, `ui.setPressed`, `ui.slider`, `ui.onInput`, `ui.resetButton`, `ui.toggle`, `ui.scoreCounter`. UI APIs are for UI: never use DOM or CSS as fake particles, labels, lighting or renderer output.
- Evidence and repair signals: `charts.visualQA`, `city.visualQA`, `product.visualQA`, `solar.visualQA`, and `collectAuraSceneEvidence` from `@aura3d/engine/devtools`. These are repair signals, not final proof for renderer, animation, material, WebGPU or gameplay claims.
- Prompt plans: after `definePromptPlan` and `promptPlanToScene`, run `compilePromptPlanV2` and read the report's repair hints before accepting weak output.

## Subpaths

`@aura3d/engine/game` (game kit), `/devtools` (evidence helpers and the dev-only `createAuraTuneOverlay` feel-tuning panel), `/sculpt` (5.5.6 procedural sculpting kernel, `docs/api/sculpt.md`), `/renderer`, `/animation-studio`, `/lanes`, `/contracts`, `/advanced-runtime`, `/production-runtime` (deprecated for game code: use the root exports `attachRootRenderSource` and `TypedGLBActor`).

The source entry `@aura3d/engine/geometry-tools` exposes opt-in mesh modifiers,
attribute interleaving, vertex remapping and welding, topology conversion, morph
evaluation, crease normals, and seeded surface sampling. Operations return new
geometry or explicit diagnostics where applicable. Packed-consumer availability
remains subject to the current candidate's package checks.
