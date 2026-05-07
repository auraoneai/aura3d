import {
  Geometry,
  MockRenderDevice,
  PBRMaterial,
  Renderer,
  UnlitMaterial
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
  readonly error?: string;
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

    window.__GALILEO3D_CAMERA_SCENE_TEST__ = {
      status: "ready",
      drawCalls: diagnostics.drawCalls,
      modelTranslation: Array.from(model.slice(12, 16)).map(round3),
      normalScale: [normal[0], normal[5], normal[10], normal[15]].map(round3),
      mvpTranslation: Array.from(mvp.slice(12, 16)).map(round3),
      sceneCameraDrawCalls: sceneCameraDiagnostics.drawCalls,
      sceneCameraPixel
    };
  } catch (error) {
    window.__GALILEO3D_CAMERA_SCENE_TEST__ = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
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
