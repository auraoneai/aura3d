import {
  Geometry,
  PBRMaterial,
  Renderer,
  computePerspectiveCameraFrame,
  type RenderDeviceDiagnostics,
  type RenderItem
} from "/packages/rendering/src/index.js";
import { DirectionalLight, Scene, composeMat4, quatFromEuler } from "/packages/scene/src/index.js";

declare global {
  interface Window {
    __V7_PBR_SHADOW_MAP__?: unknown;
  }
}

interface RenderResult {
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly pixels: Uint8Array;
  readonly dataUrl: string;
}

interface PatchStats {
  readonly shadowPatchLuma: number;
  readonly litPatchLuma: number;
  readonly contactDarkening: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
}

const WIDTH = 1024;
const HEIGHT = 768;
const FLOOR_Y = -0.62;

void run().catch((error) => {
  window.__V7_PBR_SHADOW_MAP__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});

async function run(): Promise<void> {
  const root = document.getElementById("shadow-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing PBR shadow root.");
  const shadowCanvas = createCanvas("v7-pbr-shadow-map-enabled");
  const noShadowCanvas = createCanvas("v7-pbr-shadow-map-disabled");
  root.append(shadowCanvas, noShadowCanvas);

  const shadowed = await renderScene(shadowCanvas, true);
  const unshadowed = await renderScene(noShadowCanvas, false);
  const shadowStats = analyzePatches(shadowed.pixels);
  const noShadowStats = analyzePatches(unshadowed.pixels);

  window.__V7_PBR_SHADOW_MAP__ = {
    status: "ready",
    schema: "g3d-v7-pbr-shadow-map/v1",
    purpose: "renderer-owned PBR directional shadow-map visual proof",
    parity: {
      claim: "not-claimed",
      reason: "This proves G3D can render and sample a PBR directional shadow map in WebGL2; it does not prove full contact-shadow parity or Three.js visual parity."
    },
    scene: {
      width: WIDTH,
      height: HEIGHT,
      geometry: "pbr-metallic-sphere-on-receiver-floor",
      shadowMap: {
        requested: true,
        type: "renderer-owned-directional-shadow-map",
        size: 2048,
        filter: "pcf",
        pcfSamples: 16,
        pcfDistribution: "poisson"
      }
    },
    shadowed: {
      diagnostics: shadowed.diagnostics,
      pixelStats: shadowStats
    },
    unshadowed: {
      diagnostics: unshadowed.diagnostics,
      pixelStats: noShadowStats
    },
    visualDelta: {
      contactDarkeningGain: Number((shadowStats.contactDarkening - noShadowStats.contactDarkening).toFixed(4)),
      shadowPatchDelta: Number((noShadowStats.shadowPatchLuma - shadowStats.shadowPatchLuma).toFixed(4))
    },
    artifacts: {
      shadowed: "tests/reports/runtime-parity/pbr-shadow-map/g3d-pbr-shadow-map.png",
      unshadowed: "tests/reports/runtime-parity/pbr-shadow-map/g3d-pbr-no-shadow.png"
    },
    dataUrls: {
      shadowed: shadowed.dataUrl,
      unshadowed: unshadowed.dataUrl
    },
    openGaps: [
      "This is G3D-only renderer-owned shadow evidence, not Three.js parity.",
      "This is not a full screen-space/ray/contact-shadow implementation.",
      "The product viewer still needs to report runtime shadow-map resources before claiming product-level shadow parity."
    ]
  };
}

async function renderScene(canvas: HTMLCanvasElement, shadows: boolean): Promise<RenderResult> {
  const frame = computePerspectiveCameraFrame({ min: [-1.6, -0.75, -1.35], max: [1.6, 0.95, 1.35] }, { width: WIDTH, height: HEIGHT }, {
    yawRadians: -0.42,
    pitchRadians: -0.2,
    paddingRatio: 0.22,
    fovYRadians: 0.58,
    nearPadding: 0.18,
    farPadding: 2.6
  });
  const sphere = Geometry.uvSphere(0.54, 96, 48);
  const floor = Geometry.litCube(1);
  const renderItems: RenderItem[] = [
    {
      label: "v7-pbr-shadow-floor",
      geometry: floor,
      material: new PBRMaterial({
        name: "v7-pbr-shadow-floor-material",
        baseColor: [0.42, 0.44, 0.47, 1],
        metallic: 0,
        roughness: 0.78,
        environmentIntensity: 0.18
      }),
      modelMatrix: composeMat4([0, FLOOR_Y - 0.04, 0.18], [0, 0, 0, 1], [4.8, 0.08, 4.3])
    },
    {
      label: "v7-pbr-shadow-sphere",
      geometry: sphere,
      material: new PBRMaterial({
        name: "v7-pbr-shadow-sphere-material",
        baseColor: [0.82, 0.86, 0.9, 1],
        metallic: 0.3,
        roughness: 0.34,
        environmentIntensity: 0.2
      }),
      modelMatrix: composeMat4([0, -0.04, 0], [0, 0, 0, 1], [1, 1, 1])
    }
  ];
  const scene = new Scene();
  const light = new DirectionalLight("v7-pbr-shadow-key");
  light.castsShadow = true;
  light.intensity = 3.2;
  light.color = [1, 0.94, 0.84];
  light.transform.setRotation(...quatFromEuler(-0.62, 0.36, 0.08));
  scene.root.addChild(light);
  const renderer = await Renderer.create({
    canvas,
    width: WIDTH,
    height: HEIGHT,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.012, 0.014, 0.018, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets"]
  });
  const diagnostics = renderer.render({
    scene,
    renderItems,
    environmentLighting: {
      color: [0.12, 0.16, 0.22],
      intensity: 0.34,
      proceduralMap: {
        skyColor: [0.06, 0.1, 0.18],
        horizonColor: [0.18, 0.2, 0.24],
        groundColor: [0.04, 0.04, 0.05],
        specularColor: [0.5, 0.55, 0.62],
        intensity: 0.45,
        specularIntensity: 0.22
      }
    },
    ...(shadows ? {
      shadow: {
        enabled: true,
        light,
        size: 2048,
        strength: 0.72,
        bias: 0.001,
        slopeBias: 1.1,
        filter: "pcf" as const,
        pcfRadius: 1.35,
        pcfSamples: 16,
        pcfDistribution: "poisson" as const,
        label: "v7-pbr-shadow-map"
      }
    } : {}),
    cameraPolicy: "require",
    cameraPosition: frame.cameraPosition
  }, {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix
  });
  const pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
  const dataUrl = canvas.toDataURL("image/png");
  renderer.dispose();
  sphere.dispose();
  floor.dispose();
  return { diagnostics, pixels, dataUrl };
}

function analyzePatches(pixels: Uint8Array): PatchStats {
  const shadowPatchLuma = regionLuma(pixels, 448, 258, 128, 92);
  const litPatchLuma = regionLuma(pixels, 678, 258, 120, 92);
  const buckets = new Set<string>();
  let nonBlackPixels = 0;
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (red + green + blue > 24) nonBlackPixels += 1;
    buckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);
  }
  return {
    shadowPatchLuma,
    litPatchLuma,
    contactDarkening: Number((litPatchLuma - shadowPatchLuma).toFixed(4)),
    nonBlackPixels,
    uniqueColorBuckets: buckets.size
  };
}

function regionLuma(pixels: Uint8Array, x: number, y: number, width: number, height: number): number {
  let total = 0;
  let count = 0;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * WIDTH + column) * 4;
      total += luma(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
      count += 1;
    }
  }
  return Number((total / Math.max(1, count)).toFixed(4));
}

function luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function createCanvas(id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}
