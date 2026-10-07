/**
 * PRD-03 Phase-4 browser probes:
 *
 *  - `cameraVelocityProbe`: `CAMERA_VELOCITY_GLSL` (S1-C) compiled raw on
 *    WebGL2 with a constant mid-depth texture and prev/unjittered VPs for a
 *    1° yaw — velocity at sampled pixels must sit within 2% of the JS-analytic
 *    reprojection (§8.6 depth-reprojected UV deltas).
 *  - `taaStaticProbe` (case a): flag-on TAA over a static 1-px line, 32
 *    frames — temporal luma stddev on the line mask.
 *  - `taaPanProbe` (case b): camera-node yaw pan over static columns — ghost
 *    trail width vs the static silhouette.
 *  - `taaCutProbe` (case c): `app.cutCamera()` mid-run — post-cut frame vs a
 *    fresh no-history frame.
 *  - `motionBlurProbe` (§8.8/C-23): camera-node pan driven at 60 vs 30 fps —
 *    measured blur extent differs by ≤10%.
 *  - `dofMetricProbe` (§8.9): metric DoF (focusDistance/fStop/focalLength)
 *    — focus-plane pixels vs no-DoF, bokeh diameter of a distant point light.
 */
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";
import { CAMERA_VELOCITY_GLSL } from "../../packages/rendering/src/post/shaders/depthDownsample.glsl";

/* ------------------------------- mat4 helpers --------------------------- */

type Mat4 = Float32Array;

function perspective(fovDeg: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) / (near - far); m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function lookAtView(eye: [number, number, number], target: [number, number, number]): Mat4 {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const up = [0, 1, 0] as const;
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  const m = new Float32Array(16);
  m.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1]);
  return m;
}

function yawView(yawDeg: number): Mat4 {
  const c = Math.cos((yawDeg * Math.PI) / 180), s = Math.sin((yawDeg * Math.PI) / 180);
  const m = new Float32Array(16);
  m.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  return m;
}

