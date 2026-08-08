# ADR 0004 — Physical simulation is optional and Rapier owns the selected engine

- **Date:** 2026-08-08
- **Status:** accepted; supersedes the selection in `docs/architecture/physics-backend-decision.md`
- **Workstream:** final PRD WS-2.1 — physical simulation architecture

## Context

The 2026-08-05 decision correctly rejected a second backend and selected Cannon
while physical simulation was statically inside the lean game bundle. The final
PRD changes that topology: physical simulation is an optional, asynchronously
loaded package. Its payload must be measured and disclosed, but it no longer
competes with the core/product bundle or the explicitly non-physical arcade
runtime.

The current rerun uses Cannon 0.20.0 and Rapier 0.19.3. Both are exact locks.
Cannon's last npm modification is 2022-08-12; Rapier 0.19.3 was modified on
2026-08-08. The isolated eight-candidate lockfile has zero npm audit findings.

## The four R11 questions

1. **Does Three.js already solve this?** No. Three.js delegates simulation to
   external libraries.
2. **Does another mature ecosystem library solve this?** Yes. Rapier provides
   rigid bodies, colliders, joints, native CCD, queries, a kinematic character
   controller, a dynamic raycast vehicle controller, deterministic WASM state,
   and an off-main-thread-capable memory topology.
3. **Does this create lasting differentiation for Aura3D?** The solver does
   not. Aura3D's value is the typed asset/scene contract, semantic game APIs,
   diagnostics, evidence, and thin lifecycle-correct integration.
4. **Does this belong above or below the public API?** Rapier stays below a thin
   optional public adapter. Authored-unit arcade motion remains a separate
   non-physical public capability and imports no rigid-body engine.

## Decision

1. Select `@dimforge/rapier3d-compat@0.19.3` as the sole new
   physical-simulation engine. The smaller non-compat package was measured, but
   its npm entry imports raw `.wasm` and does not resolve in the supported Vite
   toolchain without application-specific loader configuration. The compat
   build is the official bundler-portable choice; its larger lazy payload is
   accepted only because it remains outside non-physical bundles.
2. Physical simulation becomes an optional asynchronously initialized package.
   It must not enter core, product, or arcade-only bundles.
3. Do not build a neutral Cannon/Rapier backend abstraction. The backends differ
   on CCD, controllers, worker topology, performance, disposal, and physical
   results; hiding those differences recreates the defect the prior dual backend
   produced.
4. Preserve the existing Cannon-backed public contract only through an explicit
   compatibility/migration window. It is not recommended for new applications
   and must not remain a second production owner at the final release.
5. Replace Aura3D's custom physical character, kinematic-world, and physical
   vehicle-controller ownership with thin Rapier adapters where the public
   contract remains honest. Keep deterministic authored-unit arcade vehicle and
   platformer motion under ADR 0003 because those are not physical simulation.
6. This selection changes initialization and physical semantics. If complete
   compatibility cannot be proven, the release version is major rather than
   pretending the change is a 1.6-compatible minor.

## Measured basis

| Dimension | Cannon 0.20.0 | Rapier 0.19.3 |
| --- | ---: | ---: |
| All-export/physics gzip | 26,893 B | 835,217 B compat; 610,241 B non-compat glue + separate WASM |
| Initialization in the Node harness | 21.61 ms | 64.87 ms WASM |
| 220 dynamic bodies | 1.651 ms/step | 0.295 ms/step |
| 1,000 dynamic bodies | 12.782 ms/step | 1.266 ms/step |
| 5,000 dynamic bodies | 402.291 ms/step | 4.081 ms/step |
| Five-box stack drift | 0.11052 | 0.00286 |
| Native 400 m/s CCD | tunnels | stops at y=0.149 |
| Character controller | absent; Aura-owned | constructed and disposed |
| Vehicle controller | constructed RaycastVehicle | constructed and disposed DynamicRayCastVehicleController |
| Worker-oriented state | no documented transferable path | WASM linear memory topology |

At the measured 220-body route ceiling Rapier uses about 1.8% of a 60 fps frame
and Cannon uses 9.9%. At 5,000 bodies Rapier remains within a frame while Cannon
does not. Rapier's download is much larger; making it optional and separately
cacheable is therefore part of the decision, not an implementation detail.

## Consequences

- Core/product/arcade bundles cannot statically import Rapier or Cannon.
- A physical app explicitly opts into asynchronous initialization and its
  downloaded WASM cost.
- Installed-package, browser cold/cached load, WASM compile/init, worker,
  disposal, repeated-mount, query, controller, and real-route proofs remain
  required before the adapter can be called release-ready.
- Cannon remains a migration source until consumers and tests move; it is not
  deleted by this ADR.
- Each displaced file still requires the six-point R8 deletion proof.
- Public docs must distinguish `arcade deterministic motion` from `physical
  simulation`.

## Rollback

Before publication, revert the optional adapter and retain the existing Cannon
compatibility package if Rapier fails browser lifecycle, packaging, or migration
proof. After publication, restore the prior package version and WASM asset as a
matched release; do not silently switch physical engines under the same version.

## Evidence

- `tests/reports/physics-backend-bakeoff/report.json`
- `tests/reports/external-candidate-package-audit.json`
- `tools/physics-backend-bakeoff/index.ts`
- `tools/external-candidate-package-audit/index.mjs`
- `docs/architecture/final-subsystem-ownership.md`
