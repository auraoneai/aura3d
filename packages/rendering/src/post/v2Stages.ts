/**
 * PRD-03 Phase 3 — the transitional v2 GPU stage driver (deferred chunk:
 * imported only through `post/v2Entry` from `PostprocessExecution`).
 *
 * `runV2HdrStages` runs the implemented §6.1 HDR stages that no longer have a
 * CPU/home on the legacy chain:
 *   S1  depth prep        (linearize → RGBA32F, half-res min/max)
 *   S2  GTAO              (half-res → bilateral denoise H/V → joint-bilateral
 *                          upsample + §6.3 multi-bounce apply onto HDR)
 *   S4  god rays          (half-res radial march → additive onto HDR)
 *   CA  chromatic aberration (the §8.12 S10 tap as a standalone pre-pass)
 *   S1-C camera velocity  (§8.6/§8.8: depth-reprojected UV deltas → velocity target)
 *   S5  TAA / TAAU        (§8.6 resolve against the C-14 history ping-pong)
 *   S6  depth of field    (§8.7 half-res prefilter → near-tile → Vogel gather → composite)
 *   S7  motion blur       (§8.8 McGuire tile-max → neighbor-max → reconstruction)
 *
 * `runV2LdrTail` runs the post-`presentLdrPostprocess` display stages:
 *   S10b display grade (LUT + vignette, luma into .a for FXAA),
 *   S11 r185 FXAA (or fused inside S12), S12 finalize (grain + RCAS + the
 *   single triangular dither). When FXAA is selected and any S10b/S12 stage
 *   is active, `FINALIZE_FXAA_FUSED_GLSL` collapses all three into one draw.
 *
 * Format note: the contract pool only has rgba8/rgba16f/rgba32f renderable
 * formats, so the spec's R32F/RG32F/R8 surfaces land as rgba32f (≥ spec
 * precision, .r/.rg channels) and rgba8 (R8-equivalent quantization).
 * True single/double-channel formats are qr-request Q-11-2 (lane 11
 * RenderDevice::resolveRenderTargetFormat).
 */

import type { WebGL2DeviceHost } from "../webgl2/DeviceHost";
import { RenderDeviceError, type RenderTarget } from "../RenderDevice";
import { reportShaderFailure } from "../ShaderFailures";
import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
  registeredPostPasses,
  validatePostPassSpace,
  type PostPassDescriptor,
  type PostPipelineOptions
} from "../contracts/post";
import type { FrameCamera, FrameContributorContext } from "../contracts/frameGraph";
import type { RenderItem } from "../ForwardPass";
import type { Texture } from "../Texture";
import type { TemporalGpuBindings } from "../TemporalHistory";
import { rendererQrFlags } from "../renderer/FrameGraph";
import { beginPostStageTrace, markTaaHistoryWritten, recordPostSkipped, recordPostStage } from "../renderer/postSkipped";
import { PostResources } from "./PostResources";
import { QUALITY_TIERS } from "../contracts/quality";
import {
  CAMERA_VELOCITY_GLSL,
  DEPTH_LINEARIZE_GLSL,
  DEPTH_MINMAX_HALF_GLSL
} from "./shaders/depthDownsample.glsl.js";
import { GTAO_GLSL } from "./shaders/gtao.glsl.js";
import { GTAO_APPLY_GLSL, GTAO_DENOISE_GLSL } from "./shaders/gtaoDenoise.glsl.js";
import { GODRAYS_GLSL } from "./shaders/godrays.glsl.js";
import { CA_PASS_GLSL } from "./shaders/composite.glsl.js";
import { DISPLAY_GRADE_GLSL } from "./shaders/displayGrade.glsl.js";
import { FINALIZE_FXAA_FUSED_GLSL, FINALIZE_GLSL } from "./shaders/finalize.glsl.js";
import { vignetteColorRgb } from "./vignetteColor.js";
import { VELOCITY_DILATE_GLSL } from "./shaders/velocityDilate.glsl.js";
import { TAA_RESOLVE_GLSL, TAA_UPSCALE_GLSL } from "./shaders/taa.glsl.js";
import { DOF_COMPOSITE_GLSL, DOF_GATHER_GLSL, DOF_NEAR_TILE_GLSL, DOF_PREFILTER_GLSL } from "./shaders/dof.glsl.js";
import { MB_NEIGHBOR_GLSL, MB_RECONSTRUCT_GLSL, MB_TILE_MAX_GLSL } from "./shaders/motionBlur.glsl.js";
import { EXPOSURE_ADAPT_GLSL, EXPOSURE_LUMA_LOG_GLSL, EXPOSURE_MUL_GLSL, EXPOSURE_REDUCE_GLSL } from "./shaders/exposure.glsl.js";
import { HDR_GRADE_GLSL, resolveHdrGradeUniforms, type HdrGradeInput, type HdrGradeUniforms } from "./shaders/hdrGrade.glsl.js";
import { SMAA_BLEND_GLSL, SMAA_EDGES_GLSL, SMAA_WEIGHTS_GLSL } from "./shaders/smaa.glsl.js";
import { FXAA_185_FRAGMENT_GLSL } from "./shaders/fxaa.glsl.js";
import { POST_INSERT_ANCHORS, type AutoExposureOptionsV2, type DofOptions, type GtaoOptions, type GodRayOptions, type LutTexture3D, type MotionBlurOptions, type TaaOptions } from "./PostGraph";
import { DisplayLutCache } from "./DisplayLutCache";
import { parseCubeLut } from "./CubeLut";

export { vignetteColorRgb };

/** Identity for the folded camera-velocity reprojection (S1-C). */
const IDENTITY_MAT4_F32 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

interface GlTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly colorHandle: WebGLTexture;
  readonly depthTextureHandle: WebGLTexture | null;
  readonly width: number;
  readonly height: number;
}

function asGlTarget(target: RenderTarget): GlTarget {
  const t = target as unknown as GlTarget;
  if (!t.framebuffer || !t.colorHandle) {
    throw new RenderDeviceError("v2 post stages require WebGL2 render targets.", "POST_GRAPH_V2_UNSUPPORTED");
  }
  return t;
}

interface PostV2State {
  readonly programs: Map<string, WebGLProgram>;
  readonly vao: WebGLVertexArrayObject;
  readonly pool: PostResources;
  readonly identityLut: WebGLTexture;
  /** 1×1 black RGBA8 — bound for `u_reactive` while Q-01-2 (the C-14
   * reactive attachment) is pending. */
  readonly blankTex: WebGLTexture;
  frameIndex: number;
  /** Seconds accumulator for the custom-pass `u_time` uniform. */
  timeSeconds: number;
  /** §8.9: 1×1 EV ping-pong (evA/evB alternate read/write per frame). */
  evTargets: [RenderTarget | undefined, RenderTarget | undefined];
  evIndex: 0 | 1;
  evValid: boolean;
  /** §8.14 lazy textures: kicked on first smaa frame, uploaded on arrival. */
  smaa: { area: WebGLTexture | null; search: WebGLTexture | null; requested: boolean };
  /** C-13 cross-pass publish/read surface for custom passes (per host). */
  readonly postBlackboard: Map<string, unknown>;
  /** GU47 E-C (EC-2): uploaded user `.cube` LUTs, one TEXTURE_3D per source (LRU 4). */
  lutCache?: DisplayLutCache<WebGLTexture>;
  /** The LUT bag the in-flight `lutCache.acquire` bakes (set only around that call). */
  lutBaking?: PostLutBag;
  /** Sources whose `.cube` failed to parse; never retried per frame. */
  readonly lutFailed: Set<string>;
}

/**
 * GU47 E-C (EC-2): the `pipeline.lut` bag. The engine bridge emits it once the
 * `.cube` text has loaded (`source` = the served URL); hosts may pass parsed
 * `data` instead of `cube`. `intensity` (0..1, default 1) blends the LUT over
 * the ungraded colour in the shader, so animating it never re-uploads.
 */
export interface PostLutBag {
  readonly source: string;
  readonly cube?: string;
  readonly data?: LutTexture3D;
  readonly intensity?: number;
  /** Set by the bridge while the `.cube` is loading or after it failed (no `cube` then). */
  readonly status?: "pending" | "failed";
}

/** A resolved S10b LUT: the TEXTURE_3D and the `u_lutBypass` (1 − intensity) value. */
export interface PostLutBinding {
  readonly texture: WebGLTexture;
  readonly bypass: number;
}

/**
 * Uploads a user `.cube` (lattice domain, sampled with `u_lutLattice = 1`) as
 * an RGBA8 TEXTURE_3D, red-fastest like the file. WebGL2 rejects 3-D uploads
 * from an ArrayBufferView while the FLIP_Y / PREMULTIPLY unpack flags are set,
 * so both are cleared first.
 */
export function uploadCubeLutTexture(gl: WebGL2RenderingContext, lut: LutTexture3D): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new RenderDeviceError("LUT texture allocation failed.", "POST_GRAPH_V2_UNSUPPORTED");
  const n = lut.size;
  const bytes = new Uint8Array(n * n * n * 4);
  for (let i = 0; i < bytes.length; i += 1) {
    const v = lut.data[i] ?? 1;
    bytes[i] = Math.round(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) * 255);
  }
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);
  return texture;
}

/**
 * GU47 E-C (EC-2): resolves `pipeline.lut` to a bound TEXTURE_3D through the
 * per-host `DisplayLutCache` (one parse + upload per source; the key holds the
 * source with contrast/saturation/vibrance/intensity at identity because those
 * run in the fused present and the shader). A bag without text/data records
 * `LUT_PENDING`; a `.cube` the parser rejects records `LUT_INVALID` once and
 * renders the identity grade.
 */
