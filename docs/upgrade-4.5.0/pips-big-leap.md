# Pip's Big Leap (`pips-big-leap`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. The game compiles and runs unchanged on 4.5.0. Three things can change how it looks, so every world needs one visual re-check against its baseline: `effects.contactShadows` is on in all seven worlds and is now a real screen-space shadow mask; every world's look also adds ambient occlusion, which is now correct on devices without float linear filtering; and `polar-night` (world w6) gets an explicit neutral-room fill in place of the implicit one.

## What this game uses

- Entry: `apps/showcase-pips-big-leap/src/main.ts`. It calls `createGame` from `@aura3d/engine/game` (main.ts:17, 123-188), which forwards to `createGameApp`/`createAuraApp`. No `quality`, `renderer`, `output`, or `preserveDrawingBuffer` option is passed, so `quality` is the 4.5.0 default `"auto"`. `qualityRebuild: { flags: ["game"] }` (main.ts:182) is unchanged and does not turn off `A3D_QR_CORE` (default-on), so the normal HDR route stays available.
- Scene authoring: `src/game/world.ts` `buildWorld` (world.ts:300-550). It builds a scene with `looks.preset(spec.look, { fogDensityScale: 0, background })`, `effects.fog`, `effects.contactShadows({ intensity: 0.75, length: 0.3 })`, `effects.bloom({ intensity: 0.28 })` for embers/stars worlds, `primitives.box/torus`, `model(assets.*)` and `camera.perspective`.
- **What every `looks.preset` adds (important):** each look expands to an HDRI or fill, a shadow-casting key light (`looks.ts` `v0Children`), and, because `lookPresets.ts:60,91` gives every preset `V0_EFFECTS`, three effect nodes: `look color grade`, `look ambient occlusion` and `look bloom`. So all seven worlds already contain colour grade, ambient occlusion and bloom, whatever `world.ts` adds on top.
- Worlds and looks (`src/game/worlds.ts`): academy `outdoor-day` (:21), w1 `outdoor-day` (:100), w2 `golden-hour` (:194), w3 `alpine-snow` (:282), w4 `interior-industrial` (:368, ambientFx embers), w5 `interior-warm` (:458), w6 `polar-night` (:549, ambientFx stars).
- Materials: `material.pbr`, `material.emissive`, and `material.glass({ opacity: 0.38 })` for water volumes (world.ts:391-398).
- Animation: clip playback only, through `node.setAnimation({ clip, loop })` (main.ts:323) and `createLocomotionKit` from `@aura3d/animation` (main.ts:198). It uses no layers, masks, `addClipsFrom`, or root motion.
- Physics: none from the engine. `src/game/player.ts` is a hand-written kinematic controller. `game.runtimeNode(...)` only tags nodes.
- Canvas reads: none in the game. `installBlackFrameGuard()` from `@aura3d/debug` is imported at main.ts:30 and called at main.ts:32. `apps/showcase-port-shared/diag.ts` is not imported by this game.
- Not used directly by the game code: `instances.*`, `interactions.*`, `environments.*`, `lights.*`, `renderer`/`output` options, custom shaders, `Clock`, `AnimationClip`, `ShapeGeometry`, `SphericalHarmonics3`. (The looks add their own environment and key light.)
- `package.json` already pins `@aura3d/engine` and `@aura3d/animation` as `workspace:*` and the app version is `4.5.0` (the diff against main is the one version line).

## What changes for this game in 4.5.0

### A. Contact shadows are now a real mask (change 8). Applies to all seven worlds.

