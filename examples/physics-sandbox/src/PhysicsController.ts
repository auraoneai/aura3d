/**
 * Physics Sandbox Controller
 *
 * Manages user interactions, object spawning, force application,
 * and physics world manipulation.
 */

import { Vector3, PhysicsWorld, RigidBody, BodyType, Color } from 'g3d';

export type SpawnObjectType =
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'compound';

export interface SpawnConfig {
  type: SpawnObjectType;
  size: Vector3;
  mass: number;
  color: Color;
  restitution: number;
  friction: number;
}

/**
 * Main controller for physics sandbox interactions
 */
export class PhysicsController {
  private physicsWorld: PhysicsWorld;
  private canvas: HTMLCanvasElement;

  private mousePos: Vector3 = new Vector3(0, 0, 0);
  private selectedBodies: Set<RigidBody> = new Set();
  private spawnConfig: SpawnConfig;
  private spawnRotation: number = 0;

  private cameraAngle: Vector3 = new Vector3(0, 0.5, 0);
  private isRotatingCamera: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  private raycastHit: RigidBody | null = null;

  constructor(physicsWorld: PhysicsWorld, canvas: HTMLCanvasElement) {
    this.physicsWorld = physicsWorld;
    this.canvas = canvas;

    this.spawnConfig = {
      type: 'box',
      size: new Vector3(1, 1, 1),
      mass: 1.0,
      color: new Color(0.8, 0.3, 0.3, 1),
      restitution: 0.3,
      friction: 0.5
    };
  }

  /**
   * Spawns a rigid body at the specified position
   */
  public spawnRigidBody(type: SpawnObjectType, position: Vector3): RigidBody {
    const body = new RigidBody({
      type: BodyType.Dynamic,
      position: position.clone(),
      mass: this.spawnConfig.mass
    });

    switch (type) {
      case 'box':
        this.createBox(body);
        break;
      case 'sphere':
        this.createSphere(body);
        break;
      case 'capsule':
        this.createCapsule(body);
        break;
      case 'cylinder':
        this.createCylinder(body);
        break;
      case 'compound':
        this.createCompound(body);
        break;
    }

    this.physicsWorld.addRigidBody(body);
    return body;
  }

  private createBox(body: RigidBody): void {
    // Box collider setup would go here
  }

  private createSphere(body: RigidBody): void {
    // Sphere collider setup would go here
  }

  private createCapsule(body: RigidBody): void {
    // Capsule collider setup would go here
  }

  private createCylinder(body: RigidBody): void {
    // Cylinder collider setup would go here
  }

  private createCompound(body: RigidBody): void {
    // Compound shape setup would go here
  }

  /**
   * Applies a force to a body at a specific point
   */
  public applyForce(body: RigidBody, force: Vector3, point?: Vector3): void {
    body.applyForce(force, point);
  }

  /**
   * Applies an impulse to a body
   */
  public applyImpulse(body: RigidBody, impulse: Vector3, point?: Vector3): void {
    body.applyImpulse(impulse, point);
  }

  /**
   * Creates an explosion at the specified position
   */
  public createExplosion(position: Vector3, force: number, radius: number): void {
    for (const body of this.physicsWorld.bodies) {
      if (body.type !== BodyType.Dynamic) continue;

      const direction = body.position.sub(position);
      const distance = direction.length();

      if (distance < radius && distance > 0) {
        const falloff = 1.0 - (distance / radius);
        const explosionForce = direction.normalize().scale(force * falloff);
        body.applyImpulse(explosionForce);
      }
    }
  }

  /**
   * Raycasts from screen position to find bodies
   */
  public raycast(screenX: number, screenY: number): RigidBody | null {
    const ray = this.screenToRay(screenX, screenY);
    let closestBody: RigidBody | null = null;
    let closestDistance = Infinity;

    for (const body of this.physicsWorld.bodies) {
      const toBody = body.position.sub(ray.origin);
      const distance = toBody.length();

      if (distance < closestDistance) {
        closestDistance = distance;
        closestBody = body;
      }
    }

    this.raycastHit = closestBody;
    return closestBody;
  }

  private screenToRay(screenX: number, screenY: number): { origin: Vector3; direction: Vector3 } {
    const ndcX = (screenX / this.canvas.width) * 2 - 1;
    const ndcY = -(screenY / this.canvas.height) * 2 + 1;

    const origin = new Vector3(ndcX * 10, ndcY * 10 + 5, -10);
    const direction = new Vector3(0, 0, 1);

    return { origin, direction };
  }

  /**
   * Toggles gravity on/off
   */
  public toggleGravity(): void {
    const currentGravity = this.physicsWorld.gravity.y;
    this.physicsWorld.gravity.set(0, currentGravity === 0 ? -9.81 : 0, 0);
  }

  /**
   * Sets the time scale for slow motion
   */
  public setTimeScale(scale: number): void {
    // Time scale is managed by the main application
  }

  /**
   * Deletes the selected bodies
   */
  public deleteSelected(): void {
    for (const body of this.selectedBodies) {
      this.physicsWorld.removeRigidBody(body);
    }
    this.selectedBodies.clear();
  }

