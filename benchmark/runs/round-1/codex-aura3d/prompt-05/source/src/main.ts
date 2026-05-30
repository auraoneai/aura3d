import {
  createAuraApp,
  camera,
  interactions,
  lights,
  material,
  primitives,
  scene,
  type AuraApp,
  type AuraSceneBuilder,
} from "@aura3d/engine";

type BarDatum = {
  readonly row: number;
  readonly col: number;
  readonly seed: number;
  readonly start: number;
  readonly target: number;
};

const gridSize = 6;
const cellGap = 0.82;
const barWidth = 0.46;
const chartOrigin = ((gridSize - 1) * cellGap) / -2;
const minHeight = 0.35;
const maxHeight = 2.65;
const target = [0, 0.8, 0] as const;

let app: AuraApp | undefined;
let hoveredIndex = -1;
let orbitAngle = -0.72;
let orbitElevation = 4.2;
let lastRenderBucket = -1;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartAngle = orbitAngle;
let dragStartElevation = orbitElevation;

const host = document.querySelector<HTMLDivElement>("#app");

if (!host) {
  throw new Error("Missing #app container");
}

host.innerHTML = `
  <canvas id="chart-canvas" aria-label="Animated 6 by 6 3D bar chart"></canvas>
  <div class="chart-title">3D Data Visualization</div>
  <div class="axis-label axis-x">X Groups 0-5</div>
  <div class="axis-label axis-z">Z Groups 0-5</div>
  <div class="axis-label axis-y">Height</div>
  <div class="tick-strip tick-x">0&nbsp;&nbsp;1&nbsp;&nbsp;2&nbsp;&nbsp;3&nbsp;&nbsp;4&nbsp;&nbsp;5</div>
  <div class="tick-strip tick-z">0&nbsp;&nbsp;1&nbsp;&nbsp;2&nbsp;&nbsp;3&nbsp;&nbsp;4&nbsp;&nbsp;5</div>
  <div class="legend">
    <span>Low</span>
    <div class="legend-ramp"></div>
    <span>High</span>
  </div>
  <div id="hover-readout" class="hover-readout">Hover a bar</div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#chart-canvas");
const hoverReadout = document.querySelector<HTMLDivElement>("#hover-readout");

if (!canvas || !hoverReadout) {
  throw new Error("Chart controls failed to initialize");
}

const chartCanvas: HTMLCanvasElement = canvas;
const readout: HTMLDivElement = hoverReadout;

const data: BarDatum[] = Array.from({ length: gridSize * gridSize }, (_, index) => {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  const seed = seeded(row * 19.13 + col * 47.71);
  return {
    row,
    col,
    seed,
    start: 0.18 + seeded(seed * 11.8) * 1.3,
    target: minHeight + seeded(seed * 29.4 + 2.7) * (maxHeight - minHeight),
  };
});

const style = document.createElement("style");
style.textContent = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  body {
    margin: 0;
    overflow: hidden;
    background: #071016;
  }

  #app {
    position: fixed;
    inset: 0;
    min-width: 320px;
    min-height: 240px;
    background: #071016;
  }

  #chart-canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
  }

  #chart-canvas.dragging {
    cursor: grabbing;
  }

  .chart-title,
  .axis-label,
  .tick-strip,
  .legend,
  .hover-readout {
    position: absolute;
    z-index: 4;
    color: #f5fbff;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.72);
    pointer-events: none;
    user-select: none;
  }

  .chart-title {
    top: 20px;
    left: 24px;
    font-size: 22px;
    font-weight: 750;
  }

  .axis-label {
    padding: 5px 8px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(5, 14, 20, 0.64);
    font-size: 14px;
    font-weight: 700;
    border-radius: 6px;
  }

  .axis-x {
    right: 20%;
    bottom: 12%;
  }

  .axis-z {
    left: 19%;
    bottom: 17%;
    transform: rotate(-18deg);
  }

  .axis-y {
    left: 7%;
    top: 31%;
    transform: rotate(-90deg);
    transform-origin: left center;
  }

  .tick-strip {
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0;
    color: #cde7f7;
  }

  .tick-x {
    right: 18%;
    bottom: 8%;
  }

  .tick-z {
    left: 15%;
    bottom: 10%;
    transform: rotate(-18deg);
  }

  .legend {
    right: 22px;
    top: 22px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 700;
  }

  .legend-ramp {
    width: 112px;
    height: 12px;
    border: 1px solid rgba(255, 255, 255, 0.32);
    background: linear-gradient(90deg, #2f80ed, #20c997, #f9c74f, #ff5a5f);
    border-radius: 4px;
  }

  .hover-readout {
    left: 24px;
    bottom: 22px;
    min-width: 190px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(5, 14, 20, 0.7);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 650;
  }

  @media (max-width: 680px) {
    .chart-title {
      font-size: 18px;
      left: 14px;
      top: 14px;
    }

    .legend {
      right: 12px;
      top: 52px;
      font-size: 12px;
    }

    .legend-ramp {
      width: 76px;
    }

    .axis-label {
      font-size: 12px;
      padding: 4px 6px;
    }

    .axis-y {
      left: 9%;
      top: 36%;
    }

    .hover-readout {
      left: 14px;
      bottom: 14px;
    }
  }
`;
document.head.append(style);

