import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

type BarDatum = {
  readonly row: number;
  readonly col: number;
  readonly normalized: number;
  readonly height: number;
  readonly color: string;
};

const gridSize = 6;
const barSpacing = 0.62;
const barWidth = 0.38;

const colorStops = [
  [0.0, "#1d4ed8"],
  [0.34, "#14b8a6"],
  [0.68, "#facc15"],
  [1.0, "#f97316"]
] as const;

function hexToRgb(hex: string): readonly [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16)
  ];
}

function rgbToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function colorByHeight(value: number): string {
  const upperIndex = colorStops.findIndex(([stop]) => value <= stop);
  const start = colorStops[Math.max(0, upperIndex - 1)];
  const end = colorStops[upperIndex === -1 ? colorStops.length - 1 : upperIndex];
  const span = Math.max(0.001, end[0] - start[0]);
  const local = Math.min(1, Math.max(0, (value - start[0]) / span));
  const a = hexToRgb(start[1]);
  const b = hexToRgb(end[1]);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * local,
    a[1] + (b[1] - a[1]) * local,
    a[2] + (b[2] - a[2]) * local
  ]);
}

function makeData(): readonly BarDatum[] {
  return Array.from({ length: gridSize * gridSize }, (_, index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const normalized = 0.12 + Math.random() * 0.88;
    const height = 0.28 + normalized * 2.25;
    return {
      row,
      col,
      normalized,
      height,
      color: colorByHeight(normalized)
    };
  });
}

const data = makeData();
const bars = data.map((datum) => {
  const x = (datum.col - (gridSize - 1) / 2) * barSpacing;
  const z = (datum.row - (gridSize - 1) / 2) * barSpacing;
  const valueLabel = Math.round(datum.normalized * 100);

  return primitives
    .box({
      name: `hoverable height-colored data bar ${datum.row + 1}-${datum.col + 1}: ${valueLabel}`,
      material: material.clearcoat({
        color: datum.color,
        emissive: datum.color,
        roughness: 0.22,
        clearcoat: 0.68
      })
    })
    .position(x, datum.height / 2, z)
    .scale([barWidth, datum.height, barWidth])
    .animate({ clip: "pulse", speed: 0.24 + datum.normalized * 0.42 })
    .onPointer({
      cursor: "pointer",
      onHover: `highlight bar ${datum.row + 1}-${datum.col + 1} and show ${valueLabel}`
    })
    .toJSON();
});

const chartScene = scene()
  .background("#071017")
  .add(
    primitives
      .plane({
        name: "matte data visualization floor",
        material: material.pbr({ color: "#17242c", roughness: 0.72, metallic: 0.06 })
      })
      .position(0, -0.03, 0)
      .scale([4.55, 1, 4.55])
  )
  .add(
    primitives
      .box({
        name: "x axis rail",
        material: material.emissive({ color: "#d9f8ff", emissive: "#d9f8ff" })
      })
      .position(0, 0.035, 2.05)
      .scale([3.9, 0.04, 0.04])
  )
  .add(
    primitives
      .box({
        name: "z axis rail",
        material: material.emissive({ color: "#ffd166", emissive: "#ffd166" })
      })
      .position(-2.05, 0.035, 0)
      .scale([0.04, 0.04, 3.9])
  )
  .add(
    primitives
      .box({
        name: "height axis rail",
        material: material.emissive({ color: "#f4fbff", emissive: "#f4fbff" })
      })
      .position(-2.05, 1.28, 2.05)
      .scale([0.045, 2.55, 0.045])
  )
  .addMany(bars)
  .add(lights.ambient({ intensity: 0.35, color: "#d7f5ff" }))
  .add(lights.directional({ position: [3, 5, 4], intensity: 1.45, color: "#ffffff" }))
  .add(lights.point({ name: "warm chart rim light", position: [-2.4, 2.4, 2.2], intensity: 1.15, color: "#ffd166" }))
  .add(effects.bloom({ intensity: 0.2, color: "#8ee8ff" }))
  .add(interactions.orbit())
  .camera(camera.orbit({ distance: 5.6, target: [0, 1.0, 0] }));

root.innerHTML = `
  <div class="chart-shell">
    <div class="axis-label axis-x">X category</div>
    <div class="axis-label axis-z">Z category</div>
    <div class="axis-label axis-y">Height / value</div>
    <div class="hover-panel" aria-live="polite">Hover a bar: highlight + value readout</div>
    <div class="hover-grid" aria-label="6 by 6 bar hover targets"></div>
  </div>
`;

