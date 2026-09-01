# Vault Breakers — Complete Physics + Visual Rewrite Prompt

## The Problem

The Vault Breakers pinball route at `apps/showcase-vault-breakers/` has two fundamental problems that incremental fixes cannot solve:

### 1. Graphics look like Atari
The procedural geometry generator (`build-models.mjs`) can only produce boxes, cylinders, and toruses using `addBox()`, `addCylinderY()`, and `addTorus()`. No amount of color changes, bloom tweaks, or removing duplicates will make `addBox()` look like a real pinball machine. The playfield elements are all crude geometric primitives that read as a debug prototype, not a finished game.

### 2. Physics don't make sense
- The ball doesn't roll down the sloped playfield properly — it gets stuck, floats, or clips through geometry
- Flippers don't launch the ball convincingly — the motorised-hinge joint produces weak or inconsistent hits
- Drain detection is broken — the ball is visible on the playfield but "balls live" shows 0
- The ball appears to float above or sink below the playfield surface
- Bumper kicks feel arbitrary rather than physics-based
- The gravity model uses `[0, -9.81, 2.35]` which simulates slope as a Z-force, but this doesn't produce realistic rolling behavior on a flat collider

## Architecture Constraints (DO NOT VIOLATE)

Read these before changing anything:
- `llms.txt` — Aura3D API patterns, forbidden imports
- `docs/agents/claims-and-boundaries.md` — claim labels
- Root `AGENTS.md` — project conventions

**Forbidden:**
- No raw `three` imports, direct GLB loader internals, `OrbitControls`, or hand-written renderer loops
- No raw `.glb` URLs or guessed asset IDs — use `assets.*` typed references
- No CSS/canvas overlays pretending to be 3D
- Use only `@aura3d/engine` public APIs

**Must preserve:**
- `createGameApp` / `createAuraApp` architecture
- `window.__VAULT_BREAKERS_EVIDENCE__` contract (mounted, status, backend, jointCount, etc.)
- Five target-bank mission with vault multiball
- Scoring, reset, pause, keyboard/touch controls, audio cues
- All existing browser tests must pass

## Files In Scope

```
apps/showcase-vault-breakers/src/table.ts          # Physics world, colliders, ball/flipper logic — REWRITE
apps/showcase-vault-breakers/src/main.ts           # Scene graph, camera, materials, HUD — REWRITE visuals
apps/showcase-vault-breakers/src/environment.ts    # Lights, floor, cabinet — REWRITE
apps/showcase-vault-breakers/src/ball-flow.ts      # Game state machine — REVIEW, fix if needed
apps/showcase-vault-breakers/src/flippers.ts       # FlipperController — REVIEW, fix if needed
apps/showcase-vault-breakers/src/plunger.ts        # PlungerController — REVIEW, fix if needed
apps/showcase-vault-breakers/src/scoreboard.ts     # text3D scoreboard — keep mostly as-is
apps/showcase-vault-breakers/src/scoring.ts        # Score logic — keep as-is
apps/showcase-vault-breakers/src/missions.ts       # Mission state machine — keep as-is
apps/showcase-vault-breakers/src/pinball-audio.ts  # Audio — keep as-is
apps/showcase-vault-breakers/src/styles.css        # HUD styling — keep as-is
apps/showcase-vault-breakers/scripts/build-models.mjs  # GLB generator — REWRITE with better geometry
```

## Part 1: Fix the Physics (table.ts)

### Current Physics Problems

1. **Gravity/slope model is wrong**: `gravity: [0, -9.81, 2.35]` applies full Earth gravity downward plus a constant Z-force. On a flat felt collider at Y=-0.1, the ball just sits on the surface with the Z-force pushing it toward the drain. There's no actual slope — the ball doesn't accelerate realistically, it just slides at constant speed or gets stuck.

