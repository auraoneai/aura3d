# 3D Data Visualization — 6×6 Animated Bar Field

An interactive 3D bar chart: a 6×6 grid of 36 bars whose heights continuously
animate from random values, colored by height, with hover-highlight, an orbit
camera, and readable axis labels.

## Commands

```bash
npm install      # install dependencies
npm run build    # typecheck (tsc --noEmit) + production build (vite build)
npm run dev      # dev server (vite) — append -- --port <port> to choose a port
npm run preview  # serve the production build
```

## How it satisfies the prompt

- **36 bars** — a 6×6 grid of box primitives (`barData.ts` → `auraScene.ts`).
- **Heights animate from random values** — each bar starts at a random value and
  eases (frame-rate-independent exponential smoothing) toward a random target;
  targets are re-rolled every ~3.2 s, so the field is always animating.
- **Color corresponds to height** — every bar's color is recomputed each frame
  from its current normalized height via a cool→warm ramp (`palette.ts`): low =
  blue, high = red. The same ramp drives the on-screen legend.
- **Axis labels** — column labels `C1…C6` (X axis), row labels `R1…R6` (Z axis),
  and a vertical value axis `0…100` (Y), plus axis titles. These are crisp DOM
  labels positioned in 3D space via `CSS2DRenderer`, so they stay readable at any
  zoom.
- **Orbit camera** — `OrbitControls`: drag to orbit, scroll to zoom, with a slow
  auto-rotate that pauses while you interact and resumes shortly after.

## Hover-highlight behavior (required documentation)

Pointer position is tracked over the canvas and a `THREE.Raycaster` is cast from
the camera through the cursor against the 36 bar meshes each frame
(`updateHover()` in `src/main.ts`). When the ray intersects a bar:

- the bar is **emphasized**: an emissive glow is applied (emissive color = the
  bar's current height color, `emissiveIntensity` 0.85) and its footprint is
  scaled up ~16 % so it visibly pops out from its neighbors;
- the cursor changes to a pointer;
- a **tooltip** follows the cursor showing the bar's grid coordinates and value,
  e.g. `Col 5 · Row 5` / `Value 82 / 100`.

When the cursor leaves a bar (or the canvas), the bar's emissive/scale are reset
and the tooltip hides. Exactly one bar is highlighted at a time (the nearest ray
hit).

## Architecture / library usage

The scene is **authored with the public `@aura3d/engine` API** in
`src/auraScene.ts` — `scene()`, `primitives.box`/`primitives.plane`, `lights`,
`material`, `camera.orbit`, `interactions.orbit`, `timeline` — producing an
`AuraSceneSnapshot` (the engine's portable "source code is the scene
description" contract).

`src/main.ts` then renders that snapshot through an interactive renderer built on
the same Three.js the engine ships (`three`, declared explicitly in
`package.json`). This split is deliberate: the engine's built-in snapshot
renderer builds meshes once and is static (it does not animate individual nodes,
raycast for hover, or draw text), whereas this prompt requires per-frame height
animation, hover-highlight, interactive orbit, and readable labels. The renderer
consumes the engine-authored snapshot (background, lights, camera, and every bar
node, matched back to its data by node name) so the engine remains the single
source of truth for the scene.

## Assets

None — the visualization is fully procedural (box/plane primitives + lights).