function displayLutBinding(host: WebGL2DeviceHost, state: PostV2State, lut: unknown): PostLutBinding | null {
  if (!lut || typeof lut !== "object") return null;
  const bag = lut as PostLutBag;
  if (typeof bag.source !== "string" || (typeof bag.cube !== "string" && !bag.data)) {
    recordPostSkipped(`${bag.status === "failed" ? "LUT_UNAVAILABLE" : "LUT_PENDING"}:${String(bag.source)}`);
    return null;
  }
  if (state.lutFailed.has(bag.source)) return null;
  const gl = host.gl;
  state.lutCache ??= new DisplayLutCache<WebGLTexture>(
    () => {
      const baking = state.lutBaking!;
      return uploadCubeLutTexture(gl, baking.data ?? parseCubeLut(baking.cube!));
    },
    (texture) => gl.deleteTexture(texture),
    { maxEntries: 4 }
  );
  state.lutBaking = bag;
  try {
    const texture = state.lutCache.acquire({ contrast: 1, saturation: 1, vibrance: 0, lutIntensity: 1, userLut: bag.source });
    const intensity = typeof bag.intensity === "number" && Number.isFinite(bag.intensity) ? Math.min(1, Math.max(0, bag.intensity)) : 1;
    return { texture, bypass: 1 - intensity };
  } catch (error) {
    state.lutFailed.add(bag.source);
    const code = error instanceof Error ? /^[A-Z0-9_]+/.exec(error.message)?.[0] ?? "LUT_UPLOAD_FAILED" : "LUT_UPLOAD_FAILED";
    recordPostSkipped(`LUT_INVALID:${bag.source}:${code}`);
    return null;
  } finally {
    state.lutBaking = undefined;
  }
}

const states = new WeakMap<WebGL2DeviceHost, PostV2State>();

function v2State(host: WebGL2DeviceHost): PostV2State {
  const gl = host.gl;
  let state = states.get(host);
  if (!state) {
    const vao = gl.createVertexArray();
    const identityLut = gl.createTexture();
    if (!vao || !identityLut) {
      throw new RenderDeviceError("v2 post stage GL object allocation failed.", "POST_GRAPH_V2_UNSUPPORTED");
    }
    gl.bindTexture(gl.TEXTURE_3D, identityLut);
    const size = 4;
    const identity = new Uint8Array(size * size * size * 4);
    for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
      const i = ((b * size + g) * size + r) * 4;
      identity[i] = Math.round((r / (size - 1)) * 255);
      identity[i + 1] = Math.round((g / (size - 1)) * 255);
      identity[i + 2] = Math.round((b / (size - 1)) * 255);
      identity[i + 3] = 255;
    }
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, identity);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_3D, null);
    const blankTex = gl.createTexture();
    if (blankTex) {
      gl.bindTexture(gl.TEXTURE_2D, blankTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    state = {
      programs: new Map(),
      vao,
      pool: new PostResources(host.device, rendererQrFlags()),
      identityLut,
      blankTex: blankTex ?? identityLut,
      frameIndex: 0,
      postBlackboard: new Map(),
      timeSeconds: 0,
      evTargets: [undefined, undefined],
      evIndex: 0,
      evValid: false,
      smaa: { area: null, search: null, requested: false },
      lutFailed: new Set()
    };
    states.set(host, state);
  }
  return state;
}

/**
 * God-ray tint as an RGB triple. The engine bridge compiles
 * `effects.volumetricFog({ color })` to a `{ r, g, b }` object, while direct
 * callers pass `[r, g, b]`. Indexing the object as an array gave
 * `uniform3f(undefined, …)`; the resulting NaN tint went through the additive
 * blend and turned the whole HDR frame black (shaft-on mean luma 0 on the GPU
 * lane, runs 38140351314 and 38141069039). Non-finite channels fall back to
 * the default warm tint.
 */
export function godRayColor(color: unknown): [number, number, number] {
  const fallback: [number, number, number] = [1, 0.96, 0.9];
  let rgb: unknown[] | undefined;
  if (Array.isArray(color)) rgb = color;
  else if (color && typeof color === "object") {
    const o = color as { r?: unknown; g?: unknown; b?: unknown };
    rgb = [o.r, o.g, o.b];
  }
  if (!rgb) return fallback;
  return [0, 1, 2].map((i) => (typeof rgb![i] === "number" && Number.isFinite(rgb![i]) ? (rgb![i] as number) : fallback[i]!)) as [number, number, number];
}

/** GU47 E-C (EC-8): S4 `u_density` — the authored god-ray density clamped to [0.05, 1]; omitted or invalid = 1 (full march). */
export function godRayDensity(density: unknown): number {
  return typeof density === "number" && Number.isFinite(density) ? Math.min(1, Math.max(0.05, density)) : 1;
}

/**
 * GU47 E-C (EC-8): S6 `u_tiltShift` = [bandCenter, bandWidth, angle (rad), 1]
 * for a valid band (centre and width clamped to [0, 1]), else all zeros
 * (the thin-lens CoC).
 */
export function dofTiltShiftUniform(tilt: DofOptions["tiltShift"] | undefined): [number, number, number, number] {
  if (!tilt || !Number.isFinite(tilt.bandCenter) || !Number.isFinite(tilt.bandWidth)) return [0, 0, 0, 0];
  const angle = typeof tilt.angleDeg === "number" && Number.isFinite(tilt.angleDeg) ? tilt.angleDeg : 0;
  return [Math.min(1, Math.max(0, tilt.bandCenter)), Math.min(1, Math.max(0, tilt.bandWidth)), angle * Math.PI / 180, 1];
}

/**
 * Inserts `#define` lines after the `#version` directive. GLSL ES 3.00
 * requires `#version 300 es` to be the first line, so prepending defines (as
 * the DoF ring count and motion-blur tile size did) made the shader a
 * GLSL ES 1.00 source and the compile failed ("#version must occur first"),
 * which aborted the whole v2 frame (black output on the GPU lane,
 * post-quality 38138763970).
 */
export function withDefines(source: string, defines: Readonly<Record<string, string | number>>): string {
  const lines = Object.entries(defines).map(([name, value]) => `#define ${name} ${value}`).join("\n");
  const match = /^\s*#version[^\n]*\n/.exec(source);
  return match ? `${match[0]}${lines}\n${source.slice(match[0].length)}` : `${lines}\n${source}`;
}

function program(state: PostV2State, gl: WebGL2RenderingContext, key: string, fragment: string): WebGLProgram {
  const cached = state.programs.get(key);
  if (cached) return cached;
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      // Loud: the caller falls back to the legacy chain, which silently drops a user `effects.shaderPass`.
      reportShaderFailure(
        { code: "SHADER_COMPILE_FAILED", details: { log: log ?? "", stage: type === gl.VERTEX_SHADER ? "vertex" : "fragment" } },
        { name: `post:${key}`, shaderKey: `post:${key}` },
        { vertex: VERTEX, fragment },
        "skip",
        "The post stage falls back to the legacy chain; the failing pass is not applied."
      );
      throw new RenderDeviceError(`v2 post shader compile failed: ${log}`, "POST_GRAPH_V2_UNSUPPORTED", { key });
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    reportShaderFailure(
      { code: "SHADER_LINK_FAILED", details: { log: log ?? "" } },
      { name: `post:${key}`, shaderKey: `post:${key}` },
      { vertex: VERTEX, fragment },
      "skip",
      "The post stage falls back to the legacy chain; the failing pass is not applied."
    );
    throw new RenderDeviceError(`v2 post program link failed: ${log}`, "POST_GRAPH_V2_UNSUPPORTED", { key });
  }
  state.programs.set(key, prog);
  return prog;
}

/**
 * Raster state for a fullscreen v2 stage. The legacy present resets the same
 * set (LegacyPost `prepareFullscreenPresentation`); the v2 draws reset only
 * depth and blend, so a colour mask, scissor, stencil or cull state left by
 * the scene draws could leave a stage's output empty — every frame with an
 * active HDR stage read black on the GPU lane (post-quality 38127246424). The
 * stage drivers invalidate host.stateCache afterwards (T0-16).
 */
function resetFullscreenState(gl: WebGL2RenderingContext): void {
  gl.colorMask(true, true, true, true);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(false);
}

function draw(host: WebGL2DeviceHost, state: PostV2State, prog: WebGLProgram, target: GlTarget, textures: readonly WebGLTexture[], uniforms: (gl: WebGL2RenderingContext) => void): void {
  const gl = host.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.useProgram(prog);
  gl.bindVertexArray(state.vao);
  resetFullscreenState(gl);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  for (let i = 0; i < textures.length; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, textures[i]!);
    gl.bindSampler(i, null);
  }
  uniforms(gl);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  for (let i = 0; i < textures.length; i++) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.bindVertexArray(null);
}

/** §6.3 multi-bounce ρ and AO metadata shared by the apply draw. */
const AO_RHO = 0.5;

/**
 * GU47 E-C: one fullscreen draw for S8's `exp2(ev)` multiply and/or the S10
 * linear grade. AE-only frames keep the original `EXPOSURE_MUL_GLSL` program
 * (byte-identical); a non-identity grade runs `HDR_GRADE_GLSL`, with the EV
 * multiply folded in when S8 is active (`ev` non-null).
 */
function runHdrGradeDraw(
  host: WebGL2DeviceHost,
  state: PostV2State,
  target: RenderTarget,
  input: RenderTarget,
  ev: RenderTarget | null,
  grade: HdrGradeUniforms | null
): void {
  const gl = host.gl;
  if (!grade) {
    if (!ev) return;
    const mulProg = program(state, gl, "exposure-mul", EXPOSURE_MUL_GLSL);
    draw(host, state, mulProg, asGlTarget(target), [asGlTarget(input).colorHandle, asGlTarget(ev).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(mulProg, "u_hdr"), 0);
      g.uniform1i(g.getUniformLocation(mulProg, "u_ev"), 1);
    });
    return;
  }
  const prog = program(state, gl, "hdr-grade", HDR_GRADE_GLSL);
  draw(host, state, prog, asGlTarget(target), [asGlTarget(input).colorHandle, ev ? asGlTarget(ev).colorHandle : state.blankTex], (g) => {
    g.uniform1i(g.getUniformLocation(prog, "u_hdr"), 0);
    g.uniform1i(g.getUniformLocation(prog, "u_ev"), 1);
    g.uniform1i(g.getUniformLocation(prog, "u_hasEv"), ev ? 1 : 0);
    g.uniform1i(g.getUniformLocation(prog, "u_hasGrade"), 1);
    writeHdrGradeUniforms(g, prog, grade);
  });
}

/** The S10 grade uniform writer (`u_whiteBalance` … `u_highlights`). Exported for the mock-GL unit gate. */
export function writeHdrGradeUniforms(g: WebGL2RenderingContext, prog: WebGLProgram, grade: HdrGradeUniforms): void {
  const v3 = (name: string, value: readonly [number, number, number]): void => {
    g.uniform3f(g.getUniformLocation(prog, name), value[0], value[1], value[2]);
  };
  v3("u_whiteBalance", grade.whiteBalance);
  v3("u_lift", grade.lift);
  v3("u_gamma", grade.gamma);
  v3("u_gain", grade.gain);
  v3("u_shadows", grade.shadows);
  v3("u_midtones", grade.midtones);
  v3("u_highlights", grade.highlights);
}

