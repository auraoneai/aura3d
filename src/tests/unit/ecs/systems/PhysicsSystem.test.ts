/**
 * @fileoverview Unit tests for PhysicsSystem.
 * Tests physics world sync, transform updates, collision events, and fixed timestep updates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

class PhysicsSystem {
  name = 'PhysicsSystem';
  priority = 100;
  enabled = true;
  world: any;
  physicsWorld: any;
  fixedTimeStep = 1 / 60;
  maxSubSteps = 5;
  accumulator = 0;
  collisionEvents: Array<{ entityA: number; entityB: number; type: string }> = [];

  constructor(world: any, physicsWorld: any) {
    this.world = world;
    this.physicsWorld = physicsWorld;
  }

  onInit() {
    this.accumulator = 0;
    this.collisionEvents = [];
  }

  update(context: any) {
    this.accumulator += context.deltaTime;

    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      this.fixedUpdate(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
      steps++;
    }
  }

  fixedUpdate(deltaTime: number) {
    this.syncToPhysics();
    this.physicsWorld.step(deltaTime);
    this.syncFromPhysics();
    this.processCollisions();
  }

  private syncToPhysics() {
    const entities = this.world.entityManager.getAliveEntities();

    for (const entity of entities) {
      const transform = this.world.entityManager.getComponent(entity, 'TransformComponent');
      const rigidBody = this.world.entityManager.getComponent(entity, 'RigidBodyComponent');

      if (transform && rigidBody && rigidBody.bodyType === 'kinematic') {
        this.physicsWorld.setBodyPosition(entity, transform.position);
        this.physicsWorld.setBodyRotation(entity, transform.rotation);
      }
    }
  }

  private syncFromPhysics() {
    const entities = this.world.entityManager.getAliveEntities();

    for (const entity of entities) {
      const transform = this.world.entityManager.getComponent(entity, 'TransformComponent');
      const rigidBody = this.world.entityManager.getComponent(entity, 'RigidBodyComponent');

      if (transform && rigidBody && rigidBody.bodyType === 'dynamic') {
        const physicsTransform = this.physicsWorld.getBodyTransform(entity);
        if (physicsTransform) {
          transform.position.set(
            physicsTransform.position.x,
            physicsTransform.position.y,
            physicsTransform.position.z
          );
          transform.rotation.set(
            physicsTransform.rotation.x,
            physicsTransform.rotation.y,
            physicsTransform.rotation.z,
            physicsTransform.rotation.w
          );
          transform.setDirty();
        }
      }
    }
  }

  private processCollisions() {
    const collisions = this.physicsWorld.getCollisions();

    this.collisionEvents = [];
    for (const collision of collisions) {
      this.collisionEvents.push({
        entityA: collision.entityA,
        entityB: collision.entityB,
        type: collision.type
      });
    }
  }

  applyForce(entity: number, force: [number, number, number]) {
    const rigidBody = this.world.entityManager.getComponent(entity, 'RigidBodyComponent');
    if (rigidBody && rigidBody.bodyType === 'dynamic') {
      rigidBody.applyForce(force[0], force[1], force[2]);
      this.physicsWorld.applyForce(entity, force);
    }
  }

  applyImpulse(entity: number, impulse: [number, number, number]) {
    const rigidBody = this.world.entityManager.getComponent(entity, 'RigidBodyComponent');
    if (rigidBody && rigidBody.bodyType === 'dynamic') {
      rigidBody.applyImpulse(impulse[0], impulse[1], impulse[2]);
      this.physicsWorld.applyImpulse(entity, impulse);
    }
  }

  setGravity(x: number, y: number, z: number) {
    this.physicsWorld.setGravity({ x, y, z });
  }

  raycast(origin: any, direction: any, maxDistance: number) {
    return this.physicsWorld.raycast(origin, direction, maxDistance);
  }

  getCollisionEvents() {
    return this.collisionEvents;
  }

  setTimeStep(timeStep: number) {
    this.fixedTimeStep = Math.max(1 / 240, Math.min(timeStep, 1 / 30));
  }

  setMaxSubSteps(maxSteps: number) {
    this.maxSubSteps = Math.max(1, Math.min(maxSteps, 10));
  }
}

class MockPhysicsWorld {
  gravity = { x: 0, y: -9.81, z: 0 };
  bodies = new Map();
  collisions: any[] = [];

  step = vi.fn((deltaTime: number) => {
    for (const [entity, body] of this.bodies) {
      if (body.type === 'dynamic') {
        body.position.y += this.gravity.y * deltaTime * 0.5;
      }
    }
  });

  setBodyPosition(entity: number, position: any) {
    const body = this.bodies.get(entity) || { position: {}, rotation: {}, type: 'dynamic' };
    body.position = { ...position };
    this.bodies.set(entity, body);
  }

  setBodyRotation(entity: number, rotation: any) {
    const body = this.bodies.get(entity) || { position: {}, rotation: {}, type: 'dynamic' };
    body.rotation = { ...rotation };
    this.bodies.set(entity, body);
  }

  getBodyTransform(entity: number) {
    return this.bodies.get(entity);
  }

  applyForce = vi.fn();
  applyImpulse = vi.fn();

  setGravity(gravity: any) {
    this.gravity = gravity;
  }

  raycast(origin: any, direction: any, maxDistance: number) {
    return { hit: false, entity: null, distance: 0, point: null, normal: null };
  }

  getCollisions() {
    return this.collisions;
  }

  addCollision(entityA: number, entityB: number, type: string) {
    this.collisions.push({ entityA, entityB, type });
  }

  clearCollisions() {
    this.collisions = [];
  }
}

class MockWorld {
  entityManager = {
    entities: new Map(),
    getAliveEntities() { return Array.from(this.entities.keys()); },
    getComponent(entity: number, type: string) {
      return this.entities.get(entity)?.[type];
    }
  };

  createEntity() {
    const id = Math.floor(Math.random() * 100000);
    this.entityManager.entities.set(id, {});
    return id;
  }

  addComponent(entity: number, type: string, data: any) {
    const components = this.entityManager.entities.get(entity);
    if (components) {
      components[type] = data;
    }
    return data;
  }
}

describe('PhysicsSystem', () => {
  let world: MockWorld;
  let physicsWorld: MockPhysicsWorld;
  let system: PhysicsSystem;

  beforeEach(() => {
    world = new MockWorld();
    physicsWorld = new MockPhysicsWorld();
    system = new PhysicsSystem(world, physicsWorld);
    system.onInit();
  });

  describe('initialization', () => {
    it('creates with correct name', () => {
      expect(system.name).toBe('PhysicsSystem');
    });

    it('has correct priority for early update', () => {
      expect(system.priority).toBe(100);
    });

    it('is enabled by default', () => {
      expect(system.enabled).toBe(true);
    });

    it('initializes with default fixed timestep', () => {
      expect(system.fixedTimeStep).toBeCloseTo(1 / 60);
    });

    it('onInit() resets accumulator', () => {
      system.accumulator = 0.5;
      system.onInit();

      expect(system.accumulator).toBe(0);
    });

    it('onInit() clears collision events', () => {
      system.collisionEvents = [{ entityA: 1, entityB: 2, type: 'enter' }];
      system.onInit();

      expect(system.collisionEvents.length).toBe(0);
    });
  });

  describe('fixed timestep updates', () => {
    it('update() accumulates delta time', () => {
      const context = { deltaTime: 0.016 };
      system.update(context);

      expect(system.accumulator).toBeGreaterThan(0);
    });

    it('update() steps physics at fixed intervals', () => {
      const context = { deltaTime: 0.032 };
      system.update(context);

      expect(physicsWorld.step).toHaveBeenCalled();
    });

    it('update() performs multiple substeps for large delta', () => {
      const context = { deltaTime: 0.1 };
      system.update(context);

      expect(physicsWorld.step.mock.calls.length).toBeGreaterThan(1);
    });

    it('update() limits substeps to maxSubSteps', () => {
      system.maxSubSteps = 3;
      const context = { deltaTime: 1.0 };

      system.update(context);

      expect(physicsWorld.step.mock.calls.length).toBeLessThanOrEqual(3);
    });

    it('setTimeStep() updates fixed timestep', () => {
      system.setTimeStep(1 / 120);
      expect(system.fixedTimeStep).toBeCloseTo(1 / 120);
    });

    it('setTimeStep() clamps to valid range', () => {
      system.setTimeStep(0.001);
      expect(system.fixedTimeStep).toBeGreaterThanOrEqual(1 / 240);

      system.setTimeStep(1);
      expect(system.fixedTimeStep).toBeLessThanOrEqual(1 / 30);
    });

    it('setMaxSubSteps() updates max substeps', () => {
      system.setMaxSubSteps(8);
      expect(system.maxSubSteps).toBe(8);
    });

    it('setMaxSubSteps() clamps to valid range', () => {
      system.setMaxSubSteps(0);
      expect(system.maxSubSteps).toBeGreaterThanOrEqual(1);

      system.setMaxSubSteps(20);
      expect(system.maxSubSteps).toBeLessThanOrEqual(10);
    });
  });

  describe('transform sync to physics', () => {
    it('syncs kinematic body positions to physics', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'TransformComponent', {
        position: { x: 10, y: 20, z: 30 },
        setDirty: () => {}
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'kinematic'
      });

      system.fixedUpdate(1 / 60);

      const body = physicsWorld.bodies.get(entity);
      expect(body.position.x).toBe(10);
      expect(body.position.y).toBe(20);
      expect(body.position.z).toBe(30);
    });

    it('syncs kinematic body rotations to physics', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'TransformComponent', {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0.707, z: 0, w: 0.707 },
        setDirty: () => {}
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'kinematic'
      });

      system.fixedUpdate(1 / 60);

      const body = physicsWorld.bodies.get(entity);
      expect(body.rotation.y).toBeCloseTo(0.707);
    });

    it('does not sync dynamic bodies to physics', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'TransformComponent', {
        position: { x: 10, y: 20, z: 30 },
        setDirty: () => {}
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic'
      });

      physicsWorld.setBodyPosition(entity, { x: 0, y: 0, z: 0 });
      system.fixedUpdate(1 / 60);

      const body = physicsWorld.bodies.get(entity);
      expect(body.position.x).not.toBe(10);
    });
  });

  describe('transform sync from physics', () => {
    it('syncs dynamic body positions from physics', () => {
      const entity = world.createEntity();
      const transform = world.addComponent(entity, 'TransformComponent', {
        position: { x: 0, y: 0, z: 0, set: vi.fn() },
        rotation: { set: vi.fn() },
        setDirty: vi.fn()
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic'
      });

      physicsWorld.setBodyPosition(entity, { x: 5, y: 10, z: 15 });
      physicsWorld.setBodyRotation(entity, { x: 0, y: 0, z: 0, w: 1 });
      physicsWorld.bodies.get(entity)!.type = 'dynamic';

      system.fixedUpdate(1 / 60);

      expect(transform.position.set).toHaveBeenCalledWith(5, 10, 15);
      expect(transform.setDirty).toHaveBeenCalled();
    });

    it('syncs dynamic body rotations from physics', () => {
      const entity = world.createEntity();
      const transform = world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { x: 0, y: 0, z: 0, w: 1, set: vi.fn() },
        setDirty: vi.fn()
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic'
      });

      physicsWorld.setBodyPosition(entity, { x: 0, y: 0, z: 0 });
      physicsWorld.setBodyRotation(entity, { x: 0, y: 0.707, z: 0, w: 0.707 });
      physicsWorld.bodies.get(entity)!.type = 'dynamic';

      system.fixedUpdate(1 / 60);

      expect(transform.rotation.set).toHaveBeenCalledWith(0, 0.707, 0, 0.707);
    });

    it('does not sync kinematic bodies from physics', () => {
      const entity = world.createEntity();
      const transform = world.addComponent(entity, 'TransformComponent', {
        position: { x: 10, y: 20, z: 30, set: vi.fn() },
        setDirty: vi.fn()
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'kinematic'
      });

      system.fixedUpdate(1 / 60);

      expect(transform.position.set).not.toHaveBeenCalled();
    });
  });

  describe('force application', () => {
    it('applyForce() applies force to dynamic body', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic',
        applyForce: vi.fn()
      });

      system.applyForce(entity, [10, 0, 0]);

      expect(physicsWorld.applyForce).toHaveBeenCalledWith(entity, [10, 0, 0]);
    });

    it('applyImpulse() applies impulse to dynamic body', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic',
        applyImpulse: vi.fn()
      });

      system.applyImpulse(entity, [5, 0, 0]);

      expect(physicsWorld.applyImpulse).toHaveBeenCalledWith(entity, [5, 0, 0]);
    });

    it('applyForce() ignores static bodies', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'static',
        applyForce: vi.fn()
      });

      system.applyForce(entity, [10, 0, 0]);

      expect(physicsWorld.applyForce).not.toHaveBeenCalled();
    });

    it('applyImpulse() ignores kinematic bodies', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'kinematic',
        applyImpulse: vi.fn()
      });

      system.applyImpulse(entity, [5, 0, 0]);

      expect(physicsWorld.applyImpulse).not.toHaveBeenCalled();
    });
  });

  describe('collision events', () => {
    it('processCollisions() extracts collision events', () => {
      physicsWorld.addCollision(1, 2, 'enter');
      physicsWorld.addCollision(3, 4, 'stay');

      system.fixedUpdate(1 / 60);

      const events = system.getCollisionEvents();
      expect(events.length).toBe(2);
      expect(events[0]).toEqual({ entityA: 1, entityB: 2, type: 'enter' });
      expect(events[1]).toEqual({ entityA: 3, entityB: 4, type: 'stay' });
    });

    it('collision events are cleared each frame', () => {
      physicsWorld.addCollision(1, 2, 'enter');
      system.fixedUpdate(1 / 60);

      physicsWorld.clearCollisions();
      system.fixedUpdate(1 / 60);

      expect(system.getCollisionEvents().length).toBe(0);
    });

    it('handles no collisions', () => {
      system.fixedUpdate(1 / 60);

      expect(system.getCollisionEvents().length).toBe(0);
    });
  });

  describe('gravity', () => {
    it('setGravity() updates physics world gravity', () => {
      system.setGravity(0, -20, 0);

      expect(physicsWorld.gravity.x).toBe(0);
      expect(physicsWorld.gravity.y).toBe(-20);
      expect(physicsWorld.gravity.z).toBe(0);
    });

    it('supports zero gravity', () => {
      system.setGravity(0, 0, 0);

      expect(physicsWorld.gravity.y).toBe(0);
    });

    it('supports non-standard gravity directions', () => {
      system.setGravity(0, 0, -9.81);

      expect(physicsWorld.gravity.z).toBe(-9.81);
    });
  });

  describe('raycasting', () => {
    it('raycast() queries physics world', () => {
      const origin = { x: 0, y: 0, z: 0 };
      const direction = { x: 0, y: 0, z: 1 };

      const result = system.raycast(origin, direction, 100);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('hit');
    });

    it('raycast() returns hit information', () => {
      const origin = { x: 0, y: 0, z: 0 };
      const direction = { x: 0, y: 0, z: 1 };

      const result = system.raycast(origin, direction, 100);

      expect(result).toHaveProperty('entity');
      expect(result).toHaveProperty('distance');
      expect(result).toHaveProperty('point');
      expect(result).toHaveProperty('normal');
    });
  });

  describe('performance', () => {
    it('handles many physics bodies efficiently', () => {
      for (let i = 0; i < 1000; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, 'TransformComponent', {
          position: { x: i, y: 0, z: 0, set: () => {} },
          rotation: { set: () => {} },
          setDirty: () => {}
        });
        world.addComponent(entity, 'RigidBodyComponent', {
          bodyType: 'dynamic'
        });
      }

      const start = performance.now();
      system.fixedUpdate(1 / 60);
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });

    it('fixed timestep prevents physics instability', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'TransformComponent', {
        position: { x: 0, y: 100, z: 0, set: () => {} },
        rotation: { set: () => {} },
        setDirty: () => {}
      });
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic'
      });

      const context = { deltaTime: 0.5 };
      system.update(context);

      expect(physicsWorld.step.mock.calls.length).toBeGreaterThan(0);
      expect(physicsWorld.step.mock.calls.length).toBeLessThanOrEqual(system.maxSubSteps);
    });
  });

  describe('edge cases', () => {
    it('handles entities without physics components', () => {
      world.createEntity();
      world.createEntity();

      expect(() => system.fixedUpdate(1 / 60)).not.toThrow();
    });

    it('handles entities with missing transform', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'RigidBodyComponent', {
        bodyType: 'dynamic'
      });

      expect(() => system.fixedUpdate(1 / 60)).not.toThrow();
    });

    it('handles entities with missing rigid body', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'TransformComponent', {
        position: { x: 0, y: 0, z: 0 },
        setDirty: () => {}
      });

      expect(() => system.fixedUpdate(1 / 60)).not.toThrow();
    });

    it('handles zero delta time', () => {
      const context = { deltaTime: 0 };

      expect(() => system.update(context)).not.toThrow();
    });

    it('handles negative delta time', () => {
      const context = { deltaTime: -0.016 };

      expect(() => system.update(context)).not.toThrow();
    });
  });
});
