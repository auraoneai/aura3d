# Chroma Roll (`splat-rush-port`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. The game needs no code change to build or run on 4.5.0, but the seven Meshy GLB models (floating-island backdrop and power-up gems) are lit only by the scene's authored lights now. They are expected to render darker than on 4.3.7, so compare screenshots before release.

## What this game uses

- `apps/showcase-splat-rush-port/package.json`: `"version": "4.5.0"`, dependency `@aura3d/engine: workspace:*` (already bumped).
- `apps/showcase-splat-rush-port/src/main.ts`: two imports only, `../../showcase-port-shared/diag` and `../../../examples/splat-rush-port/main`. All game code is in `examples/splat-rush-port/`. `git diff main` shows no changes to either folder besides `package.json`, so the 4.3.7 and 4.5.0 sources are identical.
- `apps/showcase-port-shared/diag.ts`: `?diag=1` panel through `@aura3d/debug` (`installSafetyNet`, `resolveQualitySwitches`). It reads draw calls from the `window.__AURA_SPLAT_RUSH__` QA hook, not from the canvas.
- `examples/splat-rush-port/main.ts:207-214`: the single `createAuraApp` call, with `autoStart: false`, `resize: false`, `pixelRatio: 1`, `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }`, `output: { toneMapping: "none", dither: false }`. There is no `quality`, `preserveDrawingBuffer` or `effects.*`.
- `examples/splat-rush-port/world.ts`: about 400 `geometry.custom(geometry.dynamic(...))` nodes (count approximate), each with `material.custom` GLSL (toon, flat, shadow, sky). Per-frame updates go through `app.nodes.require(id)` handles (`setPosition`, `setUniform`, `updateAttribute`) and `controller.setPose`. A `texture.canvas` ball texture and ramp texture are created at build time (`world.ts:210-211`).
- `examples/splat-rush-port/backdrop.ts:50-52` and `pickups.ts:39`: `lights.hemisphere` (intensity 1.15, sky `#ffffff`, ground `#7788aa`), `lights.directional` x2 (1.6 and 0.5), and `model(MODELS[...], { castShadow: false, receiveShadow: false })` for 12 backdrop pieces (`backdrop.ts:54`) and the power-up gems. `models.ts` defines 7 GLBs through `defineModelAssets`.
- `examples/splat-rush-port/main.ts:305`: `installQaHooks("splat-rush", ...)` plus `createAuraRouteHealthSnapshot`, `createFixedStepLoop`, `readQaParams`.
- Not used anywhere in the port: `environments.*`, `effects.*`, `looks.*`, `postPresets`, `instances.*`, `interactions.*`, `primitives.*`, `physics`, animation layers or clips, `Clock` from the math package, `ShapeGeometry`, `readPixels`, `toDataURL`, `toBlob`, `drawImage(canvas)`, `app.screenshot()`, `app.capture()` (grepped `examples/splat-rush-port`; the QA hook calls `app.capture` itself, see below).

## What changes for this game in 4.5.0

### 1. Models are lit by authored lights only (change 3, applies, visual check recommended)

- **What happens now:** In 4.3.7 (`main`), `createProductionRuntimeEnvironment(snapshot, flags)` was called without options. A scene with lights but no ambient light and no `environments.*` node therefore also received the scene-category fill (studio, gameplay, daylight or evening preset), and hemisphere lights did not contribute. In 4.5.0 it is called with `{ implicitFill: false }` at `packages/engine/src/agent-api/compiler/renderer.ts:152`. With no environment node and only light nodes, it returns the preset `authored-lights` (`packages/engine/src/agent-api/compiler/environment.ts:172-181`). The environment fill is then only the ambient total plus the hemisphere mean, `(sky + ground) / 2 * intensity` (`environment.ts:50-82`). For this game that is roughly 0.68, 0.71, 0.80 in linear light. The two directional lights are ordinary light nodes and are not part of the fill. The code comment at `environment.ts:36-42` says the removed fill lifted nominal lights roughly 2x to 6x, so expect the 12 backdrop pieces and the gem models to look darker or flatter. The hemisphere contribution only partly offsets that. Confirm with screenshots.
- **What does not change:** The toon, flat, shadow and sky surfaces carry their own hard-coded lighting (`examples/splat-rush-port/shaders.ts:1-8`), so the road, ball, gates, splatters, clouds, particles and shield are not affected by this.
- **Evidence:** `examples/splat-rush-port/backdrop.ts:50-52` (lights), `:54` (models), `examples/splat-rush-port/pickups.ts:39` (gems), `examples/splat-rush-port/world.ts:212-214` (scene has no environment node).
- **Note on `quality: "production"`:** it does not restore the old fill, because `implicitFill: false` is hard-coded at `renderer.ts:152` regardless of quality. No public option restores `implicitFill: true`.
- **What to do:** First compare screenshots of the backdrop and gems against 4.3.7. If they look darker or flatter than you want, restore a fill by adding an environment node to the scene builder in `world.ts`, next to `.background(...)`:

```ts
import { camera, environments, geometry, material, scene, texture, type AuraApp } from "@aura3d/engine";
// in buildWorld(), after .camera(...):
builder.add(environments.studio());
```

  Alternatively set `output.exposure` in `main.ts:212`, for example `output: { toneMapping: "none", dither: false, exposure: 1.2 }` (`exposure` is a linear multiplier, `packages/engine/src/contracts/output.ts:11`). I did not test how `exposure` interacts with `toneMapping: "none"`; screenshot-test it before relying on it. Prefer the `environments.studio()` option first. Either change alters the backdrop, so re-capture after it.