- **What happens now:** `effects.contactShadows` no longer lowers to the old SSAO-style pass (`packages/engine/src/agent-api/compiler/postprocess.ts:70-71`). It produces a screen-space mask that forward lighting samples (`packages/rendering/src/passes/Prd02ContactShadowsContributor.ts`). With the default `lights: "sun"` the mask darkens the shadow-casting sun only. Contact shading under Pip, the pickups and the props will look different from 4.3.7 (new shape and strength) and may be stronger or weaker. The effect is forced on at every quality tier except Low.
- **Evidence:** world.ts:317 `builder.add(effects.contactShadows({ intensity: 0.75, length: 0.3 }))`, added for every world. Every `looks.preset` adds a `lights.directional(... shadow: true)` key light (`packages/engine/src/agent-api/looks/looks.ts`, `v0Children`). So the "needs a shadow-casting directional light" requirement is met and the `no-shadow-casting-directional-light` reason is not expected.
- **What to do:** Nothing is required. Keep `intensity: 0.75, length: 0.3` and compare each world to its 4.3.7 screenshot. If the shading under Pip reads too heavy or too light, tune only these existing options: `intensity`, `length` (metres, default 0.25), `thickness` (default 0.05), `steps` (8, 12 or 16) and `lights: "sun" | "shadowed"` (`packages/engine/src/agent-api/nodes/effects.lighting.ts:8-14`). Also update the stale comment at world.ts:316 ("legacy-post safe").
- **How to check:**
  1. Load each world with `?capture=1` (academy, w1 to w6 via the world buttons) and compare to the baseline in `tools/quality-rebuild-capture/games.json`.
  2. Confirm there is no `[prd02.contactShadows]` warning in the console.
  3. `app.lighting.diagnostics().contactShadows` (`app.lighting` is a typed optional member, lighting lane `A3D_QR_LIGHTING` is default-on; the same data is in `app.diagnostics().lighting`) should show `passExecuted: true` and no `unavailable` field. `unavailable` can be `no-shadow-casting-directional-light` or `no-drawn-program-samples-the-mask`; either one means the mask is doing nothing.
  4. Run `node tools/game-checks/run.mjs pips-big-leap`.

### B. World w6 (`polar-night`) gets an explicit neutral-room fill (change 3). Applies to w6 only.

- **What happens now:** In 4.3.7, `polar-night` had no HDRI and no environment node, so the implicit neutral room probe lit w6. 4.5.0 removes that implicit fill for scenes with authored lights, so the look adds `fill: { preset: "neutral", intensity: 0.85 }` (`packages/engine/src/agent-api/looks/lookPresets.ts`), emitted by `looks.ts` `v0Children` as `environments.neutral`.
- **Measured:** remote software GL, 1280x720, steady state (`tests/browser/game-luma-capture.spec.ts`, world picked from the atlas): w6 Starfall Garden mean luma 108.1 on 4.3.7, 111.1 on 4.5.0. w1, an HDRI world, goes from 157.4 to 166.9 in the same runs. An earlier 4.5.0 build that used the baked `night` probe as the fill read 23.7 here; it was fixed before release.
- **Evidence:** worlds.ts:549 `look: "polar-night"`, worlds.ts:550 `lookOverrides: { fogDensityScale: 0 }`. The override does not disable the fill.
- **What to do:** Nothing is required. If w6 reads too bright for the moonlit mood, lower the look's `exposureEv` override in `worlds.ts` before adding any lighting.
- **How to check:** `?capture=1` screenshot of w6 against the baseline.

### C. Render path (change 1): the game stays on the HDR chain. No rendering change, only new diagnostics.

- **What happens now:** `quality: "auto"` picks the direct path only when `renderPathBlockers` is empty. Every world has `effects.contactShadows`, which is not in `FORWARD_ONLY_EFFECTS` (only `fog` is), so it is a blocker (`packages/engine/src/agent-api/app/renderPath.ts:117`). The look-added colour grade, ambient occlusion and bloom effects are blockers too, as is `material.glass` with opacity 0.38 (a transparent material, :133). So `app.diagnostics().renderPath.path` is `"hdr-msaa"` for all seven worlds, and the 48/255 silhouette difference from canvas MSAA does not apply.
- **What to do:** Nothing. Do not try to reach the direct path. It would mean removing contact shadows, the look effects and the water volumes, which changes the look.
- **How to check:** `__AURA3D_GAME__` does not expose the app, but `pipsGame.app` is the same object `main.ts` uses at main.ts:190. In a dev session run `app.diagnostics().renderPath`. Expect `path: "hdr-msaa"`, `quality: "auto"` and a `reason` that starts with "scene needs the HDR target" and lists several effects (the order follows scene node order, so do not match on `contact-shadows` being first). `game.setScene` per world (main.ts:237) re-resolves the path on each mount. Every world contains the same blockers, so no world switches paths.

### D. Bloom fusion (change 7). Applies to all seven worlds.

