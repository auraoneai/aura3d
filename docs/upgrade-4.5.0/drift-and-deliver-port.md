# Gridlock Courier (`drift-and-deliver-port`): upgrading to Aura3D 4.5.0

**Verdict:** No change needed. The game authors bloom, colour grade, vignette, FXAA, output options, an HDRI environment and custom shader materials, so it stays on the HDR render path. It has no canvas read-back after an await, and no builder call passes an unread option. The one visible difference is bloom pass fusion (frames within 1/255), which is automatic.

**Changed since this guide was written (audit lane G18, 2026-10-29):** the app now mounts with `resize: true` and a `pixelRatio` capped at 1.5 (1 on `quality=low`), traffic is one `instances.model` node per car kind moved with `setInstances` (it was 84 `model()` nodes), and the lights-only path adds `environments.neutral`. Line numbers below refer to the file before those changes.

## What this game uses

- Entry: `apps/showcase-drift-and-deliver-port/src/main.ts` imports `apps/showcase-port-shared/diag.ts` and then `examples/drift-and-deliver-port/main.ts`. The app mounts the example; it has no code of its own. Unless stated otherwise, `main.ts`, `look.ts`, `models.ts` and `props.ts` below mean files in `examples/drift-and-deliver-port/`.
- `package.json` already pins `@aura3d/engine` as `workspace:*` and the app version is `4.5.0`.
- One `createAuraApp` call, `main.ts:454-461`: `autoStart:false`, `resize:false`, `pixelRatio:1`, `renderer:{ mode:"production", qualityProfile:"production", fallback:"safe-basic" }` (line 458), `output:{ toneMapping, exposure, dither:false }` (line 459). There is no top-level `quality:` option.
- Scene: `look.ts:170-230`. It has an HDRI environment (`environments.hdri`, `look.ts:175`, skipped with `?env=0`), a directional sun with 2 shadow cascades and a 2048 map (`look.ts:176`), a hemisphere light (`look.ts:177`), `effects.fog`, and `effects.ambientOcclusion` (only with `?ao=1`, `look.ts:179`).
- Post: `effects.bloom`, `effects.colorGrade`, `effects.vignette`, and `effects.antiAlias({mode:"fxaa"})` (`look.ts:180-185`). This is on by default; `?post=0` removes it.
- Custom shader materials: `primitives.sphere` with `material.custom(skySpec())` (`look.ts:187`), `farCitySpec` (`look.ts:195`), and `beamSpec` (`main.ts:138`).
- Instancing:
  - Pickups use `instances.mesh` (`look.ts:237-239`), updated every frame with `setMatrixAt` (`main.ts:238-240`). Pickup counts are 174 in total (150 coins, 14 stars, 10 hearts, `world.ts:157-163`).
  - Traffic is 84 cars (`world.ts:208-211`). By default (`config.models` is true, `main.ts:45`) each car is its own `model(...)` node from `carModel` (`models.ts:44-46`), moved with `setPosition`/`setRotation` (`main.ts:229-232`). Only with `?models=0` does traffic use `instances.mesh` (`look.ts:226-227`) with `setMatrixAt` (`main.ts:225-226`).
  - `instances.model` is used for props (`props.ts:93`).
- Models: `model(...)` via `carModel` (`models.ts:44-46`) and `defineModelAssets` (`models.ts:15`), static GLBs with no animation.
- Read-back: `createBlackFrameWatch(canvas, ...)` from `@aura3d/debug` (`main.ts:466`). It calls `blackWatch?.sample(frames)` right after `app.step(0)` in the same task (`main.ts:279-281`). Its default probe does `ctx.drawImage(canvas, ...)` (`packages/debug/src/safety/blackFrame.ts:244`; `sample(drawn?)` is at `:224`/`:328`).
- `?diag=1` panel from `@aura3d/debug` (`showcase-port-shared/diag.ts`).
- The game does not use these: `interactions.*`, physics, `Clock`, `AnimationClip`, `ShapeGeometry`, `playLayer`, `addClipsFrom`, `effects.contactShadows`, or `app.capture()` / `app.screenshot()` / `toDataURL` / `readPixels` (rg over `examples/drift-and-deliver-port` and `apps/showcase-port-shared` found none).

