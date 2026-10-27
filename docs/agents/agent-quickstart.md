# Agent quickstart: zero to a rendering Aura3D scene

**Why Aura3D.** A lit, framed, orbitable product is 10 lines of TypeScript ([tagline check](../../evidence/vs-threejs/tagline-check/)), and `model(assets.x)` is a typed reference to a hashed, licensed model.
HUD, touch, audio, a fixed-step loop and a safety net ship in the same install, so a game needs no extra libraries.
The `llms.txt`, skills and recipes in this project are written for coding agents, which is why the rules below are short.

Aura3D is a TypeScript engine API (`@aura3d/engine`), an asset CLI (`@aura3d/cli`), templates (`create-aura3d`) and a deploy checker. You write declarative scene source; `createAuraApp` owns the renderer, camera, frame loop and resize. Do not import `three`, write a loader or add a render loop.

Read first: this page, then [`recipes.md`](recipes.md) (a complete scene for the common tasks: copy it, then adapt) and `docs/agents/claims-and-boundaries.md`. Everything below was compiled against the engine types (`tsc`, strict).

## 1. Scaffold and run

```bash
npx create-aura3d@latest my-scene --template product-viewer   # 20 templates: docs/agents/templates.md
cd my-scene && npm install
npm run dev        # vite dev server
npm run build      # typecheck + vite build
```

