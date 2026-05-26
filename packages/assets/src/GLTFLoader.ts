import {
  PointLight,
  composeMat4,
  decomposeMat4,
  invertMat4,
  multiplyMat4,
  Renderable,
  Scene,
  SpotLight,
  type Mat4 as SceneMat4,
  type Quat as SceneQuat,
  type SceneNode,
  type Vec3 as SceneVec3
} from "@aura3d/scene";
import { AnimationClip, AnimationTrack, Skeleton, type Mat4, type Quat, type SerializedAnimationClip, type SkinningPalette, type TrackValueType, type Vec3 } from "@aura3d/animation";
import type { AssetLoadProgress, AssetLoadRequest, AssetLoader } from "./AssetLoader";
import {
  evaluateGLTFExtensionSupport,
  type GLTFExtensionSupportEvaluation
} from "./GLTFExtensionSupport";
import type { LoadContext } from "./LoadContext";

type GLTFComponentType = 5120 | 5121 | 5122 | 5123 | 5125 | 5126;
type GLTFSparseIndexComponentType = 5121 | 5123 | 5125;
type GLTFAccessorType = "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";

const DEFAULT_GLTF_MATERIAL_NAME = "default-material";
const RUNTIME_MATERIAL_KEY_MARKER = "#aura3d-runtime:";
const DISPOSE_GLTF_ASSET = Symbol("disposeGLTFAsset");
const MAX_RENDERABLE_SKIN_JOINTS = 64;

interface GLTFBuffer {
  readonly uri?: string;
  readonly byteLength: number;
}

interface GLTFBufferView {
  readonly buffer: number;
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
  readonly extensions?: {
    readonly EXT_meshopt_compression?: GLTFMeshoptCompressionExtension;
    readonly KHR_meshopt_compression?: GLTFMeshoptCompressionExtension;
  };
}

interface GLTFMeshoptCompressionExtension {
  readonly buffer: number;
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride: number;
  readonly count: number;
  readonly mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES";
  readonly filter?: "NONE" | "OCTAHEDRAL" | "QUATERNION" | "EXPONENTIAL" | "COLOR";
}

interface GLTFAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: GLTFComponentType;
  readonly count: number;
  readonly type: GLTFAccessorType;
  readonly normalized?: boolean;
  readonly sparse?: GLTFSparseAccessor;
}

interface GLTFSparseAccessor {
  readonly count: number;
  readonly indices: {
    readonly bufferView: number;
    readonly byteOffset?: number;
    readonly componentType: GLTFSparseIndexComponentType;
  };
  readonly values: {
    readonly bufferView: number;
    readonly byteOffset?: number;
  };
}

interface GLTFPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
  readonly targets?: readonly Readonly<Record<string, number>>[];
  readonly mode?: number;
  readonly extensions?: {
    readonly KHR_draco_mesh_compression?: {
      readonly bufferView: number;
      readonly attributes: Readonly<Record<string, number>>;
    };
    readonly KHR_materials_variants?: {
      readonly mappings?: readonly {
        readonly material: number;
        readonly variants: readonly number[];
      }[];
    };
  };
}

interface GLTFMesh {
  readonly name?: string;
  readonly primitives: readonly GLTFPrimitive[];
  readonly weights?: readonly number[];
}

interface GLTFNode {
  readonly name?: string;
  readonly camera?: number;
  readonly mesh?: number;
  readonly skin?: number;
  readonly children?: readonly number[];
  readonly translation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly matrix?: readonly number[];
  readonly extras?: Readonly<Record<string, unknown>>;
  readonly extensions?: {
    readonly KHR_lights_punctual?: {
      readonly light: number;
    };
    readonly EXT_mesh_gpu_instancing?: {
      readonly attributes: Readonly<Record<string, number>>;
    };
  };
}

interface GLTFMaterial {
  readonly name?: string;
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: readonly [number, number, number, number];
    readonly baseColorTexture?: GLTFTextureInfo;
    readonly metallicFactor?: number;
    readonly roughnessFactor?: number;
    readonly metallicRoughnessTexture?: GLTFTextureInfo;
  };
  readonly normalTexture?: GLTFTextureInfo & { readonly scale?: number };
  readonly occlusionTexture?: GLTFTextureInfo & { readonly strength?: number };
  readonly emissiveTexture?: GLTFTextureInfo;
  readonly emissiveFactor?: readonly [number, number, number];
  readonly alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  readonly alphaCutoff?: number;
  readonly doubleSided?: boolean;
  readonly extensions?: {
    readonly KHR_materials_unlit?: Record<string, never>;
    readonly KHR_materials_emissive_strength?: {
      readonly emissiveStrength?: number;
    };
    readonly KHR_materials_clearcoat?: {
      readonly clearcoatFactor?: number;
      readonly clearcoatTexture?: GLTFTextureInfo;
      readonly clearcoatRoughnessFactor?: number;
      readonly clearcoatRoughnessTexture?: GLTFTextureInfo;
      readonly clearcoatNormalTexture?: GLTFTextureInfo & { readonly scale?: number };
    };
    readonly KHR_materials_transmission?: {
      readonly transmissionFactor?: number;
      readonly transmissionTexture?: GLTFTextureInfo;
    };
    readonly KHR_materials_diffuse_transmission?: {
      readonly diffuseTransmissionFactor?: number;
      readonly diffuseTransmissionTexture?: GLTFTextureInfo;
      readonly diffuseTransmissionColorFactor?: readonly [number, number, number];
      readonly diffuseTransmissionColorTexture?: GLTFTextureInfo;
    };
    readonly KHR_materials_volume?: {
      readonly thicknessFactor?: number;
      readonly thicknessTexture?: GLTFTextureInfo;
      readonly attenuationDistance?: number;
      readonly attenuationColor?: readonly [number, number, number];
    };
    readonly KHR_materials_ior?: {
      readonly ior?: number;
    };
    readonly KHR_materials_specular?: {
      readonly specularFactor?: number;
      readonly specularTexture?: GLTFTextureInfo;
      readonly specularColorFactor?: readonly [number, number, number];
      readonly specularColorTexture?: GLTFTextureInfo;
    };
    readonly KHR_materials_sheen?: {
      readonly sheenColorFactor?: readonly [number, number, number];
      readonly sheenColorTexture?: GLTFTextureInfo;
      readonly sheenRoughnessFactor?: number;
      readonly sheenRoughnessTexture?: GLTFTextureInfo;
    };
    readonly KHR_materials_anisotropy?: {
      readonly anisotropyStrength?: number;
      readonly anisotropyRotation?: number;
      readonly anisotropyTexture?: GLTFTextureInfo;
    };
    readonly KHR_materials_iridescence?: {
      readonly iridescenceFactor?: number;
      readonly iridescenceTexture?: GLTFTextureInfo;
      readonly iridescenceIor?: number;
      readonly iridescenceThicknessMinimum?: number;
      readonly iridescenceThicknessMaximum?: number;
      readonly iridescenceThicknessTexture?: GLTFTextureInfo;
    };
    readonly KHR_materials_dispersion?: {
      readonly dispersion?: number;
    };
    readonly KHR_materials_pbrSpecularGlossiness?: {
      readonly diffuseFactor?: readonly [number, number, number, number];
      readonly diffuseTexture?: GLTFTextureInfo;
      readonly specularFactor?: readonly [number, number, number];
      readonly glossinessFactor?: number;
      readonly specularGlossinessTexture?: GLTFTextureInfo;
    };
  };
}

interface GLTFTextureInfo {
  readonly index: number;
  readonly texCoord?: number;
  readonly extensions?: {
    readonly KHR_texture_transform?: GLTFTextureTransform;
  };
}

interface GLTFTextureTransform {
  readonly offset?: readonly [number, number];
  readonly scale?: readonly [number, number];
  readonly rotation?: number;
  readonly texCoord?: number;
}

interface GLTFImage {
  readonly name?: string;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly bufferView?: number;
}

interface GLTFTexture {
  readonly name?: string;
  readonly sampler?: number;
  readonly source?: number;
  readonly extensions?: {
    readonly EXT_texture_avif?: {
      readonly source: number;
    };
    readonly EXT_texture_webp?: {
      readonly source: number;
    };
    readonly KHR_texture_basisu?: {
      readonly source: number;
    };
  };
}

interface GLTFSampler {
  readonly name?: string;
  readonly magFilter?: number;
  readonly minFilter?: number;
  readonly wrapS?: number;
  readonly wrapT?: number;
}

interface GLTFScene {
  readonly name?: string;
  readonly nodes?: readonly number[];
}

interface GLTFSkin {
  readonly name?: string;
  readonly joints: readonly number[];
  readonly inverseBindMatrices?: number;
  readonly skeleton?: number;
}

interface GLTFAnimationSampler {
  readonly input: number;
  readonly output: number;
  readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
}

interface GLTFAnimationChannel {
  readonly sampler: number;
  readonly target: {
    readonly node?: number;
    readonly path: "translation" | "rotation" | "scale" | "weights" | "pointer";
    readonly extensions?: {
      readonly KHR_animation_pointer?: {
        readonly pointer?: string;
      };
    };
  };
}

interface GLTFAnimation {
  readonly name?: string;
  readonly samplers: readonly GLTFAnimationSampler[];
  readonly channels: readonly GLTFAnimationChannel[];
}

interface GLTFCamera {
  readonly name?: string;
  readonly type: "perspective" | "orthographic";
  readonly perspective?: {
    readonly aspectRatio?: number;
    readonly yfov: number;
    readonly znear: number;
    readonly zfar?: number;
  };
  readonly orthographic?: {
    readonly xmag: number;
    readonly ymag: number;
    readonly znear: number;
    readonly zfar: number;
  };
}

interface GLTFLight {
  readonly name?: string;
  readonly type: "directional" | "point" | "spot";
  readonly color?: readonly number[];
  readonly intensity?: number;
  readonly range?: number;
  readonly spot?: {
    readonly innerConeAngle?: number;
    readonly outerConeAngle?: number;
  };
}

interface GLTFJson {
  readonly asset?: { readonly version?: string };
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
  readonly buffers?: readonly GLTFBuffer[];
  readonly bufferViews?: readonly GLTFBufferView[];
  readonly accessors?: readonly GLTFAccessor[];
  readonly images?: readonly GLTFImage[];
  readonly textures?: readonly GLTFTexture[];
  readonly samplers?: readonly GLTFSampler[];
  readonly meshes?: readonly GLTFMesh[];
  readonly materials?: readonly GLTFMaterial[];
  readonly cameras?: readonly GLTFCamera[];
  readonly nodes?: readonly GLTFNode[];
  readonly scenes?: readonly GLTFScene[];
  readonly scene?: number;
  readonly skins?: readonly GLTFSkin[];
  readonly animations?: readonly GLTFAnimation[];
  readonly extensions?: {
    readonly KHR_lights_punctual?: {
      readonly lights?: readonly GLTFLight[];
    };
    readonly KHR_materials_variants?: {
      readonly variants?: readonly {
        readonly name?: string;
      }[];
    };
  };
}

export interface GLTFMeshAsset {
  readonly name: string;
  readonly sourceMeshIndex: number;
  readonly primitiveIndex: number;
  readonly topology: "triangles" | "lines" | "points";
  readonly geometry: GLTFGeometryAsset;
  readonly positions: readonly (readonly [number, number, number])[];
  readonly normals: readonly (readonly [number, number, number])[];
  readonly texcoords: readonly (readonly [number, number])[];
  readonly texcoordSets: readonly (readonly (readonly [number, number])[])[];
  readonly tangents: readonly (readonly [number, number, number, number])[];
  readonly colors: readonly (readonly [number, number, number, number])[];
  readonly joints: readonly (readonly [number, number, number, number])[];
  readonly weights: readonly (readonly [number, number, number, number])[];
  readonly morphTargets: readonly GLTFMorphTargetAsset[];
  readonly morphWeights: readonly number[];
  readonly indices?: readonly number[];
  readonly material: string;
  readonly materialIndex?: number;
  readonly materialVariants: readonly GLTFMaterialVariantMappingAsset[];
  readonly skinIndex?: number;
}

export interface GLTFRuntimeMaterialContract {
  readonly skinned?: boolean;
  readonly instanced?: boolean;
}

export interface GLTFRuntimeMaterialKey {
  readonly material: string;
  readonly contract: GLTFRuntimeMaterialContract;
}

export interface GLTFMorphTargetAsset {
  readonly positions: readonly (readonly [number, number, number])[];
  readonly normals: readonly (readonly [number, number, number])[];
  readonly tangents: readonly (readonly [number, number, number])[];
}

export interface GLTFGeometryAsset {
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export interface GLTFLoaderDiagnostics {
  readonly schemaVersion: "gltf-loader-diagnostics";
  readonly features: readonly string[];
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly unsupportedExtensions: readonly string[];
  readonly extensionSupport?: GLTFExtensionSupportEvaluation;
  readonly unsupportedFeatures: readonly string[];
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationCount: number;
  readonly skinCount: number;
  readonly morphTargetCount: number;
  readonly materialFeatures: readonly string[];
  readonly textureSlots: readonly string[];
  readonly compression: {
    readonly draco: boolean;
    readonly meshopt: boolean;
    readonly ktx2Basis: boolean;
  };
  readonly loadProfile?: GLTFLoaderLoadProfileDiagnostics;
}

export interface GLTFLoaderLoadProfileDiagnostics {
  readonly schemaVersion: "gltf-loader-load-profile";
  readonly documentBytes: number;
  readonly binaryChunkBytes: number;
  readonly bufferBytes: number;
  readonly imageBytes: number;
  readonly embeddedImageBytes: number;
  readonly externalImageCount: number;
  readonly bufferViewImageCount: number;
  readonly accessorReadCount: number;
  readonly uniqueAccessorReadCount: number;
  readonly accessorCacheHitCount: number;
  readonly accessorRowsRead: number;
  readonly accessorValuesRead: number;
  readonly accessorReadMs: number;
  readonly dataViewCacheEntries: number;
  readonly largestAccessors: readonly GLTFAccessorLoadProfileEntry[];
}

export interface GLTFAccessorLoadProfileEntry {
  readonly accessorIndex: number;
  readonly count: number;
  readonly type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
  readonly componentType: 5120 | 5121 | 5122 | 5123 | 5125 | 5126;
  readonly componentCount: number;
  readonly byteLength: number;
  readonly bufferView?: number;
}

export interface GLTFAsset {
  readonly url: string;
  readonly disposed: boolean;
  readonly loaderDiagnostics: GLTFLoaderDiagnostics;
  readonly images: readonly GLTFImageAsset[];
  readonly textures: readonly GLTFTextureAsset[];
  readonly materials: readonly GLTFMaterialAsset[];
  readonly materialVariants: readonly GLTFMaterialVariantAsset[];
  readonly scenes: readonly GLTFSceneAsset[];
  readonly defaultScene: number;
  readonly meshes: readonly GLTFMeshAsset[];
  readonly cameras: readonly GLTFCameraAsset[];
  readonly lights: readonly GLTFLightAsset[];
  readonly skins: readonly GLTFSkinAsset[];
  readonly animations: readonly AnimationClip[];
  createScene(options?: GLTFSceneCreateOptions): Scene;
  toJSON(): SerializedGLTFAsset;
}

interface DisposableGLTFAsset extends GLTFAsset {
  [DISPOSE_GLTF_ASSET](): void;
}

export interface GLTFSceneCreateOptions {
  readonly materialVariant?: string;
  readonly sceneIndex?: number;
  readonly sceneName?: string;
}

export interface GLTFImageAsset {
  readonly name: string;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly data?: ArrayBuffer;
}

export interface GLTFTextureAsset {
  readonly name: string;
  readonly source: number;
  readonly sampler?: number;
  readonly samplerDescriptor?: GLTFSamplerAsset;
}

export interface GLTFSceneAsset {
  readonly name: string;
  readonly nodeIndices: readonly number[];
}

export interface GLTFSamplerAsset {
  readonly minFilter: "nearest" | "linear" | "nearest-mipmap-nearest" | "linear-mipmap-nearest" | "nearest-mipmap-linear" | "linear-mipmap-linear";
  readonly magFilter: "nearest" | "linear";
  readonly addressU: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly addressV: "clamp-to-edge" | "repeat" | "mirror-repeat";
}

export interface GLTFMaterialAsset {
  readonly name: string;
  readonly unlit: boolean;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly baseColorTexture?: GLTFResolvedTextureInfo;
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly metallicRoughnessTexture?: GLTFResolvedTextureInfo;
  readonly normalTexture?: GLTFResolvedTextureInfo & { readonly scale: number };
  readonly occlusionTexture?: GLTFResolvedTextureInfo & { readonly strength: number };
  readonly emissiveTexture?: GLTFResolvedTextureInfo;
  readonly emissiveFactor: readonly [number, number, number];
  readonly emissiveStrength: number;
  readonly clearcoat?: GLTFClearcoatMaterialExtension;
  readonly transmission?: GLTFTransmissionMaterialExtension;
  readonly diffuseTransmission?: GLTFDiffuseTransmissionMaterialExtension;
  readonly volume?: GLTFVolumeMaterialExtension;
  readonly ior?: number;
  readonly specular?: GLTFSpecularMaterialExtension;
  readonly pbrSpecularGlossiness?: GLTFPBRSpecularGlossinessMaterialExtension;
  readonly sheen?: GLTFSheenMaterialExtension;
  readonly anisotropy?: GLTFAnisotropyMaterialExtension;
  readonly iridescence?: GLTFIridescenceMaterialExtension;
  readonly dispersion?: number;
  readonly alphaMode: "OPAQUE" | "MASK" | "BLEND";
  readonly alphaCutoff: number;
  readonly doubleSided: boolean;
}

export interface GLTFMaterialVariantAsset {
  readonly name: string;
}

export interface GLTFMaterialVariantMappingAsset {
  readonly variantIndex: number;
  readonly variant: string;
  readonly materialIndex: number;
  readonly material: string;
}

export interface GLTFClearcoatMaterialExtension {
  readonly factor: number;
  readonly texture?: GLTFResolvedTextureInfo;
  readonly roughnessFactor: number;
  readonly roughnessTexture?: GLTFResolvedTextureInfo;
  readonly normalTexture?: GLTFResolvedTextureInfo & { readonly scale: number };
}

export interface GLTFTransmissionMaterialExtension {
  readonly factor: number;
  readonly texture?: GLTFResolvedTextureInfo;
}

export interface GLTFDiffuseTransmissionMaterialExtension {
  readonly factor: number;
  readonly texture?: GLTFResolvedTextureInfo;
  readonly colorFactor: readonly [number, number, number];
  readonly colorTexture?: GLTFResolvedTextureInfo;
}

export interface GLTFVolumeMaterialExtension {
  readonly thicknessFactor: number;
  readonly thicknessTexture?: GLTFResolvedTextureInfo;
  readonly attenuationDistance: number;
  readonly attenuationColor: readonly [number, number, number];
}

export interface GLTFSpecularMaterialExtension {
  readonly factor: number;
  readonly texture?: GLTFResolvedTextureInfo;
  readonly colorFactor: readonly [number, number, number];
  readonly colorTexture?: GLTFResolvedTextureInfo;
}

export interface GLTFPBRSpecularGlossinessMaterialExtension {
  readonly diffuseFactor: readonly [number, number, number, number];
  readonly diffuseTexture?: GLTFResolvedTextureInfo;
  readonly specularFactor: readonly [number, number, number];
  readonly glossinessFactor: number;
  readonly specularGlossinessTexture?: GLTFResolvedTextureInfo;
}

function createSpecularFromSpecularGlossiness(
  extension: GLTFPBRSpecularGlossinessMaterialExtension | undefined
): GLTFSpecularMaterialExtension | undefined {
  if (!extension) return undefined;
  return {
    factor: 1,
    colorFactor: extension.specularFactor,
    colorTexture: extension.specularGlossinessTexture
  };
}

export interface GLTFSheenMaterialExtension {
  readonly colorFactor: readonly [number, number, number];
  readonly colorTexture?: GLTFResolvedTextureInfo;
  readonly roughnessFactor: number;
  readonly roughnessTexture?: GLTFResolvedTextureInfo;
}

export interface GLTFAnisotropyMaterialExtension {
  readonly strength: number;
  readonly rotation: number;
  readonly texture?: GLTFResolvedTextureInfo;
}

export interface GLTFIridescenceMaterialExtension {
  readonly factor: number;
  readonly texture?: GLTFResolvedTextureInfo;
  readonly ior: number;
  readonly thicknessMinimum: number;
  readonly thicknessMaximum: number;
  readonly thicknessTexture?: GLTFResolvedTextureInfo;
}

export interface GLTFLightAsset {
  readonly name: string;
  readonly type: "directional" | "point" | "spot";
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly range?: number;
  readonly spot?: {
    readonly innerConeAngle: number;
    readonly outerConeAngle: number;
  };
}

export interface GLTFCameraAsset {
  readonly name: string;
  readonly type: "perspective" | "orthographic";
  readonly perspective?: {
    readonly aspectRatio: number;
    readonly yfov: number;
    readonly znear: number;
    readonly zfar: number;
  };
  readonly orthographic?: {
    readonly xmag: number;
    readonly ymag: number;
    readonly znear: number;
    readonly zfar: number;
  };
}

export interface GLTFResolvedTextureInfo {
  readonly texture: number;
  readonly image: number;
  readonly texCoord: number;
  readonly transform?: GLTFResolvedTextureTransform;
}

export interface GLTFResolvedTextureTransform {
  readonly offset: readonly [number, number];
  readonly scale: readonly [number, number];
  readonly rotation: number;
}

export interface GLTFSkinAsset {
  readonly name: string;
  readonly joints: readonly number[];
  readonly jointNames: readonly string[];
  readonly inverseBindMatrices: readonly Mat4[];
  readonly skeletonRoot?: number;
  readonly skeleton: Skeleton;
  readonly jointBindMatrices: readonly Mat4[];
  readonly skinningPalette?: SkinningPalette;
}

export interface SerializedGLTFAsset {
  readonly url: string;
  readonly loaderDiagnostics: GLTFLoaderDiagnostics;
  readonly images: readonly {
    readonly name: string;
    readonly uri?: string;
    readonly mimeType?: string;
    readonly byteLength?: number;
  }[];
  readonly textures: readonly GLTFTextureAsset[];
  readonly materials: readonly GLTFMaterialAsset[];
  readonly materialVariants: readonly GLTFMaterialVariantAsset[];
  readonly scenes: readonly GLTFSceneAsset[];
  readonly defaultScene: number;
  readonly meshes: readonly GLTFMeshAsset[];
  readonly cameras: readonly GLTFCameraAsset[];
  readonly lights: readonly GLTFLightAsset[];
  readonly skins: readonly {
    readonly name: string;
    readonly joints: readonly number[];
    readonly jointNames: readonly string[];
    readonly inverseBindMatrices: readonly Mat4[];
    readonly skeletonRoot?: number;
    readonly bones: readonly {
      readonly name: string;
      readonly parentIndex: number;
      readonly translation: Vec3;
      readonly rotation: Quat;
      readonly scale: Vec3;
      readonly inverseBindMatrix: Mat4;
    }[];
  }[];
  readonly animations: readonly SerializedAnimationClip[];
}

export interface GLTFMeshoptDecodeDescriptor {
  readonly bufferViewIndex: number;
  readonly byteStride: number;
  readonly count: number;
  readonly mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES";
  readonly filter: "NONE" | "OCTAHEDRAL" | "QUATERNION" | "EXPONENTIAL" | "COLOR";
}

export type GLTFMeshoptDecoder = (
  source: Uint8Array,
  descriptor: GLTFMeshoptDecodeDescriptor
) => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>;

export interface GLTFDracoDecodeDescriptor {
  readonly meshIndex: number;
  readonly primitiveIndex: number;
  readonly bufferViewIndex: number;
  readonly attributes: Readonly<Record<string, number>>;
}

export interface GLTFDracoDecodedPrimitive {
  readonly attributes: Readonly<Record<string, readonly (readonly number[])[]>>;
  readonly indices?: readonly number[];
}

export type GLTFDracoDecoder = (
  source: Uint8Array,
  descriptor: GLTFDracoDecodeDescriptor
) => GLTFDracoDecodedPrimitive | Promise<GLTFDracoDecodedPrimitive>;

export interface GLTFLoaderOptions {
  readonly meshoptDecoder?: GLTFMeshoptDecoder;
  readonly dracoDecoder?: GLTFDracoDecoder;
}

interface MutableGLTFLoaderLoadProfileDiagnostics {
  accessorReadCount: number;
  uniqueAccessorReadCount: number;
  accessorCacheHitCount: number;
  accessorRowsRead: number;
  accessorValuesRead: number;
  accessorReadMs: number;
  dataViewCacheEntries: number;
  largestAccessors: GLTFAccessorLoadProfileEntry[];
}

interface GLTFAccessorReadCache {
  readonly rowsByAccessor: Map<number, number[][]>;
  readonly dataViews: Map<ArrayBuffer, DataView>;
  readonly profile: MutableGLTFLoaderLoadProfileDiagnostics;
}

export class GLTFLoader implements AssetLoader<GLTFAsset> {
  readonly type = "gltf";

