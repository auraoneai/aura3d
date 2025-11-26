/**
 * SectionConfig.ts
 * Default configuration for section planes and rendering
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Color } from '../../math';
import {
  FillPattern,
  LineStyle,
  MaterialCutStyle,
  ISectionDisplayConfig,
  IMaterialCutAppearance,
  IHatchingPattern
} from './SectionTypes';

/**
 * Default section display configuration
 */
export const DEFAULT_SECTION_DISPLAY: ISectionDisplayConfig = {
  fillPattern: FillPattern.HATCH,
  fillColor: new Color(0.8, 0.8, 0.8),
  fillOpacity: 0.5,
  lineStyle: LineStyle.CONTINUOUS,
  lineColor: new Color(0, 0, 0),
  lineWidth: 2.0,
  showHatching: true,
  hatchingScale: 1.0,
  hatchingAngle: 45,
  showCap: true
};

/**
 * Performance settings for section rendering
 */
export const SECTION_PERFORMANCE = {
  /** Maximum number of simultaneous clipping planes */
  maxClippingPlanes: 6,
  /** Enable GPU-accelerated clipping */
  useGPUClipping: true,
  /** Tessellation quality (1-10) */
  tessellationQuality: 5,
  /** Enable progressive rendering for large models */
  progressiveRendering: true,
  /** Maximum vertices per batch */
  maxVerticesPerBatch: 100000,
  /** Enable section caching */
  enableCaching: true,
  /** Cache expiry time in ms */
  cacheExpiryMs: 5000
};

/**
 * Default fill colors for different material types
 */
export const MATERIAL_FILL_COLORS: Record<MaterialCutStyle, Color> = {
  [MaterialCutStyle.GENERIC]: new Color(0.8, 0.8, 0.8),
  [MaterialCutStyle.CONCRETE]: new Color(0.7, 0.7, 0.7),
  [MaterialCutStyle.BRICK]: new Color(0.8, 0.4, 0.3),
  [MaterialCutStyle.WOOD]: new Color(0.8, 0.6, 0.4),
  [MaterialCutStyle.STEEL]: new Color(0.6, 0.6, 0.7),
  [MaterialCutStyle.INSULATION]: new Color(0.95, 0.8, 0.6),
  [MaterialCutStyle.GLASS]: new Color(0.7, 0.85, 0.9),
  [MaterialCutStyle.EARTH]: new Color(0.6, 0.5, 0.4)
};

/**
 * Default line widths for different scales
 */
export const LINE_WIDTHS = {
  thin: 0.5,
  medium: 1.0,
  thick: 2.0,
  extraThick: 3.0
};

/**
 * Hatch pattern definitions
 */
export const HATCH_PATTERNS: Record<string, IHatchingPattern> = {
  // Generic patterns
  simple: {
    name: 'Simple Hatch',
    angle: 45,
    spacing: 0.1,
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 1.0
  },

  crossHatch: {
    name: 'Cross Hatch',
    angle: 45,
    spacing: 0.1,
    layers: [
      { angle: 135, spacing: 0.1 }
    ],
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 1.0
  },

  // Material-specific patterns
  concrete: {
    name: 'Concrete',
    angle: 0,
    spacing: 0.15,
    layers: [
      { angle: 90, spacing: 0.3 }
    ],
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 0.8
  },

  brick: {
    name: 'Brick',
    angle: 0,
    spacing: 0.075,
    layers: [
      { angle: 90, spacing: 0.225 }
    ],
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 1.0
  },

  wood: {
    name: 'Wood Grain',
    angle: 0,
    spacing: 0.05,
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 0.6
  },

  steel: {
    name: 'Steel',
    angle: 45,
    spacing: 0.08,
    layers: [
      { angle: 135, spacing: 0.08 }
    ],
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 1.2
  },

  insulation: {
    name: 'Insulation',
    angle: 0,
    spacing: 0.2,
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 0.7
  },

  glass: {
    name: 'Glass',
    angle: 45,
    spacing: 0.5,
    lineStyle: LineStyle.DASHED,
    lineWeight: 0.5
  },

  earth: {
    name: 'Earth',
    angle: 30,
    spacing: 0.12,
    layers: [
      { angle: 150, spacing: 0.12 }
    ],
    lineStyle: LineStyle.CONTINUOUS,
    lineWeight: 0.9
  }
};

/**
 * Material cut appearance presets
 */
