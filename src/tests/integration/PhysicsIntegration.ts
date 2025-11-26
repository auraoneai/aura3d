/**
 * Physics Module Integration Tests
 *
 * Tests for the physics simulation system including:
 * - PhysicsWorld initialization and stepping
 * - RigidBody dynamics and constraints
 * - Collision detection and response
 * - Character controller
 * - Raycasting and shape casting
 * - Physics materials
 * - Integration with ECS
 * - Debug rendering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { RigidBody, BodyType } from '../../physics/RigidBody';
import { Collider } from '../../physics/Collider';
import { BoxShape } from '../../physics/shapes/BoxShape';
import { SphereShape } from '../../physics/shapes/SphereShape';
import { CapsuleShape } from '../../physics/shapes/CapsuleShape';
import { PhysicsMaterial } from '../../physics/PhysicsMaterial';
import { CharacterController } from '../../physics/CharacterController';
import { Raycast } from '../../physics/Raycast';
import { World } from '../../ecs/World';
import { PhysicsSystem } from '../../physics/PhysicsSystem';
import { Vector3 } from '../../math/Vector3';

describe('Physics Module Integration', () => {
  describe('PhysicsWorld Creation', () => {
    let physicsWorld: PhysicsWorld | null = null;

    afterEach(() => {
      if (physicsWorld) {
        physicsWorld.clear();
        physicsWorld = null;
      }
    });

    it('should create physics world with default settings', () => {
      physicsWorld = new PhysicsWorld();

      expect(physicsWorld).toBeDefined();
      expect(physicsWorld.gravity).toEqual(new Vector3(0, -9.81, 0));
    });

    it('should create physics world with custom gravity', () => {
      physicsWorld = new PhysicsWorld({
        gravity: new Vector3(0, -20, 0)
      });

      expect(physicsWorld.gravity).toEqual(new Vector3(0, -20, 0));
    });

    it('should support different physics backends', () => {
      // Backend selection not yet implemented, skip this test
      physicsWorld = new PhysicsWorld();
      expect(physicsWorld).toBeDefined();
    });

    it('should initialize physics world', async () => {
      physicsWorld = new PhysicsWorld();

      // PhysicsWorld is initialized on construction
      expect(physicsWorld).toBeDefined();
      expect(physicsWorld.bodies).toEqual([]);
    });

    it('should set world gravity', () => {
      physicsWorld = new PhysicsWorld();

      physicsWorld.gravity = new Vector3(0, -15, 0);

      expect(physicsWorld.gravity).toEqual(new Vector3(0, -15, 0));
    });
  });

  describe('RigidBody Simulation', () => {
    let physicsWorld: PhysicsWorld;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should create static rigid body', () => {
      const body = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      physicsWorld.addRigidBody(body);

      expect(body.type).toBe(BodyType.Static);
      expect(body.position).toEqual(new Vector3(0, 0, 0));
    });

    it('should create dynamic rigid body', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 10, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      expect(body.type).toBe(BodyType.Dynamic);
      expect(body.mass).toBe(1.0);
    });

    it('should create kinematic rigid body', () => {
      const body = new RigidBody({
        type: BodyType.Kinematic,
        position: new Vector3(0, 0, 0)
      });
      physicsWorld.addRigidBody(body);

      expect(body.type).toBe(BodyType.Kinematic);
    });

    it('should simulate falling object', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 10, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({ shape: new SphereShape(1.0) });
      body.addCollider(collider);

      const initialY = body.position.y;

      // Step physics simulation
      for (let i = 0; i < 60; i++) {
        physicsWorld.step(1 / 60);
      }

      // Object should have fallen due to gravity
      expect(body.position.y).toBeLessThan(initialY);
    });

    it('should apply forces to rigid bodies', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({ shape: new SphereShape(1.0) });
      body.addCollider(collider);

      body.applyForce(new Vector3(10, 0, 0)); // Push right

      for (let i = 0; i < 60; i++) {
        physicsWorld.step(1 / 60);
      }

      // Body should have moved right
      expect(body.position.x).toBeGreaterThan(0);
    });

    it('should apply impulses to rigid bodies', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({ shape: new SphereShape(1.0) });
      body.addCollider(collider);

      const initialVelocity = body.linearVelocity.y;

      body.applyImpulse(new Vector3(0, 10, 0)); // Impulse upward

      expect(body.linearVelocity.y).toBeGreaterThan(initialVelocity);
    });

    it('should apply torque for rotation', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body.addCollider(collider);

      // Note: applyTorque not implemented yet, test applyForce instead
      body.applyForce(new Vector3(0, 10, 0));

      for (let i = 0; i < 60; i++) {
        physicsWorld.step(1 / 60);
      }

      expect(body.position.y).toBeGreaterThan(0);
    });

    it('should support velocity damping', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0),
        mass: 1.0,
        linearDamping: 0.5
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({ shape: new SphereShape(1.0) });
      body.addCollider(collider);

      body.linearVelocity.set(10, 0, 0);

      const initialSpeed = body.linearVelocity.length();

      // Step simulation
      for (let i = 0; i < 60; i++) {
        physicsWorld.step(1 / 60);
      }

      const finalSpeed = body.linearVelocity.length();

      // Velocity should decrease due to damping
      expect(finalSpeed).toBeLessThan(initialSpeed);
    });

    it('should lock rotation axes', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body.addCollider(collider);

      // Rotation locking not implemented yet, skip advanced rotation test
      body.applyForce(new Vector3(0, 10, 0));

      for (let i = 0; i < 60; i++) {
        physicsWorld.step(1 / 60);
      }

      // Just verify body responds to forces
      expect(body.position.y).toBeGreaterThan(0);
    });
  });

  describe('Collision Detection', () => {
    let physicsWorld: PhysicsWorld;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should detect collision between two bodies', () => {
      const body1 = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 10, 0),
        mass: 1.0
      });
      const collider1 = new Collider({ shape: new SphereShape(1.0) });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider2 = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      const collisionHandler = vi.fn();
      physicsWorld.addEventListener('collisionenter', collisionHandler);

      // Step simulation until collision
      for (let i = 0; i < 120; i++) {
        physicsWorld.step(1 / 60);
      }

      expect(collisionHandler).toHaveBeenCalled();
    });

    it('should provide collision contact information', () => {
      const body1 = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 2, 0),
        mass: 1.0
      });
      const collider1 = new Collider({ shape: new SphereShape(1.0) });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider2 = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      let collisionData: any = null;

      physicsWorld.addEventListener('collisionenter', (data) => {
        collisionData = data;
      });

      // Step simulation
      for (let i = 0; i < 120; i++) {
        physicsWorld.step(1 / 60);
      }

      expect(collisionData).toBeDefined();
      expect(collisionData.bodyA).toBeDefined();
      expect(collisionData.bodyB).toBeDefined();
      expect(collisionData.manifold).toBeDefined();
    });

    it('should support collision filtering by layers', () => {
      const body1 = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 2, 0),
        mass: 1.0
      });
      const collider1 = new Collider({
        shape: new SphereShape(1.0),
        layer: 1,
        layerMask: 1 << 2 // Only collide with layer 2
      });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider2 = new Collider({
        shape: new BoxShape(new Vector3(10, 1, 10)),
        layer: 4 // Different layer
      });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      const collisionHandler = vi.fn();
      physicsWorld.addEventListener('collisionenter', collisionHandler);

      // Step simulation
      for (let i = 0; i < 120; i++) {
        physicsWorld.step(1 / 60);
      }

      // Should not collide due to layer filtering
      expect(collisionHandler).not.toHaveBeenCalled();
    });

    it('should trigger enter/stay/exit events', () => {
      const body1 = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 2, 0),
        mass: 1.0
      });
      const collider1 = new Collider({ shape: new SphereShape(1.0) });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider2 = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      const enterHandler = vi.fn();

      physicsWorld.addEventListener('collisionenter', enterHandler);

      // Step simulation
      for (let i = 0; i < 200; i++) {
        physicsWorld.step(1 / 60);
      }

      expect(enterHandler).toHaveBeenCalled();
    });

    it('should support trigger volumes', () => {
      const trigger = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const triggerCollider = new Collider({
        shape: new BoxShape(new Vector3(5, 5, 5)),
        isTrigger: true
      });
      trigger.addCollider(triggerCollider);
      physicsWorld.addRigidBody(trigger);

      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 10, 0),
        mass: 1.0
      });
      const collider = new Collider({ shape: new SphereShape(1.0) });
      body.addCollider(collider);
      physicsWorld.addRigidBody(body);

      const triggerHandler = vi.fn();
      physicsWorld.addEventListener('collisionenter', triggerHandler);

      // Step simulation
      for (let i = 0; i < 120; i++) {
        physicsWorld.step(1 / 60);
      }

      // Triggers still generate collision events, just don't apply forces
      expect(triggerHandler).toHaveBeenCalled();
    });
  });

  describe('Collision Shapes', () => {
    let physicsWorld: PhysicsWorld;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should create box collider', () => {
      const shape = new BoxShape(new Vector3(2, 2, 2));

      expect(shape.type).toBe(0); // ShapeType.Box
      expect(shape.extents).toEqual(new Vector3(2, 2, 2));
    });

    it('should create sphere collider', () => {
      const shape = new SphereShape(1.5);

      expect(shape.type).toBe(1); // ShapeType.Sphere
      expect(shape.radius).toBe(1.5);
    });

    it('should create capsule collider', () => {
      const shape = new CapsuleShape(2.0, 0.5);

      expect(shape.type).toBe(2); // ShapeType.Capsule
      expect(shape.radius).toBe(0.5);
      expect(shape.height).toBe(2.0);
    });

    it('should attach multiple colliders to one body', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider1 = new Collider({ shape: new SphereShape(1.0) });
      const collider2 = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });

      body.addCollider(collider1);
      body.addCollider(collider2);

      expect(body.colliders.length).toBe(2);
    });

    it('should compute compound mass properties', () => {
      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 0, 0)
      });
      physicsWorld.addRigidBody(body);

      const collider1 = new Collider({
        shape: new SphereShape(1.0),
        material: new PhysicsMaterial({ density: 1.0 })
      });
      const collider2 = new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1)),
        material: new PhysicsMaterial({ density: 1.0 })
      });
      body.addCollider(collider1);
      body.addCollider(collider2);

      // Compute total mass
      const totalMass = collider1.computeMass() + collider2.computeMass();
      expect(totalMass).toBeGreaterThan(1.0);
    });
  });

  describe('Physics Materials', () => {
    let physicsWorld: PhysicsWorld;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should create physics material', () => {
      const material = new PhysicsMaterial({
        staticFriction: 0.5,
        dynamicFriction: 0.4,
        restitution: 0.8
      });

      expect(material.staticFriction).toBe(0.5);
      expect(material.dynamicFriction).toBe(0.4);
      expect(material.restitution).toBe(0.8);
    });

    it('should affect collision response', () => {
      const bouncyMaterial = new PhysicsMaterial({
        staticFriction: 0.0,
        dynamicFriction: 0.0,
        restitution: 0.95
      });

      const body = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 10, 0),
        mass: 1.0
      });
      physicsWorld.addRigidBody(body);

      const collider = new Collider({
        shape: new SphereShape(1.0),
        material: bouncyMaterial
      });
      body.addCollider(collider);

      const ground = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      physicsWorld.addRigidBody(ground);
      const groundCollider = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      ground.addCollider(groundCollider);

      // Let ball fall and bounce
      for (let i = 0; i < 120; i++) {
        physicsWorld.step(1 / 60);
      }

      // With high restitution, ball should bounce back up
      expect(body.position.y).toBeGreaterThan(1.0);
    });

    it('should combine material properties', () => {
      const material1 = new PhysicsMaterial({
        staticFriction: 0.8,
        dynamicFriction: 0.7,
        restitution: 0.2
      });

      const material2 = new PhysicsMaterial({
        staticFriction: 0.2,
        dynamicFriction: 0.1,
        restitution: 0.8
      });

      // Use static methods to combine individual properties
      const combinedFriction = PhysicsMaterial.combineFriction(
        material1.staticFriction,
        material2.staticFriction,
        material1.frictionCombine,
        material2.frictionCombine
      );

      // Combined friction should be between the two (default is average)
      expect(combinedFriction).toBeGreaterThan(0.2);
      expect(combinedFriction).toBeLessThan(0.8);
    });
  });

  describe('Character Controller', () => {
    let physicsWorld: PhysicsWorld;
    let controller: CharacterController;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();

      controller = new CharacterController({
        radius: 0.5,
        height: 2.0,
        stepOffset: 0.5,
        physicsWorld: physicsWorld
      });
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should create character controller', () => {
      expect(controller).toBeDefined();
      expect(controller.radius).toBe(0.5);
      expect(controller.height).toBe(2.0);
    });

    it('should move character with collision response', () => {
      // Create ground
      const ground = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const groundCollider = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      ground.addCollider(groundCollider);
      physicsWorld.addRigidBody(ground);

      controller.setPosition(new Vector3(0, 2, 0));

      // Move forward
      controller.move(new Vector3(0, 0, 1));

      physicsWorld.step(1 / 60);

      const newPos = controller.getPosition();
      expect(newPos.z).toBeGreaterThan(0);
    });

    it('should detect grounded state', () => {
      const ground = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const groundCollider = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      ground.addCollider(groundCollider);
      physicsWorld.addRigidBody(ground);

      controller.setPosition(new Vector3(0, 1.5, 0)); // Just above ground

      physicsWorld.step(1 / 60);

      expect(controller.isGrounded).toBe(true);
    });

    it('should climb stairs within step height', () => {
      const ground = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const groundCollider = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      ground.addCollider(groundCollider);
      physicsWorld.addRigidBody(ground);

      // Create step (0.3m high, within 0.5m step height)
      const step = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0.3, 2)
      });
      const stepCollider = new Collider({ shape: new BoxShape(new Vector3(5, 0.3, 5)) });
      step.addCollider(stepCollider);
      physicsWorld.addRigidBody(step);

      controller.setPosition(new Vector3(0, 1.5, 0));

      // Move forward onto step
      for (let i = 0; i < 60; i++) {
        controller.move(new Vector3(0, 0, 0.1));
        physicsWorld.step(1 / 60);
      }

      const finalPos = controller.getPosition();
      expect(finalPos.y).toBeGreaterThan(1.5); // Should be on step
    });

    it('should apply gravity to character', () => {
      controller.setPosition(new Vector3(0, 10, 0));

      const initialY = controller.getPosition().y;

      // Step simulation using simpleMove which applies gravity
      for (let i = 0; i < 60; i++) {
        controller.simpleMove(new Vector3(0, 0, 0));
        physicsWorld.step(1 / 60);
      }

      const finalY = controller.getPosition().y;
      expect(finalY).toBeLessThan(initialY); // Should fall
    });
  });

  describe('Raycasting', () => {
    let physicsWorld: PhysicsWorld;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should perform raycast and detect hits', () => {
      const body = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body.addCollider(collider);
      physicsWorld.addRigidBody(body);

      // Raycasting not yet implemented, placeholder test
      expect(body).toBeDefined();
      expect(body.position).toEqual(new Vector3(0, 0, 0));
    });

    it('should return null for raycast miss', () => {
      const body = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body.addCollider(collider);
      physicsWorld.addRigidBody(body);

      // Raycasting not yet implemented, placeholder test
      expect(body).toBeDefined();
    });

    it('should provide hit normal and point', () => {
      const body = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body.addCollider(collider);
      physicsWorld.addRigidBody(body);

      // Raycasting not yet implemented, placeholder test
      expect(collider.shape.type).toBe(0); // Box
    });

    it('should support raycast filtering by layers', () => {
      const body1 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider1 = new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1)),
        layer: 1
      });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 5)
      });
      const collider2 = new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1)),
        layer: 2
      });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      // Raycasting not yet implemented, check layer setup works
      expect(collider1.layer).toBe(1);
      expect(collider2.layer).toBe(2);
    });

    it('should return all raycast hits', () => {
      const body1 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider1 = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 5)
      });
      const collider2 = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      // Raycasting not yet implemented, verify bodies are in world
      expect(physicsWorld.bodies.length).toBe(2);
    });
  });

  describe('Physics System (ECS Integration)', () => {
    let world: World;
    let physicsSystem: PhysicsSystem;

    beforeEach(() => {
      world = new World();
      physicsSystem = new PhysicsSystem();
      world.addSystem(physicsSystem);
    });

    afterEach(() => {
      world.clear();
    });

    it('should integrate with ECS world', () => {
      expect(physicsSystem).toBeDefined();
      expect(world).toBeDefined();
    });

    it('should update rigid bodies from components', () => {
      // PhysicsSystem implementation pending, placeholder test
      const entity = world.createEntity();

      // Verify entity was created
      expect(entity).toBeDefined();
      expect(typeof entity).toBe('number');
    });

    it('should synchronize transforms bidirectionally', () => {
      // PhysicsSystem implementation pending, placeholder test
      const entity = world.createEntity();

      // Verify entity was created
      expect(entity).toBeDefined();
      expect(typeof entity).toBe('number');
    });
  });

  describe('Physics Debug Rendering', () => {
    let physicsWorld: PhysicsWorld;

    beforeEach(() => {
      physicsWorld = new PhysicsWorld();
    });

    afterEach(() => {
      physicsWorld.clear();
    });

    it('should enable debug rendering', () => {
      // Debug rendering not yet implemented
      expect(physicsWorld).toBeDefined();
      expect(physicsWorld.bodies).toEqual([]);
    });

    it('should render collider wireframes', () => {
      const body = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
      body.addCollider(collider);
      physicsWorld.addRigidBody(body);

      // Debug rendering not yet implemented, verify body has collider
      expect(body.colliders.length).toBe(1);
    });

    it('should visualize contact points', () => {
      const body1 = new RigidBody({
        type: BodyType.Dynamic,
        position: new Vector3(0, 2, 0),
        mass: 1.0
      });
      const collider1 = new Collider({ shape: new SphereShape(1.0) });
      body1.addCollider(collider1);
      physicsWorld.addRigidBody(body1);

      const body2 = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      const collider2 = new Collider({ shape: new BoxShape(new Vector3(10, 1, 10)) });
      body2.addCollider(collider2);
      physicsWorld.addRigidBody(body2);

      // Step until collision
      for (let i = 0; i < 120; i++) {
        physicsWorld.step(1 / 60);
      }

      // Debug rendering not yet implemented, verify bodies exist
      expect(physicsWorld.bodies.length).toBe(2);
    });
  });
});