  constructor(private readonly options: GLTFLoaderOptions = {}) {}

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:gltf|glb)(?:\?.*)?$/i.test(request.url) || request.url.startsWith("data:model/gltf");
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<GLTFAsset> {
    context.throwIfAborted(request.url);
    const document = await loadDocument(request);
    let json = document.json;
    if (json.asset?.version && !json.asset.version.startsWith("2.")) {
      throw new Error(`Unsupported glTF version: ${json.asset.version}`);
    }
    const extensionSupport = evaluateGLTFExtensionSupport(json.extensionsUsed, json.extensionsRequired);
    const unsupportedRequiredExtensions = extensionSupport.unsupportedRequired;
    if (unsupportedRequiredExtensions.length > 0) {
      throw new Error(`Unsupported required glTF extensions: ${unsupportedRequiredExtensions.join(", ")}`);
    }

    const rawBuffers = await Promise.all((json.buffers ?? []).map((buffer, index) => loadBuffer(buffer, index, document, request)));
    const prepared = await prepareBufferViews(json, rawBuffers, this.options.meshoptDecoder);
    const buffers = prepared.buffers;
    json = prepared.json;
    const accessorCache = createGLTFAccessorReadCache();
    const meshQuantizationEnabled = usesGLTFExtension(json, "KHR_mesh_quantization");
    const images = createImageAssets(json, buffers);
    const textures = createTextureAssets(json);
    const materials = createMaterialAssets(json, textures);
    const materialVariants = createMaterialVariantAssets(json);
    const scenes = createSceneAssets(json);
    const defaultScene = resolveDefaultSceneIndex(json);
    const cameras = createCameraAssets(json);
    const lights = createLightAssets(json);
    const skins = createSkinAssets(json, buffers, accessorCache);
    const nodeInstanceTransforms = createNodeInstanceTransforms(json, buffers, accessorCache);
    const meshes = await Promise.all((json.meshes ?? []).flatMap((mesh, meshIndex) => {
      validateMeshDescriptor(mesh, meshIndex);
      return mesh.primitives.map(async (primitive, primitiveIndex) => {
        validatePrimitiveDescriptor(primitive, meshIndex, primitiveIndex);
        validatePrimitiveAttributeAccessors(json, primitive, meshQuantizationEnabled, meshIndex, primitiveIndex);
        const positionAccessorIndex = primitive.attributes.POSITION;
        if (positionAccessorIndex === undefined) {
          throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} is missing POSITION`);
        }

        const dracoPrimitive = await decodeDracoPrimitive(json, buffers, primitive, meshIndex, primitiveIndex, this.options.dracoDecoder);
        const positions = dracoPrimitive?.attributes.POSITION ?? readAccessor(json, buffers, positionAccessorIndex, accessorCache);
        const normals = readPrimitiveAttribute(json, buffers, primitive, dracoPrimitive, "NORMAL", accessorCache);
        const texcoordSets = readTexcoordSets(json, buffers, primitive, positions.length, meshIndex, primitiveIndex, dracoPrimitive, accessorCache);
        const texcoords = texcoordSets[0] ?? [];
        const tangents = readPrimitiveAttribute(json, buffers, primitive, dracoPrimitive, "TANGENT", accessorCache);
        const colors = readPrimitiveAttribute(json, buffers, primitive, dracoPrimitive, "COLOR_0", accessorCache);
        const joints = readPrimitiveAttribute(json, buffers, primitive, dracoPrimitive, "JOINTS_0", accessorCache);
        const weights = readPrimitiveAttribute(json, buffers, primitive, dracoPrimitive, "WEIGHTS_0", accessorCache);
        const indices = dracoPrimitive
          ? dracoPrimitive.indices?.map((index) => [index])
          : primitive.indices === undefined ? undefined : readAccessor(json, buffers, primitive.indices, accessorCache);
        validateAttributeCount("NORMAL", normals, positions.length, meshIndex, primitiveIndex);
        validateAttributeCount("TANGENT", tangents, positions.length, meshIndex, primitiveIndex);
        validateAttributeCount("COLOR_0", colors, positions.length, meshIndex, primitiveIndex);
        validateAttributeCount("JOINTS_0", joints, positions.length, meshIndex, primitiveIndex);
        validateAttributeCount("WEIGHTS_0", weights, positions.length, meshIndex, primitiveIndex);
        const primitiveMaterialIndex = resolvePrimitiveMaterialIndex(primitive, materials, meshIndex, primitiveIndex);
        const primitiveMaterial = primitiveMaterialIndex === undefined ? undefined : materials[primitiveMaterialIndex];
        const primitiveMaterialVariants = resolvePrimitiveMaterialVariants(primitive, materialVariants, materials, meshIndex, primitiveIndex);
        validateMaterialTexCoordSets(primitiveMaterial, texcoordSets, meshIndex, primitiveIndex);
        const typedPositions = positions.map((position) => [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] as const);
        const typedNormals = normals.map((normal) => [normal[0] ?? 0, normal[1] ?? 0, normal[2] ?? 0] as const);
        const typedTangents = tangents.map((tangent) => [tangent[0] ?? 0, tangent[1] ?? 0, tangent[2] ?? 0, tangent[3] ?? 1] as const);
        const typedColors = colors.map((color) => [color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1] as const);
        const typedJoints = joints.map((joint) => [joint[0] ?? 0, joint[1] ?? 0, joint[2] ?? 0, joint[3] ?? 0] as const);
        const typedWeights = weights.map((weight) => normalizeSkinWeights([
          weight[0] ?? 0,
          weight[1] ?? 0,
          weight[2] ?? 0,
          weight[3] ?? 0
        ], meshIndex, primitiveIndex));
        const morphTargets = readMorphTargets(json, buffers, primitive, positions.length, meshIndex, primitiveIndex, accessorCache);
        const resolvedPrimitive = resolvePrimitiveMode(primitive, indices?.map((index) => index[0] ?? 0), positions.length, meshIndex, primitiveIndex);
        const geometry = createGeometryAsset(typedPositions, resolvedPrimitive.indices);
        return {
          name: meshPrimitiveName(mesh, meshIndex, primitiveIndex),
          sourceMeshIndex: meshIndex,
          primitiveIndex,
          topology: resolvedPrimitive.topology,
          geometry,
          positions: typedPositions,
          normals: typedNormals,
          texcoords,
          texcoordSets,
          tangents: typedTangents,
          colors: typedColors,
          joints: typedJoints,
          weights: typedWeights,
          morphTargets,
          morphWeights: resolveMorphWeights(mesh, meshIndex, primitiveIndex, morphTargets.length),
          indices: resolvedPrimitive.indices,
          material: materialName(primitiveMaterial, primitiveMaterialIndex),
          materialIndex: primitiveMaterialIndex,
          materialVariants: primitiveMaterialVariants,
          skinIndex: findSkinForMesh(json, meshIndex)
        };
      });
    }));
    const animations = createAnimationClips(json, buffers, accessorCache);
    const loadProfile = createGLTFLoaderLoadProfileDiagnostics(document, buffers, images, accessorCache);
    const loaderDiagnostics = createGLTFLoaderDiagnostics(json, {
      images,
      textures,
      materials,
      meshes,
      animations,
      skins
    }, loadProfile);

    let disposed = false;
    const assertAlive = (): void => {
      if (disposed) {
        throw new Error(`glTF asset ${request.url} has been disposed`);
      }
    };
    const asset: DisposableGLTFAsset = {
      url: request.url,
      get disposed() {
        return disposed;
      },
      loaderDiagnostics,
      images,
      textures,
      materials,
      materialVariants,
      scenes,
      defaultScene,
      meshes,
      cameras,
      lights,
      skins,
      animations,
      createScene: (options) => {
        assertAlive();
        return createScene(json, meshes, cameras, lights, skins, nodeInstanceTransforms, materialVariants, options);
      },
      toJSON: () => {
        assertAlive();
        return serializeGLTFAsset(request.url, loaderDiagnostics, images, textures, materials, materialVariants, scenes, defaultScene, meshes, cameras, lights, skins, animations);
      },
      [DISPOSE_GLTF_ASSET]: () => {
        disposed = true;
      }
    };
    return asset;
  }

  dispose(asset: GLTFAsset): void {
    (asset as DisposableGLTFAsset)[DISPOSE_GLTF_ASSET]?.();
  }
}

function createGLTFAccessorReadCache(): GLTFAccessorReadCache {
  return {
    rowsByAccessor: new Map(),
    dataViews: new Map(),
    profile: {
      accessorReadCount: 0,
      uniqueAccessorReadCount: 0,
      accessorCacheHitCount: 0,
      accessorRowsRead: 0,
      accessorValuesRead: 0,
      accessorReadMs: 0,
      dataViewCacheEntries: 0,
      largestAccessors: []
    }
  };
}

function createGLTFLoaderLoadProfileDiagnostics(
  document: GLTFDocument,
  buffers: readonly ArrayBuffer[],
  images: readonly GLTFImageAsset[],
  accessorCache: GLTFAccessorReadCache
): GLTFLoaderLoadProfileDiagnostics {
  const profile = accessorCache.profile;
  const embeddedImageBytes = images.reduce((sum, image) => sum + (image.data?.byteLength ?? 0), 0);
  return {
    schemaVersion: "gltf-loader-load-profile",
    documentBytes: document.byteLength,
    binaryChunkBytes: document.binaryChunk?.byteLength ?? 0,
    bufferBytes: buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0),
    imageBytes: embeddedImageBytes,
    embeddedImageBytes,
    externalImageCount: images.filter((image) => Boolean(image.uri) && !image.uri!.startsWith("data:")).length,
    bufferViewImageCount: images.filter((image) => image.data !== undefined).length,
    accessorReadCount: profile.accessorReadCount,
    uniqueAccessorReadCount: profile.uniqueAccessorReadCount,
    accessorCacheHitCount: profile.accessorCacheHitCount,
    accessorRowsRead: profile.accessorRowsRead,
    accessorValuesRead: profile.accessorValuesRead,
    accessorReadMs: roundDiagnosticMs(profile.accessorReadMs),
    dataViewCacheEntries: profile.dataViewCacheEntries,
    largestAccessors: [...profile.largestAccessors]
  };
}

function roundDiagnosticMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function nowMs(): number {
  const performance = globalThis.performance;
  return performance && typeof performance.now === "function" ? performance.now() : Date.now();
}

function createGeometryAsset(
  positions: readonly (readonly [number, number, number])[],
  indices?: readonly number[]
): GLTFGeometryAsset {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const position of positions) {
    min[0] = Math.min(min[0], position[0]);
    min[1] = Math.min(min[1], position[1]);
    min[2] = Math.min(min[2], position[2]);
    max[0] = Math.max(max[0], position[0]);
    max[1] = Math.max(max[1], position[1]);
    max[2] = Math.max(max[2], position[2]);
  }
  return { vertexCount: positions.length, indexCount: indices?.length ?? 0, bounds: { min, max } };
}

function createGLTFLoaderDiagnostics(
  json: GLTFJson,
  asset: {
    readonly images: readonly GLTFImageAsset[];
    readonly textures: readonly GLTFTextureAsset[];
    readonly materials: readonly GLTFMaterialAsset[];
    readonly meshes: readonly GLTFMeshAsset[];
    readonly animations: readonly AnimationClip[];
    readonly skins: readonly GLTFSkinAsset[];
  },
  loadProfile?: GLTFLoaderLoadProfileDiagnostics
): GLTFLoaderDiagnostics {
  const extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])].sort();
  const extensionSupport = evaluateGLTFExtensionSupport(json.extensionsUsed, json.extensionsRequired);
  const materialFeatures = [...new Set(asset.materials.flatMap(materialFeatureNames))].sort();
  const textureSlots = [...new Set(asset.materials.flatMap(materialTextureSlotNames))].sort();
  const unsupportedFeatures = collectUnsupportedFeatureDiagnostics(json);
  const compression = {
    draco: usesGLTFExtension(json, "KHR_draco_mesh_compression"),
    meshopt: usesGLTFMeshoptExtension(json),
    ktx2Basis: usesGLTFExtension(json, "KHR_texture_basisu") || asset.images.some((image) => /\.ktx2(?:[?#]|$)/i.test(image.uri ?? "") || image.mimeType === "image/ktx2")
  };
  const features = new Set<string>([
    "gltf",
    ...extensionsUsed.map((extension) => `extension:${extension}`),
    ...materialFeatures.map((feature) => `material:${feature}`),
    ...textureSlots.map((slot) => `texture-slot:${slot}`)
  ]);
  if (asset.meshes.length > 0) features.add("mesh");
  if (asset.meshes.some((mesh) => mesh.geometry.indexCount > 0)) features.add("indexed-geometry");
  if (asset.meshes.some((mesh) => mesh.normals.length > 0)) features.add("normals");
  if (asset.meshes.some((mesh) => mesh.tangents.length > 0)) features.add("tangents");
  if (asset.meshes.some((mesh) => mesh.colors.length > 0)) features.add("vertex-colors");
  if (asset.meshes.some((mesh) => mesh.texcoordSets.some((set) => set.length > 0))) features.add("texcoords");
  if (asset.meshes.some((mesh) => mesh.texcoordSets.length > 1)) features.add("multi-uv");
  if (asset.meshes.some((mesh) => mesh.morphTargets.length > 0)) features.add("morph-targets");
  if (asset.meshes.some((mesh) => mesh.skinIndex !== undefined || mesh.joints.length > 0 || mesh.weights.length > 0)) features.add("skinning");
  if (asset.skins.some((skin) => skin.joints.length > MAX_RENDERABLE_SKIN_JOINTS)) features.add("skinning-palette-limit-fallback");
  if ((json.skins ?? []).some((skin) => skin.inverseBindMatrices === undefined)) features.add("skinning-default-inverse-bind-matrices");
  for (const unsupportedFeature of unsupportedFeatures) features.add(`unsupported:${unsupportedFeature}`);
  if (asset.animations.length > 0) features.add("animations");
  if (asset.skins.length > 0) features.add("skins");
  if (asset.textures.length > 0) features.add("textures");
  if (compression.draco) features.add("compression:draco");
  if (compression.meshopt) features.add("compression:meshopt");
  if (compression.ktx2Basis) features.add("compression:ktx2-basis");

  return {
    schemaVersion: "gltf-loader-diagnostics",
    features: [...features].sort(),
    extensionsUsed,
    extensionsRequired: [...(json.extensionsRequired ?? [])].sort(),
    unsupportedExtensions: extensionSupport.notAcceptedUsed,
    extensionSupport,
    unsupportedFeatures,
    meshCount: asset.meshes.length,
    primitiveCount: asset.meshes.length,
    vertexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.vertexCount, 0),
    indexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.indexCount, 0),
    materialCount: asset.materials.length,
    textureCount: asset.textures.length,
    imageCount: asset.images.length,
    animationCount: asset.animations.length,
    skinCount: asset.skins.length,
    morphTargetCount: asset.meshes.reduce((sum, mesh) => sum + mesh.morphTargets.length, 0),
    materialFeatures,
    textureSlots,
    compression,
    ...(loadProfile ? { loadProfile } : {})
  };
}

function collectUnsupportedFeatureDiagnostics(json: GLTFJson): readonly string[] {
  const unsupported = new Set<string>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.attributes.JOINTS_1 !== undefined || primitive.attributes.WEIGHTS_1 !== undefined) {
        unsupported.add("skinning-extra-influences:JOINTS_1/WEIGHTS_1");
      }
    }
  }
  return [...unsupported].sort();
}

function materialFeatureNames(material: GLTFMaterialAsset): readonly string[] {
  return [
    material.unlit ? "unlit" : undefined,
    material.metallicFactor > 0 ? "metallic" : undefined,
    material.roughnessFactor < 1 ? "roughness" : undefined,
    material.emissiveFactor.some((value) => value > 0) || material.emissiveStrength !== 1 ? "emissive" : undefined,
    material.alphaMode !== "OPAQUE" ? `alpha-${material.alphaMode.toLowerCase()}` : undefined,
    material.doubleSided ? "double-sided" : undefined,
    material.normalTexture ? "normal-texture" : undefined,
    material.occlusionTexture ? "occlusion-texture" : undefined,
    material.clearcoat ? "clearcoat" : undefined,
    material.transmission ? "transmission" : undefined,
    material.diffuseTransmission ? "diffuse-transmission" : undefined,
    material.volume ? "volume" : undefined,
    material.ior !== undefined ? "ior" : undefined,
    material.specular ? "specular" : undefined,
    material.sheen ? "sheen" : undefined,
    material.anisotropy ? "anisotropy" : undefined,
    material.iridescence ? "iridescence" : undefined,
    material.dispersion !== undefined ? "dispersion" : undefined,
    material.pbrSpecularGlossiness ? "pbr-specular-glossiness" : undefined
  ].filter((feature): feature is string => feature !== undefined);
}

function materialTextureSlotNames(material: GLTFMaterialAsset): readonly string[] {
  return [
    material.baseColorTexture ? "base-color" : undefined,
    material.metallicRoughnessTexture ? "metallic-roughness" : undefined,
    material.normalTexture ? "normal" : undefined,
    material.occlusionTexture ? "occlusion" : undefined,
    material.emissiveTexture ? "emissive" : undefined,
    material.clearcoat?.texture ? "clearcoat" : undefined,
    material.clearcoat?.roughnessTexture ? "clearcoat-roughness" : undefined,
    material.clearcoat?.normalTexture ? "clearcoat-normal" : undefined,
    material.transmission?.texture ? "transmission" : undefined,
    material.diffuseTransmission?.texture ? "diffuse-transmission" : undefined,
    material.diffuseTransmission?.colorTexture ? "diffuse-transmission-color" : undefined,
    material.volume?.thicknessTexture ? "volume-thickness" : undefined,
    material.specular?.texture ? "specular" : undefined,
    material.specular?.colorTexture ? "specular-color" : undefined,
    material.sheen?.colorTexture ? "sheen-color" : undefined,
    material.sheen?.roughnessTexture ? "sheen-roughness" : undefined,
    material.anisotropy?.texture ? "anisotropy" : undefined,
    material.iridescence?.texture ? "iridescence" : undefined,
    material.iridescence?.thicknessTexture ? "iridescence-thickness" : undefined
  ].filter((slot): slot is string => slot !== undefined);
}

function validateAttributeCount(
  semantic: string,
  values: readonly (readonly number[])[],
  vertexCount: number,
  meshIndex: number,
  primitiveIndex: number
): void {
  if (values.length > 0 && values.length !== vertexCount) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} ${semantic} count mismatch`);
  }
}

function validateMeshDescriptor(mesh: GLTFMesh, meshIndex: number): void {
  if (!Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
    throw new Error(`glTF mesh ${meshIndex} primitives must be a non-empty array`);
  }
}

function validatePrimitiveDescriptor(primitive: GLTFPrimitive, meshIndex: number, primitiveIndex: number): void {
  if (!isObjectRecord(primitive.attributes) || Array.isArray(primitive.attributes)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} attributes must be an object`);
  }
  for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) {
    if (!Number.isInteger(accessorIndex) || accessorIndex < 0) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} attribute ${semantic} accessor must be a non-negative integer`);
    }
  }
  if (primitive.indices !== undefined && (!Number.isInteger(primitive.indices) || primitive.indices < 0)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} indices accessor must be a non-negative integer`);
  }
  if (primitive.mode !== undefined && (!Number.isInteger(primitive.mode) || primitive.mode < 0)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} mode must be a non-negative integer`);
  }
  const variantExtension = primitive.extensions?.KHR_materials_variants;
  if (variantExtension !== undefined && (!Array.isArray(variantExtension.mappings) || variantExtension.mappings.length === 0)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_materials_variants.mappings must be a non-empty array`);
  }
}

function readTexcoordSets(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  primitive: GLTFPrimitive,
  vertexCount: number,
  meshIndex: number,
  primitiveIndex: number,
  decodedPrimitive: GLTFDracoDecodedPrimitive | undefined,
  accessorCache: GLTFAccessorReadCache
): readonly (readonly (readonly [number, number])[])[] {
  const sets: (readonly (readonly [number, number])[])[] = [];
  for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) {
    const match = /^TEXCOORD_(\d+)$/.exec(semantic);
    if (!match) continue;
    const setIndex = Number(match[1]);
    if (!Number.isInteger(setIndex)) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} ${semantic} has invalid texture coordinate set index`);
    }
    const values = decodedPrimitive?.attributes[semantic] ?? readAccessor(json, buffers, accessorIndex, accessorCache);
    validateAttributeCount(semantic, values, vertexCount, meshIndex, primitiveIndex);
    sets[setIndex] = values.map((texcoord) => [texcoord[0] ?? 0, texcoord[1] ?? 0] as const);
  }
  const normalized: (readonly (readonly [number, number])[])[] = [];
  for (let index = 0; index < sets.length; index += 1) {
    normalized[index] = sets[index] ?? [];
  }
  return normalized;
}

