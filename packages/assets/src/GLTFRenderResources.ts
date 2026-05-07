import {
  Geometry,
  IndexBuffer,
  Material,
  PBRMaterial,
  Sampler,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  TexturedUnlitMaterial,
  UnlitMaterial,
  VertexBuffer,
  type VertexAttributeDescriptor,
  VertexFormat,
  type MorphTargetDelta,
  type RenderState,
  type SamplerDescriptor,
  type TextureFormat,
  type TextureMipLevelDescriptor
} from "@galileo3d/rendering";
import type {
  GLTFAsset,
  GLTFImageAsset,
  GLTFMaterialAsset,
  GLTFMeshAsset,
  GLTFResolvedTextureInfo,
  GLTFSceneCreateOptions,
  GLTFTextureAsset
} from "./GLTFLoader";
import { transcodeKTX2BasisTexture, type KTX2BasisTargetFormat, type KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";

export interface DecodedGLTFImage {
  readonly width: number;
  readonly height: number;
  readonly format?: TextureFormat;
  readonly colorSpace?: "srgb" | "linear";
  readonly data?: Uint8Array | Uint8ClampedArray;
  readonly mipLevels?: readonly TextureMipLevelDescriptor[];
  readonly source?: TexImageSource;
  readonly fallbackData?: Uint8Array | Uint8ClampedArray;
  readonly fallbackMipLevels?: readonly TextureMipLevelDescriptor[];
}

export type GLTFImageDecoder = (image: GLTFImageAsset, imageIndex: number, asset: GLTFAsset) => DecodedGLTFImage | Promise<DecodedGLTFImage>;

export interface GLTFRenderResourceOptions {
  readonly imageDecoder?: GLTFImageDecoder;
  readonly ktx2BasisTargetFormat?: KTX2BasisTargetFormat;
  readonly ktx2BasisTranscoderOptions?: KTX2BasisTextureTranscoderOptions;
  readonly materialVariant?: GLTFSceneCreateOptions["materialVariant"];
  readonly sceneIndex?: GLTFSceneCreateOptions["sceneIndex"];
  readonly sceneName?: GLTFSceneCreateOptions["sceneName"];
}

export interface GLTFRenderResources {
  readonly scene: ReturnType<GLTFAsset["createScene"]>;
  readonly geometryLibrary: ReadonlyMap<string, Geometry>;
  readonly materialLibrary: ReadonlyMap<string, Material>;
  readonly morphTargetLibrary: ReadonlyMap<string, readonly MorphTargetDelta[]>;
  readonly textureLibrary: ReadonlyMap<string, Texture>;
  dispose(): void;
}

type GLTFTextureColorSpace = "srgb" | "linear";

export async function createGLTFRenderResources(
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<GLTFRenderResources> {
  const geometryLibrary = new Map<string, Geometry>();
  const materialLibrary = new Map<string, Material>();
  const morphTargetLibrary = new Map<string, readonly MorphTargetDelta[]>();
  const textureLibrary = new Map<string, Texture>();
  const textureByIndex = new Map<number, Texture>();
  const scene = asset.createScene({
    ...(options.materialVariant ? { materialVariant: options.materialVariant } : {}),
    ...(options.sceneIndex !== undefined ? { sceneIndex: options.sceneIndex } : {}),
    ...(options.sceneName !== undefined ? { sceneName: options.sceneName } : {})
  });

  const getTexture = async (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace): Promise<Texture> => {
    const cacheKey = textureCacheKey(info.texture, colorSpace);
    const existing = textureByIndex.get(cacheKey);
    if (existing) return existing;
    const textureAsset = asset.textures[info.texture];
    const image = asset.images[info.image];
    if (!textureAsset || !image) {
      throw new Error(`glTF material texture ${info.texture} references missing image ${info.image}`);
    }
    const decoded = await (options.imageDecoder ?? ((sourceImage, imageIndex, sourceAsset) => decodeImageInBrowser(sourceImage, imageIndex, sourceAsset, options)))(image, info.image, asset);
    const texture = new Texture({
      width: decoded.width,
      height: decoded.height,
      ...(decoded.format ? { format: decoded.format } : {}),
      colorSpace,
      label: textureAsset.name,
      ...(decoded.mipLevels ? { mipLevels: decoded.mipLevels } : decoded.data ? { data: decoded.data } : { source: decoded.source }),
      ...(decoded.fallbackData ? { fallbackData: decoded.fallbackData } : {}),
      ...(decoded.fallbackMipLevels ? { fallbackMipLevels: decoded.fallbackMipLevels } : {})
    });
    textureByIndex.set(cacheKey, texture);
    textureLibrary.set(textureLibraryKey(textureLibrary, textureAsset.name, colorSpace), texture);
    return texture;
  };

  for (const mesh of asset.meshes) {
    geometryLibrary.set(mesh.name, createGeometry(mesh, materialForMesh(asset, mesh, options.materialVariant)));
    if (mesh.morphTargets.length > 0) {
      morphTargetLibrary.set(mesh.name, mesh.morphTargets.map((target) => ({
        positions: target.positions,
        normals: target.normals,
        tangents: target.tangents
      })));
    }
  }

  for (const material of asset.materials) {
    materialLibrary.set(material.name, await createMaterial(asset, material, getTexture));
  }

  for (const mesh of asset.meshes) {
    if (!materialLibrary.has(mesh.material)) {
      materialLibrary.set(mesh.material, new UnlitMaterial({ name: mesh.material }));
    }
  }

  return {
    scene,
    geometryLibrary,
    materialLibrary,
    morphTargetLibrary,
    textureLibrary,
    dispose: () => {
      for (const geometry of geometryLibrary.values()) geometry.dispose();
      for (const texture of textureLibrary.values()) texture.dispose();
    }
  };
}

function materialForMesh(
  asset: GLTFAsset,
  mesh: GLTFMeshAsset,
  materialVariant: string | undefined
): GLTFMaterialAsset | undefined {
  const materialIndex = materialVariant
    ? mesh.materialVariants.find((mapping) => mapping.variant === materialVariant)?.materialIndex ?? mesh.materialIndex
    : mesh.materialIndex;
  return materialIndex === undefined ? undefined : asset.materials[materialIndex];
}

function createGeometry(mesh: GLTFMeshAsset, material: GLTFMaterialAsset | undefined): Geometry {
  const texcoords = selectRenderTexcoords(mesh, material);
  const needsUv = texcoords.length > 0;
  const needsNormal = mesh.normals.length > 0 || needsUv;
  const needsColor = mesh.colors.length > 0;
  const format = vertexFormatForGLTFMesh(needsNormal, needsUv, needsColor);
  const vertices = new VertexBuffer(format, mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 1) {
    vertices.setAttribute(index, "position", mesh.positions[index]!);
    if (format.hasAttribute("normal")) {
      vertices.setAttribute(index, "normal", mesh.normals[index] ?? [0, 0, 1]);
    }
    if (format.hasAttribute("uv")) {
      vertices.setAttribute(index, "tangent", mesh.tangents[index] ?? [1, 0, 0, 1]);
      vertices.setAttribute(index, "uv", texcoords[index] ?? [0, 0]);
    }
    if (format.hasAttribute("color")) {
      vertices.setAttribute(index, "color", mesh.colors[index] ?? [1, 1, 1, 1]);
    }
  }
  const indices = mesh.indices && mesh.indices.length > 0 ? new IndexBuffer(mesh.indices, mesh.positions.length) : null;
  return new Geometry(vertices, indices, mesh.topology, mesh.geometry.bounds);
}

function selectRenderTexcoords(
  mesh: GLTFMeshAsset,
  material: GLTFMaterialAsset | undefined
): readonly (readonly [number, number])[] {
  const setIndex = preferredTexCoordSet(material);
  const selected = mesh.texcoordSets[setIndex];
  if (selected && selected.length > 0) return selected;
  if (setIndex > 0) {
    throw new Error(`glTF mesh ${mesh.name} material ${mesh.material} references missing TEXCOORD_${setIndex}`);
  }
  return mesh.texcoords;
}

function preferredTexCoordSet(material: GLTFMaterialAsset | undefined): number {
  if (!material) return 0;
  const usedSets = new Set(materialTextureInfos(material).map((info) => info.texCoord));
  if (usedSets.size > 1) {
    throw new Error(
      `glTF material ${material.name} uses multiple texture coordinate sets (${[...usedSets].sort((a, b) => a - b).join(", ")}), but the current render material path supports one UV set per draw`
    );
  }
  for (const setIndex of usedSets) {
    return setIndex;
  }
  return 0;
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

function vertexFormatForGLTFMesh(needsNormal: boolean, needsUv: boolean, needsColor: boolean): VertexFormat {
  if (!needsColor) return needsUv ? VertexFormat.P3N3T4T2 : needsNormal ? VertexFormat.P3N3 : VertexFormat.P3;
  const attributes: VertexAttributeDescriptor[] = [{ semantic: "position", components: 3, offset: 0 }];
  let offset = 12;
  if (needsNormal) {
    attributes.push({ semantic: "normal", components: 3, offset });
    offset += 12;
  }
  if (needsUv) {
    attributes.push({ semantic: "tangent", components: 4, offset });
    offset += 16;
    attributes.push({ semantic: "uv", components: 2, offset });
    offset += 8;
  }
  attributes.push({ semantic: "color", components: 4, offset });
  offset += 16;
  return new VertexFormat(attributes, offset);
}

async function createMaterial(
  asset: GLTFAsset,
  material: GLTFMaterialAsset,
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>
): Promise<Material> {
  const renderState = renderStateForGLTFMaterial(material);
  if (material.unlit) {
    if (material.baseColorTexture) {
      const texture = await getTexture(material.baseColorTexture, "srgb");
      const runtimeMaterial = new TexturedUnlitMaterial({
        name: material.name,
        texture,
        sampler: createSampler(asset.textures[material.baseColorTexture.texture]),
        textureTransform: material.baseColorTexture.transform,
        color: material.baseColorFactor,
        renderState
      });
      applyAlphaCutoff(runtimeMaterial, material);
      await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
      return runtimeMaterial;
    }
    const runtimeMaterial = new UnlitMaterial({
      name: material.name,
      color: material.baseColorFactor,
      renderState
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  if (requiresTexturedPBRMaterial(material)) {
    const baseColorTexture = material.baseColorTexture ? await getTexture(material.baseColorTexture, "srgb") : undefined;
    const normalTexture = material.normalTexture ? await getTexture(material.normalTexture, "linear") : undefined;
    const metallicRoughnessTexture = material.metallicRoughnessTexture ? await getTexture(material.metallicRoughnessTexture, "linear") : undefined;
    const occlusionTexture = material.occlusionTexture ? await getTexture(material.occlusionTexture, "linear") : undefined;
    const emissiveTexture = material.emissiveTexture ? await getTexture(material.emissiveTexture, "srgb") : undefined;
    const runtimeMaterial = new TexturedPBRMaterial({
      name: material.name,
      renderState,
      baseColor: material.baseColorFactor,
      metallic: material.metallicFactor,
      roughness: material.roughnessFactor,
      emissiveColor: material.emissiveFactor,
      emissiveStrength: material.emissiveStrength,
      ...pbrExtensionScalarOptions(material),
      baseColorTexture,
      baseColorSampler: createSampler(material.baseColorTexture ? asset.textures[material.baseColorTexture.texture] : undefined),
      baseColorTextureTransform: material.baseColorTexture?.transform,
      normalTexture,
      normalSampler: createSampler(material.normalTexture ? asset.textures[material.normalTexture.texture] : undefined),
      normalTextureTransform: material.normalTexture?.transform,
      normalScale: material.normalTexture?.scale,
      metallicRoughnessTexture,
      metallicRoughnessSampler: createSampler(material.metallicRoughnessTexture ? asset.textures[material.metallicRoughnessTexture.texture] : undefined),
      metallicRoughnessTextureTransform: material.metallicRoughnessTexture?.transform,
      occlusionTexture,
      occlusionSampler: createSampler(material.occlusionTexture ? asset.textures[material.occlusionTexture.texture] : undefined),
      occlusionTextureTransform: material.occlusionTexture?.transform,
      occlusionStrength: material.occlusionTexture?.strength,
      emissiveTexture,
      emissiveSampler: createSampler(material.emissiveTexture ? asset.textures[material.emissiveTexture.texture] : undefined),
      emissiveTextureTransform: material.emissiveTexture?.transform
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  if (material.baseColorTexture) {
    const texture = await getTexture(material.baseColorTexture, "srgb");
    const runtimeMaterial = new TexturedUnlitMaterial({
      name: material.name,
      texture,
      sampler: createSampler(asset.textures[material.baseColorTexture.texture]),
      textureTransform: material.baseColorTexture.transform,
      color: material.baseColorFactor,
      renderState
    });
    applyAlphaCutoff(runtimeMaterial, material);
    await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
    return runtimeMaterial;
  }
  const runtimeMaterial = new PBRMaterial({
    name: material.name,
    renderState,
    baseColor: material.baseColorFactor,
    metallic: material.metallicFactor,
    roughness: material.roughnessFactor,
    emissiveColor: material.emissiveFactor,
    emissiveStrength: material.emissiveStrength,
    ...pbrExtensionScalarOptions(material)
  });
  applyAlphaCutoff(runtimeMaterial, material);
  await applyPBRExtensionParameters(asset, runtimeMaterial, material, getTexture);
  return runtimeMaterial;
}

function renderStateForGLTFMaterial(material: GLTFMaterialAsset): Partial<RenderState> {
  return {
    cullMode: material.doubleSided ? "none" : "back",
    blend: material.alphaMode === "BLEND",
    depthWrite: material.alphaMode === "BLEND" ? false : true
  };
}

function applyAlphaCutoff(runtimeMaterial: Material, material: GLTFMaterialAsset): void {
  runtimeMaterial.setParameter("u_alphaCutoff", material.alphaMode === "MASK" ? material.alphaCutoff : 0);
}

function pbrExtensionScalarOptions(material: GLTFMaterialAsset): {
  readonly clearcoatFactor?: number;
  readonly clearcoatRoughnessFactor?: number;
  readonly transmissionFactor?: number;
  readonly diffuseTransmissionFactor?: number;
  readonly diffuseTransmissionColorFactor?: readonly [number, number, number];
  readonly volumeThicknessFactor?: number;
  readonly volumeAttenuationDistance?: number;
  readonly volumeAttenuationColor?: readonly [number, number, number];
  readonly ior?: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: readonly [number, number, number];
  readonly sheenColorFactor?: readonly [number, number, number];
  readonly sheenRoughnessFactor?: number;
  readonly anisotropyStrength?: number;
  readonly anisotropyRotation?: number;
  readonly iridescenceFactor?: number;
  readonly iridescenceIor?: number;
  readonly iridescenceThicknessMinimum?: number;
  readonly iridescenceThicknessMaximum?: number;
  readonly dispersion?: number;
} {
  return {
    ...(material.clearcoat ? {
      clearcoatFactor: material.clearcoat.factor,
      clearcoatRoughnessFactor: material.clearcoat.roughnessFactor
    } : {}),
    ...(material.transmission ? { transmissionFactor: material.transmission.factor } : {}),
    ...(material.diffuseTransmission ? {
      diffuseTransmissionFactor: material.diffuseTransmission.factor,
      diffuseTransmissionColorFactor: material.diffuseTransmission.colorFactor
    } : {}),
    ...(material.volume ? {
      volumeThicknessFactor: material.volume.thicknessFactor,
      volumeAttenuationDistance: renderVolumeAttenuationDistance(material.volume.attenuationDistance),
      volumeAttenuationColor: material.volume.attenuationColor
    } : {}),
    ...(material.ior !== undefined ? { ior: material.ior } : {}),
    ...(material.specular ? {
      specularFactor: material.specular.factor,
      specularColorFactor: material.specular.colorFactor
    } : {}),
    ...(material.sheen ? {
      sheenColorFactor: material.sheen.colorFactor,
      sheenRoughnessFactor: material.sheen.roughnessFactor
    } : {}),
    ...(material.anisotropy ? {
      anisotropyStrength: material.anisotropy.strength,
      anisotropyRotation: material.anisotropy.rotation
    } : {}),
    ...(material.iridescence ? {
      iridescenceFactor: material.iridescence.factor,
      iridescenceIor: material.iridescence.ior,
      iridescenceThicknessMinimum: material.iridescence.thicknessMinimum,
      iridescenceThicknessMaximum: material.iridescence.thicknessMaximum
    } : {}),
    ...(material.dispersion !== undefined ? {
      dispersion: material.dispersion
    } : {})
  };
}

async function applyPBRExtensionParameters(
  asset: GLTFAsset,
  runtimeMaterial: Material,
  material: GLTFMaterialAsset,
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>
): Promise<void> {
  if (material.clearcoat) {
    runtimeMaterial.setParameter("u_clearcoatFactor", material.clearcoat.factor);
    runtimeMaterial.setParameter("u_clearcoatRoughnessFactor", material.clearcoat.roughnessFactor);
    if (material.clearcoat.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_clearcoatTexture", material.clearcoat.texture, "linear", getTexture);
    }
    if (material.clearcoat.roughnessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_clearcoatRoughnessTexture", material.clearcoat.roughnessTexture, "linear", getTexture);
    }
    if (material.clearcoat.normalTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_clearcoatNormalTexture", material.clearcoat.normalTexture, "linear", getTexture);
      runtimeMaterial.setParameter("u_clearcoatNormalScale", material.clearcoat.normalTexture.scale);
    }
  }
  if (material.transmission) {
    runtimeMaterial.setParameter("u_transmissionFactor", material.transmission.factor);
    if (material.transmission.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_transmissionTexture", material.transmission.texture, "linear", getTexture);
    }
  }
  if (material.diffuseTransmission) {
    runtimeMaterial.setParameter("u_diffuseTransmissionFactor", material.diffuseTransmission.factor);
    runtimeMaterial.setParameter("u_diffuseTransmissionColorFactor", material.diffuseTransmission.colorFactor);
    if (material.diffuseTransmission.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_diffuseTransmissionTexture", material.diffuseTransmission.texture, "linear", getTexture);
    }
    if (material.diffuseTransmission.colorTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_diffuseTransmissionColorTexture", material.diffuseTransmission.colorTexture, "srgb", getTexture);
    }
  }
  if (material.volume) {
    runtimeMaterial.setParameter("u_volumeThicknessFactor", material.volume.thicknessFactor);
    runtimeMaterial.setParameter("u_volumeAttenuationDistance", renderVolumeAttenuationDistance(material.volume.attenuationDistance));
    runtimeMaterial.setParameter("u_volumeAttenuationColor", material.volume.attenuationColor);
    if (material.volume.thicknessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_volumeThicknessTexture", material.volume.thicknessTexture, "linear", getTexture);
    }
  }
  if (material.ior !== undefined) {
    runtimeMaterial.setParameter("u_ior", material.ior);
  }
  if (material.specular) {
    runtimeMaterial.setParameter("u_specularFactor", material.specular.factor);
    runtimeMaterial.setParameter("u_specularColorFactor", material.specular.colorFactor);
    if (material.specular.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_specularTexture", material.specular.texture, "linear", getTexture);
    }
    if (material.specular.colorTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_specularColorTexture", material.specular.colorTexture, "srgb", getTexture);
    }
  }
  if (material.sheen) {
    runtimeMaterial.setParameter("u_sheenColorFactor", material.sheen.colorFactor);
    runtimeMaterial.setParameter("u_sheenRoughnessFactor", material.sheen.roughnessFactor);
    if (material.sheen.colorTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_sheenColorTexture", material.sheen.colorTexture, "srgb", getTexture);
    }
    if (material.sheen.roughnessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_sheenRoughnessTexture", material.sheen.roughnessTexture, "linear", getTexture);
    }
  }
  if (material.anisotropy) {
    runtimeMaterial.setParameter("u_anisotropyStrength", material.anisotropy.strength);
    runtimeMaterial.setParameter("u_anisotropyRotation", material.anisotropy.rotation);
    if (material.anisotropy.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_anisotropyTexture", material.anisotropy.texture, "linear", getTexture);
    }
  }
  if (material.iridescence) {
    runtimeMaterial.setParameter("u_iridescenceFactor", material.iridescence.factor);
    runtimeMaterial.setParameter("u_iridescenceIor", material.iridescence.ior);
    runtimeMaterial.setParameter("u_iridescenceThicknessMinimum", material.iridescence.thicknessMinimum);
    runtimeMaterial.setParameter("u_iridescenceThicknessMaximum", material.iridescence.thicknessMaximum);
    if (material.iridescence.texture) {
      await setTextureParameter(asset, runtimeMaterial, "u_iridescenceTexture", material.iridescence.texture, "linear", getTexture);
    }
    if (material.iridescence.thicknessTexture) {
      await setTextureParameter(asset, runtimeMaterial, "u_iridescenceThicknessTexture", material.iridescence.thicknessTexture, "linear", getTexture);
    }
  }
  if (material.dispersion !== undefined) {
    runtimeMaterial.setParameter("u_dispersion", material.dispersion);
  }
}

async function setTextureParameter(
  asset: GLTFAsset,
  runtimeMaterial: Material,
  uniformName: string,
  info: GLTFResolvedTextureInfo,
  colorSpace: GLTFTextureColorSpace,
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>
): Promise<void> {
  runtimeMaterial.setParameter(uniformName, await createTextureBinding(asset, info, colorSpace, getTexture));
  runtimeMaterial.setParameter(`${uniformName}Offset`, info.transform?.offset ?? [0, 0]);
  runtimeMaterial.setParameter(`${uniformName}Scale`, info.transform?.scale ?? [1, 1]);
  runtimeMaterial.setParameter(`${uniformName}Rotation`, info.transform?.rotation ?? 0);
}

async function createTextureBinding(
  asset: GLTFAsset,
  info: GLTFResolvedTextureInfo,
  colorSpace: GLTFTextureColorSpace,
  getTexture: (info: GLTFResolvedTextureInfo, colorSpace: GLTFTextureColorSpace) => Promise<Texture>
): Promise<TextureBinding> {
  return new TextureBinding({
    name: `gltf-texture-${info.texture}`,
    texture: await getTexture(info, colorSpace),
    sampler: createSampler(asset.textures[info.texture]),
    required: true,
    transform: info.transform
  });
}

function requiresTexturedPBRMaterial(material: GLTFMaterialAsset): boolean {
  return Boolean(
    material.baseColorTexture ||
    material.normalTexture ||
    material.metallicRoughnessTexture ||
    material.occlusionTexture ||
    material.emissiveTexture ||
    material.clearcoat?.texture ||
    material.clearcoat?.roughnessTexture ||
    material.clearcoat?.normalTexture ||
    material.transmission?.texture ||
    material.diffuseTransmission?.texture ||
    material.diffuseTransmission?.colorTexture ||
    material.volume?.thicknessTexture ||
    material.specular?.texture ||
    material.specular?.colorTexture ||
    material.sheen?.colorTexture ||
    material.sheen?.roughnessTexture ||
    material.anisotropy?.texture ||
    material.iridescence?.texture ||
    material.iridescence?.thicknessTexture
  );
}

function renderVolumeAttenuationDistance(distance: number): number {
  return distance === Number.POSITIVE_INFINITY ? 1_000_000 : distance;
}

function textureCacheKey(textureIndex: number, colorSpace: GLTFTextureColorSpace): number {
  return textureIndex * 2 + (colorSpace === "linear" ? 1 : 0);
}

function textureLibraryKey(textureLibrary: ReadonlyMap<string, Texture>, textureName: string, colorSpace: GLTFTextureColorSpace): string {
  if (!textureLibrary.has(textureName)) return textureName;
  return `${textureName}:${colorSpace}`;
}

function createSampler(texture: GLTFTextureAsset | undefined): Sampler {
  const descriptor = texture?.samplerDescriptor;
  const samplerDescriptor: SamplerDescriptor = descriptor
    ? {
        minFilter: descriptor.minFilter,
        magFilter: descriptor.magFilter,
        addressU: descriptor.addressU,
        addressV: descriptor.addressV
      }
    : {};
  return new Sampler(samplerDescriptor);
}

async function decodeImageInBrowser(
  image: GLTFImageAsset,
  _imageIndex: number,
  asset: GLTFAsset,
  options: GLTFRenderResourceOptions = {}
): Promise<DecodedGLTFImage> {
  if (isKTX2BasisImage(image)) {
    const bytes = await readImageBytes(asset, image);
    return transcodeKTX2BasisTexture(bytes, {
      ...options.ktx2BasisTranscoderOptions,
      targetFormat: options.ktx2BasisTargetFormat ?? options.ktx2BasisTranscoderOptions?.targetFormat
    });
  }
  if (typeof createImageBitmap === "function") {
    const blob = image.data
      ? new Blob([image.data], { type: image.mimeType ?? "application/octet-stream" })
      : await fetchImageBlob(asset, image);
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, colorSpace: "srgb" };
  }
  const ImageCtor = globalThis.Image;
  if (!ImageCtor || !image.uri) {
    throw new Error("glTF image decoding requires createImageBitmap, HTMLImageElement, or a custom imageDecoder");
  }
  const imageElement = new ImageCtor();
  const url = resolveImageUrl(asset.url, image.uri);
  return new Promise((resolve, reject) => {
    imageElement.onload = () => resolve({ width: imageElement.width, height: imageElement.height, source: imageElement, colorSpace: "srgb" });
    imageElement.onerror = () => reject(new Error(`glTF image decode failed for ${url}`));
    imageElement.src = url;
  });
}

async function readImageBytes(asset: GLTFAsset, image: GLTFImageAsset): Promise<ArrayBuffer> {
  if (image.data) return image.data.slice(0);
  const blob = await fetchImageBlob(asset, image);
  return blob.arrayBuffer();
}

async function fetchImageBlob(asset: GLTFAsset, image: GLTFImageAsset): Promise<Blob> {
  if (!image.uri) {
    throw new Error("glTF image has no uri or embedded data");
  }
  if (typeof fetch !== "function") {
    throw new Error("glTF image fetch requires fetch or a custom imageDecoder");
  }
  const response = await fetch(resolveImageUrl(asset.url, image.uri));
  if (!response.ok) {
    throw new Error(`glTF image request failed with ${response.status}`);
  }
  return response.blob();
}

function isKTX2BasisImage(image: GLTFImageAsset): boolean {
  return image.mimeType === "image/ktx2" || /\.ktx2(?:[?#]|$)/i.test(image.uri ?? "");
}

function resolveImageUrl(assetUrl: string, imageUri: string): string {
  if (/^(?:data:|blob:|https?:|file:)/i.test(imageUri)) return imageUri;
  if (assetUrl.startsWith("data:")) {
    throw new Error(`Relative glTF image uri ${imageUri} cannot be resolved from a data URL asset`);
  }
  return new URL(imageUri, assetUrl).toString();
}
