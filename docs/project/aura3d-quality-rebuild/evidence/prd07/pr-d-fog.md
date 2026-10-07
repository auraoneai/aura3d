# PRD-07 PR D evidence — Phase 4 fog (§6.6 + §8.4)

Branch `qr/prd07-fog` (off `qr/prd07-sky` @ e4f8e4f lineage).

## Landed

- **P4-T1 `atmosphere/HeightFog.ts`** — CPU mirrors of the §6.6 model:
  `heightFogTau` (analytic integrated exponential height fog — `L(k)` form with
  the `|k|<1e-4` degenerate limit and `b=0` uniform fallback), `fogTau`,
  `fogAmount`, `fogInscatter` (HG g=0.6 sun inscatter), `applyFog`,
  `absorptionTransmittance` (per-channel `T=exp(-σ·d)`), plus
  `legacyEnvironmentFogFactor` (verbatim JS port of `ShaderChunks.ts:475-491`),
  `legacyParityFogAmount`, `packLegacy` (height → legacy exp at eye density),
  `packV2` (v2 slots; mode-6 alias packing when `A3D_QR_CORE !== "v2"`),
  `resolvePrd07FogSpec` (C-21 defaults at resolve time only for §6.6-authored
  specs — a `density`+`color`+`intensity`-only call is the legacy surface),
  `parseFogColor` (sRGB→linear, `"sky"` → `skyHorizonRadiance`),
  `skyHorizonRadiance(sky, azimuth)` — the shared 8-sample horizon table used by
  BOTH the engine compiler (`color:"sky"`) and the rendering fog contributor.
- **P4-T5 `atmosphere/FogVolumes.ts`** — `A3D_MAX_FOG_VOLUMES=8`; slab ray/box
  and quadratic ray/ellipsoid segment lengths, `fogVolumesTau` Σ·density,
  `packFogVolumes` → `Float32Array(2·8·4)` `[shape,_,_,_]`/`[center | halfSize | density]`.
- **P4-T2 `atmosphere/shaders/fog.glsl.ts`** — chunk `a3d_prd07_fog` per §8.4:
  `u_fogA/u_fogB/u_fogColor/u_fogAbsorption/u_fogMode/u_fogNear/u_fogFar/
  u_fogVolumes[2·A3D_MAX_FOG_VOLUMES]`; modes 0–6 (0 off, 1 height, 2 exp,
  3 exp2, 4 linear, 5 absorption, 6 legacy-parity evaluating the legacy formula
  verbatim with aliased slots). `A3D_PRD07_FOG_ENV_UNIFORMS` guard lets the sky
  program pre-declare `u_cameraPosition/u_sunDirection/u_sunColor`. Fixed
  during review: mode-6 `a3dApplyFog` blends to plain `u_fogColor` — the legacy
  formula has no sun inscatter (`u_fogB.z` is `maxOpacity` in parity packing,
  not `sunInscatter`). Registered chunks `a3d_prd07_fog`/`a3d_prd07_wetness` and
  features `prd07.fog` (hook `fragment:fog`, `select` returns
  `"height"`/`"volumetric"` only under `A3D_QR_VFX_FOG`) in `lanes/prd07.ts`.
- **P4-T3 `LiveAtmosphere`** — `WeakMap<node,{spec,visible}>` refreshed on
  `updateFogVisibility(app)` each frame (last *visible* fog node in scene order
  wins; all hidden → NO fog, no `setFog` fallback); `fogVolumes()` maps
  `position`/`size` → center/halfSize with ellipsoid shape; transitions lerp
  density linearly and colour in linear RGB; `setFog` handle extension (C-37).
  `ProductionEffectSystem.rebuildFromScene` collects `consumer==="scene-fog"`
  (fogVolume vs fog node), `frame(dt)` ticks transitions + visibility.
- **P4-T4 carved `compiler/fog.ts`** — flag-off body byte-identical
  (exp2, `near 1/far 60`, `density` clamp ≤0.12, `legacyOpacityCap`
  `clamp(0.25+intensity·0.55,0,0.92)`); flag-on: live spec → `resolvePrd07FogSpec`
  → `packLegacy` → `ForwardEnvironmentFogOptions` (`near 0/far 1`, authored
  `maxOpacity`, `color:"sky"` from `skyHorizonRadiance`).
  `bindPrd07FogRuntime({flags, atmosphere}|null)` is bound by
  `createAtmosphereExtension`; `atmosphere-api` gate widened so `app.atmosphere`
  exists under `A3D_QR_VFX_FOG` alone.
