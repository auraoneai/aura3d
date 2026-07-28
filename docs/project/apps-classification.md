# Apps Classification

Date: 2026-07-27
Status: current classification policy

App classification controls what public copy may say. A route can be useful and
still not be a public release candidate.

## Classification Labels

| Label | Meaning |
| --- | --- |
| `starter example` | Teaches one public root API pattern with minimal claims. |
| `library demo` | Demonstrates a package/API surface; visual quality claims stay scoped. |
| `diagnostic` | Helps inspect assets, rendering, telemetry, or evidence. |
| `prototype` | Explores an idea; not public release material. |
| `release-ready candidate` | Passed current public showcase gates and visual review, but still keeps bounded claims. |
| `internal diagnostic` | Useful retained evidence route; not public showcase material. |
| `prototype-blocked` | Useful prototype route with exact blockers; not public showcase material. |
| `index route` | Showcase catalog/index route; not a deployable 3D showcase app. |
| `blocked` | Must not be promoted until named blockers close. |

## Starter Registry

| Route | Classification | Public use |
| --- | --- | --- |
| `/apps/hello-world-typed-asset/` | starter example | Typed asset refs with `model(assets.robot)` and `lights.studio()`. |
| `/apps/material-lighting/` | starter example | Basic material and light helpers where supported by the root API. |
| `/apps/camera-path/` | starter example | Camera path, timeline, lighting, and effects helpers. |

## Showcase Slate

| Route directory | Classification | Public use |
| --- | --- | --- |
| `showcase-product-configurator` | release-ready candidate | Public product configurator example with bounded material/configuration claims. |
| `showcase-material-asset-inspector` | removed-from-public-showcase | Retained typed-asset inspection tool; not promoted because Product Configurator already uses the same headphone hero. |
| `showcase-smart-city-control` | release-ready candidate | Public visual operations demo; not a real city simulation claim. |
| `showcase-cinematic-architecture` | release-ready candidate | Public architecture presentation with bounded rendering claims. |
| `showcase-digital-twin-ops` | release-ready candidate | Public visual ops/dashboard demo; not a real digital-twin integration claim. |
| `showcase-blockfall-reactor` | release-ready candidate | Public bounded falling-block route with retained gameplay proof. |
| `showcase-public-racing-presentation-proof` | removed-from-public-showcase | Superseded by Turbo Drift Circuit; retained as historical certification evidence. |
| `showcase-public-platformer-presentation-proof` | removed-from-public-showcase | Superseded by Skyline Runner; retained only as inspectable historical certification evidence. |
| `showcase-racing-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-platformer-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-data-galaxy` | internal diagnostic | Retained diagnostic route; abstract/data claims are not public showcase claims. |
| `showcase-webgpu-particle-lab` | internal diagnostic | Retained diagnostic route; native WebGPU is not claimed. |
| `showcase-skyline-runner` | blocked | Retains bounded mesh-derived surface, typed character/world, and gameplay evidence; public-ready wording is held while the required retained racing visual-QA unit gate is non-passing and world-level proof remains fixture-bounded. |
| `showcase-turbo-drift-circuit` | blocked | Retains bounded topology, typed car/track, and gameplay evidence; public-ready wording is held while the required retained racing visual-QA unit gate is non-passing. |
| `showcase-index` | index route | Catalog/index route only; not deploy-asset or route-primary checked as a 3D app. |

## Retained Engine Evidence

| Route directory | Classification |
| --- | --- |
| `advanced-examples-gallery` | retained lower-level engine evidence |
| `v9-advanced-examples-gallery` | retained legacy gallery evidence |
| `animation-studio-web` | local development control surface |
| `aura-clash-showcase` | development showcase |
| `showcase-asset-audition` | internal asset diagnostic |
| `showcase-orbital-defense` | blocked primitive-only prototype |
| `world-war-x-showcase` | blocked legacy showcase |
| `wow-additional-cesium-man-animation` | retained engine evidence |
| `wow-additional-transmission-sample` | retained engine evidence |
| `wow-additional-variant-product` | retained engine evidence |
| `wow-antique-camera-viewer` | retained engine evidence |
| `wow-avocado-pbr-study` | retained engine evidence |
| `wow-boombox-texture-lab` | retained engine evidence |
| `wow-cesium-milk-truck-viewer` | retained engine evidence |
| `wow-clearcoat-material-sample` | retained engine evidence |
| `wow-concept-car-cinema` | retained engine evidence |
| `wow-damaged-helmet-pbr-detail` | retained engine evidence |
| `wow-duck-prop-studio` | retained engine evidence |
| `wow-robot-expressive-rig` | retained engine evidence |
| `wow-sheen-material-grid` | retained engine evidence |
| `wow-simple-material-lighting` | retained engine evidence |
| `wow-simple-points-lines` | retained engine evidence |
| `wow-simple-transforms` | retained engine evidence |
| `wow-simple-triangle` | retained engine evidence |
| `wow-soldier-animation-viewer` | retained engine evidence |
| `wow-standard-animated-cube` | retained engine evidence |
| `wow-standard-material-spheres` | retained engine evidence |
| `wow-standard-product-camera` | retained engine evidence |
| `wow-tokyo-keyframes` | retained engine evidence |
| `wow-webgpu-compute-particles` | retained lower-level WebGPU evidence |
| `wow-webgpu-instancing` | retained lower-level WebGPU evidence |
| `wow-webgpu-pbr-asset` | retained lower-level WebGPU evidence |
| `wow-webgpu-product-viewer` | retained lower-level WebGPU evidence |
| `wow-webgpu-render-target` | retained lower-level WebGPU evidence |
| `wow-webgpu-triangle` | retained lower-level WebGPU evidence |
| `wow-common` | support-only shared code; not a route |

These routes may remain only when their READMEs and route labels name the exact
package/path they prove. They must not be treated as starter templates or root
API proof unless they import only public root APIs and pass current evidence
gates.

## Policy

Marketing may embed a route only when it labels the route with the correct
classification. `prototype`, `prototype-blocked`, `internal diagnostic`, and
`blocked` routes cannot be presented as public showcase examples. The configured
route-library inventory still contains seven candidate entries, two internal
diagnostics, two game-layer diagnostic harnesses, and zero prototype-blocked
routes; classification and current promotion eligibility are separate.
