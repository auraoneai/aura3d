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
import { invertMat4, type Mat4 } from "@aura3d/scene";
import {
  registeredPostPasses,
  type PostPassDescriptor,
  type PostPipelineOptions
} from "../contracts/post";
import type { FrameCamera, FrameContributorContext } from "../contracts/frameGraph";
import type { RenderItem } from "../ForwardPass";
import type { Texture } from "../Texture";
import type { TemporalGpuBindings } from "../TemporalHistory";
import { rendererQrFlags } from "../renderer/FrameGraph";
import { recordPostSkipped } from "./postSkipped";
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
import { VELOCITY_DILATE_GLSL } from "./shaders/velocityDilate.glsl.js";
import { TAA_RESOLVE_GLSL, TAA_UPSCALE_GLSL } from "./shaders/taa.glsl.js";
import { DOF_COMPOSITE_GLSL, DOF_GATHER_GLSL, DOF_NEAR_TILE_GLSL, DOF_PREFILTER_GLSL } from "./shaders/dof.glsl.js";
import { MB_NEIGHBOR_GLSL, MB_RECONSTRUCT_GLSL, MB_TILE_MAX_GLSL } from "./shaders/motionBlur.glsl.js";
import { EXPOSURE_ADAPT_GLSL, EXPOSURE_LUMA_LOG_GLSL, EXPOSURE_MUL_GLSL, EXPOSURE_REDUCE_GLSL } from "./shaders/exposure.glsl.js";
import { SMAA_BLEND_GLSL, SMAA_EDGES_GLSL, SMAA_WEIGHTS_GLSL } from "./shaders/smaa.glsl.js";
import { FXAA_185_FRAGMENT_GLSL } from "./shaders/fxaa.glsl.js";
import { POST_INSERT_ANCHORS, type AutoExposureOptionsV2, type DofOptions, type GtaoOptions, type GodRayOptions, type MotionBlurOptions, type TaaOptions } from "./PostGraph";

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
}

const states = new WeakMap<WebGL2RenderingContext, PostV2State>();

function v2State(host: WebGL2DeviceHost): PostV2State {
  const gl = host.gl;
  let state = states.get(gl);
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
      smaa: { area: null, search: null, requested: false }
    };
    states.set(gl, state);
  }
  return state;
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
    throw new RenderDeviceError(`v2 post program link failed: ${log}`, "POST_GRAPH_V2_UNSUPPORTED", { key });
  }
  state.programs.set(key, prog);
  return prog;
}

