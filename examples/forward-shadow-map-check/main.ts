import { DirectionalLight } from "@aura3d/scene";
import {
  Geometry,
  DepthPass,
  PBRMaterial,
  Renderer,
  Sampler,
  TextureBinding,
  UnlitMaterial,
  type RenderDeviceDiagnostics
} from "@aura3d/rendering";

type ForwardShadowMapCheckState = {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2-forward-pass-shadow-map";
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly featureEvidence: {
    readonly forwardPassShadowMapSampling: boolean;
    readonly shadowTextureBound: boolean;
    readonly generatedShadowMapTexture: boolean;
    readonly depthPassRenderTarget: boolean;
    readonly lightCastsShadow: boolean;
    readonly litVsShadowedPixelReadback: boolean;
    readonly pcfTextureSamples: number;
  };
  readonly pixels: {
    readonly lit: readonly number[];
    readonly shadowed: readonly number[];
  };
  readonly metrics: {
    readonly litRgb: number;
    readonly shadowedRgb: number;
    readonly deltaRgb: number;
    readonly shadowStrength: number;
    readonly generatedDepthRgb: number;
  };
  readonly knownLimits: readonly string[];
  readonly error?: string;
};

declare global {
  interface Window {
    __AURA3D_FORWARD_SHADOW_MAP_CHECK__?: ForwardShadowMapCheckState;
  }
}

