import type { AnimationClip } from "@aura3d/animation";
import type { Texture } from "@aura3d/rendering";
import type { SceneNode } from "@aura3d/scene";
import type { AssetDiagnostic } from "./AssetCorpus";
import type {
  GLTFAsset,
  GLTFCameraAsset,
  GLTFLightAsset,
  GLTFMaterialAsset,
  GLTFMeshAsset,
  GLTFSkinAsset
} from "./GLTFLoader";
import {
  createGLTFRenderResourceDiagnostics,
  type GLTFRenderResourceDiagnostics,
  type GLTFRenderResources
} from "./GLTFRenderResources";
import {
  evaluateGLTFExtensionSupport,
  getGLTFExtensionSupport,
  type GLTFExtensionSupportEvaluation,
  type GLTFExtensionSupportFamily,
  type GLTFExtensionSupportStatus
} from "./GLTFExtensionSupport";

export interface GLTFSceneHierarchyNodeInspection {
  readonly name: string;
  readonly depth: number;
  readonly childCount: number;
  readonly hasRenderable: boolean;
}

export interface GLTFMeshInspection {
  readonly name: string;
  readonly sourceMeshIndex: number;
  readonly primitiveIndex: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly topology: "triangles" | "lines" | "points";
  readonly material: string;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly attributeCounts: {
    readonly positions: number;
    readonly normals: number;
    readonly tangents: number;
    readonly colors: number;
    readonly texcoordSets: readonly number[];
    readonly joints: number;
    readonly weights: number;
  };
  readonly morphTargetCount: number;
  readonly skinIndex?: number;
}

export interface GLTFMaterialInspection {
  readonly name: string;
  readonly unlit: boolean;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly emissiveFactor: readonly [number, number, number];
  readonly emissiveStrength: number;
  readonly alphaMode: "OPAQUE" | "MASK" | "BLEND";
  readonly alphaCutoff: number;
  readonly doubleSided: boolean;
  readonly textures: readonly GLTFMaterialTextureSlotInspection[];
  readonly features: GLTFMaterialFeatureInspection;
  readonly extensions: readonly string[];
  readonly extensionSupport: readonly GLTFMaterialExtensionSupportInspection[];
}

export interface GLTFMaterialExtensionSupportInspection {
  readonly name: string;
  readonly family: GLTFExtensionSupportFamily;
  readonly status: GLTFExtensionSupportStatus;
  readonly requiredAccepted: boolean;
  readonly knownLimits: readonly string[];
}

export interface GLTFMaterialFeatureInspection {
  readonly normalScale?: number;
  readonly occlusionStrength?: number;
  readonly clearcoat?: {
    readonly factor: number;
    readonly roughnessFactor: number;
    readonly normalScale?: number;
  };
  readonly transmission?: {
    readonly factor: number;
  };
  readonly diffuseTransmission?: {
    readonly factor: number;
    readonly colorFactor: readonly [number, number, number];
  };
  readonly volume?: {
    readonly thicknessFactor: number;
    readonly attenuationDistance: number;
    readonly attenuationColor: readonly [number, number, number];
  };
  readonly ior?: number;
  readonly specular?: {
    readonly factor: number;
    readonly colorFactor: readonly [number, number, number];
  };
  readonly sheen?: {
    readonly colorFactor: readonly [number, number, number];
    readonly roughnessFactor: number;
  };
  readonly anisotropy?: {
    readonly strength: number;
    readonly rotation: number;
  };
  readonly iridescence?: {
    readonly factor: number;
    readonly ior: number;
    readonly thicknessMinimum: number;
    readonly thicknessMaximum: number;
  };
  readonly dispersion?: number;
}

export interface GLTFMaterialTextureSlotInspection {
  readonly slot: string;
  readonly texture: number;
  readonly image: number;
  readonly texCoord: number;
  readonly transform?: {
    readonly offset: readonly [number, number];
    readonly scale: readonly [number, number];
    readonly rotation: number;
  };
}

