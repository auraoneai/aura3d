# Duneglide (`silt-and-signal-port`): upgrading to Aura3D 4.5.0

**Verdict:** Optional. Nothing is required. The game stays on the HDR render chain, reads no canvas pixels, and uses none of the changed APIs. Under the new default quality `auto`, the bloom pass is fused and sun cascades that no receiver selects are skipped. Both should be within 1/255 of 4.3.7. Decide whether to accept that or pin `quality: "production"`. The lighting, including the hemisphere light, does not change for this scene.

## What this game uses

- `apps/showcase-silt-and-signal-port/src/main.ts` only imports `../../showcase-port-shared/diag` (the `?diag=1` panel) and `examples/silt-and-signal-port/main`. All game code is under `examples/silt-and-signal-port/`.
- `apps/showcase-silt-and-signal-port/package.json:3` is already `4.5.0`. The engine dependency is `workspace:*` (line 12). No change.
- One `createAuraApp` call at `examples/silt-and-signal-port/main.ts:392`:
  - `autoStart:false`, `resize:false`, `pixelRatio:1`
  - `renderer:{ mode:"production", qualityProfile:"production", fallback:"safe-basic" }`
  - `output:{ toneMapping:"none", exposure:0.65, dither:false }`
  - No `quality` option, so it is `auto` in 4.5.0.
- The game drives its own loop with `createFixedStepLoop` (`main.ts:246`) and calls `app.step(0)` from its render function (`main.ts:231`).
- Post-processing:
  - `effects.toon` via `app.post.addPostPass` at runtime (`main.ts:403`).
  - Scene `effects.fog`, `effects.bloom` and `effects.colorGrade` (`world.ts:186-188`).
- Lighting (`world.ts:176-185`):
  - `environments.neutral({intensity: 0.95 | 0.4})`
  - `lights.hemisphere` (intensity 1.05 day, 0.85 night; 1.45 until the audit lane G24 retune, see `docs/audits/lanes/g24.md`)
  - one `lights.directional` with `shadow:{mapSize:4096, cascades:3, maxDistance:360}`
- Custom GLSL via `material.custom` for the sky and the canal water (`world.ts:190`, `218`; specs at `world.ts:44-88`). `ringSpec` (additive) is only listed in `allProgramSpecs` (`world.ts:94`) for the shader-compile unit test. The scene's rings are lit PBR models (`model(assets.ringclean)`).
- Instancing, all built once from a `transforms` array and never updated afterwards (`world.ts:253-311`):
  - `instances.model` for trees, rocks, houses and lamps
  - `instances.cylinder` for piers and masts
  - `instances.polyhedron` for small rocks
- Primitives and prefabs:
  - `primitives.sphere` for the sky dome and the thrusters (`world.ts:190`, `321`)
  - `prefabs.objectiveMarker` (`world.ts:318`)
- Animation: `createAnimationController` with `bindRuntimeNode`, `crossFade` and `update` on the rider (`world.ts:379-389`, `424`).
- No physics module, no interactions, no `Clock`, `AnimationClip` or `ShapeGeometry`. `sim.clockMs` in `sim.ts` is the game's own number, not the engine `Clock`.
- No canvas read-back in the game code.
- Browser specs that read the canvas: `tests/browser/silt-and-signal-frames.spec.ts` (lines 55 and 116), both synchronously after `__AURA_SILT__.render()`. The other silt specs and the neutral-embedded and post-luma harnesses use Playwright `page.screenshot` only.

## What changes for this game in 4.5.0

### 1. Default quality is `auto`: the game stays on the HDR chain, but bloom is now fused (changes 1 and 7)

**What happens now.**
- `resolveAppRenderPath` (`packages/engine/src/agent-api/app/renderPath.ts`) defaults `quality` to `"auto"`. It picks the direct path only when `renderPathBlockers` is empty. The decision is made once at mount from the initial scene (`frameLoop.ts:85-87`), so later `addPostPass` calls do not change it.
- This game is blocked by:
  - authored `output` options (`main.ts:397`)
  - the `bloom` and `colorGrade` effects (`world.ts:187-188`)
  - `material.custom` shader materials (`world.ts:190`, `218`)
  - the transparent canal water (`world.ts:218`)
- So the path stays `hdr-msaa`. The silhouette-edge difference from the direct path does not apply.
- `renderer.qualityProfile: "production"` at `main.ts:396` does not pin the old pipeline. The comment in `requestedQuality` (`renderPath.ts`) calls `renderer.qualityProfile` a deprecated pixel-ratio/draw-budget preset, not a pipeline request.
- Under `auto`, bloom pass fusion is on (`bloomFusionAllowed`, `renderPath.ts`) and sun cascades that no receiver selects are skipped (`packages/engine/src/agent-api/compiler/renderer.ts:126`, gated on `isFusedBloomPasses`). The release notes say bloom frames stay within 1/255 and the cascade skip is pixel-identical. The default fusion mode is `"separable"`.
- This scene has a bloom effect on the HDR path, so `diagnostics().renderPath.bloomFusion` should read `"separable"`.

