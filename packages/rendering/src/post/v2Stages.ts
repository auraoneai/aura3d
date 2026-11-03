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
import { getRenderAttachmentIdentity, RenderDeviceError, validateRenderAttachmentAccess, type RenderTarget } from "../RenderDevice";
import { reportShaderFailure, shaderFailureStoreFor } from "../ShaderFailures";
import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
  registeredPostPasses,
  validatePostPassSpace,
  type PostPassDescriptor,
  type PostPipelineOptions
} from "../contracts/post";
import type { FrameCamera, FrameContributorContext } from "../contracts/frameGraph";
import type { RenderItem } from "../ForwardPass";
import { getRenderTargetTextureOwner, type Texture } from "../Texture";
import { assertExpectedPreviousDepthBindingsCurrent, type TemporalGpuBindings } from "../TemporalHistory";
import { temporalCanAccumulate } from "../TemporalMath";
import { rendererQrFlags } from "../renderer/FrameGraph";
import { beginPostStageTrace, clearPostSkipped, markTaaHistoryWritten, recordPostSkipped, recordPostStage, registerNativePostEffectLifecycle, type NativePostEffectLifecycle } from "../renderer/postSkipped";
import type { PostDiagnosticToken } from "../renderer/PostDiagnosticsScope";
import { PostResources, type PostTargetLease } from "./PostResources";
import { PostScratchScope } from "./PostScratchScope";
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
import { FINALIZE_FXAA_FUSED_GLSL, FINALIZE_GLSL, FINALIZE_P3_GLSL } from "./shaders/finalize.glsl.js";
import { vignetteColorRgb } from "./vignetteColor.js";
import { VELOCITY_DILATE_GLSL } from "./shaders/velocityDilate.glsl.js";
import { NORMAL_FROM_DEPTH_GLSL } from "./shaders/normalReconstruct.glsl.js";
import { TAA_RESOLVE_GLSL, TAA_UPSCALE_GLSL } from "./shaders/taa.glsl.js";
import { DOF_COMPOSITE_GLSL, DOF_GATHER_GLSL, DOF_NEAR_TILE_GLSL, DOF_PREFILTER_GLSL } from "./shaders/dof.glsl.js";
import { MB_NEIGHBOR_GLSL, MB_RECONSTRUCT_GLSL, MB_TILE_MAX_GLSL } from "./shaders/motionBlur.glsl.js";
import { EXPOSURE_ADAPT_GLSL, EXPOSURE_LUMA_LOG_GLSL, EXPOSURE_MUL_GLSL, EXPOSURE_REDUCE_GLSL } from "./shaders/exposure.glsl.js";
import { HDR_GRADE_GLSL, resolveHdrGradeUniforms, type HdrGradeInput, type HdrGradeUniforms } from "./shaders/hdrGrade.glsl.js";
import { SSR_COMPOSITE_GLSL, SSR_DEFAULT_STEPS, SSR_DEFAULT_THICKNESS, SSR_TRACE_GLSL } from "./shaders/ssr.glsl.js";
import { SMAA_BLEND_GLSL, SMAA_EDGES_GLSL, SMAA_WEIGHTS_GLSL } from "./shaders/smaa.glsl.js";
import { FXAA_185_FRAGMENT_GLSL } from "./shaders/fxaa.glsl.js";
import { POST_INSERT_ANCHORS, PostViewHistory, type AutoExposureOptionsV2, type DofOptions, type GtaoOptions, type GodRayOptions, type LutTexture3D, type MotionBlurOptions, type TaaOptions } from "./PostGraph";
import { NATIVE_EFFECT_GLSL, validateNativePostEffect, type NativePostEffect } from "./NativeEffectShaders";
import { DisplayLutCache } from "./DisplayLutCache";
import { parseCubeLut } from "./CubeLut";
import { assertEncodedDisplaySurfaceWritten, type EncodedDisplaySurfaceLease } from "../output/EncodedDisplaySurface";

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

// A borrowed expected-depth texture must not become a write target anywhere
// in this invocation, including custom or nested post passes.
const postDrawGuards = new WeakMap<WebGL2DeviceHost, Set<(target: GlTarget) => void>>();

function assertPostDrawGuards(host: WebGL2DeviceHost, target: GlTarget): void {
  for (const guard of postDrawGuards.get(host) ?? []) guard(target);
}

function asGlTarget(target: RenderTarget): GlTarget {
  const t = target as unknown as GlTarget;
  if (!t.framebuffer || !t.colorHandle) {
    throw new RenderDeviceError("v2 post stages require WebGL2 render targets.", "POST_GRAPH_V2_UNSUPPORTED");
  }
  return t;
}

interface PostV2State {
  readonly device: WebGL2DeviceHost["device"];
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
  /** §8.14 lazy textures: kicked on first smaa frame, uploaded on arrival. */
  smaa: { area: WebGLTexture | null; search: WebGLTexture | null; requested: boolean };
  /** C-13 callbacks share data only within the same renderer/view/frame. */
  readonly legacyPostBlackboard: Map<string, unknown>;
  readonly tokenPostBlackboards: WeakMap<PostDiagnosticToken, Map<string, unknown>>;
  readonly scopedPostBlackboards: WeakMap<object, Map<string | number, { readonly frameId: number; readonly board: Map<string, unknown> }>>;
  readonly effectHistory: PostViewHistory<RenderTarget>;
  /** §8.9 EV surfaces belong to the renderer and view that produced them. */
  readonly exposureHistory: PostViewHistory<RenderTarget>;
  readonly legacyExposureScope: object;
  /** GU47 E-C (EC-2): uploaded user `.cube` LUTs, one TEXTURE_3D per source (LRU 4). */
  lutCache?: DisplayLutCache<WebGLTexture>;
  /** Own LUT handles individually so a failed deletion cannot repeat successful siblings. */
  readonly lutTextures: Set<WebGLTexture>;
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
function displayLutBinding(host: WebGL2DeviceHost, state: PostV2State, lut: unknown, token?: PostDiagnosticToken): PostLutBinding | null {
  if (!lut || typeof lut !== "object") return null;
  const bag = lut as PostLutBag;
  if (typeof bag.source !== "string" || (typeof bag.cube !== "string" && !bag.data)) {
    if (bag.status === "failed") clearPostSkipped(`LUT_PENDING:${String(bag.source)}`, token);
    recordPostSkipped(`${bag.status === "failed" ? "LUT_UNAVAILABLE" : "LUT_PENDING"}:${String(bag.source)}`, token);
    return null;
  }
  // The load settled: the first frames' `LUT_PENDING` no longer describes it.
  clearPostSkipped(`LUT_PENDING:${bag.source}`, token);
  if (state.lutFailed.has(bag.source)) return null;
  const gl = host.gl;
  state.lutCache ??= new DisplayLutCache<WebGLTexture>(
    () => {
      const baking = state.lutBaking!;
      const texture = uploadCubeLutTexture(gl, baking.data ?? parseCubeLut(baking.cube!));
      state.lutTextures.add(texture);
      return texture;
    },
    (texture) => {
      gl.deleteTexture(texture);
      state.lutTextures.delete(texture);
    },
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
    recordPostSkipped(`LUT_INVALID:${bag.source}:${code}`, token);
    return null;
  } finally {
    state.lutBaking = undefined;
  }
}

const states = new WeakMap<WebGL2DeviceHost, PostV2State>();

interface PostDisposalAction {
  readonly release: () => void;
  readonly history?: PostViewHistory<RenderTarget>;
}

interface PendingPostDisposal {
  readonly actions: Set<PostDisposalAction>;
  running: boolean;
}

/** A failed initialization whose native rollback can be retried independently. */
export class PostV2InitializationRollbackError extends AggregateError {
  constructor(initialError: unknown, cleanupErrors: readonly unknown[], readonly retryCleanup: () => void) {
    super([initialError, ...cleanupErrors], "v2 post initialization rollback failed", { cause: initialError });
    this.name = "PostV2InitializationRollbackError";
  }
}

// Active state is detached immediately, but failed releases must outlive it.
// Keeping these per host also permits a restored host to install a new state
// without losing the old generation's remaining cleanup.
const pendingPostDisposals = new WeakMap<WebGL2DeviceHost, PendingPostDisposal>();
const initializingPostStates = new WeakMap<WebGL2DeviceHost, { invalidated: boolean }>();
const postLifecycles = new WeakMap<WebGL2DeviceHost, NativePostEffectLifecycle>();

function registerV2Lifecycle(host: WebGL2DeviceHost): void {
  let lifecycle = postLifecycles.get(host);
  if (!lifecycle) {
    lifecycle = {
      cleanupOwner: host,
      releaseView: (scopeId, viewId) => releaseNativePostEffectView(host, scopeId, viewId),
      releaseScope: scopeId => releaseNativePostEffectScope(host, scopeId),
      dispose: () => disposeNativePostEffects(host)
    };
    postLifecycles.set(host, lifecycle);
  }
  registerNativePostEffectLifecycle(host, lifecycle);
}

function pendingPostDisposal(host: WebGL2DeviceHost): PendingPostDisposal {
  let cleanup = pendingPostDisposals.get(host);
  if (!cleanup) {
    cleanup = { actions: new Set(), running: false };
    pendingPostDisposals.set(host, cleanup);
  }
  return cleanup;
}

function runPostDisposals(
  host: WebGL2DeviceHost, cleanup: PendingPostDisposal, actions: Iterable<PostDisposalAction>,
  after?: (errors: unknown[]) => void
): unknown[] {
  const errors: unknown[] = [];
  // A nested rollback queues its actions for the outer Set iteration, but
  // still has to invalidate the cache and preserve lifecycle ownership.
  if (cleanup.running) {
    after?.(errors);
    return errors;
  }
  // A targeted rollback must not retry older failed generations, but actions
  // enqueued by a reentrant setup/disposal belong to this same cleanup pass.
  const selected = new Set(actions);
  const older = new Set([...cleanup.actions].filter(action => !selected.has(action)));
  cleanup.running = true;
  try {
    for (const action of cleanup.actions) {
      if (older.has(action)) continue;
      try { action.release(); cleanup.actions.delete(action); } catch (error) { errors.push(error); }
    }
    after?.(errors);
  } finally {
    cleanup.running = false;
    if (cleanup.actions.size === 0 && pendingPostDisposals.get(host) === cleanup) pendingPostDisposals.delete(host);
  }
  return errors;
}

function retryPostInitializationCleanup(host: WebGL2DeviceHost, allocated: readonly PostDisposalAction[]): void {
  const cleanup = pendingPostDisposals.get(host);
  if (!cleanup) return;
  if (cleanup.running) throw new Error("POSTPROCESS_CLEANUP_IN_PROGRESS");
  const errors = runPostDisposals(host, cleanup, allocated, errors => {
    // A retry callback can itself reenter host disposal, which may have
    // retired another generation and consumed its lifecycle registration.
    if (pendingPostDisposals.get(host)?.actions.size) {
      try { registerV2Lifecycle(host); } catch (error) { errors.push(error); }
    }
  });
  if (errors.length) throw new AggregateError(errors, "v2 post initialization cleanup retry failed");
}

function v2State(host: WebGL2DeviceHost): PostV2State {
  const current = states.get(host);
  if (current) return current;
  if (initializingPostStates.has(host)) throw new Error("POSTPROCESS_STATE_INITIALIZING");
  const gl = host.gl;
  const device = host.device;
  const initialization = { invalidated: false };
  const allocated: PostDisposalAction[] = [];
  let generation: number | undefined;
  initializingPostStates.set(host, initialization);
  const assertInitializing = (): void => {
    if (initialization.invalidated || initializingPostStates.get(host) !== initialization
        || states.has(host) || host.gl !== gl || host.device !== device) {
      throw new Error("POSTPROCESS_STATE_INVALIDATED");
    }
    if (host.disposed || device.disposed) {
      throw new RenderDeviceError("Cannot initialize post resources on a disposed device.", "DISPOSED_DEVICE");
    }
    if (host.contextLost || device.contextLost || device.isDeviceLost?.()) {
      throw new RenderDeviceError("Cannot initialize post resources while the device is lost.", "CONTEXT_LOST");
    }
    // Device status/generation getters can themselves dispose or replace the host.
    if (device.generation !== generation || initialization.invalidated
        || initializingPostStates.get(host) !== initialization || host.gl !== gl || host.device !== device) {
      throw new Error("POSTPROCESS_STATE_INVALIDATED");
    }
  };
  const step = (operation: () => void): void => { operation(); assertInitializing(); };
  try {
    // The host must know about this generation before any native handle can
    // escape, including while a GL call synchronously reenters disposal.
    registerV2Lifecycle(host);
    generation = device.generation;
    assertInitializing();
    const vao = gl.createVertexArray();
    if (vao) allocated.push({ release: () => gl.deleteVertexArray(vao) });
    assertInitializing();
    if (!vao) {
      throw new RenderDeviceError("v2 post stage GL object allocation failed.", "POST_GRAPH_V2_UNSUPPORTED");
    }
    const identityLut = gl.createTexture();
    if (identityLut) allocated.push({ release: () => gl.deleteTexture(identityLut) });
    assertInitializing();
    if (!identityLut) {
      throw new RenderDeviceError("v2 post stage GL object allocation failed.", "POST_GRAPH_V2_UNSUPPORTED");
    }
    step(() => gl.bindTexture(gl.TEXTURE_3D, identityLut));
    const size = 4;
    const identity = new Uint8Array(size * size * size * 4);
    for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
      const i = ((b * size + g) * size + r) * 4;
      identity[i] = Math.round((r / (size - 1)) * 255);
      identity[i + 1] = Math.round((g / (size - 1)) * 255);
      identity[i + 2] = Math.round((b / (size - 1)) * 255);
      identity[i + 3] = 255;
    }
    step(() => gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, identity));
    step(() => gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR));
    step(() => gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR));
    step(() => gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE));
    step(() => gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE));
    step(() => gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE));
    step(() => gl.bindTexture(gl.TEXTURE_3D, null));
    const blankTex = gl.createTexture();
    if (blankTex && blankTex !== identityLut) allocated.push({ release: () => gl.deleteTexture(blankTex) });
    assertInitializing();
    if (blankTex) {
      step(() => gl.bindTexture(gl.TEXTURE_2D, blankTex));
      step(() => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0])));
      step(() => gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST));
      step(() => gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST));
      step(() => gl.bindTexture(gl.TEXTURE_2D, null));
    }
    const pool = new PostResources(device, rendererQrFlags(device));
    allocated.push({ release: () => pool.dispose() });
    assertInitializing();
    const state: PostV2State = {
      device,
      programs: new Map(),
      vao,
      pool,
      identityLut,
      blankTex: blankTex ?? identityLut,
      frameIndex: 0,
      legacyPostBlackboard: new Map(),
      tokenPostBlackboards: new WeakMap(),
      scopedPostBlackboards: new WeakMap(),
      effectHistory: new PostViewHistory(),
      exposureHistory: new PostViewHistory(),
      legacyExposureScope: {},
      timeSeconds: 0,
      smaa: { area: null, search: null, requested: false },
      lutTextures: new Set(),
      lutFailed: new Set()
    };
    assertInitializing();
    states.set(host, state);
    return state;
  } catch (error) {
    const cleanup = allocated.length ? pendingPostDisposal(host) : pendingPostDisposals.get(host);
    if (cleanup) for (const action of allocated) cleanup.actions.add(action);
    // Do not retry older generations merely because this initialization
    // failed. If another cleanup is already running, its live Set iteration
    // will visit these newly retired actions once.
    const finishRollback = (errors: unknown[]): void => {
      // Initialization binds raw GL textures before the normal stage driver's
      // cache invalidation. A failed upload must not leave those shadows trusted.
      if (allocated.length) {
        try { host.stateCache?.invalidate(); } catch (cacheError) { errors.push(cacheError); }
      }
      if (initialization.invalidated && pendingPostDisposals.get(host)?.actions.size) {
        // Reentrant host disposal may have consumed the earlier registration
        // before a create call returned its handle.
        try { registerV2Lifecycle(host); } catch (registrationError) { errors.push(registrationError); }
      }
    };
    const errors = cleanup ? runPostDisposals(host, cleanup, allocated, finishRollback) : [];
    if (errors.length) {
      throw new PostV2InitializationRollbackError(error, errors, () => retryPostInitializationCleanup(host, allocated));
    }
    throw error;
  } finally {
    if (initializingPostStates.get(host) === initialization) initializingPostStates.delete(host);
  }
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

