import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { GLTFLoader, type GLTFAsset, type GLTFJson } from "../GLTFLoader";
import type { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";

/** Limits apply before creating render resources. Coordinates remain right handed; a
 * root conversion maps the document's unit and up axis into metres and Y-up. */
export interface ColladaImportOptions {
  readonly baseUrl?: string;
  readonly maxBytes?: number;
  readonly maxVertices?: number;
  /** Map every external reference, for example to a verified archive entry. */
  readonly resolveDependency?: (uri: string, containingDocument?: string) => string;
}
export interface ColladaImport {
  readonly gltf: GLTFJson;
  readonly gltfUrl: string;
  readonly dependencies: readonly string[];
  readonly diagnostics: readonly string[];
  readonly unitMeter: number;
  readonly upAxis: "X_UP" | "Y_UP" | "Z_UP";
}

interface Element {
  name: string;
  attributes: Record<string, string>;
  children: Element[];
  text: string;
}
interface Source { values: string[]; offset: number; stride: number; count: number }
interface Material { name?: string; pbrMetallicRoughness: { baseColorFactor: number[]; metallicFactor: number; roughnessFactor: number; baseColorTexture?: { index: number } }; alphaMode?: string }
interface NodeOut { name?: string; children?: number[]; mesh?: number; matrix?: number[]; skin?: number; translation?: number[]; rotation?: number[]; scale?: number[] }
interface PrimitiveOut { attributes: Record<string, number>; material?: number; mode?: number }
interface SkinData { id: string; joints: string[]; inverseBind: number[]; influences: Array<{ joints: number[]; weights: number[] }> }
interface MeshOut { name?: string; primitives: PrimitiveOut[] }

const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_VERTICES = 250_000;
const MAX_SCALARS = 4_000_000;
const MAX_OUTPUT_NODES = 100_000;
const MAX_ELEMENTS = 500_000;
const MAX_DEPTH = 128;

/** An independently authored, bounded COLLADA 1.4/1.5 conversion. Supported
 * triangles/polylist/polygons, position/normal/UV inputs, scene instances,
 * common-profile diffuse colours/textures and ordered transforms are lowered to
 * the native glTF asset path. Unsupported constructs are reported explicitly. */
export function parseCollada(source: string, options: ColladaImportOptions = {}): ColladaImport {
  const maxBytes = boundedLimit(options.maxBytes, MAX_DOCUMENT_BYTES, "maxBytes");
  const maxVertices = boundedLimit(options.maxVertices, MAX_VERTICES, "maxVertices");
  if (source.length > maxBytes || new TextEncoder().encode(source).length > maxBytes) throw new RangeError("COLLADA document exceeds maxBytes");
  const root = parseXml(source);
  if (root.name !== "COLLADA") throw new Error("COLLADA root element is required");
  const version = root.attributes.version;
  if (version && !/^1\.[45](?:\.|$)/.test(version)) throw new Error(`Unsupported COLLADA version ${version}`);
  const byId = new Map<string, Element>();
  const all = descendants(root);
  for (const element of all) {
    const id = element.attributes.id;
    if (id) {
      if (byId.has(id)) throw new Error(`COLLADA duplicate id ${id}`);
      byId.set(id, element);
    }
  }
  const diagnostics = new Set<string>();
  const dependencies = new Set<string>();
  const resolve = (uri: string): string => {
    if (!uri || uri.startsWith("#")) return uri;
    const result = options.resolveDependency ? options.resolveDependency(uri, options.baseUrl) : resolveUri(uri, options.baseUrl);
    if (!result) throw new Error(`COLLADA dependency ${uri} could not be resolved`);
    if (result.length > maxBytes) throw new RangeError("COLLADA dependency URI exceeds maxBytes");
    dependencies.add(result);
    return result;
  };
  const localRef = (uri: string | undefined, label: string): Element | undefined => {
    if (!uri) throw new Error(`COLLADA ${label} reference is missing`);
    if (!uri.startsWith("#")) {
      resolve(uri.split("#", 1)[0]!);
      diagnostics.add(`unsupported-external-${label}`);
      return undefined;
    }
    const found = byId.get(uri.slice(1));
    if (!found) throw new Error(`COLLADA ${label} references missing ${uri}`);
    return found;
  };
  const unit = child(child(root, "asset"), "unit")?.attributes.meter;
  const unitMeter = unit === undefined ? 1 : finite(unit, "unit meter");
  if (!(unitMeter > 0)) throw new RangeError("COLLADA unit meter must be positive");
  const up = child(child(root, "asset"), "up_axis")?.text.trim() || "Y_UP";
  if (up !== "X_UP" && up !== "Y_UP" && up !== "Z_UP") throw new Error(`COLLADA unsupported up axis ${up}`);
  const upAxis = up;

  const builder = new BinaryBuilder();
  const images: { uri: string }[] = [];
  const textures: { source: number }[] = [];
  const materials: Material[] = [];
  const materialById = new Map<string, number>();
  const imageById = new Map<string, number>();
  for (const image of descendants(child(root, "library_images"), "image")) {
    const init = child(image, "init_from")?.text.trim();
    if (!image.attributes.id || !init) continue;
    const uri = resolve(init);
    imageById.set(image.attributes.id, images.length);
    images.push({ uri });
  }
  for (const material of descendants(child(root, "library_materials"), "material")) {
    const id = material.attributes.id;
    if (!id) continue;
    const effect = localRef(child(material, "instance_effect")?.attributes.url, "effect");
    if (!effect) continue;
    const profile = child(effect, "profile_COMMON");
    const technique = child(profile, "technique");
    const shader = technique?.children.find((entry) => ["lambert", "phong", "blinn", "constant"].includes(entry.name));
    if (!shader) { diagnostics.add("unsupported-material-profile"); continue; }
    const diffuse = child(shader, "diffuse");
    const color = child(diffuse, "color");
    const factor = color ? floatList(color.text, "diffuse color") : [1, 1, 1, 1];
    if (factor.length < 3 || factor.length > 4) throw new Error("COLLADA diffuse color requires three or four values");
    if (factor.some((component) => component < 0 || component > 1)) throw new RangeError("COLLADA diffuse color must be in the range [0, 1]");
    const alpha = factor[3] ?? 1;
    const shininess = child(child(shader, "shininess"), "float");
    const exponent = shininess ? finite(shininess.text.trim(), "shininess") : 0;
    const out: Material = {
      name: material.attributes.name ?? id,
      pbrMetallicRoughness: { baseColorFactor: [factor[0]!, factor[1]!, factor[2]!, alpha], metallicFactor: 0, roughnessFactor: Math.sqrt(2 / (Math.max(0, exponent) + 2)) },
      ...(alpha < 1 ? { alphaMode: "BLEND" } : {})
    };
    const texture = child(diffuse, "texture");
    if (texture) {
      const sampler = children(profile, "newparam").find((element) => element.attributes.sid === texture.attributes.texture);
      const surfaceSid = child(child(sampler, "sampler2D"), "source")?.text.trim();
      const surface = children(profile, "newparam").find((element) => element.attributes.sid === surfaceSid);
      const imageId = child(child(surface, "surface"), "init_from")?.text.trim();
      const imageIndex = imageId === undefined ? undefined : imageById.get(imageId);
      if (imageIndex === undefined) throw new Error(`COLLADA material ${id} refers to a missing image`);
      out.pbrMetallicRoughness.baseColorTexture = { index: textures.length };
      textures.push({ source: imageIndex });
      if (texture.attributes.texcoord && texture.attributes.texcoord !== "TEXCOORD0" && texture.attributes.texcoord !== "UVSET0") diagnostics.add("material-texcoord-binding-approximated");
    }
    if (child(shader, "transparent") || child(shader, "transparency")) diagnostics.add("unsupported-material-transparency-model");
    if (shader.name === "constant") diagnostics.add("constant-material-approximated");
    materialById.set(id, materials.length);
    materials.push(out);
  }

  const meshes: MeshOut[] = [];
  const nodes: NodeOut[] = [];
  const addNode = (node: NodeOut): number => {
    if (nodes.length >= MAX_OUTPUT_NODES) throw new RangeError("COLLADA expanded node count exceeds limit");
    nodes.push(node);
    return nodes.length - 1;
  };
  const meshCache = new Map<string, number>();
  const skins: Array<{ joints: number[]; inverseBindMatrices: number }> = [];
  const pendingSkins: Array<{ node: NodeOut; skin: SkinData }> = [];
  const nodeByAlias = new Map<string, number>();
  const nodeElements = new Map<number, Element>();
  let expandedVertexCount = 0;
  const buildMesh = (geometry: Element, instance: Element, skin?: SkinData): number => {
    const bindings = new Map<string, number>();
    for (const binding of descendants(child(instance, "bind_material"), "instance_material")) {
      const target = binding.attributes.target;
      const symbol = binding.attributes.symbol;
      if (!target || !symbol) throw new Error("COLLADA material binding requires symbol and target");
      if (!target.startsWith("#")) { localRef(target, "material"); continue; }
      const index = materialById.get(target.slice(1));
      if (index === undefined) throw new Error(`COLLADA material binding references missing ${target}`);
      bindings.set(symbol, index);
    }
    const cacheKey = `${geometry.attributes.id ?? ""}|${skin?.id ?? ""}|${JSON.stringify([...bindings])}`;
    const existing = meshCache.get(cacheKey);
    if (existing !== undefined) return existing;
    const mesh = child(geometry, "mesh");
    if (!mesh) throw new Error("COLLADA geometry is missing mesh data");
    const sources = sourceMap(mesh, byId);
    const vertices = new Map<string, Map<string, string>>();
    for (const vertex of children(mesh, "vertices")) {
      if (!vertex.attributes.id) throw new Error("COLLADA vertices requires an id");
      const map = new Map<string, string>();
      for (const input of children(vertex, "input")) if (input.attributes.semantic && input.attributes.source) map.set(input.attributes.semantic, input.attributes.source);
      vertices.set(vertex.attributes.id, map);
    }
    const primitives: PrimitiveOut[] = [];
    for (const primitive of mesh.children) {
      if (!["triangles", "polylist", "polygons"].includes(primitive.name)) {
        if (["lines", "linestrips", "trifans", "tristrips", "spline"].includes(primitive.name)) diagnostics.add(`unsupported-geometry-${primitive.name}`);
        continue;
      }
      const inputs = children(primitive, "input").map((input) => ({
        semantic: input.attributes.semantic ?? "", source: input.attributes.source ?? "",
        offset: nonNegativeInteger(input.attributes.offset ?? "0", "input offset"),
        set: nonNegativeInteger(input.attributes.set ?? "0", "input set")
      }));
      if (!inputs.length) throw new Error("COLLADA primitive requires inputs");
      const stride = Math.max(...inputs.map((input) => input.offset)) + 1;
      if (stride > 64) throw new RangeError("COLLADA primitive input stride exceeds limit");
      const positionInput = inputs.find((input) => input.semantic === "VERTEX" || input.semantic === "POSITION");
      if (!positionInput) throw new Error("COLLADA primitive has no position input");
      const positionUri = positionInput.semantic === "VERTEX" ? vertices.get(stripHash(positionInput.source, "vertices"))?.get("POSITION") : positionInput.source;
      if (!positionUri) throw new Error("COLLADA vertices has no POSITION source");
      const position = requireSource(sources, positionUri);
      const vertexAttributes = positionInput.semantic === "VERTEX" ? vertices.get(stripHash(positionInput.source, "vertices")) : undefined;
      const normalInput = inputs.find((input) => input.semantic === "NORMAL") ?? (vertexAttributes?.get("NORMAL") ? { semantic: "NORMAL", source: vertexAttributes.get("NORMAL")!, offset: positionInput.offset, set: 0 } : undefined);
      const uvInput = inputs.find((input) => input.semantic === "TEXCOORD" && input.set === 0) ?? (vertexAttributes?.get("TEXCOORD") ? { semantic: "TEXCOORD", source: vertexAttributes.get("TEXCOORD")!, offset: positionInput.offset, set: 0 } : undefined);
      const normal = normalInput ? requireSource(sources, normalInput.source) : undefined;
      const uv = uvInput ? requireSource(sources, uvInput.source) : undefined;
      if ([...(vertexAttributes?.keys() ?? [])].some((semantic) => !["POSITION", "NORMAL", "TEXCOORD"].includes(semantic))) diagnostics.add("unsupported-geometry-attribute");
      if (inputs.some((input) => !["VERTEX", "POSITION", "NORMAL", "TEXCOORD"].includes(input.semantic) || (input.semantic === "TEXCOORD" && input.set > 0))) diagnostics.add("unsupported-geometry-attribute");
      const cornerArrays = children(primitive, "p").map((p) => integerList(p.text, "primitive indices"));
      const corners: number[][] = [];
      for (const array of cornerArrays) {
        if (array.length % stride) throw new Error("COLLADA primitive index length is not a multiple of stride");
        if (corners.length + array.length / stride > maxVertices) throw new RangeError("COLLADA primitive vertices exceed maxVertices");
        for (let i = 0; i < array.length; i += stride) corners.push(array.slice(i, i + stride));
      }
      const groups: number[] = [];
      if (primitive.name === "triangles") {
        if (corners.length % 3) throw new Error("COLLADA triangles index count is not divisible by three");
        for (let i = 0; i < corners.length; i += 3) groups.push(3);
      } else if (primitive.name === "polylist") {
        const vcount = child(primitive, "vcount");
        if (!vcount) throw new Error("COLLADA polylist is missing vcount");
        groups.push(...integerList(vcount.text, "polygon vertex counts"));
      } else {
        for (const array of cornerArrays) groups.push(array.length / stride);
        if (children(primitive, "ph").length) diagnostics.add("unsupported-polygon-holes");
      }
      const declared = primitive.attributes.count;
      if (declared !== undefined && nonNegativeInteger(declared, "primitive count") !== groups.length) throw new Error("COLLADA primitive count does not match indices");
      if (groups.some((count) => count < 3) || groups.reduce((a, b) => a + b, 0) !== corners.length) throw new Error("COLLADA polygon counts do not match indices");
      const projectedCount = groups.reduce((sum, count) => sum + (count - 2) * 3, 0);
      if (!Number.isSafeInteger(projectedCount) || expandedVertexCount + projectedCount > maxVertices) throw new RangeError("COLLADA expanded vertices exceed maxVertices");
      const pos: number[] = [], normals: number[] = [], texcoords: number[] = [], joints: number[] = [], weights: number[] = [];
      let first = 0;
      for (const count of groups) {
        const polygon = corners.slice(first, first + count);
        const polygonPositions = polygon.map((indices) => sourceValues(position, indices[positionInput.offset]!, 3, "position"));
        for (const triangle of triangulate(polygonPositions)) {
          for (const cornerIndex of triangle) {
            const index = first + cornerIndex;
            const indices = corners[index]!;
            const vertexIndex = indices[positionInput.offset]!;
            pos.push(...sourceValues(position, vertexIndex, 3, "position"));
            if (skin) {
              const influence = skin.influences[vertexIndex];
              if (!influence) throw new Error("COLLADA skin weights do not cover all vertices");
              joints.push(...influence.joints); weights.push(...influence.weights);
            }
            if (normal && normalInput) normals.push(...sourceValues(normal, indices[normalInput.offset]!, 3, "normal"));
            if (uv && uvInput) texcoords.push(...sourceValues(uv, indices[uvInput.offset]!, 2, "texcoord"));
          }
        }
        first += count;
      }
      expandedVertexCount += pos.length / 3;
      if (expandedVertexCount > maxVertices) throw new RangeError("COLLADA expanded vertices exceed maxVertices");
      if (!pos.length) continue;
      const attributes: Record<string, number> = { POSITION: builder.floats(pos, "VEC3") };
      if (normals.length) attributes.NORMAL = builder.floats(normals, "VEC3");
      if (texcoords.length) attributes.TEXCOORD_0 = builder.floats(texcoords, "VEC2");
      if (skin) { attributes.JOINTS_0 = builder.unsignedShorts(joints, "VEC4"); attributes.WEIGHTS_0 = builder.floats(weights, "VEC4"); }
      const mat = primitive.attributes.material;
      const material = mat ? bindings.get(mat) : undefined;
      if (mat && material === undefined) diagnostics.add(`unbound-material:${mat}`);
      primitives.push({ attributes, ...(material !== undefined ? { material } : {}) });
    }
    if (!primitives.length) throw new Error("COLLADA geometry has no supported primitives");
    const index = meshes.length;
    meshes.push({ name: geometry.attributes.name ?? geometry.attributes.id, primitives });
    meshCache.set(cacheKey, index);
    return index;
  };

  const cameras: Array<Record<string, unknown>> = [];
  const cameraById = new Map<string, number>();
  for (const camera of descendants(child(root, "library_cameras"), "camera")) {
    const optics = child(child(camera, "optics"), "technique_common");
    const perspective = child(optics, "perspective");
    const ortho = child(optics, "orthographic");
    if (!perspective && !ortho) { diagnostics.add("unsupported-camera-projection"); continue; }
    const projection = perspective ?? ortho!;
    const scalar = (key: string, fallback?: number): number => {
      const value = child(projection, key)?.text.trim();
      if (!value && fallback === undefined) throw new Error(`COLLADA camera missing ${key}`);
      return value ? finite(value, `camera ${key}`) : fallback!;
    };
    const near = scalar("znear") * unitMeter, far = scalar("zfar") * unitMeter;
    if (near <= 0 || far <= near) throw new Error("COLLADA camera clipping range is invalid");
    let out: Record<string, unknown>;
    if (perspective) {
      const aspect = scalar("aspect_ratio", 1);
      const yfovText = child(projection, "yfov")?.text.trim();
      const xfovText = child(projection, "xfov")?.text.trim();
      const yfov = yfovText ? finite(yfovText, "camera yfov") * Math.PI / 180 : xfovText ? 2 * Math.atan(Math.tan(finite(xfovText, "camera xfov") * Math.PI / 360) / aspect) : NaN;
      if (!(aspect > 0) || !(yfov > 0 && yfov < Math.PI)) throw new Error("COLLADA camera field of view is invalid");
      out = { type: "perspective", perspective: { yfov, aspectRatio: aspect, znear: near, zfar: far } };
    } else {
      const aspect = scalar("aspect_ratio", 1);
      const x = child(projection, "xmag")?.text.trim(), y = child(projection, "ymag")?.text.trim();
      const xmag = x ? finite(x, "camera xmag") * unitMeter : y ? finite(y, "camera ymag") * aspect * unitMeter : NaN;
      const ymag = y ? finite(y, "camera ymag") * unitMeter : xmag / aspect;
      if (!(xmag > 0 && ymag > 0)) throw new Error("COLLADA orthographic magnification is invalid");
      out = { type: "orthographic", orthographic: { xmag, ymag, znear: near, zfar: far } };
    }
    if (camera.attributes.id) cameraById.set(camera.attributes.id, cameras.length);
    cameras.push({ name: camera.attributes.name ?? camera.attributes.id, ...out });
  }
  const lights: Array<Record<string, unknown>> = [];
  const lightById = new Map<string, number>();
  for (const light of descendants(child(root, "library_lights"), "light")) {
    const common = child(light, "technique_common");
    const source = common?.children.find((entry) => ["directional", "point", "spot"].includes(entry.name));
    if (!source) { diagnostics.add("unsupported-light-type"); continue; }
    const rawColor = child(source, "color")?.text.trim();
    const color = rawColor ? floatList(rawColor, "light color") : [1, 1, 1];
    if (color.length !== 3 || color.some((component) => component < 0)) throw new Error("COLLADA light color must be three non-negative values");
    const out: Record<string, unknown> = { name: light.attributes.name ?? light.attributes.id, type: source.name, color, intensity: 1 };
    if (source.name === "spot") {
      const rawAngle = child(source, "falloff_angle")?.text.trim();
      const angle = rawAngle ? finite(rawAngle, "spot falloff angle") * Math.PI / 360 : Math.PI / 4;
      if (!(angle > 0 && angle <= Math.PI / 2)) throw new Error("COLLADA spot falloff angle is invalid");
      out.spot = { innerConeAngle: 0, outerConeAngle: angle };
      if (child(source, "falloff_exponent")) diagnostics.add("light-falloff-exponent-approximated");
    }
    if (child(source, "constant_attenuation") || child(source, "linear_attenuation") || child(source, "quadratic_attenuation")) diagnostics.add("light-attenuation-approximated");
    if (light.attributes.id) lightById.set(light.attributes.id, lights.length);
    lights.push(out);
  }
  const sceneInstance = child(child(root, "scene"), "instance_visual_scene");
  const visualScene = sceneInstance ? localRef(sceneInstance.attributes.url, "visual-scene") : children(child(root, "library_visual_scenes"), "visual_scene")[0];
  if (!visualScene || visualScene.name !== "visual_scene") throw new Error("COLLADA visual scene is required");
  const active = new Set<Element>();
  const buildNode = (entry: Element, depth: number): number => {
    if (depth > MAX_DEPTH || active.has(entry)) throw new Error("COLLADA cyclic or excessively deep node hierarchy");
    active.add(entry);
    const transform = nodeMatrix(entry, diagnostics);
    const out: NodeOut & { camera?: number } = { name: entry.attributes.name ?? entry.attributes.id ?? entry.attributes.sid, matrix: transform };
    const index = addNode(out);
    nodeElements.set(index, entry);
    for (const alias of [entry.attributes.id, entry.attributes.sid, entry.attributes.name]) {
      if (alias && !nodeByAlias.has(alias)) nodeByAlias.set(alias, index);
    }
    const childIndices: number[] = [];
    for (const item of entry.children) {
      if (item.name === "node") childIndices.push(buildNode(item, depth + 1));
      else if (item.name === "instance_node") {
        const target = localRef(item.attributes.url, "node");
        if (target) {
          if (target.name !== "node") throw new Error("COLLADA instance_node must reference a node");
          childIndices.push(buildNode(target, depth + 1));
        }
      } else if (item.name === "instance_geometry") {
        const target = localRef(item.attributes.url, "geometry");
        if (!target) continue;
        if (target.name !== "geometry") throw new Error("COLLADA instance_geometry must reference geometry");
        const mesh = buildMesh(target, item);
        if (out.mesh === undefined) out.mesh = mesh;
        else childIndices.push(addNode({ name: target.attributes.name ?? target.attributes.id, mesh }));
      } else if (item.name === "instance_camera") {
        const target = localRef(item.attributes.url, "camera");
        if (!target) continue;
        const camera = cameraById.get(target.attributes.id ?? "");
        if (camera === undefined) diagnostics.add("unsupported-camera-instance");
        else if (out.camera === undefined) out.camera = camera;
        else childIndices.push(addNode({ camera } as NodeOut));
      } else if (item.name === "instance_controller") {
        const controller = localRef(item.attributes.url, "controller");
        if (!controller) continue;
        const skinElement = child(controller, "skin");
        if (!skinElement) { diagnostics.add("unsupported-morph-controller"); continue; }
        const geometry = localRef(skinElement.attributes.source, "geometry");
        if (!geometry) continue;
        const skin = parseSkin(controller, skinElement, byId, diagnostics);
        const mesh = buildMesh(geometry, item, skin);
        if (out.mesh === undefined) { out.mesh = mesh; pendingSkins.push({ node: out, skin }); }
        else { const extra: NodeOut = { name: controller.attributes.name ?? controller.attributes.id, mesh }; childIndices.push(addNode(extra)); pendingSkins.push({ node: extra, skin }); }
      } else if (item.name === "instance_light") {
        const target = localRef(item.attributes.url, "light");
        if (!target) continue;
        const light = lightById.get(target.attributes.id ?? "");
        if (light === undefined) { diagnostics.add("unsupported-light-instance"); continue; }
        const node: NodeOut & { extensions: Record<string, unknown> } = { name: target.attributes.name ?? target.attributes.id, extensions: { KHR_lights_punctual: { light } } };
        childIndices.push(addNode(node));
      }
    }
    if (childIndices.length) out.children = childIndices;
    active.delete(entry);
    return index;
  };
  const sceneChildren = children(visualScene, "node").map((node) => buildNode(node, 0));
  for (const pending of pendingSkins) {
    const joints = pending.skin.joints.map((joint) => {
      const index = nodeByAlias.get(joint);
      if (index === undefined) throw new Error(`COLLADA skin joint ${joint} is missing from visual scene`);
      return index;
    });
    pending.node.skin = skins.length;
    skins.push({ joints, inverseBindMatrices: builder.floats(pending.skin.inverseBind, "MAT4") });
  }
  const animations = buildAnimations(root, byId, nodes, nodeByAlias, nodeElements, builder, diagnostics);
  if (child(root, "library_animation_clips")) diagnostics.add("animation-clips-combined");
  if (descendants(child(root, "library_controllers"), "morph").length) diagnostics.add("unsupported-morph-controller");
  const rootNode = addNode({ name: "COLLADA coordinates", matrix: conversionMatrix(unitMeter, upAxis), children: sceneChildren });
  const bytes = builder.finish();
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D COLLADA importer" },
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(bytes)}`, byteLength: bytes.byteLength }],
    bufferViews: builder.views, accessors: builder.accessors,
    meshes, materials, images, textures, cameras, nodes, skins, animations,
    ...(lights.length ? { extensionsUsed: ["KHR_lights_punctual"], extensions: { KHR_lights_punctual: { lights } } } : {}),
    scenes: [{ name: visualScene.attributes.name ?? visualScene.attributes.id, nodes: [rootNode] }], scene: 0
  } as unknown as GLTFJson;
  return { gltf, gltfUrl: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`, dependencies: [...dependencies], diagnostics: [...diagnostics].sort(), unitMeter, upAxis };
}

