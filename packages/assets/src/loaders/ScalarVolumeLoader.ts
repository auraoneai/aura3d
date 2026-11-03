import { AssetLoadError, mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import type { FormatAdapter } from "../FormatRegistry";
import type { LoadContext } from "../LoadContext";
import {
  ScientificFormatLoader,
  type ScientificDiagnostic,
  type ScientificImportOptions,
  type ScientificVolume
} from "./ScientificFormatLoaders";

/** Input samples supported by the native scalar-volume renderer without loss. */
export type ScalarVolumeSamples = Int8Array | Uint8Array | Int16Array | Uint16Array | Float32Array;
export type ScalarVolumeCentering = "node" | "cell" | "unknown";

export interface ScalarVolumeMetadata {
  readonly sourceFormat: "nrrd";
  /** Source coordinate-system name, normalized to lower case. */
  readonly sourceSpace: string;
  /** Units of the source space; no implicit scale conversion is performed. */
  readonly spaceUnits: readonly string[];
  readonly centers: readonly [ScalarVolumeCentering, ScalarVolumeCentering, ScalarVolumeCentering];
  /** The unit cube runs from the first sample center to the last sample center. */
  readonly extent: "sample-centers";
  readonly header: Readonly<Record<string, string>>;
}

/**
 * Validated descriptor borrowing samples from the caller's scientific volume.
 * Inspection does not acquire a lease or transfer ownership of those samples.
 */
export interface ScalarVolumeDescriptor {
  readonly kind: "scalar-volume";
  /** Axis zero varies fastest in the supplied array. */
  readonly dimensions: readonly [number, number, number];
  /** Borrowed from the input volume; consumers must not mutate it. */
  readonly data: ScalarVolumeSamples;
  /** Column-major transform from the sample-center unit cube to Aura node-local space. */
  readonly dataToLocal: Float32Array;
  readonly metadata: ScalarVolumeMetadata;
  readonly diagnostics: readonly ScientificDiagnostic[];
}

/** Loader-owned descriptor; access to data ends when its owning loader disposes it. */
export interface ScalarVolumeAsset extends ScalarVolumeDescriptor {}

export interface ScalarVolumeInspectionOptions {
  /** Maximum number of scalar samples; defaults to 16,777,216. */
  readonly maxVoxels?: number;
}

export interface ScalarVolumeLoaderOptions extends ScientificImportOptions {
  /** Maximum number of scalar samples; defaults to 16,777,216. */
  readonly maxVoxels?: number;
}

/** A stable diagnostic code for unsupported or malformed scalar-volume input. */
export class ScalarVolumeError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ScalarVolumeError";
  }
}

const DEFAULT_MAX_VOXELS = 16_777_216;
const MAX_VOXELS = 67_108_864;

function fail(code: string, message: string): never {
  throw new ScalarVolumeError(code, message);
}

function maxVoxelsOf(value: number | undefined): number {
  const result = value ?? DEFAULT_MAX_VOXELS;
  if (!Number.isSafeInteger(result) || result < 1 || result > MAX_VOXELS) {
    fail("SCALAR_VOLUME_INVALID_LIMIT", `maxVoxels must be an integer from 1 to ${MAX_VOXELS}`);
  }
  return result;
}

/**
 * Convert the explicitly named anatomical source basis into Aura's R-U-B
 * node-local basis. Generic scanner or handedness-only spaces do not name
 * enough axes to make this conversion without guessing.
 */
function basisVector(space: string, vector: readonly number[]): [number, number, number] {
  const [x, y, z] = vector;
  switch (space) {
    case "right-anterior-superior":
    case "ras": return [x!, z!, -y!];
    case "left-anterior-superior":
    case "las": return [-x!, z!, -y!];
    case "left-posterior-superior":
    case "lps": return [-x!, z!, y!];
    default: return fail("SCALAR_VOLUME_UNSUPPORTED_SPACE", `Unsupported or unspecified NRRD space ${space || "(missing)"}`);
  }
}

function vector3(value: readonly number[] | null | undefined, label: string): readonly [number, number, number] {
  if (!value || value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    fail("SCALAR_VOLUME_UNSUPPORTED_ORIENTATION", `${label} must contain three finite spatial coordinates`);
  }
  return [value[0]!, value[1]!, value[2]!];
}

function centersOf(header: Readonly<Record<string, string>>): [ScalarVolumeCentering, ScalarVolumeCentering, ScalarVolumeCentering] {
  if (header.centers !== undefined && header.centerings !== undefined) {
    fail("SCALAR_VOLUME_INVALID_CENTERING", "The centers and centerings aliases cannot both be specified");
  }
  const source = header.centers ?? header.centerings;
  if (source === undefined) return ["unknown", "unknown", "unknown"];
  const values = source.trim().toLowerCase().split(/\s+/);
  if (values.length !== 3) fail("SCALAR_VOLUME_INVALID_CENTERING", "Three centering values are required");
  return values.map((value) => {
    if (value === "node" || value === "cell") return value;
    if (value === "???" || value === "none") return "unknown";
    return fail("SCALAR_VOLUME_INVALID_CENTERING", `Unsupported centering ${value}`);
  }) as [ScalarVolumeCentering, ScalarVolumeCentering, ScalarVolumeCentering];
}

