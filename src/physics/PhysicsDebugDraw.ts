/**
 * Physics debug visualization system.
 *
 * Renders physics shapes, constraints, contact points, and other debug information
 * for physics debugging and development.
 *
 * @module Physics/PhysicsDebugDraw
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { Color } from '../math/Color';
import { RigidBody, BodyType } from './RigidBody';
import { Collider, AABB, AABBUtils, ShapeType } from './Collider';
import { PhysicsWorld } from './PhysicsWorld';
import { Constraint } from './Constraint';
import { ContactManifold } from './CollisionDetection';

/**
 * Debug draw configuration options.
 */
export interface DebugDrawConfig {
  /** Draw collision shapes */
  drawShapes: boolean;

  /** Draw axis-aligned bounding boxes */
  drawAABBs: boolean;

  /** Draw contact points and normals */
  drawContacts: boolean;

  /** Draw constraints and joints */
  drawConstraints: boolean;

  /** Draw center of mass */
  drawCenterOfMass: boolean;

  /** Draw linear velocity vectors */
  drawVelocities: boolean;

  /** Draw angular velocity indicators */
  drawAngularVelocity: boolean;

  /** Draw sleep state indicators */
  drawSleepState: boolean;

  /** Contact point size */
  contactPointSize: number;

  /** Contact normal length */
  contactNormalLength: number;

  /** Velocity vector scale */
  velocityScale: number;

  /** Line width for drawing */
  lineWidth: number;

  /** Color for dynamic bodies */
  dynamicColor: Color;

  /** Color for kinematic bodies */
  kinematicColor: Color;

  /** Color for static bodies */
  staticColor: Color;

  /** Color for sleeping bodies */
  sleepingColor: Color;

  /** Color for trigger colliders */
  triggerColor: Color;

  /** Color for AABBs */
  aabbColor: Color;

  /** Color for contact points */
  contactColor: Color;

  /** Color for contact normals */
  normalColor: Color;

  /** Color for constraints */
  constraintColor: Color;

  /** Color for center of mass */
  centerOfMassColor: Color;

  /** Color for velocity vectors */
  velocityColor: Color;
}

/**
 * Rendering context interface for debug drawing.
 *
 * Implement this interface to integrate with your rendering system.
 */
export interface IDebugDrawContext {
  /**
   * Draws a line between two points.
   */
  drawLine(start: Vector3, end: Vector3, color: Color, lineWidth?: number): void;

  /**
   * Draws a wireframe box.
   */
  drawBox(center: Vector3, extents: Vector3, rotation: Matrix4, color: Color, lineWidth?: number): void;

  /**
   * Draws a wireframe sphere.
   */
  drawSphere(center: Vector3, radius: number, color: Color, lineWidth?: number): void;

  /**
   * Draws a wireframe capsule.
   */
  drawCapsule(start: Vector3, end: Vector3, radius: number, color: Color, lineWidth?: number): void;

  /**
   * Draws a point/dot.
   */
  drawPoint(position: Vector3, size: number, color: Color): void;

  /**
   * Draws an arrow from start to end.
   */
  drawArrow(start: Vector3, end: Vector3, color: Color, lineWidth?: number): void;

  /**
   * Draws text at a world position.
   */
  drawText(position: Vector3, text: string, color: Color): void;

  /**
   * Draws a wireframe AABB.
   */
  drawAABB(aabb: AABB, color: Color, lineWidth?: number): void;
}

/**
 * Default debug draw configuration.
 */