/** Opt-in AssetManager loader. The returned GLTFAsset owns its resources and is
 * disposed through GLTFLoader; diagnostics identify unsupported COLLADA data. */
export class ColladaLoader implements AssetLoader<GLTFAsset> {
  readonly type = "collada";
  private readonly inner = new GLTFLoader();
  private readonly wrapped = new WeakMap<GLTFAsset, GLTFAsset>();
  constructor(private readonly options: ColladaImportOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return request.type === "collada" || request.type === "dae" || /\.dae(?:[?#]|$)/i.test(request.url) || /^data:(?:model|application)\/vnd\.collada\+xml(?:[;,])/i.test(request.url); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    context.throwIfAborted(request.url);
    const settings = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const maxBytes = Math.min(boundedLimit(this.options.maxBytes, MAX_DOCUMENT_BYTES, "maxBytes"), settings.maxBytes ?? MAX_DOCUMENT_BYTES);
    const bytes = await fetchBytes(request.url, context.signalFor(request.signal), (progress) => request.onProgress?.({ url: request.url, phase: "document", loadedBytes: progress.loaded, totalBytes: progress.total }), { ...settings, maxBytes });
    context.throwIfAborted(request.url);
    return this.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), { ...this.options, baseUrl: request.url }, context, request);
  }
  async parse(source: string, options: ColladaImportOptions = {}, context?: LoadContext, request?: AssetLoadRequest): Promise<GLTFAsset> {
    if (!context) {
      const { LoadContext: Context } = await import("../LoadContext");
      context = new Context();
    }
    const expanded = await expandExternalDocuments(source, options, context, request);
    let parsed = parseCollada(expanded.source, {
      ...options,
      resolveDependency: (uri, base) => expanded.resolved.has(uri)
        ? uri
        : options.resolveDependency ? options.resolveDependency(uri, base) : resolveUri(uri, base)
    });
    // Resolve and verify images before handing the generated document to the
    // glTF runtime; a data-URI document cannot safely inherit a network base.
    const imageUris = [...new Set((parsed.gltf.images ?? []).map((image) => image.uri).filter((uri): uri is string => !!uri))];
    if (imageUris.length) {
      const originUrl = request?.url ?? options.baseUrl;
      if (!originUrl && imageUris.some((uri) => !uri.startsWith("data:"))) throw new Error("COLLADA external images require a source URL");
      const dependencyContext = originUrl ? context.child(originUrl, undefined, mergeAssetRequestOptions(context.requestOptionsFor(originUrl), request)) : context;
      const embedded = new Map<string, string>();
      let totalBytes = 0, totalPixels = 0;
      for (const uri of imageUris) {
        // Data URIs are part of the already verified containing document (or
        // are archive entries supplied by its resolver), not network requests.
        const dependencyOptions = uri.startsWith("data:") ? {} : dependencyContext.requestOptionsFor(uri);
        const limit = Math.min(dependencyOptions.maxBytes ?? MAX_DOCUMENT_BYTES, MAX_DOCUMENT_BYTES - totalBytes);
        if (limit <= 0) throw new RangeError("COLLADA image dependencies exceed byte limit");
        const bytes = uri.startsWith("data:") ? decodeImageDataUri(uri, limit) : new Uint8Array(await fetchBytes(uri, dependencyContext.signalFor(request?.signal), undefined, { ...dependencyOptions, maxBytes: limit }));
        totalBytes += bytes.byteLength;
        const image = imageInfo(bytes);
        if (uri.startsWith("data:") && !uri.toLowerCase().startsWith(`data:${image.mime}`)) throw new Error("COLLADA image data URI MIME does not match bytes");
        totalPixels += image.pixels;
        if (totalPixels > 16_777_216) throw new RangeError("COLLADA images exceed total pixel limit");
        embedded.set(uri, `data:${image.mime};base64,${base64(bytes)}`);
      }
      const gltf = { ...parsed.gltf, images: (parsed.gltf.images ?? []).map((image) => ({ ...image, uri: image.uri ? embedded.get(image.uri) ?? image.uri : undefined })) };
      parsed = { ...parsed, gltf, gltfUrl: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}` };
    }
    // The synthetic glTF and its buffers are derived only from verified input;
    // do not apply the COLLADA document's digest to those different bytes.
    const { LoadContext: Context } = await import("../LoadContext");
    const syntheticContext = new Context({ signal: context.signalFor(request?.signal) });
    const asset = await this.inner.load({ url: parsed.gltfUrl, type: "gltf", signal: syntheticContext.signal }, syntheticContext);
    const loaderDiagnostics = { ...asset.loaderDiagnostics, features: [...asset.loaderDiagnostics.features, "collada-native-import"], unsupportedFeatures: [...asset.loaderDiagnostics.unsupportedFeatures, ...parsed.diagnostics] };
    const wrapper: GLTFAsset = {
      ...asset,
      url: request?.url ?? options.baseUrl ?? "collada:inline",
      get disposed() { return asset.disposed; }, loaderDiagnostics,
      createScene: (opts) => asset.createScene(opts),
      toJSON: () => ({ ...asset.toJSON(), url: request?.url ?? options.baseUrl ?? "collada:inline", loaderDiagnostics })
    };
    this.wrapped.set(wrapper, asset);
    return wrapper;
  }
  dispose(asset: GLTFAsset): void { this.inner.dispose(this.wrapped.get(asset) ?? asset); }
}

function boundedLimit(value: number | undefined, maximum: number, label: string): number {
  const limit = value ?? maximum;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) throw new RangeError(`COLLADA ${label} must be an integer from 1 to ${maximum}`);
  return limit;
}
function resolveUri(uri: string, baseUrl?: string): string {
  if (/^(?:data:|blob:|[A-Za-z][\w+.-]*:)/.test(uri)) return uri;
  if (!baseUrl || baseUrl.startsWith("data:")) throw new Error(`COLLADA dependency ${uri} requires a baseUrl or resolveDependency`);
  try { return new URL(uri, baseUrl).toString(); } catch {
    // Preserve browser-relative requests when the source document itself was
    // supplied as a relative path. Use URL's path normalization, never the
    // placeholder origin in a returned dependency.
    try {
      const marker = "https://aura3d.invalid";
      const resolved = new URL(uri, new URL(baseUrl, `${marker}/`));
      if (resolved.origin !== marker) return resolved.toString();
      return `${baseUrl.startsWith("/") ? resolved.pathname : resolved.pathname.slice(1)}${resolved.search}${resolved.hash}`;
    } catch { throw new Error(`COLLADA dependency ${uri} has invalid base URL`); }
  }
}
function child(element: Element | undefined, name: string): Element | undefined { return element?.children.find((entry) => entry.name === name); }
function children(element: Element | undefined, name: string): Element[] { return element?.children.filter((entry) => entry.name === name) ?? []; }
function descendants(element: Element | undefined, name?: string): Element[] {
  if (!element) return [];
  const out: Element[] = [], stack = [element];
  while (stack.length) {
    const current = stack.pop()!;
    if (!name || current.name === name) out.push(current);
    for (let i = current.children.length - 1; i >= 0; i--) stack.push(current.children[i]!);
  }
  return out;
}
function finite(value: string, label: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new Error(`COLLADA ${label} must be numeric`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`COLLADA ${label} must be finite`);
  return result;
}
function nonNegativeInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`COLLADA ${label} must be a non-negative integer`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`COLLADA ${label} exceeds integer limit`);
  return result;
}
function tokens(value: string): string[] {
  const result: string[] = [];
  const pattern = /\S+/g;
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    if (result.length >= MAX_SCALARS) throw new RangeError("COLLADA scalar count exceeds limit");
    result.push(match[0]);
  }
  return result;
}
function floatList(value: string, label: string): number[] { return tokens(value).map((part) => finite(part, label)); }
function integerList(value: string, label: string): number[] { return tokens(value).map((part) => nonNegativeInteger(part, label)); }
function stripHash(uri: string, label: string): string { if (!uri.startsWith("#") || uri.length === 1) throw new Error(`COLLADA ${label} must be a local reference`); return uri.slice(1); }
function sourceMap(container: Element, byId: ReadonlyMap<string, Element>): Map<string, Source> {
  const map = new Map<string, Source>();
  for (const source of children(container, "source")) {
    const id = source.attributes.id;
    if (!id) throw new Error("COLLADA source requires id");
    const accessor = child(child(source, "technique_common"), "accessor");
    if (!accessor) throw new Error(`COLLADA source ${id} requires accessor`);
    const array = byId.get(stripHash(accessor.attributes.source ?? "", "accessor source"));
    if (!array || !["float_array", "Name_array", "IDREF_array"].includes(array.name)) throw new Error(`COLLADA source ${id} requires a supported array`);
    const values = tokens(array.text);
    if (array.attributes.count !== undefined && nonNegativeInteger(array.attributes.count, "array count") !== values.length) throw new Error(`COLLADA source ${id} array count mismatch`);
    const count = nonNegativeInteger(accessor.attributes.count ?? "", "accessor count");
    const stride = nonNegativeInteger(accessor.attributes.stride ?? "1", "accessor stride");
    const offset = nonNegativeInteger(accessor.attributes.offset ?? "0", "accessor offset");
    if (stride < 1 || stride > 64 || offset + count * stride > values.length) throw new Error(`COLLADA source ${id} accessor exceeds array`);
    map.set(id, { values, count, stride, offset });
  }
  return map;
}
function requireSource(sources: ReadonlyMap<string, Source>, uri: string): Source {
  const value = sources.get(stripHash(uri, "geometry source"));
  if (!value) throw new Error(`COLLADA missing source ${uri}`);
  return value;
}
function sourceValues(source: Source, index: number, width: number, label: string): number[] {
  if (!Number.isSafeInteger(index) || index < 0 || index >= source.count || source.stride < width) throw new RangeError(`COLLADA ${label} source index is out of range`);
  return source.values.slice(source.offset + index * source.stride, source.offset + index * source.stride + width).map((part) => finite(part, label));
}

function identity(): number[] { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
/** Column-major 4x4 multiplication. */
function multiply(a: number[], b: number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[col * 4 + row]! += a[k * 4 + row]! * b[col * 4 + k]!;
  return result;
}
function nodeMatrix(node: Element, diagnostics: Set<string>): number[] {
  let matrix = identity();
  for (const entry of node.children) {
    const op = entry.name;
    if (!["matrix", "translate", "rotate", "scale", "lookat", "skew"].includes(op)) continue;
    if (op === "lookat" || op === "skew") { diagnostics.add(`unsupported-transform-${op}`); continue; }
    const values = floatList(entry.text, `${op} transform`);
    let t = identity();
    if (op === "matrix") {
      if (values.length !== 16) throw new Error("COLLADA matrix requires 16 numbers");
      // COLLADA text matrices are row-major; glTF matrices are column-major.
      t = values.map((_, i) => values[(i % 4) * 4 + Math.floor(i / 4)]!);
    } else if (op === "translate" || op === "scale") {
      if (values.length !== 3) throw new Error(`COLLADA ${op} requires three numbers`);
      if (op === "translate") { t[12] = values[0]!; t[13] = values[1]!; t[14] = values[2]!; }
      else { t[0] = values[0]!; t[5] = values[1]!; t[10] = values[2]!; }
    } else {
      if (values.length !== 4) throw new Error("COLLADA rotate requires an axis and angle");
      const length = Math.hypot(values[0]!, values[1]!, values[2]!);
      if (length === 0) throw new Error("COLLADA rotate axis must be nonzero");
      const [x, y, z] = values.slice(0, 3).map((n) => n / length) as [number, number, number];
      const angle = values[3]! * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), v = 1 - c;
      t = [x*x*v+c, y*x*v+z*s, z*x*v-y*s, 0, x*y*v-z*s, y*y*v+c, z*y*v+x*s, 0, x*z*v+y*s, y*z*v-x*s, z*z*v+c, 0, 0, 0, 0, 1];
    }
    matrix = multiply(matrix, t);
  }
  return matrix;
}
function conversionMatrix(unit: number, up: "X_UP" | "Y_UP" | "Z_UP"): number[] {
  if (up === "Z_UP") return [unit,0,0,0, 0,0,-unit,0, 0,unit,0,0, 0,0,0,1];
  if (up === "X_UP") return [0,unit,0,0, -unit,0,0,0, 0,0,unit,0, 0,0,0,1];
  return [unit,0,0,0, 0,unit,0,0, 0,0,unit,0, 0,0,0,1];
}
class BinaryBuilder {
  readonly views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  readonly accessors: Array<Record<string, unknown>> = [];
  private readonly chunks: Uint8Array[] = [];
  private length = 0;
  floats(values: number[], type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4"): number {
    const width = type === "SCALAR" ? 1 : type === "VEC2" ? 2 : type === "VEC3" ? 3 : type === "VEC4" ? 4 : 16;
    if (values.length % width) throw new Error("COLLADA accessor width mismatch");
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(Math.fround(values[i]!))) throw new RangeError("COLLADA value exceeds float32 range");
      view.setFloat32(i * 4, values[i]!, true);
    }
    const bufferView = this.views.length;
    this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.length });
    this.chunks.push(bytes); this.length += bytes.length;
    const result = this.accessors.length;
    this.accessors.push({ bufferView, componentType: 5126, count: values.length / width, type });
    return result;
  }
  unsignedShorts(values: number[], type: "VEC4"): number {
    if (values.length % 4 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 65535)) throw new Error("COLLADA joint indices are invalid");
    const bytes = new Uint8Array(values.length * 2), view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) view.setUint16(i * 2, values[i]!, true);
    const bufferView = this.views.length;
    this.views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.length });
    this.chunks.push(bytes); this.length += bytes.length;
    const result = this.accessors.length;
    this.accessors.push({ bufferView, componentType: 5123, count: values.length / 4, type });
    return result;
  }
  finish(): Uint8Array {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }
}
function base64(bytes: Uint8Array): string {
  let value = "";
  for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(value);
}
function parseXml(input: string): Element {
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw new Error("COLLADA XML declarations and entities are not permitted");
  const stack: Array<{ raw: string; element: Element }> = [];
  let root: Element | undefined, offset = 0, count = 0;
  const appendText = (text: string): void => {
    if (!stack.length) { if (text.trim()) throw new Error("COLLADA XML text outside root"); return; }
    stack[stack.length - 1]!.element.text += decodeEntities(text);
  };
  while (offset < input.length) {
    const open = input.indexOf("<", offset);
    if (open === -1) { appendText(input.slice(offset)); offset = input.length; break; }
    appendText(input.slice(offset, open));
    if (input.startsWith("<!--", open)) {
      const end = input.indexOf("-->", open + 4); if (end < 0) throw new Error("COLLADA unterminated XML comment");
      offset = end + 3; continue;
    }
    if (input.startsWith("<![CDATA[", open)) {
      const end = input.indexOf("]]>", open + 9); if (end < 0 || !stack.length) throw new Error("COLLADA malformed CDATA");
      stack[stack.length - 1]!.element.text += input.slice(open + 9, end); offset = end + 3; continue;
    }
    if (input.startsWith("<?", open)) {
      const end = input.indexOf("?>", open + 2); if (end < 0) throw new Error("COLLADA unterminated XML instruction");
      offset = end + 2; continue;
    }
    let end = open + 1, quote = "";
    for (; end < input.length; end++) {
      const char = input[end]!;
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end >= input.length || quote) throw new Error("COLLADA unterminated XML tag");
    let tag = input.slice(open + 1, end).trim(); offset = end + 1;
    if (tag.startsWith("!")) throw new Error("COLLADA unsupported XML declaration");
    if (tag.startsWith("/")) {
      const closing = tag.slice(1).trim();
      if (!stack.length || stack[stack.length - 1]!.raw !== closing) throw new Error(`COLLADA mismatched XML closing tag ${closing}`);
      stack.pop(); continue;
    }
    const selfClosing = tag.endsWith("/"); if (selfClosing) tag = tag.slice(0, -1).trimEnd();
    const name = /^[A-Za-z_][\w.:-]*/.exec(tag)?.[0];
    if (!name) throw new Error("COLLADA malformed XML tag name");
    const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
    let rest = tag.slice(name.length);
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/.exec(rest);
      if (!attr) throw new Error(`COLLADA malformed XML attributes on ${name}`);
      const key = attr[1]!.split(":").pop()!;
      if (Object.hasOwn(attributes, key)) throw new Error(`COLLADA duplicate XML attribute ${key}`);
      attributes[key] = decodeEntities(attr[3]!); rest = rest.slice(attr[0].length);
    }
    const element: Element = { name: name.split(":").pop()!, attributes, children: [], text: "" };
    if (++count > MAX_ELEMENTS || stack.length >= MAX_DEPTH) throw new RangeError("COLLADA XML complexity exceeds limit");
    if (stack.length) stack[stack.length - 1]!.element.children.push(element);
    else { if (root) throw new Error("COLLADA XML has multiple roots"); root = element; }
    if (!selfClosing) stack.push({ raw: name, element });
  }
  if (stack.length || !root) throw new Error("COLLADA XML is incomplete");
  return root;
}
function decodeEntities(value: string): string {
  return value.replace(/&([^;\s<]+);|&/g, (whole, entity: string | undefined) => {
    if (!entity) throw new Error("COLLADA invalid XML entity");
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (named[entity] !== undefined) return named[entity]!;
    const match = /^#(?:x([0-9a-f]+)|([0-9]+))$/i.exec(entity);
    const number = match ? Number.parseInt(match[1] ?? match[2]!, match[1] ? 16 : 10) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) throw new Error(`COLLADA invalid XML entity ${whole}`);
    return String.fromCodePoint(number);
  });
}

function parseSkin(controller: Element, skin: Element, byId: ReadonlyMap<string, Element>, diagnostics: Set<string>): SkinData {
  const shape = child(skin, "bind_shape_matrix");
  let shapeMatrix = identity();
  if (shape) {
    const values = floatList(shape.text, "bind shape matrix");
    if (values.length !== 16) throw new Error("COLLADA bind shape matrix requires 16 values");
    shapeMatrix = values.map((_, i) => values[(i % 4) * 4 + Math.floor(i / 4)]!);
  }
  const sources = sourceMap(skin, byId);
  const jointsNode = child(skin, "joints"), weightsNode = child(skin, "vertex_weights");
  const jointInput = children(jointsNode, "input").find((input) => input.attributes.semantic === "JOINT");
  const inverseInput = children(jointsNode, "input").find((input) => input.attributes.semantic === "INV_BIND_MATRIX");
  if (!jointInput || !inverseInput || !weightsNode) throw new Error("COLLADA skin requires joints, inverse bind matrices and vertex weights");
  const jointSource = requireSource(sources, jointInput.attributes.source ?? "");
  const inverse = requireSource(sources, inverseInput.attributes.source ?? "");
  if (!jointSource.count || jointSource.count > 65535 || jointSource.count !== inverse.count) throw new Error("COLLADA skin joint and inverse bind counts do not match");
  const joints = Array.from({ length: jointSource.count }, (_, i) => jointSource.values[jointSource.offset + i * jointSource.stride]!);
  if (new Set(joints).size !== joints.length || joints.some((joint) => !joint)) throw new Error("COLLADA skin joint names are empty or duplicated");
  const inverseBind: number[] = [];
  for (let i = 0; i < inverse.count; i++) {
    const matrix = sourceValues(inverse, i, 16, "inverse bind matrix");
    const transposed = matrix.map((_, j) => matrix[(j % 4) * 4 + Math.floor(j / 4)]!);
    inverseBind.push(...multiply(transposed, shapeMatrix));
  }
  const inputs = children(weightsNode, "input").map((input) => ({ semantic: input.attributes.semantic, source: input.attributes.source ?? "", offset: nonNegativeInteger(input.attributes.offset ?? "0", "weight offset") }));
  const vertexJoint = inputs.find((input) => input.semantic === "JOINT"), vertexWeight = inputs.find((input) => input.semantic === "WEIGHT");
  if (!vertexJoint || !vertexWeight) throw new Error("COLLADA vertex weights require JOINT and WEIGHT inputs");
  const jointNames = requireSource(sources, vertexJoint.source), weightValues = requireSource(sources, vertexWeight.source);
  const jointMap = new Map(joints.map((joint, i) => [joint, i]));
  const stride = Math.max(...inputs.map((input) => input.offset)) + 1;
  if (stride > 64) throw new RangeError("COLLADA vertex weight stride exceeds limit");
  const counts = integerList(child(weightsNode, "vcount")?.text ?? "", "vertex weight counts");
  if (weightsNode.attributes.count !== undefined && nonNegativeInteger(weightsNode.attributes.count, "vertex weights count") !== counts.length) throw new Error("COLLADA vertex weights count mismatch");
  if (counts.length > MAX_VERTICES) throw new RangeError("COLLADA skin vertex count exceeds limit");
  const values = integerList(child(weightsNode, "v")?.text ?? "", "vertex weight indices");
  if (counts.reduce((a, b) => a + b, 0) * stride !== values.length) throw new Error("COLLADA vertex weight indices do not match vcount");
  const influences: SkinData["influences"] = [];
  let cursor = 0;
  for (const count of counts) {
    const pairs: Array<{ joint: number; weight: number }> = [];
    for (let i = 0; i < count; i++, cursor += stride) {
      const j = values[cursor + vertexJoint.offset]!, w = values[cursor + vertexWeight.offset]!;
      if (j >= jointNames.count) throw new RangeError("COLLADA vertex joint index out of range");
      const jointName = jointNames.values[jointNames.offset + j * jointNames.stride]!;
      const joint = jointMap.get(jointName);
      if (joint === undefined) throw new Error(`COLLADA vertex weight references unknown joint ${jointName}`);
      const weight = sourceValues(weightValues, w, 1, "weight")[0]!;
      if (weight < 0) throw new Error("COLLADA skin weights cannot be negative");
      if (weight > 0) pairs.push({ joint, weight });
    }
    pairs.sort((a, b) => b.weight - a.weight);
    if (pairs.length > 4) diagnostics.add("skin-influences-truncated-to-four");
    const selected = pairs.slice(0, 4), total = selected.reduce((sum, pair) => sum + pair.weight, 0);
    if (total <= 0) throw new Error("COLLADA vertex has no nonzero skin influences");
    const jointIndices = selected.map((pair) => pair.joint), normalized = selected.map((pair) => pair.weight / total);
    while (jointIndices.length < 4) { jointIndices.push(0); normalized.push(0); }
    influences.push({ joints: jointIndices, weights: normalized });
  }
  return { id: controller.attributes.id ?? "skin", joints, inverseBind, influences };
}

interface AnimationChannel { transform: Element; component?: number; times: number[]; values: number[][]; interpolation: "LINEAR" | "STEP" }
function buildAnimations(root: Element, byId: ReadonlyMap<string, Element>, nodes: NodeOut[], nodeByAlias: ReadonlyMap<string, number>, nodeElements: ReadonlyMap<number, Element>, builder: BinaryBuilder, diagnostics: Set<string>): Array<Record<string, unknown>> {
  const library = child(root, "library_animations");
  if (!library) return [];
  const allSources = sourceMap({ name: "sources", text: "", attributes: {}, children: descendants(library, "source") }, byId);
  const grouped = new Map<number, AnimationChannel[]>();
  for (const channel of descendants(library, "channel")) {
    const target = channel.attributes.target ?? "";
    const slash = target.indexOf("/");
    if (slash < 1) { diagnostics.add("unsupported-animation-target"); continue; }
    const nodeIndex = nodeByAlias.get(target.slice(0, slash));
    if (nodeIndex === undefined) { diagnostics.add("unresolved-animation-target"); continue; }
    const node = nodeElements.get(nodeIndex)!;
    const match = /^([^.(]+)(?:\.(X|Y|Z|ANGLE))?$/.exec(target.slice(slash + 1));
    if (!match) { diagnostics.add("unsupported-animation-target"); continue; }
    const transform = node.children.find((item) => item.attributes.sid === match[1]) ?? node.children.find((item) => item.name === match[1]);
    if (!transform || !["translate", "rotate", "scale", "matrix"].includes(transform.name)) { diagnostics.add("unsupported-animation-target"); continue; }
    const sampler = byId.get(stripHash(channel.attributes.source ?? "", "animation sampler"));
    if (!sampler || sampler.name !== "sampler") throw new Error("COLLADA animation sampler is missing");
    const inputs = children(sampler, "input");
    const input = inputs.find((item) => item.attributes.semantic === "INPUT");
    const output = inputs.find((item) => item.attributes.semantic === "OUTPUT");
    const interpolationInput = inputs.find((item) => item.attributes.semantic === "INTERPOLATION");
    if (!input || !output) throw new Error("COLLADA animation sampler requires INPUT and OUTPUT");
    const timesSource = requireSource(allSources, input.attributes.source ?? "");
    const outputSource = requireSource(allSources, output.attributes.source ?? "");
    if (!timesSource.count || timesSource.count !== outputSource.count) throw new Error("COLLADA animation input/output counts do not match");
    const component = match[2] === "X" ? 0 : match[2] === "Y" ? 1 : match[2] === "Z" ? 2 : match[2] === "ANGLE" ? 3 : undefined;
    const width = component !== undefined ? 1 : transform.name === "matrix" ? 16 : transform.name === "rotate" ? 4 : 3;
    if (component !== undefined && component >= (transform.name === "rotate" ? 4 : 3)) { diagnostics.add("unsupported-animation-target"); continue; }
    const times = Array.from({ length: timesSource.count }, (_, i) => sourceValues(timesSource, i, 1, "animation time")[0]!);
    if (times.some((t, i) => t < 0 || !Number.isFinite(Math.fround(t)) || (i > 0 && Math.fround(t) <= Math.fround(times[i - 1]!)))) throw new Error("COLLADA animation times must be non-negative and strictly increasing in float32");
    const values = Array.from({ length: outputSource.count }, (_, i) => sourceValues(outputSource, i, width, "animation value"));
    const interpolationSource = interpolationInput ? requireSource(allSources, interpolationInput.attributes.source ?? "") : undefined;
    if (interpolationSource && interpolationSource.count !== times.length) throw new Error("COLLADA animation interpolation count mismatch");
    const interpolations = interpolationSource ? Array.from({ length: interpolationSource.count }, (_, i) => interpolationSource.values[interpolationSource.offset + i * interpolationSource.stride]!) : ["LINEAR"];
    if (interpolations.some((mode) => mode !== "LINEAR" && mode !== "STEP") || new Set(interpolations).size > 1) { diagnostics.add("unsupported-animation-interpolation"); continue; }
    const interpolation = interpolations[0] as "LINEAR" | "STEP";
    const list = grouped.get(nodeIndex) ?? [];
    if (list.some((other) => other.transform === transform && (other.component === undefined || component === undefined || other.component === component))) throw new Error("COLLADA animation has overlapping transform channels");
    list.push({ transform, component, times, values, interpolation });
    grouped.set(nodeIndex, list);
  }
  const samplers: Array<Record<string, unknown>> = [], channels: Array<Record<string, unknown>> = [];
  for (const [nodeIndex, tracks] of grouped) {
    if (new Set(tracks.map((track) => track.interpolation)).size > 1) { diagnostics.add("unsupported-mixed-animation-interpolation"); continue; }
    const entry = nodeElements.get(nodeIndex)!, base = decomposeMatrix(nodeMatrix(entry, diagnostics));
    if (!base) { diagnostics.add("unsupported-animation-shear"); continue; }
    const times = [...new Set(tracks.flatMap((track) => track.times))].sort((a, b) => a - b);
    if (times.length > MAX_VERTICES) throw new RangeError("COLLADA animation key count exceeds limit");
    const outputs = { translation: [] as number[], rotation: [] as number[], scale: [] as number[] };
    let valid = true;
    for (const time of times) {
      const transforms = new Map<Element, number[]>();
      for (const track of tracks) {
        let values = transforms.get(track.transform);
        if (!values) { values = floatList(track.transform.text, "animation base transform"); transforms.set(track.transform, values); }
        const sample = sampleAnimation(track, time);
        if (track.component === undefined) values.splice(0, values.length, ...sample);
        else values[track.component] = sample[0]!;
      }
      const modified: Element = { ...entry, children: entry.children.map((element) => transforms.has(element) ? { ...element, text: transforms.get(element)!.join(" ") } : element) };
      const sample = decomposeMatrix(nodeMatrix(modified, diagnostics));
      if (!sample) { valid = false; break; }
      outputs.translation.push(...sample.translation); outputs.rotation.push(...sample.rotation); outputs.scale.push(...sample.scale);
    }
    if (!valid) { diagnostics.add("unsupported-animation-shear"); continue; }
    const out = nodes[nodeIndex]!;
    delete out.matrix; out.translation = base.translation; out.rotation = base.rotation; out.scale = base.scale;
    const timeAccessor = builder.floats(times, "SCALAR");
    for (const path of ["translation", "rotation", "scale"] as const) {
      const output = builder.floats(outputs[path], path === "rotation" ? "VEC4" : "VEC3");
      const sampler = samplers.length;
      samplers.push({ input: timeAccessor, output, interpolation: tracks[0]!.interpolation });
      channels.push({ sampler, target: { node: nodeIndex, path } });
    }
    if (tracks.some((track) => track.transform.name === "matrix")) diagnostics.add("animation-matrix-interpolation-approximated");
    if (tracks.some((track) => track.transform.name === "rotate")) diagnostics.add("animation-angle-interpolation-approximated");
  }
  return channels.length ? [{ name: library.attributes.name ?? "COLLADA animation", samplers, channels }] : [];
}
function sampleAnimation(track: AnimationChannel, time: number): number[] {
  if (time <= track.times[0]!) return [...track.values[0]!];
  const last = track.times.length - 1;
  if (time >= track.times[last]!) return [...track.values[last]!];
  let hi = 1;
  while (track.times[hi]! < time) hi++;
  const lo = hi - 1;
  if (track.interpolation === "STEP") return [...track.values[time === track.times[hi] ? hi : lo]!];
  const alpha = (time - track.times[lo]!) / (track.times[hi]! - track.times[lo]!);
  return track.values[lo]!.map((value, index) => value + (track.values[hi]![index]! - value) * alpha);
}
function decomposeMatrix(m: number[]): { translation: number[]; rotation: number[]; scale: number[] } | undefined {
  if (Math.abs(m[3]!) > 1e-7 || Math.abs(m[7]!) > 1e-7 || Math.abs(m[11]!) > 1e-7 || Math.abs(m[15]! - 1) > 1e-7) return undefined;
  let sx = Math.hypot(m[0]!, m[1]!, m[2]!);
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!), sz = Math.hypot(m[8]!, m[9]!, m[10]!);
  if (sx < 1e-12 || sy < 1e-12 || sz < 1e-12) return undefined;
  const determinant = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
  if (determinant < 0) sx = -sx;
  const a = [m[0]!/sx,m[1]!/sx,m[2]!/sx], b = [m[4]!/sy,m[5]!/sy,m[6]!/sy], c = [m[8]!/sz,m[9]!/sz,m[10]!/sz];
  const dot = (x: number[], y: number[]) => x[0]!*y[0]!+x[1]!*y[1]!+x[2]!*y[2]!;
  if (Math.abs(dot(a,b)) > 1e-5 || Math.abs(dot(a,c)) > 1e-5 || Math.abs(dot(b,c)) > 1e-5) return undefined;
  const trace = a[0]! + b[1]! + c[2]!;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; w = s / 4; x = (b[2]! - c[1]!) / s; y = (c[0]! - a[2]!) / s; z = (a[1]! - b[0]!) / s; }
  else if (a[0]! > b[1]! && a[0]! > c[2]!) { const s = Math.sqrt(1 + a[0]! - b[1]! - c[2]!) * 2; w = (b[2]! - c[1]!) / s; x = s / 4; y = (b[0]! + a[1]!) / s; z = (c[0]! + a[2]!) / s; }
  else if (b[1]! > c[2]!) { const s = Math.sqrt(1 + b[1]! - a[0]! - c[2]!) * 2; w = (c[0]! - a[2]!) / s; x = (b[0]! + a[1]!) / s; y = s / 4; z = (c[1]! + b[2]!) / s; }
  else { const s = Math.sqrt(1 + c[2]! - a[0]! - b[1]!) * 2; w = (a[1]! - b[0]!) / s; x = (c[0]! + a[2]!) / s; y = (c[1]! + b[2]!) / s; z = s / 4; }
  return { translation: [m[12]!,m[13]!,m[14]!], rotation: [x,y,z,w], scale: [sx,sy,sz] };
}

function decodeImageDataUri(uri: string, limit: number): Uint8Array {
  const comma = uri.indexOf(",");
  if (comma < 0) throw new Error("COLLADA image data URI is malformed");
  const header = uri.slice(5, comma).toLowerCase(), payload = uri.slice(comma + 1);
  if (!/^image\/(png|jpeg)(;base64)?$/.test(header)) throw new Error("COLLADA image data URI must contain PNG or JPEG");
  if (payload.length > limit * (header.endsWith(";base64") ? 1.34 : 3) + 4) throw new RangeError("COLLADA image data URI exceeds byte limit");
  if (header.endsWith(";base64")) {
    let decoded: string;
    try { decoded = atob(payload); } catch { throw new Error("COLLADA image data URI has invalid base64"); }
    if (decoded.length > limit) throw new RangeError("COLLADA image data URI exceeds byte limit");
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  }
  const result: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    if (result.length >= limit) throw new RangeError("COLLADA image data URI exceeds byte limit");
    if (payload[i] === "%") {
      const pair = payload.slice(i + 1, i + 3);
      if (!/^[0-9a-f]{2}$/i.test(pair)) throw new Error("COLLADA image data URI has invalid escape");
      result.push(Number.parseInt(pair, 16)); i += 2;
    } else {
      const value = payload.charCodeAt(i);
      if (value > 127) throw new Error("COLLADA image data URI must percent-encode binary bytes");
      result.push(value);
    }
  }
  return Uint8Array.from(result);
}
function imageInfo(bytes: Uint8Array): { mime: string; pixels: number } {
  let pixels = 0;
  const validSize = (width: number, height: number) => {
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) throw new RangeError("COLLADA image dimensions exceed pixel limit");
    pixels = width * height;
  };
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8, ihdr = false, data = false, end = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw new Error("COLLADA PNG chunk is truncated");
      const length = view.getUint32(offset), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (length > bytes.length - offset - 12) throw new Error("COLLADA PNG chunk is truncated");
      if (!ihdr) {
        if (type !== "IHDR" || length !== 13) throw new Error("COLLADA PNG missing IHDR");
        validSize(view.getUint32(offset + 8), view.getUint32(offset + 12)); ihdr = true;
      }
      let checksum = 0xffffffff;
      for (let i = offset + 4; i < offset + 8 + length; i++) {
        checksum ^= bytes[i]!;
        for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
      }
      if (((checksum ^ 0xffffffff) >>> 0) !== view.getUint32(offset + 8 + length)) throw new Error("COLLADA PNG chunk checksum mismatch");
      if (type === "IDAT") data = true;
      if (type === "IEND") { if (length !== 0) throw new Error("COLLADA PNG invalid IEND"); end = true; offset += 12; break; }
      offset += length + 12;
    }
    if (!data || !end || offset !== bytes.length) throw new Error("COLLADA PNG missing image data or IEND");
    return { mime: "image/png", pixels };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2, dimensions = false, end = false;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw new Error("COLLADA JPEG marker is invalid");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) { end = true; break; }
      if (marker === 0xda) {
        if (offset + 2 > bytes.length) throw new Error("COLLADA JPEG scan header is truncated");
        const length = bytes[offset]! * 256 + bytes[offset + 1]!;
        if (length < 6 || offset + length > bytes.length - 2) throw new Error("COLLADA JPEG scan header is truncated");
        // After SOS, entropy data contains stuffed bytes and restart markers.
        // The final EOI is checked without attempting to decode the scan.
        end = bytes.length >= 2 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
        break;
      }
      if (marker === undefined || offset + 2 > bytes.length) throw new Error("COLLADA JPEG marker is truncated");
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes[offset]! * 256 + bytes[offset + 1]!;
      if (length < 2 || offset + length > bytes.length) throw new Error("COLLADA JPEG segment is truncated");
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (length < 8) throw new Error("COLLADA JPEG frame is truncated");
        validSize(bytes[offset + 5]! * 256 + bytes[offset + 6]!, bytes[offset + 3]! * 256 + bytes[offset + 4]!); dimensions = true;
      }
      offset += length;
    }
    if (!dimensions || !end) throw new Error("COLLADA JPEG missing frame or EOI");
    return { mime: "image/jpeg", pixels };
  }
  throw new Error("COLLADA diffuse image must contain PNG or JPEG bytes");
}
/** Ear clipping on the dominant plane preserves winding for simple concave polygons. */
function triangulate(points: number[][]): number[][] {
  if (points.length === 3) return [[0, 1, 2]];
  if (points.length > 4096) throw new RangeError("COLLADA polygon exceeds triangulation limit");
  const normal = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    normal[0]! += (a[1]! - b[1]!) * (a[2]! + b[2]!);
    normal[1]! += (a[2]! - b[2]!) * (a[0]! + b[0]!);
    normal[2]! += (a[0]! - b[0]!) * (a[1]! + b[1]!);
  }
  const drop = Math.abs(normal[0]!) > Math.abs(normal[1]!) ? (Math.abs(normal[0]!) > Math.abs(normal[2]!) ? 0 : 2) : (Math.abs(normal[1]!) > Math.abs(normal[2]!) ? 1 : 2);
  const projected = points.map((point) => drop === 0 ? [point[1]!, point[2]!] : drop === 1 ? [point[0]!, point[2]!] : [point[0]!, point[1]!]);
  const cross = (a: number[], b: number[], c: number[]) => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i]!, b = projected[(i + 1) % projected.length]!;
    area += a[0]! * b[1]! - b[0]! * a[1]!;
  }
  if (Math.abs(area) < 1e-12) throw new Error("COLLADA polygon is degenerate");
  const sign = Math.sign(area), remaining = projected.map((_, i) => i), triangles: number[][] = [];
  let checks = 0;
  while (remaining.length > 3) {
    let ear = -1;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length]!, b = remaining[i]!, c = remaining[(i + 1) % remaining.length]!;
      if (sign * cross(projected[a]!, projected[b]!, projected[c]!) <= 1e-12) continue;
      const contains = remaining.some((p) => {
        if (++checks > 2_000_000) throw new RangeError("COLLADA polygon triangulation work exceeds limit");
        return p !== a && p !== b && p !== c && sign * cross(projected[a]!, projected[b]!, projected[p]!) >= -1e-12 && sign * cross(projected[b]!, projected[c]!, projected[p]!) >= -1e-12 && sign * cross(projected[c]!, projected[a]!, projected[p]!) >= -1e-12;
      });
      if (!contains) { triangles.push([a, b, c]); ear = i; break; }
    }
    if (ear < 0) throw new Error("COLLADA polygon is degenerate or self-intersecting");
    remaining.splice(ear, 1);
  }
  triangles.push([...remaining]);
  return triangles;
}

/** Resolve referenced COLLADA documents before building the common scene.
 * Namespacing makes independent document-local IDs safe to combine. */
async function expandExternalDocuments(source: string, options: ColladaImportOptions, context: LoadContext, request?: AssetLoadRequest): Promise<{ source: string; resolved: ReadonlySet<string> }> {
  interface DocumentPart { url: string; root: Element; refs: Map<string, string>; index: number; ids: Set<string>; prefix: string }
  const originalUrl = request?.url ?? options.baseUrl ?? "";
  const maxBytes = boundedLimit(options.maxBytes, MAX_DOCUMENT_BYTES, "maxBytes");
  if (source.length > maxBytes || new TextEncoder().encode(source).byteLength > maxBytes) throw new RangeError("COLLADA document exceeds maxBytes");
  const parts: DocumentPart[] = [{ url: originalUrl, root: parseXml(source), refs: new Map(), index: 0, ids: new Set(), prefix: "" }];
  const index = new Map<string, DocumentPart>();
  if (originalUrl) index.set(originalUrl, parts[0]!);
  let totalBytes = new TextEncoder().encode(source).byteLength;
  const signal = context.signalFor(request?.signal);
  const resolvedReferences = new Set<string>();
  const resolve = (uri: string, base: string) => {
    const resolved = options.resolveDependency ? options.resolveDependency(uri, base) : resolveUri(uri, base);
    resolvedReferences.add(resolved);
    return resolved;
  };
  for (let cursor = 0; cursor < parts.length; cursor++) {
    const part = parts[cursor]!;
    if (part.root.name !== "COLLADA") throw new Error("COLLADA external document root is invalid");
    const version = part.root.attributes.version;
    if (version && !/^1\.[45](?:\.|$)/.test(version)) throw new Error(`Unsupported COLLADA version ${version}`);
    for (const element of descendants(part.root)) {
      if (element.attributes.id) {
        if (part.ids.has(element.attributes.id)) throw new Error(`COLLADA duplicate id ${element.attributes.id}`);
        part.ids.add(element.attributes.id);
      }
      for (const [key, value] of Object.entries(element.attributes)) {
        if (!["url", "source", "target"].includes(key) || value.startsWith("#")) continue;
        const hash = value.lastIndexOf("#");
        if (hash <= 0 || hash === value.length - 1) continue;
        const relative = value.slice(0, hash), resolved = resolve(relative, part.url);
        if (!resolved) throw new Error(`COLLADA external document ${relative} could not be resolved`);
        part.refs.set(relative, resolved);
        if (index.has(resolved)) continue;
        if (parts.length >= 32) throw new RangeError("COLLADA external document count exceeds limit");
        const remaining = maxBytes - totalBytes;
        if (remaining <= 0) throw new RangeError("COLLADA external documents exceed byte limit");
        const documentContext = part.url ? context.child(part.url, undefined, mergeAssetRequestOptions(context.requestOptionsFor(part.url), request)) : context;
        const documentOptions = resolved.startsWith("data:") ? {} : documentContext.requestOptionsFor(resolved);
        const limit = Math.min(remaining, documentOptions.maxBytes ?? remaining);
        const bytes = new Uint8Array(await fetchBytes(resolved, signal, undefined, { ...documentOptions, maxBytes: limit }));
        totalBytes += bytes.length;
        const next: DocumentPart = { url: resolved, root: parseXml(new TextDecoder("utf-8", {fatal:true}).decode(bytes)), refs: new Map(), index: parts.length, ids: new Set(), prefix: "" };
        parts.push(next); index.set(resolved, next);
      }
    }
  }
  if (parts.length === 1 && !parts[0]!.refs.size) return { source, resolved: resolvedReferences };
  const primary = parts[0]!;
  const unitAndAxis = (element: Element): [number, string] => {
    const asset = child(element, "asset"), unit = child(asset, "unit")?.attributes.meter;
    return [unit === undefined ? 1 : finite(unit, "unit meter"), child(asset, "up_axis")?.text.trim() || "Y_UP"];
  };
  const coordinates = unitAndAxis(primary.root);
  for (const part of parts.slice(1)) {
    const externalCoordinates = unitAndAxis(part.root);
    if (externalCoordinates[0] !== coordinates[0] || externalCoordinates[1] !== coordinates[1]) throw new Error("COLLADA external document units or up axis differ from the parent document");
  }
  const used = new Set(parts.flatMap((part) => [...part.ids]));
  for (const part of parts.slice(1)) {
    let prefix = `__aura3d_doc_${part.index}_`;
    while ([...part.ids].some((id) => used.has(prefix + id))) prefix = `_${prefix}`;
    part.prefix = prefix;
    for (const id of part.ids) used.add(prefix + id);
  }
  for (const part of parts) {
    for (const element of descendants(part.root)) {
      if (element.attributes.id) element.attributes.id = part.prefix + element.attributes.id;
      for (const [key, value] of Object.entries(element.attributes)) {
        if (["url", "source", "target"].includes(key)) {
          if (value.startsWith("#")) element.attributes[key] = `#${part.prefix}${value.slice(1)}`;
          else {
            const hash = value.lastIndexOf("#");
            if (hash > 0 && hash < value.length - 1) {
              const documentUrl = part.refs.get(value.slice(0, hash));
              const target = documentUrl ? index.get(documentUrl) : undefined;
              if (target) element.attributes[key] = `#${target.prefix}${value.slice(hash + 1)}`;
            } else if (key === "target" && element.name === "channel") {
              const slash = value.indexOf("/");
              if (slash > 0 && part.ids.has(value.slice(0, slash))) element.attributes[key] = `${part.prefix}${value}`;
            }
          }
        }
      }
      if (element.name === "Name_array" || element.name === "IDREF_array") element.text = tokens(element.text).map((name) => part.ids.has(name) ? part.prefix + name : name).join(" ");
    }
    // Image and surface references are element text rather than URL attributes.
    for (const image of descendants(child(part.root, "library_images"), "image")) {
      const init = child(image, "init_from");
      if (init?.text.trim()) init.text = resolve(init.text.trim(), part.url);
    }
    for (const surface of descendants(part.root, "surface")) {
      const init = child(surface, "init_from");
      if (init && part.ids.has(init.text.trim())) init.text = part.prefix + init.text.trim();
    }
    for (const skeleton of descendants(part.root, "skeleton")) if (skeleton.text.trim().startsWith("#")) skeleton.text = `#${part.prefix}${skeleton.text.trim().slice(1)}`;
  }
  for (const part of parts.slice(1)) {
    for (const library of part.root.children.filter((element) => element.name.startsWith("library_"))) {
      const target = child(primary.root, library.name);
      if (target) target.children.push(...library.children);
      else primary.root.children.push(library);
    }
  }
  return { source: serializeXml(primary.root), resolved: resolvedReferences };
}
function serializeXml(element: Element): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const attributes = Object.entries(element.attributes).map(([name, value]) => ` ${name}="${escape(value)}"`).join("");
  return `<${element.name}${attributes}>${escape(element.text)}${element.children.map(serializeXml).join("")}</${element.name}>`;
}