function draw(host: WebGL2DeviceHost, state: PostV2State, prog: WebGLProgram, target: GlTarget, textures: readonly WebGLTexture[], uniforms: (gl: WebGL2RenderingContext) => void): void {
  const gl = host.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.useProgram(prog);
  gl.bindVertexArray(state.vao);
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
 * the C-13 registry, deduped by id (an engine may stamp the same descriptor
 * into both). Order = insertion order at each anchor.
 */
function mergedCustomPasses(pipeline: PostPipelineOptions): readonly PostPassDescriptor[] {
  const seen = new Set<string>();
  const out: PostPassDescriptor[] = [];
  for (const pass of [...(pipeline.customPasses ?? []), ...registeredPostPasses()]) {
    if (seen.has(pass.id)) continue;
    seen.add(pass.id);
    out.push(pass);
  }
  return out;
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
  const gl = host.gl;
  const frame = customPassFrameContext(state, host, input.width, input.height, camera, bag);
  if (pass.enabled && !pass.enabled(frame)) return input;
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
    asGlTarget(input).colorHandle,
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
function smaaTexturesReady(host: WebGL2DeviceHost, state: PostV2State): boolean {
  const gl = host.gl;
  if (state.smaa.area && state.smaa.search) return true;
  if (!state.smaa.requested) {
    state.smaa.requested = true;
    void import("./smaa/textures.js").then(async (mod) => {
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
      } catch {
        // Decode/upload failed — leave requested so we don't retry-loop;
        // S11 stays skipped (post.skipped shows SMAA only via the plan).
        state.smaa.requested = true;
      }
    });
  }
  return false;
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
  frameContext?: PostFrameContextBag
): { readonly target: RenderTarget; readonly aoPending: boolean; readonly skipped: readonly string[] } {
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
  const customs = mergedCustomPasses(pipeline);
  const customsAt = (anchor: PostPassDescriptor["insertAt"]): readonly PostPassDescriptor[] =>
    customs.filter((pass) => pass.insertAt === anchor);
  const hdrCustoms = customs.filter((pass) => pass.insertAt !== "after-tonemap");
  // TAA and motion blur silently degrade without temporal surfaces; the
  // engine-side AA resolve already reported the coverage fallback.
  const skipped: string[] = [];
  const temporalOk = Boolean(temporal?.v2);
  const taaActive = wantsTaa && temporalOk;
  const mbActive = wantsMb && temporalOk;
  if (wantsTaa && !temporalOk) skipped.push("TAA_VELOCITY_COVERAGE");
  if (wantsMb && !temporalOk) skipped.push("S7_VELOCITY_UNAVAILABLE");
  const needsLinZ = wantsAo || wantsGodRays || wantsDof || taaActive || mbActive
    || hdrCustoms.some((pass) => pass.inputs.includes("depth"));
  const needsVelocity = ((taaActive || mbActive) && temporalOk)
    || (hdrCustoms.some((pass) => pass.inputs.includes("velocity")) && temporalOk);
  if (!wantsAo && !wantsGodRays && !wantsCa && !taaActive && !wantsDof && !mbActive && !wantsAutoExposure && hdrCustoms.length === 0) return { target: source, aoPending: false, skipped };

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
    const invUnjittered = invertMat4(Array.from(temporal.v2.unjittered) as unknown as Mat4);
    draw(host, state, camVelProg, asGlTarget(temporal.velocity), [src.depthTextureHandle!], (g) => {
      g.uniform1i(g.getUniformLocation(camVelProg, "u_depth"), 0);
      g.uniform1f(g.getUniformLocation(camVelProg, "u_near"), near);
      g.uniform1f(g.getUniformLocation(camVelProg, "u_far"), far);
      g.uniform1i(g.getUniformLocation(camVelProg, "u_ortho"), ortho ? 1 : 0);
      g.uniformMatrix4fv(g.getUniformLocation(camVelProg, "u_prevViewProjection"), false, temporal.v2!.previous);
      g.uniformMatrix4fv(g.getUniformLocation(camVelProg, "u_invUnjitteredViewProjection"), false, Float32Array.from(invUnjittered));
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
    const aoRaw = state.pool.acquire({ width: hw, height: hh, format: "rgba8", samples: 1, depth: false });
    const gtaoSrc = `#define AURA_GTAO_DIRECTIONS ${directions}\n#define AURA_GTAO_STEPS ${steps}\n` + GTAO_GLSL;
    const gtaoProg = program(state, gl, `gtao-${directions}x${steps}`, gtaoSrc);
    const invProj = Float32Array.from(invertMat4(camera.projectionMatrix as unknown as Mat4));
    draw(host, state, gtaoProg, asGlTarget(aoRaw), [asGlTarget(minmaxHalf).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(gtaoProg, "u_linearDepthHalf"), 0);
      g.uniformMatrix4fv(g.getUniformLocation(gtaoProg, "u_projMatrix"), false, camera.projectionMatrix);
      g.uniformMatrix4fv(g.getUniformLocation(gtaoProg, "u_invProjMatrix"), false, invProj);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_near"), near);
      g.uniform1f(g.getUniformLocation(gtaoProg, "u_far"), far);
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
      g.uniform1f(g.getUniformLocation(applyProg, "u_aoFallbackStrength"), ao.fallbackStrength ?? 0.6);
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
    const godSrc = `#define AURA_GODRAY_SAMPLES ${samples}\n` + GODRAYS_GLSL;
    const godProg = program(state, gl, `godrays-${samples}`, godSrc);
    draw(host, state, godProg, asGlTarget(godTarget), [asGlTarget(hdr).colorHandle, asGlTarget(minmaxHalf).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(godProg, "u_hdr"), 0);
      g.uniform1i(g.getUniformLocation(godProg, "u_depthHalf"), 1);
      g.uniform1f(g.getUniformLocation(godProg, "u_far"), far);
      g.uniform2f(g.getUniformLocation(godProg, "u_lightUv"), lightUv[0], lightUv[1]);
      g.uniform1f(g.getUniformLocation(godProg, "u_lightClipW"), clip[2]!);
      const c = god.color ?? [1, 0.96, 0.9];
      g.uniform3f(g.getUniformLocation(godProg, "u_color"), c[0]!, c[1]!, c[2]!);
      g.uniform1f(g.getUniformLocation(godProg, "u_intensity"), god.intensity ?? 0.7);
      g.uniform1f(g.getUniformLocation(godProg, "u_decay"), god.decay ?? 0.94);
      g.uniform1f(g.getUniformLocation(godProg, "u_weight"), god.weight ?? god.intensity ?? 0.7);
      g.uniform1f(g.getUniformLocation(godProg, "u_diskOuter"), 0.08);
      g.uniform1f(g.getUniformLocation(godProg, "u_diskInner"), 0.02);
    });
    // Additive blend onto the working HDR target.
    const blended = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const copyProg = program(state, gl, "v2-add", V2_ADD_GLSL);
    const blendTarget = asGlTarget(blended);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blendTarget.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.useProgram(copyProg);
    gl.bindVertexArray(state.vao);
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
  if (taaActive && temporal?.v2 && dilatedVelocity) {
    const taa = (pipeline.taa ?? {}) as Partial<TaaOptions>;
    const taaProg = program(state, gl, "taa-resolve", TAA_RESOLVE_GLSL);
    const resolved = temporal.historyOutput;
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
    draw(host, state, prefilterProg, asGlTarget(prefilter), [asGlTarget(hdr).colorHandle, asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(prefilterProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(prefilterProg, "u_linearDepth"), 1);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_focusDistance"), dof.focusDistance ?? 3);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_focalLengthMm"), dof.focalLengthMm ?? 50);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_fStop"), dof.fStop ?? 2.8);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_sensorHeightMm"), dof.sensorHeightMm ?? 24);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_frameHeightPx"), h);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_maxBlurPx"), maxBlur);
    });
    const tileW = Math.max(1, Math.ceil(dw / 8)), tileH = Math.max(1, Math.ceil(dh / 8));
    const nearTile = state.pool.acquire({ width: tileW, height: tileH, format: "rgba16f", samples: 1, depth: false });
    const tileProg = program(state, gl, "dof-near-tile", DOF_NEAR_TILE_GLSL);
    draw(host, state, tileProg, asGlTarget(nearTile), [asGlTarget(prefilter).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(tileProg, "u_prefilter"), 0);
    });
    const gather = state.pool.acquire({ width: dw, height: dh, format: "rgba16f", samples: 1, depth: false });
    const gatherSrc = `#define DOF_RINGS ${rings}\n` + DOF_GATHER_GLSL;
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
    const tileMax = state.pool.acquire({ width: tw, height: th, format: "rgba16f", samples: 1, depth: false });
    const tileProg = program(state, gl, `mb-tile-${tile}`, `#define MB_TILE_SIZE ${tile}\n` + MB_TILE_MAX_GLSL);
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
    // Apply: hdr *= exp2(ev) — the composite's autoExp factor, ahead of the
    // fused present's own §6.4 exposure (linear multipliers commute).
    const multiplied = state.pool.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const mulProg = program(state, gl, "exposure-mul", EXPOSURE_MUL_GLSL);
    draw(host, state, mulProg, asGlTarget(multiplied), [asGlTarget(hdr).colorHandle, asGlTarget(evWrite).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(mulProg, "u_hdr"), 0);
      g.uniform1i(g.getUniformLocation(mulProg, "u_ev"), 1);
    });
    if (hdr !== source) state.pool.release(hdr);
    hdr = multiplied;
  }

  // ── §6.1 insertion "before-tonemap" (linear HDR, exposure applied) ────────
  for (const pass of customsAt("before-tonemap")) {
    const out = runCustomPass(host, state, pass, hdr, { linZ: linZFull, velocity: dilatedVelocity }, camera, frameContext);
    if (out !== hdr) {
      if (hdr !== source) state.pool.release(hdr);
      hdr = out;
    }
  }

  state.timeSeconds += temporal?.v2?.frameTime ?? 1 / 60;
  if (dilatedVelocity) state.pool.release(dilatedVelocity);
  if (linZFull && linZOwnedByPool) state.pool.release(linZFull);
  if (minmaxHalf) state.pool.release(minmaxHalf);
  state.frameIndex += 1;
  // AO_INDIRECT_FRACTION_PENDING: the C-02 `prd03.indirectFraction` feature
  // is registered but generateProgram (lane 01) is still pending, so the
  // apply ran the §6.3 `u_aoFallbackStrength` path.
  return { target: hdr, aoPending: wantsAo, skipped };
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
  const vignette = pipeline.vignette as { intensity?: number; smoothness?: number; roundness?: number; color?: readonly [number, number, number] } | undefined;
  const grain = pipeline.filmGrain as { intensity?: number; size?: number; luminanceResponse?: number } | undefined;
  const aaFxaa = pipeline.antiAliasing === "fxaa";
  const aaSmaa = pipeline.antiAliasing === "smaa";
  const displayCustoms = mergedCustomPasses(pipeline).filter((pass) => pass.insertAt === "after-tonemap");
  const rcas = (pipeline.renderScale ?? 1) < 1 ? 0.2 : 0;

  // §6.1 fuse: FXAA + S10b + S12 in a single draw — only when nothing sits
  // between the stages (an after-tonemap custom pass splices S10b→S11).
  if (aaFxaa && displayCustoms.length === 0) {
    const prog = program(state, gl, "finalize-fxaa-fused", FINALIZE_FXAA_FUSED_GLSL);
    bindOut(gl, outTarget, w, h);
    gl.useProgram(prog);
    gl.bindVertexArray(state.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ldrGl.colorHandle);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, state.identityLut);
    gl.uniform1i(gl.getUniformLocation(prog, "u_source"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "u_lut3d"), 1);
    gl.uniform1i(gl.getUniformLocation(prog, "u_hasLut"), 0);
    gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform2f(gl.getUniformLocation(prog, "u_outputTexel"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(prog, "u_frame"), state.frameIndex);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainIntensity"), grain?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainSize"), grain?.size ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainLuminanceResponse"), grain?.luminanceResponse ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteIntensity"), vignette?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteSmoothness"), vignette?.smoothness ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteRoundness"), vignette?.roundness ?? 1);
    const vc = vignette?.color ?? [0, 0, 0];
    gl.uniform3f(gl.getUniformLocation(prog, "u_vignetteColor"), vc[0]!, vc[1]!, vc[2]!);
    gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return;
  }

  let current = ldr;
  // S10b — display grade (vignette; the .cube LUT bakes in with S10b's real
  // bake pass — until then u_hasLut stays 0 and the identity 3D tex binds).
  if (vignette || pipeline.lut) {
    const graded = state.pool.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const prog = program(state, gl, "display-grade", DISPLAY_GRADE_GLSL);
    draw(host, state, prog, asGlTarget(graded), [ldrGl.colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(prog, "u_source"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, state.identityLut);
      g.uniform1i(g.getUniformLocation(prog, "u_lut3d"), 1);
      g.uniform1i(g.getUniformLocation(prog, "u_hasLut"), 0);
      g.uniform1f(g.getUniformLocation(prog, "u_vignetteIntensity"), vignette?.intensity ?? 0);
      g.uniform1f(g.getUniformLocation(prog, "u_vignetteSmoothness"), vignette?.smoothness ?? 1);
      g.uniform1f(g.getUniformLocation(prog, "u_vignetteRoundness"), vignette?.roundness ?? 1);
      const vc = vignette?.color ?? [0, 0, 0];
      g.uniform3f(g.getUniformLocation(prog, "u_vignetteColor"), vc[0]!, vc[1]!, vc[2]!);
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
  bindOut(gl, outTarget, w, h);
  gl.useProgram(prog);
  gl.bindVertexArray(state.vao);
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
  if (current !== ldr) state.pool.release(current);
}

function bindOut(gl: WebGL2RenderingContext, outTarget: RenderTarget | undefined, w: number, h: number): void {
  if (outTarget) {
    const t = asGlTarget(outTarget);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
    gl.viewport(0, 0, t.width, t.height);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
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
