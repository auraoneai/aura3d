/**
 * SH-01 lab: `material.node` (the TSL subset) on a real WebGL2 render.
 *
 * Eleven quads, one frame, identity output (no tone mapping, no dither):
 *   cal x5  constant greys 0 / .25 / .5 / .75 / 1 -> the pipeline's measured transfer curve
 *   A       constant `color` node
 *   B       `uniform()` colour node, updated with handle.setUniform (no recompile)
 *   C       `time`-driven mix(sin(time)) graph
 *   D       `texture(texture.data(...), uv())` graph (two nearest-filtered texels)
 *   E       `positionNode` displacement driven by a named uniform
 *   F       `Fn` + `Loop` + `If/Else` graph, also evaluated by the CPU reference interpreter
 */
import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  geometry,
  material,
  scene,
  texture,
  tsl,
  type AuraApp
} from "@aura3d/engine";

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface LabEvidence {
  readonly id: "tsl-lab";
  status: "loading" | "ready" | "error";
  backend: string;
  frame: number;
  routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly errors: string[];
  error?: string;
}
export interface TslLabSample {
  readonly frames: number;
  readonly cal: readonly Rgb[];
  readonly a: Rgb;
  readonly b: Rgb;
  readonly c: Rgb;
  readonly dLeft: Rgb;
  readonly dRight: Rgb;
  readonly fLeft: Rgb;
  readonly fRight: Rgb;
  readonly eCentroidX: number;
  readonly ePixels: number;
}