/**
 * GU47 E-C (EC-6): S3 options from `pipeline.ssr`: `intensity` (default
 * 0.9, [0, 2]), `maxDistance` metres (18, [0.5, 200]), `roughness` hint
 * (0; the trace fades out between 0.35 and the 0.5 cutoff), `thickness`
 * metres (0.25) and march `steps` snapped to 16 | 24 | 32 (24).
 */
export function resolveSsrOptions(ssr: unknown): { readonly intensity: number; readonly maxDistance: number; readonly roughness: number; readonly thickness: number; readonly steps: 16 | 24 | 32 } {
  const bag = (ssr && typeof ssr === "object" ? ssr : {}) as Record<string, unknown>;
  const num = (key: string, fallback: number, min: number, max: number): number => {
    const value = bag[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const steps = num("steps", SSR_DEFAULT_STEPS, 1, 64);
  return {
    intensity: num("intensity", 0.9, 0, 2),
    maxDistance: num("maxDistance", 18, 0.5, 200),
    roughness: num("roughness", 0, 0, 1),
    thickness: num("thickness", SSR_DEFAULT_THICKNESS, 0.01, 10),
    steps: steps <= 16 ? 16 : steps <= 24 ? 24 : 32
  };
}

/** GU47 E-C (EC-8): S4 `u_density` — the authored god-ray density clamped to [0.05, 1]; omitted or invalid = 1 (full march). */
export function godRayDensity(density: unknown): number {
  return typeof density === "number" && Number.isFinite(density) ? Math.min(1, Math.max(0.05, density)) : 1;
}

/** GU47 phase 2: S4 `u_medium` — the shaft medium per metre clamped to [0, 1]; omitted or invalid = 0 (no depth scaling). */
export function godRayMedium(medium: unknown): number {
  return typeof medium === "number" && Number.isFinite(medium) ? Math.min(1, Math.max(0, medium)) : 0;
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
        "The post stage falls back to the legacy chain; the failing pass is not applied.",
        shaderFailureStoreFor(state.device)
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
      "The post stage falls back to the legacy chain; the failing pass is not applied.",
      shaderFailureStoreFor(state.device)
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

function draw(host: WebGL2DeviceHost, state: PostV2State, prog: WebGLProgram, target: GlTarget, textures: readonly WebGLTexture[], uniforms: (gl: WebGL2RenderingContext) => void, beforeSubmit?: () => void): void {
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
  try {
    uniforms(gl);
    assertPostStateCurrent(host, state, target);
    beforeSubmit?.();
    assertPostDrawGuards(host, target);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } catch (error) {
    host.stateCache.invalidate();
    throw error;
  } finally {
    for (let i = 0; i < textures.length; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.bindVertexArray(null);
  }
}

function assertPostStateCurrent(host: WebGL2DeviceHost, state: PostV2State, target: GlTarget): void {
  if (states.get(host) !== state || state.device !== host.device || host.device.disposed || host.device.contextLost
      || (target as GlTarget & { readonly disposed?: boolean }).disposed) {
    throw new Error("POSTPROCESS_STATE_INVALIDATED");
  }
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
 * `u_time`, and (when requested) `u_reactive` and `u_normal`). `u_normal`
 * holds unit view-space normals reconstructed from this frame's linear depth
 * in `.xyz` and surface coverage in `.w` (0 on cleared pixels). The pass declares only its
 * own uniforms + a `main()`; it must NOT redeclare the built-ins, `#version`,
 * or `precision`.
 */
export function customPassFragmentSource(glsl: string, reactive = false, normal = false): string {
  return `#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_depthLinear;
uniform sampler2D u_velocity;
${reactive ? "uniform highp sampler2D u_reactive;\n" : ""}${normal ? "uniform highp sampler2D u_normal;\n" : ""}uniform vec2 u_texelSize;
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
export function mergedCustomPasses(pipeline: PostPipelineOptions, token?: PostDiagnosticToken, postScopeId?: object): readonly PostPassDescriptor[] {
  const seen = new Set<string>();
  const out: PostPassDescriptor[] = [];
  for (const pass of [...(pipeline.customPasses ?? []), ...registeredPostPasses()]) {
    if (pass.postScopeMatches?.(postScopeId ?? token?.scopeId) === false) continue;
    if (seen.has(pass.id)) continue;
    seen.add(pass.id);
    try {
      validatePostPassSpace(pass);
    } catch {
      recordPostSkipped(`POSTPROCESS_SPACE_INVALID:${pass.id}`, token);
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

function customPassBlackboard(state: PostV2State, bag: PostFrameContextBag | undefined): Map<string, unknown> {
  if (bag?.diagnosticToken) {
    let board = state.tokenPostBlackboards.get(bag.diagnosticToken);
    if (!board) { board = new Map(); state.tokenPostBlackboards.set(bag.diagnosticToken, board); }
    return board;
  }
  if (!bag?.scopeId || bag.viewId === undefined || !Number.isSafeInteger(bag.frameId) || bag.frameId! < 0) return state.legacyPostBlackboard;
  let views = state.scopedPostBlackboards.get(bag.scopeId);
  if (!views) { views = new Map(); state.scopedPostBlackboards.set(bag.scopeId, views); }
  let frame = views.get(bag.viewId);
  if (!frame || frame.frameId !== bag.frameId) {
    frame = { frameId: bag.frameId!, board: new Map() };
    views.set(bag.viewId, frame);
  }
  return frame.board;
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
    frameIndex: bag?.frameId ?? state.frameIndex,
    postScopeId: bag?.scopeId,
    timeSeconds: bag?.timeSeconds ?? state.timeSeconds,
    camera: camera ?? null,
    source: bag?.source ?? {},
    items: bag?.items ?? [],
    tier: QUALITY_TIERS.high,
    flags: rendererQrFlags(host.device),
    sceneDepth: bag?.sceneDepth ?? {
      texture: null,
      available: false,
      linearize: { near: camera?.near ?? 0.1, far: camera?.far ?? 1000, orthographic: camera?.projection === "orthographic" }
    },
    blackboard: customPassBlackboard(state, bag)
  } as unknown as FrameContributorContext;
}

/** The target is borrowed; the snapshot only protects this execution's handles and frame. */
interface CustomReactiveInput {
  readonly bindings: TemporalGpuBindings;
  readonly v2: NonNullable<TemporalGpuBindings["v2"]>;
  readonly target: RenderTarget;
  readonly texture: Texture;
  readonly handle: WebGLTexture;
  readonly width: number;
  readonly height: number;
  readonly device: WebGL2DeviceHost["device"];
  readonly generation: number | undefined;
  readonly frameToken: object | null | undefined;
  readonly context?: PostFrameContextBag;
  readonly scopeId?: object;
  readonly viewId?: string | number;
  readonly frameId?: number;
  readonly contextGeneration?: string | number;
}

function captureCustomReactiveInput(host: WebGL2DeviceHost, bindings: TemporalGpuBindings | undefined,
  width: number, height: number, context?: PostFrameContextBag): CustomReactiveInput | undefined {
  const v2 = bindings?.v2, target = v2?.reactive;
  if (!bindings || !v2 || !target) return undefined;
  return {
    bindings, v2, target, texture: target.colorTexture, handle: (target as unknown as GlTarget).colorHandle,
    width, height, device: host.device, generation: host.device.generation, frameToken: host.device.activeFrameToken,
    context, scopeId: context?.scopeId, viewId: context?.viewId, frameId: context?.frameId,
    contextGeneration: context?.deviceGeneration
  };
}

/** Validate before allocating and again after callbacks, including delayed bloom execution. */
function assertCustomReactiveInput(host: WebGL2DeviceHost, input: CustomReactiveInput | undefined,
  passId: string, output?: RenderTarget): void {
  const invalid = (reason: string): never => {
    throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${passId}:reactive:${reason}`);
  };
  if (!input) return invalid("missing");
  const { target, texture, handle, context } = input;
  if (!input.frameToken || input.generation === undefined || !Number.isSafeInteger(input.generation) || input.generation < 0
      || input.device !== host.device || host.device.disposed || host.device.contextLost
      || host.device.generation !== input.generation || host.device.activeFrameToken !== input.frameToken
      || input.bindings.v2 !== input.v2 || input.v2.reactive !== target
      || (context && (context.scopeId !== input.scopeId || context.viewId !== input.viewId || context.frameId !== input.frameId
        || context.deviceGeneration !== input.contextGeneration))) return invalid("stale-frame");
  if (!texture || !handle || target.disposed || texture.disposed || target.colorTexture !== texture
      || (target as unknown as GlTarget).colorHandle !== handle || target.width !== input.width || target.height !== input.height
      || (target.dimension ?? "2d") !== "2d" || texture.dimension !== "2d"
      || getRenderTargetTextureOwner(texture) !== host.device || host.textureRegistry?.textures.get(texture) !== handle) return invalid("attachment");
  let attachment: ReturnType<typeof getRenderAttachmentIdentity>;
  try { attachment = getRenderAttachmentIdentity(target); } catch { return invalid("attachment"); }
  if (attachment.texture !== texture || attachment.mipLevel !== 0 || attachment.layer !== 0 || attachment.sampleCount !== 1
      || !texture.usage.includes("sampled") || texture.colorSpace !== "linear"
      || (attachment.format !== "rgba8" && attachment.format !== "rgba16f" && attachment.format !== "rgba32f")) return invalid("attachment");
  if (output) {
    if (output === target || (output as unknown as GlTarget).colorHandle === handle) return invalid("alias");
    try { validateRenderAttachmentAccess([attachment], [getRenderAttachmentIdentity(output)]); }
    catch { return invalid("alias"); }
  }
}

interface ExpectedDepthInput {
  readonly bindings: TemporalGpuBindings;
  readonly target: RenderTarget;
  readonly texture: Texture;
  readonly handle: WebGLTexture;
  readonly width: number;
  readonly height: number;
  readonly context?: PostFrameContextBag;
  readonly scopeId?: object;
  readonly viewId?: string | number;
  readonly frameId?: number;
  readonly contextGeneration?: string | number;
  readonly reactive?: CustomReactiveInput;
}

function captureExpectedDepthInput(host: WebGL2DeviceHost, bindings: TemporalGpuBindings | undefined,
  width: number, height: number, context?: PostFrameContextBag): ExpectedDepthInput | undefined {
  if (!bindings || !assertExpectedPreviousDepthBindingsCurrent(bindings, host.device, width, height, context)) return undefined;
  const target = bindings.velocity;
  return { bindings, target, texture: target.colorTexture, handle: (target as unknown as GlTarget).colorHandle,
    width, height, context, scopeId: context?.scopeId, viewId: context?.viewId,
    frameId: context?.frameId, contextGeneration: context?.deviceGeneration,
    ...(bindings.v2?.reactive ? { reactive: captureCustomReactiveInput(host, bindings, width, height, context) } : {}) };
}

/** The caller retains ownership; require the exact native handle through submission. */
function assertExpectedDepthInput(host: WebGL2DeviceHost, input: ExpectedDepthInput, others: readonly RenderTarget[] = []): void {
  const invalid = (): never => { throw new RenderDeviceError("Expected previous depth attachment is stale or aliases another pass", "TEMPORAL_EXPECTED_DEPTH_STALE"); };
  const { bindings, target, texture, handle, context } = input;
  if (!assertExpectedPreviousDepthBindingsCurrent(bindings, host.device, input.width, input.height, context) ||
      !handle || target.colorTexture !== texture || (target as unknown as GlTarget).colorHandle !== handle ||
      host.textureRegistry?.textures.get(texture) !== handle || getRenderTargetTextureOwner(texture) !== host.device ||
      (context && (context.scopeId !== input.scopeId || context.viewId !== input.viewId || context.frameId !== input.frameId ||
        context.deviceGeneration !== input.contextGeneration))) return invalid();
  const attachment = getRenderAttachmentIdentity(target);
  if (input.reactive) {
    try { assertCustomReactiveInput(host, input.reactive, "expected-depth"); } catch { return invalid(); }
  }
  for (const other of others) {
    if (other === target || (other as unknown as GlTarget).colorHandle === handle) return invalid();
    try {
      validateRenderAttachmentAccess([attachment], [getRenderAttachmentIdentity(other)]);
      if (input.reactive && other !== input.reactive.target) assertCustomReactiveInput(host, input.reactive, "expected-depth", other);
    }
    catch { return invalid(); }
  }
}

interface CustomPassAuxiliary {
  readonly linZ?: RenderTarget | null;
  /** View-space normals reconstructed from `linZ` for this view and frame. */
  readonly normal?: RenderTarget | null;
  readonly velocity?: RenderTarget | null;
  readonly reactive?: CustomReactiveInput;
}

/**
 * Runs one C-13 pass over `input` into a pooled target of the pass's space
 * format. Auxiliary surfaces bind only when declared and available.
 */
function runCustomPass(
  host: WebGL2DeviceHost,
  state: PostV2State,
  scratch: PostScratchScope,
  pass: PostPassDescriptor,
  input: RenderTarget,
  aux: CustomPassAuxiliary,
  camera: FrameCamera | null | undefined,
  bag?: PostFrameContextBag
): PostTargetLease | null {
  return runCustomPassOnTexture(host, state, scratch, pass, asGlTarget(input), aux, camera, bag);
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
  scratch: PostScratchScope,
  pass: PostPassDescriptor,
  input: PostColorInput,
  aux: CustomPassAuxiliary,
  camera: FrameCamera | null | undefined,
  bag?: PostFrameContextBag
): PostTargetLease | null {
  const gl = host.gl;
  const frame = customPassFrameContext(state, host, input.width, input.height, camera, bag);
  if (pass.enabled && !pass.enabled(frame)) return null;
  if (!pass.fragment?.glsl?.trim()) throw new Error(`POSTPROCESS_SHADER_UNAVAILABLE:${pass.id}:webgl2`);
  for (const required of pass.inputs) {
    if ((required === "depth" && !aux.linZ) || (required === "velocity" && !aux.velocity)
        || (required === "normal" && !aux.normal) || (required === "reactive" && !aux.reactive)) {
      throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:${required}`);
    }
  }
  const wantsDepth = pass.inputs.includes("depth");
  const wantsVelocity = pass.inputs.includes("velocity");
  const wantsReactive = pass.inputs.includes("reactive");
  const wantsNormal = pass.inputs.includes("normal");
  if (wantsReactive) assertCustomReactiveInput(host, aux.reactive, pass.id);
  recordPostStage(`custom:${pass.id}@${pass.insertAt}`, bag?.diagnosticToken);
  const lease = scratch.acquire({
    width: input.width,
    height: input.height,
    format: pass.space === "display" ? "rgba8" : "rgba16f",
    samples: 1,
    depth: false
  });
  const target = lease.target;
  try {
    if (wantsReactive) assertCustomReactiveInput(host, aux.reactive, pass.id, target);
    // A pass name may be released and later registered with different source,
    // including by another renderer sharing this host. Never reuse its old program.
    const prog = program(state, gl, `${wantsReactive ? "custom-reactive" : "custom"}${wantsNormal ? "-normal" : ""}:${pass.id}:${pass.fragment.glsl}`, customPassFragmentSource(pass.fragment.glsl, wantsReactive, wantsNormal));
    const textures: WebGLTexture[] = [
      input.colorHandle,
      wantsDepth && aux.linZ ? asGlTarget(aux.linZ).colorHandle : state.blankTex,
      wantsVelocity && aux.velocity ? asGlTarget(aux.velocity).colorHandle : state.blankTex
    ];
    if (wantsReactive) textures.push(aux.reactive!.handle);
    const normalUnit = textures.length;
    if (wantsNormal) textures.push(asGlTarget(aux.normal!).colorHandle);
    draw(host, state, prog, asGlTarget(target), textures, (g) => {
      g.uniform1i(g.getUniformLocation(prog, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(prog, "u_depthLinear"), 1);
      g.uniform1i(g.getUniformLocation(prog, "u_velocity"), 2);
      if (wantsReactive) g.uniform1i(g.getUniformLocation(prog, "u_reactive"), 3);
      if (wantsNormal) g.uniform1i(g.getUniformLocation(prog, "u_normal"), normalUnit);
      g.uniform2f(g.getUniformLocation(prog, "u_texelSize"), 1 / input.width, 1 / input.height);
      g.uniform1f(g.getUniformLocation(prog, "u_time"), frame.timeSeconds);
      const declared = pass.uniforms?.(frame);
      assertPostStateCurrent(host, state, asGlTarget(target));
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
    }, wantsReactive ? () => {
      if (!pass.inputs.includes("reactive")) throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:reactive:changed-pass`);
      assertCustomReactiveInput(host, aux.reactive, pass.id, target);
    } : undefined);
    return lease;
  } catch (error) {
    try { scratch.release(lease); } catch { /* Preserve the pass failure. */ }
    throw error;
  }
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
  /** Stable app/renderer identity, view identity and authored frame number. */
  readonly scopeId?: object;
  readonly viewId?: string | number;
  readonly frameId?: number;
  readonly timeSeconds?: number;
  /** Exact frame token, captured before any asynchronous post work. */
  readonly diagnosticToken?: PostDiagnosticToken;
  readonly cameraCut?: boolean;
  readonly deviceGeneration?: string | number;
  readonly sceneDepth: {
    readonly texture: Texture | null;
    readonly available: boolean;
    readonly linearize: {
      readonly near: number; readonly far: number; readonly orthographic: boolean;
      readonly depth?: { readonly mode: "standard" | "reversed" | "logarithmic"; readonly clipRange: "minus-one-to-one" | "zero-to-one" };
      readonly projectionMatrixInverse?: Float32Array;
    };
  };
}

