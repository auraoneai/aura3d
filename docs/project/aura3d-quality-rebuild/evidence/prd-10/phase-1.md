# PRD-10 phase 1 evidence — PR B (world API + chunks)

Branch `qr/prd10-world-api` (stacked on `qr/prd10-r9-honesty`, PR #37). Local
gates run on the Devin VM (linux x64, node v24, headless CI — no GPU, so
browser specs are NOT RUN here and produce their real numbers on the
`qr-prd10-world.yml` macos-14 job).

## Local gate results (this machine)

| Gate | Result |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | clean (0 errors) |
| `eslint` on all touched paths | clean |
| `vitest run tests/unit/contracts` | 43 files / 77 tests pass (incl. `tests/unit/contracts/impl/prd10-world.test.ts` 15 tests, `prd10-codemod.test.ts` 4 tests) |
| `tools/qr-ownership/check.mjs` | every new path resolves owner 10 |
| `rg "createTerrainTileGrid\|createNamedEnvironmentPreset" packages apps examples` | only the throwing `removed-world-planner` stubs + `index.ts` re-exports (tests/unit/rendering/* callers = qr-request #34, owner 15) |

## T1.11 pass-depth (spec expectation, pending macos-14)

`tests/browser/qr-prd10-world-pass-depth.spec.ts` asserts Path-S ordering with
raw WebGL2: a `background` quad at world z=5 drawn first, opaque quads at z=3
(left) and z=7 (right). Expected pixels: left half = near box colour, right
half = background colour, uncovered strip = background. `worldDrawPath(flags)`
== "S" in the test env (programCacheSlot unprovided → Path G unreachable). Any
fallback to `after-opaque` would be recorded here as a deviation; none is
anticipated.

## Flag-off behaviour

`createAuraApp` extension loop always runs → `app.world` resolves
`worldQueriesSlot.get(flags)`: flag-off apps get the C-26 stub (plane y=0
ground, 0/up height, zero wind, null biome). No handler, contributor phase,
chunk feature or diagnostics content activates with `A3D_QR_WORLD` off.
Unflagged changes in this PR: none (the bilinear/planner deletions were PR A).

## Ticks claimed

T1.6–T1.16 as specced, with the noted substitutions: unit/impl tests live in
`tests/unit/contracts/impl/prd10-*` (vitest) and browser specs in
`tests/browser/qr-prd10-*.spec.ts` because `tests/qr/` is owner-15 territory;
codemod fixtures are inline in `prd10-codemod.test.ts` for the same reason.
`describeBiome` Low-tier rule, `listBiomes` order, `normalizeWind` defaults,
raycast nearest-order and `AuraSceneNode` union carve are covered by the impl
test; the union carve is filed as a qr-request (AuraNodeBuilder constraint
needs `AuraSceneNode` extended for world node kinds).

## NOT RUN

- `tests/browser/qr-prd10-chunks.spec.ts`, `qr-prd10-world-pass-depth.spec.ts`
  (no GPU/browser harness on this VM — run on macos-14 lane job).
- Capture workflow dispatch (`qr_flags` world/none on `prd10-*` scenes) — the
  `capture` job dispatches `quality-rebuild-capture.yml`; per-scene capture
  numbers land with lane 12's C-30 runner.
- `pnpm test:packages`, `pnpm build` (not a PR gate; qr-contracts.yml covers
  typecheck/lint/vitest/ownership).
