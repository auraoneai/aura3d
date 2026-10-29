# Apex Overdrive (`roadster-rush`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. No code has to change for the game to run. The main visual risk is lighting: the authored `lights.hemisphere` most likely stops contributing in 4.5.0, so the scene can render darker. The render-path defaults add small differences on top. Compare screenshots, then either compensate in the lights or pin `quality: "production"`.

## What this game uses

- Entry point: `apps/showcase-roadster-rush/index.html:170` loads `src/main.ts`. One `createAuraApp(canvas, ...)` call at `src/main.ts:750-754` with `renderer: { quality: "high" }` and `qualityRebuild: { flags: ["game"] }`. No top-level `quality`, no `output`, no `preserveDrawingBuffer`. `renderer.quality: "high"` is the pixel-ratio/draw-budget tier (low|medium|high|ultra). It is not the render-path `quality` option (auto|production|safe-basic|cinematic). `qualityRebuild.flags: ["game"]` only turns on the dev flag `A3D_QR_GAME`. The default-on flags (`A3D_QR_CORE`, `A3D_QR_LIGHTING`, `A3D_QR_POST`, `A3D_QR_COMPILER`, per `packages/rendering/src/contracts/flags.state.ts:18-45`) stay on.
- Look and post (`src/main.ts:218`, `254-256`):
  - `looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.08 })`.
  - The look expands to an `environments.hdri` node (`autumn_field_puresky_1k`), a key directional light, a colorGrade, an ambientOcclusion and a bloom effect (`packages/engine/src/agent-api/looks/looks.ts:280-349`; every preset gets `V0_EFFECTS` in `lookPresets.ts:60`). Fog is omitted because `fogDensityScale: 0`.
  - The game then adds its own `effects.bloom`, `effects.vignette` and `effects.colorGrade`.
- Lights (`src/main.ts:229-252`): `lights.ambient({ intensity: 0.5 })`, `lights.hemisphere({ skyColor: "#ff9e75", groundColor: "#2a1b38", intensity: 0.7 })`, `lights.directional` with `shadow: { cascades: 2, maxDistance: 90, blend: 0.12 }`, and one `lights.point`.
- No `environments.*` node is authored. The only environment node comes from the look.
- Custom shader materials: `material.custom` at `src/main.ts:264` (`src/art/ground.ts`), `:339` (`src/art/sky.ts`) and `:533` (`src/art/shield.ts`). Uniforms are updated at runtime with `setUniform` (`src/main.ts:890-898`, `1295`).
- Scene content: about 250 `primitives.*` nodes (box, sphere, cylinder, torus) that take only `name`, `size`, `material`, `castShadow` and `receiveShadow`. About 60 `model(...)` nodes: skyline, player car, 9 pooled traffic types, sky cars. Nodes are driven through `game.runtimeNode(...)` handles with a fixed-step simulation in `src/native/`.
- Not used: `instances.*`, `interactions.*`, `effects.contactShadows`, physics, animation layers/masks/`addClipsFrom`, `Clock`, `AnimationClip`, `ShapeGeometry`, and any canvas read-back in game code (rg over `src/` and `index.html`).
- Debug and evidence: `installBlackFrameGuard()` from `@aura3d/debug` (`src/main.ts:33`), `installGameBeacon` (`src/main.ts:24,29`), and `findDrawCalls(auraApp.diagnostics())` (`src/main.ts:1743`).
- Package: `apps/showcase-roadster-rush/package.json` already pins `4.5.0`. The `description` field still says "Aura3D 4.1.2" (cosmetic). The app does not import `showcase-port-shared` or `apps/common`.

## What changes for this game in 4.5.0

### 1. Render path: stays on the HDR chain; `auto` adds bloom fusion and cascade skipping (change 1, 6, 7)