type PostDepthConvention = { readonly mode: "standard" | "reversed" | "logarithmic"; readonly clipRange: "minus-one-to-one" | "zero-to-one" };

/** Depth decoding is determined by projection and clip convention, not by near/far alone. */
function writeDepthUniforms(gl: WebGL2RenderingContext, prog: WebGLProgram, settings: {
  readonly near: number; readonly far: number; readonly orthographic: boolean;
  readonly depth?: PostDepthConvention; readonly projectionMatrixInverse?: Float32Array;
}): void {
  const { near, far, orthographic, depth } = settings;
  if (!Number.isFinite(near) || (!orthographic && near <= 0) || !(far > near)
      || (far !== Infinity && !Number.isFinite(far)) || (orthographic && !Number.isFinite(far))
      || (depth?.mode === "logarithmic" && (near <= 0 || !Number.isFinite(far)))) {
    throw new Error("POSTPROCESS_DEPTH_RANGE_INVALID");
  }
  let inverse = settings.projectionMatrixInverse;
  if (!inverse) {
    // Legacy callers did not supply projection metadata. The z/w portion of
    // an ordinary GL projection is enough to reconstruct view-space depth.
    if (depth && (depth.mode !== "standard" || depth.clipRange !== "minus-one-to-one")) {
      throw new Error("POSTPROCESS_PROJECTION_INVERSE_UNAVAILABLE");
    }
    const a = Number.isFinite(far) ? -(far + near) / (far - near) : -1;
    const b = Number.isFinite(far) ? -2 * far * near / (far - near) : -2 * near;
    if (orthographic && !Number.isFinite(far)) throw new Error("POSTPROCESS_PROJECTION_INVERSE_UNAVAILABLE");
    const matrix = orthographic
      ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]
      : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, a, -1, 0, 0, b, 0];
    inverse = Float32Array.from(invertMat4(matrix as unknown as Mat4));
  }
  if (inverse.length !== 16 || !inverse.every(Number.isFinite)) throw new Error("POSTPROCESS_PROJECTION_INVERSE_INVALID");
  gl.uniform1f(gl.getUniformLocation(prog, "u_near"), near);
  gl.uniform1f(gl.getUniformLocation(prog, "u_far"), Number.isFinite(far) ? far : 3e38);
  gl.uniform1i(gl.getUniformLocation(prog, "u_ortho"), orthographic ? 1 : 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(prog, "u_invProjMatrix"), false, inverse);
  gl.uniform1i(gl.getUniformLocation(prog, "u_clipRangeZeroToOne"), depth?.clipRange === "zero-to-one" ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(prog, "u_depthMode"), depth?.mode === "reversed" ? 1 : depth?.mode === "logarithmic" ? 2 : 0);
}

/** Load generated lookup bytes lazily and upload both textures atomically. */
let smaaTexturesLoad: Promise<void> | null = null;

/**
 * 03-S18a: settles once the in-flight SMAA area/search texture load (if any)
 * finished, so a probe can wait for S11 to be active instead of guessing a
 * frame count. Resolves immediately when no load was started.
 */
export function smaaTexturesSettled(): Promise<void> {
  return smaaTexturesLoad ?? Promise.resolve();
}