**What to do.**
- If you accept frames within 1/255 and want the cheaper bloom and cascade work, change nothing.
- If you want the 4.3.7 pipeline exactly (byte-for-byte per the release notes), add `quality` at `main.ts:392`:

```ts
app = createAuraApp(canvas, {
  autoStart: false,
  resize: false,
  pixelRatio: 1,
  quality: "production",
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  output: { toneMapping: "none", exposure: config.exposure, dither: false },
  scene: world.scene
});
```

- `?aura3d-render=production` on the URL does the same without a rebuild, which is useful for an A/B.
- `quality: "production"` turns off fusion and cascade skipping only. It does not change the `preserveDrawingBuffer` default or the `getError` sampling (items below), neither of which changes this game's pixels.

**How to check.**
- Open the game with `?start=1` and run:

```js
window.__AURA_SILT__.info().diagnostics.renderPath
// expect { path: "hdr-msaa", quality: "auto", bloomFusion: "separable", reason: ... }
```

- Compare against `?aura3d-render=production`.
- Re-run `tests/browser/silt-and-signal-frames.spec.ts` (set `SILT_SHOTS` to choose frames).
- The only pinned number I found that mentions this game is `evidence/neutral-embedded/frame-diff.json` (`silt-and-signal/rings.png`). `tests/browser/post-luma-games.json` only lists the game's slug and app folder and holds no baselines. I did not run either, so I do not know whether those numbers move.

### 2. Hemisphere light: the exposure and hemisphere changes do not alter this scene (change 3)

- The exposure change (no implicit environment fill) does not apply. The scene has `environments.neutral(...)` (`world.ts:177`), and the `implicitFill:false` branch (`packages/engine/src/agent-api/compiler/environment.ts:172`) only runs when there is no environment node.
- The new `hemisphereAsEnvironment` option (`renderer.ts:188`, read at `packages/engine/src/agent-api/compiler/observations.ts:333`) is only read on the legacy descriptor path. With the default flags (`A3D_QR_COMPILER` and `A3D_QR_LIGHTING` are both default-on, `packages/rendering/src/contracts/flags.state.ts:21` and `:45`, the same on main), `createProductionRuntimeCollectedLights` returns the `collectPrd02Lights` descriptors at `observations.ts:266`, before that code runs. The hemisphere therefore still reaches the renderer through the `prd02.hemisphere` channel (`packages/engine/src/lanes/prd02.ts:107-111`), unchanged from 4.3.7. Only a page opened with `?a3dLighting=0` / `?aura-lighting=legacy-3.0`, or a flag override, would take the legacy path, where the 4.3.7 rect-spot proxy is gone and the hemisphere then contributes nothing as a direct light.
- The `includeHemisphere` change to `prd02AmbientTerm` is only wired to the `prd02.neutral-room` source (`environment.ts:555-558`). This scene has an environment node, so `prd02.explicit` is used. It calls `prd02AmbientTerm(snapshot)` without hemisphere, exactly as 4.3.7 did.
- Look presets (`night-city` and the others) are not used.
- No action. Do not retune `hemiIntensity` (`world.ts:142`) or `environments.neutral` intensity for 4.5.0.

### 3. Shadow cascades and instancing: no code change (change 6)

- `lights.directional` sets `cascades:3` explicitly (`world.ts:184`), so the "auto cascades capped at 2 for >= 8192 casters" rule does not apply.
- Under `auto`, cascades that no receiver selects are now skipped (`renderer.ts:126`). The notes call this pixel-identical.
- To check, look at the `shadow-banding` browser spec (`tests/browser/shadow-banding.spec.ts:34` lists this game with the `__AURA_SILT__` hook) on a chapter-0 frame.
- No action unless that spec changes. To opt out, use `quality: "production"` (item 1).

### 4. Per-frame getError sampling (change 13): free, but affects `?diag=1`

- `getError` is now sampled rather than called every frame, except in frame/strict mode or `?diag=1`.
- The game's `?diag=1` panel (`apps/showcase-port-shared/diag.ts`) is the one place that turns this on. Frame time with `?diag=1` is not comparable with frame time without it.
- No code change.

## Changes that do not affect this game