function readPrimitiveAttribute(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  primitive: GLTFPrimitive,
  decodedPrimitive: GLTFDracoDecodedPrimitive | undefined,
  semantic: string,
  accessorCache: GLTFAccessorReadCache
): number[][] {
  const decoded = decodedPrimitive?.attributes[semantic];
  if (decoded) return normalizeDecodedPrimitiveAttribute(json, primitive, semantic, decoded);
  return readOptionalAccessor(json, buffers, primitive.attributes[semantic], accessorCache);
}

function normalizeDecodedPrimitiveAttribute(
  json: GLTFJson,
  primitive: GLTFPrimitive,
  semantic: string,
  rows: readonly (readonly number[])[]
): number[][] {
  const copied = rows.map((row) => [...row]);
  const accessorIndex = primitive.attributes[semantic];
  const accessor = accessorIndex === undefined ? undefined : json.accessors?.[accessorIndex];
  if (!accessor?.normalized || !semantic.startsWith("COLOR_")) {
    return copied;
  }
  const normalizer = normalizedComponentScale(accessor.componentType);
  if (!normalizer) {
    return copied;
  }
  const needsNormalization = copied.some((row) => row.some((value) => Math.abs(value) > 1));
  if (!needsNormalization) {
    return copied.map((row) => row.map(clampColorChannel));
  }
  return copied.map((row) => row.map((value) => clampColorChannel(normalizer(value))));
}

function normalizedComponentScale(componentType: GLTFComponentType): ((value: number) => number) | null {
  if (componentType === 5120) return (value) => Math.max(value / 127, -1);
  if (componentType === 5121) return (value) => value / 255;
  if (componentType === 5122) return (value) => Math.max(value / 32767, -1);
  if (componentType === 5123) return (value) => value / 65535;
  return null;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function decodeDracoPrimitive(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  primitive: GLTFPrimitive,
  meshIndex: number,
  primitiveIndex: number,
  dracoDecoder: GLTFDracoDecoder | undefined
): Promise<GLTFDracoDecodedPrimitive | undefined> {
  const extension = primitive.extensions?.KHR_draco_mesh_compression;
  if (!extension) return undefined;
  if (!usesGLTFExtension(json, "KHR_draco_mesh_compression")) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} uses KHR_draco_mesh_compression but the extension is not declared`);
  }
  if (!dracoDecoder) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression requires a dracoDecoder`);
  }
  validateDracoDescriptor(extension, meshIndex, primitiveIndex);
  const { view, buffer } = getBufferView(json, buffers, extension.bufferView);
  const start = view.byteOffset ?? 0;
  const source = new Uint8Array(buffer, start, view.byteLength);
  const decoded = await dracoDecoder(source, {
    meshIndex,
    primitiveIndex,
    bufferViewIndex: extension.bufferView,
    attributes: { ...extension.attributes }
  });
  validateDecodedDracoPrimitive(decoded, primitive, meshIndex, primitiveIndex);
  return decoded;
}

function validateDracoDescriptor(
  extension: NonNullable<NonNullable<GLTFPrimitive["extensions"]>["KHR_draco_mesh_compression"]>,
  meshIndex: number,
  primitiveIndex: number
): void {
  if (!Number.isInteger(extension.bufferView) || extension.bufferView < 0) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression bufferView must be a non-negative integer`);
  }
  if (!isObjectRecord(extension.attributes) || Array.isArray(extension.attributes)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression attributes must be an object`);
  }
  if (!Number.isInteger(extension.attributes.POSITION) || extension.attributes.POSITION < 0) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression requires POSITION attribute mapping`);
  }
  for (const [semantic, attributeId] of Object.entries(extension.attributes)) {
    if (!Number.isInteger(attributeId) || attributeId < 0) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression attribute ${semantic} id must be a non-negative integer`);
    }
  }
}

function validateDecodedDracoPrimitive(
  decoded: GLTFDracoDecodedPrimitive,
  primitive: GLTFPrimitive,
  meshIndex: number,
  primitiveIndex: number
): void {
  if (!isObjectRecord(decoded.attributes) || Array.isArray(decoded.attributes)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression decoder must return attributes`);
  }
  const positions = decoded.attributes.POSITION;
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression decoder must return POSITION rows`);
  }
  for (const [semantic, rows] of Object.entries(decoded.attributes)) {
    if (primitive.attributes[semantic] === undefined) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression decoded unexpected attribute ${semantic}`);
    }
    if (!Array.isArray(rows) || rows.length !== positions.length) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression decoded ${semantic} count must match POSITION count`);
    }
    for (const [rowIndex, row] of rows.entries()) {
      if (!Array.isArray(row) || row.some((value) => !Number.isFinite(value))) {
        throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression decoded ${semantic} row ${rowIndex} must contain finite values`);
      }
    }
  }
  if (decoded.indices !== undefined) {
    for (const index of decoded.indices) {
      if (!Number.isInteger(index) || index < 0 || index >= positions.length) {
        throw new RangeError(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_draco_mesh_compression decoded index ${index} is outside vertex count ${positions.length}`);
      }
    }
  }
}

function validateMaterialTexCoordSets(
  material: GLTFMaterialAsset | undefined,
  texcoordSets: readonly (readonly (readonly [number, number])[])[],
  meshIndex: number,
  primitiveIndex: number
): void {
  if (!material) return;
  for (const textureInfo of materialTextureInfos(material)) {
    if (textureInfo.texCoord > 0 && (texcoordSets[textureInfo.texCoord]?.length ?? 0) === 0) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} material ${material.name} references missing TEXCOORD_${textureInfo.texCoord}`);
    }
  }
}

function materialTextureInfos(material: GLTFMaterialAsset): readonly GLTFResolvedTextureInfo[] {
  return [
    material.baseColorTexture,
    material.metallicRoughnessTexture,
    material.normalTexture,
    material.occlusionTexture,
    material.emissiveTexture,
    material.clearcoat?.texture,
    material.clearcoat?.roughnessTexture,
    material.clearcoat?.normalTexture,
    material.transmission?.texture,
    material.diffuseTransmission?.texture,
    material.diffuseTransmission?.colorTexture,
    material.volume?.thicknessTexture,
    material.specular?.texture,
    material.specular?.colorTexture,
    material.sheen?.colorTexture,
    material.sheen?.roughnessTexture,
    material.anisotropy?.texture,
    material.iridescence?.texture,
    material.iridescence?.thicknessTexture
  ].filter((info): info is GLTFResolvedTextureInfo => info !== undefined);
}

function resolvePrimitiveMode(
  primitive: GLTFPrimitive,
  rawIndices: readonly number[] | undefined,
  vertexCount: number,
  meshIndex: number,
  primitiveIndex: number
): { readonly topology: "triangles" | "lines" | "points"; readonly indices?: readonly number[] } {
  const mode = primitive.mode ?? 4;
  const source = rawIndices ?? [...Array(vertexCount).keys()];
  validatePrimitiveIndices(source, vertexCount, meshIndex, primitiveIndex);
  switch (mode) {
    case 1:
      if (source.length % 2 !== 0) throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} LINES index count must be even`);
      return { topology: "lines", indices: rawIndices };
    case 2:
      return { topology: "lines", indices: expandLineLoop(source) };
    case 3:
      return { topology: "lines", indices: expandLineStrip(source) };
    case 4:
      if (source.length % 3 !== 0) throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} TRIANGLES index count must be a multiple of 3`);
      return { topology: "triangles", indices: rawIndices };
    case 5:
      return { topology: "triangles", indices: expandTriangleStrip(source) };
    case 6:
      return { topology: "triangles", indices: expandTriangleFan(source) };
    case 0:
      return { topology: "points", indices: rawIndices };
    default:
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} has unsupported primitive mode ${mode}`);
  }
}

function validatePrimitiveIndices(
  indices: readonly number[],
  vertexCount: number,
  meshIndex: number,
  primitiveIndex: number
): void {
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError(`glTF mesh ${meshIndex} primitive ${primitiveIndex} index ${index} is outside vertex count ${vertexCount}`);
    }
  }
}

function expandLineStrip(indices: readonly number[]): readonly number[] {
  const expanded: number[] = [];
  for (let index = 0; index < indices.length - 1; index += 1) {
    expanded.push(indices[index]!, indices[index + 1]!);
  }
  return expanded;
}

function expandLineLoop(indices: readonly number[]): readonly number[] {
  if (indices.length < 2) return [];
  const expanded = [...expandLineStrip(indices)];
  expanded.push(indices[indices.length - 1]!, indices[0]!);
  return expanded;
}

function expandTriangleStrip(indices: readonly number[]): readonly number[] {
  const expanded: number[] = [];
  for (let index = 0; index < indices.length - 2; index += 1) {
    if (index % 2 === 0) {
      expanded.push(indices[index]!, indices[index + 1]!, indices[index + 2]!);
    } else {
      expanded.push(indices[index + 1]!, indices[index]!, indices[index + 2]!);
    }
  }
  return expanded;
}

function expandTriangleFan(indices: readonly number[]): readonly number[] {
  const expanded: number[] = [];
  for (let index = 1; index < indices.length - 1; index += 1) {
    expanded.push(indices[0]!, indices[index]!, indices[index + 1]!);
  }
  return expanded;
}

function readMorphTargets(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  primitive: GLTFPrimitive,
  vertexCount: number,
  meshIndex: number,
  primitiveIndex: number,
  accessorCache: GLTFAccessorReadCache
): readonly GLTFMorphTargetAsset[] {
  if (primitive.targets === undefined) {
    return [];
  }
  if (!Array.isArray(primitive.targets)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} targets must be an array`);
  }
  return primitive.targets.map((target, targetIndex) => {
    validateMorphTargetDescriptor(target, meshIndex, primitiveIndex, targetIndex);
    const positions = readOptionalAccessor(json, buffers, target.POSITION, accessorCache);
    const normals = readOptionalAccessor(json, buffers, target.NORMAL, accessorCache);
    const tangents = readOptionalAccessor(json, buffers, target.TANGENT, accessorCache);
    if (positions.length > 0 && positions.length !== vertexCount) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} morph target ${targetIndex} POSITION count mismatch`);
    }
    if (normals.length > 0 && normals.length !== vertexCount) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} morph target ${targetIndex} NORMAL count mismatch`);
    }
    if (tangents.length > 0 && tangents.length !== vertexCount) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} morph target ${targetIndex} TANGENT count mismatch`);
    }
    return {
      positions: positions.map((position) => [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] as const),
      normals: normals.map((normal) => [normal[0] ?? 0, normal[1] ?? 0, normal[2] ?? 0] as const),
      tangents: tangents.map((tangent) => [tangent[0] ?? 0, tangent[1] ?? 0, tangent[2] ?? 0] as const)
    };
  });
}

function validateMorphTargetDescriptor(
  target: Readonly<Record<string, number>>,
  meshIndex: number,
  primitiveIndex: number,
  targetIndex: number
): void {
  if (!isObjectRecord(target) || Array.isArray(target)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} morph target ${targetIndex} must be an object`);
  }
  for (const key of Object.keys(target)) {
    if (key !== "POSITION" && key !== "NORMAL" && key !== "TANGENT") {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} morph target ${targetIndex} attribute ${key} is unsupported`);
    }
    const accessorIndex = target[key];
    if (!Number.isInteger(accessorIndex) || accessorIndex < 0) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} morph target ${targetIndex} ${key} accessor must be a non-negative integer`);
    }
  }
}

function resolveMorphWeights(
  mesh: GLTFMesh,
  meshIndex: number,
  primitiveIndex: number,
  targetCount: number
): readonly number[] {
  if (mesh.weights === undefined) {
    return Array.from({ length: targetCount }, () => 0);
  }
  if (!Array.isArray(mesh.weights)) {
    throw new Error(`glTF mesh ${meshIndex} weights must be an array`);
  }
  if (mesh.weights.length !== targetCount) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} weights count must match morph target count`);
  }
  if (mesh.weights.some((weight) => !Number.isFinite(weight))) {
    throw new Error(`glTF mesh ${meshIndex} weights must contain finite numbers`);
  }
  return [...mesh.weights];
}

function createImageAssets(json: GLTFJson, buffers: readonly ArrayBuffer[]): readonly GLTFImageAsset[] {
  const avifEnabled = usesGLTFExtension(json, "EXT_texture_avif");
  const webpEnabled = usesGLTFExtension(json, "EXT_texture_webp");
  const basisuEnabled = usesGLTFExtension(json, "KHR_texture_basisu");
  return (json.images ?? []).map((image, index) => {
    if (image.uri && image.bufferView !== undefined) {
      throw new Error(`glTF image ${index} cannot define both uri and bufferView`);
    }
    if (!image.uri && image.bufferView === undefined) {
      throw new Error(`glTF image ${index} must define uri or bufferView`);
    }
    if (image.bufferView !== undefined && !image.mimeType) {
      throw new Error(`glTF image ${index} with bufferView requires mimeType`);
    }
    validateImageMimeType(image, index, avifEnabled, webpEnabled, basisuEnabled);
    return {
      name: image.name ?? `image-${index}`,
      uri: image.uri,
      mimeType: image.mimeType,
      data: image.bufferView === undefined ? undefined : readBufferViewBytes(json, buffers, image.bufferView)
    };
  });
}

function validateImageMimeType(image: GLTFImage, index: number, avifEnabled: boolean, webpEnabled: boolean, basisuEnabled: boolean): void {
  if (image.mimeType !== undefined && !isSupportedImageMimeType(image.mimeType, avifEnabled, webpEnabled, basisuEnabled)) {
    throw new Error(`glTF image ${index} mimeType must be ${supportedImageMimeTypeMessage(avifEnabled, webpEnabled, basisuEnabled)}`);
  }
  if (image.uri?.startsWith("data:")) {
    const separator = image.uri.indexOf(",");
    if (separator < 0) {
      throw new Error(`glTF image ${index} data uri must include a comma separator`);
    }
    const mediaType = image.uri.slice(5, separator).split(";")[0]?.toLowerCase();
    if (!isSupportedImageMimeType(mediaType, avifEnabled, webpEnabled, basisuEnabled)) {
      throw new Error(`glTF image ${index} data uri media type must be ${supportedImageMimeTypeMessage(avifEnabled, webpEnabled, basisuEnabled)}`);
    }
  }
}

function isSupportedImageMimeType(mimeType: string | undefined, avifEnabled: boolean, webpEnabled: boolean, basisuEnabled: boolean): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || (avifEnabled && mimeType === "image/avif") || (webpEnabled && mimeType === "image/webp") || (basisuEnabled && mimeType === "image/ktx2");
}

function supportedImageMimeTypeMessage(avifEnabled: boolean, webpEnabled: boolean, basisuEnabled: boolean): string {
  return ["image/png", "image/jpeg", ...(avifEnabled ? ["image/avif"] : []), ...(webpEnabled ? ["image/webp"] : []), ...(basisuEnabled ? ["image/ktx2"] : [])].join(", or ");
}

function createTextureAssets(json: GLTFJson): readonly GLTFTextureAsset[] {
  return (json.textures ?? []).map((texture, index) => {
    const source = validateTextureDescriptor(json, texture, index);
    const sampler = texture.sampler;
    return {
      name: texture.name ?? `texture-${index}`,
      source,
      sampler,
      ...(sampler === undefined ? {} : { samplerDescriptor: createSamplerAsset(json.samplers![sampler]!, sampler) })
    };
  });
}

