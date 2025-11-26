import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhysicsWorld, CollisionEvent } from '../../../physics/PhysicsWorld';
import { RigidBody, BodyType } from '../../../physics/RigidBody';
import { Collider } from '../../../physics/Collider';
import { BoxShape } from '../../../physics/shapes/BoxShape';
import { SphereShape } from '../../../physics/shapes/SphereShape';
import { Vector3 } from '../../../math/Vector3';
import { PhysicsMaterial } from '../../../physics/PhysicsMaterial';

describe('PhysicsWorld', () => {
  let world: PhysicsWorld;

  beforeEach(() => {
    world = new PhysicsWorld({ gravity: new Vector3(0, -9.81, 0) });
  });

  describe('initialization', () => {
    it('creates with default config', () => {
      const defaultWorld = new PhysicsWorld();
      expect(defaultWorld.gravity.y).toBe(-9.81);
      expect(defaultWorld.fixedTimestep).toBe(1 / 60);
      expect(defaultWorld.maxSubsteps).toBe(5);
      expect(defaultWorld.bodies).toEqual([]);
      expect(defaultWorld.constraints).toEqual([]);
    });

    it('creates with custom gravity', () => {
      const customGravity = new Vector3(0, -20, 0);
      const customWorld = new PhysicsWorld({ gravity: customGravity });
      expect(customWorld.gravity.y).toBe(-20);
    });

    it('creates with custom timestep', () => {
      const customWorld = new PhysicsWorld({ fixedTimestep: 1 / 120 });
      expect(customWorld.fixedTimestep).toBe(1 / 120);
    });

    it('creates with custom max substeps', () => {
      const customWorld = new PhysicsWorld({ maxSubsteps: 10 });
      expect(customWorld.maxSubsteps).toBe(10);
    });

    it('initializes with zero gravity', () => {
      const zeroGravity = new PhysicsWorld({ gravity: Vector3.zero() });
      expect(zeroGravity.gravity.x).toBe(0);
      expect(zeroGravity.gravity.y).toBe(0);
      expect(zeroGravity.gravity.z).toBe(0);
    });
  });

  describe('rigid body management', () => {
    it('addRigidBody() adds body', () => {
      const body = new RigidBody({ mass: 10 });
      world.addRigidBody(body);
      expect(world.bodies).toHaveLength(1);
      expect(world.bodies[0]).toBe(body);
    });

    it('addRigidBody() prevents duplicates', () => {
      const body = new RigidBody({ mass: 10 });
      world.addRigidBody(body);
      world.addRigidBody(body);
      expect(world.bodies).toHaveLength(1);
    });

    it('removeRigidBody() removes body', () => {
      const body = new RigidBody({ mass: 10 });
      world.addRigidBody(body);
      world.removeRigidBody(body);
      expect(world.bodies).toHaveLength(0);
    });

    it('removeRigidBody() handles non-existent body', () => {
      const body = new RigidBody({ mass: 10 });
      world.removeRigidBody(body);
      expect(world.bodies).toHaveLength(0);
    });

    it('handles body deactivation', () => {
      const body = new RigidBody({ mass: 1 });
      body.sleep();
      world.addRigidBody(body);
      expect(body.isSleeping).toBe(true);
      expect(world.getActiveBodies()).toBe(0);
    });

    it('getActiveBodies() counts non-sleeping bodies', () => {
      const body1 = new RigidBody({ mass: 1 });
      const body2 = new RigidBody({ mass: 1 });
      body2.sleep();
      world.addRigidBody(body1);
      world.addRigidBody(body2);
      expect(world.getActiveBodies()).toBe(1);
    });

    it('clear() removes all bodies and constraints', () => {
      const body = new RigidBody({ mass: 10 });
      world.addRigidBody(body);
      world.clear();
      expect(world.bodies).toHaveLength(0);
      expect(world.constraints).toHaveLength(0);
    });
  });

  describe('simulation', () => {
    it('step() advances simulation', () => {
      const body = new RigidBody({
        mass: 1,
        position: new Vector3(0, 10, 0)
      });
      body.addCollider(new Collider({ shape: new SphereShape(1) }));
      world.addRigidBody(body);

      const initialY = body.position.y;
      world.step(1 / 60);

      // Gravity should have moved body down
      expect(body.position.y).toBeLessThan(initialY);
    });

    it('applies gravity correctly', () => {
      const body = new RigidBody({
        mass: 1,
        position: new Vector3(0, 0, 0)
      });
      world.addRigidBody(body);

      const initialVelocity = body.linearVelocity.y;
      world.step(1 / 60);

      // After one timestep, velocity should be negative (falling)
      expect(body.linearVelocity.y).toBeLessThan(initialVelocity);
    });

    it('handles fixed timestep', () => {
      const body = new RigidBody({ mass: 1 });
      world.addRigidBody(body);

      // Step with exact timestep
      world.step(1 / 60);

      // Velocity should reflect one timestep of gravity
      const expectedDeltaV = -9.81 * (1 / 60);
      expect(body.linearVelocity.y).toBeCloseTo(expectedDeltaV, 2);
    });

    it('handles variable timestep with substeps', () => {
      const body = new RigidBody({ mass: 1 });
      world.addRigidBody(body);

      // Large timestep should be broken into substeps
      world.step(0.2); // 12 fixed timesteps worth

      // Should be clamped to maxSubsteps
      expect(body.linearVelocity.y).toBeLessThan(0);
    });

    it('substeps improve stability', () => {
      const world1 = new PhysicsWorld({ maxSubsteps: 1 });
      const world2 = new PhysicsWorld({ maxSubsteps: 5 });

      const body1 = new RigidBody({ mass: 1, position: new Vector3(0, 10, 0) });
      const body2 = new RigidBody({ mass: 1, position: new Vector3(0, 10, 0) });

      world1.addRigidBody(body1);
      world2.addRigidBody(body2);

      // Large timestep
      world1.step(0.1);
      world2.step(0.1);

      // More substeps should result in more accurate simulation
      // Both should fall, but with different precision
      expect(body1.position.y).toBeLessThan(10);
      expect(body2.position.y).toBeLessThan(10);
    });

    it('respects gravityScale on bodies', () => {
      const body1 = new RigidBody({ mass: 1, gravityScale: 1.0 });
      const body2 = new RigidBody({ mass: 1, gravityScale: 2.0 });

      world.addRigidBody(body1);
      world.addRigidBody(body2);

      world.step(1 / 60);

      // body2 should fall twice as fast
      expect(Math.abs(body2.linearVelocity.y)).toBeGreaterThan(Math.abs(body1.linearVelocity.y));
    });

    it('static bodies do not move', () => {
      const staticBody = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      world.addRigidBody(staticBody);

      const initialPosition = staticBody.position.clone();
      world.step(1 / 60);

      expect(staticBody.position.x).toBe(initialPosition.x);
      expect(staticBody.position.y).toBe(initialPosition.y);
      expect(staticBody.position.z).toBe(initialPosition.z);
    });

    it('sleeping bodies do not integrate', () => {
      const body = new RigidBody({ mass: 1 });
      body.sleep();
      world.addRigidBody(body);

      const initialVelocity = body.linearVelocity.clone();
      world.step(1 / 60);

      expect(body.linearVelocity.y).toBe(initialVelocity.y);
    });
  });

  describe('collision detection', () => {
    it('detects box-box collision', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1))
      }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1))
      }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let collisionDetected = false;
      world.addEventListener('collisionenter', () => {
        collisionDetected = true;
      });

      // Boxes are overlapping, should detect collision
      world.step(1 / 60);
      expect(collisionDetected).toBe(true);
    });

    it('detects sphere-sphere collision', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({
        shape: new SphereShape(1)
      }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({
        shape: new SphereShape(1)
      }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let collisionDetected = false;
      world.addEventListener('collisionenter', () => {
        collisionDetected = true;
      });

      world.step(1 / 60);
      expect(collisionDetected).toBe(true);
    });

    it('detects box-sphere collision', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({
        shape: new BoxShape(new Vector3(1, 1, 1))
      }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({
        shape: new SphereShape(0.8)
      }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let collisionDetected = false;
      world.addEventListener('collisionenter', () => {
        collisionDetected = true;
      });

      world.step(1 / 60);
      expect(collisionDetected).toBe(true);
    });

    it('reports contact points', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({
        shape: new SphereShape(1)
      }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({
        shape: new SphereShape(1)
      }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let contactPoint: Vector3 | null = null;
      world.addEventListener('collisionenter', (event: CollisionEvent) => {
        if (event.manifold.contacts.length > 0) {
          contactPoint = event.manifold.contacts[0].point;
        }
      });

      world.step(1 / 60);
      expect(contactPoint).not.toBeNull();
    });

    it('reports contact normals', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({
        shape: new SphereShape(1)
      }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({
        shape: new SphereShape(1)
      }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let contactNormal: Vector3 | null = null;
      world.addEventListener('collisionenter', (event: CollisionEvent) => {
        if (event.manifold.contacts.length > 0) {
          contactNormal = event.manifold.contacts[0].normal;
        }
      });

      world.step(1 / 60);
      expect(contactNormal).not.toBeNull();
      expect(contactNormal!.length()).toBeCloseTo(1, 2);
    });

    it('skips collision between two static bodies', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({ shape: new SphereShape(1) }));

      const bodyB = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 1, 0)
      });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let collisionDetected = false;
      world.addEventListener('collisionenter', () => {
        collisionDetected = true;
      });

      world.step(1 / 60);
      expect(collisionDetected).toBe(false);
    });

    it('skips collision between two sleeping bodies', () => {
      const bodyA = new RigidBody({ mass: 1, position: new Vector3(0, 0, 0) });
      bodyA.addCollider(new Collider({ shape: new SphereShape(1) }));
      bodyA.sleep();

      const bodyB = new RigidBody({ mass: 1, position: new Vector3(0, 1, 0) });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));
      bodyB.sleep();

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let collisionDetected = false;
      world.addEventListener('collisionenter', () => {
        collisionDetected = true;
      });

      world.step(1 / 60);
      expect(collisionDetected).toBe(false);
    });
  });

  describe('collision events', () => {
    it('onCollisionEnter fires on first contact', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({ shape: new SphereShape(1) }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let enterCount = 0;
      world.addEventListener('collisionenter', () => {
        enterCount++;
      });

      world.step(1 / 60);
      expect(enterCount).toBe(1);

      // Second step should not fire again
      world.step(1 / 60);
      expect(enterCount).toBe(1);
    });

    it('provides correct event data', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({ shape: new SphereShape(1) }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      let eventData: CollisionEvent | null = null;
      world.addEventListener('collisionenter', (event: CollisionEvent) => {
        eventData = event;
      });

      world.step(1 / 60);
      expect(eventData).not.toBeNull();
      expect(eventData!.bodyA).toBeDefined();
      expect(eventData!.bodyB).toBeDefined();
      expect(eventData!.manifold).toBeDefined();
      expect(eventData!.manifold.contacts.length).toBeGreaterThan(0);
    });

    it('handles triggers separately', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({
        shape: new SphereShape(1),
        isTrigger: true
      }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1.5, 0)
      });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      const initialVelocity = bodyB.linearVelocity.clone();
      world.step(1 / 60);

      // Trigger should not apply forces, body continues falling
      expect(bodyB.linearVelocity.y).toBeLessThan(initialVelocity.y);
    });
  });

  describe('collision response', () => {
    it('separates overlapping bodies', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({ shape: new SphereShape(1) }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 0.5, 0)
      });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      const initialDistance = bodyB.position.sub(bodyA.position).length();
      world.step(1 / 60);

      const finalDistance = bodyB.position.sub(bodyA.position).length();
      expect(finalDistance).toBeGreaterThan(initialDistance);
    });

    it('applies restitution correctly', () => {
      const floor = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      floor.addCollider(new Collider({
        shape: new BoxShape(new Vector3(10, 0.5, 10)),
        material: new PhysicsMaterial({ restitution: 1.0 })
      }));

      const ball = new RigidBody({
        mass: 1,
        position: new Vector3(0, 2, 0)
      });
      ball.addCollider(new Collider({
        shape: new SphereShape(0.5),
        material: new PhysicsMaterial({ restitution: 1.0 })
      }));
      ball.linearVelocity.set(0, -5, 0);

      world.addRigidBody(floor);
      world.addRigidBody(ball);

      world.step(1 / 60);

      // With perfect restitution, velocity should reverse
      expect(ball.linearVelocity.y).toBeGreaterThan(0);
    });

    it('applies friction between surfaces', () => {
      const ground = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      ground.addCollider(new Collider({
        shape: new BoxShape(new Vector3(10, 0.5, 10)),
        material: new PhysicsMaterial({ staticFriction: 0.8 })
      }));

      const box = new RigidBody({
        mass: 1,
        position: new Vector3(0, 1, 0)
      });
      box.addCollider(new Collider({
        shape: new BoxShape(new Vector3(0.5, 0.5, 0.5)),
        material: new PhysicsMaterial({ dynamicFriction: 0.6 })
      }));
      box.linearVelocity.set(5, 0, 0);

      world.addRigidBody(ground);
      world.addRigidBody(box);

      const initialSpeed = box.linearVelocity.length();
      for (let i = 0; i < 60; i++) {
        world.step(1 / 60);
      }

      // Friction should slow down the box
      expect(box.linearVelocity.length()).toBeLessThan(initialSpeed);
    });
  });

  describe('determinism', () => {
    it('produces same results with same inputs', () => {
      const world1 = new PhysicsWorld({ gravity: new Vector3(0, -9.81, 0) });
      const world2 = new PhysicsWorld({ gravity: new Vector3(0, -9.81, 0) });

      const body1 = new RigidBody({ mass: 1, position: new Vector3(0, 10, 0) });
      const body2 = new RigidBody({ mass: 1, position: new Vector3(0, 10, 0) });

      world1.addRigidBody(body1);
      world2.addRigidBody(body2);

      for (let i = 0; i < 100; i++) {
        world1.step(1 / 60);
        world2.step(1 / 60);
      }

      expect(body1.position.x).toBeCloseTo(body2.position.x, 10);
      expect(body1.position.y).toBeCloseTo(body2.position.y, 10);
      expect(body1.position.z).toBeCloseTo(body2.position.z, 10);
      expect(body1.linearVelocity.y).toBeCloseTo(body2.linearVelocity.y, 10);
    });

    it('handles numerical stability with extreme values', () => {
      const body = new RigidBody({
        mass: 1e-6,
        position: new Vector3(0, 1000, 0)
      });
      world.addRigidBody(body);

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          world.step(1 / 60);
        }
      }).not.toThrow();

      expect(Number.isFinite(body.position.y)).toBe(true);
      expect(Number.isFinite(body.linearVelocity.y)).toBe(true);
    });

    it('maintains stable simulation over many steps', () => {
      const body = new RigidBody({
        mass: 1,
        position: new Vector3(0, 100, 0)
      });
      world.addRigidBody(body);

      for (let i = 0; i < 10000; i++) {
        world.step(1 / 60);
      }

      expect(Number.isFinite(body.position.y)).toBe(true);
      expect(Number.isNaN(body.position.y)).toBe(false);
    });
  });

  describe('energy conservation', () => {
    it('conserves energy in isolated system without damping', () => {
      const isolatedWorld = new PhysicsWorld({ gravity: Vector3.zero() });
      const body = new RigidBody({
        mass: 1,
        position: new Vector3(0, 0, 0),
        linearDamping: 0,
        angularDamping: 0
      });
      body.linearVelocity.set(10, 0, 0);
      isolatedWorld.addRigidBody(body);

      const initialEnergy = 0.5 * body.mass * body.linearVelocity.lengthSquared();

      for (let i = 0; i < 100; i++) {
        isolatedWorld.step(1 / 60);
      }

      const finalEnergy = 0.5 * body.mass * body.linearVelocity.lengthSquared();

      // Energy should be conserved (within numerical precision)
      expect(finalEnergy).toBeCloseTo(initialEnergy, 1);
    });

    it('dissipates energy with damping', () => {
      const body = new RigidBody({
        mass: 1,
        linearDamping: 0.1
      });
      body.linearVelocity.set(10, 0, 0);

      const worldNoDamping = new PhysicsWorld({ gravity: Vector3.zero() });
      worldNoDamping.addRigidBody(body);

      const initialSpeed = body.linearVelocity.length();

      for (let i = 0; i < 100; i++) {
        worldNoDamping.step(1 / 60);
      }

      const finalSpeed = body.linearVelocity.length();
      expect(finalSpeed).toBeLessThan(initialSpeed);
    });
  });

  describe('penetration resolution', () => {
    it('resolves deep penetration', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      bodyA.addCollider(new Collider({ shape: new SphereShape(1) }));

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(0, 0.5, 0)
      });
      bodyB.addCollider(new Collider({ shape: new SphereShape(1) }));

      world.addRigidBody(bodyA);
      world.addRigidBody(bodyB);

      // Run multiple steps to resolve penetration
      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      const distance = bodyB.position.sub(bodyA.position).length();
      const minDistance = 2.0; // Sum of radii

      expect(distance).toBeGreaterThanOrEqual(minDistance * 0.95);
    });

    it('prevents bodies from passing through each other', () => {
      const floor = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });
      floor.addCollider(new Collider({
        shape: new BoxShape(new Vector3(10, 0.5, 10))
      }));

      const ball = new RigidBody({
        mass: 1,
        position: new Vector3(0, 5, 0)
      });
      ball.addCollider(new Collider({ shape: new SphereShape(0.5) }));

      world.addRigidBody(floor);
      world.addRigidBody(ball);

      for (let i = 0; i < 300; i++) {
        world.step(1 / 60);
      }

      // Ball should not pass through floor
      expect(ball.position.y).toBeGreaterThan(-1);
    });
  });
});
