# Prompt 05 — 3D Data Visualization (Three.js)

A browser 3D bar-chart visualization: a **6×6 grid (36 bars)** whose heights
animate from random values, are colored by height, can be hover-highlighted,
viewed with an orbit camera, and annotated with readable axis labels.

## Commands

- Install: `npm install`
- Build:   `npm run build`  (runs `tsc --noEmit` typecheck, then `vite build`)
- Run:     `npm run dev -- --port <assigned-port>`  (Vite dev server, host `127.0.0.1`)
- Preview built output: `npm run preview`

## How the required visual evidence is satisfied

- **~36 bars visible** — `GRID = 6`, nested loop builds `6 × 6 = 36`
  individual `Mesh` bars laid out on a centered ground grid (`src/main.ts`).
- **Bar heights vary** — each bar eases toward an independent random target in
  `[MIN_HEIGHT, MAX_HEIGHT]` (`randomTarget()`); heights animate upward from 0
  on load and are re-randomized every 4 s and via the **Randomize heights**
  button. Frame-rate-independent easing (`1 - exp(-4·dt)`) gives a smooth grow.
- **Color corresponds to height** — `heatColor(t)` maps the bar's normalized
  height to a blue→green→yellow→red heatmap via HSL hue
  (`hue = (1 - t) · 0.66`). Color is recomputed every frame as the height
  animates, so short bars are blue and tall bars are red.
- **Axis labels visible and readable** — rendered with `CSS2DRenderer` as crisp
  DOM overlays that always face the screen and stay legible at any zoom:
  - Column tick labels `C1…C6` along the X (front) edge.
  - Row tick labels `R1…R6` along the Z (left) edge.
  - A vertical value axis (a `Line`) at the back corner with numeric ticks
    `0.0 … 6.0`.
  - Axis titles: **Column (X)**, **Row (Z)**, **Value (Y)**.

## Hover-highlight behavior (required documentation)

A `THREE.Raycaster` is cast from the pointer each frame against the bar group:

- On `pointermove` over the canvas, the bar under the cursor is detected. The
  highlighted bar is **brightened** (its base color is lightened in HSL) and
  given an **emissive glow tinted by its own height color**, so it visibly
  stands out from its neighbors.
- A floating tooltip follows the cursor showing the bar's grid coordinate
  (e.g. `C3 · R5`) and its live numeric value.
- When the pointer moves to a different bar, the previous bar is fully restored
  to its height-based color (emissive cleared). Moving the pointer off the
  canvas (`pointerleave`) clears the highlight and hides the tooltip.
- The highlight tracks the bar's animating value, so the displayed number and
  glow update as heights change.

## Camera

`OrbitControls` with damping: left-drag to orbit, scroll to zoom, right-drag to
pan. Polar angle is clamped to keep the camera above the ground plane.

## Assumptions

- Built procedurally per the prompt — **no external assets** are loaded.
- `@types/three@0.165.0` was added to `devDependencies` so the strict
  `tsc --noEmit` typecheck (part of `npm run build`) passes; the runtime
  `three` dependency version is unchanged (`0.165.0`, matching the provided
  context bundle). Addons (`OrbitControls`, `CSS2DRenderer`) are imported via
  the `three/addons/*` path exposed by the three package exports map.
- Lighting uses real-time shadows (`PCFSoftShadowMap`) for depth; this is
  cosmetic and unrelated to the required evidence.
