import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "./webgpu/ProjectionClip";
import { ForwardPass, type RenderItem } from "./ForwardPass";
import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { getRenderAttachmentIdentity, validateRenderAttachmentAccess, MockRenderDevice, MockRenderTarget, RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";
import { resourceDisposalPending } from "./ResourceLifecycle";
import { WebGL2Device } from "./WebGL2Device";
import { ShaderLibrary } from "./ShaderLibraryCore";
import { rendererQrFlags, rendererQrFlagsVersion, rendererQrSealedBindingCurrent,
  consumeRendererQrProofAccess, rendererQrFrameBeginAuthorized, rendererQrIsScopedBinding } from "./renderer/FrameGraph";
import { VelocityHistory, type VelocityCoverage } from "./forward/Velocity";
import type { TemporalFrameId, TemporalIdentity, TemporalResetReason } from "./contracts/velocity";
import { temporalJitter } from "./TemporalMath";
import { isTrustedQrFlags } from "./contracts/core";
import { transferPackedLoopMember } from "./batching/BatchMembers";
import { getRenderTargetTextureOwner, type Texture } from "./Texture";

export interface TemporalFrameOptions {
  readonly sceneKey?: string;
  readonly reset?: boolean;
  readonly jitter?: boolean;
  readonly frameTime?: number;
  /** Signed forward distance of the projection near plane. */
  readonly depthNear?: number;
  /**
   * Stable view identity and one token for all passes of an authored frame.
   * Callers must not reuse a frame token after advancing within a history;
   * arbitrary old tokens cannot all be recognized with bounded token memory.
   */
  readonly viewId?: TemporalIdentity;
  readonly frameId?: TemporalFrameId;
  /** Temporal reconstruction accumulates at output size. Spatial mode accumulates at render size. */
  readonly reconstruction?: "spatial" | "temporal";
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  /** Borrowed live, render-sized surfaces populated by the caller, never disposed here. */
  readonly velocity?: RenderTarget;
  readonly reactive?: RenderTarget;
  /**
   * Opt into caller-populated previous signed linear view depth in velocity.a.
   * The producer must use 3e38 for pixels without previous surface history.
   * Omitted means velocity alpha retains its existing meaning and is ignored.
   */
  readonly expectedPreviousDepth?: "velocity-alpha";
  /** Only true if this draw's forward target actually contains writable velocity/reactive MRTs. */
  readonly velocityMrtWritable?: boolean;
}

/** GPU-only bindings. History and output are owned by this view; other optional inputs are borrowed. */
export interface TemporalGpuBindings {
  readonly velocity: RenderTarget;
  readonly history: RenderTarget;
  readonly historyOutput: RenderTarget;
  readonly historyValid: boolean;
  readonly historyFrames?: number;
  readonly renderItems: readonly RenderItem[];
  readonly v2?: TemporalV2Frame;
}

export interface TemporalV2Frame {
  readonly jittered: Float32Array;
  readonly unjittered: Float32Array;
  readonly previous: Float32Array;
  /** Previous linear-depth surface; it may have the previous render resolution. */
  readonly linZ: RenderTarget;
  readonly linZOutput: RenderTarget;
  readonly jitterClip: readonly [number, number];
  readonly previousJitterClip: readonly [number, number];
  readonly frameTime: number;
  readonly depthNear: number;
  readonly reactive?: RenderTarget;
  /** Present only for a validated, caller-populated expected-depth input. */
  readonly expectedPreviousDepth?: "velocity-alpha";
  readonly motionSource: "camera" | "object";
  readonly unsupportedMotion: readonly string[];
  readonly reconstruction: "spatial" | "temporal";
  readonly coverage: VelocityCoverage;
}

/** Side-effect-free prediction for a single v2 view/frame, consumed at prepare. */
export interface TemporalRasterPlan {
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
  readonly jitterClip: readonly [number, number];
  readonly unjittered: readonly number[];
  readonly jittered: readonly number[];
}

interface ViewState {
  /** A view's resources remain tied to this device until the view is disposed. */
  ownerDevice?: RenderDevice;
  device?: RenderDevice;
  deviceGeneration?: number;
  targets?: [RenderTarget, RenderTarget, RenderTarget];
  linZTargets?: [RenderTarget, RenderTarget];
  previous: Map<TemporalIdentity, Float32Array>;
  framePrevious: Map<TemporalIdentity, Float32Array>;
  pending: Map<TemporalIdentity, Float32Array>;
  valid: boolean;
  sceneKey?: string;
  frame: number;
  jitterEnabled: boolean;
  reconstruction: "spatial" | "temporal";
  depthNear?: number;
  velocity: VelocityHistory;
  activeFrame?: TemporalFrameId;
  /** Immediate resume guard only; token uniqueness across older frames is the caller's responsibility. */
  committedFrame?: TemporalFrameId;
  cached?: TemporalGpuBindings;
  renderItems: readonly RenderItem[];
  materials: Material[];
  /** Resources removed from the active bindings but still owned for cleanup. */
  retired: Map<Material | RenderTarget, { failure?: { readonly error: unknown; readonly disposer?: () => void } }>;
  preparing: boolean;
  releasing: boolean;
  currentJitter: readonly [number, number];
  previousJitter: readonly [number, number];
  frameItems?: readonly TemporalItemSnapshot[];
  frameObjects?: Map<TemporalIdentity, TemporalItemSnapshot>;
  expectedDepthCommitProof?: TemporalCommitProof;
  frameSettings?: {
    readonly viewProjection: readonly number[];
    readonly frameTime: number;
    readonly velocityMrtWritable: boolean;
    readonly expectedPreviousDepth?: "velocity-alpha";
    readonly reset: boolean;
  };
}

const defaultView = Symbol("aura.temporal.default-view");
function newView(): ViewState {
  return { previous: new Map(), framePrevious: new Map(), pending: new Map(), valid: false, frame: 0, jitterEnabled: false,
    reconstruction: "spatial", velocity: new VelocityHistory(), renderItems: [], materials: [],
    retired: new Map(), preparing: false, releasing: false,
    currentJitter: [0, 0], previousJitter: [0, 0] };
}
function dimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RenderDeviceError("Temporal dimensions must be positive integers", "TEMPORAL_INVALID_SIZE", { width, height });
  }
}
function liveTarget(target: RenderTarget): boolean {
  return !target.disposed && !target.colorTexture.disposed
    && (!target.colorTextures || target.colorTextures.every(texture => !texture.disposed))
    && !target.depthTexture?.disposed && !target.multisampledDepthTexture?.disposed;
}
function liveSized(target: RenderTarget, width: number, height: number, name: string, device: RenderDevice): void {
  if (!liveTarget(target) || target.width !== width || target.height !== height) {
    throw new RenderDeviceError(`Temporal ${name} input must be live and match the render size`, "TEMPORAL_INVALID_INPUT", { name, width, height });
  }
  if (getRenderTargetTextureOwner(target.colorTexture) !== device) {
    throw new RenderDeviceError(`Temporal ${name} input must have verified ownership by the same device`, "TEMPORAL_INVALID_INPUT", { name });
  }
}
type KeyedItem = RenderItem & { readonly temporalObjectKey?: TemporalIdentity };
interface TemporalItemSnapshot {
  readonly key: TemporalIdentity;
  readonly geometry: RenderItem["geometry"];
  readonly material: RenderItem["material"];
  readonly model?: readonly number[];
  readonly geometryMatrix?: readonly number[];
  readonly mvp?: readonly number[];
  readonly instances?: readonly number[];
  readonly morphWeights?: readonly number[];
  readonly morphTargets?: readonly unknown[];
  readonly skinning: RenderItem["skinning"];
  readonly jointMatrices?: readonly number[];
  readonly jointCount?: number;
  readonly extraInfluences?: boolean;
  readonly previousModel?: readonly number[];
  readonly previousInstances?: readonly number[];
  readonly previousMorphWeights?: readonly number[];
  readonly previousJointTexture: RenderItem["previousJointTexture"];
  readonly reactive: boolean;
}
function snapshotItems(items: readonly RenderItem[]): TemporalItemSnapshot[] {
  return items.map(item => {
    const key = (item as KeyedItem).temporalObjectKey ?? item;
    if (typeof key === "number" && !Number.isFinite(key)) throw new RangeError("Temporal object ID must be finite");
    return {
      key, geometry: item.geometry, material: item.material,
      model: item.modelMatrix ? Array.from(item.modelMatrix) : undefined,
      geometryMatrix: item.geometryMatrix ? Array.from(item.geometryMatrix) : undefined,
      mvp: item.modelViewProjectionMatrix ? Array.from(item.modelViewProjectionMatrix) : undefined,
      instances: item.instanceTransforms ? Array.from(item.instanceTransforms) : undefined,
      morphWeights: item.morphWeights ? Array.from(item.morphWeights) : undefined,
      morphTargets: item.morphTargets ? Array.from(item.morphTargets) : undefined,
      skinning: item.skinning,
      jointMatrices: item.skinning ? Array.from(item.skinning.matrices) : undefined,
      jointCount: item.skinning?.jointCount, extraInfluences: item.skinning?.extraInfluences,
      previousModel: item.previousModelMatrix ? Array.from(item.previousModelMatrix) : undefined,
      previousInstances: item.previousInstanceTransforms ? Array.from(item.previousInstanceTransforms) : undefined,
      previousMorphWeights: item.previousMorphWeights ? Array.from(item.previousMorphWeights) : undefined,
      previousJointTexture: item.previousJointTexture, reactive: Boolean(item.writesReactive)
    };
  });
}
function sameItemSnapshots(a: readonly TemporalItemSnapshot[], b: readonly TemporalItemSnapshot[]): boolean {
  const equal = (x?: readonly number[], y?: readonly number[]) => x === undefined ? y === undefined : y !== undefined && x.length === y.length && x.every((v, i) => v === y[i]);
  return a.length === b.length && a.every((left, i) => {
    const right = b[i]!;
    const sameMorphTargets = left.morphTargets === undefined ? right.morphTargets === undefined
      : right.morphTargets !== undefined && left.morphTargets.length === right.morphTargets.length
        && left.morphTargets.every((target, index) => target === right.morphTargets![index]);
    return left.key === right.key && left.geometry === right.geometry && left.material === right.material
      && left.skinning === right.skinning && left.jointCount === right.jointCount && left.extraInfluences === right.extraInfluences
      && left.previousJointTexture === right.previousJointTexture && left.reactive === right.reactive && sameMorphTargets
      && equal(left.model, right.model) && equal(left.geometryMatrix, right.geometryMatrix) && equal(left.mvp, right.mvp)
      && equal(left.instances, right.instances) && equal(left.morphWeights, right.morphWeights) && equal(left.jointMatrices, right.jointMatrices)
      && equal(left.previousModel, right.previousModel) && equal(left.previousInstances, right.previousInstances)
      && equal(left.previousMorphWeights, right.previousMorphWeights);
  });
}

/** A frame may contain several disjoint draws, but one key cannot change within it. */
function unionFrameObjects(previous: ReadonlyMap<TemporalIdentity, TemporalItemSnapshot>,
  items: readonly TemporalItemSnapshot[]): Map<TemporalIdentity, TemporalItemSnapshot> {
  const union = new Map(previous);
  for (const item of items) {
    const prior = union.get(item.key);
    if (prior && !sameItemSnapshots([prior], [item])) {
      throw new RenderDeviceError("Repeated temporal frame changed its view or attachments: conflicting object inputs", "TEMPORAL_FRAME_CONFLICT");
    }
    union.set(item.key, item);
  }
  return union;
}

function liveBindings(bindings: TemporalGpuBindings): boolean {
  return [bindings.velocity, bindings.history, bindings.historyOutput,
    ...(bindings.v2 ? [bindings.v2.linZ, bindings.v2.linZOutput, ...(bindings.v2.reactive ? [bindings.v2.reactive] : [])] : [])]
    .every(liveTarget);
}

type TemporalMatrixName = "jittered" | "unjittered" | "previous";
const temporalMatricesCurrent = new WeakMap<TemporalV2Frame, () => boolean>();

/**
 * Expose detached copies while retaining the same frame handle across passes.
 * An observed mutation of the latest issued matrix also invalidates a staged
 * proof; older copies are detached and cannot change the cached frame.
 */
function copyTemporalV2(frame: TemporalV2Frame): TemporalV2Frame {
  const matrices = {
    jittered: new Float32Array(frame.jittered),
    unjittered: new Float32Array(frame.unjittered),
    previous: new Float32Array(frame.previous)
  };
  const issued: Partial<Record<TemporalMatrixName, Float32Array>> = {};
  let changed = false;
  const current = (): boolean => {
    for (const name of ["jittered", "unjittered", "previous"] as const) {
      const copy = issued[name];
      if (copy && matrices[name].some((value, index) => value !== copy[index])) changed = true;
    }
    return !changed;
  };
  const copy = (name: TemporalMatrixName): Float32Array => {
    current();
    return issued[name] = new Float32Array(matrices[name]);
  };
  const jitter: readonly [number, number] = [frame.jitterClip[0], frame.jitterClip[1]];
  const previousJitter: readonly [number, number] = [frame.previousJitterClip[0], frame.previousJitterClip[1]];
  const unsupported = [...frame.unsupportedMotion];
  const coverage = { ...frame.coverage };
  const result: TemporalV2Frame = Object.freeze({
    ...frame,
    get jittered() { return copy("jittered"); },
    get unjittered() { return copy("unjittered"); },
    get previous() { return copy("previous"); },
    get jitterClip(): readonly [number, number] { return [jitter[0], jitter[1]]; },
    get previousJitterClip(): readonly [number, number] { return [previousJitter[0], previousJitter[1]]; },
    get unsupportedMotion() { return [...unsupported]; },
    get coverage() { return { ...coverage }; }
  });
  temporalMatricesCurrent.set(result, current);
  return result;
}

function copyTemporalItems(items: readonly RenderItem[]): readonly RenderItem[] {
  return items.map(item => {
    const result = { ...item, ...(item.modelViewProjectionMatrix
      ? { modelViewProjectionMatrix: Float32Array.from(item.modelViewProjectionMatrix) } : {}) };
    transferPackedLoopMember(item, result);
    return result;
  });
}

function copyTemporalBindings(bindings: TemporalGpuBindings): TemporalGpuBindings {
  const { renderItems, v2, ...rest } = bindings;
  const frame = v2 ? copyTemporalV2(v2) : undefined;
  return Object.freeze({
    ...rest,
    get renderItems() { return copyTemporalItems(renderItems); },
    ...(frame ? { v2: frame } : {})
  });
}

