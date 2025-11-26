/**
 * G3D Physics Sandbox
 * Demonstrates: All Physics Features
 *
 * A comprehensive interactive physics sandbox showcasing rigid body dynamics,
 * constraints, force application, explosions, and advanced simulations.
 */

import { Vector3, Color, PhysicsWorld, RigidBody, BodyType } from 'g3d';
import { PhysicsController } from './PhysicsController';
import { SandboxUI } from './SandboxUI';
import { Spawners } from './Spawners';
import { Simulations } from './Simulations';
import { Tools } from './Tools';

/**
 * Main sandbox application class
 */
class PhysicsSandbox {
  private canvas: HTMLCanvasElement;
  private physicsWorld: PhysicsWorld;
  private controller: PhysicsController;
  private ui: SandboxUI;
  private spawners: Spawners;
  private simulations: Simulations;
  private tools: Tools;

  private lastTime: number = 0;
  private isPaused: boolean = false;
  private timeScale: number = 1.0;
  private visualBodies: Map<RigidBody, any> = new Map();

  private camera: {
    position: Vector3;
    rotation: Vector3;
    target: Vector3;
    distance: number;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.camera = {
      position: new Vector3(0, 10, 20),
      rotation: new Vector3(0, 0, 0),
      target: new Vector3(0, 0, 0),
      distance: 20
    };

    this.physicsWorld = new PhysicsWorld({
      gravity: new Vector3(0, -9.81, 0),
      fixedTimestep: 1 / 60,
      maxSubsteps: 5
    });

    this.controller = new PhysicsController(this.physicsWorld, this.canvas);
    this.spawners = new Spawners(this.physicsWorld);
    this.simulations = new Simulations(this.physicsWorld);
    this.tools = new Tools(this.physicsWorld, this.canvas, this.camera);
    this.ui = new SandboxUI(
      this.controller,
      this.spawners,
      this.simulations,
      this.tools,
      this.physicsWorld
    );

    this.init();
  }

  private init(): void {
    this.createGround();
    this.setupEventListeners();
    this.ui.init();

    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';

    this.animate(0);
  }