function validateKinds(header: Readonly<Record<string, string>>): void {
  if (header.kinds === undefined) return;
  const kinds = header.kinds.trim().toLowerCase().split(/\s+/);
  if (kinds.length !== 3 || kinds.some((kind) => kind !== "domain" && kind !== "space")) {
    fail("SCALAR_VOLUME_UNSUPPORTED_KINDS", "All three NRRD axes must describe a spatial domain");
  }
}

function validateUnits(units: readonly string[]): readonly string[] {
  if (units.length === 0) return Object.freeze([] as string[]);
  if (units.length !== 3 || units.some((unit) => !unit.trim() || unit !== units[0])) {
    fail("SCALAR_VOLUME_UNSUPPORTED_UNITS", "Space units must be omitted or be the same non-empty unit on all axes");
  }
  return Object.freeze([...units]);
}

function checkedFloat32(value: number): number {
  const result = Math.fround(value);
  if (!Number.isFinite(result)) fail("SCALAR_VOLUME_INVALID_TRANSFORM", "The volume transform exceeds finite float32 range");
  return result === 0 ? 0 : result;
}

/** Match the native volume renderer's invertibility threshold after float32 rounding. */
function validateTransform(matrix: Float32Array): void {
  const rows = Array.from({ length: 3 }, (_, row) => Array.from({ length: 6 }, (_, column) =>
    column < 3 ? matrix[column * 4 + row]! : Number(column - 3 === row)
  ));
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    const scale = rows[pivot]![column]!;
    if (!Number.isFinite(scale) || Math.abs(scale) < 1e-15) fail("SCALAR_VOLUME_INVALID_TRANSFORM", "The volume transform must be invertible");
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    for (let entry = 0; entry < 6; entry++) rows[column]![entry] = rows[column]![entry]! / scale;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      for (let entry = 0; entry < 6; entry++) rows[row]![entry] = rows[row]![entry]! - factor * rows[column]![entry]!;
    }
  }
  for (const row of rows) for (const value of row.slice(3)) {
    if (!Number.isFinite(Math.fround(value))) fail("SCALAR_VOLUME_INVALID_TRANSFORM", "The inverse volume transform exceeds finite float32 range");
  }
}

function transformOf(volume: ScientificVolume, dimensions: readonly [number, number, number], space: string): Float32Array {
  const origin = basisVector(space, vector3(volume.origin, "Space origin"));
  if (!volume.directions || volume.directions.length !== 3) {
    fail("SCALAR_VOLUME_UNSUPPORTED_ORIENTATION", "Three spatial directions are required");
  }
  const matrix = new Float32Array(16);
  for (let axis = 0; axis < 3; axis++) {
    const direction = basisVector(space, vector3(volume.directions[axis], `Direction ${axis}`));
    for (let component = 0; component < 3; component++) {
      matrix[axis * 4 + component] = checkedFloat32(direction[component]! * (dimensions[axis]! - 1));
    }
  }
  for (let component = 0; component < 3; component++) matrix[12 + component] = checkedFloat32(origin[component]!);
  matrix[15] = 1;
  validateTransform(matrix);
  return matrix;
}

function abortIfNeeded(request: AssetLoadRequest, context: LoadContext): void {
  if (request.signal?.aborted || context.signal?.aborted) {
    const reason = request.signal?.aborted ? request.signal.reason : context.signal?.reason;
    throw new AssetLoadError("Asset load aborted", request.url, context.dependencyChain, reason);
  }
}

/**
 * Validate a previously parsed NRRD against the exact native scalar-volume
 * contract. This synchronous operation performs no I/O and borrows the input
 * sample array; callers retain responsibility for the input's ownership.
 */
