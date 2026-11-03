import type { GLTFAnimationPointerTrackProvenance, GLTFAsset, GLTFMeshAsset, GLTFResolvedTextureInfo, GLTFSamplerAsset } from "../GLTFLoader";
import { inspectRequiredEmissiveDefaultSource, inspectRequiredEmissiveDefaultTrackLoss } from "../GLTFLoader";
import type { Scene, SceneNode } from "@aura3d/scene";
import { getGLTFLightAnimationTrackIdentity, getGLTFLightSceneIdentity } from "../GLTFLightPointerIdentity";

/** Portable, column-major scene interchange. Geometry is in source units and
 * transforms are local to the parent. Dependencies are supplied bytes; export
 * never fetches URLs. Numeric arrays may be typed to retain component types. */
export type AuraExportValues = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | readonly number[];
export interface AuraExportAttribute { readonly values: AuraExportValues; readonly itemSize: 1 | 2 | 3 | 4 | 16; readonly normalized?: boolean }
export interface AuraExportPrimitive {
  readonly attributes: Readonly<Record<string, AuraExportAttribute>>;
  readonly indices?: Uint8Array | Uint16Array | Uint32Array | readonly number[];
  readonly mode?: "triangles" | "lines" | "points";
  readonly material?: number;
  readonly targets?: readonly Readonly<Record<string, AuraExportAttribute>>[];
}
export interface AuraExportMesh { readonly name?: string; readonly primitives: readonly AuraExportPrimitive[]; readonly weights?: readonly number[] }
export interface AuraExportInstances {
  readonly transforms: Float32Array | readonly number[];
  readonly colors?: Float32Array | readonly number[];
}
export interface AuraExportNode {
  readonly name?: string; readonly children?: readonly number[]; readonly matrix?: readonly number[];
  readonly translation?: readonly number[]; readonly rotation?: readonly number[]; readonly scale?: readonly number[];
  readonly mesh?: number; readonly camera?: number; readonly light?: number; readonly skin?: number;
  readonly weights?: readonly number[]; readonly metadata?: Readonly<Record<string, unknown>>; readonly instances?: AuraExportInstances;
}
/** Texture settings are per binding; the sampler belongs to the texture, while
 * texCoord and transform belong to its material texture-info object. */
export interface AuraExportTextureSettings {
  readonly texCoord?: number;
  readonly transform?: { readonly offset: readonly [number, number]; readonly scale: readonly [number, number]; readonly rotation: number };
  readonly sampler?: GLTFSamplerAsset;
}
export interface AuraExportTextureReference extends AuraExportTextureSettings { readonly name: string }
export interface AuraExportGLTFMaterial {
  /** Settings for the legacy, name-valued core texture fields on the material. */
  readonly textures?: Partial<Readonly<Record<"baseColorTexture" | "metallicRoughnessTexture" | "normalTexture" | "occlusionTexture" | "emissiveTexture", AuraExportTextureSettings>>>;
  readonly emissiveStrength?: number;
  readonly clearcoat?: { readonly factor?: number; readonly texture?: AuraExportTextureReference; readonly roughnessFactor?: number; readonly roughnessTexture?: AuraExportTextureReference; readonly normalTexture?: AuraExportTextureReference & { readonly scale?: number } };
  readonly diffuseRoughness?: { readonly factor?: number; readonly texture?: AuraExportTextureReference };
  readonly bump?: { readonly factor?: number; readonly texture?: AuraExportTextureReference };
  readonly transmission?: { readonly factor?: number; readonly texture?: AuraExportTextureReference };
  readonly diffuseTransmission?: { readonly factor?: number; readonly texture?: AuraExportTextureReference; readonly colorFactor?: readonly [number, number, number]; readonly colorTexture?: AuraExportTextureReference };
  readonly volume?: { readonly thicknessFactor?: number; readonly thicknessTexture?: AuraExportTextureReference; readonly attenuationDistance?: number; readonly attenuationColor?: readonly [number, number, number] };
  readonly ior?: number;
  readonly specular?: { readonly factor?: number; readonly texture?: AuraExportTextureReference; readonly colorFactor?: readonly [number, number, number]; readonly colorTexture?: AuraExportTextureReference };
  readonly pbrSpecularGlossiness?: { readonly diffuseFactor?: readonly [number, number, number, number]; readonly diffuseTexture?: AuraExportTextureReference; readonly specularFactor?: readonly [number, number, number]; readonly glossinessFactor?: number; readonly specularGlossinessTexture?: AuraExportTextureReference };
  readonly sheen?: { readonly colorFactor?: readonly [number, number, number]; readonly colorTexture?: AuraExportTextureReference; readonly roughnessFactor?: number; readonly roughnessTexture?: AuraExportTextureReference };
  readonly anisotropy?: { readonly strength?: number; readonly rotation?: number; readonly texture?: AuraExportTextureReference };
  readonly iridescence?: { readonly factor?: number; readonly texture?: AuraExportTextureReference; readonly ior?: number; readonly thicknessMinimum?: number; readonly thicknessMaximum?: number; readonly thicknessTexture?: AuraExportTextureReference };
  readonly dispersion?: number;
}
export interface AuraExportMaterial {
  readonly name?: string; readonly baseColor?: readonly [number, number, number, number]; readonly metallic?: number;
  readonly roughness?: number; readonly emissive?: readonly [number, number, number];
  readonly alphaMode?: "OPAQUE" | "MASK" | "BLEND"; readonly alphaCutoff?: number; readonly doubleSided?: boolean;
  readonly baseColorTexture?: string; readonly metallicRoughnessTexture?: string; readonly normalTexture?: string;
  readonly normalTextureScale?: number; readonly occlusionTexture?: string; readonly occlusionStrength?: number;
  readonly emissiveTexture?: string; readonly unlit?: boolean; readonly metadata?: Readonly<Record<string, unknown>>;
  /** glTF material data other interchange formats may not support. */ readonly gltf?: AuraExportGLTFMaterial;
}

/** @internal Texture-info paths emitted by the glTF writer and their snapshot
 * bindings. A transform belongs to a material slot, not the shared texture. */
export const GLTF_TEXTURE_TRANSFORM_BINDINGS: readonly {
  readonly pointer: string;
  readonly texture: (material: AuraExportMaterial) => AuraExportTextureSettings | undefined;
}[] = Object.freeze(([
  { pointer: "pbrMetallicRoughness/baseColorTexture", texture: (m) => m.baseColorTexture === undefined ? undefined : m.gltf?.textures?.baseColorTexture },
  { pointer: "pbrMetallicRoughness/metallicRoughnessTexture", texture: (m) => m.metallicRoughnessTexture === undefined ? undefined : m.gltf?.textures?.metallicRoughnessTexture },
  { pointer: "normalTexture", texture: (m) => m.normalTexture === undefined ? undefined : m.gltf?.textures?.normalTexture },
  { pointer: "occlusionTexture", texture: (m) => m.occlusionTexture === undefined ? undefined : m.gltf?.textures?.occlusionTexture },
  { pointer: "emissiveTexture", texture: (m) => m.emissiveTexture === undefined ? undefined : m.gltf?.textures?.emissiveTexture },
  { pointer: "extensions/KHR_materials_clearcoat/clearcoatTexture", texture: (m) => m.gltf?.clearcoat?.texture },
  { pointer: "extensions/KHR_materials_clearcoat/clearcoatRoughnessTexture", texture: (m) => m.gltf?.clearcoat?.roughnessTexture },
  { pointer: "extensions/KHR_materials_clearcoat/clearcoatNormalTexture", texture: (m) => m.gltf?.clearcoat?.normalTexture },
  { pointer: "extensions/KHR_materials_diffuse_roughness/diffuseRoughnessTexture", texture: (m) => m.gltf?.diffuseRoughness?.texture },
  { pointer: "extensions/EXT_materials_bump/bumpTexture", texture: (m) => m.gltf?.bump?.texture },
  { pointer: "extensions/KHR_materials_transmission/transmissionTexture", texture: (m) => m.gltf?.transmission?.texture },
  { pointer: "extensions/KHR_materials_diffuse_transmission/diffuseTransmissionTexture", texture: (m) => m.gltf?.diffuseTransmission?.texture },
  { pointer: "extensions/KHR_materials_diffuse_transmission/diffuseTransmissionColorTexture", texture: (m) => m.gltf?.diffuseTransmission?.colorTexture },
  { pointer: "extensions/KHR_materials_volume/thicknessTexture", texture: (m) => m.gltf?.volume?.thicknessTexture },
  { pointer: "extensions/KHR_materials_specular/specularTexture", texture: (m) => m.gltf?.specular?.texture },
  { pointer: "extensions/KHR_materials_specular/specularColorTexture", texture: (m) => m.gltf?.specular?.colorTexture },
  { pointer: "extensions/KHR_materials_pbrSpecularGlossiness/diffuseTexture", texture: (m) => m.gltf?.pbrSpecularGlossiness?.diffuseTexture },
  { pointer: "extensions/KHR_materials_pbrSpecularGlossiness/specularGlossinessTexture", texture: (m) => m.gltf?.pbrSpecularGlossiness?.specularGlossinessTexture },
  { pointer: "extensions/KHR_materials_sheen/sheenColorTexture", texture: (m) => m.gltf?.sheen?.colorTexture },
  { pointer: "extensions/KHR_materials_sheen/sheenRoughnessTexture", texture: (m) => m.gltf?.sheen?.roughnessTexture },
  { pointer: "extensions/KHR_materials_anisotropy/anisotropyTexture", texture: (m) => m.gltf?.anisotropy?.texture },
  { pointer: "extensions/KHR_materials_iridescence/iridescenceTexture", texture: (m) => m.gltf?.iridescence?.texture },
  { pointer: "extensions/KHR_materials_iridescence/iridescenceThicknessTexture", texture: (m) => m.gltf?.iridescence?.thicknessTexture }
] satisfies { readonly pointer: string; readonly texture: (material: AuraExportMaterial) => AuraExportTextureSettings | undefined }[]).map((binding) => Object.freeze(binding)));
export interface AuraExportCamera {
  readonly name?: string; readonly type: "perspective" | "orthographic";
  readonly perspective?: { readonly yfov: number; readonly znear: number; readonly zfar?: number; readonly aspectRatio?: number };
  readonly orthographic?: { readonly xmag: number; readonly ymag: number; readonly znear: number; readonly zfar: number };
}
export interface AuraExportLight {
  readonly name?: string; readonly type: "directional" | "point" | "spot";
  readonly color?: readonly [number, number, number]; readonly intensity?: number; readonly range?: number;
  readonly spot?: { readonly innerConeAngle?: number; readonly outerConeAngle?: number };
}
export interface AuraExportSkin { readonly name?: string; readonly joints: readonly number[]; readonly skeleton?: number; readonly inverseBindMatrices?: AuraExportAttribute }
export interface AuraExportAnimationChannel {
  readonly node: number; readonly path: "translation" | "rotation" | "scale" | "weights";
  readonly times: AuraExportAttribute; readonly values: AuraExportAttribute; readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
}
/** A bounded glTF property target. The writer validates the path against the
 * exported document; unsupported targets are not silently approximated. */
