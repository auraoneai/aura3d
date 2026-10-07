# PRD-07 PR F evidence — Phase 6 decals and polish (§6.9, §8.8)

Branch `qr/prd07-decals` (off `qr/prd07-weather-volumetric` tip).

## Landed

- **P6-T1 `vfx/DecalBatch.ts` + `vfx/shaders/decal.glsl.ts` (§6.9)** —
  ring-allocated merged geometry keyed by `pageKey × blend`; `DECAL_TIER_CAP`
  (low 64 / medium 128 / high 256 / ultra 512) replaces `AURA_DECAL_MAX_DECALS`
  and evicts oldest-first (re-`upsert` keeps insertion order, so refresh
  storms do not thrash the ring). `DecalVertexData` supports stride 8
  (pos3+normal3+uv2, `decalQuadGeometry`) and stride 16 (baked color + fade
  channel, used by P6-T3 trails). Shader is lit per §8.8 with per-vertex
  `a_fade` (carried on `uv1`/`a_fade` semantic), angle fade
  (`smoothstep(angleStart→angleEnd)`, bypassed when `angleEnd ≤ angleStart`
  for surface trails), near/far depth fade, and `life`/`fadeOut` expiry.
  `agent-api/Decals.ts` stamps every decal node `prd07.legacyDecal.<n>`;
  `ProductionEffectSystem.setDecalFlagOn` hides them through runtime handles
  under `A3D_QR_VFX_DECALS` and `syncDecals` feeds the batch (`decalFeed` on
  `VfxFrameSource` → `decalsContributor` at `after-opaque`). Flag-off emits no
  contributor — the draw list is identical to `85aafcd0`.
  Tests (Mock): 100 decals on one page → 1 draw; cap eviction oldest-first;
  page×blend splits; life expiry; flag gating.
- **P6-T2 decal atlas page** — `tools/vfx-atlas-bake/bake.mjs` bakes
  `aura-vfx-{2k,1k}-decals.png` (scorch, crack, tyre-track, puddle in a 2×2
  `DECAL_LAYOUT`) plus `-normal` (tangent space) and `-roughness` twins;
  `manifest.json` gains `decals: { entries, albedo, normal, roughness }`.
  `VfxAtlas` loads the tier-size decal channels (`decalTextures`). Baked
  outputs committed under `packages/engine/assets/vfx/`; the CI bake
  drift-check list now covers them.
- **P6-T3 surface trails on the decal pass** — `RibbonBatch.enabledOrientations`
  (default `["camera","surface"]`) drops `"surface"` under the flag so the
  ribbon pass never double-draws; `ribbonStripToDecalGeometry` bakes each
  strip vertex to stride-16 (`a_fade = [0, 0, 0, +∞]` → angle fade bypassed,
  `decalLifeAlpha` still applied); polygon offset `{-2, -2}` from the §6.9
  defaults. Browser spec `decal-surface-trail.spec.ts` (macos-14 fleet): the
  harness draws a floor plane + a polygon-offset decal mark at 50 m and
  asserts two consecutive frames differ by ≤ 1/255 in the mark region (no
  z-fighting).
- **P6-T4 optional half-res particle path** — `vfx/LowResParticles.ts` +
  `vfx/shaders/lowresComposite.glsl.ts` + wiring in `ParticleBatchPass`:
  batches whose descriptor sets `lowRes` (`EffectNodeLike.lowRes` →
  `LoweredBatchSpec.lowRes` → `ParticleBatchDescriptor.lowRes`; emitter key
  trailing bit keeps them out of full-res merges) divert into a half-size
  `rgba8` `LowResParticleTarget` (renderbuffer depth), then a fullscreen
  triangle composites — bilateral depth-aware upsample when
  `resolveSceneDepth` is available, plain bilinear otherwise.
  `LowResAutoBudget` (EWMA, 8-frame warmup) engages when measured particle
  GPU ms exceeds `PARTICLE_GPU_BUDGET_MS[tier]` (low 8 / medium 6 / high 4 /
  ultra 3 — `particleGpuBudgetMs` honours custom tier objects by
  `particleBudget` equality) and exits below 0.75×; `noteGpuMs` is plumbed
  `system.noteParticleGpuMs` → `ParticleRenderHook.noteGpuMs`.
  `RenderDevice.getRenderTarget?` (new optional member) is required for the
  mid-frame divert to restore the caller's binding — devices without it note
  `LOWRES_UNSUPPORTED` once and stay full-res. Manual override via
  `setParticleLowRes` / `setLowResEnabled`; **off by default**.
