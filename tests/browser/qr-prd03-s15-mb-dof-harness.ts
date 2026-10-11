/**
 * 03-S15 (PRD-03 §8.7 S6 / §8.8 S7): motion blur and depth of field measured
 * on frames that reach the Renderer as `RendererPostProcessOptions` with
 * `v2: true` + `pipeline` (asserted through `postGraphV2LastOutcome()`), i.e.
 * the S6/S7 stages in `post/v2Stages.ts`, not the legacy chain.
 *
 *  - Motion blur: a camera pan at a fixed world speed, stepped at 60 fps and at
 *    30 fps, ending on the same pose. S7 scales velocity by
 *    `shutter · (1/60) / frameTime`, so the streak of a thin emissive bar on
 *    a fronto-parallel wall must match within 10 %. A no-blur run gives the
 *    static bar width so the streak is proven to exist.
 *  - DoF: thin-lens anchor f=50 mm, N=2.8, focus 3 m, a near-point emissive
 *    source 30 m away on a 1080 px tall frame → CoC diameter 12.3 px. Bokeh
 *    diameter = bright-blob extent with DoF − the same extent without DoF
 *    (the source's own size).
 *
 * Pixels are read synchronously after `app.step()` (same task as the draw).
 */
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";
import { postGraphV2LastOutcome, postV2ModulesReady } from "@aura3d/rendering";

type Pixels = { readonly data: Uint8Array; readonly width: number; readonly height: number };

const luma = (p: Uint8Array, i: number) => 0.2126 * p[i]! + 0.7152 * p[i + 1]! + 0.0722 * p[i + 2]!;

function readCanvas(canvas: HTMLCanvasElement): Pixels {
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const data = new Uint8Array(canvas.width * canvas.height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return { data, width: canvas.width, height: canvas.height };
}

function makeHost(width: number, height: number): HTMLDivElement {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-4000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(host);
  return host;
}

interface StageEvidence {
  readonly outcome: string;
  readonly stages: readonly string[];
  readonly skipped: readonly string[];
}

function stageEvidence(app: { diagnostics(): unknown }): StageEvidence {
  const post = (app.diagnostics() as { post?: { stages?: readonly string[]; skipped?: readonly string[] } }).post;
  return { outcome: postGraphV2LastOutcome() ?? "none", stages: post?.stages ?? [], skipped: post?.skipped ?? [] };
}

/* ------------------------------ motion blur ------------------------------ */

const MB_SIZE = 512;
const MB_SPEED = 24; // m/s → ≈ 32 px/frame at 60 fps on the wall
const WALL_Z = -7;

function streakExtent(px: Pixels): number {
  // Median over 41 rows around the centre of the contiguous run, through the
  // centre column, of pixels brighter than the wall by > 20 luma.
  const extents: number[] = [];
  const cx = Math.floor(px.width / 2);
  const cy = Math.floor(px.height / 2);
  for (let y = cy - 20; y <= cy + 20; y++) {
    const bg = luma(px.data, (y * px.width + 4) * 4);
    const lit = (x: number) => luma(px.data, (y * px.width + x) * 4) > bg + 20;
    let seed = -1;
    for (let d = 0; d < 40 && seed < 0; d++) {
      if (lit(cx + d)) seed = cx + d;
      else if (lit(cx - d)) seed = cx - d;
    }
    if (seed < 0) { extents.push(0); continue; }
    let lo = seed, hi = seed;
    while (lo > 0 && lit(lo - 1)) lo--;
    while (hi < px.width - 1 && lit(hi + 1)) hi++;
    extents.push(hi - lo + 1);
  }
  extents.sort((a, b) => a - b);
  return extents[Math.floor(extents.length / 2)]!;
}

async function motionBlurRun(fps: number, blur: boolean) {
  const host = makeHost(MB_SIZE, MB_SIZE);
  let built = scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 1.5, 0], target: [0, 1.5, -10], fov: 50, near: 0.1, far: 60 }))
    .add(lights.ambient({ name: "ambient", color: "#ffffff", intensity: 0.6 }))
    .add(primitives.box({ name: "wall", size: [80, 30, 0.1], material: material.pbr({ color: "#303030", roughness: 1 }) }).position(0, 1.5, WALL_Z))
    .add(primitives.box({ name: "bar", size: [0.06, 6, 0.02], material: material.pbr({ color: "#000000", emissive: "#ffffff", emissiveIntensity: 3, roughness: 1 }) }).position(0, 1.5, WALL_Z + 0.06));
  if (blur) built = built.add(effects.motionBlur({ shutter: 0.5, samples: 16, maxBlur: 32 }));
  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    output: { toneMapping: "linear", exposure: 1, dither: false },
    qualityRebuild: { flags: ["A3D_QR_POST"] }
  } as never);
  try {
    await app.ready();
    await postV2ModulesReady();
    const cam = (app as unknown as { camera?: { setPose?(p: { position: readonly number[]; target: readonly number[] }): void } }).camera;
    if (typeof cam?.setPose !== "function") throw new Error("app.camera.setPose unavailable");
    const dt = 1 / fps;
    const frames = Math.round(fps / 5); // 0.2 s of pan, ending at x = 0
    let px: Pixels | null = null;
    for (let i = frames; i >= 0; i--) {
      const x = -i * MB_SPEED * dt;
      cam.setPose({ position: [x, 1.5, 0], target: [x, 1.5, -10] });
      app.step(dt);
      if (i === 0) px = readCanvas(host.querySelector("canvas")!);
      else await new Promise((r) => requestAnimationFrame(r));
    }
    return { extent: streakExtent(px!), evidence: stageEvidence(app) };
  } finally {
    app.dispose();
    host.remove();
  }
}