type TargetDisposition = "reuse" | "resize-temporal" | "replace";
function targetDisposition(state: ViewState, width: number, height: number, outWidth: number, outHeight: number,
  v2: boolean, mode: "spatial" | "temporal"): TargetDisposition {
  const targets = state.targets, depth = state.linZTargets;
  const validTargets = targets && targets.every(liveTarget) && targets[1].width === outWidth && targets[1].height === outHeight
    && targets[2].width === outWidth && targets[2].height === outHeight && Boolean(depth) === v2
    && (!depth || depth.every(liveTarget));
  if (!validTargets || !targets) return "replace";
  const needVelocity = targets[0].width !== width || targets[0].height !== height;
  const needDepthOutput = Boolean(depth && (depth[1].width !== width || depth[1].height !== height));
  if (!needVelocity && !needDepthOutput) return "reuse";
  return v2 && mode === "temporal" ? "resize-temporal" : "replace";
}

interface TemporalPlanRecord {
  readonly device: RenderDevice;
  readonly deviceGeneration: number | undefined;
  readonly deviceFrameToken: object;
  readonly flags: ReturnType<typeof rendererQrFlags>;
  readonly flagsVersion: object;
  readonly lifetime: number;
  readonly revision: number;
  readonly width: number;
  readonly height: number;
  readonly viewProjection: readonly number[];
  readonly options: TemporalFrameOptions;
  readonly targetState: readonly TemporalTargetSnapshot[];
  readonly expectedDepth?: ExpectedDepthSnapshot;
}

interface TemporalTargetSnapshot {
  readonly target: RenderTarget;
  readonly values: readonly unknown[];
  readonly colors?: readonly unknown[];
  readonly textures: readonly { readonly texture: object; readonly disposed: boolean; readonly revision: unknown }[];
}
interface PreparedTemporalPlanRecord {
  readonly original: TemporalPlanRecord;
  readonly bindings: TemporalGpuBindings;
  readonly v2: TemporalV2Frame;
  readonly revision: number;
  readonly bindingTargets: readonly RenderTarget[];
  readonly targetState: readonly TemporalTargetSnapshot[];
}

const TEMPORAL_TARGET_FIELDS = ["id", "width", "height", "disposed", "colorTexture", "depthTexture", "multisampledDepthTexture",
  "colorTextures", "sampleCount", "dimension", "layers", "depthOnly", "attachmentLayer", "attachmentMipLevel",
  "colorHandle", "framebuffer", "depthTextureHandle"] as const;
