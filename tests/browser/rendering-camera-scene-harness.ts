import {
  Geometry,
  MockRenderDevice,
  PBRMaterial,
  Renderer,
  UnlitMaterial,
  computePerspectiveCameraFrame
} from "@galileo3d/rendering";
import { Renderable, Scene } from "@galileo3d/scene";

declare global {
  interface Window {
    __GALILEO3D_CAMERA_SCENE_TEST__?: CameraSceneHarnessResult;
  }
}

export interface CameraSceneHarnessResult {
  readonly status: "ready" | "error";
  readonly drawCalls?: number;
  readonly modelTranslation?: readonly number[];
  readonly normalScale?: readonly number[];
  readonly mvpTranslation?: readonly number[];
  readonly sceneCameraDrawCalls?: number;
  readonly sceneCameraPixel?: readonly number[];
  readonly movingCameraFrames?: readonly CameraMovementFrame[];
  readonly orbitCameraFrames?: readonly CameraMovementFrame[];
  readonly error?: string;
}

interface CameraMovementFrame {
  readonly cameraX: number;
  readonly drawCalls: number;
  readonly nonDarkPixels: number;
  readonly colorBuckets: number;
}

async function run(): Promise<void> {
  try {
    const mock = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const mockScene = new Scene();
    const node = mockScene.createNode("browser-matrix-pbr");
    node.transform.setPosition(2, 3, 4);
    node.transform.setScale(2, 4, 8);
    mockScene.root.addChild(node);
    mockScene.addRenderable(node, new Renderable({ geometry: "geometry:lit", material: "material:pbr" }));
    const geometry = Geometry.litTriangle();

    const diagnostics = mock.render(
      {
        scene: mockScene,
        geometryLibrary: { "geometry:lit": geometry },
        materialLibrary: new Map([["material:pbr", new PBRMaterial()]])
      },
      { viewProjectionMatrix: translationMatrix(1, 2, 3) }
    );

    const command = (mock.device as MockRenderDevice).drawCommands[0];
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    const normal = command?.uniforms?.get("u_normalMatrix") as Float32Array;
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    mock.dispose();
    geometry.dispose();

    const canvas = requireCanvas("scene-camera");
    const webgl = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.width,
      height: canvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const scene = new Scene();
    const camera = scene.createOrthographicCamera({ left: -1, right: 1, bottom: -1, top: 1, near: 0.1, far: 10 });
    scene.root.addChild(camera);
    const triangle = scene.createNode("scene-camera-triangle");
    triangle.transform.setPosition(0, 0, -1);
    scene.root.addChild(triangle);
    scene.addRenderable(triangle, new Renderable({ geometry: "geometry:triangle", material: "material:unlit" }));
    const sceneCameraDiagnostics = webgl.render({
      scene,
      geometryLibrary: { "geometry:triangle": Geometry.triangle() },
      materialLibrary: new Map([["material:unlit", new UnlitMaterial({ color: [0.95, 0.25, 0.08, 1] })]])
    });
    const sceneCameraPixel = readPixel(canvas, 48, 48);
    webgl.dispose();

    const movingCameraFrames = await renderMovingCameraFrames();
    const orbitCameraFrames = await renderOrbitCameraFrames();

    window.__GALILEO3D_CAMERA_SCENE_TEST__ = {
      status: "ready",
      drawCalls: diagnostics.drawCalls,
      modelTranslation: Array.from(model.slice(12, 16)).map(round3),
      normalScale: [normal[0], normal[5], normal[10], normal[15]].map(round3),
      mvpTranslation: Array.from(mvp.slice(12, 16)).map(round3),
      sceneCameraDrawCalls: sceneCameraDiagnostics.drawCalls,
      sceneCameraPixel,
      movingCameraFrames,
      orbitCameraFrames
    };
  } catch (error) {
    window.__GALILEO3D_CAMERA_SCENE_TEST__ = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
}

async function renderOrbitCameraFrames(): Promise<readonly CameraMovementFrame[]> {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  document.body.append(canvas);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0, 0, 0, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });
  const geometry = Geometry.uvSphere(0.72, 48, 24);
  const material = new PBRMaterial({ baseColor: [0.78, 0.42, 0.16, 1], metallic: 0.2, roughness: 0.34 });
  const frames: CameraMovementFrame[] = [];
  try {
    for (const yaw of [-0.9, 0, 0.9]) {
      const frame = computePerspectiveCameraFrame(
        { min: [-0.72, -0.72, -0.72], max: [0.72, 0.72, 0.72] },
        { width: canvas.width, height: canvas.height },
        { yawRadians: yaw, pitchRadians: -0.18, paddingRatio: 0.18, minDistance: 2.4 }
      );
      const diagnostics = renderer.render({
        renderItems: [{ geometry, material, label: `orbit-camera-pbr-${yaw}` }],
        environmentLighting: {
          color: [0.48, 0.5, 0.56],
          intensity: 0.55,
          proceduralMap: {
            skyColor: [0.42, 0.58, 0.86],
            horizonColor: [0.92, 0.72, 0.44],
            groundColor: [0.04, 0.05, 0.06],
            specularColor: [1, 0.88, 0.66],
            intensity: 0.5,
            specularIntensity: 0.8
          }
        }
      }, {
        viewProjectionMatrix: frame.viewProjectionMatrix,
        viewMatrix: frame.viewMatrix
      });
      const pixels = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
      frames.push({ cameraX: Number(yaw.toFixed(2)), drawCalls: diagnostics.drawCalls, ...pixelStats(pixels) });
    }
  } finally {
    renderer.dispose();
    geometry.dispose();
    canvas.remove();
  }
  return frames;
}