export interface GLTFTextureInspection {
  readonly name: string;
  readonly sourceImage: number;
  readonly imageName: string;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly embeddedBytes?: number;
  readonly sampler?: {
    readonly minFilter: "nearest" | "linear" | "nearest-mipmap-nearest" | "linear-mipmap-nearest" | "nearest-mipmap-linear" | "linear-mipmap-linear";
    readonly magFilter: "nearest" | "linear";
    readonly addressU: "clamp-to-edge" | "repeat" | "mirror-repeat";
    readonly addressV: "clamp-to-edge" | "repeat" | "mirror-repeat";
  };
  readonly runtime?: {
    readonly width: number;
    readonly height: number;
    readonly format: string;
    readonly colorSpace: "linear" | "srgb";
    readonly mipLevels: number;
    readonly byteLength: number;
    readonly fallbackByteLength: number;
  };
}

export interface GLTFAnimationInspection {
  readonly name: string;
  readonly duration: number;
  readonly trackCount: number;
  readonly tracks: readonly {
    readonly target: string;
    readonly valueType: string;
    readonly keyframes: number;
  }[];
}

export interface GLTFSkinInspection {
  readonly name: string;
  readonly jointCount: number;
  readonly skeletonRoot?: number;
  readonly bones: readonly {
    readonly name: string;
    readonly parentIndex: number;
  }[];
}

export interface GLTFMorphTargetInspection {
  readonly mesh: string;
  readonly weights: readonly number[];
  readonly targets: readonly {
    readonly index: number;
    readonly positions: number;
    readonly normals: number;
    readonly tangents: number;
  }[];
}

export interface GLTFDependencyInspection {
  readonly owner: string;
  readonly dependency: string;
  readonly kind: "buffer" | "image" | "texture";
}

export interface GLTFAssetInspectionReport {
  readonly extensionSupport: GLTFExtensionSupportEvaluation;
  readonly renderResources?: GLTFRenderResourceDiagnostics;
  readonly sceneHierarchy: readonly GLTFSceneHierarchyNodeInspection[];
  readonly meshes: readonly GLTFMeshInspection[];
  readonly materials: readonly GLTFMaterialInspection[];
  readonly textures: readonly GLTFTextureInspection[];
  readonly animations: readonly GLTFAnimationInspection[];
  readonly skins: readonly GLTFSkinInspection[];
  readonly morphTargets: readonly GLTFMorphTargetInspection[];
  readonly cameras: readonly GLTFCameraAsset[];
  readonly lights: readonly GLTFLightAsset[];
  readonly dependencies: readonly GLTFDependencyInspection[];
  readonly warnings: readonly AssetDiagnostic[];
}

export function inspectGLTFAsset(asset: GLTFAsset, resources?: GLTFRenderResources): GLTFAssetInspectionReport {
  const scene = resources?.scene ?? asset.createScene();
  const renderResources = resources ? createGLTFRenderResourceDiagnostics(resources) : undefined;
  return {
    extensionSupport: asset.loaderDiagnostics.extensionSupport ?? evaluateGLTFExtensionSupport(
      asset.loaderDiagnostics.extensionsUsed,
      asset.loaderDiagnostics.extensionsRequired
    ),
    ...(renderResources ? { renderResources } : {}),
    sceneHierarchy: inspectSceneHierarchy(scene),
    meshes: asset.meshes.map(inspectMesh),
    materials: asset.materials.map(inspectMaterial),
    textures: asset.textures.map((texture, index) => inspectTexture(asset, resources, index)),
    animations: asset.animations.map(inspectAnimation),
    skins: asset.skins.map(inspectSkin),
    morphTargets: asset.meshes.filter((mesh) => mesh.morphTargets.length > 0).map(inspectMorphTargets),
    cameras: asset.cameras,
    lights: asset.lights,
    dependencies: inspectDependencies(asset),
    warnings: createGLTFInspectionWarnings(asset, renderResources)
  };
}