const DEFAULT_CONFIG: DebugDrawConfig = {
  drawShapes: true,
  drawAABBs: false,
  drawContacts: true,
  drawConstraints: true,
  drawCenterOfMass: false,
  drawVelocities: false,
  drawAngularVelocity: false,
  drawSleepState: true,
  contactPointSize: 0.1,
  contactNormalLength: 0.5,
  velocityScale: 0.1,
  lineWidth: 1.0,
  dynamicColor: new Color(0.2, 0.8, 0.2, 1.0),
  kinematicColor: new Color(0.2, 0.2, 0.8, 1.0),
  staticColor: new Color(0.6, 0.6, 0.6, 1.0),
  sleepingColor: new Color(0.4, 0.4, 0.4, 1.0),
  triggerColor: new Color(0.8, 0.8, 0.2, 0.5),
  aabbColor: new Color(1.0, 0.5, 0.0, 0.5),
  contactColor: new Color(1.0, 0.0, 0.0, 1.0),
  normalColor: new Color(0.0, 1.0, 1.0, 1.0),
  constraintColor: new Color(0.8, 0.2, 0.8, 1.0),
  centerOfMassColor: new Color(1.0, 1.0, 0.0, 1.0),
  velocityColor: new Color(0.0, 0.8, 1.0, 1.0)
};

/**
 * Physics debug draw system.
 *
 * Visualizes physics simulation state for debugging and development.
 *
 * @example
 * ```typescript
 * const debugDraw = new PhysicsDebugDraw({
 *   drawShapes: true,
 *   drawContacts: true,
 *   drawConstraints: true
 * });
 *
 * // In render loop
 * debugDraw.render(physicsWorld, renderContext);
 * ```
 */
export class PhysicsDebugDraw {
  config: DebugDrawConfig;
  private manifolds: ContactManifold[] = [];

