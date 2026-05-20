import type { PBRMaterial } from './PBRMaterial';
export interface GLTFMaterialLike { readonly name?: string; readonly alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND'; readonly doubleSided?: boolean; readonly extensions?: Record<string, unknown>; readonly pbrMetallicRoughness?: { readonly baseColorFactor?: readonly number[]; readonly metallicFactor?: number; readonly roughnessFactor?: number }; }
export function adaptGLTFMaterial(material: GLTFMaterialLike, id = material.name ?? 'gltf-material'): PBRMaterial {
  const factor = material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
  return { id, name: material.name ?? id, baseColorFactor: [Number(factor[0] ?? 1), Number(factor[1] ?? 1), Number(factor[2] ?? 1), Number(factor[3] ?? 1)], metallicFactor: material.pbrMetallicRoughness?.metallicFactor ?? 1, roughnessFactor: material.pbrMetallicRoughness?.roughnessFactor ?? 1, alphaMode: material.alphaMode ?? 'OPAQUE', doubleSided: material.doubleSided ?? false, textures: {}, extensions: Object.keys(material.extensions ?? {}) };
}
