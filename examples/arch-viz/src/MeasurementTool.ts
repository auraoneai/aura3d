/**
 * G3D Architectural Visualization - Measurement Tools
 * Precise measurement and dimensioning for architectural review
 */

import { Vector3 } from 'g3d';

export type MeasurementType = 'distance' | 'area' | 'angle' | 'height';

export interface Measurement {
  id: string;
  type: MeasurementType;
  points: Vector3[];
  value: number;
  unit: string;
  label: string;
  color: string;
}

/**
 * Professional measurement tools for architectural visualization
 */
export class MeasurementTool {
  private measurements: Map<string, Measurement> = new Map();
  private activeMeasurement: Measurement | null = null;
  private measurementCounter: number = 0;

  // Measurement settings
  private snapEnabled: boolean = true;
  private snapDistance: number = 0.1; // 10cm snap tolerance
  private unit: 'metric' | 'imperial' = 'metric';
  private precision: number = 2; // Decimal places

  // Snap points (for snapping to geometry)
  private snapPoints: Vector3[] = [];

  constructor() {
    this.initializeCommonSnapPoints();
  }

  /**
   * Initialize common snap points in the scene
   */
  private initializeCommonSnapPoints(): void {
    // Floor corners
    this.snapPoints.push(new Vector3(-6, 0, -6));
    this.snapPoints.push(new Vector3(6, 0, -6));
    this.snapPoints.push(new Vector3(6, 0, 6));
    this.snapPoints.push(new Vector3(-6, 0, 6));

    // Ceiling corners
    this.snapPoints.push(new Vector3(-6, 3, -6));
    this.snapPoints.push(new Vector3(6, 3, -6));
    this.snapPoints.push(new Vector3(6, 3, 6));
    this.snapPoints.push(new Vector3(-6, 3, 6));

    // Wall midpoints
    this.snapPoints.push(new Vector3(0, 0, -6));
    this.snapPoints.push(new Vector3(0, 0, 6));
    this.snapPoints.push(new Vector3(-6, 0, 0));
    this.snapPoints.push(new Vector3(6, 0, 0));

    // Door positions
    this.snapPoints.push(new Vector3(-3, 0, -6));
    this.snapPoints.push(new Vector3(-3, 2.1, -6));

    // Window positions
    this.snapPoints.push(new Vector3(3, 1, 6));
    this.snapPoints.push(new Vector3(3, 2.5, 6));
  }

  /**
   * Start a new measurement
   */
  startMeasurement(type: MeasurementType): void {
    const id = `measurement_${this.measurementCounter++}`;
    this.activeMeasurement = {
      id,
      type,
      points: [],
      value: 0,
      unit: this.getUnitString(),
      label: '',
      color: '#00ff00',
    };
  }

  /**
   * Add point to active measurement
   */
  addPoint(worldPosition: Vector3): boolean {
    if (!this.activeMeasurement) return false;

    // Snap to nearby geometry if enabled
    const point = this.snapEnabled ?
      this.snapToNearestPoint(worldPosition) : worldPosition.clone();

    this.activeMeasurement.points.push(point);

    // Calculate measurement based on type
    this.updateMeasurementValue();

    // Check if measurement is complete
    return this.isMeasurementComplete();
  }

  /**
   * Snap to nearest geometry point
   */
  private snapToNearestPoint(position: Vector3): Vector3 {
    let nearestPoint = position.clone();
    let nearestDistance = this.snapDistance;

    for (const snapPoint of this.snapPoints) {
      const distance = position.distanceTo(snapPoint);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoint = snapPoint.clone();
      }
    }