async function renderMovingCameraFrames(): Promise<readonly CameraMovementFrame[]> {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  document.body.append(canvas);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0, 0, 0, 1],
    antialias: false,
    preserveDrawingBuffer: true
  });
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ name: "moving-perspective-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
  scene.root.addChild(camera);
  const light = scene.createLight("directional", "moving-camera-light");
  light.intensity = 1;
  scene.root.addChild(light);
  const cube = scene.createNode("moving-camera-pbr-cube");
  cube.transform.setPosition(0, 0, -3);
  scene.root.addChild(cube);
  scene.addRenderable(cube, new Renderable({ geometry: "geometry:cube", material: "material:pbr" }));
  const geometry = Geometry.litCube(0.92);
  const material = new PBRMaterial({ baseColor: [0.75, 0.22, 0.08, 1], metallic: 0.05, roughness: 0.45 });
  const frames: CameraMovementFrame[] = [];
  try {
    for (const cameraX of [-0.7, 0, 0.7]) {
      camera.transform.setPosition(cameraX, 0, 0);
      const diagnostics = renderer.render({
        scene,
        geometryLibrary: { "geometry:cube": geometry },
        materialLibrary: { "material:pbr": material },
        environmentLighting: {
          color: [0.45, 0.47, 0.52],
          intensity: 0.42
        }
      });
      const pixels = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
      frames.push({ cameraX, drawCalls: diagnostics.drawCalls, ...pixelStats(pixels) });
    }
  } finally {
    renderer.dispose();
    geometry.dispose();
    canvas.remove();
  }
  return frames;
}

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing canvas: ${id}`);
  }
  return canvas;
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): readonly number[] {
  const context = canvas.getContext("webgl2");
  if (!context) {
    throw new Error("WebGL2 readback context is unavailable.");
  }
  const pixel = new Uint8Array(4);
  context.readPixels(x, y, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
  return Array.from(pixel);
}

function pixelStats(pixels: Uint8Array): { readonly nonDarkPixels: number; readonly colorBuckets: number } {
  const buckets = new Set<string>();
  let nonDarkPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if (r > 8 || g > 8 || b > 8) {
      nonDarkPixels += 1;
      buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
    }
  }
  return { nonDarkPixels, colorBuckets: buckets.size };
}

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

void run();
