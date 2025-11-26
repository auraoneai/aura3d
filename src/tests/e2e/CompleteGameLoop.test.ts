/**
 * End-to-End Integration Tests for G3D 5.0
 *
 * Tests complete game scenarios with all systems working together.
 * Covers engine lifecycle, ECS integration, cross-system communication,
 * resource management, and stress testing.
 *
 * @module tests/e2e/CompleteGameLoop
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine, EngineState } from '../../core/Engine';
import { World } from '../../ecs/World';
import { System, SystemContext } from '../../ecs/System';
import { TransformComponent } from '../../ecs/components/TransformComponent';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { createMockCanvas } from '../utils/MockCanvas';
import { IComponent } from '../../ecs/Component';

/**
 * Mock RigidBody Component for physics testing
 */
class RigidBodyComponent implements IComponent {
  type: 'static' | 'dynamic' | 'kinematic';
  mass: number;
  velocity: Vector3;
  force: Vector3;

  constructor(options: { type?: 'static' | 'dynamic' | 'kinematic'; mass?: number } = {}) {
    this.type = options.type ?? 'dynamic';
    this.mass = options.mass ?? 1;
    this.velocity = new Vector3(0, 0, 0);
    this.force = new Vector3(0, 0, 0);
  }

  applyForce(force: Vector3): void {
    this.force.addInPlace(force);
  }

  reset(): void {
    this.velocity.set(0, 0, 0);
    this.force.set(0, 0, 0);
  }
}

/**
 * Mock Mesh Component for rendering testing
 */
class MeshComponent implements IComponent {
  geometry: any;
  material: any;
  visible: boolean;

  constructor(options: { geometry?: any; material?: any } = {}) {
    this.geometry = options.geometry ?? null;
    this.material = options.material ?? null;
    this.visible = true;
  }

  reset(): void {
    this.geometry = null;
    this.material = null;
    this.visible = true;
  }
}

/**
 * Mock Camera Component
 */
class CameraComponent implements IComponent {
  fov: number;
  near: number;
  far: number;
  aspect: number;

  constructor(options: { fov?: number; near?: number; far?: number; aspect?: number } = {}) {
    this.fov = options.fov ?? 60;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;
    this.aspect = options.aspect ?? 16 / 9;
  }

  reset(): void {
    this.fov = 60;
    this.near = 0.1;
    this.far = 1000;
    this.aspect = 16 / 9;
  }
}

/**
 * Mock Directional Light Component
 */
class DirectionalLightComponent implements IComponent {
  intensity: number;
  color: { r: number; g: number; b: number };

  constructor(options: { intensity?: number; color?: { r: number; g: number; b: number } } = {}) {
    this.intensity = options.intensity ?? 1.0;
    this.color = options.color ?? { r: 1, g: 1, b: 1 };
  }

  reset(): void {
    this.intensity = 1.0;
    this.color = { r: 1, g: 1, b: 1 };
  }
}

/**
 * Mock Box Geometry
 */
class BoxGeometry {
  width: number;
  height: number;
  depth: number;

  constructor(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
  }

  static create(width: number, height: number, depth: number): BoxGeometry {
    return new BoxGeometry(width, height, depth);
  }
}

/**
 * Simple Physics System for testing
 */
class SimplePhysicsSystem extends System {
  readonly query = { all: [TransformComponent, RigidBodyComponent] };
  private gravity = new Vector3(0, -9.81, 0);

  constructor() {
    super({ name: 'SimplePhysicsSystem', priority: 100 });
  }

  update(context: SystemContext): void {
    if (!this.world) return;

    // Simple Euler integration for testing
    const query = this.getQuery();
    query.forEach((entity, components) => {
      const transform = components[0] as TransformComponent;
      const rigidbody = components[1] as RigidBodyComponent;

      if (rigidbody.type === 'dynamic') {
        // Apply gravity
        rigidbody.applyForce(this.gravity.scale(rigidbody.mass));

        // Update velocity
        const acceleration = rigidbody.force.scale(1 / rigidbody.mass);
        rigidbody.velocity.addInPlace(acceleration.scale(context.deltaTime));

        // Update position
        const deltaPos = rigidbody.velocity.scale(context.deltaTime);
        transform.position.addInPlace(deltaPos);

        // Reset forces
        rigidbody.force.set(0, 0, 0);

        // Simple ground collision
        if (transform.position.y < 0) {
          transform.position.y = 0;
          rigidbody.velocity.y = 0;
        }
      }
    });
  }
}

/**
 * Render System for testing
 */
class SimpleRenderSystem extends System {
  readonly query = { all: [MeshComponent, TransformComponent] };
  private renderCount = 0;

  constructor() {
    super({ name: 'SimpleRenderSystem', priority: 1000 });
  }

