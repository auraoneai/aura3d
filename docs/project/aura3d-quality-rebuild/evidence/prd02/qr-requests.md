# PRD-02 qr-requests / ccr log

Non-blocking requests lane 02 has raised. Per CONTRACTS §6.5 the owner has
2 working days; lane 02 does not wait on them.

## qr-request to:prd01 — `projectCubeToSH9` texel weight (C-09)

- **File**: `packages/rendering/src/contracts/environment.ts` (lane 01)
- **Contract**: C-09 (environment probe projection)
- **Change**: in `projectCubeToSH9`, the texel weight
  `4 / (len * len * faceSize * faceSize)` under-weights off-axis texels by
  ~22% (constant-cube irradiance lands 28% below πL). The correct solid
  angle for `du=dv=2/F` over the unnormalized direction `(n+u·fu+v·fv)/len`
  is `4 / (len * len * len * faceSize * faceSize)` — i.e. `len³`, not `len²`.
- **Workaround in place**: the lane-02 barrel exports a corrected
  `projectCubeToSH9` from `packages/rendering/src/environment/SphericalHarmonics.ts`
  (same signature and interleaved coefficient layout). All lane-02 callers
  go through the barrel. The contract version has no flag-off consumers.
- **Evidence**: `tests/unit/contracts/impl/prd02-sh9-projection.test.ts` —
  constant-cube irradiance within 1% of πL fails against the contract impl,
  passes against the lane impl.
- **Raised**: 2026-10-06, PR-B (`qr/prd02-math-modules`). Until it lands the
  lane impl shadows the contract export via `@aura3d/rendering/lanes`.
