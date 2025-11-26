/**
 * Architecture/BIM Module
 * G3D 5.0 Game Engine
 *
 * Provides architectural section planes, clipping, hatching, and BIM metadata functionality.
 * Designed for architectural visualization, BIM workflows, and technical drawing generation.
 *
 * @module architecture
 *
 * @example Basic Section Plane Usage
 * ```typescript
 * import { SectionPlane, SectionManager } from './architecture';
 *
 * // Create a horizontal section plane
 * const floorPlan = new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 10,
 *   name: 'Floor Plan Level 1'
 * });
 *
 * // Create section manager
 * const manager = new SectionManager();
 * manager.addSection('floor-plan', floorPlan);
 * manager.enable('floor-plan');
 * ```
 *
 * @example GPU Clipping
 * ```typescript
 * import { ClippingShaderController, SectionPlane } from './architecture';
 *
 * // Setup GPU clipping
 * const clipController = new ClippingShaderController(6);
 *
 * // Add clipping planes
 * clipController.addPlane('section1', sectionPlane1);
 * clipController.addPlane('section2', sectionPlane2);
 *
 * // Inject into shader
 * const { vertex, fragment } = clipController.injectShaderCode(
 *   vertexShaderSource,
 *   fragmentShaderSource
 * );
 *
 * // Update uniforms each frame
 * clipController.updateUniforms(shaderProgram);
 * ```
 *
 * @example Section Fills and Hatching
 * ```typescript
 * import {
 *   SectionFillGenerator,
 *   HatchingGenerator,
 *   MaterialCutStyle
 * } from './architecture';
 *
 * // Generate section geometry
 * const fillGenerator = new SectionFillGenerator();
 * const sections = fillGenerator.generateSections(meshes, sectionPlane);
 *
 * // Create hatching pattern
 * const hatchGenerator = new HatchingGenerator();
 * const pattern = hatchGenerator.createPattern('brick', {
 *   scale: 0.1,
 *   angle: 45
 * });
 *
 * // Generate hatching for section
 * for (const section of sections) {
 *   const hatchLines = hatchGenerator.generateHatching(section, pattern);
 *   const geometry = hatchGenerator.createHatchingGeometry(hatchLines);
 *   // Render geometry...
 * }
 * ```
 *
 * @example BIM Metadata Display
 * ```typescript
 * import { BIMMetadataDisplay } from './architecture';
 *
 * // Create metadata display
 * const metadataDisplay = new BIMMetadataDisplay({
 *   showIFCProperties: true,
 *   showMaterials: true,
 *   sortAlphabetically: true
 * });
 *
 * // Display element metadata
 * const metadata = {
 *   ifcType: 'IfcWall',
 *   ifcGlobalId: '3cUkl32yn9qRSPvBJVyWYW',
 *   name: 'Exterior Wall',
 *   propertySets: new Map([
 *     ['Pset_WallCommon', new Map([
 *       ['IsExternal', true],
 *       ['LoadBearing', true],
 *       ['FireRating', 'F120']
 *     ])]
 *   ]),
 *   materials: ['Concrete', 'Insulation', 'Brick'],
 *   level: 'Level 1'
 * };
 *
 * metadataDisplay.show(metadata);
 * const properties = metadataDisplay.getProperties();
 *
 * // Search properties
 * const results = metadataDisplay.search('concrete');
 *
 * // Export to CSV
 * const csv = metadataDisplay.exportToCSV();
 * ```
 *
 * @example Section Animation
 * ```typescript
 * import { SectionManager, SectionPlane } from './architecture';
 *
 * const manager = new SectionManager();
 * const section = new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 0
 * });
 *
 * manager.addSection('animated-section', section);
 *
 * // Create animation
 * manager.createAnimation(
 *   'rise-animation',
 *   'animated-section',
 *   [
 *     { time: 0, normal: new Vector3(0, 0, 1), distance: 0 },
 *     { time: 2, normal: new Vector3(0, 0, 1), distance: 20 },
 *     { time: 4, normal: new Vector3(1, 0, 0), distance: 10 }
 *   ],
 *   4.0, // duration in seconds
 *   true  // loop
 * );
 *
 * manager.playAnimation('rise-animation');
 *
 * // Update in render loop
 * function animate(deltaTime) {
 *   manager.updateAnimations(deltaTime);
 * }
 * ```
 *
 * @example Multiple Section Planes with Groups
 * ```typescript
 * import { SectionManager, SectionPlane } from './architecture';
 *
 * const manager = new SectionManager();
 *
 * // Create multiple sections
 * manager.addSection('floor-plan', SectionPlane.createHorizontal(10));
 * manager.addSection('north-elevation', SectionPlane.createVertical('y', 0));
 * manager.addSection('east-elevation', SectionPlane.createVertical('x', 0));
 *
 * // Create section group
 * manager.createGroup('elevations', ['north-elevation', 'east-elevation']);
 *
 * // Enable/disable groups
 * manager.enableGroup('elevations');
 * manager.disableGroup('elevations');
 * ```
 *
 * @example Visual Section Helper
 * ```typescript
 * import { SectionPlane, SectionPlaneHelper } from './architecture';
 *
 * const section = new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 10
 * });
 *
 * // Create visual helper
 * const helper = new SectionPlaneHelper(section, {
 *   extent: 50,
 *   showGrid: true,
 *   gridSpacing: 1.0,
 *   planeOpacity: 0.3
 * });
 *
 * scene.add(helper);
 *
 * // Update section from helper transform
 * helper.updateSectionPlane();
 * ```
 *
 * @example SVG Export
 * ```typescript
 * import { HatchingGenerator, SectionFillGenerator } from './architecture';
 *
 * const fillGen = new SectionFillGenerator();
 * const hatchGen = new HatchingGenerator();
 *
 * // Generate section
 * const sections = fillGen.generateSections(meshes, sectionPlane);
 *
 * // Create hatching
 * const pattern = hatchGen.createPattern('concrete');
 * const hatchLines = hatchGen.generateHatching(sections[0], pattern);
 *
 * // Export to SVG
 * const svgPath = hatchGen.exportToSVG(hatchLines);
 * const svgDoc = `
 *   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
 *     <path d="${svgPath}" stroke="black" stroke-width="1" fill="none"/>
 *   </svg>
 * `;
 * ```
 */

