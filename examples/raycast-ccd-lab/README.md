# Raycast & CCD Lab

Interactive visualisation of the three physics queries that are easiest to get wrong, and hardest to
notice when they are wrong.

## Why this example exists

`raycasting` and `continuous collision detection` were both reported `parity-unproven` in the Three.js
parity scorecard with the reason *"no production consumer imports this capability"*. That was accurate:
`PhysicsWorld.raycast`, `PhysicsWorld.sphereCast` and `timeOfImpact` were implemented and unit-tested,
but nothing shipped used them, so the parity claim had no product surface behind it.

## Run

Run the repository dev server used by the browser tests and open `examples/raycast-ccd-lab/index.html`.

## Systems Used

- `@aura3d/physics` for `PhysicsWorld.raycast`, `PhysicsWorld.sphereCast` and `timeOfImpact`.
- `@aura3d/rendering` for WebGL2 line geometry, so each query is visible rather than asserted.

## What each control demonstrates

**Raycast corridor** — fires two casts from the same origin inside the shooter's own collider. The
unfiltered cast reports **the shooter at distance 0**: the self-hit defect, where a character
controller probing ahead detects its own capsule and concludes it is against a wall. Adding
`ignoreBodies: [shooter.id]` reports the far wall at 5.3 units. The filter is load-bearing, not
cosmetic.

**Ray vs spherecast through a gap** — the posts leave a 0.24-unit gap. A zero-radius ray threads it; a
0.22-radius sweep contacts a post. This is why a projectile with width needs `sphereCast`: a ray slips
between colliders a real projectile would hit.

**Swept impact at 200 m/s** — at 200 m/s a 1/60 s step advances 3.33 units, more than the distance to
the wall face. An unswept integrator moves the bullet from in front of the wall to behind it having
generated no contact at any sampled instant. `timeOfImpact` reports when the sweep actually crosses,
which is what a solver must sub-step to.

## Expected Output

`window.__AURA3D_RAYCAST_CCD_LAB__` reports `status: "ready"`, the two raycast results, whether the gap
ray missed, the spherecast hit, and the swept impact time with a `wouldTunnel` flag.

## Claim Boundary

- Visualises query behaviour. **Not** a claim of Rapier or PhysX query performance.
- `timeOfImpact` sweeps world AABBs, so it is conservative for non-box shapes and ignores rotation.
- Lines are drawn with `UnlitMaterial`; this route makes no lighting, shadow or PBR claim.
