# Aura3D Showcase: Aura3D Particle Lab

Technical showcase for the Aura3D particle library, typed catalog assets, mode controls, and runtime evidence.

The directory name is still `showcase-webgpu-particle-lab` for route stability,
but the public title and claims are demoted to Aura3D Particle Lab until native
WebGPU adapter, backend, compute dispatch, and pixel evidence are all proven.

## Remediation Status

- Classification: internal-diagnostic; demoted from WebGPU showcase status.
- Route health: `apps/showcase-webgpu-particle-lab/route-health.json`.
- Asset status: primary lab prop is the typed GLB
  `assets.showcaseParticleCore`.
- Route-primary status: blocked by clipped ParticleCore foreground evidence.
- Primitive status: floor, containment rings, field columns, gantry, and
  Aura3D particle emitters are within the stated lab role.
- Claim status: bounded to `effects.particles(...)` and `createAuraApp`
  diagnostics. It must not claim native WebGPU rendering or compute dispatch.

## Route

- App root: `apps/showcase-webgpu-particle-lab/`
- Browser route when served from repo root: `/apps/showcase-webgpu-particle-lab/`
- Entry point: `src/main.ts`
- Evidence global: `window.__AURA3D_SHOWCASE_WEBGPU_PARTICLE_LAB__`

## Controls

- Particle Mode: `Vortex`, `Fountain`, `Field`
- Density: 300 to 1200 requested density units

Controls rebuild the visible Aura3D scene through `createAuraApp().setScene(...)`.
The requested density is mapped to a bounded visual particle budget so the
reactor and particle motion stay readable.

## Systems Used

- Public Aura3D app mount through `createAuraApp`
- Typed `model(assets.showcaseParticleCore)` lab-set prop
- `effects.particles(...)` primary emitter
- Aura3D camera, lights, bounded particle controls, and timeline-driven scene updates
- Route evidence published on `window.__AURA3D_SHOWCASE_WEBGPU_PARTICLE_LAB__`

## Evidence Contract

The route publishes:

- `status`
- `appId`
- `frameCount`
- `capabilityState`
- `controls`
- `systems`
- `claimBoundary`
- `performance`
- `labSet`

## Claim Boundary

The route claims only what it actually does:

- Visible particles are produced by Aura3D `effects.particles(...)`.
- The reactor is a typed CLI-resolved asset loaded with `model(assets.showcaseParticleCore)`.
- The app frame loop, scene rebuilds, diagnostics, and screenshots are owned by Aura3D.
- It does not include a secondary custom renderer.

The route must not use CSS or DOM nodes for particle clouds, scanline overlays,
field frames, beams, or fake scene content. CSS is limited to layout and control
chrome; all visible particles come from Aura3D particle APIs.

Launch-ready acceptance remains blocked until route-primary foreground evidence is no longer clipped and native WebGPU claims have adapter, backend, dispatch, render, and pixel proof.
