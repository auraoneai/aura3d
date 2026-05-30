import {
  type AuraApp,
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

const GRID_SIZE = 6;
const BAR_COUNT = GRID_SIZE * GRID_SIZE;
const MIN_HEIGHT = 0.28;
const MAX_HEIGHT = 2.35;
const SPACING = 0.58;
const BAR_WIDTH = 0.36;

type BarDatum = {
  readonly row: number;
  readonly col: number;
  current: number;
  start: number;
  target: number;
};

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

root.innerHTML = `
  <div class="viz-shell">
    <div class="chart-stage" aria-label="Animated 6 by 6 bar chart">
      <div id="aura-canvas-host" class="canvas-host"></div>
      <div class="axis-label axis-x">X Axis: category columns 1-6</div>
      <div class="axis-label axis-z">Z Axis: series rows A-F</div>
      <div class="axis-label axis-y">Height / value</div>
      <div id="hover-readout" class="hover-readout">Hover a bar</div>
      <div class="legend" aria-hidden="true">
        <span>Low</span>
        <span class="swatch low"></span>
        <span class="swatch mid"></span>
        <span class="swatch high"></span>
        <span>High</span>
      </div>
    </div>
  </div>
`;

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  body {
    overflow: hidden;
    background: #071017;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .viz-shell {
    width: 100%;
    height: 100%;
    background:
      radial-gradient(circle at 26% 18%, rgba(66, 211, 255, 0.16), transparent 24%),
      radial-gradient(circle at 76% 26%, rgba(255, 196, 87, 0.13), transparent 26%),
      linear-gradient(145deg, #071017 0%, #0b1419 44%, #10130f 100%);
  }

  .chart-stage {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .canvas-host {
    position: absolute;
    inset: 0;
  }

  .axis-label,
  .hover-readout,
  .legend {
    position: absolute;
    z-index: 3;
    color: #f4fbff;
    background: rgba(5, 11, 14, 0.72);
    border: 1px solid rgba(180, 222, 230, 0.32);
    border-radius: 8px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.28);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(10px);
  }

  .axis-label {
    padding: 8px 11px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .axis-x {
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
  }

  .axis-z {
    left: 26px;
    bottom: 96px;
    transform: rotate(-18deg);
    transform-origin: left center;
  }

  .axis-y {
    top: 72px;
    left: 30px;
  }

  .hover-readout {
    top: 22px;
    right: 22px;
    min-width: 172px;
    padding: 10px 12px;
    font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .legend {
    right: 22px;
    bottom: 28px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 700;
  }

  .swatch {
    width: 22px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.5);
  }

  .low { background: #22c7e8; }
  .mid { background: #ffd166; }
  .high { background: #ef476f; }

  canvas[data-aura3d-canvas="true"] {
    cursor: grab;
  }

  canvas[data-aura3d-canvas="true"].is-hovering-bar {
    cursor: pointer;
  }

  @media (max-width: 720px) {
    .axis-label {
      font-size: 11px;
      padding: 7px 8px;
    }

    .axis-y {
      top: 58px;
      left: 14px;
    }

    .axis-z {
      left: 14px;
      bottom: 82px;
    }

    .hover-readout,
    .legend {
      right: 12px;
    }
  }
`;
document.head.append(style);

const queriedCanvasHost = document.querySelector<HTMLElement>("#aura-canvas-host");
const queriedReadout = document.querySelector<HTMLElement>("#hover-readout");

if (!queriedCanvasHost || !queriedReadout) {
  throw new Error("Missing visualization DOM nodes");
}

const canvasHost = queriedCanvasHost;
const readout = queriedReadout;

const randomHeight = () => MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);

const bars: BarDatum[] = Array.from({ length: BAR_COUNT }, (_, index) => ({
  row: Math.floor(index / GRID_SIZE),
  col: index % GRID_SIZE,
  current: randomHeight(),
  start: MIN_HEIGHT,
  target: randomHeight()
}));

let hoveredIndex = -1;
let app: AuraApp | undefined;
let transitionStart = performance.now();
let transitionDuration = 1800;
let lastRender = 0;
let cameraAngle = Math.PI * 0.22;
let isOrbitDragging = false;
let dragStartX = 0;
let dragStartAngle = cameraAngle;

function normalizeHeight(height: number) {
  return (height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
}

function heightColor(height: number) {
  const t = normalizeHeight(height);
  if (t < 0.5) {
    return mixHex("#22c7e8", "#ffd166", t * 2);
  }

  return mixHex("#ffd166", "#ef476f", (t - 0.5) * 2);
}

function mixHex(from: string, to: string, t: number) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const value = (channelA: number, channelB: number) =>
    Math.round(channelA + (channelB - channelA) * t)
      .toString(16)
      .padStart(2, "0");

  return `#${value(ar, br)}${value(ag, bg)}${value(ab, bb)}`;
}

function easeInOut(t: number) {
  return 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) * 0.5;
}

function makeDataScene() {
  const base = scene()
    .background("#071017")
    .add(primitives.plane({
      name: "matte chart floor",
      material: material.pbr({ color: "#16242a", roughness: 0.68, metallic: 0.08 })
    }).position(0, -0.025, 0).scale([4.3, 1, 4.3]))
    .add(primitives.box({
      name: "x axis rail",
      material: material.emissive({ color: "#d9f8ff", emissive: "#d9f8ff" })
    }).position(0, 0.025, 1.95).scale([3.75, 0.035, 0.035]))
    .add(primitives.box({
      name: "z axis rail",
      material: material.emissive({ color: "#ffd166", emissive: "#ffd166" })
    }).position(-1.95, 0.025, 0).scale([0.035, 0.035, 3.75]))
    .add(primitives.box({
      name: "height axis rail",
      material: material.emissive({ color: "#f4fbff", emissive: "#f4fbff" })
    }).position(-1.95, 1.18, 1.95).scale([0.04, 2.36, 0.04]));

  bars.forEach((bar, index) => {
    const x = (bar.col - (GRID_SIZE - 1) / 2) * SPACING;
    const z = (bar.row - (GRID_SIZE - 1) / 2) * SPACING;
    const isHovered = index === hoveredIndex;
    const color = isHovered ? "#ffffff" : heightColor(bar.current);
    const emissive = isHovered ? "#fff7b3" : heightColor(bar.current);

    base.add(primitives.box({
      name: `data bar ${bar.row + 1}-${bar.col + 1}`,
      material: material.clearcoat({
        color,
        emissive,
        roughness: isHovered ? 0.1 : 0.28,
        metallic: 0.05,
        clearcoat: 0.7
      })
    })
      .position(x, bar.current / 2, z)
      .scale([BAR_WIDTH, bar.current, BAR_WIDTH])
      .animate({ clip: "pulse", speed: 0.35 + normalizeHeight(bar.current) * 0.45 })
      .onPointer({ cursor: "pointer", onHover: "highlight bar and show value" }));

    if (isHovered) {
      base.add(primitives.box({
        name: "hover highlight cap",
        material: material.emissive({ color: "#fff2a8", emissive: "#fff2a8" })
      }).position(x, bar.current + 0.045, z).scale([BAR_WIDTH + 0.12, 0.05, BAR_WIDTH + 0.12]));
    }
  });

  const cameraRadius = 5.35;
  const cameraPosition: [number, number, number] = [
    Math.sin(cameraAngle) * cameraRadius,
    3.05,
    Math.cos(cameraAngle) * cameraRadius
  ];

  return base
    .add(lights.ambient({ intensity: 0.42, color: "#e8fbff" }))
    .add(lights.directional({ position: [2.4, 4.6, 3.2], intensity: 1.55, color: "#ffffff" }))
    .add(lights.point({ name: "warm value rim", position: [-2.2, 2.8, 2.0], intensity: 1.2, color: "#ffd166" }))
    .add(effects.bloom({ intensity: 0.18, color: "#a8efff" }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: cameraPosition, target: [0, 0.88, 0], fov: 43 }))
    .timeline(timeline.loop({ seconds: 8 }));
}

function renderApp() {
  app?.dispose();
  canvasHost.innerHTML = "";
  app = createAuraApp(canvasHost, {
    scene: makeDataScene(),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    diagnostics: false
  });
  app.canvas?.classList.toggle("is-hovering-bar", hoveredIndex >= 0);
}

function updateHoverReadout() {
  if (hoveredIndex < 0) {
    readout.textContent = "Hover a bar";
    return;
  }

  const bar = bars[hoveredIndex];
  readout.textContent = `Column ${bar.col + 1} / Row ${String.fromCharCode(65 + bar.row)} / Value ${bar.current.toFixed(2)}`;
}

function startNextTransition(now: number) {
  transitionStart = now;
  transitionDuration = 1500 + Math.random() * 1100;
  bars.forEach((bar) => {
    bar.start = bar.current;
    bar.target = randomHeight();
  });
}

function tick(now: number) {
  const progress = (now - transitionStart) / transitionDuration;

  if (progress >= 1) {
    bars.forEach((bar) => {
      bar.current = bar.target;
    });
    startNextTransition(now);
  } else {
    const eased = easeInOut(progress);
    bars.forEach((bar) => {
      bar.current = bar.start + (bar.target - bar.start) * eased;
    });
  }

  if (now - lastRender > 180) {
    renderApp();
    updateHoverReadout();
    lastRender = now;
  }

  requestAnimationFrame(tick);
}

function pickBar(clientX: number, clientY: number) {
  const rect = canvasHost.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  if (x < 0.18 || x > 0.82 || y < 0.22 || y > 0.82) {
    return -1;
  }

  const col = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((x - 0.18) / (0.64 / GRID_SIZE))));
  const row = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((y - 0.22) / (0.6 / GRID_SIZE))));

  return row * GRID_SIZE + col;
}