export interface AuraExportPointerAnimationChannel {
  readonly pointer: string;
  readonly times: AuraExportAttribute; readonly values: AuraExportAttribute; readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
}

/** Source and remapped target of one verified in-memory snapshot channel. */
export interface AuraExportPointerTrackProvenance extends GLTFAnimationPointerTrackProvenance {
  readonly exportedPointer: string;
}
export interface AuraExportPointerProvenanceInspection {
  readonly status: "verified" | "changed-target";
  readonly provenance: AuraExportPointerTrackProvenance;
  /** Pointer resolved against this scene's current material indices, when verified. */
  readonly resolvedPointer?: string;
}
type PointerTargetKind = "node" | "material" | "light";
interface PointerProvenanceEntry {
  readonly provenance: AuraExportPointerTrackProvenance;
  readonly kind: PointerTargetKind;
  readonly index: number;
  readonly target: WeakRef<object>;
  readonly meshIndex?: number;
  readonly mesh?: WeakRef<object>;
}
// A snapshot channel is a new object, and one source track may produce several
// channels. Never serialize or infer the association from target names/indices.
const pointerChannelProvenance = new WeakMap<AuraExportPointerAnimationChannel, PointerProvenanceEntry>();
const importedCoreChannels = new WeakSet<AuraExportAnimationChannel>();
interface RequiredPointerLoss {
  readonly path: string;
  readonly pointer: string;
  readonly message: string;
}
interface RequiredPointerSnapshotContract {
  readonly loss?: RequiredPointerLoss;
  readonly channels: readonly { readonly channel: AuraExportPointerAnimationChannel; readonly path: string; readonly pointer: string }[];
}
// Keep known required omissions separate from bounded/display-only diagnostics.
// The warnings array is also a key so ordinary shallow copies retain the
// contract even when the caller supplies a different animations array.
const requiredPointerSnapshots = new WeakMap<object, RequiredPointerSnapshotContract>();

/** @internal True only for a core channel emitted from an identified original core track. */
export function hasVerifiedExportCoreChannelOrigin(channel: AuraExportAnimationChannel): boolean {
  return importedCoreChannels.has(channel);
}

/**
 * Inspect a snapshot channel's immutable source identity and its current target.
 * Reconstructed/cloned channels return undefined. Reusing a channel with a
 * changed pointer or a replaced target object does not retain verified origin.
 * The exact same material object may move to a unique new index; in that case
 * resolvedPointer names that index without changing the source provenance.
 */
export function inspectExportPointerChannelProvenance(
  scene: AuraExportScene,
  channel: AuraExportPointerAnimationChannel
): AuraExportPointerProvenanceInspection | undefined {
  const entry = pointerChannelProvenance.get(channel);
  if (!entry) return undefined;
  const originalTarget = entry.target.deref();
  let index = entry.index;
  if (entry.kind === "material" && originalTarget && scene.materials) {
    const first = scene.materials.indexOf(originalTarget as AuraExportMaterial);
    // Duplicate references do not establish which exported material is meant.
    index = first >= 0 && first === scene.materials.lastIndexOf(originalTarget as AuraExportMaterial) ? first : -1;
  }
  const target = entry.kind === "node" ? scene.nodes[index]
    : entry.kind === "material" ? scene.materials?.[index] : scene.lights?.[index];
  const meshChanged = entry.mesh !== undefined && (
    entry.kind !== "node" || (target as AuraExportNode | undefined)?.mesh !== entry.meshIndex
    || scene.meshes?.[entry.meshIndex!] !== entry.mesh.deref()
  );
  const verified = channel.pointer === entry.provenance.exportedPointer && target !== undefined && target === originalTarget && !meshChanged;
  const resolvedPointer = entry.kind === "material"
    ? entry.provenance.exportedPointer.replace(/^\/materials\/(?:0|[1-9]\d*)\//, `/materials/${index}/`)
    : entry.provenance.exportedPointer;
  return Object.freeze({
    status: verified ? "verified" as const : "changed-target" as const,
    provenance: entry.provenance,
    ...(verified ? { resolvedPointer } : {})
  });
}

/** @internal Known required source tracks may not disappear from an export. */
export function inspectRequiredExportPointerLoss(scene: AuraExportScene): RequiredPointerLoss | undefined {
  const warnings = Object.getOwnPropertyDescriptor(scene, "sourceWarnings")?.value;
  const contract = requiredPointerSnapshots.get(scene) ??
    (warnings && typeof warnings === "object" ? requiredPointerSnapshots.get(warnings) : undefined);
  if (!contract) return undefined;
  if (contract.loss) return contract.loss;
  if (!contract.channels.length) return undefined;
  const present = new Set<AuraExportPointerAnimationChannel>();
  const animations = Object.getOwnPropertyDescriptor(scene, "animations")?.value;
  if (Array.isArray(animations)) for (let i = 0; i < animations.length; i++) {
    const animation = Object.getOwnPropertyDescriptor(animations, String(i))?.value;
    if (!animation || typeof animation !== "object") continue;
    const channels = Object.getOwnPropertyDescriptor(animation, "pointerChannels")?.value;
    if (Array.isArray(channels)) for (let j = 0; j < channels.length; j++) {
      const channel = Object.getOwnPropertyDescriptor(channels, String(j))?.value;
      if (channel && typeof channel === "object") present.add(channel);
    }
  }
  for (const { channel, path, pointer } of contract.channels) {
    if (!present.has(channel)) return { path, pointer, message: "A verified required pointer channel was removed from the snapshot." };
  }
  return undefined;
}

function registerExportPointerProvenance(
  channel: AuraExportPointerAnimationChannel,
  source: GLTFAnimationPointerTrackProvenance,
  kind: PointerTargetKind,
  index: number,
  target: object,
  meshIndex?: number,
  mesh?: object
): void {
  const provenance = Object.freeze({
    animationIndex: source.animationIndex, channelIndex: source.channelIndex,
    pointer: source.pointer, required: source.required, exportedPointer: channel.pointer
  });
  pointerChannelProvenance.set(channel, Object.freeze({
    provenance, kind, index, target: new WeakRef(target), meshIndex, mesh: mesh === undefined ? undefined : new WeakRef(mesh)
  }));
}
export interface AuraExportAnimation {
  readonly name?: string; readonly channels: readonly AuraExportAnimationChannel[];
  readonly pointerChannels?: readonly AuraExportPointerAnimationChannel[];
}
export interface AuraExportDependency { readonly name: string; readonly data: Uint8Array; readonly mimeType?: string }
export interface AuraExportWarning { readonly code: string; readonly path?: string; readonly message: string }
export interface AuraExportResult { readonly data: Blob | Uint8Array; readonly mimeType: string; readonly warnings: readonly AuraExportWarning[]; readonly dependencies: readonly { readonly name: string; readonly data: Blob | Uint8Array }[] }
export interface AuraExportScene {
  readonly nodes: readonly AuraExportNode[]; readonly roots: readonly number[]; readonly meshes?: readonly AuraExportMesh[];
  readonly materials?: readonly AuraExportMaterial[]; readonly cameras?: readonly AuraExportCamera[]; readonly lights?: readonly AuraExportLight[];
  readonly skins?: readonly AuraExportSkin[]; readonly animations?: readonly AuraExportAnimation[]; readonly dependencies?: readonly AuraExportDependency[];
  readonly metadata?: Readonly<Record<string, unknown>>; readonly sourceWarnings?: readonly AuraExportWarning[];
  /** Length of a source unit in metres; absence means unknown. */ readonly metersPerUnit?: number;
  readonly upAxis?: "Y" | "Z"; readonly uvOrigin?: "top-left" | "bottom-left";
}

/** Independently declared support boundaries for the interchange entrypoint.
 * A warning in a particular result remains authoritative for that input. */
export const AURA_EXPORT_CAPABILITIES = {
  gltf: { containers: ["gltf", "glb"], hierarchy: true, geometry: ["triangles", "lines", "points"], materials: "core-pbr-and-material-extensions", cameras: true, lights: "punctual", skin: true, morph: true, instancing: "EXT_mesh_gpu_instancing-trs-and-custom-_COLOR_0;no-skin-or-shear;colors-require-consumer-adapter;max-1000000-colored-instances", animation: ["LINEAR", "STEP", "CUBICSPLINE"], dependencies: "embedded-or-external", metadata: true },
  obj: { containers: ["obj", "mtl"], hierarchy: "baked", geometry: ["triangles", "lines", "points"], materials: "mtl", animation: false, dependencies: "external", metadata: "comments" },
  ply: { encodings: ["ascii", "binary_little_endian", "binary_big_endian"], hierarchy: "baked", geometry: ["triangles", "lines", "points"], attributes: ["position", "normal", "texcoord", "color"], animation: false, dependencies: false },
  stl: { encodings: ["ascii", "binary"], hierarchy: "baked", geometry: ["triangles"], attributes: ["facet-normal"], animation: false, dependencies: false },
  usdz: { containers: ["usdz"], hierarchy: true, geometry: ["triangles", "lines", "points"], materials: "preview-surface-pbr-textures", cameras: true, lights: "directional-point-spot", animation: "trs-clip-variants;optional-native-translation-and-scale-splines;warned-fallbacks", skin: "usdskel-up-to-64-influences", morph: "position-and-normal-blendshapes", dependencies: "embedded", metadata: true },
  draco: { encoder: "injected", geometry: ["triangles", "points"], materials: false, animation: false },
  exr: { compression: ["none", "rle", "piz"], piz: "native-wavelet-or-injected-encoder; ineffective-compression-uses-warned-raw-blocks", attachments: "explicit", layers: "explicit", channels: ["float", "half"] },
  ktx2: { formats: ["r8unorm", "rg8unorm", "rgba8unorm", "rgba8unorm-srgb", "rgba16float", "rgba32float"], compression: "injected", mipLevels: true, metadata: true }
} as const;

export function throwIfExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

/** Diagnostic and dependency collector; instances belong to one export. */
export class ExportContext {
  readonly warnings: AuraExportWarning[] = [];
  readonly dependencies: AuraExportDependency[] = [];
  private readonly names = new Set<string>();
  constructor(readonly signal?: AbortSignal) {}
  check(): void { throwIfExportAborted(this.signal); }
  warn(code: string, message: string, path?: string): void { this.warnings.push({ code, ...(path === undefined ? {} : { path }), message }); }
  addDependency(name: string, data: Uint8Array, mimeType?: string): string {
    this.check();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === "." || name === "..") throw new Error("Dependency name must be a safe single path segment");
    if (this.names.has(name.toLowerCase())) throw new Error(`Duplicate dependency name: ${name}`);
    this.names.add(name.toLowerCase());
    this.dependencies.push({ name, data, ...(mimeType ? { mimeType } : {}) });
    return name;
  }
}

