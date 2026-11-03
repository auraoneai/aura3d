import { mergeAssetRequestOptions, type AssetLoadProgress, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import { GLTFLoader, type GLTFAsset, type GLTFLoaderDiagnostics } from "./GLTFLoader";
import { LoadContext } from "./LoadContext";
import { fetchBytes } from "./LoaderFetch";
import { resolveAbsoluteAssetBase } from "./gltf/ImageDecode";

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
  readonly primitives: readonly OBJPrimitive[];
  readonly positions: readonly Vec3[];
  readonly normals: readonly Vec3[];
  readonly texcoords: readonly Vec2[];
  readonly colors: readonly Vec3[];
  readonly indices: readonly number[];
  readonly min: Vec3;
  readonly max: Vec3;
  readonly unsupportedDirectives: readonly string[];
  readonly source: {
    readonly vertexCount: number;
    readonly normalCount: number;
    readonly texcoordCount: number;
    readonly faceCount: number;
    readonly triangulatedFaceCount: number;
    readonly lineCount: number;
    readonly pointCount: number;
    readonly smoothingGroups: number;
    readonly generatedNormals: boolean;
  };
}

interface OBJPrimitive {
  readonly mode: 0 | 1 | 4;
  readonly material: string;
  readonly group: string;
  readonly indices: readonly number[];
}

interface OBJMaterialDefinition {
  readonly name: string;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly alphaMode: "OPAQUE" | "BLEND";
  readonly diffuseTexture?: OBJTexture;
  readonly emissiveTexture?: OBJTexture;
  readonly normalTexture?: OBJTexture;
  readonly emissiveFactor?: Vec3;
  readonly unsupportedFeatures?: readonly string[];
}

interface OBJTexture {
  readonly uri: string;
  /** Unresolved MTL reference, retained for offline admission policy. */
  readonly reference: string;
  readonly offset: Vec2;
  readonly scale: Vec2;
  readonly clamp: boolean;
}

export interface OBJLoadRequest extends AssetLoadRequest {
  readonly mtl?: string;
  readonly materialLibraries?: Readonly<Record<string, string>>;
}

/** Parser facts only: inspection does not fetch resources or assert rendered fidelity. */
export interface OBJInspection {
  readonly materialLibraries: readonly string[];
  readonly materialNames: readonly string[];
  readonly vertexCount: number;
  readonly primitiveCount: number;
  readonly hasTexcoords: boolean;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly diagnostics: readonly string[];
}

export interface OBJMaterialInspection {
  readonly name: string;
  readonly textures: readonly string[];
  readonly textureReferences: readonly string[];
  readonly diagnostics: readonly string[];
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

  /** Use the same bounded geometry parser as load(), without performing I/O. */
  inspect(source: string, name = "obj"): OBJInspection {
    const parsed = parseOBJ(source, name);
    return {
      materialLibraries: parsed.materialLibraries,
      materialNames: parsed.materialNames,
      vertexCount: parsed.source.vertexCount,
      primitiveCount: parsed.primitives.length,
      hasTexcoords: parsed.source.texcoordCount > 0,
      min: parsed.min,
      max: parsed.max,
      diagnostics: parsed.unsupportedDirectives.map((value) => `OBJ ${value} is not mapped by the native loader`)
    };
  }

  /** Inspect MTL with the runtime parser; returned texture URLs are resolved against its URL. */
  inspectMaterialLibrary(source: string, baseUrl: string): readonly OBJMaterialInspection[] {
    return [...parseMTL(source, baseUrl)].map(([name, material]) => {
      const textures = [material.diffuseTexture, material.emissiveTexture, material.normalTexture].filter((value): value is OBJTexture => value !== undefined);
      return { name, textures: textures.map((value) => value.uri), textureReferences: textures.map((value) => value.reference), diagnostics: material.unsupportedFeatures ?? [] };
    });
  }