- **What happens now:** On `auto`, bloom passes are fused by default (`renderer.bloomFusion` is `"separable"`, the default). `reportedBloomFusion` (renderPath.ts:33-38) returns the mode whenever the path is `hdr-msaa` and the scene has any bloom effect node. Every look adds `look bloom`, so `diagnostics().renderPath.bloomFusion` reports `"separable"` in all seven worlds. The brief states frames match within 1/255, so no visible change is expected.
- **Evidence:** `looks.ts` `v0Children` bloom branch; world.ts:318-320 additionally adds `effects.bloom({ intensity: 0.28 })` for embers/stars worlds (worlds.ts:378 w4, :561 w6). The compiler takes the first bloom node (`postprocess.ts:41`), and the look group's bloom comes before the authored one, so the authored 0.28 intensity in w4/w6 may not be the value in effect. This is not new in 4.5.0, but check what the glow in w4/w6 actually uses before tuning it.
- **What to do:** Nothing. To restore the exact 4.3.7 pass sequence, pass `quality: "production"` to `createGame`. The option type accepts it without a cast, because `Prd09CreateGameOptions` includes `AuraCreateGameAppOptions`, which extends `AuraCreateAppOptions` (`quality` at `nodes/types/runtime.ts:481`), and the remaining options are spread into the app. Only do this if the comparison below shows a visible difference.
- **How to check:** `app.diagnostics().renderPath.bloomFusion` in every world; compare the w4 ember and w6 star glow screenshots.

### E. Ambient occlusion on devices without float linear filtering (change 9). Applies to all seven worlds.

- **What happens now:** Every look adds `look ambient occlusion`. Commit `fcfefd2de` makes RGBA32F render targets point-sampled when `OES_texture_float_linear` is unavailable (software GL such as SwiftShader, some mobile GPUs). Before, the half-resolution depth read zero there and the AO pass darkened the whole frame uniformly (31% on the receipt room). Now AO produces real occlusion.
- **Effect on this game:** On such a device, captures and baselines made with 4.3.7 will look lighter overall and show proper corner and contact occlusion in 4.5.0. On devices with float linear filtering nothing changes. I did not verify whether the AO pass runs at the auto tier on every device; check `app.diagnostics()`.
- **What to do:** Nothing is required. When you compare against baselines, note which device or renderer produced them. If the 4.3.7 baseline came from software GL, expect a global brightness difference that is not a regression.
- **How to check:** Compare brightness of each `?capture=1` capture to the baseline on the same device class. Check `app.diagnostics()` for the ambient-occlusion pass state.

### F. Per-frame cost and shadow changes (changes 6 and 13). Minor, applies to all worlds.

- **What happens now:** `getError` is sampled instead of called every frame, per-frame allocations drop, and unused warm programs are removed. Shadow cascades that no receiver selects are skipped on auto. The game has no `instances.*`, so the instancing-specific changes (shadow proxy, dense depth batching, per-instance culling) do not apply.
- **What to do:** Nothing. No code in this game reads `getError`.
- **How to check:** `?diag=1` overlay draw-call and frame-time numbers before and after (a frame-time change is a measurement to take, not an assumption), or the `gameplay-probe` smoke (`tools/quality-rebuild-capture/gameplay-probe.json`).

## Changes that do not affect this game

- **2. preserveDrawingBuffer default false:** the game never reads the canvas. The only reader is `installBlackFrameGuard()` (main.ts:30-32), and its frame tap samples in a microtask in the same task as the draw (`packages/debug/src/safety/frameTap.ts`, `guard.ts`), so it does not depend on `preserveDrawingBuffer`. Harness captures use `?capture=1`/`?qa=1`, which keep the buffer.
- **3 (rest), exposure/no-environment:** the five non-w6 looks (`outdoor-day`, `golden-hour`, `alpine-snow`, `interior-industrial`, `interior-warm`) each emit an HDRI `environments.hdri` node (`lookPresets.ts` hdri entries, `looks.ts:291-298`), so no scene is "lights without any environment". The game authors no hemisphere or ambient lights and no look emits one, so the hemisphere-contribution change does not apply either. Only w6 is affected (B).
- **4. OPTION_IGNORED:** every `primitives.box/torus` call passes only `name`, `size`, `position`, `material`, `castShadow`, `receiveShadow` (world.ts:335-398, 465, 510), all of which the builders read. The game uses no `instances.*` or `interactions.*`. The primitive forwarding fix (renderOrder, layers, userData, etc.) has no effect because none of those options are passed.
- **5. interactions.orbit:** not used.
- **6 (instancing parts):** no `instances.*`, no `setInstanceTransforms`.
- **9 (DoF, god rays, TAA, motion blur, auto exposure):** not used. (Ambient occlusion is used through the looks, see E.)
- **10. Animation and physics:** only `setAnimation` and the locomotion kit; no `playLayer`, masks, or `addClipsFrom`. No engine physics, so `bindNodes` and capsule/cylinder collider size changes are not relevant.
- **11. Math and animation:** no `Clock`, step tracks, `ShapeGeometry` or `SphericalHarmonics3` use in `apps/showcase-pips-big-leap/src`. The `@aura3d/math/three` subpath is optional and unused.
- **12. Scene kits:** no `sceneKits.*` (`particleFountain`, `solarSystem`, `neonTunnel`). The built-in humanoid GLB is not used; Pip is the bespoke `pipsPip` GLB.
- **14. Package versions:** already `4.5.0` in `package.json`.

