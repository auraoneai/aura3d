# Q-02-2 — environments relocation + shadows/CascadeHysteresis.ts decision

**Status:** OPEN (environment files resolved by lane 15 — see below; CascadeHysteresis decision still with lane 02)
**Requesting lane:** 15 (PRD-15 Phase 6, honest packages T6.5)
**Owning lane:** 02 (PRD-02, rendering environment/PMREM surface)

## Request (per PRD request ledger)

1. Relocate `packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts`
   into `packages/rendering/src/environment/` — or declare them kept, in which case
   `@aura3d/environments` stays a 02-owned package.
2. Decide `packages/rendering/src/shadows/CascadeHysteresis.ts`: keep and wire (not delete).

## What lane 15 actually found

`QR_OWNERSHIP.json` assigns **all** of `packages/environments/src/**` to lane 15,
not lane 02 — including `EnvironmentRegistry.ts`, `HDRIEnvironment.ts`, and
`PMREMPreset.ts`. Under the single-writer rule the PRD's "relocated by their
owners" clause could not apply, so lane 15 performed the relocation itself:

- `EnvironmentRegistry.ts`, `HDRIEnvironment.ts`, `PMREMPreset.ts`,
  `EnvironmentPreview.ts`, `index.ts`, `node.ts`, `production-runtime/` →
  `packages/engine/src/devtools/environments/` (verbatim `git mv`).
- New barrel `packages/engine/src/devtools/environmentDiagnostics.ts`
  re-exports the old package `.` surface (the six `ThreeCompat*` diagnostics
  exports); the deprecated `@aura3d/engine/environments` stub (`removeIn:
  4.0.0`) now reads `of: packages/engine/src/devtools/environmentDiagnostics.ts`.
- The package directory and its `aura.exports.json` path row are deleted in the
  same PR. `threejs-example-parity/index.ts` moved to
  `packages/engine/src/threejs-example-parity/environments.ts`, removing the
  undeclared engine→environments cross-package import (research/13 §9).

If lane 02 wants these files under `packages/rendering/src/environment/` instead,
say so and lane 15 will re-point the move — the tree is mechanical either way.

## Remaining for lane 02

- `packages/rendering/src/shadows/CascadeHysteresis.ts` — keep + wire vs delete
  (PRD says keep and wire). Lane 15 does not touch it.
