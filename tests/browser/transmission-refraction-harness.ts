import {
  Geometry,
  ProductionWebGL2Renderer,
  TexturedPBRMaterial,
  UnlitMaterial,
  type RenderItem,
  type RuntimeParityTransmissionBackdropCaptureProof
} from "@aura3d/rendering";

interface TransmissionRefractionEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "production-runtime-webgl2";
  readonly flat?: RuntimeParityTransmissionBackdropCaptureProof;
  readonly refracted?: RuntimeParityTransmissionBackdropCaptureProof;
  readonly changedPixels?: number;
  readonly centerChangedPixels?: number;
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_TRANSMISSION_REFRACTION__?: TransmissionRefractionEvidence;
  }
}

async function run(): Promise<void> {
  const flatCanvas = requiredCanvas("transmission-flat");
  const refractedCanvas = requiredCanvas("transmission-refracted");
  const flat = await renderTransmission(flatCanvas, 0);
  const refracted = await renderTransmission(refractedCanvas, 0.14);
  const flatPixels = readPixels(flatCanvas);
  const refractedPixels = readPixels(refractedCanvas);

  window.__AURA3D_TRANSMISSION_REFRACTION__ = {
    status: "ready",
    renderer: "production-runtime-webgl2",
    flat: flat.proof,
    refracted: refracted.proof,
    changedPixels: changedPixels(flatPixels, refractedPixels, flatCanvas.width, flatCanvas.height),
    centerChangedPixels: changedPixels(flatPixels, refractedPixels, flatCanvas.width, flatCanvas.height, {
      minX: 48,
      minY: 48,
      maxX: 144,
      maxY: 144
    }),
    claimBoundary: "Production-runtime opaque-only scene-color capture with IOR-offset screen-space transmission; no depth ray marching, recursive refraction, off-screen recovery, physical caustic projection, or root createAuraApp claim."
  };
}

async function renderTransmission(
  canvas: HTMLCanvasElement,
  refractionScale: number
): Promise<{ readonly proof: RuntimeParityTransmissionBackdropCaptureProof }> {
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.004, 0.006, 0.012, 1],
    preserveDrawingBuffer: true,
    antialias: true
  });
  const source = createSource();
  const result = renderer.captureProof({
    source,
    metadata: {
      assetId: `synthetic-transmission-${refractionScale}`,
      assetUri: "aura3d://browser-proof/transmission-refraction",
      meshCount: source.renderItems.length,
      primitiveCount: source.renderItems.length,
      materialCount: source.renderItems.length,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["KHR_materials_transmission", "KHR_materials_ior", "KHR_materials_volume"]
    },
    transmissionBackdropCapture: {
      mode: "scene-color-readback",
      strength: 1,
      refractionScale
    }
  });
  renderer.dispose();
  if (!result.transmissionBackdropCapture) throw new Error("Missing transmission backdrop proof.");
  return { proof: result.transmissionBackdropCapture };
}

function createSource(): {
  readonly renderItems: readonly RenderItem[];
  readonly cameraPolicy: "auto-frame";
  readonly environmentLighting: false;
  readonly frustumCulling: false;
} {
  const panelGeometry = Geometry.litCube(1);
  const panels: RenderItem[] = [
    panel(panelGeometry, -1.15, [0.95, 0.06, 0.03, 1]),
    panel(panelGeometry, 0, [0.04, 0.82, 0.15, 1]),
    panel(panelGeometry, 1.15, [0.04, 0.18, 0.98, 1])
  ];
  const glass = new TexturedPBRMaterial({
    name: "scene-space transmission glass",
    baseColor: [0.9, 0.96, 1, 1],
    metallic: 0,
    roughness: 0.04,
    transmissionFactor: 0.96,
    ior: 1.72,
    volumeThicknessFactor: 0.52,
    volumeAttenuationDistance: 5,
    volumeAttenuationColor: [0.82, 0.95, 1],
    environmentIntensity: 0.08
  });
  return {
    renderItems: [
      ...panels,
      {
        geometry: Geometry.uvSphere(0.92, 48, 24, { textured: true }),
        material: glass,
        modelMatrix: translation(0, 0, 0.15),
        label: "scene-space-transmission-subject"
      }
    ],
    cameraPolicy: "auto-frame",
    environmentLighting: false,
    frustumCulling: false
  };
}

function panel(
  geometry: Geometry,
  x: number,
  color: readonly [number, number, number, number]
): RenderItem {
  return {
    geometry,
    material: new UnlitMaterial({ color }),
    modelMatrix: scaleTranslation(x, 0, -1.2, 1.08, 3.1, 0.18),
    label: `transmission-backdrop-${x}`
  };
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`);
  if (!canvas) throw new Error(`Missing ${id} canvas.`);
  return canvas;
}

function readPixels(canvas: HTMLCanvasElement): Uint8Array {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("Missing WebGL2 context for transmission readback.");
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function changedPixels(
  left: Uint8Array,
  right: Uint8Array,
  width: number,
  height: number,
  region = { minX: 0, minY: 0, maxX: width, maxY: height }
): number {
  let changed = 0;
  for (let y = region.minY; y < region.maxY; y += 1) {
    for (let x = region.minX; x < region.maxX; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        Math.abs((left[offset] ?? 0) - (right[offset] ?? 0)) > 3 ||
        Math.abs((left[offset + 1] ?? 0) - (right[offset + 1] ?? 0)) > 3 ||
        Math.abs((left[offset + 2] ?? 0) - (right[offset + 2] ?? 0)) > 3
      ) changed += 1;
    }
  }
  return changed;
}

function translation(x: number, y: number, z: number): Float32Array {
  return scaleTranslation(x, y, z, 1, 1, 1);
}

function scaleTranslation(x: number, y: number, z: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    x, y, z, 1
  ]);
}

run().catch((error) => {
  window.__AURA3D_TRANSMISSION_REFRACTION__ = {
    status: "error",
    renderer: "production-runtime-webgl2",
    claimBoundary: "Production-runtime scene-color transmission proof.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
