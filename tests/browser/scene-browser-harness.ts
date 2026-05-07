import { DirectionalLight, PerspectiveCamera, Scene } from "@galileo3d/scene";

interface SceneBrowserResult {
  readonly status: "ready" | "error";
  readonly parentWorld?: readonly [number, number, number];
  readonly childWorld?: readonly [number, number, number];
  readonly cameraGridLines?: number;
  readonly lightDirection?: readonly [number, number, number];
  readonly parentPixel?: readonly number[];
  readonly childPixel?: readonly number[];
  readonly gridPixel?: readonly number[];
  readonly lightPixel?: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_SCENE_BROWSER_TEST__?: SceneBrowserResult;
  }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene-surface");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("Scene browser canvas is unavailable.");

  const scene = new Scene();
  const parent = scene.createNode("parent-cube");
  const child = scene.createNode("child-cube");
  const camera = new PerspectiveCamera({ name: "debug-camera", aspect: canvas.width / canvas.height });
  const light = new DirectionalLight("debug-light");

  parent.transform.setPosition(56, 64, 0);
  child.transform.setPosition(64, 24, 0);
  camera.transform.setPosition(0, 0, 10);
  light.transform.setRotation(0, 0, 0, 1);

  parent.addChild(child);
  scene.root.addChild(parent);
  scene.root.addChild(camera);
  scene.root.addChild(light);
  scene.updateWorldTransforms();
  camera.updateCameraMatrices();
  light.updateWorldTransform();

  const parentWorld = translation(parent.transform.worldMatrix);
  const childWorld = translation(child.transform.worldMatrix);
  const lightDirection = light.getDirection();

  context.fillStyle = "rgb(8, 12, 18)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgb(70, 90, 120)";
  context.lineWidth = 1;
  let cameraGridLines = 0;
  for (const x of projectionGridX(camera, canvas.width)) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
    cameraGridLines += 1;
  }

  context.fillStyle = "rgb(30, 150, 255)";
  context.fillRect(parentWorld[0], parentWorld[1], 56, 56);
  context.fillStyle = "rgb(235, 225, 48)";
  context.fillRect(childWorld[0], childWorld[1], 32, 32);

  context.strokeStyle = "rgb(255, 96, 96)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(196, 34);
  context.lineTo(196 + -lightDirection[0] * 32, 34 + lightDirection[2] * 32);
  context.stroke();

  window.__GALILEO3D_SCENE_BROWSER_TEST__ = {
    status: "ready",
    parentWorld,
    childWorld,
    cameraGridLines,
    lightDirection,
    parentPixel: readPixel(context, parentWorld[0] + 8, parentWorld[1] + 8),
    childPixel: readPixel(context, childWorld[0] + 8, childWorld[1] + 8),
    gridPixel: readPixel(context, Math.round(canvas.width / 2), 8),
    lightPixel: readPixel(context, 196, 20)
  };
} catch (error) {
  window.__GALILEO3D_SCENE_BROWSER_TEST__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
}

function translation(matrix: readonly number[]): [number, number, number] {
  return [Math.round(matrix[12] ?? 0), Math.round(matrix[13] ?? 0), Math.round(matrix[14] ?? 0)];
}

function projectionGridX(camera: PerspectiveCamera, width: number): readonly number[] {
  const scale = Math.abs(camera.projectionMatrix[0] ?? 1);
  const spacing = Math.max(24, Math.round(48 / scale));
  const center = Math.round(width / 2);
  return [center - spacing, center, center + spacing];
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return [...context.getImageData(x, y, 1, 1).data];
}
