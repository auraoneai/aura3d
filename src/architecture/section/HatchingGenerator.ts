/**
 * HatchingGenerator.ts
 * Generate hatching patterns for section fills
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3, Vector2 } from '../../math';
import { Mesh } from '../../rendering/geometry/Mesh';
import { VertexBuffer } from '../../rendering/geometry/VertexBuffer';
import { IndexBuffer } from '../../rendering/geometry/IndexBuffer';
import { VertexFormat, VertexAttributeType, VertexAttributeSemantic } from '../../rendering/geometry/VertexFormat';
import { PrimitiveTopology, IndexType } from '../../rendering/geometry/IndexBuffer';
import { ISectionCutGeometry, IHatchingPattern, LineStyle } from './SectionTypes';
import { HATCH_PATTERNS, getHatchPattern } from './SectionConfig';

/**
 * Line segment for hatching
 */
interface HatchLine {
  start: Vector2;
  end: Vector2;
  lineStyle: LineStyle;
  weight: number;
}

/**
 * Hatching pattern generator
 * Creates scale-independent hatching for section cuts
 *
 * @example
 * ```typescript
 * const generator = new HatchingGenerator();
 *
 * // Create pattern
 * const pattern = generator.createPattern('brick', {
 *   scale: 0.1,
 *   angle: 45
 * });
 *
 * // Generate hatching for section
 * const lines = generator.generateHatching(sectionGeometry, pattern);
 *
 * // Create renderable geometry
 * const geometry = generator.createHatchingGeometry(lines);
 * ```
 */
export class HatchingGenerator {
  /**
   * Create a new hatching generator
   */
  constructor() {}

  /**
   * Create hatching pattern
   * @param patternName - Pattern name (brick, concrete, wood, etc.)
   * @param options - Pattern options
   * @returns Hatching pattern
   */
  public createPattern(
    patternName: string,
    options: {
      scale?: number;
      angle?: number;
      lineWeight?: number;
    } = {}
  ): IHatchingPattern {
    const basePattern = getHatchPattern(patternName);

    return {
      ...basePattern,
      angle: options.angle ?? basePattern.angle,
      spacing: basePattern.spacing * (options.scale ?? 1.0),
      lineWeight: options.lineWeight ?? basePattern.lineWeight,
      layers: basePattern.layers?.map(layer => ({
        angle: layer.angle,
        spacing: layer.spacing * (options.scale ?? 1.0)
      }))
    };
  }

  /**
   * Generate hatching lines for section geometry
   * @param section - Section cut geometry
   * @param pattern - Hatching pattern
   * @returns Array of hatch lines
   */
  public generateHatching(
    section: ISectionCutGeometry,
    pattern: IHatchingPattern
  ): HatchLine[] {
    const lines: HatchLine[] = [];

    // Generate primary hatching
    const primaryLines = this.generateParallelHatching(
      section,
      pattern.angle,
      pattern.spacing,
      pattern.lineStyle,
      pattern.lineWeight
    );
    lines.push(...primaryLines);

    // Generate additional layers (cross-hatching, etc.)
    if (pattern.layers) {
      for (const layer of pattern.layers) {
        const layerLines = this.generateParallelHatching(
          section,
          layer.angle,
          layer.spacing,
          pattern.lineStyle,
          pattern.lineWeight
        );
        lines.push(...layerLines);
      }
    }

    return lines;
  }

  /**
   * Generate parallel hatching lines
   * @param section - Section geometry
   * @param angle - Hatching angle in degrees
   * @param spacing - Line spacing
   * @param lineStyle - Line style
   * @param weight - Line weight
   * @returns Array of hatch lines
   */
  private generateParallelHatching(
    section: ISectionCutGeometry,
    angle: number,
    spacing: number,
    lineStyle: LineStyle,
    weight: number
  ): HatchLine[] {
    const lines: HatchLine[] = [];

    if (section.vertices.length < 3) return lines;

    // Convert angle to radians
    const angleRad = (angle * Math.PI) / 180;

    // Calculate hatching direction
    const direction = new Vector2(Math.cos(angleRad), Math.sin(angleRad));
    const perpendicular = new Vector2(-direction.y, direction.x);

    // Get 2D polygon bounds
    const polygon2D = section.vertices.map(v => new Vector2(v.x, v.y));
    const bounds = this.calculatePolygonBounds(polygon2D);

    // Calculate diagonal length for hatching extent
    const diagonal = Math.sqrt(
      Math.pow(bounds.max.x - bounds.min.x, 2) +
      Math.pow(bounds.max.y - bounds.min.y, 2)
    );

    // Generate hatching lines across bounds
    const numLines = Math.ceil(diagonal / spacing);
    const start = bounds.center.clone().subtract(perpendicular.clone().scale(diagonal / 2));

    for (let i = 0; i <= numLines; i++) {
      const offset = i * spacing;
      const lineStart = start.clone().add(perpendicular.clone().scale(offset));
      const lineEnd = lineStart.clone().add(direction.clone().scale(diagonal));

      // Clip line to polygon
      const clipped = this.clipLineToPolygon(lineStart, lineEnd, polygon2D);

      for (const segment of clipped) {
        lines.push({
          start: segment.start,
          end: segment.end,
          lineStyle,
          weight
        });
      }
    }

    return lines;
  }

