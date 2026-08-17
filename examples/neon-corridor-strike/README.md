# Neon Corridor Strike

Capability label: **`prototype`**

A browser first-person shooter inspired by DOOM: a dark sci-fi corridor, hitscan
combat, ammo scarcity, enemy pressure, pointer-lock look, and a DOM HUD. Built
on the public `@aura3d/engine` surface (`createAuraApp`, `app.physics`,
`game.input`). There is no `game.shooter()` kit.

This is not DOOM parity, not a commercial FPS engine, and not a Unity/Unreal
replacement.

## Controls

| Input | Action |
| --- | --- |
| Click canvas | Pointer lock / start |
| WASD | Move |
| Mouse | Look |
| Space | Jump |
| Shift | Sprint |
| J or F | Fire (hitscan). Mouse not required. |
| R | Reload while playing; reset after win/lose |
| T | Reset run |
| P / Esc | Pause |

## Objective

Clear all four hostiles or reach the exit sensor. Lose when HP reaches 0.
Reset always restores the baseline run.

## Thumbnail

`thumbnail.webp` is a live canvas capture of the corridor from the first-person
view. It is the examples-gallery poster, not renderer-quality proof.

## Typed assets

CLI-resolved, license-verified GLB assets in `aura.assets.json`:

- `arena` — Sci-fi Spaceship Corridor (J4747, CC-BY-4.0)
- `impA` — Horror Creature (Emi De Vogelaere, CC-BY-4.0)
- `impB` — Pig Demon (Lexington Dath, CC-BY-4.0)
- `pulseRifle` — Sci Fi Weapon / Rifle (gbarzu, CC-BY-4.0)
- `ammoCrate` — Old Ammo Crate (Geoffroy.Sainte.Catherine, CC-BY-4.0)
- `medkit` — medical gurney prop stand-in (Ellie, CC-BY-4.0)

## What feels modern vs what stays prototype

Modern-feeling: pointer-lock look, sprint/jump, hitscan with muzzle/impact
effects, low-ammo HUD, pause, reset, and a dark corridor with typed GLB
subjects.

Still prototype: yaw-led follow camera (pitch is hitscan-accurate),
distance-only enemy AI, no nav mesh, no bloom/SSAO/WebGPU claim, and catalog
medkit is a gurney rather than a packed aid kit. See `KNOWN-LIMITS.md`.

## Verify

The playable evidence gate is the monorepo spec (uses `example-dev-server`):

```bash
pnpm exec playwright test tests/browser/neon-corridor-strike.spec.ts --reporter=line
```

That spec writes first-load, mid-combat, after-kill, win, death, death-reset,
and reset screenshots plus `route-health.json` under
`tests/reports/neon-corridor-strike/`.

From this folder, asset and deploy checks:

```bash
node ../../packages/aura3d-cli/dist/cli.js assets validate
node ../../packages/aura3d-cli/dist/cli.js check-deploy --dist dist
```

Project-local `npm run test` starts Vite against the same specs. First compile
of the corridor GLBs is slow; prefer the monorepo spec above.
