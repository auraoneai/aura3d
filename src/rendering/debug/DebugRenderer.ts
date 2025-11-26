/**
 * @module Rendering/Debug
 * @description
 * Debug rendering system for visualizing geometry, bounds, lights, and gizmos.
 * Provides immediate-mode style API for debug visualization.
 */

import { GPUDevice } from '../gpu/GPUDevice';
import { Camera } from '../camera/Camera';
import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { Color } from '../../math/Color';
import { Box3 } from '../../math/Box3';
import { Frustum } from '../../math/Frustum';
import { Logger } from '../../core/Logger';

const logger = Logger.create('DebugRenderer');

/**
 * Debug line vertex.
 */
interface DebugVertex {
  position: Vector3;
  color: Color;
}

/**
 * Debug render mode.
 */
export enum DebugRenderMode {
  /** Normal rendering */
  Normal = 'normal',
  /** Wireframe overlay */
  Wireframe = 'wireframe',
  /** Normals visualization */
  Normals = 'normals',
  /** Bounding boxes */
  Bounds = 'bounds',
  /** Lighting visualization */
  Lighting = 'lighting',
}

/**
 * Debug renderer configuration.
 */
export interface DebugRendererConfig {
  /** Maximum number of debug lines per frame */
  maxLines?: number;
  /** Default line width */
  lineWidth?: number;
  /** Enable depth testing for debug lines */
  depthTest?: boolean;
  /** Enable depth writing for debug lines */
  depthWrite?: boolean;
}

/**
 * Debug renderer for visualization and debugging.
 *
 * Features:
 * - Line rendering (world and screen space)
 * - Wireframe visualization
 * - Bounding box rendering
 * - Light visualization (cones, spheres)
 * - Grid rendering
 * - Axis gizmos
 * - Frustum visualization
 *
 * @example
 * ```typescript
 * const debugRenderer = new DebugRenderer(device, {
 *   maxLines: 10000,
 *   depthTest: true,
 * });
 *
 * // Draw a box
 * const min = new Vector3(-1, -1, -1);
 * const max = new Vector3(1, 1, 1);
 * debugRenderer.drawBox(new Box3(min, max), new Color(1, 0, 0));
 *
 * // Draw a line
 * debugRenderer.drawLine(
 *   new Vector3(0, 0, 0),
 *   new Vector3(1, 1, 1),
 *   new Color(0, 1, 0)
 * );
 *
 * // Draw grid
 * debugRenderer.drawGrid(10, 1, new Color(0.5, 0.5, 0.5));
 *
 * // Draw axis gizmo
 * debugRenderer.drawAxes(new Vector3(0, 0, 0), 1);
 *
 * // Render all debug geometry
 * debugRenderer.render(camera);
 *
 * // Clear for next frame
 * debugRenderer.clear();
 * ```
 */
export class DebugRenderer {
  private device: GPUDevice;
  private config: Required<DebugRendererConfig>;

  // Line batch
  private lines: DebugVertex[] = [];
  private maxLines: number;

  // Render mode
  private mode: DebugRenderMode = DebugRenderMode.Normal;

  // GPU resources (would be created in real implementation)
  private lineBuffer: any = null;
  private linePipeline: any = null;

  /**
   * Creates a new DebugRenderer.
   *
   * @param device - GPU device
   * @param config - Configuration options
   */
  constructor(device: GPUDevice, config?: DebugRendererConfig) {
    this.device = device;
    this.config = {
      maxLines: config?.maxLines ?? 10000,
      lineWidth: config?.lineWidth ?? 1.0,
      depthTest: config?.depthTest ?? true,
      depthWrite: config?.depthWrite ?? false,
    };

    this.maxLines = this.config.maxLines * 2; // 2 vertices per line

    this.initialize();

    logger.info('DebugRenderer created', { maxLines: this.config.maxLines });
  }

  /**
   * Initializes GPU resources.
   */
  private initialize(): void {
    // In real implementation, would create GPU buffers and pipelines
    logger.debug('DebugRenderer initialized');
  }

