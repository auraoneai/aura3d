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
- Claim status: bounded browser proof now covers the typed architecture asset
  on the public production PBR path, generated HDR IBL, device-observed sampled
  PCF shadows, explicit exposure/ACES/sRGB color management, a pixel-backed
  `rgba16f` SSAO/bloom/tone-mapping stack, and camera choreography. It does not
  claim universal Three.js parity or final photoreal architectural fidelity.

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
- `environments.studio` and `environments.nightCinematic` generated HDR IBL
- `lights.ambient`, `lights.directional`, `lights.point`, and `lights.rect`
- `effects.fog`, `effects.bloom`, and `effects.ambientOcclusion`, with the latter
  two observed as pixel-backed `rgba16f` renderer passes
- mounted app diagnostics—not scene-plan diagnostics—published to the route
  evidence global, including native shadow bindings and actual pass names

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
inside an Aura3D scene. The current presentation is a bounded, stylized
architectural district tour: retained browser evidence proves the imported GLB
production PBR path, generated HDR environment lighting, rendered and sampled
shadow maps, explicit exposure/ACES/sRGB output, pixel-backed SSAO/bloom/tone
mapping, responsive composition, and camera choreography. Those facts do not
establish universal feature parity with Three.js or photoreal visualization.
