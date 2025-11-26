/**
 * @fileoverview Translation gizmo with XYZ axis and plane handles.
 * @module editor/gizmos/TranslateGizmo
 */

import { IGizmo, GizmoManager } from './GizmoManager';
import { Entity } from '../../ecs/Entity';
import { Transform } from '../../math/Transform';
import { Camera } from '../../rendering/camera/Camera';
import { Vector3 } from '../../math/Vector3';
import { Ray } from '../../math/Ray';
import { Plane } from '../../math/Plane';
import { Color } from '../../math/Color';

// TODO: Gizmos need access to World/ComponentManager to get components from entities
// For now, using a placeholder interface
interface EntityWithTransform {
  getComponent(type: typeof Transform): Transform | undefined;
}

// Type guard to check if entity has the component methods
function hasComponentMethods(entity: Entity): entity is Entity & EntityWithTransform {
  return typeof (entity as any).getComponent === 'function';
}

/**
 * Axis identifier
 */
enum Axis {
  NONE = 0,
  X = 1,
  Y = 2,
  Z = 3,
  XY = 4,
  XZ = 5,
  YZ = 6
}

/**
 * Translation gizmo with XYZ axis handles and XY/XZ/YZ plane handles.
 * Supports grid snapping and axis-constrained dragging.
 *
 * @example
 * ```typescript
 * const gizmo = new TranslateGizmo(manager);
 * gizmo.setTargets([entity]);
 * gizmo.render(camera);
 * ```
 */
export class TranslateGizmo implements IGizmo {
  private manager: GizmoManager;
  private targets: Entity[] = [];
  private isDragging: boolean = false;
  private activeAxis: Axis = Axis.NONE;
  private hoveredAxis: Axis = Axis.NONE;

  private dragStartPosition: Vector3 = new Vector3();
  private dragStartMouseWorld: Vector3 = new Vector3();
  private initialPositions: Map<Entity, Vector3> = new Map();

  private axisLength: number = 1.0;
  private arrowSize: number = 0.2;
  private planeSize: number = 0.25;

  private colors = {
    x: new Color(1, 0, 0, 1),
    y: new Color(0, 1, 0, 1),
    z: new Color(0, 0, 1, 1),
    xy: new Color(1, 1, 0, 0.5),
    xz: new Color(1, 0, 1, 0.5),
    yz: new Color(0, 1, 1, 0.5),
    hover: new Color(1, 1, 0, 1)
  };

  /**
   * Creates a translation gizmo
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
    this.activeAxis = Axis.NONE;
  }

  /**
   * Renders the gizmo
   */
  public render(camera: Camera): void {
    if (this.targets.length === 0) return;

    const pivot = this.manager.getPivotPoint();
    if (!pivot) return;

    const orientation = this.manager.getOrientation();
    const size = this.manager.getSize() * this.calculateScreenSpaceSize(pivot, camera);

    // Calculate axis directions in world space
    const xAxis = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const yAxis = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const zAxis = new Vector3(0, 0, 1).applyQuaternion(orientation);

    // Render axes
    this.renderAxis(pivot, xAxis, size, this.colors.x, Axis.X);
    this.renderAxis(pivot, yAxis, size, this.colors.y, Axis.Y);
    this.renderAxis(pivot, zAxis, size, this.colors.z, Axis.Z);

    // Render plane handles
    this.renderPlaneHandle(pivot, xAxis, yAxis, size, this.colors.xy, Axis.XY);
    this.renderPlaneHandle(pivot, xAxis, zAxis, size, this.colors.xz, Axis.XZ);
    this.renderPlaneHandle(pivot, yAxis, zAxis, size, this.colors.yz, Axis.YZ);
  }

  /**
   * Renders a single axis handle
   */
  private renderAxis(origin: Vector3, direction: Vector3, size: number, color: Color, axis: Axis): void {
    const isHovered = this.hoveredAxis === axis;
    const isActive = this.activeAxis === axis;
    const finalColor = (isHovered || isActive) ? this.colors.hover : color;

    const end = origin.clone().add(direction.clone().multiplyScalar(this.axisLength * size));

    // Render line
    this.drawLine(origin, end, finalColor);

    // Render arrow head
    const arrowBase = end.clone().sub(direction.clone().multiplyScalar(this.arrowSize * size));
    this.drawCone(arrowBase, end, this.arrowSize * size * 0.1, finalColor);
  }