- **What happens now:** with no `quality` option the mount resolves to `auto` (`packages/engine/src/agent-api/app/renderPath.ts:requestedQuality` / `resolveAppRenderPath`). `renderPathBlockers` lists `effect "bloom"`, `effect "vignette"`, `effect "colorGrade"` and `effect "ambientOcclusion"` (only `fog` is forward-only), `shader material` entries from the three `material.custom` calls, and `hdri environment`. The game therefore keeps the HDR multisampled chain and does not take the direct path. The silhouette-edge MSAA difference does not apply.
- **What does change under `auto`:**
  - The bloom chain is fused with the default `"separable"` mode (`renderPath.ts:bloomFusionAllowed`, `reportedBloomFusion`; the game has bloom effects, so fusion is reported rather than `"off"`). Frames were within 1/255 of the old chain on the PBR viewer; not measured on this game.
  - Shadow cascades that no visible receiver selects are skipped (`packages/rendering/src/shadows/CascadeUse.ts`). The game authors `cascades: 2` (`src/main.ts:243`). Whether the second cascade is skipped depends on camera and traffic positions, so it is unknown from the source alone.
- **What to do:**
  - Keep the default and accept the small differences, or pin the old pipeline: `createAuraApp(canvas, { scene, quality: "production", renderer: { quality: "high" }, qualityRebuild: { flags: ["game"] } })`. `"production"` restores the old pipeline byte-for-byte per the 4.5.0 notes, and `AuraQualityMode` accepts it (`renderPath.ts:requestedQuality`).
  - Only if you want the opt-in 2-D bloom blur: `renderer: { quality: "high", bloomFusion: "fused-2d" }`. It is not recommended (opt-in until a real-GPU receipt exists, `nodes/types.ts` doc on `bloomFusion`).
- **Check:**
  - In the console: `__AURA3D_SHOWCASE_ROADSTER_RUSH__.app.diagnostics().renderPath` should report `path: "hdr-msaa"`, `quality: "auto"` and `bloomFusion: "separable"` (`src/main.ts:1584` exposes `app`).
  - Compare `?aura3d-render=production` against the default URL (`requestedQuality` reads this param) with a `?capture=1` screenshot at the same `?seed=42`.
  - The `findDrawCalls` HUD readout may drop with fusion on. The 25 vs 33 draws figure comes from the PBR viewer; this game has two bloom effects, so treat any drop as unmeasured.
- **Note:** `route-health.json:12,15` records `"rendererMode": "production"` and `"mode": "production"` from 2026-10-16. That wording predates the new default. Run `rg -n rendererMode tools/` (and the game-check scripts) to see whether any gate compares it to `diagnostics().renderPath.quality`. If you pin `quality: "production"` the record stays accurate.

### 2. Lighting: the hemisphere light most likely stops contributing (change 3, second half)

- **What happens now:** `lights.hemisphere({ skyColor: "#ff9e75", groundColor: "#2a1b38", intensity: 0.7 })` (`src/main.ts:231-236`). In 4.5.0 the production mount passes `hemisphereAsEnvironment: true` (`packages/engine/src/agent-api/compiler/renderer.ts:188`), so `createProductionRuntimeCollectedLights` returns no direct descriptor for it (`compiler/observations.ts:333`). Before, it became a rect-spot proxy there (option doc at `observations.ts:245-252`).
- **Where it is supposed to go:** the mean of sky and ground as uniform irradiance, through `prd02AmbientTerm(snapshot, { includeHemisphere: true })` (`compiler/environment.ts:249-282`). That call is made only in the `prd02.neutral-room` source (`environment.ts:558`), which runs when no environment node exists.
- **Why that does not cover this game:** `A3D_QR_LIGHTING` is default-on, so the PRD-02 sources are active. The look supplies an `environments.hdri` node, so the `prd02.explicit` source (priority 400) wins, and it calls `prd02AmbientTerm(snapshot)` without `includeHemisphere` (`environment.ts:541`). The only other place the hemisphere is compiled is the light handler in `packages/engine/src/lanes/prd02.ts:108-111`, which sets `prd02.hemisphere`. A static grep found no consumer of that key in engine or rendering sources. By static reading, the game's hemisphere (0.7) therefore contributes nothing in 4.5.0. This is not confirmed by running the game.
- **Expected effect:** a darker, less filled scene, mostly on shadowed and downward-facing surfaces (the warm `#ff9e75` sky fill is lost). The `lights.ambient` (0.5) and the look's HDRI still light it.
- **What to do:**
  - Compare against 4.3.7 screenshots in the three time-of-day buttons (`data-aura-tod`, buttons at `index.html:154-156`, handler at `src/main.ts:1683,1717-1722`).
  - If the 4.5.0 render is darker, compensate through lights that still count: raise `lights.ambient` intensity, or change its colour toward the hemisphere mean of `#ff9e75` and `#2a1b38`. Alternatively raise the look's `exposureEv` (currently `0.08`, allowed range -2 to 2). Tune by eye. Do not add a new light.
  - Or pin `quality: "production"` and compare again. Pinning does not change this hemisphere handling, because `hemisphereAsEnvironment` is passed unconditionally at `renderer.ts:188`, so do not expect it to restore the old look.