function validateTextureDescriptor(json: GLTFJson, texture: GLTFTexture, index: number): number {
  const avifSource = texture.extensions?.EXT_texture_avif?.source;
  if (avifSource !== undefined && !usesGLTFExtension(json, "EXT_texture_avif")) {
    throw new Error(`glTF texture ${index} uses EXT_texture_avif but the extension is not declared`);
  }
  const webpSource = texture.extensions?.EXT_texture_webp?.source;
  if (webpSource !== undefined && !usesGLTFExtension(json, "EXT_texture_webp")) {
    throw new Error(`glTF texture ${index} uses EXT_texture_webp but the extension is not declared`);
  }
  const basisuSource = texture.extensions?.KHR_texture_basisu?.source;
  if (basisuSource !== undefined && !usesGLTFExtension(json, "KHR_texture_basisu")) {
    throw new Error(`glTF texture ${index} uses KHR_texture_basisu but the extension is not declared`);
  }
  const source = basisuSource ?? avifSource ?? webpSource ?? texture.source;
  if (source === undefined) {
    throw new Error(`glTF texture ${index} references missing image source undefined`);
  }
  if (!Number.isInteger(source) || source < 0) {
    throw new Error(`glTF texture ${index} source must be a non-negative integer`);
  }
  if (!json.images?.[source]) {
    throw new Error(`glTF texture ${index} references missing image source ${source}`);
  }
  if (texture.sampler !== undefined) {
    if (!Number.isInteger(texture.sampler) || texture.sampler < 0) {
      throw new Error(`glTF texture ${index} sampler must be a non-negative integer`);
    }
    if (!json.samplers?.[texture.sampler]) {
      throw new Error(`glTF texture ${index} references missing sampler ${texture.sampler}`);
    }
  }
  return source;
}

function createSamplerAsset(sampler: GLTFSampler, samplerIndex: number): GLTFSamplerAsset {
  return {
    minFilter: minFilterFromGLTF(sampler.minFilter, samplerIndex),
    magFilter: magFilterFromGLTF(sampler.magFilter, samplerIndex),
    addressU: addressModeFromGLTF(sampler.wrapS, samplerIndex, "wrapS"),
    addressV: addressModeFromGLTF(sampler.wrapT, samplerIndex, "wrapT")
  };
}

function minFilterFromGLTF(value: number | undefined, samplerIndex: number): GLTFSamplerAsset["minFilter"] {
  if (value === undefined) return "linear-mipmap-linear";
  if (value === 9728) return "nearest";
  if (value === 9729) return "linear";
  if (value === 9984) return "nearest-mipmap-nearest";
  if (value === 9985) return "linear-mipmap-nearest";
  if (value === 9986) return "nearest-mipmap-linear";
  if (value === 9987) return "linear-mipmap-linear";
  throw new Error(`glTF sampler ${samplerIndex} minFilter has unsupported value ${value}`);
}

function magFilterFromGLTF(value: number | undefined, samplerIndex: number): "nearest" | "linear" {
  if (value === undefined) return "linear";
  if (value === 9728) return "nearest";
  if (value === 9729) return "linear";
  throw new Error(`glTF sampler ${samplerIndex} magFilter has unsupported value ${value}`);
}

function addressModeFromGLTF(value: number | undefined, samplerIndex: number, field: "wrapS" | "wrapT"): "clamp-to-edge" | "repeat" | "mirror-repeat" {
  if (value === undefined || value === 10497) return "repeat";
  if (value === 33071) return "clamp-to-edge";
  if (value === 33648) return "mirror-repeat";
  throw new Error(`glTF sampler ${samplerIndex} ${field} has unsupported value ${value}`);
}

function createSceneAssets(json: GLTFJson): readonly GLTFSceneAsset[] {
  return (json.scenes ?? []).map((scene, index) => {
    return {
      name: scene.name ?? `scene-${index}`,
      nodeIndices: [...(scene.nodes ?? [])]
    };
  });
}

function resolveDefaultSceneIndex(json: GLTFJson): number {
  return json.scene ?? 0;
}

function createMaterialAssets(
  json: GLTFJson,
  textures: readonly GLTFTextureAsset[]
): readonly GLTFMaterialAsset[] {
  return (json.materials ?? []).map((material, index) => {
    const pbr = material.pbrMetallicRoughness;
    const pbrSpecularGlossiness = resolvePBRSpecularGlossiness(material, textures, index).pbrSpecularGlossiness;
    const specular = resolveSpecular(material, textures, index).specular ?? createSpecularFromSpecularGlossiness(pbrSpecularGlossiness);
    return {
      name: material.name ?? `material-${index}`,
      unlit: material.extensions?.KHR_materials_unlit !== undefined,
      baseColorFactor: pbrSpecularGlossiness?.diffuseFactor ?? resolveColor4(pbr?.baseColorFactor, [1, 1, 1, 1], `material ${index} baseColorFactor`),
      baseColorTexture: pbrSpecularGlossiness?.diffuseTexture ?? resolveTextureInfo(textures, pbr?.baseColorTexture, `material ${index} baseColorTexture`),
      metallicFactor: pbrSpecularGlossiness ? 0 : resolveUnit(pbr?.metallicFactor, 1, `material ${index} metallicFactor`),
      roughnessFactor: pbrSpecularGlossiness ? 1 - pbrSpecularGlossiness.glossinessFactor : resolveUnit(pbr?.roughnessFactor, 1, `material ${index} roughnessFactor`),
      metallicRoughnessTexture: pbrSpecularGlossiness
        ? undefined
        : resolveTextureInfo(
          textures,
          pbr?.metallicRoughnessTexture,
          `material ${index} metallicRoughnessTexture`
        ),
      normalTexture: withDefaultScale(resolveTextureInfo(textures, material.normalTexture, `material ${index} normalTexture`), material.normalTexture?.scale),
      occlusionTexture: withDefaultStrength(
        resolveTextureInfo(textures, material.occlusionTexture, `material ${index} occlusionTexture`),
        material.occlusionTexture?.strength
      ),
      emissiveTexture: resolveTextureInfo(textures, material.emissiveTexture, `material ${index} emissiveTexture`),
      emissiveFactor: resolveColor3(material.emissiveFactor, [0, 0, 0], `material ${index} emissiveFactor`),
      emissiveStrength: resolveEmissiveStrength(material, index),
      ...(resolveClearcoat(material, textures, index)),
      ...(resolveTransmission(material, textures, index)),
      ...(resolveDiffuseTransmission(material, textures, pbrSpecularGlossiness, index)),
      ...(resolveVolume(material, textures, index)),
      ...(resolveIOR(material, index)),
      ...(specular ? { specular } : {}),
      ...(pbrSpecularGlossiness ? { pbrSpecularGlossiness } : {}),
      ...(resolveSheen(material, textures, index)),
      ...(resolveAnisotropy(material, textures, index)),
      ...(resolveIridescence(material, textures, index)),
      ...(resolveDispersion(material, index)),
      alphaMode: resolveAlphaMode(material.alphaMode, index),
      alphaCutoff: resolveUnit(material.alphaCutoff, 0.5, `material ${index} alphaCutoff`),
      doubleSided: material.doubleSided ?? false
    };
  });
}

function createMaterialVariantAssets(json: GLTFJson): readonly GLTFMaterialVariantAsset[] {
  if (!usesGLTFExtension(json, "KHR_materials_variants")) return [];
  const variants = json.extensions?.KHR_materials_variants?.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("glTF KHR_materials_variants.variants must be a non-empty array when the extension is declared");
  }
  return variants.map((variant, index) => {
    if (!isObjectRecord(variant)) {
      throw new Error(`glTF KHR_materials_variants variant ${index} must be an object`);
    }
    return { name: typeof variant.name === "string" && variant.name.length > 0 ? variant.name : `variant-${index}` };
  });
}

function resolvePrimitiveMaterialVariants(
  primitive: GLTFPrimitive,
  variants: readonly GLTFMaterialVariantAsset[],
  materials: readonly GLTFMaterialAsset[],
  meshIndex: number,
  primitiveIndex: number
): readonly GLTFMaterialVariantMappingAsset[] {
  const mappings = primitive.extensions?.KHR_materials_variants?.mappings;
  if (!mappings) return [];
  if (variants.length === 0) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} uses KHR_materials_variants but the extension is not declared`);
  }

  const resolved: GLTFMaterialVariantMappingAsset[] = [];
  for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex += 1) {
    const mapping = mappings[mappingIndex]!;
    if (!Number.isInteger(mapping.material) || mapping.material < 0) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_materials_variants mapping ${mappingIndex} material must be a non-negative integer`);
    }
    const material = materials[mapping.material];
    if (!material) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_materials_variants mapping ${mappingIndex} references missing material ${mapping.material}`);
    }
    if (!Array.isArray(mapping.variants) || mapping.variants.length === 0) {
      throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_materials_variants mapping ${mappingIndex} variants must be a non-empty array`);
    }
    for (const variantIndex of mapping.variants) {
      if (!Number.isInteger(variantIndex) || variantIndex < 0) {
        throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_materials_variants mapping ${mappingIndex} variant must be a non-negative integer`);
      }
      const variant = variants[variantIndex];
      if (!variant) {
        throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} KHR_materials_variants mapping ${mappingIndex} references missing variant ${variantIndex}`);
      }
      resolved.push({
        variantIndex,
        variant: variant.name,
        materialIndex: mapping.material,
        material: material.name
      });
    }
  }
  return resolved;
}

function resolveAlphaMode(value: string | undefined, materialIndex: number): "OPAQUE" | "MASK" | "BLEND" {
  if (value === undefined) return "OPAQUE";
  if (value === "OPAQUE" || value === "MASK" || value === "BLEND") return value;
  throw new Error(`glTF material ${materialIndex} alphaMode must be OPAQUE, MASK, or BLEND`);
}

function resolveTextureInfo(
  textures: readonly GLTFTextureAsset[],
  info: GLTFTextureInfo | undefined,
  label: string
): GLTFResolvedTextureInfo | undefined {
  if (!info) return undefined;
  if (!Number.isInteger(info.index) || info.index < 0) {
    throw new Error(`glTF ${label} index must be a non-negative integer`);
  }
  const texture = textures[info.index];
  if (!texture) {
    throw new Error(`glTF ${label} references missing texture ${info.index}`);
  }
  const transform = info.extensions?.KHR_texture_transform;
  const texCoord = transform?.texCoord ?? info.texCoord ?? 0;
  if (!Number.isInteger(texCoord) || texCoord < 0) {
    throw new RangeError(`glTF ${label} texCoord must be a non-negative integer`);
  }
  return {
    texture: info.index,
    image: texture.source,
    texCoord,
    ...(transform ? { transform: resolveTextureTransform(transform) } : {})
  };
}

function usesGLTFExtension(json: GLTFJson, extension: string): boolean {
  return Boolean(json.extensionsRequired?.includes(extension) || json.extensionsUsed?.includes(extension));
}

function usesGLTFMeshoptExtension(json: GLTFJson): boolean {
  return GLTF_MESHOPT_EXTENSION_NAMES.some((extension) => usesGLTFExtension(json, extension));
}

const GLTF_MESHOPT_EXTENSION_NAMES = ["EXT_meshopt_compression", "KHR_meshopt_compression"] as const;

function validatePrimitiveAttributeAccessors(
  json: GLTFJson,
  primitive: GLTFPrimitive,
  meshQuantizationEnabled: boolean,
  meshIndex: number,
  primitiveIndex: number
): void {
  for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) {
    if (semantic !== "POSITION" && semantic !== "NORMAL" && semantic !== "TANGENT") {
      continue;
    }
    const accessor = json.accessors?.[accessorIndex];
    if (!accessor) {
      continue;
    }
    if (!isAccessorComponentType(accessor.componentType)) {
      continue;
    }
    validateQuantizedAttributeComponentType(accessor.componentType, semantic, meshQuantizationEnabled, meshIndex, primitiveIndex);
  }
}

function validateQuantizedAttributeComponentType(
  componentType: GLTFComponentType,
  semantic: string,
  meshQuantizationEnabled: boolean,
  meshIndex: number,
  primitiveIndex: number
): void {
  if (componentType === 5126) {
    return;
  }
  if (!meshQuantizationEnabled) {
    throw new Error(
      `glTF mesh ${meshIndex} primitive ${primitiveIndex} ${semantic} accessor uses non-FLOAT componentType ${componentType}; declare KHR_mesh_quantization to import quantized attributes`
    );
  }
  if (componentType === 5120 || componentType === 5121 || componentType === 5122 || componentType === 5123) {
    return;
  }
  throw new Error(
    `glTF mesh ${meshIndex} primitive ${primitiveIndex} ${semantic} accessor componentType ${componentType} is unsupported for KHR_mesh_quantization`
  );
}

function normalizeSkinWeights(
  weights: readonly [number, number, number, number],
  meshIndex: number,
  primitiveIndex: number
): readonly [number, number, number, number] {
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} WEIGHTS_0 must contain finite non-negative values`);
  }
  const sum = weights[0] + weights[1] + weights[2] + weights[3];
  if (sum <= 0) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} WEIGHTS_0 must sum to a positive value`);
  }
  if (Math.abs(sum - 1) <= 1e-5) return weights;
  return [
    weights[0] / sum,
    weights[1] / sum,
    weights[2] / sum,
    weights[3] / sum
  ] as const;
}

function createCameraAssets(json: GLTFJson): readonly GLTFCameraAsset[] {
  return (json.cameras ?? []).map((camera, index) => {
    if (camera.type === "perspective") {
      if (!camera.perspective) {
        throw new Error(`glTF camera ${index} perspective camera requires perspective data`);
      }
      const yfov = resolveCameraPositive(camera.perspective.yfov, `camera ${index} perspective.yfov`);
      if (yfov >= Math.PI) {
        throw new RangeError(`glTF camera ${index} perspective.yfov must be less than PI`);
      }
      const znear = resolveCameraPositive(camera.perspective.znear, `camera ${index} perspective.znear`);
      const zfar = camera.perspective.zfar === undefined
        ? 1000
        : resolveCameraPositive(camera.perspective.zfar, `camera ${index} perspective.zfar`);
      if (zfar <= znear) {
        throw new RangeError(`glTF camera ${index} perspective.zfar must be greater than znear`);
      }
      const aspectRatio = resolveCameraPositive(camera.perspective.aspectRatio ?? 1, `camera ${index} perspective.aspectRatio`);
      return {
        name: camera.name ?? `camera-${index}`,
        type: "perspective",
        perspective: { aspectRatio, yfov, znear, zfar }
      };
    }
    if (camera.type === "orthographic") {
      if (!camera.orthographic) {
        throw new Error(`glTF camera ${index} orthographic camera requires orthographic data`);
      }
      const xmag = resolveCameraPositive(camera.orthographic.xmag, `camera ${index} orthographic.xmag`);
      const ymag = resolveCameraPositive(camera.orthographic.ymag, `camera ${index} orthographic.ymag`);
      const znear = resolveCameraPositive(camera.orthographic.znear, `camera ${index} orthographic.znear`);
      const zfar = resolveCameraPositive(camera.orthographic.zfar, `camera ${index} orthographic.zfar`);
      if (zfar <= znear) {
        throw new RangeError(`glTF camera ${index} orthographic.zfar must be greater than znear`);
      }
      return {
        name: camera.name ?? `camera-${index}`,
        type: "orthographic",
        orthographic: { xmag, ymag, znear, zfar }
      };
    }
    throw new Error(`glTF camera ${index} has unsupported type ${String(camera.type)}`);
  });
}

function resolveCameraPositive(value: number | undefined, label: string): number {
  const resolved = value;
  if (resolved === undefined || !Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError(`glTF ${label} must be finite and positive`);
  }
  return resolved;
}

function createLightAssets(json: GLTFJson): readonly GLTFLightAsset[] {
  return (json.extensions?.KHR_lights_punctual?.lights ?? []).map((light, index) => {
    const color = resolveColor3(light.color, [1, 1, 1], `light ${index} color`);
    const intensity = resolveNonNegative(light.intensity, 1, `light ${index} intensity`);
    if (light.type !== "directional" && light.type !== "point" && light.type !== "spot") {
      throw new Error(`glTF light ${index} has unsupported type ${String(light.type)}`);
    }
    if (light.type === "directional") {
      return { name: light.name ?? `light-${index}`, type: "directional", color, intensity };
    }

    const range = resolvePositive(light.range, 10, `light ${index} range`);
    if (light.type === "point") {
      return { name: light.name ?? `light-${index}`, type: "point", color, intensity, range };
    }

    const outerConeAngle = resolveConeAngle(light.spot?.outerConeAngle, Math.PI / 4, `light ${index} spot.outerConeAngle`, false);
    const innerConeAngle = resolveConeAngle(light.spot?.innerConeAngle, 0, `light ${index} spot.innerConeAngle`, true);
    if (innerConeAngle > outerConeAngle) {
      throw new RangeError(`glTF light ${index} spot.innerConeAngle must be less than or equal to outerConeAngle`);
    }
    return {
      name: light.name ?? `light-${index}`,
      type: "spot",
      color,
      intensity,
      range,
      spot: { innerConeAngle, outerConeAngle }
    };
  });
}

function resolveConeAngle(value: number | undefined, fallback: number, label: string, allowZero: boolean): number {
  const resolved = value ?? fallback;
  const valid = allowZero ? resolved >= 0 : resolved > 0;
  if (!Number.isFinite(resolved) || !valid || resolved >= Math.PI / 2) {
    const lower = allowZero ? "[0" : "(0";
    throw new RangeError(`glTF ${label} must be finite and within ${lower}, PI / 2)`);
  }
  return resolved;
}

function resolveEmissiveStrength(material: GLTFMaterial, materialIndex: number): number {
  const strength = material.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
  if (!Number.isFinite(strength) || strength < 0) {
    throw new RangeError(`glTF material ${materialIndex} KHR_materials_emissive_strength.emissiveStrength must be finite and non-negative`);
  }
  return strength;
}

function resolveClearcoat(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly clearcoat?: GLTFClearcoatMaterialExtension } {
  const extension = material.extensions?.KHR_materials_clearcoat;
  if (!extension) return {};
  return {
    clearcoat: {
      factor: resolveUnit(extension.clearcoatFactor, 0, `material ${materialIndex} KHR_materials_clearcoat.clearcoatFactor`),
      texture: resolveTextureInfo(textures, extension.clearcoatTexture, `material ${materialIndex} KHR_materials_clearcoat.clearcoatTexture`),
      roughnessFactor: resolveUnit(extension.clearcoatRoughnessFactor, 0, `material ${materialIndex} KHR_materials_clearcoat.clearcoatRoughnessFactor`),
      roughnessTexture: resolveTextureInfo(textures, extension.clearcoatRoughnessTexture, `material ${materialIndex} KHR_materials_clearcoat.clearcoatRoughnessTexture`),
      normalTexture: withDefaultScale(
        resolveTextureInfo(textures, extension.clearcoatNormalTexture, `material ${materialIndex} KHR_materials_clearcoat.clearcoatNormalTexture`),
        extension.clearcoatNormalTexture?.scale
      )
    }
  };
}

function resolveTransmission(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly transmission?: GLTFTransmissionMaterialExtension } {
  const extension = material.extensions?.KHR_materials_transmission;
  if (!extension) return {};
  return {
    transmission: {
      factor: resolveUnit(extension.transmissionFactor, 0, `material ${materialIndex} KHR_materials_transmission.transmissionFactor`),
      texture: resolveTextureInfo(textures, extension.transmissionTexture, `material ${materialIndex} KHR_materials_transmission.transmissionTexture`)
    }
  };
}

function resolveDiffuseTransmission(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  pbrSpecularGlossiness: GLTFPBRSpecularGlossinessMaterialExtension | undefined,
  materialIndex: number
): { readonly diffuseTransmission?: GLTFDiffuseTransmissionMaterialExtension } {
  const extension = material.extensions?.KHR_materials_diffuse_transmission;
  if (!extension) return {};
  if (material.extensions?.KHR_materials_unlit !== undefined) {
    throw new Error(`glTF material ${materialIndex} KHR_materials_diffuse_transmission must not be combined with KHR_materials_unlit`);
  }
  if (pbrSpecularGlossiness) {
    throw new Error(`glTF material ${materialIndex} KHR_materials_diffuse_transmission must not be combined with KHR_materials_pbrSpecularGlossiness`);
  }
  return {
    diffuseTransmission: {
      factor: resolveUnit(
        extension.diffuseTransmissionFactor,
        0,
        `material ${materialIndex} KHR_materials_diffuse_transmission.diffuseTransmissionFactor`
      ),
      texture: resolveTextureInfo(
        textures,
        extension.diffuseTransmissionTexture,
        `material ${materialIndex} KHR_materials_diffuse_transmission.diffuseTransmissionTexture`
      ),
      colorFactor: resolveColor3(
        extension.diffuseTransmissionColorFactor,
        [1, 1, 1],
        `material ${materialIndex} KHR_materials_diffuse_transmission.diffuseTransmissionColorFactor`
      ),
      colorTexture: resolveTextureInfo(
        textures,
        extension.diffuseTransmissionColorTexture,
        `material ${materialIndex} KHR_materials_diffuse_transmission.diffuseTransmissionColorTexture`
      )
    }
  };
}