  update(context: SystemContext): void {
    if (!this.world) return;

    // Count visible meshes
    let visibleCount = 0;

    const query = this.getQuery();
    query.forEach((entity, components) => {
      const mesh = components[0] as MeshComponent;
      const transform = components[1] as TransformComponent;

      if (mesh.visible) {
        visibleCount++;
      }
    });

    this.renderCount++;
  }

  getRenderCount(): number {
    return this.renderCount;
  }
}

describe('E2E: Complete Game Loop', () => {
  let engine: Engine | null = null;

  afterEach(() => {
    if (engine) {
      engine.destroy();
      engine = null;
    }
  });

  it('should initialize engine and run complete game loop', async () => {
    // 1. Initialize engine
    engine = Engine.create({
      canvas: createMockCanvas(),
      targetFPS: 60,
      autoStart: false
    });

    await engine.init();
    expect(engine.state).toBe(EngineState.INITIALIZED);

    // 2. Create world with entities
    const world = engine.world;

    // Create player
    const player = world.createEntity();
    world.addComponent(player, new TransformComponent({
      position: new Vector3(0, 10, 0),
      rotation: Quaternion.identity(),
      scale: Vector3.one()
    }));
    world.addComponent(player, new RigidBodyComponent({
      type: 'dynamic',
      mass: 10
    }));
    world.addComponent(player, new MeshComponent({
      geometry: BoxGeometry.create(1, 1, 1)
    }));

    // Create ground
    const ground = world.createEntity();
    world.addComponent(ground, new TransformComponent({
      position: new Vector3(0, -1, 0)
    }));
    world.addComponent(ground, new RigidBodyComponent({
      type: 'static'
    }));
    world.addComponent(ground, new MeshComponent({
      geometry: BoxGeometry.create(100, 1, 100)
    }));

    // Create camera
    const camera = world.createEntity();
    world.addComponent(camera, new TransformComponent({
      position: new Vector3(0, 5, 10)
    }));
    world.addComponent(camera, new CameraComponent({
      fov: 60,
      near: 0.1,
      far: 1000
    }));

    // Create light
    const light = world.createEntity();
    world.addComponent(light, new TransformComponent());
    world.addComponent(light, new DirectionalLightComponent({
      intensity: 1.0
    }));

    // Add systems
    world.addSystem(new SimplePhysicsSystem());
    world.addSystem(new SimpleRenderSystem());

    // 3. Start engine
    engine.start();
    expect(engine.state).toBe(EngineState.RUNNING);

    // 4. Run simulation for 1 second (60 frames)
    const initialY = world.getComponent(player, TransformComponent)!.position.y;

    for (let i = 0; i < 60; i++) {
      engine.tick();
    }

    // 5. Verify player fell due to gravity
    const playerTransform = world.getComponent(player, TransformComponent)!;
    expect(playerTransform.position.y).toBeLessThan(initialY);
    expect(playerTransform.position.y).toBeGreaterThanOrEqual(0); // Should hit ground

    // 6. Verify all entities exist
    expect(world.entityCount).toBe(4);

    // 7. Cleanup
    engine.stop();
    expect(engine.state).toBe(EngineState.STOPPED);
  });

  it('should handle cross-system communication', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    // Create entity
    const entity = engine.world.createEntity();
    engine.world.addComponent(entity, new TransformComponent());
    engine.world.addComponent(entity, new RigidBodyComponent({ type: 'dynamic', mass: 1 }));

    // Create system that applies forces
    class ForceSystem extends System {
      readonly query = { all: [RigidBodyComponent] };

      constructor() {
        super({ name: 'ForceSystem', priority: 50 });
      }

      update(context: SystemContext): void {
        if (!this.world) return;

        const query = this.getQuery();
        query.forEach((entity, components) => {
          const rb = components[0] as RigidBodyComponent;
          if (rb.type === 'dynamic') {
            // Apply rightward force
            rb.applyForce(new Vector3(100, 0, 0));
          }
        });
      }
    }

    engine.world.addSystem(new ForceSystem());
    engine.world.addSystem(new SimplePhysicsSystem());

    engine.start();

    // Run for 60 frames
    for (let i = 0; i < 60; i++) {
      engine.tick();
    }

    // Verify entity moved right
    const transform = engine.world.getComponent(entity, TransformComponent)!;
    expect(transform.position.x).toBeGreaterThan(0);
  });

  it('should manage resources efficiently', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    // Create many entities
    const entities: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const entity = engine.world.createEntity();
      engine.world.addComponent(entity, new TransformComponent({
        position: new Vector3(i, 0, 0)
      }));
      engine.world.addComponent(entity, new MeshComponent());
      entities.push(entity);
    }

    expect(engine.world.entityCount).toBe(1000);

    engine.start();

    // Run some frames
    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    // Destroy half the entities
    for (let i = 0; i < 500; i++) {
      engine.world.destroyEntity(entities[i]!);
    }

    expect(engine.world.entityCount).toBe(500);

    // Run more frames
    for (let i = 0; i < 10; i++) {
      engine.tick();
    }

    // Verify remaining entities still work
    let count = 0;
    const query = engine.world.getQuery({ all: [TransformComponent] });
    query.forEach(() => {
      count++;
    });

    expect(count).toBe(500);
  });

  it('should handle multi-system stress test', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    // Create stress test scenario
    for (let i = 0; i < 500; i++) {
      const entity = engine.world.createEntity();
      engine.world.addComponent(entity, new TransformComponent({
        position: new Vector3(
          Math.random() * 100 - 50,
          Math.random() * 10,
          Math.random() * 100 - 50
        )
      }));
      engine.world.addComponent(entity, new RigidBodyComponent({
        type: 'dynamic',
        mass: 1
      }));
    }

    engine.world.addSystem(new SimplePhysicsSystem());
    engine.world.addSystem(new SimpleRenderSystem());

    engine.start();

    // Run stress test (60 frames)
    const startTime = performance.now();

    for (let i = 0; i < 60; i++) {
      engine.tick();
    }

    const endTime = performance.now();
    const avgFrameTime = (endTime - startTime) / 60;

    // Should complete in reasonable time (< 30ms per frame for 500 entities)
    expect(avgFrameTime).toBeLessThan(30);

    // Verify frame count
    expect(engine.frameCount).toBe(60);
  });

  it('should support pause and resume', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    const entity = engine.world.createEntity();
    engine.world.addComponent(entity, new TransformComponent({
      position: new Vector3(0, 10, 0)
    }));
    engine.world.addComponent(entity, new RigidBodyComponent({
      type: 'dynamic',
      mass: 1
    }));

    engine.world.addSystem(new SimplePhysicsSystem());

    engine.start();
    expect(engine.isRunning).toBe(true);

    // Run for 30 frames
    for (let i = 0; i < 30; i++) {
      engine.tick();
    }

    const posAfter30Frames = engine.world.getComponent(entity, TransformComponent)!.position.y;

    // Pause
    engine.pause();
    expect(engine.isPaused).toBe(true);
    expect(engine.state).toBe(EngineState.PAUSED);

    // Resume
    engine.resume();
    expect(engine.isRunning).toBe(true);

    // Run for 30 more frames
    for (let i = 0; i < 30; i++) {
      engine.tick();
    }

    const posAfter60Frames = engine.world.getComponent(entity, TransformComponent)!.position.y;

    // Position should have changed after resume
    expect(posAfter60Frames).not.toBe(posAfter30Frames);
  });

  it('should handle system lifecycle correctly', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    let initCalled = false;
    let startCalled = false;
    let updateCalled = false;
    let stopCalled = false;
    let destroyCalled = false;

    class LifecycleTestSystem extends System {
      readonly query = { all: [] };

      constructor() {
        super({ name: 'LifecycleTestSystem', priority: 100 });
      }

      override onInit(): void {
        initCalled = true;
      }

      override onStart(): void {
        startCalled = true;
      }

      update(context: SystemContext): void {
        updateCalled = true;
      }

      override onStop(): void {
        stopCalled = true;
      }

      override onDestroy(): void {
        destroyCalled = true;
      }
    }

    const system = new LifecycleTestSystem();
    engine.world.addSystem(system);

    // Init should be called when adding system to initialized world
    expect(initCalled).toBe(true);

    engine.start();
    expect(startCalled).toBe(true);

    // Update should be called
    engine.tick();
    expect(updateCalled).toBe(true);

    engine.stop();
    expect(stopCalled).toBe(true);

    engine.world.removeSystem(system);
    expect(destroyCalled).toBe(true);
  });

  it('should handle entity creation and destruction during iteration', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    // Create initial entities
    for (let i = 0; i < 10; i++) {
      const entity = engine.world.createEntity();
      engine.world.addComponent(entity, new TransformComponent());
    }

    let spawnedCount = 0;
    let destroyedCount = 0;

    class SpawnDestroySystem extends System {
      readonly query = { all: [TransformComponent] };
      private frameCount = 0;

      constructor() {
        super({ name: 'SpawnDestroySystem', priority: 100 });
      }

      update(context: SystemContext): void {
        if (!this.world) return;

        this.frameCount++;

        // On frame 1, spawn 5 new entities
        if (this.frameCount === 1) {
          for (let i = 0; i < 5; i++) {
            const newEntity = this.world.createEntity();
            this.world.addComponent(newEntity, new TransformComponent());
            spawnedCount++;
          }
        }

        // On frame 2, destroy 3 entities
        if (this.frameCount === 2) {
          let count = 0;
          const query = this.getQuery();
          const entitiesToDestroy: Entity[] = [];
          query.forEach((entity) => {
            if (count < 3) {
              entitiesToDestroy.push(entity);
              count++;
            }
          });
          for (const entity of entitiesToDestroy) {
            this.world.destroyEntity(entity);
            destroyedCount++;
          }
        }
      }
    }

    engine.world.addSystem(new SpawnDestroySystem());
    engine.start();

    // Frame 0: 10 entities
    engine.tick();
    expect(engine.world.entityCount).toBe(10);

    // Frame 1: spawn 5, total 15
    engine.tick();
    expect(engine.world.entityCount).toBe(15);
    expect(spawnedCount).toBe(5);

    // Frame 2: destroy 3, total 12
    engine.tick();
    expect(engine.world.entityCount).toBe(12);
    expect(destroyedCount).toBe(3);
  });

  it('should support hierarchical transforms', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      autoStart: false
    });

    await engine.init();

    // Create parent
    const parent = engine.world.createEntity();
    const parentTransform = new TransformComponent({
      position: new Vector3(10, 0, 0)
    });
    engine.world.addComponent(parent, parentTransform);

    // Create child
    const child = engine.world.createEntity();
    const childTransform = new TransformComponent({
      position: new Vector3(5, 0, 0)
    });
    childTransform.parentEntity = parent;
    engine.world.addComponent(child, childTransform);

    // Child's world position should be parent + child local
    const worldPos = childTransform.worldPosition;
    expect(worldPos.x).toBeCloseTo(15, 5);
    expect(worldPos.y).toBeCloseTo(0, 5);
    expect(worldPos.z).toBeCloseTo(0, 5);
  });

  it('should track performance metrics', async () => {
    engine = Engine.create({
      canvas: createMockCanvas(),
      enableProfiling: true,
      autoStart: false
    });

    await engine.init();

    // Add systems
    engine.world.addSystem(new SimplePhysicsSystem());
    engine.world.addSystem(new SimpleRenderSystem());

    // Create entities
    for (let i = 0; i < 100; i++) {
      const entity = engine.world.createEntity();
      engine.world.addComponent(entity, new TransformComponent());
      engine.world.addComponent(entity, new RigidBodyComponent({ type: 'dynamic' }));
    }

    engine.start();

    // Run for 60 frames to get stable FPS
    for (let i = 0; i < 60; i++) {
      engine.tick();
    }

    const stats = engine.getStats();

    expect(stats.fps).toBeGreaterThan(0);
    expect(stats.frameTime).toBeGreaterThan(0);
    expect(stats.entityCount).toBe(100);
    expect(stats.systemCount).toBe(2);
  });
});