const shell = root.querySelector<HTMLElement>(".chart-shell");
const hoverGrid = root.querySelector<HTMLElement>(".hover-grid");
const hoverPanel = root.querySelector<HTMLElement>(".hover-panel");

if (!shell || !hoverGrid || !hoverPanel) {
  throw new Error("Chart UI failed to initialize.");
}

const app = createAuraApp(shell, {
  diagnostics: false,
  scene: chartScene
});

for (const datum of data) {
  const cell = document.createElement("button");
  cell.className = "hover-cell";
  cell.type = "button";
  cell.style.gridColumn = String(datum.col + 1);
  cell.style.gridRow = String(datum.row + 1);
  cell.ariaLabel = `Bar row ${datum.row + 1}, column ${datum.col + 1}, value ${Math.round(datum.normalized * 100)}`;

  cell.addEventListener("mouseenter", () => {
    hoverPanel.textContent = `Highlighted bar R${datum.row + 1} C${datum.col + 1}: ${Math.round(datum.normalized * 100)}`;
    hoverPanel.style.borderColor = datum.color;
    hoverPanel.style.boxShadow = `0 0 0 2px ${datum.color}55, 0 16px 40px rgba(0,0,0,0.32)`;
  });

  cell.addEventListener("mouseleave", () => {
    hoverPanel.textContent = "Hover a bar: highlight + value readout";
    hoverPanel.style.borderColor = "rgba(210, 235, 255, 0.38)";
    hoverPanel.style.boxShadow = "0 16px 40px rgba(0,0,0,0.32)";
  });

  hoverGrid.append(cell);
}

window.addEventListener("resize", () => {
  if (!app.canvas) return;
  app.canvas.width = Math.round(shell.clientWidth * Math.min(2, window.devicePixelRatio || 1));
  app.canvas.height = Math.round(shell.clientHeight * Math.min(2, window.devicePixelRatio || 1));
});

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #071017;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .chart-shell {
    position: relative;
    width: 100vw;
    height: 100vh;
  }

  .chart-shell canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .axis-label,
  .hover-panel {
    position: absolute;
    z-index: 3;
    color: #f8fbff;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.82);
    letter-spacing: 0;
    pointer-events: none;
  }

  .axis-label {
    font-size: clamp(13px, 1.45vw, 18px);
    font-weight: 800;
    padding: 5px 9px;
    border-radius: 6px;
    background: rgba(3, 10, 16, 0.56);
    border: 1px solid rgba(210, 235, 255, 0.3);
    white-space: nowrap;
  }

  .axis-x {
    left: 60%;
    bottom: 12%;
    color: #d9f8ff;
  }

  .axis-z {
    left: 18%;
    bottom: 20%;
    color: #ffd166;
  }

  .axis-y {
    left: 9%;
    top: 19%;
    color: #f4fbff;
  }

  .hover-panel {
    top: 18px;
    left: 18px;
    min-width: 250px;
    max-width: calc(100vw - 36px);
    box-sizing: border-box;
    font-size: 14px;
    font-weight: 750;
    padding: 10px 12px;
    border-radius: 7px;
    background: rgba(4, 12, 18, 0.78);
    border: 1px solid rgba(210, 235, 255, 0.38);
    box-shadow: 0 16px 40px rgba(0,0,0,0.32);
  }

  .hover-grid {
    position: absolute;
    z-index: 4;
    left: 28%;
    top: 21%;
    width: min(45vw, 520px);
    height: min(48vh, 430px);
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(6, 1fr);
    transform: skewX(-13deg) rotate(-2deg);
    pointer-events: auto;
  }

  .hover-cell {
    appearance: none;
    border: 0;
    background: transparent;
    margin: 0;
    padding: 0;
    cursor: pointer;
  }

  .hover-cell:hover,
  .hover-cell:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.92);
    outline-offset: -4px;
    background: rgba(255, 255, 255, 0.14);
  }

  @media (max-width: 720px) {
    .axis-x {
      left: 54%;
      bottom: 15%;
    }

    .axis-z {
      left: 10%;
      bottom: 24%;
    }

    .axis-y {
      left: 5%;
      top: 23%;
    }

    .hover-grid {
      left: 16%;
      top: 26%;
      width: 68vw;
      height: 40vh;
    }
  }
`;

document.head.append(style);
