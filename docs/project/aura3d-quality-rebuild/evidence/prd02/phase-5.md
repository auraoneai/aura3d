# PRD-02 Phase 5 evidence — contact shadows, probes, LTC

Branch `qr/prd02-engine-composition`, flag `A3D_QR_LIGHTING` (+ sub-flags
`A3D_QR_LIGHTING_CONTACT`, `A3D_QR_LIGHTING_PROBES`).

## §6.5 contact shadows — `prd02.contactShadows` (after-opaque)

- `packages/rendering/src/shaders/chunks/contact_shadow.glsl.ts` (rewritten):
  `a3d_contactShadow(uv)` view-space ≤16-step march toward the sun with
  interleaved-gradient-noise jitter, `u_prd02ContactParams` = length 0.25 m /
  thickness 0.05 m / steps / jitter; depth linearized via
  `u_prd02ContactInvProj` + `u_prd02ContactNearFar`. Registered as chunk
  `a3d_prd02_contact_shadow` (multiplies `V_l` only — applied at the
  punctual-shadow use site, never the ambient/IBL terms).
- `packages/rendering/src/passes/ContactShadowPass.ts`: half-res R8 mask
  (`a3d.prd02.contactShadowMask`) rendered by a fullscreen triangle; reads
  `FRAME_RESOURCES.sceneDepthCopy` when C-01 is real, else captures its own
  half-res `DepthPass` (rgba8 + depth-texture target) through the lane's
  prd02 depth shader library (`depthLibraryFor` per-device WeakMap).
  No-depth path clears the mask to white (pass-through).
- `packages/rendering/src/passes/Prd02ContactShadowsContributor.ts`:
  contributor `{id:"prd02.contactShadows", phases:["after-opaque"]}` gated by
  `contactShadowRequest(ctx)` — C-27 `tier.shadow.contact` (Ultra) OR
  `effects.contactShadows()` opt-in at any tier except Low, OR the
  `A3D_QR_LIGHTING_CONTACT` sub-flag. Publishes
  `prd02.contactShadowMask` on the blackboard; diagnostics
  `contactShadows.passExecuted`/`depthSource` count pass executions only
  (E25 — never node names). Engine `diagnostics()` exposes
  `contactShadows` from the same sink.
- `effects.contactShadows` node → `Prd02ShadowOptions.prd02Contact` additive
  member on `source.shadow` (same convention as `prd02Shadows`).
- E34: `EnvironmentPlatform.createEnvironmentStage({flags})` skips the
  ExternalParity blob plan under the flag; `ShadowDebugViews` omits the
  `contact-shadow` view under the flag. Flag-off paths byte-identical
  (optional `flags` param, default absent → legacy plan/view).
- `shadows.blobShadow` builder + `@deprecated shadows.contact` alias already
  landed (Phase 2); `migrate lighting` now *reports* `shadows.contact` call
  sites as an exact→`shadows.blobShadow` row (applied by PRD 14/13).
- Tests `prd02-contact-shadows.test.ts` (8): gating ×4, self-depth vs
  scene-depth mask paths, blackboard publish + diagnostics, no-request
  no-pass. Browser `prd02-contact-cube` R8-mask spec pending (macos-14 lane).

## §6.6 reflection + irradiance probes — `prd02.probes` (shadows phase, order −1)

- `packages/rendering/src/probes/ReflectionProbeSystem.ts`: 6-face HDR
  (rgba16f) captures through the injected `ReflectionFaceRenderer` →
  `buildProbeFromFaces` (PMREM'd `Prd02EnvironmentProbe`). Update modes:
  `once` (one full capture), `on-demand` (only after `updateProbe(name)`),
  `every-n-frames` (time-sliced — 1 face per `update()` call, loops).
  `assign(item)` = CPU per-item ≤2-probe selection weighted by box distance
  with `blendDistance` falloff (inside box = 1, linear fade outside),
  priority-then-name tie-break, remainder → `globalWeight` (global env).
- `packages/rendering/src/probes/IrradianceVolume.ts`: SH-L1 grid —
  per-cell 32 px 6-face captures → `projectCubeToSH9` → first 4 coeffs
  per channel packed into 3 RGBA16F 2d-array textures (per-layer mipLevels —
  see open seams). `sample(point, n)` = 0.5·cell normal offset → trilinear
  L1 → `evalShL1` (signed interleaved basis) × intensity × bounds fade;
  `null` outside the fade shell. `once` / `on-demand` via `updateProbe()`.
- `packages/rendering/src/probes/Prd02ProbesContributor.ts`: contributor
  `{id:"prd02.probes", phases:["shadows"], order:-1}` reads `prd02.probes.*`
  contributions from the compiled RenderSource (C-36 probe handler), then
  publishes `prd02.probeSelection` (per-item Map), `prd02.irradianceVolume`,
  and the PRD-03 SSR seam `prd02.envSpecular` (dominant probe's
  `specularCube`) + `prd02.roughnessToLod` (`r → r·(mipCount−1)`).
- Box projection: `a3dPbrBoxProjectedDirection` already lives in the IBL
  chunk (Phase 2); per-item assignment is the CPU seam the shading pass
  consumes (≤2 cubes per draw on WebGL2).
- Tests `prd02-probes-ltc.test.ts` probes portion (5): boxWeight fade,
  ≤2-probe assign + global remainder, update-mode capture counts,
  irradiance volume sample/fade, contributor blackboard keys.
  Browser `prd02-reflection-probe` / `prd02-red-wall-bounce` ChunkHarness
  specs pending.

## §8.5 LTC rect area lights

- `lighting_punctual.glsl.ts` rect dispatch (from PR-B) now branches
  `#if A3D_AREA_LTC` (identity Minv + `a3d_ltcEdgeIntegrate` edge integral
  with `acos(clamp(dot))·cross.z/|cross|` weighting) vs `A3D_AREA_GAUSS`
  (`a3d_rectGaussDiffuse` quadrant-centroid 4-tap, solid-angle weighted).
- `packages/rendering/src/probes/LtcLuts.ts`: `fetchLtcLutTextures(device)`
  lazily fetches the two 64×64 RGBA16F LUTs (three.js
  `RectAreaLightTexturesLib.js`, MIT — `LTC_LUT_SOURCE_URL`), validates the
  exact `LTC_LUT_BYTES` size, builds `u_prd02LtcMInv`/`u_prd02LtcFresnel`
  textures, cached per device. CPU twins `gaussLegendreRectDiffuse` /
  `rectDiffuseReference` (dense-grid reference) mirror the GLSL paths for
  the PRD unit test.
- Tests (4): lazy fetch + byte-size checksum + per-device cache, reject on
  size mismatch, Gauss–Legendre vs dense integration ≤10% total energy on
  a reference plane (passes at ~2%).

## Open seams / qr-requests (logged in `qr-requests.md`)

- Probe `renderFace` is delivered via blackboard `prd02.probeRenderFace` or
  `installPrd02ProbeRenderer` (module setter) — a cleaner C-09-owned
  production seam would need a `to:prdNN` contract addition.
- `Texture` 2d-array upload path is a C-18 seam (TextureUpload handles 2D +
  cube only); the irradiance volume's 3 SH textures carry layers as
  per-layer `mipLevels` until a real `texImage3D` path exists.
- LTC specular evaluation + `A3D_AREA_LTC`/`A3D_AREA_GAUSS` define wiring
  land with the composed-lit-program shading seam (same pending integration
  as `a3d_punctualShadowFactor` — G-08 path).
