import type { PBRMaterial } from './PBRMaterial';
export interface MaterialTextureBinding { readonly slot: keyof PBRMaterial['textures']; readonly textureId: string; readonly colorSpace: 'srgb' | 'linear' | 'hdr'; }
export function collectMaterialTextureBindings(material: PBRMaterial): readonly MaterialTextureBinding[] {
  return Object.entries(material.textures).map(([slot, textureId]) => ({ slot: slot as keyof PBRMaterial['textures'], textureId: String(textureId), colorSpace: slot === 'baseColor' || slot === 'emissive' ? 'srgb' : 'linear' }));
}
