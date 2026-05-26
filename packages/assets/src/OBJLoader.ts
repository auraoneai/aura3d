import type { AssetLoadProgress, AssetLoadRequest, AssetLoader } from "./AssetLoader";
import { GLTFLoader, type GLTFAsset, type GLTFLoaderDiagnostics } from "./GLTFLoader";
import type { LoadContext } from "./LoadContext";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

interface OBJFaceRef {
  readonly position: number;
  readonly texcoord?: number;
  readonly normal?: number;
}

interface ParsedOBJ {
  readonly name: string;
  readonly materialLibraries: readonly string[];
  readonly materialNames: readonly string[];
  readonly triangleMaterials: readonly string[];
  readonly positions: readonly Vec3[];
  readonly normals: readonly Vec3[];
  readonly texcoords: readonly Vec2[];
  readonly indices: readonly number[];
  readonly min: Vec3;
  readonly max: Vec3;
  readonly source: {
    readonly vertexCount: number;
    readonly normalCount: number;
    readonly texcoordCount: number;
    readonly faceCount: number;
    readonly triangulatedFaceCount: number;
    readonly generatedNormals: boolean;
  };
}

interface OBJMaterialDefinition {
  readonly name: string;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly alphaMode: "OPAQUE" | "BLEND";
}

interface OBJLoadRequest extends AssetLoadRequest {
  readonly mtl?: string;
  readonly materialLibraries?: Readonly<Record<string, string>>;
}

interface WrappedOBJAsset extends GLTFAsset {
  readonly __objInnerAsset?: GLTFAsset;
}

export class OBJLoader implements AssetLoader<GLTFAsset> {
  readonly type = "obj";

  private readonly gltfLoader: GLTFLoader;
  private readonly innerAssets = new WeakMap<GLTFAsset, GLTFAsset>();

  constructor(gltfLoader = new GLTFLoader()) {
    this.gltfLoader = gltfLoader;
  }