/** Stage-trace suffix for S9: the authored mip count when the bag carries one. */
function bloomMipsTag(bloom: unknown): string {
  const mips = bloom && typeof bloom === "object" ? (bloom as { mips?: unknown }).mips : undefined;
  return typeof mips === "number" && Number.isFinite(mips) ? `-${mips}mips` : "";
}

/* ------------------------------------------------------------------------ */
/* Phase 6 — C-13 custom passes, S8 auto-exposure, S11 SMAA                   */
/* ------------------------------------------------------------------------ */

/**
 * §6.12: a custom pass's `fragment.glsl` is appended after the engine
 * prelude (version, precision, the `v_uv` input, `outColor`, and the
 * built-in uniforms `u_color`, `u_depthLinear`, `u_velocity`, `u_texelSize`,
 * `u_time`). The pass declares only its own uniforms + a `main()`; it must
 * NOT redeclare the built-ins, `#version`, or `precision`.
 */
export function customPassFragmentSource(glsl: string): string {
  return `#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_depthLinear;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
uniform float u_time;
in vec2 v_uv;
out vec4 outColor;
` + glsl;
}

/**
 * Passes visible to the graph: the pipeline bag's `customPasses` first, then
 * the C-13 registry (`app.addPostPass` registers there), deduped by id (an
 * engine may stamp the same descriptor into both). Order = insertion order at
 * each anchor.
 *
 * The registry already rejects a misplaced space at `registerPostPass`. A
 * bag-supplied pass bypasses that, so it is validated here: a `display` pass
 * at an HDR anchor (or `linear-hdr` after tonemap) is dropped and recorded as
 * `POSTPROCESS_SPACE_INVALID:<id>` (T0-17: no per-frame throw; plan-time
 * `planPostGraph`/`PostGraph.execute` still throw).
 */
export function mergedCustomPasses(pipeline: PostPipelineOptions): readonly PostPassDescriptor[] {
  const seen = new Set<string>();
  const out: PostPassDescriptor[] = [];
  for (const pass of [...(pipeline.customPasses ?? []), ...registeredPostPasses()]) {
    if (seen.has(pass.id)) continue;
    seen.add(pass.id);
    try {
      validatePostPassSpace(pass);
    } catch {
      recordPostSkipped(`POSTPROCESS_SPACE_INVALID:${pass.id}`);
      continue;
    }
    out.push(pass);
  }
  return out;
}

/**
 * SH-03: `order` is an ascending sort key inside an insertion anchor; absent
 * keys keep registration order (Array.prototype.sort is stable). Shared by
 * the HDR driver and the LDR tail so the `after-tonemap` anchor orders the
 * same way.
 */
const postPassOrderKey = (pass: PostPassDescriptor): number =>
  typeof pass.order === "number" && Number.isFinite(pass.order) ? pass.order : Number.MAX_SAFE_INTEGER;

export function sortCustomPassesAtAnchor(passes: readonly PostPassDescriptor[], anchor: PostPassDescriptor["insertAt"]): readonly PostPassDescriptor[] {
  return passes.filter((pass) => pass.insertAt === anchor).sort((a, b) => postPassOrderKey(a) - postPassOrderKey(b));
}

/** Minimal frame context for descriptor `enabled`/`uniforms` callbacks. */
function customPassFrameContext(
  state: PostV2State,
  host: WebGL2DeviceHost,
  width: number,
  height: number,
  camera: FrameCamera | null | undefined,
  bag: PostFrameContextBag | undefined
): FrameContributorContext {
  return {
    device: host.device,
    width,
    height,
    frameIndex: state.frameIndex,
    timeSeconds: state.timeSeconds,
    camera: camera ?? null,
    source: bag?.source ?? {},
    items: bag?.items ?? [],
    tier: QUALITY_TIERS.high,
    flags: rendererQrFlags(),
    sceneDepth: bag?.sceneDepth ?? {
      texture: null,
      available: false,
      linearize: { near: camera?.near ?? 0.1, far: camera?.far ?? 1000, orthographic: camera?.projection === "orthographic" }
    },
    blackboard: state.postBlackboard
  } as unknown as FrameContributorContext;
}

/**
 * Runs one C-13 pass over `input` into a pooled target of the pass's space
 * format. `linZ`/`velocity` bind for `inputs` that declare them (the 1×1
 * blank stands in when a surface wasn't produced this frame).
 */
function runCustomPass(
  host: WebGL2DeviceHost,
  state: PostV2State,
  pass: PostPassDescriptor,
  input: RenderTarget,
  aux: { readonly linZ?: RenderTarget | null; readonly velocity?: RenderTarget | null },
  camera: FrameCamera | null | undefined,
  bag?: PostFrameContextBag
): RenderTarget {
  return runCustomPassOnTexture(host, state, pass, asGlTarget(input), aux, camera, bag) ?? input;
}

/** A sampled colour texture a custom pass can read (a pooled target or a device-owned texture). */
export interface PostColorInput {
  readonly colorHandle: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

/** Returns `null` when the pass's `enabled()` declines this frame (input passes through untouched). */
function runCustomPassOnTexture(
  host: WebGL2DeviceHost,
  state: PostV2State,
  pass: PostPassDescriptor,
  input: PostColorInput,
  aux: { readonly linZ?: RenderTarget | null; readonly velocity?: RenderTarget | null },
  camera: FrameCamera | null | undefined,
  bag?: PostFrameContextBag
): RenderTarget | null {
  const gl = host.gl;
  const frame = customPassFrameContext(state, host, input.width, input.height, camera, bag);
  if (pass.enabled && !pass.enabled(frame)) return null;
  recordPostStage(`custom:${pass.id}@${pass.insertAt}`);
  const wantsDepth = pass.inputs.includes("depth");
  const wantsVelocity = pass.inputs.includes("velocity");
  const target = state.pool.acquire({
    width: input.width,
    height: input.height,
    format: pass.space === "display" ? "rgba8" : "rgba16f",
    samples: 1,
    depth: false
  });
  const prog = program(state, gl, `custom:${pass.id}`, customPassFragmentSource(pass.fragment.glsl));
  const textures: WebGLTexture[] = [
    input.colorHandle,
    wantsDepth && aux.linZ ? asGlTarget(aux.linZ).colorHandle : state.blankTex,
    wantsVelocity && aux.velocity ? asGlTarget(aux.velocity).colorHandle : state.blankTex
  ];
  draw(host, state, prog, asGlTarget(target), textures, (g) => {
    g.uniform1i(g.getUniformLocation(prog, "u_color"), 0);
    g.uniform1i(g.getUniformLocation(prog, "u_depthLinear"), 1);
    g.uniform1i(g.getUniformLocation(prog, "u_velocity"), 2);
    g.uniform2f(g.getUniformLocation(prog, "u_texelSize"), 1 / input.width, 1 / input.height);
    g.uniform1f(g.getUniformLocation(prog, "u_time"), state.timeSeconds);
    const declared = pass.uniforms?.(frame);
    if (declared) {
      for (const [name, value] of Object.entries(declared)) {
        const loc = g.getUniformLocation(prog, name);
        if (!loc) continue;
        const arr = Array.isArray(value) ? value as readonly number[] : null;
        if (arr) {
          if (arr.length === 2) g.uniform2f(loc, arr[0]!, arr[1]!);
          else if (arr.length === 3) g.uniform3f(loc, arr[0]!, arr[1]!, arr[2]!);
          else if (arr.length >= 4) g.uniform4f(loc, arr[0]!, arr[1]!, arr[2]!, arr[3]!);
          else g.uniform1f(loc, arr[0] ?? 0);
        } else {
          g.uniform1f(loc, value as number);
        }
      }
    }
  });
  return target;
}

/**
 * CCR-03-12 (Phase 6): the `source`/`items`/`sceneDepth` slice of the
 * `FrameContributorContext` a C-13 custom pass's `enabled()`/`uniforms()`
 * callback may read — stamped on `RendererPostProcessOptions.postFrameContext`
 * and forwarded here untouched.
 */
export interface PostFrameContextBag {
  readonly source: unknown;
  readonly items: readonly RenderItem[];
  readonly sceneDepth: {
    readonly texture: Texture | null;
    readonly available: boolean;
    readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean };
  };
}

/**
 * Kicks the lazy `post/smaa/` chunk + PNG decode once. Until the upload
 * lands, `state.smaa.area/search` stay null and the S11 block skips — the
 * same first-frames window three's async `Image` load has. Returns true once
 * both GL textures exist.
 */
let smaaTexturesLoad: Promise<void> | null = null;

/**
 * 03-S18a: settles once the in-flight SMAA area/search texture load (if any)
 * finished, so a probe can wait for S11 to be active instead of guessing a
 * frame count. Resolves immediately when no load was started.
 */
export function smaaTexturesSettled(): Promise<void> {
  return smaaTexturesLoad ?? Promise.resolve();
}

function smaaTexturesReady(host: WebGL2DeviceHost, state: PostV2State): boolean {
  const gl = host.gl;
  if (state.smaa.area && state.smaa.search) return true;
  if (!state.smaa.requested) {
    state.smaa.requested = true;
    smaaTexturesLoad = import("./smaa/textures.js").then(async (mod) => {
      try {
        const decode = async (dataUrl: string): Promise<ImageBitmap> => {
          const blob = await (await fetch(dataUrl)).blob();
          return createImageBitmap(blob, { imageOrientation: "none" });
        };
        const [area, search] = await Promise.all([decode(mod.SMAA_AREATEX_PNG), decode(mod.SMAA_SEARCHTEX_PNG)]);
        const upload = (bitmap: ImageBitmap, filter: number): WebGLTexture | null => {
          const tex = gl.createTexture();
          if (!tex) return null;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          // three uploads these with flipY/premultiply off; the engine may
          // have left either unpack flag set by an earlier upload.
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindTexture(gl.TEXTURE_2D, null);
          return tex;
        };
        // three: AreaTex linear, SearchTex nearest, no mipmaps, no flipY.
        state.smaa.area = upload(area, gl.LINEAR);
        state.smaa.search = upload(search, gl.NEAREST);
        // T0-16: the raw binds above bypass host.stateCache.
        host.stateCache.invalidate();
      } catch {
        // Decode/upload failed — leave requested so we don't retry-loop;
        // S11 stays skipped (post.skipped shows SMAA only via the plan).
        state.smaa.requested = true;
      }
    }).catch(() => {
      // The lazy chunk itself failed to load: S11 stays skipped.
    });
  }
  return false;
}