function resolveVolume(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly volume?: GLTFVolumeMaterialExtension } {
  const extension = material.extensions?.KHR_materials_volume;
  if (!extension) return {};
  return {
    volume: {
      thicknessFactor: resolveNonNegative(extension.thicknessFactor, 0, `material ${materialIndex} KHR_materials_volume.thicknessFactor`),
      thicknessTexture: resolveTextureInfo(textures, extension.thicknessTexture, `material ${materialIndex} KHR_materials_volume.thicknessTexture`),
      attenuationDistance: resolvePositive(extension.attenuationDistance, Number.POSITIVE_INFINITY, `material ${materialIndex} KHR_materials_volume.attenuationDistance`),
      attenuationColor: resolveColor3(extension.attenuationColor, [1, 1, 1], `material ${materialIndex} KHR_materials_volume.attenuationColor`)
    }
  };
}

function resolveIOR(material: GLTFMaterial, materialIndex: number): { readonly ior?: number } {
  const extension = material.extensions?.KHR_materials_ior;
  if (!extension) return {};
  const ior = extension.ior ?? 1.5;
  if (!Number.isFinite(ior) || ior < 1) {
    throw new RangeError(`glTF material ${materialIndex} KHR_materials_ior.ior must be finite and at least 1`);
  }
  return { ior };
}

function resolveSpecular(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly specular?: GLTFSpecularMaterialExtension } {
  const extension = material.extensions?.KHR_materials_specular;
  if (!extension) return {};
  return {
    specular: {
      factor: resolveUnit(extension.specularFactor, 1, `material ${materialIndex} KHR_materials_specular.specularFactor`),
      texture: resolveTextureInfo(textures, extension.specularTexture, `material ${materialIndex} KHR_materials_specular.specularTexture`),
      colorFactor: resolveNonNegativeColor3(extension.specularColorFactor, [1, 1, 1], `material ${materialIndex} KHR_materials_specular.specularColorFactor`),
      colorTexture: resolveTextureInfo(textures, extension.specularColorTexture, `material ${materialIndex} KHR_materials_specular.specularColorTexture`)
    }
  };
}

function resolvePBRSpecularGlossiness(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly pbrSpecularGlossiness?: GLTFPBRSpecularGlossinessMaterialExtension } {
  const extension = material.extensions?.KHR_materials_pbrSpecularGlossiness;
  if (!extension) return {};
  return {
    pbrSpecularGlossiness: {
      diffuseFactor: resolveColor4(
        extension.diffuseFactor,
        [1, 1, 1, 1],
        `material ${materialIndex} KHR_materials_pbrSpecularGlossiness.diffuseFactor`
      ),
      diffuseTexture: resolveTextureInfo(
        textures,
        extension.diffuseTexture,
        `material ${materialIndex} KHR_materials_pbrSpecularGlossiness.diffuseTexture`
      ),
      specularFactor: resolveColor3(
        extension.specularFactor,
        [1, 1, 1],
        `material ${materialIndex} KHR_materials_pbrSpecularGlossiness.specularFactor`
      ),
      glossinessFactor: resolveUnit(
        extension.glossinessFactor,
        1,
        `material ${materialIndex} KHR_materials_pbrSpecularGlossiness.glossinessFactor`
      ),
      specularGlossinessTexture: resolveTextureInfo(
        textures,
        extension.specularGlossinessTexture,
        `material ${materialIndex} KHR_materials_pbrSpecularGlossiness.specularGlossinessTexture`
      )
    }
  };
}

function resolveSheen(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly sheen?: GLTFSheenMaterialExtension } {
  const extension = material.extensions?.KHR_materials_sheen;
  if (!extension) return {};
  return {
    sheen: {
      colorFactor: resolveColor3(extension.sheenColorFactor, [0, 0, 0], `material ${materialIndex} KHR_materials_sheen.sheenColorFactor`),
      colorTexture: resolveTextureInfo(textures, extension.sheenColorTexture, `material ${materialIndex} KHR_materials_sheen.sheenColorTexture`),
      roughnessFactor: resolveUnit(extension.sheenRoughnessFactor, 0, `material ${materialIndex} KHR_materials_sheen.sheenRoughnessFactor`),
      roughnessTexture: resolveTextureInfo(textures, extension.sheenRoughnessTexture, `material ${materialIndex} KHR_materials_sheen.sheenRoughnessTexture`)
    }
  };
}

function resolveAnisotropy(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly anisotropy?: GLTFAnisotropyMaterialExtension } {
  const extension = material.extensions?.KHR_materials_anisotropy;
  if (!extension) return {};
  return {
    anisotropy: {
      strength: resolveUnit(extension.anisotropyStrength, 0, `material ${materialIndex} KHR_materials_anisotropy.anisotropyStrength`),
      rotation: resolveFiniteNumber(extension.anisotropyRotation, 0, `material ${materialIndex} KHR_materials_anisotropy.anisotropyRotation`),
      texture: resolveTextureInfo(textures, extension.anisotropyTexture, `material ${materialIndex} KHR_materials_anisotropy.anisotropyTexture`)
    }
  };
}

function resolveIridescence(
  material: GLTFMaterial,
  textures: readonly GLTFTextureAsset[],
  materialIndex: number
): { readonly iridescence?: GLTFIridescenceMaterialExtension } {
  const extension = material.extensions?.KHR_materials_iridescence;
  if (!extension) return {};
  const thicknessMinimum = resolveNonNegative(
    extension.iridescenceThicknessMinimum,
    100,
    `material ${materialIndex} KHR_materials_iridescence.iridescenceThicknessMinimum`
  );
  const thicknessMaximum = resolveNonNegative(
    extension.iridescenceThicknessMaximum,
    400,
    `material ${materialIndex} KHR_materials_iridescence.iridescenceThicknessMaximum`
  );
  if (thicknessMaximum < thicknessMinimum) {
    throw new RangeError(
      `glTF material ${materialIndex} KHR_materials_iridescence.iridescenceThicknessMaximum must be greater than or equal to iridescenceThicknessMinimum`
    );
  }
  return {
    iridescence: {
      factor: resolveUnit(extension.iridescenceFactor, 0, `material ${materialIndex} KHR_materials_iridescence.iridescenceFactor`),
      texture: resolveTextureInfo(textures, extension.iridescenceTexture, `material ${materialIndex} KHR_materials_iridescence.iridescenceTexture`),
      ior: resolveIridescenceIOR(extension.iridescenceIor, materialIndex),
      thicknessMinimum,
      thicknessMaximum,
      thicknessTexture: resolveTextureInfo(
        textures,
        extension.iridescenceThicknessTexture,
        `material ${materialIndex} KHR_materials_iridescence.iridescenceThicknessTexture`
      )
    }
  };
}

function resolveIridescenceIOR(value: number | undefined, materialIndex: number): number {
  const ior = value ?? 1.3;
  if (!Number.isFinite(ior) || ior < 1 || ior > 3) {
    throw new RangeError(`glTF material ${materialIndex} KHR_materials_iridescence.iridescenceIor must be finite and within [1, 3]`);
  }
  return ior;
}

function resolveDispersion(material: GLTFMaterial, materialIndex: number): { readonly dispersion?: number } {
  const extension = material.extensions?.KHR_materials_dispersion;
  if (!extension) return {};
  return {
    dispersion: resolveNonNegative(extension.dispersion, 0, `material ${materialIndex} KHR_materials_dispersion.dispersion`)
  };
}

function resolveTextureTransform(transform: GLTFTextureTransform): GLTFResolvedTextureTransform {
  return {
    offset: resolveFiniteVec2(transform.offset, [0, 0], "KHR_texture_transform.offset"),
    scale: resolveFiniteVec2(transform.scale, [1, 1], "KHR_texture_transform.scale"),
    rotation: resolveFiniteNumber(transform.rotation, 0, "KHR_texture_transform.rotation")
  };
}

function withDefaultScale<T extends GLTFResolvedTextureInfo | undefined>(
  info: T,
  scale: number | undefined
): (GLTFResolvedTextureInfo & { readonly scale: number }) | undefined {
  return info ? { ...info, scale: resolveNonNegative(scale, 1, "normalTexture.scale") } : undefined;
}

function withDefaultStrength<T extends GLTFResolvedTextureInfo | undefined>(
  info: T,
  strength: number | undefined
): (GLTFResolvedTextureInfo & { readonly strength: number }) | undefined {
  return info ? { ...info, strength: resolveUnit(strength, 1, "occlusionTexture.strength") } : undefined;
}

function resolveColor4(
  value: readonly number[] | undefined,
  fallback: readonly [number, number, number, number],
  label: string
): readonly [number, number, number, number] {
  const channels = value ?? fallback;
  if (channels.length !== 4 || channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`glTF ${label} must contain four finite values in [0, 1]`);
  }
  return [channels[0]!, channels[1]!, channels[2]!, channels[3]!];
}

function resolveColor3(
  value: readonly number[] | undefined,
  fallback: readonly [number, number, number],
  label: string
): readonly [number, number, number] {
  const channels = value ?? fallback;
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new RangeError(`glTF ${label} must contain three finite values in [0, 1]`);
  }
  return [channels[0]!, channels[1]!, channels[2]!];
}

function resolveNonNegativeColor3(
  value: readonly number[] | undefined,
  fallback: readonly [number, number, number],
  label: string
): readonly [number, number, number] {
  const channels = value ?? fallback;
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel) || channel < 0)) {
    throw new RangeError(`glTF ${label} must contain three finite non-negative values`);
  }
  return [channels[0]!, channels[1]!, channels[2]!];
}

function resolveUnit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new RangeError(`glTF ${label} must be finite and within [0, 1]`);
  }
  return resolved;
}

function resolveNonNegative(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`glTF ${label} must be finite and non-negative`);
  }
  return resolved;
}

function resolvePositive(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (resolved === Number.POSITIVE_INFINITY) return resolved;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError(`glTF ${label} must be finite and positive`);
  }
  return resolved;
}

function resolveFiniteNumber(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) {
    throw new RangeError(`glTF ${label} must be finite`);
  }
  return resolved;
}

function resolveFiniteVec2(
  value: readonly number[] | undefined,
  fallback: readonly [number, number],
  label: string
): readonly [number, number] {
  const resolved = value ?? fallback;
  if (resolved.length !== 2 || resolved.some((channel) => !Number.isFinite(channel))) {
    throw new RangeError(`glTF ${label} must contain two finite values`);
  }
  return [resolved[0]!, resolved[1]!];
}

function createSkinAssets(json: GLTFJson, buffers: readonly ArrayBuffer[], accessorCache: GLTFAccessorReadCache): readonly GLTFSkinAsset[] {
  if (!json.skins || json.skins.length === 0) return [];
  const nodeWorldMatrices = computeGLTFNodeWorldMatrices(json);
  const nodeNameForIndex = createGLTFNodeNameResolver(json);
  return (json.skins ?? []).map((skin, skinIndex) => {
    if (skin.joints.length === 0) {
      throw new Error(`glTF skin ${skinIndex} requires at least one joint`);
    }
    validateSkinDescriptor(json, skin, skinIndex);
    const parentByNode = parentIndexByNode(json);
    const inverseBindMatrices = skin.inverseBindMatrices === undefined
      ? []
      : readAccessor(json, buffers, skin.inverseBindMatrices, accessorCache).map(toMat4);
    if (inverseBindMatrices.length > 0 && inverseBindMatrices.length !== skin.joints.length) {
      throw new Error(`glTF skin ${skinIndex} inverseBindMatrices count must match joints count`);
    }
    const jointSet = new Set(skin.joints);
    const orderedJoints = orderSkinJoints(json, skin.joints);
    const boneIndexByNode = new Map<number, number>();
    for (let index = 0; index < orderedJoints.length; index += 1) {
      boneIndexByNode.set(orderedJoints[index]!, index);
    }
    const skeleton = new Skeleton(orderedJoints.map((nodeIndex) => {
      const node = json.nodes?.[nodeIndex];
      if (!node) {
        throw new Error(`glTF skin ${skinIndex} references missing joint node ${nodeIndex}`);
      }
      const parentNode = parentByNode.get(nodeIndex);
      const parentIndex = parentNode !== undefined && jointSet.has(parentNode) ? boneIndexByNode.get(parentNode) ?? -1 : -1;
      const transform = resolveNodeTransform(node, nodeIndex);
      return {
        name: nodeNameForIndex(nodeIndex),
        parentIndex,
        translation: transform.translation,
        rotation: transform.rotation,
        scale: transform.scale,
        inverseBindMatrix: inverseBindMatrices[skin.joints.indexOf(nodeIndex)] ?? identityMat4()
      };
    }));
    return {
      name: skin.name ?? `skin-${skinIndex}`,
      joints: skin.joints,
      jointNames: skin.joints.map((nodeIndex) => nodeNameForIndex(nodeIndex)),
      inverseBindMatrices: skin.joints.map((nodeIndex) => inverseBindMatrices[skin.joints.indexOf(nodeIndex)] ?? identityMat4()),
      skeletonRoot: skin.skeleton,
      skeleton,
      jointBindMatrices: skin.joints.map((nodeIndex) => multiplyLoaderMat4(
        nodeWorldMatrices.get(nodeIndex) ?? identityMat4(),
        inverseBindMatrices[skin.joints.indexOf(nodeIndex)] ?? identityMat4()
      )),
      ...(skin.joints.length <= MAX_RENDERABLE_SKIN_JOINTS ? { skinningPalette: buildGLTFSkinningPalette(skeleton, orderedJoints, skin.joints) } : {})
    };
  });
}

function computeGLTFNodeWorldMatrices(json: GLTFJson): ReadonlyMap<number, Mat4> {
  const nodes = json.nodes ?? [];
  const parents = parentIndexByNode(json);
  const matrices = new Map<number, Mat4>();
  const visiting = new Set<number>();
  const resolve = (nodeIndex: number): Mat4 => {
    const existing = matrices.get(nodeIndex);
    if (existing) return existing;
    if (visiting.has(nodeIndex)) {
      throw new Error(`glTF node graph contains a cycle at node ${nodeIndex}`);
    }
    const node = nodes[nodeIndex];
    if (!node) return identityMat4();
    visiting.add(nodeIndex);
    const transform = resolveNodeTransform(node, nodeIndex);
    const local = composeLoaderMat4(transform.translation, transform.rotation, transform.scale);
    const parent = parents.get(nodeIndex);
    const world = parent === undefined ? local : multiplyLoaderMat4(resolve(parent), local);
    matrices.set(nodeIndex, world);
    visiting.delete(nodeIndex);
    return world;
  };
  for (let index = 0; index < nodes.length; index += 1) {
    resolve(index);
  }
  return matrices;
}

function buildGLTFSkinningPalette(skeleton: Skeleton, orderedJoints: readonly number[], gltfJoints: readonly number[]): SkinningPalette {
  const orderedPalette = skeleton.matrixPalette();
  const paletteByNode = new Map<number, Mat4>();
  for (let index = 0; index < orderedJoints.length; index += 1) {
    paletteByNode.set(orderedJoints[index]!, orderedPalette[index]!);
  }
  const matrices = new Float32Array(gltfJoints.length * 16);
  for (let index = 0; index < gltfJoints.length; index += 1) {
    const matrix = paletteByNode.get(gltfJoints[index]!);
    if (!matrix) {
      throw new Error(`glTF skin references missing ordered joint ${gltfJoints[index]}`);
    }
    matrices.set(matrix, index * 16);
  }
  return { jointCount: gltfJoints.length, matrices };
}

function validateSkinDescriptor(json: GLTFJson, skin: GLTFSkin, skinIndex: number): void {
  const seen = new Set<number>();
  for (const joint of skin.joints) {
    if (!Number.isInteger(joint) || joint < 0) {
      throw new Error(`glTF skin ${skinIndex} joint indices must be non-negative integers`);
    }
    if (seen.has(joint)) {
      throw new Error(`glTF skin ${skinIndex} contains duplicate joint ${joint}`);
    }
    seen.add(joint);
  }
  if (skin.skeleton !== undefined && (!Number.isInteger(skin.skeleton) || skin.skeleton < 0 || !json.nodes?.[skin.skeleton])) {
    throw new Error(`glTF skin ${skinIndex} references missing skeleton node ${skin.skeleton}`);
  }
  if (skin.inverseBindMatrices !== undefined && (!Number.isInteger(skin.inverseBindMatrices) || skin.inverseBindMatrices < 0)) {
    throw new Error(`glTF skin ${skinIndex} inverseBindMatrices must reference a non-negative accessor index`);
  }
}

function createNodeInstanceTransforms(json: GLTFJson, buffers: readonly ArrayBuffer[], accessorCache: GLTFAccessorReadCache): ReadonlyMap<number, Float32Array> {
  const transforms = new Map<number, Float32Array>();
  for (const [nodeIndex, node] of (json.nodes ?? []).entries()) {
    const extension = node.extensions?.EXT_mesh_gpu_instancing;
    if (!extension) continue;
    if (!isObjectRecord(extension.attributes) || Array.isArray(extension.attributes)) {
      throw new Error(`glTF node ${nodeIndex} EXT_mesh_gpu_instancing.attributes must be an object`);
    }
    const allowed = new Set(["TRANSLATION", "ROTATION", "SCALE"]);
    for (const semantic of Object.keys(extension.attributes)) {
      if (!allowed.has(semantic)) {
        throw new Error(`glTF node ${nodeIndex} EXT_mesh_gpu_instancing attribute ${semantic} is unsupported`);
      }
      const accessorIndex = extension.attributes[semantic];
      if (!Number.isInteger(accessorIndex) || accessorIndex < 0) {
        throw new Error(`glTF node ${nodeIndex} EXT_mesh_gpu_instancing ${semantic} accessor must be a non-negative integer`);
      }
    }
    const translations = readOptionalAccessor(json, buffers, extension.attributes.TRANSLATION, accessorCache);
    const rotations = readOptionalAccessor(json, buffers, extension.attributes.ROTATION, accessorCache);
    const scales = readOptionalAccessor(json, buffers, extension.attributes.SCALE, accessorCache);
    const instanceCount = firstPositiveLength([translations.length, rotations.length, scales.length]);
    if (instanceCount === 0) {
      throw new Error(`glTF node ${nodeIndex} EXT_mesh_gpu_instancing requires TRANSLATION, ROTATION, or SCALE attributes`);
    }
    validateInstanceAttributeCount("TRANSLATION", translations.length, instanceCount, nodeIndex);
    validateInstanceAttributeCount("ROTATION", rotations.length, instanceCount, nodeIndex);
    validateInstanceAttributeCount("SCALE", scales.length, instanceCount, nodeIndex);
    const packed = new Float32Array(instanceCount * 16);
    for (let instanceIndex = 0; instanceIndex < instanceCount; instanceIndex += 1) {
      const translation = toInstanceVec3(translations[instanceIndex], [0, 0, 0], `node ${nodeIndex} EXT_mesh_gpu_instancing TRANSLATION`);
      const rotation = toInstanceQuat(rotations[instanceIndex], [0, 0, 0, 1], `node ${nodeIndex} EXT_mesh_gpu_instancing ROTATION`);
      const scale = toInstanceVec3(scales[instanceIndex], [1, 1, 1], `node ${nodeIndex} EXT_mesh_gpu_instancing SCALE`);
      packed.set(composeMat4(translation, rotation, scale), instanceIndex * 16);
    }
    transforms.set(nodeIndex, packed);
  }
  return transforms;
}

function firstPositiveLength(lengths: readonly number[]): number {
  return lengths.find((length) => length > 0) ?? 0;
}