function ownData(object: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor && !("value" in descriptor)) throw new RenderDeviceError("Temporal planning does not invoke target accessors", "TEMPORAL_PLAN_UNSUPPORTED");
  return descriptor?.value;
}
function readPlanTarget(target: RenderTarget): TemporalTargetSnapshot {
  const width = Object.getOwnPropertyDescriptor(target, "width"), height = Object.getOwnPropertyDescriptor(target, "height");
  const disposed = Object.getOwnPropertyDescriptor(target, "disposed");
  if (!width || !("value" in width) || !height || !("value" in height) || !disposed || !("value" in disposed) ||
      typeof width.value !== "number" || typeof height.value !== "number" || typeof disposed.value !== "boolean") {
    throw new RenderDeviceError("Temporal planning does not invoke target accessors", "TEMPORAL_PLAN_UNSUPPORTED");
  }
  const values = TEMPORAL_TARGET_FIELDS.map(field => ownData(target, field));
  if (!values[4] || typeof values[4] !== "object" || [values[5], values[6]].some(value => value !== undefined && value !== null && typeof value !== "object")) {
    throw new RenderDeviceError("Temporal planning requires data-only target textures", "TEMPORAL_PLAN_UNSUPPORTED");
  }
  const colorList = values[7];
  let colors: unknown[] | undefined;
  if (colorList !== undefined) {
    if (!Array.isArray(colorList) || Object.getPrototypeOf(colorList) !== Array.prototype || Object.getOwnPropertyDescriptor(colorList, Symbol.iterator)) {
      throw new RenderDeviceError("Temporal planning requires plain target attachments", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    colors = Array.from({ length: colorList.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(colorList, String(index));
      if (!descriptor || !("value" in descriptor)) throw new RenderDeviceError("Temporal planning does not invoke target accessors", "TEMPORAL_PLAN_UNSUPPORTED");
      return descriptor.value;
    });
    if (colors.some(value => !value || typeof value !== "object")) {
      throw new RenderDeviceError("Temporal planning requires data-only target textures", "TEMPORAL_PLAN_UNSUPPORTED");
    }
  }
  const textures = [values[4], values[5], values[6], ...(colors ?? [])].filter((value): value is object => value !== undefined && value !== null && typeof value === "object");
  return { target, values, colors, textures: textures.map(texture => {
    const textureDisposed = ownData(texture, "disposed");
    if (typeof textureDisposed !== "boolean") throw new RenderDeviceError("Temporal planning requires live target textures", "TEMPORAL_PLAN_UNSUPPORTED");
    return { texture, disposed: textureDisposed, revision: ownData(texture, "revision") };
  }) };
}
function samePlanTarget(expected: TemporalTargetSnapshot): boolean {
  const actual = readPlanTarget(expected.target);
  return actual.values.length === expected.values.length && actual.values.every((value, index) => value === expected.values[index]) &&
    (expected.colors === undefined ? actual.colors === undefined : actual.colors !== undefined && actual.colors.length === expected.colors.length &&
      actual.colors.every((value, index) => value === expected.colors![index])) &&
    actual.textures.length === expected.textures.length && actual.textures.every((value, index) =>
      value.texture === expected.textures[index]!.texture && value.disposed === expected.textures[index]!.disposed &&
      value.revision === expected.textures[index]!.revision);
}
function planTargetIsLive(snapshot: TemporalTargetSnapshot): boolean {
  return snapshot.values[3] === false && snapshot.textures.every(entry => !entry.disposed);
}

interface ExpectedDepthSnapshot {
  readonly device: RenderDevice;
  readonly generation: number;
  readonly frameToken: object;
  readonly target: RenderTarget;
  readonly targetState: TemporalTargetSnapshot;
  readonly texture: Texture;
  readonly textureValues: readonly unknown[];
  readonly usage: readonly unknown[];
  readonly width: number;
  readonly height: number;
  readonly flags: ReturnType<typeof rendererQrFlags>;
  readonly flagsVersion: object;
  readonly reactive?: BorrowedTemporalTexture;
}

const EXPECTED_DEPTH_TEXTURE_FIELDS = ["width", "height", "dimension", "format", "mipLevelCount", "_colorSpace", "disposed", "layers"] as const;

interface BorrowedTemporalTexture {
  readonly target: RenderTarget;
  readonly targetState: TemporalTargetSnapshot;
  readonly texture: Texture;
  readonly textureValues: readonly unknown[];
  readonly usage: readonly unknown[];
}

function captureReactiveInput(device: RenderDevice, target: RenderTarget, width: number, height: number): BorrowedTemporalTexture {
  const invalid = (): never => { throw new RenderDeviceError("Expected-depth reactive input must be a live, same-device, single-sample linear color attachment", "TEMPORAL_EXPECTED_DEPTH_INVALID"); };
  const targetState = readPlanTarget(target), values = targetState.values, texture = values[4] as Texture;
  const textureValues = EXPECTED_DEPTH_TEXTURE_FIELDS.map(field => ownData(texture, field));
  const rawUsage = ownData(texture, "usage");
  if (!Array.isArray(rawUsage) || Object.getPrototypeOf(rawUsage) !== Array.prototype || Object.getOwnPropertyDescriptor(rawUsage, Symbol.iterator)) return invalid();
  const usage = Array.from({ length: rawUsage.length }, (_, index) => ownData(rawUsage, String(index)));
  if (!planTargetIsLive(targetState) || values[1] !== width || values[2] !== height || (values[8] ?? 1) !== 1 ||
      (values[9] ?? "2d") !== "2d" || (values[10] ?? 1) !== 1 || values[11] === true || (values[12] ?? 0) !== 0 || (values[13] ?? 0) !== 0 ||
      (targetState.colors !== undefined && (targetState.colors.length !== 1 || targetState.colors[0] !== texture)) ||
      textureValues[0] !== width || textureValues[1] !== height || textureValues[2] !== "2d" ||
      !["rgba8", "rgba16f", "rgba32f"].includes(textureValues[3] as string) || textureValues[5] !== "linear" || textureValues[6] !== false || textureValues[7] !== 1 ||
      Object.getOwnPropertyDescriptor(texture, "colorSpace") !== undefined || !usage.includes("sampled") ||
      getRenderTargetTextureOwner(texture) !== device) return invalid();
  return { target, targetState, texture, textureValues, usage };
}

/** Inspect only own data fields; preparation must not call untrusted target accessors. */
function captureExpectedDepthInput(device: RenderDevice, target: RenderTarget, width: number, height: number,
  provenFrameToken?: object, provenFlags?: Pick<ExpectedDepthSnapshot, "flags" | "flagsVersion">): ExpectedDepthSnapshot {
  const invalid = (): never => { throw new RenderDeviceError("Expected previous depth requires a live, same-device, single-sample rgba32f velocity attachment", "TEMPORAL_EXPECTED_DEPTH_INVALID"); };
  // Only the private post-endFrame proof path may supply a previously
  // validated token. Draw and planning validation always require the live one.
  const frameToken = provenFrameToken ?? device.activeFrameToken;
  const flags = provenFlags?.flags ?? rendererQrFlags(device);
  if ((device.kind !== "webgl2" && device.kind !== "mock") || device.disposed || device.contextLost ||
      !Number.isSafeInteger(device.generation) || device.generation! < 0 || !frameToken || !isTrustedQrFlags(flags) || !flags.on("A3D_QR_POST") ||
      (provenFlags && !rendererQrSealedBindingCurrent(device, flags, provenFlags.flagsVersion))) return invalid();
  const targetState = readPlanTarget(target);
  const values = targetState.values;
  const texture = values[4] as Texture;
  const textureValues = EXPECTED_DEPTH_TEXTURE_FIELDS.map(field => ownData(texture, field));
  const rawUsage = ownData(texture, "usage");
  if (!Array.isArray(rawUsage) || Object.getPrototypeOf(rawUsage) !== Array.prototype || Object.getOwnPropertyDescriptor(rawUsage, Symbol.iterator)) return invalid();
  const usage = Array.from({ length: rawUsage.length }, (_, index) => ownData(rawUsage, String(index)));
  if (!planTargetIsLive(targetState) || values[1] !== width || values[2] !== height ||
      (values[8] ?? 1) !== 1 || (values[9] ?? "2d") !== "2d" || (values[10] ?? 1) !== 1 || values[11] === true ||
      (values[12] ?? 0) !== 0 || (values[13] ?? 0) !== 0 ||
      (targetState.colors !== undefined && (targetState.colors.length !== 1 || targetState.colors[0] !== texture)) ||
      textureValues[0] !== width || textureValues[1] !== height || textureValues[2] !== "2d" ||
      textureValues[3] !== "rgba32f" || textureValues[5] !== "linear" || textureValues[6] !== false || textureValues[7] !== 1 ||
      Object.getOwnPropertyDescriptor(texture, "colorSpace") !== undefined ||
      !usage.includes("sampled") || !usage.includes("render-attachment") || getRenderTargetTextureOwner(texture) !== device) return invalid();
  const flagsVersion = provenFlags?.flagsVersion ?? rendererQrFlagsVersion(device);
  if (rendererQrIsScopedBinding(device, flags, flagsVersion) && !rendererTemporalTransfersCurrent(device)) return invalid();
  return { device, generation: device.generation!, frameToken, target, targetState, texture, textureValues, usage, width, height,
    flags, flagsVersion };
}

function expectedDepthInputCurrent(expected: ExpectedDepthSnapshot, provenFrameToken?: object, sealedFlags = false): boolean {
  try {
    const actual = captureExpectedDepthInput(expected.device, expected.target, expected.width, expected.height, provenFrameToken,
      sealedFlags ? expected : undefined);
    const reactive = expected.reactive && captureReactiveInput(expected.device, expected.reactive.target, expected.width, expected.height);
    return actual.generation === expected.generation && actual.frameToken === expected.frameToken && actual.texture === expected.texture &&
      actual.flags === expected.flags && actual.flagsVersion === expected.flagsVersion &&
      samePlanTarget(expected.targetState) && actual.textureValues.length === expected.textureValues.length &&
      actual.textureValues.every((value, index) => value === expected.textureValues[index]) &&
      actual.usage.length === expected.usage.length && actual.usage.every((value, index) => value === expected.usage[index]) &&
      (!expected.reactive || !!reactive && reactive.texture === expected.reactive.texture && samePlanTarget(expected.reactive.targetState) &&
        reactive.textureValues.every((value, index) => value === expected.reactive!.textureValues[index]) &&
        reactive.usage.length === expected.reactive.usage.length && reactive.usage.every((value, index) => value === expected.reactive!.usage[index]));
  } catch { return false; }
}

function preflightExpectedDepth(device: RenderDevice, width: number, height: number, options: TemporalFrameOptions,
  state: ViewState | undefined): ExpectedDepthSnapshot | undefined {
  const mode = ownData(options, "expectedPreviousDepth");
  if (mode === undefined) return undefined;
  const mrt = ownData(options, "velocityMrtWritable");
  if (mode !== "velocity-alpha" || (mrt !== undefined && mrt !== false)) {
    throw new RenderDeviceError("Expected previous depth requires an external velocity-alpha input on the WebGL v2 path", "TEMPORAL_EXPECTED_DEPTH_UNSUPPORTED");
  }
  const target = ownData(options, "velocity") as RenderTarget | undefined;
  if (!target) throw new RenderDeviceError("Expected previous depth requires an external velocity target", "TEMPORAL_EXPECTED_DEPTH_INVALID");
  const captured = captureExpectedDepthInput(device, target, width, height);
  const reactive = ownData(options, "reactive") as RenderTarget | undefined;
  const capturedReactive = reactive ? captureReactiveInput(device, reactive, width, height) : undefined;
  const others = [...(reactive ? [reactive] : []), ...(state?.targets ?? []), ...(state?.linZTargets ?? [])];
  for (const other of others) {
    const otherState = readPlanTarget(other);
    if (other === target || otherState.values[4] === captured.texture || otherState.colors?.includes(captured.texture)) {
      throw new RenderDeviceError("Expected previous depth must not alias another temporal attachment", "TEMPORAL_EXPECTED_DEPTH_INVALID");
    }
  }
  for (const other of [...(state?.targets ?? []), ...(state?.linZTargets ?? [])]) {
    if (!capturedReactive) break;
    const otherState = readPlanTarget(other);
    if (other === capturedReactive.target || otherState.values[4] === capturedReactive.texture || otherState.colors?.includes(capturedReactive.texture)) {
      throw new RenderDeviceError("Expected-depth reactive input must not alias temporal history", "TEMPORAL_EXPECTED_DEPTH_INVALID");
    }
  }
  return { ...captured, ...(capturedReactive ? { reactive: capturedReactive } : {}) };
}

interface ExpectedDepthBinding {
  readonly input: ExpectedDepthSnapshot;
  readonly v2: TemporalV2Frame;
  readonly targets: readonly RenderTarget[];
  readonly targetState: readonly TemporalTargetSnapshot[];
  readonly historyValid: boolean;
  readonly historyFrames: number | undefined;
  readonly values: readonly unknown[];
  readonly vectors: readonly (readonly number[])[];
  readonly unsupported: readonly string[];
  readonly current: () => boolean;
  readonly releaseLiveWriteGuard?: () => void;
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
}

const expectedDepthBindings = new WeakMap<TemporalGpuBindings, ExpectedDepthBinding>();

declare const temporalCommitProofBrand: unique symbol;
/** Opaque receipt: only the issuing history can confirm and consume it. */
interface TemporalCommitProof { readonly [temporalCommitProofBrand]: true }

interface TemporalCommitProofRecord {
  readonly state: ViewState;
  readonly bindings: TemporalGpuBindings;
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
  readonly device: RenderDevice;
  readonly frameToken: object;
  readonly generation: number;
  readonly lifetime: number;
  readonly revision: number;
  sealed: boolean;
  revoked: boolean;
  unsubscribeLoss?: () => void;
  releaseWriteGuard?: () => void;
  writeGuardCurrent?: () => boolean;
}

interface TemporalWriteGuardRecord {
  readonly version: object;
  readonly targets: ReadonlySet<RenderTarget>;
  readonly textures: ReadonlySet<object>;
  revoke(): void;
}

interface TemporalDeviceWriteGuard {
  readonly records: Set<TemporalWriteGuardRecord>;
  readonly methods: Map<string, { readonly originalOwn?: PropertyDescriptor; readonly original: Function; readonly wrapper: (...args: unknown[]) => unknown }>;
}

const temporalDeviceWriteGuards = new WeakMap<RenderDevice, TemporalDeviceWriteGuard>();

interface TemporalTransferTracker {
  refs: number;
  ready: boolean;
  supported: boolean;
  readonly pending: Set<object>;
  readonly methods: Map<string, { readonly originalOwn?: PropertyDescriptor; readonly wrapper: (...args: unknown[]) => unknown }>;
}

const temporalTransferTrackers = new WeakMap<RenderDevice, TemporalTransferTracker>();

/**
 * RenderDevice copies yield before mutating their destination. Install these
 * observers when a renderer adopts the device, not just when a proof starts,
 * so a copy already in flight cannot race the first expected-depth capture.
 */
function retainTemporalTransferTracker(device: RenderDevice): () => void {
  let tracker = temporalTransferTrackers.get(device);
  if (!tracker) {
    const prototype = device instanceof MockRenderDevice ? MockRenderDevice.prototype
      : device instanceof WebGL2Device ? WebGL2Device.prototype : undefined;
    tracker = { refs: 0, ready: false, supported: !!prototype, pending: new Set(), methods: new Map() };
    const installed = tracker;
    const releaseIfIdle = (): void => {
      if (installed.refs || installed.pending.size || temporalTransferTrackers.get(device) !== installed) return;
      temporalTransferTrackers.delete(device);
      for (const [name, entry] of installed.methods) {
        if (Object.getOwnPropertyDescriptor(device, name)?.value !== entry.wrapper) continue;
        if (entry.originalOwn) Object.defineProperty(device, name, entry.originalOwn);
        else delete (device as unknown as Record<string, unknown>)[name];
      }
    };
    try {
      for (const name of ["copyRenderTarget", "resolveRenderTarget"] as const) {
        const original = (device as unknown as Record<string, unknown>)[name];
        if (typeof original !== "function") continue;
        // A replaced method cannot attest the backend's bounded transfer
        // scheduling; fail closed for renderer-owned expected-depth proofs.
        if (!prototype || original !== prototype[name]) installed.supported = false;
        const originalOwn = Object.getOwnPropertyDescriptor(device, name);
        const wrapper = function (this: unknown, ...args: unknown[]): unknown {
          if (this !== device) return Reflect.apply(original, this, args);
          // Do not trust a caller-owned options object or a proxy to describe
          // the eventual destination. Any in-flight copy blocks capture.
          const token = {};
          installed.pending.add(token);
          const finished = (): void => { installed.pending.delete(token); releaseIfIdle(); };
          try {
            const result = Reflect.apply(original, this, args);
            if (result && typeof (result as PromiseLike<unknown>).then === "function") {
              // Return the forwarding promise so an ignored rejection remains
              // observable instead of being swallowed by our bookkeeping.
              return Promise.resolve(result).then(
                value => { finished(); return value; },
                error => { finished(); throw error; }
              );
            } else finished();
            return result;
          } catch (error) { finished(); throw error; }
        };
        Object.defineProperty(device, name, { configurable: true, writable: true, value: wrapper });
        installed.methods.set(name, { originalOwn, wrapper });
      }
    } catch {
      installed.supported = false;
      for (const [name, entry] of installed.methods) {
        if (entry.originalOwn) Object.defineProperty(device, name, entry.originalOwn);
        else delete (device as unknown as Record<string, unknown>)[name];
      }
      installed.methods.clear();
    }
    temporalTransferTrackers.set(device, installed);
    // The built-in WebGL2 and mock copies yield once before their write.
    // A microtask checkpoint drains copies initiated before adoption.
    Promise.resolve().then(() => { installed.ready = true; });
  }
  tracker.refs++;
  const retained = tracker;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    retained.refs--;
    if (retained.refs || retained.pending.size || temporalTransferTrackers.get(device) !== retained) return;
    temporalTransferTrackers.delete(device);
    for (const [name, entry] of retained.methods) {
      if (Object.getOwnPropertyDescriptor(device, name)?.value !== entry.wrapper) continue;
      if (entry.originalOwn) Object.defineProperty(device, name, entry.originalOwn);
      else delete (device as unknown as Record<string, unknown>)[name];
    }
  };
}

function rendererTemporalTransfersCurrent(device: RenderDevice): boolean {
  const tracker = temporalTransferTrackers.get(device);
  if (!tracker || !tracker.ready || !tracker.supported || !tracker.refs || tracker.pending.size) return false;
  const guard = temporalDeviceWriteGuards.get(device);
  for (const [name, entry] of tracker.methods) {
    const current = Object.getOwnPropertyDescriptor(device, name)?.value;
    const guarded = guard?.methods.get(name);
    if (current !== entry.wrapper && !(guarded !== undefined && guarded.wrapper === current && guarded.original === entry.wrapper)) return false;
  }
  return true;
}

/**
 * While a renderer-owned proof is pending, observe the ordinary device write
 * APIs and foreign device frames. This is deliberately scoped to the proof:
 * it does not cache mutable targets or authorize drawing after endFrame.
 * Native context/handle writes outside RenderDevice remain outside this API.
 */
function guardRendererExpectedDepthWrites(device: RenderDevice, version: object, targets: readonly RenderTarget[],
  revoke: () => void): { current(): boolean; release(): void } {
  let guard = temporalDeviceWriteGuards.get(device);
  if (!guard) {
    guard = { records: new Set(), methods: new Map() };
    const installed = guard;
    const methods = ["beginFrame", "writeRenderTargetPixels", "copyRenderTargetColorRegion", "copyRenderTarget",
      "resolveRenderTarget", "generateRenderTargetMipmaps", "draw", "drawChecked", "drawTransmissionCapture",
      "clear", "clearRenderTarget", "multiDrawElementsInstanced", "tryMultiDrawElementsInstanced",
      "submitStaticUnlitPair", "submitStaticGeneratedUnlitPair", "executeReflectionSurfaceSsr",
      "presentLdrPostprocess", "executePostGraph"] as const;
    try {
      for (const name of methods) {
        const original = (device as unknown as Record<string, unknown>)[name];
        if (typeof original !== "function") continue;
        const originalOwn = Object.getOwnPropertyDescriptor(device, name);
        const wrapper = function (this: unknown, ...args: unknown[]): unknown {
          if (this === device) {
            if (name === "beginFrame") {
              for (const record of installed.records) {
                if (!rendererQrFrameBeginAuthorized(device, record.version)) record.revoke();
              }
            } else {
              let target: unknown;
              if (name === "writeRenderTargetPixels" || name === "generateRenderTargetMipmaps") target = args[0];
              else if (name === "copyRenderTargetColorRegion") target = args[1];
              else if (name === "executeReflectionSurfaceSsr") target = args[2];
              else if (name === "executePostGraph") target = undefined;
              else if (name === "presentLdrPostprocess") {
                const options = args[1];
                if (!options || typeof options !== "object") target = undefined;
                else {
                  const descriptor = Object.getOwnPropertyDescriptor(options, "outputTarget");
                  target = descriptor ? ("value" in descriptor ? descriptor.value ?? null : undefined)
                    : "outputTarget" in options ? undefined : null;
                }
              }
              // A caller-controlled transfer options object can lie about its
              // destination. No async copy may overlap a pending proof.
              else if (name === "copyRenderTarget" || name === "resolveRenderTarget") target = undefined;
              else {
                try { target = device.getRenderTarget?.(); } catch { target = undefined; }
              }
              for (const record of installed.records) {
                if (target === null) continue;
                if (!target || typeof target !== "object" || record.targets.has(target as RenderTarget)) {
                  record.revoke();
                  continue;
                }
                const color = Object.getOwnPropertyDescriptor(target, "colorTexture");
                const colors = Object.getOwnPropertyDescriptor(target, "colorTextures");
                if (!color || !("value" in color) || (colors && !("value" in colors))) {
                  record.revoke();
                } else if (record.textures.has(color.value) ||
                    (Array.isArray(colors?.value) && colors.value.some((texture: object) => record.textures.has(texture)))) {
                  record.revoke();
                }
              }
            }
          }
          return Reflect.apply(original, this, args);
        };
        Object.defineProperty(device, name, { configurable: true, writable: true, value: wrapper });
        installed.methods.set(name, { originalOwn, original, wrapper });
      }
      if (!installed.methods.has("beginFrame") || !installed.methods.has("draw") || !installed.methods.has("clear")) {
        throw new Error("TEMPORAL_DEVICE_WRITE_GUARD_UNAVAILABLE");
      }
      temporalDeviceWriteGuards.set(device, installed);
    } catch (error) {
      for (const [name, entry] of installed.methods) {
        if (entry.originalOwn) Object.defineProperty(device, name, entry.originalOwn);
        else delete (device as unknown as Record<string, unknown>)[name];
      }
      throw error;
    }
  }
  const installed = guard;
  const textures = new Set<object>();
  for (const target of targets) {
    const snapshot = readPlanTarget(target);
    for (const value of snapshot.textures) textures.add(value.texture);
  }
  const record: TemporalWriteGuardRecord = { version, targets: new Set(targets), textures, revoke };
  installed.records.add(record);
  let released = false;
  return {
    current: () => !released && temporalDeviceWriteGuards.get(device) === installed && installed.records.has(record)
      && [...installed.methods].every(([name, entry]) => Object.getOwnPropertyDescriptor(device, name)?.value === entry.wrapper),
    release: () => {
      if (released) return;
      released = true;
      installed.records.delete(record);
      if (installed.records.size) return;
      temporalDeviceWriteGuards.delete(device);
      for (const [name, entry] of installed.methods) {
        // Do not overwrite a later caller's method or test spy.
        if (Object.getOwnPropertyDescriptor(device, name)?.value !== entry.wrapper) continue;
        if (entry.originalOwn) Object.defineProperty(device, name, entry.originalOwn);
        else delete (device as unknown as Record<string, unknown>)[name];
      }
    }
  };
}

function expectedDepthTargets(bindings: TemporalGpuBindings, v2: TemporalV2Frame): RenderTarget[] {
  return [bindings.velocity, bindings.history, bindings.historyOutput, v2.linZ, v2.linZOutput, ...(v2.reactive ? [v2.reactive] : [])];
}

function rememberExpectedDepthBinding(bindings: TemporalGpuBindings, input: ExpectedDepthSnapshot, viewId: TemporalIdentity, frameId: TemporalFrameId, current: () => boolean): void {
  const v2 = bindings.v2!;
  const targets = expectedDepthTargets(bindings, v2);
  const targetState = targets.map(readPlanTarget);
  if (rendererQrIsScopedBinding(input.device, input.flags, input.flagsVersion) && !rendererTemporalTransfersCurrent(input.device)) {
    throw new RenderDeviceError("Expected previous depth has a pending or unverified device transfer", "TEMPORAL_EXPECTED_DEPTH_STALE");
  }
  if (!expectedDepthInputCurrent(input) || !targetState.every(target =>
    planTargetIsLive(target) && getRenderTargetTextureOwner(target.values[4] as Texture) === input.device)) {
    throw new RenderDeviceError("Expected previous depth changed during temporal preparation", "TEMPORAL_EXPECTED_DEPTH_STALE");
  }
  let liveRevoked = false, liveGuardActive = true;
  const liveGuard = rendererQrIsScopedBinding(input.device, input.flags, input.flagsVersion)
    ? guardRendererExpectedDepthWrites(input.device, input.flagsVersion, targets, () => { liveRevoked = true; })
    : undefined;
  expectedDepthBindings.set(bindings, { input, v2, targets, targetState, historyValid: bindings.historyValid,
    historyFrames: bindings.historyFrames,
    values: [v2.expectedPreviousDepth, v2.motionSource, v2.reconstruction, v2.depthNear, v2.frameTime],
    vectors: [Array.from(v2.jittered), Array.from(v2.unjittered), Array.from(v2.previous), Array.from(v2.jitterClip), Array.from(v2.previousJitterClip)],
    unsupported: [...v2.unsupportedMotion], viewId, frameId,
    current: () => current() && !liveRevoked && (!liveGuardActive || !liveGuard || liveGuard.current()),
    releaseLiveWriteGuard: () => { if (liveGuardActive) { liveGuardActive = false; liveGuard?.release(); } } });
}

function assertExpectedDepthBindings(bindings: TemporalGpuBindings, device: RenderDevice, width: number, height: number,
  context?: { readonly viewId?: TemporalIdentity; readonly frameId?: TemporalFrameId }, provenFrameToken?: object, sealedFlags = false): boolean {
  const recorded = expectedDepthBindings.get(bindings);
  const stale = (): never => { throw new RenderDeviceError("Expected previous depth binding is stale or unverified", "TEMPORAL_EXPECTED_DEPTH_STALE"); };
  try {
  const v2 = ownData(bindings, "v2") as TemporalV2Frame | undefined;
  const mode = v2 ? ownData(v2, "expectedPreviousDepth") : undefined;
  if (!recorded && mode === undefined) return false;
  if (!recorded || !v2 || v2 !== recorded.v2 || mode !== "velocity-alpha" || !recorded.current() ||
      !temporalMatricesCurrent.get(v2)?.() ||
      recorded.input.device !== device || recorded.input.width !== width || recorded.input.height !== height ||
      (context?.viewId !== undefined && context.viewId !== recorded.viewId) ||
      (context?.frameId !== undefined && context.frameId !== recorded.frameId) ||
      !expectedDepthInputCurrent(recorded.input, provenFrameToken, sealedFlags) || bindings.historyValid !== recorded.historyValid || bindings.historyFrames !== recorded.historyFrames) return stale();
  const targets = expectedDepthTargets(bindings, v2);
  const values = [v2.expectedPreviousDepth, v2.motionSource, v2.reconstruction, v2.depthNear, v2.frameTime];
  const vectors = [v2.jittered, v2.unjittered, v2.previous, v2.jitterClip, v2.previousJitterClip];
  if (targets.length !== recorded.targets.length || targets.some((target, index) => target !== recorded.targets[index]) ||
      !recorded.targetState.every(target => planTargetIsLive(target) && samePlanTarget(target) &&
        getRenderTargetTextureOwner(target.values[4] as Texture) === device) ||
      values.some((value, index) => value !== recorded.values[index]) ||
      vectors.some((vector, index) => !vector || vector.length !== recorded.vectors[index]!.length ||
        !Array.from(vector).every((value, component) => value === recorded.vectors[index]![component])) ||
      v2.unsupportedMotion.length !== recorded.unsupported.length || v2.unsupportedMotion.some((value, index) => value !== recorded.unsupported[index])) return stale();
  if (!recorded.current() || !expectedDepthInputCurrent(recorded.input, provenFrameToken, sealedFlags)) return stale();
  return true;
  } catch { return stale(); }
}

/** Validate a prepared opt-in through every GPU use; legacy bindings return false. */
export function assertExpectedPreviousDepthBindingsCurrent(bindings: TemporalGpuBindings, device: RenderDevice, width: number, height: number,
  context?: { readonly viewId?: TemporalIdentity; readonly frameId?: TemporalFrameId }): boolean {
  return assertExpectedDepthBindings(bindings, device, width, height, context);
}

function samePlanOptions(a: TemporalFrameOptions, b: TemporalFrameOptions, view: TemporalIdentity, frame: TemporalFrameId,
  width: number, height: number): boolean {
  const mode = a.reconstruction ?? "spatial";
  return (b.viewId ?? defaultView) === view && b.frameId === frame && a.sceneKey === b.sceneKey &&
    Boolean(a.reset) === Boolean(b.reset) && Boolean(a.jitter) === Boolean(b.jitter) &&
    mode === (b.reconstruction ?? "spatial") &&
    (mode !== "temporal" || ((a.outputWidth ?? width) === (b.outputWidth ?? width) && (a.outputHeight ?? height) === (b.outputHeight ?? height))) &&
    (a.frameTime ?? 1 / 60) === (b.frameTime ?? 1 / 60) && (a.depthNear ?? 0) === (b.depthNear ?? 0) &&
    a.velocity === b.velocity && a.reactive === b.reactive && Boolean(a.velocityMrtWritable) === Boolean(b.velocityMrtWritable) &&
    a.expectedPreviousDepth === b.expectedPreviousDepth;
}

const TEMPORAL_PLAN_OPTION_KEYS = ["sceneKey", "reset", "jitter", "frameTime", "depthNear", "viewId", "frameId", "reconstruction",
  "outputWidth", "outputHeight", "velocity", "reactive", "velocityMrtWritable", "expectedPreviousDepth"] as const;
function copyPlanOptions(options: TemporalFrameOptions): TemporalFrameOptions {
  if (!options || typeof options !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
    throw new RenderDeviceError("Temporal planning requires plain frame options", "TEMPORAL_PLAN_UNSUPPORTED");
  }
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of TEMPORAL_PLAN_OPTION_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new RenderDeviceError("Temporal planning does not invoke option accessors", "TEMPORAL_PLAN_UNSUPPORTED");
    copy[key] = descriptor.value;
  }
  return copy as TemporalFrameOptions;
}