  async load(request: OBJLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    context.throwIfAborted(request.url);
    const source = await loadOBJText(request, context);
    context.throwIfAborted(request.url);
    const parsed = parseOBJ(source, objNameFromUrl(request.url));
    const dependencyContext = context.child(request.url, undefined, mergeAssetRequestOptions(context.requestOptionsFor(request.url), request));
    const materials = await embedOBJTextures(await loadOBJMaterialDefinitions(request, parsed, dependencyContext), parsed, request, dependencyContext);
    const gltfUrl = createGLTFDataUrl(parsed, materials);
    const signal = context.signalFor(request.signal);
    const inner = await this.gltfLoader.load({ url: gltfUrl, type: "gltf", signal }, new LoadContext({ signal }));
    if (signal?.aborted) { this.gltfLoader.dispose(inner); throw signal.reason ?? new Error("OBJ load aborted"); }
    const wrapped = wrapOBJAsset(request.url, inner, parsed, materials);
    this.innerAssets.set(wrapped, inner);
    return wrapped;
  }

  dispose(asset: GLTFAsset): void {
    this.gltfLoader.dispose(this.innerAssets.get(asset) ?? asset);
  }
}

function wrapOBJAsset(url: string, inner: GLTFAsset, parsed: ParsedOBJ, materials: ReadonlyMap<string, OBJMaterialDefinition>): GLTFAsset {
  const loaderDiagnostics = augmentDiagnostics(inner.loaderDiagnostics, parsed, materials);
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

function augmentDiagnostics(diagnostics: GLTFLoaderDiagnostics, parsed: ParsedOBJ, materials: ReadonlyMap<string, OBJMaterialDefinition>): GLTFLoaderDiagnostics {
  const features = new Set(diagnostics.features);
  features.add("obj");
  features.add("obj-native-import");
  features.add("obj-triangulated-faces");
  if (parsed.source.generatedNormals) features.add("obj-generated-normals");
  if (parsed.source.texcoordCount > 0) features.add("obj-texcoords");
  if (parsed.source.normalCount > 0) features.add("obj-normals");
  if (parsed.source.lineCount > 0) features.add("obj-lines");
  if (parsed.source.pointCount > 0) features.add("obj-points");
  if (parsed.source.smoothingGroups > 0) features.add("obj-smoothing-groups");
  if (parsed.colors.length > 0) features.add("obj-vertex-colors");
  if (parsed.materialLibraries.length > 0) features.add("obj-mtllib");
  if (parsed.materialNames.length > 0) features.add("obj-usemtl");
  if (parsed.materialNames.length > 1) features.add("obj-multi-material");
  return {
    ...diagnostics,
    features: [...features].sort(),
    unsupportedFeatures: [...diagnostics.unsupportedFeatures, ...parsed.unsupportedDirectives.map((value) => `OBJ ${value} is not mapped by the native loader`), ...[...materials.values()].flatMap((material) => material.unsupportedFeatures ?? [])]
  };
}

async function loadOBJText(request: AssetLoadRequest, context: LoadContext): Promise<string> {
  const options = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
  const bytes = new Uint8Array(await fetchBytes(context.resolve(request.url), context.signalFor(request.signal),
    ({ loaded, total }) => reportProgress(request, "document", loaded, total),
    { ...options, maxBytes: Math.min(options.maxBytes ?? OBJ_MAX_SOURCE_BYTES, OBJ_MAX_SOURCE_BYTES) }));
  context.throwIfAborted(request.url);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function reportProgress(request: AssetLoadRequest, phase: AssetLoadProgress["phase"], loadedBytes: number, totalBytes?: number): void {
  request.onProgress?.({ url: request.url, phase, loadedBytes, totalBytes });
}

// Limits are deliberately independent of untrusted counts in the document.
const OBJ_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const OBJ_MAX_VERTICES = 2_000_000;
const OBJ_MAX_OUTPUT_VERTICES = 6_000_000;

type OBJElement = {
  readonly mode: 0 | 1 | 4;
  readonly refs: readonly OBJFaceRef[];
  readonly material: string;
  readonly group: string;
  readonly smoothing: string | undefined;
};

function parseOBJ(source: string, name: string): ParsedOBJ {
  if (source.length > OBJ_MAX_SOURCE_BYTES || new TextEncoder().encode(source).byteLength > OBJ_MAX_SOURCE_BYTES) {
    throw new RangeError("OBJ source exceeds the 64 MiB limit.");
  }
  const sourcePositions: Vec3[] = [];
  const sourceColors: Array<Vec3 | undefined> = [];
  const sourceNormals: Vec3[] = [];
  const sourceTexcoords: Vec2[] = [];
  const elements: OBJElement[] = [];
  const materialLibraries: string[] = [];
  const smoothingGroups = new Set<string>();
  const unsupportedDirectives = new Set<string>();
  let activeMaterial = "obj-default-pbr-material";
  let object = "";
  let group = "";
  let smoothing: string | undefined;
  let faceCount = 0;
  let lineCount = 0;
  let pointCount = 0;
  let outputCount = 0;

  // Continuations are legal in OBJ. Apply them before removing comments.
  for (const [lineIndex, rawLine] of source.replace(/\\\r?\n/g, " ").split(/\r?\n/).entries()) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const [keyword, ...fields] = line.split(/\s+/);
    const label = `OBJ line ${lineIndex + 1}`;
    if (keyword === "v") {
      sourcePositions.push(parseVec3(fields, `${label} vertex`));
      // Six components are the common XYZ+RGB extension. Four components
      // retain the existing XYZ/W behavior; other extra-component layouts
      // are ambiguous and are explicitly reported rather than guessed.
      if (fields.length === 6) {
        const color = parseVec3(fields.slice(3), `${label} vertex color`);
        if (color.some((component) => !Number.isFinite(Math.fround(component)))) {
          throw new RangeError(`${label} vertex color must be representable as finite float32 values.`);
        }
        sourceColors.push(color);
      } else {
        sourceColors.push(undefined);
        if (fields.length > 4 && unsupportedDirectives.size < 128) {
          unsupportedDirectives.add(`vertex color layout with ${fields.length} components`);
        }
      }
    }
    else if (keyword === "vn") sourceNormals.push(normalizeVec3(parseVec3(fields, `${label} normal`)));
    else if (keyword === "vt") sourceTexcoords.push(parseVec2(fields, `${label} texcoord`));
    else if (keyword === "mtllib") {
      if (!fields.length) throw new Error(`${label} mtllib must reference a material library`);
      materialLibraries.push(...fields);
    } else if (keyword === "usemtl") {
      if (!fields.length) throw new Error(`${label} usemtl must reference a material name`);
      activeMaterial = fields.join(" ");
    } else if (keyword === "o") object = fields.join(" ");
    else if (keyword === "g") group = fields.join(" ");
    else if (keyword === "s") {
      if (fields.length !== 1) throw new Error(`${label} smoothing requires one group or off`);
      smoothing = fields[0] === "off" || fields[0] === "0" ? undefined : fields[0] === "on" ? "1" : fields[0];
      if (smoothing) smoothingGroups.add(smoothing);
    } else if (keyword === "f" || keyword === "l" || keyword === "p") {
      const minimum = keyword === "f" ? 3 : keyword === "l" ? 2 : 1;
      if (fields.length < minimum) throw new Error(`${label} ${keyword} requires at least ${minimum} vertices`);
      const contribution = keyword === "f" ? (fields.length - 2) * 3 : keyword === "l" ? (fields.length - 1) * 2 : fields.length;
      outputCount += contribution;
      if (outputCount > OBJ_MAX_OUTPUT_VERTICES) throw new RangeError("OBJ output exceeds the vertex limit.");
      const refs = fields.map((field) => parseFaceRef(field, sourcePositions.length, sourceTexcoords.length, sourceNormals.length, lineIndex + 1));
      elements.push({ mode: keyword === "f" ? 4 : keyword === "l" ? 1 : 0, refs, material: activeMaterial, group: [object, group].filter(Boolean).join("/") || name, smoothing });
      if (keyword === "f") faceCount += 1;
      else if (keyword === "l") lineCount += 1;
      else pointCount += fields.length;
    } else if (keyword && unsupportedDirectives.size < 128) unsupportedDirectives.add(keyword);
    if (sourcePositions.length > OBJ_MAX_VERTICES || sourceNormals.length > OBJ_MAX_VERTICES || sourceTexcoords.length > OBJ_MAX_VERTICES) {
      throw new RangeError("OBJ source exceeds the attribute limit.");
    }
  }
  if (sourcePositions.length === 0) throw new Error("OBJ asset must contain at least one vertex.");
  if (elements.length === 0) throw new Error("OBJ asset must contain a face, line, or point primitive.");

  // Accumulate area-weighted triangle normals per source vertex and smoothing
  // group. Explicit vn values always take precedence; s off stays faceted.
  const normalSums = new Map<string, [number, number, number]>();
  for (const element of elements) {
    if (element.mode !== 4 || !element.smoothing) continue;
    for (let i = 1; i < element.refs.length - 1; i += 1) {
      const triangle = [element.refs[0]!, element.refs[i]!, element.refs[i + 1]!];
      const normal = faceVector(sourcePositions[triangle[0].position]!, sourcePositions[triangle[1].position]!, sourcePositions[triangle[2].position]!);
      for (const ref of triangle) {
        const key = `${element.smoothing}\0${ref.position}`;
        const sum = normalSums.get(key) ?? [0, 0, 0];
        sum[0] += normal[0]; sum[1] += normal[1]; sum[2] += normal[2];
        normalSums.set(key, sum);
      }
    }
  }
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const texcoords: Vec2[] = [];
  const colors: Vec3[] = [];
  const indices: number[] = [];
  const primitives: Array<{ mode: 0 | 1 | 4; material: string; group: string; indices: number[] }> = [];
  const materialNames = new Set<string>();
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let generatedNormals = false;
  const hasVertexColors = elements.some((element) => element.refs.some((ref) => sourceColors[ref.position] !== undefined));
  let triangulatedFaceCount = 0;
  for (const element of elements) {
    let primitive = primitives[primitives.length - 1];
    if (!primitive || primitive.mode !== element.mode || primitive.material !== element.material || primitive.group !== element.group) {
      primitive = { mode: element.mode, material: element.material, group: element.group, indices: [] };
      primitives.push(primitive);
    }
    materialNames.add(element.material);
    const emit = (ref: OBJFaceRef, fallback: Vec3): void => {
      const position = sourcePositions[ref.position]!;
      let normal = ref.normal === undefined ? fallback : sourceNormals[ref.normal]!;
      if (element.mode === 4 && ref.normal === undefined) {
        generatedNormals = true;
        if (element.smoothing) normal = normalizeVec3(normalSums.get(`${element.smoothing}\0${ref.position}`) ?? fallback);
      }
      positions.push(position); normals.push(normal);
      texcoords.push(ref.texcoord === undefined ? [0, 0] : sourceTexcoords[ref.texcoord]!);
      if (hasVertexColors) {
        const color = sourceColors[ref.position];
        colors.push(color ?? [1, 1, 1]);
      }
      indices.push(indices.length); primitive!.indices.push(indices.length - 1);
      updateBounds(min, max, position);
    };
    if (element.mode === 4) {
      for (let i = 1; i < element.refs.length - 1; i += 1) {
        const triangle = [element.refs[0]!, element.refs[i]!, element.refs[i + 1]!];
        const fallback = faceNormal(sourcePositions[triangle[0].position]!, sourcePositions[triangle[1].position]!, sourcePositions[triangle[2].position]!);
        triangle.forEach((ref) => emit(ref, fallback));
        triangulatedFaceCount += 1;
      }
    } else if (element.mode === 1) {
      for (let i = 1; i < element.refs.length; i += 1) {
        emit(element.refs[i - 1]!, [0, 0, 1]); emit(element.refs[i]!, [0, 0, 1]);
      }
    } else element.refs.forEach((ref) => emit(ref, [0, 0, 1]));
  }
  return { name, materialLibraries, materialNames: [...materialNames], primitives, positions, normals, unsupportedDirectives: [...unsupportedDirectives],
    texcoords: sourceTexcoords.length ? texcoords : [], colors, indices, min, max,
    source: { vertexCount: sourcePositions.length, normalCount: sourceNormals.length, texcoordCount: sourceTexcoords.length,
      faceCount, triangulatedFaceCount, lineCount, pointCount, smoothingGroups: smoothingGroups.size, generatedNormals } };
}

async function loadOBJMaterialDefinitions(request: OBJLoadRequest, parsed: ParsedOBJ, context: LoadContext): Promise<ReadonlyMap<string, OBJMaterialDefinition>> {
  const materials = new Map<string, OBJMaterialDefinition>();
  if ((request.mtl !== undefined || request.materialLibraries !== undefined) && context.requestOptions.integrity?.requireDependencies) {
    throw new Error("Inline OBJ material libraries cannot satisfy required dependency integrity; load them by URL.");
  }
  if (request.mtl !== undefined) mergeMaterials(materials, parseMTL(request.mtl, request.url));
  for (const library of parsed.materialLibraries) {
    const librarySource = request.materialLibraries?.[library];
    const url = request.url.startsWith("data:") ? request.url : resolveOBJDependency(library, request.url);
    if (librarySource !== undefined) {
      mergeMaterials(materials, parseMTL(librarySource, url));
      continue;
    }
    // An explicit inline MTL is a caller-supplied replacement for mtllib.
    if (request.mtl !== undefined) continue;
    if (request.url.startsWith("data:")) throw new Error(`OBJ material library ${library} requires an explicit source for a data URL.`);
    const policy = context.requestOptionsFor(url);
    const bytes = await fetchBytes(url, context.signalFor(request.signal), undefined,
      { ...policy, maxBytes: Math.min(policy.maxBytes ?? OBJ_MAX_SOURCE_BYTES, OBJ_MAX_SOURCE_BYTES) });
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    context.throwIfAborted(url);
    mergeMaterials(materials, parseMTL(text, url));
  }
  return materials;
}

async function embedOBJTextures(
  materials: ReadonlyMap<string, OBJMaterialDefinition>, parsed: ParsedOBJ, request: OBJLoadRequest, context: LoadContext
): Promise<ReadonlyMap<string, OBJMaterialDefinition>> {
  const output = new Map<string, OBJMaterialDefinition>();
  const images = new Map<string, string>();
  let totalBytes = 0;
  const embed = async (texture: OBJTexture | undefined): Promise<OBJTexture | undefined> => {
    if (!texture) return undefined;
    let uri = images.get(texture.uri);
    if (!uri) {
      const policy = context.requestOptionsFor(texture.uri);
      const remaining = OBJ_MAX_SOURCE_BYTES - totalBytes;
      if (remaining <= 0) throw new RangeError("OBJ texture dependencies exceed the 64 MiB limit.");
      const bytes = new Uint8Array(await fetchBytes(texture.uri, context.signalFor(request.signal), undefined,
        { ...policy, maxBytes: Math.min(policy.maxBytes ?? remaining, remaining) }));
      totalBytes += bytes.byteLength;
      let mime: string;
      if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) mime = "image/png";
      else if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
      else throw new Error("OBJ texture must be a PNG or JPEG for glTF rendering.");
      uri = `data:${mime};base64,${bytesToBase64(bytes)}`;
      images.set(texture.uri, uri);
    }
    return { ...texture, uri };
  };
  for (const [name, material] of materials) {
    if (!parsed.materialNames.includes(name)) continue;
    if (!parsed.texcoords.length && (material.diffuseTexture || material.emissiveTexture || material.normalTexture)) {
      throw new Error(`OBJ material ${name} uses a texture but the mesh has no texture coordinates.`);
    }
    const diffuseTexture = await embed(material.diffuseTexture);
    const emissiveTexture = await embed(material.emissiveTexture);
    const normalTexture = await embed(material.normalTexture);
    output.set(name, { ...material, diffuseTexture, emissiveTexture, normalTexture });
  }
  return output;
}

