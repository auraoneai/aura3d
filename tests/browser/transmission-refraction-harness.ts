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
  readonly iorChangedPixels?: number;
  readonly backdropColorTransitions?: number;
  readonly weakAttenuationLuma?: number;
  readonly strongAttenuationLuma?: number;
  readonly weakAttenuationBlueBias?: number;
  readonly strongAttenuationBlueBias?: number;
  readonly measurementValid?: boolean;
  readonly tangentAnisotropyOrientationRange?: number;
  readonly tangentAnisotropyMaxElongation?: number;
  readonly tangentAnisotropyOrientations?: readonly number[];
  readonly tangentAnisotropyElongations?: readonly number[];
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
  const lowIorCanvas = requiredCanvas("transmission-ior-low");
  const weakAttenuationCanvas = requiredCanvas("transmission-attenuation-weak");
  const strongAttenuationCanvas = requiredCanvas("transmission-attenuation-strong");
  const flat = await renderTransmission(flatCanvas, { refractionScale: 0 });
  const refracted = await renderTransmission(refractedCanvas, { refractionScale: 0.14 });
  const lowIor = await renderTransmission(lowIorCanvas, { refractionScale: 0.14, ior: 1.01 });
  const weakAttenuation = await renderTransmission(weakAttenuationCanvas, {
    refractionScale: 0.14,
    attenuationDistance: 8,
    attenuationColor: [0.35, 0.8, 1]
  });
  const strongAttenuation = await renderTransmission(strongAttenuationCanvas, {
    refractionScale: 0.14,
    attenuationDistance: 0.22,
    attenuationColor: [0.35, 0.8, 1]
  });
  const flatPixels = readPixels(flatCanvas);
  const refractedPixels = readPixels(refractedCanvas);
  const lowIorPixels = readPixels(lowIorCanvas);
  const weakAttenuationPixels = readPixels(weakAttenuationCanvas);
  const strongAttenuationPixels = readPixels(strongAttenuationCanvas);
  const centreRegion = { minX: 48, minY: 48, maxX: 144, maxY: 144 };
  const weakStats = regionStats(weakAttenuationPixels, weakAttenuationCanvas.width, centreRegion);
  const strongStats = regionStats(strongAttenuationPixels, strongAttenuationCanvas.width, centreRegion);
  const refractedStats = regionStats(refractedPixels, refractedCanvas.width, centreRegion);
  const anisotropySamples = await Promise.all([0, 45, 90, 135].map(async (degrees) => {
    const canvas = requiredCanvas(`anisotropy-${degrees}`);
    await renderTexturedAnisotropy(canvas, degrees * Math.PI / 180);
    return highlightStats(readPixels(canvas), canvas.width, canvas.height);
  }));
  const anisotropyOrientations = anisotropySamples.map((sample) => sample.orientationDegrees);

  window.__AURA3D_TRANSMISSION_REFRACTION__ = {
    status: "ready",
    renderer: "production-runtime-webgl2",
    flat: flat.proof,
    refracted: refracted.proof,
    changedPixels: changedPixels(flatPixels, refractedPixels, flatCanvas.width, flatCanvas.height),
    centerChangedPixels: changedPixels(flatPixels, refractedPixels, flatCanvas.width, flatCanvas.height, centreRegion),
    iorChangedPixels: changedPixels(lowIorPixels, refractedPixels, flatCanvas.width, flatCanvas.height, centreRegion),
    backdropColorTransitions: horizontalDominantColorTransitions(refractedPixels, refractedCanvas.width, refractedCanvas.height),
    weakAttenuationLuma: weakStats.averageLuma,
    strongAttenuationLuma: strongStats.averageLuma,
    weakAttenuationBlueBias: weakStats.averageBlue - weakStats.averageRed,
    strongAttenuationBlueBias: strongStats.averageBlue - strongStats.averageRed,
    measurementValid: refractedStats.nonBlackPixels > 4_000 && refractedStats.uniqueColorBuckets > 12,
    tangentAnisotropyOrientationRange: Math.max(...anisotropyOrientations) - Math.min(...anisotropyOrientations),
    tangentAnisotropyMaxElongation: Math.max(...anisotropySamples.map((sample) => sample.elongation)),
    tangentAnisotropyOrientations: anisotropyOrientations,
    tangentAnisotropyElongations: anisotropySamples.map((sample) => sample.elongation),
    claimBoundary: "Production-runtime opaque-only scene-color capture with IOR-offset screen-space transmission; no depth ray marching, recursive refraction, off-screen recovery, physical caustic projection, or root createAuraApp claim."
  };
}