## What changes for this game in 4.5.0

### 1. Render path stays on HDR (check it, nothing to change)
- What happens now: `quality` defaults to `"auto"`. `requestedQuality` ignores `renderer.qualityProfile` (`packages/engine/src/agent-api/app/renderPath.ts:138-153`, comment at `:151`), so the `"production"` strings at `main.ts:458` do not select the old pipeline. They are the deprecated qualityProfile preset and `renderer.mode`. `renderPathBlockers` (`renderPath.ts:103-135`) lists this game's blockers: the authored `output` options (`main.ts:459`), the `bloom`, `colorGrade`, `vignette` and `antiAlias` effects, the `hdri` environment, and the custom shader materials. Any one is enough, so the game stays on `hdr-msaa`. With `?post=0` the output options, HDRI and shader materials still block, so it stays on HDR there too. The silhouette-edge difference of the direct path does not apply.
- What to do: nothing. To pin the old pipeline anyway, add `quality: "production"` to the `createAuraApp` options at `main.ts:454`. This is only needed if you want to rule out bloom fusion (item 2).
- How to check: with `?manual=1&autostart=1`, read `app.diagnostics().renderPath`. The example exposes it as `window.__AURA_DRIFT_AND_DELIVER__.extras.diag()` (`extras.diag` at `main.ts:426`; the hook object comes from `installQaHooks("drift-and-deliver", ...)`). Expect `path: "hdr-msaa"`, `quality: "auto"`, and `reason` naming the blockers.

### 2. Bloom pass fusion (automatic, look-neutral)
- What happens now: the game has a bloom effect, runs on `hdr-msaa`, and uses quality `auto`, so `reportedBloomFusion` (`renderPath.ts:33-38`) returns the default mode `"separable"` and the bloom chain issues fewer draws. The 25-vs-33 draw figure comes from the PBR viewer, not from this game. Frames are expected to match within 1/255.
- What to do: nothing. To compare or opt out, set `quality:"production"` (fusion is off there, `bloomFusionAllowed`, `renderPath.ts:24`). The opt-in `renderer.bloomFusion: "fused-2d"` is not needed.
- How to check: `app.diagnostics().renderPath.bloomFusion` should read `"separable"`. For a pixel comparison, capture a `?capture=1&manual=1&autostart=1` frame before and after on the same teleport (`extras.teleport` + `extras.settle` at `main.ts:420-437`).

### 3. Shadow cascades no receiver selects are skipped (automatic)
- What happens now: on auto/cinematic, the sun's 2 cascades (`look.ts:176`) are only rendered if some receiver selects them (`packages/rendering/src/shadows/CascadeUse.ts`; `skipUnusedShadowCascades` is set for `auto`/`cinematic`, never `production`, see `Prd02ShadowBridge.ts:262`). Output pixels are unchanged by design. The cascade cap at 2 for 8192+ casters does not change anything because the game already asks for 2.
- What to do: nothing.
- How to check: capture the same view before and after. No visible difference is expected.

### 4. Black-frame watch still reads valid pixels (confirm only)
- What happens now: `preserveDrawingBuffer` defaults to false (except `?capture=1` / `?qa=1`, `wantsPreservedDrawingBuffer`, `renderPath.ts:181-199`, wired at `frameLoop.ts:95`). The game's only in-page canvas read is `createBlackFrameWatch`. It samples in the same task as the draw, before the browser composites (`main.ts:279-281`), so it should still see the frame. This is read from code, not run.
- External harnesses: `tools/crayon-capture/drift-and-deliver*.ts` drive the original game from the `games.json` manifest URL, not this port. The port-facing harnesses are `tests/browser/shadow-banding.spec.ts`, `tests/browser/fixgrid.spec.ts`, `tests/browser/pckits-smoke.spec.ts` and `scripts/visual-qa.routes.json:192`. The first two use `page.screenshot`; their `drawImage` acts on a decoded screenshot bitmap, not the live canvas. None need `?capture=1`.
- What to do: nothing in the game or in these harnesses. A new harness that calls `toDataURL`/`drawImage(canvas)` after an await would need `?capture=1`.
- How to check: load `/apps/showcase-drift-and-deliver-port/?autostart=1` and confirm the page does not reload into a lower heal stage (`drift-heal-stage`, `main.ts:36`, in `sessionStorage`/`localStorage` stays absent). Then load with `?capture=1` and take your screenshot.

