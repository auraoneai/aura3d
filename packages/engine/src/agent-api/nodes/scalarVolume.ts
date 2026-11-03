import { AuraNodeBuilder } from "./builder.js";
import type { AuraAssetRef, AuraRuntimeNodeSpec, AuraTransformSpec } from "./types.js";
import type { VolumePlane, VolumeRenderMode, VolumeTransferStop } from "@aura3d/rendering/volumetrics";

/** Scalar formats supported by the first root-scene volume path. */
export type AuraScalarVolumeFormat = "nrrd" | "nhdr";

/**
 * A scalar field occupies the unit cube in volume-local coordinates. Slice
 * positions and clip planes use those coordinates; the asset's spatial metadata
 * maps the cube into node-local space before the node transform is applied.
 * The first root-volume route does not support the `lookAt` transform.
 */
export interface AuraScalarVolumeOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly visible?: boolean;
  readonly mode?: VolumeRenderMode;
  /** Scalar values in source units. Omission selects the finite sample range. */
  readonly domain?: readonly [number, number];
  /** Linear, unpremultiplied RGBA transfer stops in source scalar units. */
  readonly transfer?: readonly VolumeTransferStop[];
  /** Planes keep points with ax + by + cz + d >= 0 in the unit cube. */
  readonly clipPlanes?: readonly VolumePlane[];
  readonly density?: number;
  readonly sampleCount?: number;
  readonly maxVoxels?: number;
}

export interface AuraScalarVolumeNode extends AuraScalarVolumeOptions {
  readonly kind: "scalar-volume";
  readonly asset: AuraAssetRef<"scalar-volume">;
  readonly visible: boolean;
  readonly runtime?: AuraRuntimeNodeSpec;
}

