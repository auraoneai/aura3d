
## Q-12-2 — harness bloom mapping (lane prd12)

`benchmarks/quality-rebuild/aura3d/common.ts` ~line 303-305: the harness bloom
block translates the spec's three-UnrealBloom `strength/radius/threshold`
verbatim into `effects.bloom({intensity: spec.bloom.strength, radius:
spec.bloom.radius, threshold: spec.bloom.threshold})` — legacy-unit fields, and
it cannot carry the v2-authored `knee`/`scatter`/`clampLuminance` at all.
PRD-03 works around it via a spec transform in the prd03 bloom adapters
(`scenes/prd03/bloomMapping.ts`); the residual is the §6.6-default knee 0.25
instead of the calibrated 0.01-wide edge, and deprecated-field routing for
scatter. Ask: a `RunOptions`/`SpecBloom` v2 path that submits the full authored
bloom bag so per-scene transforms are unnecessary.