2. **Flipper collider is too small**: `physics.box(0.4, 0.055, 0.065)) is a tiny box that barely intersects with the ball (radius 0.14). The flipper visual is much larger than its collision shape, so the ball passes through the visible flipper.

3. **Flipper motor torque/speed may be insufficient**: `FLIPPER_MOTOR_TORQUE = 240` and `FLIPPER_RAISE_SPEED = 60` — these need tuning. The motorised-hinge joint needs enough force to actually accelerate the ball.

4. **Drain detection gap**: The drain check `p[2] > 3.72 && Math.abs(p[0]) < 0.68` only catches balls in a narrow center strip. Balls that roll off the sides near the flippers aren't caught.

5. **Ball resting on flipper**: When a flipper is raised, the ball can rest on top of it indefinitely because there's no mechanism to push it off.

6. **Bumper kick is additive velocity, not reflective**: `setVelocity([v[0] + normal[0] * strength, ...])` adds to existing velocity rather than reflecting. A slow ball hitting a bumper gets a weak kick; a fast ball gets an even faster one. Real bumpers reflect with a fixed outgoing speed.

7. **Sleep threshold too aggressive**: `sleepVelocityThreshold: 0.06` with `sleepDelay: 0.45` means balls stop moving very quickly. Combined with the flat playfield, balls settle almost immediately.

8. **Visual sync offset mismatch**: Ball positions from physics are synced directly to scene nodes, but the cabinet GLB is at Y=-1.8 while physics operates at Y≈0. The +0.28 visual offset in main.ts partially compensates but creates inconsistency.

### Required Physics Fixes

**A. Implement proper playfield slope:**
Instead of fake Z-gravity, either:
- Tilt the entire physics world slightly (rotate gravity vector) so the ball naturally rolls downhill
- OR keep flat gravity but apply a per-frame authored force to the ball proportional to its position (simulating slope)
- OR use a tilted felt collider (rotate the box slightly around X-axis) so the ball physically rolls

The key requirement: a ball placed at the top of the playfield (Z=-3) should accelerate toward the drain (Z=+4) over ~2-3 seconds, reaching realistic pinball speeds (~3-5 m/s at the flippers).

**B. Fix flipper collision and force:**
- Increase flipper collider size to match the visual: at least `physics.box(0.45, 0.08, 0.1)`
- Increase motor torque to 500+ and raise speed to 80+
- Add a velocity cap on the flipper bat so it doesn't spin unrealistically fast
- When the flipper hits the ball, the ball should launch upward and toward the backbox with convincing force

**C. Fix drain detection:**
- Widen the drain zone: `p[2] > 3.5` (not 3.72) and `Math.abs(p[0]) < 1.2` (not 0.68)
- Add a drain sensor collider that covers the full gap between the flippers
- Ensure drained balls are immediately hidden (parked at Y=-5)

**D. Fix bumper kicks:**
- Reflect velocity instead of adding: compute the reflection of the incoming velocity across the contact normal, then scale to a fixed outgoing speed (e.g., 4.0 m/s for bumpers, 3.5 for slingshots)
- This ensures consistent bumper behavior regardless of incoming ball speed

**E. Fix sleep parameters:**
- Raise `sleepVelocityThreshold` to 0.02 (ball must be nearly stopped)
- Raise `sleepDelay` to 1.5 (ball must be slow for 1.5 seconds before sleeping)
- This prevents premature settling

**F. Add ball-playfield friction tuning:**
- The felt should have very low friction (0.05-0.08) so the ball rolls freely
- Walls should have moderate friction (0.3) and high restitution (0.5-0.7)
- The ball itself should have low linear damping (0.02) to maintain momentum

**G. Fix visual-physics alignment:**
- Establish a single coordinate system: physics Y=0 = playfield surface
- Cabinet GLB positioned so its playfield surface aligns with physics Y=0
- All visual offsets derived from this single reference, not magic numbers

### Physics Constants to Tune

```ts
// Current values (broken) → suggested values
BALL_RADIUS = 0.14                    // keep
BALL_MASS = 0.28                      // try 0.08 (lighter ball rolls better)
SLOPE_ACCELERATION = 2.35             // replace with proper slope mechanism
FLIPPER_PIVOT_X = 0.85                // keep
FLIPPER_REST_YAW = -0.62              // keep
FLIPPER_UP_YAW = 0.5                  // keep
FLIPPER_RAISE_SPEED = 60              // try 90
FLIPPER_RETURN_SPEED = -10            // try -25 (faster return)
FLIPPER_MOTOR_TORQUE = 240            // try 600
FLIPPER_BAT_MASS = 0.18               // try 0.35 (heavier bat hits harder)
BUMPER_KICK = 2.6                     // replace with reflection at fixed speed 4.0
SLING_KICK = 2.2                      // replace with reflection at fixed speed 3.5
PLUNGER_MIN_SPEED = 5.4               // keep
PLUNGER_MAX_SPEED = 11.4              // keep
```

## Part 2: Fix the Graphics (build-models.mjs + main.ts + environment.ts)

### Current Graphics Problems

1. **All geometry is boxes/cylinders/toruses** — `addBox()` produces rectangular prisms. Bumpers should be domed spheres, flippers should be smooth tapered shapes, targets should be thin curved paddles.

2. **No playfield detail** — the playfield is a flat colored slab with no lanes, ramps, curves, or depth variation.

3. **Everything is the same amber/orange** — no visual hierarchy. Bumpers, targets, slingshots, and lane guides are all the same color family.

4. **The cabinet GLB and playfield elements don't integrate** — they exist in separate coordinate spaces with magic-number offsets.

### Required Graphics Approach

Since we can't source a real open-playfield pinball model from the catalog (all catalog models are closed-box cabinets), and `addBox()` will always look like boxes, the approach must be:

**Option A: Massively improve the procedural geometry**
Add new geometry primitives to `build-models.mjs`:
- `addSphere(p, cx, cy, cz, r, segs)` — UV sphere for ball-shaped objects
- `addLathe(p, profile, cx, cz, segs)` — lathe/revolution surface for bumpers, posts, rounded shapes
- `addRoundedBox(p, cx, cy, cz, hx, hy, hz, r, segs)` — box with beveled edges
- `addCapsule(p, x0, y0, z0, x1, y1, z1, r, segs)` — capsule for flipper bodies
- `addCurve(p, points, width, height, segs)` — extruded curve for ramps, lanes

Then rebuild every playfield element:
- **Bumpers**: Lathe profile — wide base cylinder, domed hemisphere cap, glowing ring torus. Three distinct parts with different materials.
- **Flippers**: Capsule-based tapered body with rounded ends, neon rubber edge strip
- **Targets**: Thin rounded paddle on a cylindrical post, with a curved top
- **Slingshots**: Triangular prism with beveled edges and emissive rubber face
- **Playfield**: Add lane dividers (thin curved walls), ramp entrances (curved surfaces), drop target banks (row of thin paddles), apron with decorative shape
- **Backbox**: Deeper recess with readable display area, speaker grille with actual holes, marquee with geometric letter shapes

**Option B: Use a hybrid approach**
Keep the procedural cabinet shell (it works for the exterior) but replace the playfield internals with a single high-detail GLB that's authored externally (e.g., using Blender or a programmatic mesh library that supports subdivision surfaces). This would require adding a build step that generates the playfield mesh with proper curved geometry.

**Recommended: Option A** — it keeps everything in-repo and self-contained.

### Color Palette

Define a clear visual hierarchy:
- **Playfield felt**: Very dark blue-black (#060812) with subtle metallic sheen
- **Bumpers**: Hot orange dome (#ff6a00) with chrome base and cyan glow ring
- **Targets**: Bright amber (#ffb830) when armed, electric cyan (#00e5ff) when hit
- **Slingshots**: Red-orange rubber (#ff3300) with chrome brackets
- **Flippers**: Dark gunmetal body (#1a1a2e) with cyan neon rubber edge (#00e5ff)
- **Lane guides**: Soft cyan (#00aacc) emissive strips
- **Bank lamps**: Dim amber (#3d2200) off, bright teal (#00ffcc) on
- **Vault door**: Steel grey with golden emissive accents
- **Backbox frame**: Electric cyan (#00e5ff) neon
- **Backbox title**: Hot magenta (#ff00aa) neon
- **Cabinet trim**: Cyan neon strips along edges
- **Background**: Deep purple-black (#030308)

### Bloom and Lighting

- Bloom intensity: 0.45 (already set — keep)
- Ambient light: 1.0 (already set — keep)
- Key light: warm directional from upper-left
- Rim light: cyan directional from upper-right
- Fill light: magenta from below-behind

## Part 3: Integration and Testing

### Coordinate System Unification

Establish ONE coordinate system:
- Physics Y=0 = playfield surface
- Cabinet GLB positioned so its playfield aligns with Y=0
- All visual elements positioned relative to Y=0
- No magic +0.28 offsets — derive everything from the cabinet position

### Verification Checklist

After making changes:

```bash
# 1. Rebuild models
node apps/showcase-vault-breakers/scripts/build-models.mjs

