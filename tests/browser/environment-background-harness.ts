import {
  Geometry,
  Renderer,
  Texture,
  TextureBinding,
  UnlitMaterial,
  type RenderDeviceDiagnostics,
  type TextureCubeFace,
  type TextureCubeFaceDescriptor
} from "@galileo3d/rendering";
import { PerspectiveCamera } from "@galileo3d/scene";

declare global {
  interface Window {
    __GALILEO3D_ENVIRONMENT_BACKGROUND_TEST__?: EnvironmentBackgroundHarnessResult;
  }
}

interface EnvironmentBackgroundHarnessResult {
  readonly status: "ready" | "error";
  readonly equirectDiagnostics?: RenderDeviceDiagnostics;
  readonly cubemapDiagnostics?: RenderDeviceDiagnostics;
  readonly compositeDiagnostics?: RenderDeviceDiagnostics;
  readonly equirectPixel?: readonly number[];
  readonly cubemapPixel?: readonly number[];
  readonly compositeForegroundPixel?: readonly number[];
  readonly compositeBackgroundPixel?: readonly number[];
  readonly error?: string;
}

async function run(): Promise<void> {
  try {
    const equirectCanvas = requireCanvas("equirect");
    const cubemapCanvas = requireCanvas("cubemap");
    const compositeCanvas = requireCanvas("composite");
    const equirectTexture = createSolidTexture("browser-equirect-cyan", 4, 2, [20, 220, 255, 255]);
    const cubemapTexture = createCubeTexture(4, {
      px: [255, 40, 40, 255],
      nx: [40, 255, 40, 255],
      py: [40, 80, 255, 255],
      ny: [255, 220, 40, 255],
      pz: [255, 40, 220, 255],
      nz: [40, 255, 240, 255]
    });
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });

    const equirectRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: equirectCanvas,
      width: equirectCanvas.width,
      height: equirectCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const equirectDiagnostics = equirectRenderer.render({
      renderItems: [],
      environmentBackground: {
        projection: "equirect",
        texture: new TextureBinding({ name: "browser-equirect-background", texture: equirectTexture, required: true }),
        intensity: 1
      }
    }, camera);
    const equirectPixel = readPixel(equirectCanvas, 64, 64);
    equirectRenderer.dispose();

    const cubemapRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: cubemapCanvas,
      width: cubemapCanvas.width,
      height: cubemapCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const cubemapDiagnostics = cubemapRenderer.render({
      renderItems: [],
      environmentBackground: {
        projection: "cubemap",
        texture: new TextureBinding({ name: "browser-cubemap-background", texture: cubemapTexture, required: true }),
        intensity: 1
      }
    }, camera);
    const cubemapPixel = readPixel(cubemapCanvas, 64, 64);
    cubemapRenderer.dispose();

    const compositeRenderer = await Renderer.create({
      backend: "webgl2",
      canvas: compositeCanvas,
      width: compositeCanvas.width,
      height: compositeCanvas.height,
      clearColor: [0, 0, 0, 1]
    });
    const compositeDiagnostics = compositeRenderer.render({
      renderItems: [{
        geometry: Geometry.triangle(),
        material: new UnlitMaterial({ color: [1, 0.04, 0.02, 1] }),
        modelMatrix: translationMatrix(0, 0, -2),
        label: "foreground-proof-triangle"
      }],
      environmentBackground: {
        projection: "equirect",
        texture: new TextureBinding({ name: "browser-composite-background", texture: equirectTexture, required: true }),
        intensity: 1
      }
    }, camera);
    const compositeForegroundPixel = readPixel(compositeCanvas, 64, 64);
    const compositeBackgroundPixel = readPixel(compositeCanvas, 8, 8);
    compositeRenderer.dispose();

    equirectTexture.dispose();
    cubemapTexture.dispose();
    window.__GALILEO3D_ENVIRONMENT_BACKGROUND_TEST__ = {
      status: "ready",
      equirectDiagnostics,
      cubemapDiagnostics,
      compositeDiagnostics,
      equirectPixel,
      cubemapPixel,
      compositeForegroundPixel,
      compositeBackgroundPixel
    };
  } catch (error) {
    window.__GALILEO3D_ENVIRONMENT_BACKGROUND_TEST__ = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
  }
}

function createSolidTexture(label: string, width: number, height: number, rgba: readonly [number, number, number, number]): Texture {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set(rgba, offset);
  }
  return new Texture({ width, height, data, label, format: "rgba8", colorSpace: "linear" });
}

function createCubeTexture(size: number, colors: Record<TextureCubeFace, readonly [number, number, number, number]>): Texture {
  const cubeFaces: TextureCubeFaceDescriptor[] = (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({
    face,
    mipLevels: [{
      width: size,
      height: size,
      data: solidFace(size, colors[face])
    }]
  }));
  return new Texture({ width: size, height: size, dimension: "cube", cubeFaces, label: "browser-cubemap-proof", format: "rgba8", colorSpace: "linear" });
}

function solidFace(size: number, rgba: readonly [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set(rgba, offset);
  }
  return data;
}

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing canvas: ${id}`);
  }
  return canvas;
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): readonly number[] {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 context was not available for environment background pixel readback");
  }
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
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

void run();