const MAX_VOXELS = 67_108_864;
const MAX_SAMPLES = 512;
const MAX_CLIP_PLANES = 8;
const ROTATION_ORDERS = new Set(["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]);

function finiteF32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function tuple(value: unknown, length: number, name: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== length || Array.from(value).some((entry) => !finiteF32(entry))) {
    throw new RangeError(`${name} must contain ${length} finite float32 values`);
  }
  return value;
}

function positiveInteger(value: unknown, maximum: number, name: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}`);
  }
}

/** @internal Validate authored snapshots and builder-chain fields as well as direct options. */
export function validateScalarVolumeNode(node: AuraScalarVolumeNode): void {
  const asset = node?.asset;
  if (!asset || asset.kind !== "aura-asset-ref" || asset.type !== "scalar-volume") {
    throw new TypeError("scalarVolume requires a typed scalar-volume asset");
  }
  if (typeof asset.format !== "string" || !["nrrd", "nhdr"].includes(asset.format.toLowerCase())) {
    throw new RangeError("scalarVolume requires an nrrd or nhdr asset format");
  }
  if (node.lookAt !== undefined) throw new RangeError("scalarVolume does not support lookAt");
  for (const name of ["position", "pivot", "rotation"] as const) {
    if (node[name] !== undefined) tuple(node[name], 3, name);
  }
  if (node.scale !== undefined) {
    const values = typeof node.scale === "number" ? [node.scale] : tuple(node.scale, 3, "scale");
    if (!values.every(finiteF32) || values.some((value) => Math.fround(value) === 0)) {
      throw new RangeError("scale must contain finite nonzero float32 values");
    }
  }
  if (node.quaternion !== undefined) {
    const values = tuple(node.quaternion, 4, "quaternion");
    if (values.every((value) => Math.fround(value) === 0)) throw new RangeError("quaternion must be nonzero");
  }
  if (node.rotationOrder !== undefined && !ROTATION_ORDERS.has(node.rotationOrder)) throw new RangeError("unsupported rotationOrder");
  if (typeof node.visible !== "boolean") throw new TypeError("visible must be boolean");
  if (node.frustumCulled !== undefined && typeof node.frustumCulled !== "boolean") throw new TypeError("frustumCulled must be boolean");
  if (node.renderOrder !== undefined && !Number.isFinite(node.renderOrder)) throw new RangeError("renderOrder must be finite");
  if (node.layers !== undefined && (!Number.isInteger(node.layers) || node.layers < -0x80000000 || node.layers > 0xffffffff)) {
    throw new RangeError("layers must be a 32-bit mask");
  }
  if (node.mode !== undefined) {
    if (!node.mode || (node.mode.type !== "raymarch" && node.mode.type !== "slice")) throw new RangeError("invalid scalar volume mode");
    if (node.mode.type === "slice" && (!(["x", "y", "z"] as const).includes(node.mode.axis)
      || !finiteF32(node.mode.position) || node.mode.position < 0 || node.mode.position > 1)) {
      throw new RangeError("slice requires an axis and position in [0, 1]");
    }
  }
  if (node.domain !== undefined) {
    const domain = tuple(node.domain, 2, "domain");
    if (!(Math.fround(domain[1]!) > Math.fround(domain[0]!))) throw new RangeError("domain must be strictly increasing in float32");
  }
  if (node.transfer !== undefined) {
    if (!Array.isArray(node.transfer) || node.transfer.length < 2 || node.transfer.length > 4096) {
      throw new RangeError("transfer requires 2 to 4096 stops");
    }
    let previous = -Infinity;
    for (const stop of node.transfer) {
      if (!stop || !finiteF32(stop.value) || stop.value <= previous) throw new RangeError("transfer stop values must be finite and strictly increasing");
      const color = tuple(stop.color, 4, "transfer color");
      if (color.some((channel) => channel < 0 || channel > 1)) throw new RangeError("transfer colors must be in [0, 1]");
      previous = stop.value;
    }
  }
  if (node.clipPlanes !== undefined) {
    if (!Array.isArray(node.clipPlanes) || node.clipPlanes.length > MAX_CLIP_PLANES) throw new RangeError("clipPlanes permits at most 8 planes");
    for (const plane of node.clipPlanes) {
      const values = tuple(plane, 4, "clip plane");
      if (values.slice(0, 3).every((value) => Math.fround(value) === 0)) throw new RangeError("clip plane normal must be nonzero");
    }
  }
  if (node.density !== undefined && (!finiteF32(node.density) || node.density < 0 || node.density > 1_000_000)) {
    throw new RangeError("density must be in [0, 1000000]");
  }
  if (node.sampleCount !== undefined) positiveInteger(node.sampleCount, MAX_SAMPLES, "sampleCount");
  if (node.maxVoxels !== undefined) positiveInteger(node.maxVoxels, MAX_VOXELS, "maxVoxels");
}

/**
 * Build a typed scalar-volume node. The first root route requires a WebGL2,
 * single-sample target with an active camera and a separate opaque-depth copy.
 * Unsupported output, clipping and effect combinations fail explicitly.
 */
export function scalarVolume(asset: AuraAssetRef<"scalar-volume">, options: AuraScalarVolumeOptions = {}): AuraNodeBuilder<AuraScalarVolumeNode> {
  if (!options || typeof options !== "object") throw new TypeError("scalarVolume options must be an object");
  const node: AuraScalarVolumeNode = { ...options, kind: "scalar-volume", asset, visible: options.visible === undefined ? true : options.visible };
  validateScalarVolumeNode(node);
  // The caller may reuse or mutate its input arrays after creating a node.
  const snapshot: AuraScalarVolumeNode = {
    ...node,
    ...(node.position ? { position: [...node.position] as [number, number, number] } : {}),
    ...(node.pivot ? { pivot: [...node.pivot] as [number, number, number] } : {}),
    ...(node.rotation ? { rotation: [...node.rotation] as [number, number, number] } : {}),
    ...(node.quaternion ? { quaternion: [...node.quaternion] as [number, number, number, number] } : {}),
    ...(Array.isArray(node.scale) ? { scale: [...node.scale] as [number, number, number] } : {}),
    ...(node.domain ? { domain: [...node.domain] as [number, number] } : {}),
    ...(node.transfer ? { transfer: node.transfer.map((stop) => ({ value: stop.value, color: [...stop.color] as [number, number, number, number] })) } : {}),
    ...(node.clipPlanes ? { clipPlanes: node.clipPlanes.map((plane) => [...plane] as [number, number, number, number]) } : {}),
    ...(node.mode ? { mode: { ...node.mode } } : {})
  };
  return new AuraNodeBuilder(snapshot);
}