### 5. Diagnostics mode `?env=0` (and the heal ladder's `no-env` rung) renders differently (optional)
- What happens now: `?env=0` drops the HDRI (`look.ts:175`). The scene then has authored lights and no `environments.*` node, so it loses the implicit scene fill (`createProductionRuntimeEnvironment`, `implicitFill:false` at `compiler/renderer.ts:152`, new branch at `compiler/environment.ts:172`), and the hemisphere light counts as the mean of sky and ground. The default path has an `environments.hdri` node, so the explicit-environment branches are used first and are unchanged. The `prd02.explicit` source (`environment.ts:541`) calls `prd02AmbientTerm(snapshot)` without `includeHemisphere`, so the default look keeps its lighting and the hemisphere change does not apply to it. I did not render it, so treat this as read from code.
- Heal ladder: the black-frame watch uses `DEFAULT_HEAL_LADDER` (`aa=0`, `post=0`, `tm=aces`, `env=0`, `shadow=0`, `quality=low`). If the watch ever escalates to the `env=0` rung, the reloaded page renders darker in 4.5.0 than in 4.3.7. The `tm=aces` rung adds a URL tone-map override, which is also a render-path blocker.
- What to do: nothing for normal play. If `?env=0` frames are used as a baseline, re-capture them. To keep them bright, add `environments.studio()` or raise `output.exposure`.
- How to check: compare `?env=0` captures before and after.

### 6. Texture/AO float targets (applies only to `?ao=1`)
- What happens now: ambient occlusion is only added with `?ao=1` (`look.ts:179`, `main.ts:46`). On devices without float linear filtering, its RGBA32F target is now point-sampled instead of silently doing nothing. Expect AO to appear on those devices.
- What to do: nothing.
- How to check: `?ao=1` on a software-GL runner shows contact darkening.

## Changes that do not affect this game

- Direct path silhouette difference (change 1): the game has blockers, so it never takes the direct path.
- `quality:"production"` restoring the old pipeline: the game does not use it.
- `preserveDrawingBuffer` for app code (change 2): no read-back after an await in game code; see item 4 for the probe and external harnesses.
- Exposure and hemisphere fill (change 3): default path has an HDRI node; only `?env=0` and the heal ladder's `no-env` rung differ (item 5). The preset fills (`night-city`, `polar-night`, `neon-arcade`, `space`, `underwater`) apply to look presets, and the game uses no `looks.preset`.
- `OPTION_IGNORED` (change 4): the options passed are `name`, `size`, `position`, `material`, `castShadow`, `receiveShadow` to `primitives.sphere`/`primitives.box` (`look.ts:187`, `main.ts:135-136`), all in `PRIMITIVE_OPTION_KEYS` (`nodes/primitives.ts:59-65`). `ignoredOptionsNote` is used only by `primitives.ts` and `interactions.ts` (`instances.<primitive>` reaches it through `instancedPrimitive`). `instances.mesh`, `instances.model` (passes `name`, `transforms`, `castShadow`, `receiveShadow` to `model()`) and `geometry.custom` do not record the note. `primitive()` forwarding `renderOrder` etc. is irrelevant because the game does not pass them.
- `interactions.orbit` options (change 5): no `interactions.*` and no `camera.orbit`; the camera is `camera.perspective` driven by `setPose` (`main.ts:271`).
- Instancing (change 6): `setInstanceTransforms` is not used (the game calls `setMatrixAt`). Shadow proxy needs at least 1024 shadow-casting builtin-primitive instances (`compiler/geometry.ts:259`); the game has far fewer (pickups 150/14/10; traffic is model nodes by default and at most 84 instances across kinds with `?models=0`). Dense depth batching has the same 1024 threshold (`shadowLegacy.ts:36`). Per-instance frustum culling starts at 512 instances (`InstanceFrustumCull.ts` `MIN_CULLED_INSTANCES`): traffic and pickups are below that. Prop counts per kind (`props.ts:93`) depend on the player's position, so whether any kind exceeds 512 is unknown; culling is documented as pixel-identical either way.
- Contact shadows (change 8): `effects.contactShadows` is not used.
- Animation and physics (change 10): car models are static, no layers, masks, `addClipsFrom` or physics.
- Math and animation fixes (change 11): no `Clock`, step tracks, `ShapeGeometry` or `SphericalHarmonics3`. `@aura3d/math/three` is not imported.
- Scene kits (change 12): no `sceneKits.*` or built-in humanoid.
- Per-frame cost (change 13): `getError` sampling, allocation and warm-program changes are automatic. The `?diag=1` panel (`diag.ts`) still works.
- Package versions (change 14): `package.json` is already at `4.5.0`.

