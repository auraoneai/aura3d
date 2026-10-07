# Q-06-3 — Keyframe.ts math imports @aura3d/scene/math

**Status:** OPEN (property test attached and green)
**Requesting lane:** 15 (PRD-15 Phase 6, math unification T6.8)
**Owning lane:** 06 (`packages/animation/`)

## Request (per PRD request ledger)

`packages/animation/src/Keyframe.ts` math (`Mat4`, `identityMat4`,
`composeMat4`, `multiplyMat4`, `normalizeQuat`) → import from
`@aura3d/scene/math` (canonical tuple-math owner), with the attached property
test (1,000 random TRS, 1e-6 tolerance) gating the switch.

## Attached property test

`tests/unit/animation/keyframe-math-equivalence.test.ts` (15-owned test dir,
runs green today): 1,000 seeded-random TRS inputs compare Keyframe's helpers
against `composeMat4`/`multiplyMat4`/`normalizeQuat` from
`@aura3d/scene/math` at 1e-6.

## Divergence the test found — read before switching

- `composeMat4` and `normalizeQuat`: agree directly (Key/ canonical outputs
  match within 1e-6 on unnormalized random quats — both normalize first).
- `multiplyMat4`: **operand order is reversed.** Keyframe's implementation
  uses row-major indexing (`out[col + row*4] = Σ a[row*4+k]·b[k*4+col]`) over a
  column-major element layout, so `multiplyMat4Keyframe(a, b)` computes **B·A**,
  not A·B. The test asserts `multiplyMat4Keyframe(a,b) ≡
  multiplyMat4Canonical(b,a)` — which passes. When lane 06 repoints the helper,
  it must call the canonical function with swapped operands (or keep a local
  wrapper) to preserve the semantics Keyframe callers observe today.
- Tuple types: Keyframe's `Vec3`/`Quat`/`Mat4` are `readonly` tuples;
  canonical's are mutable. Scene math params were widened to `Readonly<…>`
  this phase so readonly callers typecheck; alias as
  `Readonly<CanonicalVec3>` etc. to keep the exported types readonly.

## Not covered by the swap

`lerpVec3`, `slerpQuat`, `invertTranslationMat4`, `lerpNumber` have no canonical
counterpart — they stay local.
