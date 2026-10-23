/**
 * SC-04 lab: `xr.button()` + `app.xr` against an independent WebXR implementation.
 *
 * The spec (tests/browser/parity-xr.spec.ts) installs the Immersive Web Emulation Runtime (iwer)
 * before this module runs, so `navigator.xr`, `XRWebGLLayer` and the XR frame loop are NOT ours.
 *
 * Three saturated cubes sit at known world positions in front of the default headset pose. The lab can read
 * the drawing buffer inside an XR frame (same task as the render, so the pixels are valid) and report, per
 * eye half, where each cube landed. The spec compares those against the emulator's own view and projection
 * matrices for that same frame.
 */
import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  lights,
  material,
  primitives,
  scene,
  xr,
  type AuraApp
} from "@aura3d/engine";

interface ClassStats { readonly count: number; readonly cx: number; readonly cy: number }
interface RegionAnalysis {
  readonly x0: number;
  readonly x1: number;
  readonly red: ClassStats;
  readonly green: ClassStats;
  readonly magenta: ClassStats;
  readonly litPixels: number;
}
interface EmulatorView {
  readonly eye: string;
  readonly proj: readonly number[];
  readonly world: readonly number[];
  readonly inv: readonly number[];
}
interface EmulatorFrame {
  readonly t: number;
  readonly position: readonly number[];
  readonly views: readonly EmulatorView[];
}
interface XRCapture {
  readonly width: number;
  readonly height: number;
  readonly glError: number;
  readonly left: RegionAnalysis;
  readonly right: RegionAnalysis;
  /** The whole drawing buffer: what a mono (single-viewport) device draws across both halves. */
  readonly full: RegionAnalysis;
  readonly viewCount: number;
  readonly emulator: EmulatorFrame | null;
  readonly sampleHash: number;
}
interface MonoCapture { readonly width: number; readonly height: number; readonly full: RegionAnalysis; readonly sampleHash: number }
interface LabState {
  readonly presenting: boolean;
  readonly mode: string | null;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly renderFrame: number;
  readonly buttonLabel: string;
  readonly buttonState: string;
  readonly events: readonly string[];
  readonly xrFrames: number;
  readonly lastViewCount: number;
  readonly errors: readonly string[];
}
interface LabEvidence {
  readonly id: "xr-lab";
  status: "loading" | "ready" | "error";
  backend: string;
  routeHealth?: { readonly status: string; readonly parityIds: readonly string[] };
  readonly errors: string[];
  error?: string;
}

