# Rendering Proof Required

Use this before making Aura3D rendering, material, PBR, HDR, WebGPU,
postprocess, animation, particle, or visual-quality claims.

Read `llms.txt`, `docs/agents/claims-and-boundaries.md`, and
`docs/rendering/material-matrix.md` first.

## Core Rule

A feature is public root proof only when a browser test imports from
`@aura3d/engine`, mounts through `createAuraApp(...)`, captures rendered pixels,
and verifies the exact claim. Renderer-internal tests are useful, but they do
not prove root safe API behavior.

## Claim Labels

Every rendering claim must use one of these labels:

- `createAuraApp` root safe API;
- `production-runtime`;
- `rendering` internals;
- CLI asset pipeline;
- template-only scaffold;
- prototype;
- roadmap.

If the evidence is not root-only browser evidence, do not phrase it as a root
`createAuraApp` public capability.

## Required Evidence By Claim

| Claim | Required evidence |
| --- | --- |
| Typed GLB rendering | Public import, typed `assets.x`, screenshot, nonblank pixels, route diagnostics. |
| Texture/material rendering | Material/texture metadata plus visible screenshot difference or material-region pixel proof. |
| PBR parity | Root-only material feature tests for metallic/roughness, normal, emissive, alpha, environment, and shadows as claimed. |
| HDR/IBL | Typed or durable HDR/environment source, runtime resource diagnostics, browser pixel delta between environments. |
| Shadows | Shadow receiver/occluder setup, on/off pixel delta in receiver region, diagnostics proving shadow resources were sampled. |
| Postprocess | Before/after route pixels, active pass diagnostics, and no CSS/canvas stand-in. |
| WebGPU | Adapter, backend, dispatch/workgroup/native submission fields, fallback state, rendered pixels, and hardware capability evidence. |
| Skinned animation | Same subject changes pose over time; pixel delta is in the character region, not just camera/UI. |
| Morph targets | Morph target names/weights plus pixel or mesh-state proof through the claimed path. |
| Particles | Aura particle API use, mode/density telemetry, rendered pixel changes, no DOM/CSS fake particles. |

## Validation App Pattern

Root rendering gaps should be proved in focused validation apps before showcase
routes are rebuilt. A render-quality validation app must:

- import only public `@aura3d/engine` APIs and generated typed assets;
- render typed GLB assets and materials through `createAuraApp`;
- include diagnostics for backend, fallback state, draw calls, material and
  texture activity;
- capture screenshots under `tests/reports/`;
- include inspected images and pass/fail notes.

## Forbidden Evidence

Do not use these as proof for public rendering claims:

- screenshots that are blank, cropped, hidden, tiny, or unreadable;
- PNG file size or generic color buckets without subject-region checks;
- renderer-internal imports as root API proof;
- material helper names without visible pixels;
- CSS gradients, DOM particles, canvas overlays, or decorative backgrounds;
- route-health JSON that is stale or contradicts current source;
- launch evidence with temp asset provenance.

When evidence is partial, keep the claim partial. Do not upgrade a route to
flagship, PBR, HD, HDR, WebGPU, skinned-animation, or production-quality wording
until the pixels and diagnostics prove it.

Do not infer performance parity from this visual evidence. Comparative
performance wording additionally requires current like-for-like frame-time,
draw-call, memory/lifecycle, and environment reports; an inventory match is not
a benchmark.
