/**
 * SectionPlaneHelper.ts
 * Visual helper for section planes with interactive manipulation
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3, Matrix4, Color } from '../../math';
import { Mesh, BufferGeometry, Material } from '../../core';
import { SectionPlane } from './SectionPlane';
import { SECTION_HELPER_CONFIG } from './SectionConfig';

/**
 * Handle types for section plane manipulation
 */
export enum HandleType {
  TRANSLATE = 'translate',
  ROTATE_X = 'rotate_x',
  ROTATE_Y = 'rotate_y',
  ROTATE_Z = 'rotate_z',
  SCALE = 'scale'
}

/**
 * Visual helper for section planes
 * Displays plane, grid, and interactive manipulation handles
 *
 * @example
 * ```typescript
 * const section = new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 10
 * });
 *
 * const helper = new SectionPlaneHelper(section, {
 *   extent: 50,
 *   showGrid: true
 * });
 *
 * scene.add(helper);
 * ```
 */
export class SectionPlaneHelper extends Mesh {
  private sectionPlane: SectionPlane;
  private extent: number;
  private showGrid: boolean;
  private handles: Map<HandleType, Mesh>;
  private planeColor: Color;
  private planeOpacity: number;
  private gridColor: Color;
  private gridSpacing: number;

  /**
   * Create a new section plane helper
   * @param sectionPlane - Section plane to visualize
   * @param options - Helper options
   */
  constructor(
    sectionPlane: SectionPlane,
    options: {
      extent?: number;
      showGrid?: boolean;
      planeColor?: Color;
      planeOpacity?: number;
      gridColor?: Color;
      gridSpacing?: number;
    } = {}
  ) {
    super();

    this.sectionPlane = sectionPlane;
    this.extent = options.extent ?? SECTION_HELPER_CONFIG.defaultExtent;
    this.showGrid = options.showGrid ?? SECTION_HELPER_CONFIG.showGrid;
    this.planeColor = options.planeColor ?? SECTION_HELPER_CONFIG.planeColor;
    this.planeOpacity = options.planeOpacity ?? SECTION_HELPER_CONFIG.planeOpacity;
    this.gridColor = options.gridColor ?? SECTION_HELPER_CONFIG.gridColor;
    this.gridSpacing = options.gridSpacing ?? SECTION_HELPER_CONFIG.gridSpacing;
    this.handles = new Map();

    this.buildGeometry();
    this.buildHandles();
    this.updateTransform();
  }

  /**
   * Build plane and grid geometry
   */
  private buildGeometry(): void {
    const geometry = new BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];

    const halfExtent = this.extent / 2;

    // Plane quad
    const planeVertices = [
      -halfExtent, -halfExtent, 0,
      halfExtent, -halfExtent, 0,
      halfExtent, halfExtent, 0,
      -halfExtent, halfExtent, 0
    ];

    const planeIndices = [0, 1, 2, 0, 2, 3];

    for (let i = 0; i < planeVertices.length; i += 3) {
      vertices.push(planeVertices[i], planeVertices[i + 1], planeVertices[i + 2]);
      colors.push(this.planeColor.r, this.planeColor.g, this.planeColor.b, this.planeOpacity);
    }

    for (const index of planeIndices) {
      indices.push(index);
    }

    // Grid lines
    if (this.showGrid) {
      const gridLines = this.generateGridLines(halfExtent);
      const vertexOffset = vertices.length / 3;

      for (const line of gridLines) {
        vertices.push(line.start.x, line.start.y, line.start.z);
        colors.push(this.gridColor.r, this.gridColor.g, this.gridColor.b, 1.0);

        vertices.push(line.end.x, line.end.y, line.end.z);
        colors.push(this.gridColor.r, this.gridColor.g, this.gridColor.b, 1.0);
      }

      // Grid line indices (sequential pairs)
      for (let i = 0; i < gridLines.length * 2; i += 2) {
        indices.push(vertexOffset + i, vertexOffset + i + 1);
      }
    }

