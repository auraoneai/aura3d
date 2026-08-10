# Aura3D Showcase: Architectural District Tour

CLI-backed architectural district presentation for the Aura3D portfolio build.

## Remediation Status

- Classification: bounded public candidate after route-primary framing repair.
- Route health: `apps/showcase-cinematic-architecture/route-health.json`.
- Asset status: primary architecture model is the typed GLB
  `assets.showcaseSkylineCity`.
- Rejected asset: `assets.showcaseTeaHouse` was removed from the live primary
  path after retained route-primary evidence marked it clipped.
- Rejected asset: `assets.showcaseVoxelBuilding` was removed from the live
  primary path after human visual review found it read as a flat blockout rather
  than a public architecture demo.
- Primitive status: route-level primitive staging was removed from the current
  primary composition after human review rejected the blockout-looking result.
- Claim status: bounded to typed architecture staging, public `createAuraApp`
  lighting, scoped fog/bloom/contact-occlusion requests, camera choreography,
  and deploy proof. Do not claim final architectural photography quality, HDR,
  IBL, shadow parity, or broad postprocess parity.

## Route

- App root: `apps/showcase-cinematic-architecture/`
- Browser route when served from repo root: `/apps/showcase-cinematic-architecture/`
- Entry point: `src/main.ts`
- Evidence global: `window.__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__`

## Controls

- Mood: `Dawn`, `Gallery`, `Nocturne`
- Camera Path: `Establish`, `Glide`, `Balcony`
- Haze Density: range control that rebuilds the Aura scene with bounded fog and bloom values
- Orbit interaction remains enabled through `interactions.orbit()`

## Systems Used

- Public `@aura3d/engine` route mount through `createAuraApp`
- Typed CLI-resolved architecture model through `model(assets.showcaseSkylineCity)`
- `camera.path` and `camera.dolly` choreography
- `lights.ambient`, `lights.directional`, `lights.point`, and `lights.rect`
- `effects.fog`, `effects.bloom`, and `effects.ambientOcclusion`, bounded to the
  current route and screenshot evidence
- `collectAuraSceneEvidence` and renderer diagnostics published to the route evidence global

## Asset Provenance

- Typed asset: `assets.showcaseSkylineCity`
- Source workflow: release-proven typed architecture backup selected after
  `showcaseVoxelBuilding` failed human visual review
- Catalog source: Objaverse
- License: `CC-BY-4.0`
- Attribution: retained in `aura.assets.json`
- Runtime use: `model(assets.showcaseSkylineCity)` from `src/aura-assets.ts`

The route does not use raw GLB URLs, string asset ids, custom loaders, or
private Three.js APIs.

## Evidence Contract

The route publishes:

- `status`
- `appId`
- `frameCount`
- `controls`
- `systems`
- `claimBoundary`
- `composition`
- Aura scene evidence and renderer diagnostics
- Route health fields from `app.diagnostics()`

## Claim Boundary

This route demonstrates a typed, catalog-resolved city architecture asset staged
inside an Aura3D scene. The current presentation is a bounded architectural
district tour: it proves readable typed asset staging, camera choreography,
selected root effects, and route evidence, but it does not claim final
architectural visualization fidelity or unsupported renderer features.
