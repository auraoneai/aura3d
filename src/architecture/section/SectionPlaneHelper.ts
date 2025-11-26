/**
 * SectionPlaneHelper.ts
 * Visual helper for section planes with interactive manipulation
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3, Matrix4, Color, Quaternion } from '../../math';
import { SectionPlane } from './SectionPlane';
import { SECTION_HELPER_CONFIG } from './SectionConfig';
import { SceneNode, SceneNodeFlags } from '../../rendering/scene/SceneNode';
import { Mesh } from '../../rendering/geometry/Mesh';
import { VertexBuffer } from '../../rendering/geometry/VertexBuffer';
import { IndexBuffer } from '../../rendering/geometry/IndexBuffer';
import { VertexFormat } from '../../rendering/geometry/VertexFormat';
import { Transform } from '../../math/Transform';

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
export class SectionPlaneHelper extends SceneNode {
  private sectionPlane: SectionPlane;
  private extent: number;
  private showGrid: boolean;
  private handles: Map<HandleType, SceneNode>;
  private planeColor: Color;
  private planeOpacity: number;
  private gridColor: Color;
  private gridSpacing: number;
  private mesh: Mesh | null = null;

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

    // For now, create a simple P3 format mesh
    // In a full implementation, would include color data
    const format = VertexFormat.P3();
    const vertexCount = vertices.length / 7;
    const vertexBuffer = new VertexBuffer(format, vertexCount);
    const indexBuffer = new IndexBuffer(indices.length);

    // Set vertex positions
    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 7;
      vertexBuffer.setPosition(i, vertices[offset], vertices[offset + 1], vertices[offset + 2]);
    }

    // Set index data
    indexBuffer.setIndices(0, indices);

    this.mesh = new Mesh(vertexBuffer, indexBuffer);
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
    rotateXHandle.transform.rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
    this.handles.set(HandleType.ROTATE_X, rotateXHandle);

    const rotateYHandle = this.createTorusHandle(handleSize * 2, handleSize * 0.1, new Color(0, 1, 0));
    rotateYHandle.transform.rotation = Quaternion.fromEuler(Math.PI / 2, 0, 0);
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
   * @returns Sphere node
   */
  private createSphereHandle(radius: number, color: Color): SceneNode {
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

    const format = VertexFormat.P3();
    const vertexCount = (segments + 1) * (segments + 1);
    const vertexBuffer = new VertexBuffer(format, vertexCount);
    const indexBuffer = new IndexBuffer(indices.length);

    for (let i = 0; i < vertexCount; i++) {
      vertexBuffer.setPosition(i, vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
    }
    indexBuffer.setIndices(0, indices);

    const mesh = new Mesh(vertexBuffer, indexBuffer);
    const node = new SceneNode('SphereHandle');
    // In a full implementation, would attach mesh as a component
    return node;
  }

  /**
   * Create torus handle
   * @param majorRadius - Major radius
   * @param minorRadius - Minor radius
   * @param color - Handle color
   * @returns Torus node
   */
  private createTorusHandle(majorRadius: number, minorRadius: number, color: Color): SceneNode {
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

    const format = VertexFormat.P3();
    const vertexCount = (majorSegments + 1) * (minorSegments + 1);
    const vertexBuffer = new VertexBuffer(format, vertexCount);
    const indexBuffer = new IndexBuffer(indices.length);

    for (let i = 0; i < vertexCount; i++) {
      vertexBuffer.setPosition(i, vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
    }
    indexBuffer.setIndices(0, indices);

    const mesh = new Mesh(vertexBuffer, indexBuffer);
    const node = new SceneNode('TorusHandle');
    // In a full implementation, would attach mesh as a component
    return node;
  }

  /**
   * Update helper transform from section plane
   */
  public updateTransform(): void {
    const planePoint = this.sectionPlane.getPoint();
    const normal = this.sectionPlane.normal;

    // Calculate rotation from Z-up to plane normal
    const rotation = this.calculateRotationToNormal(normal);

    this.transform.position.set(planePoint.x, planePoint.y, planePoint.z);
    // Extract rotation from matrix and apply to transform
    const rotObj = rotation.getRotation();
    const rotQuat = new Quaternion(rotObj.x, rotObj.y, rotObj.z, rotObj.w);
    this.transform.rotation = rotQuat;
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
      return normal.z > 0 ? Matrix4.identity() : Matrix4.rotationX(Math.PI);
    }

    return Matrix4.rotationAxis(axis, angle);
  }

  /**
   * Update section plane from helper transform
   */
  public updateSectionPlane(): void {
    const matrix = this.transform.worldMatrix;
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
      handle.setFlag(SceneNodeFlags.Visible, show);
    }
  }

  /**
   * Get handle by type
   * @param type - Handle type
   * @returns Handle node or undefined
   */
  public getHandle(type: HandleType): SceneNode | undefined {
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
        handle.transform.scale.set(1.2, 1.2, 1.2);
      } else {
        handle.transform.scale.set(1.0, 1.0, 1.0);
      }
    }
  }

  /**
   * Dispose helper resources
   */
  public dispose(): void {
    // In a full implementation, would dispose mesh and handle resources
    this.mesh = null;
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