// Section system exports
export * from './section';

// Re-export commonly used types and classes for convenience
export type {
  ISectionPlane,
  ISectionDisplayConfig,
  ISectionCutGeometry,
  IHatchingPattern,
  IBIMMetadata,
  ISectionExportOptions
} from './section/SectionTypes';

export {
  FillPattern,
  LineStyle,
  MaterialCutStyle,
  SectionExportFormat,
  PointClassification
} from './section/SectionTypes';

export { SectionPlane } from './section/SectionPlane';
export { SectionPlaneHelper } from './section/SectionPlaneHelper';
export { SectionManager } from './section/SectionManager';
export { ClippingShaderController } from './section/ClippingShaderController';
export { SectionFillGenerator } from './section/SectionFillGenerator';
export { HatchingGenerator } from './section/HatchingGenerator';
export { BIMMetadataDisplay } from './section/BIMMetadataDisplay';

export {
  DEFAULT_SECTION_DISPLAY,
  SECTION_PERFORMANCE,
  MATERIAL_FILL_COLORS,
  HATCH_PATTERNS,
  MATERIAL_CUT_PRESETS,
  SECTION_HELPER_CONFIG,
  EXPORT_DEFAULTS,
  getMaterialCutAppearance,
  getHatchPattern
} from './section/SectionConfig';

/**
 * Architecture module version
 */
export const ARCHITECTURE_VERSION = '5.0.0';

/**
 * Quick start helper functions
 */

/**
 * Create a complete section setup with manager, plane, and helper
 * @param options - Section setup options
 * @returns Section components
 *
 * @example
 * ```typescript
 * const { manager, plane, helper } = createSectionSetup({
 *   type: 'horizontal',
 *   position: 10,
 *   name: 'Floor Plan'
 * });
 *
 * scene.add(helper);
 * ```
 */
export function createSectionSetup(options: {
  type: 'horizontal' | 'vertical-x' | 'vertical-y';
  position: number;
  name?: string;
  showHelper?: boolean;
  helperExtent?: number;
}): {
  manager: import('./section/SectionManager').SectionManager;
  plane: import('./section/SectionPlane').SectionPlane;
  helper?: import('./section/SectionPlaneHelper').SectionPlaneHelper;
} {
  const { SectionManager } = require('./section/SectionManager');
  const { SectionPlane } = require('./section/SectionPlane');
  const { SectionPlaneHelper } = require('./section/SectionPlaneHelper');

  let plane: any;

  switch (options.type) {
    case 'horizontal':
      plane = SectionPlane.createHorizontal(options.position, options.name);
      break;
    case 'vertical-x':
      plane = SectionPlane.createVertical('x', options.position, options.name);
      break;
    case 'vertical-y':
      plane = SectionPlane.createVertical('y', options.position, options.name);
      break;
  }

  const manager = new SectionManager();
  manager.addSection(options.name || 'section', plane);
  manager.enable(options.name || 'section');

  let helper: any;
  if (options.showHelper !== false) {
    helper = new SectionPlaneHelper(plane, {
      extent: options.helperExtent
    });
  }

  return { manager, plane, helper };
}

/**
 * Create material-specific hatching pattern
 * @param materialType - Material type
 * @param scale - Scale factor
 * @returns Hatching pattern
 *
 * @example
 * ```typescript
 * const concretePattern = createMaterialPattern('concrete', 0.1);
 * const hatchLines = generator.generateHatching(section, concretePattern);
 * ```
 */
export function createMaterialPattern(
  materialType: import('./section/SectionTypes').MaterialCutStyle,
  scale: number = 1.0
): import('./section/SectionTypes').IHatchingPattern {
  const { HatchingGenerator } = require('./section/HatchingGenerator');
  const generator = new HatchingGenerator();
  return generator.createPattern(materialType, { scale });
}
