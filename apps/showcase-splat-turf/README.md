# Splat Turf

A finite 1200 m paint-the-road arcade runner on Aura3D. Drag to steer a paint ball down a white
carnival road: painting is always on, the tank drains as you roll, and paint cans (+35), solvent
strips (−20, wipes a lane) and eraser bots (−15, wipes your last 15 m) decide whether you finish.
Every 25 m stretch with ≥80% coverage builds the combo multiplier; the run ends at 1200 m with a
coverage grade (S ≥85 / A ≥70 / B ≥50 / C) — or earlier when the tank runs dry.

## Controls

- Drag (pointer) or ← → / A D to steer
- P / Esc pause, M mute; Space / Enter start and restart
- Reduced-motion toggle on the splash (follows the OS setting until changed)

## Development

```bash
pnpm --dir apps/showcase-splat-turf dev        # 127.0.0.1:5200 (strictPort)
pnpm --dir apps/showcase-splat-turf typecheck
pnpm --dir apps/showcase-splat-turf build
node apps/showcase-splat-turf/scripts/write-route-health.mjs
```

QA hooks: `window.__AURA_SPLAT_TURF__` (`?manual=1&seed=N&autopilot=1` supported).

## Evidence

`evidence/splat-turf/README.md` pins the claim label and capture method; remote captures land there
in WP-8. Claim label: **prototype / bounded, playable** — software-GL evidence only, no real-GPU or
pixel-parity claims.