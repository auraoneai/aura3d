import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import type { DepthClipRange, DepthMode } from "../DepthConvention";
import type { TemporalFrameId, TemporalIdentity } from "../contracts/velocity";

/** Column-major, as supplied to the forward shader. */
export type SceneRasterMatrix = readonly [
  number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number
];
type MatrixInput = Float32Array | readonly number[];

export interface SceneRasterExtent { readonly width: number; readonly height: number }
/** Rectangles use physical target pixels and a bottom-left origin on both backends. */
export interface SceneRasterRect extends SceneRasterExtent { readonly x: number; readonly y: number }

export interface SceneRasterSnapshotInput {
  /** Identity of the renderer/view owner; checked by reference, not inspected. */
  readonly owner: object;
  readonly device: RenderDevice;
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
  readonly viewMatrix: MatrixInput;
  /** Actual jittered projection supplied to forward shaders. */
  readonly projectionMatrix: MatrixInput;
  readonly viewProjectionMatrix: MatrixInput;
  readonly unjitteredViewProjectionMatrix: MatrixInput;
  readonly jitterClip: readonly [number, number];
  /** These describe the shader-input projection, before any backend clip conversion. */
  readonly depth: { readonly mode: DepthMode; readonly clipRange: DepthClipRange };
  /** Full forward target extent, not a shadow map or viewport size. */
  readonly targetExtent: SceneRasterExtent;
  readonly viewport: SceneRasterRect;
  /** Null means scissor testing is disabled. */
  readonly scissor: SceneRasterRect | null;
  /** CSS dimensions may be unavailable for an offscreen target. */
  readonly cssExtent: SceneRasterExtent | null;
  readonly devicePixelRatio: number;
}

export interface SceneRasterSnapshot {
  readonly viewId: TemporalIdentity;
  readonly frameId: TemporalFrameId;
  readonly viewMatrix: SceneRasterMatrix;
  readonly projectionMatrix: SceneRasterMatrix;
  readonly viewProjectionMatrix: SceneRasterMatrix;
  readonly inverseViewMatrix: SceneRasterMatrix;
  readonly inverseProjectionMatrix: SceneRasterMatrix;
  readonly inverseViewProjectionMatrix: SceneRasterMatrix;
  readonly unjitteredViewProjectionMatrix: SceneRasterMatrix;
  readonly jitterClip: readonly [number, number];
  readonly depth: { readonly mode: DepthMode; readonly clipRange: DepthClipRange };
  readonly targetExtent: SceneRasterExtent;
  readonly viewport: SceneRasterRect;
  readonly scissor: SceneRasterRect | null;
  readonly cssExtent: SceneRasterExtent | null;
  readonly devicePixelRatio: number;
}

/** Effective line uniforms after forward material overrides and draw hooks. */
export interface SceneRasterLineUniformInput {
  readonly modelMatrix: MatrixInput;
  readonly modelViewProjectionMatrix: MatrixInput;
  readonly viewMatrix: MatrixInput;
  readonly projectionMatrix: MatrixInput;
  /** `u_a3dClipInverseLineTransform`, when the selected shader uses it. */
  readonly clipInverseLineTransform: MatrixInput | null;
  readonly baseColor: readonly [number, number, number, number];
  /** The bound `u_lineResolution`, which need not equal the viewport or target. */
  readonly resolution: readonly [number, number];
  readonly width: number;
  readonly worldUnits: number;
  readonly pixelRatio: number;
  readonly squareCaps: number;
  readonly roundCaps: number;
  readonly dashSize: number;
  readonly gapSize: number;
  readonly dashOffset: number;
}

export interface SceneRasterLineUniforms extends Omit<SceneRasterLineUniformInput,
  "modelMatrix" | "modelViewProjectionMatrix" | "viewMatrix" | "projectionMatrix" | "clipInverseLineTransform"> {
  readonly modelMatrix: SceneRasterMatrix;
  readonly modelViewProjectionMatrix: SceneRasterMatrix;
  readonly viewMatrix: SceneRasterMatrix;
  readonly projectionMatrix: SceneRasterMatrix;
  readonly clipInverseLineTransform: SceneRasterMatrix | null;
}

