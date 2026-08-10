# Aura3D 1.6.0 Release Notes

> Historical release record. The current source release candidate is 2.0.0;
> see `aura3d-200-release-notes.md`.

Date: 2026-08-08
Status: release candidate; npm, GitHub, tag, and production deployment pending

Aura3D 1.6.0 is an architecture, compatibility, bundle-entry, and evidence
release. It keeps the compatibility-heavy `@aura3d/engine` root while adding
recommended lean entries, consolidates production physics on one solver path,
and makes selected parity and browser claims fail closed when their underlying
evidence is missing or stale.

## Highlights

- New `@aura3d/engine/lean`, `@aura3d/engine/lean-product`, and
  `@aura3d/engine/lean-game` entries give new applications workload-specific
  paths without removing the broad compatibility root.
- The frozen bundle scenarios measure the recommended entries at **0.582x,
  1.248x, and 0.832x** their equivalent Three.js stacks, within the unchanged
  **1.25x, 1.25x, and 1.50x** limits. These are build-scenario measurements,
  not universal runtime-performance claims.
- Production physics now has one solver owner, `cannon-es`. The second
  `aura-js` implementation and its silent divergence paths are removed.
- The production backend now defaults to ten solver iterations, constructs a
  true capsule, and respects body rotation in ray and sphere queries.
- Racing and platformer motion delegate to shared runtime owners. Racing remains
  authored-unit arcade motion; this release does not claim a physical tyre
  model or production vehicle dynamics.
- Published 1.5.2 input action-binding fixture exports remain available through
  deprecated compatibility aliases, preventing an accidental minor-version
  surface removal.
- Public API documentation is regenerated for 31 public package entrypoints
  across the 26-package release set and 1,013 export declarations.

## Historical browser and comparison evidence

The selected historical `three@0.165.0` example inventory contains 54 rows, all
matched, with no high-priority row open under that frozen protocol. Seven named
same-asset animation comparisons pass, and the 100-reload lifecycle fixture
reports no tracked-resource leak. These results are regression history only.
They do not establish current parity with the locked `three@0.185.1` baseline,
current WebGPU/TSL/node-material behavior, or the current companion ecosystem.
The current head-to-head program remains incomplete under
`1.6-FINAL-PRD-Finishes.md`; Aura3D does not claim current broad Three.js
replacement or ecosystem superiority.

Nine public evidence routes are restored and included in the website build:

- glTF material variants;
- OBJ loading;
- texture anisotropy;
- depth/outline postprocessing;
- trackball controls;
- indexed and array geometry draw ranges;
- interactive picking;
- multiple camera views; and
- injected WebXR session/input semantics.

The WebXR route uses an explanatory Canvas2D preview around an injected session
contract. It is not physical-headset, native-WebXR-renderer, or hardware proof.

## Showcase status

Product Configurator, Smart City Control, Cinematic Architecture, and Digital
Twin Operations have current automated candidate evidence and await a recorded
human visual verdict. Blockfall Reactor, Skyline Runner, and Turbo Drift Circuit
remain `prototype-blocked` and cannot be promoted. Aura Clash remains a
development showcase. Package publication does not change those classifications.

## Compatibility and migration

No package is removed. The broad root stays available, while new apps should
prefer the lean entry matching their workload. The intentional physics contract
changes and replacements are listed in `MIGRATION-1.6.md`; the most important is
that `backend: "aura-js"` is no longer valid because that backend no longer
exists.

## Verification and release evidence

Before publication, the release requires two serial green runs of the complete
suite from the same clean commit, package provenance and tarball checks, registry
version-and-integrity verification for every public package, an exact Git tag and
GitHub release, production website deployment, and live install/route checks.
The canonical status is maintained in:

- `Aura3D-1.6-Replatform-PRD.md`;
- `docs/project/release/release-checklist.md`;
- `docs/project/verification-evidence.md`; and
- `HANDOFF-1.6.md`.

Do not treat this candidate document as proof that a pending publish or hosted
deployment has occurred. Post-release receipts will be added only after the
registry, GitHub, and production-origin checks pass.