    geometry.setAttribute('position', new Float32Array(vertices), 3);
    geometry.setAttribute('color', new Float32Array(colors), 4);
    geometry.setIndices(new Uint32Array(indices));

    this.geometry = geometry;
  }

  /**
   * Generate grid line segments
   * @param halfExtent - Half of plane extent
   * @returns Array of line segments
   */
  private generateGridLines(halfExtent: number): Array<{ start: Vector3; end: Vector3 }> {
    const lines: Array<{ start: Vector3; end: Vector3 }> = [];
    const divisions = Math.floor((this.extent / this.gridSpacing) / 2) * 2; // Ensure even number
    const step = this.extent / divisions;

    // Horizontal lines
    for (let i = -divisions / 2; i <= divisions / 2; i++) {
      const y = i * step;
      lines.push({
        start: new Vector3(-halfExtent, y, 0),
        end: new Vector3(halfExtent, y, 0)
      });
    }

    // Vertical lines
    for (let i = -divisions / 2; i <= divisions / 2; i++) {
      const x = i * step;
      lines.push({
        start: new Vector3(x, -halfExtent, 0),
        end: new Vector3(x, halfExtent, 0)
      });
    }

    return lines;
  }

  /**
   * Build manipulation handles
   */
  private buildHandles(): void {
    const handleSize = SECTION_HELPER_CONFIG.handleSize;
    const handleColor = SECTION_HELPER_CONFIG.handleColor;

    // Translation handle (sphere at center)
    const translateHandle = this.createSphereHandle(handleSize, handleColor);
    this.handles.set(HandleType.TRANSLATE, translateHandle);

    // Rotation handles (tori around axes)
    const rotateXHandle = this.createTorusHandle(handleSize * 2, handleSize * 0.1, new Color(1, 0, 0));
    rotateXHandle.transform.setRotation(0, Math.PI / 2, 0);
    this.handles.set(HandleType.ROTATE_X, rotateXHandle);

    const rotateYHandle = this.createTorusHandle(handleSize * 2, handleSize * 0.1, new Color(0, 1, 0));
    rotateYHandle.transform.setRotation(Math.PI / 2, 0, 0);
    this.handles.set(HandleType.ROTATE_Y, rotateYHandle);

    const rotateZHandle = this.createTorusHandle(handleSize * 2, handleSize * 0.1, new Color(0, 0, 1));
    this.handles.set(HandleType.ROTATE_Z, rotateZHandle);

    // Add handles as children
    for (const handle of this.handles.values()) {
      this.addChild(handle);
    }
  }

  /**
   * Create sphere handle
   * @param radius - Sphere radius
   * @param color - Handle color
   * @returns Sphere mesh
   */
  private createSphereHandle(radius: number, color: Color): Mesh {
    const geometry = new BufferGeometry();
    const segments = 16;
    const vertices: number[] = [];
    const indices: number[] = [];

    // Simple UV sphere generation
    for (let lat = 0; lat <= segments; lat++) {
      const theta = (lat * Math.PI) / segments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= segments; lon++) {
        const phi = (lon * 2 * Math.PI) / segments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = radius * cosPhi * sinTheta;
        const y = radius * cosTheta;
        const z = radius * sinPhi * sinTheta;

        vertices.push(x, y, z);
      }
    }

    // Generate indices
    for (let lat = 0; lat < segments; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const first = lat * (segments + 1) + lon;
        const second = first + segments + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    geometry.setAttribute('position', new Float32Array(vertices), 3);
    geometry.setIndices(new Uint32Array(indices));

    const mesh = new Mesh();
    mesh.geometry = geometry;
    return mesh;
  }

  /**
   * Create torus handle
   * @param majorRadius - Major radius
   * @param minorRadius - Minor radius
   * @param color - Handle color
   * @returns Torus mesh
   */
  private createTorusHandle(majorRadius: number, minorRadius: number, color: Color): Mesh {
    const geometry = new BufferGeometry();
    const majorSegments = 32;
    const minorSegments = 16;
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= majorSegments; i++) {
      const u = (i / majorSegments) * Math.PI * 2;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);

      for (let j = 0; j <= minorSegments; j++) {
        const v = (j / minorSegments) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);

        const x = (majorRadius + minorRadius * cosV) * cosU;
        const y = (majorRadius + minorRadius * cosV) * sinU;
        const z = minorRadius * sinV;

        vertices.push(x, y, z);
      }
    }

    for (let i = 0; i < majorSegments; i++) {
      for (let j = 0; j < minorSegments; j++) {
        const first = i * (minorSegments + 1) + j;
        const second = first + minorSegments + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    geometry.setAttribute('position', new Float32Array(vertices), 3);
    geometry.setIndices(new Uint32Array(indices));

    const mesh = new Mesh();
    mesh.geometry = geometry;
    return mesh;
  }

  /**
   * Update helper transform from section plane
   */
  public updateTransform(): void {
    const planePoint = this.sectionPlane.getPoint();
    const normal = this.sectionPlane.normal;

    // Calculate rotation from Z-up to plane normal
    const rotation = this.calculateRotationToNormal(normal);

    this.transform.setPosition(planePoint.x, planePoint.y, planePoint.z);
    this.transform.setRotationFromMatrix(rotation);
  }

  /**
   * Calculate rotation matrix to align Z axis with normal
   * @param normal - Target normal
   * @returns Rotation matrix
   */
  private calculateRotationToNormal(normal: Vector3): Matrix4 {
    const up = new Vector3(0, 0, 1);
    const axis = up.cross(normal).normalize();
    const angle = Math.acos(up.dot(normal));

    if (axis.length() < 1e-6) {
      // Normal is parallel to up
      return normal.z > 0 ? Matrix4.identity() : Matrix4.createRotationX(Math.PI);
    }

    return Matrix4.createRotationAxis(axis, angle);
  }

  /**
   * Update section plane from helper transform
   */
  public updateSectionPlane(): void {
    const matrix = this.transform.getWorldMatrix();
    const normal = matrix.transformVector(new Vector3(0, 0, 1)).normalize();
    const point = matrix.transformPoint(new Vector3(0, 0, 0));

    this.sectionPlane.setFromNormalAndPoint(normal, point);
  }

  /**
   * Set extent of visualization
   * @param extent - New extent
   */
  public setExtent(extent: number): void {
    this.extent = extent;
    this.buildGeometry();
  }

  /**
   * Show/hide grid
   * @param show - Show grid
   */
  public setShowGrid(show: boolean): void {
    this.showGrid = show;
    this.buildGeometry();
  }

  /**
   * Show/hide handles
   * @param show - Show handles
   */
  public setShowHandles(show: boolean): void {
    for (const handle of this.handles.values()) {
      handle.visible = show;
    }
  }

  /**
   * Get handle by type
   * @param type - Handle type
   * @returns Handle mesh or undefined
   */
  public getHandle(type: HandleType): Mesh | undefined {
    return this.handles.get(type);
  }

  /**
   * Highlight handle
   * @param type - Handle type to highlight
   */
  public highlightHandle(type: HandleType | null): void {
    for (const [handleType, handle] of this.handles) {
      // In a real implementation, would modify material/color
      // For now, just scale the highlighted handle
      if (handleType === type) {
        handle.transform.setScale(1.2, 1.2, 1.2);
      } else {
        handle.transform.setScale(1.0, 1.0, 1.0);
      }
    }
  }

  /**
   * Dispose helper resources
   */
  public dispose(): void {
    this.geometry?.dispose();
    for (const handle of this.handles.values()) {
      handle.geometry?.dispose();
    }
    this.handles.clear();
  }

  /**
   * Get section plane
   * @returns Section plane
   */
  public getSectionPlane(): SectionPlane {
    return this.sectionPlane;
  }

  /**
   * Set section plane
   * @param plane - New section plane
   */
  public setSectionPlane(plane: SectionPlane): void {
    this.sectionPlane = plane;
    this.updateTransform();
  }
}
