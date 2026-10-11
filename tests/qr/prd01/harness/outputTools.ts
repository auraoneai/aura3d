/**
 * Lane-01 row 01-S10, device half (?tools=output-pass): the real C-05
 * `OutputPass` on a WebGL2Device, fed an RGBA16F scene target filled by a
 * test shader, presenting to the canvas.
 *
 *  - dither (PRD §15 Phase 4): ramp 0.20 → 0.22 across 1,280 px, operator
 *    `none`, exposure 1 — longest run of equal 8-bit codes with dither off
 *    (≥ 150 px) and on (≤ 16 px), 64-px block means vs the ideal encode
 *    (within 0.5/255) with dither on.
 *  - single sRGB encode: linear 0.2140 (50% grey card) → code 128 ± 1.
 *  - exposure ramp monotonic (0.25 → 4) for aces/agx/neutral.
 *  - emissive 4.0 per operator vs three r185 (`MeshBasicMaterial` color 4.0
 *    with the same `toneMapping`), ±1.
 *  - overlay zero: `overlay` all-zero is bit-identical to no overlay.
 */

import * as THREE from "three";
import { OutputPass, WebGL2Device, type RenderTarget, type UniformValue } from "../../../../packages/rendering/src";
import type { OutputOverlayUniforms } from "../../../../packages/rendering/src/contracts/output";
import { enableFloatTargets, errorText, fullscreenDraw, glTrace, linearToSrgb8, OPAQUE_STATE, placeCanvas, THREE_TONE_MAPPING } from "./specKit";

const RAMP_W = 1280;
const RAMP_H = 4;

export interface DitherReport {
  readonly longestRunOff: number;
  readonly longestRunOn: number;
  readonly maxBlockMeanError255: number;
  readonly distinctCodesOff: number;
}

export interface OperatorRow {
  readonly toneMapping: string;
  readonly aura: readonly number[];
  readonly three: readonly number[];
  readonly maxDiff: number;
}

export interface OutputPassReport {
  readonly dither: DitherReport | null;
  readonly greyCard: readonly number[];
  readonly exposureRamp: readonly { readonly toneMapping: string; readonly codes: readonly number[]; readonly monotonic: boolean }[];
  readonly emissive4: readonly OperatorRow[];
  readonly overlayZeroIdentical: boolean | null;
  readonly overlayZeroDiffPixels: number;
  readonly errors: readonly string[];
}

const FILL_FRAGMENT = `uniform vec2 u_size;
uniform vec2 u_ramp;
out vec4 outColor;
void main() {
  float t = (gl_FragCoord.x - 0.5) / max(1.0, u_size.x - 1.0);
  float v = mix(u_ramp.x, u_ramp.y, t);
  outColor = vec4(v, v, v, 1.0);
}`;

interface OutputRig {
  readonly device: WebGL2Device;
  readonly gl: WebGL2RenderingContext;
  readonly target: RenderTarget;
  readonly pass: OutputPass;
  present(ramp: readonly [number, number], options: { toneMapping: string; exposure: number; dithering: boolean; overlay?: OutputOverlayUniforms }): Uint8Array;
}

/** GL errors traced per step (reported as tool errors, named by step). */
const traced: string[] = [];

function outputRig(canvas: HTMLCanvasElement): OutputRig {
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true }) as WebGL2RenderingContext;
  if (!enableFloatTargets(gl)) traced.push(`${canvas.id}: EXT_color_buffer_float unavailable`);
  // No strict throw: every step is traced instead, so the run names the step
  // that raised an error (strict reported only the next uniform upload).
  const device = WebGL2Device.create({ canvas, preserveDrawingBuffer: true });
  const trace = glTrace(gl);
  trace.drain();
  const w = canvas.width;
  const h = canvas.height;
  const target = device.createRenderTarget({ width: w, height: h, label: "qr-output-hdr", colorAttachments: [{ format: "rgba16f" }] });
  const fill = fullscreenDraw(device, "qr-output-fill", FILL_FRAGMENT);
  const pass = new OutputPass(device);
  trace.check(`${canvas.id} setup`);
  let presents = 0;
  return {
    device,
    gl,
    target,
    pass,
    present(ramp, options) {
      const step = `${canvas.id} present#${presents++} ${options.toneMapping}`;
      device.beginFrame(w, h);
      device.setRenderTarget(target);
      device.clearRenderTarget([0, 0, 0, 1]);
      trace.check(`${step} clear`);
      fill.draw(OPAQUE_STATE, new Map<string, UniformValue>([["u_size", [w, h]], ["u_ramp", [ramp[0], ramp[1]]]]));
      trace.check(`${step} fill draw`);
      pass.execute(
        target,
        null,
        {
          toneMapping: options.toneMapping as never,
          exposure: options.exposure,
          dithering: options.dithering,
          backgroundCoverage: false,
          ...(options.overlay ? { overlay: options.overlay } : {})
        },
        "canvas"
      );
      trace.check(`${step} OutputPass.execute`);
      device.setRenderTarget(null);
      const pixels = device.readPixels(0, 0, w, h);
      trace.check(`${step} readPixels`);
      device.endFrame();
      for (const entry of trace.entries.splice(0)) traced.push(entry);
      return pixels;
    }
  };
}

