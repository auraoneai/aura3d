import { Geometry, PBRMaterial, Renderer, UnlitMaterial, type RenderDeviceDiagnostics, type RenderItem } from "@galileo3d/rendering";

type Zone = {
  name: string;
  areaSqm: number;
  color: readonly [number, number, number, number];
};

type DemoStatus = {
  id: string;
  status: "ready" | "error";
  renderer: "webgl2";
  selectedZone: string;
  measurements: { areaSqm: number; spanMeters: number };
  interactions: number;
  metrics: Record<string, number | string | boolean>;
  diagnostics?: RenderDeviceDiagnostics;
  error?: string;
};

declare global {
  interface Window {
    __GALILEO3D_ARCHITECTURE_DEMO__?: DemoStatus;
  }
}

const zones: Zone[] = [
  { name: "atrium", areaSqm: 420, color: [0.22, 0.72, 0.95, 1] },
  { name: "gallery", areaSqm: 310, color: [0.86, 0.72, 0.34, 1] },
  { name: "studio", areaSqm: 260, color: [0.52, 0.82, 0.48, 1] },
];

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_ARCHITECTURE_DEMO__ = {
      id: "architecture-viewer",
      status: "error",
      renderer: "webgl2",
      selectedZone: zones[0].name,
      measurements: { areaSqm: 0, spanMeters: 0 },
      interactions: 0,
      metrics: {},
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status } = createShell();
  const resize = () => resizeCanvas(canvas);
  resize();
  window.addEventListener("resize", resize);

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.02, 0.026, 0.032, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });

  let selectedZoneIndex = 0;
  let interactions = 0;
  let lastFrame = performance.now();
  let frameMs = 0;
  let diagnostics: RenderDeviceDiagnostics | undefined;

  canvas.addEventListener("pointerdown", (event) => {
    const thirds = canvas.clientWidth / zones.length;
    selectedZoneIndex = Math.max(0, Math.min(zones.length - 1, Math.floor(event.offsetX / thirds)));
    interactions += 1;
  });

  const render = (time: number) => {
    frameMs = frameMs * 0.85 + (time - lastFrame) * 0.15;
    lastFrame = time;
    diagnostics = renderer.render(buildRenderItems(selectedZoneIndex));
    const zone = zones[selectedZoneIndex];

    window.__GALILEO3D_ARCHITECTURE_DEMO__ = {
      id: "architecture-viewer",
      status: "ready",
      renderer: "webgl2",
      selectedZone: zone.name,
      measurements: {
        areaSqm: zone.areaSqm,
        spanMeters: Number(Math.sqrt(zone.areaSqm).toFixed(2)),
      },
      interactions,
      diagnostics,
      metrics: {
        frameMs: Number(frameMs.toFixed(2)),
        drawCalls: diagnostics.drawCalls,
        zones: zones.length,
        selectedAreaSqm: zone.areaSqm,
        rendererBacked: true,
      },
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_ARCHITECTURE_DEMO__, null, 2);
    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
  window.addEventListener("beforeunload", () => renderer.dispose());
}

function buildRenderItems(selectedZoneIndex: number): RenderItem[] {
  const items: RenderItem[] = [
    {
      geometry: Geometry.litCube(1.85),
      material: new PBRMaterial({ name: "floor-slab", baseColor: [0.35, 0.42, 0.46, 1], roughness: 0.82, metallic: 0.02, renderState: { cullMode: "none" } }),
      label: "floor-slab",
    },
  ];

  zones.forEach((zone, index) => {
    const selected = index === selectedZoneIndex;
    items.push({
      geometry: Geometry.litCube(selected ? 0.74 : 0.58),
      material: new PBRMaterial({
        name: `${zone.name}-zone`,
        baseColor: zone.color,
        roughness: selected ? 0.28 : 0.54,
        metallic: 0.04,
        emissiveColor: [zone.color[0] * 0.18, zone.color[1] * 0.18, zone.color[2] * 0.18],
        emissiveStrength: selected ? 1.2 : 0.35,
        renderState: { cullMode: "none" },
      }),
      label: `${zone.name}-mass`,
    });
  });

  items.push({
    geometry: Geometry.lineSegments([
      [-0.86, -0.78, 0],
      [0.86, -0.78, 0],
      [-0.86, 0.78, 0],
      [0.86, 0.78, 0],
    ]),
    material: new UnlitMaterial({ name: "measurement-lines", color: [0.94, 0.98, 1, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    label: "measurement-lines",
  });

  return items;
}

function createShell(): { canvas: HTMLCanvasElement; status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "architecture-demo-shell";
  shell.innerHTML = `
    <canvas data-testid="architecture-viewer-canvas" width="960" height="540"></canvas>
    <section>
      <h1>Architecture Viewer</h1>
      <p>Click the viewport to select an architectural zone.</p>
      <pre data-testid="architecture-viewer-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return { canvas: shell.querySelector("canvas")!, status: shell.querySelector("pre")! };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #10161c; color: #edf4f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .architecture-demo-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 23rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #101820; }
    section { border-left: 1px solid #2a3842; background: #151e25; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1, p { margin: 0; }
    p { color: #bbcad4; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .architecture-demo-shell { grid-template-columns: 1fr; } canvas { height: 64vh; } section { border-left: 0; border-top: 1px solid #2a3842; } }
  `;
  document.head.append(style);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
