/**
 * G3D 5.0 Material System
 * Barrel export for all material types
 *
 * @module materials
 */

// Base material
export {
  Material,
  RenderQueue,
  BlendMode,
  CullMode,
  MaterialHelpers
} from './Material';
export type {
  MaterialParameter,
  MaterialParameterType,
  GPUBindGroup,
  MaterialStats,
  MaterialJSON
} from './Material';

// Material instance
export { MaterialInstance } from './MaterialInstance';
export type { MaterialInstanceStats, MaterialInstanceJSON } from './MaterialInstance';

// PBR materials
export { StandardPBRMaterial } from './StandardPBRMaterial';
export type { AlphaMode } from './StandardPBRMaterial';

// NPR materials
export { ToonMaterial } from './ToonMaterial';

// Specialized materials
export { SubsurfaceMaterial } from './SubsurfaceMaterial';
export { HairMaterial } from './HairMaterial';
export { ClothMaterial } from './ClothMaterial';
export { TransmissionMaterial } from './TransmissionMaterial';
export { OceanMaterial } from './OceanMaterial';
export { TerrainMaterial } from './TerrainMaterial';

// Material presets
export { MaterialPresets } from './MaterialPresets';
export type { MaterialPresetName, MaterialPresetParams } from './MaterialPresets';

// Default export
export { MaterialPresets as default } from './MaterialPresets';