canvasHost.addEventListener("pointermove", (event) => {
  if (isOrbitDragging) {
    cameraAngle = dragStartAngle - (event.clientX - dragStartX) * 0.008;
    renderApp();
    return;
  }

  const nextHover = pickBar(event.clientX, event.clientY);
  if (nextHover === hoveredIndex) {
    return;
  }

  hoveredIndex = nextHover;
  renderApp();
  updateHoverReadout();
});

canvasHost.addEventListener("pointerdown", (event) => {
  isOrbitDragging = true;
  dragStartX = event.clientX;
  dragStartAngle = cameraAngle;
  canvasHost.setPointerCapture(event.pointerId);
  app?.canvas?.classList.remove("is-hovering-bar");
});

canvasHost.addEventListener("pointerup", (event) => {
  isOrbitDragging = false;
  canvasHost.releasePointerCapture(event.pointerId);
});

canvasHost.addEventListener("pointerleave", () => {
  isOrbitDragging = false;

  if (hoveredIndex < 0) {
    return;
  }

  hoveredIndex = -1;
  renderApp();
  updateHoverReadout();
});

window.addEventListener("resize", () => {
  renderApp();
});

bars.forEach((bar) => {
  bar.start = bar.current;
});

renderApp();
requestAnimationFrame(tick);
