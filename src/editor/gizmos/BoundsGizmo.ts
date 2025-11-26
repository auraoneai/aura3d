/**
 * @fileoverview Bounds gizmo for displaying and manipulating object bounds.
 * @module editor/gizmos/BoundsGizmo
 */

import { IGizmo, GizmoManager } from './GizmoManager';
import { Entity } from '../../ecs/Entity';
import { Transform } from '../../math/Transform';
import { Camera } from '../../rendering/camera/Camera';
import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { Ray } from '../../math/Ray';
import { Color } from '../../math/Color';

// TODO: Gizmos need access to World/ComponentManager to get components from entities
interface EntityWithTransform {
  getComponent(type: typeof Transform): Transform | undefined;
}

function hasComponentMethods(entity: Entity): entity is Entity & EntityWithTransform {
  return typeof (entity as any).getComponent === 'function';
}

// Box3 is the actual bounding box class
type Bounds = Box3;

/**
 * Bounds handle type
 */
enum BoundsHandle {
  NONE = 0,
  CENTER = 1,
  // Corners
  CORNER_PPP = 2, // Positive X, Y, Z
  CORNER_PPN = 3,
  CORNER_PNP = 4,
  CORNER_PNN = 5,
  CORNER_NPP = 6,
  CORNER_NPN = 7,
  CORNER_NNP = 8,
  CORNER_NNN = 9,
  // Edges
  EDGE_X_PP = 10, // X axis, positive Y and Z
  EDGE_X_PN = 11,
  EDGE_X_NP = 12,
  EDGE_X_NN = 13,
  EDGE_Y_PP = 14,
  EDGE_Y_PN = 15,
  EDGE_Y_NP = 16,
  EDGE_Y_NN = 17,
  EDGE_Z_PP = 18,
  EDGE_Z_PN = 19,
  EDGE_Z_NP = 20,
  EDGE_Z_NN = 21,
  // Faces
  FACE_PX = 22, // Positive X face
  FACE_NX = 23,
  FACE_PY = 24,
  FACE_NY = 25,
  FACE_PZ = 26,
  FACE_NZ = 27
}

/**
 * Bounds gizmo for displaying wireframe bounds and providing
 * handles for corner/edge/face scaling and center positioning.
 *
 * @example
 * ```typescript
 * const gizmo = new BoundsGizmo(manager);
 * gizmo.setTargets([entity]);
 * gizmo.render(camera);
 * ```
 */
export class BoundsGizmo implements IGizmo {
  private manager: GizmoManager;
  private targets: Entity[] = [];
  private isDragging: boolean = false;
  private activeHandle: BoundsHandle = BoundsHandle.NONE;
  private hoveredHandle: BoundsHandle = BoundsHandle.NONE;

  private dragStartPosition: Vector3 = new Vector3();
  private initialBounds: Bounds | null = null;
  private initialPositions: Map<Entity, Vector3> = new Map();

  private handleSize: number = 0.1;
  private wireframeThickness: number = 0.02;

  private colors = {
    wireframe: new Color(0.5, 0.5, 0.5, 0.8),
    handle: new Color(1, 1, 1, 1),
    hover: new Color(1, 1, 0, 1),
    active: new Color(1, 0.5, 0, 1)
  };

  /**
   * Creates a bounds gizmo
   * @param manager - Gizmo manager
   */
  constructor(manager: GizmoManager) {
    this.manager = manager;
  }

  /**
   * Sets the target entities
   */
  public setTargets(entities: Entity[]): void {
    this.targets = entities;
    this.isDragging = false;
    this.activeHandle = BoundsHandle.NONE;
  }

  /**
   * Renders the gizmo
   */
  public render(camera: Camera): void {
    if (this.targets.length === 0) return;

    const bounds = this.calculateBounds();
    if (!bounds) return;

    const size = this.manager.getSize();

    // Render wireframe bounds
    this.renderWireframeBounds(bounds, this.colors.wireframe);

    // Render corner handles
    this.renderCornerHandles(bounds, size, camera);

    // Render edge handles
    this.renderEdgeHandles(bounds, size, camera);

    // Render face handles
    this.renderFaceHandles(bounds, size, camera);

    // Render center handle
    this.renderCenterHandle(bounds, size, camera);
  }