function validateInstanceAttributeCount(semantic: string, count: number, instanceCount: number, nodeIndex: number): void {
  if (count > 0 && count !== instanceCount) {
    throw new Error(`glTF node ${nodeIndex} EXT_mesh_gpu_instancing ${semantic} count must match instance count`);
  }
}

function toInstanceVec3(row: readonly number[] | undefined, fallback: SceneVec3, label: string): SceneVec3 {
  if (!row) return fallback;
  if (row.length < 3 || row.slice(0, 3).some((value) => !Number.isFinite(value))) {
    throw new Error(`glTF ${label} must contain three finite values`);
  }
  return [row[0]!, row[1]!, row[2]!];
}

function toInstanceQuat(row: readonly number[] | undefined, fallback: SceneQuat, label: string): SceneQuat {
  if (!row) return fallback;
  if (row.length < 4 || row.slice(0, 4).some((value) => !Number.isFinite(value))) {
    throw new Error(`glTF ${label} must contain four finite values`);
  }
  return [row[0]!, row[1]!, row[2]!, row[3]!];
}

function createAnimationClips(json: GLTFJson, buffers: readonly ArrayBuffer[], accessorCache: GLTFAccessorReadCache): readonly AnimationClip[] {
  const nodeNameForIndex = createGLTFNodeNameResolver(json);
  return (json.animations ?? []).map((animation, animationIndex) => {
    const tracks = animation.channels.flatMap((channel, channelIndex) => {
      const sampler = animation.samplers[channel.sampler];
      if (!sampler) {
        throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} references missing sampler ${channel.sampler}`);
      }
      if (isOptionalAnimationPointerChannel(json, channel)) {
        return [];
      }
      if (channel.target.node === undefined || !json.nodes?.[channel.target.node]) {
        throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} references missing target node ${channel.target.node ?? "undefined"}`);
      }
      const interpolation = resolveAnimationInterpolation(sampler.interpolation, animationIndex, channelIndex);
      const path = resolveAnimationTargetPath(channel.target.path, animationIndex, channelIndex);
      const times = readAccessor(json, buffers, sampler.input, accessorCache).map((row) => row[0] ?? 0);
      const output = readAccessor(json, buffers, sampler.output, accessorCache);
      const values = animationKeyframesForSampler(path, times, output, interpolation, animationIndex, channelIndex, morphWeightCountForAnimationTarget(json, channel.target.node));
      const valueType = valueTypeForAnimationPath(path);
      return [new AnimationTrack({
        target: `${nodeNameForIndex(channel.target.node)}.${path}`,
        valueType,
        keyframes: values
      })];
    });
    return new AnimationClip({ name: animation.name ?? `animation-${animationIndex}`, tracks });
  });
}

function isOptionalAnimationPointerChannel(json: GLTFJson, channel: GLTFAnimationChannel): boolean {
  return channel.target.path === "pointer" &&
    json.extensionsUsed?.includes("KHR_animation_pointer") === true &&
    json.extensionsRequired?.includes("KHR_animation_pointer") !== true &&
    typeof channel.target.extensions?.KHR_animation_pointer?.pointer === "string";
}

function resolveAnimationInterpolation(
  value: string | undefined,
  animationIndex: number,
  channelIndex: number
): "LINEAR" | "STEP" | "CUBICSPLINE" {
  if (value === undefined || value === "LINEAR" || value === "STEP" || value === "CUBICSPLINE") {
    return value ?? "LINEAR";
  }
  throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} interpolation ${value} is unsupported`);
}

function resolveAnimationTargetPath(
  path: string,
  animationIndex: number,
  channelIndex: number
): GLTFAnimationChannel["target"]["path"] {
  if (path === "translation" || path === "rotation" || path === "scale" || path === "weights") {
    return path;
  }
  throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} target path ${path} is unsupported`);
}

function animationKeyframesForSampler(
  path: GLTFAnimationChannel["target"]["path"],
  times: readonly number[],
  output: readonly (readonly number[])[],
  interpolation: "LINEAR" | "STEP" | "CUBICSPLINE",
  animationIndex: number,
  channelIndex: number,
  morphWeightCount?: number
): readonly {
  readonly time: number;
  readonly value: number | Vec3 | Quat | readonly number[];
  readonly interpolation: "step" | "linear" | "cubicspline";
  readonly inTangent?: number | Vec3 | Quat | readonly number[];
  readonly outTangent?: number | Vec3 | Quat | readonly number[];
}[] {
  const normalizedOutput = path === "weights" ? normalizeWeightAnimationOutput(times, output, interpolation, animationIndex, channelIndex, morphWeightCount) : output;
  if (interpolation !== "CUBICSPLINE") {
    if (times.length !== normalizedOutput.length) {
      throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} input/output count mismatch`);
    }
    const samples = sanitizeAnimationSamples(times, normalizedOutput, 1);
    const mode = interpolation === "STEP" ? "step" : "linear";
    return samples.times.map((time, index) => ({
      time,
      value: animationValueForPath(path, samples.output[index]!),
      interpolation: mode
    }));
  }

  if (normalizedOutput.length !== times.length * 3) {
    throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} CUBICSPLINE output count must be three times input count`);
  }
  const samples = sanitizeAnimationSamples(times, normalizedOutput, 3);
  return samples.times.map((time, index) => {
    const offset = index * 3;
    return {
      time,
      inTangent: animationValueForPath(path, samples.output[offset]!),
      value: animationValueForPath(path, samples.output[offset + 1]!),
      outTangent: animationValueForPath(path, samples.output[offset + 2]!),
      interpolation: "cubicspline"
    };
  });
}

function sanitizeAnimationSamples<T>(
  times: readonly number[],
  output: readonly T[],
  rowsPerSample: 1 | 3
): { readonly times: readonly number[]; readonly output: readonly T[] } {
  const cleanTimes: number[] = [];
  const cleanOutput: T[] = [];
  let previous = -Number.MAX_VALUE;
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index] ?? 0;
    if (!Number.isFinite(time) || time < 0 || time <= previous) {
      continue;
    }
    cleanTimes.push(time);
    for (let row = 0; row < rowsPerSample; row += 1) {
      const value = output[index * rowsPerSample + row];
      if (value !== undefined) cleanOutput.push(value);
    }
    previous = time;
  }
  return cleanTimes.length > 0 ? { times: cleanTimes, output: cleanOutput } : { times, output };
}

function morphWeightCountForAnimationTarget(json: GLTFJson, nodeIndex: number | undefined): number | undefined {
  const node = nodeIndex === undefined ? undefined : json.nodes?.[nodeIndex];
  const mesh = node?.mesh === undefined ? undefined : json.meshes?.[node.mesh];
  if (!mesh) return undefined;
  if (mesh.weights && mesh.weights.length > 0) return mesh.weights.length;
  return Math.max(0, ...mesh.primitives.map((primitive) => primitive.targets?.length ?? 0)) || undefined;
}

function normalizeWeightAnimationOutput(
  times: readonly number[],
  output: readonly (readonly number[])[],
  interpolation: "LINEAR" | "STEP" | "CUBICSPLINE",
  animationIndex: number,
  channelIndex: number,
  morphWeightCount: number | undefined
): readonly (readonly number[])[] {
  const samplesPerTime = interpolation === "CUBICSPLINE" ? 3 : 1;
  const expectedRows = times.length * samplesPerTime;
  if (output.length === expectedRows) return output;
  if (times.length === 0 || output.length % expectedRows !== 0) {
    return output;
  }
  const width = morphWeightCount ?? (output.length / expectedRows);
  if (!Number.isInteger(width) || width <= 0 || output.length !== expectedRows * width) {
    throw new Error(`glTF animation ${animationIndex} channel ${channelIndex} weights output count does not match morph target count`);
  }
  const grouped: number[][] = [];
  for (let sampleIndex = 0; sampleIndex < expectedRows; sampleIndex += 1) {
    const values: number[] = [];
    for (let component = 0; component < width; component += 1) {
      values.push(output[sampleIndex * width + component]?.[0] ?? 0);
    }
    grouped.push(values);
  }
  return grouped;
}

interface GLTFDocument {
  readonly json: GLTFJson;
  readonly url: string;
  readonly byteLength: number;
  readonly binaryChunk?: ArrayBuffer;
}

async function loadDocument(request: AssetLoadRequest): Promise<GLTFDocument> {
  const binary = request.url.startsWith("data:model/gltf-binary") || /\.glb(?:\?.*)?$/i.test(request.url);

  if (request.url.startsWith("data:")) {
    const data = decodeDataUri(request.url);
    if (binary) {
      return parseGLB(data, request.url);
    }
    const text = new TextDecoder().decode(data);
    return { json: JSON.parse(text) as GLTFJson, url: request.url, byteLength: data.byteLength };
  }

  if (typeof fetch !== "function") {
    throw new Error("GLTFLoader requires fetch for non-data URLs");
  }

  const response = await fetch(request.url, { signal: request.signal });
  if (!response.ok) {
    throw new Error(`glTF request failed with ${response.status}`);
  }

  if (binary) {
    return parseGLB(await readResponseBytes(response, request.url, "document", request), request.url);
  }

  const bytes = await readResponseBytes(response, request.url, "document", request);
  return { json: JSON.parse(new TextDecoder().decode(bytes)) as GLTFJson, url: request.url, byteLength: bytes.byteLength };
}

async function loadBuffer(
  buffer: GLTFBuffer,
  index: number,
  document: GLTFDocument,
  request: AssetLoadRequest
): Promise<ArrayBuffer> {
  validateBufferDescriptor(index, buffer);
  if (!buffer.uri) {
    if (index === 0 && document.binaryChunk) {
      if (buffer.byteLength > document.binaryChunk.byteLength) {
        throw new Error(`glTF buffer 0 declares ${buffer.byteLength} bytes but GLB BIN chunk has ${document.binaryChunk.byteLength}`);
      }
      return buffer.byteLength === document.binaryChunk.byteLength
        ? document.binaryChunk
        : document.binaryChunk.slice(0, buffer.byteLength);
    }
    throw new Error(`glTF buffer ${index} is missing a uri and no GLB BIN chunk is available`);
  }

  if (buffer.uri.startsWith("data:")) {
    return validateLoadedBufferLength(index, buffer, decodeBufferDataUri(index, buffer.uri));
  }

  if (typeof fetch !== "function") {
    throw new Error("GLTFLoader requires fetch for external buffers");
  }

  const url = new URL(buffer.uri, document.url).toString();
  const response = await fetch(url, { signal: request.signal });
  if (!response.ok) {
    throw new Error(`glTF buffer request failed with ${response.status}`);
  }
  return validateLoadedBufferLength(index, buffer, await readResponseBytes(response, url, "buffer", request));
}

function validateBufferDescriptor(index: number, buffer: GLTFBuffer): void {
  if (!Number.isInteger(buffer.byteLength) || buffer.byteLength < 0) {
    throw new Error(`glTF buffer ${index} byteLength must be a non-negative integer`);
  }
}