declare global {
  interface Window {
    __AURA_TSL_LAB__?: LabEvidence;
    __AURA_TSL_LAB_API__?: {
      sample(frames?: number): Promise<TslLabSample>;
      stepFrames(frames: number): void;
      setTint(rgb: readonly [number, number, number]): void;
      setShift(units: number): void;
      cWeight(timeSeconds: number): number;
      expectF(): { readonly left: readonly number[]; readonly right: readonly number[] };
      unsupportedProbe(): { readonly threw: boolean; readonly code?: string; readonly message?: string };
      info(): { readonly geometries: number; readonly programs?: number };
      readonly pxPerUnit: number;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("tsl-lab canvas is missing");

const errors: string[] = [];
const evidence: LabEvidence = { id: "tsl-lab", status: "loading", backend: "webgl2", frame: 0, errors };
const publish = () => {
  window.__AURA_TSL_LAB__ = evidence;
  const el = document.querySelector("#evidence");
  if (el) el.textContent = `${evidence.status} frame ${evidence.frame}`;
};

// Perspective fov 40 at z=7 on a 640x320 canvas: 62.8 px per world unit at z=0.
const WIDTH = 640;
const HEIGHT = 320;
const PX_PER_UNIT = (HEIGHT / 2) / (7 * Math.tan((40 * Math.PI) / 360));
export const pxX = (x: number): number => WIDTH / 2 + x * PX_PER_UNIT;
export const pxY = (y: number): number => HEIGHT / 2 - y * PX_PER_UNIT;

const HALF = 0.75;
const CAL_HALF = 0.4;
const quadGeometry = (cx: number, cy: number, half: number) => geometry.dynamic({
  positions: Float32Array.from([cx - half, cy - half, 0, cx + half, cy - half, 0, cx + half, cy + half, 0, cx - half, cy + half, 0]),
  uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: [0, 1, 2, 0, 2, 3]
});
const quad = (id: string, cx: number, cy: number, half: number, nodeMaterial: ReturnType<typeof material.node>) =>
  geometry.custom(quadGeometry(cx, cy, half), { name: id, material: nodeMaterial }).runtime({ id });

// Layout (world units). Columns -3.4 / 0 / 3.4, rows 1.45 / -0.25, calibration strip y = -2.
const COLS = [-3.4, 0, 3.4] as const;
const ROW1 = 1.45;
const ROW2 = -0.25;
const CAL_Y = -2.0;
const CAL_X = [-2.4, -1.2, 0, 1.2, 2.4] as const;
const CAL_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;

// A: constant colour.
const nodeA = material.node({ colorNode: tsl.color("#33aa55") });

// B: uniform colour, named so it can be updated without a recompile.
const nodeB = material.node({ colorNode: tsl.uniform("#ff0000", { name: "uTint" }) });

// C: time-driven mix. weight = sin(time * 4) * 0.5 + 0.5; colour = mix(red, blue, weight).
const cWeight = tsl.sin(tsl.time.mul(4)).mul(0.5).add(0.5);
const cColor = tsl.mix(tsl.vec3(1, 0, 0), tsl.vec3(0, 0, 1), cWeight);
const nodeC = material.node({ colorNode: cColor });

// D: texture sampled at uv(): 2x1 texels, left red, right blue, nearest filtered.
const dTexture = texture.data({ width: 2, height: 1, data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]), colorSpace: "srgb" });
dTexture.minFilter = "nearest";
dTexture.magFilter = "nearest";
dTexture.generateMipmaps = false;
const nodeD = material.node({ colorNode: tsl.texture(dTexture, tsl.uv()) });

// E: positionNode displacement from a named uniform (units along +x), plain white colour.
const nodeE = material.node({
  colorNode: tsl.vec3(1, 1, 1),
  positionNode: tsl.positionLocal.add(tsl.vec3(tsl.uniform(0, { name: "uShift", type: "float" }), 0, 0))
});

// F: Fn + Loop + If/Else. acc = 0.1 * (0 + 1 + 2 + 3) = 0.6; right half (1, acc, 0), left half (0, acc, 1).
const shade = tsl.Fn(() => {
  const acc = tsl.float(0).toVar();
  tsl.Loop(4, ({ i }) => { acc.addAssign(tsl.float(i).mul(0.1)); });
  const out = tsl.vec3(0, 0, 0).toVar();
  tsl.If(tsl.uv().x.greaterThan(0.5), () => { out.assign(tsl.vec3(1, acc, 0)); })
    .Else(() => { out.assign(tsl.vec3(0, acc, 1)); });
  return out;
});
const fColor = shade();
const nodeF = material.node({ colorNode: fColor });

let app: AuraApp | undefined;
let steps = 0;

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

const meanRgb = (image: ImageData, cx: number, cy: number, radius = 18): Rgb => {
  const x0 = Math.max(0, Math.round(cx - radius)), x1 = Math.min(image.width, Math.round(cx + radius));
  const y0 = Math.max(0, Math.round(cy - radius)), y1 = Math.min(image.height, Math.round(cy + radius));
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
  let sceneSpec = scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 0, 7], target: [0, 0, 0], fov: 40 }));
  CAL_X.forEach((x, index) => {
    const g = CAL_VALUES[index]!;
    sceneSpec = sceneSpec.add(quad(`cal-${index}`, x, CAL_Y, CAL_HALF, material.node({ colorNode: tsl.color(g, g, g) })));
  });
  sceneSpec = sceneSpec
    .add(quad("node-a", COLS[0], ROW1, HALF, nodeA))
    .add(quad("node-b", COLS[1], ROW1, HALF, nodeB))
    .add(quad("node-c", COLS[2], ROW1, HALF, nodeC))
    .add(quad("node-d", COLS[0], ROW2, HALF, nodeD))
    .add(quad("node-e", COLS[1], ROW2, HALF, nodeE))
    .add(quad("node-f", COLS[2], ROW2, HALF, nodeF));

  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    // Identity output: the pixels read back are what the node graphs produce.
    output: { toneMapping: "none", dither: false },
    scene: sceneSpec
  });
  await app.ready();
  const step = () => { app?.step(1 / 60); steps += 1; evidence.frame = steps; publish(); };

  window.__AURA_TSL_LAB_API__ = {
    pxPerUnit: PX_PER_UNIT,
    stepFrames(frames) { for (let i = 0; i < frames; i += 1) step(); },
    async sample(frames = 1) {
      for (let i = 0; i < frames; i += 1) step();
      const image = await capture();
      const cal = CAL_X.map((x) => meanRgb(image, pxX(x), pxY(CAL_Y), 14));
      const rowPx = pxY(ROW2);
      // E: centroid of bright pixels inside the (neighbour-free) window x 200..470, y around row 2.
      let sumX = 0, count = 0;
      for (let y = Math.round(rowPx - 56); y < Math.round(rowPx + 56); y += 1) {
        for (let x = 200; x < 470; x += 1) {
          const i = (y * image.width + x) * 4;
          if (image.data[i]! > 128 && image.data[i + 1]! > 128 && image.data[i + 2]! > 128) { sumX += x; count += 1; }
        }
      }
      return {
        frames: steps,
        cal,
        a: meanRgb(image, pxX(COLS[0]), pxY(ROW1)),
        b: meanRgb(image, pxX(COLS[1]), pxY(ROW1)),
        c: meanRgb(image, pxX(COLS[2]), pxY(ROW1)),
        dLeft: meanRgb(image, pxX(COLS[0]) - HALF * PX_PER_UNIT * 0.5, pxY(ROW2), 10),
        dRight: meanRgb(image, pxX(COLS[0]) + HALF * PX_PER_UNIT * 0.5, pxY(ROW2), 10),
        fLeft: meanRgb(image, pxX(COLS[2]) - HALF * PX_PER_UNIT * 0.5, pxY(ROW2), 10),
        fRight: meanRgb(image, pxX(COLS[2]) + HALF * PX_PER_UNIT * 0.5, pxY(ROW2), 10),
        eCentroidX: count > 0 ? sumX / count : Number.NaN,
        ePixels: count
      };
    },
    setTint(rgb) { app?.nodes.require("node-b").setUniform?.("uTint", [rgb[0], rgb[1], rgb[2]]); },
    setShift(units) { app?.nodes.require("node-e").setUniform?.("uShift", units); },
    cWeight(timeSeconds) { return tsl.evaluate(cWeight, { time: timeSeconds }).value[0]!; },
    expectF() {
      return {
        left: tsl.evaluate(fColor, { uv: [0.25, 0.5] }).value,
        right: tsl.evaluate(fColor, { uv: [0.75, 0.5] }).value
      };
    },
    unsupportedProbe() {
      try {
        void (tsl as unknown as Record<string, unknown>)["triplanarTexture"];
        return { threw: false };
      } catch (error) {
        const e = error as { code?: string; message?: string };
        return { threw: true, ...(e.code !== undefined ? { code: e.code } : {}), ...(e.message !== undefined ? { message: e.message } : {}) };
      }
    },
    info() {
      const memory = app?.info?.memory as { geometries: number; programs?: number } | undefined;
      return { geometries: memory?.geometries ?? -1, ...(memory?.programs !== undefined ? { programs: memory.programs } : {}) };
    }
  };
  evidence.status = "ready";
  evidence.routeHealth = createAuraRouteHealthSnapshot(app, { parityIds: ["SH-01", "SH-02"] });
  step();
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message);
  evidence.status = "error";
  evidence.error = message;
  publish();
});