async function renderTexturedAnisotropy(canvas: HTMLCanvasElement, rotation: number): Promise<void> {
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.004, 0.006, 0.012, 1],
    preserveDrawingBuffer: true,
    antialias: true
  });
  const material = new TexturedPBRMaterial({
    name: `authored-tangent-anisotropy-${rotation}`,
    baseColor: [0.76, 0.82, 0.9, 1],
    metallic: 1,
    roughness: 0.24,
    anisotropyStrength: 0.94,
    anisotropyRotation: rotation,
    environmentIntensity: 0.4,
    materialEnvironmentSpecularScale: 1
  });
  renderer.captureProof({
    source: {
      renderItems: [{
        geometry: Geometry.uvSphere(0.92, 64, 32, { textured: true }),
        material,
        modelMatrix: translation(0, 0, 0),
        label: "authored-tangent-anisotropy-subject"
      }],
      cameraPolicy: "auto-frame",
      frustumCulling: false
    },
    metadata: {
      assetId: `authored-tangent-anisotropy-${rotation}`,
      assetUri: "aura3d://browser-proof/authored-tangent-anisotropy",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["KHR_materials_anisotropy"]
    }
  });
  renderer.dispose();
}

async function renderTransmission(
  canvas: HTMLCanvasElement,
  options: {
    readonly refractionScale: number;
    readonly ior?: number;
    readonly attenuationDistance?: number;
    readonly attenuationColor?: readonly [number, number, number];
  }
): Promise<{ readonly proof: RuntimeParityTransmissionBackdropCaptureProof }> {
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.004, 0.006, 0.012, 1],
    preserveDrawingBuffer: true,
    antialias: true
  });
  const source = createSource(options);
  const result = renderer.captureProof({
    source,
    metadata: {
      assetId: `synthetic-transmission-${options.refractionScale}-${options.ior ?? 1.72}-${options.attenuationDistance ?? 5}`,
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
      refractionScale: options.refractionScale
    }
  });
  renderer.dispose();
  if (!result.transmissionBackdropCapture) throw new Error("Missing transmission backdrop proof.");
  return { proof: result.transmissionBackdropCapture };
}

function createSource(options: {
  readonly ior?: number;
  readonly attenuationDistance?: number;
  readonly attenuationColor?: readonly [number, number, number];
}): {
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
    ior: options.ior ?? 1.72,
    volumeThicknessFactor: 0.52,
    volumeAttenuationDistance: options.attenuationDistance ?? 5,
    volumeAttenuationColor: options.attenuationColor ?? [0.82, 0.95, 1],
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

function regionStats(
  pixels: Uint8Array,
  width: number,
  region: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
): { readonly averageLuma: number; readonly averageRed: number; readonly averageBlue: number; readonly nonBlackPixels: number; readonly uniqueColorBuckets: number } {
  let luma = 0;
  let red = 0;
  let blue = 0;
  let count = 0;
  let nonBlackPixels = 0;
  const buckets = new Set<number>();
  for (let y = region.minY; y < region.maxY; y += 1) {
    for (let x = region.minX; x < region.maxX; x += 1) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      red += r;
      blue += b;
      luma += r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (r + g + b > 12) nonBlackPixels += 1;
      buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      count += 1;
    }
  }
  return {
    averageLuma: luma / Math.max(1, count),
    averageRed: red / Math.max(1, count),
    averageBlue: blue / Math.max(1, count),
    nonBlackPixels,
    uniqueColorBuckets: buckets.size
  };
}

function horizontalDominantColorTransitions(pixels: Uint8Array, width: number, height: number): number {
  const y = Math.floor(height / 2);
  let previous = "";
  let transitions = 0;
  for (let x = 48; x < width - 48; x += 2) {
    const offset = (y * width + x) * 4;
    const channels = [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
    const dominant = channels.indexOf(Math.max(...channels)).toString();
    if (previous && dominant !== previous) transitions += 1;
    previous = dominant;
  }
  return transitions;
}

function highlightStats(pixels: Uint8Array, width: number, height: number): { readonly elongation: number; readonly orientationDegrees: number } {
  const luminances: number[] = [];
  let peak = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const luma = (pixels[offset] ?? 0) * 0.2126 + (pixels[offset + 1] ?? 0) * 0.7152 + (pixels[offset + 2] ?? 0) * 0.0722;
    luminances.push(luma);
    peak = Math.max(peak, luma);
  }
  const points: [number, number][] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((luminances[y * width + x] ?? 0) >= peak * 0.78) points.push([x, y]);
    }
  }
  if (points.length < 8) return { elongation: 1, orientationDegrees: 0 };
  const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= points.length;
  yy /= points.length;
  xy /= points.length;
  const trace = xx + yy;
  const root = Math.sqrt(Math.max(0, trace * trace / 4 - (xx * yy - xy * xy)));
  const major = Math.sqrt(Math.max(trace / 2 + root, 0));
  const minor = Math.sqrt(Math.max(trace / 2 - root, 1e-6));
  return {
    elongation: major / minor,
    orientationDegrees: 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI
  };
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