  /**
   * Calculates combined bounds of all targets
   */
  private calculateBounds(): Bounds | null {
    if (this.targets.length === 0) return null;

    const points: Vector3[] = [];

    this.targets.forEach(entity => {
      if (hasComponentMethods(entity)) {
        const transform = entity.getComponent(Transform);
        if (transform) {
          // For now, just use transform position
          // In a full implementation, this would calculate actual mesh bounds
          points.push(transform.position.clone());
        }
      }
    });

    if (points.length === 0) return null;

    return Box3.fromPoints(points);
  }

  /**
   * Renders wireframe bounds box
   */
  private renderWireframeBounds(bounds: Bounds, color: Color): void {
    const min = bounds.min;
    const max = bounds.max;

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
   * Renders corner handles
   */
  private renderCornerHandles(bounds: Bounds, size: number, camera: Camera): void {
    const min = bounds.min;
    const max = bounds.max;
    const handleSize = this.handleSize * size;

    const corners = [
      { pos: new Vector3(max.x, max.y, max.z), handle: BoundsHandle.CORNER_PPP },
      { pos: new Vector3(max.x, max.y, min.z), handle: BoundsHandle.CORNER_PPN },
      { pos: new Vector3(max.x, min.y, max.z), handle: BoundsHandle.CORNER_PNP },
      { pos: new Vector3(max.x, min.y, min.z), handle: BoundsHandle.CORNER_PNN },
      { pos: new Vector3(min.x, max.y, max.z), handle: BoundsHandle.CORNER_NPP },
      { pos: new Vector3(min.x, max.y, min.z), handle: BoundsHandle.CORNER_NPN },
      { pos: new Vector3(min.x, min.y, max.z), handle: BoundsHandle.CORNER_NNP },
      { pos: new Vector3(min.x, min.y, min.z), handle: BoundsHandle.CORNER_NNN }
    ];

    corners.forEach(corner => {
      const color = this.getHandleColor(corner.handle);
      this.drawCube(corner.pos, handleSize, color);
    });
  }

  /**
   * Renders edge handles
   */
  private renderEdgeHandles(bounds: Bounds, size: number, camera: Camera): void {
    const center = bounds.center;
    const min = bounds.min;
    const max = bounds.max;
    const handleSize = this.handleSize * size * 0.8;

    // X-axis edges
    const edges = [
      { pos: new Vector3(center.x, max.y, max.z), handle: BoundsHandle.EDGE_X_PP },
      { pos: new Vector3(center.x, max.y, min.z), handle: BoundsHandle.EDGE_X_PN },
      { pos: new Vector3(center.x, min.y, max.z), handle: BoundsHandle.EDGE_X_NP },
      { pos: new Vector3(center.x, min.y, min.z), handle: BoundsHandle.EDGE_X_NN }
    ];

    edges.forEach(edge => {
      const color = this.getHandleColor(edge.handle);
      this.drawCube(edge.pos, handleSize, color);
    });
  }

  /**
   * Renders face handles
   */
  private renderFaceHandles(bounds: Bounds, size: number, camera: Camera): void {
    const center = bounds.center;
    const min = bounds.min;
    const max = bounds.max;
    const handleSize = this.handleSize * size * 0.6;

    const faces = [
      { pos: new Vector3(max.x, center.y, center.z), handle: BoundsHandle.FACE_PX },
      { pos: new Vector3(min.x, center.y, center.z), handle: BoundsHandle.FACE_NX },
      { pos: new Vector3(center.x, max.y, center.z), handle: BoundsHandle.FACE_PY },
      { pos: new Vector3(center.x, min.y, center.z), handle: BoundsHandle.FACE_NY },
      { pos: new Vector3(center.x, center.y, max.z), handle: BoundsHandle.FACE_PZ },
      { pos: new Vector3(center.x, center.y, min.z), handle: BoundsHandle.FACE_NZ }
    ];

    faces.forEach(face => {
      const color = this.getHandleColor(face.handle);
      this.drawCube(face.pos, handleSize, color);
    });
  }

  /**
   * Renders center handle
   */
  private renderCenterHandle(bounds: Bounds, size: number, camera: Camera): void {
    const handleSize = this.handleSize * size;
    const color = this.getHandleColor(BoundsHandle.CENTER);
    this.drawSphere(bounds.center, handleSize, color);
  }

  /**
   * Gets the color for a handle
   */
  private getHandleColor(handle: BoundsHandle): Color {
    if (this.activeHandle === handle) {
      return this.colors.active;
    }
    if (this.hoveredHandle === handle) {
      return this.colors.hover;
    }
    return this.colors.handle;
  }

  /**
   * Updates the gizmo
   */
  public update(deltaTime: number): void {
    // Update logic if needed
  }

  /**
   * Handles mouse down event
   */
  public onMouseDown(x: number, y: number, camera: Camera): boolean {
    const ray = this.screenToRay(x, y, camera);
    const bounds = this.calculateBounds();
    if (!bounds) return false;

    // Pick handle
    const pickedHandle = this.pickHandle(ray, bounds, camera);
    if (pickedHandle === BoundsHandle.NONE) return false;

    this.isDragging = true;
    this.activeHandle = pickedHandle;
    this.initialBounds = bounds.clone();

    // Store initial positions
    this.initialPositions.clear();
    this.targets.forEach(entity => {
      if (hasComponentMethods(entity)) {
        const transform = entity.getComponent(Transform);
        if (transform) {
          this.initialPositions.set(entity, transform.position.clone());
        }
      }
    });

    return true;
  }

  /**
   * Handles mouse move event
   */
  public onMouseMove(x: number, y: number, camera: Camera): boolean {
    const ray = this.screenToRay(x, y, camera);

    if (this.isDragging) {
      // Handle dragging logic
      return true;
    } else {
      // Update hover state
      const bounds = this.calculateBounds();
      if (bounds) {
        this.hoveredHandle = this.pickHandle(ray, bounds, camera);
      }
      return false;
    }
  }

  /**
   * Handles mouse up event
   */
  public onMouseUp(x: number, y: number, camera: Camera): boolean {
    if (this.isDragging) {
      this.isDragging = false;
      this.activeHandle = BoundsHandle.NONE;
      return true;
    }
    return false;
  }

  /**
   * Picks a bounds handle from mouse ray
   */
  private pickHandle(ray: Ray, bounds: Bounds, camera: Camera): BoundsHandle {
    const size = this.manager.getSize();
    const handleSize = this.handleSize * size;

    // Check center first
    const centerDist = ray.distanceToPoint(bounds.center);
    if (centerDist < handleSize) {
      return BoundsHandle.CENTER;
    }

    // Check corners, edges, faces...
    // Simplified implementation
    return BoundsHandle.NONE;
  }

  /**
   * Converts screen coordinates to ray
   */
  private screenToRay(x: number, y: number, camera: Camera): Ray {
    const origin = camera.transform.position.clone();
    const direction = new Vector3(x, y, -1).normalize();
    return new Ray(origin, direction);
  }

  /**
   * Drawing helpers (placeholders for rendering system)
   */
  private drawLine(start: Vector3, end: Vector3, color: Color): void {
    // Placeholder
  }

  private drawCube(center: Vector3, size: number, color: Color): void {
    // Placeholder
  }

  private drawSphere(center: Vector3, radius: number, color: Color): void {
    // Placeholder
  }

  /**
   * Checks if gizmo is active
   */
  public isActive(): boolean {
    return this.isDragging;
  }

  /**
   * Disposes the gizmo
   */
  public dispose(): void {
    this.targets = [];
    this.initialPositions.clear();
    this.initialBounds = null;
  }
}