function longestRun(pixels: Uint8Array, width: number, row: number): number {
  let best = 1;
  let run = 1;
  for (let x = 1; x < width; x += 1) {
    const a = pixels[(row * width + x) * 4]!;
    const b = pixels[(row * width + x - 1) * 4]!;
    run = a === b ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

function idealEncoded(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
}

function ditherReport(rig: OutputRig): DitherReport {
  const ramp: [number, number] = [0.2, 0.22];
  const off = rig.present(ramp, { toneMapping: "none", exposure: 1, dithering: false });
  const on = rig.present(ramp, { toneMapping: "none", exposure: 1, dithering: true });
  let runOff = 0;
  let runOn = 0;
  for (let row = 0; row < RAMP_H; row += 1) {
    runOff = Math.max(runOff, longestRun(off, RAMP_W, row));
    runOn = Math.max(runOn, longestRun(on, RAMP_W, row));
  }
  const codes = new Set<number>();
  for (let x = 0; x < RAMP_W; x += 1) codes.add(off[x * 4]!);
  let maxBlockError = 0;
  for (let block = 0; block < RAMP_W / 64; block += 1) {
    let sum = 0;
    let ideal = 0;
    let n = 0;
    for (let x = block * 64; x < block * 64 + 64; x += 1) {
      const t = x / (RAMP_W - 1);
      const encoded = idealEncoded(ramp[0] + (ramp[1] - ramp[0]) * t);
      for (let row = 0; row < RAMP_H; row += 1) {
        sum += on[(row * RAMP_W + x) * 4]!;
        ideal += encoded;
        n += 1;
      }
    }
    maxBlockError = Math.max(maxBlockError, Math.abs(sum / n - ideal / n));
  }
  return { longestRunOff: runOff, longestRunOn: runOn, maxBlockMeanError255: maxBlockError, distinctCodesOff: codes.size };
}

function centerPixel(pixels: Uint8Array, w: number, h: number): number[] {
  const o = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
  return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!];
}

/** three r185 reference: unlit color `value` (linear) through `toneMapping`, sRGB output, read at center. */
function threeConstant(canvas: HTMLCanvasElement, value: number, toneMapping: string): number[] {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE_TONE_MAPPING[toneMapping] ?? THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(value, value, value) });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  quad.geometry.dispose();
  material.dispose();
  renderer.dispose();
  return [px[0]!, px[1]!, px[2]!];
}

const ZERO_OVERLAY: OutputOverlayUniforms = { flash: [0, 0, 0, 0], vignette: [0, 0, 0, 0], shape: [0, 0], fade: [0, 0, 0, 0] };

export async function runOutputPassTool(stage: HTMLElement): Promise<OutputPassReport> {
  const errors: string[] = [];
  let dither: DitherReport | null = null;
  let greyCard: number[] = [];
  const exposureRamp: { toneMapping: string; codes: number[]; monotonic: boolean }[] = [];
  const emissive4: OperatorRow[] = [];
  let overlayZeroIdentical: boolean | null = null;
  let overlayZeroDiffPixels = 0;

  try {
    dither = ditherReport(outputRig(placeCanvas(stage, 0, 0, RAMP_W, RAMP_H, "qr-output-ramp")));
  } catch (error) {
    errors.push(`dither: ${errorText(error)}`);
  }

  try {
    const canvas = placeCanvas(stage, 0, 16, 16, 16, "qr-output-card");
    const rig = outputRig(canvas);
    greyCard = centerPixel(rig.present([0.214, 0.214], { toneMapping: "none", exposure: 1, dithering: false }), 16, 16);
    for (const toneMapping of ["aces", "agx", "neutral"]) {
      const codes = [0.25, 0.5, 1, 2, 4].map((exposure) => centerPixel(rig.present([0.18, 0.18], { toneMapping, exposure, dithering: false }), 16, 16)[1]!);
      exposureRamp.push({ toneMapping, codes, monotonic: codes.every((c, i) => i === 0 || c > codes[i - 1]!) });
    }
    for (const toneMapping of ["none", "aces", "agx", "neutral"]) {
      const aura = centerPixel(rig.present([4, 4], { toneMapping, exposure: 1, dithering: false }), 16, 16);
      const three = threeConstant(placeCanvas(stage, 32 + emissive4.length * 20, 16, 16, 16, `qr-output-three-${toneMapping}`), 4, toneMapping);
      emissive4.push({ toneMapping, aura, three, maxDiff: Math.max(...aura.map((v, i) => Math.abs(v - three[i]!))) });
    }
    const plain = rig.present([0.1, 0.9], { toneMapping: "aces", exposure: 1, dithering: false });
    const zero = rig.present([0.1, 0.9], { toneMapping: "aces", exposure: 1, dithering: false, overlay: ZERO_OVERLAY });
    let diff = 0;
    for (let i = 0; i < plain.length; i += 4) {
      if (plain[i] !== zero[i] || plain[i + 1] !== zero[i + 1] || plain[i + 2] !== zero[i + 2]) diff += 1;
    }
    overlayZeroDiffPixels = diff;
    overlayZeroIdentical = diff === 0;
  } catch (error) {
    errors.push(`output: ${errorText(error)}`);
  }

  errors.push(...traced.map((entry) => `gl: ${entry}`));
  const report: OutputPassReport = { dither, greyCard, exposureRamp, emissive4, overlayZeroIdentical, overlayZeroDiffPixels, errors };
  window.__QR_SPEC__ = report;
  return report;
}

/** Ideal 8-bit code for a linear value under operator `none` (used by the spec). */
export const encodeNone = linearToSrgb8;