- **Check:** `node tools/game-checks/run.mjs roadster-rush`, plus before/after `?capture=1` screenshots at `?seed=42`.

### 3. AO now renders on devices without float linear filtering (change 9)

- **What happens now:** the look adds an `ambientOcclusion` effect (`looks.ts:343-345`). AO uses RGBA32F depth targets. 4.5.0 point-samples them when `OES_texture_float_linear` is missing (`packages/rendering/src/webgl2/TextureFormats.ts:71-86`, `renderTargetSampleFilter`).
- **Effect:** on such devices (some mobile GPUs and software WebGL) AO was previously invisible and will now show. It can read darker than on the 4.3.7 screenshots. Desktop GPUs with the extension are unchanged.
- **What to do:** nothing unless the AO looks heavy on a device without the extension. The look's AO cannot be turned off: `looks.preset` overrides only accept `sun`, `exposureEv`, `fogDensityScale`, `accent` and `background` (`packages/engine/src/contracts/looks.ts:12`). `quality: "production"` does not restore the old invisible AO either, since the filter fix is shared. Accept the change, or lower the darkness elsewhere (for example the lights above).
- **Check:** open the game on a software-WebGL/CI runner and on a desktop GPU, and compare the freeway at `?seed=42`.

### 4. Optional: nothing reads the canvas, but the black-frame guard samples it (change 2)

- **What happens now:** `preserveDrawingBuffer` defaults to false except with `?capture=1` or `?qa=1` (`renderPath.ts:wantsPreservedDrawingBuffer`). The game code has no read-back. The only canvas read is the black-frame guard, which does `drawImage(canvas)` in `packages/debug/src/safety/blackFrame.ts:244`. The guard's frame tap (`packages/debug/src/safety/frameTap.ts`) queues its read in a microtask right after the first default-framebuffer draw of the task, before compositing, so a non-preserved buffer is read correctly.
- **What to do:** nothing. If you add your own `toDataURL`/`readPixels` after an `await`, pass `preserveDrawingBuffer: true` or use `auraApp.capture()` / `auraApp.screenshot()`.
- **Check:** load the page with no query string and confirm the heal ladder does not trigger (`window.__AURA3D_HEAL__.rung` stays at the first rung).

## Changes that do not affect this game

- **3 (first half, exposure drop with no `environments.*`):** a look-generated `environments.hdri` node exists (`looks.ts:293-298`), so `createProductionRuntimeEnvironment` takes the authored-environment branch (`environment.ts:95`). The new "authored lights only" branch (`environment.ts:172`, enabled by `implicitFill: false` at `renderer.ts:152`) is not reached. The game still uses `exposureEv: 0.08` through the look. (The hemisphere side effect of having an authored environment is covered in item 2.)
- **3 (look fills for night-city, polar-night, neon-arcade, space, underwater):** the game uses `outdoor-day`.
- **4 (OPTION_IGNORED):** every option passed to `primitives.*` (`name`, `size`, `material`, `castShadow`, `receiveShadow`) is in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:58-64`). No `instances.*` or `interactions.*` calls. `model(...)`, `lights.*` and `effects.*` are not covered by this diagnostic. Expect no `OPTION_IGNORED` entries. Check `auraApp.diagnostics()` once to confirm.
- **5 (`interactions.orbit` options):** no interactions are used.
- **6 (instancing, shadow proxy, dense depth batching, cascade cap at 8192 casters):** no `instances.*` and no setInstanceTransforms. The cascade cap needs at least 8192 instanced shadow casters. Only the cascade-skip part applies (see item 1).
- **8 (`effects.contactShadows` mask):** not used. `player-contact-shadow` (`src/main.ts:557-561`) is a hand-placed primitive.
- **10 (animation layers/masks, `addClipsFrom`, physics colliders):** the game has no animation controller or physics. Models are posed through runtime node handles.
- **11 (`Clock.start()`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three`):** none used.
- **12 (scene kits, built-in humanoid):** no scene kits are used.
- **13 (getError sampling, per-frame allocation, unused warm programs):** a pure engine cost reduction. No action. `?diag=1` brings back per-frame `getError` if needed.
- **14 (package pins):** already `4.5.0` (`package.json`).

