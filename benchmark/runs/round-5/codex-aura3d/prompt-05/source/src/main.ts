import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

import "./style.css";

const grid = 6;
const spacing = 0.56;
const barFootprint = 0.34;
const minHeight = 0.28;
const maxHeight = 1.95;

const palette = ["#3b82f6", "#22c55e", "#facc15", "#f97316", "#ef4444"];

function seededHeight(index: number) {
  const raw = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  const normalized = raw - Math.floor(raw);
  return minHeight + normalized * (maxHeight - minHeight);
}

function colorForHeight(height: number) {
  const normalized = (height - minHeight) / (maxHeight - minHeight);
  return palette[Math.min(palette.length - 1, Math.floor(normalized * palette.length))];
}

const bars = Array.from({ length: grid * grid }, (_, index) => {
  const row = Math.floor(index / grid);
  const col = index % grid;
  const height = seededHeight(index);
  const x = (col - (grid - 1) / 2) * spacing;
  const z = (row - (grid - 1) / 2) * spacing;
  const label = `bar ${col + 1},${row + 1} height ${height.toFixed(2)}`;

  return primitives
    .box({
      name: label,
      material: material.clearcoat({
        color: colorForHeight(height),
        roughness: 0.32,
        clearcoat: 0.6
      })
    })
    .position(x, height / 2, z)
    .scale([barFootprint, height, barFootprint])
    .animate({ clip: "pulse", speed: 0.28 + ((index * 7) % 11) * 0.045 })
    .onPointer({ cursor: "pointer", onHover: `highlight ${label}` })
    .toJSON();
});

document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML(
  "afterend",
  `
    <div class="chart-ui" aria-hidden="false">
      <div class="axis axis-y">Height</div>
      <div class="axis axis-x">X Category</div>
      <div class="axis axis-z">Z Category</div>
      <div class="legend" aria-label="Height color scale">
        <span>Low</span>
        <i class="swatch swatch-low"></i>
        <i class="swatch swatch-mid"></i>
        <i class="swatch swatch-high"></i>
        <span>High</span>
      </div>
      <div class="hover-note" id="hover-note">Hover a bar cell to highlight and read value</div>
      <div class="hover-grid" id="hover-grid" aria-label="6 by 6 hover targets"></div>
    </div>
  `
);

const hoverGrid = document.querySelector<HTMLDivElement>("#hover-grid")!;
const hoverNote = document.querySelector<HTMLDivElement>("#hover-note")!;

bars.forEach((bar, index) => {
  const cell = document.createElement("button");
  const row = Math.floor(index / grid);
  const col = index % grid;
  const height = seededHeight(index);
  cell.type = "button";
  cell.className = "hover-cell";
  cell.ariaLabel = `Highlight bar ${col + 1}, ${row + 1}`;
  cell.addEventListener("pointerenter", () => {
    hoverNote.textContent = `Highlighted bar ${col + 1}, ${row + 1}: height ${height.toFixed(2)}`;
  });
  cell.addEventListener("pointerleave", () => {
    hoverNote.textContent = "Hover a bar cell to highlight and read value";
  });
  hoverGrid.append(cell);
});

createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(bars)
    .add(
      primitives
        .plane({ name: "data grid floor", material: material.pbr({ color: "#10202a", roughness: 0.8 }) })
        .position(0, -0.02, 0)
        .scale([4.1, 1, 4.1])
    )
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .add(interactions.pointer())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
    .timeline(timeline.loop({ seconds: 5 }))
});
