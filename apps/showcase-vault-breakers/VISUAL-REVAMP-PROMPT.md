# Vault Breakers Pinball — Full Visual Revamp Prompt

## Mission

Revamp the Vault Breakers pinball showcase route at `apps/showcase-vault-breakers/` so it looks like a **finished, stylized neon pinball machine** — not a low-poly debug prototype made of flat-colored boxes. The camera framing was already fixed (commit 4019c82b); this task is about **visual quality**.

The canonical acceptance URL is:
```
https://aura3d.auraone.ai/apps/showcase-vault-breakers/
```

---

## Current State — What's Wrong

The current production screenshot shows a pinball machine that reads as a **debug/prototype scene**, not a finished showcase:

1. **Playfield elements are crude boxes** — bumpers, targets, slingshots, rails, and lane guides are all flat-colored rectangular primitives (`primitives.box`) with no shape, depth, or material richness. They look like collision-debug overlays, not game art.

2. **Flippers look like white sticks** — the authored GLB flipper has a tapered body and rubber band, but at runtime the `liveFlipperMaterial` override in `main.ts` replaces it with a flat emissive cream color, killing all the detail. The flippers read as plain white rectangles.

3. **Backbox display is a flat blue rectangle** — the backbox GLB has a recessed display face and neon marquee frame, but the overall effect is a dark slab with a barely-visible blue inset. No readable score, no decorative detail, no glow.

4. **Cabinet shell doesn't integrate with playfield primitives** — the GLB table model sits at Y=-1.8 while physics primitives get a +0.28 Y offset in `main.ts`. The result is a visible disconnect between the authored cabinet and the floating primitive overlays.

5. **No neon glow despite being "neon pinball"** — the bloom effect intensity is only 0.1 (or 0.04 for reduced motion). Emissive materials exist in the GLB but the runtime material overrides in `main.ts` replace them with flat colors. The scene reads as matte and dull.

