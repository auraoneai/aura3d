/**
 * @fileoverview Scale gizmo with XYZ scale handles and uniform scaling.
 * @module editor/gizmos/ScaleGizmo
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
interface EntityWithTransform {
  getComponent(type: typeof Transform): Transform | undefined;
}

function hasComponentMethods(entity: Entity): entity is Entity & EntityWithTransform {
  return typeof (entity as any).getComponent === 'function';
}

/**
 * Scale axis identifier
 */
enum ScaleAxis {
  NONE = 0,
  X = 1,
  Y = 2,
  Z = 3,
  UNIFORM = 4
}

/**
 * Scale gizmo with XYZ scale handles, uniform scale center handle,
 * and proportional scaling option.
 *
 * @example
 * ```typescript
 * const gizmo = new ScaleGizmo(manager);
 * gizmo.setTargets([entity]);
 * gizmo.render(camera);
 * ```
 */
export class ScaleGizmo implements IGizmo {
  private manager: GizmoManager;
  private targets: Entity[] = [];
  private isDragging: boolean = false;
  private activeAxis: ScaleAxis = ScaleAxis.NONE;
  private hoveredAxis: ScaleAxis = ScaleAxis.NONE;

  private dragStartPosition: Vector3 = new Vector3();
  private dragStartScale: number = 1.0;
  private initialScales: Map<Entity, Vector3> = new Map();

  private axisLength: number = 1.0;
  private cubeSize: number = 0.15;
  private centerCubeSize: number = 0.2;

  private colors = {
    x: new Color(1, 0, 0, 1),
    y: new Color(0, 1, 0, 1),
    z: new Color(0, 0, 1, 1),
    uniform: new Color(1, 1, 1, 1),
    hover: new Color(1, 1, 0, 1)
  };

  /**
   * Creates a scale gizmo
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
    this.activeAxis = ScaleAxis.NONE;
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

    // Render scale axes
    this.renderScaleAxis(pivot, xAxis, size, this.colors.x, ScaleAxis.X);
    this.renderScaleAxis(pivot, yAxis, size, this.colors.y, ScaleAxis.Y);
    this.renderScaleAxis(pivot, zAxis, size, this.colors.z, ScaleAxis.Z);

    // Render uniform scale handle (center cube)
    this.renderUniformHandle(pivot, size, this.colors.uniform, ScaleAxis.UNIFORM);
  }

  /**
   * Renders a single scale axis
   */
  private renderScaleAxis(origin: Vector3, direction: Vector3, size: number, color: Color, axis: ScaleAxis): void {
    const isHovered = this.hoveredAxis === axis;
    const isActive = this.activeAxis === axis;
    const finalColor = (isHovered || isActive) ? this.colors.hover : color;

    const end = origin.clone().add(direction.clone().multiplyScalar(this.axisLength * size));

    // Render line
    this.drawLine(origin, end, finalColor);

    // Render cube handle at end
    const cubeSize = this.cubeSize * size;
    this.drawCube(end, cubeSize, finalColor);

    // Show scale factor if active
    if (isActive && this.isDragging) {
      const scaleFactor = this.calculateCurrentScaleFactor();
      this.renderScaleFactor(end, scaleFactor);
    }
  }

  /**
   * Renders the uniform scale handle
   */
  private renderUniformHandle(origin: Vector3, size: number, color: Color, axis: ScaleAxis): void {
    const isHovered = this.hoveredAxis === axis;
    const isActive = this.activeAxis === axis;
    const finalColor = (isHovered || isActive) ? this.colors.hover : color;

    const cubeSize = this.centerCubeSize * size;
    this.drawCube(origin, cubeSize, finalColor);

    // Show scale factor if active
    if (isActive && this.isDragging) {
      const scaleFactor = this.calculateCurrentScaleFactor();
      this.renderScaleFactor(origin, scaleFactor);
    }
  }

  /**
   * Renders scale factor display
   */
  private renderScaleFactor(position: Vector3, factor: number): void {
    const text = `${factor.toFixed(2)}x`;
    // Placeholder for text rendering
  }