export function inspectScalarVolume(
  scientific: ScientificVolume,
  options: ScalarVolumeInspectionOptions = {}
): ScalarVolumeDescriptor {
  const maxVoxels = maxVoxelsOf(options.maxVoxels);
  if (scientific.kind !== "volume" || scientific.format !== "nrrd") {
    fail("SCALAR_VOLUME_UNSUPPORTED_FORMAT", "Expected a parsed NRRD scalar volume");
  }
  if (scientific.sizes.length !== 3 || scientific.sizes.some((size) => !Number.isSafeInteger(size) || size < 2)) {
    fail("SCALAR_VOLUME_UNSUPPORTED_DIMENSIONS", "A scalar volume requires three axes with at least two samples each");
  }
  const dimensions: [number, number, number] = [scientific.sizes[0]!, scientific.sizes[1]!, scientific.sizes[2]!];
  const count = dimensions[0] * dimensions[1] * dimensions[2];
  if (!Number.isSafeInteger(count) || count > maxVoxels || count !== scientific.samples.length) {
    fail("SCALAR_VOLUME_INVALID_SIZE", "The sample count exceeds the volume limit or does not match its dimensions");
  }
  const samples = scientific.samples;
  if (!(samples instanceof Int8Array || samples instanceof Uint8Array || samples instanceof Int16Array || samples instanceof Uint16Array || samples instanceof Float32Array)) {
    fail("SCALAR_VOLUME_UNSUPPORTED_TYPE", "Only int8, uint8, int16, uint16 and float32 samples are supported without conversion");
  }
  for (const value of samples) if (!Number.isFinite(value)) fail("SCALAR_VOLUME_NONFINITE_SAMPLE", "Scalar samples must be finite");
  validateKinds(scientific.metadata);
  const centers = centersOf(scientific.metadata);
  const units = validateUnits(scientific.units);
  const space = (scientific.space ?? "").trim().toLowerCase();
  const dataToLocal = transformOf(scientific, dimensions, space);
  const metadata: ScalarVolumeMetadata = Object.freeze({
    sourceFormat: "nrrd",
    sourceSpace: space,
    spaceUnits: units,
    centers: Object.freeze(centers),
    extent: "sample-centers",
    header: Object.freeze({ ...scientific.metadata })
  });
  return {
    kind: "scalar-volume",
    dimensions: Object.freeze(dimensions),
    data: samples,
    dataToLocal,
    metadata,
    diagnostics: Object.freeze([...scientific.diagnostics])
  };
}

/**
 * Bounded, independently implemented NRRD scalar-volume loader for the native
 * renderer. The wrapped scientific loader verifies the exact root and detached
 * bytes with the caller's transport, integrity, size and cancellation policy.
 */
export class ScalarVolumeLoader implements AssetLoader<ScalarVolumeAsset> {
  readonly type = "scalar-volume";
  private readonly options: ScalarVolumeLoaderOptions;
  private readonly owned = new WeakMap<ScalarVolumeAsset, () => void>();

  constructor(options: ScalarVolumeLoaderOptions = {}) {
    this.options = { ...options };
    maxVoxelsOf(this.options.maxVoxels);
  }

  canLoad(request: AssetLoadRequest): boolean {
    if (request.format !== undefined) return /^(nrrd|nhdr)$/i.test(request.format.replace(/^\./, ""));
    return request.type === this.type || /\.(nrrd|nhdr)(?:[?#]|$)/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<ScalarVolumeAsset> {
    const admittedRequest: AssetLoadRequest = { ...request, ...mergeAssetRequestOptions({}, request) };
    if (!this.canLoad(admittedRequest)) fail("SCALAR_VOLUME_UNSUPPORTED_FORMAT", "Expected an NRRD or NHDR asset");
    const maxVoxels = maxVoxelsOf(this.options.maxVoxels);
    const { maxVoxels: _maxVoxels, ...sourceOptions } = this.options;
    if (sourceOptions.maxElements !== undefined && (!Number.isSafeInteger(sourceOptions.maxElements) || sourceOptions.maxElements < 1)) {
      fail("SCALAR_VOLUME_INVALID_LIMIT", "maxElements must be a positive safe integer");
    }
    const maxElements = Math.min(sourceOptions.maxElements ?? maxVoxels, maxVoxels);
    // The wrapped loader snapshots mutable request options and detached bytes
    // before its first await, then verifies every requested dependency.
    const scientific = await new ScientificFormatLoader("nrrd", { ...sourceOptions, maxElements }).load(admittedRequest, context);
    abortIfNeeded(admittedRequest, context);
    if (scientific.kind !== "volume") {
      fail("SCALAR_VOLUME_UNSUPPORTED_FORMAT", "Expected a parsed NRRD scalar volume");
    }
    const descriptor = inspectScalarVolume(scientific, { maxVoxels });
    let ownedSamples: ScalarVolumeSamples | undefined = descriptor.data;
    const asset: ScalarVolumeAsset = {
      ...descriptor,
      get data() {
        if (!ownedSamples) fail("SCALAR_VOLUME_DISPOSED", "Scalar-volume asset has been disposed");
        return ownedSamples;
      }
    };
    this.owned.set(asset, () => { ownedSamples = undefined; });
    try {
      abortIfNeeded(admittedRequest, context);
    } catch (error) {
      this.dispose(asset);
      throw error;
    }
    return asset;
  }

  dispose(asset: ScalarVolumeAsset): void {
    const release = this.owned.get(asset);
    if (!release) return;
    this.owned.delete(asset);
    release();
  }
}

/** Opt-in registry adapter; it exposes scalar data rather than glTF resources. */
export function createScalarVolumeFormatAdapter(options: ScalarVolumeLoaderOptions = {}): FormatAdapter<ScalarVolumeAsset> {
  const loader = new ScalarVolumeLoader(options);
  return {
    id: "scalar-volume",
    extensions: ["nrrd", "nhdr"],
    loader,
    getWarnings: (asset) => asset.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
  };
}
