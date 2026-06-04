# Rendering

Version: `1.0.0`

The public authoring layer is `createAuraApp` plus declarative scene helpers.
The runtime supplies defaults for canvas setup, pixel ratio, resize, render
loop, camera, lights, diagnostics, screenshots, and disposal.

Advanced renderer packages remain available for lower-level engine work, but
templates and agent docs should start with the small public agent API.

## Aura3D advantage

The authoring boundary is `@aura3d/engine` for normal app code and
`@aura3d/rendering` for lower-level renderer work. Agent templates should use
`createAuraApp`, scene helpers, and declared assets first. Direct renderer APIs
remain available when a package consumer intentionally needs framegraph,
material, render-target, postprocess, or backend-level control.

## Current Limits

Rendering docs must only claim features that are backed by package exports,
routes, tests, or reports. Aura3D does not claim a hidden prompt renderer, automatic
scene compiler, or universal asset substitution layer; unsupported backends,
missing canvas state, and missing assets remain explicit diagnostics.
