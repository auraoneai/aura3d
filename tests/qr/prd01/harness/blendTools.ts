/**
 * Lane-01 row 01-S6 (?tools=blend-modes): C-04 blend modes on a real
 * WebGL2Device vs three r185, both into an RGBA16F (HDR) target.
 *
 * (1) parity: an HDR gradient background (linear 0..4) under a front gradient
 *     quad (rgb up to 1.5, alpha 0.2..0.8) for alpha / premultiplied /
 *     additive / multiply; per-pixel RGB MAD vs three (`NormalBlending`,
 *     `NormalBlending`+`premultipliedAlpha`, `AdditiveBlending`,
 *     `MultiplyBlending`) — the spec asserts MAD ≤ 2/255.
 * (2) C-04 browser conformance 4×3: the same 4 modes × 3 solid backgrounds
 *     (0, 0.5, HDR 2.0); the device readback must equal the CPU evaluation of
 *     the contract factor table (`resolveBlendMode`) within 2/255.
 */

import * as THREE from "three";
import { WebGL2Device, type UniformValue } from "../../../../packages/rendering/src";
import type { RenderCommandState } from "../../../../packages/rendering/src/RenderDevice";
import { resolveBlendMode, type BlendFactor } from "../../../../packages/rendering/src/contracts/blend";
import { enableFloatTargets, errorText, fullscreenDraw, glTrace, OPAQUE_STATE, placeCanvas, readFloatPixels, readGlFloatPixels, type GlTrace } from "./specKit";

export const BLEND_MODES = ["alpha", "premultiplied", "additive", "multiply"] as const;
export type SpecBlendMode = (typeof BLEND_MODES)[number];

const W = 128;
const H = 64;

const BACKGROUND_FRAGMENT = `uniform vec2 u_size;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  outColor = vec4(4.0 * uv.x, 2.0 * uv.y, 3.0 * (1.0 - uv.x), 1.0);
}`;

const FRONT_FRAGMENT = `uniform vec2 u_size;
uniform float u_premul;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec3 c = vec3(0.2 + 1.3 * uv.y, 1.2 - 0.9 * uv.x, 0.5);
  float a = 0.2 + 0.6 * uv.x;
  outColor = vec4(u_premul > 0.5 ? c * a : c, a);
}`;

const SOLID_FRAGMENT = `uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }`;

export interface BlendParityRow {
  readonly mode: SpecBlendMode;
  /** Mean |aura − three| over RGB, in 1/255 units of linear value. */
  readonly mad255: number;
  readonly max255: number;
  readonly pixels: number;
}

export interface BlendConformanceRow {
  readonly mode: SpecBlendMode;
  readonly background: number;
  readonly expected: readonly number[];
  readonly actual: readonly number[];
  readonly maxDiff255: number;
}

export interface BlendModesReport {
  readonly parity: readonly BlendParityRow[];
  readonly conformance: readonly BlendConformanceRow[];
  readonly errors: readonly string[];
}

function blendState(mode: SpecBlendMode): RenderCommandState {
  return { ...OPAQUE_STATE, blend: true, blendMode: mode };
}

function factorValue(f: BlendFactor, src: readonly number[], dst: readonly number[], channel: number): number {
  const sa = src[3]!;
  const da = dst[3]!;
  switch (f) {
    case "zero": return 0;
    case "one": return 1;
    case "src-color": return src[channel]!;
    case "one-minus-src-color": return 1 - src[channel]!;
    case "src-alpha": return sa;
    case "one-minus-src-alpha": return 1 - sa;
    case "dst-color": return dst[channel]!;
    case "one-minus-dst-color": return 1 - dst[channel]!;
    case "dst-alpha": return da;
    case "one-minus-dst-alpha": return 1 - da;
  }
}

