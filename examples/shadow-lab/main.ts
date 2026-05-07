import { DirectionalLight } from "@galileo3d/scene";
import { CascadedShadowMaps, CascadedShadowPass, Geometry, MockRenderDevice, PBRMaterial, Renderer, ShadowProjectionBuilder, UnlitMaterial, type Bounds3 } from "@galileo3d/rendering";

declare global {
  interface Window {
    __GALILEO3D_SHADOW_LAB__?: ShadowLabState;
  }
}

interface ShadowLabState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2-plus-shadow-pass";
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly cascadeCount?: number;
  readonly cascadeSplits?: readonly { readonly index: number; readonly near: number; readonly far: number }[];
  readonly cascadeRendered?: readonly boolean[];
  readonly initialShadowCentroid?: readonly [number, number];
  readonly movedShadowCentroid?: readonly [number, number];
  readonly shadowPixel?: readonly number[];
  readonly planePixel?: readonly number[];
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly error?: string;
}

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_SHADOW_LAB__ = {
      status: "error",
      renderer: "webgl2-plus-shadow-pass",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { renderCanvas, projectionCanvas, status } = createShell();
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas: renderCanvas,
    width: renderCanvas.width,
    height: renderCanvas.height,
    clearColor: [0.76, 0.83, 0.88, 1],
    antialias: false
  });
  const diagnostics = renderer.render([
    { geometry: Geometry.litCube(1.15), material: new PBRMaterial({ baseColor: [0.38, 0.72, 0.96, 1], roughness: 0.5, renderState: { cullMode: "none" } }), label: "shadow-lab-visible-caster" }
  ]);
  const context = projectionCanvas.getContext("2d");
  if (!context) throw new Error("Shadow lab requires a 2D presentation context.");

  const light = new DirectionalLight("shadow-lab-key");
  light.castsShadow = true;
  light.intensity = 1;
  light.transform.setRotation(0, 0, 0, 1);
  const caster = { geometry: Geometry.cube(1), material: new UnlitMaterial({ color: [0.85, 0.94, 1, 1] }), label: "shadow-lab-caster" };
  const cascades = new CascadedShadowMaps({ cascadeCount: 3, near: 0.1, far: 36, lambda: 0.62, size: 128, label: "shadow-lab" });
  const device = new MockRenderDevice();
  device.beginFrame(128, 128);
  const cascadeResult = new CascadedShadowPass({ light, casters: [caster], cascades }).execute({ device, width: 128, height: 128 });
  device.endFrame();

  const projector = new ShadowProjectionBuilder();
  const initial = projector.projectBounds({
    casterBounds: movedBounds(-0.45),
    lightDirection: [-0.52, -1, -0.28],
    receiverPlaneY: 0
  });
  const moved = projector.projectBounds({
    casterBounds: movedBounds(0.35),
    lightDirection: [-0.52, -1, -0.28],
    receiverPlaneY: 0
  });

  drawLab(context, projectionCanvas, initial.points, moved.points);
  window.__GALILEO3D_SHADOW_LAB__ = {
    status: "ready",
    renderer: "webgl2-plus-shadow-pass",
    diagnostics,
    cascadeCount: cascades.cascadeCount,
    cascadeSplits: cascades.getCascades().map((cascade) => cascade.split),
    cascadeRendered: cascadeResult.cascades.map((cascade) => cascade.rendered),
    initialShadowCentroid: centroid2d(initial.points),
    movedShadowCentroid: centroid2d(moved.points),
    shadowPixel: readPixel(context, 456, 346),
    planePixel: readPixel(context, 80, 430),
    canvasFrame: { width: renderCanvas.width, height: renderCanvas.height }
  };
  status.textContent = JSON.stringify(window.__GALILEO3D_SHADOW_LAB__, null, 2);
  cascades.dispose();
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function movedBounds(x: number): Bounds3 {
  return { min: [x - 0.42, 1.05, -0.42], max: [x + 0.42, 2.0, 0.42] };
}

function drawLab(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  initial: readonly (readonly [number, number, number])[],
  moved: readonly (readonly [number, number, number])[]
): void {
  context.fillStyle = "#d9e3ea";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#aebca8";
  context.fillRect(0, 350, canvas.width, 190);
  context.strokeStyle = "#879782";
  context.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 350);
    context.lineTo(x + 60, 540);
    context.stroke();
  }

  drawShadowPolygon(context, initial, "rgba(18, 24, 32, 0.36)", 420, 370);
  drawShadowPolygon(context, moved, "rgba(18, 24, 32, 0.62)", 480, 370);
  context.fillStyle = "#8fd4ff";
  context.fillRect(352, 168, 94, 94);
  context.strokeStyle = "#1d3d50";
  context.strokeRect(352, 168, 94, 94);
  context.fillStyle = "#b9e6ff";
  context.fillRect(516, 168, 94, 94);
  context.strokeRect(516, 168, 94, 94);
}

function drawShadowPolygon(
  context: CanvasRenderingContext2D,
  points: readonly (readonly [number, number, number])[],
  color: string,
  originX: number,
  originY: number
): void {
  context.fillStyle = color;
  context.beginPath();
  points.forEach((point, index) => {
    const x = originX + point[0] * 86;
    const y = originY + point[2] * 42;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fill();
}

function centroid2d(points: readonly (readonly [number, number, number])[]): readonly [number, number] {
  const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[2]] as [number, number], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}

function createShell(): { readonly renderCanvas: HTMLCanvasElement; readonly projectionCanvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <div class="canvases">
      <canvas data-testid="shadow-lab-render-canvas" width="480" height="540"></canvas>
      <canvas data-testid="shadow-lab-canvas" width="960" height="540"></canvas>
    </div>
    <section>
      <h1>Shadow Lab</h1>
      <p>Shadow pass and cascade split validation with projected receiver-plane pixels for moving caster stability.</p>
      <pre data-testid="shadow-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    renderCanvas: shell.querySelector("[data-testid='shadow-lab-render-canvas']")!,
    projectionCanvas: shell.querySelector("[data-testid='shadow-lab-canvas']")!,
    status: shell.querySelector("pre")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101214; color: #edf3f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    .canvases { min-height: 0; display: grid; grid-template-columns: 1fr 1fr; background: #d9e3ea; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #d9e3ea; }
    section { border-top: 1px solid #30383e; background: #171c20; padding: 1rem 1.25rem; display: grid; grid-template-columns: 14rem 1fr minmax(18rem, 28rem); gap: 1rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #cad3d8; line-height: 1.45; font-size: 0.875rem; }
    pre { color: #b6e6b1; font-size: 0.78rem; line-height: 1.35; overflow: auto; }
    @media (max-width: 760px) { .canvases { grid-template-columns: 1fr; } section { grid-template-columns: 1fr; } canvas { height: 34vh; } }
  `;
  document.head.append(style);
}