## Checklist

Closed by audit lane G18 on 2026-10-29. Every browser check ran on the remote runner (`tools/remote-acr/run.sh`, headless Chromium on SwiftShader software WebGL2, 1280x720 unless stated), measured at steady state (the 90 s shot, never the first frame). Not real-GPU evidence. Run ids and frames: `evidence/audit-fix/g18/wave3/` and `docs/audits/lanes/g18.md`.

- [x] Run `node tools/game-checks/run.mjs drift-and-deliver-port` and confirm no new errors. Result: 0 errors, 0 warnings.
- [x] Run the app typecheck. Ran locally as `tsc -p apps/showcase-drift-and-deliver-port/tsconfig.json --noEmit` (a typecheck needs no browser): 0 errors.
- [x] Confirm `renderPath.path === "hdr-msaa"`, `quality === "auto"`, `bloomFusion === "separable"`. Result (run `g18w3-a-g18xp`, `extras.diag()` after a 240-step drive): `hdr-msaa`, `auto`, `separable`.
- [x] Confirm `app.diagnostics()` has no `option-ignored` degradations. Result (run `g18w3-a-g18xs`): `degradations: []` on both the base and the fixed build.
- [x] Compare a steady-state frame against 4.3.7. Result (runs `g18w3-v437b` and `g18w3-before2`, default URL, 90 s): mean luma 108.21 on 4.3.7 and 108.21 on 4.5.0, thirds 118.87/114.95/90.80 against 118.88/114.95/90.80, p5/p95 57/168 on both. The fixed build reads 108.29. The default frame did not move in 4.5.0.
- [x] Confirm the black-frame watch does not escalate. Result: `drift-heal-stage` stayed absent (`heal: null`) after a 120 s splash and after the drive probes; 0% dark pixels in every default frame.
- [x] Re-capture the `?env=0` baseline. Result: the heal ladder's `no-env` rung read 123.47 on 4.3.7 and 75.52 on 4.5.0 (39% darker, LIGHT-01: 4.5.0 dropped the implicit room probe). The game now authors `environments.neutral({ intensity: 1 })` on that rung only (`look.ts`, `LIGHTS_ONLY_NEUTRAL`), which reads 123.55 (run `g18w3-neutral`; `?neutral=0` reproduces 75.61, `?neutral=0.6` reads 106.35).
- [x] Optional `quality: "production"`: not added. Byte-identical bloom output is not needed; see the `auto` against `?aura3d-render=production` A/B in `docs/audits/lanes/g18.md` (row C8/RP-05).

Item 5 above said the hemisphere change does not apply to the default look. That was true on 4.5.0 (LIGHT-05: the hemisphere was dropped next to the HDRI). With lane E2's engine fix the hemisphere adds to the HDRI, so the game now authors 0.3 next to the HDRI and keeps 1.7 on the lights-only path (`SKY_FILL` in `look.ts`).
