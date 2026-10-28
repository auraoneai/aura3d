# Troubleshooting

Read the code first. Every runtime message below is real and greppable in `packages/*/src`. Where a check is given, run it before changing code.

How to read diagnostics at run time: `app.diagnostics()` returns `warnings`, `errors`, `drawCalls`, `assets` (load state per asset) and, when a custom shader failed, `shaderFailures` (code, material, stage, driver log, source lines). Open any route with `?diag=1` for an on-page panel (GPU, limits, draw calls, shader failures, recent errors, heal reason; failing custom shaders draw magenta). Under the strict quality-rebuild flag (`A3D_QR_STRICT`) custom-shader failures throw instead of being recorded.

## 1. Build and install

**`"readFileSync" is not exported by "__vite-browser-external"` during `vite build` (or `node:fs` in the browser bundle)**
- Cause: a browser entry reached the Node-only `@aura3d/assets` index.
- Fix: the engine imports `@aura3d/assets/browser`; do the same in your own browser code and never import the bare `@aura3d/assets` index there.
- Check: `tools/release/consumer-build-smoke.mjs` (see its header) builds a temp project from packed tarballs and fails if a browser entry still reaches a `node:*` import.

**`npm ci` fails: lockfile out of sync with `package.json`**
- Cause: a template lockfile pinned an older `@aura3d/assets` than the manifest. The repo `mini-game` template has no lockfile.
- Fix: delete the stale `package-lock.json` and run `npm install`; do not hand-edit it.

## 2. Runtime errors (`AuraRuntimeError`, `error.code`)

**`missing-canvas`** - "Aura3D could not find canvas target "#app"".
- Cause: the selector matched nothing, or `document` is unavailable (SSR).
- Fix: add `<canvas id="app"></canvas>` (a non-canvas element gets a canvas appended), or pass an `HTMLCanvasElement`. Run `createAuraApp` in the browser only.
- Check: `document.querySelector("#app")` is non-null before `createAuraApp`.

**`missing-asset` / `failed-glb-load`** - an asset id has no typed definition, or a GLB could not load.
- Fix: `aura3d assets add ./file.glb --name x`, import the generated `assets`, then `aura3d assets validate`. `sceneKits.productViewer` requires a typed model asset.
- Check: `app.diagnostics().assets` shows each asset's load state.

**`unsupported-texture`** - bad `texture.data` size or format ("requires exactly N bytes for WxH"), or a texture type outside png, jpg, jpeg, webp, ktx2.
- Fix: match the byte length to width x height x channels; convert other formats.

**`invalid-scene-options`** - "scene(init) does not understand ...". `scene()` accepts only `children`, `background`, `camera`, `timeline`, `diagnostics`.
- Fix: put nodes in `.add(...)`, or pass `{ children: [...] }`.

**`invalid-primitive-params`** - "params "radius" has no effect on this kind". Only segment-style keys are accepted for `box`, `sphere`, `plane`, `cylinder`, `capsule`, `torus`; size comes from `size`/`scale`.
- Fix: use the supported key named in the message.
- If you need a subdivided plane, build the grid with `geometry.dynamic` and confirm the vertex count in the frame rather than relying on `params` segment counts.

**`invalid-model-assets`** - from `defineModelAssets`: "needs a 64-character hex sha256", "has no url", "points at another origin ... without sourcePath under public/aura-assets/", "unknown model id".
- Cause: the production bridge refuses a model without a valid hash and same-origin provenance, and would draw nothing.
- Fix: `aura3d assets add` or `shasum -a 256 <file>` and pass the digest; keep files under `public/aura-assets/`; never leave `hash` out of `defineAuraAssets(...)` either (the bridge requires `createAssetProvenance(asset).source === "typed-aura-assets-manifest"`).

**`invalid-material-spec`** - `material.custom(spec)` or `setUniform` misuse: malformed spec, WGSL-only input, reserved uniform names, invalid values.
- Fix: read the message; it names the field.