/** CPU evaluation of the C-04 factor table (add equation for every named mode). */
export function cpuBlend(mode: SpecBlendMode, src: readonly number[], dst: readonly number[]): number[] {
  const resolved = resolveBlendMode({ ...OPAQUE_STATE, blend: true, blendMode: mode });
  if (resolved === "opaque") return [...src];
  const out: number[] = [];
  for (let c = 0; c < 3; c += 1) {
    out.push(src[c]! * factorValue(resolved.color.src, src, dst, c) + dst[c]! * factorValue(resolved.color.dst, src, dst, c));
  }
  out.push(src[3]! * factorValue(resolved.alpha.src, src, dst, 3) + dst[3]! * factorValue(resolved.alpha.dst, src, dst, 3));
  return out;
}

/** GL errors traced per step across the device-side runs (reported as tool errors). */
const traced: string[] = [];

/**
 * A WebGL2Device with float color buffers enabled before any target exists.
 * errorCheckMode "throw-free": every step is traced instead (glTrace), so a GPU
 * run names the step that raised an error rather than the next strict check.
 */
function hdrDevice(canvas: HTMLCanvasElement, label: string): { device: WebGL2Device; trace: GlTrace } {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true }) as WebGL2RenderingContext;
  if (!enableFloatTargets(gl)) traced.push(`${label}: EXT_color_buffer_float unavailable`);
  const device = WebGL2Device.create({ canvas, preserveDrawingBuffer: true });
  const trace = glTrace(gl);
  trace.drain();
  return { device, trace };
}

function auraParity(canvas: HTMLCanvasElement): Map<SpecBlendMode, Float32Array> {
  const { device, trace } = hdrDevice(canvas, "parity");
  device.beginFrame(W, H);
  const target = device.createRenderTarget({ width: W, height: H, label: "qr-blend-hdr", colorAttachments: [{ format: "rgba16f" }] });
  trace.check("parity createRenderTarget rgba16f");
  const background = fullscreenDraw(device, "qr-blend-bg", BACKGROUND_FRAGMENT);
  const front = fullscreenDraw(device, "qr-blend-front", FRONT_FRAGMENT);
  trace.check("parity programs");
  const out = new Map<SpecBlendMode, Float32Array>();
  for (const mode of BLEND_MODES) {
    device.setRenderTarget(target);
    device.clearRenderTarget([0, 0, 0, 0]);
    trace.check(`parity ${mode} clear`);
    background.draw(OPAQUE_STATE, new Map<string, UniformValue>([["u_size", [W, H]]]));
    trace.check(`parity ${mode} background draw`);
    front.draw(blendState(mode), new Map<string, UniformValue>([["u_size", [W, H]], ["u_premul", mode === "premultiplied" ? 1 : 0]]));
    trace.check(`parity ${mode} front draw`);
    out.set(mode, readFloatPixels(device, 0, 0, W, H));
    trace.check(`parity ${mode} readFloatPixels`);
  }
  device.setRenderTarget(null);
  device.endFrame();
  traced.push(...trace.entries);
  return out;
}

function threeBlending(material: THREE.RawShaderMaterial, mode: SpecBlendMode): void {
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.premultipliedAlpha = mode === "premultiplied";
  material.blending =
    mode === "additive" ? THREE.AdditiveBlending
    : mode === "multiply" ? THREE.MultiplyBlending
    : THREE.NormalBlending;
}

function threeParity(canvas: HTMLCanvasElement): Map<SpecBlendMode, Float32Array> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const vertexShader = "in vec3 position;\nvoid main() { gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const size = new THREE.Vector2(W, H);
  const out = new Map<SpecBlendMode, Float32Array>();
  for (const mode of BLEND_MODES) {
    const scene = new THREE.Scene();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader: `precision highp float;\n${BACKGROUND_FRAGMENT}`, uniforms: { u_size: { value: size } }, depthTest: false, depthWrite: false })
    );
    bg.renderOrder = 0;
    const frontMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader: `precision highp float;\n${FRONT_FRAGMENT}`,
      uniforms: { u_size: { value: size }, u_premul: { value: mode === "premultiplied" ? 1 : 0 } }
    });
    threeBlending(frontMaterial, mode);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), frontMaterial);
    front.renderOrder = 1;
    scene.add(bg, front);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    out.set(mode, readGlFloatPixels(gl, 0, 0, W, H));
    bg.geometry.dispose();
    (bg.material as THREE.Material).dispose();
    front.geometry.dispose();
    frontMaterial.dispose();
  }
  renderer.setRenderTarget(null);
  target.dispose();
  renderer.dispose();
  return out;
}