function resolveOBJDependency(reference: string, base: string): string {
  if (/^(?:data:|blob:|https?:|file:)/i.test(reference)) return reference;
  if (base.startsWith("data:")) throw new Error(`OBJ texture ${reference} requires an absolute URI when its material library is inline.`);
  return new URL(reference, resolveAbsoluteAssetBase(base)).toString();
}

function mergeMaterials(target: Map<string, OBJMaterialDefinition>, source: ReadonlyMap<string, OBJMaterialDefinition>): void {
  for (const [name, material] of source) target.set(name, material);
}

function parseMTL(source: string, baseUrl: string): ReadonlyMap<string, OBJMaterialDefinition> {
  if (source.length > OBJ_MAX_SOURCE_BYTES || new TextEncoder().encode(source).byteLength > OBJ_MAX_SOURCE_BYTES) throw new RangeError("MTL source exceeds the 64 MiB limit.");
  const materials = new Map<string, OBJMaterialDefinition>();
  let current: {
    name: string; kd: [number, number, number]; alpha: number; roughness: number;
    emissiveFactor?: Vec3; unsupportedFeatures: string[];
    diffuseTexture?: OBJTexture; emissiveTexture?: OBJTexture; normalTexture?: OBJTexture;
  } | undefined;
  const flush = (): void => {
    if (!current) return;
    materials.set(current.name, {
      name: current.name, baseColorFactor: [current.kd[0], current.kd[1], current.kd[2], current.alpha],
      metallicFactor: 0, roughnessFactor: current.roughness, alphaMode: current.alpha < 0.999 ? "BLEND" : "OPAQUE",
      ...(current.diffuseTexture ? { diffuseTexture: current.diffuseTexture } : {}),
      ...(current.emissiveTexture ? { emissiveTexture: current.emissiveTexture } : {}),
      ...(current.normalTexture ? { normalTexture: current.normalTexture } : {}),
      ...(current.emissiveFactor ? { emissiveFactor: current.emissiveFactor } : {}),
      ...(current.unsupportedFeatures.length ? { unsupportedFeatures: current.unsupportedFeatures } : {})
    });
  };
  for (const [lineIndex, rawLine] of source.replace(/\\\r?\n/g, " ").split(/\r?\n/).entries()) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const [keyword, ...fields] = line.split(/\s+/);
    const label = `MTL line ${lineIndex + 1}`;
    if (keyword === "newmtl") {
      flush();
      if (!fields.length) throw new Error(`${label} newmtl must include a material name`);
      current = { name: fields.join(" "), kd: [0.72, 0.72, 0.68], alpha: 1, roughness: 0.62, unsupportedFeatures: [] };
    } else if (current && keyword === "Kd") current.kd = parseColor3(fields, `${label} Kd`);
    else if (current && keyword === "d") current.alpha = clamp01(parseFinite(fields[0], `${label} d`));
    else if (current && keyword === "Tr") current.alpha = 1 - clamp01(parseFinite(fields[0], `${label} Tr`));
    else if (current && keyword === "Ns") current.roughness = clamp01(Math.sqrt(2 / (Math.max(0, parseFinite(fields[0], `${label} Ns`)) + 2)));
    else if (current && keyword === "Ke") current.emissiveFactor = parseColor3(fields, `${label} Ke`);
    else if (current && (keyword === "map_Bump" || keyword === "map_bump" || keyword === "bump" || keyword === "disp" || keyword === "map_d" || keyword === "map_Ks")) {
      current.unsupportedFeatures.push(`MTL ${keyword} cannot be translated faithfully`);
    }
    else if (current && (keyword === "map_Kd" || keyword === "map_Ke" || keyword === "norm")) {
      const texture = parseMTLTexture(fields, baseUrl, label);
      if (keyword === "map_Kd") current.diffuseTexture = texture;
      else if (keyword === "map_Ke") current.emissiveTexture = texture;
      else current.normalTexture = texture;
    } else if (current && keyword && current.unsupportedFeatures.length < 128) {
      const warning = `MTL ${keyword} is not mapped by the native loader`;
      if (!current.unsupportedFeatures.includes(warning)) current.unsupportedFeatures.push(warning);
    }
  }
  flush();
  return materials;
}

