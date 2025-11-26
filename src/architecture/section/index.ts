/**
 * Section Module
 * Architectural section planes, clipping, and BIM metadata
 * Part of G3D 5.0 Architecture/BIM Module
 */

// Type definitions
export * from './SectionTypes';

// Configuration
export * from './SectionConfig';

// Core classes
export { SectionPlane } from './SectionPlane';
export { SectionPlaneHelper, HandleType } from './SectionPlaneHelper';
export { SectionManager } from './SectionManager';
export { ClippingShaderController } from './ClippingShaderController';
export { SectionFillGenerator } from './SectionFillGenerator';
export { HatchingGenerator } from './HatchingGenerator';
export {
  BIMMetadataDisplay,
  type IPropertyFilter,
  type IPropertyDisplayOptions,
  type IFormattedProperty
} from './BIMMetadataDisplay';