function copyPlanMatrix(value: Float32Array | readonly number[] | undefined): number[] {
  if (value === undefined) return Array.from(identityMat4());
  if (Object.getOwnPropertyDescriptor(value, Symbol.iterator)) {
    throw new RenderDeviceError("Temporal planning does not invoke custom matrix iterators", "TEMPORAL_PLAN_UNSUPPORTED");
  }
  if (ArrayBuffer.isView(value) && Object.getPrototypeOf(value) === Float32Array.prototype) {
    const matrix = value as Float32Array;
    if (matrix.length === 16) return Array.from({ length: 16 }, (_, index) => matrix[index]!);
  } else if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length === 16) {
    const matrix: number[] = [];
    for (let index = 0; index < 16; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number") {
        throw new RenderDeviceError("Temporal planning does not invoke matrix accessors", "TEMPORAL_PLAN_UNSUPPORTED");
      }
      matrix.push(descriptor.value);
    }
    return matrix;
  }
  throw new RenderDeviceError("Temporal planning requires a plain sixteen-element matrix", "TEMPORAL_PLAN_UNSUPPORTED");
}

/** A staged plan cannot safely cross participant callbacks or mutable deformation. */
function assertPlanItems(items: readonly RenderItem[]): void {
  if (!Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype) {
    throw new RenderDeviceError("Temporal planning requires a plain item list", "TEMPORAL_PLAN_UNSUPPORTED");
  }
  if (Object.getOwnPropertyDescriptor(items, Symbol.iterator)) {
    throw new RenderDeviceError("Temporal planning does not invoke item-list iterators", "TEMPORAL_PLAN_UNSUPPORTED");
  }
  for (let index = 0; index < items.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(items, String(index));
    if (!entry || !("value" in entry)) throw new RenderDeviceError("Temporal planning does not invoke item-list accessors", "TEMPORAL_PLAN_UNSUPPORTED");
    const item = entry.value as RenderItem;
    if (!item || typeof item !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) {
      throw new RenderDeviceError("Temporal planning requires plain draw items", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Reflect.ownKeys(item).some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      return descriptor !== undefined && !("value" in descriptor);
    })) {
      throw new RenderDeviceError("Temporal planning does not invoke item accessors", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    for (const key of ["onBeforeRender", "skinning", "morphTargets", "morphWeights", "instanceTransforms", "instanceColors",
      "instanceAttributes", "instanceEmissive", "previousInstanceTransforms", "previousMorphWeights", "previousJointTexture"] as const) {
      if (descriptors[key]?.value !== undefined) throw new RenderDeviceError("Temporal planning requires rigid callback-free items", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    if (descriptors.instanceCount?.value !== undefined && descriptors.instanceCount.value !== 1) {
      throw new RenderDeviceError("Temporal planning requires rigid callback-free items", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    for (const key of ["modelMatrix", "normalMatrix", "geometryMatrix", "modelViewProjectionMatrix", "previousModelMatrix"] as const) {
      if (descriptors[key]?.value !== undefined) copyPlanMatrix(descriptors[key]!.value as Float32Array | readonly number[]);
    }
    const material = descriptors.material?.value as RenderItem["material"];
    if (!material) continue;
    const baseProperty = material instanceof MaterialInstance ? Object.getOwnPropertyDescriptor(material, "baseMaterial") : undefined;
    if (material instanceof MaterialInstance && (!baseProperty || !("value" in baseProperty))) {
      throw new RenderDeviceError("Temporal planning does not invoke material accessors", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    const base = baseProperty ? baseProperty.value as Material : material;
    const state = Object.getOwnPropertyDescriptor(base, "renderState");
    if (!state || !("value" in state) || !state.value || typeof state.value !== "object" ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(state.value))) {
      throw new RenderDeviceError("Temporal planning requires a data-only material state", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    const blend = Object.getOwnPropertyDescriptor(state.value, "blend");
    if (blend && !("value" in blend)) throw new RenderDeviceError("Temporal planning does not invoke material accessors", "TEMPORAL_PLAN_UNSUPPORTED");
  }
}

/** Renderer-lifetime owner. Every view has independently committed resources and frame state. */
export class TemporalHistory {
  private readonly views = new Map<TemporalIdentity, ViewState>();
  private readonly revisions = new Map<TemporalIdentity, number>();
  private readonly plans = new WeakMap<TemporalRasterPlan, TemporalPlanRecord>();
  private readonly preparedPlans = new WeakMap<TemporalRasterPlan, PreparedTemporalPlanRecord>();
  private readonly commitProofs = new WeakMap<TemporalCommitProof, TemporalCommitProofRecord>();
  private readonly plannedViews = new Map<TemporalIdentity, TemporalRasterPlan>();
  private readonly preparedViews = new Map<TemporalIdentity, TemporalRasterPlan>();
  private lifetime = 0;
  private lastView: TemporalIdentity = defaultView;
  private disposing = false;
  private readonly library = new ShaderLibrary();
  private pass?: ForwardPass;
  constructor() { this.library.register(velocityShader); }

  /** Track asynchronous target transfers for the owning renderer's lifetime. */
  retainRendererDevice(device: RenderDevice): () => void { return retainTemporalTransferTracker(device); }

  get renderItems(): readonly RenderItem[] { return copyTemporalItems(this.views.get(this.lastView)?.renderItems ?? []); }
  private dropPlan(plan: TemporalRasterPlan): boolean {
    if (!this.plans.has(plan)) return false;
    this.plans.delete(plan);
    if (this.plannedViews.get(plan.viewId) === plan) this.plannedViews.delete(plan.viewId);
    return true;
  }
  private bump(key: TemporalIdentity): void {
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    const plan = this.plannedViews.get(key);
    if (plan) this.dropPlan(plan);
    const prepared = this.preparedViews.get(key);
    if (prepared) { this.preparedPlans.delete(prepared); this.preparedViews.delete(key); }
  }
  private planRecordIsCurrent(plan: TemporalRasterPlan, record: TemporalPlanRecord, device: RenderDevice,
    width: number, height: number, raw: readonly number[], options: TemporalFrameOptions): boolean {
    const flags = rendererQrFlags(device);
    if (record.device !== device || record.deviceGeneration !== device.generation || record.deviceFrameToken !== device.activeFrameToken ||
        device.disposed || device.contextLost || record.flags !== flags || record.flagsVersion !== rendererQrFlagsVersion(device) ||
        !isTrustedQrFlags(flags) || record.lifetime !== this.lifetime ||
        record.revision !== (this.revisions.get(plan.viewId) ?? 0) || record.width !== width || record.height !== height ||
        raw.length !== record.viewProjection.length || !raw.every((value, index) => value === record.viewProjection[index]) ||
        !samePlanOptions(record.options, options, plan.viewId, plan.frameId, record.width, record.height)) return false;
    try {
      return record.targetState.every(samePlanTarget) && (!record.expectedDepth || expectedDepthInputCurrent(record.expectedDepth));
    } catch { return false; }
  }
  private assertViewDevice(key: TemporalIdentity, device: RenderDevice, ownPreparation = false): void {
    const state = this.views.get(key);
    if (this.disposing || state?.releasing || (state?.preparing && !ownPreparation)) {
      throw new RenderDeviceError("Temporal view cleanup or preparation is in progress", "TEMPORAL_VIEW_BUSY");
    }
    const plan = this.plannedViews.get(key);
    const plannedDevice = plan && this.plans.get(plan)?.device;
    const owner = state?.ownerDevice ?? state?.device;
    if ((owner && owner !== device) || (plannedDevice && plannedDevice !== device)) {
      throw new RenderDeviceError("Temporal view belongs to a different device; dispose the view before reusing its ID", "TEMPORAL_DEVICE_CONFLICT");
    }
  }
  private view(key: TemporalIdentity): ViewState {
    let state = this.views.get(key);
    if (!state) { state = newView(); this.views.set(key, state); }
    return state;
  }
  private revokeCommitProof(state: ViewState): void {
    const proof = state.expectedDepthCommitProof;
    state.expectedDepthCommitProof = undefined;
    if (!proof) return;
    const record = this.commitProofs.get(proof);
    this.commitProofs.delete(proof);
    try { record?.releaseWriteGuard?.(); } catch { /* Continue retiring the proof. */ }
    try { record?.unsubscribeLoss?.(); } catch { /* Retirement must not strand the remaining view resources. */ }
  }
  private invalidate(state: ViewState, reason: TemporalResetReason): void {
    if (state.cached) expectedDepthBindings.get(state.cached)?.releaseLiveWriteGuard?.();
    state.valid = false;
    state.previous.clear();
    state.framePrevious = new Map();
    state.pending.clear();
    state.frame = 0;
    state.activeFrame = undefined;
    state.committedFrame = undefined;
    state.cached = undefined;
    state.frameItems = undefined;
    state.frameObjects = undefined;
    this.revokeCommitProof(state);
    state.frameSettings = undefined;
    state.currentJitter = [0, 0];
    state.previousJitter = [0, 0];
    state.velocity.reset(reason);
  }
  reset(reason: TemporalResetReason = "camera-cut", viewId?: TemporalIdentity): void {
    if (viewId !== undefined) {
      const state = this.views.get(viewId);
      if (state) { this.bump(viewId); this.invalidate(state, reason); }
      else if (this.plannedViews.has(viewId)) { this.bump(viewId); this.revisions.delete(viewId); }
    } else {
      for (const [key, state] of this.views) { this.bump(key); this.invalidate(state, reason); }
      for (const key of [...this.plannedViews.keys()]) {
        if (!this.views.has(key)) { this.bump(key); this.revisions.delete(key); }
      }
    }
  }

  /** Whether an owner must keep the device alive for temporal resources. */
  get [resourceDisposalPending](): boolean {
    return this.disposing || [...this.views.values()].some(state =>
      state.preparing || state.releasing || state.retired.size > 0 || state.materials.length > 0
      || state.targets !== undefined || state.linZTargets !== undefined);
  }

  /**
   * A throwing native disposer may have already destroyed its handle. Only a
   * completion receipt, or a wrapper with an explicitly retryable retirement,
   * can discharge/retry it. Mock targets and our own materials have no native
   * destructor and expose their completed logical cleanup directly.
   */
  private retirementComplete(resource: Material | RenderTarget): boolean {
    if (resource instanceof Material) return resource.disposed;
    if (resource instanceof MockRenderTarget) {
      return resource.disposed && resource.colorTexture.disposed
        && (resource.colorTextures ?? []).every(texture => texture.disposed)
        && (!resource.depthTexture || resource.depthTexture.disposed)
        && (!(resource as RenderTarget).multisampledDepthTexture || (resource as RenderTarget).multisampledDepthTexture!.disposed);
    }
    const status = resource as RenderTarget & {
      readonly [resourceDisposalPending]?: boolean;
      readonly nativeDisposalComplete?: boolean;
      readonly nativeDisposalInProgress?: boolean;
    };
    return resource.disposed && status[resourceDisposalPending] === false
      && status.nativeDisposalComplete !== false && status.nativeDisposalInProgress !== true;
  }

  private nativeRetirementOwned(state: ViewState, resource: Material | RenderTarget): boolean {
    if (state.ownerDevice?.kind !== "webgpu" || resource instanceof Material) return false;
    const interop = (state.ownerDevice as RenderDevice & {
      readonly resourceInterop?: { owns(resource: object): boolean; whenRetired(resource: object): Promise<void> };
    }).resourceInterop;
    if (!interop || typeof interop.owns !== "function" || typeof interop.whenRetired !== "function") return false;
    const target = resource as RenderTarget & {
      readonly nativeTexture?: object | null;
      readonly nativeDepthTexture?: object | null;
      readonly nativeMultisampleTexture?: object | null;
      readonly nativeExtraColors?: readonly { readonly native?: object | null; readonly multisampleNative?: object | null }[];
    };
    const handles = [target.nativeTexture, target.nativeDepthTexture, target.nativeMultisampleTexture,
      ...(target.nativeExtraColors ?? []).flatMap(color => [color.native, color.multisampleNative])];
    return handles.some(handle => handle != null && interop.owns(handle));
  }

  private retireResources(state: ViewState, resources: readonly (Material | RenderTarget)[], invalidate = false): unknown[] {
    if (state.releasing) throw new RenderDeviceError("Temporal view cleanup is in progress", "TEMPORAL_VIEW_BUSY");
    state.releasing = true;
    const errors: unknown[] = [];
    try {
      for (const resource of resources) {
        if (!state.retired.has(resource)) state.retired.set(resource, {});
      }
      if (invalidate) {
        try { this.invalidate(state, "resize"); } catch (error) { errors.push(error); }
      }
      for (const resource of new Set(resources)) {
        const entry = state.retired.get(resource);
        if (!entry) continue;
        let attemptedDisposer: (() => void) | undefined;
        try {
          const status = resource as (Material | RenderTarget) & {
            readonly [resourceDisposalPending]?: boolean;
            readonly nativeDisposalComplete?: boolean;
            readonly nativeDisposalInProgress?: boolean;
          };
          if (entry.failure) {
            if (this.retirementComplete(resource)) { state.retired.delete(resource); continue; }
            // WebGPU's target wrapper owns phased interop receipts and refuses
            // to repeat an uncertain native destroy. A generic pending flag,
            // notably WebGL's, does not by itself promise such a safe retry.
            const retryable = resource instanceof Material || resource instanceof MockRenderTarget
              || (state.ownerDevice?.kind === "webgpu" && status[resourceDisposalPending] === true
                && typeof status.nativeDisposalComplete === "boolean" && status.nativeDisposalInProgress !== true
                && entry.failure.disposer === resource.dispose
                && Object.getPrototypeOf(resource)?.dispose === resource.dispose
                && this.nativeRetirementOwned(state, resource));
            if (!retryable) { errors.push(entry.failure.error); continue; }
          } else if (resource.disposed && status.nativeDisposalInProgress !== true && ((status[resourceDisposalPending] !== true
              && status.nativeDisposalComplete !== false)
              || (status.nativeDisposalComplete === true && this.nativeRetirementOwned(state, resource)))
              && (!(resource instanceof MockRenderTarget) || this.retirementComplete(resource))) {
            state.retired.delete(resource);
            continue;
          } else if (resource.disposed) {
            // Another caller may still be inside this disposer. A closed flag
            // is not permission to reenter unfinished native cleanup.
            attemptedDisposer = resource.dispose;
            throw new RenderDeviceError("Temporal resource disposal is already pending", "TEMPORAL_VIEW_BUSY");
          }
          attemptedDisposer = resource.dispose;
          attemptedDisposer.call(resource);
          const pending = status[resourceDisposalPending] === true;
          // A completed WebGPU wrapper has handed fenced native retirement to
          // the device's interop tracker, which retains and reports failures.
          const transferred = pending && status.nativeDisposalComplete === true && this.nativeRetirementOwned(state, resource);
          if (!resource.disposed || status.nativeDisposalInProgress === true
              || (pending && !transferred) || status.nativeDisposalComplete === false) {
            throw new Error("Temporal resource disposal did not complete");
          }
          state.retired.delete(resource);
        } catch (error) {
          errors.push(error);
          try {
            if (this.retirementComplete(resource)) state.retired.delete(resource);
            else entry.failure = { error, disposer: attemptedDisposer };
          } catch {
            // An unreadable receipt is not evidence of completed destruction.
            entry.failure = { error, disposer: attemptedDisposer };
          }
        }
      }
    } finally {
      state.releasing = false;
    }
    return errors;
  }

  private release(state: ViewState): void {
    if (state.releasing) throw new RenderDeviceError("Temporal view cleanup is in progress", "TEMPORAL_VIEW_BUSY");
    const resources = [...state.retired.keys(), ...state.materials, ...(state.targets ?? []), ...(state.linZTargets ?? [])];
    state.materials = [];
    state.targets = undefined;
    state.linZTargets = undefined;
    state.renderItems = [];
    const errors = this.retireResources(state, resources, true);
    if (state.retired.size === 0) {
      state.device = undefined;
      state.deviceGeneration = undefined;
    }
    if (errors.length) throw new AggregateError(errors, "Failed to retire temporal view resources");
  }
  disposeView(viewId: TemporalIdentity): void {
    const state = this.views.get(viewId);
    if (!state) {
      if (this.plannedViews.has(viewId)) this.bump(viewId);
      this.revisions.delete(viewId);
      return;
    }
    if (state.preparing || state.releasing) throw new RenderDeviceError("Temporal view is in use", "TEMPORAL_VIEW_BUSY");
    this.bump(viewId);
    this.release(state);
    if (this.views.get(viewId) === state) {
      this.views.delete(viewId);
      this.revisions.delete(viewId);
      if (this.lastView === viewId) this.lastView = defaultView;
    }
  }
  dispose(): void {
    if (this.disposing) throw new RenderDeviceError("Temporal history cleanup is in progress", "TEMPORAL_VIEW_BUSY");
    this.disposing = true;
    try {
    this.lifetime++;
    for (const plan of this.plannedViews.values()) this.plans.delete(plan);
    this.plannedViews.clear();
    for (const plan of this.preparedViews.values()) this.preparedPlans.delete(plan);
    this.preparedViews.clear();
    this.pass = undefined;
    const errors: unknown[] = [];
    for (const [key, state] of [...this.views]) {
      if (this.views.get(key) !== state) continue;
      try {
        if (state.preparing || state.releasing) throw new RenderDeviceError("Temporal view is in use", "TEMPORAL_VIEW_BUSY");
        this.release(state);
        if (this.views.get(key) === state) {
          this.views.delete(key);
          this.revisions.delete(key);
          if (this.lastView === key) this.lastView = defaultView;
        }
      } catch (error) { errors.push(error); }
    }
    for (const key of this.revisions.keys()) {
      if (!this.views.has(key)) this.revisions.delete(key);
    }
    if (errors.length) throw new AggregateError(errors, "Failed to retire temporal history resources");
    } finally {
      this.disposing = false;
    }
  }

  jitter(width: number, height: number, viewId: TemporalIdentity = this.lastView): readonly [number, number] {
    const state = this.views.get(viewId);
    return temporalJitter(state?.frame ?? 0, state?.valid ?? false, width, height);
  }

  /**
   * Predict the v2 raster camera without creating targets, changing history,
   * clearing, or drawing. An opaque record ties it to this owner, device,
   * flags, view revision and live targets. The normal preparation still runs
   * at its original phase and is the only operation that changes history.
   */
  planFrame(device: RenderDevice, width: number, height: number, viewProjection: Float32Array | readonly number[] | undefined,
    options: TemporalFrameOptions): TemporalRasterPlan {
    options = copyPlanOptions(options);
    dimensions(width, height);
    const key = options.viewId ?? defaultView, frameId = options.frameId;
    if (frameId === undefined || (typeof key === "number" && !Number.isFinite(key)) ||
        (typeof frameId === "number" && !Number.isFinite(frameId))) {
      throw new RenderDeviceError("A temporal plan requires finite view and frame IDs", "TEMPORAL_PLAN_INVALID");
    }
    this.assertViewDevice(key, device);
    const flags = rendererQrFlags(device);
    if (!isTrustedQrFlags(flags) || !flags.on("A3D_QR_POST")) {
      throw new RenderDeviceError("Temporal raster planning requires the stable v2 path", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    if (!Number.isSafeInteger(device.generation) || device.generation! < 0) {
      throw new RenderDeviceError("Temporal raster planning requires a device generation", "TEMPORAL_PLAN_UNSUPPORTED");
    }
    if (device.disposed || device.contextLost) throw new RenderDeviceError("Cannot plan a lost device", "TEMPORAL_PLAN_INVALID");
    const deviceFrameToken = device.activeFrameToken;
    if (!deviceFrameToken) throw new RenderDeviceError("Temporal raster planning requires an active device frame", "TEMPORAL_PLAN_UNSUPPORTED");
    const mode = options.reconstruction ?? "spatial";
    if (mode !== "spatial" && mode !== "temporal") throw new RenderDeviceError("Unknown temporal reconstruction mode", "TEMPORAL_INVALID_MODE");
    const outWidth = mode === "temporal" ? (options.outputWidth ?? width) : width;
    const outHeight = mode === "temporal" ? (options.outputHeight ?? height) : height;
    dimensions(outWidth, outHeight);
    const state = this.views.get(key);
    const expectedDepth = preflightExpectedDepth(device, width, height, options, state);
    const borrowedTargets = [...(options.velocity ? [options.velocity] : []), ...(options.reactive ? [options.reactive] : [])];
    const ownedTargetState = [...(state?.targets ?? []), ...(state?.linZTargets ?? [])].map(readPlanTarget);
    const borrowedTargetState = borrowedTargets.map(readPlanTarget);
    const targetState = [...ownedTargetState, ...borrowedTargetState];
    if (!borrowedTargetState.every(planTargetIsLive)) throw new RenderDeviceError("Temporal inputs must have live target textures", "TEMPORAL_INVALID_INPUT");
    if (options.velocity) liveSized(options.velocity, width, height, "velocity", device);
    if (options.reactive) liveSized(options.reactive, width, height, "reactive", device);
    if (options.velocity && options.velocity === options.reactive) throw new RenderDeviceError("Velocity and reactive inputs must not alias", "TEMPORAL_INVALID_INPUT");
    if (options.velocityMrtWritable && (!options.velocity || !options.reactive)) throw new RenderDeviceError("Writable velocity MRT requires velocity and reactive inputs", "TEMPORAL_INVALID_INPUT");
    if (mode === "temporal" && (!options.velocity || !options.reactive)) throw new RenderDeviceError("Temporal reconstruction requires populated object velocity and reactive inputs", "TEMPORAL_RECONSTRUCTION_INPUTS_MISSING");
    if (options.frameTime !== undefined && (!Number.isFinite(options.frameTime) || options.frameTime <= 0)) throw new RenderDeviceError("Temporal frameTime must be positive and finite", "TEMPORAL_INVALID_INPUT");
    if (options.depthNear !== undefined && !Number.isFinite(options.depthNear)) throw new RenderDeviceError("Temporal near distance must be finite", "TEMPORAL_INVALID_INPUT");
    const original = copyPlanMatrix(viewProjection);
    if (original.length !== 16 || !original.every(Number.isFinite)) throw new RenderDeviceError("Temporal projection must be a finite mat4", "TEMPORAL_INVALID_MATRIX");
    const sameDeviceGeneration = state?.device === device && state.deviceGeneration === device.generation;
    if (sameDeviceGeneration && state?.activeFrame === frameId && state.cached) throw new RenderDeviceError("Temporal frame is already prepared", "TEMPORAL_PLAN_ALREADY_PREPARED");
    if (sameDeviceGeneration && state?.committedFrame === frameId && state.activeFrame !== frameId) throw new RenderDeviceError("A committed temporal frame cannot be resumed after a newer frame begins", "TEMPORAL_FRAME_CONFLICT");
    const prior = this.plannedViews.get(key);
    if (prior) {
      const record = this.plans.get(prior);
      if (!record || !this.planRecordIsCurrent(prior, record, record.device, record.width, record.height, record.viewProjection, record.options)) {
        this.dropPlan(prior);
      } else if (prior.frameId !== frameId) {
        throw new RenderDeviceError("Another temporal plan is pending for this view", "TEMPORAL_PLAN_IN_FLIGHT");
      } else if (this.planRecordIsCurrent(prior, record, device, width, height, original, options)) {
        return prior;
      } else {
        throw new RenderDeviceError("Temporal plan inputs changed within the same frame", "TEMPORAL_PLAN_CONFLICT");
      }
    }
    const configurationChanged = !state || Boolean(options.reset) || options.sceneKey !== state.sceneKey ||
      Boolean(options.jitter) !== state.jitterEnabled || mode !== state.reconstruction || (options.depthNear ?? 0) !== state.depthNear;
    const deviceChanged = !!state?.device && !sameDeviceGeneration;
    const replaceTargets = !state || deviceChanged || targetDisposition(state, width, height, outWidth, outHeight, true, mode) === "replace";
    const preserveHistory = !!state && !configurationChanged && !replaceTargets && state.valid;
    const jitter = options.jitter ? temporalJitter(preserveHistory ? state!.frame : 0, preserveHistory, width, height) : [0, 0] as const;
    const unjittered = Float32Array.from(original), jittered = new Float32Array(unjittered);
    if (!unjittered.every(Number.isFinite)) throw new RenderDeviceError("Temporal projection exceeds the GPU float range", "TEMPORAL_INVALID_MATRIX");
    for (let column = 0; column < 4; column++) {
      jittered[column * 4] = jittered[column * 4]! + jitter[0] * jittered[column * 4 + 3]!;
      jittered[column * 4 + 1] = jittered[column * 4 + 1]! + jitter[1] * jittered[column * 4 + 3]!;
    }
    if (!jittered.every(Number.isFinite)) throw new RenderDeviceError("Jittered temporal projection exceeds the GPU float range", "TEMPORAL_INVALID_MATRIX");
    const plan = Object.freeze({ viewId: key, frameId,
      jitterClip: Object.freeze([jitter[0], jitter[1]] as const),
      unjittered: Object.freeze(Array.from(unjittered)), jittered: Object.freeze(Array.from(jittered)) });
    this.plans.set(plan, { device, deviceGeneration: device.generation, deviceFrameToken, flags, flagsVersion: rendererQrFlagsVersion(device), lifetime: this.lifetime,
      revision: this.revisions.get(key) ?? 0, width, height, viewProjection: original,
      options: Object.assign(Object.create(null) as TemporalFrameOptions, options, { viewId: key, frameId }), targetState,
      ...(expectedDepth ? { expectedDepth } : {}) });
    this.plannedViews.set(key, plan);
    return plan;
  }

  /** Validate a plan without consuming it or changing temporal history. */
  assertPlanCurrent(plan: TemporalRasterPlan, device: RenderDevice, width: number, height: number,
    viewProjection: Float32Array | readonly number[] | undefined, options: TemporalFrameOptions): void {
    const record = this.plans.get(plan);
    if (!record || !this.planRecordIsCurrent(plan, record, device, width, height, copyPlanMatrix(viewProjection), copyPlanOptions(options))) {
      throw new RenderDeviceError("Temporal raster plan is stale or belongs to another frame", "TEMPORAL_PLAN_STALE");
    }
  }

  /** Cancel a pending plan without changing GPU resources or temporal history. */
  cancelPlan(plan: TemporalRasterPlan): boolean { return this.dropPlan(plan); }

  /** Validate the exact prepared frame until history, device or attachments change. */
  assertPreparedPlanCurrent(plan: TemporalRasterPlan, bindings: TemporalGpuBindings): void {
    const record = this.preparedPlans.get(plan);
    if (!record) throw new RenderDeviceError("Prepared temporal raster plan is stale or belongs to another frame", "TEMPORAL_PLAN_STALE");
    const original = record.original, device = original.device, state = this.views.get(plan.viewId);
    let current = Boolean(record.bindings === bindings &&
      original.lifetime === this.lifetime && record.revision === (this.revisions.get(plan.viewId) ?? 0) &&
      state?.cached === bindings && state.activeFrame === plan.frameId && state.device === device &&
      original.deviceGeneration === device.generation && original.deviceFrameToken === device.activeFrameToken &&
      !device.disposed && !device.contextLost && original.flags === rendererQrFlags(device) &&
      original.flagsVersion === rendererQrFlagsVersion(device) && isTrustedQrFlags(original.flags));
    if (current) {
      try {
        const v2 = ownData(bindings, "v2");
        const targets = [ownData(bindings, "velocity"), ownData(bindings, "history"), ownData(bindings, "historyOutput"),
          ownData(record.v2, "linZ"), ownData(record.v2, "linZOutput"), ownData(record.v2, "reactive")].filter(value => value !== undefined);
        const matricesCurrent = temporalMatricesCurrent.get(record.v2)?.() === true;
        const jittered = record.v2.jittered, unjittered = record.v2.unjittered, clip = record.v2.jitterClip;
        current = v2 === record.v2 && matricesCurrent &&
          ownData(record.v2, "expectedPreviousDepth") === original.options.expectedPreviousDepth &&
          targets.length === record.bindingTargets.length && targets.every((target, index) => target === record.bindingTargets[index]) &&
          copyPlanMatrix(jittered).every((value, index) => value === plan.jittered[index]) &&
          copyPlanMatrix(unjittered).every((value, index) => value === plan.unjittered[index]) &&
          clip[0] === plan.jitterClip[0] && clip[1] === plan.jitterClip[1] &&
          record.targetState.every(target => planTargetIsLive(target) && samePlanTarget(target)) &&
          (!original.expectedDepth || assertExpectedPreviousDepthBindingsCurrent(bindings, device, original.width, original.height));
      } catch { current = false; }
    }
    if (!current) throw new RenderDeviceError("Prepared temporal raster plan is stale or belongs to another frame", "TEMPORAL_PLAN_STALE");
  }

  /** Consume a still-current plan, then perform normal preparation unchanged. */
  preparePlanned(plan: TemporalRasterPlan, device: RenderDevice, width: number, height: number, items: readonly RenderItem[],
    viewProjection: Float32Array | readonly number[] | undefined, options: TemporalFrameOptions): TemporalGpuBindings {
    const record = this.plans.get(plan);
    if (!record?.expectedDepth) this.dropPlan(plan);
    const raw = copyPlanMatrix(viewProjection);
    options = copyPlanOptions(options);
    if (!record) throw new RenderDeviceError("Temporal raster plan is stale or belongs to another frame", "TEMPORAL_PLAN_STALE");
    const current = (): boolean => this.planRecordIsCurrent(plan, record, device, width, height, raw, options);
    if (!current()) {
      throw new RenderDeviceError("Temporal raster plan is stale or belongs to another frame", "TEMPORAL_PLAN_STALE");
    }
    assertPlanItems(items);
    if (!current()) throw new RenderDeviceError("Temporal raster plan is stale or belongs to another frame", "TEMPORAL_PLAN_STALE");
    if (record.expectedDepth) this.dropPlan(plan);
    const prepared = this.prepare(device, width, height, items, viewProjection, options);
    // Preparation observes the real items and may invoke caller-owned getters.
    // If one changed history or the device route after the first validation,
    // never return a frame with a different raster camera from the plan.
    if (!prepared.v2 || prepared.v2.jitterClip[0] !== plan.jitterClip[0] || prepared.v2.jitterClip[1] !== plan.jitterClip[1] ||
        prepared.v2.jittered.length !== plan.jittered.length || !Array.from(prepared.v2.jittered).every((value, index) => value === plan.jittered[index])) {
      this.reset("explicit-reset", plan.viewId);
      throw new RenderDeviceError("Temporal raster plan changed during preparation", "TEMPORAL_PLAN_STALE");
    }
    const bindingTargets = [prepared.velocity, prepared.history, prepared.historyOutput, prepared.v2.linZ, prepared.v2.linZOutput,
      ...(prepared.v2.reactive ? [prepared.v2.reactive] : [])];
    try {
      const targetState = bindingTargets.map(readPlanTarget);
      if (!targetState.every(planTargetIsLive)) throw new RenderDeviceError("Prepared temporal targets must have live textures", "TEMPORAL_INVALID_INPUT");
      this.preparedPlans.set(plan, { original: record, bindings: prepared, v2: prepared.v2,
        revision: this.revisions.get(plan.viewId) ?? 0, bindingTargets, targetState });
      this.preparedViews.set(plan.viewId, plan);
    } catch (error) { this.reset("explicit-reset", plan.viewId); throw error; }
    return prepared;
  }

  prepare(device: RenderDevice, width: number, height: number, items: readonly RenderItem[], viewProjection: Float32Array | readonly number[] | undefined, options: TemporalFrameOptions): TemporalGpuBindings {
    if (ownData(options, "expectedPreviousDepth") !== undefined) options = copyPlanOptions(options);
    dimensions(width, height);
    const key = options.viewId ?? defaultView;
    const frameId = options.frameId ?? Symbol("aura.temporal.frame");
    if ((typeof key === "number" && !Number.isFinite(key)) || (typeof frameId === "number" && !Number.isFinite(frameId))) {
      throw new RenderDeviceError("Temporal view and frame IDs must be finite when numeric", "TEMPORAL_INVALID_INPUT");
    }
    this.assertViewDevice(key, device);
    if (device.disposed || device.contextLost) {
      const state = this.views.get(key);
      if (state?.device === device) { this.bump(key); this.release(state); }
      throw new RenderDeviceError("Cannot prepare temporal history on a lost or disposed device", "TEMPORAL_DEVICE_STALE");
    }
    // This opt-in must be rejected before it can invalidate a plan or history.
    const previousState = this.views.get(key);
    const sameDeviceGeneration = previousState?.device === device && previousState.deviceGeneration === device.generation;
    const revisionBeforeInput = this.revisions.get(key) ?? 0;
    const expectedDepth = preflightExpectedDepth(device, width, height, options, previousState);
    if (options.velocity) liveSized(options.velocity, width, height, "velocity", device);
    if (options.reactive) liveSized(options.reactive, width, height, "reactive", device);
    const priorExpected = sameDeviceGeneration && previousState?.activeFrame === frameId && previousState.frameSettings?.expectedPreviousDepth;
    if (sameDeviceGeneration && previousState?.activeFrame === frameId && (expectedDepth || priorExpected) &&
        (previousState.frameSettings?.expectedPreviousDepth !== options.expectedPreviousDepth || previousState.cached?.velocity !== options.velocity)) {
      throw new RenderDeviceError("Repeated temporal frame changed its expected-depth input", "TEMPORAL_FRAME_CONFLICT");
    }
    let expectedItems: TemporalItemSnapshot[] | undefined;
    if (expectedDepth) {
      const mode = options.reconstruction ?? "spatial";
      if (mode !== "spatial" && mode !== "temporal") throw new RenderDeviceError("Unknown temporal reconstruction mode", "TEMPORAL_INVALID_MODE");
      const outWidth = mode === "temporal" ? (options.outputWidth ?? width) : width;
      const outHeight = mode === "temporal" ? (options.outputHeight ?? height) : height;
      dimensions(outWidth, outHeight);
      if (mode === "temporal" && !options.reactive) throw new RenderDeviceError("Temporal reconstruction requires populated object velocity and reactive inputs", "TEMPORAL_RECONSTRUCTION_INPUTS_MISSING");
      if (options.frameTime !== undefined && (!Number.isFinite(options.frameTime) || options.frameTime <= 0)) throw new RenderDeviceError("Temporal frameTime must be positive and finite", "TEMPORAL_INVALID_INPUT");
      if (options.depthNear !== undefined && !Number.isFinite(options.depthNear)) throw new RenderDeviceError("Temporal near distance must be finite", "TEMPORAL_INVALID_INPUT");
      const vp = copyPlanMatrix(viewProjection);
      if (!vp.every(Number.isFinite) || !Float32Array.from(vp).every(Number.isFinite)) throw new RenderDeviceError("Temporal projection must be a finite mat4", "TEMPORAL_INVALID_MATRIX");
      expectedItems = snapshotItems(items);
      if ((this.revisions.get(key) ?? 0) !== revisionBeforeInput || this.views.get(key) !== previousState || !expectedDepthInputCurrent(expectedDepth)) {
        throw new RenderDeviceError("Expected previous depth changed before temporal preparation", "TEMPORAL_EXPECTED_DEPTH_STALE");
      }
      if (sameDeviceGeneration && previousState?.activeFrame === frameId && previousState.cached) {
        const cached = previousState.cached, settings = previousState.frameSettings;
        if (!liveBindings(cached) || previousState.device !== device || previousState.reconstruction !== mode ||
            previousState.sceneKey !== options.sceneKey || previousState.jitterEnabled !== Boolean(options.jitter) || previousState.depthNear !== (options.depthNear ?? 0) ||
            !previousState.frameItems || !settings ||
            settings.viewProjection.length !== vp.length || !settings.viewProjection.every((value, index) => value === vp[index]) ||
            settings.frameTime !== (options.frameTime ?? 1 / 60) || settings.velocityMrtWritable !== Boolean(options.velocityMrtWritable) ||
            settings.expectedPreviousDepth !== options.expectedPreviousDepth || settings.reset !== Boolean(options.reset) ||
            cached.velocity.width !== width || cached.velocity.height !== height || cached.history.width !== outWidth || cached.history.height !== outHeight ||
            cached.v2?.reactive !== options.reactive || cached.velocity !== options.velocity) {
          throw new RenderDeviceError("Repeated temporal frame changed its view or attachments", "TEMPORAL_FRAME_CONFLICT");
        }
        previousState.preparing = true;
        try { return this.prepareRepeated(previousState, device, width, height, items, vp, options, frameId, mode, expectedItems, expectedDepth); }
        finally { previousState.preparing = false; }
      }
      if (sameDeviceGeneration && previousState?.committedFrame === frameId && previousState.activeFrame !== frameId) {
        throw new RenderDeviceError("A committed temporal frame cannot be resumed after a newer frame begins", "TEMPORAL_FRAME_CONFLICT");
      }
    }
    this.bump(key);
    this.lastView = key;
    const state = this.view(key);
    state.preparing = true;
    try {
    const prepareRevision = this.revisions.get(key) ?? 0;
    const frameItems = expectedItems ?? snapshotItems(items);
    const mode = options.reconstruction ?? "spatial";
    if (mode !== "spatial" && mode !== "temporal") throw new RenderDeviceError("Unknown temporal reconstruction mode", "TEMPORAL_INVALID_MODE");
    const outWidth = mode === "temporal" ? (options.outputWidth ?? width) : width;
    const outHeight = mode === "temporal" ? (options.outputHeight ?? height) : height;
    dimensions(outWidth, outHeight);
    const v2 = rendererQrFlags(device).on("A3D_QR_POST");
    if (mode === "temporal" && !v2) throw new RenderDeviceError("Temporal reconstruction requires the v2 temporal path", "TEMPORAL_RECONSTRUCTION_UNSUPPORTED");
    if (options.velocity && options.velocity === options.reactive) throw new RenderDeviceError("Velocity and reactive inputs must not alias", "TEMPORAL_INVALID_INPUT");
    if (options.velocityMrtWritable && (!options.velocity || !options.reactive)) throw new RenderDeviceError("Writable velocity MRT requires velocity and reactive inputs", "TEMPORAL_INVALID_INPUT");
    if (mode === "temporal" && (!options.velocity || !options.reactive)) {
      throw new RenderDeviceError("Temporal reconstruction requires populated object velocity and reactive inputs", "TEMPORAL_RECONSTRUCTION_INPUTS_MISSING");
    }
    if (options.frameTime !== undefined && (!Number.isFinite(options.frameTime) || options.frameTime <= 0)) {
      throw new RenderDeviceError("Temporal frameTime must be positive and finite", "TEMPORAL_INVALID_INPUT");
    }
    if (options.depthNear !== undefined && !Number.isFinite(options.depthNear)) {
      throw new RenderDeviceError("Temporal near distance must be finite", "TEMPORAL_INVALID_INPUT");
    }
    const depthNear = options.depthNear ?? 0;
    if (this.views.get(key) !== state || (this.revisions.get(key) ?? 0) !== prepareRevision) {
      throw new RenderDeviceError("Temporal view changed during frame preparation", "TEMPORAL_FRAME_CONFLICT");
    }
    this.assertViewDevice(key, device, true);
    const claimedDevice = state.ownerDevice === undefined;
    state.ownerDevice ??= device;
    if (state.device && state.deviceGeneration !== device.generation) this.release(state);
    if (state.activeFrame === frameId && state.cached) {
      // A repeated pass must observe the same frame and attachments even after commit.
      const cached = state.cached;
      if (!liveBindings(cached)) {
        this.invalidate(state, "device-loss");
        throw new RenderDeviceError("Temporal frame contains a disposed attachment", "TEMPORAL_INVALID_INPUT");
      }
      const vp = viewProjection ?? identityMat4();
      const settings = state.frameSettings;
      if (state.device !== device || Boolean(cached.v2) !== v2 || state.reconstruction !== mode || state.sceneKey !== options.sceneKey || state.jitterEnabled !== Boolean(options.jitter) || state.depthNear !== depthNear
        || !state.frameItems
        || !settings || settings.viewProjection.length !== vp.length || !settings.viewProjection.every((value, i) => value === vp[i])
        || settings.frameTime !== (options.frameTime ?? 1 / 60) || settings.velocityMrtWritable !== Boolean(options.velocityMrtWritable)
        || settings.expectedPreviousDepth !== options.expectedPreviousDepth
        || settings.reset !== Boolean(options.reset)
        || cached.velocity.width !== width || cached.velocity.height !== height || cached.history.width !== outWidth || cached.history.height !== outHeight
        || (cached.v2 && (cached.v2.reactive !== options.reactive
          || cached.velocity !== (options.velocity ?? state.targets?.[0])))) {
        throw new RenderDeviceError("Repeated temporal frame changed its view or attachments", "TEMPORAL_FRAME_CONFLICT");
      }
      if (expectedDepth) assertExpectedPreviousDepthBindingsCurrent(cached, device, width, height);
      return this.prepareRepeated(state, device, width, height, items, vp, options, frameId, mode, frameItems);
    }
    if (state.committedFrame === frameId && state.activeFrame !== frameId) {
      throw new RenderDeviceError("A committed temporal frame cannot be resumed after a newer frame begins", "TEMPORAL_FRAME_CONFLICT");
    }
    if (options.reset || options.sceneKey !== state.sceneKey || Boolean(options.jitter) !== state.jitterEnabled || mode !== state.reconstruction || depthNear !== state.depthNear) {
      this.invalidate(state, options.reset ? "camera-cut" : "scene-swap");
      state.sceneKey = options.sceneKey;
      state.jitterEnabled = Boolean(options.jitter);
      state.reconstruction = mode;
      state.depthNear = depthNear;
    }
    // Starting a different frame retires the prior draw cache before any
    // attachment can be replaced. If allocation or validation throws, a
    // retry must never return a cached frame containing disposed targets.
    this.revokeCommitProof(state);
    if (state.cached) expectedDepthBindings.get(state.cached)?.releaseLiveWriteGuard?.();
    state.activeFrame = undefined;
    state.cached = undefined;
    state.frameItems = undefined;
    state.frameObjects = undefined;
    state.frameSettings = undefined;
    try {
      this.ensureTargets(state, device, width, height, outWidth, outHeight, v2, mode);
    } catch (error) {
      if (claimedDevice && !state.device && !state.targets && !state.linZTargets && state.retired.size === 0) state.ownerDevice = undefined;
      throw error;
    }
    const owned = [...state.targets!, ...(state.linZTargets ?? [])];
    if ((options.velocity && owned.includes(options.velocity)) || (options.reactive && owned.includes(options.reactive))) {
      throw new RenderDeviceError("Borrowed temporal inputs cannot alias owned history or depth", "TEMPORAL_INVALID_INPUT");
    }
    const identityOf = (target: RenderTarget) => getRenderAttachmentIdentity(target);
    const sameAttachment = (a: ReturnType<typeof identityOf>, b: ReturnType<typeof identityOf>) =>
      a.texture === b.texture && a.mipLevel === b.mipLevel && a.layer === b.layer && a.aspect === b.aspect;
    const borrowed = [options.velocity, options.reactive].filter((target): target is RenderTarget => target !== undefined).map(identityOf);
    if (borrowed.some(input => owned.map(identityOf).some(output => sameAttachment(input, output)))
      || (borrowed.length === 2 && sameAttachment(borrowed[0]!, borrowed[1]!))) {
      throw new RenderDeviceError("Borrowed temporal attachment aliases another temporal resource", "TEMPORAL_INVALID_INPUT");
    }
    // Distinct target wrappers can still address the same texture subresource.
    // A resolve samples color history, prior depth, velocity and reactive while
    // writing historyOutput; depth preparation separately writes linZOutput.
    const reads = [state.targets![1], options.velocity ?? state.targets![0], ...(state.linZTargets ? [state.linZTargets[0]] : []), ...(options.reactive ? [options.reactive] : [])].map(identityOf);
    const writes = [state.targets![2], ...(state.linZTargets ? [state.linZTargets[1]] : [])].map(identityOf);
    validateRenderAttachmentAccess(reads, writes);
    // Preserve the existing first-pass duplicate checks in the velocity
    // producer; the union is used to validate later passes before mutation.
    const frameObjects = new Map(frameItems.map(item => [item.key, item]));
    state.activeFrame = frameId;
    state.frameItems = frameItems;
    state.frameObjects = frameObjects;
    state.frameSettings = { viewProjection: Array.from(viewProjection ?? identityMat4()), frameTime: options.frameTime ?? 1 / 60,
      velocityMrtWritable: Boolean(options.velocityMrtWritable), expectedPreviousDepth: options.expectedPreviousDepth, reset: Boolean(options.reset) };
    state.cached = undefined;
    state.framePrevious = state.previous;
    state.pending.clear();
    let result: TemporalGpuBindings;
    try {
      result = copyTemporalBindings(v2
        ? this.prepareV2(state, width, height, items, viewProjection, options, frameId, mode)
        : this.prepareLegacy(state, device, width, height, items, viewProjection, options));
      state.cached = result;
      if (expectedDepth) rememberExpectedDepthBinding(result, expectedDepth, key, frameId,
        () => this.views.get(key) === state && state.cached === result && state.activeFrame === frameId && state.device === device);
    } catch (error) {
      // Preparation may have partially populated pending transforms or drawn a
      // partial velocity surface. A retry must start a fresh history rather than
      // committing those incomplete inputs as the previous frame.
      this.invalidate(state, "explicit-reset");
      throw error;
    }
    return result;
    } finally {
      state.preparing = false;
    }
  }

  private prepareRepeated(state: ViewState, device: RenderDevice, width: number, height: number,
    items: readonly RenderItem[], viewProjection: Float32Array | readonly number[],
    options: TemporalFrameOptions, frameId: TemporalFrameId, mode: "spatial" | "temporal",
    frameItems: readonly TemporalItemSnapshot[], expectedDepth?: ExpectedDepthSnapshot): TemporalGpuBindings {
    const cached = state.cached!;
    const union = unionFrameObjects(state.frameObjects ?? new Map(), frameItems);
    const previousInput = expectedDepthBindings.get(cached)?.input;
    const rebind = Boolean(expectedDepth && previousInput && expectedDepth.frameToken !== previousInput.frameToken);
    if (expectedDepth) {
      if (rebind) {
        const proof = state.expectedDepthCommitProof;
        if (!proof) throw new RenderDeviceError("Previous expected-depth pass lacks a completed frame proof", "TEMPORAL_EXPECTED_DEPTH_STALE");
        this.assertExpectedDepthCommitProof(proof, true, "prepare");
      } else {
        assertExpectedPreviousDepthBindingsCurrent(cached, device, width, height, { viewId: options.viewId ?? defaultView, frameId });
      }
    }
    const sameItems = sameItemSnapshots(state.frameItems!, frameItems);
    if (sameItems && !rebind) return cached;
    if (expectedDepth) this.bump(options.viewId ?? defaultView);
    try {
      const pass = sameItems ? cached : cached.v2
        ? this.prepareV2(state, width, height, items, viewProjection, options, frameId, mode)
        : this.prepareLegacy(state, device, width, height, items, viewProjection, options);
      // The draw list may change, but every pass reads the frame-start history
      // and writes the same output even if a standalone caller already committed.
      const result: TemporalGpuBindings = copyTemporalBindings({
        ...pass, velocity: cached.velocity, history: cached.history, historyOutput: cached.historyOutput,
        historyValid: cached.historyValid, historyFrames: cached.historyFrames,
        ...(pass.v2 && cached.v2 ? { v2: { ...pass.v2, linZ: cached.v2.linZ, linZOutput: cached.v2.linZOutput,
          previousJitterClip: cached.v2.previousJitterClip,
          unsupportedMotion: [...new Set([...cached.v2.unsupportedMotion, ...pass.v2.unsupportedMotion])] } } : {})
      });
      state.frameItems = frameItems;
      state.frameObjects = union;
      expectedDepthBindings.get(cached)?.releaseLiveWriteGuard?.();
      state.cached = result;
      this.revokeCommitProof(state);
      if (expectedDepth) {
        const key = options.viewId ?? defaultView;
        rememberExpectedDepthBinding(result, expectedDepth, key, frameId,
          () => this.views.get(key) === state && state.cached === result && state.activeFrame === frameId && state.device === device);
      }
      return result;
    } catch (error) {
      this.invalidate(state, "explicit-reset");
      throw error;
    }
  }

  private ensureTargets(state: ViewState, device: RenderDevice, width: number, height: number, outWidth: number, outHeight: number, v2: boolean, mode: "spatial" | "temporal"): void {
    const pending = this.retireResources(state, [...state.retired.keys()]);
    if (pending.length) throw new AggregateError(pending, "Failed to retire temporal view resources");
    const targets = state.targets;
    const depth = state.linZTargets;
    const disposition = targetDisposition(state, width, height, outWidth, outHeight, v2, mode);
    if (disposition === "reuse") return;
    if (disposition === "resize-temporal" && targets) {
      const needVelocity = targets[0].width !== width || targets[0].height !== height;
      const needDepthOutput = depth && (depth[1].width !== width || depth[1].height !== height);
      // Keep the previous depth and display-sized color; only the new frame's
      // render-size attachments change. The old depth remains readable.
      const made: RenderTarget[] = [];
      let retiring = false;
      try {
        const velocity = needVelocity ? device.createRenderTarget({ width, height, format: "rgba16f", depth: false, sampleCount: 1, label: "renderer-temporal-velocity" }) : undefined;
        if (velocity) made.push(velocity);
        const depthOutput = needDepthOutput ? device.createRenderTarget({ width, height, format: "rgba32f", depth: false, sampleCount: 1, label: "renderer-temporal-linz-output" }) : undefined;
        if (depthOutput) made.push(depthOutput);
        retiring = true;
        const replaced = [...(velocity ? [targets[0]] : []), ...(depthOutput && depth ? [depth[1]] : [])];
        const failures = this.retireResources(state, replaced);
        if (failures.length) throw new AggregateError(failures, "Failed to retire replaced temporal targets");
        if (velocity) targets[0] = velocity;
        if (depthOutput && depth) depth[1] = depthOutput;
      } catch (error) {
        const failures = this.retireResources(state, made);
        if (retiring) {
          try { this.invalidate(state, "resize"); } catch (failure) { failures.push(failure); }
        }
        if (failures.length) throw new AggregateError([error, ...failures], "Failed to replace and retire temporal targets");
        throw error;
      }
      return;
    }
    this.release(state);
    const made: RenderTarget[] = [];
    try {
      made.push(device.createRenderTarget({ width, height, format: "rgba16f", depth: !v2, sampleCount: 1, label: "renderer-temporal-velocity" }));
      for (const label of ["history-a", "history-b"]) made.push(device.createRenderTarget({ width: outWidth, height: outHeight, format: "rgba16f", depth: false, sampleCount: 1, label: `renderer-temporal-${label}` }));
      if (v2) for (const label of ["linz-a", "linz-b"]) made.push(device.createRenderTarget({ width, height, format: "rgba32f", depth: false, sampleCount: 1, label: `renderer-temporal-${label}` }));
      state.targets = made.slice(0, 3) as [RenderTarget, RenderTarget, RenderTarget];
      state.linZTargets = v2 ? made.slice(3) as [RenderTarget, RenderTarget] : undefined;
      state.device = device;
      state.deviceGeneration = device.generation;
    } catch (error) {
      const failures = this.retireResources(state, made);
      if (failures.length) throw new AggregateError([error, ...failures], "Failed to allocate and retire temporal targets");
      throw error;
    }
  }

  private prepareLegacy(state: ViewState, device: RenderDevice, width: number, height: number, items: readonly RenderItem[], viewProjection: Float32Array | readonly number[] | undefined, options: TemporalFrameOptions): TemporalGpuBindings {
    const targets = state.targets!;
    const materials = state.materials;
    state.materials = [];
    const failures = this.retireResources(state, materials);
    if (failures.length) throw new AggregateError(failures, "Failed to retire temporal materials");
    const seen = new Set<TemporalIdentity>();
    const velocityItems = items.map(item => {
      const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
      const key = (item as KeyedItem).temporalObjectKey ?? item;
      if (seen.has(key) || item.skinning || item.morphTargets?.length || item.instanceTransforms?.length || item.geometry.topology !== "triangles" || base?.renderState.blend) {
        throw new RenderDeviceError("Temporal rendering requires stable unique objects and opaque rigid noninstanced geometry; skinning, morphing and transparency require separate velocity support.", "TEMPORAL_UNSUPPORTED_GEOMETRY", { label: item.label });
      }
      seen.add(key);
      const current = new Float32Array(item.modelViewProjectionMatrix ?? multiplyMat4(Array.from(viewProjection ?? identityMat4()) as Mat4, Array.from(item.modelMatrix ?? identityMat4()) as Mat4));
      if (current.length !== 16 || !current.every(Number.isFinite)) throw new RenderDeviceError("Temporal transform must be finite mat4", "TEMPORAL_INVALID_MATRIX");
      const unjittered = new Float32Array(current);
      if (options.jitter) { const [x, y] = this.jitter(width, height); for (let col = 0; col < 4; col++) { current[col*4]! += x * current[col*4+3]!; current[col*4+1]! += y * current[col*4+3]!; } }
      const previous = state.valid ? state.framePrevious.get(key) ?? unjittered : unjittered;
      state.pending.set(key, unjittered);
      if (state.committedFrame === state.activeFrame) state.previous.set(key, unjittered);
      const material = new Material({ shaderKey: velocityShader.name, requiredAttributes: ["a_position"], parameters: { u_modelViewProjection: current, u_previousViewProjection: previous, u_unjitteredViewProjection: unjittered }, uniformSchema: [{ name: "u_modelViewProjection", kind: "mat4" }, { name: "u_previousViewProjection", kind: "mat4" }, { name: "u_unjitteredViewProjection", kind: "mat4" }], renderState: { cullMode: base?.renderState.cullMode ?? "back" } });
      state.materials.push(material);
      return { ...item, material, modelViewProjectionMatrix: current };
    });
    state.renderItems = items.map((item, index) => {
      const result = { ...item, modelViewProjectionMatrix: velocityItems[index]!.modelViewProjectionMatrix };
      transferPackedLoopMember(item, result);
      return result;
    });
    device.setRenderTarget(targets[0]);
    device.clear([0, 0, 1, 1]);
    this.pass = new ForwardPass({ items: velocityItems, shaderLibrary: this.library });
    this.pass.execute({ device, width, height });
    return { velocity: targets[0], history: targets[1], historyOutput: targets[2], historyValid: state.valid, historyFrames: state.valid ? state.frame : 0, renderItems: state.renderItems };
  }

  private prepareV2(state: ViewState, width: number, height: number, items: readonly RenderItem[], viewProjection: Float32Array | readonly number[] | undefined, options: TemporalFrameOptions, frameId: TemporalFrameId, mode: "spatial" | "temporal"): TemporalGpuBindings {
    const targets = state.targets!;
    const depth = state.linZTargets!;
    const vp = Float32Array.from(viewProjection ?? identityMat4());
    const jitter = state.cached?.v2?.jitterClip ?? (options.jitter ? this.jitter(width, height) : ([0, 0] as const));
    const cam = state.velocity.prepare(vp, jitter, frameId);
    state.currentJitter = jitter;
    // Dilation currently carries current linear depth only. Comparing it to
    // previous depth is approximate under camera/object depth motion until a
    // producer supplies the expected previous linear depth per pixel.
    const unsupported = new Set<string>(options.expectedPreviousDepth === "velocity-alpha" ? [] : ["previous-depth-approximation"]);
    state.renderItems = items.map(item => {
      const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
      // Camera-only velocity cannot represent deformation. The built-in MRT
      // feature reprojects the previous pose (previous bone palette, morph
      // weights and per-instance matrices from the scoped VelocityHistory);
      // eight-influence instanced skins have no attribute slots left for
      // previous instance matrices and stay reactive.
      const rigidApproximation = !options.velocity;
      const mrtInstanceSlots = !options.velocityMrtWritable || !item.skinning?.extraInfluences;
      if (rigidApproximation && item.skinning) unsupported.add("skinning-motion");
      if (rigidApproximation && item.morphTargets?.length) unsupported.add("morph-motion");
      if ((rigidApproximation || !mrtInstanceSlots) && item.instanceTransforms?.length) unsupported.add("instance-motion");
      if (!options.reactive && (item.writesReactive || base?.renderState.blend)) unsupported.add("transparent-reactive");
      const unjittered = Float32Array.from(item.modelViewProjectionMatrix
        ?? multiplyMat4(Array.from(vp) as Mat4, Array.from(item.modelMatrix ?? identityMat4()) as Mat4));
      if (unjittered.length !== 16 || !unjittered.every(Number.isFinite)) throw new RenderDeviceError("Temporal transform must be finite mat4", "TEMPORAL_INVALID_MATRIX");
      const current = new Float32Array(unjittered);
      for (let col = 0; col < 4; col += 1) {
        current[col * 4] = current[col * 4]! + jitter[0] * current[col * 4 + 3]!;
        current[col * 4 + 1] = current[col * 4 + 1]! + jitter[1] * current[col * 4 + 3]!;
      }
      const velocityItem = base?.renderState.blend
        ? { ...item, temporalObjectKey: (item as KeyedItem).temporalObjectKey ?? item, writesReactive: true }
        : item;
      const result = { ...state.velocity.prepareItem(velocityItem, options.velocityMrtWritable === true), modelViewProjectionMatrix: current };
      transferPackedLoopMember(item, result);
      return result;
    });
    if (!options.velocity && state.velocity.coverage.moving > 0) unsupported.add("object-motion");
    return {
      velocity: options.velocity ?? targets[0], history: targets[1], historyOutput: targets[2],
      historyValid: state.valid, historyFrames: state.valid ? state.frame : 0, renderItems: state.renderItems,
      v2: { jittered: cam.jittered, unjittered: cam.unjittered, previous: cam.previous,
        linZ: depth[0], linZOutput: depth[1], jitterClip: jitter, previousJitterClip: state.previousJitter,
        frameTime: options.frameTime ?? 1 / 60, depthNear: options.depthNear ?? 0, ...(options.reactive ? { reactive: options.reactive } : {}),
        ...(options.expectedPreviousDepth === "velocity-alpha" ? { expectedPreviousDepth: "velocity-alpha" as const } : {}),
        motionSource: options.velocity ? "object" : "camera", unsupportedMotion: [...unsupported],
        reconstruction: mode, coverage: state.velocity.coverage }
    };
  }

  /**
   * Capture the exact expected-depth binding while its device frame is still
   * active. A proof is not a submission or a commit.
   */
  private stageExpectedDepthCommit(viewId: TemporalIdentity, frameId: TemporalFrameId): TemporalCommitProof | undefined {
    const state = this.views.get(viewId);
    const bindings = state?.cached;
    if (!state || !bindings || (!expectedDepthBindings.has(bindings) && bindings.v2?.expectedPreviousDepth === undefined)) return undefined;
    const id = frameId ?? state.activeFrame;
    const device = state.device;
    if (id === undefined || id !== state.activeFrame || !device || state.deviceGeneration !== device.generation) {
      throw new RenderDeviceError("Expected previous depth binding is stale or unverified", "TEMPORAL_EXPECTED_DEPTH_STALE");
    }
    assertExpectedPreviousDepthBindingsCurrent(bindings, device, bindings.velocity.width, bindings.velocity.height, { viewId, frameId: id });
    const input = expectedDepthBindings.get(bindings)!.input;
    const proof = Object.freeze({}) as TemporalCommitProof;
    this.revokeCommitProof(state);
    const record: TemporalCommitProofRecord = { state, bindings, viewId, frameId: id, device, frameToken: input.frameToken,
      generation: input.generation, lifetime: this.lifetime, revision: this.revisions.get(viewId) ?? 0, sealed: false, revoked: false };
    this.commitProofs.set(proof, record);
    state.expectedDepthCommitProof = proof;
    try {
      record.unsubscribeLoss = device.onDeviceLost?.(() => { record.revoked = true; });
      if (rendererQrIsScopedBinding(device, input.flags, input.flagsVersion)) {
        const guarded = guardRendererExpectedDepthWrites(device, input.flagsVersion,
          expectedDepthBindings.get(bindings)!.targets, () => { record.revoked = true; });
        record.writeGuardCurrent = guarded.current;
        record.releaseWriteGuard = guarded.release;
      }
      expectedDepthBindings.get(bindings)?.releaseLiveWriteGuard?.();
    }
    catch (error) { this.revokeCommitProof(state); throw error; }
    if (record.revoked || device.disposed || device.contextLost || device.generation !== record.generation ||
        device.activeFrameToken !== record.frameToken) {
      this.revokeCommitProof(state);
      throw new RenderDeviceError("Expected previous depth frame changed while staging", "TEMPORAL_EXPECTED_DEPTH_STALE");
    }
    return proof;
  }

  private assertExpectedDepthCommitProof(proof: TemporalCommitProof, sealed: boolean, action?: "prepare" | "commit"): TemporalCommitProofRecord {
    const record = this.commitProofs.get(proof);
    const stale = (): never => { throw new RenderDeviceError("Expected previous depth commit proof is stale or unverified", "TEMPORAL_EXPECTED_DEPTH_STALE"); };
    if (!record || record.revoked || (record.writeGuardCurrent && !record.writeGuardCurrent()) ||
        record.sealed !== sealed || record.lifetime !== this.lifetime ||
        record.revision !== (this.revisions.get(record.viewId) ?? 0) ||
        this.views.get(record.viewId) !== record.state || record.state.expectedDepthCommitProof !== proof ||
        record.state.cached !== record.bindings || record.state.activeFrame !== record.frameId ||
        record.state.device !== record.device || record.state.deviceGeneration !== record.generation ||
        record.device.disposed || record.device.contextLost || record.device.generation !== record.generation) return stale();
    const input = expectedDepthBindings.get(record.bindings)?.input;
    if (sealed && input && rendererQrIsScopedBinding(record.device, input.flags, input.flagsVersion) &&
        (!action || !consumeRendererQrProofAccess(record.device, input.flagsVersion, this, record.viewId, record.frameId, action))) return stale();
    assertExpectedDepthBindings(record.bindings, record.device, record.bindings.velocity.width, record.bindings.velocity.height,
      { viewId: record.viewId, frameId: record.frameId }, record.frameToken, true);
    return record;
  }

  private sealExpectedDepthCommit(proof: TemporalCommitProof): void {
    const record = this.assertExpectedDepthCommitProof(proof, false);
    if (record.device.activeFrameToken !== null) {
      throw new RenderDeviceError("Expected previous depth frame has not ended", "TEMPORAL_EXPECTED_DEPTH_STALE");
    }
    record.sealed = true;
  }

  /**
   * End this renderer-owned device pass. When it produced expected-depth
   * history, capture and seal its opaque proof around this exact endFrame
   * call, with no callback or asynchronous gap between the two operations.
   * A later authored-frame failure must still reset the view before commit.
   */
  endDeviceFrame(device: RenderDevice, viewId: TemporalIdentity, frameId: TemporalFrameId, completed: boolean): void {
    const initialToken = device.activeFrameToken;
    const state = this.views.get(viewId);
    const owner = state?.ownerDevice ?? state?.device;
    if (owner && owner !== device) {
      // A rejected foreign prepare still has to end its own device frame; it
      // must not revoke or stage the original device's view proof.
      device.endFrame();
      return;
    }
    const cached = state?.cached;
    const input = cached && expectedDepthBindings.get(cached)?.input;
    const ownsInitialFrame = !input || (input.device === device && input.frameToken === initialToken);
    let proof: TemporalCommitProof | undefined;
    try {
      if (!completed && state?.activeFrame === frameId) this.revokeCommitProof(state);
      if (completed) proof = this.stageExpectedDepthCommit(viewId, frameId);
      if (proof && this.commitProofs.get(proof)!.device !== device) {
        throw new RenderDeviceError("Expected previous depth proof belongs to another device", "TEMPORAL_EXPECTED_DEPTH_STALE");
      }
      if (initialToken && device.activeFrameToken !== initialToken) {
        throw new RenderDeviceError("Temporal device frame changed before completion", "TEMPORAL_EXPECTED_DEPTH_STALE");
      }
    } catch (error) {
      if (state?.activeFrame === frameId) this.revokeCommitProof(state);
      // Do not end another owner's replacement frame. If our original frame
      // is still active, retire it even when validation itself failed.
      if (ownsInitialFrame && initialToken && device.activeFrameToken === initialToken) {
        try { device.endFrame(); } catch { /* Preserve the validation error. */ }
      }
      throw error;
    }
    try {
      device.endFrame();
      if (proof) this.sealExpectedDepthCommit(proof);
    } catch (error) {
      if (state?.activeFrame === frameId) this.revokeCommitProof(state);
      throw error;
    }
  }

  commit(viewId: TemporalIdentity = this.lastView, frameId?: TemporalFrameId): void {
    const state = this.views.get(viewId);
    if (!state?.targets || !state.cached || state.activeFrame === undefined) return;
    const id = frameId ?? state.activeFrame;
    if (id !== state.activeFrame) return;
    if (!state.device || state.device.disposed || state.device.contextLost || state.deviceGeneration !== state.device.generation) {
      this.bump(viewId);
      this.release(state);
      throw new RenderDeviceError("Cannot commit stale temporal history after device loss or a generation change", "TEMPORAL_DEVICE_STALE");
    }
    if (id === state.committedFrame) return;
    if (expectedDepthBindings.has(state.cached) || state.cached.v2?.expectedPreviousDepth !== undefined) {
      const input = expectedDepthBindings.get(state.cached)?.input;
      if (input && state.device.activeFrameToken === input.frameToken) {
        assertExpectedPreviousDepthBindingsCurrent(state.cached, state.device, state.cached.velocity.width, state.cached.velocity.height,
          { viewId, frameId: id });
      } else {
        const proof = state.expectedDepthCommitProof;
        if (!proof || state.device.activeFrameToken !== null) {
          throw new RenderDeviceError("Expected previous depth commit requires a completed frame proof", "TEMPORAL_EXPECTED_DEPTH_STALE");
        }
        this.assertExpectedDepthCommitProof(proof, true, "commit");
      }
    }
    this.revokeCommitProof(state);
    this.bump(viewId);
    if (!liveBindings(state.cached)) {
      this.invalidate(state, "device-loss");
      throw new RenderDeviceError("Cannot commit a temporal frame with a disposed attachment", "TEMPORAL_INVALID_INPUT");
    }
    [state.targets[1], state.targets[2]] = [state.targets[2], state.targets[1]];
    if (state.linZTargets) [state.linZTargets[0], state.linZTargets[1]] = [state.linZTargets[1], state.linZTargets[0]];
    state.previous = new Map(state.pending);
    state.previousJitter = state.currentJitter;
    state.velocity.commit(id);
    state.valid = true;
    state.frame += 1;
    state.committedFrame = id;
  }
}

const velocityShader = {
  name: "renderer-temporal-velocity", marker: "AURA_TEMPORAL_VELOCITY",
  vertex: `#version 300 es
// AURA_TEMPORAL_VELOCITY
precision highp float;
in vec3 a_position;
uniform mat4 u_modelViewProjection;
uniform mat4 u_previousViewProjection;
uniform mat4 u_unjitteredViewProjection;
out vec4 v_current;
out vec4 v_previous;
void main(){ v_current=u_unjitteredViewProjection*vec4(a_position,1.0); v_previous=u_previousViewProjection*vec4(a_position,1.0); gl_Position=u_modelViewProjection*vec4(a_position,1.0); }`,
  fragment: `#version 300 es
// AURA_TEMPORAL_VELOCITY
precision highp float;
in vec4 v_current; in vec4 v_previous; out vec4 outColor;
void main(){ vec3 c=v_current.xyz/max(v_current.w,0.00001)*0.5+0.5; vec3 p=v_previous.xyz/max(v_previous.w,0.00001)*0.5+0.5; outColor=vec4(clamp(c.xy-p.xy,vec2(-0.25),vec2(0.25)),c.z,p.z); }`,
  portableBindings: [{ name: "u_modelViewProjection", kind: "mat4" as const }, { name: "u_previousViewProjection", kind: "mat4" as const }, { name: "u_unjitteredViewProjection", kind: "mat4" as const }],
  webgpu: {
    vertex: `// AURA_TEMPORAL_VELOCITY
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
struct Out { @builtin(position) position: vec4<f32>, @location(0) current: vec4<f32>, @location(1) previous: vec4<f32> };
@vertex fn main(@location(0) position: vec3<f32>) -> Out { var out: Out; out.current=aura.u_unjitteredViewProjection*vec4<f32>(position,1); out.previous=aura.u_previousViewProjection*vec4<f32>(position,1); let clip=aura.u_modelViewProjection*vec4<f32>(position,1); out.position=vec4<f32>(clip.xy,${rasterClipDepthWgsl("clip")},clip.w); return out; }`,
    fragment: `// AURA_TEMPORAL_VELOCITY
/* @aura3d-bindings */
@fragment fn main(@location(0) current: vec4<f32>, @location(1) previous: vec4<f32>) -> @location(0) vec4<f32> { let c=current.xyz/max(current.w,0.00001)*0.5+0.5; let p=previous.xyz/max(previous.w,0.00001)*0.5+0.5; return vec4<f32>(clamp((c.xy-p.xy)*vec2<f32>(1,-1),vec2<f32>(-.25),vec2<f32>(.25)),c.z,p.z); }`
  }
};