**`custom-shader-compile-failed`** - thrown only under `A3D_QR_STRICT`; see CUSTOM_SHADER_* below for the default behaviour.

**`compute-requires-webgpu`**, **`invalid-compute-spec`** - `compute.*` needs a bound WebGPU device and WGSL; GLSL input is rejected. **`invalid-tsl-graph`**, **`tsl-*`** - the TSL subset covers a limited set of node names; see `docs/api/root-exports.md` (`tsl` members).

**`CREATE_GAME_STUB`** (console warning) - you imported `createGame` from `@aura3d/engine`, which is a headless stub: no HUD, touch, juice or sound, and `game.sound` is `undefined`.
- Fix: `import { createGame } from "@aura3d/engine/game"` (`docs/api/game-kit.md`).

## 3. Diagnostics codes you will see in the console or `diagnostics().warnings`

**`CUSTOM_SHADER_COMPILE_FAILED`, `CUSTOM_SHADER_LINK_FAILED`, `CUSTOM_SHADER_WGSL_MISSING`**
- Cause: a `material.custom`, `material.node` or `effects.shaderPass` shader failed to compile or link, or has no WGSL twin on WebGPU. Logged once with `console.error` (`[aura3d] ...` with the driver log and a source window) and stored in `diagnostics().shaderFailures`.
- Effect: the failing draw is skipped; every other draw continues.
- Fix: read `shaderFailures[i].locations` (driver line and authored line); the usual causes are a duplicate GLSL variable, a prelude name used wrongly (`position`, `modelMatrix`, `outColor`), or GLSL given to a WebGPU path. See `docs/api/shader-diagnostics.md`.
- Check: `app.diagnostics().shaderFailures` is undefined or empty.

**`CUSTOM_ATTRIBUTE_UNUSED`, `CUSTOM_UNIFORM_UNUSED`** (warnings)
- Cause: a declared attribute or uniform is not active in the linked program (unused or optimised out). It is not uploaded and the draw is not skipped (4.1.x).
- Fix: use it in the shader or remove the declaration. Harmless otherwise.

**`INSTANCES_EMPTY`** (warning) - "instances.box "x" has no instances this frame; nothing is drawn."
- Cause: an instance pool with zero transforms. Valid; the node is skipped (4.1 and later; earlier versions blanked the canvas).
- Fix: none needed unless you expected instances; check the transform array you pass per frame.

**`ENV_FETCH_FAILED`** - "environment probe not ready; rendering with the neutral floor (ENV_FETCH_FAILED:/aura-environments/neutral.manifest.json:404)".
- Cause: the baked environment files are served from `public/aura-environments` in this repository but are not in the published packages, so an app built from npm gets a 404 and falls back to a neutral floor lighting.
- Effect: it still renders, but not with the authored environment look.
- Fix (workaround): copy the repo's `public/aura-environments` into your app's `public/`, or author an explicit environment (`environments.studio()`, `environments.hdri(...)`). A self-contained neutral environment is planned (`docs/workflows/aura3d-vs-threejs-analysis-and-plan.md`, WP-2).
- Check: the network panel shows no 404 for `/aura-environments/*`.

**`ENVIRONMENT_SOURCE_TIE:<ids>`** - two environment sources registered at the same priority; one wins deterministically. Give one a different priority.

**`POSTPROCESS_V2_UNMIGRATED:<reason>`** (warning, removed in 4.3.0)
- Cause (4.2.x and earlier): any configured postprocess chain was labelled "unmigrated" under core output, although the PostGraph v2 route already tone-maps and encodes once. It could appear even when you authored no post effect.
- Effect: none by itself. The 25 to 40% darkening people saw with it came from `effects.vignette()`, which darkened display-referred bytes after the tone map. 4.3.0 applies it in linear light before the tone map (about 6% to 18% mean luma at `intensity: 0.16`, `smoothness: 0.65`).
- 4.3.0 and later: the warning is gone. A chain PostGraph v2 cannot run (`compat.post: "3.0"`, `-post`, WebGPU, `cpu-deterministic`) is reported as `post-legacy-route:<reason>` in `diagnostics().output.postSkipped`, not in the console.

