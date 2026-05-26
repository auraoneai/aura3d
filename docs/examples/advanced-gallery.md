# Advanced Examples Gallery

Version: 1.0.0

The advanced examples gallery is the current proof surface for the production-grade showcase work that was previously tracked in the root execution PRD. The durable source lives in `apps/advanced-examples-gallery/`, `tools/advanced-gallery-*`, `tools/advanced-gallery-assets/`, and the ignored generated local evidence directory `tests/reports/advanced-examples-gallery/`.

## What Was Created

The gallery source metadata currently defines ten accepted advanced routes. That accepted state is reusable only after the ignored full-gallery evidence has been regenerated and the review/audit reports pass for the same artifacts.

| Route id | Feature area | Primary source owners |
|---|---|---|
| `product-configurator` | Texture-backed concept-car configurator with variant, lighting, turntable, and exploded-view controls. | `productConfiguratorScene.ts`, `productConfiguratorPolicy.ts`, `productConfiguratorLighting.ts`, `productConfiguratorVisualCleanup.ts`, authored asset metadata. |
| `data-galaxy` | Dense data-particle visualization with formations, attractors, streams, arcs, and deep-space staging. | `dataGalaxyScene.ts`, `dataGalaxyBudgets.ts`, `dataGalaxyFocalSystem.ts`, `dataGalaxyEvidence.ts`, Data Galaxy asset generators. |
| `reactor-post` | Cinematic command-center postprocess route with color, tone, vignette, sharpen, FXAA-style, and emissive evidence. | `reactorPostScene.ts`, `showcaseShaders.ts`, renderer postprocess diagnostics. |
| `digital-twin` | Factory digital twin with deterministic overlays, zones, telemetry, camera modes, and route instrumentation. | `proceduralRouteScenes.ts`, `sceneBuilders.ts`, authored asset metadata. |
| `robotics-lab` | Robotics training lab with imported animated characters, procedural lab context, and animation evidence. | `roboticsLabEvidence.ts`, `authoredLayer.ts`, route scene builders. |
| `smart-city` | Animated smart-city district with traffic/data overlays, flythrough state, and performance telemetry. | `smartCityEvidence.ts`, `proceduralRouteScenes.ts`, smart-city asset generator. |
| `fog-cathedral` | Atmospheric architecture route with Sponza/cathedral staging, haze, dust, and light-shaft helpers. | `fogCathedralEvidence.ts`, `rendererEnvironmentFogEvidence.ts`, fog asset generator. |
| `physics-playground` | Deterministic manipulation testbed using `@aura3d/physics` rigid bodies and route-level interaction. | `physicsSimulation.ts`, `proceduralRouteScenes.ts`, physics asset generator. |
| `water-lab` | Interactive procedural water scene with ripple controls, marina props, and route instrumentation. | `waterSystems.ts`, `proceduralRouteScenes.ts`, marina/water asset generators. |
| `ocean-observatory` | Large animated ocean/deck showcase with drones, horizon atmosphere, and wave controls. | `waterSystems.ts`, `proceduralRouteScenes.ts`, ocean observatory asset generators. |

Each route has metadata in `apps/advanced-examples-gallery/src/metadata.ts` that names the Three.js-style reference category, controls, systems used, acceptance criteria, known gaps, screenshot path, and review hash.

## Evidence Commands

Run the full evidence lane after changing gallery source, route composition, authored assets, renderer output, screenshots, review code, or audit code:

```sh
pnpm advanced-gallery
pnpm advanced-gallery:review
pnpm advanced-gallery:audit
```

The combined gate is:

```sh
pnpm advanced-gallery:pipeline
```

The `threejs-parity:advanced-gallery:*` scripts are aliases for the same lane.

## Evidence Artifacts

The gallery writes local generated evidence under:

```text
tests/reports/advanced-examples-gallery/
```

Important artifacts include:

- route screenshots such as `tests/reports/advanced-examples-gallery/product-configurator.png`, `tests/reports/advanced-examples-gallery/data-galaxy.png`, and `tests/reports/advanced-examples-gallery/ocean-observatory.png`;
- per-route runtime JSON reports such as `tests/reports/advanced-examples-gallery/product-configurator.json`;
- `tests/reports/advanced-examples-gallery/current-contact-sheet.png`;
- `tests/reports/advanced-examples-gallery/visual-review-report.json`;
- `tests/reports/advanced-examples-gallery/reusable-systems-disclosure-audit.json` from `tools/advanced-gallery-report-audit/index.ts`.

`tests/reports/` is ignored by git. A clean checkout may not contain these files and must regenerate them before reusing accepted-gallery wording.

## Evidence Conditions

Accepted-gallery wording requires all of these to be true for the same generated report set:

- the route has a current browser screenshot;
- the screenshot hash in route metadata matches the current artifact;
- human review metadata exists for that exact screenshot;
- route runtime JSON exists for the current full-gallery run;
- the visual review gate accepts all ten routes;
- the structural audit finds zero blockers and zero warnings for the current route reports;
- unsupported boundaries are disclosed in route metadata and reports.

Smoke tests, object counts, changed hashes, browser metrics, or generated assets alone do not prove acceptance.

## Capability Boundaries

The gallery uses real A3D WebGL2 rendering, authored GLB layers, render items, material paths, animation mixers, route controls, runtime instrumentation, screenshot capture, review tooling, and audit tooling.

It does not claim:

- native GPGPU water or FFT ocean simulation;
- public GPU-compute particle simulation;
- full effects-composer parity for every postprocess pass;
- true volumetric raymarching;
- full triangle-level picking over authored GLB renderables;
- mesh-derived physics colliders or articulated robot dynamics;
- broad large-scene performance superiority from one showcase route.

If a route uses a helper approximation, the route metadata and audit report must say so.

## Source Ownership

Use this source map before changing the gallery:

- Route composition: `apps/advanced-examples-gallery/src/proceduralRouteScenes.ts`, route-specific modules, and `sceneBuilders.ts`.
- Authored GLB activation: `apps/advanced-examples-gallery/src/authoredLayer.ts`, `authoredAssets.ts`, and `authoredLayerPolicies.ts`.
- Route metadata and accepted evidence hashes: `apps/advanced-examples-gallery/src/metadata.ts`.
- Browser capture: `tests/browser/advanced-examples-gallery.spec.ts`.
- Visual review: `tools/advanced-gallery-visual-review/index.ts`.
- Structural audit: `tools/advanced-gallery-report-audit/index.ts`.
- Generated support assets: `tools/advanced-gallery-assets/*` and `fixtures/advanced-gallery/*`.

Keep source fixes separate from evidence promotion. A route should not be marked accepted until the source, screenshot, metadata, review, and audit all agree.