describe('E2E: World Management', () => {
  let world: World | null = null;

  beforeEach(() => {
    world = new World({ initialEntityCapacity: 1024 });
    world.init();
    world.start();
  });

  afterEach(() => {
    if (world) {
      world.destroy();
      world = null;
    }
  });

  it('should create and destroy entities efficiently', () => {
    const entities: number[] = [];

    // Create 1000 entities
    for (let i = 0; i < 1000; i++) {
      const entity = world!.createEntity();
      entities.push(entity);
    }

    expect(world!.entityCount).toBe(1000);

    // Destroy all entities
    for (const entity of entities) {
      world!.destroyEntity(entity);
    }

    expect(world!.entityCount).toBe(0);
  });

  it('should handle component addition and removal', () => {
    const entity = world!.createEntity();

    expect(world!.hasComponent(entity, TransformComponent)).toBe(false);

    world!.addComponent(entity, new TransformComponent());
    expect(world!.hasComponent(entity, TransformComponent)).toBe(true);

    const transform = world!.getComponent(entity, TransformComponent);
    expect(transform).toBeDefined();
    expect(transform!.position).toBeDefined();

    world!.removeComponent(entity, TransformComponent);
    expect(world!.hasComponent(entity, TransformComponent)).toBe(false);
  });

  it('should maintain entity identity across operations', () => {
    const entity = world!.createEntity();
    const entityId = entity;

    world!.addComponent(entity, new TransformComponent());

    // Entity ID should remain the same
    expect(entity).toBe(entityId);

    // Should still be alive
    expect(world!.isAlive(entity)).toBe(true);

    world!.destroyEntity(entity);

    // Should no longer be alive
    expect(world!.isAlive(entity)).toBe(false);
  });

  it('should support clear operation', () => {
    // Create entities
    for (let i = 0; i < 100; i++) {
      const entity = world!.createEntity();
      world!.addComponent(entity, new TransformComponent());
    }

    expect(world!.entityCount).toBe(100);

    // Clear world
    world!.clear();

    expect(world!.entityCount).toBe(0);
    expect(world!.time).toBe(0);
    expect(world!.frameCount).toBe(0);
  });
});