- **How to check:** Open `/apps/showcase-splat-rush-port/?capture=1&seed=20261023&manual=1&autostart=1` on the remote runner (no local Playwright), advance to a fixed step with `__AURA_SPLAT_RUSH__.stepFrames(n)` (same `n` on both builds), take a screenshot, and compare with the same capture from the 4.3.7 build. Also read `__AURA_SPLAT_RUSH__.diagnostics()` (the QA hook returns `app.diagnostics()`) and confirm it reports no unexpected warnings or errors.

### 2. Render path stays on the HDR chain (change 1, applies as "no visible change expected", confirm once)

- **What happens now:** `quality` defaults to `"auto"`. `renderer.qualityProfile: "production"` is a deprecated pixel-ratio/draw-budget preset and is not read as a pipeline request (`packages/engine/src/agent-api/app/renderPath.ts:151`, in `requestedQuality`, lines 138-153). `renderPathBlockers` lists "output options (tone mapping, exposure, dithering) are authored" when `options.output` is set (`renderPath.ts:105`). This game sets `output` at `main.ts:212`, so it stays on `hdr-msaa`. The `geometry.custom` nodes are also blockers: their node kind is not in `DIRECT_SAFE_NODE_KINDS` (`renderPath.ts:100`), so each is listed as "<kind> node" (`renderPath.ts:120-123`). The output option alone is enough. A `?aura3d-render=<mode>` URL parameter overrides the option (`renderPath.ts:140`), which lets you compare render paths without a rebuild.
- **What to do:** Nothing. Do not remove `output` unless you accept the direct path (canvas MSAA, silhouette edges can differ up to 48/255 on 0.1-0.3% of pixels).
- **How to check:** `__AURA_SPLAT_RUSH__.diagnostics().renderPath` should read `{ path: "hdr-msaa", quality: "auto", ... }`. The QA hook is installed at `main.ts:305` with `app: () => app` (`main.ts:311`), and `hooks.ts:151` forwards `diagnostics()` from that app; the hook does not expose the app object itself. `bloomFusion` should be `"off"` (no bloom effect; `renderPath.ts:35`).

### 3. Per-frame cost and warm programs (change 13, applies passively)

- **What happens now:** `getError` is sampled instead of called every frame, and unused warm programs are dropped. The game updates about 400 runtime nodes and rewrites three dynamic position/normal attribute pairs per frame (`world.ts:348-353`). No code change.
- **How to check:** Compare `drawCalls` in the `?diag=1` panel (`apps/showcase-port-shared/diag.ts`, fed by the hook's diagnostics/info) against 4.3.7. Draw-call counts should not rise.

## Changes that do not affect this game

- Change 2, `preserveDrawingBuffer` default false: the game never reads the canvas. It has no `readPixels`, `drawImage(canvas)`, `toDataURL`, `toBlob` or `screenshot()`. Its QA hooks go through `app.capture({ type: "png-blob" })` (`packages/engine/src/qa/hooks.ts:101-104`), which is the supported path. Page screenshots via the browser are unaffected. If you add canvas read-back later, pass `preserveDrawingBuffer: true` or use `?capture=1` / `?qa=1` (`renderPath.ts:181-193`).
- Change 4, `OPTION_IGNORED`: the game uses no `primitives.*`, `instances.*` or `interactions.*`. It passes only `name` and `material` to `geometry.custom`, and `name`, `targetMaxDimension`, `castShadow`, `receiveShadow` to `model`.
- Change 5, `interactions.orbit`: no interactions; the camera is driven by `controller.setPose` (`world.ts:386`).
- Change 6, instancing and shadow batching: no `instances.*`, and no shadow-casting nodes (`castShadow: false`).
- Change 7, bloom fusion: no bloom effect.
- Change 8, contact shadows: no `effects.contactShadows`; the ball shadow is a custom flat mesh (`world.ts:228`).
- Change 9, float-target effects (AO, DOF, god rays, TAA, motion blur, auto exposure): none used.
- Change 10, animation and physics: no animation layers, `addClipsFrom` or physics.
- Change 11, math and animation fixes: the game's own `Clock` emulation lives in `sim.ts` (`sim.ts:143`) and does not import the engine `Clock`. No `ShapeGeometry` or `SphericalHarmonics3`.
- Change 12, scene kits: no scene kits and no built-in humanoid.
- Change 14, package versions: already `4.5.0` in `apps/showcase-splat-rush-port/package.json`.

## Checklist

- [ ] Run `node tools/game-checks/run.mjs splat-rush-port` (a read-only run of it reported 0 errors, 0 warnings during the original review).
- [ ] On the remote runner, run the unit tests in `tests/unit/splat-rush-port/` (including `shaders-compile.test.ts` and `reference-replay.test.ts`) and confirm they pass; the simulation is unchanged, so replay results should be identical.
- [ ] Load `/apps/showcase-splat-rush-port/?diag=1` and confirm `__AURA_SPLAT_RUSH__.diagnostics().renderPath.path` is `"hdr-msaa"` and its `warnings`/`errors` are empty.
- [ ] Capture `?capture=1&seed=20261023&manual=1&autostart=1` screenshots (splash, mid-run, game over, same `stepFrames` counts) on 4.3.7 and 4.5.0 and compare the backdrop islands, balloons and gems. Expect the models to be darker on 4.5.0.
- [ ] If the models look different, add `builder.add(environments.studio())` in `world.ts` (preferred) or set `output.exposure` in `main.ts`, then re-capture and re-check that the toon surfaces are unchanged.
- [ ] Update `apps/showcase-splat-rush-port/route-health.json` evidence text only if the screenshots or draw-call counts you cite change.
