/**
 * PRD-03 Phase-1 browser probes (§6.5, §6.11):
 *
 *  - `fxaaCompare`: identical RGBA8 inputs pushed through Aura's flag-on FXAA
 *    finalize program (`post/shaders/fxaa.glsl.ts`, verbatim three r185 port +
 *    triangularDither) and three r185 `FXAAShader` (same algorithm, GLSL1
 *    driver), both on raw WebGL2 1-px-per-texel targets.
 *  - `bandingProbe`: `prd03-night-fog-banding` rendered flag-on through the
 *    FXAA path; returns 8-bit luma run/contour metrics.
 *  - `dofFocusProbe`: a bright box at 10 m under `depthOfField` focused at
 *    ~10 m vs ~1 m — the flag-on `depthRange` (CCR-03-1) controls where the
 *    linear focus fraction lands.
 */
import { FXAA_185_FRAGMENT_GLSL } from "../../packages/rendering/src/post/shaders/fxaa.glsl";
// @ts-expect-error raw node_modules module (r185 FXAAShader, MIT)
import { FXAAShader } from "/node_modules/three/examples/jsm/shaders/FXAAShader.js";
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

const LUMA = [0.3, 0.59, 0.11] as const;
const luma = (p: ArrayLike<number>, i: number) => LUMA[0] * p[i] + LUMA[1] * p[i + 1] + LUMA[2] * p[i + 2];

function compileGl(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

/** GLSL1 three-side vertex: emits `vUv` for a fullscreen triangle. */
const THREE_VS = `attribute vec2 position; varying vec2 vUv; void main(){ vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;
/** GLSL3 aura-side vertex: gl_VertexID fullscreen triangle (matches LegacyPost). */
const AURA_VS = `#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

function upload(gl: WebGL2RenderingContext, w: number, h: number, pixels: Uint8Array): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return texture;
}

function renderProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  source: WebGLTexture,
  w: number,
  h: number,
  bindUniforms: (program: WebGLProgram) => void
): Uint8Array {
  const framebuffer = gl.createFramebuffer()!;
  const target = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  gl.viewport(0, 0, w, h);
  gl.useProgram(program);
  // Fullscreen-triangle positions for GLSL1 drivers (three's `position` attr);
  // the GLSL3 aura program derives vertices from gl_VertexID and ignores it.
  const positionLocation = gl.getAttribLocation(program, "position");
  if (positionLocation >= 0) {
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source);
  bindUniforms(program);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (positionLocation >= 0) gl.disableVertexAttribArray(positionLocation);
  const out = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
}

const SIZE = 64;

/** 1-px white line on black, tilted 3° (the old 4-neighbour shader blurs it). */
function lineInput(): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4);
  const tan = Math.tan((3 * Math.PI) / 180);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x - SIZE / 2 - (y - SIZE / 2) * tan;
      if (Math.abs(dx) < 0.5) px.fill(255, (y * SIZE + x) * 4 + 0);
    }
  }
  for (let i = 0; i < px.length; i += 4) px[i + 3] = 255;
  return px;
}

/** Uniform noise ±0.012 luma around 0.5 — below the 0.0312 contrast threshold. */
function noiseInput(): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4);
  let seed = 0x9e3779b9;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const v = 127.5 + (next() * 2 - 1) * (0.012 * 255);
    px.fill(Math.round(v), i * 4, i * 4 + 3);
    px[i * 4 + 3] = 255;
  }
  return px;
}

/** 1-px black/white checkerboard — expected to blur on both sides alike. */
function checkerInput(): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const v = ((x + y) & 1) === 0 ? 255 : 0;
      px.fill(v, (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3);
      px[(y * SIZE + x) * 4 + 3] = 255;
    }
  }
  return px;
}