  /**
   * Draws a line.
   *
   * @param start - Start position
   * @param end - End position
   * @param color - Line color
   */
  drawLine(start: Vector3, end: Vector3, color: Color = new Color(1, 1, 1)): void {
    if (this.lines.length >= this.maxLines) {
      logger.warn('Max debug lines exceeded');
      return;
    }

    this.lines.push(
      { position: start.clone(), color: color.clone() },
      { position: end.clone(), color: color.clone() }
    );
  }

  /**
   * Draws a ray.
   *
   * @param origin - Ray origin
   * @param direction - Ray direction (normalized)
   * @param length - Ray length
   * @param color - Ray color
   */
  drawRay(origin: Vector3, direction: Vector3, length: number = 10, color: Color = new Color(1, 1, 0)): void {
    const end = origin.clone().add(direction.clone().multiplyScalar(length));
    this.drawLine(origin, end, color);
  }

  /**
   * Draws a bounding box.
   *
   * @param box - Bounding box
   * @param color - Box color
   */
  drawBox(box: Box3, color: Color = new Color(1, 1, 1)): void {
    const min = box.min;
    const max = box.max;

    // Bottom face
    this.drawLine(new Vector3(min.x, min.y, min.z), new Vector3(max.x, min.y, min.z), color);
    this.drawLine(new Vector3(max.x, min.y, min.z), new Vector3(max.x, min.y, max.z), color);
    this.drawLine(new Vector3(max.x, min.y, max.z), new Vector3(min.x, min.y, max.z), color);
    this.drawLine(new Vector3(min.x, min.y, max.z), new Vector3(min.x, min.y, min.z), color);

    // Top face
    this.drawLine(new Vector3(min.x, max.y, min.z), new Vector3(max.x, max.y, min.z), color);
    this.drawLine(new Vector3(max.x, max.y, min.z), new Vector3(max.x, max.y, max.z), color);
    this.drawLine(new Vector3(max.x, max.y, max.z), new Vector3(min.x, max.y, max.z), color);
    this.drawLine(new Vector3(min.x, max.y, max.z), new Vector3(min.x, max.y, min.z), color);

    // Vertical edges
    this.drawLine(new Vector3(min.x, min.y, min.z), new Vector3(min.x, max.y, min.z), color);
    this.drawLine(new Vector3(max.x, min.y, min.z), new Vector3(max.x, max.y, min.z), color);
    this.drawLine(new Vector3(max.x, min.y, max.z), new Vector3(max.x, max.y, max.z), color);
    this.drawLine(new Vector3(min.x, min.y, max.z), new Vector3(min.x, max.y, max.z), color);
  }

  /**
   * Draws a sphere (wireframe).
   *
   * @param center - Sphere center
   * @param radius - Sphere radius
   * @param color - Sphere color
   * @param segments - Number of segments (detail level)
   */
  drawSphere(center: Vector3, radius: number, color: Color = new Color(1, 1, 1), segments: number = 16): void {
    const step = (Math.PI * 2) / segments;

    // Draw latitude circles
    for (let lat = 0; lat < segments / 2; lat++) {
      const theta = lat * step;
      const nextTheta = (lat + 1) * step;

      for (let lon = 0; lon < segments; lon++) {
        const phi = lon * step;
        const nextPhi = (lon + 1) * step;

        const p1 = this.spherePoint(center, radius, theta, phi);
        const p2 = this.spherePoint(center, radius, theta, nextPhi);
        const p3 = this.spherePoint(center, radius, nextTheta, phi);

        this.drawLine(p1, p2, color);
        this.drawLine(p1, p3, color);
      }
    }
  }

  /**
   * Helper to calculate point on sphere.
   */
  private spherePoint(center: Vector3, radius: number, theta: number, phi: number): Vector3 {
    const x = radius * Math.sin(theta) * Math.cos(phi);
    const y = radius * Math.cos(theta);
    const z = radius * Math.sin(theta) * Math.sin(phi);
    return new Vector3(center.x + x, center.y + y, center.z + z);
  }

