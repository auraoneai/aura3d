/**
 * @fileoverview Rotation gizmo with XYZ rotation rings and angle snapping.
 * @module editor/gizmos/RotateGizmo
 */

import { IGizmo, GizmoManager } from './GizmoManager';
import { Entity } from '../../ecs/Entity';
import { Transform } from '../../math/Transform';
import { Camera } from '../../rendering/camera/Camera';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Ray } from '../../math/Ray';
import { Plane } from '../../math/Plane';
import { Color } from '../../math/Color';

// TODO: Gizmos need access to World/ComponentManager to get components from entities
interface EntityWithTransform {
  getComponent(type: typeof Transform): Transform | undefined;
}

function hasComponentMethods(entity: Entity): entity is Entity & EntityWithTransform {
  return typeof (entity as any).getComponent === 'function';
}

/**
 * Rotation axis identifier
 */
enum RotationAxis {
  NONE = 0,
  X = 1,
  Y = 2,
  Z = 3,
  FREE = 4
}

/**
 * Rotation gizmo with XYZ rotation rings, free rotation sphere,
 * and angle snapping with visual feedback.
 *
 * @example
 * ```typescript
 * const gizmo = new RotateGizmo(manager);
 * gizmo.setTargets([entity]);
 * gizmo.render(camera);
 * ```
 */
export class RotateGizmo implements IGizmo {
  private manager: GizmoManager;
  private targets: Entity[] = [];
  private isDragging: boolean = false;
  private activeAxis: RotationAxis = RotationAxis.NONE;
  private hoveredAxis: RotationAxis = RotationAxis.NONE;

  private dragStartAngle: number = 0;
  private currentAngle: number = 0;
  private initialRotations: Map<Entity, Quaternion> = new Map();

  private ringRadius: number = 1.0;
  private ringThickness: number = 0.05;
  private ringSegments: number = 64;

  private colors = {
    x: new Color(1, 0, 0, 0.8),
    y: new Color(0, 1, 0, 0.8),
    z: new Color(0, 0, 1, 0.8),
    free: new Color(0.7, 0.7, 0.7, 0.5),
    hover: new Color(1, 1, 0, 1),
    active: new Color(1, 0.5, 0, 1)
  };

  /**
   * Creates a rotation gizmo
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
    this.activeAxis = RotationAxis.NONE;
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

    // Calculate axis directions
    const xAxis = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const yAxis = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const zAxis = new Vector3(0, 0, 1).applyQuaternion(orientation);

    // Render rotation rings
    this.renderRing(pivot, xAxis, size, this.colors.x, RotationAxis.X);
    this.renderRing(pivot, yAxis, size, this.colors.y, RotationAxis.Y);
    this.renderRing(pivot, zAxis, size, this.colors.z, RotationAxis.Z);

    // Render free rotation sphere
    this.renderFreeSphere(pivot, size, this.colors.free, RotationAxis.FREE);

    // Render angle display when dragging
    if (this.isDragging) {
      this.renderAngleDisplay(pivot, camera);
    }
  }

  /**
   * Renders a rotation ring
   */
  private renderRing(center: Vector3, normal: Vector3, size: number, color: Color, axis: RotationAxis): void {
    const isHovered = this.hoveredAxis === axis;
    const isActive = this.activeAxis === axis;
    const finalColor = isActive ? this.colors.active : (isHovered ? this.colors.hover : color);

    const radius = this.ringRadius * size;
    const thickness = this.ringThickness * size;

    // Calculate tangent and bitangent for the ring plane
    const tangent = new Vector3(1, 0, 0);
    if (Math.abs(normal.dot(tangent)) > 0.9) {
      tangent.set(0, 1, 0);
    }
    const crossResult = normal.cross(tangent).normalize();
    tangent.copy(crossResult);
    const bitangent = normal.cross(tangent).normalize();

    // Draw ring as series of line segments
    const points: Vector3[] = [];
    for (let i = 0; i <= this.ringSegments; i++) {
      const angle = (i / this.ringSegments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const point = center.clone()
        .add(tangent.clone().multiplyScalar(cos * radius))
        .add(bitangent.clone().multiplyScalar(sin * radius));

      points.push(point);
    }

    this.drawPolyline(points, finalColor, thickness);

    // Draw rotation arc when active
    if (isActive && this.isDragging) {
      this.renderRotationArc(center, normal, tangent, bitangent, radius, this.dragStartAngle, this.currentAngle);
    }
  }

  /**
   * Renders free rotation sphere
   */
  private renderFreeSphere(center: Vector3, size: number, color: Color, axis: RotationAxis): void {
    const isHovered = this.hoveredAxis === axis;
    const isActive = this.activeAxis === axis;

    if (!isHovered && !isActive) return;

    const finalColor = isActive ? this.colors.active : this.colors.hover;
    const radius = this.ringRadius * size * 1.2;

    this.drawWireSphere(center, radius, finalColor);
  }

  /**
   * Renders rotation arc showing current rotation
   */
  private renderRotationArc(
    center: Vector3,
    normal: Vector3,
    tangent: Vector3,
    bitangent: Vector3,
    radius: number,
    startAngle: number,
    endAngle: number
  ): void {
    const arcColor = new Color(1, 1, 0, 1);
    const segments = 32;
    const angleDiff = endAngle - startAngle;

    const points: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + angleDiff * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const point = center.clone()
        .add(tangent.clone().multiplyScalar(cos * radius))
        .add(bitangent.clone().multiplyScalar(sin * radius));

      points.push(point);
    }

    this.drawPolyline(points, arcColor, 0.02);
  }