export interface RunV2HdrStagesOptions {
  /**
   * R-03b: the WebGL2 fused present composites bloom inside
   * `presentLdrPostprocess`, i.e. AFTER this driver returns. `before-tonemap`
   * custom passes belong after the §6.1 S9/S10 bloom composite, so when the
   * caller can run them from inside the present it sets this flag and
   * receives them back as `afterBloom` instead of having them run here.
   */
  readonly deferBeforeTonemap?: boolean;
}

/**
 * The deferred `before-tonemap` custom passes. `run` executes them in anchor
 * order over the bloom composite and returns the texture the output stage
 * must read; `release` frees everything the stage still holds (the pooled
 * pass output plus the depth/velocity surfaces the passes sampled). The
 * caller must call `release` exactly once, after the present.
 */
export interface DeferredAfterBloomStage {
  readonly run: (input: PostColorInput) => PostColorInput;
  readonly release: () => void;
}

/**
 * Runs S1 → S2 → S4 → CA on the HDR frame. Returns the (possibly pooled)
 * HDR target the fused present should consume. When no HDR stage is enabled
 * the source passes through untouched.
 */
export function runV2HdrStages(
  host: WebGL2DeviceHost,
  source: RenderTarget,
  pipeline: PostPipelineOptions,
  camera: FrameCamera | null | undefined,
  /** PRD-03 Phase 4: the flag-on TemporalHistory bindings (C-14 camera
   * matrices + velocity/history/linZ surfaces). Absent when temporal
   * wasn't requested or the route's geometry is unsupported. */
  temporal?: TemporalGpuBindings,
  /** CCR-03-12 (Phase 6): C-13 custom-pass frame context (source/items/sceneDepth). */
  frameContext?: PostFrameContextBag,
  options?: RunV2HdrStagesOptions
): { readonly target: RenderTarget; readonly aoPending: boolean; readonly skipped: readonly string[]; readonly afterBloom?: DeferredAfterBloomStage } {
  const wantsAo = Boolean(pipeline.ao);
  const wantsGodRays = Boolean(pipeline.godRays);
  const wantsCa = Boolean(pipeline.chromaticAberration && (pipeline.chromaticAberration as { intensity?: number }).intensity);
  const wantsTaa = pipeline.antiAliasing === "taa" || Boolean(pipeline.taa);
  const wantsDof = Boolean(pipeline.dof);
  const wantsMb = Boolean(pipeline.motionBlur);
  // Phase 6: S8 auto-exposure + C-13 HDR-domain custom passes at their §6.1
  // insertion anchors (`after-tonemap` runs in the LDR tail instead).
  const autoExposure = pipeline.autoExposure as AutoExposureOptionsV2 | false | undefined;
  const wantsAutoExposure = autoExposure !== undefined && autoExposure !== false;
  // GU47 E-C: the linear grade (white balance, lift/gamma/gain, shadows/
  // midtones/highlights). Identity → null → no draw (byte-identical frames).
  const gradeUniforms = resolveHdrGradeUniforms(pipeline.grade as HdrGradeInput | undefined);
  const wantsGrade = gradeUniforms !== null;
  const customs = mergedCustomPasses(pipeline);
  const customsAt = (anchor: PostPassDescriptor["insertAt"]): readonly PostPassDescriptor[] =>
    sortCustomPassesAtAnchor(customs, anchor);
  const hdrCustoms = customs.filter((pass) => pass.insertAt !== "after-tonemap");
  // TAA and motion blur silently degrade without temporal surfaces; the
  // engine-side AA resolve already reported the coverage fallback.
  const skipped: string[] = [];
  const temporalOk = Boolean(temporal?.v2);
  const taaActive = wantsTaa && temporalOk;
  const mbActive = wantsMb && temporalOk;
  beginPostStageTrace();
  recordPostStage(`enter:taa=${String(wantsTaa)}:mb=${String(wantsMb)}:temporal=${String(temporalOk)}`);
  // GU47 E-C stage trace: S9 bloom executes inside the fused present right
  // after this driver returns. The executor sets `deferBeforeTonemap` exactly
  // when its pass list carries an HDR bloom pass (LegacyPost
  // `executePostGraphWebGL2`), so that flag — not the authored bag — records it.
  if (options?.deferBeforeTonemap) recordPostStage(`S9:bloom${bloomMipsTag(pipeline.bloom)}`);
  if (wantsTaa && !temporalOk) { skipped.push("TAA_VELOCITY_COVERAGE"); recordPostSkipped("TAA_VELOCITY_COVERAGE:v2-hdr-stages"); }
  if (wantsMb && !temporalOk) { skipped.push("S7_VELOCITY_UNAVAILABLE"); recordPostSkipped("S7_VELOCITY_UNAVAILABLE:v2-hdr-stages"); }
  const needsLinZ = wantsAo || wantsGodRays || wantsDof || taaActive || mbActive
    || hdrCustoms.some((pass) => pass.inputs.includes("depth"));
  const needsVelocity = ((taaActive || mbActive) && temporalOk)
    || (hdrCustoms.some((pass) => pass.inputs.includes("velocity")) && temporalOk);
  if (!wantsAo && !wantsGodRays && !wantsCa && !taaActive && !wantsDof && !mbActive && !wantsAutoExposure && !wantsGrade && hdrCustoms.length === 0) return { target: source, aoPending: false, skipped };

  // T0-15: the forward HDR target is multisampled by default (`sampleCount` 4
  // in `Renderer`), so its `colorHandle`/`depthTextureHandle` only contain
  // resolved content once the driver has blitted the MSAA surface. The
  // legacy presents resolve their source themselves; the v2 stage driver
  // never did and sampled the untouched resolve textures (black HDR). This
  // is a no-op when the source is single-sampled or already resolved.
  host.resolveMultisampleTarget(source as Parameters<WebGL2DeviceHost["resolveMultisampleTarget"]>[0]);
  const src = asGlTarget(source);
  if ((needsLinZ || needsVelocity) && !src.depthTextureHandle) {
    // T0-17/FLAG-ON-4: no per-frame throw — a depth-less HDR source degrades
    // the depth-gated stages to a recorded skip and the frame continues
    // (the present still runs on the untouched source).
    recordPostSkipped("WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED:v2-hdr-stages");
    return { target: source, aoPending: false, skipped: [...skipped, "V2_DEPTH_UNAVAILABLE"] };
  }
  if ((wantsAo || wantsGodRays || needsVelocity) && !camera) {
    recordPostSkipped("POST_GRAPH_V2_CAMERA_REQUIRED:v2-hdr-stages");
    return { target: source, aoPending: false, skipped: [...skipped, "V2_CAMERA_UNAVAILABLE"] };
  }

  const gl = host.gl;
  const state = v2State(host);
  const w = source.width, h = source.height;
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  const near = camera?.near ?? pipeline.depthRange?.near ?? 0.1;
  const far = camera?.far ?? pipeline.depthRange?.far ?? 1000;
  const ortho = camera?.projection === "orthographic" || pipeline.depthRange?.projection === "orthographic";

  // ── S1-A: linearized depth (RGBA32F .r = viewZ) ──────────────────────────
  let linZFull: RenderTarget | null = null;
  let minmaxHalf: RenderTarget | null = null;
  let linZOwnedByPool = false;
  if (needsLinZ) {
    recordPostStage("S1:depth-prep");
    // Temporal frames write this frame's linear Z into the history ping-pong's
    // `linZOutput` slot so commit() promotes it for next frame's disocclusion.
    linZFull = temporal?.v2?.linZOutput
      ?? state.pool.acquire({ width: w, height: h, format: "rgba32f", samples: 1, depth: false });
    linZOwnedByPool = !temporal?.v2;
    const linProg = program(state, gl, "depth-linearize", DEPTH_LINEARIZE_GLSL);
    draw(host, state, linProg, asGlTarget(linZFull), [src.depthTextureHandle!], (g) => {
      g.uniform1i(g.getUniformLocation(linProg, "u_depth"), 0);
      g.uniform1f(g.getUniformLocation(linProg, "u_near"), near);
      g.uniform1f(g.getUniformLocation(linProg, "u_far"), far);
      g.uniform1i(g.getUniformLocation(linProg, "u_ortho"), ortho ? 1 : 0);
    });
    minmaxHalf = state.pool.acquire({ width: hw, height: hh, format: "rgba32f", samples: 1, depth: false });
    const mmProg = program(state, gl, "depth-minmax", DEPTH_MINMAX_HALF_GLSL);
    draw(host, state, mmProg, asGlTarget(minmaxHalf), [asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(mmProg, "u_linearDepth"), 0);
    });
  }

  // ── S1-C: camera velocity (RG16F in .rg of rgba16f) — depth reprojection
  // through prevVP·invUnjitteredVP. Per-object velocity lands with Q-01-2;
  // this is the camera-only fallback the PRD ships first.
  let dilatedVelocity: RenderTarget | null = null;
  if (needsVelocity && temporal?.v2) {
    const camVelProg = program(state, gl, "camera-velocity", CAMERA_VELOCITY_GLSL);
    // The reprojection prevVP · inv(unjitteredVP) is folded in float64 here
    // and handed to the shader as `u_prevViewProjection` with an identity
    // `u_invUnjitteredViewProjection` (projectively the same transform). Two
    // float32 matrix products on the GPU left a static camera with a
    // ~0.03 px residual velocity; TAA re-sampled history by it every frame,
    // so with 0.97 feedback a 1-px line drifted ~1 px and smeared over five
    // rows (prd03-taa, promote run 38201709795). Folded, a static camera is
    // the identity to ~1e-12 and reprojects in place.
    const invUnjittered = invertMat4(Array.from(temporal.v2.unjittered) as unknown as Mat4);
    const reprojection = Float32Array.from(multiplyMat4(Array.from(temporal.v2.previous) as unknown as Mat4, invUnjittered));
    {
      // C-31 stage trace: how far the camera reprojection is from identity
      // (static camera → 0) and this frame's sub-pixel jitter.
      let dev = 0;
      for (let i = 0; i < 16; i += 1) dev = Math.max(dev, Math.abs(reprojection[i]! - IDENTITY_MAT4_F32[i]!));
      const jx = temporal.v2.jitterClip[0] * w / 2, jy = temporal.v2.jitterClip[1] * h / 2;
      recordPostStage(`S1C:reproj-dev=${dev.toExponential(2)}:jitter-px=${jx.toFixed(3)},${jy.toFixed(3)}`);
    }
    draw(host, state, camVelProg, asGlTarget(temporal.velocity), [src.depthTextureHandle!], (g) => {
      g.uniform1i(g.getUniformLocation(camVelProg, "u_depth"), 0);
      g.uniform1f(g.getUniformLocation(camVelProg, "u_near"), near);
      g.uniform1f(g.getUniformLocation(camVelProg, "u_far"), far);
      g.uniform1i(g.getUniformLocation(camVelProg, "u_ortho"), ortho ? 1 : 0);
      g.uniformMatrix4fv(g.getUniformLocation(camVelProg, "u_prevViewProjection"), false, reprojection);
      g.uniformMatrix4fv(g.getUniformLocation(camVelProg, "u_invUnjitteredViewProjection"), false, IDENTITY_MAT4_F32);
    });
    // §8.6: closest-depth 3×3 velocity for the silhouette-correct reprojection.
    dilatedVelocity = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const dilateProg = program(state, gl, "velocity-dilate", VELOCITY_DILATE_GLSL);
    draw(host, state, dilateProg, asGlTarget(dilatedVelocity), [asGlTarget(temporal.velocity).colorHandle, asGlTarget(linZFull!).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(dilateProg, "u_velocity"), 0);
      g.uniform1i(g.getUniformLocation(dilateProg, "u_linearDepth"), 1);
    });
  }

  let hdr = source;
  // ── §6.1 insertion "after-depth": custom HDR passes reading linZ ──────────
  for (const pass of customsAt("after-depth")) {
    const out = runCustomPass(host, state, pass, hdr, { linZ: linZFull, velocity: dilatedVelocity }, camera, frameContext);
    if (out !== hdr) {
      if (hdr !== source) state.pool.release(hdr);
      hdr = out;
    }
  }

  // ── S2: GTAO → denoise ×2 → joint-bilateral apply onto HDR ───────────────
  if (wantsAo && camera && linZFull && minmaxHalf) {
    const ao = pipeline.ao as GtaoOptions;
    const directions = ao.directions ?? 4;
    const steps = ao.steps ?? 4;
    // Audit (ssao:normals): S2 is the SSAO the v2 chain executes; record it so diagnostics().post.stagesRan shows it.
    recordPostStage(`S2:gtao-${directions}x${steps}`);
    const aoRaw = state.pool.acquire({ width: hw, height: hh, format: "rgba8", samples: 1, depth: false });
    const gtaoSrc = withDefines(GTAO_GLSL, { AURA_GTAO_DIRECTIONS: directions, AURA_GTAO_STEPS: steps });
    const gtaoProg = program(state, gl, `gtao-${directions}x${steps}`, gtaoSrc);
    const invProj = Float32Array.from(invertMat4(camera.projectionMatrix as unknown as Mat4));
    draw(host, state, gtaoProg, asGlTarget(aoRaw), [asGlTarget(minmaxHalf).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(gtaoProg, "u_linearDepthHalf"), 0);
      g.uniformMatrix4fv(g.getUniformLocation(gtaoProg, "u_projMatrix"), false, camera.projectionMatrix);
      g.uniformMatrix4fv(g.getUniformLocation(gtaoProg, "u_invProjMatrix"), false, invProj);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_near"), near);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_far"), far);
      g.uniform1i(g.getUniformLocation(gtaoProg, "u_ortho"), ortho ? 1 : 0);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_radius"), ao.radius ?? 0.35);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_intensity"), ao.intensity ?? 1);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_falloff"), ao.falloff ?? 1);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_distanceExponent"), 1);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_thickness"), 1);
      g.uniform1i(g.getUniformLocation(gtaoProg, "u_frameIndex"), state.frameIndex);
    });
    // Bilateral denoise: H then V (5-tap, exp depth weight).
    const denoiseProg = program(state, gl, "gtao-denoise", GTAO_DENOISE_GLSL);
    const aoHalf = state.pool.acquire({ width: hw, height: hh, format: "rgba8", samples: 1, depth: false });
    const texel = [1 / hw, 1 / hh];
    draw(host, state, denoiseProg, asGlTarget(aoHalf), [asGlTarget(aoRaw).colorHandle, asGlTarget(minmaxHalf).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(denoiseProg, "u_ao"), 0);
      g.uniform1i(g.getUniformLocation(denoiseProg, "u_depthHalf"), 1);
      g.uniform2f(g.getUniformLocation(denoiseProg, "u_dir"), texel[0]!, 0);
    });
    draw(host, state, denoiseProg, asGlTarget(aoRaw), [asGlTarget(aoHalf).colorHandle, asGlTarget(minmaxHalf).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(denoiseProg, "u_ao"), 0);
      g.uniform1i(g.getUniformLocation(denoiseProg, "u_depthHalf"), 1);
      g.uniform2f(g.getUniformLocation(denoiseProg, "u_dir"), 0, texel[1]!);
    });
    // Apply: joint-bilateral upsample + §6.3 multi-bounce onto a pooled HDR.
    const applied = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const applyProg = program(state, gl, "gtao-apply", GTAO_APPLY_GLSL);
    draw(host, state, applyProg, asGlTarget(applied), [
      asGlTarget(hdr).colorHandle,
      asGlTarget(aoRaw).colorHandle,
      asGlTarget(linZFull).colorHandle,
      asGlTarget(minmaxHalf).colorHandle
    ], (g) => {
      g.uniform1i(g.getUniformLocation(applyProg, "u_hdr"), 0);
      g.uniform1i(g.getUniformLocation(applyProg, "u_ao"), 1);
      g.uniform1i(g.getUniformLocation(applyProg, "u_depthFull"), 2);
      g.uniform1i(g.getUniformLocation(applyProg, "u_depthHalf"), 3);
      g.uniform1f(g.getUniformLocation(applyProg, "u_far"), far);
      g.uniform1f(g.getUniformLocation(applyProg, "u_aoFallbackStrength"), aoFallbackStrength(ao.fallbackStrength));
      g.uniform1i(g.getUniformLocation(applyProg, "u_aoMultiBounce"), ao.multiBounce === false ? 0 : 1);
    });
    hdr = applied;
    state.pool.release(aoRaw);
    state.pool.release(aoHalf);
    void AO_RHO;
  }

  // ── S4: god rays, half-res radial march → additive onto HDR ─────────────
  if (wantsGodRays && camera && minmaxHalf) {
    const god = pipeline.godRays as GodRayOptions;
    const samples = god.samples ?? 32;
    const godTarget = state.pool.acquire({ width: hw, height: hh, format: "rgba16f", samples: 1, depth: false });
    // Light point: authored lightWorld, else a point far along the direction
    // toward the strongest directional light (bridge supplies lightDirection).
    let lightWorld: readonly [number, number, number] | undefined = god.lightWorld;
    if (!lightWorld && god.lightDirection) {
      const d = god.lightDirection;
      const p = camera.position;
      lightWorld = [p[0] + d[0] * far * 2, p[1] + d[1] * far * 2, p[2] + d[2] * far * 2];
    }
    if (!lightWorld) lightWorld = [camera.position[0], camera.position[1] + far, camera.position[2]];
    const vp = camera.viewProjectionMatrix;
    const clip = [
      vp[0]! * lightWorld[0] + vp[4]! * lightWorld[1] + vp[8]! * lightWorld[2] + vp[12]!,
      vp[1]! * lightWorld[0] + vp[5]! * lightWorld[1] + vp[9]! * lightWorld[2] + vp[13]!,
      vp[3]! * lightWorld[0] + vp[7]! * lightWorld[1] + vp[11]! * lightWorld[2] + vp[15]!
    ];
    const lightUv: [number, number] = clip[2] !== 0
      ? [(clip[0]! / clip[2]) * 0.5 + 0.5, (clip[1]! / clip[2]) * 0.5 + 0.5]
      : [0.5, 0.5];
    const godSrc = withDefines(GODRAYS_GLSL, { AURA_GODRAY_SAMPLES: samples });
    const godProg = program(state, gl, `godrays-${samples}`, godSrc);
    recordPostStage(`S4:god-rays-${samples}`);
    draw(host, state, godProg, asGlTarget(godTarget), [asGlTarget(hdr).colorHandle, asGlTarget(minmaxHalf).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(godProg, "u_hdr"), 0);
      g.uniform1i(g.getUniformLocation(godProg, "u_depthHalf"), 1);
      g.uniform1f(g.getUniformLocation(godProg, "u_far"), far);
      g.uniform2f(g.getUniformLocation(godProg, "u_lightUv"), lightUv[0], lightUv[1]);
      g.uniform1f(g.getUniformLocation(godProg, "u_lightClipW"), clip[2]!);
      const c = godRayColor(god.color);
      g.uniform3f(g.getUniformLocation(godProg, "u_color"), c[0], c[1], c[2]);
      g.uniform1f(g.getUniformLocation(godProg, "u_intensity"), god.intensity ?? 0.7);
      g.uniform1f(g.getUniformLocation(godProg, "u_decay"), god.decay ?? 0.94);
      g.uniform1f(g.getUniformLocation(godProg, "u_weight"), god.weight ?? god.intensity ?? 0.7);
      g.uniform1f(g.getUniformLocation(godProg, "u_diskOuter"), 0.08);
      g.uniform1f(g.getUniformLocation(godProg, "u_diskInner"), 0.02);
      // GU47 E-C (EC-8): `godRayDensity`; omitted keeps the full march (1).
      g.uniform1f(g.getUniformLocation(godProg, "u_density"), godRayDensity(god.density));
    });
    // Additive blend onto the working HDR target.
    const blended = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const copyProg = program(state, gl, "v2-add", V2_ADD_GLSL);
    const blendTarget = asGlTarget(blended);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blendTarget.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.useProgram(copyProg);
    gl.bindVertexArray(state.vao);
    resetFullscreenState(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, asGlTarget(hdr).colorHandle);
    gl.uniform1i(gl.getUniformLocation(copyProg, "u_source"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, asGlTarget(godTarget).colorHandle);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    if (hdr !== source) state.pool.release(hdr);
    state.pool.release(godTarget);
    hdr = blended;
  }

  // ── CA: §8.12 radial 3-tap on the working HDR ────────────────────────────
  if (wantsCa) {
    const ca = pipeline.chromaticAberration as { intensity?: number };
    const caTarget = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const caProg = program(state, gl, "ca-pass", CA_PASS_GLSL);
    recordPostStage("CA:chromatic-aberration");
    draw(host, state, caProg, asGlTarget(caTarget), [asGlTarget(hdr).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(caProg, "u_hdr"), 0);
      g.uniform1f(g.getUniformLocation(caProg, "u_caIntensity"), ca.intensity ?? 0.0015);
    });
    if (hdr !== source) state.pool.release(hdr);
    hdr = caTarget;
  }

  // ── §6.1 insertion "before-taa" ───────────────────────────────────────────
  for (const pass of customsAt("before-taa")) {
    const out = runCustomPass(host, state, pass, hdr, { linZ: linZFull, velocity: dilatedVelocity }, camera, frameContext);
    if (out !== hdr) {
      if (hdr !== source) state.pool.release(hdr);
      hdr = out;
    }
  }

  // ── S5: §8.6 TAA resolve into the history ping-pong ──────────────────────
  if (taaActive) recordPostStage(temporal?.v2 && dilatedVelocity
    ? `S5:${temporal.historyValid ? "history" : "seed"}:frames=${temporal.historyFrames}`
    : `S5:skip:velocity=${String(Boolean(dilatedVelocity))}`);
  if (taaActive && temporal?.v2 && dilatedVelocity) {
    const taa = (pipeline.taa ?? {}) as Partial<TaaOptions>;
    const taaProg = program(state, gl, "taa-resolve", TAA_RESOLVE_GLSL);
    const resolved = temporal.historyOutput;
    markTaaHistoryWritten();
    draw(host, state, taaProg, asGlTarget(resolved), [
      asGlTarget(hdr).colorHandle,
      asGlTarget(temporal.history).colorHandle,
      asGlTarget(dilatedVelocity).colorHandle,
      asGlTarget(temporal.v2.linZ).colorHandle,
      state.blankTex
    ], (g) => {
      g.uniform1i(g.getUniformLocation(taaProg, "u_current"), 0);
      g.uniform1i(g.getUniformLocation(taaProg, "u_history"), 1);
      g.uniform1i(g.getUniformLocation(taaProg, "u_velocityDilate"), 2);
      g.uniform1i(g.getUniformLocation(taaProg, "u_linZPrev"), 3);
      g.uniform1i(g.getUniformLocation(taaProg, "u_reactive"), 4);
      g.uniform1i(g.getUniformLocation(taaProg, "u_hasReactive"), 0);
      g.uniform1i(g.getUniformLocation(taaProg, "u_hasHistory"), temporal.historyValid ? 1 : 0);
      g.uniform1f(g.getUniformLocation(taaProg, "u_feedbackMin"), taa.feedbackMin ?? 0.88);
      g.uniform1f(g.getUniformLocation(taaProg, "u_feedbackMax"), taa.feedbackMax ?? 0.97);
      g.uniform1f(g.getUniformLocation(taaProg, "u_varianceGamma"), taa.varianceGamma ?? 1.0);
    });
    if (hdr !== source) state.pool.release(hdr);
    // §8.6 TAAU: renderScale < 1 reconstructs at display resolution with the
    // 9-tap Blackman-Harris kernel. History stays render-res (self-consistent
    // reprojection); only the presented output upsamples.
    const renderScale = pipeline.renderScale ?? 1;
    if (renderScale < 1) {
      const outW = Math.max(1, Math.round(w / renderScale));
      const outH = Math.max(1, Math.round(h / renderScale));
      const display = state.pool.acquire({ width: outW, height: outH, format: "rgba16f", samples: 1, depth: false });
      const upProg = program(state, gl, "taa-upscale", TAA_UPSCALE_GLSL);
      draw(host, state, upProg, asGlTarget(display), [asGlTarget(resolved).colorHandle], (g) => {
        g.uniform1i(g.getUniformLocation(upProg, "u_resolved"), 0);
        g.uniform2f(g.getUniformLocation(upProg, "u_renderSize"), w, h);
        g.uniform2f(g.getUniformLocation(upProg, "u_outputSize"), outW, outH);
      });
      hdr = display;
      // Note: downstream stages (S6/S7) then run at display res; linZ/velocity
      // stays render-res — sampling is texelFetch-indexed so the sizes differ
      // intentionally and DOF/MB reads scale via textureSize().
    } else {
      hdr = resolved;
    }
  }

  // ── §6.1 insertion "after-taa" (stable HDR) ───────────────────────────────
  for (const pass of customsAt("after-taa")) {
    const out = runCustomPass(host, state, pass, hdr, { linZ: linZFull, velocity: dilatedVelocity }, camera, frameContext);
    if (out !== hdr) {
      if (hdr !== source) state.pool.release(hdr);
      hdr = out;
    }
  }

  // ── S6: §8.7 depth of field ───────────────────────────────────────────────
  if (wantsDof && linZFull) {
    const dof = (pipeline.dof ?? {}) as Partial<DofOptions>;
    const maxBlur = dof.maxBlurPx ?? 16;
    const rings = 3; // High preset; tier table routes Medium → 2 via §6.5
    const dw = Math.max(1, Math.round(w / 2)), dh = Math.max(1, Math.round(h / 2));
    const prefilter = state.pool.acquire({ width: dw, height: dh, format: "rgba16f", samples: 1, depth: false });
    const prefilterProg = program(state, gl, "dof-prefilter", DOF_PREFILTER_GLSL);
    // GU47 E-C (EC-8): the tilt-shift band replaces the thin-lens CoC.
    const tilt = dofTiltShiftUniform(dof.tiltShift);
    recordPostStage(tilt[3] > 0 ? `S6:dof-tilt-shift-rings${rings}` : `S6:dof-rings${rings}`);
    draw(host, state, prefilterProg, asGlTarget(prefilter), [asGlTarget(hdr).colorHandle, asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(prefilterProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(prefilterProg, "u_linearDepth"), 1);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_focusDistance"), dof.focusDistance ?? 3);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_focalLengthMm"), dof.focalLengthMm ?? 50);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_fStop"), dof.fStop ?? 2.8);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_sensorHeightMm"), dof.sensorHeightMm ?? 24);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_frameHeightPx"), h);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_maxBlurPx"), maxBlur);
      g.uniform4f(g.getUniformLocation(prefilterProg, "u_tiltShift"), tilt[0], tilt[1], tilt[2], tilt[3]);
    });
    const tileW = Math.max(1, Math.ceil(dw / 8)), tileH = Math.max(1, Math.ceil(dh / 8));
    const nearTile = state.pool.acquire({ width: tileW, height: tileH, format: "rgba16f", samples: 1, depth: false });
    const tileProg = program(state, gl, "dof-near-tile", DOF_NEAR_TILE_GLSL);
    draw(host, state, tileProg, asGlTarget(nearTile), [asGlTarget(prefilter).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(tileProg, "u_prefilter"), 0);
    });
    const gather = state.pool.acquire({ width: dw, height: dh, format: "rgba16f", samples: 1, depth: false });
    const gatherSrc = withDefines(DOF_GATHER_GLSL, { DOF_RINGS: rings });
    const gatherProg = program(state, gl, `dof-gather-${rings}`, gatherSrc);
    draw(host, state, gatherProg, asGlTarget(gather), [asGlTarget(prefilter).colorHandle, asGlTarget(nearTile).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(gatherProg, "u_prefilter"), 0);
      g.uniform1i(g.getUniformLocation(gatherProg, "u_nearTile"), 1);
      g.uniform1f(g.getUniformLocation(gatherProg, "u_maxBlurPx"), maxBlur);
    });
    const comp = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const compProg = program(state, gl, "dof-composite", DOF_COMPOSITE_GLSL);
    draw(host, state, compProg, asGlTarget(comp), [asGlTarget(hdr).colorHandle, asGlTarget(gather).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(compProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(compProg, "u_blurred"), 1);
    });
    state.pool.release(prefilter); state.pool.release(nearTile); state.pool.release(gather);
    if (hdr !== source) state.pool.release(hdr);
    hdr = comp;
  }

  // ── S7: §8.8 motion blur (McGuire tile reconstruction) ────────────────────
  if (mbActive && temporal?.v2 && dilatedVelocity && linZFull) {
    const mb = (pipeline.motionBlur ?? {}) as Partial<MotionBlurOptions>;
    const tile = mb.tileSize ?? 16;
    const samples = mb.samples ?? 12;
    const tw = Math.max(1, Math.ceil(w / tile)), th = Math.max(1, Math.ceil(h / tile));
    recordPostStage(`S7:motion-blur-${samples}x${tile}`);
    const tileMax = state.pool.acquire({ width: tw, height: th, format: "rgba16f", samples: 1, depth: false });
    const tileProg = program(state, gl, `mb-tile-${tile}`, withDefines(MB_TILE_MAX_GLSL, { MB_TILE_SIZE: tile }));
    draw(host, state, tileProg, asGlTarget(tileMax), [asGlTarget(dilatedVelocity).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(tileProg, "u_velocity"), 0);
    });
    const neighbor = state.pool.acquire({ width: tw, height: th, format: "rgba16f", samples: 1, depth: false });
    const neighborProg = program(state, gl, "mb-neighbor", MB_NEIGHBOR_GLSL);
    draw(host, state, neighborProg, asGlTarget(neighbor), [asGlTarget(tileMax).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(neighborProg, "u_tileMax"), 0);
    });
    const blurred = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const reconProg = program(state, gl, `mb-recon-${samples}-${tile}`, MB_RECONSTRUCT_GLSL);
    // §8.8: shutter · (targetFrameTime / actualFrameTime). The target is the
    // nominal 60 Hz frame; the actual comes from the temporal stamp (C-23
    // timeScale already folded into the authored shutter by the bridge).
    const frameScale = (mb.shutter ?? 0.5) * ((1 / 60) / Math.max(temporal.v2.frameTime, 1e-4));
    draw(host, state, reconProg, asGlTarget(blurred), [asGlTarget(hdr).colorHandle, asGlTarget(dilatedVelocity).colorHandle, asGlTarget(neighbor).colorHandle, asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(reconProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(reconProg, "u_velocity"), 1);
      g.uniform1i(g.getUniformLocation(reconProg, "u_neighbor"), 2);
      g.uniform1i(g.getUniformLocation(reconProg, "u_linearDepth"), 3);
      g.uniform1f(g.getUniformLocation(reconProg, "u_shutter"), frameScale);
      g.uniform1f(g.getUniformLocation(reconProg, "u_maxBlurPx"), mb.maxBlurPx ?? 32);
      g.uniform1i(g.getUniformLocation(reconProg, "u_samples"), samples);
      g.uniform1i(g.getUniformLocation(reconProg, "u_tileSize"), tile);
      g.uniform1i(g.getUniformLocation(reconProg, "u_frameIndex"), state.frameIndex);
    });
    state.pool.release(tileMax); state.pool.release(neighbor);
    if (hdr !== source) state.pool.release(hdr);
    hdr = blurred;
  }

  // ── S8: §8.9 auto-exposure — log2 luma chain → 1×1 EV ping-pong → mul ─────
  if (wantsAutoExposure) {
    const ae = autoExposure as Partial<AutoExposureOptionsV2>;
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    const luma = state.pool.acquire({ width: qw, height: qh, format: "rgba16f", samples: 1, depth: false });
    const lumaProg = program(state, gl, "exposure-luma", EXPOSURE_LUMA_LOG_GLSL);
    draw(host, state, lumaProg, asGlTarget(luma), [asGlTarget(hdr).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(lumaProg, "u_hdr"), 0);
      g.uniform2f(g.getUniformLocation(lumaProg, "u_texelSize"), 1 / w, 1 / h);
      g.uniform1i(g.getUniformLocation(lumaProg, "u_centerWeighted"), (ae.meteringMask ?? "center-weighted") === "center-weighted" ? 1 : 0);
    });
    // 2× box-reduce chain down to 1×1.
    let rw = qw, rh = qh;
    let reduceSrc = luma;
    let reduceTmp: RenderTarget | null = null;
    while (rw > 1 || rh > 1) {
      rw = Math.max(1, rw >> 1); rh = Math.max(1, rh >> 1);
      const next = state.pool.acquire({ width: rw, height: rh, format: "rgba16f", samples: 1, depth: false });
      const redProg = program(state, gl, "exposure-reduce", EXPOSURE_REDUCE_GLSL);
      draw(host, state, redProg, asGlTarget(next), [asGlTarget(reduceSrc).colorHandle], (g) => {
        g.uniform1i(g.getUniformLocation(redProg, "u_source"), 0);
        g.uniform2f(g.getUniformLocation(redProg, "u_texelSize"), 1 / (rw * 2), 1 / (rh * 2));
      });
      if (reduceSrc !== luma) state.pool.release(reduceSrc);
      reduceTmp = next;
      reduceSrc = next;
    }
    // 1×1 EV ping-pong, persistent across frames — created directly on the
    // device because `PostResources.resize` releases every pooled "live"
    // target whose (w,h) doesn't match the new render size.
    if (!state.evTargets[0] || !state.evTargets[1]) {
      state.evTargets = [
        host.device.createRenderTarget({ width: 1, height: 1, format: "rgba32f", depth: false, label: "post.ev.a" }),
        host.device.createRenderTarget({ width: 1, height: 1, format: "rgba32f", depth: false, label: "post.ev.b" })
      ];
    }
    const evRead = state.evTargets[state.evIndex]!;
    const evWrite = state.evTargets[1 - state.evIndex]!;
    const adaptProg = program(state, gl, "exposure-adapt", EXPOSURE_ADAPT_GLSL);
    draw(host, state, adaptProg, asGlTarget(evWrite), [
      state.evValid ? asGlTarget(evRead).colorHandle : state.blankTex,
      asGlTarget(reduceSrc).colorHandle
    ], (g) => {
      g.uniform1i(g.getUniformLocation(adaptProg, "u_prev"), 0);
      g.uniform1i(g.getUniformLocation(adaptProg, "u_avg"), 1);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_dt"), temporal?.v2?.frameTime ?? 1 / 60);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_speedUp"), ae.speedUp ?? 3);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_speedDown"), ae.speedDown ?? 1);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_minEv"), ae.minEv ?? -4);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_maxEv"), ae.maxEv ?? 4);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_compensationEv"), ae.compensationEv ?? 0);
      g.uniform1i(g.getUniformLocation(adaptProg, "u_hasPrev"), state.evValid ? 1 : 0);
    });
    state.evIndex = (1 - state.evIndex) as 0 | 1;
    state.evValid = true;
    state.pool.release(luma);
    if (reduceTmp) state.pool.release(reduceTmp);
    recordPostStage("S8:auto-exposure");
    // Apply: hdr *= exp2(ev) — the composite's autoExp factor, ahead of the
    // fused present's own §6.4 exposure (linear multipliers commute). GU47
    // E-C: the S10 linear grade folds into this same draw (one fullscreen
    // pass for AE + grade).
    const multiplied = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    runHdrGradeDraw(host, state, multiplied, hdr, evWrite, gradeUniforms);
    if (gradeUniforms) recordPostStage("S10:hdr-grade:folded-s8");
    if (hdr !== source) state.pool.release(hdr);
    hdr = multiplied;
  } else if (gradeUniforms) {
    // ── S10 linear grade (no S8 this frame): one fullscreen draw ─────────────
    const graded = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    runHdrGradeDraw(host, state, graded, hdr, null, gradeUniforms);
    recordPostStage("S10:hdr-grade");
    if (hdr !== source) state.pool.release(hdr);
    hdr = graded;
  }

  // ── §6.1 insertion "before-tonemap" (linear HDR, exposure applied) ────────
  const beforeTonemapPasses = customsAt("before-tonemap");
  let afterBloom: DeferredAfterBloomStage | undefined;
  if (options?.deferBeforeTonemap && beforeTonemapPasses.length > 0) {
    // R-03b: bloom composites inside the fused present, so these passes run
    // from there (S9/S10 → before-tonemap → OUT). Capture this frame's clock
    // now; the counters advance below before the present calls `run`.
    const deferredFrameIndex = state.frameIndex;
    const deferredTimeSeconds = state.timeSeconds;
    const deferredAux = { linZ: linZFull, velocity: dilatedVelocity };
    const releaseLinZ = linZFull && linZOwnedByPool ? linZFull : null;
    const releaseVelocity = dilatedVelocity;
    let held: RenderTarget | null = null;
    afterBloom = {
      run: (input) => {
        const savedFrameIndex = state.frameIndex;
        const savedTimeSeconds = state.timeSeconds;
        state.frameIndex = deferredFrameIndex;
        state.timeSeconds = deferredTimeSeconds;
        try {
          let current: PostColorInput = input;
          for (const pass of beforeTonemapPasses) {
            const out = runCustomPassOnTexture(host, state, pass, current, deferredAux, camera, frameContext);
            if (!out) continue;
            if (held) state.pool.release(held);
            held = out;
            current = asGlTarget(out);
          }
          return current;
        } finally {
          state.frameIndex = savedFrameIndex;
          state.timeSeconds = savedTimeSeconds;
        }
      },
      release: () => {
        if (held) state.pool.release(held);
        held = null;
        if (releaseVelocity) state.pool.release(releaseVelocity);
        if (releaseLinZ) state.pool.release(releaseLinZ);
      }
    };
  } else {
    for (const pass of beforeTonemapPasses) {
      const out = runCustomPass(host, state, pass, hdr, { linZ: linZFull, velocity: dilatedVelocity }, camera, frameContext);
      if (out !== hdr) {
        if (hdr !== source) state.pool.release(hdr);
        hdr = out;
      }
    }
  }

  state.timeSeconds += temporal?.v2?.frameTime ?? 1 / 60;
  if (!afterBloom) {
    if (dilatedVelocity) state.pool.release(dilatedVelocity);
    if (linZFull && linZOwnedByPool) state.pool.release(linZFull);
  }
  if (minmaxHalf) state.pool.release(minmaxHalf);
  state.frameIndex += 1;
  // T0-16: `draw()`/the stage bodies issue raw GL (bindFramebuffer,
  // useProgram, bindVertexArray, texture binds) that bypasses
  // `host.stateCache`, leaving its cached program/VAO/FBO/texture state
  // stale — the next cached-state consumer would skip re-issuing real
  // state. Invalidate so nothing downstream trusts the poisoned entries.
  host.stateCache.invalidate();
  // §6.3: generated-program pixels carry the tagged f_ind (alpha = 2 + f_ind,
  // `prd03.indirectFraction`) and the apply multiplies only that fraction.
  // `aoPending` still reports AO_INDIRECT_FRACTION_PENDING because legacy
  // shaderKey/custom draws carry no f_ind and take the capped fallback.
  return { target: hdr, aoPending: wantsAo, skipped, ...(afterBloom ? { afterBloom } : {}) };
}