  private createGround(): void {
    const ground = new RigidBody({
      type: BodyType.Static,
      position: new Vector3(0, -0.5, 0)
    });

    this.physicsWorld.addRigidBody(ground);
    this.visualBodies.set(ground, {
      size: new Vector3(100, 1, 100),
      color: new Color(0.3, 0.3, 0.35, 1)
    });
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));

    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    document.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.tools.handleMouseDown(e, this.physicsWorld.bodies, this.visualBodies);
    } else if (e.button === 2) {
      this.controller.startCameraRotate(e);
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    this.controller.updateMouse(e);
    this.tools.handleMouseMove(e);
  }

  private handleMouseUp(e: MouseEvent): void {
    this.tools.handleMouseUp(e);
    this.controller.stopCameraRotate();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this.camera.distance += e.deltaY * 0.01;
    this.camera.distance = Math.max(5, Math.min(100, this.camera.distance));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case '1': this.tools.setActiveTool('grab'); break;
      case '2': this.tools.setActiveTool('push'); break;
      case '3': this.tools.setActiveTool('slice'); break;
      case '4': this.tools.setActiveTool('freeze'); break;
      case '5': this.tools.setActiveTool('delete'); break;
      case '6': this.tools.setActiveTool('explode'); break;
      case 'delete': this.controller.deleteSelected(); break;
      case 'r': this.resetScene(); break;
      case 'g': this.controller.toggleGravity(); break;
      case 't': this.toggleSlowMotion(); break;
      case ' ': this.togglePause(); break;
      case 'q': this.controller.rotateSpawnObject(-1); break;
      case 'e': this.controller.rotateSpawnObject(1); break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    // Handle key release events
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    this.ui.updatePauseState(this.isPaused);
  }

  private toggleSlowMotion(): void {
    this.timeScale = this.timeScale === 1.0 ? 0.2 : 1.0;
    this.ui.updateTimeScale(this.timeScale);
  }

  private resetScene(): void {
    for (const body of this.physicsWorld.bodies) {
      if (body.type !== BodyType.Static) {
        this.physicsWorld.removeRigidBody(body);
        this.visualBodies.delete(body);
      }
    }
    this.controller.clearSelection();
  }

  private animate(currentTime: number): void {
    requestAnimationFrame((time) => this.animate(time));

    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    if (!this.isPaused && deltaTime < 0.1) {
      const scaledDelta = deltaTime * this.timeScale;
      this.physicsWorld.step(scaledDelta);
      this.simulations.update(scaledDelta);
      this.tools.update(scaledDelta);
    }

    this.updateCamera();
    this.render();
    this.ui.updateStats({
      fps: 1 / Math.max(0.001, deltaTime),
      bodies: this.physicsWorld.bodies.length,
      activeBodies: this.physicsWorld.getActiveBodies(),
      constraints: this.physicsWorld.constraints.length
    });
  }

  private updateCamera(): void {
    const angle = this.controller.getCameraAngle();
    this.camera.position.x = this.camera.target.x + Math.sin(angle.x) * this.camera.distance;
    this.camera.position.z = this.camera.target.z + Math.cos(angle.x) * this.camera.distance;
    this.camera.position.y = this.camera.target.y + this.camera.distance * Math.sin(angle.y);
  }

  private render(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderGrid(ctx);
    this.renderBodies(ctx);
    this.renderConstraints(ctx);
    this.renderGizmos(ctx);
    this.tools.render(ctx);
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    const gridSize = 50;
    const gridSpacing = 2;

    for (let i = -gridSize; i <= gridSize; i += gridSpacing) {
      const screenStart = this.worldToScreen(new Vector3(i, 0, -gridSize));
      const screenEnd = this.worldToScreen(new Vector3(i, 0, gridSize));

      ctx.beginPath();
      ctx.moveTo(screenStart.x, screenStart.y);
      ctx.lineTo(screenEnd.x, screenEnd.y);
      ctx.stroke();

      const screenStart2 = this.worldToScreen(new Vector3(-gridSize, 0, i));
      const screenEnd2 = this.worldToScreen(new Vector3(gridSize, 0, i));

      ctx.beginPath();
      ctx.moveTo(screenStart2.x, screenStart2.y);
      ctx.lineTo(screenEnd2.x, screenEnd2.y);
      ctx.stroke();
    }
  }

  private renderBodies(ctx: CanvasRenderingContext2D): void {
    for (const body of this.physicsWorld.bodies) {
      const visual = this.visualBodies.get(body);
      if (!visual) continue;

      const screenPos = this.worldToScreen(body.position);
      const size = visual.size || new Vector3(1, 1, 1);
      const color = visual.color || new Color(0.8, 0.8, 0.8, 1);

      const isSelected = this.controller.isSelected(body);
      const isSleeping = body.isSleeping;

      ctx.save();
      ctx.translate(screenPos.x, screenPos.y);

      if (isSelected) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
      } else if (isSleeping) {
        ctx.strokeStyle = 'rgba(100, 100, 150, 0.5)';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, ${color.a})`;
        ctx.lineWidth = 2;
      }

      const w = size.x * 20;
      const h = size.y * 20;
      ctx.fillStyle = isSleeping
        ? 'rgba(50, 50, 80, 0.6)'
        : `rgba(${color.r * 200}, ${color.g * 200}, ${color.b * 200}, 0.7)`;

      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      ctx.restore();
    }
  }

  private renderConstraints(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
    ctx.lineWidth = 2;

    for (const constraint of this.physicsWorld.constraints) {
      const posA = this.worldToScreen(constraint.bodyA.position);
      const posB = constraint.bodyB
        ? this.worldToScreen(constraint.bodyB.position)
        : posA;

      ctx.beginPath();
      ctx.moveTo(posA.x, posA.y);
      ctx.lineTo(posB.x, posB.y);
      ctx.stroke();
    }
  }

  private renderGizmos(ctx: CanvasRenderingContext2D): void {
    const origin = this.worldToScreen(new Vector3(0, 0, 0));
    const axisLength = 50;

    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + axisLength, origin.y);
    ctx.stroke();

    ctx.strokeStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x, origin.y - axisLength);
    ctx.stroke();

    ctx.strokeStyle = '#0000ff';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + axisLength * 0.5, origin.y + axisLength * 0.5);
    ctx.stroke();
  }

  private worldToScreen(worldPos: Vector3): { x: number; y: number } {
    const relativePos = worldPos.sub(this.camera.position);
    const distance = relativePos.length();
    const scale = 500 / (distance + 1);

    const x = this.canvas.width / 2 + relativePos.x * scale;
    const y = this.canvas.height / 2 - relativePos.y * scale;

    return { x, y };
  }

  public addBody(body: RigidBody, visual: any): void {
    this.physicsWorld.addRigidBody(body);
    this.visualBodies.set(body, visual);
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const sandbox = new PhysicsSandbox(canvas);

(window as any).sandbox = sandbox;