/** Report unexpected JS/JSON fields rather than silently discarding them.
 * Attribute semantic names are intentionally open and each writer reports
 * semantics it cannot represent. Arbitrary JSON is permitted inside metadata. */
export function findUnsupportedExportProperties(scene: AuraExportScene): AuraExportWarning[] {
  const warnings: AuraExportWarning[] = [];
  let omitted = 0;
  const check = (object: unknown, allowed: readonly string[], path: string): void => {
    if (!object || typeof object !== "object" || Array.isArray(object)) return;
    for (const key of Object.keys(object)) if (!allowed.includes(key)) {
      if (warnings.length < 256) warnings.push({ code: "UNSUPPORTED_PROPERTY", path: `${path}.${key}`, message: "The property is not represented by this export format." });
      else omitted++;
    }
  };
  const attribute = (value: AuraExportAttribute | undefined, path: string): void => check(value, ["values", "itemSize", "normalized"], path);
  check(scene, ["nodes", "roots", "meshes", "materials", "cameras", "lights", "skins", "animations", "dependencies", "metadata", "sourceWarnings", "metersPerUnit", "upAxis", "uvOrigin"], "scene");
  scene.nodes?.forEach((node, i) => check(node, ["name", "children", "matrix", "translation", "rotation", "scale", "mesh", "camera", "light", "skin", "weights", "metadata"], `nodes[${i}]`));
  scene.meshes?.forEach((mesh, i) => {
    const path = `meshes[${i}]`;
    check(mesh, ["name", "primitives", "weights"], path);
    mesh.primitives?.forEach((primitive, j) => {
      const p = `${path}.primitives[${j}]`;
      check(primitive, ["attributes", "indices", "mode", "material", "targets"], p);
      for (const [name, value] of Object.entries(primitive.attributes ?? {})) attribute(value, `${p}.attributes.${name}`);
      primitive.targets?.forEach((target, k) => { for (const [name, value] of Object.entries(target)) attribute(value, `${p}.targets[${k}].${name}`); });
    });
  });
  scene.materials?.forEach((material, i) => check(material, ["name", "baseColor", "metallic", "roughness", "emissive", "alphaMode", "alphaCutoff", "doubleSided", "baseColorTexture", "metallicRoughnessTexture", "normalTexture", "normalTextureScale", "occlusionTexture", "occlusionStrength", "emissiveTexture", "unlit", "metadata"], `materials[${i}]`));
  scene.cameras?.forEach((camera, i) => { check(camera, ["name", "type", "perspective", "orthographic"], `cameras[${i}]`); check(camera.perspective, ["yfov", "znear", "zfar", "aspectRatio"], `cameras[${i}].perspective`); check(camera.orthographic, ["xmag", "ymag", "znear", "zfar"], `cameras[${i}].orthographic`); });
  scene.lights?.forEach((light, i) => { check(light, ["name", "type", "color", "intensity", "range", "spot"], `lights[${i}]`); check(light.spot, ["innerConeAngle", "outerConeAngle"], `lights[${i}].spot`); });
  scene.skins?.forEach((skin, i) => { check(skin, ["name", "joints", "skeleton", "inverseBindMatrices"], `skins[${i}]`); attribute(skin.inverseBindMatrices, `skins[${i}].inverseBindMatrices`); });
  scene.animations?.forEach((animation, i) => { check(animation, ["name", "channels"], `animations[${i}]`); animation.channels?.forEach((channel, j) => { const path = `animations[${i}].channels[${j}]`; check(channel, ["node", "path", "times", "values", "interpolation"], path); attribute(channel.times, `${path}.times`); attribute(channel.values, `${path}.values`); }); });
  scene.dependencies?.forEach((dependency, i) => check(dependency, ["name", "data", "mimeType"], `dependencies[${i}]`));
  if (omitted) warnings.push({ code: "DIAGNOSTICS_TRUNCATED", message: `${omitted} additional unsupported properties were not individually reported.` });
  return warnings;
}

const identity = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function assertVector(value: readonly number[] | undefined, length: number, path: string): void {
  if (value !== undefined && (value.length !== length || !value.every(Number.isFinite))) throw new TypeError(`${path} must have ${length} finite values`);
}
function reference(index: number | undefined, length: number, path: string): void {
  if (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index >= length)) throw new RangeError(`${path} references an invalid index`);
}
function checkAttribute(attribute: AuraExportAttribute, path: string, count?: number, signal?: AbortSignal): void {
  if (!attribute || ![1, 2, 3, 4, 16].includes(attribute.itemSize) || !attribute.values || !Number.isSafeInteger(attribute.values.length) || attribute.values.length % attribute.itemSize !== 0) throw new TypeError(`${path} has an invalid attribute layout`);
  if (count !== undefined && attribute.values.length / attribute.itemSize !== count) throw new RangeError(`${path} count differs from POSITION`);
  if (attribute.normalized && !(attribute.values instanceof Int8Array || attribute.values instanceof Uint8Array || attribute.values instanceof Int16Array || attribute.values instanceof Uint16Array || attribute.values instanceof Uint32Array)) throw new TypeError(`${path} normalized values require an integer typed array`);
  for (let i = 0; i < attribute.values.length; i++) { if ((i & 8191) === 0) throwIfExportAborted(signal); if (!Number.isFinite(attribute.values[i])) throw new TypeError(`${path}[${i}] must be finite`); }
}

/** Validate graph ownership, reference indices, topology and numeric attributes. */
export function validateScene(scene: AuraExportScene, signal?: AbortSignal): void {
  throwIfExportAborted(signal);
  if (!scene || !Array.isArray(scene.nodes) || !Array.isArray(scene.roots)) throw new TypeError("Export scene must contain nodes and roots arrays");
  if (scene.metersPerUnit !== undefined && (!Number.isFinite(scene.metersPerUnit) || scene.metersPerUnit <= 0)) throw new RangeError("metersPerUnit must be positive and finite");
  const parents = new Int32Array(scene.nodes.length).fill(-1);
  const rootSet = new Set<number>();
  for (const root of scene.roots) { if (root === undefined) throw new RangeError("root references an invalid index"); reference(root, scene.nodes.length, "root"); if (rootSet.has(root)) throw new Error("Duplicate scene root"); rootSet.add(root); }
  for (let i = 0; i < scene.nodes.length; i++) {
    if ((i & 1023) === 0) throwIfExportAborted(signal);
    const node = scene.nodes[i]; if (!node) throw new TypeError(`nodes[${i}] is missing`);
    assertVector(node.matrix, 16, `nodes[${i}].matrix`); assertVector(node.translation, 3, `nodes[${i}].translation`); assertVector(node.rotation, 4, `nodes[${i}].rotation`); assertVector(node.scale, 3, `nodes[${i}].scale`);
    if (node.matrix && (node.translation || node.rotation || node.scale)) throw new Error(`nodes[${i}] cannot combine matrix and TRS`);
    if (node.matrix && (node.matrix[3] !== 0 || node.matrix[7] !== 0 || node.matrix[11] !== 0 || node.matrix[15] !== 1)) throw new Error(`nodes[${i}].matrix must be affine`);
    if (node.rotation && Math.abs(Math.hypot(...node.rotation) - 1) > 1e-5) throw new Error(`nodes[${i}].rotation must be a unit quaternion`);
    reference(node.mesh, scene.meshes?.length ?? 0, `nodes[${i}].mesh`); reference(node.camera, scene.cameras?.length ?? 0, `nodes[${i}].camera`); reference(node.light, scene.lights?.length ?? 0, `nodes[${i}].light`); reference(node.skin, scene.skins?.length ?? 0, `nodes[${i}].skin`);
    for (const child of node.children ?? []) { if (child === undefined) throw new RangeError(`nodes[${i}].children references an invalid index`); reference(child, scene.nodes.length, `nodes[${i}].children`); if (parents[child] !== -1) throw new Error(`nodes[${child}] has multiple parents`); parents[child] = i; }
  }
  for (const root of rootSet) if (parents[root] !== -1) throw new Error("A scene root cannot have a parent");
  const states = new Uint8Array(scene.nodes.length);
  for (let start = 0; start < scene.nodes.length; start++) {
    if (states[start]) continue;
    const pending: Array<[number, boolean]> = [[start, false]];
    while (pending.length) { const [index, done] = pending.pop()!; if (done) { states[index] = 2; continue; } if (states[index] === 1) throw new Error("Scene hierarchy contains a cycle"); if (states[index] === 2) continue; states[index] = 1; pending.push([index, true]); for (const child of scene.nodes[index]!.children ?? []) pending.push([child, false]); }
  }
  for (let mi = 0; mi < (scene.meshes?.length ?? 0); mi++) {
    const mesh = scene.meshes![mi]!;
    for (let pi = 0; pi < mesh.primitives.length; pi++) {
      const primitive = mesh.primitives[pi]!; const path = `meshes[${mi}].primitives[${pi}]`;
      const position = primitive.attributes.POSITION; if (!position || position.itemSize !== 3) throw new TypeError(`${path} requires POSITION with three components`);
      checkAttribute(position, `${path}.POSITION`, undefined, signal); const count = position.values.length / 3;
      for (const [name, value] of Object.entries(primitive.attributes)) checkAttribute(value, `${path}.${name}`, count, signal);
      for (const target of primitive.targets ?? []) for (const [name, value] of Object.entries(target)) checkAttribute(value, `${path}.targets.${name}`, count, signal);
      reference(primitive.material, scene.materials?.length ?? 0, `${path}.material`);
      const mode = primitive.mode ?? "triangles"; if (!(mode === "triangles" || mode === "lines" || mode === "points")) throw new Error(`${path} has unsupported topology`);
      const length = primitive.indices?.length ?? count; if ((mode === "triangles" && length % 3) || (mode === "lines" && length % 2)) throw new RangeError(`${path} has incomplete ${mode}`);
      for (const index of primitive.indices ?? []) { if (index === undefined) throw new RangeError(`${path}.indices references an invalid index`); reference(index, count, `${path}.indices`); }
    }
  }
}