  /**
   * Calculate 2D polygon bounds
   * @param polygon - Polygon vertices
   * @returns Bounds
   */
  private calculatePolygonBounds(polygon: Vector2[]): {
    min: Vector2;
    max: Vector2;
    center: Vector2;
  } {
    const min = polygon[0].clone();
    const max = polygon[0].clone();

    for (let i = 1; i < polygon.length; i++) {
      min.x = Math.min(min.x, polygon[i].x);
      min.y = Math.min(min.y, polygon[i].y);
      max.x = Math.max(max.x, polygon[i].x);
      max.y = Math.max(max.y, polygon[i].y);
    }

    const center = new Vector2(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2
    );

    return { min, max, center };
  }

  /**
   * Clip line segment to polygon using Sutherland-Hodgman algorithm
   * @param lineStart - Line start point
   * @param lineEnd - Line end point
   * @param polygon - Clipping polygon
   * @returns Array of clipped line segments
   */
  private clipLineToPolygon(
    lineStart: Vector2,
    lineEnd: Vector2,
    polygon: Vector2[]
  ): Array<{ start: Vector2; end: Vector2 }> {
    const intersections: Vector2[] = [];

    // Find all polygon edge intersections
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      const intersection = this.lineIntersection(lineStart, lineEnd, p1, p2);
      if (intersection) {
        intersections.push(intersection);
      }
    }

    // No intersections - line either fully inside or outside
    if (intersections.length === 0) {
      if (this.pointInPolygon(lineStart, polygon)) {
        return [{ start: lineStart, end: lineEnd }];
      }
      return [];
    }

    // Sort intersections along line direction
    const direction = lineEnd.clone().subtract(lineStart);
    intersections.sort((a, b) => {
      const ta = a.clone().subtract(lineStart).dot(direction);
      const tb = b.clone().subtract(lineStart).dot(direction);
      return ta - tb;
    });

    // Build clipped segments
    const segments: Array<{ start: Vector2; end: Vector2 }> = [];

    for (let i = 0; i < intersections.length - 1; i += 2) {
      segments.push({
        start: intersections[i],
        end: intersections[i + 1]
      });
    }

    return segments;
  }

  /**
   * Calculate line-line intersection
   * @param p1 - First line start
   * @param p2 - First line end
   * @param p3 - Second line start
   * @param p4 - Second line end
   * @returns Intersection point or null
   */
  private lineIntersection(
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    p4: Vector2
  ): Vector2 | null {
    const d1 = p2.clone().subtract(p1);
    const d2 = p4.clone().subtract(p3);

    const cross = d1.x * d2.y - d1.y * d2.x;

    if (Math.abs(cross) < 1e-10) {
      return null; // Parallel lines
    }

    const t1 = ((p3.x - p1.x) * d2.y - (p3.y - p1.y) * d2.x) / cross;
    const t2 = ((p3.x - p1.x) * d1.y - (p3.y - p1.y) * d1.x) / cross;

    if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
      return new Vector2(
        p1.x + t1 * d1.x,
        p1.y + t1 * d1.y
      );
    }

    return null;
  }

  /**
   * Test if point is inside polygon
   * @param point - Point to test
   * @param polygon - Polygon vertices
   * @returns True if inside
   */
  private pointInPolygon(point: Vector2, polygon: Vector2[]): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Create renderable geometry from hatch lines
   * @param lines - Hatch lines
   * @returns Mesh geometry
   */
  public createHatchingGeometry(lines: HatchLine[]): Mesh {
    const vertices: number[] = [];
    const indices: number[] = [];
    const lineWeights: number[] = [];

    let vertexIndex = 0;

    for (const line of lines) {
      vertices.push(line.start.x, line.start.y, 0);
      vertices.push(line.end.x, line.end.y, 0);

      lineWeights.push(line.weight, line.weight);

      indices.push(vertexIndex, vertexIndex + 1);
      vertexIndex += 2;
    }

    // Create vertex format (stride is calculated automatically, 16 bytes = 3 floats + 1 float)
    const format = new VertexFormat([
      { semantic: VertexAttributeSemantic.Position, type: VertexAttributeType.Float3, offset: 0 },
      { semantic: VertexAttributeSemantic.Custom0, type: VertexAttributeType.Float, offset: 12 }
    ]);

    // Interleave vertex data
    const interleavedData: number[] = [];
    for (let i = 0; i < vertices.length / 3; i++) {
      interleavedData.push(
        vertices[i * 3],
        vertices[i * 3 + 1],
        vertices[i * 3 + 2],
        lineWeights[i]
      );
    }

    // Create buffers
    const vertexCount = vertices.length / 3;
    const vertexBuffer = new VertexBuffer(format, vertexCount);
    const data = vertexBuffer.data;
    for (let i = 0; i < interleavedData.length; i++) {
      data[i] = interleavedData[i];
    }

    const indexBuffer = IndexBuffer.fromArray(indices, IndexType.UInt32, PrimitiveTopology.LineList);

    return new Mesh(vertexBuffer, indexBuffer, 'HatchingGeometry');
  }

  /**
   * Export hatching to SVG path data
   * @param lines - Hatch lines
   * @returns SVG path data string
   */
  public exportToSVG(lines: HatchLine[]): string {
    let pathData = '';

    for (const line of lines) {
      pathData += `M ${line.start.x} ${line.start.y} L ${line.end.x} ${line.end.y} `;
    }

    return pathData.trim();
  }

  /**
   * Get all available pattern names
   * @returns Array of pattern names
   */
  public getAvailablePatterns(): string[] {
    return Object.keys(HATCH_PATTERNS);
  }

  /**
   * Get pattern definition
   * @param patternName - Pattern name
   * @returns Pattern definition
   */
  public getPattern(patternName: string): IHatchingPattern | undefined {
    return HATCH_PATTERNS[patternName];
  }
}
