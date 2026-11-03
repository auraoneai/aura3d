import { Sampler } from "../Sampler";
import { Texture } from "../Texture";

/** Measured Type-C angles are in degrees; candelas are already file-scaled. */
export interface PhotometricProfileTable {
  readonly verticalAngles: readonly number[];
  readonly horizontalAngles: readonly number[];
  /** Horizontal-major rows, with the vertical angle varying fastest. */
  readonly candela: readonly number[];
  readonly symmetry: "rotational" | "quadrant" | "bilateral" | "none";
  readonly format?: "ies-lm63";
  readonly photometricType?: "C";
}

export interface PhotometricProfileAtlasInput {
  readonly id: string;
  readonly profile: PhotometricProfileTable;
  /** Linear profile dimmer. It does not multiply the light's scalar candela. */
  readonly scale?: number;
  /** Rotation about the light's forward axis, in radians. */
  readonly rotation?: number;
}

export interface PhotometricProfileAtlasOptions {
  /** Maximum width or height accepted by the target device. Default: 2048; hard maximum: 4096. */
  readonly maxTextureDimension?: number;
  /** Maximum padded texture payload in bytes. Default: 8 MiB; hard maximum: 64 MiB. */
  readonly maxBytes?: number;
  /** Maximum number of profiles. Default: 64; hard maximum: 256. */
  readonly maxProfiles?: number;
}

/**
 * Offsets address scalar R32F texels in row-major order. In a shader, a scalar
 * index `i` addresses texel `(i % textureWidth, floor(i / textureWidth))`.
 * Entries address the original, nonuniform angle tables and horizontal-major
 * candela rows, so the consumer must use explicit bracketing and interpolation.
 */
export interface PhotometricProfileAtlasEntry {
  readonly id: string;
  readonly verticalOffset: number;
  readonly horizontalOffset: number;
  readonly candelaOffset: number;
  readonly verticalCount: number;
  readonly horizontalCount: number;
  readonly symmetry: PhotometricProfileTable["symmetry"];
  /** 0 rotational, 1 quadrant, 2 bilateral, 3 full azimuth. */
  readonly symmetryCode: 0 | 1 | 2 | 3;
  readonly scale: number;
  readonly rotation: number;
}

/** Fresh caller-owned values matching both independent shader helper signatures. */
export interface PhotometricProfileShaderArguments {
  readonly offsetsAndVerticalCount: Int32Array;
  readonly horizontalCountAndSymmetry: Int32Array;
  readonly scaleRotation: Float32Array;
}

const MAX_ANGLES = 4096;
const MAX_SAMPLES = 1024 * 1024;
const HARD_MAX_PROFILES = 256;
const HARD_MAX_TEXTURE_DIMENSION = 4096;
const HARD_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const TAU = Math.PI * 2;

type AtlasPlan = {
  readonly id: string;
  readonly profile: PhotometricProfileTable;
  readonly verticalCount: number;
  readonly horizontalCount: number;
  readonly scale: number;
  readonly rotation: number;
};

