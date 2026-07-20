# Apps Classification

Date: 2026-07-19
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
| `showcase-material-asset-inspector` | release-ready candidate | Public material/asset inspection demo with bounded root material claims. |
| `showcase-smart-city-control` | release-ready candidate | Public visual operations demo; not a real city simulation claim. |
| `showcase-cinematic-architecture` | release-ready candidate | Public architecture presentation with bounded rendering claims. |
| `showcase-digital-twin-ops` | release-ready candidate | Public visual ops/dashboard demo; not a real digital-twin integration claim. |
| `showcase-blockfall-reactor` | release-ready candidate | Public bounded falling-block route with retained gameplay proof. |
| `showcase-public-racing-presentation-proof` | release-ready candidate | Public bounded racing presentation proof with certified retained geometry and pair evidence. |
| `showcase-public-platformer-presentation-proof` | release-ready candidate | Public bounded platformer presentation proof with certified retained geometry and pair evidence. |
| `showcase-racing-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-platformer-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-data-galaxy` | internal diagnostic | Retained diagnostic route; abstract/data claims are not public showcase claims. |
| `showcase-webgpu-particle-lab` | internal diagnostic | Retained diagnostic route; native WebGPU is not claimed. |
| `showcase-skyline-runner` | release-ready candidate | Public bounded platformer presentation with certified mesh-derived surfaces, typed character/world binding, gameplay proof, and visual QA. |
| `showcase-turbo-drift-circuit` | release-ready candidate | Public bounded racing presentation with certified topology, typed car/track binding, gameplay proof, and visual QA. |
| `showcase-index` | index route | Catalog/index route only; not deploy-asset or route-primary checked as a 3D app. |

## Retained Engine Evidence

Older `wow-*` and advanced routes may remain as retained engine evidence only
when their READMEs and route labels name the exact package/path they prove. They
must not be treated as starter templates or root API proof unless they import
only public root APIs and pass current evidence gates.

## Policy

Marketing may embed a route only when it labels the route with the correct
classification. `prototype`, `prototype-blocked`, `internal diagnostic`, and
`blocked` routes cannot be presented as public showcase examples.
