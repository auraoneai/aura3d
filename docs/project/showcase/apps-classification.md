# Aura3D Showcase Apps Classification

Date: 2026-07-28
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
| `/apps/instancing-performance/` | starter example | Instanced-draw performance walkthrough registered as a root starter route. |
| `/apps/controls-transform/` | internal diagnostic | Interactive transform-controls evidence route; retained for gizmo/controls proof, not public showcase material. |
| `/apps/lines-helpers/` | internal diagnostic | Screen-space fat lines and helper-object evidence route. |
| `/apps/shadow-cascade-evidence/` | internal diagnostic | Cascaded PCF shadow evidence route; supplies the foundation shadow rows. |
| `/apps/flagship-ibl-states/` | internal diagnostic | Linear-HDR IBL state evidence route for environment-lighting proof. |
| `/apps/hdr-render-target-check/` | internal diagnostic | HDR render-target readback check; retained float-target evidence. |

## Showcase Slate

| Route directory | Classification | Public use |
| --- | --- | --- |
| `showcase-product-configurator` | release-ready candidate | Public product configurator example with bounded material/configuration claims. |
| `showcase-material-asset-inspector` | removed-from-public-showcase | Retained typed-asset inspection tool; not promoted because Product Configurator already uses the same headphone hero. |
| `showcase-smart-city-control` | release-ready candidate | Public visual operations demo; not a real city simulation claim. |
| `showcase-cinematic-architecture` | release-ready candidate | Public architecture presentation with bounded rendering claims. |
| `showcase-digital-twin-ops` | release-ready candidate | Public visual ops/dashboard demo; not a real digital-twin integration claim. |
| `showcase-blockfall-reactor` | prototype-blocked | Typed cabinet and mounted falling-block mechanics are retained technical proof; cabinet/playfield reconstruction and hash-bound independent review are pending. |
| `showcase-racing-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-platformer-game-layer-proof` | game-layer diagnostic | Retained geometry-contract/debug harness; not public showcase material. |
| `showcase-data-galaxy` | internal diagnostic | Retained diagnostic route; abstract/data claims are not public showcase claims. |
| `showcase-webgpu-particle-lab` | internal diagnostic | Retained diagnostic route; native WebGPU is not claimed. |
| `showcase-skyline-runner` | prototype-blocked | Typed character/world, mesh-derived surfaces, mounted gameplay, and route-local challenge evidence remain bounded technical proof; the visual rebuild and current independent review are pending. |
| `showcase-turbo-drift-circuit` | prototype-blocked | Typed car/track topology, mounted racing state, and route-local opponent AI remain bounded technical proof; the visual rebuild and current independent review are pending. |
| `showcase-index` | index route | Catalog/index route only; not deploy-asset or route-primary checked as a 3D app. |

## Retained Engine Evidence

The 51 rows added below are Three.js-parity and product-surface routes restored from git history
(they were deleted by the docs/examples consolidation while 52 browser specs still drove them).
They are labelled `retained engine evidence` deliberately: that is the most restrictive useful
label, and under the Policy section below it cannot be presented as a public showcase example.
Promoting any of them to `starter example`, `library demo`, or `release-ready candidate` is a
separate decision that requires passing the current evidence gates — it is not implied here.