    return nearestPoint;
  }

  /**
   * Check if current measurement is complete
   */
  private isMeasurementComplete(): boolean {
    if (!this.activeMeasurement) return false;

    const pointCount = this.activeMeasurement.points.length;

    switch (this.activeMeasurement.type) {
      case 'distance':
        return pointCount >= 2;
      case 'area':
        return pointCount >= 3;
      case 'angle':
        return pointCount >= 3;
      case 'height':
        return pointCount >= 2;
      default:
        return false;
    }
  }

  /**
   * Update measurement value based on points
   */
  private updateMeasurementValue(): void {
    if (!this.activeMeasurement) return;

    const points = this.activeMeasurement.points;

    switch (this.activeMeasurement.type) {
      case 'distance':
        if (points.length >= 2) {
          this.activeMeasurement.value = this.calculateDistance(points[0], points[1]);
          this.activeMeasurement.label = this.formatDistance(this.activeMeasurement.value);
        }
        break;

      case 'area':
        if (points.length >= 3) {
          this.activeMeasurement.value = this.calculateArea(points);
          this.activeMeasurement.label = this.formatArea(this.activeMeasurement.value);
        }
        break;

      case 'angle':
        if (points.length >= 3) {
          this.activeMeasurement.value = this.calculateAngle(points[0], points[1], points[2]);
          this.activeMeasurement.label = this.formatAngle(this.activeMeasurement.value);
        }
        break;

      case 'height':
        if (points.length >= 2) {
          this.activeMeasurement.value = Math.abs(points[1].y - points[0].y);
          this.activeMeasurement.label = this.formatDistance(this.activeMeasurement.value);
        }
        break;
    }
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(p1: Vector3, p2: Vector3): number {
    return p1.distanceTo(p2);
  }

  /**
   * Calculate area of polygon defined by points
   */
  private calculateArea(points: Vector3[]): number {
    if (points.length < 3) return 0;

    // Project to 2D plane for area calculation
    let area = 0;

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];

      // Using shoelace formula in XZ plane
      area += (current.x * next.z - next.x * current.z);
    }

    return Math.abs(area) / 2;
  }

  /**
   * Calculate angle between three points
   */
  private calculateAngle(p1: Vector3, vertex: Vector3, p2: Vector3): number {
    const v1 = p1.clone().sub(vertex).normalize();
    const v2 = p2.clone().sub(vertex).normalize();

    const dot = v1.dot(v2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    return (angle * 180) / Math.PI; // Convert to degrees
  }

  /**
   * Format distance for display
   */
  private formatDistance(meters: number): string {
    if (this.unit === 'metric') {
      if (meters < 1) {
        return `${(meters * 100).toFixed(this.precision)} cm`;
      } else {
        return `${meters.toFixed(this.precision)} m`;
      }
    } else {
      const feet = meters * 3.28084;
      const inches = (feet % 1) * 12;
      const wholeFeet = Math.floor(feet);

      if (wholeFeet === 0) {
        return `${inches.toFixed(this.precision)}"`;
      } else {
        return `${wholeFeet}' ${inches.toFixed(this.precision)}"`;
      }
    }
  }

  /**
   * Format area for display
   */
  private formatArea(squareMeters: number): string {
    if (this.unit === 'metric') {
      return `${squareMeters.toFixed(this.precision)} m²`;
    } else {
      const squareFeet = squareMeters * 10.7639;
      return `${squareFeet.toFixed(this.precision)} ft²`;
    }
  }

  /**
   * Format angle for display
   */
  private formatAngle(degrees: number): string {
    return `${degrees.toFixed(this.precision)}°`;
  }

  /**
   * Get unit string
   */
  private getUnitString(): string {
    return this.unit === 'metric' ? 'm' : 'ft';
  }

  /**
   * Finish current measurement
   */
  finishMeasurement(): void {
    if (this.activeMeasurement && this.isMeasurementComplete()) {
      this.measurements.set(this.activeMeasurement.id, this.activeMeasurement);
      this.activeMeasurement = null;
    }
  }

  /**
   * Cancel current measurement
   */
  cancelMeasurement(): void {
    this.activeMeasurement = null;
  }

  /**
   * Delete measurement by ID
   */
  deleteMeasurement(id: string): boolean {
    return this.measurements.delete(id);
  }

  /**
   * Clear all measurements
   */
  clearAllMeasurements(): void {
    this.measurements.clear();
    this.activeMeasurement = null;
  }

  /**
   * Toggle snap mode
   */
  toggleSnap(enabled?: boolean): void {
    this.snapEnabled = enabled ?? !this.snapEnabled;
  }

  /**
   * Set measurement unit
   */
  setUnit(unit: 'metric' | 'imperial'): void {
    this.unit = unit;

    // Update all existing measurements
    for (const measurement of this.measurements.values()) {
      measurement.unit = this.getUnitString();
      this.updateMeasurementLabel(measurement);
    }
  }

  /**
   * Update measurement label after unit change
   */
  private updateMeasurementLabel(measurement: Measurement): void {
    switch (measurement.type) {
      case 'distance':
      case 'height':
        measurement.label = this.formatDistance(measurement.value);
        break;
      case 'area':
        measurement.label = this.formatArea(measurement.value);
        break;
      case 'angle':
        measurement.label = this.formatAngle(measurement.value);
        break;
    }
  }

  /**
   * Set precision (decimal places)
   */
  setPrecision(precision: number): void {
    this.precision = Math.max(0, Math.min(4, precision));

    // Update all existing measurements
    for (const measurement of this.measurements.values()) {
      this.updateMeasurementLabel(measurement);
    }
  }

  /**
   * Add custom snap point
   */
  addSnapPoint(point: Vector3): void {
    this.snapPoints.push(point.clone());
  }

  /**
   * Get all measurements
   */
  getMeasurements(): Measurement[] {
    return Array.from(this.measurements.values());
  }

  /**
   * Get active measurement
   */
  getActiveMeasurement(): Measurement | null {
    return this.activeMeasurement;
  }

  /**
   * Get measurement by ID
   */
  getMeasurement(id: string): Measurement | undefined {
    return this.measurements.get(id);
  }

  /**
   * Export measurements as JSON
   */
  exportMeasurements(): string {
    const exportData = {
      unit: this.unit,
      precision: this.precision,
      measurements: Array.from(this.measurements.values()).map(m => ({
        type: m.type,
        points: m.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
        value: m.value,
        label: m.label,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Get measurement statistics
   */
  getStatistics() {
    const stats = {
      totalMeasurements: this.measurements.size,
      byType: {
        distance: 0,
        area: 0,
        angle: 0,
        height: 0,
      },
      totalDistance: 0,
      totalArea: 0,
    };

    for (const measurement of this.measurements.values()) {
      stats.byType[measurement.type]++;

      if (measurement.type === 'distance' || measurement.type === 'height') {
        stats.totalDistance += measurement.value;
      } else if (measurement.type === 'area') {
        stats.totalArea += measurement.value;
      }
    }

    return stats;
  }
}