## Measured after the upgrade (2026-10-29)

The sections above describe the 4.5.0 release source. The audit fixes since then (`docs/audits/lanes/g02.md`) moved the pooled traffic, pickups and roadside props to `instances.*`, removed the hemisphere light (it never contributed next to the look's HDRI) and the authored bloom and colour grade that stacked on the look's, so their line numbers no longer match.

All numbers are from remote runs on software WebGL2 (SwiftShader in the ACR runner), not a GPU. Spec: `tests/browser/audit-fix/roadster-rush.spec.ts`; frames and numbers in `evidence/apex-overdrive/audit-2026-10-29/`.

- **Render path:** `diagnostics().renderPath` reports `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`.
- **Brightness, 4.3.7 against 4.5.0** (mean luma of the canvas, seed 42, 1280x720): gameplay-early 76.91 on 4.3.7 and 80.85 on 4.5.0; key-ramp 82.16 and 86.44. The 4.5.0 frame is about 5% brighter, not darker: the hemisphere was already dropped on 4.3.7 (audit LIGHT-05), and the authored colour grade stacked on the look's. With the audit fixes (one grade, one bloom) the same states measure 77.57 and 85.07.
- **Fused bloom against the production chain:** gameplay-early at `?capture=1` measures 77.58 under `auto` and 77.58 with `&aura3d-render=production` (80.89 and 80.88 before the fixes). The difference is under 0.01 of 255.
- **Time of day** (Sunset, Dusk, Night buttons): 84.14, 74.56 and 61.25 (4.5.0 base: 83.51, 73.82, 60.30).
- **`OPTION_IGNORED`:** none. **Heal ladder:** `window.__AURA3D_HEAL__` stays at rung 0 (`full`).
- **`route-health.json` `rendererMode`:** nothing compares it with `renderPath.quality` (`rg -n rendererMode tools/` finds only `tools/showcase-library/game-audit-matrix.mjs`, which reads `main.ts`, and `tools/agent-examples/index.ts`, which checks the starter examples).

## Checklist

- [x] Run `node tools/game-checks/run.mjs roadster-rush` and confirm 0 errors. (0 errors, 0 warnings.)
- [x] Load `/apps/showcase-roadster-rush/?seed=42` and check `__AURA3D_SHOWCASE_ROADSTER_RUSH__.app.diagnostics().renderPath` reports `hdr-msaa`, `auto`, `bloomFusion: "separable"`.
- [x] Check `app.diagnostics()` for `OPTION_IGNORED` entries (expected: none). (None.)
- [x] Take `?capture=1&seed=42` screenshots of each time-of-day preset (Sunset 0, Dusk 0.5, Night 1) on 4.3.7 and 4.5.0 and compare brightness and AO. (4.5.0 base against the fixed build above. The 4.3.7 run reached gameplay states only, at Sunset: 4.5.0 is about 5% brighter there.)
- [x] If darker, compensate with `lights.ambient` intensity/colour or the look's `exposureEv`, and re-compare. Do not rely on `quality: "production"` to restore the hemisphere. (Not darker; no compensation. The hemisphere light was removed from the scene because it never contributed.)
- [x] Compare the default URL against `?aura3d-render=production`. Decide whether to accept the `auto` differences or set `quality: "production"` at `src/main.ts:750`. (Under 0.01/255 apart; `auto` kept.)
- [x] If pinning `quality: "production"`, keep `route-health.json` `rendererMode` as `"production"`. If not pinning, run `rg -n rendererMode tools/` and confirm nothing compares that field with `renderPath.quality`. (Not pinned; nothing compares it.)
- [x] Confirm `window.__AURA3D_HEAL__` shows no escalation after 30 seconds of play (black-frame guard with `preserveDrawingBuffer` off). (Rung 0 through the dense 50 s state.)
- [x] Optional cosmetic: update `package.json` `description` ("Aura3D 4.1.2") to 4.5.0. (The description no longer names a version.)