/**
 * §6.3 fallback cap. Pixels without the tagged f_ind (legacy shaderKey draws,
 * custom shaders) cannot tell direct from indirect light, so the apply darkens
 * them by `mix(1, ao, strength)`. The authored 0.6 darkened directly lit
 * surfaces by 4–12% luma on the L4 games (blockfall-reactor 34.5 → 30.3);
 * capped at 0.1 an open lit surface (GTAO ao ≈ 0.9) loses ≤ ~1% luma while
 * creases (ao ≈ 0.3) still darken ~7%. Generated-program pixels ignore it.
 */
export const AO_FALLBACK_STRENGTH_MAX = 0.1;

export function aoFallbackStrength(authored: number | undefined): number {
  const v = authored ?? AO_FALLBACK_STRENGTH_MAX;
  return Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), AO_FALLBACK_STRENGTH_MAX);
}

/** True when S10b/S11/S12 need a real LDR tail after the fused present. */
export function v2NeedsLdrTail(pipeline: PostPipelineOptions): boolean {
  const displayCustoms = mergedCustomPasses(pipeline).some((pass) => pass.insertAt === "after-tonemap");
  return Boolean(pipeline.vignette || pipeline.filmGrain || pipeline.lut
    || pipeline.antiAliasing === "smaa" || displayCustoms);
}

