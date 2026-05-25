import type { PBRMaterial } from './PBRMaterial';
import type { PBRShaderFeatures } from './PBRShaderFeatures';
export interface CompiledMaterialProgram { readonly key: string; readonly defines: readonly string[]; readonly material: PBRMaterial; }
export function compilePBRMaterial(material: PBRMaterial, features: Partial<PBRShaderFeatures> = {}): CompiledMaterialProgram {
  const defines = Object.entries(features).filter(([, enabled]) => enabled).map(([name]) => 'USE_' + name.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase());
  return { key: [material.id, ...defines].join('|'), defines, material };
}