function inspectSceneHierarchy(scene: ReturnType<GLTFAsset["createScene"]>): readonly GLTFSceneHierarchyNodeInspection[] {
  const rows: GLTFSceneHierarchyNodeInspection[] = [];
  const visit = (node: SceneNode, depth: number): void => {
    rows.push({
      name: node.name,
      depth,
      childCount: node.children.length,
      hasRenderable: Boolean((node as typeof node & { renderable?: unknown }).renderable)
    });
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(scene.root, 0);
  return rows;
}

function inspectMesh(mesh: GLTFMeshAsset): GLTFMeshInspection {
  return {
    name: mesh.name,
    sourceMeshIndex: mesh.sourceMeshIndex,
    primitiveIndex: mesh.primitiveIndex,
    vertexCount: mesh.geometry.vertexCount,
    indexCount: mesh.geometry.indexCount,
    topology: mesh.topology,
    material: mesh.material,
    bounds: mesh.geometry.bounds,
    attributeCounts: {
      positions: mesh.positions.length,
      normals: mesh.normals.length,
      tangents: mesh.tangents.length,
      colors: mesh.colors.length,
      texcoordSets: mesh.texcoordSets.map((set) => set.length),
      joints: mesh.joints.length,
      weights: mesh.weights.length
    },
    morphTargetCount: mesh.morphTargets.length,
    ...(mesh.skinIndex === undefined ? {} : { skinIndex: mesh.skinIndex })
  };
}

function inspectMaterial(material: GLTFMaterialAsset): GLTFMaterialInspection {
  return {
    name: material.name,
    unlit: material.unlit,
    baseColorFactor: material.baseColorFactor,
    metallicFactor: material.metallicFactor,
    roughnessFactor: material.roughnessFactor,
    emissiveFactor: material.emissiveFactor,
    emissiveStrength: material.emissiveStrength,
    alphaMode: material.alphaMode,
    alphaCutoff: material.alphaCutoff,
    doubleSided: material.doubleSided,
    textures: materialTextureSlots(material),
    features: materialFeatures(material),
    extensions: materialExtensions(material),
    extensionSupport: materialExtensions(material).map(inspectMaterialExtensionSupport)
  };
}

function inspectMaterialExtensionSupport(name: string): GLTFMaterialExtensionSupportInspection {
  const support = getGLTFExtensionSupport(name);
  return {
    name: support.name,
    family: support.family,
    status: support.status,
    requiredAccepted: support.requiredAccepted,
    knownLimits: support.knownLimits
  };
}

function materialFeatures(material: GLTFMaterialAsset): GLTFMaterialFeatureInspection {
  return {
    ...(material.normalTexture ? { normalScale: material.normalTexture.scale } : {}),
    ...(material.occlusionTexture ? { occlusionStrength: material.occlusionTexture.strength } : {}),
    ...(material.clearcoat ? {
      clearcoat: {
        factor: material.clearcoat.factor,
        roughnessFactor: material.clearcoat.roughnessFactor,
        ...(material.clearcoat.normalTexture ? { normalScale: material.clearcoat.normalTexture.scale } : {})
      }
    } : {}),
    ...(material.transmission ? { transmission: { factor: material.transmission.factor } } : {}),
    ...(material.diffuseTransmission ? {
      diffuseTransmission: {
        factor: material.diffuseTransmission.factor,
        colorFactor: material.diffuseTransmission.colorFactor
      }
    } : {}),
    ...(material.volume ? {
      volume: {
        thicknessFactor: material.volume.thicknessFactor,
        attenuationDistance: material.volume.attenuationDistance,
        attenuationColor: material.volume.attenuationColor
      }
    } : {}),
    ...(material.ior !== undefined ? { ior: material.ior } : {}),
    ...(material.specular ? {
      specular: {
        factor: material.specular.factor,
        colorFactor: material.specular.colorFactor
      }
    } : {}),
    ...(material.sheen ? {
      sheen: {
        colorFactor: material.sheen.colorFactor,
        roughnessFactor: material.sheen.roughnessFactor
      }
    } : {}),
    ...(material.anisotropy ? {
      anisotropy: {
        strength: material.anisotropy.strength,
        rotation: material.anisotropy.rotation
      }
    } : {}),
    ...(material.iridescence ? {
      iridescence: {
        factor: material.iridescence.factor,
        ior: material.iridescence.ior,
        thicknessMinimum: material.iridescence.thicknessMinimum,
        thicknessMaximum: material.iridescence.thicknessMaximum
      }
    } : {}),
    ...(material.dispersion !== undefined ? { dispersion: material.dispersion } : {})
  };
}

function materialTextureSlots(material: GLTFMaterialAsset): readonly GLTFMaterialTextureSlotInspection[] {
  return [
    textureSlot("baseColor", material.baseColorTexture),
    textureSlot("metallicRoughness", material.metallicRoughnessTexture),
    textureSlot("normal", material.normalTexture),
    textureSlot("occlusion", material.occlusionTexture),
    textureSlot("emissive", material.emissiveTexture),
    textureSlot("clearcoat", material.clearcoat?.texture),
    textureSlot("clearcoatRoughness", material.clearcoat?.roughnessTexture),
    textureSlot("clearcoatNormal", material.clearcoat?.normalTexture),
    textureSlot("transmission", material.transmission?.texture),
    textureSlot("diffuseTransmission", material.diffuseTransmission?.texture),
    textureSlot("diffuseTransmissionColor", material.diffuseTransmission?.colorTexture),
    textureSlot("volumeThickness", material.volume?.thicknessTexture),
    textureSlot("specular", material.specular?.texture),
    textureSlot("specularColor", material.specular?.colorTexture),
    textureSlot("sheenColor", material.sheen?.colorTexture),
    textureSlot("sheenRoughness", material.sheen?.roughnessTexture),
    textureSlot("anisotropy", material.anisotropy?.texture),
    textureSlot("iridescence", material.iridescence?.texture),
    textureSlot("iridescenceThickness", material.iridescence?.thicknessTexture)
  ].filter((slot): slot is GLTFMaterialTextureSlotInspection => slot !== undefined);
}

function textureSlot(
  slot: string,
  info: GLTFMaterialAsset["baseColorTexture"]
): GLTFMaterialTextureSlotInspection | undefined {
  if (!info) return undefined;
  return {
    slot,
    texture: info.texture,
    image: info.image,
    texCoord: info.texCoord,
    ...(info.transform ? { transform: info.transform } : {})
  };
}

function materialExtensions(material: GLTFMaterialAsset): readonly string[] {
  return [
    material.unlit ? "KHR_materials_unlit" : undefined,
    material.emissiveStrength !== 1 ? "KHR_materials_emissive_strength" : undefined,
    material.clearcoat ? "KHR_materials_clearcoat" : undefined,
    material.transmission ? "KHR_materials_transmission" : undefined,
    material.diffuseTransmission ? "KHR_materials_diffuse_transmission" : undefined,
    material.volume ? "KHR_materials_volume" : undefined,
    material.ior !== undefined ? "KHR_materials_ior" : undefined,
    material.specular ? "KHR_materials_specular" : undefined,
    material.pbrSpecularGlossiness ? "KHR_materials_pbrSpecularGlossiness" : undefined,
    material.sheen ? "KHR_materials_sheen" : undefined,
    material.anisotropy ? "KHR_materials_anisotropy" : undefined,
    material.iridescence ? "KHR_materials_iridescence" : undefined,
    material.dispersion !== undefined ? "KHR_materials_dispersion" : undefined
  ].filter((extension): extension is string => extension !== undefined);
}

function inspectTexture(asset: GLTFAsset, resources: GLTFRenderResources | undefined, textureIndex: number): GLTFTextureInspection {
  const texture = asset.textures[textureIndex]!;
  const image = asset.images[texture.source]!;
  const runtime = findRuntimeTexture(resources, texture.name);
  return {
    name: texture.name,
    sourceImage: texture.source,
    imageName: image.name,
    ...(image.uri ? { uri: image.uri } : {}),
    ...(image.mimeType ? { mimeType: image.mimeType } : {}),
    ...(image.data ? { embeddedBytes: image.data.byteLength } : {}),
    ...(texture.samplerDescriptor ? { sampler: texture.samplerDescriptor } : {}),
    ...(runtime ? {
      runtime: {
        width: runtime.width,
        height: runtime.height,
        format: runtime.format,
        colorSpace: runtime.colorSpace,
        mipLevels: Math.max(1, runtime.textureLevels.length),
        byteLength: runtime.byteLength,
        fallbackByteLength: runtime.fallbackByteLength
      }
    } : {})
  };
}

function findRuntimeTexture(resources: GLTFRenderResources | undefined, textureName: string): Texture | undefined {
  if (!resources) return undefined;
  return resources.textureLibrary.get(textureName) ?? resources.textureLibrary.get(`${textureName}:srgb`) ?? resources.textureLibrary.get(`${textureName}:linear`);
}

function inspectAnimation(clip: AnimationClip): GLTFAnimationInspection {
  return {
    name: clip.name,
    duration: clip.duration,
    trackCount: clip.tracks.length,
    tracks: clip.tracks.map((track) => ({
      target: track.target,
      valueType: track.valueType,
      keyframes: track.keyframes.length
    }))
  };
}

function inspectSkin(skin: GLTFSkinAsset): GLTFSkinInspection {
  return {
    name: skin.name,
    jointCount: skin.joints.length,
    ...(skin.skeletonRoot === undefined ? {} : { skeletonRoot: skin.skeletonRoot }),
    bones: skin.skeleton.bones.map((bone) => ({
      name: bone.name,
      parentIndex: bone.parentIndex
    }))
  };
}

function inspectMorphTargets(mesh: GLTFMeshAsset): GLTFMorphTargetInspection {
  return {
    mesh: mesh.name,
    weights: mesh.morphWeights,
    targets: mesh.morphTargets.map((target, index) => ({
      index,
      positions: target.positions.length,
      normals: target.normals.length,
      tangents: target.tangents.length
    }))
  };
}

function inspectDependencies(asset: GLTFAsset): readonly GLTFDependencyInspection[] {
  const dependencies: GLTFDependencyInspection[] = [];
  for (const [textureIndex, texture] of asset.textures.entries()) {
    dependencies.push({
      owner: texture.name,
      dependency: asset.images[texture.source]?.name ?? `image-${texture.source}`,
      kind: "image"
    });
    dependencies.push({
      owner: `material-slot:${textureIndex}`,
      dependency: texture.name,
      kind: "texture"
    });
  }
  return dependencies;
}

function createGLTFInspectionWarnings(
  asset: GLTFAsset,
  renderResources?: GLTFRenderResourceDiagnostics
): readonly AssetDiagnostic[] {
  const warnings: AssetDiagnostic[] = [];
  const push = (code: string, message: string, nextAction: string): void => {
    warnings.push({ code, severity: "warning", message, nextAction });
  };

  for (const extension of asset.loaderDiagnostics.unsupportedExtensions) {
    if (isMaterialExtensionName(extension)) {
      push(
        "GLTF_UNSUPPORTED_MATERIAL_EXTENSION",
        `Unsupported glTF material extension ${extension} is declared by this asset and will not be rendered with extension-specific fidelity.`,
        "Use fallback material inspection output unless a renderer/resource path explicitly supports this material extension."
      );
    } else {
      push(
        "GLTF_UNSUPPORTED_EXTENSION",
        `Unsupported glTF extension ${extension} is declared by this asset and may be ignored by current loader or render-resource paths.`,
        "Keep this feature blocked until a loader, inspector, and render-resource path handles the extension."
      );
    }
  }

  const hasMorphTargets = asset.meshes.some((mesh) => mesh.morphTargets.length > 0);
  const hasMultiUvMaterial = asset.materials.some((material) => new Set(materialTextureSlots(material).map((slot) => slot.texCoord)).size > 1);
  const hasSupportedMultiUvMaterial = asset.materials.some((material) => {
    const texCoordSets = new Set(materialTextureSlots(material).map((slot) => slot.texCoord));
    return texCoordSets.size > 1 && [...texCoordSets].every((texCoord) => texCoord === 0 || texCoord === 1);
  });
  const hasUnsupportedMultiUvMaterial = asset.materials.some((material) =>
    materialTextureSlots(material).some((slot) => slot.texCoord > 1)
  );
  const hasMorphWeightAnimation = asset.animations.some((clip) => clip.tracks.some((track) => track.target.endsWith(".weights") && track.valueType === "number-array"));
  const hasRootMotionTrack = asset.animations.some((clip) => clip.tracks.some((track) =>
    (track.target.endsWith(".position") || track.target.endsWith(".translation")) &&
    track.valueType === "vector3"
  ));
  const hasRenderableSkinning = asset.skins.length > 0 &&
    asset.meshes.some((mesh) => mesh.skinIndex !== undefined) &&
    asset.meshes.filter((mesh) => mesh.skinIndex !== undefined).every((mesh) => mesh.joints.length > 0 && mesh.weights.length > 0);
  if (asset.animations.length > 0) {
    if (hasRootMotionTrack && !hasRenderableSkinning && !hasMorphWeightAnimation) {
      push(
        "ASSET_VIEWER_ROOT_MOTION_ACTIVE",
        "glTF animation clips are imported, sampled, and have a vector translation track that asset-viewer playback applies to root-motion controller state.",
        "Use viewer playback root-motion metrics for this generated corpus asset; keep broad animation parity blocked until the wider Khronos/extension corpus is rendered."
      );
    } else {
      push(
        "ASSET_VIEWER_ANIMATION_PLAYBACK_BOUNDED",
        hasRenderableSkinning && hasMorphWeightAnimation
          ? "glTF animation clips are imported, node transforms can be sampled, morph-weight tracks can drive renderables, and skinned meshes bind renderable skinning palettes; animation pointer parity remains bounded."
          : hasRenderableSkinning
            ? "glTF animation clips are imported, node transforms can be sampled, and skinned meshes bind renderable skinning palettes, but morph weight animation and animation pointer parity remain bounded."
            : hasMorphWeightAnimation
          ? "glTF animation clips are imported and node transform plus morph-weight tracks can be sampled into the rendered scene, but skinning and animation pointer parity remain bounded."
          : "glTF animation clips are imported and node transform tracks can be sampled into the rendered scene, but skinning, morph weight animation, and animation pointer parity remain bounded.",
        hasRenderableSkinning && hasMorphWeightAnimation
          ? "Use viewer playback for TRS, morph-weight, and skinning diagnostics; keep full animation parity blocked until extension-driven animation paths are rendered."
          : hasRenderableSkinning
            ? "Use viewer playback for TRS and skinning diagnostics; keep full animation parity blocked until morph-weight and extension-driven animation paths are rendered."
            : hasMorphWeightAnimation
          ? "Use viewer playback for TRS and morph-weight diagnostics; keep full animation parity claims blocked until skinned and extension-driven animation paths are rendered."
          : "Use viewer playback for translation/rotation/scale diagnostics; keep full animation parity claims blocked until skinned, morph, and extension-driven animation paths are rendered."
      );
    }
  }
  if (asset.skins.length > 0 || asset.meshes.some((mesh) => mesh.skinIndex !== undefined)) {
    if (hasRenderableSkinning) {
      push(
        "ASSET_VIEWER_SKINNING_RENDER_ACTIVE",
        "glTF skin and joint data are imported, inspectable, and bound as renderable skinning palettes for skinned mesh draw items.",
        "Keep broad skinned character parity scoped until a wider animated character corpus and external-engine visual comparison exist."
      );
    } else {
      push(
        "ASSET_VIEWER_SKINNING_INSPECT_ONLY",
        "glTF skin and joint data are imported and inspectable, but the viewer render path is not yet applying skinning palettes to these imported meshes.",
        "Keep skinned character visual parity claims blocked until GLTFRenderResources binds skinning data for render items."
      );
    }
  }
  if (hasMorphTargets) {
    if (hasMorphWeightAnimation) {
      push(
        "ASSET_VIEWER_MORPH_ANIMATION_ACTIVE",
        "glTF morph target data is imported, slider-adjustable, and driven by imported morph-weight animation tracks in the asset viewer.",
        "Keep broad morph parity scoped to the visible corpus and browser evidence; production character parity still requires broader assets and skinning integration."
      );
    } else {
      push(
        "ASSET_VIEWER_MORPH_PLAYBACK_BOUNDED",
        "glTF morph target data is imported and the asset viewer can update renderable morph weights through sliders, but morph animation and production character parity remain bounded.",
        "Use viewer sliders for target-weight diagnostics; keep broad morph parity blocked until animated morph weights and visual corpus coverage exist."
      );
    }
  }
  if (asset.materialVariants.length > 0) {
    push(
      "ASSET_VIEWER_VARIANTS_SWITCHING_BOUNDED",
      "glTF material variants are imported and the asset viewer can rebuild render resources for a selected material variant, but authoring and full extension parity remain bounded.",
      "Use the viewer selector for import/render diagnostics; keep broad material workflow parity blocked until variant authoring, persistence, and cross-asset visual corpus coverage exist."
    );
  }
  const unbackedTransmissionMaterials = asset.materials.filter(isUnbackedTransmissionMaterial);
  if (unbackedTransmissionMaterials.length > 0) {
    push(
      "GLTF_TRANSMISSION_REFRACTION_FALLBACK",
      `KHR_materials_transmission material(s) ${summarizeMaterialNames(unbackedTransmissionMaterials)} require scene-color refraction for full fidelity; the current WebGL render path uses a bounded alpha/specular fallback instead of true refraction.`,
      "Treat these materials as parsed-with-limits; use authored BLEND glass or implement a backdrop/refraction render path before claiming full transmission fidelity."
    );
  }
  if (hasSupportedMultiUvMaterial) {
    push(
      "ASSET_VIEWER_MULTI_UV_RENDER_ACTIVE",
      "The asset uses multiple texture coordinate sets in one material, and the render path binds TEXCOORD_0/TEXCOORD_1 so each texture slot can sample its declared set.",
      "Keep arbitrary multi-UV parity scoped to two UV sets until assets with TEXCOORD_2+ have render and browser evidence."
    );
  }
  if (hasMultiUvMaterial && hasUnsupportedMultiUvMaterial) {
    push(
      "ASSET_VIEWER_MULTI_UV_RENDER_FALLBACK",
      "The asset uses texture coordinate sets beyond TEXCOORD_1; the current render path supports two UV streams and falls back for higher sets.",
      "Keep full arbitrary multi-UV material parity blocked until render materials bind and sample TEXCOORD_2+."
    );
  }
  if (asset.textures.some((texture) => /\.ktx2(?:[?#]|$)/i.test(asset.images[texture.source]?.uri ?? ""))) {
    push(
      "ASSET_VIEWER_KTX2_TRANSCODER_REQUIRED",
      "KTX2/Basis textures require a configured browser transcoder target before they can be considered real compressed texture evidence.",
      "Inject a KTX2/Basis transcoder profile and report the selected GPU format plus fallback path."
    );
  }
  if (renderResources) {
    if (renderResources.fallbackWhiteDrawItems > 0) {
      push(
        "GLTF_RENDER_RESOURCE_FALLBACK_WHITE",
        `Render resources contain ${renderResources.fallbackWhiteDrawItems} fallback-white draw item(s): ${renderResources.fallbackWhiteLabels.slice(0, 6).join(", ")}.`,
        "Treat these draw items as material failures unless the source material is intentionally white or texture-backed evidence proves otherwise."
      );
    }
    if (renderResources.missingMaterialDrawItems > 0) {
      push(
        "GLTF_RENDER_RESOURCE_MISSING_MATERIAL",
        `Render resources contain ${renderResources.missingMaterialDrawItems} draw item(s) with no runtime material binding: ${renderResources.missingMaterialLabels.slice(0, 6).join(", ")}.`,
        "Fix the glTF material binding or report the exact unsupported primitive before counting this asset as render-ready."
      );
    }
    if (renderResources.missingGeometryDrawItems > 0) {
      push(
        "GLTF_RENDER_RESOURCE_MISSING_GEOMETRY",
        `Render resources contain ${renderResources.missingGeometryDrawItems} draw item(s) with no runtime geometry binding: ${renderResources.missingGeometryLabels.slice(0, 6).join(", ")}.`,
        "Fix the glTF primitive geometry binding or report the exact unsupported primitive before counting this asset as render-ready."
      );
    }
    if (renderResources.unsupportedTexCoordDrawItems > 0) {
      const labels = renderResources.materialFidelityDiagnostics
        .filter((diagnostic) => diagnostic.issue === "unsupported-texcoord-set")
        .slice(0, 6)
        .map((diagnostic) => `${diagnostic.nodeName}:${diagnostic.slot}:TEXCOORD_${diagnostic.texCoord}->TEXCOORD_${diagnostic.renderedTexCoord}`);
      push(
        "GLTF_RENDER_RESOURCE_TEXCOORD_DOWNGRADED",
        `Render resources downgrade ${renderResources.unsupportedTexCoordDrawItems} draw item(s) that reference TEXCOORD_2 or higher: ${labels.join(", ")}.`,
        "Bind and sample the authored texture coordinate set before counting this material as full glTF texture parity."
      );
    }
    if (renderResources.generatedTangentUvMismatchDrawItems > 0) {
      const labels = renderResources.materialFidelityDiagnostics
        .filter((diagnostic) => diagnostic.issue === "generated-tangent-uv-mismatch")
        .slice(0, 6)
        .map((diagnostic) => `${diagnostic.nodeName}:${diagnostic.slot}:TEXCOORD_${diagnostic.texCoord}`);
      push(
        "GLTF_RENDER_RESOURCE_TANGENT_UV_MISMATCH",
        `Render resources generated tangent space from TEXCOORD_0 for ${renderResources.generatedTangentUvMismatchDrawItems} draw item(s) with normal-map slots on another coordinate set: ${labels.join(", ")}.`,
        "Use authored tangents or generate tangents from the sampled normal-map coordinate set before treating the normal/clearcoat normal response as faithful."
      );
    }
  }

  return warnings;
}

function isMaterialExtensionName(extension: string): boolean {
  return /(?:^|_)materials?_/.test(extension) || /material/i.test(extension);
}

function isUnbackedTransmissionMaterial(material: GLTFMaterialAsset): boolean {
  const transmission = material.transmission?.factor ?? 0;
  const diffuseTransmission = material.diffuseTransmission?.factor ?? 0;
  if (transmission <= 0 && diffuseTransmission <= 0) return false;
  return material.volume === undefined &&
    material.transmission?.texture === undefined &&
    material.diffuseTransmission?.texture === undefined &&
    material.diffuseTransmission?.colorTexture === undefined;
}

function summarizeMaterialNames(materials: readonly GLTFMaterialAsset[]): string {
  const names = materials.slice(0, 4).map((material) => material.name || "material").join(", ");
  return materials.length > 4 ? `${names}, +${materials.length - 4} more` : names;
}