chartCanvas.addEventListener("pointermove", (event) => {
  if (isDragging) {
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    orbitAngle = dragStartAngle + dx * 0.008;
    orbitElevation = clamp(dragStartElevation + dy * 0.012, 2.55, 5.8);
    return;
  }

  const nextHovered = pickBarFromPointer(event);
  if (nextHovered !== hoveredIndex) {
    hoveredIndex = nextHovered;
    lastRenderBucket = -1;
    updateHoverReadout();
  }
});

chartCanvas.addEventListener("pointerdown", (event) => {
  isDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartAngle = orbitAngle;
  dragStartElevation = orbitElevation;
  chartCanvas.classList.add("dragging");
  chartCanvas.setPointerCapture(event.pointerId);
});

chartCanvas.addEventListener("pointerup", (event) => {
  isDragging = false;
  chartCanvas.classList.remove("dragging");
  chartCanvas.releasePointerCapture(event.pointerId);
});

chartCanvas.addEventListener("pointerleave", () => {
  if (!isDragging && hoveredIndex !== -1) {
    hoveredIndex = -1;
    lastRenderBucket = -1;
    updateHoverReadout();
  }
});

function animate(time: number) {
  const bucket = Math.floor(time / 120);
  if (bucket !== lastRenderBucket || isDragging) {
    lastRenderBucket = bucket;
    renderChart(time / 1000);
  }
  requestAnimationFrame(animate);
}

function renderChart(seconds: number) {
  app?.dispose();
  app = createAuraApp(chartCanvas, {
    scene: buildChartScene(seconds, hoveredIndex),
    diagnostics: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    autoStart: false,
  });
}

