# Lane ef: WP-6 (E-F) runtime VFX

- Branch: `gu47/ef` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ef`)
- Base: `f797808be` (`gu47/integration`)
- Wave: 1, phase 1 (code, unit tests, static checks; no browsers, no remote runs)

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EF-0 option fields | M | done | 16ef3e77c | `depthOfField({ tiltShift })`, `volumetricFog({ godRayDensity })`, `outline({ targets })` typed as PRD §3.1 and recorded only when authored (behaviour: E-C, E-E). `tests/unit/gu47/ef/effect-option-fields.test.ts` |
| EF-1 atlas sprites | M | done | c3752e262, b87c781b2 | `sprite: "<name>"` (18 built-ins) lowers to a `vfx:<name>` batch (own key, frame grid, frame blend on multi-frame sequences); `ProductionEffectSystem` crops the sequence from `aura-vfx-2k.png` (1k twin on low/medium) on first use and samples it; soft-dot until loaded or after a failed load (`VFX_SPRITE_UNAVAILABLE`); per-particle frames in the instance frame slot. `sprite: { atlas: assets.x, frame }` samples a sheet cell. Bake defect worked around (Decisions). `tests/unit/gu47/ef/vfx-atlas-sprites.test.ts` (14 tests incl. decoded-PNG check, mock-device `u_atlas`/`u_grid`) |
| EF-2 flipbook texture | M | done | fe096ec34 | `effects.flipbook({ texture })` samples the typed sheet (grid `spriteColumns × spriteRows`, straight alpha); `sprite: "<name>"` uses that built-in sequence; default procedural fireball unchanged. `tests/unit/gu47/ef/flipbook-texture.test.ts` |
| EF-3 attachTo | M | done | 98da1defa | Emitter `attachTo` (particles option, `AuraVfxEffectSpec.attachTo`, `spawn(effect, { node, socket })`) follows the node's world position or the actor's bone socket each frame; `position` is the offset; `VFX_ATTACH_TARGET_MISSING` once; `setPosition()` detaches. `spawn` at a node no longer starts at the world origin. `tests/unit/gu47/ef/attach-to.test.ts` |
| EF-4 registered presets | M | done | 9f32f0451 | `burst(kind)`/`spawn(name)` resolve `registerPreset` entries before `BURST_PRESETS`; every layer fires (emitter over a base built-in, light, camera, decal; `at` delays); one handle stops all. `tests/unit/gu47/ef/registered-presets.test.ts` |
| EF-5 real trail | M | done | 20710d9ed, 99900dc51 (default change) | `app.effects.trail(target, { width, life, color, widthOverSpeed })` → `AuraTrailHandle` on the RibbonBatch; `VFX_TRAIL_PENDING` gone. Separate revertible commit 99900dc51: scene `effects.trail({ target })` nodes follow their node (Diamond, FC and Links ball ribbons drew nothing before). `tests/unit/gu47/ef/trail.test.ts` (30 m ribbon at 25 m/s, life 1.5 s) |
| EF-6 genre variants | M | done | a327619e5 | 15 kinds: `spark-{fire,electric,gold,magic,ice}`, `dust-{sand,turf,snow,ash,clay}`, `pickup-{gold,gem,power,star,heart}`. `tests/unit/gu47/ef/genre-variants.test.ts` |
| EF-7 stale warning, lightCone | M | done | 77d792c2f | Both stale warnings removed (flipbook-sprite and light-beam): under default-on A3D_QR_VFX they draw. lightCone, beam and flipbook draws proven on a mock device. `tests/unit/gu47/ef/light-cone-draws.test.ts`; 2 assertions flipped in `tests/unit/engine/phase2-root-bridge.test.ts` and `tests/browser/d4-flipbook-beam.spec.ts` |
| EF-8 floating-dot root cause | M | done (receipt phase 2) | 840552b19, 2e0c0b4d2 | Cause and fixes in "Floating dots" below. `tests/unit/gu47/ef/floating-dot.test.ts`; receipt spec `tests/browser/gu47/vfx-floating-dot.spec.ts` (not run) |
| EF-9 liveCount soak | M | done | 9f87a5035 | 60 s simulated soak: liveCount 0 within 1.2 s of the last effect (game-effects path and raw short-lived bursts), no emitter or batch left. `tests/unit/gu47/ef/live-count-soak.test.ts` |
| EF-10 game-art skill | M | done | 35ea73ed2 | `aura3d-game-art/SKILL.md`: sheets draw via `flipbook({ texture })`, built-in sprite names, sheet sprites on emitters, registered presets, variants, trails; stale withheld text removed. Mirrors synced (`pnpm skills:sync`, only this skill's copies staged); `pnpm check:skills` ok |
| EF-11 receipts | M | phase 2 | 2e0c0b4d2 | Specs `tests/browser/gu47/vfx-atlas-sprites.spec.ts`, `vfx-trail.spec.ts`, `vfx-floating-dot.spec.ts` on harness `tests/browser/gu47/vfx-receipts-harness.{html,ts}`; `evidence/receipts/{vfx-atlas-sprites,vfx-trail}/README.md` hold the run commands and acceptance. Not run (phase 1) |

## Floating dots (EF-8): cause, fix, and what the game lanes do

- **Where the report came from.** Owner screenshots of gold, blue, yellow and white "bubbles" over Iron Crown and FC (then Links) on 4.3.0. Proven cause (`evidence/iron-crown/particle-fix/README.md`, `docs/agents/lessons-learned.md` R15): `app.effects.spawn("kind")` started a continuous emitter, and `spawn`/`burst` dropped the preset's life, size and spread, so every hit spark lived 1.2 to 2.4 s as a 5 to 14 cm glow disc and the loops never stopped. Fixed in 4.3.1 (`effects-api.ts`, `tests/qr/prd07/unit/preset-lifetime.test.ts`). `git log -S floating-dot` → 6e95d4374 (4.3.5) added `effects.runtime = "off"` to FC (`main.ts:97`), Links (`main.ts:2816`) and Iron Crown (`main.ts:399`) only as a precaution: the runner never showed bubbles after 4.3.1 (effects on, DPR 1 and 2, `evidence/real-gpu/impact-435/`), and the owner never confirmed on a real GPU, so the item stayed "cause unfound".
- **What this lane found still able to leave dots in the engine (fixed, unit-tested):**
  1. Spent one-shot emitters were never retired; they idled in the system until the 96-slot instance pool recycled them (handles stayed `alive`). Now retired the frame their last particle dies (`ProductionEffectSystem.watchTransients`), handles report `alive: false`, and the pool drops them.
  2. `runtime = "off"` refused only new spawns: a runtime loop started before the switch kept emitting at its spot for good (a literal floating dot source). Now `off` and `app.effects.clear()` remove every running runtime emitter and runtime trail at once.
  3. `dispose()` left the system's batches in the particle pass, which is shared per device, so the last frame's particles would keep drawing while that device rendered. Now removed.
- **Not reproduced and not claimed:** no engine path was found that makes dots appear only on a real GPU; the GPU-only hypotheses already tested (point-size clamp, frame-rate dependence) stay ruled out. Open lead outside E-F files for G05: Iron Crown's `createGame` FX pool layer draws instanced emissive spheres (`packages/game/src/juice/fxPoolLayer.ts`); if spheres persist with runtime effects on, check that a shrinking instance `count` stops drawing the stale slots.
- **Game lanes (wave 2, after E-F merges):** delete the `effects.runtime = "off"` line once the `vfx-floating-dot` receipt passes (keep `?vfx=off`); FC47-V1's "0 floating dots in 10 action frames" is read from that receipt's frames.

## Decisions

- **Atlas bake overlap (EF-1).** `tools/vfx-atlas-bake/bake.mjs` advances one cell row per layout row, so two-row sequences overlap the next row: `fireball` overwrites the bottom-left cell of `smoke-a`, `flame-loop` the bottom row of `fireball`, `electric` and `debris-chips` the bottom row of `flame-loop` (decoded pixels: smoke-a frame 2 carries fireball's orange; fireball frames 4-7 equal flame-loop 0-3). Atlas files and bake tool are outside E-F's list, so `VFX_SPRITE_LAYOUT` (`FlipbookAtlas.ts`) samples only the clean top row of those three (smoke-a 2 frames at 6 fps, fireball 4 frames, flame-loop 4 frames at 8 fps; same cycle time). A unit test pins the overlapping pairs so a re-bake flags the table.
- **1k twin rects.** The bake keeps a 4 px gutter at both sizes, so the 1k cell pitch is 132 px; halving the 2k rect samples 4 px off (as `rendering/src/vfx/VfxAtlas.sequence()` does). The E-F loader computes 1k rects from the pitch (decoded-PNG test checks centroids on both pages).
- **Page delivery.** `new URL("../../../assets/vfx/aura-vfx-<n>k.png", import.meta.url)` inside a function: Vite emits it for every monorepo game; `src/` and `dist/` sit at the same depth, so the package dist resolves it. The root `dist/` tarball does not ship `packages/engine/assets/` (finalize-dist copies only `src/**` assets), so npm consumers keep the soft-dot with `VFX_SPRITE_UNAVAILABLE` until WP-38 ships the pages (handoff).
- **Sprite decode.** Browser loader: one fetch per page, `createImageBitmap` crop per sequence with `imageOrientation: "flipY"` (WebGL ignores UNPACK_FLIP_Y for ImageBitmap), `premultiplyAlpha/colorSpaceConversion: "none"`; built-in page is premultiplied sRGB, asset sheets straight alpha. Tests inject a data loader (`ProductionEffectSystem` option `spriteLoader`).
- **Frames.** Looping built-ins run at their fps from birth; play-once built-ins span the particle life; sheet sprites hold `frame`. Rotation and life fade are untouched (written after `writeEmitterInstances`, CpuEmitter not edited).
- **Trails.** Points are rebuilt newest first each frame so the RibbonBatch alpha curve `0.45·(1 − i/maxPoints)` peaks at the target and the life fade empties the tail. `widthOverSpeed: [min, max]` in m/s: zero width at or below `min`, full width at or above `max` (PRD gives only the tuple). Ring capped at 120 points (low) / 360 points. Runtime trails obey `runtime = "off"`.
- **Registered presets.** Named presets (registered or built-in) are one-shot bursts; authored spec objects passed to `spawn` loop until stopped (unchanged contract). A spec with no layers is its named built-in as one emitter (old behaviour). Layer fields default from `layer.preset`, else the built-in of the preset name, else `spark`.
- **Defaults unchanged** for emitters without `sprite` (byte-identical lowering and batch keys) and built-in burst kinds. Intended behaviour changes, each listed in the CHANGELOG text: scene trail target following (own commit 99900dc51), `spawn` at a node, `spawn(spec)` reads its layers, `off`/`clear()` drop running particles, spent one-shots retire, juice particle-pass trails (`packages/game/src/juice/fxParticlePass.ts`) now draw.
- **Edits outside the lane folder:** `tests/unit/engine/phase2-root-bridge.test.ts` and `tests/browser/d4-flipbook-beam.spec.ts` asserted the stale warnings this WP deletes; only those assertions were flipped.

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| WP-38 | `tools/finalize-dist/index.ts` / tarball files | ship `packages/engine/assets/vfx/aura-vfx-{1k,2k}.png` beside the root dist (`dist/assets/vfx/`) | npm consumers resolve the sprite page relative to the dist module |
| E-G | `packages/engine/src/agent-api/publishedUnion.ts:312` (and `public/index.ts` if it narrows) | add `AuraBurstOptions, AuraTrailOptions, AuraTrailHandle, AuraVfxGenreVariant` to the `contracts/effects.js` type re-export | game lanes type their preset packs and trail handles by name |
| E-I | `tools/real-gpu/scenarios.json` | owner scenario: FC, Links, Iron Crown with `?vfx=on&vfxdebug=1`, read `__AURA_VFX_DEBUG__()` after a goal / shot / exchange | only a real GPU can close the owner's report |
| G05, G09, G10 | `apps/showcase-iron-crown/src/main.ts:399`, `apps/showcase-aura-fc-3d/src/main.ts:97`, `apps/showcase-aura-links-3d/src/main.ts:2816` | delete `effects.runtime = "off"` after the vfx-floating-dot receipt passes | engine paths closed (EF-8) |
| G08, G09, G10 | Diamond `main.ts:766`, FC `game/scene.ts:418`, Links `main.ts:899` (`effects.trail({ target })`) | these ribbons now draw; add `life` (about 0.4 s) and `widthOverSpeed`, or remove the node | default change 99900dc51 |
| (unowned follow-up) | `tools/vfx-atlas-bake/bake.mjs`, `packages/engine/assets/vfx/*` | advance `cy` by `rows * pitch` for multi-row sequences, re-bake, then restore full rows in `VFX_SPRITE_LAYOUT` | baked rows overlap |
| (unowned follow-up) | `packages/rendering/src/vfx/VfxAtlas.ts:sequence` | compute twin rects from the 132 px pitch | halved rects sample 4 px off |

## API as shipped

`packages/engine/src/contracts/effects.ts`
- `type AuraVfxSpriteSource = AuraVfxBuiltinSequence | { readonly atlas: AuraAssetRef<"texture"> | string; readonly frame?: number }` (was `string | { atlas: string; frame? }`)
- `type AuraVfxGenreVariant = "spark-fire" | "spark-electric" | "spark-gold" | "spark-magic" | "spark-ice" | "dust-sand" | "dust-turf" | "dust-snow" | "dust-ash" | "dust-clay" | "pickup-gold" | "pickup-gem" | "pickup-power" | "pickup-star" | "pickup-heart"`
- `interface AuraVfxEffectSpec { readonly name: string; readonly layers: ...; readonly attachTo?: string | { readonly node: string; readonly socket?: string } }`
- `interface AuraBurstOptions { readonly count?: number; readonly speed?: number; readonly scale?: number; readonly color?: AuraColor; readonly normal?: AuraVec3; readonly seed?: number; readonly intensity?: number; readonly camera?: boolean; readonly sprite?: AuraVfxSpriteSource }`
- `interface AuraTrailOptions { readonly width: number; readonly life: number; readonly color?: AuraColor; readonly widthOverSpeed?: readonly [number, number] }`
- `interface AuraTrailHandle extends AuraEffectInstanceHandle { readonly length: number; readonly pointCount: number; clear(): void }`
- `AuraAppEffects.burst(kind: AuraVfxKind | AuraVfxGenreVariant | (string & {}), position: AuraVec3, options?: AuraBurstOptions): AuraEffectInstanceHandle`
- `AuraAppEffects.spawn(effect: AuraVfxEffectSpec | AuraVfxKind | AuraVfxGenreVariant | (string & {}), at: AuraVec3 | { node: string; socket?: string }, options?: { seed?: number; scale?: number; color?: AuraColor; sprite?: AuraVfxSpriteSource }): AuraEffectInstanceHandle`
- `AuraAppEffects.trail(target: string | AuraRuntimeNodeHandle | { node: string; socket?: string }, options: AuraTrailOptions): AuraTrailHandle`
- `AuraParticleEmitterOptions.attachTo` (existing type) is now honoured; `.sprite` takes the union above.
- Registered preset layer fields: emitter `{ preset?, count?, speed?, life? | lifetime?, gravity?, color?, intensity?, size?, spread?, additive? | blend? | materialMode?, sprite?, maxScreen?, drag?, direction?, at? }`; light `{ intensity?, range?, duration?, color?, at? }`; camera `{ shake?, punch?, configure?, at? }`; decal `{ size?, lifetime?, opacity?, color?, at? }`.

`packages/engine/src/agent-api/nodes/effects.ts`
- `effects.flipbook(options & { texture?: AuraAssetRef<"texture"> | string; sprite?: AuraVfxSpriteSource })`
- `effects.trail({ target, life?, widthOverSpeed?, ... })` (option bag; target followed per frame)
- Item 0: `AuraDepthOfFieldTiltShift { bandCenter: number; bandWidth: number; angleDeg?: number }`, `AuraDepthOfFieldOptions`, `AuraVolumetricFogOptions` (`godRayDensity?: number`), `AuraOutlineOptions` (`targets?: readonly string[]`).

`packages/engine/src/agent-api/vfx/effects-api.ts`
- `export const AURA_VFX_GENRE_VARIANTS: readonly AuraVfxGenreVariant[]`

Runtime internals (module exports, not public): `FlipbookAtlas.ts` `VFX_SPRITE_LAYOUT`, `isVfxBuiltinSprite`, `vfxSpritePageSize`, `vfxSpriteRect`, `vfxSpriteFrame`, `VfxSpriteTextures`, `browserVfxSpriteLoader`, `defaultVfxSpritePageUrl`, types `VfxSpriteLayout`, `VfxSpriteImage`, `VfxSpriteLoader`, `VfxSpriteTextureState`; `EffectNodeLowering.ts` `LoweredSprite`, `lowerSprite`, `spriteAtlasKey`, `textureAssetUrl`; `ProductionEffectSystem.ts` options `spriteLoader`, `spritePageUrl`, methods `resolveTarget`, `addTrail`, `trailInfo`, `clearTrail`, `stopTrail`, `spriteStatus`, `spritesSettled`, `clearRuntimeParticles`, `instanceAlive`, functions `writeSpriteFrames`, `trailWidthScale`.

Diagnostics: new `VFX_SPRITE_UNAVAILABLE`, `VFX_ATTACH_TARGET_MISSING`, `VFX_PRESET_LAYER_UNSUPPORTED`; removed `VFX_TRAIL_PENDING` and the two "recorded but withheld" warnings; `?vfxdebug=1` → `__AURA_VFX_DEBUG__()` adds `sprites` and `trails`.

## CHANGELOG text (for WP-38)

- **Runtime VFX use the baked atlas, real trails and per-game presets (engine).** Emitters take `sprite: "smoke-a"` (any of 18 built-in sequences of `aura-vfx-2k.png`, the 1k page on low and medium tiers) or `sprite: { atlas: assets.sheet, frame }`; `effects.flipbook({ texture: assets.sheet })` draws a typed sprite sheet. `app.effects.trail(target, { width, life, color, widthOverSpeed })` draws a ribbon that follows a node and fades over `life` (it was a stub that only noted `VFX_TRAIL_PENDING`), and scene `effects.trail({ target })` nodes now follow their node. `burst` and `spawn` resolve `app.effects.registerPreset` names before the built-ins and fire every layer (emitter, light, camera, decal, with delays); fifteen genre-coloured variants of `spark`, `dust` and `pickup` ship; `attachTo` makes an effect follow a node or bone socket, and `spawn(effect, { node })` no longer starts at the world origin. Spent one-shot emitters retire at once, and `runtime = "off"` and `clear()` now drop running runtime particles. The stale "flipbook-sprite / light-beam is recorded but withheld" warnings are gone (both draw under A3D_QR_VFX). The baked atlas overlaps three two-row sequences; smoke-a, fireball and flame-loop sample their clean first row until it is re-baked. Receipts `vfx-atlas-sprites` and `vfx-trail` are software WebGL2.

## Phase-2 plan

| Row | Capture | Acceptance |
|---|---|---|
| EF-1, EF-2 | `RUN_ID=gu47-vfx-atlas-sprites SPECS='tests/browser/gu47/vfx-atlas-sprites.spec.ts' tools/remote-acr/run.sh`; frame + JSON to `evidence/receipts/vfx-atlas-sprites/` | sprites `ready`; each sprite column coverage > 0.2 % and differs from the soft-dot column (radial symmetry Δ > 0.05 or edge energy Δ > 20 %); reader sees puffs, specks, droplets |
| EF-5 | `RUN_ID=gu47-vfx-trail SPECS='tests/browser/gu47/vfx-trail.spec.ts' tools/remote-acr/run.sh`; frame + JSON to `evidence/receipts/vfx-trail/` | ribbon ≥ 30 m behind the runner, no `VFX_TRAIL_PENDING`, opaque head and fading tail visible |
| EF-8, EF-9 | `RUN_ID=gu47-vfx-floating-dot SPECS='tests/browser/gu47/vfx-floating-dot.spec.ts' EXTRA_DIRS='apps/showcase-aura-fc-3d apps/showcase-aura-links-3d apps/showcase-iron-crown' tools/remote-acr/run.sh` | per game: peak live > 0, settle ≤ 1.2 s, live 0, no transient left, no `VFX_LINGERING_PARTICLES`, idle mean luma Δ < 6; then owner real-GPU scenario (E-I handoff) |
| EF-7 | existing `tests/browser/d4-flipbook-beam.spec.ts` | no "recorded but withheld" warnings, draws > 0 |

## Verification

- Typecheck: `typecheck-delta.mjs` → 58 errors, baseline 58, `NEW_ERRORS 0` (a mid-lane run found 15, fixed in 8cd96d673).
- Unit suites (base f797808be + 16ef3e77c vs branch): `tests/unit/gu47/ef/` 10 files, 53 tests, all pass; 25 touched-area files (prd07 effects, game-effects, phase2-root-bridge, runtime-edge-coverage) fail only where they fail on base: `runtime-edge-coverage.test.ts` 3 tests (failure list identical to base), `phase2-root-bridge.test.ts` 1 test (spot light default intensity). Whole `tests/qr/prd07/unit/` (one run): 480 pass, 5 fail, and the same 5 fail with the base versions of every E-F source file (`fountain-plume`, `frame-graph-paths` ×3, `fog-forward-absorption`). No test that passes on the base fails on the branch.
- Lint: `eslint` clean on every touched `.ts` file.
- Skills: `pnpm check:skills` ok after `pnpm skills:sync`.
- Not run (phase 1): browsers, Playwright, remote runner, bundle-size report (the atlas PNG is fetched only on first sprite use; no JS budget change expected).
