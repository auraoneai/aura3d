# API surface for agents

Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first. Importable is not the same as proven: a public name does not prove a rendering or gameplay claim. Label any capability as root safe API, production-runtime, rendering internals, CLI asset pipeline, template-only scaffold, prototype or roadmap.

## Where the real list lives

- **`docs/api/root-exports.md`**: every value export of `@aura3d/engine`, generated from `packages/engine/src/public/index.ts`, with kind, area, namespace members and a DEPRECATED section. This is the source of truth for names. Regenerate with `node tools/docs/gen-root-exports.mjs --write`; `node tools/docs/check-root-exports.mjs` fails when it is stale.
- `docs/api/public-api.md`: exhaustive declaration dump for all packages. Do not read it whole (about 40k tokens). Its `@aura3d/engine` section lists a legacy entry file, not the root.
- Topic docs: `docs/api/game-kit.md`, `qa-kit.md`, `model-loader.md`, `scatter-merge.md`, `toon.md`, `skinned-actors.md`, `safety-net.md`, `shader-diagnostics.md`.

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

React apps use `@aura3d/react` around the same root API.

## Pick the name by task (all live at the root)

| Task | Names |
|---|---|
| Mount and run | `createAuraApp`, `createGameApp`, `createFrameLoop`, `app.diagnostics()`, `app.evidence()`, `app.screenshot()`, `app.screenshotAsync()` |
| Scene structure | `scene`, `group`, `groups`, `model`, `primitives`, `text3D`, `geometry`, `line`, `points`, `sprite`, `texture` |
| Look | `material`, `lights`, `environments`, `looks`, `effects`, `postPresets`, `shadows`, `camera`, `cameras` |
| Many objects | `instances`, `batched`, `distanceLod`, `planScatterInstances` |
| Input and UI | `interactions`, `ui`, `labels`, `raycast`, `raycastFirst`, `bindGameTouchControls` |
| Motion | `AnimationController`, `cloneSkinned`, `characters`, `timeline`, `physics` |
| Games | `game`, `games`, `racketSports`, `arcadeKart`, `carSoccer`, `gameFeel`, `createGameAudio`, `createVehicleChassis`, `createCombatAi`; the real HUD/touch/session kit is `@aura3d/engine/game` |
| QA and replay | `installQaHooks`, `readQaParams`, `createFixedStepLoop`, `createCountedRng` |

`app.diagnostics().fps` is the average over the frames presented in the last second, rounded to 0.01; renders issued in one task (a loop of `app.step()` calls) count as one frame. On software GL it reads well below 1. `app.screenshot()` is synchronous and re-renders before it reads; an app with `frameMode: "async"` uses `await app.screenshotAsync()`, which waits for the in-flight frame first (`screenshot()` during an async frame warns `SCREENSHOT_DURING_ASYNC_FRAME`).
| Typed assets | `defineAuraAssets`, `defineModelAssets` |
| Prompt to scene | `sceneKits`, `prefabs`, `definePromptPlan`, `promptPlanToScene`, `compilePromptPlanV2` |
| Data and product scenes | `charts`, `city`, `product`, `solar` (each has `visualQA`) |
| Advanced | `tsl`, `compute` (WebGPU only), `xr`, `registerNodeHandler`, `attachRootRenderSource` |

Members of each namespace (for example `effects.bloom`, `camera.orbit`, `ui.slider`) are listed in `root-exports.md`.

## Do not use these (deprecated at the root, removed in 5.0.0)

| Do not use | Use instead |
|---|---|
| `createGame` from `@aura3d/engine` | It is a headless root stub (logs `CREATE_GAME_STUB` once; `touch` is `null`, `sound` is `undefined`, HUD and menus do nothing). Import `createGame` from `@aura3d/engine/game` |
| `compilePromptPlan` | `compilePromptPlanV2` |
| `collectAuraSceneEvidence`, `captureAuraAppScreenshot`, `createAssetCompatibilityReport` | `@aura3d/engine/devtools` |
| `character.*` | `characters`, `AnimationController`, `prefabs.lowPolyHumanoid` |
| `unsafeModelUrl`, `loadAsset`, `GLTFLoader` | Typed assets and `model(assets.name)`. `unsafeModelUrl` is banned in public examples |
| `createDiagnosticsPanel`, `createEnvironment` | `app.diagnostics()`, `environments.*` |
| `sky`, `water`, `weather`, `workflows` | Marked deprecated with no replacement at the root; check `root-exports.md` before teaching them |