function buildChartScene(seconds: number, activeIndex: number): AuraSceneBuilder {
  const eyeDistance = 7.2;
  const eyeX = Math.sin(orbitAngle) * eyeDistance;
  const eyeZ = Math.cos(orbitAngle) * eyeDistance;
  const nextScene = scene()
    .background("#071016")
    .camera(camera.perspective({ position: [eyeX, orbitElevation, eyeZ], target, fov: 42 }))
    .add(primitives.plane({
      name: "dark chart floor",
      material: material.pbr({ color: "#10202a", roughness: 0.72, metallic: 0.05 }),
    }).position(0, -0.035, 0).scale([5.9, 1, 5.9]))
    .add(primitives.box({
      name: "X axis line",
      material: material.emissive({ color: "#b8eef7", emissive: "#b8eef7" }),
    }).position(0, 0.035, 2.72).scale([5.35, 0.035, 0.035]))
    .add(primitives.box({
      name: "Z axis line",
      material: material.emissive({ color: "#ffc86b", emissive: "#ffc86b" }),
    }).position(-2.72, 0.035, 0).scale([0.035, 0.035, 5.35]))
    .add(primitives.box({
      name: "Height axis line",
      material: material.emissive({ color: "#eaf6ff", emissive: "#eaf6ff" }),
    }).position(-2.72, 1.32, 2.72).scale([0.035, 2.72, 0.035]))
    .add(lights.ambient({ intensity: 0.22, color: "#e6fbff" }))
    .add(lights.directional({ position: [3.2, 5.6, 4.1], intensity: 1.45, color: "#ffffff" }))
    .add(lights.point({ name: "cool chart rim", position: [-3.2, 3.2, -2.6], intensity: 1.6, color: "#58d9ff" }))
    .add(interactions.orbit());

  for (let col = 0; col < gridSize; col += 1) {
    const x = chartOrigin + col * cellGap;
    nextScene.add(primitives.box({
      name: `X tick ${col}`,
      material: material.emissive({ color: "#8edff0", emissive: "#8edff0" }),
    }).position(x, 0.045, 2.72).scale([0.035, 0.075, 0.2]));
  }

  for (let row = 0; row < gridSize; row += 1) {
    const z = chartOrigin + row * cellGap;
    nextScene.add(primitives.box({
      name: `Z tick ${row}`,
      material: material.emissive({ color: "#ffd180", emissive: "#ffd180" }),
    }).position(-2.72, 0.045, z).scale([0.2, 0.075, 0.035]));
  }

  data.forEach((datum, index) => {
    const height = currentHeight(datum, seconds);
    const normalized = (height - minHeight) / (maxHeight - minHeight);
    const isActive = index === activeIndex;
    const x = chartOrigin + datum.col * cellGap;
    const z = chartOrigin + datum.row * cellGap;
    const color = isActive ? "#ffffff" : heightColor(normalized);
    const emissive = isActive ? "#fff3b0" : normalized > 0.72 ? color : undefined;

    nextScene.add(primitives.box({
      name: `bar row ${datum.row} col ${datum.col} height ${height.toFixed(2)}`,
      material: material.pbr({
        color,
        roughness: isActive ? 0.24 : 0.44,
        metallic: isActive ? 0.22 : 0.08,
        ...(emissive ? { emissive } : {}),
      }),
    }).position(x, height / 2, z).scale([isActive ? barWidth * 1.18 : barWidth, height, isActive ? barWidth * 1.18 : barWidth]));

    if (isActive) {
      nextScene.add(primitives.sphere({
        name: "hover highlight cap",
        material: material.emissive({ color: "#fff3b0", emissive: "#fff3b0" }),
      }).position(x, height + 0.13, z).scale([0.26, 0.08, 0.26]));
    }
  });

  return nextScene;
}

function updateHoverReadout() {
  if (hoveredIndex < 0) {
    readout.textContent = "Hover a bar";
    return;
  }

  const datum = data[hoveredIndex];
  readout.textContent = `Hover highlight: X ${datum.col}, Z ${datum.row}, animated height`;
}

function pickBarFromPointer(event: PointerEvent): number {
  const rect = chartCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / Math.max(1, rect.width);
  const y = (event.clientY - rect.top) / Math.max(1, rect.height);

  const col = clamp(Math.floor((x - 0.23) / 0.09), 0, gridSize - 1);
  const row = clamp(Math.floor((y - 0.25) / 0.075), 0, gridSize - 1);
  const inChartBand = x > 0.2 && x < 0.8 && y > 0.22 && y < 0.74;

  return inChartBand ? row * gridSize + col : -1;
}

function currentHeight(datum: BarDatum, seconds: number): number {
  const wave = (Math.sin(seconds * 1.15 + datum.seed * Math.PI * 2) + 1) / 2;
  const eased = 0.5 - Math.cos(wave * Math.PI) * 0.5;
  const animatedTarget = minHeight + ((datum.target - minHeight) * (0.74 + 0.26 * Math.sin(seconds * 0.47 + datum.row))) / 1.02;
  return clamp(datum.start + (animatedTarget - datum.start) * eased, minHeight, maxHeight);
}

function heightColor(value: number): string {
  if (value < 0.34) {
    return mixHex("#2f80ed", "#20c997", value / 0.34);
  }

  if (value < 0.68) {
    return mixHex("#20c997", "#f9c74f", (value - 0.34) / 0.34);
  }

  return mixHex("#f9c74f", "#ff5a5f", (value - 0.68) / 0.32);
}

function mixHex(a: string, b: string, amount: number): string {
  const av = parseInt(a.slice(1), 16);
  const bv = parseInt(b.slice(1), 16);
  const ar = (av >> 16) & 255;
  const ag = (av >> 8) & 255;
  const ab = av & 255;
  const br = (bv >> 16) & 255;
  const bg = (bv >> 8) & 255;
  const bb = bv & 255;
  const t = clamp(amount, 0, 1);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(blue)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function seeded(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

updateHoverReadout();
renderChart(0);
requestAnimationFrame(animate);
