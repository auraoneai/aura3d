import {
  Geometry,
  PBRMaterial,
  Renderer,
  type ForwardEnvironmentFogOptions,
  type RenderItem
} from "@aura3d/rendering";
import { PerspectiveCamera } from "@aura3d/scene";

type FogMode = "none" | "linear" | "exponential-squared";

interface EnvironmentFogBrowserEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly modes?: readonly FogMode[];
  readonly noFogToLinearChangedPixels?: number;
  readonly noFogToExp2ChangedPixels?: number;
  readonly linearToExp2ChangedPixels?: number;
  readonly noFogColorDistance?: number;
  readonly linearColorDistance?: number;
  readonly exp2ColorDistance?: number;
  readonly drawCalls?: Readonly<Record<FogMode, number>>;
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_ENVIRONMENT_FOG__?: EnvironmentFogBrowserEvidence;
  }
}

const FOG_COLOR = [0.72, 0.18, 0.82] as const;
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 200;

async function run(): Promise<void> {
  const modes: readonly FogMode[] = ["none", "linear", "exponential-squared"];
  const captures = new Map<FogMode, Uint8Array>();
  const drawCalls = {} as Record<FogMode, number>;

  for (const mode of modes) {
    const canvas = requiredCanvas(`fog-${mode === "exponential-squared" ? "exp2" : mode}`);
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      clearColor: [0.015, 0.02, 0.035, 1],
      preserveDrawingBuffer: true,
      antialias: true
    });
    const diagnostics = renderer.render(createSource(mode), createCamera());
    renderer.device.setRenderTarget(null);
    captures.set(mode, renderer.device.readPixels(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
    drawCalls[mode] = diagnostics.drawCalls;
    renderer.dispose();
  }

  const none = requiredCapture(captures, "none");
  const linear = requiredCapture(captures, "linear");
  const exp2 = requiredCapture(captures, "exponential-squared");
  window.__AURA3D_ENVIRONMENT_FOG__ = {
    status: "ready",
    renderer: "webgl2",
    modes,
    noFogToLinearChangedPixels: changedPixels(none, linear),
    noFogToExp2ChangedPixels: changedPixels(none, exp2),
    linearToExp2ChangedPixels: changedPixels(linear, exp2),
    noFogColorDistance: averageFogColorDistance(none),
    linearColorDistance: averageFogColorDistance(linear),
    exp2ColorDistance: averageFogColorDistance(exp2),
    drawCalls,
    claimBoundary: "Rendering-internal WebGL2 pixel proof for distance-based linear Fog and exponential-squared FogExp2-style blending; not volumetric scattering, atmospheric simulation, or root createAuraApp support."
  };
}

function createSource(mode: FogMode): {
  readonly renderItems: readonly RenderItem[];
  readonly environmentLighting: {
    readonly color: readonly [number, number, number];
    readonly intensity: number;
  };
  readonly environmentFog: ForwardEnvironmentFogOptions | false;
  readonly frustumCulling: false;
} {
  const geometry = Geometry.litCube(1);
  const items: RenderItem[] = [
    cube(geometry, -1.35, -2.5, [0.96, 0.12, 0.08, 1], "near-red"),
    cube(geometry, 0, -5, [0.08, 0.92, 0.18, 1], "middle-green"),
    cube(geometry, 1.35, -8, [0.05, 0.26, 0.98, 1], "far-blue")
  ];
  return {
    renderItems: items,
    environmentLighting: {
      color: [1, 1, 1],
      intensity: 1
    },
    environmentFog: mode === "none" ? false : {
      mode,
      color: FOG_COLOR,
      near: 1.5,
      far: 9,
      density: 0.2,
      maxOpacity: 0.92
    },
    frustumCulling: false
  };
}

function cube(
  geometry: Geometry,
  x: number,
  z: number,
  color: readonly [number, number, number, number],
  label: string
): RenderItem {
  return {
    geometry,
    material: new PBRMaterial({
      name: `${label}-fog-proof`,
      baseColor: color,
      metallic: 0,
      roughness: 0.9
    }),
    modelMatrix: scaleTranslation(x, 0, z, 1.25, 1.25, 1.25),
    label
  };
}

function createCamera(): PerspectiveCamera {
  return new PerspectiveCamera({
    fovYRadians: Math.PI / 3,
    aspect: CANVAS_WIDTH / CANVAS_HEIGHT,
    near: 0.1,
    far: 30
  });
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas: ${id}`);
  return canvas;
}

function requiredCapture(captures: Map<FogMode, Uint8Array>, mode: FogMode): Uint8Array {
  const capture = captures.get(mode);
  if (!capture) throw new Error(`Missing ${mode} fog capture.`);
  return capture;
}

function changedPixels(left: Uint8Array, right: Uint8Array): number {
  let changed = 0;
  for (let offset = 0; offset < left.length; offset += 4) {
    if (
      Math.abs((left[offset] ?? 0) - (right[offset] ?? 0)) > 4 ||
      Math.abs((left[offset + 1] ?? 0) - (right[offset + 1] ?? 0)) > 4 ||
      Math.abs((left[offset + 2] ?? 0) - (right[offset + 2] ?? 0)) > 4
    ) changed += 1;
  }
  return changed;
}

function averageFogColorDistance(pixels: Uint8Array): number {
  const target = FOG_COLOR.map((component) => component * 255);
  let distance = 0;
  let samples = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (red < 12 && green < 12 && blue < 18) continue;
    distance += Math.abs(red - target[0]!) + Math.abs(green - target[1]!) + Math.abs(blue - target[2]!);
    samples += 1;
  }
  return samples > 0 ? Math.round((distance / samples) * 1000) / 1000 : Number.POSITIVE_INFINITY;
}

function scaleTranslation(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number
): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    x, y, z, 1
  ]);
}

run().catch((error) => {
  window.__AURA3D_ENVIRONMENT_FOG__ = {
    status: "error",
    renderer: "webgl2",
    claimBoundary: "Rendering-internal environment fog browser proof.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