# 2. Re-register assets (run the pnpm exec tsx commands at top of build-models.mjs)

# 3. Typecheck
pnpm --dir apps/showcase-vault-breakers typecheck

# 4. Build
pnpm --dir apps/showcase-vault-breakers build

# 5. Browser tests
pnpm exec playwright test \
  tests/browser/vault-breakers-table-visual.spec.ts \
  tests/browser/vault-breakers-playable.spec.ts

# 6. Manual physics verification (start dev server, open browser):
#    - Ball serves from plunger lane and enters playfield
#    - Ball rolls downhill toward flippers (doesn't float or get stuck)
#    - Flippers launch ball convincingly toward backbox
#    - Bumpers reflect ball at consistent speed
#    - Ball drains between flippers (doesn't get stuck)
#    - Ball drains when it goes past the flippers on the sides
#    - Reset returns to initial state
#    - Pause freezes everything
#    - Score increments on target hits
#    - No page errors

# 7. Capture screenshots at 1440x900, 1365x768, 390x844
#    - Verify: clean playfield, no z-fighting, readable elements
#    - Verify: ball visible during play, flippers move, bumpers glow
```

### Definition of Done

1. **Ball physics work**: Ball rolls downhill, bounces off walls/bumpers realistically, drains properly
2. **Flippers work**: Pressing A/D raises flippers that launch the ball with convincing force
3. **Graphics don't look like Atari**: Playfield elements have curved/rounded geometry, not just boxes
4. **Visual hierarchy**: Different element types have distinct colors and shapes
5. **No z-fighting**: Each visual element has one source of truth
6. **All tests pass**: Visual spec, playable spec
7. **Evidence contract intact**: mounted=true, status=ready, backend=rapier, jointCount=2
8. **Deployed to canonical**: https://aura3d.auraone.ai/apps/showcase-vault-breakers/

### Deployment

```bash
git add -A
git commit -m "feat(showcase): rewrite vault breakers physics and visuals"
git push origin main
pnpm --dir marketing build
vercel build --prod --yes
VERCEL_FORCE_SYNC=1 vercel deploy --prebuilt --prod --yes
vercel alias set <deployment-url> aura3d.auraone.ai
curl -sI https://aura3d.auraone.ai/apps/showcase-vault-breakers/
```

## Reference: Current Physics Constants

```ts
BALL_RADIUS = 0.14
BALL_MASS = 0.28
SLOPE_ACCELERATION = 2.35
FLIPPER_PIVOT_X = 0.85
FLIPPER_REST_YAW = -0.62
FLIPPER_UP_YAW = 0.5
FLIPPER_RAISE_SPEED = 60
FLIPPER_RETURN_SPEED = -10
FLIPPER_MOTOR_TORQUE = 240
FLIPPER_BAT_MASS = 0.18
BUMPER_KICK = 2.6
SLING_KICK = 2.2
PLUNGER_MIN_SPEED = 5.4
PLUNGER_MAX_SPEED = 11.4
```

## Reference: Physics Coordinate System

- Felt: Y=-0.1, X ∈ [-2.85, 2.85], Z ∈ [-4.15, 4.15]
- Walls: Y=0.4
- Flippers: Z≈3.15, Y≈0.16
- Drain: Z=3.92
- Backbox/vault: Z≈-3.3 to -3.72
- Bumpers: Y=0.16 to 0.36
- Ceiling guard: Y=3.4
- Ball serve position: [2.44, 0.16, 3.3]
- Ball drain zone: Z > 3.72, |X| < 0.68

## Reference: Camera

```ts
camera.perspective({ position: [0, 3.2, 9.2], target: [0, -0.5, 0.0], fov: 52 })
```

## Reference: Available Asset IDs

```
vaultBreakersBall          — procedural chrome sphere (82KB)
vaultBreakersFlipper       — procedural tapered flipper (108KB)
vaultBreakersFlipperReal   — catalog flipper by avlasov (251KB)
vaultBreakersMechanisms    — procedural playfield landmarks (461KB)
vaultBreakersTable         — procedural cabinet shell (91KB)
vaultBreakersVaultDoor     — procedural vault door (36KB)
vaultBreakersCabinet       — catalog pinball by dgeraci (7.6MB, closed box)
vaultBreakersCabinetHigan  — catalog pinball by higan69 (1.4MB, closed box)
```

The catalog models are closed-box cabinets — they show the coin door, not the playfield. They cannot replace the procedural playfield visuals. The procedural approach must be improved with better geometry primitives.