export function readAttribute(attribute: AuraExportAttribute, index: number): number[] {
  if (!Number.isInteger(index) || index < 0 || (index + 1) * attribute.itemSize > attribute.values.length) throw new RangeError("Attribute index is out of bounds");
  return Array.from({ length: attribute.itemSize }, (_, component) => attribute.values[index * attribute.itemSize + component]!);
}
export function readAttributeNormalized(attribute: AuraExportAttribute, index: number): number[] {
  const values = readAttribute(attribute, index); if (!attribute.normalized) return values;
  const source = attribute.values;
  if (source instanceof Int8Array) return values.map((v) => Math.max(-1, v / 127));
  if (source instanceof Uint8Array) return values.map((v) => v / 255);
  if (source instanceof Int16Array) return values.map((v) => Math.max(-1, v / 32767));
  if (source instanceof Uint16Array) return values.map((v) => v / 65535);
  if (source instanceof Uint32Array) return values.map((v) => v / 4294967295);
  throw new TypeError("Normalized attribute requires integer typed values");
}
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return result;
}
function localMatrix(node: AuraExportNode): readonly number[] {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]; const [sx, sy, sz] = node.scale ?? [1, 1, 1]; const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const length = Math.hypot(x!, y!, z!, w!);
  const qx = x! / length, qy = y! / length, qz = z! / length, qw = w! / length; const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1-2*(yy+zz))*sx!, 2*(xy+wz)*sx!, 2*(xz-wy)*sx!, 0, 2*(xy-wz)*sy!, (1-2*(xx+zz))*sy!, 2*(yz+wx)*sy!, 0, 2*(xz+wy)*sz!, 2*(yz-wx)*sz!, (1-2*(xx+yy))*sz!, 0, tx!, ty!, tz!, 1];
}
/** Traverse reachable nodes once in parent-first order. */
export function traverseScene(scene: AuraExportScene, visitor: (node: AuraExportNode, nodeIndex: number, worldMatrix: readonly number[]) => void, signal?: AbortSignal): void {
  validateScene(scene, signal);
  const pending: Array<{ index: number; parent: readonly number[] }> = scene.roots.map((index) => ({ index, parent: identity() })).reverse();
  while (pending.length) { throwIfExportAborted(signal); const { index, parent } = pending.pop()!; const node = scene.nodes[index]!; const world = multiply(parent, localMatrix(node)); visitor(node, index, world); for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) pending.push({ index: node.children![i]!, parent: world }); }
}
export function transformPosition(matrix: readonly number[], vector: readonly number[]): [number, number, number] {
  const [x, y, z] = vector; return [matrix[0]! * x! + matrix[4]! * y! + matrix[8]! * z! + matrix[12]!, matrix[1]! * x! + matrix[5]! * y! + matrix[9]! * z! + matrix[13]!, matrix[2]! * x! + matrix[6]! * y! + matrix[10]! * z! + matrix[14]!];
}
export function transformNormal(m: readonly number[], v: readonly number[]): [number, number, number] {
  const scales = [Math.max(Math.abs(m[0]!), Math.abs(m[1]!), Math.abs(m[2]!)), Math.max(Math.abs(m[4]!), Math.abs(m[5]!), Math.abs(m[6]!)), Math.max(Math.abs(m[8]!), Math.abs(m[9]!), Math.abs(m[10]!))];
  if (scales.some((scale) => !(scale > 0) || !Number.isFinite(scale))) throw new RangeError("Cannot transform normals with a singular matrix");
  const a=m[0]!/scales[0]!, b=m[4]!/scales[1]!, c=m[8]!/scales[2]!, d=m[1]!/scales[0]!, e=m[5]!/scales[1]!, f=m[9]!/scales[2]!, g=m[2]!/scales[0]!, h=m[6]!/scales[1]!, i=m[10]!/scales[2]!;
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  if (!Number.isFinite(det) || det === 0) throw new RangeError("Cannot transform normals with a singular matrix");
  // A = B*diag(scales), so A^-T*v = B^-T*(v/scales). Scale the
  // right-hand side in log space to avoid overflow for very small axes.
  const logs = scales.map((scale, index) => v[index] === 0 ? -Infinity : Math.log(Math.abs(v[index]!)) - Math.log(scale));
  const maximum = Math.max(...logs);
  if (!Number.isFinite(maximum)) throw new RangeError("Cannot transform a zero or non-finite normal");
  const source = logs.map((value, index) => value === -Infinity ? 0 : Math.sign(v[index]!) * Math.exp(value - maximum));
  const sign = Math.sign(det);
  const x=((e*i-f*h)*source[0]!+(f*g-d*i)*source[1]!+(d*h-e*g)*source[2]!)*sign;
  const y=((c*h-b*i)*source[0]!+(a*i-c*g)*source[1]!+(b*g-a*h)*source[2]!)*sign;
  const z=((b*f-c*e)*source[0]!+(c*d-a*f)*source[1]!+(a*e-b*d)*source[2]!)*sign;
  const length=Math.hypot(x,y,z); if (!(length > 0) || !Number.isFinite(length)) throw new RangeError("Cannot transform a zero or non-finite normal"); return [x/length,y/length,z/length];
}

/** Copy JSON metadata without retaining aliases to the mutable runtime scene.
 * Reject accessors, cycles and non-JSON values instead of silently losing them. */
function copyMetadata(source: object): Readonly<Record<string, unknown>> {
  const active = new Set<object>();
  let visited = 0;
  const copy = (value: unknown, depth: number): unknown => {
    if (++visited > 100_000 || depth > 64) throw new Error("Metadata exceeds snapshot limits");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || active.has(value)) throw new Error("Metadata is not finite acyclic JSON");
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error("Metadata contains a non-JSON object");
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const result: unknown[] = [];
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !("value" in descriptor)) throw new Error("Metadata arrays must contain data values");
          result.push(copy(descriptor.value, depth + 1));
        }
        return result;
      }
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) throw new Error("Metadata properties must be data values");
        Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return result;
    } finally { active.delete(value); }
  };
  if (Array.isArray(source)) throw new Error("Node metadata must be an object");
  return copy(source, 0) as Readonly<Record<string, unknown>>;
}

/**
 * Snapshot an admitted glTF asset and its currently edited runtime scene.
 * The snapshot owns its byte arrays and is independent of asset disposal.
 * Unsupported runtime state is surfaced as sourceWarnings to every writer.
 */
