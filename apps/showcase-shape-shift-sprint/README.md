# Shape Shift Sprint

An endless shape-matching runner on Aura3D. Sprint a shape-shifting toy (red sphere, yellow cube,
blue cone) down a warm cream road under a bright day sky: each oncoming wall carries all three
shaped holes in a shuffled lane order, so exactly one hole always fits your current form. Steer
through the matching hole to grow, speed up, and build the combo multiplier; grab morph, wildcard,
shield, and x2 tokens along the road; and survive with three lives.

Route: `/apps/showcase-shape-shift-sprint/` (live at <https://aura3d.auraone.ai/apps/showcase-shape-shift-sprint/>).
`?autoplay=1` (aliases `?autopilot=1`, `?autostart=1`) skips the title and lets the computer play.
Since the 5.6.0 Idol pass the landmark islands, rival vehicles and roadside props are fal Idol image-to-3D GLBs (`speridlabs/idol/max`; spec `tools/idol/specs/shape-shift-sprint.json`, files and provenance in `assets/idol/`); the rest stays native `@aura3d/engine` procedural geometry.

## Controls

- Drag (pointer) or ← → / A D to steer across the three lanes
- Space / Enter to start and restart
- P / Esc pause, M mute, C shape-symbol overlay
- Reduced-motion and shape-symbol toggles on the splash screen

## Mechanics

- **Shapes & walls:** Every wall row has all three holes (`sphere`, `cube`, `cone`) shuffled across
  lanes `[-2.3, 0, 2.3]`. Fitting within `|laneOffset − laneX| < 1.2` awards `+40 × mult` (`+60 × mult`
  within the `0.55` perfect window), increments combo (`mult = 1 + ⌊combo / 3⌋`, capped at `5×`), and
  grows the player.
- **Tokens:** `morph` swaps to a different shape with a confetti burst (existing walls keep their
  holes, and the matching hole is always present); `wildcard` lets any hole fit for 5 s; `shield`
  blocks one mismatch; `x2` doubles gate points for 7 s.
- **Milestones & fail state:** Every `750` points awards a `+100` milestone bonus. A mismatch without
  a shield costs one life, shrinks the player, and resets combo; losing all 3 lives triggers a
  `1.15 s` burst into game over.

## Development

```bash
pnpm --dir apps/showcase-shape-shift-sprint dev        # 127.0.0.1:5198 (strictPort)
pnpm --dir apps/showcase-shape-shift-sprint typecheck
pnpm --dir apps/showcase-shape-shift-sprint build
node apps/showcase-shape-shift-sprint/scripts/write-route-health.mjs
```

QA hooks: `window.__AURA_SHAPE_SHIFT__` (`?manual=1&seed=N&autoplay=1` supported).

## Evidence

`evidence/shape-shift-sprint/README.md` pins the claim label and capture method; final screenshots from the 5.6.0
real-GPU QA pass are in `evidence/shape-shift-sprint/screens/final`. Catalog verification: `playable`; no
pixel-parity claims.
