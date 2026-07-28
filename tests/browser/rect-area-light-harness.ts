import { Geometry, PBRMaterial, Renderer, type RenderItem } from "@aura3d/rendering";
import { PerspectiveCamera, RectAreaLight, Scene } from "@aura3d/scene";

type AreaMode = "small" | "wide" | "back";

interface RectAreaLightBrowserEvidence {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly modes?: readonly AreaMode[];
  readonly smallToWideChangedPixels?: number;
  readonly wideToBackChangedPixels?: number;
  readonly averageLuminance?: Readonly<Record<AreaMode, number>>;
  readonly drawCalls?: Readonly<Record<AreaMode, number>>;
  readonly claimBoundary: string;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_RECT_AREA_LIGHT__?: RectAreaLightBrowserEvidence;
  }
}

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 220;

async function run(): Promise<void> {
  const modes: readonly AreaMode[] = ["small", "wide", "back"];
  const captures = new Map<AreaMode, Uint8Array>();
  const averageLuminance = {} as Record<AreaMode, number>;
  const drawCalls = {} as Record<AreaMode, number>;

  for (const mode of modes) {
    const canvas = requiredCanvas(`area-${mode}`);
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      clearColor: [0.008, 0.012, 0.022, 1],
      preserveDrawingBuffer: true,
      antialias: true
    });
    const scene = createScene(mode);
    const diagnostics = renderer.render({
      scene,
      renderItems: createRenderItems(),
      environmentLighting: { color: [0.02, 0.025, 0.04], intensity: 0.08 },
      frustumCulling: false
    }, createCamera());
    renderer.device.setRenderTarget(null);
    const pixels = renderer.device.readPixels(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    captures.set(mode, pixels);
    averageLuminance[mode] = foregroundLuminance(pixels);
    drawCalls[mode] = diagnostics.drawCalls;
    renderer.dispose();
  }

  const small = requiredCapture(captures, "small");
  const wide = requiredCapture(captures, "wide");
  const back = requiredCapture(captures, "back");
  window.__AURA3D_RECT_AREA_LIGHT__ = {
    status: "ready",
    renderer: "webgl2",
    modes,
    smallToWideChangedPixels: changedPixels(small, wide),
    wideToBackChangedPixels: changedPixels(wide, back),
    averageLuminance,
    drawCalls,
    claimBoundary: "Rendering-internal finite rectangular emitter proof: PBR surface integration is size-dependent and one-sided; this does not claim rectangular-light shadow maps, three.js LTC lookup-table identity, GI, or root createAuraApp support."
  };
}

function createScene(mode: AreaMode): Scene {
  const scene = new Scene();
  const light = scene.createLight("rect-area", `${mode}-area-key`) as RectAreaLight;
  light.color = [1, 0.72, 0.38];
  light.intensity = 36;
  light.width = mode === "small" ? 0.65 : 3.4;
  light.height = mode === "small" ? 0.65 : 1.25;
  light.range = 12;
  light.transform.setPosition(0, 0.6, -2.15);
  if (mode === "back") light.transform.setRotation(0, 1, 0, 0);
  scene.root.addChild(light);
  return scene;
}

function createRenderItems(): readonly RenderItem[] {
  return [{
    geometry: Geometry.litCube(1),
    material: new PBRMaterial({
      name: "rect-area-light-proof-surface",
      baseColor: [0.34, 0.42, 0.56, 1],
      metallic: 0.18,
      roughness: 0.32
    }),
    modelMatrix: scaleTranslation(0, 0, -5.2, 3.8, 2.3, 0.55),
    label: "wide PBR receiver"
  }];
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

function requiredCapture(captures: Map<AreaMode, Uint8Array>, mode: AreaMode): Uint8Array {
  const capture = captures.get(mode);
  if (!capture) throw new Error(`Missing ${mode} rectangular area-light capture.`);
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

function foregroundLuminance(pixels: Uint8Array): number {
  let luminance = 0;
  let samples = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (red < 8 && green < 8 && blue < 12) continue;
    luminance += red * 0.2126 + green * 0.7152 + blue * 0.0722;
    samples += 1;
  }
  return samples > 0 ? Math.round((luminance / samples) * 1000) / 1000 : 0;
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
  window.__AURA3D_RECT_AREA_LIGHT__ = {
    status: "error",
    renderer: "webgl2",
    claimBoundary: "Rendering-internal rectangular area-light browser proof.",
    error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)
  };
});