  /**
   * Calculates current scale factor during drag
   */
  private calculateCurrentScaleFactor(): number {
    // This would be calculated during mouse move
    return this.dragStartScale;
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

    // Pick axis
    const pickedAxis = this.pickAxis(ray, pivot, camera);
    if (pickedAxis === ScaleAxis.NONE) return false;

    this.isDragging = true;
    this.activeAxis = pickedAxis;
    this.dragStartPosition = pivot.clone();
    this.dragStartScale = 1.0;

    // Store initial scales
    this.initialScales.clear();
    this.targets.forEach(entity => {
      if (hasComponentMethods(entity)) {
        const transform = entity.getComponent(Transform);
        if (transform) {
          this.initialScales.set(entity, transform.scale.clone());
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
      const pivot = this.manager.getPivotPoint();
      if (!pivot) return false;

      // Calculate scale factor based on mouse movement
      const scaleFactor = this.calculateScaleFactor(ray, pivot);

      // Apply snapping
      let finalScale = scaleFactor;
      if (this.manager.isSnapEnabled()) {
        finalScale = this.manager.snapScale(scaleFactor);
      }

      this.dragStartScale = finalScale;

      // Apply scale to all targets
      this.applyScale(finalScale);

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
      this.activeAxis = ScaleAxis.NONE;
      return true;
    }
    return false;
  }

  /**
   * Calculates scale factor from mouse movement
   */
  private calculateScaleFactor(ray: Ray, pivot: Vector3): number {
    const orientation = this.manager.getOrientation();
    const cameraPos = ray.origin;
    const toPivot = pivot.clone().sub(cameraPos);
    const distance = toPivot.length();

    // Project ray onto appropriate plane
    const normalizedDir = toPivot.normalize();
    const constant = -normalizedDir.dot(pivot);
    const plane = new Plane(normalizedDir, constant);
    const intersectionResult = ray.intersectPlane(plane);

    if (!intersectionResult) return 1.0;

    const offset = intersectionResult.point.sub(pivot);
    let scaleFactor = 1.0;

    switch (this.activeAxis) {
      case ScaleAxis.X: {
        const xAxis = new Vector3(1, 0, 0).applyQuaternion(orientation);
        scaleFactor = 1.0 + offset.dot(xAxis) / distance;
        break;
      }
      case ScaleAxis.Y: {
        const yAxis = new Vector3(0, 1, 0).applyQuaternion(orientation);
        scaleFactor = 1.0 + offset.dot(yAxis) / distance;
        break;
      }
      case ScaleAxis.Z: {
        const zAxis = new Vector3(0, 0, 1).applyQuaternion(orientation);
        scaleFactor = 1.0 + offset.dot(zAxis) / distance;
        break;
      }
      case ScaleAxis.UNIFORM: {
        // Average of all axes
        scaleFactor = 1.0 + offset.length() / distance;
        break;
      }
    }

    return Math.max(0.01, scaleFactor); // Prevent negative/zero scale
  }

  /**
   * Applies scale to target entities
   */
  private applyScale(scaleFactor: number): void {
    this.targets.forEach(entity => {
      if (!hasComponentMethods(entity)) return;

      const transform = entity.getComponent(Transform);
      const initialScale = this.initialScales.get(entity);

      if (!transform || !initialScale) return;

      switch (this.activeAxis) {
        case ScaleAxis.X:
          transform.scale.set(
            initialScale.x * scaleFactor,
            initialScale.y,
            initialScale.z
          );
          break;

        case ScaleAxis.Y:
          transform.scale.set(
            initialScale.x,
            initialScale.y * scaleFactor,
            initialScale.z
          );
          break;

        case ScaleAxis.Z:
          transform.scale.set(
            initialScale.x,
            initialScale.y,
            initialScale.z * scaleFactor
          );
          break;

        case ScaleAxis.UNIFORM:
          transform.scale.copy(initialScale).multiplyScalar(scaleFactor);
          break;
      }

      // Transform is automatically marked dirty when scale is modified
    });
  }

  /**
   * Picks a scale axis from mouse ray
   */
  private pickAxis(ray: Ray, pivot: Vector3, camera: Camera): ScaleAxis {
    const orientation = this.manager.getOrientation();
    const size = this.manager.getSize() * this.calculateScreenSpaceSize(pivot, camera);

    const xAxis = new Vector3(1, 0, 0).applyQuaternion(orientation);
    const yAxis = new Vector3(0, 1, 0).applyQuaternion(orientation);
    const zAxis = new Vector3(0, 0, 1).applyQuaternion(orientation);

    const cubeSize = this.cubeSize * size;
    const centerCubeSize = this.centerCubeSize * size;
    const threshold = cubeSize * 1.5;

    // Check center cube first (uniform scale)
    if (this.rayIntersectsCube(ray, pivot, centerCubeSize)) {
      return ScaleAxis.UNIFORM;
    }

    // Check axis cubes
    const xEnd = pivot.clone().add(xAxis.clone().multiplyScalar(this.axisLength * size));
    const yEnd = pivot.clone().add(yAxis.clone().multiplyScalar(this.axisLength * size));
    const zEnd = pivot.clone().add(zAxis.clone().multiplyScalar(this.axisLength * size));

    if (this.rayIntersectsCube(ray, xEnd, cubeSize)) {
      return ScaleAxis.X;
    }
    if (this.rayIntersectsCube(ray, yEnd, cubeSize)) {
      return ScaleAxis.Y;
    }
    if (this.rayIntersectsCube(ray, zEnd, cubeSize)) {
      return ScaleAxis.Z;
    }

    return ScaleAxis.NONE;
  }

  /**
   * Checks if ray intersects a cube
   */
  private rayIntersectsCube(ray: Ray, center: Vector3, size: number): boolean {
    const closest = ray.closestPointToPoint(center);
    return closest.distanceTo(center) < size;
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
    // Placeholder for rendering system
  }

  private drawCube(center: Vector3, size: number, color: Color): void {
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
    this.initialScales.clear();
  }
}
