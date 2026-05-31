# Run Notes — Prompt 05: 3D Data Visualization

A 6×6 grid of 36 bars built procedurally with three.js (baseline arm). No
external assets; the only dependency is the provided trimmed three.js context
bundle.

## Build & run

```bash
cd source
npm install        # links three -> ../context (bundle's package.json exports)
npm run build      # vite build -> dist/   (this is what the harness runs)
npm run preview    # serve the built dist/ locally to view it
# npm run dev      # vite dev server (not run inside the agent per the rules)
```

- Build command: `npm run build`
- Run command: `npm run preview` (or `npm run dev` for the dev server)
- Entry: `index.html` → `src/main.ts`. Result: `dist/` (build verified, exit 0,
  12 modules, ~492 kB bundle = full three.js core linked from the bundle).

## How the required visual evidence is satisfied

- **~36 bars visible** — `N = 6`; a 6×6 nested loop creates exactly 36
  `THREE.Mesh` box bars on a 1.6-unit grid centered at the origin.
- **Heights vary** — each bar's target height is a random value in
  `[0.5 .. 6]` from a seeded, deterministic RNG (seed `20260530`), so the scene
  is reproducible run-to-run.
- **Heights animate from random values** — every bar grows from ~0 to its
  random target over 1.3 s with an ease-out-cubic curve in the render loop.
- **Color corresponds to height** — `heightColor(norm)` maps normalized height
  through a blue → green → red ramp (`THREE.Color.lerp`). Short bars are blue,
  tall bars are red; the bar's material color is set from its own height.
- **Axis labels visible and readable** — canvas-texture `THREE.Sprite` labels
  (procedural, no font assets): axis titles `X axis`, `Z axis`,
  `Height (value)`, numeric ticks `1..6` along the X and Z axes, and height
  ticks `0,2,4,6` along the vertical axis. A `GridHelper` gives a ground
  reference. An HTML legend overlay restates the encoding.

## Hover-highlight behavior (implemented + documented)

Implemented with `THREE.Raycaster` against the 36 bar meshes, driven by a
`pointermove` listener on the canvas:

- The bar under the cursor is **brightened** (its base color lerped 40% toward
  white) and given an **emissive glow** (emissive = base color × 0.6), so it
  visibly stands out from its neighbors.
- A live HTML readout (`#readout`) shows the hovered bar's grid coordinates and
  value, e.g. `Bar (x=3, z=5) — value 4.12`, and the cursor becomes a pointer.
- On moving off a bar (or leaving the canvas) the previous bar's original color
  and zero emissive are restored, so only one bar is highlighted at a time.

## Controls / extras

- **Orbit camera** — `OrbitControls` (from `three/addons`) with damping; drag to
  orbit, scroll to zoom.
- **Press `R`** to re-roll the dataset; bars re-animate from their current
  heights to new random targets and recolor accordingly.

## Assumptions

- This is the three.js baseline arm. The bare specifier `three` is resolved by
  adding `"three": "file:../context"` to `source/package.json`; the bundle's
  `package.json` `exports` map then routes `three` → `build/three.module.js` and
  `three/addons/*` → `examples/jsm/*` (as the bundle README documents). Only
  files inside `source/` were created/edited.
- No `vite.config` is needed — Vite's defaults use `source/index.html` as the
  entry and emit a static `dist/`.
- Scene is deterministic (fixed RNG seed). Labels are rendered procedurally via
  2D-canvas textures to avoid loading any font/asset files.

capture timestamp: 2026-05-31T01:30:11.250Z
agent exit code: 0
install status: 0
compile status: pass
browser status: fail
screenshot timestamp: none
runtime failure: page did not load: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:6405/
Call log:
[2m  - navigating to "http://127.0.0.1:6405/", waiting until "domcontentloaded"[22m