- **Change 1, direct-path edge difference:** not taken. The game is blocked from the direct path by `output` options, post effects, custom shaders and the transparent water (item 1).
- **Change 2, `preserveDrawingBuffer` default:** the game code never reads the canvas (no `readPixels`, `drawImage`, `toDataURL` or `toBlob` in `examples/silt-and-signal-port/` or `apps/showcase-silt-and-signal-port/`).
  - `silt-and-signal-frames.spec.ts:55` (`toDataURL`) and `:116` (`drawImage(canvas)`) read synchronously right after `__AURA_SILT__.render()`, before any await. That works without preserved buffers. The rest of the specs use `page.screenshot`.
  - Anything that reads after an `await`, or from an interval, should use `?capture=1`, `preserveDrawingBuffer: true` or `app.capture()`.
  - The game's own `qa` variable (`main.ts:40`) is not the `?qa=1` URL flag. `?qa=1` would enable buffer preservation in the engine.
- **Change 4, `OPTION_IGNORED`:**
  - Every option passed to `primitives.sphere`, `instances.cylinder` and `instances.polyhedron` is in `PRIMITIVE_OPTION_KEYS` (`packages/engine/src/agent-api/nodes/primitives.ts:58-65`): `name`, `position`, `size`, `material`, `castShadow`, `receiveShadow`, `transforms`.
  - `instances.model` goes through `model()`, not the primitive guard.
  - No `interactions.*` are used. `app.diagnostics()` should show no `OPTION_IGNORED`; confirm by filtering the degradations.
- **Change 5, `interactions.orbit`:** not used.
- **Change 6 (the instancing parts):**
  - `setInstanceTransforms` is not used.
  - The shadow proxy needs a builtin-primitive instanced node with 1024 or more instances. Here `piers`, `masts` and `rocks-small` are far below that (the scatter caps are 520 trees and 170 rocks, `terrain.ts:302-310`), and trees, rocks, houses and lamps are model instances, not builtin primitives.
  - Dense depth batching and the 8192-caster cap do not trigger.
- **Change 8, `effects.contactShadows`:** not used.
- **Change 9, float-target effects (AO, DoF, god rays, TAA, motion blur, auto exposure):** none of these effects are in the scene.
- **Change 10, animation and physics:**
  - The rider uses `createAnimationController` with one base clip and `crossFade`, no layers, masks, `playLayer` or `addClipsFrom`.
  - There is no engine physics. Collision is the game's own (`collide.ts`).
- **Change 11, Clock, step tracks, ShapeGeometry, SphericalHarmonics3:** none used. `@aura3d/math/three` is not imported.
- **Change 12, scene kits and built-in humanoid:** none used. The rider is `assets.courier`, the game's own GLB.
- **Change 14, package versions:** already `4.5.0` (`package.json:3`).

## Checklist

Closed by audit lane G24 on 2026-10-29 (report: `docs/audits/lanes/g24.md`; numbers from the remote software-GL runs named there).

- [x] Decide: accept `auto`. The A/B below shows no measurable difference, so the game keeps the cheaper fused bloom and cascade skipping. No `quality` option is added.
- [x] Read `window.__AURA_SILT__.info().diagnostics.renderPath` on the live app page: `{ path: "hdr-msaa", quality: "auto", bloomFusion: "separable" }` (runs `g24before3-c`, `g24after2-b`, `g24after2-c`).
- [x] Visual A/B against `?aura3d-render=production` on the chapter-0 key-boost frame (1280x720, steady state after texture settle): mean luma 112.85 on both arms, top/mid/bottom 131.34/114.38/92.84 (auto) and 131.34/114.39/92.84 (production), p5/p50/p95 identical (run `g24after2-c`; the base build `g24before3-c` gives 113.35 on both arms). Within 1/255 of each other. The `ch2-obj0-night` frame was not captured; chapter 2 uses the same render path and bloom settings.
- [x] `node tools/game-checks/run.mjs silt-and-signal-port`: 0 errors, 0 warnings.
- [x] `tests/unit/silt-and-signal-port`: 10 files, 98 tests pass. The three original parity rides still replay with worst delta below 1e-6 after the chapter 1-6 physics change.
- [ ] `tests/browser/silt-and-signal-frames.spec.ts` was not re-run. The lane's own spec `tests/browser/audit-fix/silt-and-signal-port.spec.ts` recaptured the game's frames instead. `evidence/neutral-embedded/frame-diff.json` is not owned by this lane and was not refreshed.
- [x] `app.diagnostics()` shows no `OPTION_IGNORED` degradations (degradations filtered for `OPTION_IGNORED|bloom|post-field` is empty on every shot). The only warning is the generic "Scene has no interactions" suggestion.
- [x] `?capture=1`: not needed. The lane spec reads pixels with `page.screenshot`, never from the canvas after an await.
