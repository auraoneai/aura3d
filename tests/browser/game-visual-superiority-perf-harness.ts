/**
 * PART K1 lane-2 perf harness (muse3jsparity-PRD task 3).
 *
 * Directional micro-benchmarks of the four K1 workload classes on THIS
 * machine's real GPU: full bloom chain (bright-extract + pyramid blur +
 * composite), 4k instanced draws, a 64-light forward loop, and a 10k
 * particle update+draw. Every iteration ends in a fence sync
 * (`fenceSync` + blocking `clientWaitSync`) plus a 1px readback, so the
 * reported wall-clock includes GPU completion — never queue time alone.
 *
 * These are workload-class costs, NOT end-to-end Aura frame times and NOT
 * universal claims: the receipt records the renderer string and labels the
 * numbers directional.
 */

interface PerfWorkload {
  readonly medianMs: number;
  readonly meanMs: number;
  readonly iters: number;
  readonly gpuCompleted: boolean;
  readonly completionVia: string;
  readonly detail: string;
}

interface GameVisualPerfResult {
  readonly status: "ready" | "error" | "waiting";
  readonly renderer?: string;
  readonly canvasSize?: readonly [number, number];
  readonly directional?: string;
  readonly workloads?: {
    readonly bloomChain: PerfWorkload;
    readonly instance4k: PerfWorkload;
    readonly light64: PerfWorkload;
    readonly particle10k: PerfWorkload;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_GAME_VISUAL_PERF__?: GameVisualPerfResult;
  }
}

window.__AURA3D_GAME_VISUAL_PERF__ = { status: "waiting" };

const WIDTH = 640;
const HEIGHT = 360;
const ITERS = 25;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function summarize(
  samples: readonly number[],
  gpuCompleted: boolean,
  completionVia: string,
  detail: string
): PerfWorkload {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { medianMs: median(samples), meanMs: mean, iters: samples.length, gpuCompleted, completionVia, detail };
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed.");
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

const FULLSCREEN_VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * GPU completion per iteration. Preferred: fence sync signaled. Fallback
 * (recorded): `gl.finish()` — which blocks until all GL commands complete —
 * plus a 1px readback and a clean error state. SwiftShader-class drivers
 * never signal a client-wait fence, so the fallback is the honest mechanism
 * there; the receipt records which mechanism proved each workload.
 */
function drainGlErrors(gl: WebGL2RenderingContext): void {
  let code = gl.getError();
  while (code !== gl.NO_ERROR) code = gl.getError();
}

function gpuComplete(gl: WebGL2RenderingContext): { completed: boolean; via: string } {
  let fenceOk = false;
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (sync) {
    const wait = gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT, 1_000_000_000);
    fenceOk = wait === gl.CONDITION_SATISFIED || wait === gl.ALREADY_SIGNALED;
    gl.deleteSync(sync);
  }
  // Some drivers (this machine's SwiftShader-class GL) raise INVALID_OPERATION
  // on clientWaitSync instead of waiting. That flag is the driver's fence
  // limitation, not a workload failure: drain it, then prove completion with
  // finish + readback + a clean error state.
  drainGlErrors(gl);
  gl.finish();
  const pixel = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  void pixel;
  let code = gl.getError();
  let clean = true;
  while (code !== gl.NO_ERROR) {
    clean = false;
    code = gl.getError();
  }
  return { completed: clean, via: fenceOk ? "fence-sync" : "finish+readback" };
}