function parseMTLTexture(fields: readonly string[], baseUrl: string, label: string): OBJTexture {
  let index = 0;
  let offset: Vec2 = [0, 0];
  let scale: Vec2 = [1, 1];
  let clamp = false;
  while (index < fields.length && fields[index]!.startsWith("-")) {
    const option = fields[index++]!;
    if (option === "-o" || option === "-s" || option === "-t") {
      const values: number[] = [];
      while (values.length < 3 && index < fields.length && fields[index]!.trim() !== "" && Number.isFinite(Number(fields[index]))) values.push(Number(fields[index++]));
      if (!values.length) throw new Error(`${label} ${option} requires numeric values.`);
      if (option === "-o") offset = [values[0]!, values[1] ?? 0];
      if (option === "-s") scale = [values[0]!, values[1] ?? 1];
      if (option === "-t" && values.some((v) => v !== 0)) throw new Error(`${label} unsupported nonzero texture turbulence.`);
    } else if (option === "-clamp") {
      const value = fields[index++];
      if (value !== "on" && value !== "off") throw new Error(`${label} -clamp requires on or off.`);
      clamp = value === "on";
    } else if (option === "-bm") {
      // A bump magnitude cannot be applied as a normal-map scale faithfully.
      throw new Error(`${label} bump-map multiplier is unsupported.`);
    } else throw new Error(`${label} unsupported texture option ${option}.`);
  }
  const path = fields.slice(index).join(" ");
  if (!path) throw new Error(`${label} texture requires a path.`);
  return { uri: resolveOBJDependency(path, baseUrl), reference: path, offset, scale, clamp };
}