  /**
   * Renders a plane handle
   */
  private renderPlaneHandle(
    origin: Vector3,
    axis1: Vector3,
    axis2: Vector3,
    size: number,
    color: Color,
    plane: Axis
  ): void {
    const isHovered = this.hoveredAxis === plane;
    const isActive = this.activeAxis === plane;
    const finalColor = (isHovered || isActive) ? this.colors.hover : color;

    const offset1 = axis1.clone().multiplyScalar(this.planeSize * size);
    const offset2 = axis2.clone().multiplyScalar(this.planeSize * size);

    const p0 = origin.clone().add(offset1);
    const p1 = origin.clone().add(offset1).add(offset2);
    const p2 = origin.clone().add(offset2);

    // Render quad
    this.drawQuad(origin, p0, p1, p2, finalColor);
  }

  /**
   * Calculates screen-space size for gizmo
   */
  private calculateScreenSpaceSize(position: Vector3, camera: Camera): number {
    const distance = camera.transform.position.distanceTo(position);
    return distance * 0.1; // Scale based on distance
  }

  /**
   * Updates the gizmo
   */
  public update(deltaTime: number): void {
    // Gizmo update logic if needed
  }

  /**
   * Handles mouse down event
   */
  public onMouseDown(x: number, y: number, camera: Camera): boolean {
    const ray = this.screenToRay(x, y, camera);
    const pivot = this.manager.getPivotPoint();
    if (!pivot) return false;

    // Pick axis/plane
    const pickedAxis = this.pickAxis(ray, pivot, camera);
    if (pickedAxis === Axis.NONE) return false;

    this.isDragging = true;
    this.activeAxis = pickedAxis;
    this.dragStartPosition = pivot.clone();

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

    // Calculate drag start in world space
    this.dragStartMouseWorld = this.projectOntoAxis(ray, pivot, this.activeAxis);

    return true;
  }

