/**
 * PRD-03 Phase-6 browser probes (SMAA, auto-exposure, C-13 custom passes):
 *
 *  - `smaaEdgeProbe` (§8.14): thin-wire scene under `effects.antiAlias` —
 *    `mode:"smaa"` must produce intermediate-luma edge coverage where
 *    `mode:"none"` produces binary staircase pixels. Edge-band metric:
 *    fraction of pixels whose luma sits strictly between background and
 *    line levels (0.1·Δ … 0.9·Δ).
 *  - `exposureProbe` (§8.9): `output.autoExposure` with the meter looking at
 *    a wall-filling patch; a bright→dark `setPose` step (target EV rises →
 *    speedUp path) must settle the rendered patch luma back to within
 *    0.1 EV of the post-adapt target in ≤ 1.5 s sim time, with zero engine
 *    `readPixels` calls while frames render.
 *  - `customPassProbe` (§6.12/C-13): a `before-tonemap` pass must see linear
 *    HDR (RGBA16F, values > 1) and an `after-tonemap` pass display-referred
 *    RGBA8 — proven by an HDR gate pass (white where `u_color.r > 1`) and a
 *    red-channel invert whose output we compare against the same frame
 *    without the pass.
 */
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

/* ------------------------------- helpers ------------------------------- */

type App = Awaited<ReturnType<typeof mount>>["app"];

interface Mounted {
  app: App;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  read: () => Uint8Array;
  engineReadbacks: () => number;
  /** Run n frames of dt; `readPixels` calls during the step count as engine reads. */
  runFrames: (n: number, dt?: number) => Promise<void>;
}

let insideStep = false;
let readbacksDuringSteps = 0;
const origReadPixels = WebGL2RenderingContext.prototype.readPixels;
WebGL2RenderingContext.prototype.readPixels = function (...args: Parameters<WebGL2RenderingContext["readPixels"]>) {
  if (insideStep) readbacksDuringSteps += 1;
  return (origReadPixels as unknown as (...a: unknown[]) => unknown).apply(this, args);
};

