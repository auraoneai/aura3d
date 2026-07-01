# Aura3D Showcase Copy Review

Date: 2026-06-18

Scope reviewed:

- `Fixed-Needed-PRD.md`
- `llms.txt`
- `docs/project/showcase-launch-evidence.json`
- `apps/showcase-index/src/main.ts`
- `apps/showcase-*/README.md`
- `apps/showcase-*/route-health.json`
- `apps/showcase-*/src/main.ts` for classification only
- `tests/browser/showcase-library.spec.ts`

## Result

Status: remediation applied; not accepted for public launch.

The showcase slate has local route/build evidence, typed asset usage in most
routes, and browser evidence globals. That is not the same as public showcase
readiness. The PRD requires route-health declarations, screenshot quality
review, primitive budgets, gameplay gates, and claim boundaries before any route
is promoted.

This review therefore demotes overclaimed routes and records the current
evidence boundary:

- Local route boot, screenshots, and deploy checks may be cited as local smoke
  evidence only.
- Public claims must match `createAuraApp` root safe API evidence.
- No route may claim production rendering, native WebGPU, production game kits,
  skinned animation pixels, PBR parity, real facility data, GIS fidelity, or
  launch readiness without matching route-health and pixel-backed tests.

## Route Classification

| Route | Classification | Public showcase | Evidence boundary |
| --- | --- | --- | --- |
| `showcase-product-configurator` | Candidate | Yes, bounded | Typed headphones GLB; exploded internals are conceptual primitive proxies. |
| `showcase-material-asset-inspector` | Diagnostic candidate | Yes, bounded | Typed headphones metadata route; no external asset editing or full PBR parity claim. |
| `showcase-blockfall-reactor` | Candidate | Yes, bounded | Best current game candidate; rules are route-local, not a reusable falling-block kit. |
| `showcase-cinematic-architecture` | Prototype | No | Typed tea-house staging; heavy primitive set dressing and postprocess still need pixel proof. |
| `showcase-data-galaxy` | Rebuild required | No | Abstract particle/data prototype; data mapping is not yet meaningful enough for flagship status. |
| `showcase-smart-city-control` | Prototype | No | Procedural city with typed supporting vehicles; no GIS or traffic-fidelity claim. |
| `showcase-digital-twin-ops` | Rebuild required | No | Sample deterministic telemetry with typed props; no PLC, real facility, or safety claim. |
| `showcase-webgpu-particle-lab` | Prototype | No | Demoted to Aura3D Particle Lab; no native WebGPU adapter/backend/dispatch proof. |
| `showcase-skyline-runner` | Prototype | No | Route-local platformer rules; no production kit or pixel-backed skinned animation claim. |
| `showcase-turbo-drift-circuit` | Prototype | No | Route-local time trial; no production racing physics or racing kit claim. |
| `showcase-orbital-defense` | Blocked | No | Primitive-only primary subject; remove from public showcase until rebuilt with typed assets. |

## Claim Boundaries

Accepted scoped wording:

- "Local showcase route" for any route with a published evidence global and
  successful local smoke evidence.
- "Candidate" only for Product Configurator, Material Asset Inspector, and
  Blockfall Reactor, with the limitations in their route-health JSON files.
- "Prototype" or "rebuild required" for routes whose primary experience still
  relies on procedural primary scenes, weak data mapping, route-local game
  systems, or unproven renderer features.
- "Typed asset" only where source uses `model(assets.<name>)` from generated
  `src/aura-assets.ts` metadata.
- "Aura3D Particle Lab" for `showcase-webgpu-particle-lab` until native WebGPU
  evidence exists.
- "Static deploy check" for local `check-deploy --dist` proof, not hosted
  production deployment.

Rejected wording:

- "Launch-ready", "production-ready", "world-class", "Three.js quality",
  "film-quality", or "commercial game engine".
- "Native WebGPU" for the particle lab.
- "Skinned animation rendered in screenshots" for Skyline Runner.
- "Production racing/platformer/falling-block kit" for route-local game logic.
- "Real GIS", "real traffic simulation", "PLC integration", or "facility
  safety logic" for city and digital-twin routes.
- "Asset-backed public showcase" for Orbital Defense.

## Evidence Files

- Route-health declarations:
  `apps/showcase-*/route-health.json`
- Route index metadata:
  `apps/showcase-index/src/main.ts`
- Static remediation summary:
  `docs/project/showcase-launch-evidence.json`
- Browser smoke evidence command:
  `pnpm exec playwright test tests/browser/showcase-library.spec.ts --reporter=line`
- Static build/deploy command:
  `node tools/showcase-library/build-and-check.mjs`
- Asset validation command:
  `npx @aura3d/cli@latest assets validate --no-placeholders --require-license`

## Remaining Launch Gaps

- Route-health JSON is now present, but release tests still need to fail when
  route claims exceed those declarations.
- Desktop and mobile screenshots are referenced as evidence outputs, but this
  pass did not regenerate or visually approve them.
- Game routes still need stronger genre gates: line clear/replay for Blockfall,
  platformer completion/fail/reset for Skyline, and checkpoint/lap validation
  for Turbo.
- Native WebGPU, production renderer, skinned animation, and reusable game kits
  remain blocked on library workstream fixes in the PRD.
