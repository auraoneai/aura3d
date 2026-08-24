# SR-A7 decision memo — moving platforms (go/no-go)

**Decision: NO-GO for Skyline Runner 2.x. Revisit only as a dedicated
re-certification epic with its own PRD amendment.**

Status: committed per PRD 05-Skyline-Runner task SR-08.
Scope of this memo: decision record only. No platformer-kit or route behavior changed.

## Why the gate exists

Skyline's playable surfaces are mesh-derived (src/generated/game-geometry.ts,
extracted from showcaseKenneyVerdantPlatformerWorld) and certified against the
shipped asset hash. The platformer kit supports movingPlatforms, and
src/level.ts even derives a candidate list (SKYLINE_MOVING_PLATFORMS), but the
route deliberately does **not** feed them into the level:

1. **The 70-115s completion window is a measured contract**, not an estimate.
   src/level-proof.ts drives the public kit across the full course and asserts
   the physical finish frame lands inside the window
   (tests/unit/apps/skyline-sixty-second-level.test.ts). Moving surfaces change
   traversal timing in ways the deterministic input policy cannot compensate
   for, so the window would have to be re-proven from scratch.
2. **Regeneration cascade.** Adding kinematic surfaces invalidates the extracted
   surface map: regenerate game-geometry.ts, re-run the certification probes,
   re-bind the world asset, and re-prove contact alignment. That is exactly the
   class of churn PRD section 3 rejects for polish work.
3. **Contact drift risk.** The kit solves player motion against static AABBs;
   rider-on-moving-platform support is a physics-runtime concern, not something
   a route can bolt on honestly. PRD section 3 already rejected dynamic crates
   for the same reason.

## What a future GO would require

- A PRD amendment declaring re-certification scope and acceptance window.
- Regenerated, hash-bound geometry plus updated
  skylinePlayableSurfaceMap.evidence.
- A revised deterministic proof with the new finish-frame window recorded as
  data, plus mounted browser proof that riders actually carry with platforms.
- Independent human visual review before any label change.

Until all four exist, SKYLINE_MOVING_PLATFORMS stays an unused derivation and
the shipped course remains the certified static one.