function comparePixels(aura: Uint8Array, three: Uint8Array): { meanAbsDiff: number; maxAbsDiff: number } {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < aura.length; i += 4) {
    const d = Math.abs(luma(aura, i) - luma(three, i));
    sum += d;
    max = Math.max(max, d);
  }
  return { meanAbsDiff: sum / (aura.length / 4), maxAbsDiff: max };
}

/** Per-column max luma — (a) the line must stay ≥0.9× three's in every column. */
function columnMaxLuma(pixels: Uint8Array): number[] {
  const out: number[] = [];
  for (let x = 0; x < SIZE; x += 1) {
    let max = 0;
    for (let y = 0; y < SIZE; y += 1) max = Math.max(max, luma(pixels, (y * SIZE + x) * 4));
    out.push(max);
  }
  return out;
}

export interface FxaaCaseResult {
  readonly columnMaxAura: number[];
  readonly columnMaxThree: number[];
  readonly meanAbsDiff: number;
  readonly maxAbsDiff: number;
}

export function runFxaaCompare(): { results: Record<string, FxaaCaseResult>; error?: string } {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const gl = canvas.getContext("webgl2", { antialias: false })!;
  try {
    const auraProgram = compileGl(gl, AURA_VS, FXAA_185_FRAGMENT_GLSL);
    const threeProgram = compileGl(gl, THREE_VS, String(FXAAShader.fragmentShader));
    const results: Record<string, FxaaCaseResult> = {};
    for (const [name, pixels] of Object.entries({ line: lineInput(), noise: noiseInput(), checker: checkerInput() })) {
      const source = upload(gl, SIZE, SIZE, pixels);
      const aura = renderProgram(gl, auraProgram, source, SIZE, SIZE, (program) => {
        gl.uniform1i(gl.getUniformLocation(program, "u_source"), 0);
        gl.uniform2f(gl.getUniformLocation(program, "u_texelSize"), 1 / SIZE, 1 / SIZE);
        gl.uniform2f(gl.getUniformLocation(program, "u_outputTexel"), 1 / SIZE, 1 / SIZE);
      });
      const three = renderProgram(gl, threeProgram, source, SIZE, SIZE, (program) => {
        gl.uniform1i(gl.getUniformLocation(program, "tDiffuse"), 0);
        gl.uniform2f(gl.getUniformLocation(program, "resolution"), 1 / SIZE, 1 / SIZE);
      });
      const diff = comparePixels(aura, three);
      results[name] = { columnMaxAura: columnMaxLuma(aura), columnMaxThree: columnMaxLuma(three), ...diff };
    }
    return { results };
  } catch (error) {
    return { results: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Longest identical-8bit-luma run along each row vs the ideal quantization run. */
export function bandingMetrics(pixels: Uint8Array, width: number, height: number) {
  let maxRun = 0;
  let worstRatio = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 1;
    let min = 255;
    let max = 0;
    for (let x = 0; x < width; x += 1) {
      const v = Math.round(luma(pixels, (y * width + x) * 4));
      min = Math.min(min, v);
      max = Math.max(max, v);
      const next = x + 1 < width ? Math.round(luma(pixels, (y * width + x + 1) * 4)) : -1;
      if (next === v) run += 1;
      else {
        maxRun = Math.max(maxRun, run);
        run = 1;
      }
    }
    const ideal = width / Math.max(1, max - min);
    if (max - min >= 8) worstRatio = Math.max(worstRatio, maxRun / ideal);
  }
  // Sobel contour count: |G| >= 1 LSB on quantized luma.
  let contours = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (dx: number, dy: number) => Math.round(luma(pixels, ((y + dy) * width + x + dx) * 4));
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      if (Math.abs(gx) >= 1 || Math.abs(gy) >= 1) contours += 1;
    }
  }
  return { maxRun, worstRatio, contourFraction: contours / ((width - 2) * (height - 2)) };
}

/** Mean |Δluma| edge energy — sharp content scores high, blurred content low. */
function edgeEnergy(pixels: Uint8Array, width: number, height: number) {
  let sum = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      sum += Math.abs(luma(pixels, i) - luma(pixels, i + 4)) + Math.abs(luma(pixels, i) - luma(pixels, i + width * 4));
    }
  }
  return sum / (width * height);
}