  /**
   * Clears all selections
   */
  public clearSelection(): void {
    this.selectedBodies.clear();
  }

  /**
   * Selects a body
   */
  public selectBody(body: RigidBody): void {
    this.selectedBodies.add(body);
  }

  /**
   * Deselects a body
   */
  public deselectBody(body: RigidBody): void {
    this.selectedBodies.delete(body);
  }

  /**
   * Checks if a body is selected
   */
  public isSelected(body: RigidBody): boolean {
    return this.selectedBodies.has(body);
  }

  /**
   * Toggles kinematic state of a body (freeze/unfreeze)
   */
  public toggleKinematic(body: RigidBody): void {
    if (body.type === BodyType.Dynamic) {
      body.type = BodyType.Kinematic;
      body.linearVelocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    } else if (body.type === BodyType.Kinematic) {
      body.type = BodyType.Dynamic;
    }
  }

  /**
   * Wakes up all sleeping bodies
   */
  public wakeAllBodies(): void {
    for (const body of this.physicsWorld.bodies) {
      if (body.type === BodyType.Dynamic) {
        body.wakeUp();
      }
    }
  }

  /**
   * Puts all bodies to sleep
   */
  public sleepAllBodies(): void {
    for (const body of this.physicsWorld.bodies) {
      if (body.type === BodyType.Dynamic) {
        body.sleep();
      }
    }
  }

  /**
   * Sets spawn configuration
   */
  public setSpawnConfig(config: Partial<SpawnConfig>): void {
    this.spawnConfig = { ...this.spawnConfig, ...config };
  }

  /**
   * Gets current spawn configuration
   */
  public getSpawnConfig(): SpawnConfig {
    return { ...this.spawnConfig };
  }

  /**
   * Rotates spawn object preview
   */
  public rotateSpawnObject(direction: number): void {
    this.spawnRotation += direction * Math.PI / 8;
  }

  /**
   * Gets spawn rotation
   */
  public getSpawnRotation(): number {
    return this.spawnRotation;
  }

  /**
   * Updates mouse position
   */
  public updateMouse(e: MouseEvent): void {
    this.mousePos.set(e.clientX, e.clientY, 0);

    if (this.isRotatingCamera) {
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      this.cameraAngle.x -= deltaX * 0.005;
      this.cameraAngle.y = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, this.cameraAngle.y - deltaY * 0.005)
      );

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  }

  /**
   * Starts camera rotation
   */
  public startCameraRotate(e: MouseEvent): void {
    this.isRotatingCamera = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  /**
   * Stops camera rotation
   */
  public stopCameraRotate(): void {
    this.isRotatingCamera = false;
  }

  /**
   * Gets camera angle
   */
  public getCameraAngle(): Vector3 {
    return this.cameraAngle;
  }

  /**
   * Gets mouse position
   */
  public getMousePosition(): Vector3 {
    return this.mousePos;
  }

  /**
   * Gets raycast hit
   */
  public getRaycastHit(): RigidBody | null {
    return this.raycastHit;
  }

  /**
   * Creates a constraint between two bodies
   */
  public createHingeConstraint(bodyA: RigidBody, bodyB: RigidBody, anchor: Vector3, axis: Vector3): void {
    // Hinge constraint creation would use the physics world's constraint system
  }

  /**
   * Creates a slider constraint
   */
  public createSliderConstraint(bodyA: RigidBody, bodyB: RigidBody, axis: Vector3): void {
    // Slider constraint creation
  }

  /**
   * Creates a spring constraint
   */
  public createSpringConstraint(
    bodyA: RigidBody,
    bodyB: RigidBody,
    stiffness: number,
    damping: number
  ): void {
    // Spring constraint creation
  }

  /**
   * Removes all constraints
   */
  public clearConstraints(): void {
    for (const constraint of this.physicsWorld.constraints) {
      this.physicsWorld.removeConstraint(constraint);
    }
  }

  /**
   * Gets physics statistics
   */
  public getStats(): {
    totalBodies: number;
    dynamicBodies: number;
    staticBodies: number;
    kinematicBodies: number;
    sleepingBodies: number;
    constraints: number;
  } {
    let dynamicCount = 0;
    let staticCount = 0;
    let kinematicCount = 0;
    let sleepingCount = 0;

    for (const body of this.physicsWorld.bodies) {
      if (body.type === BodyType.Dynamic) dynamicCount++;
      else if (body.type === BodyType.Static) staticCount++;
      else if (body.type === BodyType.Kinematic) kinematicCount++;

      if (body.isSleeping) sleepingCount++;
    }

    return {
      totalBodies: this.physicsWorld.bodies.length,
      dynamicBodies: dynamicCount,
      staticBodies: staticCount,
      kinematicBodies: kinematicCount,
      sleepingBodies: sleepingCount,
      constraints: this.physicsWorld.constraints.length
    };
  }

  /**
   * Sets physics world gravity
   */
  public setGravity(gravity: Vector3): void {
    this.physicsWorld.gravity.copy(gravity);
  }

  /**
   * Gets physics world gravity
   */
  public getGravity(): Vector3 {
    return this.physicsWorld.gravity.clone();
  }
}