  /**
   * Renders angle display text
   */
  private renderAngleDisplay(pivot: Vector3, camera: Camera): void {
    const degrees = ((this.currentAngle - this.dragStartAngle) * 180 / Math.PI).toFixed(1);
    const text = `${degrees}°`;

    // This would render text in screen space near the pivot
    // Placeholder for actual text rendering
  }

  /**
   * Calculates screen-space size for gizmo
   */
  private calculateScreenSpaceSize(position: Vector3, camera: Camera): number {
    const distance = camera.transform.position.distanceTo(position);
    return distance * 0.1;
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
    const pivot = this.manager.getPivotPoint();
    if (!pivot) return false;

    // Pick rotation axis
    const pickedAxis = this.pickAxis(ray, pivot, camera);
    if (pickedAxis === RotationAxis.NONE) return false;

    this.isDragging = true;
    this.activeAxis = pickedAxis;

    // Store initial rotations
    this.initialRotations.clear();
    this.targets.forEach(entity => {
      if (hasComponentMethods(entity)) {
        const transform = entity.getComponent(Transform);
        if (transform) {
          this.initialRotations.set(entity, transform.rotation.clone());
        }
      }
    });

    // Calculate start angle
    const orientation = this.manager.getOrientation();
    const normal = this.getAxisNormal(this.activeAxis, orientation);
    const constant = -normal.dot(pivot);
    const plane = new Plane(normal, constant);
    const intersectionResult = ray.intersectPlane(plane);

    if (intersectionResult) {
      const localPos = intersectionResult.point.sub(pivot);
      this.dragStartAngle = Math.atan2(localPos.y, localPos.x);
      this.currentAngle = this.dragStartAngle;
    }

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

      // Calculate current angle
      const orientation = this.manager.getOrientation();
      const normal = this.getAxisNormal(this.activeAxis, orientation);
      const constant = -normal.dot(pivot);
      const plane = new Plane(normal, constant);
      const intersectionResult = ray.intersectPlane(plane);

      if (intersectionResult) {
        const localPos = intersectionResult.point.sub(pivot);
        this.currentAngle = Math.atan2(localPos.y, localPos.x);

        let angleDelta = this.currentAngle - this.dragStartAngle;

        // Apply snapping
        if (this.manager.isSnapEnabled()) {
          angleDelta = this.manager.snapRotation(angleDelta);
        }

        // Create rotation quaternion
        const rotationQuat = new Quaternion().setFromAxisAngle(normal, angleDelta);

        // Apply rotation to all targets
        this.targets.forEach(entity => {
          if (hasComponentMethods(entity)) {
            const transform = entity.getComponent(Transform);
            const initialRotation = this.initialRotations.get(entity);

            if (transform && initialRotation) {
              transform.rotation.copy(initialRotation).multiply(rotationQuat);
              transform.markDirty();
            }
          }
        });
      }

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
      this.activeAxis = RotationAxis.NONE;
      return true;
    }
    return false;
  }

  /**
   * Picks a rotation axis from mouse ray
   */
  private pickAxis(ray: Ray, pivot: Vector3, camera: Camera): RotationAxis {
    const orientation = this.manager.getOrientation();
    const size = this.manager.getSize() * this.calculateScreenSpaceSize(pivot, camera);
    const radius = this.ringRadius * size;
    const threshold = this.ringThickness * size * 2;

    // Check each ring
    const xNormal = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const yNormal = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const zNormal = new Vector3(0, 0, 1).applyQuaternion(orientation);

    if (this.rayIntersectsRing(ray, pivot, xNormal, radius, threshold)) {
      return RotationAxis.X;
    }
    if (this.rayIntersectsRing(ray, pivot, yNormal, radius, threshold)) {
      return RotationAxis.Y;
    }
    if (this.rayIntersectsRing(ray, pivot, zNormal, radius, threshold)) {
      return RotationAxis.Z;
    }

    // Check free rotation sphere
    const freeRadius = radius * 1.2;
    if (this.rayIntersectsSphere(ray, pivot, freeRadius, threshold)) {
      return RotationAxis.FREE;
    }

    return RotationAxis.NONE;
  }

  /**
   * Checks if ray intersects a rotation ring
   */
  private rayIntersectsRing(ray: Ray, center: Vector3, normal: Vector3, radius: number, threshold: number): boolean {
    const constant = -normal.dot(center);
    const plane = new Plane(normal, constant);
    const intersectionResult = ray.intersectPlane(plane);

    if (!intersectionResult) return false;

    const distance = intersectionResult.point.distanceTo(center);
    return Math.abs(distance - radius) < threshold;
  }

  /**
   * Checks if ray intersects sphere
   */
  private rayIntersectsSphere(ray: Ray, center: Vector3, radius: number, threshold: number): boolean {
    const closest = ray.closestPointToPoint(center);
    const distance = closest.distanceTo(center);
    return Math.abs(distance - radius) < threshold;
  }

  /**
   * Gets the normal vector for a rotation axis
   */
  private getAxisNormal(axis: RotationAxis, orientation: Quaternion): Vector3 {
    switch (axis) {
      case RotationAxis.X:
        return new Vector3(1, 0, 0).applyQuaternion(orientation);
      case RotationAxis.Y:
        return new Vector3(0, 1, 0).applyQuaternion(orientation);
      case RotationAxis.Z:
        return new Vector3(0, 0, 1).applyQuaternion(orientation);
      default:
        return new Vector3(0, 1, 0);
    }
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
  private drawPolyline(points: Vector3[], color: Color, thickness: number): void {
    // Placeholder for rendering system
  }

  private drawWireSphere(center: Vector3, radius: number, color: Color): void {
    // Placeholder for rendering system
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
    this.initialRotations.clear();
  }
}
