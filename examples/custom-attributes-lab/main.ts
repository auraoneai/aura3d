/**
 * R-23 lab: author-named per-vertex attributes on the public surface.
 *
 * - Two quads are coloured only by the custom `pigmentBase` / `paintOriginal`
 *   attributes read by a `material.custom` vertex stage written with GLSL1
 *   `attribute` declarations (the three ShaderMaterial spelling).
 * - A `topology: "points"` object takes its per-point footprint from a custom
 *   `size` attribute (`gl_PointSize = size`), like Strange Orbit's particles.
 * - `handle.updateAttribute(name, ...)` rewrites the attributes in place.
 */
import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  geometry,
  material,
  scene,
  type AuraApp
} from "@aura3d/engine";

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface LabEvidence {
  readonly id: "custom-attributes-lab";
  status: "loading" | "ready" | "error";
  backend: string;
  frame: number;
  info?: { readonly geometries: number; readonly programs?: number };
  routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly errors: string[];
  error?: string;
}

declare global {
  interface Window {
    __AURA_CUSTOM_ATTR_LAB__?: LabEvidence;
    __AURA_CUSTOM_ATTR_LAB_API__?: {
      sample(frames?: number): Promise<{ readonly left: Rgb; readonly right: Rgb; readonly pointPixels: number }>;
      recolorLeft(r: number, g: number, b: number): void;
      setPointSize(px: number): void;
      info(): { readonly geometries: number; readonly programs?: number };
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("custom-attributes-lab canvas is missing");

const errors: string[] = [];
const evidence: LabEvidence = { id: "custom-attributes-lab", status: "loading", backend: "webgl2", frame: 0, errors };
const publish = () => {
  window.__AURA_CUSTOM_ATTR_LAB__ = evidence;
  const el = document.querySelector("#evidence");
  if (el) el.textContent = `${evidence.status} frame ${evidence.frame}`;
};

const QUAD_VERTEX = `attribute vec3 pigmentBase;
attribute float paintOriginal;
out vec3 vColor;
void main() {
  vColor = pigmentBase * (0.25 + 0.75 * paintOriginal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;
const QUAD_FRAGMENT = `in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }`;
const POINT_VERTEX = `attribute float size;
void main() {
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
  gl_PointSize = size;
}`;
const POINT_FRAGMENT = `out vec4 outColor;
void main() { outColor = vec4(1.0, 1.0, 1.0, 1.0); }`;

const quadPositions = (cx: number): Float32Array => Float32Array.from([
  cx - 1, -1, 0, cx + 1, -1, 0, cx + 1, 1, 0, cx - 1, 1, 0
]);
const fill3 = (r: number, g: number, b: number): Float32Array => Float32Array.from([r, g, b, r, g, b, r, g, b, r, g, b]);

const quad = (id: string, cx: number, rgb: readonly [number, number, number]) =>
  geometry.custom(geometry.dynamic({
    positions: quadPositions(cx),
    indices: [0, 1, 2, 0, 2, 3],
    attributes: {
      pigmentBase: { itemSize: 3, data: fill3(...rgb) },
      paintOriginal: { itemSize: 1, data: Float32Array.from([1, 1, 1, 1]) }
    }
  }), {
    name: id,
    material: material.custom({ glsl: { vertex: QUAD_VERTEX, fragment: QUAD_FRAGMENT }, side: "double" })
  }).runtime({ id });

const POINT_COUNT = 5;
const pointCloud = () =>
  geometry.custom(geometry.dynamic({
    positions: Float32Array.from(Array.from({ length: POINT_COUNT }, (_, i) => [-2 + i, 1.9, 0]).flat()),
    topology: "points",
    attributes: { size: { itemSize: 1, data: Float32Array.from({ length: POINT_COUNT }, () => 20) } }
  }), {
    name: "particles",
    material: material.custom({ glsl: { vertex: POINT_VERTEX, fragment: POINT_FRAGMENT } })
  }).runtime({ id: "particles" });

let app: AuraApp | undefined;

const capture = async (): Promise<ImageData> => {
  const blob = (await app?.capture?.({ type: "png-blob" })) as Blob | undefined;
  if (!blob) throw new Error("capture produced no frame");
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = surface.getContext("2d");
  if (!ctx) throw new Error("no 2d context for readback");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
};

const meanRgb = (image: ImageData, x0: number, y0: number, x1: number, y1: number): Rgb => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * image.width + x) * 4;
      r += image.data[i]!; g += image.data[i + 1]!; b += image.data[i + 2]!; n += 1;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
};

const boot = async (): Promise<void> => {
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    // Identity output so the vertex colours the attributes produce are what the pixels read back.
    output: { toneMapping: "none", dither: false },
    scene: scene()
      .background("#000000")
      .camera(camera.perspective({ position: [0, 0, 7], target: [0, 0, 0], fov: 40 }))
      .add(quad("left-quad", -1.6, [1, 0, 0]))
      .add(quad("right-quad", 1.6, [0, 0, 1]))
      .add(pointCloud())
  });
  await app.ready();
  const step = () => { app?.step(1 / 60); evidence.frame += 1; publish(); };
  window.__AURA_CUSTOM_ATTR_LAB_API__ = {
    // `frames` steps before capture (lets any temporal history settle).
    async sample(frames = 1) {
      for (let i = 0; i < frames; i += 1) step();
      const image = await capture();
      let pointPixels = 0;
      for (let y = 0; y < 90; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const i = (y * image.width + x) * 4;
          if (image.data[i]! > 128 && image.data[i + 1]! > 128 && image.data[i + 2]! > 128) pointPixels += 1;
        }
      }
      return { left: meanRgb(image, 190, 130, 250, 190), right: meanRgb(image, 390, 130, 450, 190), pointPixels };
    },
    recolorLeft(r, g, b) {
      app?.nodes.require("left-quad").updateAttribute?.("pigmentBase", { array: fill3(r, g, b), offset: 0 });
    },
    setPointSize(px) {
      app?.nodes.require("particles").updateAttribute?.("size", { array: Float32Array.from({ length: POINT_COUNT }, () => px), offset: 0 });
    },
    info() {
      const memory = app?.info?.memory as { geometries: number; programs?: number } | undefined;
      return { geometries: memory?.geometries ?? -1, ...(memory?.programs !== undefined ? { programs: memory.programs } : {}) };
    }
  };
  evidence.status = "ready";
  evidence.routeHealth = createAuraRouteHealthSnapshot(app, { parityIds: ["SG-05", "SH-02", "R-23"] });
  step();
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message);
  evidence.status = "error";
  evidence.error = message;
  publish();
});
