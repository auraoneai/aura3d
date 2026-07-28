import { Geometry, Renderer, UnlitMaterial, type RenderItem } from "@aura3d/rendering";

interface VolumetricLightBrowserEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly passNames?: readonly string[];
  readonly depthTextures?: number;
  readonly changedPixels?: number;
  readonly warmedPixels?: number;
  readonly shadowedCenterLuma?: number;
  readonly litSideLuma?: number;
  readonly lumaContrast?: number;
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_VOLUMETRIC_LIGHT__?: VolumetricLightBrowserEvidence;
  }
}

async function run(): Promise<void> {
  const off = await render(requiredCanvas("volumetric-off"), false);
  const on = await render(requiredCanvas("volumetric-on"), true);
  let changedPixels = 0;
  let warmedPixels = 0;
  for (let offset = 0; offset < on.pixels.length; offset += 4) {
    const deltaR = (on.pixels[offset] ?? 0) - (off.pixels[offset] ?? 0);
    const deltaG = (on.pixels[offset + 1] ?? 0) - (off.pixels[offset + 1] ?? 0);
    const deltaB = (on.pixels[offset + 2] ?? 0) - (off.pixels[offset + 2] ?? 0);
    if (Math.abs(deltaR) + Math.abs(deltaG) + Math.abs(deltaB) > 5) changedPixels += 1;
    if (deltaR > 5 && deltaG > 3 && deltaR > deltaB * 1.15) warmedPixels += 1;
  }
  const shadowedCenterLuma = lumaAt(on.pixels, 192, 96, 102);
  const litSideLuma = lumaAt(on.pixels, 192, 52, 102);
  window.__AURA3D_VOLUMETRIC_LIGHT__ = {
    status: "ready",
    renderer: "webgl2",
    passNames: on.diagnostics.postprocessPassNames,
    depthTextures: on.diagnostics.postprocessTextures,
    changedPixels,
    warmedPixels,
    shadowedCenterLuma,
    litSideLuma,
    lumaContrast: Math.abs(shadowedCenterLuma - litSideLuma),
    claimBoundary: "Rendering-internal depth-aware radial participating-media/god-ray pass; no volumetric clouds, froxel lighting, multiple scattering, physical atmosphere, or root createAuraApp claim."
  };
}

async function render(canvas: HTMLCanvasElement, volumetric: boolean) {
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.004, 0.006, 0.012, 1],
    preserveDrawingBuffer: true,
    antialias: true
  });
  const diagnostics = renderer.render({
    renderItems: sceneItems(),
    cameraPolicy: "auto-frame",
    environmentLighting: false,
    frustumCulling: false,
    ...(volumetric ? {
      postprocess: {
        execution: "cpu-deterministic" as const,
        toneMapping: false as const,
        volumetricLight: {
          lightPosition: [0.5, 0.22] as const,
          color: [1, 0.76, 0.38] as const,
          density: 1.05,
          decay: 0.965,
          weight: 0.22,
          exposure: 0.92,
          samples: 36,
          occlusionThreshold: 0.985
        }
      }
    } : {})
  });
  renderer.device.setRenderTarget(null);
  const pixels = renderer.device.readPixels(0, 0, canvas.width, canvas.height);
  renderer.dispose();
  return { diagnostics, pixels };
}

function sceneItems(): readonly RenderItem[] {
  return [
    {
      geometry: Geometry.uvSphere(0.42, 32, 16),
      material: new UnlitMaterial({ color: [1, 0.92, 0.62, 1] }),
      modelMatrix: transform(0, 1.18, -0.9, 1, 1, 1),
      label: "volumetric-light-source"
    },
    {
      geometry: Geometry.litCube(1),
      material: new UnlitMaterial({ color: [0.015, 0.022, 0.035, 1] }),
      modelMatrix: transform(0, -0.12, 0.15, 0.8, 2.2, 0.7),
      label: "volumetric-depth-occluder"
    },
    {
      geometry: Geometry.litCube(1),
      material: new UnlitMaterial({ color: [0.025, 0.035, 0.055, 1] }),
      modelMatrix: transform(0, -1.35, -0.2, 5.2, 0.3, 1.8),
      label: "volumetric-ground"
    }
  ];
}

function transform(x: number, y: number, z: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    x, y, z, 1
  ]);
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`);
  if (!canvas) throw new Error(`Missing ${id} canvas.`);
  return canvas;
}

function lumaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  const offset = (y * width + x) * 4;
  return Math.round(
    (pixels[offset] ?? 0) * 0.2126 +
    (pixels[offset + 1] ?? 0) * 0.7152 +
    (pixels[offset + 2] ?? 0) * 0.0722
  );
}

run().catch((error) => {
  window.__AURA3D_VOLUMETRIC_LIGHT__ = {
    status: "error",
    renderer: "webgl2",
    claimBoundary: "Rendering-internal volumetric light proof.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