/**
 * Runs S10b/S11/S12 on the fused LDR output and writes `outTarget` (or the
 * default framebuffer when undefined). `ldr` must be an rgba8 target the
 * fused present just wrote.
 */
export function runV2LdrTail(
  host: WebGL2DeviceHost,
  ldr: RenderTarget,
  pipeline: PostPipelineOptions,
  outTarget: RenderTarget | undefined,
  /** CCR-03-12 (Phase 6): C-13 custom-pass frame context (source/items/sceneDepth). */
  frameContext?: PostFrameContextBag
): void {
  const gl = host.gl;
  const state = v2State(host);
  const ldrGl = asGlTarget(ldr);
  const w = ldr.width, h = ldr.height;
  const vignette = pipeline.vignette as { intensity?: number; smoothness?: number; roundness?: number; color?: unknown } | undefined;
  const grain = pipeline.filmGrain as { intensity?: number; size?: number; luminanceResponse?: number } | undefined;
  const aaFxaa = pipeline.antiAliasing === "fxaa";
  const aaSmaa = pipeline.antiAliasing === "smaa";
  const displayCustoms = sortCustomPassesAtAnchor(mergedCustomPasses(pipeline), "after-tonemap");
  const rcas = (pipeline.renderScale ?? 1) < 1 ? 0.2 : 0;
  // GU47 E-C (EC-2): the user `.cube` LUT, uploaded once per source.
  const lut = displayLutBinding(host, state, pipeline.lut);
  const bindLut = (g: WebGL2RenderingContext, prog: WebGLProgram): void => {
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_3D, lut?.texture ?? state.identityLut);
    g.uniform1i(g.getUniformLocation(prog, "u_lut3d"), 1);
    g.uniform1i(g.getUniformLocation(prog, "u_hasLut"), lut ? 1 : 0);
    g.uniform1i(g.getUniformLocation(prog, "u_lutLattice"), lut ? 1 : 0);
    g.uniform1f(g.getUniformLocation(prog, "u_lutBypass"), lut?.bypass ?? 0);
  };
  // GU47 E-C stage trace: the display stages that draw this frame.
  const vignetteOn = (vignette?.intensity ?? 0) > 0;
  const grainOn = (grain?.intensity ?? 0) > 0;
  const traceDisplayStages = (fused: boolean): void => {
    if (vignetteOn || lut) recordPostStage(`S10b:display-grade${vignetteOn ? ":vignette" : ""}${lut ? ":lut" : ""}${fused ? ":fused-fxaa" : ""}`);
    if (grainOn) recordPostStage(`S12:film-grain${fused ? ":fused-fxaa" : ""}`);
  };

  // §6.1 fuse: FXAA + S10b + S12 in a single draw — only when nothing sits
  // between the stages (an after-tonemap custom pass splices S10b→S11).
  if (aaFxaa && displayCustoms.length === 0) {
    const prog = program(state, gl, "finalize-fxaa-fused", FINALIZE_FXAA_FUSED_GLSL);
    traceDisplayStages(true);
    recordPostStage("S11:fxaa:fused");
    bindOut(host, outTarget, w, h);
    gl.useProgram(prog);
    gl.bindVertexArray(state.vao);
    resetFullscreenState(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ldrGl.colorHandle);
    bindLut(gl, prog);
    gl.uniform1i(gl.getUniformLocation(prog, "u_source"), 0);
    gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform2f(gl.getUniformLocation(prog, "u_outputTexel"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(prog, "u_frame"), state.frameIndex);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainIntensity"), grain?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainSize"), grain?.size ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainLuminanceResponse"), grain?.luminanceResponse ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteIntensity"), vignette?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteSmoothness"), vignette?.smoothness ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteRoundness"), vignette?.roundness ?? 1);
    const vc = vignetteColorRgb(vignette?.color);
    gl.uniform3f(gl.getUniformLocation(prog, "u_vignetteColor"), vc[0], vc[1], vc[2]);
    gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // T0-16: raw GL above bypassed the state cache — invalidate before the
    // next frame's first cached-state user.
    host.stateCache.invalidate();
    return;
  }

  let current = ldr;
  traceDisplayStages(false);
  // S10b — display grade: vignette plus the user `.cube` (GU47 E-C, EC-2;
  // the identity 3-D texture binds with u_hasLut 0 while no LUT resolved).
  if (vignette || pipeline.lut) {
    const graded = state.pool.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const prog = program(state, gl, "display-grade", DISPLAY_GRADE_GLSL);
    draw(host, state, prog, asGlTarget(graded), [ldrGl.colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(prog, "u_source"), 0);
      bindLut(g, prog);
      g.uniform1f(g.getUniformLocation(prog, "u_vignetteIntensity"), vignette?.intensity ?? 0);
      g.uniform1f(g.getUniformLocation(prog, "u_vignetteSmoothness"), vignette?.smoothness ?? 1);
      g.uniform1f(g.getUniformLocation(prog, "u_vignetteRoundness"), vignette?.roundness ?? 1);
      const vc = vignetteColorRgb(vignette?.color);
      g.uniform3f(g.getUniformLocation(prog, "u_vignetteColor"), vc[0], vc[1], vc[2]);
      g.uniform2f(g.getUniformLocation(prog, "u_resolution"), w, h);
    });
    current = graded;
  }

  // §6.1 insertion "after-tonemap" (display-referred RGBA8 customs).
  for (const pass of displayCustoms) {
    const out = runCustomPass(host, state, pass, current, {}, null, frameContext);
    if (out !== current) {
      if (current !== ldr) state.pool.release(current);
      current = out;
    }
  }

  // S11 — SMAA 1x three-pass (§8.14). The lazy textures warm on first use;
  // until both land, the stage skips (same first-frames window as three's
  // async Image load — never a silent FXAA substitution).
  if (aaSmaa && smaaTexturesReady(host, state)) {
    recordPostStage("S11:smaa");
    const edges = state.pool.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const edgesProg = program(state, gl, "smaa-edges", SMAA_EDGES_GLSL);
    draw(host, state, edgesProg, asGlTarget(edges), [asGlTarget(current).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(edgesProg, "u_color"), 0);
      g.uniform2f(g.getUniformLocation(edgesProg, "u_resolution"), 1 / w, 1 / h);
    });
    const weights = state.pool.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const weightsProg = program(state, gl, "smaa-weights", SMAA_WEIGHTS_GLSL);
    draw(host, state, weightsProg, asGlTarget(weights), [
      asGlTarget(edges).colorHandle, state.smaa.area!, state.smaa.search!
    ], (g) => {
      g.uniform1i(g.getUniformLocation(weightsProg, "u_edges"), 0);
      g.uniform1i(g.getUniformLocation(weightsProg, "u_area"), 1);
      g.uniform1i(g.getUniformLocation(weightsProg, "u_search"), 2);
      g.uniform2f(g.getUniformLocation(weightsProg, "u_resolution"), 1 / w, 1 / h);
    });
    const blended = state.pool.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const blendProg = program(state, gl, "smaa-blend", SMAA_BLEND_GLSL);
    draw(host, state, blendProg, asGlTarget(blended), [
      asGlTarget(weights).colorHandle, asGlTarget(current).colorHandle
    ], (g) => {
      g.uniform1i(g.getUniformLocation(blendProg, "u_weights"), 0);
      g.uniform1i(g.getUniformLocation(blendProg, "u_color"), 1);
      g.uniform2f(g.getUniformLocation(blendProg, "u_resolution"), 1 / w, 1 / h);
    });
    state.pool.release(edges); state.pool.release(weights);
    if (current !== ldr) state.pool.release(current);
    current = blended;
  } else if (aaFxaa && displayCustoms.length > 0) {
    // FXAA unfused: an after-tonemap custom already consumed the fused slot.
    recordPostStage("S11:fxaa");
    const aa = state.pool.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const fxaaProg = program(state, gl, "fxaa-standalone-nodither",
      FXAA_185_FRAGMENT_GLSL.replace("#version 300 es", "#version 300 es\n#define AURA_FXAA_NO_DITHER"));
    draw(host, state, fxaaProg, asGlTarget(aa), [asGlTarget(current).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(fxaaProg, "u_source"), 0);
      g.uniform2f(g.getUniformLocation(fxaaProg, "u_texelSize"), 1 / w, 1 / h);
      g.uniform2f(g.getUniformLocation(fxaaProg, "u_outputTexel"), 1 / w, 1 / h);
    });
    if (current !== ldr) state.pool.release(current);
    current = aa;
  }

  // S12 — finalize: grain + RCAS + the single triangular dither.
  const prog = program(state, gl, "finalize", FINALIZE_GLSL);
  bindOut(host, outTarget, w, h);
  gl.useProgram(prog);
  gl.bindVertexArray(state.vao);
  resetFullscreenState(gl);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, asGlTarget(current).colorHandle);
  gl.uniform1i(gl.getUniformLocation(prog, "u_source"), 0);
  gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / w, 1 / h);
  gl.uniform1f(gl.getUniformLocation(prog, "u_frame"), state.frameIndex);
  gl.uniform1f(gl.getUniformLocation(prog, "u_grainIntensity"), grain?.intensity ?? 0);
  gl.uniform1f(gl.getUniformLocation(prog, "u_grainSize"), grain?.size ?? 1);
  gl.uniform1f(gl.getUniformLocation(prog, "u_grainLuminanceResponse"), grain?.luminanceResponse ?? 1);
  gl.uniform1f(gl.getUniformLocation(prog, "u_rcasSharpness"), rcas);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  // T0-16: invalidate the bypassed state cache (see above) — the last v2
  // stage leaves GL nothing like the cache believes.
  host.stateCache.invalidate();
  if (current !== ldr) state.pool.release(current);
}

function bindOut(host: WebGL2DeviceHost, outTarget: RenderTarget | undefined, w: number, h: number): void {
  const gl = host.gl;
  if (outTarget) {
    const t = asGlTarget(outTarget);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
    gl.viewport(0, 0, t.width, t.height);
  } else {
    // SC-01/XR: the default output is the external framebuffer when set, and honours a persistent viewport.
    host.lifecycle.bindOutput(null, w, h);
  }
}

const V2_ADD_GLSL = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 outColor;
void main() { outColor = texture(u_source, v_uv); }
`;

/**
 * Releases a pooled target a stage call returned. The caller owns the
 * returned HDR/LDR target: `runV2HdrStages`'s output feeds the fused
 * present, then comes back here (or to `pool.releaseAll` at frame end).
 */
export function releaseV2Target(host: WebGL2DeviceHost, target: RenderTarget): void {
  v2State(host).pool.release(target);
}

/** Acquire a pooled target from the v2 stage pool (LDR tail scratch). */
export function acquireV2Target(host: WebGL2DeviceHost, key: { readonly width: number; readonly height: number; readonly format: string }): RenderTarget {
  return v2State(host).pool.acquire({ ...key, samples: 1, depth: false });
}