function smaaTexturesReady(host: WebGL2DeviceHost, state: PostV2State, token?: PostDiagnosticToken): boolean {
  const gl = host.gl;
  if (state.smaa.area && state.smaa.search) return true;
  if (!state.smaa.requested) {
    state.smaa.requested = true;
    smaaTexturesLoad = import("./smaa/textures.js").then((mod) => {
      let area: WebGLTexture | null = null;
      let search: WebGLTexture | null = null;
      try {
        if (states.get(host) !== state || host.disposed || host.contextLost) return;
        const upload = (pixels: Uint8Array, filter: number): WebGLTexture => {
          const tex = gl.createTexture();
          if (!tex) throw new Error("SMAA_TEXTURE_ALLOCATION_FAILED");
          try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, pixels.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, pixels);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindTexture(gl.TEXTURE_2D, null);
          return tex;
          } catch (error) {
            gl.deleteTexture(tex);
            throw error;
          }
        };
        area = upload(mod.generateSmaaAreaData(), gl.LINEAR);
        search = upload(mod.generateSmaaSearchData(), gl.NEAREST);
        state.smaa.area = area;
        state.smaa.search = search;
        // T0-16: the raw binds above bypass host.stateCache.
        host.stateCache.invalidate();
      } catch {
        if (area) gl.deleteTexture(area);
        if (search) gl.deleteTexture(search);
        state.smaa.area = null;
        state.smaa.search = null;
        state.smaa.requested = false;
        recordPostSkipped("POSTPROCESS_INPUT_UNAVAILABLE:smaa:lookup", token);
      } finally {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        host.stateCache.invalidate();
      }
    }).catch(() => {
      state.smaa.requested = false;
      recordPostSkipped("POSTPROCESS_INPUT_UNAVAILABLE:smaa:lookup", token);
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
  /** Presenters defer promotion until their complete output chain succeeds. */
  readonly deferExposureCommit?: boolean;
  /** Transfer a pooled HDR output to a token owner until presentation completes. */
  readonly retainOutputLease?: boolean;
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
): { readonly target: RenderTarget; readonly aoPending: boolean; readonly skipped: readonly string[]; readonly afterBloom?: DeferredAfterBloomStage;
  readonly outputLease?: PostTargetLease;
  readonly exposureCompletion?: { readonly commit: () => void; readonly abort: () => void } } {
  const diagnosticToken = frameContext?.diagnosticToken;
  const recordStage = (stage: string): void => recordPostStage(stage, diagnosticToken);
  const recordSkipped = (reason: string): void => recordPostSkipped(reason, diagnosticToken);
  const wantsAo = Boolean(pipeline.ao);
  const wantsGodRays = Boolean(pipeline.godRays);
  const wantsCa = Boolean(pipeline.chromaticAberration && (pipeline.chromaticAberration as { intensity?: number }).intensity);
  const wantsTaa = pipeline.antiAliasing === "taa" || Boolean(pipeline.taa);
  const wantsDof = Boolean(pipeline.dof);
  const wantsMb = Boolean(pipeline.motionBlur);
  // GU47 E-C (EC-6): S3 SSR runs only for an authored screenSpaceReflections node.
  const wantsSsr = Boolean(pipeline.ssr);
  // Phase 6: S8 auto-exposure + C-13 HDR-domain custom passes at their §6.1
  // insertion anchors (`after-tonemap` runs in the LDR tail instead).
  const autoExposure = pipeline.autoExposure as AutoExposureOptionsV2 | false | undefined;
  const wantsAutoExposure = autoExposure !== undefined && autoExposure !== false;
  // GU47 E-C: the linear grade (white balance, lift/gamma/gain, shadows/
  // midtones/highlights). Identity → null → no draw (byte-identical frames).
  const gradeUniforms = resolveHdrGradeUniforms(pipeline.grade as HdrGradeInput | undefined);
  const wantsGrade = gradeUniforms !== null;
  const customs = mergedCustomPasses(pipeline, diagnosticToken, frameContext?.scopeId);
  const customsAt = (anchor: PostPassDescriptor["insertAt"]): readonly PostPassDescriptor[] =>
    sortCustomPassesAtAnchor(customs, anchor);
  const hdrCustoms = customs.filter((pass) => pass.insertAt !== "after-tonemap");
  // Capture the caller's mask once, before custom callbacks or a deferred
  // bloom handoff can replace it. This cannot establish its pixel provenance.
  const reactivePass = hdrCustoms.find((pass) => pass.inputs.includes("reactive"));
  const customReactive = reactivePass
    ? captureCustomReactiveInput(host, temporal, source.width, source.height, frameContext)
    : undefined;
  const expectedDepth = captureExpectedDepthInput(host, temporal, source.width, source.height, frameContext);
  // Exact previous linear depth in velocity.a: a validated borrowed input, or
  // the view's own renderer-owned motion pass.
  const exactPreviousDepth = Boolean(expectedDepth) || temporal?.v2?.previousDepth === "object-velocity";
  const assertExpectedDepth = (outputs: readonly RenderTarget[] = []): void => {
    if (expectedDepth) assertExpectedDepthInput(host, expectedDepth, outputs);
  };
  if (expectedDepth && temporal?.v2) {
    assertExpectedDepth([source, temporal.history, temporal.historyOutput, temporal.v2.linZ, temporal.v2.linZOutput,
      ...(temporal.v2.reactive ? [temporal.v2.reactive] : [])]);
  }
  // TAA and motion blur silently degrade without temporal surfaces; the
  // engine-side AA resolve already reported the coverage fallback.
  const skipped: string[] = [];
  const temporalOk = Boolean(temporal?.v2);
  const reconstruction = temporal?.v2?.reconstruction ?? "spatial";
  const temporalInputsOk = reconstruction !== "temporal" || Boolean(temporal?.v2?.reactive && temporal.v2.motionSource === "object");
  const taaActive = wantsTaa && temporalOk && temporalInputsOk;
  const mbActive = wantsMb && temporalOk;
  beginPostStageTrace(diagnosticToken);
  recordStage(`enter:taa=${String(wantsTaa)}:mb=${String(wantsMb)}:temporal=${String(temporalOk)}`);
  // GU47 E-C stage trace: S9 bloom executes inside the fused present right
  // after this driver returns. The executor sets `deferBeforeTonemap` exactly
  // when its pass list carries an HDR bloom pass (LegacyPost
  // `executePostGraphWebGL2`), so that flag — not the authored bag — records it.
  if (options?.deferBeforeTonemap) recordStage(`S9:bloom${bloomMipsTag(pipeline.bloom)}`);
  if (wantsTaa && !temporalOk) { skipped.push("TAA_VELOCITY_COVERAGE"); recordSkipped("TAA_VELOCITY_COVERAGE:v2-hdr-stages"); }
  if (wantsTaa && temporalOk && !temporalInputsOk) {
    if (!temporal?.v2?.reactive) { skipped.push("POSTPROCESS_REACTIVE_UNAVAILABLE"); recordSkipped("POSTPROCESS_REACTIVE_UNAVAILABLE:temporal-reconstruction"); }
    if (temporal?.v2?.motionSource !== "object") { skipped.push("POSTPROCESS_OBJECT_MOTION_UNAVAILABLE"); recordSkipped("POSTPROCESS_OBJECT_MOTION_UNAVAILABLE:temporal-reconstruction"); }
  }
  for (const reason of temporal?.v2?.unsupportedMotion ?? []) recordSkipped(`POSTPROCESS_MOTION_UNSUPPORTED:${reason}`);
  if (wantsMb && !temporalOk) { skipped.push("S7_VELOCITY_UNAVAILABLE"); recordSkipped("S7_VELOCITY_UNAVAILABLE:v2-hdr-stages"); }
  const needsVelocity = ((taaActive || mbActive) && temporalOk)
    || (hdrCustoms.some((pass) => pass.inputs.includes("velocity")) && temporalOk);
  // Velocity dilation always samples current linear depth, including when a
  // custom pass is the only consumer of velocity.
  const needsLinZ = needsVelocity || wantsAo || wantsGodRays || wantsDof || wantsSsr
    || hdrCustoms.some((pass) => pass.inputs.includes("depth") || pass.inputs.includes("normal"));
  if (!wantsAo && !wantsGodRays && !wantsCa && !taaActive && !wantsDof && !mbActive && !wantsSsr && !wantsAutoExposure && !wantsGrade && hdrCustoms.length === 0) return { target: source, aoPending: false, skipped };

  // The depth/velocity and resolve passes may write before the first custom
  // anchor. Do not overwrite a supplied mask that a later pass will read.
  if (reactivePass && customReactive && temporal?.v2) {
    if (needsLinZ) assertCustomReactiveInput(host, customReactive, reactivePass.id, temporal.v2.linZOutput);
    if (needsVelocity && temporal.v2.motionSource !== "object") assertCustomReactiveInput(host, customReactive, reactivePass.id, temporal.velocity);
    if (taaActive) assertCustomReactiveInput(host, customReactive, reactivePass.id, temporal.historyOutput);
  }

  const gl = host.gl;
  const state = v2State(host);
  const scratch = new PostScratchScope(state.pool);
  const scopedFrame = frameContext?.scopeId && frameContext.viewId !== undefined
    && Number.isSafeInteger(frameContext.frameId) && frameContext.frameId! >= 0;
  let linZLease: PostTargetLease | null = null;
  let velocityLease: PostTargetLease | null = null;
  let expectedDepthTaaWritten = false;
  const exposure = wantsAutoExposure ? state.exposureHistory.begin({
    scopeId: scopedFrame ? frameContext!.scopeId! : state.legacyExposureScope,
    viewId: scopedFrame ? frameContext!.viewId! : "legacy",
    frameId: scopedFrame ? frameContext!.frameId! : state.frameIndex,
    effectIndex: 0, width: source.width, height: source.height,
    cameraCut: scopedFrame ? frameContext!.cameraCut : undefined,
    deviceGeneration: scopedFrame ? frameContext!.deviceGeneration : undefined
  }, () => host.device.createRenderTarget({ width: 1, height: 1, format: "rgba32f", depth: false, label: "post.ev" }),
  target => target.dispose()) : undefined;
  const drawGuard = expectedDepth ? (target: GlTarget) => assertExpectedDepth([source, target as unknown as RenderTarget]) : undefined;
  if (drawGuard) {
    let guards = postDrawGuards.get(host);
    if (!guards) postDrawGuards.set(host, guards = new Set());
    guards.add(drawGuard);
  }
  try {
  if (expectedDepth && exposure) assertExpectedDepth([exposure.write, ...(exposure.read ? [exposure.read] : [])]);
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
    recordSkipped("WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED:v2-hdr-stages");
    exposure?.abort();
    return { target: source, aoPending: false, skipped: [...skipped, "V2_DEPTH_UNAVAILABLE"] };
  }
  if ((wantsAo || wantsGodRays || wantsSsr || needsVelocity) && !camera) {
    recordSkipped("POST_GRAPH_V2_CAMERA_REQUIRED:v2-hdr-stages");
    exposure?.abort();
    return { target: source, aoPending: false, skipped: [...skipped, "V2_CAMERA_UNAVAILABLE"] };
  }

  const w = source.width, h = source.height;
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  const near = camera?.near ?? pipeline.depthRange?.near ?? 0.1;
  const far = camera?.far ?? pipeline.depthRange?.far ?? 1000;
  const ortho = camera?.projection === "orthographic" || pipeline.depthRange?.projection === "orthographic";
  const cameraDepth = camera as (FrameCamera & { readonly depth?: PostDepthConvention; readonly projectionMatrixInverse?: Float32Array }) | null | undefined;
  const depthSettings = {
    near, far, orthographic: ortho,
    depth: cameraDepth?.depth ?? frameContext?.sceneDepth.linearize.depth,
    projectionMatrixInverse: cameraDepth?.projectionMatrixInverse ?? frameContext?.sceneDepth.linearize.projectionMatrixInverse
      ?? (camera ? Float32Array.from(invertMat4(camera.projectionMatrix as unknown as Mat4)) : undefined)
  };

  // ── S1-A: linearized depth (RGBA32F .r = viewZ) ──────────────────────────
  let linZFull: RenderTarget | null = null;
  let minmaxLease: PostTargetLease | null = null;
  let minmaxHalf: RenderTarget | null = null;
  if (needsLinZ) {
    recordStage("S1:depth-prep");
    // Temporal frames write this frame's linear Z into the history ping-pong's
    // `linZOutput` slot so commit() promotes it for next frame's disocclusion.
    linZFull = temporal?.v2?.linZOutput ?? null;
    if (!linZFull) {
      linZLease = scratch.acquire({ width: w, height: h, format: "rgba32f", samples: 1, depth: false });
      linZFull = linZLease.target;
    }
    const linProg = program(state, gl, "depth-linearize", DEPTH_LINEARIZE_GLSL);
    draw(host, state, linProg, asGlTarget(linZFull), [src.depthTextureHandle!], (g) => {
      g.uniform1i(g.getUniformLocation(linProg, "u_depth"), 0);
      g.uniform2f(g.getUniformLocation(linProg, "u_outputSize"), w, h);
      g.uniform2f(g.getUniformLocation(linProg, "u_jitterClip"), temporal?.v2?.jitterClip[0] ?? 0, temporal?.v2?.jitterClip[1] ?? 0);
      writeDepthUniforms(g, linProg, depthSettings);
    }, expectedDepth ? () => assertExpectedDepth([linZFull!]) : undefined);
    minmaxLease = scratch.acquire({ width: hw, height: hh, format: "rgba32f", samples: 1, depth: false });
    minmaxHalf = minmaxLease.target;
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
    if (temporal.v2.motionSource !== "object") {
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
      recordStage(`S1C:reproj-dev=${dev.toExponential(2)}:jitter-px=${jx.toFixed(3)},${jy.toFixed(3)}`);
    }
    draw(host, state, camVelProg, asGlTarget(temporal.velocity), [src.depthTextureHandle!], (g) => {
      g.uniform1i(g.getUniformLocation(camVelProg, "u_depth"), 0);
      g.uniform2f(g.getUniformLocation(camVelProg, "u_jitterClip"), temporal.v2!.jitterClip[0], temporal.v2!.jitterClip[1]);
      writeDepthUniforms(g, camVelProg, depthSettings);
      g.uniformMatrix4fv(g.getUniformLocation(camVelProg, "u_prevViewProjection"), false, reprojection);
      g.uniformMatrix4fv(g.getUniformLocation(camVelProg, "u_invUnjitteredViewProjection"), false, IDENTITY_MAT4_F32);
    });
    }
    // §8.6: closest-depth 3×3 velocity for the silhouette-correct reprojection.
    assertExpectedDepth();
    velocityLease = scratch.acquire({ width: w, height: h, format: exactPreviousDepth ? "rgba32f" : "rgba16f", samples: 1, depth: false });
    dilatedVelocity = velocityLease.target;
    const dilateProg = program(state, gl, "velocity-dilate", VELOCITY_DILATE_GLSL);
    draw(host, state, dilateProg, asGlTarget(dilatedVelocity), [asGlTarget(temporal.velocity).colorHandle, asGlTarget(linZFull!).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(dilateProg, "u_velocity"), 0);
      g.uniform1i(g.getUniformLocation(dilateProg, "u_linearDepth"), 1);
      g.uniform1i(g.getUniformLocation(dilateProg, "u_hasExpectedDepth"), exactPreviousDepth ? 1 : 0);
      if (exactPreviousDepth) g.uniform1f(g.getUniformLocation(dilateProg, "u_depthNear"), temporal.v2!.depthNear);
    }, expectedDepth ? () => assertExpectedDepth([dilatedVelocity!]) : undefined);
    assertExpectedDepth();
  }

  // Normal input: reconstructed once per view and frame from the convention-
  // decoded linear depth, only when an HDR custom pass declares it.
  let normalLease: PostTargetLease | null = null;
  if (linZFull && camera && hdrCustoms.some((pass) => pass.inputs.includes("normal"))) {
    recordStage("S1N:normal-from-depth");
    normalLease = scratch.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const normalProg = program(state, gl, "normal-from-depth", NORMAL_FROM_DEPTH_GLSL);
    const normalInvProj = depthSettings.projectionMatrixInverse ?? Float32Array.from(invertMat4(camera.projectionMatrix as unknown as Mat4));
    draw(host, state, normalProg, asGlTarget(normalLease.target), [asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(normalProg, "u_linearDepth"), 0);
      g.uniformMatrix4fv(g.getUniformLocation(normalProg, "u_invProjMatrix"), false, normalInvProj);
      g.uniform1i(g.getUniformLocation(normalProg, "u_ortho"), ortho ? 1 : 0);
    }, expectedDepth ? () => assertExpectedDepth([normalLease!.target]) : undefined);
  }
  const customAux: CustomPassAuxiliary = { linZ: linZFull, normal: normalLease?.target ?? null, velocity: dilatedVelocity, reactive: customReactive };
  let hdr = source;
  let hdrLease: PostTargetLease | undefined;
  const replaceHdr = (target: RenderTarget, lease?: PostTargetLease): void => {
    if (hdrLease && hdrLease !== lease) scratch.release(hdrLease);
    hdr = target;
    hdrLease = lease;
  };
  // ── §6.1 insertion "after-depth": custom HDR passes reading linZ ──────────
  for (const pass of customsAt("after-depth")) {
    const out = runCustomPass(host, state, scratch, pass, hdr, customAux, camera, frameContext);
    if (out) replaceHdr(out.target, out);
  }

  // ── S2: GTAO → denoise ×2 → joint-bilateral apply onto HDR ───────────────
  if (wantsAo && camera && linZFull && minmaxHalf) {
    const ao = pipeline.ao as GtaoOptions;
    const directions = ao.directions ?? 4;
    const steps = ao.steps ?? 4;
    // Audit (ssao:normals): S2 is the SSAO the v2 chain executes; record it so diagnostics().post.stagesRan shows it.
    recordStage(`S2:gtao-${directions}x${steps}`);
    const aoRawLease = scratch.acquire({ width: hw, height: hh, format: "rgba8", samples: 1, depth: false });
    const aoRaw = aoRawLease.target;
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
      g.uniform1i(g.getUniformLocation(gtaoProg, "u_frameIndex"), frameContext?.frameId ?? state.frameIndex);
    });
    // Bilateral denoise: H then V (5-tap, exp depth weight).
    const denoiseProg = program(state, gl, "gtao-denoise", GTAO_DENOISE_GLSL);
    const aoHalfLease = scratch.acquire({ width: hw, height: hh, format: "rgba8", samples: 1, depth: false });
    const aoHalf = aoHalfLease.target;
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
    const appliedLease = scratch.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const applied = appliedLease.target;
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
    replaceHdr(applied, appliedLease);
    scratch.release(aoRawLease);
    scratch.release(aoHalfLease);
    void AO_RHO;
  }

  // ── S3: GU47 E-C screen-space reflections (half-res trace + composite) ───
  if (wantsSsr && camera && linZFull) {
    const ssr = resolveSsrOptions(pipeline.ssr);
    // Reprojected previous colour: the TAA history (last frame's resolved
    // HDR) through prevViewProj · inv(view); without TAA history the trace
    // samples this frame's HDR at the hit.
    const history = taaActive && temporal?.v2 && temporalCanAccumulate(temporal.historyValid, temporal.v2.unsupportedMotion)
      ? temporal : undefined;
    const viewToPrevClip = history
      ? Float32Array.from(multiplyMat4(Array.from(history.v2!.previous) as unknown as Mat4, invertMat4(Array.from(camera.viewMatrix) as unknown as Mat4)))
      : IDENTITY_MAT4_F32;
    const traceLease = scratch.acquire({ width: hw, height: hh, format: "rgba16f", samples: 1, depth: false });
    const trace = traceLease.target;
    const traceProg = program(state, gl, `ssr-trace-${ssr.steps}`, withDefines(SSR_TRACE_GLSL, { AURA_SSR_STEPS: ssr.steps }));
    recordStage(`S3:ssr-${ssr.steps}${history ? ":history" : ""}`);
    draw(host, state, traceProg, asGlTarget(trace), [asGlTarget(history ? history.history : hdr).colorHandle, asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(traceProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(traceProg, "u_linearDepth"), 1);
      g.uniformMatrix4fv(g.getUniformLocation(traceProg, "u_projection"), false, camera.projectionMatrix);
      g.uniformMatrix4fv(g.getUniformLocation(traceProg, "u_viewToPrevClip"), false, viewToPrevClip);
      g.uniform1i(g.getUniformLocation(traceProg, "u_reproject"), history ? 1 : 0);
      g.uniform1i(g.getUniformLocation(traceProg, "u_ortho"), ortho ? 1 : 0);
      g.uniform1f(g.getUniformLocation(traceProg, "u_far"), far);
      g.uniform1f(g.getUniformLocation(traceProg, "u_maxDistance"), ssr.maxDistance);
      g.uniform1f(g.getUniformLocation(traceProg, "u_thickness"), ssr.thickness);
      g.uniform1f(g.getUniformLocation(traceProg, "u_roughness"), ssr.roughness);
    });
    const compositedLease = scratch.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const composited = compositedLease.target;
    const ssrCompProg = program(state, gl, "ssr-composite", SSR_COMPOSITE_GLSL);
    draw(host, state, ssrCompProg, asGlTarget(composited), [asGlTarget(hdr).colorHandle, asGlTarget(trace).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(ssrCompProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(ssrCompProg, "u_reflection"), 1);
      g.uniform1f(g.getUniformLocation(ssrCompProg, "u_intensity"), ssr.intensity);
    });
    scratch.release(traceLease);
    replaceHdr(composited, compositedLease);
  }

  // ── S4: god rays, half-res radial march → additive onto HDR ─────────────
  if (wantsGodRays && camera && minmaxHalf) {
    const god = pipeline.godRays as GodRayOptions;
    const samples = god.samples ?? 32;
    const godLease = scratch.acquire({ width: hw, height: hh, format: "rgba16f", samples: 1, depth: false });
    const godTarget = godLease.target;
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
    recordStage(`S4:god-rays-${samples}`);
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
      // GU47 phase 2: distance-scaled shaft medium; omitted (0) keeps the unscaled shaft.
      g.uniform1f(g.getUniformLocation(godProg, "u_medium"), godRayMedium(god.medium));
    });
    // Additive blend onto the working HDR target.
    const blendedLease = scratch.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const blended = blendedLease.target;
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
    assertPostDrawGuards(host, asGlTarget(blended));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, asGlTarget(godTarget).colorHandle);
    assertPostDrawGuards(host, asGlTarget(blended));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    scratch.release(godLease);
    replaceHdr(blended, blendedLease);
  }

  // ── CA: §8.12 radial 3-tap on the working HDR ────────────────────────────
  if (wantsCa) {
    const ca = pipeline.chromaticAberration as { intensity?: number };
    const caLease = scratch.acquire({ width: w, height: h, format: "rgba16f", samples: 1, depth: false });
    const caTarget = caLease.target;
    const caProg = program(state, gl, "ca-pass", CA_PASS_GLSL);
    recordStage("CA:chromatic-aberration");
    draw(host, state, caProg, asGlTarget(caTarget), [asGlTarget(hdr).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(caProg, "u_hdr"), 0);
      g.uniform1f(g.getUniformLocation(caProg, "u_caIntensity"), ca.intensity ?? 0.0015);
    });
    replaceHdr(caTarget, caLease);
  }

  // ── §6.1 insertion "before-taa" ───────────────────────────────────────────
  for (const pass of customsAt("before-taa")) {
    const out = runCustomPass(host, state, scratch, pass, hdr, customAux, camera, frameContext);
    if (out) replaceHdr(out.target, out);
  }

  // ── S5: §8.6 TAA resolve into the history ping-pong ──────────────────────
  if (taaActive) recordStage(temporal?.v2 && dilatedVelocity
    ? `S5:${temporal.historyValid ? "history" : "seed"}:frames=${temporal.historyFrames}`
    : `S5:skip:velocity=${String(Boolean(dilatedVelocity))}`);
  if (taaActive && temporal?.v2 && dilatedVelocity) {
    assertExpectedDepth([temporal.historyOutput, dilatedVelocity]);
    if (reactivePass && customReactive) assertCustomReactiveInput(host, customReactive, reactivePass.id, temporal.historyOutput);
    const taa = (pipeline.taa ?? {}) as Partial<TaaOptions>;
    const taaProg = program(state, gl, "taa-resolve", TAA_RESOLVE_GLSL);
    const resolved = temporal.historyOutput;
    draw(host, state, taaProg, asGlTarget(resolved), [
      asGlTarget(hdr).colorHandle,
      asGlTarget(temporal.history).colorHandle,
      asGlTarget(dilatedVelocity).colorHandle,
      asGlTarget(temporal.v2.linZ).colorHandle,
      temporal.v2.reactive ? asGlTarget(temporal.v2.reactive).colorHandle : state.blankTex
    ], (g) => {
      g.uniform1i(g.getUniformLocation(taaProg, "u_current"), 0);
      g.uniform1i(g.getUniformLocation(taaProg, "u_history"), 1);
      g.uniform1i(g.getUniformLocation(taaProg, "u_velocityDilate"), 2);
      g.uniform1i(g.getUniformLocation(taaProg, "u_linZPrev"), 3);
      g.uniform1i(g.getUniformLocation(taaProg, "u_reactive"), 4);
      g.uniform1i(g.getUniformLocation(taaProg, "u_hasReactive"), temporal.v2!.reactive ? 1 : 0);
      g.uniform1i(g.getUniformLocation(taaProg, "u_hasExpectedDepth"), exactPreviousDepth ? 1 : 0);
      g.uniform2f(g.getUniformLocation(taaProg, "u_jitterUv"), temporal.v2!.jitterClip[0] * 0.5, temporal.v2!.jitterClip[1] * 0.5);
      const previousJitter = temporal.v2!.previousJitterClip ?? [0, 0];
      g.uniform2f(g.getUniformLocation(taaProg, "u_previousJitterUv"), previousJitter[0] * 0.5, previousJitter[1] * 0.5);
      g.uniform1i(g.getUniformLocation(taaProg, "u_hasHistory"), temporalCanAccumulate(temporal.historyValid, temporal.v2!.unsupportedMotion) ? 1 : 0);
      g.uniform1f(g.getUniformLocation(taaProg, "u_depthNear"), temporal.v2!.depthNear);
      g.uniform1f(g.getUniformLocation(taaProg, "u_feedbackMin"), taa.feedbackMin ?? 0.88);
      g.uniform1f(g.getUniformLocation(taaProg, "u_feedbackMax"), taa.feedbackMax ?? 0.97);
      g.uniform1f(g.getUniformLocation(taaProg, "u_varianceGamma"), taa.varianceGamma ?? 1.0);
    }, expectedDepth ? () => assertExpectedDepth([resolved, dilatedVelocity!]) : undefined);
    assertExpectedDepth([resolved, dilatedVelocity]);
    if (expectedDepth) expectedDepthTaaWritten = true;
    else markTaaHistoryWritten(frameContext?.scopeId, frameContext?.viewId, frameContext?.frameId);
    replaceHdr(resolved);
    // §8.6 TAAU: renderScale < 1 reconstructs at display resolution with the
    // 9-tap Blackman-Harris kernel. History stays render-res (self-consistent
    // reprojection); only the presented output upsamples.
    const renderScale = pipeline.renderScale ?? 1;
    if (renderScale < 1 && reconstruction === "spatial") {
      const outW = Math.max(1, Math.round(w / renderScale));
      const outH = Math.max(1, Math.round(h / renderScale));
      const displayLease = scratch.acquire({ width: outW, height: outH, format: "rgba16f", samples: 1, depth: false });
      const display = displayLease.target;
      const upProg = program(state, gl, "taa-upscale", TAA_UPSCALE_GLSL);
      draw(host, state, upProg, asGlTarget(display), [asGlTarget(resolved).colorHandle], (g) => {
        g.uniform1i(g.getUniformLocation(upProg, "u_resolved"), 0);
        g.uniform2f(g.getUniformLocation(upProg, "u_renderSize"), w, h);
        g.uniform2f(g.getUniformLocation(upProg, "u_outputSize"), outW, outH);
      });
      replaceHdr(display, displayLease);
      // Note: downstream stages (S6/S7) then run at display res; linZ/velocity
      // stays render-res — sampling is texelFetch-indexed so the sizes differ
      // intentionally and DOF/MB reads scale via textureSize().
    }
  }

  // ── §6.1 insertion "after-taa" (stable HDR) ───────────────────────────────
  for (const pass of customsAt("after-taa")) {
    const out = runCustomPass(host, state, scratch, pass, hdr, customAux, camera, frameContext);
    if (out) replaceHdr(out.target, out);
  }

  // ── S6: §8.7 depth of field ───────────────────────────────────────────────
  if (wantsDof && linZFull) {
    const dof = (pipeline.dof ?? {}) as Partial<DofOptions>;
    const maxBlur = dof.maxBlurPx ?? 16;
    const rings = 3; // High preset; tier table routes Medium → 2 via §6.5
    const postW = hdr.width, postH = hdr.height;
    const dw = Math.max(1, Math.round(postW / 2)), dh = Math.max(1, Math.round(postH / 2));
    const prefilterLease = scratch.acquire({ width: dw, height: dh, format: "rgba16f", samples: 1, depth: false });
    const prefilter = prefilterLease.target;
    const prefilterProg = program(state, gl, "dof-prefilter", DOF_PREFILTER_GLSL);
    // GU47 E-C (EC-8): the tilt-shift band replaces the thin-lens CoC.
    const tilt = dofTiltShiftUniform(dof.tiltShift);
    recordStage(tilt[3] > 0 ? `S6:dof-tilt-shift-rings${rings}` : `S6:dof-rings${rings}`);
    draw(host, state, prefilterProg, asGlTarget(prefilter), [asGlTarget(hdr).colorHandle, asGlTarget(linZFull).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(prefilterProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(prefilterProg, "u_linearDepth"), 1);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_focusDistance"), dof.focusDistance ?? 3);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_focalLengthMm"), dof.focalLengthMm ?? 50);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_fStop"), dof.fStop ?? 2.8);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_sensorHeightMm"), dof.sensorHeightMm ?? 24);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_frameHeightPx"), postH);
      g.uniform1f(g.getUniformLocation(prefilterProg, "u_maxBlurPx"), maxBlur);
      g.uniform4f(g.getUniformLocation(prefilterProg, "u_tiltShift"), tilt[0], tilt[1], tilt[2], tilt[3]);
    });
    const tileW = Math.max(1, Math.ceil(dw / 8)), tileH = Math.max(1, Math.ceil(dh / 8));
    const nearTileLease = scratch.acquire({ width: tileW, height: tileH, format: "rgba16f", samples: 1, depth: false });
    const nearTile = nearTileLease.target;
    const tileProg = program(state, gl, "dof-near-tile", DOF_NEAR_TILE_GLSL);
    draw(host, state, tileProg, asGlTarget(nearTile), [asGlTarget(prefilter).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(tileProg, "u_prefilter"), 0);
    });
    const gatherLease = scratch.acquire({ width: dw, height: dh, format: "rgba16f", samples: 1, depth: false });
    const gather = gatherLease.target;
    const gatherSrc = withDefines(DOF_GATHER_GLSL, { DOF_RINGS: rings });
    const gatherProg = program(state, gl, `dof-gather-${rings}`, gatherSrc);
    draw(host, state, gatherProg, asGlTarget(gather), [asGlTarget(prefilter).colorHandle, asGlTarget(nearTile).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(gatherProg, "u_prefilter"), 0);
      g.uniform1i(g.getUniformLocation(gatherProg, "u_nearTile"), 1);
      g.uniform1f(g.getUniformLocation(gatherProg, "u_maxBlurPx"), maxBlur);
    });
    const compLease = scratch.acquire({ width: postW, height: postH, format: "rgba16f", samples: 1, depth: false });
    const comp = compLease.target;
    const compProg = program(state, gl, "dof-composite", DOF_COMPOSITE_GLSL);
    draw(host, state, compProg, asGlTarget(comp), [asGlTarget(hdr).colorHandle, asGlTarget(gather).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(compProg, "u_color"), 0);
      g.uniform1i(g.getUniformLocation(compProg, "u_blurred"), 1);
    });
    scratch.release(prefilterLease); scratch.release(nearTileLease); scratch.release(gatherLease);
    replaceHdr(comp, compLease);
  }

  // ── S7: §8.8 motion blur (McGuire tile reconstruction) ────────────────────
  if (mbActive && temporal?.v2 && dilatedVelocity && linZFull) {
    const mb = (pipeline.motionBlur ?? {}) as Partial<MotionBlurOptions>;
    const tile = mb.tileSize ?? 16;
    const samples = mb.samples ?? 12;
    const tw = Math.max(1, Math.ceil(w / tile)), th = Math.max(1, Math.ceil(h / tile));
    recordStage(`S7:motion-blur-${samples}x${tile}`);
    const tileMaxLease = scratch.acquire({ width: tw, height: th, format: "rgba16f", samples: 1, depth: false });
    const tileMax = tileMaxLease.target;
    const tileProg = program(state, gl, `mb-tile-${tile}`, withDefines(MB_TILE_MAX_GLSL, { MB_TILE_SIZE: tile }));
    draw(host, state, tileProg, asGlTarget(tileMax), [asGlTarget(dilatedVelocity).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(tileProg, "u_velocity"), 0);
    });
    const neighborLease = scratch.acquire({ width: tw, height: th, format: "rgba16f", samples: 1, depth: false });
    const neighbor = neighborLease.target;
    const neighborProg = program(state, gl, "mb-neighbor", MB_NEIGHBOR_GLSL);
    draw(host, state, neighborProg, asGlTarget(neighbor), [asGlTarget(tileMax).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(neighborProg, "u_tileMax"), 0);
    });
    const blurredLease = scratch.acquire({ width: hdr.width, height: hdr.height, format: "rgba16f", samples: 1, depth: false });
    const blurred = blurredLease.target;
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
      g.uniform1i(g.getUniformLocation(reconProg, "u_frameIndex"), frameContext?.frameId ?? state.frameIndex);
    });
    scratch.release(tileMaxLease); scratch.release(neighborLease);
    replaceHdr(blurred, blurredLease);
  }

  // ── S8: §8.9 auto-exposure — log2 luma chain → 1×1 EV ping-pong → mul ─────
  if (wantsAutoExposure) {
    const exposureTargets = new Set<PostTargetLease>();
    const acquireExposureTarget = (width: number, height: number): PostTargetLease => {
      const lease = scratch.acquire({ width, height, format: "rgba16f", samples: 1, depth: false });
      exposureTargets.add(lease);
      return lease;
    };
    const releaseExposureTarget = (lease: PostTargetLease): void => {
      scratch.release(lease);
      exposureTargets.delete(lease);
    };
    try {
    const ae = autoExposure as Partial<AutoExposureOptionsV2>;
    const qw = Math.max(1, hdr.width >> 2), qh = Math.max(1, hdr.height >> 2);
    const luma = acquireExposureTarget(qw, qh);
    const lumaProg = program(state, gl, "exposure-luma", EXPOSURE_LUMA_LOG_GLSL);
    draw(host, state, lumaProg, asGlTarget(luma.target), [asGlTarget(hdr).colorHandle], (g) => {
      g.uniform1i(g.getUniformLocation(lumaProg, "u_hdr"), 0);
      g.uniform2f(g.getUniformLocation(lumaProg, "u_texelSize"), 1 / hdr.width, 1 / hdr.height);
      g.uniform1i(g.getUniformLocation(lumaProg, "u_centerWeighted"), (ae.meteringMask ?? "center-weighted") === "center-weighted" ? 1 : 0);
    });
    // 2× box-reduce chain down to 1×1.
    let rw = qw, rh = qh;
    let reduceSrc = luma;
    let reduceTmp: PostTargetLease | null = null;
    while (rw > 1 || rh > 1) {
      rw = Math.max(1, rw >> 1); rh = Math.max(1, rh >> 1);
      const next = acquireExposureTarget(rw, rh);
      const redProg = program(state, gl, "exposure-reduce", EXPOSURE_REDUCE_GLSL);
      draw(host, state, redProg, asGlTarget(next.target), [asGlTarget(reduceSrc.target).colorHandle], (g) => {
        g.uniform1i(g.getUniformLocation(redProg, "u_source"), 0);
        g.uniform2f(g.getUniformLocation(redProg, "u_texelSize"), 1 / (rw * 2), 1 / (rh * 2));
      });
      if (reduceSrc !== luma) releaseExposureTarget(reduceSrc);
      reduceTmp = next;
      reduceSrc = next;
    }
    // Persistent 1×1 surfaces use the view's frame identity and the source
    // dimensions, so resizing or cutting one view never affects another.
    const evRead = exposure!.read;
    const evWrite = exposure!.write;
    const adaptProg = program(state, gl, "exposure-adapt", EXPOSURE_ADAPT_GLSL);
    draw(host, state, adaptProg, asGlTarget(evWrite), [
      evRead ? asGlTarget(evRead).colorHandle : state.blankTex,
      asGlTarget(reduceSrc.target).colorHandle
    ], (g) => {
      g.uniform1i(g.getUniformLocation(adaptProg, "u_prev"), 0);
      g.uniform1i(g.getUniformLocation(adaptProg, "u_avg"), 1);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_dt"), temporal?.v2?.frameTime ?? 1 / 60);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_speedUp"), ae.speedUp ?? 3);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_speedDown"), ae.speedDown ?? 1);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_minEv"), ae.minEv ?? -4);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_maxEv"), ae.maxEv ?? 4);
      g.uniform1f(g.getUniformLocation(adaptProg, "u_compensationEv"), ae.compensationEv ?? 0);
      g.uniform1i(g.getUniformLocation(adaptProg, "u_hasPrev"), evRead ? 1 : 0);
    });
    releaseExposureTarget(luma);
    if (reduceTmp) releaseExposureTarget(reduceTmp);
    recordStage("S8:auto-exposure");
    // Apply: hdr *= exp2(ev) — the composite's autoExp factor, ahead of the
    // fused present's own §6.4 exposure (linear multipliers commute). GU47
    // E-C: the S10 linear grade folds into this same draw (one fullscreen
    // pass for AE + grade).
    const multiplied = acquireExposureTarget(hdr.width, hdr.height);
    runHdrGradeDraw(host, state, multiplied.target, hdr, evWrite, gradeUniforms);
    if (gradeUniforms) recordStage("S10:hdr-grade:folded-s8");
    replaceHdr(multiplied.target, multiplied);
    exposureTargets.delete(multiplied);
    } finally {
      for (const lease of exposureTargets) scratch.release(lease);
    }
  } else if (gradeUniforms) {
    // ── S10 linear grade (no S8 this frame): one fullscreen draw ─────────────
    const gradedLease = scratch.acquire({ width: hdr.width, height: hdr.height, format: "rgba16f", samples: 1, depth: false });
    const graded = gradedLease.target;
    runHdrGradeDraw(host, state, graded, hdr, null, gradeUniforms);
    recordStage("S10:hdr-grade");
    replaceHdr(graded, gradedLease);
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
    const deferredAux = customAux;
    const releaseLinZ = linZLease;
    const releaseVelocity = velocityLease;
    const releaseNormal = normalLease;
    const deferredScratch = new PostScratchScope(state.pool);
    let held: PostTargetLease | null = null;
    let released = false;
    let running = false;
    let releaseRequested = false;
    const finishRelease = (): void => {
      if (released) return;
      released = true;
      held = null;
      const errors: unknown[] = [];
      for (const release of [() => deferredScratch.releaseAll(), () => releaseVelocity?.release(), () => releaseNormal?.release(), () => releaseLinZ?.release()]) {
        try { release(); } catch (error) { errors.push(error); }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "Deferred postprocess release failed");
    };
    afterBloom = {
      run: (input) => {
        if (released || releaseRequested) throw new Error("POSTPROCESS_DEFERRED_STAGE_RELEASED");
        if (running) throw new Error("POSTPROCESS_DEFERRED_STAGE_REENTRANT");
        running = true;
        let failed = false;
        const savedFrameIndex = state.frameIndex;
        const savedTimeSeconds = state.timeSeconds;
        state.frameIndex = deferredFrameIndex;
        state.timeSeconds = deferredTimeSeconds;
        try {
          assertExpectedDepth([source]);
          if (drawGuard) {
            let guards = postDrawGuards.get(host);
            if (!guards) postDrawGuards.set(host, guards = new Set());
            guards.add(drawGuard);
          }
          let current: PostColorInput = input;
          for (const pass of beforeTonemapPasses) {
            const out = runCustomPassOnTexture(host, state, deferredScratch, pass, current, deferredAux, camera, frameContext);
            if (releaseRequested) throw new Error("POSTPROCESS_DEFERRED_STAGE_RELEASED");
            if (!out) continue;
            deferredScratch.release(held);
            held = out;
            current = asGlTarget(out.target);
          }
          assertExpectedDepth([source]);
          if (expectedDepthTaaWritten) markTaaHistoryWritten(frameContext?.scopeId, frameContext?.viewId, frameContext?.frameId);
          return current;
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          if (drawGuard) {
            const guards = postDrawGuards.get(host);
            guards?.delete(drawGuard);
            if (guards?.size === 0) postDrawGuards.delete(host);
          }
          state.frameIndex = savedFrameIndex;
          state.timeSeconds = savedTimeSeconds;
          running = false;
          if (releaseRequested) {
            try { finishRelease(); } catch (error) { if (!failed) throw error; }
          }
        }
      },
      release: () => {
        if (released || releaseRequested) return;
        if (running) { releaseRequested = true; return; }
        finishRelease();
      }
    };
  } else {
    for (const pass of beforeTonemapPasses) {
      const out = runCustomPass(host, state, scratch, pass, hdr, customAux, camera, frameContext);
      if (out) replaceHdr(out.target, out);
    }
  }

  // A callback may decline its pass after changing a borrowed input, so the
  // final check is required even when no later draw runs its submission guard.
  assertExpectedDepth([source, hdr]);
  state.timeSeconds += temporal?.v2?.frameTime ?? 1 / 60;
  if (!afterBloom) {
    scratch.release(velocityLease);
    scratch.release(normalLease);
    scratch.release(linZLease);
  }
  scratch.release(minmaxLease);
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
  if (exposure && !options?.deferExposureCommit) exposure.commit();
  // Keep only actual output and deferred handles through the handoff. Borrowed
  // source and temporal-history targets have no scratch lease.
  const finalHdrLease = hdrLease as PostTargetLease | undefined;
  scratch.releaseExcept([finalHdrLease, ...(afterBloom ? [linZLease, velocityLease, normalLease] : [])]);
  let outputLease: PostTargetLease | undefined;
  if (finalHdrLease) {
    if (options?.retainOutputLease) outputLease = scratch.take(finalHdrLease);
    else {
      state.pool.transferLeaseToLegacy(finalHdrLease);
      scratch.take(finalHdrLease);
    }
  }
  if (afterBloom) {
    if (linZLease) scratch.take(linZLease);
    if (velocityLease) scratch.take(velocityLease);
    if (normalLease) scratch.take(normalLease);
  }
  scratch.releaseAll();
  assertExpectedDepth([source, hdr]);
  if (expectedDepthTaaWritten && !afterBloom) markTaaHistoryWritten(frameContext?.scopeId, frameContext?.viewId, frameContext?.frameId);
  return { target: hdr, aoPending: wantsAo, skipped, ...(afterBloom ? { afterBloom } : {}),
    ...(outputLease ? { outputLease } : {}),
    ...(exposure && options?.deferExposureCommit ? { exposureCompletion: {
      commit: () => {
        if (states.get(host) !== state) throw new Error("POST_HISTORY_STALE_LEASE");
        exposure.commit();
      },
      abort: () => {
        if (states.get(host) !== state) throw new Error("POST_HISTORY_STALE_LEASE");
        exposure.abort();
      }
    } } : {}) };
  } catch (error) {
    try { scratch.releaseAll(); } catch { /* Preserve the frame failure. */ }
    try { exposure?.abort(); } catch { /* Preserve the error that interrupted the frame. */ }
    throw error;
  } finally {
    if (drawGuard) {
      const guards = postDrawGuards.get(host);
      guards?.delete(drawGuard);
      if (guards?.size === 0) postDrawGuards.delete(host);
    }
  }
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
export function v2NeedsLdrTail(pipeline: PostPipelineOptions, token?: PostDiagnosticToken, postScopeId?: object): boolean {
  const displayCustoms = mergedCustomPasses(pipeline, token, postScopeId).some((pass) => pass.insertAt === "after-tonemap");
  return Boolean(pipeline.vignette || pipeline.filmGrain || pipeline.lut || pipeline.nativeEffects?.length
    || pipeline.antiAliasing === "smaa" || displayCustoms);
}