export async function runMotionBlurV2() {
  const static60 = await motionBlurRun(60, false);
  const at60 = await motionBlurRun(60, true);
  const at30 = await motionBlurRun(30, true);
  const relDiff = Math.abs(at60.extent - at30.extent) / Math.max(1e-6, Math.max(at60.extent, at30.extent));
  return {
    schema: "qr-prd03-s15-motion-blur/v1",
    staticExtent: static60.extent,
    extent60: at60.extent,
    extent30: at30.extent,
    relDiff,
    evidence60: at60.evidence,
    evidence30: at30.evidence
  };
}

/* ---------------------------------- DoF ---------------------------------- */

const DOF_W = 640;
const DOF_H = 1080; // the §8.7 anchor is defined on a 1080 px tall frame
const LIGHT_Z = -27; // camera at z = 3 → 30 m

function blobDiameter(px: Pixels): number {
  // Bounding box of pixels brighter than 64 luma inside ±48 px of the centre.
  const cx = Math.floor(px.width / 2), cy = Math.floor(px.height / 2);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let y = cy - 48; y <= cy + 48; y++) {
    for (let x = cx - 48; x <= cx + 48; x++) {
      if (luma(px.data, (y * px.width + x) * 4) > 64) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < x0) return 0;
  return Math.max(x1 - x0 + 1, y1 - y0 + 1);
}

async function dofRun(dof: boolean) {
  const host = makeHost(DOF_W, DOF_H);
  let built = scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 1.5, 3], target: [0, 1.5, LIGHT_Z], fov: 45, near: 0.1, far: 100 }))
    .add(lights.ambient({ name: "ambient", color: "#ffffff", intensity: 0.2 }))
    // Backdrop just behind the source so neighbouring pixels share its CoC.
    .add(primitives.box({ name: "backdrop", size: [80, 60, 0.1], material: material.pbr({ color: "#101010", roughness: 1 }) }).position(0, 1.5, LIGHT_Z - 0.5))
    .add(primitives.sphere({ name: "point", size: [0.04, 0.04, 0.04], material: material.pbr({ color: "#000000", emissive: "#ffffff", emissiveIntensity: 2000, roughness: 1 }) }).position(0, 1.5, LIGHT_Z));
  if (dof) built = built.add(effects.depthOfField({ focusDistance: 3, fStop: 2.8, focalLength: 50 }));
  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    output: { toneMapping: "linear", exposure: 1, dither: false },
    qualityRebuild: { flags: ["A3D_QR_POST"] }
  } as never);
  try {
    await app.ready();
    await postV2ModulesReady();
    for (let i = 0; i < 3; i++) {
      app.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    app.step(1 / 60);
    const px = readCanvas(host.querySelector("canvas")!);
    return { diameter: blobDiameter(px), frameHeight: px.height, evidence: stageEvidence(app) };
  } finally {
    app.dispose();
    host.remove();
  }
}

export async function runDofV2() {
  const sharp = await dofRun(false);
  const blurred = await dofRun(true);
  return {
    schema: "qr-prd03-s15-dof/v1",
    frameHeight: blurred.frameHeight,
    sourceDiameter: sharp.diameter,
    blobDiameter: blurred.diameter,
    bokehDiameter: blurred.diameter - sharp.diameter,
    expectedBokeh: 12.3,
    evidence: blurred.evidence
  };
}

export async function runQrPrd03S15() {
  const motionBlur = await runMotionBlurV2().catch((error) => ({ error: String((error as Error)?.message ?? error) }));
  const dof = await runDofV2().catch((error) => ({ error: String((error as Error)?.message ?? error) }));
  return { schema: "qr-prd03-s15/v1", motionBlur, dof };
}

(window as unknown as { runQrPrd03S15: typeof runQrPrd03S15 }).runQrPrd03S15 = runQrPrd03S15;
(window as { qrPrd03S15Ready?: boolean }).qrPrd03S15Ready = true;
