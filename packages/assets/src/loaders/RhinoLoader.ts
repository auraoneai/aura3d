/**
 * Opt-in Rhino 3DM decoder bridge.
 *
 * 3DM is an openNURBS binary archive, not a mesh-only interchange format. No
 * openNURBS codec is bundled here. An explicitly supplied, independently
 * implemented/permitted codec must decode the archive into the contract below.
 * This adapter validates that output and lowers supported meshes and object
 * attributes to the existing glTF runtime. It never treats a 3DM signature as
 * evidence that the contents have been decoded.
 *
 * Rhino coordinates are right-handed Z-up in document units. The root glTF
 * node converts them to right-handed Y-up meters: (x, y, z) -> (x, z, -y).
 * Object transforms are column-major local matrices in Rhino coordinates.
 *
 * Codec implementers must bound allocations while decoding, honor `signal`,
 * and report objects they cannot convert in `unsupportedObjects`. The adapter
 * independently checks the decoded result but cannot undo a codec's allocations.
 * See https://developer.rhino3d.com/guides/opennurbs/what-is-rhino3dmio/
 */
import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader.js";
import { GLTFLoader, type GLTFAsset, type GLTFLoaderDiagnostics } from "../GLTFLoader.js";
import { LoadContext } from "../LoadContext.js";
import { fetchBytes } from "../LoaderFetch.js";

const HEADER = "3D Geometry File Format ";
const HEADER_BYTES = 32;
const MAX_FLOAT32 = 3.4028234663852886e38;

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];
type Face = readonly [number, number, number] | readonly [number, number, number, number];

export interface RhinoImportLimits {
  readonly maxFileBytes: number;
  readonly maxObjects: number;
  readonly maxMaterials: number;
  readonly maxVertices: number;
  readonly maxFaces: number;
  readonly maxMetadataBytes: number;
  readonly maxHierarchyDepth: number;
}

export const DEFAULT_RHINO_IMPORT_LIMITS: RhinoImportLimits = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024,
  maxObjects: 100_000,
  maxMaterials: 10_000,
  maxVertices: 1_000_000,
  maxFaces: 1_000_000,
  maxMetadataBytes: 4 * 1024 * 1024,
  maxHierarchyDepth: 256
});

export interface RhinoMeshData {
  readonly positions: readonly Vec3[];
  readonly faces: readonly Face[];
  readonly normals?: readonly Vec3[];
  readonly texcoords?: readonly Vec2[];
  /** RGB or RGBA colors normalized to [0, 1]. */
  readonly colors?: readonly (readonly [number, number, number] | Vec4)[];
}

export interface RhinoMaterialData {
  readonly name?: string;
  /** Diffuse RGB in the glTF linear color convention, normalized to [0, 1]. */
  readonly diffuse?: Vec3;
  /** 0 means opaque and 1 means transparent. */
  readonly transparency?: number;
  /** Classic normalized shininess in [0, 1]. Approximated by glTF roughness. */
  readonly shininess?: number;
  readonly doubleSided?: boolean;
  /** Texture references are reported as unsupported, never silently fetched. */
  readonly textureReferences?: readonly string[];
}

export interface RhinoObjectData {
  readonly name?: string;
  readonly id?: string;
  readonly layer?: string;
  readonly parentIndex?: number;
  readonly materialIndex?: number;
  readonly transform?: readonly number[];
  readonly userStrings?: Readonly<Record<string, string>>;
  /** Missing geometry makes the object a hierarchy/group node. */
  readonly mesh?: RhinoMeshData;
}

export interface RhinoDecodedDocument {
  /** Number of meters in one document unit. */
  readonly metersPerUnit: number;
  readonly objects: readonly RhinoObjectData[];
  readonly materials?: readonly RhinoMaterialData[];
  /** Non-mesh data omitted by the codec, such as curves, NURBS and annotations. */
  readonly unsupportedObjects?: readonly { readonly type: string; readonly count: number }[];
}

export interface RhinoDecodeResult {
  readonly document: RhinoDecodedDocument;
  /** Release codec-owned allocations after conversion, including on failure. */
  readonly release?: () => void | Promise<void>;
}

