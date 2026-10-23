# Turbo Ball — Aura3D 2v2 Rocket Soccer Arena

**Turbo Ball** is a 2v2 Rocket League-style Car Soccer Arena game built on `@aura3d/engine` 4.0.8 using 10 custom Meshy 3D GLB assets admitted in `src/aura-assets.ts` and `aura.assets.json`.

## Admitted 3D Assets (`src/aura-assets.ts`)

1. `assets.heroCar` — Player-controlled orange rocket soccer car (`3.6 m` length)
2. `assets.greenCar` — Teammate AI lime green rocket soccer car (`3.6 m` length)
3. `assets.rivalCar` — Rival striker AI blue rocket soccer car (`3.6 m` length)
4. `assets.purpleCar` — Rival defender/keeper AI purple rocket soccer car (`3.6 m` length)
5. `assets.stadiumArena` — Enclosed futuristic rocket soccer stadium arena (`64 m × 44 m` pitch)
6. `assets.soccerBall` — Oversized glowing hex-panel match ball (`2.4 m` diameter)
7. `assets.boostPad` — 6 glowing hexagonal boost pickup pads with 8-second respawn cooldowns
8. `assets.refereeDrone` — Hovering referee camera drone tracking the ball above the pitch
9. `assets.floodlightTower` — 4 corner stadium floodlight towers illuminating the arena
10. `assets.trophyCup` — Championship trophy rotating on the pitch-side victory pedestal

## Controls & Mechanics

- **Throttle / Reverse**: `W` / `S` or `ArrowUp` / `ArrowDown`
- **Steer**: `A` / `D` or `ArrowLeft` / `ArrowRight`
- **Rocket Boost**: `ShiftLeft` / `ShiftRight`
- **Power Hop / Dodge Strike**: `Space`
- **Toggle Ball-Cam / Car-Cam**: `C`
- **Reset Match**: `R`

## Build & Verify

```bash
npm run typecheck
npm run build
```