  /**
   * Handles mouse move event
   */
  public onMouseMove(x: number, y: number, camera: Camera): boolean {
    const ray = this.screenToRay(x, y, camera);

    if (this.isDragging) {
      const pivot = this.manager.getPivotPoint();
      if (!pivot) return false;

      // Calculate new position
      const currentWorld = this.projectOntoAxis(ray, pivot, this.activeAxis);
      let delta = currentWorld.clone().sub(this.dragStartMouseWorld);

      // Apply snapping
      if (this.manager.isSnapEnabled()) {
        delta.x = this.manager.snapPosition(delta.x);
        delta.y = this.manager.snapPosition(delta.y);
        delta.z = this.manager.snapPosition(delta.z);
      }

      // Apply translation to all targets
      this.targets.forEach(entity => {
        if (hasComponentMethods(entity)) {
          const transform = entity.getComponent(Transform);
          const initialPos = this.initialPositions.get(entity);
          if (transform && initialPos) {
            transform.position.copy(initialPos).add(delta);
            // Transform is automatically marked dirty when position is modified
          }
        }
      });

      return true;
    } else {
      // Update hover state
      const pivot = this.manager.getPivotPoint();
      if (pivot) {
        this.hoveredAxis = this.pickAxis(ray, pivot, camera);
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
      this.activeAxis = Axis.NONE;
      return true;
    }
    return false;
  }

  /**
   * Picks an axis from mouse ray
   */
  private pickAxis(ray: Ray, pivot: Vector3, camera: Camera): Axis {
    const orientation = this.manager.getOrientation();
    const size = this.manager.getSize() * this.calculateScreenSpaceSize(pivot, camera);

    const xAxis = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const yAxis = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const zAxis = new Vector3(0, 0, 1).applyQuaternion(orientation);

    const threshold = 0.1 * size;

    // Check plane handles first (larger hit area)
    if (this.rayIntersectsPlane(ray, pivot, xAxis, yAxis, size, threshold)) {
      return Axis.XY;
    }
    if (this.rayIntersectsPlane(ray, pivot, xAxis, zAxis, size, threshold)) {
      return Axis.XZ;
    }
    if (this.rayIntersectsPlane(ray, pivot, yAxis, zAxis, size, threshold)) {
      return Axis.YZ;
    }

    // Check axis handles
    if (this.rayIntersectsAxis(ray, pivot, xAxis, size, threshold)) {
      return Axis.X;
    }
    if (this.rayIntersectsAxis(ray, pivot, yAxis, size, threshold)) {
      return Axis.Y;
    }
    if (this.rayIntersectsAxis(ray, pivot, zAxis, size, threshold)) {
      return Axis.Z;
    }

    return Axis.NONE;
  }

  /**
   * Checks if ray intersects an axis
   */
  private rayIntersectsAxis(ray: Ray, pivot: Vector3, axis: Vector3, size: number, threshold: number): boolean {
    const axisEnd = pivot.clone().add(axis.clone().scale(this.axisLength * size));
    const distance = this.rayDistanceToSegment(ray, pivot, axisEnd);
    return distance < threshold;
  }

  /**
   * Calculates the distance from a ray to a line segment
   */
  private rayDistanceToSegment(ray: Ray, segmentStart: Vector3, segmentEnd: Vector3): number {
    const segmentDir = segmentEnd.sub(segmentStart);
    const segmentLength = segmentDir.length();

    if (segmentLength < 0.0001) {
      return ray.distanceToPoint(segmentStart);
    }

    const segmentDirNorm = segmentDir.scale(1 / segmentLength);
    const rayToSegmentStart = segmentStart.sub(ray.origin);

    const rayDotSegment = ray.direction.dot(segmentDirNorm);
    const denom = 1 - rayDotSegment * rayDotSegment;

    if (Math.abs(denom) < 0.0001) {
      // Ray and segment are parallel
      return ray.distanceToPoint(segmentStart);
    }

    const rayParam = (rayToSegmentStart.dot(ray.direction) - rayToSegmentStart.dot(segmentDirNorm) * rayDotSegment) / denom;
    const segmentParam = (rayToSegmentStart.dot(segmentDirNorm) - rayToSegmentStart.dot(ray.direction) * rayDotSegment) / denom;

    const clampedRayParam = Math.max(0, rayParam);
    const clampedSegmentParam = Math.max(0, Math.min(segmentLength, segmentParam));

    const rayPoint = ray.at(clampedRayParam);
    const segmentPoint = segmentStart.add(segmentDirNorm.scale(clampedSegmentParam));

    return rayPoint.distanceTo(segmentPoint);
  }

  /**
   * Checks if ray intersects a plane handle
   */
  private rayIntersectsPlane(
    ray: Ray,
    pivot: Vector3,
    axis1: Vector3,
    axis2: Vector3,
    size: number,
    threshold: number
  ): boolean {
    const normal = axis1.cross(axis2).normalize();
    const constant = -normal.dot(pivot);
    const plane = new Plane(normal, constant);
    const intersectionResult = ray.intersectPlane(plane);
    const intersection = intersectionResult ? intersectionResult.point : null;

    if (!intersection) return false;

    // Check if within plane bounds
    const localPos = intersection.sub(pivot);
    const dot1 = localPos.dot(axis1);
    const dot2 = localPos.dot(axis2);

    const planeSize = this.planeSize * size;
    return dot1 >= 0 && dot1 <= planeSize && dot2 >= 0 && dot2 <= planeSize;
  }

  /**
   * Projects ray onto active axis/plane
   */
  private projectOntoAxis(ray: Ray, pivot: Vector3, axis: Axis): Vector3 {
    const orientation = this.manager.getOrientation();
    const xAxis = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const yAxis = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const zAxis = new Vector3(0, 0, 1).applyQuaternion(orientation);

    let planeNormal: Vector3;

    switch (axis) {
      case Axis.X:
        planeNormal = yAxis;
        break;
      case Axis.Y:
        planeNormal = xAxis;
        break;
      case Axis.Z:
        planeNormal = yAxis;
        break;
      case Axis.XY:
        planeNormal = zAxis;
        break;
      case Axis.XZ:
        planeNormal = yAxis;
        break;
      case Axis.YZ:
        planeNormal = xAxis;
        break;
      default:
        return pivot.clone();
    }

    const constant = -planeNormal.dot(pivot);
    const plane = new Plane(planeNormal, constant);
    const result = ray.intersectPlane(plane);
    return result ? result.point : pivot.clone();
  }

  /**
   * Converts screen coordinates to ray
   */
  private screenToRay(x: number, y: number, camera: Camera): Ray {
    // This would use the camera's projection matrix
    // Simplified implementation
    const origin = camera.transform.position.clone();
    const direction = new Vector3(x, y, -1).normalize();
    return new Ray(origin, direction);
  }

  /**
   * Draws a line (placeholder for rendering system)
   */
  private drawLine(start: Vector3, end: Vector3, color: Color): void {
    // This would call into the rendering system
    // For now, this is a placeholder
  }

  /**
   * Draws a cone (placeholder for rendering system)
   */
  private drawCone(base: Vector3, tip: Vector3, radius: number, color: Color): void {
    // This would call into the rendering system
  }

  /**
   * Draws a quad (placeholder for rendering system)
   */
  private drawQuad(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, color: Color): void {
    // This would call into the rendering system
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
  }
}