/** Snapshot the bounded display-P3 tail before any encoded P3 scratch is written. */
export function prepareP3DisplayTail(pipeline: PostPipelineOptions, token?: PostDiagnosticToken, postScopeId?: object): PostPipelineOptions | undefined {
  if (pipeline.outputColorSpace !== "display-p3" || pipeline.vignette || pipeline.filmGrain || pipeline.lut
      || (pipeline.antiAliasing !== "off" && pipeline.antiAliasing !== "msaa" && pipeline.antiAliasing !== "taa")
      || (pipeline.renderScale !== undefined && (!Number.isFinite(pipeline.renderScale) || pipeline.renderScale < 1))
      || typeof pipeline.dither !== "boolean"
      || (pipeline.alphaMode !== undefined && pipeline.alphaMode !== "opaque" && pipeline.alphaMode !== "straight" && pipeline.alphaMode !== "premultiplied")
      || !Array.isArray(pipeline.nativeEffects) || pipeline.nativeEffects.length === 0
      || mergedCustomPasses(pipeline, token, postScopeId).some(pass => pass.insertAt === "after-tonemap")) return undefined;
  const effects: NativePostEffect[] = [];
  for (const effect of pipeline.nativeEffects) {
    let copy: NativePostEffect;
    if (effect.kind === "pixelation") copy = { kind: "pixelation", size: effect.size };
    else if (effect.kind === "glitch") copy = { kind: "glitch", intensity: effect.intensity, seed: effect.seed };
    else if (effect.kind === "afterimage") copy = { kind: "afterimage", decay: effect.decay };
    else return undefined;
    validateNativePostEffect(copy);
    effects.push(Object.freeze(copy));
  }
  return Object.freeze({ ...pipeline, nativeEffects: Object.freeze(effects), outputColorSpace: "display-p3" });
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
  frameContext?: PostFrameContextBag,
  encodedSurface?: EncodedDisplaySurfaceLease
): void {
  const diagnosticToken = frameContext?.diagnosticToken;
  const recordStage = (stage: string): void => recordPostStage(stage, diagnosticToken);
  const p3 = pipeline.outputColorSpace === "display-p3";
  if (p3) {
    if (outTarget || !encodedSurface || !prepareP3DisplayTail(pipeline, diagnosticToken, frameContext?.scopeId)) {
      throw new RenderDeviceError("Display-P3 postprocessing requires an admitted display surface", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
    }
    assertEncodedDisplaySurfaceWritten(encodedSurface, host.device, ldr);
    host.device.assertDisplayOutputScope("display-p3");
  } else if (encodedSurface) {
    throw new RenderDeviceError("An encoded display surface cannot be sampled as sRGB", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
  }
  const gl = host.gl;
  const state = v2State(host);
  const ldrGl = asGlTarget(ldr);
  const w = ldr.width, h = ldr.height;
  const vignette = pipeline.vignette as { intensity?: number; smoothness?: number; roundness?: number; color?: unknown } | undefined;
  const grain = pipeline.filmGrain as { intensity?: number; size?: number; luminanceResponse?: number } | undefined;
  const aaFxaa = pipeline.antiAliasing === "fxaa";
  const aaSmaa = pipeline.antiAliasing === "smaa";
  const outputAlphaMode = pipeline.alphaMode === "premultiplied" ? 2 : pipeline.alphaMode === "opaque" ? 1 : 0;
  const nativeEffects = pipeline.nativeEffects ?? [];
  for (const effect of nativeEffects) validateNativePostEffect(effect);
  if (nativeEffects.some((effect) => effect.kind === "afterimage")
      && (!frameContext?.scopeId || frameContext.viewId === undefined || !Number.isSafeInteger(frameContext.frameId) || frameContext.frameId! < 0)) {
    throw new Error("POSTPROCESS_HISTORY_IDENTITY_REQUIRED");
  }
  const displayCustoms = sortCustomPassesAtAnchor(mergedCustomPasses(pipeline, diagnosticToken, frameContext?.scopeId), "after-tonemap");
  if (p3 && displayCustoms.length) throw new RenderDeviceError("Display-P3 custom tail passes are not admitted", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
  const rcas = (pipeline.renderScale ?? 1) < 1 ? 0.2 : 0;
  // GU47 E-C (EC-2): the user `.cube` LUT, uploaded once per source.
  const lut = displayLutBinding(host, state, pipeline.lut, diagnosticToken);
  const bindLut = (g: WebGL2RenderingContext, prog: WebGLProgram): void => {
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_3D, lut?.texture ?? state.identityLut);
    // GU47 phase 2 (receipt effects-lut, LUT frame all black): the forward pass
    // leaves material sampler objects bound on low units (webgl2/Samplers.ts);
    // a mipmapped one overrides the LUT's LINEAR filter, the mip-less
    // TEXTURE_3D is then incomplete and every fetch returns black. The
    // identity LUT is never fetched (u_hasLut 0), so only LUT frames change.
    g.bindSampler(1, null);
    g.uniform1i(g.getUniformLocation(prog, "u_lut3d"), 1);
    g.uniform1i(g.getUniformLocation(prog, "u_hasLut"), lut ? 1 : 0);
    g.uniform1i(g.getUniformLocation(prog, "u_lutLattice"), lut ? 1 : 0);
    g.uniform1f(g.getUniformLocation(prog, "u_lutBypass"), lut?.bypass ?? 0);
  };
  // GU47 E-C stage trace: the display stages that draw this frame.
  const vignetteOn = (vignette?.intensity ?? 0) > 0;
  const grainOn = (grain?.intensity ?? 0) > 0;
  const traceDisplayStages = (fused: boolean): void => {
    if (vignetteOn || lut) recordStage(`S10b:display-grade${vignetteOn ? ":vignette" : ""}${lut ? ":lut" : ""}${fused ? ":fused-fxaa" : ""}`);
    if (grainOn) recordStage(`S12:film-grain${fused ? ":fused-fxaa" : ""}`);
  };

  // §6.1 fuse: FXAA + S10b + S12 in a single draw — only when nothing sits
  // between the stages (an after-tonemap custom pass splices S10b→S11).
  if (aaFxaa && displayCustoms.length === 0 && !pipeline.nativeEffects?.length) {
    const prog = program(state, gl, "finalize-fxaa-fused", FINALIZE_FXAA_FUSED_GLSL);
    traceDisplayStages(true);
    recordStage("S11:fxaa:fused");
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
    gl.uniform1i(gl.getUniformLocation(prog, "u_outputAlphaMode"), outputAlphaMode);
    gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform2f(gl.getUniformLocation(prog, "u_outputTexel"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(prog, "u_frame"), frameContext?.frameId ?? state.frameIndex);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainIntensity"), grain?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainSize"), grain?.size ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainLuminanceResponse"), grain?.luminanceResponse ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteIntensity"), vignette?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteSmoothness"), vignette?.smoothness ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_vignetteRoundness"), vignette?.roundness ?? 1);
    const vc = vignetteColorRgb(vignette?.color);
    gl.uniform3f(gl.getUniformLocation(prog, "u_vignetteColor"), vc[0], vc[1], vc[2]);
    gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), w, h);
    if (!outTarget) {
      try { host.device.assertSrgbOutputFallbackScope?.(); }
      catch (error) {
        try { gl.bindVertexArray(null); } catch { /* Preserve the presentation failure. */ }
        try { host.stateCache.invalidate(); } catch { /* Preserve the presentation failure. */ }
        throw error;
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // T0-16: raw GL above bypassed the state cache — invalidate before the
    // next frame's first cached-state user.
    host.stateCache.invalidate();
    return;
  }

  const scratch = new PostScratchScope(state.pool);
  try {
  let current = ldr;
  let currentLease: PostTargetLease | undefined;
  const replaceCurrent = (target: RenderTarget, lease?: PostTargetLease): void => {
    if (currentLease && currentLease !== lease) scratch.release(currentLease);
    current = target;
    currentLease = lease;
  };
  traceDisplayStages(false);
  // S10b — display grade: vignette plus the user `.cube` (GU47 E-C, EC-2;
  // the identity 3-D texture binds with u_hasLut 0 while no LUT resolved).
  if (vignette || pipeline.lut) {
    const gradedLease = scratch.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
    const graded = gradedLease.target;
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
    replaceCurrent(graded, gradedLease);
  }

  // §6.1 insertion "after-tonemap" (display-referred RGBA8 customs). GU47 E-E
  // handoff H2: a display custom declaring `inputs` "depth" reads the frame's
  // scene depth, linearised once per tail (the HDR stages' linZ is gone by now).
  const tailLinZLease = displayCustomLinearDepth(host, state, scratch, displayCustoms, frameContext, w, h);
  const tailLinZ = tailLinZLease?.target;
  for (const pass of displayCustoms) {
    const out = runCustomPass(host, state, scratch, pass, current, tailLinZ ? { linZ: tailLinZ } : {}, null, frameContext);
    if (out) replaceCurrent(out.target, out);
  }
  scratch.release(tailLinZLease);

  // Native effects are an authored ordered sequence. The mask is a borrowed
  // input and remains active until a clear-mask; it never owns the texture.
  let mask: Extract<NativePostEffect, { kind: "mask" }> | undefined;
  const pendingHistory: Array<ReturnType<PostViewHistory<RenderTarget>["begin"]>> = [];
  try {
    for (const [effectIndex, effect] of nativeEffects.entries()) {
      if (effect.kind === "mask") { mask = effect; continue; }
      if (effect.kind === "clear-mask") { mask = undefined; continue; }
      let history: ReturnType<PostViewHistory<RenderTarget>["begin"]> | undefined;
      if (effect.kind === "afterimage") {
        history = state.effectHistory.begin({
          scopeId: frameContext!.scopeId!, viewId: frameContext!.viewId!, frameId: frameContext!.frameId!,
          effectIndex, width: w, height: h, cameraCut: frameContext!.cameraCut,
          deviceGeneration: frameContext!.deviceGeneration,
          displayColorSpace: p3 ? "display-p3" : "srgb"
        }, (width, height) => host.device.createRenderTarget({ width, height, format: "rgba8", depth: false, label: "post-afterimage-history" }),
        (target) => target.dispose());
        pendingHistory.push(history);
      }
      let target: RenderTarget | undefined;
      let targetLease: PostTargetLease | undefined;
      try {
        const sourceTarget = current;
        const historyRead = history?.read;
        if (p3) {
          host.device.assertEncodedDisplayTarget(sourceTarget);
          if (historyRead) host.device.assertEncodedDisplayTarget(historyRead);
        }
        const sourceTexture = asGlTarget(current).colorHandle;
        const auxiliary = effect.kind === "transition" || effect.kind === "lens-dirt"
          ? host.textureRegistry.getTextureHandle(effect.texture)
          : history?.read ? asGlTarget(history.read).colorHandle : state.blankTex;
        const maskTexture = mask ? host.textureRegistry.getTextureHandle(mask.texture) : state.blankTex;
        target = history?.write;
        if (!target) {
          targetLease = scratch.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
          target = targetLease.target;
        }
        if (p3) host.device.assertEncodedDisplayTarget(target);
        if (asGlTarget(target).colorHandle === sourceTexture || asGlTarget(target).colorHandle === auxiliary || asGlTarget(target).colorHandle === maskTexture) {
          throw new Error(`POSTPROCESS_INPUT_OUTPUT_ALIAS:${effect.kind}`);
        }
        const nativeProg = program(state, gl, "native-display-effect", NATIVE_EFFECT_GLSL);
        const kind = effect.kind === "pixelation" ? 1 : effect.kind === "halftone" ? 2 : effect.kind === "dot-screen" ? 3
          : effect.kind === "glitch" ? 4 : effect.kind === "transition" ? 5 : effect.kind === "lens-dirt" ? 6 : 7;
        recordStage(`native:${effect.kind}`);
        const outputTarget = target;
        draw(host, state, nativeProg, asGlTarget(outputTarget), [sourceTexture, auxiliary, maskTexture], (g) => {
          g.uniform1i(g.getUniformLocation(nativeProg, "u_color"), 0);
          g.uniform1i(g.getUniformLocation(nativeProg, "u_aux"), 1);
          g.uniform1i(g.getUniformLocation(nativeProg, "u_mask"), 2);
          g.uniform2f(g.getUniformLocation(nativeProg, "u_resolution"), w, h);
          g.uniform1i(g.getUniformLocation(nativeProg, "u_kind"), kind);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_size"), "size" in effect ? effect.size : 1);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_angle"), "angle" in effect ? effect.angle : 0);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_strength"), "strength" in effect ? effect.strength : 0);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_intensity"), "intensity" in effect ? effect.intensity : 0);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_seed"), "seed" in effect ? effect.seed : 0);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_frame"), frameContext?.frameId ?? state.frameIndex);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_progress"), "progress" in effect ? effect.progress : 0);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_decay"), "decay" in effect ? effect.decay : 0);
          g.uniform1i(g.getUniformLocation(nativeProg, "u_hasHistory"), history?.read ? 1 : 0);
          g.uniform1i(g.getUniformLocation(nativeProg, "u_hasMask"), mask ? 1 : 0);
          g.uniform1i(g.getUniformLocation(nativeProg, "u_invertMask"), mask?.invert ? 1 : 0);
          g.uniform1f(g.getUniformLocation(nativeProg, "u_maskOpacity"), mask?.opacity ?? 0);
        }, p3 ? () => {
          assertEncodedDisplaySurfaceWritten(encodedSurface!, host.device, ldr);
          host.device.assertDisplayOutputScope("display-p3");
          host.device.assertEncodedDisplayTarget(sourceTarget);
          host.device.assertEncodedDisplayTarget(outputTarget);
          if (historyRead) host.device.assertEncodedDisplayTarget(historyRead);
        } : undefined);
      } catch (error) {
        try { history?.abort(); } catch { /* A stale lease must not mask the original failure. */ }
        try { scratch.release(targetLease); } catch { /* Preserve the effect failure. */ }
        throw error;
      }
      replaceCurrent(target!, targetLease);
    }

    // S11 — SMAA 1x three-pass (§8.14). The lazy textures warm on first use;
    // until both land, the stage skips (same first-frames window as three's
    // async Image load — never a silent FXAA substitution).
    if (aaSmaa && smaaTexturesReady(host, state, diagnosticToken)) {
      recordStage("S11:smaa");
      const edgesLease = scratch.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
      const edges = edgesLease.target;
      const edgesProg = program(state, gl, "smaa-edges", SMAA_EDGES_GLSL);
      draw(host, state, edgesProg, asGlTarget(edges), [asGlTarget(current).colorHandle], (g) => {
        g.uniform1i(g.getUniformLocation(edgesProg, "u_color"), 0);
        g.uniform2f(g.getUniformLocation(edgesProg, "u_resolution"), 1 / w, 1 / h);
      });
      const weightsLease = scratch.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
      const weights = weightsLease.target;
      const weightsProg = program(state, gl, "smaa-weights", SMAA_WEIGHTS_GLSL);
      draw(host, state, weightsProg, asGlTarget(weights), [
        asGlTarget(edges).colorHandle, state.smaa.area!, state.smaa.search!
      ], (g) => {
        g.uniform1i(g.getUniformLocation(weightsProg, "u_edges"), 0);
        g.uniform1i(g.getUniformLocation(weightsProg, "u_area"), 1);
        g.uniform1i(g.getUniformLocation(weightsProg, "u_search"), 2);
        g.uniform2f(g.getUniformLocation(weightsProg, "u_resolution"), 1 / w, 1 / h);
      });
      const blendedLease = scratch.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
      const blended = blendedLease.target;
      const blendProg = program(state, gl, "smaa-blend", SMAA_BLEND_GLSL);
      draw(host, state, blendProg, asGlTarget(blended), [
        asGlTarget(weights).colorHandle, asGlTarget(current).colorHandle
      ], (g) => {
        g.uniform1i(g.getUniformLocation(blendProg, "u_weights"), 0);
        g.uniform1i(g.getUniformLocation(blendProg, "u_color"), 1);
        g.uniform2f(g.getUniformLocation(blendProg, "u_resolution"), 1 / w, 1 / h);
      });
      scratch.release(edgesLease); scratch.release(weightsLease);
      replaceCurrent(blended, blendedLease);
    } else if (aaFxaa && (displayCustoms.length > 0 || nativeEffects.length > 0)) {
      // FXAA unfused: an after-tonemap custom already consumed the fused slot.
      recordStage("S11:fxaa");
      const aaLease = scratch.acquire({ width: w, height: h, format: "rgba8", samples: 1, depth: false });
      const aa = aaLease.target;
      const fxaaProg = program(state, gl, "fxaa-standalone-nodither",
        FXAA_185_FRAGMENT_GLSL.replace("#version 300 es", "#version 300 es\n#define AURA_FXAA_NO_DITHER"));
      draw(host, state, fxaaProg, asGlTarget(aa), [asGlTarget(current).colorHandle], (g) => {
        g.uniform1i(g.getUniformLocation(fxaaProg, "u_source"), 0);
        g.uniform2f(g.getUniformLocation(fxaaProg, "u_texelSize"), 1 / w, 1 / h);
        g.uniform2f(g.getUniformLocation(fxaaProg, "u_outputTexel"), 1 / w, 1 / h);
      });
      replaceCurrent(aa, aaLease);
    }

    // S12 — finalize: grain + RCAS + the single triangular dither.
    const prog = program(state, gl, p3 ? "post-finalize-p3" : "finalize", p3 ? FINALIZE_P3_GLSL : FINALIZE_GLSL);
    bindOut(host, outTarget, w, h);
    gl.useProgram(prog);
    gl.bindVertexArray(state.vao);
    resetFullscreenState(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, asGlTarget(current).colorHandle);
    gl.uniform1i(gl.getUniformLocation(prog, "u_source"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "u_outputAlphaMode"), outputAlphaMode);
    if (p3) gl.uniform1i(gl.getUniformLocation(prog, "u_ditherEnabled"), pipeline.dither ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(prog, "u_frame"), frameContext?.frameId ?? state.frameIndex);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainIntensity"), grain?.intensity ?? 0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainSize"), grain?.size ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_grainLuminanceResponse"), grain?.luminanceResponse ?? 1);
    gl.uniform1f(gl.getUniformLocation(prog, "u_rcasSharpness"), rcas);
    if (!outTarget) {
      try {
        if (p3) {
          host.device.assertEncodedDisplayTarget(current);
          assertEncodedDisplaySurfaceWritten(encodedSurface!, host.device, ldr);
          host.device.assertDisplayOutputScope("display-p3");
        } else host.device.assertSrgbOutputFallbackScope?.();
      }
      catch (error) {
        try { gl.bindVertexArray(null); } catch { /* Preserve the presentation failure. */ }
        try { host.stateCache.invalidate(); } catch { /* Preserve the presentation failure. */ }
        throw error;
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // T0-16: invalidate the bypassed state cache (see above) — the last v2
    // stage leaves GL nothing like the cache believes.
    host.stateCache.invalidate();
    scratch.release(currentLease);
    currentLease = undefined;
    for (const history of pendingHistory) history.commit();
  } catch (error) {
    for (const history of pendingHistory) {
      try { history.abort(); } catch { /* Preserve the failure that interrupted presentation. */ }
    }
    try { scratch.release(currentLease); } catch { /* Preserve the frame failure. */ }
    currentLease = undefined;
    host.stateCache.invalidate();
    throw error;
  }
  scratch.releaseAll();
  } catch (error) {
    try { scratch.releaseAll(); } catch { /* Preserve the frame failure. */ }
    throw error;
  }
}