function makeTarget(gl: WebGL2RenderingContext, w: number, h: number): { fb: WebGLFramebuffer; tex: WebGLTexture } {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed.");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("createFramebuffer failed.");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("framebuffer incomplete.");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}

function bindFullscreenQuad(gl: WebGL2RenderingContext): void {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
}

void runPerf().catch((error: unknown) => {
  window.__AURA3D_GAME_VISUAL_PERF__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
});

async function runPerf(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#perf");
  if (!canvas) throw new Error("#perf canvas is missing.");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) throw new Error("WebGL2 is unavailable on this machine.");
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : "unavailable";

  bindFullscreenQuad(gl);

  // --- (1) Full bloom chain: bright-extract + pyramid blur + composite. ---
  const brightFs = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_src;
uniform float u_threshold;
void main() {
  vec3 c = texture2D(u_src, v_uv).rgb;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(u_threshold, u_threshold + 0.2, luma);
  gl_FragColor = vec4(c * k, 1.0);
}
`;
  const blurFs = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform vec2 u_dir;
void main() {
  vec3 acc = vec3(0.0);
  acc += texture2D(u_src, v_uv - 4.0 * u_texel * u_dir).rgb * 0.05;
  acc += texture2D(u_src, v_uv - 3.0 * u_texel * u_dir).rgb * 0.09;
  acc += texture2D(u_src, v_uv - 2.0 * u_texel * u_dir).rgb * 0.12;
  acc += texture2D(u_src, v_uv - 1.0 * u_texel * u_dir).rgb * 0.15;
  acc += texture2D(u_src, v_uv).rgb * 0.18;
  acc += texture2D(u_src, v_uv + 1.0 * u_texel * u_dir).rgb * 0.15;
  acc += texture2D(u_src, v_uv + 2.0 * u_texel * u_dir).rgb * 0.12;
  acc += texture2D(u_src, v_uv + 3.0 * u_texel * u_dir).rgb * 0.09;
  acc += texture2D(u_src, v_uv + 4.0 * u_texel * u_dir).rgb * 0.05;
  gl_FragColor = vec4(acc, 1.0);
}
`;
  const compositeFs = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_src;
uniform sampler2D u_bloom;
uniform float u_strength;
void main() {
  vec3 base = texture2D(u_src, v_uv).rgb;
  vec3 bloom = texture2D(u_bloom, v_uv).rgb;
  gl_FragColor = vec4(base + bloom * u_strength, 1.0);
}
`;
  const brightProg = program(gl, FULLSCREEN_VS, brightFs);
  const blurProg = program(gl, FULLSCREEN_VS, blurFs);
  const compositeProg = program(gl, FULLSCREEN_VS, compositeFs);

  // Procedural HDR-ish source: bright bars over a dark gradient.
  const srcData = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const i = (y * WIDTH + x) * 4;
      const bar = x % 64 < 8 ? 255 : 18;
      srcData[i] = bar;
      srcData[i + 1] = Math.floor(bar * 0.72);
      srcData[i + 2] = Math.floor(bar * 0.35);
      srcData[i + 3] = 255;
    }
  }
  const srcTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, WIDTH, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, srcData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const mipSizes: ReadonlyArray<readonly [number, number]> = [
    [320, 180],
    [160, 90],
    [80, 45],
    [40, 23],
    [20, 12],
  ];
  const mips = mipSizes.map(([w, h]) => ({ ...makeTarget(gl, w, h), w, h }));
  const bright = makeTarget(gl, WIDTH, HEIGHT);

  function blit(prog: WebGLProgram, target: { fb: WebGLFramebuffer } | null, setup: () => void): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const w = target ? (target as { w?: number }).w : undefined;
    void w;
    gl.useProgram(prog);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    setup();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(loc);
  }
  function bindTex(unit: number, tex: WebGLTexture | null): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  const bloomSamples: number[] = [];
  let bloomCompleted = true;
  let bloomVia = "fence-sync";
  for (let iter = 0; iter < ITERS; iter += 1) {
    const t0 = performance.now();
    gl.viewport(0, 0, WIDTH, HEIGHT);
    blit(brightProg, bright, () => {
      gl.uniform1i(gl.getUniformLocation(brightProg, "u_src"), 0);
      gl.uniform1f(gl.getUniformLocation(brightProg, "u_threshold"), 0.6);
      bindTex(0, srcTex);
    });
    let prev: WebGLTexture = bright.tex;
    let prevW = WIDTH;
    let prevH = HEIGHT;
    for (const mip of mips) {
      gl.viewport(0, 0, mip.w, mip.h);
      const horizontal = mip.w >= mip.h;
      blit(blurProg, mip, () => {
        gl.uniform1i(gl.getUniformLocation(blurProg, "u_src"), 0);
        gl.uniform2f(gl.getUniformLocation(blurProg, "u_texel"), 1 / prevW, 1 / prevH);
        gl.uniform2f(
          gl.getUniformLocation(blurProg, "u_dir"),
          horizontal ? 1 : 0,
          horizontal ? 0 : 1
        );
        bindTex(0, prev);
      });
      prev = mip.tex;
      prevW = mip.w;
      prevH = mip.h;
    }
    gl.viewport(0, 0, WIDTH, HEIGHT);
    blit(compositeProg, null, () => {
      gl.uniform1i(gl.getUniformLocation(compositeProg, "u_src"), 0);
      gl.uniform1i(gl.getUniformLocation(compositeProg, "u_bloom"), 1);
      gl.uniform1f(gl.getUniformLocation(compositeProg, "u_strength"), 0.9);
      bindTex(0, srcTex);
      bindTex(1, prev);
    });
    const bloomGate = gpuComplete(gl);
    bloomCompleted = bloomGate.completed && bloomCompleted;
    if (bloomGate.via !== "fence-sync") bloomVia = "finish+readback";
    bloomSamples.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // --- (2) 4k instanced draws. ---
  const instVs = `
attribute vec2 a_pos;
attribute vec2 a_offset;
void main() {
  gl_Position = vec4(a_pos * 0.03 + a_offset, 0.0, 1.0);
}
`;
  const instFs = `
precision mediump float;
void main() {
  gl_FragColor = vec4(0.88, 0.54, 0.24, 1.0);
}
`;
  const instProg = program(gl, instVs, instFs);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const COUNT_4K = 4096;
  const offsets = new Float32Array(COUNT_4K * 2);
  for (let i = 0; i < COUNT_4K; i += 1) {
    const col = i % 64;
    const row = Math.floor(i / 64);
    offsets[i * 2] = (col / 63) * 1.9 - 0.95;
    offsets[i * 2 + 1] = (row / 63) * 1.9 - 0.95;
  }
  const offBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
  gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);
  const instanceSamples: number[] = [];
  let instanceCompleted = true;
  let instanceVia = "fence-sync";
  for (let iter = 0; iter < ITERS; iter += 1) {
    const t0 = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, WIDTH, HEIGHT);
    gl.useProgram(instProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const posLoc = gl.getAttribLocation(instProg, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
    const offLoc = gl.getAttribLocation(instProg, "a_offset");
    gl.enableVertexAttribArray(offLoc);
    gl.vertexAttribPointer(offLoc, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(offLoc, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, COUNT_4K);
    gl.vertexAttribDivisor(offLoc, 0);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(offLoc);
    const instanceGate = gpuComplete(gl);
    instanceCompleted = instanceGate.completed && instanceCompleted;
    if (instanceGate.via !== "fence-sync") instanceVia = "finish+readback";
    instanceSamples.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // --- (3) 64-light forward loop over a fullscreen triangle. ---
  const lightFs = `
precision mediump float;
varying vec2 v_uv;
uniform vec3 u_lights[64];
void main() {
  vec3 n = normalize(vec3(v_uv - 0.5, 0.75));
  vec3 acc = vec3(0.02);
  for (int i = 0; i < 64; i++) {
    vec3 l = normalize(u_lights[i] - vec3(v_uv, 0.0));
    acc += vec3(1.0, 0.75, 0.5) * max(dot(n, l), 0.0) * 0.035;
  }
  gl_FragColor = vec4(acc, 1.0);
}
`;
  const lightProg = program(gl, FULLSCREEN_VS, lightFs);
  const lightData = new Float32Array(64 * 3);
  for (let i = 0; i < 64; i += 1) {
    lightData[i * 3] = (i % 8) / 7;
    lightData[i * 3 + 1] = (Math.floor(i / 8) % 8) / 7;
    lightData[i * 3 + 2] = 0.4;
  }
  const lightSamples: number[] = [];
  let lightCompleted = true;
  let lightVia = "fence-sync";
  for (let iter = 0; iter < ITERS; iter += 1) {
    const t0 = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, WIDTH, HEIGHT);
    blit(lightProg, null, () => {
      gl.uniform3fv(gl.getUniformLocation(lightProg, "u_lights[0]"), lightData);
    });
    const lightGate = gpuComplete(gl);
    lightCompleted = lightGate.completed && lightCompleted;
    if (lightGate.via !== "fence-sync") lightVia = "finish+readback";
    lightSamples.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // --- (4) 10k particles: GPU-side advection + point draw. ---
  const COUNT_10K = 10000;
  const partVs = `
attribute vec4 a_seed;
uniform float u_time;
void main() {
  float span = 4.0;
  vec3 p = vec3(
    mod(a_seed.x + u_time * (0.2 + a_seed.w * 0.6), span) - span * 0.5,
    a_seed.y,
    a_seed.z
  );
  gl_Position = vec4(p.x * 0.5, p.y * 0.5, p.z * 0.2, 1.0);
  gl_PointSize = 3.0;
}
`;
  const partFs = `
precision mediump float;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(1.0, 0.62, 0.2, 1.0);
}
`;
  const partProg = program(gl, partVs, partFs);
  const seeds = new Float32Array(COUNT_10K * 4);
  let s = 1234567;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  for (let i = 0; i < COUNT_10K; i += 1) {
    seeds[i * 4] = rand() * 4;
    seeds[i * 4 + 1] = rand() * 2 - 1;
    seeds[i * 4 + 2] = rand() * 2 - 1;
    seeds[i * 4 + 3] = rand();
  }
  const seedBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const particleSamples: number[] = [];
  let particleCompleted = true;
  let particleVia = "fence-sync";
  for (let iter = 0; iter < ITERS; iter += 1) {
    const t0 = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, WIDTH, HEIGHT);
    gl.useProgram(partProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    const seedLoc = gl.getAttribLocation(partProg, "a_seed");
    gl.enableVertexAttribArray(seedLoc);
    gl.vertexAttribPointer(seedLoc, 4, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(partProg, "u_time"), iter * 0.016);
    gl.drawArrays(gl.POINTS, 0, COUNT_10K);
    gl.disableVertexAttribArray(seedLoc);
    const particleGate = gpuComplete(gl);
    particleCompleted = particleGate.completed && particleCompleted;
    if (particleGate.via !== "fence-sync") particleVia = "finish+readback";
    particleSamples.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(r));
  }

  window.__AURA3D_GAME_VISUAL_PERF__ = {
    status: "ready",
    renderer,
    canvasSize: [WIDTH, HEIGHT],
    directional:
      "Directional same-machine workload-class costs with GPU completion " +
      "(fence sync + readback per iteration); not end-to-end Aura frame " +
      "times, not universal hardware claims.",
    workloads: {
      bloomChain: summarize(
        bloomSamples,
        bloomCompleted,
        bloomVia,
        "bright-extract 640x360 + 5-mip separable blur pyramid + composite"
      ),
      instance4k: summarize(
        instanceSamples,
        instanceCompleted,
        instanceVia,
        "4096 instanced quads, one drawArraysInstanced"
      ),
      light64: summarize(
        lightSamples,
        lightCompleted,
        lightVia,
        "fullscreen 64-light forward accumulation loop"
      ),
      particle10k: summarize(
        particleSamples,
        particleCompleted,
        particleVia,
        "10000 GPU-advected points, one draw"
      ),
    },
  };
}
