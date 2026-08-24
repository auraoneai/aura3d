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
| Shift | Sprint |
| J or F | Fire (hitscan). Mouse not required. |
| R | Reload while playing (timed, blocks fire); reset after win/lose |
| T | Reset run |
| P / Esc | Pause |
| Touch D-pad / look pad | Move and look on coarse-pointer/mobile layouts |
| Touch FIRE / RELOAD / PAUSE / RESET | Combat and lifecycle controls on mobile |

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

Modern-feeling: pointer-lock look, sprint, hitscan with muzzle/impact
effects, telegraphed hostile swipes with flinch and death weight, timed
reload with dry-fire deny, in-repo CC0 SFX, low-ammo HUD, pause, reset, and
a compact touch surface, plus a dark corridor with typed GLB subjects. Jump is not a supported mechanic;
walk height stays locked.

Capability incorporations (all route-local, label stays `prototype`):
dynamic debris props that scatter cosmetically on confirmed impacts (NC-A1),
an overlap-sphere backup for pickup collection (NC-A2), sphereCast enemy
line-of-sight so imps cannot aggro through corridor corners (NC-A3),
spring-joint hanging practicals that sway when shots land nearby (NC-A4),
two instanced LOD'd greeble pools along the walls (NC-A5), text3D sector
signage at the junctions (NC-A6), and an ambient-drone audio bus that ducks
on low-ammo/low-HP warnings (NC-A7).

Still prototype: yaw-led follow camera (pitch is hitscan-accurate),
proximity-rush enemy AI with an authored alarm (no nav mesh), hostiles pass
through the player capsule (touch damage is proximity-authored), no
bloom/SSAO/WebGPU claim, and catalog medkit is a gurney rather than a packed
aid kit. Audio cues are synthesized in-repo (CC0) by
`scripts/build-sfx.mjs` and registered through the asset CLI. See
`KNOWN-LIMITS.md`.

## Verify

The playable evidence gate is the monorepo spec (uses `example-dev-server`):

```bash
pnpm exec playwright test tests/browser/neon-corridor-strike.spec.ts --reporter=line
pnpm exec playwright test tests/browser/neon-corridor-strike-{modes,pause-reset,quality,touch}.spec.ts --workers=1
pnpm exec playwright test tests/browser/neon-corridor-strike-endurance.spec.ts --workers=1
```

These specs write desktop/mobile first-load, shot, pickup, alarm/damage,
win/fail, reduced-mode, touch, pause/reset, pixel-diversity, frame-pacing, and
route-health evidence under `tests/reports/neon-corridor-strike*/`. The
endurance spec drives real input for at least 60 seconds and writes the
before/after interaction recording to
`tests/reports/neon-corridor-strike-endurance/ui-composition-before-after.webm`;
its exact duration, gameplay counters, and video SHA-256 are bound in the
adjacent `endurance.json`.

From this folder, asset and deploy checks:

```bash
node ../../packages/aura3d-cli/dist/cli.js assets validate
node ../../packages/aura3d-cli/dist/cli.js check-deploy --dist dist
```

Project-local `npm run test` starts Vite against the same specs. First compile
of the corridor GLBs is slow; prefer the monorepo spec above.
