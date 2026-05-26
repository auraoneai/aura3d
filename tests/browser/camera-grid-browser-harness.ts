import { OrthographicCamera, PerspectiveCamera } from "@aura3d/scene";

interface CameraGridBrowserResult {
  readonly status: "ready" | "error";
  readonly perspectiveLines?: number;
  readonly orthographicLines?: number;
  readonly perspectiveSpacing?: number;
  readonly orthographicSpacing?: number;
  readonly perspectivePixel?: readonly number[];
  readonly orthographicPixel?: readonly number[];
  readonly dividerPixel?: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_CAMERA_GRID_BROWSER_TEST__?: CameraGridBrowserResult;
  }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#camera-grid");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) {
    throw new Error("Camera grid canvas is unavailable.");
  }

  const perspective = new PerspectiveCamera({ aspect: 1 });
  perspective.transform.setPosition(0, 0, 4);
  perspective.updateCameraMatrices();

  const orthographic = new OrthographicCamera({ left: -2, right: 2, bottom: -2, top: 2, zoom: 1.25 });
  orthographic.transform.setPosition(0, 0, 4);
  orthographic.updateCameraMatrices();

  context.fillStyle = "rgb(8, 11, 16)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const perspectiveSpacing = Math.max(18, Math.round(42 / Math.abs(perspective.projectionMatrix[0] || 1)));
  const orthographicSpacing = Math.max(18, Math.round(36 * Math.abs(orthographic.projectionMatrix[0] || 1)));
  const perspectiveLines = drawGrid(context, 0, 0, 160, 160, perspectiveSpacing, "rgb(64, 130, 230)");
  const orthographicLines = drawGrid(context, 160, 0, 160, 160, orthographicSpacing, "rgb(235, 180, 60)");

  context.strokeStyle = "rgb(220, 220, 230)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(160, 0);
  context.lineTo(160, 160);
  context.stroke();

  window.__AURA3D_CAMERA_GRID_BROWSER_TEST__ = {
    status: "ready",
    perspectiveLines,
    orthographicLines,
    perspectiveSpacing,
    orthographicSpacing,
    perspectivePixel: readPixel(context, 80, 80),
    orthographicPixel: readPixel(context, 240, 80),
    dividerPixel: readPixel(context, 160, 80)
  };
} catch (error) {
  window.__AURA3D_CAMERA_GRID_BROWSER_TEST__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
}

function drawGrid(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, spacing: number, color: string): number {
  context.strokeStyle = color;
  context.lineWidth = 2;
  let lines = 0;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  for (let offset = -2; offset <= 2; offset += 1) {
    const gx = Math.round(centerX + offset * spacing);
    context.beginPath();
    context.moveTo(gx, y + 12);
    context.lineTo(gx, y + height - 12);
    context.stroke();
    lines += 1;

    const gy = Math.round(centerY + offset * spacing);
    context.beginPath();
    context.moveTo(x + 12, gy);
    context.lineTo(x + width - 12, gy);
    context.stroke();
    lines += 1;
  }
  return lines;
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}
