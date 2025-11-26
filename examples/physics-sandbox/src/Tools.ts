/**
 * Sandbox Tools
 *
 * Interactive tools for manipulating physics objects in the sandbox.
 */

import { Vector3, PhysicsWorld, RigidBody, BodyType } from 'g3d';

export type ToolType = 'grab' | 'push' | 'slice' | 'freeze' | 'delete' | 'explode';

/**
 * Tool interface for sandbox interactions
 */
interface ITool {
  activate(): void;
  deactivate(): void;
  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void;
  onMouseMove(e: MouseEvent): void;
  onMouseUp(e: MouseEvent): void;
  update(deltaTime: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

/**
 * Grab tool for physics picking and manipulation
 */
class GrabTool implements ITool {
  private grabbedBody: RigidBody | null = null;
  private grabOffset: Vector3 = new Vector3(0, 0, 0);
  private grabDistance: number = 0;
  private targetPosition: Vector3 = new Vector3(0, 0, 0);
  private originalType: BodyType = BodyType.Dynamic;

  constructor(private physicsWorld: PhysicsWorld, private canvas: HTMLCanvasElement) {}

  activate(): void {}
  deactivate(): void {
    if (this.grabbedBody) {
      this.grabbedBody.type = this.originalType;
      this.grabbedBody = null;
    }
  }

  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void {
    const closest = this.findClosestBody(e.clientX, e.clientY, bodies);
    if (closest) {
      this.grabbedBody = closest;
      this.originalType = closest.type;
      this.grabbedBody.type = BodyType.Kinematic;
      this.grabDistance = 10;
      this.grabOffset = new Vector3(0, 0, 0);
    }
  }

  onMouseMove(e: MouseEvent): void {
    if (this.grabbedBody) {
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      this.targetPosition.copy(worldPos);
    }
  }

  onMouseUp(e: MouseEvent): void {
    if (this.grabbedBody) {
      this.grabbedBody.type = this.originalType;
      this.grabbedBody = null;
    }
  }

  update(deltaTime: number): void {
    if (this.grabbedBody) {
      const toTarget = this.targetPosition.sub(this.grabbedBody.position);
      const velocity = toTarget.scale(10);
      this.grabbedBody.linearVelocity.copy(velocity);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.grabbedBody) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(this.canvas.width / 2, this.canvas.height / 2, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private findClosestBody(x: number, y: number, bodies: RigidBody[]): RigidBody | null {
    let closest: RigidBody | null = null;
    let minDist = Infinity;

    for (const body of bodies) {
      if (body.type === BodyType.Static) continue;
      const screenPos = this.worldToScreen(body.position);
      const dist = Math.sqrt((screenPos.x - x) ** 2 + (screenPos.y - y) ** 2);
      if (dist < minDist && dist < 100) {
        minDist = dist;
        closest = body;
      }
    }

    return closest;
  }

  private screenToWorld(x: number, y: number): Vector3 {
    const ndcX = (x / this.canvas.width) * 2 - 1;
    const ndcY = -(y / this.canvas.height) * 2 + 1;
    return new Vector3(ndcX * 10, ndcY * 10, 0);
  }

  private worldToScreen(pos: Vector3): { x: number; y: number } {
    return {
      x: this.canvas.width / 2 + pos.x * 20,
      y: this.canvas.height / 2 - pos.y * 20
    };
  }
}

/**
 * Push tool for applying forces
 */
class PushTool implements ITool {
  private pushStrength: number = 500;
  private pushPoint: Vector3 | null = null;

  constructor(private physicsWorld: PhysicsWorld, private canvas: HTMLCanvasElement) {}

  activate(): void {}
  deactivate(): void {}

  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    this.pushPoint = worldPos;

    for (const body of bodies) {
      if (body.type !== BodyType.Dynamic) continue;

      const toBody = body.position.sub(worldPos);
      const distance = toBody.length();

      if (distance < 3) {
        const force = toBody.normalize().scale(this.pushStrength);
        body.applyForce(force);
      }
    }
  }

  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {
    this.pushPoint = null;
  }

  update(deltaTime: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    if (this.pushPoint) {
      const screenPos = this.worldToScreen(this.pushPoint);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, 50, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private screenToWorld(x: number, y: number): Vector3 {
    const ndcX = (x / this.canvas.width) * 2 - 1;
    const ndcY = -(y / this.canvas.height) * 2 + 1;
    return new Vector3(ndcX * 10, ndcY * 10, 0);
  }

  private worldToScreen(pos: Vector3): { x: number; y: number } {
    return {
      x: this.canvas.width / 2 + pos.x * 20,
      y: this.canvas.height / 2 - pos.y * 20
    };
  }
}

/**
 * Slice tool for cutting objects
 */
class SliceTool implements ITool {
  private sliceStart: Vector3 | null = null;
  private sliceEnd: Vector3 | null = null;
  private isSlicing: boolean = false;

  constructor(private physicsWorld: PhysicsWorld, private canvas: HTMLCanvasElement) {}

  activate(): void {}
  deactivate(): void {}

  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void {
    this.sliceStart = this.screenToWorld(e.clientX, e.clientY);
    this.isSlicing = true;
  }

  onMouseMove(e: MouseEvent): void {
    if (this.isSlicing) {
      this.sliceEnd = this.screenToWorld(e.clientX, e.clientY);
    }
  }

  onMouseUp(e: MouseEvent): void {
    if (this.isSlicing && this.sliceStart && this.sliceEnd) {
      this.performSlice();
    }
    this.isSlicing = false;
    this.sliceStart = null;
    this.sliceEnd = null;
  }

  update(deltaTime: number): void {}

  render(ctx: CanvasRenderingContext2D): void {
    if (this.isSlicing && this.sliceStart && this.sliceEnd) {
      const start = this.worldToScreen(this.sliceStart);
      const end = this.worldToScreen(this.sliceEnd);

      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private performSlice(): void {
    // Slicing logic would split bodies along the slice plane
  }

  private screenToWorld(x: number, y: number): Vector3 {
    const ndcX = (x / this.canvas.width) * 2 - 1;
    const ndcY = -(y / this.canvas.height) * 2 + 1;
    return new Vector3(ndcX * 10, ndcY * 10, 0);
  }

  private worldToScreen(pos: Vector3): { x: number; y: number } {
    return {
      x: this.canvas.width / 2 + pos.x * 20,
      y: this.canvas.height / 2 - pos.y * 20
    };
  }
}

/**
 * Freeze tool for toggling kinematic state
 */
class FreezeTool implements ITool {
  constructor(private physicsWorld: PhysicsWorld, private canvas: HTMLCanvasElement) {}

  activate(): void {}
  deactivate(): void {}

  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    for (const body of bodies) {
      const distance = body.position.sub(worldPos).length();
      if (distance < 2) {
        if (body.type === BodyType.Dynamic) {
          body.type = BodyType.Kinematic;
          body.linearVelocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
        } else if (body.type === BodyType.Kinematic) {
          body.type = BodyType.Dynamic;
        }
      }
    }
  }

  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
  update(deltaTime: number): void {}
  render(ctx: CanvasRenderingContext2D): void {}

  private screenToWorld(x: number, y: number): Vector3 {
    const ndcX = (x / this.canvas.width) * 2 - 1;
    const ndcY = -(y / this.canvas.height) * 2 + 1;
    return new Vector3(ndcX * 10, ndcY * 10, 0);
  }
}

/**
 * Delete tool for removing objects
 */
class DeleteTool implements ITool {
  constructor(private physicsWorld: PhysicsWorld, private canvas: HTMLCanvasElement) {}

  activate(): void {}
  deactivate(): void {}

  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    for (const body of bodies) {
      if (body.type === BodyType.Static) continue;
      const distance = body.position.sub(worldPos).length();
      if (distance < 2) {
        this.physicsWorld.removeRigidBody(body);
        break;
      }
    }
  }

  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
  update(deltaTime: number): void {}
  render(ctx: CanvasRenderingContext2D): void {}

  private screenToWorld(x: number, y: number): Vector3 {
    const ndcX = (x / this.canvas.width) * 2 - 1;
    const ndcY = -(y / this.canvas.height) * 2 + 1;
    return new Vector3(ndcX * 10, ndcY * 10, 0);
  }
}

/**
 * Explosion tool for creating force explosions
 */
class ExplodeTool implements ITool {
  private explosionPoint: Vector3 | null = null;
  private explosionTime: number = 0;
  private explosionForce: number = 1000;
  private explosionRadius: number = 5;

  constructor(private physicsWorld: PhysicsWorld, private canvas: HTMLCanvasElement) {}

  activate(): void {}
  deactivate(): void {}

  onMouseDown(e: MouseEvent, bodies: RigidBody[]): void {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    this.explosionPoint = worldPos;
    this.explosionTime = 0.5;

    for (const body of bodies) {
      if (body.type !== BodyType.Dynamic) continue;

      const toBody = body.position.sub(worldPos);
      const distance = toBody.length();

      if (distance < this.explosionRadius && distance > 0) {
        const falloff = 1.0 - (distance / this.explosionRadius);
        const force = toBody.normalize().scale(this.explosionForce * falloff);
        body.applyImpulse(force);
      }
    }
  }

  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}

  update(deltaTime: number): void {
    if (this.explosionTime > 0) {
      this.explosionTime -= deltaTime;
      if (this.explosionTime <= 0) {
        this.explosionPoint = null;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.explosionPoint && this.explosionTime > 0) {
      const screenPos = this.worldToScreen(this.explosionPoint);
      const alpha = this.explosionTime / 0.5;
      const radius = (1 - alpha) * 100;

      ctx.strokeStyle = `rgba(255, 128, 0, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(255, 200, 0, ${alpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private screenToWorld(x: number, y: number): Vector3 {
    const ndcX = (x / this.canvas.width) * 2 - 1;
    const ndcY = -(y / this.canvas.height) * 2 + 1;
    return new Vector3(ndcX * 10, ndcY * 10, 0);
  }

  private worldToScreen(pos: Vector3): { x: number; y: number } {
    return {
      x: this.canvas.width / 2 + pos.x * 20,
      y: this.canvas.height / 2 - pos.y * 20
    };
  }
}

/**
 * Tool manager for sandbox
 */
export class Tools {
  private tools: Map<ToolType, ITool>;
  private activeTool: ToolType = 'grab';

  constructor(
    private physicsWorld: PhysicsWorld,
    private canvas: HTMLCanvasElement,
    private camera: any
  ) {
    this.tools = new Map();
    this.tools.set('grab', new GrabTool(physicsWorld, canvas));
    this.tools.set('push', new PushTool(physicsWorld, canvas));
    this.tools.set('slice', new SliceTool(physicsWorld, canvas));
    this.tools.set('freeze', new FreezeTool(physicsWorld, canvas));
    this.tools.set('delete', new DeleteTool(physicsWorld, canvas));
    this.tools.set('explode', new ExplodeTool(physicsWorld, canvas));
  }

  public setActiveTool(tool: ToolType): void {
    this.tools.get(this.activeTool)?.deactivate();
    this.activeTool = tool;
    this.tools.get(this.activeTool)?.activate();
  }

  public getActiveTool(): ToolType {
    return this.activeTool;
  }

  public handleMouseDown(e: MouseEvent, bodies: RigidBody[], visualBodies: Map<RigidBody, any>): void {
    this.tools.get(this.activeTool)?.onMouseDown(e, bodies);
  }

  public handleMouseMove(e: MouseEvent): void {
    this.tools.get(this.activeTool)?.onMouseMove(e);
  }

  public handleMouseUp(e: MouseEvent): void {
    this.tools.get(this.activeTool)?.onMouseUp(e);
  }

  public update(deltaTime: number): void {
    this.tools.get(this.activeTool)?.update(deltaTime);
  }

  public render(ctx: CanvasRenderingContext2D): void {
    this.tools.get(this.activeTool)?.render(ctx);
  }
}