- **P6-T5 codemod `vfx-pools-to-effects` (C-39)** —
  `packages/aura3d-cli/src/commands/prd07/codemods.ts`. Reports E25 rows for
  pooled `primitives.box/sphere` arrays (`Array.from({length` windows) and
  life-driven `setScale` writes; rewrites `effects.spawnLoop(` →
  `effects.spawn(` and pooled primitive chains
  (`primitives.box/sphere(...).runtime(...)`) into
  `app.effects.burst("explosion-small", ..., { count: 8 })`. Balanced-paren
  chain walk handles nested builder calls and multiline formatting. Fixture
  `tests/qr/prd07/fixtures/clear-fx.ts` is a verbatim copy of
  `apps/showcase-blockfall-reactor/src/clear-fx.ts` — never edited in place.
- **P6-T6 route notes** — `evidence/prd07/route-notes.md`: one section per
  game (12 routes) with file:line anchors and the lane-surface mapping
  (E25 pools → `app.effects.burst`, surface trails → decal pass, sky →
  `sky.preetham`, act fogs → `effects.fog` last-visible-wins, snow/rain →
  `weather.*`, volumetric → `froxel` tier, plus the flag/budget table).
- **P6-T7 lane scene `prd07-decals`** — asphalt floor + wall, four authored
  decals (`decals.project`: scorch, tyre track, puddle, wall crack), one
  runtime decal through `app.effects.decal`, and a `orientation:"surface"`
  skid trail — all five flat decals share one `flat:` page → one draw call
  under the flag. Three r185 adapter projects `DecalGeometry` onto the named
  host primitives (`polygonOffset −4/−4`, transparent, depthWrite off).
  `DecalObjectSpec` added to the scene-spec schema; registered in
  `scenes/prd07/index.ts`, both `adapterSceneIds`, and the workflow
  `SCENE_LIST`.
- **`effects.decal` real implementation** — the P0 pending stub
  (`VFX_DECAL_PENDING`, dead handle) now spawns a runtime decal node
  (`effect: "decal"` → `consumer: "decal-pass"`) that `syncDecals` feeds as a
  normal-oriented quad (`quatFromUnitVectors` from +Z); `stop()` removes the
  slot and `setPosition` re-roots it. `options.lifetime` maps to the slot
  `life`. Flag-off stays pixel-identical (no contributor ⇒ no draws).
- **P5 registration fix** — the six P5-T8 scenes (`rain-night`, `snow`,
  `volumetric-shafts`, `lit-smoke`, `soft-particles`, `water-interleave`)
  existed in `prd07Specs` and had adapters but were never appended to
  `scenes/prd07/index.ts` → absent from `ALL_SCENES`/captures. Registered.

## CI / workflows

- `SCENE_LIST` extended with `prd07-decals` (17 prd07 scenes; note the six
  P5 scenes now enter the capture matrix for the first time — they were in
  the list since PR E but unreachable until the registration fix above).
- Bake drift-check now compares the nine decal PNGs + manifest.

## Verification (local)

- Lane vitest: **44 files / 189 tests** green (`lowres-particles`,
  `vfx-pools-codemod`, `decals` — incl. the runtime-decal round-trip — added).
- Root `tsc -p tsconfig.build.json --noEmit` clean; bench
  `benchmarks/quality-rebuild` tsc clean.
- Flag-off sentinel: all contributors gated on `A3D_QR_VFX(_*)`; runtime
  decal nodes are inert map entries with no draws when the flag is off.

## NOT RUN (remote-only per lane policy)

- `decal-surface-trail.spec.ts` (z-fighting assertion) — authored, runs on
  the macos-14 browser fleet.
- `prd07-decals` captures + G-PANEL means (capture job).
- `effects.decal` flag-off baseline equivalence is structural (no
  contributor ⇒ no draws), matching the P0 stub behaviour.

## C-40

- Row F-07-09 filed (decal merge/carve/tier cap, surface-trail decal pass,
  runtime decals, half-res particle target + budget).