Games: start from `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `arena-shooter` or `character-controller`, then read `docs/agents/build-playbook.md`.

## 2. Smallest scene (no assets)

```ts
import { createAuraApp, interactions, looks, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(primitives.box({ name: "cube", material: material.pbr({ color: "#4f8cff" }) }))
    .add(interactions.orbit({ target: "cube" })),
  ...looks.appOptions("product-studio")
});
```

`looks.preset(id)` supplies environment light, key shadow, fog, background and grade; spread `looks.appOptions(id)` with the same id. The id is typed; valid ids: `outdoor-day`, `golden-hour`, `overcast`, `night-city`, `polar-night`, `alpine-snow`, `interior-warm`, `interior-neutral`, `interior-industrial`, `space`, `underwater`, `product-studio`, `character-showcase`, `arena-fight`, `neon-arcade`. Match the genre in `docs/agents/art-direction.md`. A scene with no look renders flat.

## 3. A real model (typed asset)

Hero subjects (products, characters, vehicles) are GLB files, never boxes. Admit the file once, then use the generated key:

```bash
npx @aura3d/cli@latest assets search "studio robot"             # catalog first
npx @aura3d/cli@latest assets resolve "studio robot" --name robot
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot   # or your own file
```

This writes `src/aura-assets.ts` (a `defineAuraAssets({...})` object whose entries carry `url`, `bounds` and a `sha256-...` `hash`). Never write or edit it by hand.

```ts
import { createAuraApp, interactions, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(model(assets.robot, { name: "robot", targetHeight: 1.8 }))
    .add(interactions.orbit({ target: "robot" })),
  ...looks.appOptions("product-studio")
});
await app.ready(); // the WebGL mount (and GLB load) has settled; shader programs may still be compiling (games: await warmPrograms(app))
```

Use `targetHeight` for upright humanoids, `targetMaxDimension` for vehicles and wide props.

## 4. Verify (finite commands, then stop)

1. `npm run build` must pass (it typechecks).
2. The first frame must be non-black with a visible subject: capture it and look. Template routes ship `tests/route-health.spec.ts` and `tests/screenshot.spec.ts` (`npm run test`).
3. `npx @aura3d/cli@latest check-deploy` before calling it shippable.
4. Open `?diag=1` (safety net, in games) or `diagnostics: { overlay: true }` to see draw calls and warnings. Read console warnings: they name the cause.

Browser runs belong on a remote or CI runner when your environment forbids local browsers. In this monorepo use `tools/remote-acr/run.sh` (never local Playwright or Docker). Frames from software WebGL2 prove the scene renders, not GPU speed.

## 5. three.js habit to Aura3D (each row checked against `packages/engine/src/agent-api`)

| three.js | Aura3D |
| --- | --- |
| `new Scene()` | `scene()`, then `.add(node)` |
| `GLTFLoader` + `Mesh` | `model(assets.x, { targetHeight })` |
| `new PerspectiveCamera(...)` | `scene({ camera: camera.perspective({ fov, position, target }) })` |
| `AmbientLight` / `HemisphereLight` | `lights.ambient(...)` / `lights.hemisphere(...)` |
| `DirectionalLight` + `castShadow` | `lights.directional({ shadow: true })`; models cast by default |
| `FogExp2` | `effects.fog({ density })` |
| `EffectComposer` + bloom | `effects.bloom()` |
| `ShaderMaterial` | `material.custom({ glsl: { fragment }, uniforms: { uTime: { type: "f32", value: 0 } } })` |
| `InstancedMesh` + matrices | `instances.cone/box/sphere({ transforms, colors })` |
| `OrbitControls` | `interactions.orbit({ target: "<node name>" })` |
| `AnimationMixer` + `crossFadeFrom` | `app.nodes.require("robot").play("Run", { crossFade: 0.2 })` |
| hand fixed-timestep loop | `createFixedStepLoop(...)` |
| hand mulberry32 | `createCountedRng(seed)` |
| hand `window.__test` hooks | `installQaHooks(...)` |

Not mapped: Matcap, Lambert, Phong and Toon materials (toon is `effects.toon`, a screen pass), SSAO/SSR/SSGI, WebGPU renderer. See `docs/workflows/aura3d-vs-threejs-matrix.md` and the `aura3d-threejs-migration` skill.

## 6. Mistakes agents make (all observed)

| Mistake | What happens | Do this |
| --- | --- | --- |
| `primitives.plane({ params: { widthSegments, heightSegments } })` for a displaced surface | Reported as a single 4-vertex quad in 4.1.2 (flat result, found only by comparing frames) | Check vertex count in diagnostics; for vertex displacement build the grid with `geometry.dynamic` |
| `interactions.orbit({ position, autoRotate })` behind `as never` | Nothing happens; `orbit` takes only `{ target?: string }`, a node **name** | Name the node, pass `target`; never cast to silence a type error |
| `app.nodes.require("x")` on a node without `.runtime({ id: "x", mutable: true })`, then rotating it in `onFrame` | `require` throws every frame; in 4.1.3 and earlier the loop stops and the page is blank with no obvious message | Add `.runtime({ id, mutable: true })` to the node; see [`recipes.md`](recipes.md) |
| Any `as never` / `as any` on an Aura3D call | The type error was the real answer; the call is wrong | Fix the call to match the declared options |
| `model("robot")`, a raw `.glb` URL or `unsafeModelUrl(...)` | Fails the boundary check; in production nothing draws | `model(assets.robot)` from `src/aura-assets.ts`, with a `sha256-...` `hash` |
| Writing `hash` or entries by hand | Wrong hash means the production bridge refuses the model | Admit with `assets add`; regenerate, do not edit |
| `import { createGame } from "@aura3d/engine"` | Root `createGame` is a headless stub (`CREATE_GAME_STUB` warning, no HUD or sound) | `import { createGame } from "@aura3d/engine/game"` |
| `vite build` fails with `"readFileSync" is not exported by "__vite-browser-external"` | A Node-only asset module was reachable from the browser entry in 4.1.2 | Use `@aura3d/engine` 4.1.3 or newer (see `CHANGELOG.md`) |
| Console `ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404` | Falls back to a neutral floor; frames differ from the authored look | Serve the repo `public/aura-environments/` files at `/aura-environments/` |
| Frame 25 to 40% darker with `effects.vignette()` on (4.2.x; console `POSTPROCESS_V2_UNMIGRATED`) | The vignette ran on display-referred bytes; fixed in 4.3.0 (about 6 to 18% now) | Upgrade, or lower the vignette `intensity`; do not retune every light to compensate |
| Copying three.js light intensities | Aura3D renders brighter at equal intensities | Start from the look preset; adjust one value at a time |

## 7. Where next

- Games, HUD, touch, audio, replay hooks: `docs/agents/build-playbook.md` and `docs/api/game-kit.md`.
- Prompt to scene, scene kits, prompt plans: `docs/agents/prompt-to-3d-workflow.md`.
- Look and evidence: `docs/agents/art-direction.md`, `docs/agents/verification.md`.
- Skills (load on demand): `aura3d-core`, `aura3d-scene-authoring`, `aura3d-assets`, `aura3d-browser-game`.
- Claim labels before saying "works", "ships" or "faster": `docs/agents/claims-and-boundaries.md`.
