import { Geometry, PBRMaterial, Renderer, UnlitMaterial, type RenderDeviceDiagnostics, type RenderItem } from "@galileo3d/rendering";
import { Scene } from "@galileo3d/scene";

type DemoStatus = {
  id: string;
  status: "ready" | "error";
  renderer: "webgl2";
  activeVariant: string;
  interactions: number;
  metrics: Record<string, number | string | boolean>;
  diagnostics?: RenderDeviceDiagnostics;
  error?: string;
};

declare global {
  interface Window {
    __GALILEO3D_PRODUCT_DEMO__?: DemoStatus;
  }
}

const variants = [
  { name: "graphite", color: [0.12, 0.16, 0.2, 1] as const, metallic: 0.6, roughness: 0.32 },
  { name: "copper", color: [0.9, 0.46, 0.22, 1] as const, metallic: 0.75, roughness: 0.26 },
  { name: "ceramic", color: [0.82, 0.88, 0.92, 1] as const, metallic: 0.05, roughness: 0.18 },
];

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_PRODUCT_DEMO__ = {
      id: "product-configurator",
      status: "error",
      renderer: "webgl2",
      activeVariant: variants[0].name,
      interactions: 0,
      metrics: {},
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status, swatches } = createShell();
  const resize = () => resizeCanvas(canvas);
  resize();
  window.addEventListener("resize", resize);

  let activeVariant = 0;
  let interactions = 0;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let lastFrame = performance.now();
  let frameMs = 0;
  let running = true;

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.018, 0.022, 0.03, 1],
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const scene = createLitScene(canvas);

  const setVariant = (index: number) => {
    activeVariant = index % variants.length;
    interactions += 1;
    for (const [buttonIndex, button] of swatches.entries()) {
      button.setAttribute("aria-pressed", String(buttonIndex === activeVariant));
    }
  };

  swatches.forEach((button, index) => {
    button.addEventListener("click", () => setVariant(index));
  });
  canvas.addEventListener("pointerdown", () => setVariant(activeVariant + 1));

  const render = (time: number) => {
    if (!running) return;
    const variant = variants[activeVariant];
    frameMs = frameMs * 0.85 + (time - lastFrame) * 0.15;
    lastFrame = time;
    renderer.resize(canvas.width, canvas.height);
    diagnostics = renderer.render({ scene, renderItems: buildRenderItems(variant) });

    window.__GALILEO3D_PRODUCT_DEMO__ = {
      id: "product-configurator",
      status: "ready",
      renderer: "webgl2",
      activeVariant: variant.name,
      interactions,
      diagnostics,
      metrics: {
        frameMs: Number(frameMs.toFixed(2)),
        drawCalls: diagnostics.drawCalls,
        materialVariants: variants.length,
        renderItems: 4,
        rendererBacked: true,
      },
    };
    status.textContent = JSON.stringify(window.__GALILEO3D_PRODUCT_DEMO__, null, 2);
    if (running) requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
  window.addEventListener("pagehide", () => {
    running = false;
    window.removeEventListener("resize", resize);
    renderer.dispose();
  }, { once: true });
}

function buildRenderItems(variant: (typeof variants)[number]): RenderItem[] {
  return [
    {
      geometry: Geometry.uvSphere(0.64, 32, 16),
      material: new PBRMaterial({
        name: `body-${variant.name}`,
        baseColor: variant.color,
        metallic: variant.metallic,
        roughness: variant.roughness,
        emissiveColor: [variant.color[0] * 0.12, variant.color[1] * 0.12, variant.color[2] * 0.12],
        emissiveStrength: 0.7,
        renderState: { cullMode: "none" },
      }),
      modelMatrix: modelMatrix(-0.18, 0.02, 0, 0.72, 0.72, 0.72),
      label: "configurable-product-body",
    },
    {
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({ name: "trim", baseColor: [0.92, 0.88, 0.74, 1], metallic: 0.8, roughness: 0.22, renderState: { cullMode: "none" } }),
      modelMatrix: modelMatrix(0.42, -0.24, 0, 0.34, 0.18, 0.22),
      label: "product-trim",
    },
    {
      geometry: Geometry.cube(1),
      material: new UnlitMaterial({ name: "status-led", color: [0.2, 0.86, 1, 1], renderState: { cullMode: "none" } }),
      modelMatrix: modelMatrix(0.2, 0.34, 0, 0.1, 0.1, 0.1),
      label: "product-status-led",
    },
    {
      geometry: Geometry.lineSegments([
        [-0.85, -0.76, 0],
        [0.85, -0.76, 0],
      ]),
      material: new UnlitMaterial({ name: "product-baseline", color: [0.55, 0.68, 0.76, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "product-baseline",
    },
  ];
}

function createLitScene(canvas: HTMLCanvasElement): Scene {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "product-camera", fovYRadians: Math.PI / 4, aspect: canvas.width / canvas.height, near: 0.1, far: 20 });
  camera.transform.setPosition(0, 0, 4.2);
  scene.root.addChild(camera);
  const key = scene.createLight("directional", "product-key");
  key.intensity = 2.6;
  key.color = [1, 0.92, 0.78];
  scene.root.addChild(key);
  const fill = scene.createLight("point", "product-fill");
  fill.intensity = 1.7;
  fill.range = 8;
  fill.color = [0.35, 0.76, 1];
  fill.transform.setPosition(-1.8, 1.4, 2.6);
  scene.root.addChild(fill);
  return scene;
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1,
  ]);
}

function createShell(): { canvas: HTMLCanvasElement; status: HTMLElement; swatches: HTMLButtonElement[] } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "product-demo-shell";
  shell.innerHTML = `
    <canvas data-testid="product-configurator-canvas" width="960" height="540"></canvas>
    <aside>
      <h1>Product Configurator</h1>
      <p>Renderer-backed material variant proof slice.</p>
      <div class="swatches">
        ${variants.map((variant, index) => `<button type="button" aria-pressed="${index === 0}" data-variant="${index}">${variant.name}</button>`).join("")}
      </div>
      <pre data-testid="product-configurator-status">booting</pre>
    </aside>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    status: shell.querySelector("pre")!,
    swatches: Array.from(shell.querySelectorAll<HTMLButtonElement>("button[data-variant]")),
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #11171d; color: #edf3f8; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .product-demo-shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 22rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #0f141a; }
    aside { border-left: 1px solid #28323b; background: #161d24; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1, p { margin: 0; }
    p { color: #b8c5cf; }
    .swatches { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    button { border: 1px solid #3c4a54; background: #202b33; color: #eef4f9; padding: 0.55rem; cursor: pointer; }
    button[aria-pressed="true"] { border-color: #74d2ff; box-shadow: inset 0 -3px 0 #74d2ff; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .product-demo-shell { grid-template-columns: 1fr; } canvas { height: 64vh; } aside { border-left: 0; border-top: 1px solid #28323b; } }
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