function decodeBufferDataUri(index: number, uri: string): ArrayBuffer {
  const separator = uri.indexOf(",");
  if (separator < 0) {
    throw new Error(`glTF buffer ${index} data uri must include a comma separator`);
  }
  const header = uri.slice(5, separator).toLowerCase();
  const mediaType = header.split(";")[0] ?? "";
  if (mediaType && mediaType !== "application/octet-stream" && mediaType !== "application/gltf-buffer") {
    throw new Error(`glTF buffer ${index} data uri media type must be application/octet-stream or application/gltf-buffer`);
  }
  const payload = uri.slice(separator + 1);
  if (header.endsWith(";base64")) {
    return decodeBufferBase64DataUri(index, payload);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
  } catch (error) {
    throw new Error(`glTF buffer ${index} data uri payload must be valid URI encoding: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function decodeBufferBase64DataUri(index: number, payload: string): ArrayBuffer {
  let decodedPayload: string;
  try {
    decodedPayload = decodeURIComponent(payload);
  } catch (error) {
    throw new Error(`glTF buffer ${index} data uri base64 payload must be valid URI encoding: ${error instanceof Error ? error.message : String(error)}`);
  }
  const compactPayload = decodedPayload.replace(/\s+/g, "");
  const paddingIndex = compactPayload.indexOf("=");
  const paddingIsTerminal = paddingIndex < 0 || /^={1,2}$/.test(compactPayload.slice(paddingIndex));
  if (
    compactPayload.length % 4 === 1 ||
    !paddingIsTerminal ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compactPayload)
  ) {
    throw new Error(`glTF buffer ${index} data uri base64 payload is malformed`);
  }

  let binary: string;
  try {
    binary = atob(compactPayload);
  } catch (error) {
    throw new Error(`glTF buffer ${index} data uri base64 payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function validateLoadedBufferLength(index: number, buffer: GLTFBuffer, data: ArrayBuffer): ArrayBuffer {
  if (data.byteLength !== buffer.byteLength) {
    throw new Error(`glTF buffer ${index} declares ${buffer.byteLength} bytes but loaded ${data.byteLength}`);
  }
  return data;
}

async function prepareBufferViews(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  meshoptDecoder: GLTFMeshoptDecoder | undefined
): Promise<{ readonly json: GLTFJson; readonly buffers: readonly ArrayBuffer[] }> {
  const bufferViews = json.bufferViews ?? [];
  const compressedViewEntries = bufferViews
    .map((view, index) => ({ view, index, meshopt: resolveMeshoptCompressionExtension(view) }))
    .filter((entry): entry is { readonly view: GLTFBufferView; readonly index: number; readonly meshopt: { readonly name: typeof GLTF_MESHOPT_EXTENSION_NAMES[number]; readonly extension: GLTFMeshoptCompressionExtension } } => entry.meshopt !== undefined);
  if (compressedViewEntries.length === 0) {
    return { json, buffers };
  }
  if (!usesGLTFMeshoptExtension(json)) {
    throw new Error("glTF uses meshopt-compressed bufferViews but meshopt extension is not declared");
  }
  if (!meshoptDecoder) {
    throw new Error("glTF meshopt compression requires a meshoptDecoder");
  }

  const preparedBuffers = [...buffers];
  const preparedBufferViews = [...bufferViews];
  for (const { index, meshopt } of compressedViewEntries) {
    const { name, extension } = meshopt;
    validateMeshoptDescriptor(json, buffers, index, name, extension);
    const sourceBuffer = buffers[extension.buffer]!;
    const byteOffset = extension.byteOffset ?? 0;
    const source = new Uint8Array(sourceBuffer, byteOffset, extension.byteLength);
    const descriptor: GLTFMeshoptDecodeDescriptor = {
      bufferViewIndex: index,
      byteStride: extension.byteStride,
      count: extension.count,
      mode: extension.mode,
      filter: extension.filter ?? "NONE"
    };
    const decoded = toOwnedArrayBuffer(await meshoptDecoder(source, descriptor));
    const expectedByteLength = extension.count * extension.byteStride;
    if (decoded.byteLength !== expectedByteLength) {
      throw new Error(`glTF bufferView ${index} EXT_meshopt_compression decoded ${decoded.byteLength} bytes but expected ${expectedByteLength}`);
    }
    const decodedBufferIndex = preparedBuffers.length;
    preparedBuffers.push(decoded);
    preparedBufferViews[index] = {
      buffer: decodedBufferIndex,
      byteOffset: 0,
      byteLength: decoded.byteLength,
      ...(extension.mode === "ATTRIBUTES" ? { byteStride: extension.byteStride } : {})
    };
  }

  return {
    json: { ...json, bufferViews: preparedBufferViews },
    buffers: preparedBuffers
  };
}

function resolveMeshoptCompressionExtension(view: GLTFBufferView): { readonly name: typeof GLTF_MESHOPT_EXTENSION_NAMES[number]; readonly extension: GLTFMeshoptCompressionExtension } | undefined {
  for (const name of GLTF_MESHOPT_EXTENSION_NAMES) {
    const extension = view.extensions?.[name];
    if (extension) return { name, extension };
  }
  return undefined;
}

function validateMeshoptDescriptor(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  bufferViewIndex: number,
  extensionName: string,
  extension: GLTFMeshoptCompressionExtension
): void {
  if (!Number.isInteger(extension.buffer) || extension.buffer < 0 || !json.buffers?.[extension.buffer] || !buffers[extension.buffer]) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} buffer must reference an existing buffer`);
  }
  if (extension.byteOffset !== undefined && (!Number.isInteger(extension.byteOffset) || extension.byteOffset < 0)) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} byteOffset must be a non-negative integer`);
  }
  if (!Number.isInteger(extension.byteLength) || extension.byteLength < 0) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} byteLength must be a non-negative integer`);
  }
  if (!Number.isInteger(extension.byteStride) || extension.byteStride <= 0) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} byteStride must be a positive integer`);
  }
  if (!Number.isInteger(extension.count) || extension.count < 0) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} count must be a non-negative integer`);
  }
  if (extension.mode !== "ATTRIBUTES" && extension.mode !== "TRIANGLES" && extension.mode !== "INDICES") {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} mode ${String(extension.mode)} is unsupported`);
  }
  if (
    extension.filter !== undefined &&
    extension.filter !== "NONE" &&
    extension.filter !== "OCTAHEDRAL" &&
    extension.filter !== "QUATERNION" &&
    extension.filter !== "EXPONENTIAL" &&
    extension.filter !== "COLOR"
  ) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} filter ${String(extension.filter)} is unsupported`);
  }
  const sourceBuffer = buffers[extension.buffer]!;
  const sourceStart = extension.byteOffset ?? 0;
  const sourceEnd = sourceStart + extension.byteLength;
  if (sourceEnd > sourceBuffer.byteLength) {
    throw new Error(`glTF bufferView ${bufferViewIndex} ${extensionName} source range exceeds buffer ${extension.buffer}`);
  }
}

function toOwnedArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function readResponseBytes(
  response: Response,
  url: string,
  phase: AssetLoadProgress["phase"],
  request: AssetLoadRequest
): Promise<ArrayBuffer> {
  const totalBytes = parseContentLength(response.headers?.get("content-length"));
  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = await response.arrayBuffer();
    request.onProgress?.({ url, phase: "complete", loadedBytes: buffer.byteLength, ...(totalBytes === undefined ? {} : { totalBytes }) });
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    if (request.signal?.aborted) {
      throw request.signal.reason instanceof Error ? request.signal.reason : new Error(`glTF request aborted for ${url}`);
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    request.onProgress?.({ url, phase, loadedBytes, ...(totalBytes === undefined ? {} : { totalBytes }) });
  }

  const buffer = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  request.onProgress?.({ url, phase: "complete", loadedBytes, ...(totalBytes === undefined ? {} : { totalBytes }) });
  return buffer.buffer;
}

function parseContentLength(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function decodeDataUri(uri: string): ArrayBuffer {
  const [header = "", payload = ""] = uri.split(",", 2);
  if (header.endsWith(";base64")) {
    let binary: string;
    try {
      binary = atob(payload);
    } catch (error) {
      throw new Error(`Invalid base64 data URI payload: ${error instanceof Error ? error.message : String(error)}`);
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
}

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a;
const GLB_CHUNK_BIN = 0x004e4942;

function parseGLB(data: ArrayBuffer, url: string): GLTFDocument {
  const view = new DataView(data);
  if (data.byteLength < 20) {
    throw new Error("GLB file is too small");
  }

  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (magic !== GLB_MAGIC) {
    throw new Error("Invalid GLB magic");
  }
  if (version !== GLB_VERSION) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }
  if (declaredLength !== data.byteLength) {
    throw new Error(`GLB length mismatch: header ${declaredLength}, actual ${data.byteLength}`);
  }

  let offset = 12;
  let json: GLTFJson | undefined;
  let binaryChunk: ArrayBuffer | undefined;

  while (offset < data.byteLength) {
    if (offset + 8 > data.byteLength) {
      throw new Error("Malformed GLB chunk header");
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > data.byteLength) {
      throw new Error("Malformed GLB chunk length");
    }

    const chunk = data.slice(chunkStart, chunkEnd);
    if (chunkType === GLB_CHUNK_JSON) {
      const text = new TextDecoder().decode(chunk).replace(/[\u0000\s]+$/u, "");
      json = JSON.parse(text) as GLTFJson;
    } else if (chunkType === GLB_CHUNK_BIN) {
      binaryChunk = chunk;
    }

    offset = chunkEnd;
  }

  if (!json) {
    throw new Error("GLB is missing a JSON chunk");
  }

  return { json, binaryChunk, url, byteLength: data.byteLength };
}

function readAccessor(json: GLTFJson, buffers: readonly ArrayBuffer[], accessorIndex: number, accessorCache?: GLTFAccessorReadCache): number[][] {
  if (accessorCache) accessorCache.profile.accessorReadCount += 1;
  const cached = accessorCache?.rowsByAccessor.get(accessorIndex);
  if (cached && accessorCache) {
    accessorCache.profile.accessorCacheHitCount++;
    return cached;
  }
  const startedAt = nowMs();
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`Missing glTF accessor ${accessorIndex}`);
  }
  validateAccessorShape(accessorIndex, accessor);
  const componentCount = componentCountForType(accessor.type);
  const componentBytes = componentByteSize(accessor.componentType);
  const rowByteLength = componentCount * componentBytes;
  validateAccessorDescriptor(accessorIndex, accessor, rowByteLength);
  const output = Array.from({ length: accessor.count }, () => new Array<number>(componentCount).fill(0));

  if (accessor.bufferView !== undefined) {
    const { view, buffer } = getBufferView(json, buffers, accessor.bufferView);
    const dataView = dataViewForBuffer(buffer, accessorCache);
    const stride = view.byteStride ?? rowByteLength;
    if (stride < rowByteLength) {
      throw new Error(`glTF accessor ${accessorIndex} byteStride ${stride} is smaller than element size ${rowByteLength}`);
    }
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    validateAccessorBounds(accessorIndex, buffer, view, offset, accessor.count, stride, rowByteLength);

    for (let item = 0; item < accessor.count; item += 1) {
      const baseOffset = offset + item * stride;
      for (let component = 0; component < componentCount; component += 1) {
        output[item]![component] = readComponent(dataView, baseOffset + component * componentBytes, accessor.componentType, accessor.normalized ?? false);
      }
    }
  }

  if (accessor.sparse) {
    applySparseAccessor(json, buffers, accessorIndex, accessor, output, componentCount, componentBytes, accessorCache);
  }

  if (accessorCache) {
    recordAccessorRead(accessorCache, accessorIndex, accessor, componentCount, output.length, nowMs() - startedAt);
    accessorCache.rowsByAccessor.set(accessorIndex, output);
  }
  return output;
}

function dataViewForBuffer(buffer: ArrayBuffer, accessorCache?: GLTFAccessorReadCache): DataView {
  if (!accessorCache) return new DataView(buffer);
  const existing = accessorCache.dataViews.get(buffer);
  if (existing) return existing;
  const view = new DataView(buffer);
  accessorCache.dataViews.set(buffer, view);
  accessorCache.profile.dataViewCacheEntries = accessorCache.dataViews.size;
  return view;
}

function recordAccessorRead(
  accessorCache: GLTFAccessorReadCache,
  accessorIndex: number,
  accessor: GLTFAccessor,
  componentCount: number,
  rowCount: number,
  elapsedMs: number
): void {
  const profile = accessorCache.profile;
  const byteLength = rowCount * componentCount * componentByteSize(accessor.componentType);
  profile.uniqueAccessorReadCount++;
  profile.accessorRowsRead += rowCount;
  profile.accessorValuesRead += rowCount * componentCount;
  profile.accessorReadMs += elapsedMs;
  profile.largestAccessors.push({
    accessorIndex,
    count: accessor.count,
    type: accessor.type,
    componentType: accessor.componentType,
    componentCount,
    byteLength,
    ...(accessor.bufferView !== undefined ? { bufferView: accessor.bufferView } : {})
  });
  profile.largestAccessors.sort((left, right) => right.byteLength - left.byteLength);
  if (profile.largestAccessors.length > 8) {
    profile.largestAccessors.length = 8;
  }
}

function validateAccessorShape(accessorIndex: number, accessor: GLTFAccessor): void {
  if (!isAccessorType(accessor.type)) {
    throw new Error(`glTF accessor ${accessorIndex} type ${String(accessor.type)} is unsupported`);
  }
  if (!isAccessorComponentType(accessor.componentType)) {
    throw new Error(`glTF accessor ${accessorIndex} componentType ${String(accessor.componentType)} is unsupported`);
  }
  if (accessor.bufferView !== undefined && (!Number.isInteger(accessor.bufferView) || accessor.bufferView < 0)) {
    throw new Error(`glTF accessor ${accessorIndex} bufferView must be a non-negative integer`);
  }
  if (accessor.sparse) {
    validateSparseAccessorShape(accessorIndex, accessor.sparse);
  }
}

function validateAccessorDescriptor(accessorIndex: number, accessor: GLTFAccessor, rowByteLength: number): void {
  if (!Number.isInteger(accessor.count) || accessor.count < 0) {
    throw new Error(`glTF accessor ${accessorIndex} count must be a non-negative integer`);
  }
  if (accessor.byteOffset !== undefined && (!Number.isInteger(accessor.byteOffset) || accessor.byteOffset < 0)) {
    throw new Error(`glTF accessor ${accessorIndex} byteOffset must be a non-negative integer`);
  }
  if (accessor.sparse) {
    if (!Number.isInteger(accessor.sparse.count) || accessor.sparse.count < 0) {
      throw new Error(`glTF accessor ${accessorIndex} sparse count must be a non-negative integer`);
    }
    if (accessor.sparse.count > accessor.count) {
      throw new Error(`glTF accessor ${accessorIndex} sparse count exceeds accessor count`);
    }
    if (accessor.sparse.indices.byteOffset !== undefined && (!Number.isInteger(accessor.sparse.indices.byteOffset) || accessor.sparse.indices.byteOffset < 0)) {
      throw new Error(`glTF accessor ${accessorIndex} sparse indices byteOffset must be a non-negative integer`);
    }
    if (accessor.sparse.values.byteOffset !== undefined && (!Number.isInteger(accessor.sparse.values.byteOffset) || accessor.sparse.values.byteOffset < 0)) {
      throw new Error(`glTF accessor ${accessorIndex} sparse values byteOffset must be a non-negative integer`);
    }
  }
  if (rowByteLength <= 0) {
    throw new Error(`glTF accessor ${accessorIndex} has invalid element size`);
  }
}

function validateSparseAccessorShape(accessorIndex: number, sparse: GLTFSparseAccessor): void {
  const record = sparse as unknown as Record<string, unknown>;
  if (!isObjectRecord(record.indices)) {
    throw new Error(`glTF accessor ${accessorIndex} sparse indices must be an object`);
  }
  if (!isObjectRecord(record.values)) {
    throw new Error(`glTF accessor ${accessorIndex} sparse values must be an object`);
  }
  if (!isSparseIndexComponentType(sparse.indices.componentType)) {
    throw new Error(`glTF accessor ${accessorIndex} sparse indices componentType ${String(sparse.indices.componentType)} is unsupported`);
  }
  if (!Number.isInteger(sparse.indices.bufferView) || sparse.indices.bufferView < 0) {
    throw new Error(`glTF accessor ${accessorIndex} sparse indices bufferView must be a non-negative integer`);
  }
  if (!Number.isInteger(sparse.values.bufferView) || sparse.values.bufferView < 0) {
    throw new Error(`glTF accessor ${accessorIndex} sparse values bufferView must be a non-negative integer`);
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function applySparseAccessor(
  json: GLTFJson,
  buffers: readonly ArrayBuffer[],
  accessorIndex: number,
  accessor: GLTFAccessor,
  output: number[][],
  componentCount: number,
  componentBytes: number,
  accessorCache?: GLTFAccessorReadCache
): void {
  const sparse = accessor.sparse;
  if (!sparse || sparse.count === 0) {
    return;
  }
  const { view: indexView, buffer: indexBuffer } = getBufferView(json, buffers, sparse.indices.bufferView);
  const indexDataView = dataViewForBuffer(indexBuffer, accessorCache);
  const indexComponentBytes = componentByteSize(sparse.indices.componentType);
  const indexStart = (indexView.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0);
  validateRawRange(`glTF accessor ${accessorIndex} sparse indices`, indexBuffer, indexView, indexStart, sparse.count * indexComponentBytes);

  const { view: valueView, buffer: valueBuffer } = getBufferView(json, buffers, sparse.values.bufferView);
  const valueDataView = dataViewForBuffer(valueBuffer, accessorCache);
  const valueStart = (valueView.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0);
  const rowByteLength = componentCount * componentBytes;
  validateRawRange(`glTF accessor ${accessorIndex} sparse values`, valueBuffer, valueView, valueStart, sparse.count * rowByteLength);

  for (let item = 0; item < sparse.count; item += 1) {
    const targetIndex = readComponent(indexDataView, indexStart + item * indexComponentBytes, sparse.indices.componentType, false);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= accessor.count) {
      throw new Error(`glTF accessor ${accessorIndex} sparse index ${targetIndex} is out of range`);
    }
    const valueOffset = valueStart + item * rowByteLength;
    for (let component = 0; component < componentCount; component += 1) {
      output[targetIndex]![component] = readComponent(valueDataView, valueOffset + component * componentBytes, accessor.componentType, accessor.normalized ?? false);
    }
  }
}

function getBufferView(json: GLTFJson, buffers: readonly ArrayBuffer[], bufferViewIndex: number): { readonly view: GLTFBufferView; readonly buffer: ArrayBuffer } {
  if (!Number.isInteger(bufferViewIndex) || bufferViewIndex < 0) {
    throw new Error(`glTF bufferView ${String(bufferViewIndex)} must be a non-negative integer`);
  }
  const view = json.bufferViews?.[bufferViewIndex];
  if (!view) {
    throw new Error(`Missing glTF bufferView ${bufferViewIndex}`);
  }
  validateBufferViewDescriptor(bufferViewIndex, view);
  const buffer = buffers[view.buffer];
  if (!buffer) {
    throw new Error(`Missing glTF buffer ${view.buffer}`);
  }
  const start = view.byteOffset ?? 0;
  const end = start + view.byteLength;
  if (end > buffer.byteLength) {
    throw new Error(`glTF bufferView ${bufferViewIndex} exceeds buffer ${view.buffer}`);
  }
  return { view, buffer };
}

function validateBufferViewDescriptor(bufferViewIndex: number, view: GLTFBufferView): void {
  if (!Number.isInteger(view.buffer) || view.buffer < 0) {
    throw new Error(`glTF bufferView ${bufferViewIndex} buffer must be a non-negative integer`);
  }
  if (view.byteOffset !== undefined && (!Number.isInteger(view.byteOffset) || view.byteOffset < 0)) {
    throw new Error(`glTF bufferView ${bufferViewIndex} byteOffset must be a non-negative integer`);
  }
  if (!Number.isInteger(view.byteLength) || view.byteLength < 0) {
    throw new Error(`glTF bufferView ${bufferViewIndex} byteLength must be a non-negative integer`);
  }
  if (
    view.byteStride !== undefined &&
    (!Number.isInteger(view.byteStride) || view.byteStride < 4 || view.byteStride > 252 || view.byteStride % 4 !== 0)
  ) {
    throw new Error(`glTF bufferView ${bufferViewIndex} byteStride must be a 4-byte aligned integer between 4 and 252`);
  }
}

function validateAccessorBounds(
  accessorIndex: number,
  buffer: ArrayBuffer,
  view: GLTFBufferView,
  start: number,
  count: number,
  stride: number,
  rowByteLength: number
): void {
  const byteLength = count === 0 ? 0 : (count - 1) * stride + rowByteLength;
  validateRawRange(`glTF accessor ${accessorIndex}`, buffer, view, start, byteLength);
}

function validateRawRange(label: string, buffer: ArrayBuffer, view: GLTFBufferView, start: number, byteLength: number): void {
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(byteLength) || byteLength < 0) {
    throw new Error(`${label} byte range must be non-negative integers`);
  }
  const viewStart = view.byteOffset ?? 0;
  const viewEnd = viewStart + view.byteLength;
  const end = start + byteLength;
  if (end > viewEnd || end > buffer.byteLength) {
    throw new Error(`${label} exceeds its glTF bufferView`);
  }
}

function readOptionalAccessor(json: GLTFJson, buffers: readonly ArrayBuffer[], accessorIndex: number | undefined, accessorCache?: GLTFAccessorReadCache): number[][] {
  return accessorIndex === undefined ? [] : readAccessor(json, buffers, accessorIndex, accessorCache);
}

function readBufferViewBytes(json: GLTFJson, buffers: readonly ArrayBuffer[], bufferViewIndex: number): ArrayBuffer {
  const { view, buffer } = getBufferView(json, buffers, bufferViewIndex);
  const start = view.byteOffset ?? 0;
  const end = start + view.byteLength;
  return buffer.slice(start, end);
}

function isAccessorType(type: unknown): type is GLTFAccessorType {
  return type === "SCALAR" || type === "VEC2" || type === "VEC3" || type === "VEC4" || type === "MAT4";
}

function isAccessorComponentType(type: unknown): type is GLTFComponentType {
  return type === 5120 || type === 5121 || type === 5122 || type === 5123 || type === 5125 || type === 5126;
}

function isSparseIndexComponentType(type: unknown): type is GLTFSparseIndexComponentType {
  return type === 5121 || type === 5123 || type === 5125;
}

function componentCountForType(type: GLTFAccessorType): number {
  return type === "SCALAR" ? 1 : type === "VEC2" ? 2 : type === "VEC3" ? 3 : type === "VEC4" ? 4 : 16;
}

function componentByteSize(type: GLTFComponentType): number {
  if (type === 5120 || type === 5121) return 1;
  if (type === 5122 || type === 5123) return 2;
  return 4;
}

function readComponent(view: DataView, byteOffset: number, type: GLTFComponentType, normalized: boolean): number {
  if (type === 5120) {
    const value = view.getInt8(byteOffset);
    return normalized ? Math.max(value / 127, -1) : value;
  }
  if (type === 5121) {
    const value = view.getUint8(byteOffset);
    return normalized ? value / 255 : value;
  }
  if (type === 5122) {
    const value = view.getInt16(byteOffset, true);
    return normalized ? Math.max(value / 32767, -1) : value;
  }
  if (type === 5126) return view.getFloat32(byteOffset, true);
  if (type === 5125) return view.getUint32(byteOffset, true);
  const value = view.getUint16(byteOffset, true);
  return normalized ? value / 65535 : value;
}

function resolvePrimitiveMaterialIndex(
  primitive: GLTFPrimitive,
  materials: readonly GLTFMaterialAsset[],
  meshIndex: number,
  primitiveIndex: number
): number | undefined {
  if (primitive.material === undefined) {
    return undefined;
  }
  if (!Number.isInteger(primitive.material) || primitive.material < 0) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} material must be a non-negative integer`);
  }
  if (!materials[primitive.material]) {
    throw new Error(`glTF mesh ${meshIndex} primitive ${primitiveIndex} references missing material ${primitive.material}`);
  }
  return primitive.material;
}

function materialName(material: GLTFMaterialAsset | undefined, index: number | undefined): string {
  return index === undefined ? DEFAULT_GLTF_MATERIAL_NAME : material?.name ?? `material-${index}`;
}

function meshPrimitiveName(mesh: GLTFMesh, meshIndex: number, primitiveIndex: number): string {
  const base = mesh.name ?? `mesh-${meshIndex}`;
  return mesh.primitives.length === 1 ? base : `${base}-primitive-${primitiveIndex}`;
}

function resolveNodeTransform(
  node: GLTFNode,
  nodeIndex: number
): { readonly translation: Vec3; readonly rotation: Quat; readonly scale: Vec3 } {
  if (node.matrix !== undefined) {
    if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) {
      throw new Error(`glTF node ${nodeIndex} cannot combine matrix with translation, rotation, or scale`);
    }
    const decomposed = decomposeMat4(resolveNodeMatrix(node.matrix, nodeIndex));
    return {
      translation: decomposed.position,
      rotation: decomposed.rotation,
      scale: decomposed.scale
    };
  }
  return {
    translation: resolveVec3(node.translation, [0, 0, 0], `node ${nodeIndex} translation`),
    rotation: resolveQuat(node.rotation, [0, 0, 0, 1], `node ${nodeIndex} rotation`),
    scale: resolveVec3(node.scale, [1, 1, 1], `node ${nodeIndex} scale`)
  };
}

function resolveNodeMatrix(matrix: readonly number[], nodeIndex: number): SceneMat4 {
  if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`glTF node ${nodeIndex} matrix must contain 16 finite values`);
  }
  return [
    matrix[0]!, matrix[1]!, matrix[2]!, matrix[3]!,
    matrix[4]!, matrix[5]!, matrix[6]!, matrix[7]!,
    matrix[8]!, matrix[9]!, matrix[10]!, matrix[11]!,
    matrix[12]!, matrix[13]!, matrix[14]!, matrix[15]!
  ];
}

function resolveVec3(value: readonly number[] | undefined, fallback: Vec3, label: string): Vec3 {
  const resolved = value ?? fallback;
  if (resolved.length !== 3 || resolved.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`glTF ${label} must contain three finite values`);
  }
  return [resolved[0]!, resolved[1]!, resolved[2]!];
}

function resolveQuat(value: readonly number[] | undefined, fallback: Quat, label: string): Quat {
  const resolved = value ?? fallback;
  if (resolved.length !== 4 || resolved.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`glTF ${label} must contain four finite values`);
  }
  return [resolved[0]!, resolved[1]!, resolved[2]!, resolved[3]!];
}