## Checklist

Measured 2026-10-29 on the remote runner (software WebGL2, 1280x720, `tests/browser/audit-fix/pips-big-leap.spec.ts`). Each world was opened from the game's own buttons and read 35 s later. Three builds: v4.3.7, the 4.5.0 base (`audit-fix/integration`, b2dba3713), and `audit-fix/g06` with the audit fixes. Evidence: `evidence/pips-big-leap/audit-2026-10-29/{v437,before,after}-{C,E}/` (frames plus `meta.jsonl`).

- [x] App typecheck passes (`pnpm exec tsc -p apps/showcase-pips-big-leap/tsconfig.json --noEmit`: clean; a one-package `tsc --noEmit` is light enough to run locally).
- [x] `node tools/game-checks/run.mjs pips-big-leap`: 0 errors, 0 warnings.
- [x] Every world captured and compared with 4.3.7 on the same device class (change A and E). Mean canvas luma, an 80x44 crop at Pip's feet, and draw calls:

  | World | 4.3.7 frame / feet / draws | 4.5.0 base | 4.5.0 + fixes | Frame change 4.3.7 to 4.5.0 |
  |---|---|---|---|---|
  | academy | 162.96 / 157.22 / 400 | 171.57 / 168.53 / 501 | 171.71 / 168.42 / 461 | +5.3% |
  | w1 | 157.39 / 158.86 / 665 | 167.07 / 168.40 / 833 | 167.03 / 167.61 / 784 | +6.2% |
  | w2 | 172.09 / 122.45 / 403 | 179.68 / 133.80 / 506 | 179.62 / 135.33 / 463 | +4.4% |
  | w3 | 205.08 / 219.98 / 398 | 208.99 / 227.63 / 503 | 208.99 / 226.15 / 460 | +1.9% |
  | w4 | 141.14 / 111.77 / 529 | 149.02 / 118.64 / 665 | 148.96 / 116.34 / 622 | +5.6% |
  | w5 | 174.28 / 192.45 / 555 | 181.50 / 200.05 / 697 | 181.51 / 200.27 / 652 | +4.1% |
  | w6 | 106.28 / 181.58 / 421 | 109.06 / 186.41 / 529 | 109.13 / 186.30 / 484 | +2.6% |

  Every world is 2-6% brighter on 4.5.0, the feet crops move with the frame, and no frame has dark (luma <= 8) or clipped (>= 250) pixels above 0.3%. That matches change E (AO no longer darkens the whole frame on software GL) and shows no contact-shadow darkening. The fixes leave the look unchanged (frame means within 0.15 of the base); the lower draw counts come from spinning pickups no longer casting shadow-map shadows. With the look AO dropped (`?pbl-ao=0`, World 1, same frozen frame) the frame reads 169.68 against 166.93 with AO, and the feet crop 170.43 against 166.46, so real-depth AO now darkens contact areas by about 2%.
- [x] w6 (Starfall Garden) keeps its night mood with the neutral fill: 106.28 on 4.3.7, 109.06 on 4.5.0 (change B). No adjustment made.
- [x] `app.diagnostics().renderPath` reports `path: "hdr-msaa"`, `quality: "auto"` and `bloomFusion: "separable"` in all seven worlds. Fused bloom against `?aura3d-render=production` on the same frozen World 1 frame: 166.95 against 166.94 mean, 0.40/255 mean absolute difference.
- [x] `app.lighting.diagnostics().contactShadows` reports `passExecuted: true` with no `unavailable` in all seven worlds, and the console shows no `[prd02.contactShadows]` line.
- [x] No `OPTION_IGNORED` degradations in `app.diagnostics()` in any world (0 in every shot).
- [x] Draw calls do not regress: 4.5.0 draws more than 4.3.7 (World 1 665 to 833, the extra AO and contact-shadow passes), and the audit fixes bring World 1 back to 784. Frame time is not measured: the software-GL runner presents one frame every few seconds, so a frame-time number from it means nothing.
- [x] The stale "legacy-post safe" comment in `src/game/world.ts` now describes the 4.5.0 mask.
- [x] Black-frame guard: `window.__AURA3D_HEAL__.rung` read 0 in every shot of every world, and the autoplay runs reached the World 1 results screen without a heal reload.
