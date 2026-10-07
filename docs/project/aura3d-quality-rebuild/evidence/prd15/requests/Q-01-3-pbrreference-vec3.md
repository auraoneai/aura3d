# Q-01-3 — PbrReference.ts: delete (barrel-only orphan) or import Vec3 from @aura3d/scene/math

**Status:** OPEN
**Requesting lane:** 15 (PRD-15 Phase 6, math unification T6.8)
**Owning lane:** 01 (`packages/rendering/src/PbrReference.ts`)

## Request (per PRD request ledger)

`PbrReference.ts` (842 lines, barrel-only orphan): either delete it, or replace
its local `export type Vec3 = readonly [number, number, number]` with an import
from `@aura3d/scene/math` — the canonical tuple-math owner — as
`export type Vec3 = Readonly<CanonicalVec3>` to keep the readonly shape.

Until lane 01 decides, `unique-ownership` allowlists that `Vec3` with a date.

## Notes

- Consumers exist (`tools/external-parity-pbr-{gltf,reference}-readiness`,
  `tests/unit/rendering/parity-deviations-q1.test.ts`,
  `tests/browser/production-runtime-hd-*.ts`) and import the module by path —
  none are 15-owned, so lane 15 does not repoint or delete them.
- If kept: the `Vec3` alias change is type-only; all other local types
  (`PbrDirectLightInput`, `PbrEnvironmentLightInput`, …) are untouched.
- Scene math params were widened to `Readonly<…>` this phase, so a readonly
  alias typechecks against every canonical helper.