| Route directory | Classification |
| --- | --- |
| `advanced-examples-gallery` | retained lower-level engine evidence |
| `loader-compression` | retained engine evidence — CurrentRoutes Loader Compression |
| `loader-instancing` | retained engine evidence — CurrentRoutes Loader Instancing |
| `loader-ktx2` | retained engine evidence — CurrentRoutes Loader KTX2 |
| `materials-transmission` | retained engine evidence — CurrentRoutes Materials Transmission |
| `animation-keyframes` | retained engine evidence — CurrentRoutes Animation Keyframes |
| `animation-multiple` | retained engine evidence — CurrentRoutes Animation Multiple |
| `animation-studio-pro` | retained engine evidence — Animation Studio Pro |
| `animation-walk` | retained engine evidence — CurrentRoutes Animation Walk |
| `architecture-viewer` | retained engine evidence — Production Architecture Viewer |
| `asset-inspector` | retained engine evidence — Production Asset Inspector |
| `asset-lab` | retained engine evidence — Asset Lab |
| `asset-studio-pro` | retained engine evidence — Asset Studio Pro |
| `automotive-configurator` | retained engine evidence — Production Automotive Configurator |
| `character-viewer` | retained engine evidence — Production Character Viewer |
| `cinematic-postprocess` | retained engine evidence — Production Cinematic Postprocess |
| `controls-orbit` | retained engine evidence — CurrentRoutes Orbit Controls |
| `decals` | retained engine evidence — CurrentRoutes Decals |
| `editor` | retained engine evidence — Aura3D Editor |
| `flagship-viewer` | retained engine evidence — CurrentRoutes Flagship Viewer |
| `game-lab` | retained engine evidence — Game Lab |
| `interactive-picking` | retained engine evidence — CurrentRoutes Interactive Picking |
| `interactive-showcase-pro` | retained engine evidence — Interactive Showcase Pro |
| `large-scene-lab` | retained engine evidence — Production Large Scene Lab |
| `lights-spotlight` | retained engine evidence — CurrentRoutes Lights Spotlight |
| `loader-material-extensions` | retained engine evidence — CurrentRoutes Loader Material Extensions |
| `material-lab` | retained engine evidence — Material Lab |
| `material-studio` | retained engine evidence — Production Material Studio |
| `material-studio-pro` | retained engine evidence — Material Studio Pro |
| `parallax-barrier` | retained engine evidence — CurrentRoutes Parallax Barrier |
| `postprocessing-bloom` | retained engine evidence — CurrentRoutes Postprocessing Bloom |
| `product-configurator` | retained engine evidence — Production Product Configurator |
| `product-studio` | retained engine evidence — Product Studio Legacy |
| `product-studio-pro` | retained engine evidence — Product Studio Pro |
| `public-scene` | retained engine evidence — Public Scene |
| `regression-animation-keyframes` | retained engine evidence — RuntimeParity Animation Keyframes |
| `scene-lab` | retained engine evidence — Scene Lab |
| `scene-studio-pro` | retained engine evidence — Scene Studio Pro |
| `shadowmap-viewer` | retained engine evidence — CurrentRoutes Shadowmap Viewer |
| `skinning-additive` | retained engine evidence — CurrentRoutes Skinning Additive |
| `skinning-blending` | retained engine evidence — CurrentRoutes Skinning Blending |
| `skinning-ik` | retained engine evidence — Robot Expressive IK |
| `skinning-morph` | retained engine evidence — CurrentRoutes Skinning Morph |
| `stereo-effects` | retained engine evidence — CurrentRoutes Stereo Effects |
| `three-compat-animation-studio-pro` | retained engine evidence |
| `three-compat-asset-studio-pro` | retained engine evidence |
| `three-compat-controls-lab` | retained engine evidence |
| `three-compat-large-scene-lab` | retained engine evidence |
| `three-compat-material-studio-pro` | retained engine evidence |
| `three-compat-postprocess-studio-pro` | retained engine evidence |
| `three-compat-product-studio-pro` | retained engine evidence |
| `three-compat-scene-studio-pro` | retained engine evidence |
| `three-compat-shader-lab-pro` | retained engine evidence |
| `three-compat-threejs-migration-lab` | retained engine evidence |
| `threejs-parity-lab` | retained engine evidence — Production Three.js Parity Lab |
| `webgpu-lab` | retained engine evidence — Production WebGPU Lab |
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
| `common` | support-only shared code; not a route. Provides `src/runtime.ts` and `src/styles.css` to 25 `apps/*` routes and has no `index.html`. |

These routes may remain only when their READMEs and route labels name the exact
package/path they prove. They must not be treated as starter templates or root
API proof unless they import only public root APIs and pass current evidence
gates.

## Policy

Marketing may embed a route only when it labels the route with the correct
classification. `prototype`, `prototype-blocked`, `internal diagnostic`, and
`blocked` routes cannot be presented as public showcase examples. The configured
route-library inventory currently contains four candidate entries, two internal
diagnostics, two game-layer diagnostic harnesses, and three prototype-blocked
routes; classification and current promotion eligibility are separate.