async function mountApp(flags: readonly string[], build: ReturnType<typeof scene>, hostSize: number) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-2000px;top:0;width:${hostSize}px;height:${hostSize}px;`;
  document.body.appendChild(host);
  const app = createAuraApp(host, {
    scene: build,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    pixelRatio: 1,
    resize: false,
    autoStart: false,
    qualityRebuild: { flags: [...flags] }
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
}

/** prd03-night-fog-banding (specs.ts:222) — exp² fog + near-black content. */
export async function runBandingProbe() {
  const built = scene()
    .background("#030711")
    .camera(camera.perspective({ position: [0, 1.6, 8], target: [0, 1, -6], fov: 50, near: 0.1, far: 120 }))
    .add(lights.point({ name: "lantern", color: "#ffb45e", intensity: 6, position: [1.2, 1.8, -4] }))
    .add(lights.ambient({ name: "moon ambient", color: "#1a2233", intensity: 0.35 }))
    .add(primitives.plane({ name: "ground", size: [40, 1, 40], material: material.pbr({ color: "#10151d", roughness: 0.95 }) }).position(0, 0, -8))
    .add(primitives.cylinder({ name: "pillar l", size: [0.5, 3.4, 0.5], material: material.pbr({ color: "#1d2530", roughness: 0.9 }) }).position(-1.8, 1.7, -7))
    .add(primitives.cylinder({ name: "pillar r", size: [0.5, 3.4, 0.5], material: material.pbr({ color: "#1d2530", roughness: 0.9 }) }).position(2.2, 1.7, -9))
    .add(primitives.box({ name: "crate", size: [0.7, 0.7, 0.7], material: material.pbr({ color: "#232c38", roughness: 0.9 }) }).position(0.4, 0.35, -5))
    .add(effects.fog({ density: 0.045, color: "#0a1220" }))
    .add(effects.antiAlias({ mode: "fxaa" }));
  const frame = await mountApp(["A3D_QR_POST"], built, 320);
  return { ...bandingMetrics(frame.pixels, frame.width, frame.height), width: frame.width, height: frame.height };
}

/** DOF focus at 10 m on a 0.05/100 camera → focus fraction ≈ (10-0.05)/(100-0.05). */
export async function runDofFocusProbe() {
  const buildScene = (focus: number) =>
    scene()
      .background("#05080d")
      .camera(camera.perspective({ position: [0, 0, 0], target: [0, 0, -10], fov: 40, near: 0.05, far: 100 }))
      .add(lights.ambient({ name: "ambient", intensity: 0.2, color: "#223344" }))
      .add(primitives.box({
        name: "focus target",
        size: [2, 2, 0.1],
        material: material.pbr({ color: "#0a0d12", emissive: "#e8f0ff", emissiveIntensity: 1.4, roughness: 0.4 })
      }).position(0, 0, -10))
      .add(effects.depthOfField({ focus, intensity: 1 }))
      .add(effects.antiAlias({ mode: "fxaa" }));
  const sharp = await mountApp(["A3D_QR_POST"], buildScene(0.1), 320);
  const blurred = await mountApp(["A3D_QR_POST"], buildScene(0.01), 320);
  return {
    sharpEnergy: edgeEnergy(sharp.pixels, sharp.width, sharp.height),
    blurredEnergy: edgeEnergy(blurred.pixels, blurred.width, blurred.height)
  };
}

export async function runQrPrd03Post() {
  const fxaa = runFxaaCompare();
  const banding = await runBandingProbe().catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const dof = await runDofFocusProbe().catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  return { schema: "qr-prd03-post/v1", fxaa, banding, dof };
}

(window as unknown as { runQrPrd03Post: typeof runQrPrd03Post }).runQrPrd03Post = runQrPrd03Post;
