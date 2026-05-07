import { DirectionalLight } from "@galileo3d/scene";
import { Geometry, MockRenderDevice, ShadowPass, ShadowProjectionBuilder, UnlitMaterial, type Bounds3 } from "@galileo3d/rendering";

declare global {
  interface Window {
    __GALILEO3D_SHADOW_BROWSER_TEST__?: ShadowBrowserResult;
  }
}

interface ShadowBrowserResult {
  readonly status: "ready" | "error";
  readonly shadowRendered?: boolean;
  readonly polygonPointCount?: number;
  readonly shadowPixel?: readonly number[];
  readonly planePixel?: readonly number[];
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly error?: string;
}

function publish(result: ShadowBrowserResult): void {
  window.__GALILEO3D_SHADOW_BROWSER_TEST__ = result;
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#shadow-scene");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) {
    throw new Error("Shadow browser canvas is unavailable.");
  }

  const light = new DirectionalLight("browser-shadow-key");
  light.castsShadow = true;
  light.transform.setRotation(0, 1, 0, 0);
  const caster = {
    geometry: Geometry.cube(1),
    material: new UnlitMaterial({ color: [0.8, 0.92, 1, 1] }),
    label: "browser-shadow-caster"
  };
  const device = new MockRenderDevice();
  device.beginFrame(64, 64);
  const shadowResult = new ShadowPass({ light, casters: [caster] }).execute({ device, width: 64, height: 64 });
  device.endFrame();

  const casterBounds: Bounds3 = { min: [-0.55, 1.05, -0.55], max: [0.55, 2.15, 0.55] };
  const projection = new ShadowProjectionBuilder().projectBounds({
    casterBounds,
    lightDirection: [-0.55, -1, -0.3],
    receiverPlaneY: 0
  });

  drawScene(context, canvas, projection.points);

  publish({
    status: "ready",
    shadowRendered: shadowResult.rendered,
    polygonPointCount: projection.points.length,
    shadowPixel: readPixel(context, 73, 80),
    planePixel: readPixel(context, 20, 102),
    canvasFrame: { width: canvas.width, height: canvas.height }
  });
} catch (error) {
  publish({ status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) });
}

function drawScene(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, points: readonly (readonly [number, number, number])[]): void {
  context.fillStyle = "#dfe8f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#b8c5b2";
  context.fillRect(0, 78, canvas.width, 42);

  context.fillStyle = "rgba(20, 25, 32, 0.58)";
  context.beginPath();
  points.forEach((point, index) => {
    const x = 80 + point[0] * 32;
    const y = 88 + point[2] * 18;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fill();

  context.fillStyle = "#8ed8ff";
  context.fillRect(58, 38, 42, 42);
  context.strokeStyle = "#22445a";
  context.lineWidth = 2;
  context.strokeRect(58, 38, 42, 42);
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}
