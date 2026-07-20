# Aura3D Game Layer Rebuild Plan

Status: completed on 2026-07-19

## Result

The game-layer rebuild is complete for the current certified racing/platformer asset set. Turbo Drift Circuit and Skyline Runner are bounded public release-ready candidates. Racing Game Layer Proof and Platformer Game Layer Proof remain internal diagnostic harnesses. Current aggregate evidence passes 10/10 public release candidates, two internal diagnostics, two game-layer diagnostics, zero prototype-blocked routes, and one separate index route.

## Shipped Layers

1. **Catalog and CLI certification**
   - Release candidates require durable provenance, current asset hashes, retained render probes, quality metadata, and category-specific `gameGeometry` certification.
   - `assets certify-game-geometry` extracts and records racing topology or platformer playable surfaces atomically.
   - `assets bind-game-route-evidence` binds a selected pair to current geometry, composition, screenshot, and visual-review evidence.
2. **Compiler-owned geometry**
   - Racing and platformer specs generate immutable `src/generated/game-geometry.ts` contracts.
   - Route code imports those contracts instead of copying centerlines, rectangles, or screenshot hashes.
   - Drift gates reject stale source, changed asset hashes, and tampered generated geometry.
3. **Category composition and runtime contracts**
   - Pair checks validate visible overlap, contact, scale, camera readability, and debug-guide absence.
   - Racing/platformer helpers use certified contact queries and enforce authored 30-second lap/completion floors.
   - Camera modes are selected from retained composition evidence rather than arbitrary route preference.
4. **Release evidence**
   - Route-primary, gameplay-before/after, desktop, mobile, deploy, and per-asset probes are retained and hash-bound.
   - Every public game route retains an independent six-check visual-QA report.
   - Manual review can veto a machine pass but cannot promote a machine failure.

## Public And Diagnostic Routes

Public bounded game presentations:

- `showcase-public-racing-presentation-proof`
- `showcase-public-platformer-presentation-proof`
- `showcase-turbo-drift-circuit`
- `showcase-skyline-runner`

Internal game-layer diagnostics:

- `showcase-racing-game-layer-proof`
- `showcase-platformer-game-layer-proof`

The diagnostic routes preserve geometry-contract and debug-harness coverage; they are not marketing examples.

## Required Ongoing Gates

A public game route remains public only while all of these pass:

- current asset hashes, provenance, retained probes, and category certification;
- compiler-generated geometry contract and drift checks;
- asset-pair composition report;
- route-primary and gameplay input/state evidence;
- subject binding, contact, camera readability, scale, debug-guide absence, and HUD-occlusion checks;
- manual downward-only visual review;
- route-health, static source, build, and deploy checks;
- aggregate launch evidence.

Run:

```bash
pnpm typecheck:raw
pnpm exec vitest run tests/unit/create-aura3d tests/unit/game-runtime tests/unit/tools --reporter=dot
pnpm exec vitest run tests/unit/aura3d-cli tests/unit/asset-index --reporter=dot
pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line
node tools/showcase-library/build-and-check.mjs
```

## Claim Boundary

This completed plan proves bounded stylized presentations for named, certified asset pairs. It does not prove automatic arbitrary GLB-to-game conversion, production physics, arbitrary mesh collision, AI opponents, netcode, production game-engine parity, or root-wide renderer parity.