export function sceneFromGLTFAsset(asset: GLTFAsset, scene?: Scene): AuraExportScene {
  if (asset.disposed) throw new Error("Cannot export a disposed glTF asset");
  if (!scene) {
    const temporary = asset.createScene();
    try { return sceneFromGLTFAsset(asset, temporary); }
    finally { temporary.dispose(); }
  }
  scene.updateWorldTransforms();
  const sourceWarnings: AuraExportWarning[] = [];
  const warn = (code: string, path: string, message: string): void => { sourceWarnings.push({ code, path, message }); };
  let requiredPointerLoss: RequiredPointerLoss | undefined =
    inspectRequiredEmissiveDefaultTrackLoss(asset.animationPointerForTrack, asset.animations);
  if (requiredPointerLoss) {
    warn("REQUIRED_ANIMATION_POINTER_LOST", requiredPointerLoss.path,
      `The required source pointer ${requiredPointerLoss.pointer} lost its original track identity.`);
  }
  const requiredPointerChannels: { channel: AuraExportPointerAnimationChannel; path: string; pointer: string }[] = [];
  warn("SOURCE_ATTRIBUTE_ENCODING_LOST", "meshes", "The runtime asset exposes decoded numeric attributes; original quantization and component encodings are unavailable.");
  warn("SOURCE_DOCUMENT_METADATA_UNAVAILABLE", "metadata", "The loaded runtime asset does not expose the source document's asset-level metadata, license or provenance.");
  const runtimeNodes: SceneNode[] = [];
  scene.root.traverse((node) => runtimeNodes.push(node));
  const nodeIndices = new Map(runtimeNodes.map((node, index) => [node, index]));
  const sourceNodeIndices = new Map<number, number>();
  runtimeNodes.forEach((node, index) => { if (typeof node.userData.gltfNodeIndex === "number") sourceNodeIndices.set(node.userData.gltfNodeIndex, index); });
  const names = new Map<string, number[]>();
  runtimeNodes.forEach((node, index) => names.set(node.name, [...(names.get(node.name) ?? []), index]));
  const dependencies: AuraExportDependency[] = [];
  const imageNames: Array<string | undefined> = [];
  for (const [index, image] of asset.images.entries()) {
    if (!image.data) { if (image.uri) warn("MISSING_IMAGE_BYTES", `images[${index}]`, "Image bytes are unavailable from the loaded asset; export does not fetch external resources."); continue; }
    const bytes = new Uint8Array(image.data);
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && [82, 73, 70, 70].every((value, i) => bytes[i] === value) && [87, 69, 66, 80].every((value, i) => bytes[i + 8] === value);
    const ktx2 = bytes.length >= 12 && [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => bytes[i] === value);
    const brand = (offset: number, expected: string): boolean => bytes[offset] === expected.charCodeAt(0) && bytes[offset + 1] === expected.charCodeAt(1) && bytes[offset + 2] === expected.charCodeAt(2) && bytes[offset + 3] === expected.charCodeAt(3);
    const boxLength = bytes.length >= 16 && brand(4, "ftyp") ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) : 0;
    let avif = false;
    if (boxLength >= 16 && boxLength <= bytes.length && boxLength % 4 === 0 && !brand(8, "avis")) {
      avif = brand(8, "avif");
      for (let offset = 16; !avif && offset < boxLength; offset += 4) avif = brand(offset, "avif");
    }
    // Data URI images need not carry a mimeType field in the source document.
    const uriMime = image.uri?.startsWith("data:") ? image.uri.slice(5).split(/[;,]/, 1)[0]?.toLowerCase() : undefined;
    const mimeType = image.mimeType ?? uriMime ?? (png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : avif ? "image/avif" : ktx2 ? "image/ktx2" : undefined);
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : mimeType === "image/avif" ? "avif" : mimeType === "image/ktx2" ? "ktx2" : "bin";
    const name = `image-${index}.${extension}`;
    imageNames[index] = name;
    dependencies.push({ name, data: new Uint8Array(image.data.slice(0)), ...(mimeType ? { mimeType } : {}) });
  }
  // Keep the exact source object used for each snapshot material. A caller's
  // provenance callback must not be able to swap an array entry between
  // material copying and the subsequent identity check.
  const sourceMaterials = Array.from(asset.materials);
  const materials: AuraExportMaterial[] = sourceMaterials.map((material, index) => {
    const texture = (info: GLTFResolvedTextureInfo | undefined, field: string): AuraExportTextureReference | undefined => {
      if (!info) return undefined;
      const name = imageNames[info.image];
      if (!name) { warn("MISSING_TEXTURE_BYTES", `materials[${index}].${field}`, "The referenced texture image was not retained by the runtime asset."); return undefined; }
      const runtimeTexture = asset.textures[info.texture];
      const sampler = runtimeTexture?.samplerDescriptor;
      if (runtimeTexture?.sampler !== undefined && !sampler) warn("TEXTURE_SAMPLER_LOST", `materials[${index}].${field}`, "The runtime asset did not retain the referenced sampler descriptor.");
      return {
        name,
        ...(info.texCoord === 0 ? {} : { texCoord: info.texCoord }),
        ...(info.transform ? { transform: { offset: [...info.transform.offset], scale: [...info.transform.scale], rotation: info.transform.rotation } } : {}),
        ...(sampler ? { sampler: { ...sampler } } : {})
      };
    };
    const coreTextures: Partial<Record<"baseColorTexture" | "metallicRoughnessTexture" | "normalTexture" | "occlusionTexture" | "emissiveTexture", string>> = {};
    const textureSettings: Partial<Record<"baseColorTexture" | "metallicRoughnessTexture" | "normalTexture" | "occlusionTexture" | "emissiveTexture", AuraExportTextureSettings>> = {};
    for (const key of ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture"] as const) {
      const reference = texture(material[key], key);
      if (!reference) continue;
      const { name, ...settings } = reference;
      coreTextures[key] = name;
      if (Object.keys(settings).length) textureSettings[key] = settings;
    }
    const clearcoat = material.clearcoat;
    const diffuseRoughness = material.diffuseRoughness;
    const bump = material.bump;
    const transmission = material.transmission;
    const diffuseTransmission = material.diffuseTransmission;
    const volume = material.volume;
    const specular = material.specular;
    const specGloss = material.pbrSpecularGlossiness;
    const sheen = material.sheen;
    const anisotropy = material.anisotropy;
    const iridescence = material.iridescence;
    // The loader synthesizes a specular fallback for specular-glossiness. It
    // has no source marker, so only report an independent, differing value.
    const sameTexture = (a: GLTFResolvedTextureInfo | undefined, b: GLTFResolvedTextureInfo | undefined): boolean =>
      a === b || (!!a && !!b && a.texture === b.texture && a.image === b.image && a.texCoord === b.texCoord &&
        ((!a.transform && !b.transform) || (!!a.transform && !!b.transform &&
          a.transform.rotation === b.transform.rotation && a.transform.offset.every((value, i) => value === b.transform!.offset[i]) &&
          a.transform.scale.every((value, i) => value === b.transform!.scale[i]))));
    if (specGloss && specular && (specular.factor !== 1 || specular.texture || specular.colorFactor.some((value, i) => value !== specGloss.specularFactor[i]) ||
      !sameTexture(specular.colorTexture, specGloss.specularGlossinessTexture))) {
      warn("MATERIAL_FEATURE_LOST", `materials[${index}].specular`, "The runtime did not retain whether this specular value was independent of its specular-glossiness fallback.");
    }
    const clearcoatNormal = texture(clearcoat?.normalTexture, "clearcoat.normalTexture");
    // The loader represents both an absent emissive-strength extension and
    // its default as 1; that number alone is not evidence of source presence.
    const gltf: AuraExportGLTFMaterial = {
      ...(Object.keys(textureSettings).length ? { textures: textureSettings } : {}),
      ...(material.emissiveStrength !== 1 ? { emissiveStrength: material.emissiveStrength } : {}),
      ...(clearcoat ? { clearcoat: { factor: clearcoat.factor, texture: texture(clearcoat.texture, "clearcoat.texture"), roughnessFactor: clearcoat.roughnessFactor, roughnessTexture: texture(clearcoat.roughnessTexture, "clearcoat.roughnessTexture"), normalTexture: clearcoatNormal ? { ...clearcoatNormal, scale: clearcoat.normalTexture!.scale } : undefined } } : {}),
      ...(diffuseRoughness ? { diffuseRoughness: { factor: diffuseRoughness.factor, texture: texture(diffuseRoughness.texture, "diffuseRoughness.texture") } } : {}),
      ...(bump ? { bump: { factor: bump.factor, texture: texture(bump.texture, "bump.texture") } } : {}),
      ...(transmission ? { transmission: { factor: transmission.factor, texture: texture(transmission.texture, "transmission.texture") } } : {}),
      ...(diffuseTransmission ? { diffuseTransmission: { factor: diffuseTransmission.factor, texture: texture(diffuseTransmission.texture, "diffuseTransmission.texture"), colorFactor: [...diffuseTransmission.colorFactor], colorTexture: texture(diffuseTransmission.colorTexture, "diffuseTransmission.colorTexture") } } : {}),
      ...(volume ? { volume: { thicknessFactor: volume.thicknessFactor, thicknessTexture: texture(volume.thicknessTexture, "volume.thicknessTexture"), ...(Number.isFinite(volume.attenuationDistance) ? { attenuationDistance: volume.attenuationDistance } : {}), attenuationColor: [...volume.attenuationColor] } } : {}),
      ...(material.ior === undefined ? {} : { ior: material.ior }),
      ...(specular && !specGloss ? { specular: { factor: specular.factor, texture: texture(specular.texture, "specular.texture"), colorFactor: [...specular.colorFactor], colorTexture: texture(specular.colorTexture, "specular.colorTexture") } } : {}),
      ...(specGloss ? { pbrSpecularGlossiness: { diffuseFactor: [...specGloss.diffuseFactor], diffuseTexture: texture(specGloss.diffuseTexture, "pbrSpecularGlossiness.diffuseTexture"), specularFactor: [...specGloss.specularFactor], glossinessFactor: specGloss.glossinessFactor, specularGlossinessTexture: texture(specGloss.specularGlossinessTexture, "pbrSpecularGlossiness.specularGlossinessTexture") } } : {}),
      ...(sheen ? { sheen: { colorFactor: [...sheen.colorFactor], colorTexture: texture(sheen.colorTexture, "sheen.colorTexture"), roughnessFactor: sheen.roughnessFactor, roughnessTexture: texture(sheen.roughnessTexture, "sheen.roughnessTexture") } } : {}),
      ...(anisotropy ? { anisotropy: { strength: anisotropy.strength, rotation: anisotropy.rotation, texture: texture(anisotropy.texture, "anisotropy.texture") } } : {}),
      ...(iridescence ? { iridescence: { factor: iridescence.factor, texture: texture(iridescence.texture, "iridescence.texture"), ior: iridescence.ior, thicknessMinimum: iridescence.thicknessMinimum, thicknessMaximum: iridescence.thicknessMaximum, thicknessTexture: texture(iridescence.thicknessTexture, "iridescence.thicknessTexture") } } : {}),
      ...(material.dispersion === undefined ? {} : { dispersion: material.dispersion })
    };
    const baseColor: [number, number, number, number] = [...material.baseColorFactor];
    const emissive: [number, number, number] = [...material.emissiveFactor];
    return { name: material.name, baseColor, metallic: material.metallicFactor, roughness: material.roughnessFactor, emissive, alphaMode: material.alphaMode, alphaCutoff: material.alphaCutoff, doubleSided: material.doubleSided, ...coreTextures, ...(coreTextures.normalTexture ? { normalTextureScale: material.normalTexture?.scale } : {}), ...(coreTextures.occlusionTexture ? { occlusionStrength: material.occlusionTexture?.strength } : {}), ...(material.unlit ? { unlit: true } : {}), ...(Object.keys(gltf).length ? { gltf } : {}) };
  });
  const flatten = (rows: readonly (readonly number[])[], size: 1 | 2 | 3 | 4 | 16): AuraExportAttribute => ({ values: new Float32Array(rows.flatMap((row) => [...row])), itemSize: size });
  const primitives = (mesh: GLTFMeshAsset): AuraExportPrimitive => {
    const attributes: Record<string, AuraExportAttribute> = { POSITION: flatten(mesh.positions, 3) };
    if (mesh.normals.length) attributes.NORMAL = flatten(mesh.normals, 3);
    if (mesh.tangents.length) attributes.TANGENT = flatten(mesh.tangents, 4);
    if (mesh.colors.length) attributes.COLOR_0 = flatten(mesh.colors, 4);
    if (mesh.texcoordSets.length) mesh.texcoordSets.forEach((rows, index) => { if (rows.length) attributes[`TEXCOORD_${index}`] = flatten(rows, 2); });
    else if (mesh.texcoords.length) attributes.TEXCOORD_0 = flatten(mesh.texcoords, 2);
    if (mesh.joints.length) attributes.JOINTS_0 = { values: Uint16Array.from(mesh.joints.flatMap((row) => [...row])), itemSize: 4 };
    if (mesh.weights.length) attributes.WEIGHTS_0 = flatten(mesh.weights, 4);
    if (mesh.joints1?.length) attributes.JOINTS_1 = { values: Uint16Array.from(mesh.joints1.flatMap((row) => [...row])), itemSize: 4 };
    if (mesh.weights1?.length) attributes.WEIGHTS_1 = flatten(mesh.weights1, 4);
    const targets = mesh.morphTargets.map((target) => ({ ...(target.positions.length ? { POSITION: flatten(target.positions, 3) } : {}), ...(target.normals.length ? { NORMAL: flatten(target.normals, 3) } : {}), ...(target.tangents.length ? { TANGENT: flatten(target.tangents, 3) } : {}) }));
    if (mesh.materialVariants.length) warn("MATERIAL_VARIANTS_LOST", `meshes[${mesh.name}]`, "Material variants are not represented in the interchange snapshot.");
    return { attributes, ...(mesh.indices ? { indices: Uint32Array.from(mesh.indices) } : {}), mode: mesh.topology, ...(mesh.materialIndex === undefined ? {} : { material: mesh.materialIndex }), ...(targets.length ? { targets } : {}) };
  };
  const meshes: AuraExportMesh[] = asset.meshes.map((mesh) => ({ name: mesh.name, primitives: [primitives(mesh)], ...(mesh.morphWeights.length ? { weights: [...mesh.morphWeights] } : {}) }));
  const meshNames = new Map<string, number[]>();
  asset.meshes.forEach((mesh, index) => meshNames.set(mesh.name, [...(meshNames.get(mesh.name) ?? []), index]));
  const materialNames = new Map<string, number[]>();
  sourceMaterials.forEach((material, index) => materialNames.set(material.name, [...(materialNames.get(material.name) ?? []), index]));
  const skins: AuraExportSkin[] = [];
  const skinIndices = new Map<number, number>();
  asset.skins.forEach((skin, index) => {
    const joints = skin.joints.map((joint) => sourceNodeIndices.get(joint));
    if (joints.some((joint) => joint === undefined)) { warn("SKIN_JOINTS_UNAVAILABLE", `skins[${index}]`, "One or more joints are absent from the selected runtime scene; the skin was omitted."); return; }
    const skeleton = skin.skeletonRoot === undefined ? undefined : sourceNodeIndices.get(skin.skeletonRoot);
    if (skin.skeletonRoot !== undefined && skeleton === undefined) warn("SKIN_ROOT_UNAVAILABLE", `skins[${index}].skeletonRoot`, "The skin skeleton root is absent from the selected scene.");
    skinIndices.set(index, skins.length);
    skins.push({ name: skin.name, joints: joints as number[], ...(skeleton === undefined ? {} : { skeleton }), inverseBindMatrices: flatten(skin.inverseBindMatrices, 16) });
  });
  const cameras: AuraExportCamera[] = [];
  const lights: AuraExportLight[] = [];
  const nodes: AuraExportNode[] = runtimeNodes.map((node, index) => {
    const transform = node.transform;
    const pivot = (transform as typeof transform & { readonly pivot?: readonly number[] }).pivot;
    const hasPivot = pivot?.some((value: number) => value !== 0) ?? false;
    const position = transform.matrixAutoUpdate && !hasPivot
      ? { translation: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale] }
      : { matrix: [...transform.localMatrix] };
    let meshIndex: number | undefined;
    let skin: number | undefined;
    let instances: AuraExportInstances | undefined;
    if (node.renderable) {
      const matches = meshNames.get(node.renderable.geometry) ?? [];
      if (matches.length === 1) {
        meshIndex = matches[0];
        const sourceMesh = asset.meshes[meshIndex!]!;
        const sourceSkin = sourceMesh.skinIndex;
        if (sourceSkin !== undefined) skin = skinIndices.get(sourceSkin);
        const materialName = node.renderable.material.split("#aura3d-runtime:")[0]!;
        const materialMatches = materialNames.get(materialName) ?? [];
        if (materialName !== sourceMesh.material) {
          if (materialMatches.length === 1) {
            const base = meshes[meshIndex!]!;
            meshIndex = meshes.length;
            meshes.push({ ...base, primitives: base.primitives.map((primitive) => ({ ...primitive, material: materialMatches[0]! })) });
          } else warn("RENDERABLE_MATERIAL_UNAVAILABLE", `nodes[${index}].renderable.material`, "The edited material does not resolve uniquely in the supplied asset; the source binding was retained.");
        }
      }
      else warn("RENDERABLE_GEOMETRY_UNAVAILABLE", `nodes[${index}].renderable`, matches.length ? "The geometry name is ambiguous." : "The renderable geometry does not belong to the supplied asset.");
      if (node.renderable.instanceTransforms !== undefined) {
        if (meshIndex === undefined) warn("INSTANCING_LOST", `nodes[${index}].renderable`, "Instance transforms and colors cannot be exported without a resolved mesh.");
        else {
          instances = {
            transforms: new Float32Array(node.renderable.instanceTransforms),
            ...(node.renderable.instanceColors === undefined ? {} : { colors: new Float32Array(node.renderable.instanceColors) })
          };
          if (node.renderable.instanceColors !== undefined) warn("INSTANCE_COLOR_TARGET_UNAVAILABLE", `nodes[${index}].renderable.instanceColors`, "The snapshot does not contain the runtime material's instance-color target; the exported custom color convention uses the base-color target.");
        }
      } else if (node.renderable.instanceColors !== undefined) {
        warn("INSTANCE_COLOR_LOST", `nodes[${index}].renderable.instanceColors`, "Instance colors have no corresponding instance transforms.");
      }
    }
    const candidate = node as SceneNode & { kind?: string; color?: unknown; intensity?: number; range?: number; angle?: number; penumbra?: number; fovYRadians?: number; aspect?: number; near?: number; far?: number; left?: number; right?: number; bottom?: number; top?: number; zoom?: number };
    let camera: number | undefined, light: number | undefined;
    if (candidate.fovYRadians !== undefined) { camera = cameras.length; cameras.push({ name: node.name, type: "perspective", perspective: { yfov: candidate.fovYRadians, znear: candidate.near!, zfar: candidate.far, aspectRatio: candidate.aspect } }); }
    else if (candidate.left !== undefined && candidate.right !== undefined && candidate.bottom !== undefined && candidate.top !== undefined) { camera = cameras.length; cameras.push({ name: node.name, type: "orthographic", orthographic: { xmag: (candidate.right - candidate.left) / (2 * (candidate.zoom ?? 1)), ymag: (candidate.top - candidate.bottom) / (2 * (candidate.zoom ?? 1)), znear: candidate.near!, zfar: candidate.far! } }); }
    if (candidate.kind === "point" || candidate.kind === "directional" || candidate.kind === "spot") {
      const c = candidate.color as readonly number[] | { x: number; y: number; z: number } | undefined;
      const color: [number, number, number] = Array.isArray(c) ? [c[0]!, c[1]!, c[2]!] : c && "x" in c ? [c.x, c.y, c.z] : [1, 1, 1];
      light = lights.length; lights.push({ name: node.name, type: candidate.kind, color, intensity: candidate.intensity, ...(candidate.range === undefined ? {} : { range: candidate.range }), ...(candidate.kind === "spot" ? { spot: { outerConeAngle: candidate.angle, innerConeAngle: candidate.angle === undefined ? undefined : candidate.angle * (1 - (candidate.penumbra ?? 0)) } } : {}) });
    } else if (candidate.kind) warn("LIGHT_TYPE_LOST", `nodes[${index}]`, `Light type ${candidate.kind} is not supported by the snapshot.`);
    if (!node.visible) warn("VISIBILITY_LOST", `nodes[${index}].visible`, "Runtime visibility is not represented in the interchange scene.");
    let metadata: Readonly<Record<string, unknown>> | undefined;
    if (node.userData.gltfExtras !== undefined) {
      try {
        if (!node.userData.gltfExtras || typeof node.userData.gltfExtras !== "object") throw new Error("Node metadata must be an object");
        metadata = copyMetadata(node.userData.gltfExtras);
      } catch {
        warn("RUNTIME_METADATA_LOST", `nodes[${index}].userData.gltfExtras`, "Node extras are not bounded JSON data and were omitted from the independent snapshot.");
      }
    }
    if (Object.keys(node.userData).some((key) => key !== "gltfExtras" && key !== "gltfNodeIndex" && key !== "gltfSceneContainer" && !(metadata && key.startsWith("a3d_") && key in metadata))) warn("RUNTIME_METADATA_LOST", `nodes[${index}].userData`, "Runtime-only node metadata is not represented in the loaded asset snapshot.");
    return { name: node.name, ...position, ...(node.children.length ? { children: node.children.map((child) => nodeIndices.get(child)!) } : {}), ...(meshIndex === undefined ? {} : { mesh: meshIndex }), ...(node.renderable?.morphWeights.length ? { weights: [...node.renderable.morphWeights] } : {}), ...(skin === undefined ? {} : { skin }), ...(camera === undefined ? {} : { camera }), ...(light === undefined ? {} : { light }), ...(metadata ? { metadata } : {}), ...(instances === undefined ? {} : { instances }) };
  });
  const emissiveStrengthPointerField = "extensions/KHR_materials_emissive_strength/emissiveStrength";
  const animations: AuraExportAnimation[] = asset.animations.flatMap((animation, animationIndex) => {
    if (animation.events.length) warn("ANIMATION_EVENTS_LOST", `animations[${animationIndex}]`, "Animation event markers are not represented in the interchange snapshot.");
    const channels: AuraExportAnimationChannel[] = [];
    const pointerChannels: AuraExportPointerAnimationChannel[] = [];
    const seenPointers = new Set<string>();
    // The runtime stores material tracks by name, not source index. Only
    // uniquely named materials and properties actually retained in the
    // snapshot can be mapped back without guessing.
    const materialFields: readonly { target: string; pointer: string; size: 1 | 2 | 3 | 4; min: number; max: number; available: (m: AuraExportMaterial) => boolean; valueType: "scalar" | "vector3" | "number-array" }[] = [
      { target: "pbrMetallicRoughness.baseColorFactor", pointer: "pbrMetallicRoughness/baseColorFactor", size: 4, min: 0, max: 1, valueType: "number-array", available: (m) => m.baseColor !== undefined },
      { target: "pbrMetallicRoughness.metallicFactor", pointer: "pbrMetallicRoughness/metallicFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => m.metallic !== undefined },
      { target: "pbrMetallicRoughness.roughnessFactor", pointer: "pbrMetallicRoughness/roughnessFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => m.roughness !== undefined },
      { target: "emissiveFactor", pointer: "emissiveFactor", size: 3, min: 0, max: 1, valueType: "vector3", available: (m) => m.emissive !== undefined },
      { target: "alphaCutoff", pointer: "alphaCutoff", size: 1, min: 0, max: Infinity, valueType: "scalar", available: (m) => m.alphaCutoff !== undefined },
      { target: "normalTexture.scale", pointer: "normalTexture/scale", size: 1, min: -Infinity, max: Infinity, valueType: "scalar", available: (m) => m.normalTexture !== undefined && m.normalTextureScale !== undefined },
      { target: "occlusionTexture.strength", pointer: "occlusionTexture/strength", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => m.occlusionTexture !== undefined && m.occlusionStrength !== undefined },
      { target: "extensions.KHR_materials_clearcoat.clearcoatFactor", pointer: "extensions/KHR_materials_clearcoat/clearcoatFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => m.gltf?.clearcoat?.factor !== undefined },
      { target: "extensions.KHR_materials_clearcoat.clearcoatRoughnessFactor", pointer: "extensions/KHR_materials_clearcoat/clearcoatRoughnessFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => m.gltf?.clearcoat?.roughnessFactor !== undefined },
      { target: "extensions.KHR_materials_emissive_strength.emissiveStrength", pointer: emissiveStrengthPointerField, size: 1, min: 0, max: Infinity, valueType: "scalar", available: (m) => m.gltf?.emissiveStrength !== undefined },
      { target: "extensions.KHR_materials_specular.specularFactor", pointer: "extensions/KHR_materials_specular/specularFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => !m.unlit && !m.gltf?.pbrSpecularGlossiness && m.gltf?.specular?.factor !== undefined },
      { target: "extensions.KHR_materials_sheen.sheenRoughnessFactor", pointer: "extensions/KHR_materials_sheen/sheenRoughnessFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => !m.unlit && !m.gltf?.pbrSpecularGlossiness && m.gltf?.sheen?.roughnessFactor !== undefined },
      { target: "extensions.KHR_materials_iridescence.iridescenceFactor", pointer: "extensions/KHR_materials_iridescence/iridescenceFactor", size: 1, min: 0, max: 1, valueType: "scalar", available: (m) => !m.unlit && !m.gltf?.pbrSpecularGlossiness && m.gltf?.iridescence?.factor !== undefined },
      { target: "extensions.KHR_materials_iridescence.iridescenceIor", pointer: "extensions/KHR_materials_iridescence/iridescenceIor", size: 1, min: 1, max: Infinity, valueType: "scalar", available: (m) => !m.unlit && !m.gltf?.pbrSpecularGlossiness && m.gltf?.iridescence?.ior !== undefined },
      ...GLTF_TEXTURE_TRANSFORM_BINDINGS.flatMap(({ pointer, texture }) =>
        (["offset", "scale", "rotation"] as const).map((leaf) => {
          const field = `${pointer}/extensions/KHR_texture_transform/${leaf}`;
          return {
            target: field.replaceAll("/", "."), pointer: field,
            size: leaf === "rotation" ? 1 as const : 2 as const,
            min: -Infinity, max: Infinity,
            valueType: leaf === "rotation" ? "scalar" as const : "number-array" as const,
            available: (material: AuraExportMaterial) => texture(material)?.transform !== undefined
          };
        })
      )
    ];
    for (const [trackIndex, track] of animation.tracks.entries()) {
      const trackPath = `animations[${animationIndex}].tracks[${trackIndex}]`;
      const candidate = asset.animationPointerForTrack?.(track);
      // Structural adapters need not provide this optional capability. If they
      // do, snapshot only a well-formed value; never retain a mutable reference
      // to an adapter's provenance object.
      const source: GLTFAnimationPointerTrackProvenance | undefined = candidate
        && Number.isSafeInteger(candidate.animationIndex) && candidate.animationIndex >= 0
        && Number.isSafeInteger(candidate.channelIndex) && candidate.channelIndex >= 0
        && typeof candidate.pointer === "string" && typeof candidate.required === "boolean"
        ? Object.freeze({ animationIndex: candidate.animationIndex, channelIndex: candidate.channelIndex,
          pointer: candidate.pointer, required: candidate.required }) : undefined;
      const sourceNodeIndex = asset.nodeIndexForTrack?.(track);
      const trackLost = (code: string, message: string): void => {
        warn(code, trackPath, message);
        if (source?.required) {
          requiredPointerLoss ??= { path: trackPath, pointer: source.pointer, message };
          warn("REQUIRED_ANIMATION_POINTER_LOST", trackPath,
            `The required source pointer ${source.pointer} could not be fully represented in the snapshot.`);
        }
      };
      if (!source && (candidate !== undefined || !asset.animationPointerForTrack || sourceNodeIndex === undefined)) {
        warn("ANIMATION_POINTER_ORIGIN_UNAVAILABLE", trackPath,
          "This track has no verified source identity; its original pointer status and requiredness are unknown.");
      }
      const split = track.target.lastIndexOf("."); const path = track.target.slice(split + 1); const target = names.get(track.target.slice(0, split));
      const sourceNode = source && /^\/nodes\/(0|[1-9]\d*)\/(translation|rotation|scale|weights)$/.exec(source.pointer);
      const sourceMaterial = source && /^\/materials\/(0|[1-9]\d*)\/(.+)$/.exec(source.pointer);
      const sourceLight = source && /^\/(?:extensions\/KHR_lights_punctual\/)?lights\/(0|[1-9]\d*)\/(intensity|color|range)$/.exec(source.pointer);
      let pointers: string[] | undefined;
      let materialTarget: { index: number; pointer: string; restoreEmissiveDefault: boolean } | undefined;
      let pointerSize: 1 | 2 | 3 | 4 = 1, pointerMin = -Infinity, pointerMax = Infinity, pointerPositive = false;
      let pointerValueType: "scalar" | "vector3" | "number-array" | undefined;
      const lightIdentity = getGLTFLightAnimationTrackIdentity(track);
      if (lightIdentity && lightIdentity.publicTarget === track.target) {
        pointerSize = lightIdentity.leaf === "color" ? 3 : 1;
        pointerValueType = lightIdentity.leaf === "color" ? "vector3" : "scalar";
        pointerMin = 0; pointerMax = lightIdentity.leaf === "color" ? 1 : Infinity;
        pointerPositive = lightIdentity.leaf === "range";
        pointers = [];
        for (const [index, node] of runtimeNodes.entries()) {
          const identity = getGLTFLightSceneIdentity(node);
          const lightIndex = nodes[index]?.light;
          if (!identity || identity.owner !== lightIdentity.owner || identity.definitionIndex !== lightIdentity.definitionIndex || lightIndex === undefined) continue;
          const light = lights[lightIndex];
          if (light[lightIdentity.leaf] === undefined || (lightIdentity.leaf === "range" && light.type === "directional")) continue;
          pointers.push(`/extensions/KHR_lights_punctual/lights/${lightIndex}/${lightIdentity.leaf}`);
        }
      } else if (track.target.startsWith("material:")) {
        const candidates = materials.flatMap((material, index) => materialFields.flatMap((field) => {
          if (typeof material.name !== "string" || materialNames.get(material.name)?.length !== 1 ||
              track.target !== `material:${material.name}.${field.target}`) return [];
          const sourceIdentity = field.pointer === emissiveStrengthPointerField
            ? inspectRequiredEmissiveDefaultSource(track, candidate, sourceMaterials[index])
            : undefined;
          // Even a substituted nondefault material must not acquire the
          // required identity of a genuinely default-authored source track.
          if (source?.required && sourceIdentity !== undefined &&
              (sourceIdentity === "changed" || asset.materials[index] !== sourceMaterials[index])) return [];
          const restoreEmissiveDefault = field.pointer === emissiveStrengthPointerField &&
            !field.available(material) && !material.unlit && source?.required === true &&
            sourceIdentity === "verified" && sourceMaterials[index]?.emissiveStrength === 1 &&
            asset.loaderDiagnostics.extensionsRequired.includes("KHR_animation_pointer") &&
            asset.loaderDiagnostics.extensionsUsed.includes("KHR_animation_pointer") &&
            asset.loaderDiagnostics.extensionsUsed.includes("KHR_materials_emissive_strength");
          return field.available(material) || restoreEmissiveDefault ? [{ index, field, restoreEmissiveDefault }] : [];
        }));
        if (candidates.length === 1) {
          const { index, field, restoreEmissiveDefault } = candidates[0];
          materialTarget = { index, pointer: field.pointer, restoreEmissiveDefault };
          pointers = [`/materials/${index}/${field.pointer}`];
          pointerSize = field.size; pointerMin = field.min; pointerMax = field.max;
          pointerValueType = field.valueType;
        } else pointers = [];
      }
      if (pointers && !pointers.length) {
        const unknownEmissiveDefault = materials.some((material, index) =>
          material.name !== undefined && materialNames.get(material.name)?.length === 1 &&
          track.target === `material:${material.name}.${emissiveStrengthPointerField.replaceAll("/", ".")}` &&
          sourceMaterials[index]?.emissiveStrength === 1 && material.gltf?.emissiveStrength === undefined);
        trackLost("ANIMATION_TRACK_LOST", unknownEmissiveDefault
          ? "The default emissive-strength extension cannot be recovered without matching loader-time material and authored-default evidence, a declared required pointer, and an exportable material."
          : "The material or light target is ambiguous, missing, or not representable in the exported snapshot.");
        continue;
      }
      if (pointerValueType && track.valueType !== pointerValueType) { trackLost("ANIMATION_TRACK_LOST", "The property track has an incompatible value type."); continue; }
      if (!pointers && (split < 0 || !target || target.length !== 1 || !["translation", "rotation", "scale", "weights"].includes(path))) { trackLost("ANIMATION_TRACK_LOST", "The target is ambiguous, missing, or not a supported node transform or weights track."); continue; }

      // Track identity alone is insufficient after a caller edits its target.
      // Check the loader's source pointer against the resolved runtime binding
      // before associating any newly emitted channel with that provenance.
      if (source) {
        const nodeIndex = sourceNode ? Number(sourceNode[1]) : undefined;
        const materialIndex = sourceMaterial ? Number(sourceMaterial[1]) : undefined;
        const nodeMatches = sourceNode && sourceNode[0] === source.pointer && Number.isSafeInteger(nodeIndex) && sourceNodeIndex === nodeIndex
          && sourceNode[2] === path && !pointers && target?.length === 1
          && runtimeNodes[target[0]!]!.userData.gltfNodeIndex === nodeIndex
          && runtimeNodes.filter((node) => node.userData.gltfNodeIndex === nodeIndex).length === 1;
        const materialMatches = sourceMaterial && sourceMaterial[0] === source.pointer && Number.isSafeInteger(materialIndex)
          && sourceMaterials[materialIndex!]?.name !== undefined
          && track.target === `material:${sourceMaterials[materialIndex!]!.name}.${sourceMaterial[2]!.replaceAll("/", ".")}`
          && materialTarget !== undefined && materialTarget.index === materialIndex
          && materials[materialTarget.index]?.name === sourceMaterials[materialIndex!]!.name
          && materialTarget.pointer === sourceMaterial[2] && pointers?.length === 1;
        const lightMatches = sourceLight && sourceLight[0] === source.pointer && Number.isSafeInteger(Number(sourceLight[1]))
          && lightIdentity?.owner === asset.lights && lightIdentity.definitionIndex === Number(sourceLight[1])
          && lightIdentity.leaf === sourceLight[2] && lightIdentity.publicTarget === track.target && !!pointers;
        if (!nodeMatches && !materialMatches && !lightMatches) {
          trackLost("ANIMATION_TRACK_LOST", "The source pointer no longer matches the runtime track and its resolved target.");
          continue;
        }
      }
      const modes = new Set<string>(track.keyframes.map((keyframe) => keyframe.interpolation ?? "linear"));
      if (modes.size !== 1 || !["linear", "step", "cubicspline"].includes([...modes][0]!)) { trackLost("ANIMATION_INTERPOLATION_LOST", "Mixed or unsupported interpolation is not represented by the interchange snapshot; the track was omitted."); continue; }
      const mode = [...modes][0]!; const numeric = (value: unknown): number[] | undefined => typeof value === "number" && Number.isFinite(value) ? [value] : Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? value : undefined;
      const values: number[] = []; let valid = true;
      for (const frame of track.keyframes) {
        const value = numeric(frame.value); const incoming = numeric(frame.inTangent); const outgoing = numeric(frame.outTangent);
        const matchesType = (item: unknown): boolean => pointerValueType === undefined || (pointerValueType === "scalar" ? typeof item === "number" : Array.isArray(item));
        if (!value || !matchesType(frame.value) || (mode === "cubicspline" && (!incoming || !outgoing || !matchesType(frame.inTangent) || !matchesType(frame.outTangent))) || (pointers && (value.length !== pointerSize || value.some((v) => v < pointerMin || v > pointerMax || (pointerPositive && v === 0)) || (mode === "cubicspline" && (incoming!.length !== pointerSize || outgoing!.length !== pointerSize))))) { valid = false; break; }
        if (mode === "cubicspline") values.push(...incoming!); values.push(...value); if (mode === "cubicspline") values.push(...outgoing!);
      }
      if (!valid) { trackLost("ANIMATION_TRACK_LOST", "The track contains unsupported values or missing cubic tangents."); continue; }
      if (pointers) {
        const timeValues = Float32Array.from(track.keyframes.map((frame) => frame.time));
        const dataValues = Float32Array.from(values);
        if (!timeValues.length || timeValues.some((time, i) => !Number.isFinite(time) || time < 0 || (time === 0 && track.keyframes[i].time !== 0) || (i > 0 && time <= timeValues[i - 1])) || dataValues.some((value, i) => !Number.isFinite(value) || (value === 0 && values[i] !== 0)) || (pointerPositive && track.keyframes.some((frame) => Math.fround(frame.value as number) <= 0))) {
          trackLost("ANIMATION_TRACK_LOST", "The property track cannot be represented with finite glTF FLOAT values and increasing times.");
          continue;
        }
        const times = { values: timeValues, itemSize: 1 as const };
        const data = { values: dataValues, itemSize: pointerSize };
        const interpolation = mode === "step" ? "STEP" as const : mode === "cubicspline" ? "CUBICSPLINE" as const : "LINEAR" as const;
        for (const pointer of pointers) {
          if (seenPointers.has(pointer)) { trackLost("ANIMATION_TRACK_LOST", "A previous track already targets the same exported property."); continue; }
          if (materialTarget?.restoreEmissiveDefault) {
            // These are newly created snapshot objects, not the loader's
            // material or the caller's provenance. Do this only after the
            // track and its full curve have passed all validation.
            const material = materials[materialTarget.index]!;
            Object.assign(material, { gltf: { ...material.gltf, emissiveStrength: 1 } });
          }
          const channel = { pointer, times, values: data, interpolation };
          seenPointers.add(pointer); pointerChannels.push(channel);
          if (source && sourceMaterial) {
            // Source and output indices are different concepts: provenance
            // attaches to the resolved snapshot material, not the source index.
            const index = materialTarget!.index;
            registerExportPointerProvenance(channel, source, "material", index, materials[index]!);
          } else if (source && sourceLight) {
            const match = /^\/extensions\/KHR_lights_punctual\/lights\/(0|[1-9]\d*)\//.exec(pointer)!;
            const index = Number(match[1]);
            registerExportPointerProvenance(channel, source, "light", index, lights[index]!);
          }
          if (source?.required) requiredPointerChannels.push({ channel, path: trackPath, pointer: source.pointer });
        }
        continue;
      }
      const itemSize: AuraExportAttribute["itemSize"] = path === "weights" ? 1 : path === "rotation" ? 4 : 3;
      let targetNodes = [target![0]!];
      if (path === "weights" && nodes[target![0]!]!.mesh === undefined) {
        // The runtime splits a multi-primitive glTF mesh into synthetic child
        // renderables. Bind morph animation to each such child, never to
        // unrelated authored descendants.
        targetNodes = runtimeNodes[target![0]!]!.children
          .filter((child) => child.renderable && typeof child.userData.gltfNodeIndex !== "number")
          .map((child) => nodeIndices.get(child)!)
          .filter((index) => { const mesh = nodes[index]?.mesh; return mesh !== undefined && (meshes[mesh]?.primitives[0]?.targets?.length ?? 0) > 0; });
      }
      if (!targetNodes.length) { trackLost("ANIMATION_TRACK_LOST", "The morph animation target has no corresponding snapshot mesh."); continue; }
      for (const targetNode of targetNodes) {
        const times = { values: Float32Array.from(track.keyframes.map((frame) => frame.time)), itemSize: 1 as const };
        const data = { values: Float32Array.from(values), itemSize };
        const interpolation = mode === "step" ? "STEP" as const : mode === "cubicspline" ? "CUBICSPLINE" as const : "LINEAR" as const;
        if (source && sourceNode) {
          if (path !== "weights" && nodes[targetNode]!.matrix) {
            trackLost("ANIMATION_TRACK_LOST", "The node pointer targets a matrix transform instead of TRS.");
            continue;
          }
          const pointer = `/nodes/${targetNode}/${path}`;
          if (seenPointers.has(pointer)) { trackLost("ANIMATION_TRACK_LOST", "A previous track already targets the same exported property."); continue; }
          const channel = { pointer, times, values: data, interpolation };
          seenPointers.add(pointer); pointerChannels.push(channel);
          const meshIndex = path === "weights" ? nodes[targetNode]!.mesh : undefined;
          registerExportPointerProvenance(channel, source, "node", targetNode, nodes[targetNode]!,
            meshIndex, meshIndex === undefined ? undefined : meshes[meshIndex]);
          if (source.required) requiredPointerChannels.push({ channel, path: trackPath, pointer: source.pointer });
        } else {
          const channel = { node: targetNode, path: path as AuraExportAnimationChannel["path"], times, values: data, interpolation };
          channels.push(channel);
          if (candidate === undefined && asset.animationPointerForTrack && sourceNodeIndex !== undefined) importedCoreChannels.add(channel);
        }
      }
    }
    if (!channels.length && !pointerChannels.length) {
      warn("ANIMATION_CLIP_LOST", `animations[${animationIndex}]`, "No animation tracks could be represented; the empty clip was omitted.");
      return [];
    }
    return [{ name: animation.name, channels, ...(pointerChannels.length ? { pointerChannels } : {}) }];
  });
  const snapshot: AuraExportScene = { nodes, roots: [0], meshes, materials, cameras, lights, skins, animations, dependencies, sourceWarnings, metersPerUnit: 1, upAxis: "Y", uvOrigin: "top-left" };
  const contract: RequiredPointerSnapshotContract = {
    ...(requiredPointerLoss ? { loss: requiredPointerLoss } : {}),
    channels: requiredPointerChannels
  };
  requiredPointerSnapshots.set(snapshot, contract);
  requiredPointerSnapshots.set(sourceWarnings, contract);
  return snapshot;
}
