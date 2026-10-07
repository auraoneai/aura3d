# PRD-07 PR E evidence — Phase 5 GPU sim, weather, volumetric (§8.2/8.3/8.7)

Branch `qr/prd07-weather-volumetric` (off `qr/prd07-fog` @ 73a9283 lineage).

## Landed

- **P5-T1 `vfx/ParticleGpuSim.ts` + `vfx/shaders/gpu-sim.glsl.ts` (§8.3)** —
  two single-target `rgba32f` ping-pong passes (pos then vel, shared
  `a3dSimStep` so state stays consistent), ring-buffer emission
  (`a3dInRing`/`a3dEmit` hashed on `(index, seed, frame)`), curl-noise force
  (signed value noise, ε=0.1), plane + optional heightfield collision
  (bounce, tangent ×0.7, `lifeLoss`). Capability via C-28
  `probe.floatColorBuffer` → `ParticleGpuSim.isAvailable`; CPU fallback path
  reports `PARTICLE_GPU_UNAVAILABLE` (contributor). State textures registered
  with C-29 `resourceRegistrySlot` (`kind: "prd07.gpuSim"`, rebuild =
  reallocate). `gpuSimEmit`/`gpuSimCpuStep`/`a3dValueNoise`/`a3dCurlNoise`
  are the byte-faithful JS mirror used by the parity spec and the CPU path.
  Browser spec `gpu-sim-parity.spec.ts`: 50,000 particles, gravity only,
  60 steps → pos within 1 mm / vel within 1 cm·s⁻¹ of the mirror (readback in
  test only).
- **P5-T2 `vfx/ProceduralVolumeEmitter.ts` + `vfx/shaders/volume.glsl.ts`
  (§8.2)** — hash-based volume emitters (`proceduralVolumePos` CPU + GLSL
  twins) for `rain`/`snow`/`marineSnow`/`dustMotes` presets; camera-anchored
  box with `proceduralVolumeEdgeFade`; `fillInstanceRing` writes §6.2.1
  blocks. Unit test: 10,000 ids stay inside the camera volume across ±50 m
  camera moves.
- **P5-T3 `production-runtime/effects/WeatherVolume.ts`** —
  `weather.rain`/`snow`/`lightning`. Splash CPU emitter re-seats spawn y at
  `groundHeightAt` (default C-26 `app.world.height().heightAt`, stub 0) and
  kills sub-ground particles; `wetness` state driven for rain;
  `lightningIntensity(elapsed)` wraps `sampleLightningFlash`. Tests cover
  modular fall rate, splash-on-ground (fresh + post-step), snow/no-splash,
  step-gating, lightning envelope.
- **P5-T4 carved `agent-api/nodes/weather.ts`** — `weather.precipitation` /
  `weather.wetGround` now tag every legacy primitive `prd07.legacyWeather.<n>`
  (mirrors the §6.5 `prd07.legacySky` carve) and `wetGround` also emits an
  `effects.wetness` node. `ProductionEffectSystem.setWeatherFlagOn` hides the
  tagged handles when `A3D_QR_VFX` is on; flag-off is bit-identical (tests
  assert identity and full-hide).
- **P5-T5 `atmosphere/shaders/wetness.glsl.ts`** — chunk `a3d_prd07_wetness`
  (registered via `fogChunks.ts`) + feature `prd07.wetness`
  (`fragment:material`, `A3D_WETNESS` define). Globals flow through
  `setPrd07WetnessState` (`bindUniforms` has no blackboard) —
  `u_wetness`/`u_puddleThreshold`/`u_rainRipples`. `WETNESS_PENDING`
  once-note while the C-02 generator is a stub. CPU mirror
  `applyWetnessMaterialCpu` tested at wet 0/0.5/1 (darkening ×0.55,
  roughness → 0.06, porosity scaling, snowCover albedo > 0.94).
- **P5-T6 `atmosphere/VolumetricFogPass.ts` + volumetric-{inject,integrate,
  apply}.glsl.ts (§8.7)** — 2D tiled `rgba16f` atlases (one scissored inject
  draw per slice, whole-atlas integrate, premultiplied apply). `froxelGridFor`
  implements the frozen C-27 table incl. temporal Ultra (Jitter = slice
  fraction of `frameIndex mod 8`, reproject with prevViewProjectionMatrix;
  first-frame fallback when null) and R10 `VOLUMETRIC_GRID_REDUCED`
  (240×135×96) under forced low memory. `resolveSceneDepth` gates the
  contributor (`VOLUMETRIC_DEPTH_PENDING` otherwise).
  `debugTargets` exposes inject/integrate for readback.
- **P5-T7 `VolumetricFog.ts`** — `qrVolumetricModeForTier` maps
  `QUALITY_TIERS[*].volumetricFog` (`analytic` low/medium, `froxel-medium`
  high, `froxel-high` ultra); `resolveQrVolumetricFog` packs
  `fogA=(σd,σh,b,h0)`, sun color ×intensity×4, ambient ×0.35, anisotropy,
  noise; `qrVolumetricColor` honors `effects.volumetricFog({color})`.
- **P5-T8 lane scenes** — `prd07-rain-night` (rain + streetlight + wet
  ground), `prd07-snow`, `prd07-volumetric-shafts` (god rays through window
  grid), `prd07-lit-smoke`, `prd07-soft-particles`, `prd07-water-interleave`
  (soft-depth fade vs a water plane) with three r185 adapters per §17:
  InstancedMesh streaks + snowflake Points, additive `lightConeMesh` cones,
  `FogExp2` partial for volumetric. `WeatherObjectSpec` + `volumetric` /
  `softParticles` fields added to the spec schema; both adapter commons pass
  `opacity` through.
- **Latent-bug fix (carried here):** `u_outputColorSpace` (and sibling scalar
  uniforms) declared `uniform int` in `beam.glsl.ts`/`ribbon.glsl.ts` are now
  `uniform float` — `WebGL2DrawCallBinder` binds scalars with
  `gl.uniform1f`, so `int` declarations silently never set.
- **`invertRigid` fix** — `VolumetricFogPass` inverse-View translation used
  row·t instead of col·t (`out[12] = -(r00·tx + r10·ty + r20·tz)` etc.);
  caught by the new round-trip unit test.

## CI / workflows

- `.github/workflows/prd07-vfx.yml` `SCENE_LIST` extended with all six new
  scenes (16 prd07 scenes total).

## Verification (local)

- Lane vitest: **41 files / 172 tests** green
  (`gpu-sim`, `volume`, `wetness`, `volumetric-tier`, `weather-volume`,
  `weather-legacy` suites added).
- Root `tsc -p tsconfig.build.json --noEmit` clean; bench
  `benchmarks/quality-rebuild` tsc clean.
- Flag-off sentinel: all behaviour behind `A3D_QR_VFX(_*)`; weather tags are
  additive runtime metadata only — flag-off output byte-identical.

## NOT RUN (remote-only per lane policy)

- `gpu-sim-parity.spec.ts`, `froxel-transmittance.spec.ts` — authored here,
  run on the macos-14 browser fleet.
- Scene captures / G-PANEL means for the six new scenes (capture jobs).
