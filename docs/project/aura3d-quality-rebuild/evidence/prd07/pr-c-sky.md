# PRD-07 PR C evidence — Phase 3 sky (§6.5 dayNight rewrite + C-21 surface)

Branch `qr/prd07-sky` (off `qr/prd07-scenes` @ e4f8e4f).

## Landed

- **§6.5 `sky.dayNight` rewrite** (`agent-api/nodes/sky.ts`): emits the same legacy
  sphere primitives as `85aafcd0` — identical geometry/materials — each tagged
  `.runtime({ id: "prd07.legacySky.<n>", tags: ["prd07.legacySky"] })`, plus ONE
  `sky` node (preetham default; `model: "gradient"` option) with sun/moon
  directions from `createDayNightSky` and `groundColor = horizonColor` fog hint,
  plus one untagged directional key light. Returns `{ nodes, background,
  dayFactor, visibleStarCount, sky }`. Flag off: primitives render, `sky` node is
  ignored by the runtime → bit-identical. Flag on: `ProductionEffectSystem`
  hides tagged primitives (`app.nodes.get(id).setVisible(false)`,
  `A3D_QR_VFX_SKY`-gated in `setSkyFlagOn` bound by `createAtmosphereExtension`)
  and the existing `prd07.sky` contributor draws `SkyBackgroundPass`.
- **Sky-node ingestion:** `ProductionEffectSystem.rebuildSkyFromScene()` runs
  first in `rebuildFromScene()`: `kind === "sky"` nodes → `LiveAtmosphere.setSky`
  → `applyLegacySkyVisibility()`. `AppLike` gained optional `nodes` member.
- **P3-T2 StarField/CloudLayer/moon:** `StarField.ts` (512×512 grid,
  `occupancy = density × 0.01`, smoothstep fade 0–6° sun elevation);
  `CloudLayer.ts` (frame defaults, `maskEdge = 1 − coverage`,
  `elevationScale = 1 − 0.9e`, horizon fade over `0..(0.1+0.2e)`); `SkyEval.ts`
  gains `MoonSpec/MoonFrame` (`illumination = 1−|2·phase−1|`, ×6.0 intensity,
  gated by `(1 − sunfade)` like stars), per-model star dimming, `moon` in
  `SkyProgramDefines`/`skyProgramKey`. `sky.glsl.ts` packs 5 moon uniforms +
  `SKY_MOON` block; `SkyBackgroundPass.skyUniforms` packs them.
- **P3-T6 `SkyCaptureAdapter`:** resolves to `SKY_CAPTURE_PENDING` unless a
  visible sky node exists, no explicit `app.environment`,
  `environmentProbeFactorySlot.provided`, and `A3D_QR_LIGHTING` is on; then calls
  `fromScene({ renderFace: sky.renderToCubeFace, resolution: 128 })` (slot value
  is a factory — called with `device`) and re-captures on the new
  `LiveAtmosphere.onSkyChanged` listener set.
- **P3-T7 scenes:** `prd07-sky-timeofday` (id 706, dusk `hour: 19`, seed 7,
  ridge + field, `qrFlags: ["vfx", "vfx.sky"]`) and `prd07-outdoor-sky`
  (id 707, noon preetham 62°/195° turbidity 5, `FogExp2` `#a8c2d8` σ 0.012,
  3 ridges) with Aura + three r185 adapters (`Sky.js` scaled 450000, uniforms
  `sunPosition/turbidity/rayleigh/mieCoefficient/mieDirectionalG`; `dayNight`
  mirrors `((hour−6)/12)·π`, `elevation = sin·1.1`). `SCENE_LIST` in
  `prd07-vfx.yml` gains both ids.
- **Builders:** `sky.preetham` / `sky.gradient` / `sky.hdri` emit `AuraSkyNode`
  via `skyNode(name, spec, { captureEnvironment, affectsFog })` (cast through
  `unknown` — `AuraSkyNode` is not yet in the `AuraSceneNode` union, filed as
  CCR-07-2 / issue #237).
- **C-40 row F-07-06** filed (dayNight tagging contract + star/moon laws).

## Tests (local, vitest `--config tests/qr/prd07/vitest.config.ts`)

- 29 files / **113 tests green**; `tsc -p tsconfig.build.json --noEmit` clean;
  bench tsconfig clean.
- New: `sky-nodes.test.ts` (10) — builders, dayNight tag/return shape, gradient
  monotonicity on `[2, t, 0]` dirs, star count ∝ density, star fade > 6°, moon in
  program key, cloud constants, skyFrame dimming.
- `sky-capture-adapter.test.ts` (2) — pending paths; provided-slot capture with
  `faceCalls === 6` over `beginFrame(128,128)`.
- `prd07-C-21.test.ts` (4) — C-21 surface, `horizonRadiance(8)` = 24 finite
  floats, cache identity, noon horizon > zenith (std > 0.001), sun-disc luma > 10
  CPU-side, 5 distinct program keys over the (model × clouds × moon) product.
- `scene-registry.test.ts` gains the P3-T7 registration assertions.
- Browser: `sky-daynight-identity.spec.ts` (flag-off checksum === `none`;
  `vfx,vfx.sky` differs + `background === "sky-preetham"` + 0 visible legacy) and
  `sky-background.spec.ts` (sky luma std > 6, horizon > zenith at noon).

## NOT RUN (remote-only per lane policy)

- All browser specs above — they run under `prd07-vfx.yml` capture/browser jobs.
- P3-T1 / P3-T3 `rgba16f` GPU readback sub-items: `RenderDevice.readPixels`
  returns `Uint8Array` (clamped); float readback exists as
  `probe.readFloatPixels` but is not exposed on the device interface. Filed
  `qr-request` issue #245; CPU-side parity (16-dir ≤1e-4, sun luma > 10) is green.

## Flag-off sentinel

`sky.dayNight` produces the same primitives + runtime tags (inert), no `sky`
node consumption (no flags → no `ProductionEffectSystem`); `applyLegacySkyVisibility`
only runs inside the flag-gated system. Capture lane still asserts bit-identical
vs `85aafcd0` via `sky-daynight-identity.spec.ts`.