- **P4-T7 background fog** — `skyProgramDefines` gained `fog` (12 program
  variants; key gains `.fog`), `skyFragmentSource` prepends the chunk and a
  `SKY_FOG` block that calls `a3dApplyFog(color, u_cameraPosition + direction·
  u_fogBackgroundDistance)`; `SkyBackgroundPass.setFog(SkyFogState|null)` merges
  fog uniforms at draw; `prd07.fog` contributor writes `prd07.fog` blackboard
  state in the `background` phase (camera forward from the view matrix, packed
  uniforms via `packV2`, `sunColor` from `evaluateSky` clamped ≤8);
  `prd07.sky`'s `passes` reads it and calls `pass.setFog` when
  `affectsBackground` — including the COLOR model case (fogged fullscreen pass).
- **P4-T8 scenes** — `prd07-fog-height` (708: C-21 default height fog over
  receding ridges; three adapter = FogExp2 approximation, partial),
  `prd07-fog-transition` (709: `setFog(from)` → `setFog(to,{transitionSeconds:1})`
  captured at the blend midpoint; `admittedAsReference:false`),
  `prd07-underwater` (710: σ=(0.42,0.11,0.07) absorption — red dies by 10 m;
  `admittedAsReference:false`). `FogSpec` widened to the §6.6 field list +
  `fogTransition`/`fogVolumes` spec members; Aura adapter builds
  `effects.fog`/`effects.fogVolume` nodes and drives the transition through
  `app.atmosphere.setFog`; `SCENE_LIST` extended in `prd07-vfx.yml`.

## Tests (vitest, all green — 35 files / 137 tests)

- `fog-height-integral.test.ts` — 50 random rays (LCG) vs 1,000-step numeric
  march within 1%; horizontal `v.y≈0`, `b=0`, start-clip degenerate cases.
- `fog-legacy-parity.test.ts` — `legacyParityFogAmount` vs
  `legacyEnvironmentFogFactor` ≤1e-6 on 1,000 random points ×6 spec shapes;
  verbatim-port anchors (linear 0.5 at d=55, exp/exp2 `1−e⁻¹`, height
  multiplier, disabled→0, maxOpacity clamp).
- `fog-live.test.ts` — 5 nodes toggled via `setVisible` → last visible wins;
  all hidden → null; `transitionSeconds:1` midpoint within 2% at 0.5 s;
  linear-RGB colour lerp vs sRGB lerp distinction (#800000/#008000 endpoints).
- `fog-compile.test.ts` — flag-off deep-equal legacy carve (exp2, near 1,
  far 60, 0.12, cap); flag-on resolves C-21 defaults (7/37/62% at 10/50/100 m
  horizontal from 1.6 m ±1.5%); density-only → exp2 + maxOpacity 1; bound
  runtime compiles the live spec.
- `fog-volumes.test.ts` — box/ellipsoid segment lengths vs 4,000-step numeric
  march within 1%; pack layout.
- `fog-absorption.test.ts` — `T=exp(-σ·d)` per channel at 10 m for
  σ=(0.42,0.11,0.07) within 1e-5; `applyFog` blend; red channel extinction.

## Browser specs (macos-14 fleet — run by CI, not locally)

- `fog-chunk-compile.spec.ts` — standalone chunk (incl. `FOG_VOLUMETRIC`
  froxel path) + all 4 sky models × {fog off, on}: 10 compile+link combos.
- `fog-background-match.spec.ts` — fogged horizon sky band vs fully-fogged far
  wall band ≤3/255 under `vfx,vfx.sky,vfx.fog`; flag-off sentinel asserts the
  wall shows its lit material colour (delta > 8/255).

## Shared-file exceptions

- `packages/react/src/index.ts` — `effects.fog({ ...props })` (spread) so
  `EffectProps` satisfies the widened `VfxNodeOptions` (the §6.6 fields ride
  through as data). One-token change, flag-off no-op.
- `AuraEffectNode`'s typed `mode` slot is the antialias union; the §6.6 fog
  `mode` name collides. The adapter passes it as runtime data with a value
  cast (comment in `aura3d/scenes/prd07/common.ts`).

## Flag-off sentinel

`createProductionRuntimeEnvironmentFog` returns byte-identical output with the
flag off; the fog contributor's `flag` gate (`A3D_QR_VFX_FOG`) keeps it out of
the frame graph; `packV2` parity path (mode 6) reproduces the legacy formula
exactly so sky/VFX/geometry agree under every flag combination.