interface SnapshotAuthority {
  readonly owner: object;
  readonly device: RenderDevice;
  readonly generation: number;
  readonly frameToken: object;
}
const authorities = new WeakMap<SceneRasterSnapshot, SnapshotAuthority>();
const lineSnapshots = new WeakMap<SceneRasterLineUniforms, SceneRasterSnapshot>();
const tolerance = 1e-5;

function invalid(message: string): never {
  throw new RenderDeviceError(message, "SCENE_RASTER_SNAPSHOT_INVALID");
}

function matrix(value: MatrixInput, name: string): SceneRasterMatrix {
  if (!value || value.length !== 16) return invalid(`${name} must be a finite mat4`);
  // Shader matrix uniforms are float32. Validate after conversion as well as
  // before it, so overflow or a collapsed transform cannot be admitted.
  const result: number[] = [];
  for (let index = 0; index < 16; index += 1) result.push(finiteFloat(value[index]!, name));
  return Object.freeze(result) as unknown as SceneRasterMatrix;
}

function inverse(value: SceneRasterMatrix, name: string): SceneRasterMatrix {
  try {
    const result = matrix(invertMat4(value as Mat4), `inverse ${name}`);
    // Reject inverses whose float32 representation cannot reconstruct the
    // input reliably; checking both products also catches ill-conditioned data.
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    if (!matches(multiplyMat4(value as Mat4, result as Mat4), identity) ||
        !matches(multiplyMat4(result as Mat4, value as Mat4), identity)) return invalid(`${name} has no usable float32 inverse`);
    return result;
  } catch {
    return invalid(`${name} must have a finite, usable inverse`);
  }
}

function matches(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((value, index) =>
    Number.isFinite(value) && Math.abs(value - expected[index]!) <= tolerance * Math.max(1, Math.abs(value), Math.abs(expected[index]!)));
}

function extent(value: SceneRasterExtent, name: string, pixels: boolean): SceneRasterExtent {
  if (!value) return invalid(`${name} is required`);
  const { width, height } = value;
  if (![width, height].every((entry) => Number.isFinite(entry) && entry > 0 && (!pixels || Number.isSafeInteger(entry)))) {
    return invalid(`${name} must have positive ${pixels ? "integer pixel" : "finite"} dimensions`);
  }
  return Object.freeze({ width, height });
}

function rect(value: SceneRasterRect, target: SceneRasterExtent, name: string): SceneRasterRect {
  if (!value) return invalid(`${name} is required`);
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
      width > target.width || height > target.height || x > target.width - width || y > target.height - height) {
    return invalid(`${name} must be a positive integer pixel rectangle inside the target`);
  }
  return Object.freeze({ x, y, width, height });
}

function finiteFloat(value: number, name: string): number {
  if (!Number.isFinite(value)) return invalid(`${name} must be finite in float32`);
  const result = Math.fround(value);
  if (!Number.isFinite(result)) return invalid(`${name} must be finite in float32`);
  return result;
}

/**
 * Capture immutable camera values for one active frame and view. This verifies
 * matrix relationships and frame identity only: it does not prove that the
 * caller supplied the renderer's actual camera or lease a target, geometry,
 * material, callback, texture, or other participant until forward drawing.
 * Those capabilities must be established separately before using this packet
 * to enable specialized shadow or camera-depth geometry.
 */