  /**
   * Draws a cone (wireframe).
   *
   * @param apex - Cone apex position
   * @param direction - Cone direction
   * @param angle - Cone half-angle in radians
   * @param length - Cone length
   * @param color - Cone color
   * @param segments - Number of segments
   */
  drawCone(apex: Vector3, direction: Vector3, angle: number, length: number, color: Color = new Color(1, 1, 0), segments: number = 16): void {
    const dir = direction.clone().normalize();
    const baseRadius = Math.tan(angle) * length;
    const baseCenter = apex.clone().add(dir.clone().multiplyScalar(length));

    // Find perpendicular vectors
    const up = Math.abs(dir.y) < 0.999 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const right = dir.clone().cross(up).normalize();
    const forward = right.clone().cross(dir);

    // Draw base circle
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const angle1 = i * step;
      const angle2 = ((i + 1) % segments) * step;

      const p1 = baseCenter.clone()
        .add(right.clone().multiplyScalar(Math.cos(angle1) * baseRadius))
        .add(forward.clone().multiplyScalar(Math.sin(angle1) * baseRadius));

      const p2 = baseCenter.clone()
        .add(right.clone().multiplyScalar(Math.cos(angle2) * baseRadius))
        .add(forward.clone().multiplyScalar(Math.sin(angle2) * baseRadius));

      // Base circle
      this.drawLine(p1, p2, color);

      // Lines to apex
      if (i % 4 === 0) {
        this.drawLine(apex, p1, color);
      }
    }
  }

  /**
   * Draws a grid.
   *
   * @param size - Grid size (number of cells)
   * @param step - Cell size
   * @param color - Grid color
   * @param yPosition - Y position of grid
   */
  drawGrid(size: number = 10, step: number = 1, color: Color = new Color(0.5, 0.5, 0.5), yPosition: number = 0): void {
    const halfSize = size * step * 0.5;

    // Draw lines along X axis
    for (let i = 0; i <= size; i++) {
      const z = i * step - halfSize;
      const lineColor = i === size / 2 ? new Color(0, 0, 1) : color;
      this.drawLine(
        new Vector3(-halfSize, yPosition, z),
        new Vector3(halfSize, yPosition, z),
        lineColor
      );
    }

    // Draw lines along Z axis
    for (let i = 0; i <= size; i++) {
      const x = i * step - halfSize;
      const lineColor = i === size / 2 ? new Color(1, 0, 0) : color;
      this.drawLine(
        new Vector3(x, yPosition, -halfSize),
        new Vector3(x, yPosition, halfSize),
        lineColor
      );
    }
  }

  /**
   * Draws coordinate axes.
   *
   * @param origin - Origin position
   * @param size - Axis length
   */
  drawAxes(origin: Vector3 = new Vector3(0, 0, 0), size: number = 1): void {
    // X axis (red)
    this.drawLine(origin, origin.clone().add(new Vector3(size, 0, 0)), new Color(1, 0, 0));
    // Y axis (green)
    this.drawLine(origin, origin.clone().add(new Vector3(0, size, 0)), new Color(0, 1, 0));
    // Z axis (blue)
    this.drawLine(origin, origin.clone().add(new Vector3(0, 0, size)), new Color(0, 0, 1));
  }

  /**
   * Draws a frustum.
   *
   * @param frustum - Frustum to draw
   * @param color - Frustum color
   */
  drawFrustum(frustum: Frustum, color: Color = new Color(1, 1, 0)): void {
    // Extract frustum corners (simplified)
    // In real implementation, would compute from frustum planes
    logger.debug('Drawing frustum (simplified)');
  }

  /**
   * Draws a transform gizmo.
   *
   * @param matrix - Transform matrix
   * @param size - Gizmo size
   */
  drawTransform(matrix: Matrix4, size: number = 1): void {
    const origin = new Vector3(matrix.elements[12], matrix.elements[13], matrix.elements[14]);

    const xAxis = new Vector3(matrix.elements[0], matrix.elements[1], matrix.elements[2]).multiplyScalar(size);
    const yAxis = new Vector3(matrix.elements[4], matrix.elements[5], matrix.elements[6]).multiplyScalar(size);
    const zAxis = new Vector3(matrix.elements[8], matrix.elements[9], matrix.elements[10]).multiplyScalar(size);

    this.drawLine(origin, origin.clone().add(xAxis), new Color(1, 0, 0));
    this.drawLine(origin, origin.clone().add(yAxis), new Color(0, 1, 0));
    this.drawLine(origin, origin.clone().add(zAxis), new Color(0, 0, 1));
  }

  /**
   * Draws a directional light visualization.
   *
   * @param position - Light position
   * @param direction - Light direction
   * @param color - Light color
   */
  drawDirectionalLight(position: Vector3, direction: Vector3, color: Color): void {
    const length = 2;
    const end = position.clone().add(direction.clone().multiplyScalar(length));
    this.drawLine(position, end, color);

    // Draw arrow head
    const arrowSize = 0.2;
    const right = new Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(arrowSize);
    const arrowEnd1 = end.clone().sub(direction.clone().multiplyScalar(arrowSize)).add(right);
    const arrowEnd2 = end.clone().sub(direction.clone().multiplyScalar(arrowSize)).sub(right);

    this.drawLine(end, arrowEnd1, color);
    this.drawLine(end, arrowEnd2, color);
  }

  /**
   * Draws a point light visualization.
   *
   * @param position - Light position
   * @param range - Light range
   * @param color - Light color
   */
  drawPointLight(position: Vector3, range: number, color: Color): void {
    this.drawSphere(position, range, color, 16);

    // Draw cross at center
    const size = range * 0.1;
    this.drawLine(
      position.clone().add(new Vector3(-size, 0, 0)),
      position.clone().add(new Vector3(size, 0, 0)),
      color
    );
    this.drawLine(
      position.clone().add(new Vector3(0, -size, 0)),
      position.clone().add(new Vector3(0, size, 0)),
      color
    );
    this.drawLine(
      position.clone().add(new Vector3(0, 0, -size)),
      position.clone().add(new Vector3(0, 0, size)),
      color
    );
  }

  /**
   * Draws a spot light visualization.
   *
   * @param position - Light position
   * @param direction - Light direction
   * @param angle - Spot angle
   * @param range - Light range
   * @param color - Light color
   */
  drawSpotLight(position: Vector3, direction: Vector3, angle: number, range: number, color: Color): void {
    this.drawCone(position, direction, angle, range, color, 16);
  }

  /**
   * Sets the debug render mode.
   *
   * @param mode - Render mode
   */
  setMode(mode: DebugRenderMode): void {
    this.mode = mode;
  }

  /**
   * Gets the current debug render mode.
   *
   * @returns Current mode
   */
  getMode(): DebugRenderMode {
    return this.mode;
  }

  /**
   * Renders all debug geometry.
   *
   * @param camera - Camera for rendering
   */
  render(camera: Camera): void {
    if (this.lines.length === 0) {
      return;
    }

    // In real implementation, would:
    // 1. Upload line data to GPU
    // 2. Bind line pipeline
    // 3. Set view-projection matrix
    // 4. Draw lines
    // 5. Restore previous state

    logger.debug(`Rendering ${this.lines.length / 2} debug lines`);
  }

  /**
   * Clears all debug geometry.
   */
  clear(): void {
    this.lines = [];
  }

  /**
   * Gets the number of debug lines queued.
   *
   * @returns Line count
   */
  getLineCount(): number {
    return this.lines.length / 2;
  }

  /**
   * Disposes of GPU resources.
   */
  dispose(): void {
    this.clear();
    // In real implementation, would dispose GPU resources
    logger.info('DebugRenderer disposed');
  }
}