  constructor(config: Partial<DebugDrawConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Sets contact manifolds for debug drawing.
   */
  setManifolds(manifolds: ContactManifold[]): void {
    this.manifolds = manifolds;
  }

  /**
   * Renders all enabled debug visualizations.
   *
   * @param world - Physics world to visualize
   * @param context - Rendering context
   */
  render(world: PhysicsWorld, context: IDebugDrawContext): void {
    if (this.config.drawShapes) {
      this.drawBodies(world.bodies, context);
    }

    if (this.config.drawAABBs) {
      this.drawBodyAABBs(world.bodies, context);
    }

    if (this.config.drawContacts) {
      this.drawContactPoints(this.manifolds, context);
    }

    if (this.config.drawConstraints) {
      this.drawConstraintsVisualization(world.constraints, context);
    }

    if (this.config.drawCenterOfMass) {
      this.drawCentersOfMass(world.bodies, context);
    }

    if (this.config.drawVelocities) {
      this.drawVelocityVectors(world.bodies, context);
    }

    if (this.config.drawAngularVelocity) {
      this.drawAngularVelocityVectors(world.bodies, context);
    }
  }

  /**
   * Draws all rigid bodies and their collision shapes.
   */
  private drawBodies(bodies: RigidBody[], context: IDebugDrawContext): void {
    for (const body of bodies) {
      const color = this.getBodyColor(body);
      const transform = body.getWorldMatrix();

      for (const collider of body.colliders) {
        this.drawCollider(collider, transform, color, context);

        if (this.config.drawSleepState && body.isSleeping) {
          const worldPos = new Vector3(
            transform.elements[12],
            transform.elements[13],
            transform.elements[14]
          );
          context.drawText(worldPos, 'SLEEP', this.config.sleepingColor);
        }
      }
    }
  }

  /**
   * Draws a single collider.
   */
  private drawCollider(
    collider: Collider,
    transform: Matrix4,
    baseColor: Color,
    context: IDebugDrawContext
  ): void {
    const color = collider.isTrigger ? this.config.triggerColor : baseColor;
    const shape = collider.shape;

    const worldPos = new Vector3(
      transform.elements[12],
      transform.elements[13],
      transform.elements[14]
    );

    const offset = this.transformPoint(shape.offset, transform);

    switch (shape.type) {
      case ShapeType.Sphere:
        this.drawSphereShape(offset, shape as any, color, context);
        break;

      case ShapeType.Box:
        this.drawBoxShape(offset, transform, shape as any, color, context);
        break;

      case ShapeType.Capsule:
        this.drawCapsuleShape(offset, transform, shape as any, color, context);
        break;

      default:
        const aabb = collider.getAABB(transform);
        context.drawAABB(aabb, color, this.config.lineWidth);
        break;
    }
  }

  /**
   * Draws a sphere shape.
   */
  private drawSphereShape(
    center: Vector3,
    shape: { radius: number },
    color: Color,
    context: IDebugDrawContext
  ): void {
    context.drawSphere(center, shape.radius, color, this.config.lineWidth);
  }

  /**
   * Draws a box shape.
   */
  private drawBoxShape(
    center: Vector3,
    transform: Matrix4,
    shape: { extents: Vector3 },
    color: Color,
    context: IDebugDrawContext
  ): void {
    context.drawBox(center, shape.extents, transform, color, this.config.lineWidth);
  }

  /**
   * Draws a capsule shape.
   */
  private drawCapsuleShape(
    center: Vector3,
    transform: Matrix4,
    shape: { height: number; radius: number },
    color: Color,
    context: IDebugDrawContext
  ): void {
    const halfHeight = shape.height * 0.5 - shape.radius;
    const up = new Vector3(0, 1, 0);
    const worldUp = this.transformDirection(up, transform);

    const start = center.sub(worldUp.scale(halfHeight));
    const end = center.add(worldUp.scale(halfHeight));

    context.drawCapsule(start, end, shape.radius, color, this.config.lineWidth);
  }

  /**
   * Draws AABBs for all bodies.
   */
  private drawBodyAABBs(bodies: RigidBody[], context: IDebugDrawContext): void {
    for (const body of bodies) {
      const transform = body.getWorldMatrix();

      for (const collider of body.colliders) {
        const aabb = collider.getAABB(transform);
        context.drawAABB(aabb, this.config.aabbColor, this.config.lineWidth);
      }
    }
  }

  /**
   * Draws contact points and normals.
   */
  private drawContactPoints(manifolds: ContactManifold[], context: IDebugDrawContext): void {
    for (const manifold of manifolds) {
      for (const contact of manifold.contacts) {
        context.drawPoint(
          contact.point,
          this.config.contactPointSize,
          this.config.contactColor
        );

        const normalEnd = contact.point.add(
          contact.normal.scale(this.config.contactNormalLength)
        );
        context.drawArrow(
          contact.point,
          normalEnd,
          this.config.normalColor,
          this.config.lineWidth
        );

        const penetrationText = `${contact.penetration.toFixed(3)}`;
        context.drawText(contact.point, penetrationText, this.config.contactColor);
      }
    }
  }

  /**
   * Draws constraints and joints.
   */
  private drawConstraintsVisualization(
    constraints: Constraint[],
    context: IDebugDrawContext
  ): void {
    for (const constraint of constraints) {
      const posA = constraint.bodyA.position;
      const posB = constraint.bodyB ? constraint.bodyB.position : posA;

      context.drawLine(posA, posB, this.config.constraintColor, this.config.lineWidth * 2);

      context.drawPoint(posA, 0.15, this.config.constraintColor);
      if (constraint.bodyB) {
        context.drawPoint(posB, 0.15, this.config.constraintColor);
      }

      const midPoint = posA.add(posB).scale(0.5);
      const constraintType = this.getConstraintTypeName(constraint.type);
      context.drawText(midPoint, constraintType, this.config.constraintColor);
    }
  }

  /**
   * Draws center of mass indicators.
   */
  private drawCentersOfMass(bodies: RigidBody[], context: IDebugDrawContext): void {
    for (const body of bodies) {
      if (body.type === BodyType.Dynamic) {
        context.drawPoint(
          body.position,
          0.2,
          this.config.centerOfMassColor
        );

        const axisLength = 0.5;
        const right = body.rotation.rotateVector(new Vector3(1, 0, 0));
        const up = body.rotation.rotateVector(new Vector3(0, 1, 0));
        const forward = body.rotation.rotateVector(new Vector3(0, 0, 1));

        context.drawLine(
          body.position,
          body.position.add(right.scale(axisLength)),
          new Color(1, 0, 0, 1),
          this.config.lineWidth
        );

        context.drawLine(
          body.position,
          body.position.add(up.scale(axisLength)),
          new Color(0, 1, 0, 1),
          this.config.lineWidth
        );

        context.drawLine(
          body.position,
          body.position.add(forward.scale(axisLength)),
          new Color(0, 0, 1, 1),
          this.config.lineWidth
        );
      }
    }
  }

  /**
   * Draws linear velocity vectors.
   */
  private drawVelocityVectors(bodies: RigidBody[], context: IDebugDrawContext): void {
    for (const body of bodies) {
      if (body.type === BodyType.Dynamic && body.linearVelocity.lengthSquared() > 0.01) {
        const velocityEnd = body.position.add(
          body.linearVelocity.scale(this.config.velocityScale)
        );

        context.drawArrow(
          body.position,
          velocityEnd,
          this.config.velocityColor,
          this.config.lineWidth
        );

        const speed = body.linearVelocity.length();
        context.drawText(
          velocityEnd,
          `${speed.toFixed(2)} m/s`,
          this.config.velocityColor
        );
      }
    }
  }

  /**
   * Draws angular velocity indicators.
   */
  private drawAngularVelocityVectors(bodies: RigidBody[], context: IDebugDrawContext): void {
    for (const body of bodies) {
      if (body.type === BodyType.Dynamic && body.angularVelocity.lengthSquared() > 0.01) {
        const angularVelNorm = body.angularVelocity.normalize();
        const angularVelMag = body.angularVelocity.length();

        const start = body.position;
        const end = body.position.add(angularVelNorm.scale(0.5));

        context.drawArrow(start, end, new Color(1, 0.5, 0, 1), this.config.lineWidth);

        context.drawText(
          end,
          `${angularVelMag.toFixed(2)} rad/s`,
          new Color(1, 0.5, 0, 1)
        );
      }
    }
  }

  /**
   * Gets the appropriate color for a rigid body based on its state.
   */
  private getBodyColor(body: RigidBody): Color {
    if (body.isSleeping) {
      return this.config.sleepingColor;
    }

    switch (body.type) {
      case BodyType.Dynamic:
        return this.config.dynamicColor;
      case BodyType.Kinematic:
        return this.config.kinematicColor;
      case BodyType.Static:
        return this.config.staticColor;
      default:
        return this.config.dynamicColor;
    }
  }

  /**
   * Gets a human-readable constraint type name.
   */
  private getConstraintTypeName(type: number): string {
    switch (type) {
      case 0: return 'Fixed';
      case 1: return 'Hinge';
      case 2: return 'ConeTwist';
      case 3: return 'Slider';
      default: return 'Unknown';
    }
  }

  /**
   * Updates configuration at runtime.
   */
  setConfig(config: Partial<DebugDrawConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Toggles a specific debug feature.
   */
  toggle(feature: keyof DebugDrawConfig): void {
    if (typeof this.config[feature] === 'boolean') {
      (this.config[feature] as boolean) = !(this.config[feature] as boolean);
    }
  }

  /**
   * Enables all debug drawing features.
   */
  enableAll(): void {
    this.config.drawShapes = true;
    this.config.drawAABBs = true;
    this.config.drawContacts = true;
    this.config.drawConstraints = true;
    this.config.drawCenterOfMass = true;
    this.config.drawVelocities = true;
    this.config.drawAngularVelocity = true;
    this.config.drawSleepState = true;
  }

  /**
   * Disables all debug drawing features.
   */
  disableAll(): void {
    this.config.drawShapes = false;
    this.config.drawAABBs = false;
    this.config.drawContacts = false;
    this.config.drawConstraints = false;
    this.config.drawCenterOfMass = false;
    this.config.drawVelocities = false;
    this.config.drawAngularVelocity = false;
    this.config.drawSleepState = false;
  }

  /**
   * Resets configuration to defaults.
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Helper method to transform a point by a matrix.
   */
  private transformPoint(point: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = point.x;
    const y = point.y;
    const z = point.z;

    return new Vector3(
      e[0] * x + e[4] * y + e[8] * z + e[12],
      e[1] * x + e[5] * y + e[9] * z + e[13],
      e[2] * x + e[6] * y + e[10] * z + e[14]
    );
  }

  /**
   * Helper method to transform a direction (ignoring translation).
   */
  private transformDirection(dir: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = dir.x;
    const y = dir.y;
    const z = dir.z;

    const result = new Vector3(
      e[0] * x + e[4] * y + e[8] * z,
      e[1] * x + e[5] * y + e[9] * z,
      e[2] * x + e[6] * y + e[10] * z
    );

    return result.normalize();
  }
}

/**
 * Simple canvas-based debug draw context implementation.
 *
 * @example
 * ```typescript
 * const canvas = document.getElementById('debugCanvas') as HTMLCanvasElement;
 * const context = new CanvasDebugDrawContext(canvas);
 * debugDraw.render(world, context);
 * ```
 */
export class CanvasDebugDrawContext implements IDebugDrawContext {
  private ctx: CanvasRenderingContext2D;
  private camera: {
    position: Vector3;
    target: Vector3;
    zoom: number;
  };

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.camera = {
      position: new Vector3(0, 10, 20),
      target: new Vector3(0, 0, 0),
      zoom: 20
    };
  }

  drawLine(start: Vector3, end: Vector3, color: Color, lineWidth: number = 1): void {
    const start2D = this.projectToScreen(start);
    const end2D = this.projectToScreen(end);

    this.ctx.strokeStyle = this.colorToCSS(color);
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(start2D.x, start2D.y);
    this.ctx.lineTo(end2D.x, end2D.y);
    this.ctx.stroke();
  }

  drawBox(center: Vector3, extents: Vector3, rotation: Matrix4, color: Color, lineWidth: number = 1): void {
    const corners = [
      new Vector3(-extents.x, -extents.y, -extents.z),
      new Vector3(extents.x, -extents.y, -extents.z),
      new Vector3(extents.x, extents.y, -extents.z),
      new Vector3(-extents.x, extents.y, -extents.z),
      new Vector3(-extents.x, -extents.y, extents.z),
      new Vector3(extents.x, -extents.y, extents.z),
      new Vector3(extents.x, extents.y, extents.z),
      new Vector3(-extents.x, extents.y, extents.z)
    ];

    const worldCorners = corners.map(c => center.add(this.transformDirection(c, rotation)));

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    for (const [i, j] of edges) {
      this.drawLine(worldCorners[i], worldCorners[j], color, lineWidth);
    }
  }

  drawSphere(center: Vector3, radius: number, color: Color, lineWidth: number = 1): void {
    const center2D = this.projectToScreen(center);

    this.ctx.strokeStyle = this.colorToCSS(color);
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();
    this.ctx.arc(center2D.x, center2D.y, radius * this.camera.zoom, 0, Math.PI * 2);
    this.ctx.stroke();

    this.drawCircleRing(center, radius, new Vector3(1, 0, 0), color, lineWidth);
    this.drawCircleRing(center, radius, new Vector3(0, 1, 0), color, lineWidth);
    this.drawCircleRing(center, radius, new Vector3(0, 0, 1), color, lineWidth);
  }

  drawCapsule(start: Vector3, end: Vector3, radius: number, color: Color, lineWidth: number = 1): void {
    this.drawLine(start, end, color, lineWidth);
    this.drawSphere(start, radius, color, lineWidth);
    this.drawSphere(end, radius, color, lineWidth);
  }

  drawPoint(position: Vector3, size: number, color: Color): void {
    const pos2D = this.projectToScreen(position);

    this.ctx.fillStyle = this.colorToCSS(color);
    this.ctx.beginPath();
    this.ctx.arc(pos2D.x, pos2D.y, size * this.camera.zoom, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawArrow(start: Vector3, end: Vector3, color: Color, lineWidth: number = 1): void {
    this.drawLine(start, end, color, lineWidth);

    const direction = end.sub(start).normalize();
    const arrowLength = 0.2;
    const arrowWidth = 0.1;

    const right = direction.cross(new Vector3(0, 1, 0)).normalize();
    if (right.lengthSquared() < 0.01) {
      right.copy(direction.cross(new Vector3(1, 0, 0)).normalize());
    }

    const arrowBase = end.sub(direction.scale(arrowLength));
    const arrowLeft = arrowBase.add(right.scale(arrowWidth));
    const arrowRight = arrowBase.sub(right.scale(arrowWidth));

    this.drawLine(end, arrowLeft, color, lineWidth);
    this.drawLine(end, arrowRight, color, lineWidth);
  }

  drawText(position: Vector3, text: string, color: Color): void {
    const pos2D = this.projectToScreen(position);

    this.ctx.fillStyle = this.colorToCSS(color);
    this.ctx.font = '12px monospace';
    this.ctx.fillText(text, pos2D.x + 5, pos2D.y - 5);
  }

  drawAABB(aabb: AABB, color: Color, lineWidth: number = 1): void {
    const min = aabb.min;
    const max = aabb.max;

    const corners = [
      new Vector3(min.x, min.y, min.z),
      new Vector3(max.x, min.y, min.z),
      new Vector3(max.x, max.y, min.z),
      new Vector3(min.x, max.y, min.z),
      new Vector3(min.x, min.y, max.z),
      new Vector3(max.x, min.y, max.z),
      new Vector3(max.x, max.y, max.z),
      new Vector3(min.x, max.y, max.z)
    ];

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    for (const [i, j] of edges) {
      this.drawLine(corners[i], corners[j], color, lineWidth);
    }
  }

  setCameraPosition(position: Vector3): void {
    this.camera.position = position;
  }

  setCameraTarget(target: Vector3): void {
    this.camera.target = target;
  }

  setZoom(zoom: number): void {
    this.camera.zoom = zoom;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  private projectToScreen(point: Vector3): { x: number; y: number } {
    const viewDir = this.camera.target.sub(this.camera.position).normalize();
    const right = viewDir.cross(new Vector3(0, 1, 0)).normalize();
    const up = right.cross(viewDir).normalize();

    const toPoint = point.sub(this.camera.position);

    const x = toPoint.dot(right) * this.camera.zoom;
    const y = -toPoint.dot(up) * this.camera.zoom;

    const centerX = this.ctx.canvas.width / 2;
    const centerY = this.ctx.canvas.height / 2;

    return {
      x: centerX + x,
      y: centerY + y
    };
  }

  private drawCircleRing(center: Vector3, radius: number, normal: Vector3, color: Color, lineWidth: number): void {
    const segments = 32;
    const angleStep = (Math.PI * 2) / segments;

    const tangent1 = normal.cross(new Vector3(0, 1, 0));
    if (tangent1.lengthSquared() < 0.01) {
      tangent1.copy(normal.cross(new Vector3(1, 0, 0)));
    }
    tangent1.normalize();

    const tangent2 = normal.cross(tangent1).normalize();

    for (let i = 0; i < segments; i++) {
      const angle1 = i * angleStep;
      const angle2 = (i + 1) * angleStep;

      const p1 = center.add(
        tangent1.scale(Math.cos(angle1) * radius).add(
          tangent2.scale(Math.sin(angle1) * radius)
        )
      );

      const p2 = center.add(
        tangent1.scale(Math.cos(angle2) * radius).add(
          tangent2.scale(Math.sin(angle2) * radius)
        )
      );

      this.drawLine(p1, p2, color, lineWidth);
    }
  }

  private colorToCSS(color: Color): string {
    const r = Math.floor(color.r * 255);
    const g = Math.floor(color.g * 255);
    const b = Math.floor(color.b * 255);
    return `rgba(${r}, ${g}, ${b}, ${color.a})`;
  }

  private transformDirection(dir: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = dir.x;
    const y = dir.y;
    const z = dir.z;

    const result = new Vector3(
      e[0] * x + e[4] * y + e[8] * z,
      e[1] * x + e[5] * y + e[9] * z,
      e[2] * x + e[6] * y + e[10] * z
    );

    return result;
  }
}
