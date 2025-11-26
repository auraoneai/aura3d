/**
 * SectionTypes.ts
 * Type definitions for architectural section planes and rendering
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3, Matrix4, Color } from '../../math';
import { Material } from '../../materials';

/**
 * Fill pattern types for section cuts
 */
export enum FillPattern {
  /** Solid color fill */
  SOLID = 'solid',
  /** Parallel line hatching */
  HATCH = 'hatch',
  /** Stipple/dot pattern */
  STIPPLE = 'stipple',
  /** Cross-hatching */
  CROSS_HATCH = 'cross_hatch',
  /** No fill */
  NONE = 'none'
}

/**
 * Line style for section edges and hatching
 */
export enum LineStyle {
  /** Solid continuous line */
  CONTINUOUS = 'continuous',
  /** Dashed line pattern */
  DASHED = 'dashed',
  /** Dotted line pattern */
  DOTTED = 'dotted',
  /** Dash-dot pattern */
  DASH_DOT = 'dash_dot',
  /** Hidden line (lighter, dashed) */
  HIDDEN = 'hidden'
}

/**
 * Material representation in section cuts
 */
export enum MaterialCutStyle {
  /** Generic fill */
  GENERIC = 'generic',
  /** Concrete hatching */
  CONCRETE = 'concrete',
  /** Brick pattern */
  BRICK = 'brick',
  /** Wood grain */
  WOOD = 'wood',
  /** Steel cross-hatch */
  STEEL = 'steel',
  /** Insulation wavy pattern */
  INSULATION = 'insulation',
  /** Glass diagonal lines */
  GLASS = 'glass',
  /** Earth/soil pattern */
  EARTH = 'earth'
}

/**
 * Export format options for sections
 */
export enum SectionExportFormat {
  /** Scalable Vector Graphics */
  SVG = 'svg',
  /** Drawing Exchange Format */
  DXF = 'dxf',
  /** Portable Document Format */
  PDF = 'pdf',
  /** Raster image */
  PNG = 'png'
}

/**
 * Point classification relative to plane
 */
export enum PointClassification {
  /** Point is in front of plane */
  FRONT = 1,
  /** Point is on the plane */
  ON = 0,
  /** Point is behind the plane */
  BACK = -1
}

/**
 * Section plane definition
 */
export interface ISectionPlane {
  /** Plane normal vector (unit length) */
  normal: Vector3;
  /** Signed distance from origin along normal */
  distance: number;
  /** Is this section plane enabled */
  enabled: boolean;
  /** Optional name for the section */
  name?: string;
}

/**
 * Section display configuration
 */
export interface ISectionDisplayConfig {
  /** Fill pattern for cut surfaces */
  fillPattern: FillPattern;
  /** Fill color */
  fillColor: Color;
  /** Fill opacity (0-1) */
  fillOpacity: number;
  /** Edge line style */
  lineStyle: LineStyle;
  /** Edge line color */
  lineColor: Color;
  /** Edge line width in pixels */
  lineWidth: number;
  /** Show hatching */
  showHatching: boolean;
  /** Hatching scale factor */
  hatchingScale: number;
  /** Hatching angle in degrees */
  hatchingAngle: number;
  /** Show section cap (close open edges) */
  showCap: boolean;
}

/**
 * Material-specific section appearance
 */
export interface IMaterialCutAppearance {
  /** Material identifier */
  materialId: string;
  /** Cut style */
  cutStyle: MaterialCutStyle;
  /** Custom fill pattern */
  fillPattern: FillPattern;
  /** Fill color */
  fillColor: Color;
  /** Hatching configuration */
  hatching?: {
    /** Primary hatching angle */
    angle: number;
    /** Line spacing in world units */
    spacing: number;
    /** Secondary angle for cross-hatching */
    crossAngle?: number;
    /** Line weight */
    lineWeight: number;
  };
}

/**
 * Section cut geometry data
 */
export interface ISectionCutGeometry {
  /** 2D polygon vertices (in section plane coordinates) */
  vertices: Vector3[];
  /** Edge indices */
  edges: [number, number][];
  /** Holes (inner polygons) */
  holes?: Vector3[][];
  /** Material at this cut */
  material?: Material;
  /** Source object identifier */
  objectId?: string;
}

/**
 * Hatching pattern definition
 */
export interface IHatchingPattern {
  /** Pattern name */
  name: string;
  /** Base angle in degrees */
  angle: number;
  /** Line spacing in world units */
  spacing: number;
  /** Additional hatching layers */
  layers?: {
    angle: number;
    spacing: number;
  }[];
  /** Line style */
  lineStyle: LineStyle;
  /** Line weight multiplier */
  lineWeight: number;
}

/**
 * Section animation keyframe
 */
export interface ISectionKeyframe {
  /** Time in seconds */
  time: number;
  /** Plane normal */
  normal: Vector3;
  /** Plane distance */
  distance: number;
  /** Display configuration */
  display?: Partial<ISectionDisplayConfig>;
}

/**
 * BIM metadata for section elements
 */
export interface IBIMMetadata {
  /** IFC entity type */
  ifcType?: string;
  /** IFC global ID */
  ifcGlobalId?: string;
  /** Element name */
  name?: string;
  /** Property sets */
  propertySets?: Map<string, Map<string, any>>;
  /** Material information */
  materials?: string[];
  /** Space/zone assignment */
  space?: string;
  /** Level/story */
  level?: string;
  /** Custom properties */
  [key: string]: any;
}

/**
 * Section export options
 */
export interface ISectionExportOptions {
  /** Output format */
  format: SectionExportFormat;
  /** Include hatching */
  includeHatching: boolean;
  /** Include dimensions */
  includeDimensions: boolean;
  /** Include metadata */
  includeMetadata: boolean;
  /** Paper size for PDF/print */
  paperSize?: {
    width: number;
    height: number;
  };
  /** Scale factor (1:100, 1:50, etc.) */
  scale?: number;
  /** DPI for raster export */
  dpi?: number;
}

/**
 * Clipping plane uniform data for shaders
 */
export interface IClippingPlaneUniform {
  /** Plane equation coefficients [A, B, C, D] */
  plane: Float32Array;
  /** Enable flag */
  enabled: number;
}

/**
 * Section plane intersection result
 */
export interface ISectionIntersection {
  /** Intersection point */
  point: Vector3;
  /** Distance along ray */
  distance: number;
  /** Is intersection valid */
  valid: boolean;
}

/**
 * Section plane bounds
 */
export interface ISectionBounds {
  /** Minimum extent in plane coordinates */
  min: Vector3;
  /** Maximum extent in plane coordinates */
  max: Vector3;
  /** Center point */
  center: Vector3;
  /** Size */
  size: Vector3;
}

/**
 * Section analysis results
 */
export interface ISectionAnalysis {
  /** Total cut area */
  totalArea: number;
  /** Area by material */
  areaByMaterial: Map<string, number>;
  /** Perimeter length */
  perimeter: number;
  /** Number of cut objects */
  objectCount: number;
  /** Centroid of cut geometry */
  centroid: Vector3;
}