function lumaAt(pixels: Uint8Array, i: number): number {
  return (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
}

async function mount(opts: {
  readonly antiAlias?: "none" | "smaa";
  readonly autoExposure?: { minEv: number; maxEv: number; speedUp: number; speedDown: number; meteringMask?: "center-weighted" | "average"; compensationEv?: number };
  readonly bright?: boolean;
  readonly size?: number;
}): Promise<Mounted> {
  const size = opts.size ?? 320;
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2400px;top:0;width:${size}px;height:${size}px;`;
  document.body.appendChild(host);

  // Camera at the origin looks -Z at a wall 8 m out; a second opposing wall at
  // +Z gives the exposure step its "other brightness" target via setPose.
  const darkWall = material.pbr({ color: "#585c62", roughness: 0.95 });
  const built = scene()
    .background("#0b0d10")
    .camera(camera.perspective({ position: [0, 1.4, 0], target: [0, 1.4, -8], fov: 40, near: 0.1, far: 60 }))
    .add(lights.directional({ name: "sun", color: "#fff4e6", intensity: 2.4, position: [4, 6, 3] }))
    .add(lights.ambient({ name: "ambient", color: "#3a4048", intensity: 0.35 }))
    // -Z wall: modest gray
    .add(primitives.plane({ name: "wall-dark", size: [16, 1, 16], material: darkWall })
      .position(0, 1.4, -8).rotate(Math.PI / 2, 0, 0))
    // +Z wall: bright emissive (drives the meter far up)
    .add(primitives.plane({ name: "wall-bright", size: [16, 1, 16],
      material: material.emissive({ color: "#fff", emissive: "#ffe9c4", emissiveIntensity: opts.bright === false ? 2 : 6 }) })
      .position(0, 1.4, 8).rotate(-Math.PI / 2, 0, 0))
    // 1-px wire content for the SMAA probe (floats mid-frame on the -Z view)
    .add(primitives.box({ name: "wire", size: [7, 0.012, 0.012], material: material.pbr({ color: "#e8e8e8", roughness: 0.6 }) })
      .position(0, 1.7, -5))
    .add(primitives.box({ name: "wire2", size: [0.012, 2.4, 0.012], material: material.pbr({ color: "#d8d8d8", roughness: 0.6 }) })
      .position(0.8, 1.2, -5));
  // §8.14: AA is authored as a scene effect node — `mount({antiAlias:"smaa"})`
  // must attach it or the smaa/none mounts are identical. "none" leaves the
  // default (off) pipeline.
  const withEffects = opts.antiAlias === "smaa"
    ? built.add(effects.antiAlias({ mode: "smaa" }))
    : built;

  const app = createAuraApp(host, {
    scene: withEffects,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    ...(opts.autoExposure
      ? {
        output: {
          autoExposure: opts.autoExposure
        }
      }
      : {}),
    qualityRebuild: { flags: ["A3D_QR_POST"] }
  });
  await app.ready();
  const canvas = host.querySelector("canvas")!;
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const width = canvas.width;
  const height = canvas.height;
  const read = () => {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const runFrames = async (n: number, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      insideStep = true;
      app.step(dt);
      insideStep = false;
      await new Promise((r) => requestAnimationFrame(r));
    }
  };
  return { app, host, canvas, gl, width, height, read, engineReadbacks: () => readbacksDuringSteps, runFrames };
}

/* ------------------------------- SMAA ---------------------------------- */

function edgeBandIntermediateRatio(pixels: Uint8Array, width: number, height: number): { ratio: number; bg: number; line: number } {
  // Find the darkest (bg) and brightest (line) lumas, then count pixels in
  // the 0.1Δ…0.9Δ band — coverage-blended edge pixels land there.
  let lo = 1, hi = 0;
  const lumas = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const l = lumaAt(pixels, i * 4);
    lumas[i] = l;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const delta = hi - lo;
  if (delta < 0.05) return { ratio: 0, bg: lo, line: hi };
  let intermediate = 0;
  for (let i = 0; i < lumas.length; i++) {
    const t = (lumas[i] - lo) / delta;
    if (t > 0.1 && t < 0.9) intermediate += 1;
  }
  return { ratio: intermediate / (width * height), bg: lo, line: hi };
}

export async function runSmaaEdgeProbe() {
  const none = await mount({ antiAlias: "none" });
  await none.runFrames(4);
  const noneRatio = edgeBandIntermediateRatio(none.read(), none.width, none.height);
  none.app.dispose();
  none.host.remove();

  const smaa = await mount({ antiAlias: "smaa" });
  await smaa.runFrames(4);
  const smaaRatio = edgeBandIntermediateRatio(smaa.read(), smaa.width, smaa.height);
  smaa.app.dispose();
  smaa.host.remove();

  return { schema: "smaa-edge/v1", none: noneRatio, smaa: smaaRatio };
}

/* ---------------------------- auto-exposure ----------------------------- */

function centerPatchLuma(pixels: Uint8Array, width: number, height: number): number {
  // Center-weighted meter: average the central 32×32 block.
  const cx = Math.floor(width / 2), cy = Math.floor(height / 2), r = 16;
  let sum = 0, n = 0;
  for (let y = cy - r; y < cy + r; y++) {
    for (let x = cx - r; x < cx + r; x++) {
      sum += lumaAt(pixels, (y * width + x) * 4);
      n += 1;
    }
  }
  return sum / n;
}

export async function runExposureProbe() {
  const { app, host, read, engineReadbacks, runFrames } = await mount({
    autoExposure: { minEv: -4, maxEv: 4, speedUp: 3, speedDown: 3, meteringMask: "center-weighted", compensationEv: 0 },
    bright: true,
    size: 256
  });
  try {
    const cameraCtl = (app as { camera?: { setPose?: (p: { position: readonly number[]; target: readonly number[] }, o?: { cut?: boolean }) => void } })
      .camera;
    if (!cameraCtl?.setPose) return { schema: "exposure/v1", untested: "no app.camera.setPose" };

    // Warm up on the BRIGHT wall (+Z) — the meter adapts EV down.
    cameraCtl.setPose({ position: [0, 1.4, 0], target: [0, 1.4, 8] });
    await runFrames(60); // 1 s — EV settles at the bright target
    const brightLuma = centerPatchLuma(read(), 256, 256);

    // Step to the DARK wall (-Z): desired EV rises → speedUp path.
    const startReads = engineReadbacks();
    cameraCtl.setPose({ position: [0, 1.4, 0], target: [0, 1.4, -8] }, { cut: true });
    const dt = 1 / 60;
    let settleFrame = -1;
    let luma = brightLuma;
    const trace: { f: number; luma: number; evError: number }[] = [];
    for (let f = 0; f < 150 && settleFrame < 0; f++) {
      await runFrames(1, dt);
      luma = centerPatchLuma(read(), 256, 256);
      // §8.9/§14: the meter normalizes rendered center luma to the same
      // mapped target for a wall that fills the metering region, so the
      // residual EV error vs the pre-step settled value is
      // |log2(luma/brightLuma)|. Settled = the error stays < 0.1 EV for
      // 10 consecutive frames (adaptation is exponential — first entry into
      // the band is the "reached" time).
      trace.push({ f, luma, evError: Math.log2(Math.max(luma, 1e-4) / Math.max(brightLuma, 1e-4)) });
      const tail = trace.slice(-10);
      if (tail.length === 10 && tail.every((t) => Math.abs(t.evError) < 0.1)) {
        settleFrame = tail[0].f;
      }
    }
    return {
      schema: "exposure/v1",
      brightLuma,
      darkLuma: luma,
      settleSeconds: settleFrame >= 0 ? settleFrame * dt : -1,
      engineReadbacksDuringSteps: engineReadbacks() - startReads,
      traceTail: trace.slice(-12)
    };
  } finally {
    app.dispose();
    host.remove();
  }
}

/* ----------------------------- custom passes ---------------------------- */

export async function runCustomPassProbe() {
  // after-tonemap invert: c.r_out = 1 − c.r_in.
  const inv = await mount({ size: 200 });
  await inv.runFrames(3);
  const before = inv.read();
  const release = inv.app.addPostPass({
    name: "invert-red",
    insertAt: "after-tonemap",
    fragment: {
      glsl: `void main() {
  vec4 c = texture(u_color, v_uv);
  outColor = vec4(1.0 - c.r, c.g, c.b, c.a);
}`
    }
  });
  await inv.runFrames(3);
  const after = inv.read();
  const w = inv.width, h = inv.height;
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const sample = (px: Uint8Array) => Array.from(px.slice((cy * w + cx) * 4, (cy * w + cx) * 4 + 3));
  const invResult = { before: sample(before), after: sample(after) };
  release();
  inv.app.dispose();
  inv.host.remove();

  // before-tonemap HDR gate: the emissive wall sits behind the camera-facing
  // direction — instead point the camera at it and write white where r > 1.
  const hdr = await mount({ size: 200, bright: true });
  const ctl = (hdr.app as { camera?: { setPose?: (p: { position: readonly number[]; target: readonly number[] }) => void } }).camera;
  ctl?.setPose?.({ position: [0, 1.4, 0], target: [0, 1.4, 8] });
  await hdr.runFrames(3);
  hdr.app.addPostPass({
    name: "hdr-gate",
    insertAt: "before-tonemap",
    fragment: {
      glsl: `void main() {
  vec4 c = texture(u_color, v_uv);
  outColor = vec4(vec3(step(1.0, c.r)), 1.0);
}`
    }
  });
  await hdr.runFrames(3);
  const gate = hdr.read();
  const hdrSample = sample(gate);
  hdr.app.dispose();
  hdr.host.remove();

  return { schema: "custom-pass/v1", invert: invResult, hdrGate: hdrSample };
}

/* --------------------------------- run ---------------------------------- */

export interface Phase6Result {
  readonly schema: "prd03-phase6/v1";
  readonly smaa: Awaited<ReturnType<typeof runSmaaEdgeProbe>>;
  readonly exposure: Awaited<ReturnType<typeof runExposureProbe>>;
  readonly customPass: Awaited<ReturnType<typeof runCustomPassProbe>>;
}

export async function runQrPrd03Phase6(): Promise<Phase6Result> {
  const smaa = await runSmaaEdgeProbe().catch((e) => ({ schema: "smaa-edge/v1", error: String(e) }));
  const exposure = await runExposureProbe().catch((e) => ({ schema: "exposure/v1", error: String(e) }));
  const customPass = await runCustomPassProbe().catch((e) => ({ schema: "custom-pass/v1", error: String(e) }));
  return { schema: "prd03-phase6/v1", smaa: smaa as Phase6Result["smaa"], exposure: exposure as Phase6Result["exposure"], customPass: customPass as Phase6Result["customPass"] };
}

(window as { runQrPrd03Phase6?: typeof runQrPrd03Phase6 }).runQrPrd03Phase6 = runQrPrd03Phase6;

// 03-S18d: publish a readiness symbol *after* the module has fully evaluated
// and a WebGL2 context is actually creatable. The spec gates on this symbol
// instead of polling for the function — the function can never be invoked
// before the harness is genuinely runnable, and a failure status carries the
// reason into CI logs.
{
  const w = window as { qrPrd03Phase6Ready?: boolean; qrPrd03Phase6Status?: string };
  w.qrPrd03Phase6Ready = false;
  w.qrPrd03Phase6Status = "module evaluated";
  try {
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2")) throw new Error("webgl2 context unavailable");
    w.qrPrd03Phase6Status = "ready";
    w.qrPrd03Phase6Ready = true;
  } catch (error) {
    w.qrPrd03Phase6Status = `not ready: ${error}`;
  }
}