function mul4(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

function invert4(m: Mat4): Mat4 {
  // General 4x4 inverse (adjugate / det) — fine for a 16-element probe.
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[12] * m[2] * m[7] - m[12] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[12] * m[1] * m[7] + m[12] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[12] * m[1] * m[6] - m[12] * m[2] * m[5];
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (det === 0) throw new Error("singular mat4");
  det = 1 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

function project(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ];
}

function cross3(a: ArrayLike<number>, b: ArrayLike<number>): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize3(v: [number, number, number]): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/* ------------------------------- GL helpers ------------------------------ */

function compileGl(gl: WebGL2RenderingContext, fsSource: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, `#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSource);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(`fragment compile: ${gl.getShaderInfoLog(fs)}`);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
  return program;
}

function rawContext(size: number): { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const gl = canvas.getContext("webgl2")!;
  return { canvas, gl };
}

const LUMA = [0.3, 0.59, 0.11] as const;
const lumaAt = (p: ArrayLike<number>, i: number) => LUMA[0] * p[i] + LUMA[1] * p[i + 1] + LUMA[2] * p[i + 2];

/* -------------------------- camera velocity probe ------------------------ */

/** Analytic velocity for one NDC point: world → prevVP → ndcPrev; v = Δndc·0.5. */
function analyticVelocity(ndcX: number, ndcY: number, depth: number, invUnjittered: Mat4, prevVp: Mat4): [number, number] {
  const clip = [ndcX, ndcY, depth * 2 - 1] as const;
  const worldW = project(invUnjittered, clip[0], clip[1], clip[2]); // inv applied to clip — see shader
  const prevNdc = project(prevVp, worldW[0], worldW[1], worldW[2]);
  return [(ndcX - prevNdc[0]) * 0.5, (ndcY - prevNdc[1]) * 0.5];
}

export async function runCameraVelocityProbe() {
  const SIZE = 64;
  const { gl } = rawContext(SIZE);
  const program = compileGl(gl, CAMERA_VELOCITY_GLSL);

  // Constant mid-depth texture (device-space 0.5 → linearized mid-range).
  const depth = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, depth);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const depthPx = new Float32Array(SIZE * SIZE).fill(0.5);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, SIZE, SIZE, 0, gl.RED, gl.FLOAT, depthPx);

  const proj = perspective(60, 1, 0.1, 100);
  const unjittered = mul4(proj, lookAtView([0, 0, 0], [0, 0, -1]));
  const previous = mul4(proj, mul4(lookAtView([0, 0, 0], [0, 0, -1]), yawView(1))); // 1° yaw prev frame

  const fbo = gl.createFramebuffer()!;
  const out = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, out);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SIZE, SIZE, 0, gl.RGBA, gl.FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
  gl.viewport(0, 0, SIZE, SIZE);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, depth);
  gl.uniform1i(gl.getUniformLocation(program, "u_depth"), 0);
  gl.uniform1f(gl.getUniformLocation(program, "u_near"), 0.1);
  gl.uniform1f(gl.getUniformLocation(program, "u_far"), 100);
  gl.uniform1i(gl.getUniformLocation(program, "u_ortho"), 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "u_prevViewProjection"), false, previous);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "u_invUnjitteredViewProjection"), false, invert4(unjittered));
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const px = new Float32Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.FLOAT, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const inv = invert4(unjittered);
  const samples = [[32, 32], [20, 44], [48, 16], [10, 10], [54, 50]] as const;
  const errors: number[] = [];
  const rows = samples.map(([x, y]) => {
    const ndcX = ((x + 0.5) / SIZE) * 2 - 1;
    const ndcY = ((y + 0.5) / SIZE) * 2 - 1;
    const [ex, ey] = analyticVelocity(ndcX, ndcY, 0.5, inv, previous);
    const i = (y * SIZE + x) * 4;
    const gx = px[i], gy = px[i + 1];
    const denom = Math.max(1e-6, Math.hypot(ex, ey));
    errors.push(Math.hypot(gx - ex, gy - ey) / denom);
    return { x, y, expected: [ex, ey], got: [gx, gy] };
  });
  return { schema: "camera-velocity/v1", maxRelError: Math.max(...errors), samples: rows };
}

/* ------------------------------- TAA probes ------------------------------ */

async function mountTaaScene(hostSize = 320) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2000px;top:0;width:${hostSize}px;height:${hostSize}px;`;
  document.body.appendChild(host);
  const built = scene()
    .background("#10141a")
    .camera(camera.perspective({ position: [0, 1.5, 5], target: [0, 1.2, -1], fov: 40, near: 0.1, far: 80 }))
    .add(lights.directional({ name: "sun", color: "#f4f6ff", intensity: 2, position: [3, 6, 4] }))
    .add(lights.ambient({ name: "ambient", color: "#4a5568", intensity: 0.5 }))
    .add(primitives.plane({ name: "ground", size: [20, 1, 20], material: material.pbr({ color: "#20262e", roughness: 0.9 }) }).position(0, 0, 0))
    .add(primitives.box({ name: "1px line", size: [6, 0.012, 0.012], material: material.pbr({ color: "#e8e8e8", roughness: 0.6 }) }).position(0, 1.2, -1))
    .add(effects.antiAlias({ mode: "taa" }));
  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    qualityRebuild: { flags: ["A3D_QR_POST"] }
  });
  await app.ready();
  const canvas = host.querySelector("canvas")!;
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const read = () => {
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  return { app, host, read, width: canvas.width, height: canvas.height };
}

function findCameraNode(app: unknown): { setPosition(x: number, y: number, z: number): unknown } | undefined {
  const nodes = (app as { nodes?: { all(): readonly { kind: string }[] } }).nodes;
  return nodes?.all().find((node) => node.kind === "camera") as { setPosition(x: number, y: number, z: number): unknown } | undefined;
}

/** Case a: static camera, 1-px line — temporal luma stddev over 32 frames. */
export async function runTaaStaticProbe() {
  const { app, host, read, width, height } = await mountTaaScene();
  try {
    const frames: Uint8Array[] = [];
    for (let i = 0; i < 32; i++) {
      app.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
      frames.push(read());
    }
    // Temporal luma stddev across the whole frame (the 1-px line is the only
    // edge content; averaging over all pixels under-reports it, so also take
    // the max per-pixel stddev).
    let sumStd = 0;
    let maxStd = 0;
    const n = width * height;
    for (let i = 0; i < n; i++) {
      const values = frames.map((f) => lumaAt(f, i * 4));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length) / 255;
      sumStd += std;
      if (std > maxStd) maxStd = std;
    }
    return { schema: "taa-static/v1", meanStddev: sumStd / n, maxStddev: maxStd, frames: frames.length };
  } finally {
    app.dispose();
    host.remove();
  }
}