export function createSceneRasterSnapshot(input: SceneRasterSnapshotInput): SceneRasterSnapshot {
  const { owner, device, viewId, frameId } = input;
  const token = device.activeFrameToken, generation = device.generation;
  if (!owner || (typeof owner !== "object" && typeof owner !== "function") || !token ||
      !Number.isSafeInteger(generation) || generation! < 0 || device.disposed || device.contextLost) {
    return invalid("A live device generation and active frame identity are required");
  }
  if (viewId == null || !["object", "string", "number", "symbol"].includes(typeof viewId) ||
      !["string", "number", "symbol"].includes(typeof frameId) ||
      (typeof viewId === "number" && !Number.isFinite(viewId)) || (typeof frameId === "number" && !Number.isFinite(frameId))) {
    return invalid("View and frame identities must be valid");
  }
  const view = matrix(input.viewMatrix, "viewMatrix"), projection = matrix(input.projectionMatrix, "projectionMatrix");
  const viewProjection = matrix(input.viewProjectionMatrix, "viewProjectionMatrix");
  const unjittered = matrix(input.unjitteredViewProjectionMatrix, "unjitteredViewProjectionMatrix");
  if (!matches(multiplyMat4(projection as Mat4, view as Mat4), viewProjection)) return invalid("Projection and view do not match the raster view-projection");
  const sourceJitter = input.jitterClip;
  if (!sourceJitter || sourceJitter.length !== 2) return invalid("jitterClip must contain two finite values");
  const xJitter = sourceJitter[0], yJitter = sourceJitter[1];
  if (!Number.isFinite(xJitter) || !Number.isFinite(yJitter)) return invalid("jitterClip must contain two finite values");
  const jitterClip = Object.freeze([xJitter, yJitter] as const);
  const expected = [...unjittered];
  for (let column = 0; column < 4; column += 1) {
    expected[column * 4] = Math.fround(unjittered[column * 4]! + jitterClip[0] * unjittered[column * 4 + 3]!);
    expected[column * 4 + 1] = Math.fround(unjittered[column * 4 + 1]! + jitterClip[1] * unjittered[column * 4 + 3]!);
  }
  if (!expected.every((value, index) => Number.isFinite(value) && value === viewProjection[index])) {
    return invalid("Jitter does not match the raster view-projection");
  }
  const mode = input.depth?.mode, clipRange = input.depth?.clipRange;
  if ((mode !== "standard" && mode !== "reversed" && mode !== "logarithmic") ||
      (clipRange !== "minus-one-to-one" && clipRange !== "zero-to-one")) return invalid("Invalid shader-input depth convention");
  const targetExtent = extent(input.targetExtent, "targetExtent", true);
  const viewport = rect(input.viewport, targetExtent, "viewport");
  const scissor = input.scissor === null ? null : rect(input.scissor, targetExtent, "scissor");
  const cssExtent = input.cssExtent === null ? null : extent(input.cssExtent, "cssExtent", false);
  const devicePixelRatio = input.devicePixelRatio;
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return invalid("devicePixelRatio must be positive and finite");
  const snapshot: SceneRasterSnapshot = Object.freeze({ viewId, frameId, viewMatrix: view, projectionMatrix: projection,
    viewProjectionMatrix: viewProjection, inverseViewMatrix: inverse(view, "viewMatrix"),
    inverseProjectionMatrix: inverse(projection, "projectionMatrix"), inverseViewProjectionMatrix: inverse(viewProjection, "viewProjectionMatrix"),
    unjitteredViewProjectionMatrix: unjittered, jitterClip, depth: Object.freeze({ mode, clipRange }),
    targetExtent, viewport, scissor, cssExtent, devicePixelRatio });
  if (device.activeFrameToken !== token || device.generation !== generation || device.disposed || device.contextLost) {
    return invalid("The device frame changed while capturing the scene raster snapshot");
  }
  authorities.set(snapshot, { owner, device, generation: generation!, frameToken: token });
  return snapshot;
}