export const MATERIAL_CUT_PRESETS: Record<MaterialCutStyle, IMaterialCutAppearance> = {
  [MaterialCutStyle.GENERIC]: {
    materialId: 'generic',
    cutStyle: MaterialCutStyle.GENERIC,
    fillPattern: FillPattern.HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.GENERIC],
    hatching: {
      angle: 45,
      spacing: 0.1,
      lineWeight: 1.0
    }
  },

  [MaterialCutStyle.CONCRETE]: {
    materialId: 'concrete',
    cutStyle: MaterialCutStyle.CONCRETE,
    fillPattern: FillPattern.CROSS_HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.CONCRETE],
    hatching: {
      angle: 0,
      spacing: 0.15,
      crossAngle: 90,
      lineWeight: 0.8
    }
  },

  [MaterialCutStyle.BRICK]: {
    materialId: 'brick',
    cutStyle: MaterialCutStyle.BRICK,
    fillPattern: FillPattern.CROSS_HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.BRICK],
    hatching: {
      angle: 0,
      spacing: 0.075,
      crossAngle: 90,
      lineWeight: 1.0
    }
  },

  [MaterialCutStyle.WOOD]: {
    materialId: 'wood',
    cutStyle: MaterialCutStyle.WOOD,
    fillPattern: FillPattern.HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.WOOD],
    hatching: {
      angle: 0,
      spacing: 0.05,
      lineWeight: 0.6
    }
  },

  [MaterialCutStyle.STEEL]: {
    materialId: 'steel',
    cutStyle: MaterialCutStyle.STEEL,
    fillPattern: FillPattern.CROSS_HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.STEEL],
    hatching: {
      angle: 45,
      spacing: 0.08,
      crossAngle: 135,
      lineWeight: 1.2
    }
  },

  [MaterialCutStyle.INSULATION]: {
    materialId: 'insulation',
    cutStyle: MaterialCutStyle.INSULATION,
    fillPattern: FillPattern.HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.INSULATION],
    hatching: {
      angle: 0,
      spacing: 0.2,
      lineWeight: 0.7
    }
  },

  [MaterialCutStyle.GLASS]: {
    materialId: 'glass',
    cutStyle: MaterialCutStyle.GLASS,
    fillPattern: FillPattern.HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.GLASS],
    hatching: {
      angle: 45,
      spacing: 0.5,
      lineWeight: 0.5
    }
  },

  [MaterialCutStyle.EARTH]: {
    materialId: 'earth',
    cutStyle: MaterialCutStyle.EARTH,
    fillPattern: FillPattern.CROSS_HATCH,
    fillColor: MATERIAL_FILL_COLORS[MaterialCutStyle.EARTH],
    hatching: {
      angle: 30,
      spacing: 0.12,
      crossAngle: 150,
      lineWeight: 0.9
    }
  }
};

/**
 * Line style dash patterns (in pixels)
 */
export const LINE_DASH_PATTERNS: Record<LineStyle, number[]> = {
  [LineStyle.CONTINUOUS]: [],
  [LineStyle.DASHED]: [10, 5],
  [LineStyle.DOTTED]: [2, 3],
  [LineStyle.DASH_DOT]: [10, 5, 2, 5],
  [LineStyle.HIDDEN]: [5, 5]
};

/**
 * Section plane visual helper settings
 */
export const SECTION_HELPER_CONFIG = {
  /** Plane visualization color */
  planeColor: new Color(0.2, 0.6, 1.0),
  /** Plane opacity */
  planeOpacity: 0.3,
  /** Grid enabled */
  showGrid: true,
  /** Grid color */
  gridColor: new Color(0.5, 0.5, 0.5),
  /** Grid spacing */
  gridSpacing: 1.0,
  /** Grid subdivisions */
  gridSubdivisions: 10,
  /** Handle size */
  handleSize: 0.5,
  /** Handle color */
  handleColor: new Color(1.0, 0.5, 0.0),
  /** Default plane extent */
  defaultExtent: 50.0
};

/**
 * Export default settings
 */
export const EXPORT_DEFAULTS = {
  /** Default DPI for raster export */
  dpi: 300,
  /** Default PDF paper size (A3) */
  paperSize: {
    width: 297,
    height: 420
  },
  /** Default scale */
  scale: 100, // 1:100
  /** Include hatching by default */
  includeHatching: true,
  /** Include dimensions by default */
  includeDimensions: false,
  /** Include metadata by default */
  includeMetadata: true
};

/**
 * Tolerance values for geometric operations
 */
export const SECTION_TOLERANCE = {
  /** Point-on-plane tolerance */
  planeTolerance: 1e-6,
  /** Edge intersection tolerance */
  intersectionTolerance: 1e-5,
  /** Polygon area threshold */
  minPolygonArea: 1e-8,
  /** Coincident vertex threshold */
  vertexMergeTolerance: 1e-4
};

/**
 * Get material cut appearance by material type
 * @param materialType - Material type identifier
 * @returns Material cut appearance configuration
 */
export function getMaterialCutAppearance(materialType: string): IMaterialCutAppearance {
  const cutStyle = materialType.toLowerCase() as MaterialCutStyle;
  return MATERIAL_CUT_PRESETS[cutStyle] || MATERIAL_CUT_PRESETS[MaterialCutStyle.GENERIC];
}

/**
 * Get hatching pattern by name
 * @param patternName - Pattern name
 * @returns Hatching pattern definition
 */
export function getHatchPattern(patternName: string): IHatchingPattern {
  return HATCH_PATTERNS[patternName.toLowerCase()] || HATCH_PATTERNS.simple;
}

/**
 * Get line dash pattern by style
 * @param lineStyle - Line style
 * @returns Array of dash/gap lengths
 */
export function getLineDashPattern(lineStyle: LineStyle): number[] {
  return LINE_DASH_PATTERNS[lineStyle] || [];
}
