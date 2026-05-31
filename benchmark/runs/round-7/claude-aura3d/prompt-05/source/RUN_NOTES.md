# Prompt 05 — 3D Data Visualization (Run Notes)

## What was built
A procedural 3D data visualization rendered with `@aura3d/engine` using the
documented data-viz recipe (`docs/agents/benchmark-recipes.md` §05). Entry
point: `src/main.ts`.

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))   // 6x6 = 36 bars
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())                    // orbit camera control
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
});
```

## How the required visual evidence is satisfied
- **~36 bars visible** — `prefabs.dataBars3D({ grid: 6 })` lays out a 6×6 grid
  (36 bars).
- **Bar heights vary** — the prefab seeds each bar from random values and
  animates them up from zero to those heights.
- **Color corresponds to height** — the prefab applies a height-mapped color
  ramp, so taller bars read as a distinct hue from shorter ones.
- **Axis labels visible/readable** — the prefab renders X/Z grid axis labels
  around the base of the chart.
- **Hover-highlight** — the prefab wires pointer hit-testing on the bar meshes;
  the bar under the cursor is highlighted (emphasis/emissive tint) while hovered
  and reverts on pointer-out. `interactions.orbit()` provides the orbit camera
  on top of this.

## Hover-highlight (explicit documentation)
Hover-highlight is provided by the `dataBars3D` prefab's built-in pointer
interaction layer: as the cursor moves over the chart, the bar under the
pointer is visually emphasized and restored when the pointer leaves it. This is
the canonical Aura3D data-viz behavior referenced in `llms.txt` and the
data-viz recipe, used here rather than a hand-rolled raycaster.

## Commands
- Install: `npm install`
- Build:   `npm run build`   (runs `tsc --noEmit` then `vite build`)
- Run:     `npm run dev` (Vite dev server) or `npm run preview` after a build

## Assumptions
- The prompt-05 data-viz recipe is authoritative; only the prompt-required
  shape was used (no custom chart/animation engine), per the benchmark rules.
- `prefabs.dataBars3D` encapsulates the animated random heights, height→color
  mapping, axis labels, and hover-highlight; these were not re-implemented.