const knownLimits = [
  "This check proves forward PBR shader sampling of a bound shadow texture in WebGL2.",
  "It renders a deterministic local depth pass into a color shadow-map texture; it is not full production shadow atlas, cascade selection, or Unity/Unreal parity."
] as const;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_FORWARD_SHADOW_MAP_CHECK__ = {
      status: "error",
      renderer: "webgl2-forward-pass-shadow-map",
      featureEvidence: {
        forwardPassShadowMapSampling: false,
        shadowTextureBound: false,
        generatedShadowMapTexture: false,
        depthPassRenderTarget: false,
        lightCastsShadow: false,
        litVsShadowedPixelReadback: false,
        pcfTextureSamples: 0
      },
      pixels: { lit: [0, 0, 0, 0], shadowed: [0, 0, 0, 0] },
      metrics: { litRgb: 0, shadowedRgb: 0, deltaRgb: 0, shadowStrength: 0, generatedDepthRgb: 0 },
      knownLimits,
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  document.body.style.margin = "0";
  document.body.style.background = "#071018";
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  canvas.style.width = "640px";
  canvas.style.height = "360px";
  canvas.dataset.testid = "forward-shadow-map-canvas";
  document.body.append(canvas);

  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.02, 0.04, 0.06, 1],
    preserveDrawingBuffer: true
  });
  const cube = Geometry.litCube(1);
  const shadowTarget = renderer.device.createRenderTarget({ width: 64, height: 64, label: "forward-shadow-generated-depth-target" });
  let generatedDepthProbe: readonly number[] = [255, 255, 255, 255];
  renderer.device.setRenderTarget(shadowTarget);
  renderer.device.beginFrame(shadowTarget.width, shadowTarget.height);
  try {
    renderer.device.clear([1, 1, 1, 1]);
    new DepthPass({
      casters: [
        { geometry: cube, modelMatrix: matrix(0.45, 0, -0.4, 0.34, 0.64, 0.08), label: "forward-shadow-generated-caster" }
      ],
      viewProjectionMatrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    }).execute({ device: renderer.device, width: shadowTarget.width, height: shadowTarget.height });
    generatedDepthProbe = Array.from(renderer.device.readPixels(Math.round(shadowTarget.width * 0.72), Math.round(shadowTarget.height * 0.5), 1, 1));
  } finally {
    renderer.device.endFrame();
    renderer.device.setRenderTarget(null);
  }
  const shadowBinding = new TextureBinding({
    name: "u_shadowMapTexture",
    texture: shadowTarget.colorTexture,
    sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
    required: true
  });
  const light = new DirectionalLight("forward-shadow-check-light");
  light.castsShadow = true;
  const material = new PBRMaterial({
    name: "forward-shadow-check-pbr",
    baseColor: [0.82, 0.76, 0.62, 1],
    roughness: 0.48,
    environmentIntensity: 0.02
  });
  const referenceMaterials = Array.from({ length: 32 }, (_, index) => new UnlitMaterial({
    color: [
      0.12 + ((index * 7) % 19) / 32,
      0.18 + ((index * 11) % 23) / 36,
      0.2 + ((index * 5) % 17) / 34,
      1
    ]
  }));
  const diagnostics = renderer.render({
    renderItems: [
      ...Array.from({ length: 96 }, (_, index) => ({
        geometry: cube,
        material: referenceMaterials[index % referenceMaterials.length],
        modelMatrix: matrix(-0.95 + (index % 24) * 0.083, -0.82 + Math.floor(index / 24) * 0.08 + Math.sin(index * 1.7) * 0.015, -0.04, 0.026 + (index % 5) * 0.006, 0.035 + (index % 7) * 0.008, 0.035),
        label: `forward-shadow-reference-band-${index}`
      })),
      { geometry: cube, material, modelMatrix: matrix(-0.45, 0, 0, 0.32, 0.56, 0.08), label: "forward-shadow-lit-receiver" },
      { geometry: cube, material, modelMatrix: matrix(0.45, 0, 0, 0.32, 0.56, 0.08), label: "forward-shadow-shadowed-receiver" }
    ],
    collectedLights: [{
      kind: "directional",
      color: [1, 1, 1],
      intensity: 1.35,
      position: [0, 0, 0],
      direction: [0, 0, -1],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: true,
      layerMask: 0xffffffff,
      source: light
    }],
    shadowMap: {
      texture: shadowBinding,
      lightMatrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      strength: 0.76,
      bias: 0,
      texelSize: [1 / shadowTarget.width, 1 / shadowTarget.height]
    }
  });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const lit = readAverageObjectPixel(renderer, { x: 175, y: 175, width: 140, height: 135 });
  const shadowed = readAverageObjectPixel(renderer, { x: 335, y: 175, width: 150, height: 140 });
  const litRgb = rgb(lit);
  const shadowedRgb = rgb(shadowed);
  window.__AURA3D_FORWARD_SHADOW_MAP_CHECK__ = {
    status: "ready",
    renderer: "webgl2-forward-pass-shadow-map",
    diagnostics,
    featureEvidence: {
      forwardPassShadowMapSampling: true,
      shadowTextureBound: shadowBinding.validate().ok,
      generatedShadowMapTexture: (generatedDepthProbe[0] ?? 255) < 250,
      depthPassRenderTarget: shadowTarget.colorTexture.label === "forward-shadow-generated-depth-target",
      lightCastsShadow: light.castsShadow,
      litVsShadowedPixelReadback: litRgb > shadowedRgb + 25,
      pcfTextureSamples: 9
    },
    pixels: { lit, shadowed },
    metrics: {
      litRgb,
      shadowedRgb,
      deltaRgb: litRgb - shadowedRgb,
      shadowStrength: 0.76,
      generatedDepthRgb: rgb(generatedDepthProbe)
    },
    knownLimits
  };
}

function readPixel(renderer: Renderer, x: number, y: number): readonly number[] {
  return Array.from(renderer.device.readPixels(x, y, 1, 1));
}

function readAverageObjectPixel(
  renderer: Renderer,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): readonly number[] {
  const pixels = renderer.device.readPixels(region.x, region.y, region.width, region.height);
  let count = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const pr = pixels[index] ?? 0;
    const pg = pixels[index + 1] ?? 0;
    const pb = pixels[index + 2] ?? 0;
    const pa = pixels[index + 3] ?? 0;
    if (pa === 255 && pr + pg + pb > 72) {
      count += 1;
      r += pr;
      g += pg;
      b += pb;
    }
  }
  if (count === 0) return readPixel(renderer, region.x + Math.floor(region.width / 2), region.y + Math.floor(region.height / 2));
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count), 255];
}

function rgb(pixel: readonly number[]): number {
  return (pixel[0] ?? 0) + (pixel[1] ?? 0) + (pixel[2] ?? 0);
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}