function createGLTFDataUrl(parsed: ParsedOBJ, materialDefinitions: ReadonlyMap<string, OBJMaterialDefinition> = new Map()): string {
  const buffer = new BinaryBufferBuilder();
  const positionView = buffer.appendFloat32(parsed.positions.flatMap((position) => [...position]));
  const normalView = buffer.appendFloat32(parsed.normals.flatMap((normal) => [...normal]));
  const texcoordView = parsed.texcoords.length > 0
    ? buffer.appendFloat32(parsed.texcoords.flatMap((texcoord) => [...texcoord]))
    : undefined;
  const colorView = parsed.colors.length > 0
    ? buffer.appendFloat32(parsed.colors.flatMap((color) => [...color]))
    : undefined;
  const materialNames = parsed.materialNames;
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
  if (colorView !== undefined) {
    attributes.COLOR_0 = accessors.length;
    accessors.push({ bufferView: colorView, componentType: 5126, count: parsed.colors.length, type: "VEC3" });
  }
  // Render resources are keyed by mesh name. A single OBJ group can contain
  // several primitive runs, so give each run a unique internal mesh name.
  const usedMeshNames = new Set<string>();
  const nextMeshSuffix = new Map<string, number>();
  const meshes = parsed.primitives.map((primitive) => {
    let meshName = primitive.group;
    if (usedMeshNames.has(meshName)) {
      let suffix = nextMeshSuffix.get(primitive.group) ?? 1;
      do { meshName = `${primitive.group}-${suffix++}`; } while (usedMeshNames.has(meshName));
      nextMeshSuffix.set(primitive.group, suffix);
    }
    usedMeshNames.add(meshName);
    const indexView = indicesUseUint32 ? buffer.appendUint32(primitive.indices) : buffer.appendUint16(primitive.indices);
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: indicesUseUint32 ? 5125 : 5123, count: primitive.indices.length, type: "SCALAR" });
    return { name: meshName, primitives: [{ attributes, indices: indexAccessor, material: materialIndexByName.get(primitive.material), mode: primitive.mode }] };
  });
  const images: Array<{ uri: string }> = [];
  const textures: Array<{ source: number; sampler: number }> = [];
  const samplers: Array<{ wrapS: number; wrapT: number }> = [];
  let hasTransform = false;
  const textureInfo = (texture: OBJTexture | undefined): unknown => {
    if (!texture) return undefined;
    const index = textures.length;
    images.push({ uri: texture.uri });
    textures.push({ source: index, sampler: index });
    const wrap = texture.clamp ? 33071 : 10497;
    samplers.push({ wrapS: wrap, wrapT: wrap });
    const transformed = texture.offset[0] !== 0 || texture.offset[1] !== 0 || texture.scale[0] !== 1 || texture.scale[1] !== 1;
    hasTransform ||= transformed;
    return { index, ...(transformed ? { extensions: { KHR_texture_transform: { offset: texture.offset, scale: texture.scale } } } : {}) };
  };
  const materials = materialNames.map((name) => gltfMaterialFromOBJ(name, materialDefinitions.get(name), textureInfo));
  const bytes = buffer.bytes();
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D OBJLoader geometry and MTL importer" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytesToBase64(bytes)}`, byteLength: bytes.byteLength }],
    bufferViews: buffer.views,
    accessors,
    ...(hasTransform ? { extensionsUsed: ["KHR_texture_transform"] } : {}),
    images, textures, samplers, materials, meshes,
    nodes: meshes.map((_, index) => ({ name: parsed.primitives[index]!.group, mesh: index })),
    scenes: [{ name: `${parsed.name}-scene`, nodes: meshes.map((_, index) => index) }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function gltfMaterialFromOBJ(name: string, material: OBJMaterialDefinition | undefined, textureInfo: (texture: OBJTexture | undefined) => unknown): unknown {
  const resolved: OBJMaterialDefinition = material ?? {
    name, baseColorFactor: [0.72, 0.72, 0.68, 1] as const,
    metallicFactor: 0, roughnessFactor: 0.62, alphaMode: "OPAQUE" as const
  };
  const baseColorTexture = textureInfo(resolved.diffuseTexture);
  const normalTexture = textureInfo(resolved.normalTexture);
  const emissiveTexture = textureInfo(resolved.emissiveTexture);
  return {
    name: resolved.name, alphaMode: resolved.alphaMode,
    pbrMetallicRoughness: {
      baseColorFactor: resolved.baseColorFactor, metallicFactor: resolved.metallicFactor, roughnessFactor: resolved.roughnessFactor,
      ...(baseColorTexture ? { baseColorTexture } : {})
    },
    ...(normalTexture ? { normalTexture } : {}),
    ...(emissiveTexture ? { emissiveTexture } : {}),
    ...((emissiveTexture || resolved.emissiveFactor) ? { emissiveFactor: resolved.emissiveFactor ?? [1, 1, 1] } : {})
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
  if (parts.length > 3 || !parts[0]) throw new Error(`OBJ line ${line} invalid vertex reference ${field}.`);
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
  return normalizeVec3(faceVector(a, b, c));
}

function faceVector(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  return [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
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