6. **Muddy color palette** — dark maroon felt (#351622) with pale yellow (#fef3c7) boxes and cream flippers doesn't read as vibrant neon. The intended cyan/amber/orange neon aesthetic is lost.

7. **Redundant primitive overlays on top of GLB mechanisms** — `main.ts` adds `readable-bumper-*` boxes AND the GLB already has bumper geometry. Same for targets. This creates z-fighting and visual clutter.

8. **Scoreboard text3D nodes are invisible from the default camera** — they're positioned at heights and depths that don't align with the new camera framing.

---

## Architecture Constraints (DO NOT VIOLATE)

Read these before changing anything:
- `llms.txt`
- `docs/agents/claims-and-boundaries.md`
- Root `AGENTS.md`

**Forbidden patterns:**
- No raw `three` imports, `three/examples/...`, direct GLB loader internals, or `OrbitControls`
- No hand-written renderer loops
- No raw `.glb` URLs invented in route source
- No guessed asset IDs — use `assets.*` typed references
- No primitive-only replacement for the named pinball machine
- No fake CSS/canvas overlay pretending to be 3D geometry
- Use only `@aura3d/engine` public APIs: `createGameApp`, `scene`, `model`, `camera`, `lights`, `material`, `effects`, `primitives`, `game`, `ui`, `physics`, etc.

**Must preserve:**
- Rapier physics (world, bodies, colliders, sensors, constraints)
- Two working motorised-hinge flipper joints
- Plunger/serve behavior
- Five target-bank mission with vault multiball
- Scoring, reset, pause
- Keyboard controls (A/D flippers, Space plunger, S nudge, R reset, P pause)
- Touch controls
- Audio cues (11 typed WAV assets)
- Typed primary assets (5 GLBs)
- `window.__VAULT_BREAKERS_EVIDENCE__` contract
- All existing browser tests must continue to pass

---

## Files In Scope

### Route source (edit these):
```
apps/showcase-vault-breakers/src/main.ts          # Scene graph, camera, materials, HUD, frame loop
apps/showcase-vault-breakers/src/environment.ts    # Lights, floor, cabinet GLB placement
apps/showcase-vault-breakers/src/table.ts          # Physics world, colliders, visuals array, ball/flipper logic
apps/showcase-vault-breakers/src/ball-flow.ts      # Game state machine (attract → serve → play → drain → game-over)
apps/showcase-vault-breakers/src/flippers.ts       # FlipperController (raise/release edge detection)
apps/showcase-vault-breakers/src/plunger.ts        # PlungerController (charge/release)
apps/showcase-vault-breakers/src/scoreboard.ts     # text3D scoreboard node generation
apps/showcase-vault-breakers/src/scoring.ts        # Score/multiplier/bank logic
apps/showcase-vault-breakers/src/missions.ts       # Five-bank vault mission state machine
apps/showcase-vault-breakers/src/pinball-audio.ts  # Typed audio controller
apps/showcase-vault-breakers/src/styles.css        # HUD chrome styling
```

### Model synthesis (edit to improve GLB geometry):
```
apps/showcase-vault-breakers/scripts/build-models.mjs   # Generates all 5 GLBs procedurally
```

### Asset registration (run after rebuilding models):
```
apps/showcase-vault-breakers/scripts/register-assets.mjs
```

### Config/docs (reference only):
```
apps/showcase-vault-breakers/index.html
apps/showcase-vault-breakers/package.json
apps/showcase-vault-breakers/tsconfig.json
apps/showcase-vault-breakers/vite.config.ts
apps/showcase-vault-breakers/README.md
apps/showcase-vault-breakers/FEEL-BASELINE.md
apps/showcase-vault-breakers/SPIKE-FLIPPER.md
```

### Generated artifacts (regenerate via scripts, don't hand-edit):
```
aura.assets.json
src/aura-assets.ts
public/aura-assets/vaultBreakers*.glb
public/aura-assets/vaultBreakers*.thumb.svg
public/aura-assets/vault*.wav
apps/showcase-vault-breakers/deploy-report.json
apps/showcase-vault-breakers/performance-report.json
apps/showcase-vault-breakers/route-health.json
```

### Tests (must pass after changes):
```
tests/browser/vault-breakers-table-visual.spec.ts
tests/browser/vault-breakers-playable.spec.ts
tests/browser/showcase-gameplay-proof.spec.ts
tests/browser/showcase-games-input-proof.spec.ts
tests/unit/apps/vault-breakers-table.test.ts
tests/unit/apps/vault-breakers-scoring.test.ts
tests/unit/apps/vault-breakers-flipper-spike.test.ts
tests/unit/apps/showcase-gameplay-regressions.test.ts
```

---

## What To Fix — Detailed Work Items

### A. Rebuild GLB Models (`build-models.mjs`)

The procedural GLB generator is the foundation. Improve each model:

**vaultBreakersTable.glb (cabinet shell):**
- Add more geometry detail to the cabinet body: beveled edges, panel lines, side art panels with emissive strips
- Make the backbox taller and more prominent with a deeper recessed display area
- Add decorative side rails with chrome finish and subtle curvature
- Add a proper apron/lower cabinet front with coin door detail
- Increase polygon count on legs — use cylinders instead of boxes
- Add emissive neon trim strips along the cabinet edges (separate mesh part with high emissive values)
- Make the playfield bed slightly concave/curved rather than a flat box

**vaultBreakersMechanisms.glb (playfield landmarks):**
- Bumpers: replace simple cylinders with proper pop-bumper shapes — wider base, domed cap, visible skirt ring. Add a glowing ring around each bumper.
- Targets: replace flat boxes with standup target shapes — thin tall paddles with rounded tops, mounted on small posts
- Bank status lamps: make them larger, more prominent, with clear emissive glow
- Vault medallion: add more spoke detail, make it larger and more dramatic
- Orbit markers: increase size and emissive intensity
- Add slingshot triangle shapes (currently missing from the GLB entirely)
- Add lane guide arrows and ramp entrance markers

**vaultBreakersFlipper.glb:**
- Increase segment count on the tapered body for smoother taper
- Make the rubber band thicker and more prominent
- Add a visible pivot collar/bushing detail
- Ensure the tip cap is clearly rounded

**vaultBreakersBall.glb:**
- Increase sphere resolution (currently 14 rings × 18 sectors — bump to 20×24)
- Keep mirror chrome material

**vaultBreakersVaultDoor.glb:**
- Add more spoke detail to the locking wheel
- Make status LEDs larger and brighter
- Add concentric ring detail to the door face

After editing `build-models.mjs`, run:
```bash
node apps/showcase-vault-breakers/scripts/build-models.mjs
```
Then re-register assets per the commands documented at the top of that file.

### B. Fix Runtime Materials (`main.ts`)

The current code overrides GLB materials with flat colors, destroying all the detail:

```ts
// CURRENT (bad) — kills all GLB material detail:
runtimeHandle.setMaterial(name.startsWith("ball-") ? liveBallMaterial : liveFlipperMaterial);
```

**Fix approach:**
- For flippers: DON'T override the material. Let the GLB's authored multi-part materials (bat, rubber, chromeCap) show through. If you need to highlight an active flipper, use a subtle emissive boost rather than replacing the entire material.
- For balls: Keep the chrome material override but make it more reflective — higher metallic, lower roughness, subtle cyan emissive for neon feel.
- For targets: Instead of replacing with a flat emissive, use a material that preserves the target shape visibility — amber when armed, bright cyan/teal when hit, but with enough contrast to read the shape.
- For bumpers: The `readable-bumper-*` primitive boxes in `visualNodes()` are redundant with the GLB mechanism bumpers. Remove the redundant primitives OR remove the GLB bumper geometry — pick one source of truth. Prefer keeping the GLB version since it has better shape.

**Neon material palette:**
Define a cohesive neon color scheme:
- Playfield felt: deep purple-black (#0a0618) with subtle emissive (#1a0a2e)
- Bumpers: hot amber/orange emissive (#ff6a00) with chrome base
- Targets armed: warm amber (#ffb14d) emissive
- Targets hit: electric cyan (#00f0ff) emissive
- Flippers: dark gunmetal base with cyan neon rubber edge
- Slingshots: hot orange (#ff4500) emissive
- Lane guides: soft cyan (#00d4ff) emissive
- Bank lamps off: dim amber (#3d2200)
- Bank lamps on: bright teal (#00ffcc) emissive
- Vault door: steel grey with golden emissive accents
- Neon trim: electric cyan (#00f0ff) or hot pink (#ff00aa) emissive

### C. Fix Bloom/Post-Processing (`main.ts`)

Current bloom is nearly invisible:
```ts
effects.neonBloom({ intensity: reducedMotion ? 0.04 : 0.1 })
```

Increase to something that actually makes emissive surfaces glow:
```ts
effects.neonBloom({ intensity: reducedMotion ? 0.15 : 0.45 })
```

### D. Fix Lighting (`environment.ts`)

Current lighting is functional but flat:
- Ambient at 2.4 intensity washes everything out
- Key light at (-5, 10, 6) is too high and far

Improve:
- Lower ambient to ~0.8-1.2 to let emissive materials pop
- Add a stronger key light closer to the table
- Add a colored rim/fill light for neon atmosphere (cyan or magenta)
- Consider adding point lights near the bumpers for local glow effects

### E. Remove Redundant Primitive Overlays (`main.ts`)

The `visualNodes()` function adds primitive boxes for bumpers, targets, and other elements that ALREADY exist in the GLB models. This creates:
- Z-fighting between overlapping geometry
- Visual clutter from double-rendered elements
- Confusion about which geometry is "real"

Audit every primitive in `visualNodes()` and `table.ts`'s `trackVisual` calls. For each one, decide:
- If the GLB already has good geometry for it → remove the primitive
- If the primitive serves a gameplay purpose (runtime handle for material changes) → keep it but make it invisible or very thin, positioned to not z-fight
- If neither exists → add proper geometry to the GLB

### F. Fix Playfield/Cabinet Alignment

The physics coordinate system has the felt at Y=-0.1, but visuals add +0.28 to Y. The GLB table is at Y=-1.8. These need to be reconciled so the cabinet shell visually contains the playfield elements.

Options:
1. Adjust the GLB table position in `environment.ts` so its playfield surface aligns with the physics felt + visual offset
2. Adjust the visual Y offset in `main.ts` to match the GLB positioning
3. Adjust both to meet at a consistent reference plane

The goal: the playfield primitives (bumpers, targets, flippers, ball) should appear to sit ON the GLB cabinet's playfield surface, not float above or sink below it.

### G. Improve Scoreboard Visibility (`scoreboard.ts`)

The text3D scoreboard nodes need to be repositioned to be visible from the current camera angle [0, 3.2, 9.2] looking at [0, -0.5, 0]. They should appear either:
- On the backbox display face (as if the backbox screen shows the score)
- Floating above the playfield in a readable position
- Integrated into the HUD panel (already done via DOM — the text3D nodes may be redundant)

If the text3D nodes can't be made visible without cluttering the scene, consider making them invisible and relying solely on the DOM HUD for score display. But the evidence contract requires `text3DScoreboards > 60`, so keep the nodes — just position them where they won't clutter the view (e.g., behind the backbox or below the playfield).

### H. Improve Floor/Environment (`environment.ts`)

The current floor is a thin black box at Y=-2.25. Consider:
- Making it a subtle reflective surface (dark with slight metallic) to catch neon reflections
- Adding subtle grid lines or a radial gradient for depth
- Ensuring it doesn't occlude any part of the table

---

## Verification Workflow

After making changes:

```bash
# 1. Rebuild models if build-models.mjs was changed
node apps/showcase-vault-breakers/scripts/build-models.mjs

# 2. Re-register assets if GLBs changed
# (run the pnpm exec tsx commands documented at top of build-models.mjs)

# 3. Typecheck
pnpm --dir apps/showcase-vault-breakers typecheck

# 4. Build
pnpm --dir apps/showcase-vault-breakers build

# 5. Unit tests
pnpm test:unit

# 6. Browser tests
pnpm exec playwright test \
  tests/browser/vault-breakers-table-visual.spec.ts \
  tests/browser/vault-breakers-playable.spec.ts

# 7. Start dev server and inspect visually
pnpm --dir apps/showcase-vault-breakers dev --port 5174
# Open http://127.0.0.1:5174/ in a browser

# 8. Capture screenshots at:
#    1440×1000, 1440×900, 1365×768, 390×844

# 9. Verify gameplay:
#    - Space launches a ball
#    - A/D moves flippers
#    - R resets
#    - P pauses
#    - No page errors
#    - Evidence: mounted=true, status=ready, backend=rapier, jointCount=2
```

---

## Definition of Done

The route is not done until ALL of these are true:

1. **The scene reads as a finished neon pinball machine at first glance** — not a debug prototype
2. **Bumpers look like bumpers** — domed caps, glowing rings, not flat boxes
3. **Flippers look like flippers** — tapered bodies with visible rubber edges, not white sticks
4. **Targets look like targets** — standup paddles, not floating cubes
5. **The backbox has a visible, glowing display** — not a flat blue rectangle
6. **Neon emissive materials actually glow** — bloom is visible, emissive surfaces pop against the dark background
7. **The color palette is vibrant neon** — cyan, amber, orange, magenta against deep dark backgrounds
8. **No z-fighting or double-rendered geometry** — each visual element has one source of truth
9. **Playfield elements sit properly on the cabinet** — no floating or sinking
10. **The full table is framed correctly** — backbox visible, drain/flippers visible, no dead zones, no clipping
11. **All gameplay works** — serve, flip, reset, pause, scoring, missions, multiball
12. **All tests pass** — visual spec, playable spec, unit tests
13. **No page errors or error overlays**
14. **Evidence contract intact** — mounted=true, status=ready, backend=rapier, jointCount=2, text3DScoreboards>60

---

## Deployment (after visual approval)

```bash
# Commit
git add -A
git commit -m "feat(showcase): revamp vault breakers pinball visuals"
git push origin main

# Build marketing site (includes all showcase routes)
pnpm --dir marketing build

# Vercel prebuilt deploy
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes

# Point canonical domain
vercel alias set <deployment-url> aura3d.auraone.ai

# Verify
curl -sI https://aura3d.auraone.ai/apps/showcase-vault-breakers/
```

---

## Reference: Current Camera (already fixed, do not change unless needed)

```ts
camera.perspective({ position: [0, 3.2, 9.2], target: [0, -0.5, 0.0], fov: 52 })
```

## Reference: Physics Coordinate System

- Felt surface: Y = -0.1, X ∈ [-2.85, 2.85], Z ∈ [-4.15, 4.15]
- Walls: Y = 0.4
- Flippers: Z ≈ 3.15, Y ≈ 0.16
- Drain: Z = 3.92
- Backbox/vault: Z ≈ -3.3 to -3.72
- Bumpers: Y = 0.16 to 0.36
- Ceiling guard: Y = 3.4
- Visual Y offset in main.ts: +0.28 for non-felt primitives
- Table GLB position: (0, -1.8, 0.1), targetMaxDimension: 9.6, bounds ≈ [6.2, 4.25, 9.57]

## Reference: Asset Hashes (current)

```
vaultBreakersBall.5c94e527.glb
vaultBreakersFlipper.75e0ac2d.glb
vaultBreakersMechanisms.355ab0fa.glb
vaultBreakersTable.d36f4815.glb
vaultBreakersVaultDoor.ddb7304c.glb
```

These will change when models are rebuilt. Update via the CLI asset pipeline, not by hand.
