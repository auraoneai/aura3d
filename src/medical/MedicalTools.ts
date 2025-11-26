/**
 * MedicalTools.ts - Medical Imaging Measurement and Annotation Tools
 *
 * Provides interactive measurement tools for medical image analysis including
 * distance, angle, area measurements, and ROI statistics.
 *
 * @example
 * ```typescript
 * const tools = new MedicalTools(volumeData);
 * const distance = tools.measureDistance([10, 20, 30], [40, 50, 60]);
 * const angle = tools.measureAngle([0, 0, 0], [10, 0, 0], [10, 10, 0]);
 * const stats = tools.calculateROIStats([[0,0], [10,0], [10,10], [0,10]], 50);
 * ```
 */

import { VolumeData } from './VolumeData';

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Measurement {
  type: string;
  value: number;
  unit: string;
  points: Point3D[];
  label?: string;
}

export interface ROIStatistics {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  area: number;
  pixelCount: number;
  histogram?: number[];
}

export interface Annotation {
  id: string;
  type: 'distance' | 'angle' | 'area' | 'roi' | 'text';
  points: Point3D[];
  text?: string;
  measurement?: Measurement;
  statistics?: ROIStatistics;
  visible: boolean;
  color: [number, number, number];
}

export class MedicalTools {
  private volume: VolumeData;
  private annotations: Map<string, Annotation> = new Map();

  constructor(volume: VolumeData) {
    this.volume = volume;
  }

  /**
   * Measures the distance between two 3D points.
   *
   * @param point1 - First point [x, y, z] in voxel coordinates
   * @param point2 - Second point [x, y, z] in voxel coordinates
   * @param useWorldCoordinates - If true, returns distance in world units (mm)
   * @returns Distance value
   */
  measureDistance(
    point1: [number, number, number],
    point2: [number, number, number],
    useWorldCoordinates: boolean = true
  ): number {
    if (useWorldCoordinates) {
      const spacing = this.volume.getSpacing();
      const dx = (point2[0] - point1[0]) * spacing[0];
      const dy = (point2[1] - point1[1]) * spacing[1];
      const dz = (point2[2] - point1[2]) * spacing[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } else {
      const dx = point2[0] - point1[0];
      const dy = point2[1] - point1[1];
      const dz = point2[2] - point1[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  /**
   * Measures the angle formed by three points.
   *
   * @param vertex - Vertex point [x, y, z]
   * @param point1 - First arm point [x, y, z]
   * @param point2 - Second arm point [x, y, z]
   * @returns Angle in degrees
   */
  measureAngle(
    vertex: [number, number, number],
    point1: [number, number, number],
    point2: [number, number, number]
  ): number {
    const spacing = this.volume.getSpacing();

    // Create vectors from vertex to each point
    const v1 = [
      (point1[0] - vertex[0]) * spacing[0],
      (point1[1] - vertex[1]) * spacing[1],
      (point1[2] - vertex[2]) * spacing[2]
    ];

    const v2 = [
      (point2[0] - vertex[0]) * spacing[0],
      (point2[1] - vertex[1]) * spacing[1],
      (point2[2] - vertex[2]) * spacing[2]
    ];

    // Calculate dot product and magnitudes
    const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
    const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);

    // Calculate angle
    const cosAngle = dot / (mag1 * mag2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    return (angle * 180) / Math.PI;
  }

  /**
   * Calculates the area of a polygon defined by 2D points on a slice.
   *
   * @param points - Array of 2D points defining the polygon
   * @param sliceIndex - Z-index of the slice
   * @param useWorldCoordinates - If true, returns area in world units (mm²)
   * @returns Polygon area
   */
  measureArea(
    points: [number, number][],
    sliceIndex: number,
    useWorldCoordinates: boolean = true
  ): number {
    if (points.length < 3) {
      return 0;
    }

    // Shoelace formula
    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }

    area = Math.abs(area) / 2;

    if (useWorldCoordinates) {
      const spacing = this.volume.getSpacing();
      area *= spacing[0] * spacing[1];
    }

    return area;
  }

  /**
   * Gets the Hounsfield Unit value at a specific point.
   *
   * @param point - Point [x, y, z] in voxel coordinates
   * @returns HU value
   */
  getHounsfieldUnit(point: [number, number, number]): number {
    return this.volume.getVoxel(point[0], point[1], point[2]);
  }

  /**
   * Calculates statistics for a region of interest (ROI).
   *
   * @param polygon - 2D polygon points defining the ROI
   * @param sliceIndex - Z-index of the slice
   * @param computeHistogram - If true, computes histogram
   * @returns ROI statistics
   */
  calculateROIStats(
    polygon: [number, number][],
    sliceIndex: number,
    computeHistogram: boolean = false
  ): ROIStatistics {
    // Find bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    minX = Math.floor(minX);
    maxX = Math.ceil(maxX);
    minY = Math.floor(minY);
    maxY = Math.ceil(maxY);

    // Collect values inside polygon
    const values: number[] = [];

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.isPointInPolygon([x, y], polygon)) {
          const value = this.volume.getVoxel(x, y, sliceIndex);
          values.push(value);
        }
      }
    }

    if (values.length === 0) {
      return {
        mean: 0,
        std: 0,
        min: 0,
        max: 0,
        median: 0,
        area: 0,
        pixelCount: 0
      };
    }

    // Calculate statistics
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate median
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    const area = this.measureArea(polygon, sliceIndex, true);

    let histogram: number[] | undefined;
    if (computeHistogram) {
      histogram = this.computeHistogram(values, 256);
    }

    return {
      mean,
      std,
      min,
      max,
      median,
      area,
      pixelCount: values.length,
      histogram
    };
  }