function auraConformance(canvas: HTMLCanvasElement): BlendConformanceRow[] {
  const { device, trace } = hdrDevice(canvas, "conformance");
  device.beginFrame(8, 8);
  const target = device.createRenderTarget({ width: 8, height: 8, label: "qr-blend-c04", colorAttachments: [{ format: "rgba16f" }] });
  const solid = fullscreenDraw(device, "qr-blend-solid", SOLID_FRAGMENT);
  trace.check("conformance setup");
  const rows: BlendConformanceRow[] = [];
  const frontStraight = [0.8, 0.4, 0.2, 0.5];
  for (const mode of BLEND_MODES) {
    for (const background of [0, 0.5, 2.0]) {
      const dst = [background, background, background, 1];
      const src = mode === "premultiplied" ? [0.8 * 0.5, 0.4 * 0.5, 0.2 * 0.5, 0.5] : frontStraight;
      device.setRenderTarget(target);
      device.clearRenderTarget([0, 0, 0, 0]);
      solid.draw(OPAQUE_STATE, new Map<string, UniformValue>([["u_color", dst]]));
      solid.draw(blendState(mode), new Map<string, UniformValue>([["u_color", src]]));
      trace.check(`conformance ${mode}/${background} draws`);
      const px = readFloatPixels(device, 4, 4, 1, 1);
      trace.check(`conformance ${mode}/${background} readFloatPixels`);
      const expected = cpuBlend(mode, src, dst);
      const actual = Array.from(px);
      let maxDiff = 0;
      for (let c = 0; c < 3; c += 1) maxDiff = Math.max(maxDiff, Math.abs(actual[c]! - expected[c]!));
      rows.push({ mode, background, expected, actual, maxDiff255: maxDiff * 255 });
    }
  }
  device.setRenderTarget(null);
  device.endFrame();
  traced.push(...trace.entries);
  return rows;
}

export async function runBlendModesTool(stage: HTMLElement): Promise<BlendModesReport> {
  const errors: string[] = [];
  const parity: BlendParityRow[] = [];
  let conformance: BlendConformanceRow[] = [];
  try {
    const aura = auraParity(placeCanvas(stage, 0, 0, W, H, "qr-blend-aura"));
    const three = threeParity(placeCanvas(stage, W, 0, W, H, "qr-blend-three"));
    for (const mode of BLEND_MODES) {
      const a = aura.get(mode)!;
      const b = three.get(mode)!;
      let sum = 0;
      let max = 0;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        for (let c = 0; c < 3; c += 1) {
          const d = Math.abs(a[i + c]! - b[i + c]!);
          sum += d;
          if (d > max) max = d;
          n += 1;
        }
      }
      parity.push({ mode, mad255: (sum / n) * 255, max255: max * 255, pixels: a.length / 4 });
    }
  } catch (error) {
    errors.push(`parity: ${errorText(error)}`);
  }
  try {
    conformance = auraConformance(placeCanvas(stage, 0, H + 8, 8, 8, "qr-blend-c04"));
  } catch (error) {
    errors.push(`conformance: ${errorText(error)}`);
  }
  // Any GL error raised by a traced step fails the tool (named by step).
  errors.push(...traced.map((entry) => `gl: ${entry}`));
  const report: BlendModesReport = { parity, conformance, errors };
  window.__QR_SPEC__ = report;
  return report;
}