function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`Photometric profile atlas ${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function checkedFloat(value: number, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`Photometric profile atlas ${name} is outside the supported float32 range`);
  }
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || (value !== 0 && rounded === 0)) {
    throw new RangeError(`Photometric profile atlas ${name} is outside the supported float32 range`);
  }
  return rounded;
}

function angleCount(values: readonly number[] | undefined, name: string): number {
  if (!values || !Number.isSafeInteger(values.length) || values.length < 1 || values.length > MAX_ANGLES) {
    throw new RangeError(`Photometric profile atlas ${name} must contain 1 to ${MAX_ANGLES} angles`);
  }
  return values.length;
}

function planProfiles(inputs: readonly PhotometricProfileAtlasInput[], maxProfiles: number, maxTexels: number): { plans: AtlasPlan[]; texels: number } {
  if (!Array.isArray(inputs) || inputs.length > maxProfiles) throw new RangeError("Photometric profile atlas profile count exceeds its limit");
  const plans: AtlasPlan[] = [];
  const ids = new Set<string>();
  let texels = 0;
  for (const input of inputs) {
    if (!input || typeof input.id !== "string" || input.id.trim().length === 0 || input.id.length > 256 || ids.has(input.id)) {
      throw new RangeError("Photometric profile atlas IDs must be nonempty, unique strings of at most 256 characters");
    }
    ids.add(input.id);
    const profile = input.profile;
    if (!profile || (profile.format !== undefined && profile.format !== "ies-lm63") ||
        (profile.photometricType !== undefined && profile.photometricType !== "C")) {
      throw new RangeError("Photometric profile atlas requires a Type-C profile");
    }
    const verticalCount = angleCount(profile.verticalAngles, "verticalAngles");
    const horizontalCount = angleCount(profile.horizontalAngles, "horizontalAngles");
    const sampleCount = verticalCount * horizontalCount;
    if (sampleCount > MAX_SAMPLES || !profile.candela || profile.candela.length !== sampleCount) {
      throw new RangeError("Photometric profile atlas candela table dimensions are invalid or exceed the limit");
    }
    const scale = checkedFloat(input.scale === undefined ? 1 : input.scale, "scale", 0, Number.MAX_VALUE);
    const rotationInput = input.rotation === undefined ? 0 : input.rotation;
    if (typeof rotationInput !== "number" || !Number.isFinite(rotationInput)) throw new RangeError("Photometric profile atlas rotation must be finite");
    const rotation = Math.fround(((rotationInput % TAU + Math.PI + TAU) % TAU) - Math.PI);
    texels += verticalCount + horizontalCount + sampleCount;
    if (!Number.isSafeInteger(texels) || texels > maxTexels) throw new RangeError("Photometric profile atlas exceeds its memory or texture limit");
    plans.push({ id: input.id, profile, verticalCount, horizontalCount, scale, rotation });
  }
  return { plans, texels };
}

function copyAngles(source: readonly number[], count: number, max: number, target: Float32Array, offset: number, name: string): void {
  if (source.length !== count) throw new RangeError(`Photometric profile atlas ${name} changed while being copied`);
  let previous = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const value = checkedFloat(source[i]!, name, 0, max);
    if (value <= previous) throw new RangeError(`Photometric profile atlas ${name} must remain strictly increasing in float32`);
    target[offset + i] = value;
    previous = value;
  }
}

function foldedAzimuth(horizontalDegrees: number, rotation: number, symmetry: PhotometricProfileTable["symmetry"]): number {
  let angle = ((horizontalDegrees % 360) - rotation * 180 / Math.PI) % 360;
  if (angle < 0) angle += 360;
  if (symmetry === "quadrant") {
    if (angle > 180) angle = 360 - angle;
    if (angle > 90) angle = 180 - angle;
  } else if (symmetry === "bilateral" && angle > 180) {
    angle = 360 - angle;
  }
  return angle;
}

function bracket(data: Float32Array, offset: number, count: number, value: number): readonly [number, number, number] {
  if (count === 1 || value <= data[offset]!) return [0, 0, 0];
  const last = count - 1;
  if (value >= data[offset + last]!) return [last, last, 0];
  let lower = 0;
  let upper = last;
  while (upper - lower > 1) {
    const middle = (lower + upper) >>> 1;
    if (data[offset + middle]! <= value) lower = middle;
    else upper = middle;
  }
  const start = data[offset + lower]!;
  return [lower, upper, (value - start) / (data[offset + upper]! - start)];
}

/**
 * An owned, immutable snapshot of one or more Type-C measured profiles.
 *
 * The R32F texture and nearest sampler are borrowed by the future renderer;
 * this class owns and disposes the texture, not the caller's profile objects.
 * `isCurrent()` performs an O(texture texels) check because Texture's public
 * data is mutable. A consumer should check it at its chosen upload/frame
 * boundary, not for every fragment. This class does not upload, cache, or bind
 * a GPU resource and does not claim rendered-light support.
 *
 * Zero vertical degrees points from a light toward its target. For a current
 * normalized forward vector, use reference +Y when |forward.y| < 0.99 and
 * +Z otherwise; right = normalize(cross(forward, reference)), and up =
 * normalize(cross(right, forward)). Azimuth is atan2(dot(delta, up),
 * dot(delta, right)), with zero used when both components are zero. It grows
 * from local right toward local up, and `rotation` is subtracted from it.
 * Profile candelas replace a punctual scalar candela; the explicit profile
 * `scale` is applied once. Runtime visibility and animation dimming must be
 * applied separately by the future light consumer. The CPU sample uses
 * double-precision interpolation of the float32 snapshot; native GPU rounding
 * and platform float-subnormal behavior are not established by this helper.
 */
export class PhotometricProfileAtlas {
  private textureValue: Texture | null;
  private samplerValue: Sampler | null;
  private snapshot: Float32Array | null;
  private metadata: readonly PhotometricProfileAtlasEntry[] | null;
  private readonly byId = new Map<string, PhotometricProfileAtlasEntry>();
  private readonly width: number;
  private readonly height: number;
  private readonly textureRevision: number;

  constructor(inputs: readonly PhotometricProfileAtlasInput[], options: PhotometricProfileAtlasOptions = {}) {
    const maxDimension = boundedInteger(options.maxTextureDimension ?? 2048, "maxTextureDimension", 1, HARD_MAX_TEXTURE_DIMENSION);
    const maxBytes = boundedInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes", 4, HARD_MAX_BYTES);
    const maxProfiles = boundedInteger(options.maxProfiles ?? 64, "maxProfiles", 1, HARD_MAX_PROFILES);
    const maxTexels = Math.min(Math.floor(maxBytes / 4), maxDimension * maxDimension);
    const { plans, texels } = planProfiles(inputs, maxProfiles, maxTexels);
    const count = Math.max(1, texels);
    this.width = Math.min(maxDimension, Math.ceil(Math.sqrt(count)));
    this.height = Math.ceil(count / this.width);
    const paddedTexels = this.width * this.height;
    if (this.height > maxDimension || paddedTexels * 4 > maxBytes) throw new RangeError("Photometric profile atlas exceeds its padded texture limit");
    const snapshot = new Float32Array(paddedTexels);
    const entries: PhotometricProfileAtlasEntry[] = [];
    let cursor = 0;
    for (const plan of plans) {
      const { profile, verticalCount, horizontalCount } = plan;
      const verticalOffset = cursor;
      copyAngles(profile.verticalAngles, verticalCount, 180, snapshot, cursor, "verticalAngles");
      cursor += verticalCount;
      const horizontalOffset = cursor;
      copyAngles(profile.horizontalAngles, horizontalCount, 360, snapshot, cursor, "horizontalAngles");
      cursor += horizontalCount;
      // Symmetry is a source-table contract: do not silently accept an end
      // angle that merely rounds to 90/180/360 when uploaded as float32.
      const end = profile.horizontalAngles[horizontalCount - 1];
      const symmetry = horizontalCount === 1 ? "rotational" : end === 90 ? "quadrant" : end === 180 ? "bilateral" : end === 360 ? "none" : undefined;
      if (!symmetry || snapshot[horizontalOffset] !== 0 || profile.symmetry !== symmetry) {
        throw new RangeError("Photometric profile atlas horizontal symmetry or angle bounds are invalid");
      }
      const sampleCount = verticalCount * horizontalCount;
      if (profile.candela.length !== sampleCount) throw new RangeError("Photometric profile atlas candela table changed while being copied");
      const candelaOffset = cursor;
      for (let i = 0; i < sampleCount; i += 1) {
        const value = checkedFloat(profile.candela[i]!, "candela", 0, Number.MAX_VALUE);
        const scaled = Math.fround(value * plan.scale);
        if (!Number.isFinite(scaled) || (value !== 0 && plan.scale !== 0 && scaled === 0)) {
          throw new RangeError("Photometric profile atlas scaled candela is outside the supported float32 range");
        }
        snapshot[cursor++] = value;
      }
      const entry: PhotometricProfileAtlasEntry = Object.freeze({
        id: plan.id, verticalOffset, horizontalOffset, candelaOffset,
        verticalCount, horizontalCount, symmetry,
        symmetryCode: symmetry === "rotational" ? 0 : symmetry === "quadrant" ? 1 : symmetry === "bilateral" ? 2 : 3,
        scale: plan.scale, rotation: plan.rotation
      });
      entries.push(entry);
      this.byId.set(entry.id, entry);
    }
    this.snapshot = snapshot;
    this.metadata = Object.freeze(entries);
    this.samplerValue = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
    this.textureValue = new Texture({
      width: this.width, height: this.height, format: "r32f", colorSpace: "linear", data: snapshot,
      usage: ["sampled", "copy-dst"], generateMipmaps: false, label: "photometric-profile-atlas"
    });
    this.textureRevision = this.textureValue.revision;
  }

  get disposed(): boolean { return this.textureValue === null; }

  get texture(): Texture { return this.requireTexture(); }
  get sampler(): Sampler {
    this.requireTexture();
    return this.samplerValue!;
  }
  get entries(): readonly PhotometricProfileAtlasEntry[] {
    this.requireTexture();
    return this.metadata!;
  }

  /**
   * Copy the entry into integer/float shader arguments. Check `isCurrent()`
   * once before binding the borrowed texture; these arrays are caller-owned.
   */
  shaderArguments(id: string): PhotometricProfileShaderArguments {
    this.requireTexture();
    const entry = this.byId.get(id);
    if (!entry) throw new RangeError(`Unknown photometric profile atlas ID: ${id}`);
    return {
      offsetsAndVerticalCount: new Int32Array([entry.verticalOffset, entry.horizontalOffset, entry.candelaOffset, entry.verticalCount]),
      horizontalCountAndSymmetry: new Int32Array([entry.horizontalCount, entry.symmetryCode]),
      scaleRotation: new Float32Array([entry.scale, entry.rotation])
    };
  }

  /** Whether the borrowed upload texture and sampler still match the snapshot. */
  isCurrent(): boolean {
    const texture = this.textureValue;
    const data = this.snapshot;
    const sampler = this.samplerValue;
    if (!texture || texture.disposed || !data || !sampler || texture.revision !== this.textureRevision || texture.width !== this.width || texture.height !== this.height ||
        texture.dimension !== "2d" || texture.format !== "r32f" || texture.colorSpace !== "linear" || texture.generateMipmaps ||
        texture.dynamic || texture.source !== null || texture.usage.length !== 2 || !texture.usage.includes("sampled") || !texture.usage.includes("copy-dst") ||
        texture.mipLevelCount !== 1 || !(texture.data instanceof Float32Array) || texture.data.length !== data.length ||
        sampler.minFilter !== "nearest" || sampler.magFilter !== "nearest" || sampler.addressU !== "clamp-to-edge" || sampler.addressV !== "clamp-to-edge" ||
        sampler.addressW !== undefined || sampler.compare !== undefined || sampler.mirror || sampler.maxAnisotropy !== 1) return false;
    // `updateMip` can replace the upload source without changing `data`. A
    // content revision also invalidates the borrowed resource even if a
    // caller later restores its bytes: a device may have uploaded the edit.
    const mip = texture.getMipLevel(0);
    if (!mip || mip.width !== this.width || mip.height !== this.height || !(mip.data instanceof Float32Array) || mip.data.length !== data.length) return false;
    for (let i = 0; i < data.length; i += 1) if (texture.data[i] !== data[i] || mip.data[i] !== data[i]) return false;
    return true;
  }

  /** Sample the captured float32 profile at vertical/azimuth degrees. */
  sample(id: string, verticalDegrees: number, horizontalDegrees: number): number {
    this.requireTexture();
    if (!Number.isFinite(verticalDegrees) || verticalDegrees < 0 || verticalDegrees > 180 || !Number.isFinite(horizontalDegrees)) {
      throw new RangeError("Photometric profile atlas sample requires finite angles and vertical degrees in [0,180]");
    }
    const entry = this.byId.get(id);
    if (!entry) throw new RangeError(`Unknown photometric profile atlas ID: ${id}`);
    const data = this.snapshot!;
    if (verticalDegrees < data[entry.verticalOffset]! || verticalDegrees > data[entry.verticalOffset + entry.verticalCount - 1]!) return 0;
    const azimuth = foldedAzimuth(horizontalDegrees, entry.rotation, entry.symmetry);
    const [v0, v1, vWeight] = bracket(data, entry.verticalOffset, entry.verticalCount, verticalDegrees);
    const [h0, h1, hWeight] = bracket(data, entry.horizontalOffset, entry.horizontalCount, azimuth);
    const row = (h: number): number => {
      const a = data[entry.candelaOffset + h * entry.verticalCount + v0]!;
      const b = data[entry.candelaOffset + h * entry.verticalCount + v1]!;
      return a + (b - a) * vWeight;
    };
    const a = row(h0);
    return (a + (row(h1) - a) * hWeight) * entry.scale;
  }

  dispose(): void {
    const texture = this.textureValue;
    if (!texture) return;
    this.textureValue = null;
    this.samplerValue = null;
    this.snapshot = null;
    this.metadata = null;
    this.byId.clear();
    texture.dispose();
  }

  private requireTexture(): Texture {
    if (!this.textureValue) throw new Error("Photometric profile atlas is disposed");
    return this.textureValue;
  }
}
