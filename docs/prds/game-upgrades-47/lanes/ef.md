# Lane ef: WP-6 (E-F) runtime VFX

- Branch: `gu47/ef` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ef`)
- Base: `f797808be` (`gu47/integration`)
- Wave: 1, phase 1 (code, unit tests, static checks; no browsers, no remote runs)

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EF-0 option fields | M | done | 16ef3e77c | `depthOfField({ tiltShift })`, `volumetricFog({ godRayDensity })`, `outline({ targets })` typed and recorded only when authored (behaviour: E-C, E-E). `tests/unit/gu47/ef/effect-option-fields.test.ts` |
| EF-1 atlas sprites | M | done | c3752e262 | `sprite: "<name>"` lowers to a `vfx:<name>` batch (own key, frame grid, frame blend on multi-frame sequences); `ProductionEffectSystem` crops the sequence from `aura-vfx-2k.png` (1k twin on low/medium) on first use and samples it; soft-dot until loaded or after a failed load (`VFX_SPRITE_UNAVAILABLE`). Per-particle frames written into the instance frame slot. Found and worked around a bake defect (see Decisions). `tests/unit/gu47/ef/vfx-atlas-sprites.test.ts` (14 tests incl. decoded-PNG check) |
| EF-2 flipbook texture | M | done | fe096ec34 | `effects.flipbook({ texture })` samples the asset sheet (grid `spriteColumns × spriteRows`, straight alpha); `sprite: "<name>"` uses that built-in sequence; default procedural fireball unchanged. `tests/unit/gu47/ef/flipbook-texture.test.ts` |
| EF-3 attachTo | M | done | 98da1defa | Emitter `attachTo` (particles option, `AuraVfxEffectSpec.attachTo`, `spawn(effect, { node, socket })`) follows the node's world position or the actor's bone socket each frame; `position` is the offset; `VFX_ATTACH_TARGET_MISSING` once. `tests/unit/gu47/ef/attach-to.test.ts` |
| EF-4 registered presets | M | done | 9f32f0451 | `burst`/`spawn(name)` resolve `registerPreset` entries before `BURST_PRESETS`; all layers fire (emitter, light, camera, decal; `at` delays); one handle. `tests/unit/gu47/ef/registered-presets.test.ts` |
| EF-5 real trail | M | done | 20710d9ed, 99900dc51 (default change) | `app.effects.trail(target, { width, life, color, widthOverSpeed })` → `AuraTrailHandle` on the RibbonBatch; `VFX_TRAIL_PENDING` gone. Separate commit: scene `effects.trail({ target })` nodes follow their node (Diamond, FC and Links ball trails drew nothing before). `tests/unit/gu47/ef/trail.test.ts` (30 m ribbon at 25 m/s, life 1.5 s) |
| EF-6 genre variants | M | done | a327619e5 | 15 kinds: `spark-{fire,electric,gold,magic,ice}`, `dust-{sand,turf,snow,ash,clay}`, `pickup-{gold,gem,power,star,heart}`. `tests/unit/gu47/ef/genre-variants.test.ts` |
| EF-7 stale warning, lightCone | M | done | 77d792c2f | Both stale warnings (flipbook-sprite and light-beam) removed: under default-on A3D_QR_VFX they draw. lightCone/beam/flipbook draws proven on a mock device. Updated `tests/unit/engine/phase2-root-bridge.test.ts` (2 assertions flipped). `tests/unit/gu47/ef/light-cone-draws.test.ts` |
| EF-8 floating-dot root cause | M | pending | | |
| EF-9 liveCount soak | M | pending | | |
| EF-10 game-art skill | M | pending | | |
| EF-11 receipts specs | M | pending | | |

## Decisions

- **Atlas bake overlap (EF-1).** `tools/vfx-atlas-bake/bake.mjs` advances one cell row per layout row, so the two-row sequences overlap the next row: `fireball` overwrites the bottom-left cell of `smoke-a`, `flame-loop` overwrites the bottom row of `fireball`, `electric` and `debris-chips` overwrite the bottom row of `flame-loop` (decoded-pixel check: smoke-a frame 2 carries fireball's orange; fireball frames 4-7 equal flame-loop 0-3). The atlas files and the bake tool are outside E-F's file list, so `VFX_SPRITE_LAYOUT` (`FlipbookAtlas.ts`) samples only the clean top row of those three (smoke-a 2 frames at 6 fps, fireball 4 frames, flame-loop 4 frames at 8 fps; same cycle time). A unit test pins the overlapping pairs so a re-bake flags the table for restoring the full rows.
- **1k twin rects.** The bake keeps a 4 px gutter at both sizes, so the 1k cell pitch is 132 px, not 130; `VfxAtlas.sequence()` (rendering, not E-F) halves the 2k rect and samples 4 px off. The E-F loader computes the 1k rects from the pitch (decoded-PNG test checks centroid agreement on both pages).
- **Page delivery.** The page URL is `new URL("../../../assets/vfx/aura-vfx-<n>k.png", import.meta.url)` inside a function: Vite emits it for every monorepo game (source aliases), and the package dist resolves it because `src/` and `dist/` sit at the same depth. The root `dist/` tarball does not ship `packages/engine/assets/` (finalize-dist copies only `src/**` static assets), so npm consumers fall back to the soft-dot with `VFX_SPRITE_UNAVAILABLE` until WP-38 ships the pages (handoff below).
- **Defaults unchanged.** Emitters without `sprite`, with `sprite: "soft-dot"` or with an unknown name lower byte-identically (same batch key, no sprite field). Built-in burst presets keep the soft-dot.

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| WP-38 | `tools/finalize-dist/index.ts` / package `files` | ship `packages/engine/assets/vfx/aura-vfx-{1k,2k}.png` next to the root dist (or copy them to `dist/assets/vfx/`) | npm consumers resolve the sprite page relative to the dist module |
| (unowned, follow-up) | `tools/vfx-atlas-bake/bake.mjs`, `packages/engine/assets/vfx/*` | advance `cy` by `rows * pitch` for multi-row sequences and re-bake; then restore the full rows in `VFX_SPRITE_LAYOUT` | baked rows overlap (see Decisions) |

## API as shipped

(filled in as items land)

## CHANGELOG text (for WP-38)

(filled in as items land)

## Phase-2 plan

(filled in as items land)

## Verification

- Baseline (before the first edit, base f797808be + 16ef3e77c): 25 touched-area files run; pre-existing failures: `tests/unit/runtime-edge-coverage.test.ts` (3 tests: coverage map and placeholder-marker audits over files outside E-F) and `tests/unit/engine/phase2-root-bridge.test.ts` (1 test: spot light default intensity 30 vs 8).
