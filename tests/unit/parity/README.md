# three.js parity tests

Unit tests for `docs/workflows/threejs-parity-gaps.md` (the three.js → Aura3D
parity PRD). Every parity ID in that PRD maps to a lane (L1–L10); a test lives
here when it proves a parity contract without needing a browser/GPU. Browser
and GPU fixtures stay under `tests/browser/` and the GPU runner — this folder
is the always-on unit lane.

## Naming

`tests/unit/parity/<lane>-<area>.test.ts` — e.g. `l3-curves.test.ts`,
`l1-custom-shader.test.ts`. Where a parity feature also has an existing home
(`math`, `assets`, `animation`, …) the lane may keep the test there and link
this README row instead of duplicating it.

## Rules

- Compare against three.js **0.185.1** where the PRD names it: vertex/index
  counts, bounds, positions and UVs within the PRD's stated tolerance; seeded
  or property-based math fixtures within its stated tolerance.
- A parity node kind must **fail closed** — `AuraRuntimeError` with code
  `parity-not-implemented` — until its lane lands; assert that here rather than
  letting it render the wrong thing.
- Lane flags are `A3D_PARITY_<LANE>`; assert `resolveQrFlags` honours them
  (list token, `parity.<lane>` short form, per-flag env) in
  `l0-flags.test.ts`.
- No `three` import in tests that are supposed to be three-free — use the
  vendored fixture JSON under `tests/fixtures/parity/` for reference data.

## Lane → test map

| Lane | Area | Status |
| ---- | ---- | ------ |
| B    | flags / contracts | `l0-flags.test.ts` |
| L1   | shaders + post    | pending |
| L2   | geometry          | pending |
| L3   | math + curves     | pending |
| L4   | textures/loaders  | pending |
| L5   | instancing/batching | pending |
| L6   | lines/points/sprites | pending |
| L7   | scene/renderer/runtime | pending |
| L8   | animation         | pending |
| L9   | audio             | pending |
| L10  | codemod/probes    | pending |
