# Three.js Parity Status

Status: current route evidence is scoped to the consolidated local registry.

Aura3D no longer keeps a broad backlog of local route examples under `examples/` or older `apps/*` demo folders. The only local app routes that may appear in the root registry are:

- `apps/advanced-examples-gallery/`
- `apps/wow-tokyo-keyframes/`
- `apps/wow-robot-expressive-rig/`
- `apps/wow-concept-car-cinema/`
- `apps/wow-damaged-helmet-pbr-detail/`
- `apps/wow-antique-camera-viewer/`
- `apps/wow-duck-prop-studio/`
- `apps/wow-cesium-milk-truck-viewer/`
- `apps/wow-soldier-animation-viewer/`
- `apps/wow-boombox-texture-lab/`
- `apps/wow-avocado-pbr-study/`
- `apps/wow-clearcoat-material-sample/`
- `apps/wow-sheen-material-grid/`
- `apps/wow-standard-animated-cube/`
- `apps/wow-standard-product-camera/`
- `apps/wow-standard-material-spheres/`
- `apps/wow-simple-triangle/`
- `apps/wow-simple-transforms/`
- `apps/wow-simple-material-lighting/`
- `apps/wow-simple-points-lines/`
- `apps/wow-additional-variant-product/`
- `apps/wow-additional-transmission-sample/`
- `apps/wow-additional-cesium-man-animation/`
- `apps/wow-webgpu-triangle/`
- `apps/wow-webgpu-render-target/`
- `apps/wow-webgpu-pbr-asset/`
- `apps/wow-webgpu-product-viewer/`
- `apps/wow-webgpu-instancing/`
- `apps/wow-webgpu-compute-particles/`

`apps/wow-common/` is shared route support code, not a standalone route.

## Current Evidence

- Root registry: `index.html`
- Route-health browser gate: `tests/browser/current-routes-route-health.spec.ts`
- Route-health generator: `tools/current-routes-route-health/index.ts`
- Advanced gallery browser gate: `tests/browser/advanced-examples-gallery.spec.ts`
- Advanced gallery metadata: `apps/advanced-examples-gallery/src/metadata.ts`
- Wow showcase browser gate: `tests/browser/wow-showcase-screenshots.spec.ts`
- Legacy prune gate: `tools/current-routes-legacy-prune/index.ts`

The active route-health gate discovers links from `index.html` and expects exactly the accepted advanced-gallery hash routes plus the allowed `wow-*` routes. Historical `Production`, `RuntimeParity`, `CurrentRoutes`, and unversioned `examples/` routes are intentionally pruned from the local registry.

## Claim Boundary

The remaining Three.js parity docs and package tests describe package-level compatibility work. They do not imply that deleted local example routes are still supported or allowed to return to the registry.

Any new local visual route must be added to the consolidated root registry, covered by route-health evidence, and documented as part of either the advanced gallery or a new explicitly approved route family.
