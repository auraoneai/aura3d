# Agent quickstart: zero to a rendering Aura3D scene

**Why Aura3D.** A lit, framed, orbitable product is 10 lines of TypeScript ([tagline check](../../evidence/vs-threejs/tagline-check/)), and `model(assets.x)` is a typed reference to a hashed, licensed model.
HUD, touch, audio, a fixed-step loop and a safety net ship in the same install, so a game needs no extra libraries.
The `llms.txt`, skills and recipes in this project are written for coding agents, which is why the rules below are short.

Aura3D is a TypeScript engine API (`@aura3d/engine`), an asset CLI (`@aura3d/cli`), templates (`create-aura3d`) and a deploy checker. You write declarative scene source; `createAuraApp` owns the renderer, camera, frame loop and resize. Do not import `three`, write a loader or add a render loop.

Read first: [`threejs-to-aura3d.md`](threejs-to-aura3d.md) (if you would write X in three.js, write Y; every line type-checked), then this page, then [`recipes.md`](recipes.md) (a complete scene for the common tasks: copy it, then adapt) and `docs/agents/claims-and-boundaries.md`. Everything below was compiled against the engine types (`tsc`, strict).

## 1. Scaffold and run

```bash
npx create-aura3d@latest my-scene --template product-viewer   # 21 templates: docs/agents/templates.md
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

The complete table is [`threejs-to-aura3d.md`](threejs-to-aura3d.md); signatures for the common roots are in [`api-signatures.md`](api-signatures.md). The short version:

| three.js | Aura3D |
| --- | --- |
| `new Scene()` | `scene()`, then `.add(node)` |
| `GLTFLoader` + `Mesh` | `model(assets.x, { targetHeight })` |
| `new PerspectiveCamera(...)` | `scene({ camera: camera.perspective({ fov, position, target }) })` |
| `AmbientLight` / `HemisphereLight` | `lights.ambient(...)` / `lights.hemisphere(...)` |
| `DirectionalLight` + `castShadow` | `lights.directional({ shadow: true })`; models cast by default |
| `FogExp2` | `effects.fog({ density })` |
| `EffectComposer` + bloom | `effects.bloom()` |
| `ShaderMaterial` | `material.custom({ glsl: { fragment }, uniforms: { clk: { type: "f32", value: 0 } } })` (`uTime`, `uResolution` etc. are reserved prelude names: do not list them in `uniforms`; `uTime` advances only if the scene redraws every frame, so mark the node `.runtime({ id, mutable: true })` or use `app.onFrame` + `handle.setUniform("clk", t)`) |
| `InstancedMesh` + matrices | `instances.cone/box/sphere({ transforms, colors })` |
| `OrbitControls` | `interactions.orbit({ target: "<node name>" })` |
| `AnimationMixer` + `crossFadeFrom` | `app.nodes.require("robot").play("Run", { crossFade: 0.2 })` |
| hand fixed-timestep loop | `createFixedStepLoop(...)` |
| hand mulberry32 | `createCountedRng(seed)` |
| hand `window.__test` hooks | `installQaHooks(...)` |

`material.toon(...)` creates a toon surface; `effects.toon()` is a separate screen pass. Matcap, Lambert and Phong material mappings, and SSAO/SSR/SSGI, are not established by this quickstart. The native WebGPU renderer has bounded feature coverage, so verify the intended route before use. See `docs/workflows/aura3d-vs-threejs-matrix.md` and the `aura3d-threejs-migration` skill.

## 6. Mistakes agents make (all observed)

| Mistake | What happens | Do this |
| --- | --- | --- |
| `primitives.plane({ params: { widthSegments, heightSegments } })` for a displaced surface | Reported as a single 4-vertex quad in 4.1.2 (flat result, found only by comparing frames) | Check vertex count in diagnostics; for vertex displacement build the grid with `geometry.dynamic` |
| `interactions.orbit({ position, autoRotate })` behind `as never` | Nothing happens; `orbit` takes only `{ target?: string }`, a node **name** | Name the node, pass `target`; never cast to silence a type error |
| `app.nodes.require("x")` on a node without `.runtime({ id: "x", mutable: true })`, then rotating it in `onFrame` | `require` throws every frame; in 4.1.3 and earlier the loop stops and the page is blank with no obvious message | Add `.runtime({ id, mutable: true })` to the node; see [`recipes.md`](recipes.md) |
| Any `as never` / `as any` on an Aura3D call | The type error was the real answer; the call is wrong | Fix the call to match the declared options |
| `model("robot")`, a raw `.glb` URL or `unsafeModelUrl(...)` | Fails the boundary check; in production nothing draws | `model(assets.robot)` from `src/aura-assets.ts`, with a `sha256-...` `hash` |
| Writing `hash` or entries by hand | Wrong hash means the production bridge refuses the model | Admit with `assets add`; regenerate, do not edit |
| `import { createGame } from "@aura3d/engine"` | Root `createGame` throws `CREATE_GAME_ROOT_UNAVAILABLE_V1` before mounting | `import { createGame } from "@aura3d/engine/game"` |
| `vite build` fails with `"readFileSync" is not exported by "__vite-browser-external"` | A Node-only asset module was reachable from the browser entry in 4.1.2 | Use `@aura3d/engine` 4.1.3 or newer (see `CHANGELOG.md`) |
| Console `ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404` | The published 4.1.2 lineage requested a missing neutral manifest and fell back to the analytic floor | Upgrade to a version with the embedded neutral probe; see [environment troubleshooting](troubleshooting.md) for non-neutral presets and custom HDRIs |
| Frame 25 to 40% darker with `effects.vignette()` on (4.2.x; console `POSTPROCESS_V2_UNMIGRATED`) | The vignette ran on display-referred bytes; fixed in 4.3.0 (about 6 to 18% now) | Upgrade, or lower the vignette `intensity`; do not retune every light to compensate |
| Copying three.js light intensities | Aura3D renders brighter at equal intensities | Start from the look preset; adjust one value at a time |
| `shadow: true` on several lamps, spots or torches | Only a limited number of local lights cast shadows: the key directional light always, plus up to `localShadowLights` local casters per quality tier (0, 1, 2 or 4); the rest cast nothing, silently | Give the scene one deliberate key shadow caster, ground other local lights with contact or blob shadows, and read `app.diagnostics().lighting.localShadowLights` before claiming a second shadow |

## 7. Where next

- Games, HUD, touch, audio, replay hooks: `docs/agents/build-playbook.md` and `docs/api/game-kit.md`.
- Prompt to scene, scene kits, prompt plans: `docs/agents/prompt-to-3d-workflow.md`.
- Look and evidence: `docs/agents/art-direction.md`, `docs/agents/verification.md`.
- Skills (load on demand): `aura3d-core`, `aura3d-scene-authoring`, `aura3d-assets`, `aura3d-browser-game`.
- Claim labels before saying "works", "ships" or "faster": `docs/agents/claims-and-boundaries.md`.

## Colours and look HDRIs

- Every colour input (`material.*`, `scene().background`, lights, fog, instance `colors`, effects) accepts any CSS form: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklch()`, the 148 CSS names and `transparent`. A value that matches none throws `AuraColorParseError` with `code: "COLOR_INVALID"` naming the value and the option (`material.pbr({ color })`); it is never replaced by a near-black fallback. Hex colours produce the same values as before.
- `looks.preset(id)` loads its HDRI from `/hdri/<file>.hdr` (golden-hour: `kloppenheim_06_puresky_1k.hdr`, outdoor looks: `autumn_field_puresky_1k.hdr`, studio and interior looks: `studio_small_08_1k.hdr`). Scaffolded templates ship the file under `public/hdri/`. If the file 404s or is a git-LFS pointer the engine renders a procedural probe at the measured mean exposure of the real HDRI (lighting and colour cast differ, no sun disc or softbox shapes), logs one `console.error` with `LOOK_HDRI_MISSING` naming the file and the fix, and lists the same message in `app.diagnostics().warnings`. `aura3d check-deploy` warns before deploy when a used preset's HDRI is not under `public/hdri/`.