/** Validate only the packet's owner and device-frame identity, not its mutable participants. */
export function assertSceneRasterSnapshotCurrent(snapshot: SceneRasterSnapshot, owner: object, device: RenderDevice,
  viewId: TemporalIdentity, frameId: TemporalFrameId): void {
  const authority = authorities.get(snapshot);
  if (!authority || authority.owner !== owner || authority.device !== device || authority.generation !== device.generation ||
      authority.frameToken !== device.activeFrameToken || device.disposed || device.contextLost ||
      snapshot.viewId !== viewId || snapshot.frameId !== frameId) {
    throw new RenderDeviceError("Scene raster snapshot is stale or belongs to another frame", "SCENE_RASTER_SNAPSHOT_STALE");
  }
}

/** Copy effective line values for this frame; this does not capture geometry or lease participants. */
export function snapshotSceneRasterLineUniforms(snapshot: SceneRasterSnapshot, input: SceneRasterLineUniformInput): SceneRasterLineUniforms {
  const authority = authorities.get(snapshot);
  if (!authority) throw new RenderDeviceError("Scene raster snapshot is stale or belongs to another frame", "SCENE_RASTER_SNAPSHOT_STALE");
  const current = () => assertSceneRasterSnapshotCurrent(snapshot, authority.owner, authority.device, snapshot.viewId, snapshot.frameId);
  current();
  const sourceResolution = input.resolution;
  if (!sourceResolution || sourceResolution.length !== 2) return invalid("line resolution must contain two values");
  const resolution = Object.freeze([finiteFloat(sourceResolution[0], "line resolution"), finiteFloat(sourceResolution[1], "line resolution")] as const);
  const width = finiteFloat(input.width, "line width"), pixelRatio = finiteFloat(input.pixelRatio, "line pixel ratio");
  const dashSize = finiteFloat(input.dashSize, "line dash size"), gapSize = finiteFloat(input.gapSize, "line gap size");
  if (resolution.some((value) => value <= 0) || width <= 0 || pixelRatio <= 0 ||
      dashSize < 0 || gapSize < 0 || (dashSize > 0 && gapSize <= 0)) return invalid("Invalid effective line dimensions or dash period");
  const sourceColor = input.baseColor;
  if (!sourceColor || sourceColor.length !== 4) return invalid("line baseColor must contain four values");
  const baseColor = Object.freeze([finiteFloat(sourceColor[0], "line baseColor"), finiteFloat(sourceColor[1], "line baseColor"),
    finiteFloat(sourceColor[2], "line baseColor"), finiteFloat(sourceColor[3], "line baseColor")] as const);
  const packet: SceneRasterLineUniforms = Object.freeze({ modelMatrix: matrix(input.modelMatrix, "line modelMatrix"),
    modelViewProjectionMatrix: matrix(input.modelViewProjectionMatrix, "line modelViewProjectionMatrix"),
    viewMatrix: matrix(input.viewMatrix, "line viewMatrix"), projectionMatrix: matrix(input.projectionMatrix, "line projectionMatrix"),
    clipInverseLineTransform: input.clipInverseLineTransform === null ? null : matrix(input.clipInverseLineTransform, "line clip inverse"),
    baseColor, resolution, width, worldUnits: finiteFloat(input.worldUnits, "line worldUnits"), pixelRatio,
    squareCaps: finiteFloat(input.squareCaps, "line squareCaps"), roundCaps: finiteFloat(input.roundCaps, "line roundCaps"),
    dashSize, gapSize, dashOffset: finiteFloat(input.dashOffset, "line dashOffset") });
  current();
  lineSnapshots.set(packet, snapshot);
  return packet;
}

/** Ensure copied line values belong to this same live camera snapshot. */
export function assertSceneRasterLineUniformsCurrent(packet: SceneRasterLineUniforms, snapshot: SceneRasterSnapshot,
  owner: object, device: RenderDevice, viewId: TemporalIdentity, frameId: TemporalFrameId): void {
  assertSceneRasterSnapshotCurrent(snapshot, owner, device, viewId, frameId);
  if (lineSnapshots.get(packet) !== snapshot) {
    throw new RenderDeviceError("Line uniforms belong to a different scene raster snapshot", "SCENE_RASTER_LINE_SNAPSHOT_STALE");
  }
}