/** Case b: yaw pan via the runtime camera node — ghost trail width on the line. */
export async function runTaaPanProbe() {
  const { app, host, read, width, height } = await mountTaaScene();
  try {
    const cam = findCameraNode(app);
    if (!cam?.setPosition) return { schema: "taa-pan/v1", untested: "no runtime camera node surface" };
    const startX = -1.5;
    for (let i = 0; i < 48; i++) {
      cam.setPosition(startX + (i * 3) / 48, 1.5, 5);
      app.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const moving = read();
    // Ghost = bright-line smear: columns where a >0.5-luma pixel appears that a
    // converged frame doesn't have.
    const settled = await (async () => {
      const still = await mountTaaScene();
      still.app.step(1 / 60);
      const f = still.read();
      still.app.dispose();
      still.host.remove();
      return f;
    })();
    let ghostPx = 0;
    for (let i = 0; i < width * height; i++) {
      const mv = lumaAt(moving, i * 4);
      const st = lumaAt(settled, i * 4);
      if (mv > 120 && st < 60) ghostPx += 1;
    }
    return { schema: "taa-pan/v1", ghostPixels: ghostPx, width, height };
  } finally {
    app.dispose();
    host.remove();
  }
}

/** Case c: `app.cutCamera()` — post-cut frame vs a fresh no-history frame. */
export async function runTaaCutProbe() {
  const { app, host, read } = await mountTaaScene();
  try {
    for (let i = 0; i < 16; i++) {
      app.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const cut = (app as { cutCamera?: () => void }).cutCamera;
    if (!cut) return { schema: "taa-cut/v1", untested: "app.cutCamera not present" };
    cut.call(app);
    app.step(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
    const postCut = read();
    // No-history reference: a fresh mount's first stepped frame.
    const still = await mountTaaScene();
    still.app.step(1 / 60);
    const fresh = still.read();
    still.app.dispose();
    still.host.remove();
    let over2Lsb = 0;
    for (let i = 0; i < postCut.length; i += 4) {
      if (Math.abs(postCut[i] - fresh[i]) > 2 || Math.abs(postCut[i + 1] - fresh[i + 1]) > 2 || Math.abs(postCut[i + 2] - fresh[i + 2]) > 2) over2Lsb += 1;
    }
    return { schema: "taa-cut/v1", pixelsOver2Lsb: over2Lsb };
  } finally {
    app.dispose();
    host.remove();
  }
}

/* --------------------------- motion blur probe --------------------------- */

async function mountMotionBlurScene(hostSize = 320) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2000px;top:0;width:${hostSize}px;height:${hostSize}px;`;
  document.body.appendChild(host);
  const built = scene()
    .background("#14181f")
    .camera(camera.perspective({ position: [0, 1.8, 5], target: [0, 1, -2], fov: 50, near: 0.1, far: 80 }))
    .add(lights.directional({ name: "sun", color: "#eef2ff", intensity: 1.6, position: [4, 8, 4] }))
    .add(lights.ambient({ name: "ambient", color: "#4a5568", intensity: 0.4 }))
    .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2a3038", roughness: 0.9 }) }).position(0, 0, 0))
    .add(primitives.box({ name: "column", size: [0.4, 1.8, 0.4], material: material.pbr({ color: "#7a8494", roughness: 0.7 }) }).position(0, 0.9, -2))
    .add(effects.motionBlur({ shutter: 0.8, samples: 12, maxBlur: 32 }));
  const app = createAuraApp(host, {
    scene: built,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    qualityRebuild: { flags: ["A3D_QR_POST"] }
  });
  await app.ready();
  const canvas = host.querySelector("canvas")!;
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const read = () => {
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  return { app, host, read, width: canvas.width, height: canvas.height };
}

/** Blur extent: horizontal run length of mid-luma pixels around the column row. */
function blurExtent(pixels: Uint8Array, width: number, height: number): number {
  const row = Math.floor(height * 0.5);
  let lo = width;
  let hi = 0;
  for (let x = 0; x < width; x++) {
    const v = lumaAt(pixels, (row * width + x) * 4);
    if (v > 60 && v < 245) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  }
  return hi > lo ? hi - lo : 0;
}

export async function runMotionBlurProbe() {
  const drive = async (fps: number) => {
    const { app, host, read, width, height } = await mountMotionBlurScene();
    try {
      const cam = findCameraNode(app);
      if (!cam?.setPosition) return { untested: "no runtime camera node surface" };
      const dt = 1 / fps;
      const dx = 0.05; // world units per second of pan
      for (let i = 0; i < 12; i++) {
        cam.setPosition(i * dx * fps * dt, 1.8, 5);
        app.step(dt);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { extent: blurExtent(read(), width, height) };
    } finally {
      app.dispose();
      host.remove();
    }
  };
  const at60 = await drive(60);
  const at30 = await drive(30);
  if ("untested" in at60 || "untested" in at30) return { schema: "motion-blur/v1", untested: true };
  const rel = Math.abs(at60.extent! - at30.extent!) / Math.max(1e-6, Math.max(at60.extent!, at30.extent!));
  return { schema: "motion-blur/v1", extent60: at60.extent, extent30: at30.extent, relDiff: rel };
}

/* -------------------------------- DoF probe ------------------------------ */

export async function runDofMetricProbe() {
  const buildScene = (dof: boolean) =>
    scene()
      .background("#0c0e12")
      .camera(camera.perspective({ position: [0, 1.6, 3], target: [0, 1.2, 0], fov: 45, near: 0.1, far: 90 }))
      .add(lights.directional({ name: "sun", color: "#f6ecdd", intensity: 1.1, position: [4, 7, 5] }))
      .add(lights.ambient({ name: "ambient", color: "#30363f", intensity: 0.5 }))
      .add(primitives.plane({ name: "ground", size: [30, 1, 40], material: material.pbr({ color: "#1e232a", roughness: 0.9 }) }).position(0, 0, -10))
      .add(primitives.sphere({ name: "hero", size: [1, 1, 1], material: material.pbr({ color: "#c8503f", roughness: 0.55 }) }).position(0, 1.2, 0))
      .add(primitives.sphere({ name: "bokeh light", size: [0.3, 0.3, 0.3], material: material.pbr({ color: "#000000", emissive: "#ffd9a0", emissiveIntensity: 5, roughness: 1 }) }).position(0, 1.4, -27))
      .add(...(dof ? [effects.depthOfField({ focusDistance: 3, fStop: 2.8, focalLength: 50 })] : []))
      .add(effects.antiAlias({ mode: "fxaa" }));

  const mount = async (dof: boolean) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-2000px;top:0;width:320px;height:320px;";
    document.body.appendChild(host);
    const app = createAuraApp(host, {
      scene: buildScene(dof),
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      pixelRatio: 1,
      resize: false,
      autoStart: false,
      qualityRebuild: { flags: ["A3D_QR_POST"] }
    });
    await app.ready();
    app.step(0);
    const canvas = host.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const size = { width: canvas.width, height: canvas.height };
    app.dispose();
    host.remove();
    return { pixels, ...size };
  };

  const withDof = await mount(true);
  const noDof = await mount(false);
  // Focus-plane (hero centre row): |Δ| must stay ≤ 2 LSB.
  const { width, height } = withDof;
  let focusViolations = 0;
  const heroRow = Math.floor(height * 0.48);
  const heroX0 = Math.floor(width * 0.42);
  const heroX1 = Math.floor(width * 0.58);
  for (let x = heroX0; x < heroX1; x++) {
    const i = (heroRow * width + x) * 4;
    if (Math.abs(withDof.pixels[i] - noDof.pixels[i]) > 2) focusViolations += 1;
  }
  // Bokeh diameter: horizontal extent of >0.5-luma pixels on the light's row.
  const lightRow = Math.floor(height * 0.52);
  let lo = width, hi = 0;
  for (let x = 0; x < width; x++) {
    const i = (lightRow * width + x) * 4;
    if (lumaAt(withDof.pixels, i) > 128) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
  }
  const bokehDiameter = hi > lo ? hi - lo : 0;
  return { schema: "dof-metric/v1", focusViolations, bokehDiameter, expectedBokeh: 12.3 };
}


/* -------------------------------- TAAU (§8.6) ---------------------------- */

/**
 * Per-column vertical centroid of the 1-px line band: the edge error is the
 * RMS of (centroid − median centroid) across columns — sub-pixel wobble the
 * TAA resolve leaves after stabilization. Run at renderScale 1 and 0.67;
 * §8.6 bounds the upscaled error at ≤ 1.3× the full-res error.
 */
function lineEdgeError(pixels: Uint8Array, width: number, height: number): number {
  const centroids: number[] = [];
  for (let x = 0; x < width; x++) {
    let num = 0, den = 0;
    for (let y = 0; y < height; y++) {
      const l = lumaAt(pixels, (y * width + x) * 4);
      // Weight by contrast above the dark background.
      const w = Math.max(0, l - 0.12);
      num += y * w;
      den += w;
    }
    if (den > 0.01) centroids.push(num / den);
  }
  if (centroids.length < 8) return -1;
  const sorted = [...centroids].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const rms = Math.sqrt(centroids.reduce((a, c) => a + (c - median) ** 2, 0) / centroids.length);
  return rms;
}

export async function runTaauProbe() {
  const mount = async (scale: number) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-2000px;top:0;width:320px;height:320px;";
    document.body.appendChild(host);
    const built = scene()
      .background("#10141a")
      .camera(camera.perspective({ position: [0, 1.5, 5], target: [0, 1.2, -1], fov: 40, near: 0.1, far: 80 }))
      .add(lights.directional({ name: "sun", color: "#f4f6ff", intensity: 2, position: [3, 6, 4] }))
      .add(lights.ambient({ name: "ambient", color: "#4a5568", intensity: 0.5 }))
      .add(primitives.plane({ name: "ground", size: [20, 1, 20], material: material.pbr({ color: "#20262e", roughness: 0.9 }) }).position(0, 0, 0))
      .add(primitives.box({ name: "1px line", size: [6, 0.012, 0.012], material: material.pbr({ color: "#e8e8e8", roughness: 0.6 }) }).position(0, 1.2, -1))
      .add(effects.antiAlias({ mode: "taa" }));
    const app = createAuraApp(host, {
      scene: built,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      pixelRatio: 1,
      resize: false,
      autoStart: false,
      qualityRebuild: { flags: ["A3D_QR_POST"] }
    });
    await app.ready();
    const quality = (app as { quality?: { set?: (t: string, o?: { minRenderScale?: number }) => Promise<void> } }).quality;
    if (!quality?.set) { app.dispose(); host.remove(); return { untested: "no app.quality.set" } as const; }
    await quality.set("ultra", { minRenderScale: scale });
    for (let i = 0; i < 24; i++) {
      app.step(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const canvas = host.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const err = lineEdgeError(pixels, canvas.width, canvas.height);
    app.dispose();
    host.remove();
    return { err } as const;
  };

  const full = await mount(1);
  if ("untested" in full) return { schema: "taau/v1", untested: full.untested };
  const upscaled = await mount(0.67);
  if ("untested" in upscaled) return { schema: "taau/v1", untested: upscaled.untested };
  return { schema: "taau/v1", fullResError: full.err, upscaledError: upscaled.err };
}

export async function runQrPrd03Phase4() {
  const cameraVelocity = await runCameraVelocityProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  const taaStatic = await runTaaStaticProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  const taaPan = await runTaaPanProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  const taaCut = await runTaaCutProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  const motionBlur = await runMotionBlurProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  const dofMetric = await runDofMetricProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  const taau = await runTaauProbe().catch((error) => ({ error: String(error?.message ?? error) }));
  return { schema: "qr-prd03-phase4/v1", cameraVelocity, taaStatic, taaPan, taaCut, motionBlur, dofMetric, taau };
}

(window as unknown as { runQrPrd03Phase4: typeof runQrPrd03Phase4 }).runQrPrd03Phase4 = runQrPrd03Phase4;