**`WEIGHTS_0 normalized: ... degenerate vertex(es) set to [1,0,0,0]`** - the glTF loader repaired skin weights. Informational.

## 4. Black frame, blank canvas, self-heal

**Page is black or objects are missing on a real GPU but fine in CI**
- Cause: CI used software GL, which is not real-GPU proof. Typical real-GPU causes: NaN from `pow` of a negative base, `normalize` of zero, divide by zero (the engine's own shaders are NaN-safe; custom shaders must be too); a shader that failed to compile on that GPU.
- Fix: open with `?diag=1`, then toggle `?post=0`, `?shadow=0`, `?env=0`, `?sky=0`, `?aa=0`, `?quality=low`, `?tm=aces` one at a time. Use the `a3d_math` chunk helpers in custom shaders.
- Check: `diagnostics().shaderFailures` and the `?diag=1` panel.

**`SAFETY_BLACK_FRAME` / `SAFETY_COMPAT_MODE`** (from `@aura3d/debug` `installSafetyNet`, opt-in)
- Meaning: a black frame was detected and the page reloads one rung down the ladder: rung 1 `no-vfx-fog`, rung 2 `no-post`, rung 3 `legacy-compile` (URL `a3d-qr=game,...`). `SAFETY_COMPAT_MODE` says which rung is active and why.
- `?heal=0` disables it; an `a3d-qr` you set yourself is never rewritten. See `docs/api/safety-net.md`.
- Misfire note: if a healthy game still reloads on a slow or non-preserved drawing buffer, check `?diag=1` for the recorded reason.

**Black frame checklist (blank canvas, but draws are being issued)** - run it in this order before touching lights or materials
1. **Is the canvas growing?** In the console run `[canvas.width, canvas.height, canvas.style.height]` twice, a second apart. If the numbers rise, the canvas is chasing a parent whose height is set by its own content (an auto-height `<body>` or wrapper that also holds a HUD `<div>`); the backing store ends up past GPU limits and nothing draws. The engine detects this and keeps the mounted size on that axis. If the numbers still rise, put the canvas in a wrapper with a definite size (`#stage { width: 640px; height: 360px }`), or pass `resize: false` to `createAuraApp` and give the canvas `width`/`height` attributes.
2. **Is the first frame drawn yet?** Read the canvas only inside a `requestAnimationFrame` callback or after `app.ready()` plus two frames; a WebGL canvas without `preserveDrawingBuffer` reads as zeros anywhere else, and screenshots taken before the first draw are black.
3. **Does `diagnostics()` list anything?** `shaderFailures`, `CUSTOM_SHADER_COMPILE_FAILED`, `ENV_FETCH_FAILED` (a look preset whose environment file is not served; the neutral floor is used).
4. **Toggle one thing at a time** with `?diag=1`: `?post=0`, `?shadow=0`, `?env=0`, `?aa=0`, `?quality=low`. The first toggle that brings the picture back names the culprit.
5. **Is the camera looking at something?** Pass the camera with the `.camera(camera.perspective({ position, target, fov }))` builder, then log `app.nodes` names and positions; a game whose entities are all at the origin under a camera at the origin is also black.

**Textured model drawn through `instances.mesh` or `batched.mesh` is white** - fixed in 4.1; upgrade and give the texture `colorSpace: "srgb"`.

## 5. Look, gameplay and scene problems

- Deployment missing files: run `check-deploy` and upload hashed assets.
- Particle prompt shows zero particles: replace symbolic emitter geometry with
  `effects.particles(...)` or `prefabs.particleFountain(...)`; use a real
  `ui.range`/`ui.onInput` emission control instead of a text-only button.
- Material lab looks like identical spheres: use `material.metal()`,
  `material.glass()`, `material.rubber()`, `material.emissive()`, and
  `material.clearcoat()` in the same scene.
- Empty data-viz screenshot: use `prefabs.dataBars3D({ grid: 6 })`, keep the
  3D bars, caps, axes, labels, grounded legend, hover callout, and bloom in
  frame, and add DOM title, axis labels, numeric ticks, and hover/readout text.
  Do not recreate the Aura app every animation frame.
- Neon tunnel looks like a flat portal: use `prefabs.neonTunnel({ rings: 24 })`
  with an inside-the-tube dolly camera so receding rings, wall chords, rails,
  floor reflections, sparks, fog, bloom, and particles create visible depth.
- City day/night toggle only changes button text: rebuild or update the Aura
  scene on click so sky, lighting, window emissive state, street lights, and the
  foreground state marker visibly change.
- Dev server never exits in an agent run: run the build/test commands needed for
  verification, then stop the server or rely on the benchmark harness to launch
  preview. Do not leave `npm run dev` as the final command.
- Characters, athletes, enemies, vehicles, aircraft, trees, or landmarks look
  like stick-figure humans or box cars: never assemble primary subjects out of
  `primitives.box`, `primitives.sphere`, or `primitives.cylinder`. Mount a real
  3D GLB via `model(assets.<name>, { targetMaxDimension, role })` from
  `src/aura-assets.ts` so every silhouette, look, lighting, and shadow reads
  cleanly (or generate a bespoke PBR 3D model with `meshy` and admit it via
  `aura3d assets import-meshy`). Reserve `primitives.plane`, `primitives.box`,
  `primitives.cylinder`, and `primitives.torus` strictly for ground/court
  surfaces, field lines, UI rings/reticles, laser beams, and invisible physics
  colliders.
- Game route boots into a static menu, frozen canvas, or requires query params
  to animate: never hide the 3D canvas, camera framing, or atmosphere behind an
  opaque full-screen HTML start menu, character select modal, or briefing
  overlay on initial page load, and never require `?autoplay=1`, `?demo=1`, or
  `?play=1`. Start in active 60 FPS gameplay on Frame 1 with an intelligent AI
  autopilot/demo controller that plays autonomously and yields instant manual
  control on the first `keydown`, pointer, touch, or gamepad input. Keep mode,
  stage, camera, and roster selectors in a compact, non-blocking top HUD bar,
  and always call `button.blur()` after button clicks so `Space` or `Enter`
  gameplay keys never re-trigger focused HUD buttons.
- Meshy GLB stalls main-thread glTF parsing or exhausts GPU memory: raw Meshy
  exports often contain `200,000–1,750,000` vertices and `20–65 MB` of
  uncompressed 4K PNG textures. Before admission, run
  `assets optimize --file in.glb --out out.glb --role <role>` (prop 6,000,
  background 15,000, character 30,000, hero or vehicle 40,000 vertices; textures
  capped at 1024 to 2048 px) and admit with `assets import-meshy --into <dir>
  --prefix <game> --name <role>`.
- Custom `defineAssets(...)` model is dropped by the production glTF bridge or
  collides across routes: the production glTF bridge requires
  `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`,
  which requires a valid 64-character `sha256-...` `hash` and
  `public/aura-assets/...` provenance from `aura.assets.json` /
  `src/aura-assets.ts` so the rendered look and silhouette load cleanly. Never
  omit `hash` in custom `defineAssets(...)` declarations and never place
  unhashed duplicate GLBs in route-local `apps/<route>/public/aura-assets/` that
  collide with root `public/aura-assets/`.
- Restarting a round, hole, or bout flashes, drops textures, or aborts in-flight
  GLB loads: do not call `app.setScene()` when restarting on the same
  stage/world (`stageId` / `worldId`); tearing down and remounting the scene
  disposes live GPU resources and breaks lighting and postprocess continuity.
  Track a scene signature (`stageId` / `worldId`) and reset positions,
  visibility, and animations through runtime node handles
  (`app.nodes.require(...)`).
- Scene looks foggy, washed-out, or characters/floors blow out to pure white:
  pass `{ fogDensityScale: 0, exposureEv: -0.1 }` to `looks.preset(...)` for that
  route (`looks.preset` emits `density: 24 / far`, which under `A3D_QR_VFX_FOG`
  can create an `exp2` haze wall at 20–30m). Never pin post-processing or the
  compiler off for every player with a `qualityRebuild.flags` list; install the
  safety net instead. Do not stack
  duplicate high-intensity `lights.directional`, `lights.ambient`, or
  `lights.hemisphere` nodes on top of `looks.preset(...)`. Never set
  `emissive: "#ffffff"` with high `emissiveIntensity` on an instanced pool
  material (`instances.box` / `primitives.box({ instances })`) because
  `instanceColors` multiply `u_baseColor`, not `u_emissiveColor`. Always pass an
  explicit `material: material.pbr({ color })` on untextured Meshy preview GLBs.
- Character or vehicle sinks halfway into logs, pads, or road lanes, or custom
  terrain renders dark/unlit: `model(asset, { targetHeight })` normalizes the
  GLB with `minY = 0` (feet at `position[1]`), whereas `primitives.box` and
  `primitives.cylinder` (`instances.box` / `instances.cylinder`) are centered on
  `[-0.5..+0.5]` so a platform at `(y, sy)` has its top surface at
  `y + sy / 2`. Always place grounded characters and vehicles at
  `platform.y + platform.sy / 2`. Wind custom procedural `geometry.custom`
  triangles counter-clockwise (CCW) when viewed from `+Y` so `gl_FrontFacing`
  is true and vertex normals receive direct sunlight.
- Bottom or half of the viewport is solid black, or fighters overlap at round
  start: size `html, body, #app, canvas` to `100vw × 100vh` (`position: fixed;
  inset: 0; overflow: hidden`) and extend the 3D ground/stage apron deep enough
  in `+Z`/`-Z` under the camera frustum so the bottom third of the frame never
  exposes the clear-color void. Disable `collision: true` on
  `camera.rigs.shoulder` when the target character has attached child runtime
  nodes at the same position. In fighting and sports games, enforce a minimum
  horizontal pushbox separation (`>= 1.4m`) every frame and spawn fighters at
  `|x| >= 1.8m`.
- A model renders pure white in a screenshot but the game looks right when played: textured materials upgrade one at a time after
  mount, so an early frame (or any frame on a software-rendered runner, where each new shader takes tens of seconds) shows plain white
  models. Check `app.diagnostics().renderer.runtime.texturedMaterials[].status` (`pending` means not yet uploaded) with
  `summarizeTextureUpgrade` from `@aura3d/engine/game` and capture only once the nodes you care about read `textured`
  (`docs/api/motion-camera-clear.md`). A model that stays white after its status is `textured` has a real defect: check the texture
  URL, its sha256 and the asset's UV set.
- The 3D view fills only part of the screen on a high-density display, or does not follow a window resize: with `resize: false` the
  engine does not manage the canvas, and a backing size you assign after mount used to leave the renderer drawing at the mount size
  (the picture filled a corner of the larger buffer). The engine now forwards a changed backing size to the renderer, but prefer letting
  the engine size the canvas (omit `resize: false`, pass `pixelRatio: Math.min(devicePixelRatio, 1.5)`), which also follows window and
  parent resizes.
- The chase camera sits inside a wall or tree, or looks through a building: pass the eye your rig wants through `createCameraClearance`
  with a `blocked(x, y, z)` predicate for solid space (`docs/api/motion-camera-clear.md`).