  private isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  private computeHistogram(values: number[], bins: number = 256): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const histogram = new Array(bins).fill(0);

    for (const value of values) {
      const bin = Math.min(bins - 1, Math.floor(((value - min) / range) * bins));
      histogram[bin]++;
    }

    return histogram;
  }

  /**
   * Adds an annotation to the volume.
   *
   * @param annotation - Annotation to add
   * @returns Annotation ID
   */
  addAnnotation(annotation: Omit<Annotation, 'id'>): string {
    const id = this.generateId();
    this.annotations.set(id, { ...annotation, id });
    return id;
  }

  /**
   * Creates a distance measurement annotation.
   *
   * @param point1 - First point
   * @param point2 - Second point
   * @param label - Optional label
   * @returns Annotation ID
   */
  createDistanceMeasurement(
    point1: [number, number, number],
    point2: [number, number, number],
    label?: string
  ): string {
    const distance = this.measureDistance(point1, point2);

    const measurement: Measurement = {
      type: 'distance',
      value: distance,
      unit: 'mm',
      points: [
        { x: point1[0], y: point1[1], z: point1[2] },
        { x: point2[0], y: point2[1], z: point2[2] }
      ],
      label
    };

    return this.addAnnotation({
      type: 'distance',
      points: measurement.points,
      text: label,
      measurement,
      visible: true,
      color: [1, 1, 0]
    });
  }

  /**
   * Creates an angle measurement annotation.
   *
   * @param vertex - Vertex point
   * @param point1 - First arm point
   * @param point2 - Second arm point
   * @param label - Optional label
   * @returns Annotation ID
   */
  createAngleMeasurement(
    vertex: [number, number, number],
    point1: [number, number, number],
    point2: [number, number, number],
    label?: string
  ): string {
    const angle = this.measureAngle(vertex, point1, point2);

    const measurement: Measurement = {
      type: 'angle',
      value: angle,
      unit: 'degrees',
      points: [
        { x: vertex[0], y: vertex[1], z: vertex[2] },
        { x: point1[0], y: point1[1], z: point1[2] },
        { x: point2[0], y: point2[1], z: point2[2] }
      ],
      label
    };

    return this.addAnnotation({
      type: 'angle',
      points: measurement.points,
      text: label,
      measurement,
      visible: true,
      color: [0, 1, 1]
    });
  }

  /**
   * Creates a ROI annotation with statistics.
   *
   * @param polygon - 2D polygon points
   * @param sliceIndex - Slice index
   * @param label - Optional label
   * @returns Annotation ID
   */
  createROI(
    polygon: [number, number][],
    sliceIndex: number,
    label?: string
  ): string {
    const statistics = this.calculateROIStats(polygon, sliceIndex, true);

    const points3D: Point3D[] = polygon.map(([x, y]) => ({
      x,
      y,
      z: sliceIndex
    }));

    return this.addAnnotation({
      type: 'roi',
      points: points3D,
      text: label,
      statistics,
      visible: true,
      color: [1, 0, 1]
    });
  }

  /**
   * Gets an annotation by ID.
   */
  getAnnotation(id: string): Annotation | undefined {
    return this.annotations.get(id);
  }

  /**
   * Gets all annotations.
   */
  getAllAnnotations(): Annotation[] {
    return Array.from(this.annotations.values());
  }

  /**
   * Removes an annotation.
   */
  removeAnnotation(id: string): boolean {
    return this.annotations.delete(id);
  }

  /**
   * Clears all annotations.
   */
  clearAnnotations(): void {
    this.annotations.clear();
  }

  /**
   * Exports annotations to JSON.
   */
  exportAnnotations(): string {
    return JSON.stringify(Array.from(this.annotations.values()), null, 2);
  }

  /**
   * Imports annotations from JSON.
   */
  importAnnotations(json: string): void {
    const annotations = JSON.parse(json) as Annotation[];
    for (const annotation of annotations) {
      this.annotations.set(annotation.id, annotation);
    }
  }

  private generateId(): string {
    return `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