declare global {
  interface Window {
    __AURA_XR_LAB__?: LabEvidence;
    __AURA_XR_LAB_API__?: {
      captureXRFrame(): Promise<XRCapture>;
      monoCapture(): Promise<MonoCapture>;
      state(): LabState;
      readonly worldPoints: Record<"red" | "green" | "magenta", readonly [number, number, number]>;
    };
    /** Set by the spec's init script (the emulator side of every XR frame). */
    __XR_LAST__?: EmulatorFrame;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("xr-lab canvas is missing");

const errors: string[] = [];
const evidence: LabEvidence = { id: "xr-lab", status: "loading", backend: "webgl2", errors };
const publish = () => {
  window.__AURA_XR_LAB__ = evidence;
  const el = document.querySelector("#evidence");
  if (el) el.textContent = evidence.status;
};

const WORLD = {
  red: [-0.7, 1.6, -3.0] as const,
  green: [0.7, 1.6, -3.0] as const,
  // Lifted out of the red/green row so a headset move cannot hide a cube behind the near one.
  magenta: [0.0, 2.2, -1.5] as const
};

const emissiveCube = (name: string, position: readonly [number, number, number], size: number, hex: string) =>
  primitives.box({
    name,
    position: [position[0], position[1], position[2]],
    size,
    material: material.pbr({ color: hex, emissive: hex, emissiveIntensity: 3, roughness: 0.9 })
  });

const emptyClass: ClassStats = { count: 0, cx: Number.NaN, cy: Number.NaN };

/** Colour-class centroids over columns [x0, x1). `bottomUp` rows start at the bottom (readPixels order). */
const analyse = (data: Uint8Array | Uint8ClampedArray, width: number, height: number, x0: number, x1: number, bottomUp: boolean): RegionAnalysis => {
  const acc = { red: [0, 0, 0], green: [0, 0, 0], magenta: [0, 0, 0] } as Record<"red" | "green" | "magenta", [number, number, number]>;
  let lit = 0;
  for (let row = 0; row < height; row += 1) {
    const yFromBottom = bottomUp ? row : height - 1 - row;
    for (let x = x0; x < x1; x += 1) {
      const i = (row * width + x) * 4;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      if (r + g + b > 24) lit += 1;
      let key: "red" | "green" | "magenta" | null = null;
      if (r > 180 && g < 70 && b < 70) key = "red";
      else if (g > 180 && r < 70 && b < 70) key = "green";
      else if (r > 180 && b > 180 && g < 70) key = "magenta";
      if (key) {
        const a = acc[key];
        a[0] += 1; a[1] += x + 0.5; a[2] += yFromBottom + 0.5;
      }
    }
  }
  const stats = (a: [number, number, number]): ClassStats => (a[0] ? { count: a[0], cx: a[1] / a[0], cy: a[2] / a[0] } : emptyClass);
  return { x0, x1, red: stats(acc.red), green: stats(acc.green), magenta: stats(acc.magenta), litPixels: lit };
};

/** A cheap order-sensitive fingerprint so "same image" / "different image" can be asserted without shipping pixels. */
const hashSample = (data: Uint8Array | Uint8ClampedArray): number => {
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 61) h = Math.imul(h ^ data[i]!, 16777619) >>> 0;
  return h;
};

let app: AuraApp | undefined;
let pending: ((capture: XRCapture) => void) | null = null;
const events: string[] = [];
const xrErrors: string[] = [];
let xrFrames = 0;
let lastViewCount = 0;
let buttonHandle: ReturnType<typeof xr.button> | undefined;

const readXRFrame = (viewCount: number): XRCapture => {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no webgl2 context for readback");
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const data = new Uint8Array(width * height * 4);
  // Read the default framebuffer without disturbing the device's cached draw binding.
  const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
  const glError = gl.getError();
  const half = Math.floor(width / 2);
  return {
    width,
    height,
    glError,
    left: analyse(data, width, height, 0, half, true),
    right: analyse(data, width, height, half, width, true),
    full: analyse(data, width, height, 0, width, true),
    viewCount,
    emulator: window.__XR_LAST__ ? JSON.parse(JSON.stringify(window.__XR_LAST__)) as EmulatorFrame : null,
    sampleHash: hashSample(data)
  };
};

const capturePng = async (): Promise<MonoCapture> => {
  const blob = (await app?.capture?.({ type: "png-blob" })) as Blob | undefined;
  if (!blob) throw new Error("capture produced no frame");
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = surface.getContext("2d");
  if (!ctx) throw new Error("no 2d context for readback");
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return {
    width: image.width,
    height: image.height,
    full: analyse(image.data, image.width, image.height, 0, image.width, false),
    sampleHash: hashSample(image.data)
  };
};

const boot = async (): Promise<void> => {
  app = createAuraApp(canvas, {
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    // Identity output so the cube colours are what the pixels read back.
    output: { toneMapping: "none", dither: false },
    scene: scene()
      .background("#000000")
      .camera(camera.perspective({ position: [0, 1.6, 0], target: [0, 1.6, -3], fov: 60 }))
      .add(lights.ambient({ intensity: 0.4 }))
      .add(emissiveCube("red-cube", WORLD.red, 0.5, "#ff0000"))
      .add(emissiveCube("green-cube", WORLD.green, 0.5, "#00ff00"))
      .add(emissiveCube("magenta-cube", WORLD.magenta, 0.3, "#ff00ff"))
  });
  await app.ready();

  const runtime = app.xr;
  if (!runtime) throw new Error("createAuraApp did not provide app.xr");
  runtime.on("sessionstart", ({ mode }) => events.push(`sessionstart:${mode}`));
  runtime.on("sessionend", ({ mode }) => events.push(`sessionend:${mode}`));
  runtime.on("error", ({ code, message }) => { xrErrors.push(`${code}: ${message}`); errors.push(`${code}: ${message}`); });
  runtime.on("frame", (event) => {
    xrFrames += 1;
    lastViewCount = event.viewCount;
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve(readXRFrame(event.viewCount));
    }
  });
  buttonHandle = xr.button({ app, parent: document.body });

  window.__AURA_XR_LAB_API__ = {
    captureXRFrame() {
      return new Promise<XRCapture>((resolve, reject) => {
        const timer = setTimeout(() => { pending = null; reject(new Error("no XR frame arrived within 15s")); }, 15_000);
        pending = (capture) => { clearTimeout(timer); resolve(capture); };
      });
    },
    monoCapture: capturePng,
    state() {
      return {
        presenting: runtime.isPresenting,
        mode: runtime.mode,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        renderFrame: app?.info?.render.frame ?? -1,
        buttonLabel: buttonHandle?.element.textContent ?? "",
        buttonState: (buttonHandle?.element as unknown as HTMLElement | undefined)?.getAttribute("data-xr-state") ?? buttonHandle?.state ?? "",
        events: [...events],
        xrFrames,
        lastViewCount,
        errors: [...xrErrors]
      };
    },
    worldPoints: WORLD
  };
  evidence.status = "ready";
  evidence.routeHealth = createAuraRouteHealthSnapshot(app, { parityIds: ["SC-04"] });
  publish();
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message);
  evidence.status = "error";
  evidence.error = message;
  publish();
});