export interface RhinoDecoder {
  decode(bytes: Uint8Array, options: {
    readonly signal?: AbortSignal;
    readonly limits: RhinoImportLimits;
    readonly archiveVersion: number;
  }): RhinoDecodeResult | Promise<RhinoDecodeResult>;
}

export interface RhinoImportDiagnostic {
  readonly code: "RHINO_UNSUPPORTED_OBJECTS" | "RHINO_UNSUPPORTED_TEXTURE" | "RHINO_MATERIAL_APPROXIMATION";
  readonly message: string;
}

export interface RhinoImportMetadata {
  readonly archiveVersion: number;
  readonly metersPerUnit: number;
  readonly diagnostics: readonly RhinoImportDiagnostic[];
}

export interface RhinoAsset extends GLTFAsset {
  readonly rhino: RhinoImportMetadata;
}

export interface RhinoLoaderOptions {
  /** Explicit opt-in; no 3DM codec is supplied by Aura3D today. */
  readonly decoder: RhinoDecoder;
  readonly limits?: Partial<RhinoImportLimits>;
  readonly gltfLoader?: GLTFLoader;
}

export class RhinoImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RhinoImportError";
  }
}

/** Reads and checks only the 32-byte 3DM archive header, not archive contents. */
export function inspectRhinoArchive(bytes: Uint8Array, maxFileBytes = DEFAULT_RHINO_IMPORT_LIMITS.maxFileBytes): { readonly version: number } {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < HEADER_BYTES) {
    throw new RhinoImportError("RHINO_INVALID_LIMIT", "maxFileBytes must be an integer of at least 32 bytes.");
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxFileBytes) {
    throw new RhinoImportError("RHINO_FILE_LIMIT", `3DM input exceeds the ${maxFileBytes}-byte limit or is not bytes.`);
  }
  if (bytes.byteLength < HEADER_BYTES) throw new RhinoImportError("RHINO_TRUNCATED_HEADER", "3DM archive header is truncated.");
  const header = new TextDecoder("ascii").decode(bytes.subarray(0, HEADER_BYTES));
  if (!header.startsWith(HEADER)) throw new RhinoImportError("RHINO_BAD_MAGIC", "3DM archive magic is invalid.");
  const versionText = header.slice(HEADER.length).trim();
  if (!/^\d+$/.test(versionText)) throw new RhinoImportError("RHINO_BAD_VERSION", "3DM archive version is invalid.");
  const version = Number(versionText);
  if (!Number.isSafeInteger(version) || version < 1) throw new RhinoImportError("RHINO_BAD_VERSION", "3DM archive version is invalid.");
  return { version };
}

/**
 * Converts an archive using a supplied codec. The returned glTF is a data URL
 * with embedded geometry; no object, image, or external path is fetched.
 */
export async function parseRhinoArchive(
  bytes: Uint8Array,
  decoder: RhinoDecoder,
  options: { readonly limits?: Partial<RhinoImportLimits>; readonly signal?: AbortSignal } = {}
): Promise<{ readonly gltfUrl: string; readonly rhino: RhinoImportMetadata }> {
  const limits = validatedLimits(options.limits);
  const { version } = inspectRhinoArchive(bytes, limits.maxFileBytes);
  throwIfAborted(options.signal);
  if (!decoder || typeof decoder.decode !== "function") {
    throw new RhinoImportError("RHINO_DECODER_REQUIRED", "An explicit 3DM archive decoder is required.");
  }
  // The codec is responsible for enforcing these limits during allocation.
  const result = await decoder.decode(bytes, { signal: options.signal, limits, archiveVersion: version });
  if (!result || typeof result !== "object") throw new RhinoImportError("RHINO_BAD_DECODE", "3DM decoder returned no document.");
  try {
    throwIfAborted(options.signal);
    const converted = convertDocument(result.document, limits, options.signal);
    return {
      gltfUrl: converted.gltfUrl,
      rhino: { archiveVersion: version, metersPerUnit: result.document.metersPerUnit, diagnostics: converted.diagnostics }
    };
  } finally {
    await result.release?.();
  }
}