Do not import `three`, `three/examples/...`, `GLTFLoader`, renderer internals or `@aura3d/engine/production-runtime` internals to make a public example look better. If a feature needs internals, the right output is a library task or a roadmap item, not route-local workaround code.

## Asset-safe pattern

Use generated typed assets (`aura3d assets add`, then `src/aura-assets.ts`) and `model(assets.name)`. Never use raw model strings or URLs in public examples: `model("product")`, `model("/assets/product.glb")`, `model("https://.../product.glb")`, `unsafeModelUrl(...)`. The public-example boundary test (`tests/unit/agent-api/public-example-boundary.test.ts`) fails on them.

For a game with several GLBs, declare them once with `defineModelAssets` (same-origin URL plus 64-character sha256; see `docs/api/model-loader.md`). The production bridge draws nothing for a model without valid provenance.

## Claim boundary for root `createAuraApp`

Root `createAuraApp` proves only what a browser test can prove through `@aura3d/engine`. Do not claim these without root-only screenshots and runtime evidence: renderer parity, full PBR parity, HDR/IBL lighting parity, bloom, SSAO, DOF, FXAA/TAA or color grading, native WebGPU or compute rendering, skinned GLB animation, morph targets, production platformer, racing, falling-block or character-controller kits. When evidence is missing, label the example `prototype`, `template-only scaffold`, `production-runtime`, `rendering` internals or `roadmap`.

## Scene kits, prefabs and primitives

- `sceneKits.*(...).toAppOptions()` is the preferred route for benchmark-style prompts: `physicsPlayground`, `particleFountain`, `solarSystem`, `neonTunnel`, `dataViz`, `miniGolf`, `materialLab`, `cityBlock`, `humanoidWalk`, `productViewer`.
- A kit name does not prove the feature in its name. Verify the returned nodes, app options and browser pixels before a public claim; if a kit uses primitives, declarative effects or simulated behaviour, say so.
- `prefabs.*` are lower-level pieces for custom composition (`particleFountain`, `cityBlock`, `materialSwatches`, `productViewer`, `physicsRamp`, `physicsPlayground`, `solarSystem`, `dataBars3D`, `neonTunnel`, `miniGolfHole`, `lowPolyHumanoid`).
- Primitives are for set dressing, ground and court surfaces, debug and collision guides, HUD anchors and abstract visualisation. Never build the main character, vehicle, product or hero environment from primitives; use a real GLB (`model(assets.x)` or Meshy through `aura3d assets import-meshy`).
- `primitives.box/sphere/plane/cylinder/capsule/torus` reject a `params` key the kind does not use (`invalid-primitive-params`). See `troubleshooting.md`.

## Physics

Use `physics.world(...)`, `physics.body(...)`, `physics.box(...)`, `physics.sphere(...)`, `physics.step(...)`, `physics.debug(...)`, `physics.debugNodes(...)`. After authoring `.physics(...)` on nodes use `physics.worldFromScene(scene)`. Do not import `PhysicsWorld`, `Shape` or `PhysicsDebugAdapter` from `@aura3d/engine`. Start from `sceneKits.physicsPlayground()` or `sceneKits.miniGolf()` for benchmark scenes.

## Cameras, HUDs and evidence

- Camera presets: `camera.physics()`, `charts()`, `materials()`, `city()`, `product()`, `solar()`, `humanoid()`, `miniGolf()`, `neon()`. For known bounds use `camera.autoFrame({ bounds })`. For a typed GLB use `camera.frameAsset(assets.name, { targetHeight })`; it frames, it does not ground (do not claim wheel, foot or road contact from it).
- HUDs: `ui.html("#app", markup)` inserts inside the target; then `ui.onClick`, `ui.setText`, `ui.setPressed`, `ui.slider`, `ui.onInput`, `ui.resetButton`, `ui.toggle`, `ui.scoreCounter`. UI APIs are for UI: never use DOM or CSS as fake particles, labels, lighting or renderer output.
- Evidence and repair signals: `charts.visualQA`, `city.visualQA`, `product.visualQA`, `solar.visualQA`, and `collectAuraSceneEvidence` from `@aura3d/engine/devtools`. These are repair signals, not final proof for renderer, animation, material, WebGPU or gameplay claims.
- Prompt plans: after `definePromptPlan` and `promptPlanToScene`, run `compilePromptPlanV2` and read the report's repair hints before accepting weak output.

## Subpaths

`@aura3d/engine/game` (game kit), `/devtools`, `/renderer`, `/animation-studio`, `/lanes`, `/contracts`, `/advanced-runtime`, `/production-runtime` (deprecated for game code: use the root exports `attachRootRenderSource` and `TypedGLBActor`).