function createScene(
  json: GLTFJson,
  meshes: readonly GLTFMeshAsset[],
  cameras: readonly GLTFCameraAsset[],
  lights: readonly GLTFLightAsset[],
  skins: readonly GLTFSkinAsset[],
  nodeInstanceTransforms: ReadonlyMap<number, Float32Array>,
  materialVariants: readonly GLTFMaterialVariantAsset[],
  options: GLTFSceneCreateOptions = {}
): Scene {
  const sceneIndex = resolveSelectedSceneIndex(json, options);
  validateSceneGraph(json, sceneIndex);
  validateSceneMaterialVariant(materialVariants, options.materialVariant);
  const materialKeyForRenderable = createRuntimeMaterialKeyResolver(json, sceneIndex, meshes, skins, nodeInstanceTransforms, options.materialVariant);
  const nodeWorldMatrices = computeGLTFNodeWorldMatrices(json);
  const nodeNameForIndex = createGLTFNodeNameResolver(json);
  const scene = new Scene();
  const nodes = new Map<number, SceneNode>();
  const createNode = (index: number): SceneNode => {
    const source = json.nodes?.[index];
    if (!source) {
      throw new Error(`Missing glTF node ${index}`);
    }

    const existing = nodes.get(index);
    if (existing) {
      return existing;
    }

    const node = createSceneNodeForGLTFNode(scene, source, index, nodeNameForIndex(index), cameras, lights);
    const transform = resolveNodeTransform(source, index);
    node.transform.setPosition(transform.translation[0], transform.translation[1], transform.translation[2]);
    node.transform.setRotation(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
    node.transform.setScale(transform.scale[0], transform.scale[1], transform.scale[2]);
    if (source.mesh !== undefined) {
      attachMeshPrimitives(scene, node, source.mesh, index, meshes, skins, source.skin, nodeWorldMatrices.get(index), nodeInstanceTransforms.get(index), materialKeyForRenderable);
    }
    nodes.set(index, node);
    for (const childIndex of source.children ?? []) {
      node.addChild(createNode(childIndex));
    }
    return node;
  };

  const sceneDefinition = json.scenes?.[sceneIndex];
  for (const nodeIndex of sceneDefinition?.nodes ?? []) {
    scene.root.addChild(createNode(nodeIndex));
  }
  return scene;
}

function resolveSelectedSceneIndex(json: GLTFJson, options: GLTFSceneCreateOptions): number {
  if (options.sceneIndex !== undefined && options.sceneName !== undefined) {
    throw new Error("glTF scene selection cannot specify both sceneIndex and sceneName");
  }
  if (options.sceneName !== undefined) {
    const sceneIndex = (json.scenes ?? []).findIndex((scene, index) => (scene.name ?? `scene-${index}`) === options.sceneName);
    if (sceneIndex < 0) {
      throw new Error(`glTF scene named ${options.sceneName} is not defined`);
    }
    return sceneIndex;
  }
  if (options.sceneIndex !== undefined) {
    if (!Number.isInteger(options.sceneIndex) || options.sceneIndex < 0 || !json.scenes?.[options.sceneIndex]) {
      throw new Error(`glTF scene ${options.sceneIndex} is missing`);
    }
    return options.sceneIndex;
  }
  return resolveDefaultSceneIndex(json);
}

function validateSceneMaterialVariant(
  materialVariants: readonly GLTFMaterialVariantAsset[],
  selectedVariant: string | undefined
): void {
  if (selectedVariant === undefined) return;
  if (!materialVariants.some((variant) => variant.name === selectedVariant)) {
    throw new Error(`glTF material variant ${selectedVariant} is not defined`);
  }
}

function validateSceneGraph(json: GLTFJson, sceneIndex = resolveDefaultSceneIndex(json)): void {
  const nodeDefinitions = json.nodes ?? [];
  if (json.scenes && (!Number.isInteger(sceneIndex) || sceneIndex < 0 || !json.scenes[sceneIndex])) throw new Error(`glTF scene ${sceneIndex} is missing`);

  const parentByNode = new Map<number, number>();
  for (const [nodeIndex, node] of nodeDefinitions.entries()) {
    for (const childIndex of node.children ?? []) {
      if (!Number.isInteger(childIndex) || childIndex < 0 || !nodeDefinitions[childIndex]) {
        throw new Error(`glTF node ${nodeIndex} references missing child node ${childIndex}`);
      }
      const existingParent = parentByNode.get(childIndex);
      if (existingParent !== undefined) {
        throw new Error(`glTF node ${childIndex} has multiple parents: ${existingParent} and ${nodeIndex}`);
      }
      parentByNode.set(childIndex, nodeIndex);
    }
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (nodeIndex: number): void => {
    if (visiting.has(nodeIndex)) {
      throw new Error(`glTF node graph contains a cycle at node ${nodeIndex}`);
    }
    if (visited.has(nodeIndex)) {
      return;
    }
    visiting.add(nodeIndex);
    for (const childIndex of nodeDefinitions[nodeIndex]?.children ?? []) {
      visit(childIndex);
    }
    visiting.delete(nodeIndex);
    visited.add(nodeIndex);
  };
  for (let nodeIndex = 0; nodeIndex < nodeDefinitions.length; nodeIndex += 1) {
    visit(nodeIndex);
  }

  for (const [rootListIndex, rootNodeIndex] of (json.scenes?.[sceneIndex]?.nodes ?? []).entries()) {
    if (!Number.isInteger(rootNodeIndex) || rootNodeIndex < 0 || !nodeDefinitions[rootNodeIndex]) {
      throw new Error(`glTF scene ${sceneIndex} root ${rootListIndex} references missing node ${rootNodeIndex}`);
    }
    if (parentByNode.has(rootNodeIndex)) {
      throw new Error(`glTF scene ${sceneIndex} root ${rootNodeIndex} is also a child node`);
    }
  }
}

function attachMeshPrimitives(
  scene: Scene,
  node: SceneNode,
  meshIndex: number,
  nodeIndex: number,
  meshes: readonly GLTFMeshAsset[],
  skins: readonly GLTFSkinAsset[],
  nodeSkinIndex?: number,
  nodeWorldMatrix?: Mat4,
  instanceTransforms?: Float32Array,
  materialKeyForRenderable?: (mesh: GLTFMeshAsset, contract: GLTFRuntimeMaterialContract) => string
): void {
  if (!Number.isInteger(meshIndex) || meshIndex < 0) {
    throw new RangeError(`glTF node ${nodeIndex} mesh must be a non-negative integer`);
  }
  const primitives = meshes.filter((mesh) => mesh.sourceMeshIndex === meshIndex);
  if (primitives.length === 0) {
    throw new Error(`glTF node ${nodeIndex} references missing mesh ${meshIndex}`);
  }
  if (primitives.length === 1) {
    const mesh = primitives[0]!;
    const skinning = skinningForMesh(mesh, skins, nodeSkinIndex, nodeWorldMatrix);
    scene.addRenderable(node, new Renderable({
      geometry: mesh.name,
      material: materialKeyForRenderable?.(mesh, runtimeMaterialContract(skinning, instanceTransforms)) ?? mesh.material,
      ...(skinning ? { skinning } : {}),
      morphWeights: mesh.morphWeights,
      ...(instanceTransforms ? { instanceTransforms } : {})
    }));
    return;
  }
  for (const mesh of primitives) {
    const skinning = skinningForMesh(mesh, skins, nodeSkinIndex, nodeWorldMatrix);
    const primitiveNode = scene.createNode(mesh.name);
    primitiveNode.transform.setPosition(0, 0, 0);
    primitiveNode.transform.setRotation(0, 0, 0, 1);
    primitiveNode.transform.setScale(1, 1, 1);
    scene.addRenderable(primitiveNode, new Renderable({
      geometry: mesh.name,
      material: materialKeyForRenderable?.(mesh, runtimeMaterialContract(skinning, instanceTransforms)) ?? mesh.material,
      ...(skinning ? { skinning } : {}),
      morphWeights: mesh.morphWeights,
      ...(instanceTransforms ? { instanceTransforms } : {})
    }));
    node.addChild(primitiveNode);
  }
}

function skinningForMesh(mesh: GLTFMeshAsset, skins: readonly GLTFSkinAsset[], nodeSkinIndex?: number, nodeWorldMatrix?: Mat4): { readonly jointCount: number; readonly matrices: Float32Array } | undefined {
  const skinIndex = nodeSkinIndex;
  if (skinIndex === undefined) return undefined;
  if (mesh.joints.length === 0 || mesh.weights.length === 0) {
    throw new Error(`glTF mesh ${mesh.name} references skin ${skinIndex} but is missing JOINTS_0 or WEIGHTS_0 attributes`);
  }
  const skin = skins[skinIndex];
  if (!skin) {
    throw new Error(`glTF mesh ${mesh.name} references missing skin ${skinIndex}`);
  }
  if (skin.joints.length > MAX_RENDERABLE_SKIN_JOINTS) {
    return undefined;
  }
  if (!nodeWorldMatrix) return skin.skinningPalette;
  const inverseMeshWorld = invertLoaderMat4(nodeWorldMatrix);
  const matrices = new Float32Array(skin.jointBindMatrices.length * 16);
  for (let index = 0; index < skin.jointBindMatrices.length; index += 1) {
    matrices.set(multiplyLoaderMat4(inverseMeshWorld, skin.jointBindMatrices[index]!), index * 16);
  }
  return { jointCount: skin.jointBindMatrices.length, matrices };
}

function composeLoaderMat4(translation: Vec3, rotation: Quat, scale: Vec3): Mat4 {
  return composeMat4(
    [...translation] as SceneVec3,
    [...rotation] as SceneQuat,
    [...scale] as SceneVec3
  ) as unknown as Mat4;
}

function multiplyLoaderMat4(left: Mat4, right: Mat4): Mat4 {
  return multiplyMat4([...left] as SceneMat4, [...right] as SceneMat4) as unknown as Mat4;
}

function invertLoaderMat4(matrix: Mat4): Mat4 {
  return invertMat4([...matrix] as SceneMat4) as unknown as Mat4;
}

export function gltfRuntimeMaterialKey(material: string, contract: GLTFRuntimeMaterialContract): string {
  const signature = runtimeMaterialSignature(contract);
  return signature === "base" ? material : `${material}${RUNTIME_MATERIAL_KEY_MARKER}${signature}`;
}

export function parseGLTFRuntimeMaterialKey(key: string): GLTFRuntimeMaterialKey {
  const markerIndex = key.lastIndexOf(RUNTIME_MATERIAL_KEY_MARKER);
  if (markerIndex < 0) return { material: key, contract: {} };
  const signature = key.slice(markerIndex + RUNTIME_MATERIAL_KEY_MARKER.length);
  const contract = runtimeMaterialContractFromSignature(signature);
  if (!contract) return { material: key, contract: {} };
  return {
    material: key.slice(0, markerIndex),
    contract
  };
}

function createRuntimeMaterialKeyResolver(
  json: GLTFJson,
  sceneIndex: number,
  meshes: readonly GLTFMeshAsset[],
  skins: readonly GLTFSkinAsset[],
  nodeInstanceTransforms: ReadonlyMap<number, Float32Array>,
  materialVariant: string | undefined
): (mesh: GLTFMeshAsset, contract: GLTFRuntimeMaterialContract) => string {
  const signaturesByMaterial = new Map<string, Set<string>>();
  const register = (material: string, contract: GLTFRuntimeMaterialContract): void => {
    const signatures = signaturesByMaterial.get(material) ?? new Set<string>();
    signatures.add(runtimeMaterialSignature(contract));
    signaturesByMaterial.set(material, signatures);
  };
  const visit = (nodeIndex: number): void => {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    if (node.mesh !== undefined) {
      const instanceTransforms = nodeInstanceTransforms.get(nodeIndex);
      for (const mesh of meshes.filter((entry) => entry.sourceMeshIndex === node.mesh)) {
        const skinning = skinningForMesh(mesh, skins, node.skin);
        register(materialForVariant(mesh, materialVariant), runtimeMaterialContract(skinning, instanceTransforms));
      }
    }
    for (const childIndex of node.children ?? []) visit(childIndex);
  };
  for (const nodeIndex of json.scenes?.[sceneIndex]?.nodes ?? []) visit(nodeIndex);
  return (mesh, contract) => {
    const material = materialForVariant(mesh, materialVariant);
    const signatures = signaturesByMaterial.get(material);
    return signatures && signatures.size > 1 ? gltfRuntimeMaterialKey(material, contract) : material;
  };
}

function runtimeMaterialContract(
  skinning: { readonly jointCount: number; readonly matrices: Float32Array } | undefined,
  instanceTransforms: Float32Array | undefined
): GLTFRuntimeMaterialContract {
  return {
    ...(skinning ? { skinned: true } : {}),
    ...(instanceTransforms ? { instanced: true } : {})
  };
}

function runtimeMaterialSignature(contract: GLTFRuntimeMaterialContract): string {
  if (contract.skinned && contract.instanced) return "skinned+instanced";
  if (contract.skinned) return "skinned";
  if (contract.instanced) return "instanced";
  return "base";
}

function runtimeMaterialContractFromSignature(signature: string): GLTFRuntimeMaterialContract | undefined {
  if (signature === "skinned+instanced") return { skinned: true, instanced: true };
  if (signature === "skinned") return { skinned: true };
  if (signature === "instanced") return { instanced: true };
  if (signature === "base") return {};
  return undefined;
}

function materialForVariant(mesh: GLTFMeshAsset, materialVariant: string | undefined): string {
  if (materialVariant === undefined) return mesh.material;
  return mesh.materialVariants.find((mapping) => mapping.variant === materialVariant)?.material ?? mesh.material;
}

function createSceneNodeForGLTFNode(
  scene: Scene,
  source: GLTFNode,
  nodeIndex: number,
  nodeName: string,
  cameras: readonly GLTFCameraAsset[],
  lights: readonly GLTFLightAsset[]
): SceneNode {
  if (source.camera !== undefined && source.extensions?.KHR_lights_punctual?.light !== undefined) {
    throw new Error(`glTF node ${nodeIndex} cannot combine camera and KHR_lights_punctual light`);
  }
  let node: SceneNode;
  if (source.camera !== undefined) {
    node = createCameraNodeForGLTFNode(scene, source, nodeIndex, nodeName, cameras);
    applyGLTFNodeMetadata(node, source, nodeIndex);
    return node;
  }
  const lightIndex = source.extensions?.KHR_lights_punctual?.light;
  if (lightIndex === undefined) {
    node = scene.createNode(nodeName);
    applyGLTFNodeMetadata(node, source, nodeIndex);
    return node;
  }
  if (!Number.isInteger(lightIndex) || lightIndex < 0) {
    throw new RangeError(`glTF node ${nodeIndex} KHR_lights_punctual.light must be a non-negative integer`);
  }
  const light = lights[lightIndex];
  if (!light) {
    throw new Error(`glTF node ${nodeIndex} references missing punctual light ${lightIndex}`);
  }
  const lightNode = scene.createLight(light.type, nodeName);
  lightNode.color = [...light.color];
  lightNode.intensity = light.intensity;
  if (lightNode instanceof PointLight) {
    lightNode.range = light.range ?? 10;
  } else if (lightNode instanceof SpotLight) {
    lightNode.range = light.range ?? 10;
    lightNode.angle = light.spot?.outerConeAngle ?? Math.PI / 4;
    lightNode.penumbra = spotPenumbra(light.spot?.innerConeAngle ?? 0, lightNode.angle);
  }
  applyGLTFNodeMetadata(lightNode, source, nodeIndex);
  return lightNode;
}

function applyGLTFNodeMetadata(node: SceneNode, source: GLTFNode, nodeIndex: number): void {
  node.userData.gltfNodeIndex = nodeIndex;
  if (!source.extras) return;
  node.userData.gltfExtras = { ...source.extras };
  for (const [key, value] of Object.entries(source.extras)) {
    if (key.startsWith("a3d_")) node.userData[key] = value;
  }
}

function createCameraNodeForGLTFNode(
  scene: Scene,
  source: GLTFNode,
  nodeIndex: number,
  nodeName: string,
  cameras: readonly GLTFCameraAsset[]
): SceneNode {
  const cameraIndex = source.camera;
  if (!Number.isInteger(cameraIndex) || cameraIndex === undefined || cameraIndex < 0) {
    throw new RangeError(`glTF node ${nodeIndex} camera must be a non-negative integer`);
  }
  const camera = cameras[cameraIndex];
  if (!camera) {
    throw new Error(`glTF node ${nodeIndex} references missing camera ${cameraIndex}`);
  }
  if (camera.type === "perspective") {
    const perspective = camera.perspective!;
    return scene.createPerspectiveCamera({
      name: nodeName,
      fovYRadians: perspective.yfov,
      aspect: perspective.aspectRatio,
      near: perspective.znear,
      far: perspective.zfar
    });
  }
  const orthographic = camera.orthographic!;
  return scene.createOrthographicCamera({
    name: nodeName,
    left: -orthographic.xmag / 2,
    right: orthographic.xmag / 2,
    bottom: -orthographic.ymag / 2,
    top: orthographic.ymag / 2,
    near: orthographic.znear,
    far: orthographic.zfar
  });
}

function spotPenumbra(innerConeAngle: number, outerConeAngle: number): number {
  if (outerConeAngle <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - innerConeAngle / outerConeAngle));
}

function createGLTFNodeNameResolver(json: GLTFJson): (nodeIndex: number) => string {
  const bases = (json.nodes ?? []).map((node, index) => typeof node.name === "string" && node.name.trim().length > 0 ? node.name : `node-${index}`);
  const totals = new Map<string, number>();
  for (const base of bases) {
    totals.set(base, (totals.get(base) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const names = bases.map((base) => {
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return (totals.get(base) ?? 0) > 1 && count > 0 ? `${base}_${count}` : base;
  });
  return (nodeIndex) => {
    const name = names[nodeIndex];
    if (name === undefined) {
      throw new Error(`glTF node ${nodeIndex} is missing`);
    }
    return name;
  };
}

function findSkinForMesh(json: GLTFJson, meshIndex: number): number | undefined {
  const nodeIndex = (json.nodes ?? []).findIndex((node) => node.mesh === meshIndex && node.skin !== undefined);
  if (nodeIndex < 0) return undefined;
  return json.nodes?.[nodeIndex]?.skin;
}

function parentIndexByNode(json: GLTFJson): Map<number, number> {
  const parents = new Map<number, number>();
  for (const [parentIndex, node] of (json.nodes ?? []).entries()) {
    for (const childIndex of node.children ?? []) {
      parents.set(childIndex, parentIndex);
    }
  }
  return parents;
}

function orderSkinJoints(json: GLTFJson, joints: readonly number[]): number[] {
  const jointSet = new Set(joints);
  const ordered: number[] = [];
  const visited = new Set<number>();
  const parents = parentIndexByNode(json);
  const visit = (joint: number): void => {
    if (visited.has(joint)) return;
    const parent = parents.get(joint);
    if (parent !== undefined && jointSet.has(parent)) visit(parent);
    if (!json.nodes?.[joint]) {
      throw new Error(`glTF skin references missing joint node ${joint}`);
    }
    visited.add(joint);
    ordered.push(joint);
  };
  for (const joint of joints) visit(joint);
  return ordered;
}

function valueTypeForAnimationPath(path: GLTFAnimationChannel["target"]["path"]): TrackValueType {
  if (path === "rotation") return "quaternion";
  if (path === "translation" || path === "scale") return "vector3";
  return "number-array";
}

function animationValueForPath(path: GLTFAnimationChannel["target"]["path"], row: readonly number[]): number | Vec3 | Quat | readonly number[] {
  if (path === "rotation") return toQuat(row);
  if (path === "translation" || path === "scale") return toVec3(row);
  return [...row];
}

function toVec3(row: readonly number[]): Vec3 {
  return [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0];
}

function toQuat(row: readonly number[]): Quat {
  return [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0, row[3] ?? 1];
}

function toMat4(row: readonly number[]): Mat4 {
  if (row.length !== 16) {
    throw new Error(`glTF MAT4 accessor row has ${row.length} components`);
  }
  return [
    row[0]!, row[1]!, row[2]!, row[3]!,
    row[4]!, row[5]!, row[6]!, row[7]!,
    row[8]!, row[9]!, row[10]!, row[11]!,
    row[12]!, row[13]!, row[14]!, row[15]!
  ];
}

function identityMat4(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function serializeGLTFAsset(
  url: string,
  loaderDiagnostics: GLTFLoaderDiagnostics,
  images: readonly GLTFImageAsset[],
  textures: readonly GLTFTextureAsset[],
  materials: readonly GLTFMaterialAsset[],
  materialVariants: readonly GLTFMaterialVariantAsset[],
  scenes: readonly GLTFSceneAsset[],
  defaultScene: number,
  meshes: readonly GLTFMeshAsset[],
  cameras: readonly GLTFCameraAsset[],
  lights: readonly GLTFLightAsset[],
  skins: readonly GLTFSkinAsset[],
  animations: readonly AnimationClip[]
): SerializedGLTFAsset {
  return {
    url,
    loaderDiagnostics,
    images: images.map((image) => ({
      name: image.name,
      ...(image.uri ? { uri: image.uri } : {}),
      ...(image.mimeType ? { mimeType: image.mimeType } : {}),
      ...(image.data ? { byteLength: image.data.byteLength } : {})
    })),
    textures: textures.map((texture) => ({ ...texture })),
    materials: materials.map((material) => ({ ...material })),
    materialVariants: materialVariants.map((variant) => ({ ...variant })),
    scenes: scenes.map((scene) => ({ name: scene.name, nodeIndices: [...scene.nodeIndices] })),
    defaultScene,
    meshes: meshes.map((mesh) => ({
      ...mesh,
      positions: mesh.positions.map((position) => [...position] as const),
      normals: mesh.normals.map((normal) => [...normal] as const),
      texcoords: mesh.texcoords.map((texcoord) => [...texcoord] as const),
      texcoordSets: mesh.texcoordSets.map((set) => set.map((texcoord) => [...texcoord] as const)),
      tangents: mesh.tangents.map((tangent) => [...tangent] as const),
      colors: mesh.colors.map((color) => [...color] as const),
      joints: mesh.joints.map((joint) => [...joint] as const),
      weights: mesh.weights.map((weight) => [...weight] as const),
      morphTargets: mesh.morphTargets.map((target) => ({
        positions: target.positions.map((position) => [...position] as const),
        normals: target.normals.map((normal) => [...normal] as const),
        tangents: target.tangents.map((tangent) => [...tangent] as const)
      })),
      morphWeights: [...mesh.morphWeights],
      indices: mesh.indices ? [...mesh.indices] : undefined
    })),
    cameras: cameras.map((camera) => ({
      ...camera,
      ...(camera.perspective ? { perspective: { ...camera.perspective } } : {}),
      ...(camera.orthographic ? { orthographic: { ...camera.orthographic } } : {})
    })),
    lights: lights.map((light) => ({
      ...light,
      color: [...light.color] as [number, number, number],
      ...(light.spot ? { spot: { ...light.spot } } : {})
    })),
    skins: skins.map((skin) => ({
      name: skin.name,
      joints: [...skin.joints],
      jointNames: [...skin.jointNames],
      inverseBindMatrices: skin.inverseBindMatrices.map((matrix) => [...matrix] as Mat4),
      ...(skin.skeletonRoot !== undefined ? { skeletonRoot: skin.skeletonRoot } : {}),
      bones: skin.skeleton.bones.map((bone) => ({
        name: bone.name,
        parentIndex: bone.parentIndex,
        translation: [...bone.translation] as Vec3,
        rotation: [...bone.rotation] as Quat,
        scale: [...bone.scale] as Vec3,
        inverseBindMatrix: [...bone.inverseBindMatrix] as Mat4
      }))
    })),
    animations: animations.map((animation) => animation.toJSON())
  };
}