  canLoad(request: AssetLoadRequest): boolean {
    return request.type === "obj" || /\.obj(?:[?#]|$)/i.test(request.url) || request.url.startsWith("data:model/obj") || request.url.startsWith("data:text/plain");
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    context.throwIfAborted(request.url);
    const source = await loadOBJText(request, context);
    context.throwIfAborted(request.url);
    const parsed = parseOBJ(source, objNameFromUrl(request.url));
    const materials = await loadOBJMaterialDefinitions(request as OBJLoadRequest, parsed, context);
    const gltfUrl = createGLTFDataUrl(parsed, materials);
    const inner = await this.gltfLoader.load({ url: gltfUrl, type: "gltf", signal: request.signal, onProgress: request.onProgress }, context);
    const wrapped = wrapOBJAsset(request.url, inner, parsed);
    this.innerAssets.set(wrapped, inner);
    return wrapped;
  }

  dispose(asset: GLTFAsset): void {
    this.gltfLoader.dispose(this.innerAssets.get(asset) ?? asset);
  }
}

function wrapOBJAsset(url: string, inner: GLTFAsset, parsed: ParsedOBJ): GLTFAsset {
  const loaderDiagnostics = augmentDiagnostics(inner.loaderDiagnostics, parsed);
  const wrapped: WrappedOBJAsset = {
    url,
    get disposed() {
      return inner.disposed;
    },
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
    toJSON: () => ({
      ...inner.toJSON(),
      url,
      loaderDiagnostics
    }),
    __objInnerAsset: inner
  };
  return wrapped;
}

function augmentDiagnostics(diagnostics: GLTFLoaderDiagnostics, parsed: ParsedOBJ): GLTFLoaderDiagnostics {
  const features = new Set(diagnostics.features);
  features.add("obj");
  features.add("obj-native-import");
  features.add("obj-triangulated-faces");
  if (parsed.source.generatedNormals) features.add("obj-generated-normals");
  if (parsed.source.texcoordCount > 0) features.add("obj-texcoords");
  if (parsed.source.normalCount > 0) features.add("obj-normals");
  if (parsed.materialLibraries.length > 0) features.add("obj-mtllib");
  if (parsed.materialNames.length > 0) features.add("obj-usemtl");
  if (parsed.materialNames.length > 1) features.add("obj-multi-material");
  return {
    ...diagnostics,
    features: [...features].sort()
  };
}

async function loadOBJText(request: AssetLoadRequest, context: LoadContext): Promise<string> {
  if (request.url.startsWith("data:")) {
    const bytes = decodeOBJDataUri(request.url);
    reportProgress(request, "document", bytes.byteLength, bytes.byteLength);
    return new TextDecoder().decode(bytes);
  }
  if (typeof fetch !== "function") {
    throw new Error("OBJLoader requires fetch for non-data URLs");
  }
  const response = await fetch(request.url, { signal: request.signal });
  if (!response.ok) {
    throw new Error(`OBJ request failed with ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  context.throwIfAborted(request.url);
  reportProgress(request, "document", bytes.byteLength, bytes.byteLength);
  return new TextDecoder().decode(bytes);
}

function reportProgress(request: AssetLoadRequest, phase: AssetLoadProgress["phase"], loadedBytes: number, totalBytes?: number): void {
  request.onProgress?.({ url: request.url, phase, loadedBytes, totalBytes });
}

function parseOBJ(source: string, name: string): ParsedOBJ {
  const sourcePositions: Vec3[] = [];
  const sourceNormals: Vec3[] = [];
  const sourceTexcoords: Vec2[] = [];
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const texcoords: Vec2[] = [];
  const indices: number[] = [];
  const materialLibraries: string[] = [];
  const materialNames = new Set<string>();
  const triangleMaterials: string[] = [];
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let faceCount = 0;
  let generatedNormals = false;
  let activeMaterial = "obj-default-pbr-material";

  for (const [lineIndex, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const [keyword, ...fields] = line.split(/\s+/);
    if (keyword === "v") {
      sourcePositions.push(parseVec3(fields, `OBJ line ${lineIndex + 1} vertex`));
    } else if (keyword === "vn") {
      sourceNormals.push(normalizeVec3(parseVec3(fields, `OBJ line ${lineIndex + 1} normal`)));
    } else if (keyword === "vt") {
      sourceTexcoords.push(parseVec2(fields, `OBJ line ${lineIndex + 1} texcoord`));
    } else if (keyword === "mtllib") {
      if (fields.length === 0) throw new Error(`OBJ line ${lineIndex + 1} mtllib must reference a material library`);
      materialLibraries.push(fields.join(" "));
    } else if (keyword === "usemtl") {
      if (fields.length === 0) throw new Error(`OBJ line ${lineIndex + 1} usemtl must reference a material name`);
      activeMaterial = fields.join(" ");
      materialNames.add(activeMaterial);
    } else if (keyword === "f") {
      if (fields.length < 3) throw new Error(`OBJ line ${lineIndex + 1} face must have at least 3 vertices`);
      const refs = fields.map((field) => parseFaceRef(field, sourcePositions.length, sourceTexcoords.length, sourceNormals.length, lineIndex + 1));
      for (let index = 1; index < refs.length - 1; index += 1) {
        const triangle = [refs[0]!, refs[index]!, refs[index + 1]!];
        const fallbackNormal = faceNormal(
          sourcePositions[triangle[0].position]!,
          sourcePositions[triangle[1].position]!,
          sourcePositions[triangle[2].position]!
        );
        for (const ref of triangle) {
          const position = sourcePositions[ref.position]!;
          const normal = ref.normal === undefined ? fallbackNormal : sourceNormals[ref.normal]!;
          const texcoord = ref.texcoord === undefined ? [0, 0] as const : sourceTexcoords[ref.texcoord]!;
          if (ref.normal === undefined) generatedNormals = true;
          positions.push(position);
          normals.push(normal);
          texcoords.push(texcoord);
          indices.push(indices.length);
          updateBounds(min, max, position);
        }
        triangleMaterials.push(activeMaterial);
      }
      faceCount += 1;
    }
  }

  if (sourcePositions.length === 0) throw new Error("OBJ asset must contain at least one vertex.");
  if (indices.length === 0) throw new Error("OBJ asset must contain at least one triangulatable face.");
  return {
    name,
    materialLibraries,
    materialNames: [...materialNames],
    triangleMaterials,
    positions,
    normals,
    texcoords: sourceTexcoords.length > 0 ? texcoords : [],
    indices,
    min,
    max,
    source: {
      vertexCount: sourcePositions.length,
      normalCount: sourceNormals.length,
      texcoordCount: sourceTexcoords.length,
      faceCount,
      triangulatedFaceCount: indices.length / 3,
      generatedNormals
    }
  };
}

async function loadOBJMaterialDefinitions(request: OBJLoadRequest, parsed: ParsedOBJ, context: LoadContext): Promise<ReadonlyMap<string, OBJMaterialDefinition>> {
  const materials = new Map<string, OBJMaterialDefinition>();
  const inline = request.mtl;
  if (inline) {
    mergeMaterials(materials, parseMTL(inline));
  }
  for (const library of parsed.materialLibraries) {
    const librarySource = request.materialLibraries?.[library];
    if (librarySource !== undefined) {
      mergeMaterials(materials, parseMTL(librarySource));
      continue;
    }
    if (request.url.startsWith("data:")) continue;
    if (typeof fetch !== "function") continue;
    const url = new URL(library, request.url).toString();
    const response = await fetch(url, { signal: request.signal });
    if (!response.ok) continue;
    context.throwIfAborted(url);
    mergeMaterials(materials, parseMTL(await response.text()));
  }
  return materials;
}

function mergeMaterials(target: Map<string, OBJMaterialDefinition>, source: ReadonlyMap<string, OBJMaterialDefinition>): void {
  for (const [name, material] of source) target.set(name, material);
}

function parseMTL(source: string): ReadonlyMap<string, OBJMaterialDefinition> {
  const materials = new Map<string, OBJMaterialDefinition>();
  let current: {
    name: string;
    kd: [number, number, number];
    alpha: number;
    roughness: number;
  } | undefined;
  const flush = (): void => {
    if (!current) return;
    materials.set(current.name, {
      name: current.name,
      baseColorFactor: [current.kd[0], current.kd[1], current.kd[2], current.alpha],
      metallicFactor: 0,
      roughnessFactor: current.roughness,
      alphaMode: current.alpha < 0.999 ? "BLEND" : "OPAQUE"
    });
  };
  for (const [lineIndex, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const [keyword, ...fields] = line.split(/\s+/);
    if (keyword === "newmtl") {
      flush();
      if (fields.length === 0) throw new Error(`MTL line ${lineIndex + 1} newmtl must include a material name`);
      current = { name: fields.join(" "), kd: [0.72, 0.72, 0.68], alpha: 1, roughness: 0.62 };
    } else if (current && keyword === "Kd") {
      current.kd = parseColor3(fields, `MTL line ${lineIndex + 1} Kd`);
    } else if (current && keyword === "d") {
      current.alpha = clamp01(parseFinite(fields[0], `MTL line ${lineIndex + 1} d`));
    } else if (current && keyword === "Tr") {
      current.alpha = 1 - clamp01(parseFinite(fields[0], `MTL line ${lineIndex + 1} Tr`));
    } else if (current && keyword === "Ns") {
      const shininess = Math.max(0, parseFinite(fields[0], `MTL line ${lineIndex + 1} Ns`));
      current.roughness = clamp01(Math.sqrt(2 / (shininess + 2)));
    }
  }
  flush();
  return materials;
}

function createGLTFDataUrl(parsed: ParsedOBJ, materialDefinitions: ReadonlyMap<string, OBJMaterialDefinition> = new Map()): string {
  const buffer = new BinaryBufferBuilder();
  const positionView = buffer.appendFloat32(parsed.positions.flatMap((position) => [...position]));
  const normalView = buffer.appendFloat32(parsed.normals.flatMap((normal) => [...normal]));
  const texcoordView = parsed.texcoords.length > 0
    ? buffer.appendFloat32(parsed.texcoords.flatMap((texcoord) => [...texcoord]))
    : undefined;
  const materialNames = parsed.materialNames.length > 0 ? parsed.materialNames : ["obj-default-pbr-material"];
  const materialIndexByName = new Map(materialNames.map((name, index) => [name, index] as const));
  const indicesUseUint32 = parsed.positions.length > 65_535;
  const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1 };
  const accessors: unknown[] = [
    { bufferView: positionView, componentType: 5126, count: parsed.positions.length, type: "VEC3", min: parsed.min, max: parsed.max },
    { bufferView: normalView, componentType: 5126, count: parsed.normals.length, type: "VEC3" }
  ];
  if (texcoordView !== undefined) {
    attributes.TEXCOORD_0 = accessors.length;
    accessors.push({ bufferView: texcoordView, componentType: 5126, count: parsed.texcoords.length, type: "VEC2" });
  }
  const primitives = materialNames.map((name, materialIndex) => {
    const indices = indicesForMaterial(parsed, materialIndexByName, materialIndex, name);
    const indexView = indicesUseUint32 ? buffer.appendUint32(indices) : buffer.appendUint16(indices);
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: indicesUseUint32 ? 5125 : 5123, count: indices.length, type: "SCALAR" });
    return { attributes, indices: indexAccessor, material: materialIndex };
  }).filter((primitive) => {
    const accessor = accessors[primitive.indices] as { readonly count: number };
    return accessor.count > 0;
  });
  const bytes = buffer.bytes();
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D OBJLoader geometry and MTL importer" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytesToBase64(bytes)}`, byteLength: bytes.byteLength }],
    bufferViews: buffer.views,
    accessors,
    materials: materialNames.map((name) => gltfMaterialFromOBJ(name, materialDefinitions.get(name))),
    meshes: [{
      name: parsed.name,
      primitives
    }],
    nodes: [{ name: `${parsed.name}-node`, mesh: 0 }],
    scenes: [{ name: `${parsed.name}-scene`, nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function indicesForMaterial(
  parsed: ParsedOBJ,
  materialIndexByName: ReadonlyMap<string, number>,
  materialIndex: number,
  materialName: string
): readonly number[] {
  const indices: number[] = [];
  for (let triangle = 0; triangle < parsed.triangleMaterials.length; triangle += 1) {
    const name = parsed.triangleMaterials[triangle] ?? "obj-default-pbr-material";
    const index = materialIndexByName.get(name) ?? materialIndexByName.get(materialName);
    if (index !== materialIndex) continue;
    const offset = triangle * 3;
    indices.push(parsed.indices[offset]!, parsed.indices[offset + 1]!, parsed.indices[offset + 2]!);
  }
  return indices;
}

function gltfMaterialFromOBJ(name: string, material: OBJMaterialDefinition | undefined): unknown {
  const resolved = material ?? {
    name,
    baseColorFactor: [0.72, 0.72, 0.68, 1] as const,
    metallicFactor: 0,
    roughnessFactor: 0.62,
    alphaMode: "OPAQUE" as const
  };
  return {
    name: resolved.name,
    alphaMode: resolved.alphaMode,
    pbrMetallicRoughness: {
      baseColorFactor: resolved.baseColorFactor,
      metallicFactor: resolved.metallicFactor,
      roughnessFactor: resolved.roughnessFactor
    }
  };
}

class BinaryBufferBuilder {
  readonly views: Array<{ readonly buffer: 0; readonly byteOffset: number; readonly byteLength: number }> = [];
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;

  appendFloat32(values: readonly number[]): number {
    const data = new Float32Array(values);
    return this.appendBytes(new Uint8Array(data.buffer));
  }

  appendUint16(values: readonly number[]): number {
    const data = new Uint16Array(values);
    return this.appendBytes(new Uint8Array(data.buffer));
  }

  appendUint32(values: readonly number[]): number {
    const data = new Uint32Array(values);
    return this.appendBytes(new Uint8Array(data.buffer));
  }

  appendBytes(bytes: Uint8Array): number {
    this.pad4();
    const viewIndex = this.views.length;
    this.views.push({ buffer: 0, byteOffset: this.byteLength, byteLength: bytes.byteLength });
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
    return viewIndex;
  }

  bytes(): Uint8Array {
    this.pad4();
    const output = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  private pad4(): void {
    const padding = (4 - (this.byteLength % 4)) % 4;
    if (padding === 0) return;
    this.chunks.push(new Uint8Array(padding));
    this.byteLength += padding;
  }
}

function parseFaceRef(field: string, positionCount: number, texcoordCount: number, normalCount: number, line: number): OBJFaceRef {
  const parts = field.split("/");
  const position = resolveOBJIndex(parts[0], positionCount, `OBJ line ${line} face position`);
  const texcoord = parts[1] ? resolveOBJIndex(parts[1], texcoordCount, `OBJ line ${line} face texcoord`) : undefined;
  const normal = parts[2] ? resolveOBJIndex(parts[2], normalCount, `OBJ line ${line} face normal`) : undefined;
  return {
    position,
    ...(texcoord !== undefined ? { texcoord } : {}),
    ...(normal !== undefined ? { normal } : {})
  };
}

function resolveOBJIndex(value: string | undefined, count: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed === 0) throw new Error(`${label} index must be a non-zero integer.`);
  const index = parsed > 0 ? parsed - 1 : count + parsed;
  if (index < 0 || index >= count) throw new RangeError(`${label} index ${parsed} is outside available count ${count}.`);
  return index;
}

function parseVec3(fields: readonly string[], label: string): Vec3 {
  if (fields.length < 3) throw new Error(`${label} must contain three numeric components.`);
  const value = [Number(fields[0]), Number(fields[1]), Number(fields[2])] as const;
  if (value.some((component) => !Number.isFinite(component))) throw new Error(`${label} must contain finite numeric components.`);
  return value;
}

function parseVec2(fields: readonly string[], label: string): Vec2 {
  if (fields.length < 2) throw new Error(`${label} must contain two numeric components.`);
  const value = [Number(fields[0]), Number(fields[1])] as const;
  if (value.some((component) => !Number.isFinite(component))) throw new Error(`${label} must contain finite numeric components.`);
  return value;
}

function parseColor3(fields: readonly string[], label: string): [number, number, number] {
  if (fields.length < 3) throw new Error(`${label} must contain three numeric components.`);
  const value: [number, number, number] = [
    clamp01(Number(fields[0])),
    clamp01(Number(fields[1])),
    clamp01(Number(fields[2]))
  ];
  if (value.some((component) => !Number.isFinite(component))) throw new Error(`${label} must contain finite numeric components.`);
  return value;
}

function parseFinite(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite.`);
  return parsed;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  return normalizeVec3([
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ]);
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function updateBounds(min: [number, number, number], max: [number, number, number], position: Vec3): void {
  min[0] = Math.min(min[0], position[0]);
  min[1] = Math.min(min[1], position[1]);
  min[2] = Math.min(min[2], position[2]);
  max[0] = Math.max(max[0], position[0]);
  max[1] = Math.max(max[1], position[1]);
  max[2] = Math.max(max[2], position[2]);
}

function objNameFromUrl(url: string): string {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  const match = /([^/\\]+?)(?:\.obj)?$/i.exec(path);
  return sanitizeName(match?.[1] ?? "obj-asset");
}

function sanitizeName(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "obj-asset";
}

function decodeOBJDataUri(uri: string): Uint8Array {
  const separator = uri.indexOf(",");
  if (separator < 0) throw new Error("OBJ data uri must include a comma separator.");
  const header = uri.slice(5, separator).toLowerCase();
  const payload = uri.slice(separator + 1);
  if (header.endsWith(";base64")) return base64ToBytes(payload);
  return new TextEncoder().encode(decodeURIComponent(payload));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(payload: string): Uint8Array {
  const binary = atob(decodeURIComponent(payload).replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