/** Free one view's persistent post surfaces when its owner removes it. */
export function releaseNativePostEffectView(host: WebGL2DeviceHost, scopeId: object, viewId: string | number): void {
  const state = states.get(host);
  const views = state?.scopedPostBlackboards.get(scopeId);
  views?.delete(viewId);
  if (views?.size === 0) state?.scopedPostBlackboards.delete(scopeId);
  const histories = new Set<PostViewHistory<RenderTarget>>();
  if (state) { histories.add(state.exposureHistory); histories.add(state.effectHistory); }
  const pending = pendingPostDisposals.get(host);
  // The outer host disposal is already retiring these histories; a nested
  // view reset must not retry its failed targets within the same attempt.
  if (pending && !pending.running) for (const action of pending.actions) if (action.history) histories.add(action.history);
  const errors: unknown[] = [];
  for (const history of histories) {
    try { history.resetView(scopeId, viewId); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Native post view disposal failed");
}

/** Free all persistent post surfaces owned by a renderer sharing this host. */
export function releaseNativePostEffectScope(host: WebGL2DeviceHost, scopeId: object): void {
  const state = states.get(host);
  state?.scopedPostBlackboards.delete(scopeId);
  const histories = new Set<PostViewHistory<RenderTarget>>();
  if (state) { histories.add(state.exposureHistory); histories.add(state.effectHistory); }
  const pending = pendingPostDisposals.get(host);
  if (pending && !pending.running) for (const action of pending.actions) if (action.history) histories.add(action.history);
  const errors: unknown[] = [];
  for (const history of histories) {
    try { history.resetScope(scopeId); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "Native post scope disposal failed");
}

/** Called during host disposal or context loss; borrowed effect textures remain caller-owned. */
export function disposeNativePostEffects(host: WebGL2DeviceHost): void {
  const initialization = initializingPostStates.get(host);
  if (initialization) initialization.invalidated = true;
  const state = states.get(host);
  let cleanup = pendingPostDisposals.get(host);
  if (state) {
    // Detach before any callback: stale leases and late async uploads cannot
    // use this generation, including when cleanup reenters host disposal.
    states.delete(host);
    cleanup ??= pendingPostDisposal(host);
    const add = (release: () => void, history?: PostViewHistory<RenderTarget>): void => {
      cleanup!.actions.add({ release, history });
    };
    add(() => state.exposureHistory.dispose(), state.exposureHistory);
    add(() => state.effectHistory.dispose(), state.effectHistory);
    state.legacyPostBlackboard.clear();
    add(() => state.pool.dispose());
    const gl = host.gl;
    for (const program of state.programs.values()) add(() => gl.deleteProgram(program));
    state.programs.clear();
    add(() => gl.deleteVertexArray(state.vao));
    add(() => gl.deleteTexture(state.identityLut));
    if (state.blankTex !== state.identityLut) add(() => gl.deleteTexture(state.blankTex));
    if (state.smaa.area) { const area = state.smaa.area; add(() => gl.deleteTexture(area)); }
    if (state.smaa.search) { const search = state.smaa.search; add(() => gl.deleteTexture(search)); }
    for (const texture of state.lutTextures) {
      add(() => { gl.deleteTexture(texture); state.lutTextures.delete(texture); });
    }
    state.lutCache = undefined;
  }
  if (!cleanup || cleanup.running) return;
  // A reentrant disposal can enqueue a replacement state into this same
  // set. Set iteration visits it without retrying any failed action twice.
  const errors = runPostDisposals(host, cleanup, cleanup.actions);
  if (errors.length) throw new AggregateError(errors, "Native post effect disposal failed");
}

/**
 * GU47 E-E handoff H2: linear depth (RGBA32F `.r` = view-space metres, the S1
 * pass A program) for the LDR tail's `after-tonemap` customs that declare
 * `inputs` "depth", from the C-13 `sceneDepth` (the forward target's depth
 * texture; the present already resolved it). `null` — the pass keeps the 1×1
 * blank, as before — when no display custom reads depth or the frame has no
 * scene depth. The caller releases the target after the custom loop.
 */
function displayCustomLinearDepth(
  host: WebGL2DeviceHost,
  state: PostV2State,
  scratch: PostScratchScope,
  passes: readonly PostPassDescriptor[],
  frameContext: PostFrameContextBag | undefined,
  width: number,
  height: number
): PostTargetLease | null {
  if (!passes.some((pass) => pass.inputs.includes("depth"))) return null;
  const sceneDepth = frameContext?.sceneDepth;
  if (!sceneDepth?.available || !sceneDepth.texture) return null;
  const depthHandle = host.textureRegistry?.textures.get(sceneDepth.texture);
  if (!depthHandle) return null;
  const gl = host.gl;
  recordPostStage("S1:depth-prep:after-tonemap", frameContext?.diagnosticToken);
  const linZLease = scratch.acquire({ width, height, format: "rgba32f", samples: 1, depth: false });
  const linZ = linZLease.target;
  const linProg = program(state, gl, "depth-linearize", DEPTH_LINEARIZE_GLSL);
  draw(host, state, linProg, asGlTarget(linZ), [depthHandle], (g) => {
    g.uniform1i(g.getUniformLocation(linProg, "u_depth"), 0);
    g.uniform2f(g.getUniformLocation(linProg, "u_outputSize"), width, height);
    g.uniform2f(g.getUniformLocation(linProg, "u_jitterClip"), 0, 0);
    writeDepthUniforms(g, linProg, sceneDepth.linearize);
  });
  return linZLease;
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
  states.get(host)?.pool.release(target);
}

/** Acquire a pooled target from the v2 stage pool (LDR tail scratch). */
export function acquireV2Target(host: WebGL2DeviceHost, key: { readonly width: number; readonly height: number; readonly format: string }): RenderTarget {
  return v2State(host).pool.acquire({ ...key, samples: 1, depth: false });
}

/** Acquire a v2 target with a release bound to this exact acquisition. */
export function acquireV2TargetLease(host: WebGL2DeviceHost, key: { readonly width: number; readonly height: number; readonly format: string }): PostTargetLease {
  return v2State(host).pool.acquireLease({ ...key, samples: 1, depth: false });
}
