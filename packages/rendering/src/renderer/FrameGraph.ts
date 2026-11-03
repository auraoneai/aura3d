// C-01 seam (PR 0b) — frame contributor phase-hook dispatcher. CONTRACTS.md §C-01.
// File: packages/rendering/src/renderer/FrameGraph.ts — owner lane 01.
//
// Called from Renderer.render / Renderer.renderAsync at the phase boundaries listed
// in CONTRACTS.md ("collect" after collectRenderItemsWithDiagnostics, "shadows" after
// executeRendererShadowMap, "background" between EnvironmentBackgroundPass and
// ForwardPass, "after-opaque"/"transmission"/"transparent"/"after-transparent" after
// ForwardPass, "post-hdr" before executePostprocess, "after-output" after it).
// With zero registered contributors every entry point is a no-op: no passes are
// added, no draws happen, and the frame is pixel-identical.

import { Scene, identityMat4, invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { RenderGraph } from "../RenderGraph";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { RenderPass } from "../RenderPass";
import type { RenderItem } from "../ForwardPass";
import type { RenderSource } from "../contracts/renderSource";
import type { Texture } from "../Texture";
import { isContactShadowShadingPass } from "../shadows/contactPassTrust";
import { createTrustedQrFlags, type QrFlags } from "../contracts/core";
import { QUALITY_TIERS, type AuraQualityTierSettings } from "../contracts/quality";
import type { DepthClipRange, DepthConvention, DepthMode } from "../DepthConvention";
import {
  frameContributors,
  type AuraFramePhase,
  type FrameCamera,
  type FrameContributor,
  type FrameContributorContext,
  type TransparentQueueItem
} from "../contracts/frameGraph";

const EMPTY_QR_FLAGS: QrFlags = createTrustedQrFlags({});

// A benchmark cannot infer what an arbitrary contributor draws from its ID or
// phase. Providers may attest that their specific pass factory only produces
// non-object work for the listed phases. Replacements are untrusted.
const benchmarkNonSceneContributors = new WeakMap<FrameContributor, { readonly passes: FrameContributor["passes"]; readonly phases: ReadonlySet<AuraFramePhase> }>();
export function registerBenchmarkNonSceneContributor(contributor: FrameContributor, phases: readonly AuraFramePhase[]): void {
  benchmarkNonSceneContributors.set(contributor, { passes: contributor.passes, phases: new Set(phases) });
}
function benchmarkPassesAreNonScene(contributor: FrameContributor, phase: AuraFramePhase): boolean {
  const proof = benchmarkNonSceneContributors.get(contributor);
  return !!proof && proof.passes === contributor.passes && proof.phases.has(phase);
}

let defaultQrFlags: QrFlags = EMPTY_QR_FLAGS;

// T0-28: per-renderer flag seam. Flags resolve per device so two mounted
// renderers with different `a3d-qr` values cannot stampede each other —
// rasterization decision points (Renderer/ForwardPass) always read through
// the device. The module-level default remains for ambient readers
// (back-compat; engine sets it at mount alongside the scoped entry).
const qrFlagsByDevice = new WeakMap<RenderDevice, QrFlags>();
const qrFlagsVersionByDevice = new WeakMap<RenderDevice, object>();
let defaultQrFlagsVersion: object = {};

interface RendererFlagBinding {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly flags: QrFlags;
  readonly temporary: boolean;
  readonly baseVersion: object;
  readonly version: object;
  valid: boolean;
  currentFlags: QrFlags;
  currentVersion: object;
  beginningFrame: boolean;
}

// The owner is a renderer-private capability, not its public post scope.
// Versions can be inspected, but cannot be used to open a renderer operation.
const activeRendererFlagBindings = new WeakMap<RenderDevice, RendererFlagBinding>();
const lastRendererFlagBindings = new WeakMap<RenderDevice, RendererFlagBinding>();
const rendererFlagVersions = new WeakMap<object, RendererFlagBinding>();

function unscopedQrFlags(device?: RenderDevice): QrFlags {
  return (device ? qrFlagsByDevice.get(device) : undefined) ?? defaultQrFlags;
}

function unscopedQrFlagsVersion(device?: RenderDevice): object {
  return device && qrFlagsByDevice.has(device) ? qrFlagsVersionByDevice.get(device)! : defaultQrFlagsVersion;
}

/** Engine-side wiring: set once flags resolve (createAuraApp / createGameApp). */
export function setRendererQrFlags(flags: QrFlags, device?: RenderDevice): void {
  if (device) {
    const active = activeRendererFlagBindings.get(device);
    if (active) {
      // A real temporary PRD07 binding restores the underlying device flags.
      // Otherwise preserve the pre-existing setter semantics: changes made by
      // a contributor remain installed after the renderer operation.
      const changed = active.temporary ? active.currentFlags !== flags : qrFlagsByDevice.get(device) !== flags;
      if (changed) {
        active.valid = false;
        active.currentVersion = {};
      }
      active.currentFlags = flags;
      if (!active.temporary) {
        if (changed) qrFlagsVersionByDevice.set(device, {});
        qrFlagsByDevice.set(device, flags);
      }
      return;
    }
    if (qrFlagsByDevice.get(device) !== flags) qrFlagsVersionByDevice.set(device, {});
    qrFlagsByDevice.set(device, flags);
  } else {
    if (defaultQrFlags !== flags) defaultQrFlagsVersion = {};
    defaultQrFlags = flags;
  }
}

export function rendererQrFlags(device?: RenderDevice): QrFlags {
  return (device ? activeRendererFlagBindings.get(device)?.currentFlags : undefined) ?? unscopedQrFlags(device);
}

/** Identity changes whenever the effective flag binding is replaced. */
export function rendererQrFlagsVersion(device?: RenderDevice): object {
  return (device ? activeRendererFlagBindings.get(device)?.currentVersion : undefined) ?? unscopedQrFlagsVersion(device);
}

/**
 * Internal renderer operation binding. Entering or leaving this binding is not
 * a flag mutation; an actual set, another owner, or a nested operation is.
 */
export function beginRendererQrFlagBinding(device: RenderDevice, owner: object, override?: QrFlags): () => void {
  const active = activeRendererFlagBindings.get(device);
  if (active) {
    active.valid = false;
    throw new Error("RENDERER_QR_SCOPE_BUSY");
  }
  const baseFlags = unscopedQrFlags(device);
  const flags = override ?? baseFlags;
  const temporary = override !== undefined && override !== baseFlags;
  const baseVersion = unscopedQrFlagsVersion(device);
  let binding = lastRendererFlagBindings.get(device);
  if (!binding || !binding.valid || binding.owner !== owner || binding.flags !== flags || binding.temporary !== temporary || binding.baseVersion !== baseVersion) {
    if (binding) binding.valid = false;
    const version = {};
    binding = { device, owner, flags, temporary, baseVersion, version, valid: true, currentFlags: flags, currentVersion: version, beginningFrame: false };
    lastRendererFlagBindings.set(device, binding);
    rendererFlagVersions.set(version, binding);
  }
  activeRendererFlagBindings.set(device, binding);
  const entered = binding;
  return () => {
    if (activeRendererFlagBindings.get(device) !== entered) {
      entered.valid = false;
      return;
    }
    if (entered.beginningFrame || unscopedQrFlagsVersion(device) !== entered.baseVersion) entered.valid = false;
    activeRendererFlagBindings.delete(device);
  };
}

/**
 * A sealed renderer proof may survive its own intentional scope restoration,
 * but not a real flag mutation or another renderer operation. This never
 * authorizes a draw: draw validation still requires the live frame token.
 */
export function rendererQrSealedBindingCurrent(device: RenderDevice, flags: QrFlags, version: object): boolean {
  const binding = rendererFlagVersions.get(version);
  if (!binding) return rendererQrFlags(device) === flags && rendererQrFlagsVersion(device) === version;
  const active = activeRendererFlagBindings.get(device);
  return binding.device === device && binding.flags === flags && binding.valid
    && lastRendererFlagBindings.get(device) === binding && unscopedQrFlagsVersion(device) === binding.baseVersion
    && (!active || (active === binding && active.currentFlags === flags && active.currentVersion === version));
}

/** Whether this version was issued by the renderer operation binding. */
export function rendererQrIsScopedBinding(device: RenderDevice, flags: QrFlags, version: object): boolean {
  const binding = rendererFlagVersions.get(version);
  return !!binding && binding.device === device && binding.flags === flags;
}

/** Verify the renderer-private capability without exposing it through a proof. */
function rendererQrBindingOwnedBy(device: RenderDevice, version: object, owner: object | undefined): boolean {
  const binding = rendererFlagVersions.get(version);
  return !!owner && !!binding && binding.owner === owner && rendererQrSealedBindingCurrent(device, binding.flags, version);
}

interface RendererProofAccess {
  readonly binding: RendererFlagBinding;
  readonly history: object;
  readonly view: unknown;
  readonly frame: unknown;
  readonly action: "prepare" | "commit";
  consumed: boolean;
}
const rendererProofAccess = new WeakMap<RenderDevice, RendererProofAccess>();

/** Renderer-only lexical authorization; the private owner is never handed to a history method. */
export function withRendererQrProofAccess<T>(device: RenderDevice, owner: object, history: object, view: unknown,
  frame: unknown, action: RendererProofAccess["action"], fn: () => T): T {
  const binding = lastRendererFlagBindings.get(device);
  if (!binding || !rendererQrBindingOwnedBy(device, binding.version, owner)) return fn();
  if (rendererProofAccess.has(device)) throw new Error("RENDERER_TEMPORAL_PROOF_BUSY");
  const access: RendererProofAccess = { binding, history, view, frame, action, consumed: false };
  rendererProofAccess.set(device, access);
  try { return fn(); }
  finally { if (rendererProofAccess.get(device) === access) rendererProofAccess.delete(device); }
}

export function consumeRendererQrProofAccess(device: RenderDevice, version: object, history: object, view: unknown,
  frame: unknown, action: RendererProofAccess["action"]): boolean {
  const access = rendererProofAccess.get(device);
  if (!access || access.consumed || access.binding.version !== version || access.history !== history ||
      access.view !== view || access.frame !== frame || access.action !== action ||
      !rendererQrBindingOwnedBy(device, version, access.binding.owner)) return false;
  access.consumed = true;
  return true;
}

type RendererPostAction = "register" | "unregister" | "begin" | "begin-pass" | "end-pass" | "finish" | "abort";
interface RendererPostAccess {
  readonly scope: object;
  readonly action: RendererPostAction;
  readonly frame: number | undefined;
  readonly view: string | number | undefined;
  readonly token: object | undefined;
  consumed: boolean;
}
const rendererPostOwners = new WeakMap<RenderDevice, WeakMap<object, object>>();
const rendererPostAccess = new WeakMap<RenderDevice, RendererPostAccess>();

export function installRendererPostOwner(device: RenderDevice, scope: object, owner: object): void {
  let scopes = rendererPostOwners.get(device);
  if (!scopes) { scopes = new WeakMap(); rendererPostOwners.set(device, scopes); }
  if (scopes.has(scope)) throw new Error("RENDERER_POST_SCOPE_BUSY");
  scopes.set(scope, owner);
}

export function removeRendererPostOwner(device: RenderDevice, scope: object, owner: object): void {
  const scopes = rendererPostOwners.get(device);
  if (scopes?.get(scope) === owner) scopes.delete(scope);
}

/** Keep the owner capability out of replaceable device methods and callbacks. */
export function withRendererPostAccess<T>(device: RenderDevice, scope: object, owner: object, action: RendererPostAction,
  frame: number | undefined, view: string | number | undefined, token: object | undefined, fn: () => T): T {
  if (rendererPostOwners.get(device)?.get(scope) !== owner || rendererPostAccess.has(device)) {
    throw new Error("RENDERER_POST_SCOPE_UNAUTHORIZED");
  }
  const access: RendererPostAccess = { scope, action, frame, view, token, consumed: false };
  rendererPostAccess.set(device, access);
  try { return fn(); }
  finally { if (rendererPostAccess.get(device) === access) rendererPostAccess.delete(device); }
}

export function consumeRendererPostAccess(device: RenderDevice, scope: object, action: RendererPostAction,
  frame?: number, view?: string | number, token?: object): boolean {
  const access = rendererPostAccess.get(device);
  if (!access || access.consumed || access.scope !== scope || access.action !== action || access.frame !== frame ||
      access.view !== view || access.token !== token) return false;
  access.consumed = true;
  return true;
}

/** True only for the renderer's exact, synchronous beginFrame call. */
export function rendererQrFrameBeginAuthorized(device: RenderDevice, version: object): boolean {
  const active = activeRendererFlagBindings.get(device);
  return !!active && active.version === version && active.valid && active.beginningFrame
    && active.currentVersion === version && unscopedQrFlagsVersion(device) === active.baseVersion;
}

/** Only the renderer holding its private owner identity can authorize a begin. */
export function withRendererQrFrameBegin<T>(device: RenderDevice, owner: object, fn: () => T): T {
  const active = activeRendererFlagBindings.get(device);
  if (!active || active.owner !== owner) return fn();
  if (!active.valid || active.beginningFrame) throw new Error("RENDERER_QR_SCOPE_BUSY");
  active.beginningFrame = true;
  try { return fn(); }
  finally { active.beginningFrame = false; }
}

/**
 * T0-28: run `fn` with the ambient default bound to `device`'s scoped flags so
 * device-less `rendererQrFlags()` readers inside a synchronous frame see this
 * renderer's flags. No scoped entry → `fn` runs unchanged. Restores after.
 */
export function withRendererQrFlags<T>(device: RenderDevice, fn: () => T): T {
  const scoped = activeRendererFlagBindings.get(device)?.currentFlags ?? qrFlagsByDevice.get(device);
  if (!scoped || scoped === defaultQrFlags) return fn();
  const previous = defaultQrFlags;
  defaultQrFlags = scoped;
  try {
    return fn();
  } finally {
    defaultQrFlags = previous;
  }
}

/** Minimal resolved-camera shape produced by Renderer.resolveCamera. */
export interface ResolvedCameraInput {
  readonly viewProjectionMatrix: Mat4;
  readonly viewMatrix?: Mat4;
  /** The camera's own projection when it carries one (CameraLike objects that are not `Camera` instances). */
  readonly projectionMatrix?: Mat4;
  /**
   * The engine's shader view / projection (`compiler/renderInput.ts` CameraLike carries only these and the
   * view-projection). Used when the camera has no `viewMatrix` / `projectionMatrix` of its own.
   */
  readonly shaderViewMatrix?: Mat4;
  readonly shaderProjectionMatrix?: Mat4;
  readonly camera?: unknown;
  readonly cameraPosition?: readonly [number, number, number];
  /** Explicit metadata takes precedence over legacy finite-matrix inference. */
  readonly projectionMetadata?: FrameProjectionMetadata;
  readonly projectionMatrixInverse?: Mat4;
  readonly depthConvention?: DepthConvention;
}

export interface FrameProjectionMetadata {
  readonly kind: "perspective" | "orthographic" | "custom";
  readonly near?: number;
  readonly far?: number;
  readonly mode: DepthMode;
  readonly clipRange: DepthClipRange;
}

const toF32 = (value: Float32Array | readonly number[]): Float32Array =>
  value instanceof Float32Array ? value : Float32Array.from(value);

/**
 * The frame camera's projection: the camera's own matrix, else P = VP · V⁻¹ from the view-projection and view the
 * resolver always has. GU47 phase 2: cameras that are not `Camera` instances (the app cameras) fell through to the
 * identity, which made the planar-reflection oblique clip throw every frame (aura-hoops-3d `world.water`) and fed
 * an identity projection to GTAO, the SSR trace, contact shadows and volumetric fog.
 */
function frameProjection(own: Mat4 | undefined, viewProjection: Mat4, view: Mat4 | undefined): Mat4 {
  if (own) return own;
  if (!view) return identityMat4();
  const derived = multiplyMat4(viewProjection, invertMat4(view));
  return derived.every(Number.isFinite) ? derived : identityMat4();
}

/** Near/far of a column-major OpenGL perspective projection (m[11] = -1, m[15] = 0); undefined for other shapes. */
function perspectiveClip(p: Mat4): { near: number; far: number } | undefined {
  if (Math.abs(p[11]! + 1) > 1e-4 || Math.abs(p[15]!) > 1e-4) return undefined;
  const near = p[14]! / (p[10]! - 1);
  const far = p[14]! / (p[10]! + 1);
  return Number.isFinite(near) && Number.isFinite(far) && near > 0 && far > near ? { near, far } : undefined;
}

/** Near/far of a column-major OpenGL orthographic projection (m[11] = 0, m[15] = 1); undefined for other shapes. */
function orthographicClip(p: Mat4): { near: number; far: number } | undefined {
  if (Math.abs(p[11]!) > 1e-4 || Math.abs(p[15]! - 1) > 1e-4 || p[10] === 0) return undefined;
  const near = (p[14]! + 1) / p[10]!;
  const far = (p[14]! - 1) / p[10]!;
  return Number.isFinite(near) && Number.isFinite(far) && far > near ? { near, far } : undefined;
}

/** Best-effort FrameCamera for the PR 0b stub; PRD 01 publishes real history later. */
export function toFrameCamera(
  resolvedCamera: ResolvedCameraInput | undefined,
  cameraViewProjection: Mat4 | undefined,
  cameraPosition: readonly [number, number, number] | undefined
): FrameCamera | null {
  if (!resolvedCamera) return null;
  const cam = resolvedCamera.camera as {
    readonly projectionMatrix?: Mat4;
    readonly projectionMatrixInverse?: Mat4;
    readonly projectionMetadata?: FrameProjectionMetadata;
    readonly depthConvention?: DepthConvention;
    readonly near?: number;
    readonly far?: number;
    readonly projection?: "perspective" | "orthographic";
  } | undefined;
  const viewProjection = cameraViewProjection ?? resolvedCamera.viewProjectionMatrix;
  // GU47 phase 2 (receipt effects-ssr): app cameras reach here as the engine's CameraLike, which carries only the
  // shader view / projection; without them the frame camera had an identity view and projection (the S3 trace
  // projected every ray off screen) and the 0.1/1000 clip guess instead of the engine's planes (S1 linear depth,
  // and with it DOF, GTAO, S4 and TAA disocclusion, read about 2x too far).
  const view = resolvedCamera.viewMatrix ?? resolvedCamera.shaderViewMatrix;
  // The resolved matrices are a frame snapshot. The original scene camera can
  // be updated again during collection, so prefer the captured projection over
  // the live camera's matrix just as we already do for the view and metadata.
  const capturedProjection = resolvedCamera.projectionMatrix;
  const projection = frameProjection(capturedProjection ?? cam?.projectionMatrix ?? resolvedCamera.shaderProjectionMatrix, viewProjection, view);
  const metadata = resolvedCamera.projectionMetadata ?? cam?.projectionMetadata;
  // Inference is for legacy standard WebGL cameras only. A declared convention
  // must never be mistaken for standard finite projection coefficients.
  const ortho = !metadata && cam?.projection === undefined ? orthographicClip(projection) : undefined;
  const clip = !metadata && (cam?.near === undefined || cam?.far === undefined) ? perspectiveClip(projection) ?? ortho : undefined;
  // Metadata describes the matrix already supplied by the caller; deriving its
  // decoding parameters here is not a device capability check. The renderer
  // must negotiate before drawing and should supply the resulting convention.
  const mode = metadata?.mode ?? "standard";
  const depth: DepthConvention = resolvedCamera.depthConvention ?? cam?.depthConvention ?? {
    mode, requestedMode: mode, clipRange: metadata?.clipRange ?? "minus-one-to-one",
    clearValue: mode === "reversed" ? 0 : 1,
    compare: mode === "reversed" ? "greater-equal" : "less-equal",
    biasSign: mode === "reversed" ? -1 : 1
  };
  if (metadata && (metadata.mode !== depth.mode || metadata.clipRange !== depth.clipRange)) {
    throw new Error("FRAME_DEPTH_CONVENTION_MISMATCH: the camera projection must be rebuilt for the negotiated depth mode and clip range.");
  }
  // A live camera inverse must not be paired with a different captured
  // projection. Derive it from the selected matrix when the snapshot omits it.
  let projectionInverse: Mat4 | undefined = resolvedCamera.projectionMatrixInverse
    ?? (capturedProjection === undefined && cam?.projectionMatrix !== undefined ? cam.projectionMatrixInverse : undefined);
  if (!projectionInverse) {
    try { projectionInverse = invertMat4(projection); } catch { /* A legacy custom camera may supply a singular matrix. */ }
  }
  return {
    viewMatrix: view ? toF32(view) : toF32(identityMat4()),
    projectionMatrix: toF32(projection),
    viewProjectionMatrix: toF32(viewProjection),
    previousViewProjectionMatrix: null,
    near: metadata?.near ?? cam?.near ?? clip?.near ?? 0.1,
    far: metadata?.far ?? cam?.far ?? clip?.far ?? 1000,
    projection: metadata?.kind === "perspective" || metadata?.kind === "orthographic"
      ? metadata.kind : cam?.projection ?? (ortho ? "orthographic" : "perspective"),
    ...(projectionInverse ? { projectionMatrixInverse: toF32(projectionInverse) } : {}),
    depth,
    position: cameraPosition ?? resolvedCamera.cameraPosition ?? [0, 0, 0]
  };
}

export interface RendererFrameHooksInput {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly source: RenderSource | Scene | Iterable<RenderItem>;
  readonly camera: FrameCamera | null;
  readonly rasterViewportIsFull?: boolean;
  readonly frameIndex?: number;
  /** Explicit frame owner and temporal AA state for per-draw contributors. */
  readonly postScopeId?: object;
  readonly viewId?: string | number;
  readonly temporalAntialiasing?: boolean;
  /** One renderer-owned clock sample shared by every pass of the frame. */
  readonly timeSeconds?: number;
  readonly tier?: AuraQualityTierSettings;
  /** Per-frame flags override (C-05 legacy-post route); defaults to the device's resolved flags. */
  readonly flags?: QrFlags;
  /** Internal frame owners register each fresh context before a contributor sees it. */
  readonly onContext?: (context: FrameContributorContext) => void;
  /** Revalidate a frame owner after asynchronous contributor work. */
  readonly assertCurrent?: () => void;
}

/** C-01 blackboard key for the forward color target (R-01-1). */
export const PRD01_FORWARD_TARGET = "prd01.forwardTarget";

/** C-13 (Q-03-1): lane 03 publishes grade × auto-exposure here; OutputPass multiplies it in. */
export const PRD03_EXPOSURE = "prd03.exposure";

/** C-01 (§8.4 step 1): resolved scene-depth copy target published for after-opaque consumers. */
export const AURA_SCENE_DEPTH_COPY = "aura.scene.depth.copy";

class ContributorTransparentPass extends BaseRenderPass {
  constructor(
    private readonly queue: readonly TransparentQueueItem[],
    private readonly frame: FrameContributorContext
  ) {
    super("qr.contributor.transparents", [], ["aura.scene.color"]);
  }

  execute(_context: RenderPassContext): void {
    for (const item of this.queue) {
      item.draw(this.frame);
    }
  }
}

/** The renderer's per-frame selective-bloom state, as the contributor observation sees it. */
interface SelectiveBloomObservedFrame {
  valid: boolean;
  invalidReason?: string;
  readonly weights?: WeakMap<RenderItem, number>;
  setSignalWrite?: (enabled: boolean) => void;
}

/**
 * A contributor's id for a selective-bloom fallback reason. Reads only an own
 * data property (never a getter); anything unusual reports as "unnamed".
 */
export function selectiveContributorTag(contributor: FrameContributor): string {
  const id: unknown = Object.getOwnPropertyDescriptor(contributor, "id")?.value;
  return typeof id === "string" && /^[\w.:-]{1,64}$/.test(id) ? id : "unnamed";
}

export class RendererFrameHooks {
  private readonly flags: QrFlags;
  private readonly blackboard = new Map<string, unknown>();
  private readonly frameIndex: number;
  private extraSceneGeometryPossible = false;
  private readonly phasePassCounts = new Map<AuraFramePhase, number>();
  private readonly contactGraphContributorPasses: RenderPass[] = [];
  private contactGraphHasTransparentQueue = false;
  readonly timeSeconds: number;
  private readonly renderSource: RenderSource;
  private readonly rasterViewProjectionMatrix: Float32Array | undefined;
  private rasterViewportIsFull: boolean | undefined;
  private selectiveObservation?: {
    readonly frame: SelectiveBloomObservedFrame;
    readonly contract: (contributor: FrameContributor) => "offscreen" | "empty-output" | null;
  };

  constructor(private readonly input: RendererFrameHooksInput) {
    this.flags = input.flags ?? rendererQrFlags(input.device);
    this.frameIndex = input.frameIndex ?? 0;
    let sample = input.timeSeconds ?? (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000);
    if (!Number.isFinite(sample)) sample = Date.now() / 1000;
    if (!Number.isFinite(sample)) throw new RangeError("FRAME_TIME_INVALID");
    this.timeSeconds = sample;
    // Keep the changing raster matrix separate from the caller's camera. Passes
    // planned before temporal jitter retain this frame-local array reference.
    this.rasterViewProjectionMatrix = input.camera ? Float32Array.from(input.camera.viewProjectionMatrix) : undefined;
    this.rasterViewportIsFull = input.rasterViewportIsFull;
    const source = input.source;
    this.renderSource = source instanceof Scene
      ? { scene: source }
      : typeof source === "object" && Symbol.iterator in source
        ? { renderItems: source }
        : source;
  }

  private forwardTarget: RenderTarget | null = null;

  /**
   * R-01-1: the Renderer hands the forward color target in after
   * `ensureForwardColorTarget`; `ctx.sceneDepth` then exposes the real depth
   * texture and the blackboard publishes it at `"prd01.forwardTarget"`.
   */
  setForwardTarget(target: RenderTarget | null): void {
    if (target !== this.forwardTarget) this.sceneDepthCoverage = null;
    this.forwardTarget = target;
    if (!target) this.blackboard.delete(PRD01_FORWARD_TARGET);
  }

  /** Observe the real callbacks once; never call them speculatively. */
  observeSelectiveBloom(
    frame: SelectiveBloomObservedFrame,
    contract: (contributor: FrameContributor) => "offscreen" | "empty-output" | null
  ): void {
    this.selectiveObservation = { frame, contract };
  }

  /** The first reason is kept (reported as POST_SELECTIVE_BLOOM_UNAVAILABLE:<reason>). */
  private invalidateSelective(reason: string): void {
    const frame = this.selectiveObservation?.frame;
    if (!frame) return;
    if (frame.valid) {
      frame.invalidReason = reason;
      frame.setSignalWrite?.(false);
    }
    frame.valid = false;
  }

  private selectiveContract(contributor: FrameContributor): "offscreen" | "empty-output" | null {
    const observation = this.selectiveObservation;
    if (!observation) return null;
    const contract = observation.contract(contributor);
    if (!contract) this.invalidateSelective(`frame-contributor:${selectiveContributorTag(contributor)}`);
    return contract;
  }

  /** Any emitted pass of an empty-output contributor, or any post-hdr pass, writes without the signal. */
  private observePasses(contributor: FrameContributor, phase: AuraFramePhase, passes: unknown): void {
    if (!this.selectiveObservation) return;
    const contract = this.selectiveContract(contributor);
    const emitted = !Array.isArray(passes) || passes.length > 0;
    if (emitted && (phase === "post-hdr" || contract !== "offscreen")) this.invalidateSelective(`frame-contributor-output:${selectiveContributorTag(contributor)}`);
  }

  private observeQueue(contributor: FrameContributor, queue: unknown): void {
    if (!this.selectiveObservation) return;
    this.selectiveContract(contributor);
    if (queue !== undefined && queue !== null && (!Array.isArray(queue) || queue.length > 0)) this.invalidateSelective(`frame-contributor-output:${selectiveContributorTag(contributor)}`);
  }

  private sceneDepthCopy: RenderTarget | null = null;
  private sceneDepthCoverage: Texture | null = null;

  /** Publish the final camera matrix to passes already planned for this frame. */
  setRasterViewProjectionMatrix(matrix: Float32Array | readonly number[] | undefined): void {
    if (!matrix || !this.rasterViewProjectionMatrix) return;
    if (matrix.length !== 16 || !Array.from(matrix).every(Number.isFinite)) throw new RangeError("FRAME_RASTER_MATRIX_INVALID");
    this.rasterViewProjectionMatrix.set(matrix);
  }

  setRasterViewportIsFull(value: boolean): void {
    this.rasterViewportIsFull = value;
  }

  /** Lane 01 publishes the scene-depth copy target before the after-opaque phase. */
  setSceneDepthCopy(target: RenderTarget | null): void {
    this.sceneDepthCopy = target;
    if (target) this.blackboard.set(AURA_SCENE_DEPTH_COPY, target);
    else this.blackboard.delete(AURA_SCENE_DEPTH_COPY);
  }

  /** Publish the producer's resolved per-view coverage; null means unavailable. */
  setSceneDepthCoverage(coverage: Texture | null): void {
    const width = this.forwardTarget?.width ?? this.input.width;
    const height = this.forwardTarget?.height ?? this.input.height;
    if (coverage && (coverage.disposed || coverage.width !== width || coverage.height !== height)) {
      throw new RangeError("Scene depth coverage must be a live texture matching the view target dimensions.");
    }
    this.sceneDepthCoverage = coverage;
  }

  /** Read a blackboard value published by a contributor (or lane 01 itself). */
  blackboardValue<T>(key: string): T | undefined {
    return this.blackboard.get(key) as T | undefined;
  }

  /**
   * §6.2.7: publish the frame's forward output encoding as
   * `"prd01.outputColorSpace"` — "linear" when the frame renders into an HDR
   * target that a later pass encodes (postprocess chain or OutputPass), else
   * the legacy in-shader "srgb" encode. Lane passes (particles, beams,
   * ribbons) read it through `resolveOutputColorSpace`; nothing published it,
   * so they sRGB/filmic-encoded into the linear HDR target and were encoded a
   * second time downstream (washed-out, near-white particles).
   */
  setOutputColorSpace(space: "linear" | "srgb"): void {
    this.blackboard.set("prd01.outputColorSpace", space);
  }

  /**
   * The last context built, reused while every input it captures is unchanged: each phase and each contributor
   * asks for one, and the fields below are the only ones that change during a frame (the rest are fixed inputs).
   */
  private contextCache: {
    readonly items: readonly RenderItem[];
    readonly depthTexture: Texture | null;
    readonly coverage: Texture | null;
    readonly rasterViewportIsFull: boolean | undefined;
    readonly context: FrameContributorContext;
  } | undefined;

  private context(items: readonly RenderItem[]): FrameContributorContext {
    const depthTexture = this.forwardTarget?.depthTexture ?? null;
    if (this.forwardTarget) {
      this.blackboard.set(PRD01_FORWARD_TARGET, this.forwardTarget);
    }
    const cached = this.contextCache;
    if (cached && cached.items === items && cached.depthTexture === depthTexture && cached.coverage === this.sceneDepthCoverage
      && cached.rasterViewportIsFull === this.rasterViewportIsFull) {
      this.input.onContext?.(cached.context);
      return cached.context;
    }
    // Same fields, same order and the same absent-vs-present optionals as an object literal with conditional
    // spreads, without the temporary objects; the scene-depth record is shared while its inputs are unchanged.
    const context: { -readonly [K in keyof FrameContributorContext]?: FrameContributorContext[K] } = {};
    if (this.input.postScopeId) context.postScopeId = this.input.postScopeId;
    if (this.input.viewId !== undefined) context.viewId = this.input.viewId;
    if (this.input.temporalAntialiasing !== undefined) context.temporalAntialiasing = this.input.temporalAntialiasing;
    context.device = this.input.device;
    context.width = this.input.width;
    context.height = this.input.height;
    context.frameIndex = this.frameIndex;
    context.timeSeconds = this.timeSeconds;
    context.camera = this.input.camera;
    if (this.rasterViewProjectionMatrix) context.rasterViewProjectionMatrix = this.rasterViewProjectionMatrix;
    if (this.rasterViewportIsFull !== undefined) context.rasterViewportIsFull = this.rasterViewportIsFull;
    context.source = this.renderSource;
    context.items = items;
    context.tier = this.input.tier ?? QUALITY_TIERS.high;
    context.flags = this.flags;
    context.sceneDepth = cached && cached.depthTexture === depthTexture && cached.coverage === this.sceneDepthCoverage
      ? cached.context.sceneDepth
      : {
          texture: depthTexture,
          coverage: this.sceneDepthCoverage,
          available: depthTexture !== null,
          linearize: {
            near: this.input.camera?.near ?? 0.1,
            far: this.input.camera?.far ?? 1000,
            orthographic: this.input.camera?.projection === "orthographic",
            ...(this.input.camera?.depth ? { depth: this.input.camera.depth } : {}),
            ...(this.input.camera?.projectionMatrixInverse ? { projectionMatrixInverse: this.input.camera.projectionMatrixInverse } : {})
          }
        };
    context.blackboard = this.blackboard;
    const built = context as FrameContributorContext;
    this.contextCache = { items, depthTexture, coverage: this.sceneDepthCoverage, rasterViewportIsFull: this.rasterViewportIsFull, context: built };
    this.input.onContext?.(built);
    return built;
  }

  /** "collect" phase — contributor item-list transforms, applied in order. */
  frameContext(items: readonly RenderItem[]): FrameContributorContext {
    return this.context(items);
  }

  /** Whether contributor work outside shadow/post phases can add untracked scene geometry. */
  hasExtraSceneGeometry(): boolean { return this.extraSceneGeometryPossible; }
  hasPasses(phase: AuraFramePhase): boolean { return (this.phasePassCounts.get(phase) ?? 0) > 0; }

  /** The graph runs synchronously, but its dependency sort may interleave any
   * contributor pass with contact predepth and the last forward receiver.
   * Only the exact attested contact producer is currently proven not to
   * mutate the shared depth participants during that interval. */
  contactGraphIsSafe(): boolean {
    return !this.contactGraphHasTransparentQueue && this.contactGraphContributorPasses.length === 1
      && isContactShadowShadingPass(this.contactGraphContributorPasses[0]!);
  }

  /** "collect" phase — contributor item-list transforms, applied in order. */
  collect(items: readonly RenderItem[], validate?: (items: readonly RenderItem[]) => void): readonly RenderItem[] {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return items;
    let out = items;
    for (const contributor of contributors) {
      if (!contributor.phases.includes("collect") || !contributor.collect) continue;
      this.selectiveContract(contributor);
      const next = contributor.collect([...out], this.context(out));
      if (next) {
        const observation = this.selectiveObservation;
        if (observation) {
          // Audited stock collects retain order and only probe assignment
          // clones items. Carry the renderer's private batching weights along
          // that exact correspondence; a changed cardinality is ambiguous.
          if (next.length !== out.length) this.invalidateSelective(`frame-contributor-items:${selectiveContributorTag(contributor)}`);
          else if (observation.frame.weights) {
            for (let index = 0; index < out.length; index += 1) {
              const weight = observation.frame.weights.get(out[index]!);
              if (weight !== undefined) observation.frame.weights.set(next[index]!, weight);
            }
          }
          this.selectiveContract(contributor);
        }
        out = next;
      }
      validate?.(out);
    }
    return out;
  }

  /** Graph-attached phases — contributor passes appended to the render graph. */
  addPasses(graph: RenderGraph, phase: AuraFramePhase, items: readonly RenderItem[], wrap?: (pass: import("../RenderPass").RenderPass) => import("../RenderPass").RenderPass): readonly string[] {
    return withRendererQrFlags(this.input.device, () => this.addPassesScoped(graph, phase, items, wrap));
  }

  private addPassesScoped(graph: RenderGraph, phase: AuraFramePhase, items: readonly RenderItem[], wrap?: (pass: import("../RenderPass").RenderPass) => import("../RenderPass").RenderPass): readonly string[] {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return [];
    const ctx = this.context(items);
    const writtenResources: string[] = [];
    // Every contributor's transparent queue rides ONE graph pass: pass names
    // and resource writers are unique per graph, so a pass per contributor
    // threw "Render pass already exists" (failing the mount) as soon as two
    // contributors queued transparents in one frame (particles + beams).
    const transparentQueue: TransparentQueueItem[] = [];
    for (const contributor of contributors) {
      if (!contributor.phases.includes(phase)) continue;
      this.selectiveContract(contributor);
      const passes = contributor.passes?.(phase, ctx) ?? [];
      if (this.selectiveObservation) this.observePasses(contributor, phase, passes);
      this.phasePassCounts.set(phase, (this.phasePassCounts.get(phase) ?? 0) + passes.length);
      if (passes.length && !benchmarkPassesAreNonScene(contributor, phase)) this.extraSceneGeometryPossible = true;
      for (const pass of passes) {
        this.contactGraphContributorPasses.push(pass);
        assertPhaseSpace(phase, pass, contributor);
        graph.addPass(wrap ? wrap(pass) : pass);
        writtenResources.push(...pass.writes);
      }
      if (phase === "transparent") {
        const queue = contributor.transparentItems?.(ctx);
        if (this.selectiveObservation) this.observeQueue(contributor, queue);
        if (queue && queue.length > 0) { this.extraSceneGeometryPossible = true; this.contactGraphHasTransparentQueue = true; transparentQueue.push(...queue); }
      }
    }
    if (transparentQueue.length > 0) graph.addPass(new ContributorTransparentPass(transparentQueue, ctx));
    return writtenResources;
  }

  /**
   * "transparent" phase queue: contributor `TransparentQueueItem`s plus the
   * context they draw with, so the Renderer can interleave them with forward
   * transparents by `sortDepth` (§8.4 step 1) instead of drawing them in a
   * block after the pass. Empty when no contributor emits queue items.
   */
  transparentQueues(items: readonly RenderItem[]): { readonly ctx: FrameContributorContext; readonly queues: readonly TransparentQueueItem[] } {
    return withRendererQrFlags(this.input.device, () => this.transparentQueuesScoped(items));
  }

  private transparentQueuesScoped(items: readonly RenderItem[]): { readonly ctx: FrameContributorContext; readonly queues: readonly TransparentQueueItem[] } {
    const ctx = this.context(items);
    const queues: TransparentQueueItem[] = [];
    for (const contributor of frameContributors(this.flags)) {
      if (!contributor.phases.includes("transparent")) continue;
      this.selectiveContract(contributor);
      const queue = contributor.transparentItems?.(ctx);
      if (this.selectiveObservation) this.observeQueue(contributor, queue);
      if (queue?.length) { this.extraSceneGeometryPossible = true; this.contactGraphHasTransparentQueue = true; queues.push(...queue); }
    }
    return { ctx, queues };
  }

  /** Contributor `passes("transparent")` only — queue items are handled by transparentQueues(). */
  addTransparentContributorPasses(graph: RenderGraph, items: readonly RenderItem[]): void {
    withRendererQrFlags(this.input.device, () => this.addTransparentContributorPassesScoped(graph, items));
  }

  private addTransparentContributorPassesScoped(graph: RenderGraph, items: readonly RenderItem[]): void {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    for (const contributor of contributors) {
      if (!contributor.phases.includes("transparent")) continue;
      this.selectiveContract(contributor);
      const passes = contributor.passes?.("transparent", ctx) ?? [];
      if (this.selectiveObservation) this.observePasses(contributor, "transparent", passes);
      if (passes.length) this.extraSceneGeometryPossible = true;
      for (const pass of passes) {
        this.contactGraphContributorPasses.push(pass);
        graph.addPass(pass);
      }
    }
  }

  /** Direct phases executed outside the graph (post-hdr, after-output). */
  runPhase(phase: AuraFramePhase, items: readonly RenderItem[], enabled = true): void {
    withRendererQrFlags(this.input.device, () => this.runPhaseScoped(phase, items, enabled));
  }

  private runPhaseScoped(phase: AuraFramePhase, items: readonly RenderItem[], enabled: boolean): void {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    const passContext: RenderPassContext = { device: this.input.device, width: this.input.width, height: this.input.height };
    for (const contributor of contributors) {
      if (!contributor.phases.includes(phase)) continue;
      if (!enabled) {
        if (typeof console !== "undefined") console.warn(`FRAME_PHASE_SKIPPED:${phase}:${contributor.id}`);
        continue;
      }
      this.selectiveContract(contributor);
      const passes = contributor.passes?.(phase, ctx) ?? [];
      if (this.selectiveObservation) this.observePasses(contributor, phase, passes);
      if (passes.length && !benchmarkPassesAreNonScene(contributor, phase)) this.extraSceneGeometryPossible = true;
      for (const pass of passes) {
        assertPhaseSpace(phase, pass, contributor);
        pass.execute(passContext);
      }
    }
  }

  async runPhaseAsync(phase: AuraFramePhase, items: readonly RenderItem[], enabled = true): Promise<void> {
    this.input.assertCurrent?.();
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    const passContext: RenderPassContext = { device: this.input.device, width: this.input.width, height: this.input.height };
    for (const contributor of contributors) {
      if (!contributor.phases.includes(phase)) continue;
      if (!enabled) {
        if (typeof console !== "undefined") console.warn(`FRAME_PHASE_SKIPPED:${phase}:${contributor.id}`);
        continue;
      }
      // 4.7.x selective-bloom observation applies to the async phase runner too.
      this.selectiveContract(contributor);
      const passes = withRendererQrFlags(this.input.device, () => contributor.passes?.(phase, ctx) ?? []);
      if (this.selectiveObservation) this.observePasses(contributor, phase, passes);
      if (passes.length && !benchmarkPassesAreNonScene(contributor, phase)) this.extraSceneGeometryPossible = true;
      for (const pass of passes) {
        assertPhaseSpace(phase, pass, contributor);
        if (pass.executeAsync) {
          await pass.executeAsync(passContext);
          this.input.assertCurrent?.();
        } else {
          withRendererQrFlags(this.input.device, () => pass.execute(passContext));
        }
      }
    }
  }
}

/**
 * §8.4 step 4 (lane 01's half of C-13): a contributor pass in `post-hdr` that
 * declares display space is rejected — everything upstream of OutputPass is
 * linear scene-referred.
 */
function assertPhaseSpace(phase: AuraFramePhase, pass: { readonly name: string; readonly space?: "linear-hdr" | "display" }, contributor: { readonly id: string }): void {
  if (phase === "post-hdr" && pass.space === "display") {
    throw new Error(`FRAME_PHASE_SPACE_MISMATCH:${phase}:${contributor.id}:${pass.name}`);
  }
}

export function createRendererFrameHooks(input: RendererFrameHooksInput): RendererFrameHooks {
  return new RendererFrameHooks(input);
}