/** Adapter for AssetManager using the shared request and integrity policy. */
export class RhinoLoader implements AssetLoader<RhinoAsset> {
  readonly type = "3dm";
  private readonly gltfLoader: GLTFLoader;
  private readonly limits: RhinoImportLimits;
  private readonly innerAssets = new WeakMap<RhinoAsset, GLTFAsset>();

  constructor(private readonly options: RhinoLoaderOptions) {
    if (!options?.decoder || typeof options.decoder.decode !== "function") {
      throw new RhinoImportError("RHINO_DECODER_REQUIRED", "An explicit 3DM archive decoder is required.");
    }
    this.limits = validatedLimits(options.limits);
    this.gltfLoader = options.gltfLoader ?? new GLTFLoader();
  }

  canLoad(request: AssetLoadRequest): boolean {
    return request.type === "3dm" || request.type === "rhino" || /\.3dm(?:[?#]|$)/i.test(request.url);
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<RhinoAsset> {
    context.throwIfAborted(request.url);
    const signal = context.signalFor(request.signal);
    throwIfAborted(signal);
    const requestOptions = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const buffer = await fetchBytes(request.url, signal, (progress) => {
      request.onProgress?.({
        url: request.url,
        phase: "document",
        loadedBytes: progress.loaded,
        ...(progress.total !== undefined ? { totalBytes: progress.total } : {})
      });
    }, { ...requestOptions, maxBytes: Math.min(requestOptions.maxBytes ?? this.limits.maxFileBytes, this.limits.maxFileBytes) });
    const bytes = new Uint8Array(buffer);
    context.throwIfAborted(request.url);
    const parsed = await parseRhinoArchive(bytes, this.options.decoder, { limits: this.limits, signal });
    context.throwIfAborted(request.url);
    // All input bytes have already passed request integrity/origin checks. The
    // derived glTF and its buffer are local data URLs, not new dependencies.
    const inner = await this.gltfLoader.load({ url: parsed.gltfUrl, type: "gltf", signal }, new LoadContext({ signal }));
    try {
      context.throwIfAborted(request.url);
      throwIfAborted(signal);
    } catch (error) {
      this.gltfLoader.dispose(inner);
      throw error;
    }
    const loaderDiagnostics = addRhinoDiagnostics(inner.loaderDiagnostics, parsed.rhino.diagnostics);
    const wrapped: RhinoAsset = {
      url: request.url,
      get disposed() { return inner.disposed; },
      rhino: parsed.rhino,
      loaderDiagnostics,
      images: inner.images,
      textures: inner.textures,
      materials: inner.materials,
      materialVariants: inner.materialVariants,
      scenes: inner.scenes,
      defaultScene: inner.defaultScene,
      meshes: inner.meshes,
      cameras: inner.cameras,
      lights: inner.lights,
      skins: inner.skins,
      animations: inner.animations,
      createScene: (options) => inner.createScene(options),
      toJSON: () => ({ ...inner.toJSON(), url: request.url, loaderDiagnostics })
    };
    this.innerAssets.set(wrapped, inner);
    return wrapped;
  }

  dispose(asset: RhinoAsset): void {
    const inner = this.innerAssets.get(asset);
    if (inner) {
      this.innerAssets.delete(asset);
      this.gltfLoader.dispose(inner);
    }
  }
}

function addRhinoDiagnostics(base: GLTFLoaderDiagnostics, diagnostics: readonly RhinoImportDiagnostic[]): GLTFLoaderDiagnostics {
  return {
    ...base,
    features: [...new Set([...base.features, "rhino-decoder-bridge"])].sort(),
    unsupportedFeatures: [...new Set([...base.unsupportedFeatures, ...diagnostics.filter((entry) => entry.code !== "RHINO_MATERIAL_APPROXIMATION").map((entry) => entry.message)])]
  };
}

function validatedLimits(overrides: Partial<RhinoImportLimits> = {}): RhinoImportLimits {
  const limits = { ...DEFAULT_RHINO_IMPORT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RhinoImportError("RHINO_INVALID_LIMIT", `${name} must be a positive safe integer.`);
  }
  if (limits.maxFileBytes < HEADER_BYTES) throw new RhinoImportError("RHINO_INVALID_LIMIT", "maxFileBytes must be at least 32.");
  return limits;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RhinoImportError("RHINO_ABORTED", "3DM import was aborted.");
}

function convertDocument(doc: RhinoDecodedDocument, limits: RhinoImportLimits, signal?: AbortSignal): {
  readonly gltfUrl: string;
  readonly diagnostics: readonly RhinoImportDiagnostic[];
} {
  if (!doc || !Array.isArray(doc.objects) || (doc.materials !== undefined && !Array.isArray(doc.materials))) {
    throw new RhinoImportError("RHINO_BAD_DOCUMENT", "Decoded 3DM document has invalid object or material tables.");
  }
  const unit = doc.metersPerUnit;
  if (!Number.isFinite(unit) || unit <= 0 || unit > MAX_FLOAT32 || Math.fround(unit) === 0) {
    throw new RhinoImportError("RHINO_BAD_UNITS", "3DM document unit scale must be positive and representable.");
  }
  if (doc.objects.length > limits.maxObjects || (doc.materials?.length ?? 0) > limits.maxMaterials) {
    throw new RhinoImportError("RHINO_OBJECT_LIMIT", "3DM object or material count exceeds its configured limit.");
  }
  const diagnostics: RhinoImportDiagnostic[] = [];
  let metadataBytes = 0;
  const chargeMetadata = (value: string): void => {
    // Charge per-entry overhead as well as bytes, so many empty keys or texture
    // references cannot defeat the limit. Avoid encoding overlong strings.
    if (value.length + 16 > limits.maxMetadataBytes - metadataBytes) throw new RhinoImportError("RHINO_METADATA_LIMIT", "3DM metadata exceeds its configured byte limit.");
    metadataBytes += utf8Length(value) + 16;
    if (metadataBytes > limits.maxMetadataBytes) throw new RhinoImportError("RHINO_METADATA_LIMIT", "3DM metadata exceeds its configured byte limit.");
  };
  if (doc.unsupportedObjects !== undefined) {
    if (!Array.isArray(doc.unsupportedObjects)) throw new RhinoImportError("RHINO_BAD_DOCUMENT", "Unsupported-object report must be an array.");
    if (doc.unsupportedObjects.length > limits.maxObjects) throw new RhinoImportError("RHINO_OBJECT_LIMIT", "3DM unsupported-object report exceeds its configured limit.");
    for (const item of doc.unsupportedObjects) {
      if (!item || typeof item.type !== "string" || !Number.isSafeInteger(item.count) || item.count < 1) {
        throw new RhinoImportError("RHINO_BAD_DOCUMENT", "Unsupported-object report is invalid.");
      }
      chargeMetadata(item.type);
      diagnostics.push({ code: "RHINO_UNSUPPORTED_OBJECTS", message: `Unsupported 3DM ${item.type}: ${item.count} object(s).` });
    }
  }
  const buffers = new BinaryBuilder();
  const accessors: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const sourceMaterials = doc.materials ?? [];
  const materials = sourceMaterials.map((material, index) => materialToGltf(material, index, diagnostics, chargeMetadata));
  const nodes: Record<string, unknown>[] = [{
    name: "Rhino coordinates to glTF meters",
    matrix: [unit, 0, 0, 0, 0, 0, -unit, 0, 0, unit, 0, 0, 0, 0, 0, 1],
    children: [] as number[]
  }];
  let vertices = 0;
  let faces = 0;
  for (const [index, object] of doc.objects.entries()) {
    throwIfAborted(signal);
    if (!object || typeof object !== "object") throw new RhinoImportError("RHINO_BAD_OBJECT", `3DM object ${index} is invalid.`);
    if (object.parentIndex !== undefined && (!Number.isInteger(object.parentIndex) || object.parentIndex < 0 || object.parentIndex >= doc.objects.length || object.parentIndex === index)) {
      throw new RhinoImportError("RHINO_BAD_PARENT", `3DM object ${index} has an invalid parent.`);
    }
    if (object.materialIndex !== undefined && (!Number.isInteger(object.materialIndex) || object.materialIndex < 0 || object.materialIndex >= materials.length)) {
      throw new RhinoImportError("RHINO_BAD_MATERIAL", `3DM object ${index} references an invalid material.`);
    }
    const extras: Record<string, unknown> = {};
    for (const key of ["id", "layer"] as const) {
      const value = object[key];
      if (value !== undefined) {
        if (typeof value !== "string") throw new RhinoImportError("RHINO_BAD_METADATA", `3DM object ${index} ${key} is invalid.`);
        extras[`rhino_${key}`] = value;
        chargeMetadata(value);
      }
    }
    if (object.userStrings !== undefined) {
      if (!object.userStrings || typeof object.userStrings !== "object" || Array.isArray(object.userStrings)) {
        throw new RhinoImportError("RHINO_BAD_METADATA", `3DM object ${index} user strings are invalid.`);
      }
      const strings: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const [key, value] of Object.entries(object.userStrings)) {
        if (typeof value !== "string") throw new RhinoImportError("RHINO_BAD_METADATA", `3DM object ${index} user string is invalid.`);
        chargeMetadata(key);
        chargeMetadata(value);
        strings[key] = value;
      }
      extras.rhino_userStrings = strings;
    }
    if (object.name !== undefined) {
      if (typeof object.name !== "string") throw new RhinoImportError("RHINO_BAD_METADATA", `3DM object ${index} name is invalid.`);
      chargeMetadata(object.name);
    }
    const node: Record<string, unknown> = { name: object.name ?? `Rhino object ${index}`, extras, children: [] as number[] };
    if (object.transform !== undefined) {
      if (!Array.isArray(object.transform) || object.transform.length !== 16 || object.transform.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > MAX_FLOAT32)) {
        throw new RhinoImportError("RHINO_BAD_TRANSFORM", `3DM object ${index} transform must have 16 finite values.`);
      }
      if (object.transform[3] !== 0 || object.transform[7] !== 0 || object.transform[11] !== 0 || object.transform[15] !== 1) {
        throw new RhinoImportError("RHINO_BAD_TRANSFORM", `3DM object ${index} transform must be affine.`);
      }
      node.matrix = [...object.transform];
    }
    if (object.mesh !== undefined) {
      const mesh = object.mesh;
      if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.faces)) {
        throw new RhinoImportError("RHINO_BAD_MESH", `3DM object ${index} mesh is invalid.`);
      }
      vertices += mesh.positions.length;
      faces += mesh.faces.length;
      if (vertices > limits.maxVertices || faces > limits.maxFaces) {
        throw new RhinoImportError("RHINO_GEOMETRY_LIMIT", "3DM geometry exceeds its configured limits.");
      }
      node.mesh = meshes.length;
      meshes.push(meshToGltf(mesh, object.materialIndex, index, buffers, accessors));
    }
    nodes.push(node);
  }
  validateParents(doc.objects, limits.maxHierarchyDepth);
  for (const [index, object] of doc.objects.entries()) {
    const parent = object.parentIndex === undefined ? 0 : object.parentIndex + 1;
    (nodes[parent]!.children as number[]).push(index + 1);
  }
  if (meshes.length === 0) throw new RhinoImportError("RHINO_NO_SUPPORTED_GEOMETRY", "3DM archive contains no decoded supported mesh geometry.");
  const payload = buffers.bytes();
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D Rhino decoder bridge" },
    buffers: [{ byteLength: payload.length, uri: `data:application/octet-stream;base64,${base64(payload)}` }],
    bufferViews: buffers.views,
    accessors,
    materials,
    meshes,
    nodes,
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  return { gltfUrl: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`, diagnostics };
}

function validateParents(objects: readonly RhinoObjectData[], maxHierarchyDepth: number): void {
  const state = new Uint8Array(objects.length);
  const depths = new Uint32Array(objects.length);
  for (let index = 0; index < objects.length; index++) {
    let cursor: number | undefined = index;
    const visited: number[] = [];
    while (cursor !== undefined && state[cursor] === 0) {
      state[cursor] = 1;
      visited.push(cursor);
      cursor = objects[cursor]!.parentIndex;
    }
    if (cursor !== undefined && state[cursor] === 1) throw new RhinoImportError("RHINO_PARENT_CYCLE", "3DM object hierarchy contains a cycle.");
    let depth = cursor === undefined ? 0 : depths[cursor]!;
    for (const entry of visited.reverse()) {
      depth++;
      if (depth > maxHierarchyDepth) throw new RhinoImportError("RHINO_HIERARCHY_LIMIT", "3DM object hierarchy exceeds its configured depth limit.");
      depths[entry] = depth;
      state[entry] = 2;
    }
  }
}

function materialToGltf(material: RhinoMaterialData, index: number, diagnostics: RhinoImportDiagnostic[], chargeMetadata: (value: string) => void): Record<string, unknown> {
  if (!material || typeof material !== "object") throw new RhinoImportError("RHINO_BAD_MATERIAL", `3DM material ${index} is invalid.`);
  if (material.name !== undefined && typeof material.name !== "string") throw new RhinoImportError("RHINO_BAD_MATERIAL", `3DM material ${index} name is invalid.`);
  if (material.name !== undefined) chargeMetadata(material.name);
  const diffuse = material.diffuse ?? [0.8, 0.8, 0.8];
  validateVector(diffuse, 3, `material ${index} diffuse`, true);
  const transparency = unitInterval(material.transparency ?? 0, `material ${index} transparency`);
  const shininess = unitInterval(material.shininess ?? 0, `material ${index} shininess`);
  if (material.doubleSided !== undefined && typeof material.doubleSided !== "boolean") throw new RhinoImportError("RHINO_BAD_MATERIAL", `3DM material ${index} doubleSided is invalid.`);
  if (material.textureReferences !== undefined) {
    if (!Array.isArray(material.textureReferences) || material.textureReferences.some((value) => typeof value !== "string")) {
      throw new RhinoImportError("RHINO_BAD_MATERIAL", `3DM material ${index} texture references are invalid.`);
    }
    for (const [textureIndex, reference] of material.textureReferences.entries()) {
      chargeMetadata(reference);
      // Do not place potentially signed paths or embedded credentials in diagnostics.
      diagnostics.push({ code: "RHINO_UNSUPPORTED_TEXTURE", message: `3DM material ${index} texture ${textureIndex} is not imported.` });
    }
  }
  diagnostics.push({ code: "RHINO_MATERIAL_APPROXIMATION", message: `3DM material ${index} is approximated as glTF metallic-roughness.` });
  return {
    name: material.name ?? `Rhino material ${index}`,
    alphaMode: transparency > 0 ? "BLEND" : "OPAQUE",
    doubleSided: material.doubleSided ?? false,
    pbrMetallicRoughness: {
      baseColorFactor: [diffuse[0], diffuse[1], diffuse[2], 1 - transparency],
      metallicFactor: 0,
      roughnessFactor: Math.sqrt(1 - shininess)
    }
  };
}

function meshToGltf(mesh: RhinoMeshData, material: number | undefined, objectIndex: number, buffers: BinaryBuilder, accessors: Record<string, unknown>[]): Record<string, unknown> {
  if (mesh.positions.length < 3 || mesh.faces.length < 1) throw new RhinoImportError("RHINO_BAD_MESH", `3DM object ${objectIndex} mesh is empty.`);
  const attributes: Record<string, number> = {};
  const addAttribute = (name: string, rows: readonly (readonly number[])[], size: number): void => {
    if (!Array.isArray(rows) || rows.length !== mesh.positions.length) throw new RhinoImportError("RHINO_BAD_ATTRIBUTE", `3DM object ${objectIndex} ${name} count must match positions.`);
    const values = new Float32Array(rows.length * size);
    const min = new Array<number>(size).fill(Infinity);
    const max = new Array<number>(size).fill(-Infinity);
    for (let row = 0; row < rows.length; row++) {
      validateVector(rows[row], size, `object ${objectIndex} ${name}`, name === "COLOR_0");
      const normalLength = name === "NORMAL" ? Math.hypot(...rows[row]!) : 1;
      if (!Number.isFinite(normalLength) || normalLength === 0) throw new RhinoImportError("RHINO_BAD_ATTRIBUTE", `3DM object ${objectIndex} normal must be non-zero.`);
      for (let col = 0; col < size; col++) {
        const value = rows[row]![col]! / normalLength;
        const encoded = Math.fround(value);
        values[row * size + col] = encoded;
        min[col] = Math.min(min[col]!, encoded);
        max[col] = Math.max(max[col]!, encoded);
      }
    }
    const view = buffers.append(values);
    attributes[name] = accessors.length;
    accessors.push({ bufferView: view, componentType: 5126, count: rows.length, type: `VEC${size}`, ...(name === "POSITION" ? { min, max } : {}) });
  };
  addAttribute("POSITION", mesh.positions, 3);
  if (mesh.normals !== undefined) addAttribute("NORMAL", mesh.normals, 3);
  if (mesh.texcoords !== undefined) addAttribute("TEXCOORD_0", mesh.texcoords, 2);
  if (mesh.colors !== undefined) {
    if (!Array.isArray(mesh.colors) || mesh.colors.length !== mesh.positions.length) throw new RhinoImportError("RHINO_BAD_ATTRIBUTE", `3DM object ${objectIndex} color count must match positions.`);
    const colors = mesh.colors.map((color) => {
      if (!Array.isArray(color) || (color.length !== 3 && color.length !== 4)) throw new RhinoImportError("RHINO_BAD_ATTRIBUTE", `3DM object ${objectIndex} color must have three or four components.`);
      return [color[0]!, color[1]!, color[2]!, color.length === 4 ? color[3]! : 1];
    });
    addAttribute("COLOR_0", colors, 4);
  }
  const triangles: number[] = [];
  for (const face of mesh.faces) {
    if (!Array.isArray(face) || (face.length !== 3 && face.length !== 4) || face.some((n) => !Number.isSafeInteger(n) || n < 0 || n >= mesh.positions.length)) {
      throw new RhinoImportError("RHINO_BAD_FACE", `3DM object ${objectIndex} face has invalid vertex indices.`);
    }
    triangles.push(face[0]!, face[1]!, face[2]!);
    // Some archive codecs represent a triangle as a quad with a repeated third vertex.
    if (face.length === 4 && face[3] !== face[2]) triangles.push(face[0]!, face[2]!, face[3]!);
  }
  const indexView = buffers.append(new Uint32Array(triangles));
  const indexAccessor = accessors.length;
  accessors.push({ bufferView: indexView, componentType: 5125, count: triangles.length, type: "SCALAR" });
  return { primitives: [{ attributes, indices: indexAccessor, ...(material !== undefined ? { material } : {}) }] };
}

function validateVector(value: readonly number[], count: number, label: string, normalized = false): void {
  if (!Array.isArray(value) || value.length !== count || value.some((n) => !Number.isFinite(n) || Math.abs(n) > MAX_FLOAT32 || (normalized && (n < 0 || n > 1)))) {
    throw new RhinoImportError("RHINO_BAD_ATTRIBUTE", `3DM ${label} must have ${count} finite${normalized ? " normalized" : " float32"} components.`);
  }
}

function unitInterval(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RhinoImportError("RHINO_BAD_MATERIAL", `3DM ${label} must be in [0, 1].`);
  return value;
}

function utf8Length(value: string): number { return new TextEncoder().encode(value).byteLength; }

class BinaryBuilder {
  readonly views: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  private readonly parts: Uint8Array[] = [];
  private size = 0;

  append(data: Float32Array | Uint32Array): number {
    // glTF buffer payloads are little-endian, independent of the JS host.
    const bytes = new Uint8Array(data.byteLength);
    const output = new DataView(bytes.buffer);
    for (let index = 0; index < data.length; index++) {
      if (data instanceof Float32Array) output.setFloat32(index * 4, data[index]!, true);
      else output.setUint32(index * 4, data[index]!, true);
    }
    const index = this.views.length;
    this.views.push({ buffer: 0, byteOffset: this.size, byteLength: bytes.length });
    this.parts.push(bytes);
    this.size += bytes.length;
    return index;
  }

  bytes(): Uint8Array {
    const output = new Uint8Array(this.size);
    let cursor = 0;
    for (const part of this.parts) { output.set(part, cursor); cursor += part.length; }
    return output;
  }
}

function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(parts.join(""));
}
