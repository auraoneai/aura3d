import { describe, it, expect, beforeEach } from 'vitest';
import {
  NaiveBroadPhase,
  SweepAndPruneBroadPhase,
  BVHBroadPhase,
  StandardNarrowPhase,
  CollisionFilter,
  CollisionDetector,
  ContactGenerator
} from '../../../physics/CollisionDetection';
import { RigidBody, BodyType } from '../../../physics/RigidBody';
import { Collider, CollisionLayer } from '../../../physics/Collider';
import { SphereShape } from '../../../physics/shapes/SphereShape';
import { BoxShape } from '../../../physics/shapes/BoxShape';
import { Vector3 } from '../../../math/Vector3';

describe('CollisionDetection', () => {
  describe('NaiveBroadPhase', () => {
    let broadPhase: NaiveBroadPhase;
    let bodies: RigidBody[];

    beforeEach(() => {
      broadPhase = new NaiveBroadPhase();
      bodies = [];
    });

    it('initializes with empty pairs', () => {
      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('finds overlapping bodies', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(1);
    });

    it('does not find separated bodies', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(10, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('skips two static bodies', () => {
      const body1 = new RigidBody({ type: BodyType.Static, position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ type: BodyType.Static, position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('skips two sleeping bodies', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));
      body1.sleep();

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));
      body2.sleep();

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('finds multiple overlaps', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(2) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(2) }));

      const body3 = new RigidBody({ position: new Vector3(0, 1, 0) });
      body3.addCollider(new Collider({ shape: new SphereShape(2) }));

      bodies.push(body1, body2, body3);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs().length).toBe(3);
    });

    it('clear() removes all pairs', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);
      broadPhase.clear();

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('handles bodies without colliders', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });

      bodies.push(body1, body2);

      expect(() => {
        broadPhase.update(bodies);
      }).not.toThrow();

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('handles empty body list', () => {
      broadPhase.update([]);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('handles single body', () => {
      const body = new RigidBody({ position: new Vector3(0, 0, 0) });
      body.addCollider(new Collider({ shape: new SphereShape(1) }));

      broadPhase.update([body]);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });
  });

  describe('SweepAndPruneBroadPhase', () => {
    let broadPhase: SweepAndPruneBroadPhase;
    let bodies: RigidBody[];

    beforeEach(() => {
      broadPhase = new SweepAndPruneBroadPhase();
      bodies = [];
    });

    it('initializes with default X axis', () => {
      expect(broadPhase).toBeDefined();
    });

    it('can be created with different axes', () => {
      const bpX = new SweepAndPruneBroadPhase('x');
      const bpY = new SweepAndPruneBroadPhase('y');
      const bpZ = new SweepAndPruneBroadPhase('z');

      expect(bpX).toBeDefined();
      expect(bpY).toBeDefined();
      expect(bpZ).toBeDefined();
    });

    it('finds overlapping bodies', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(1);
    });

    it('setAxis() changes sort axis', () => {
      broadPhase.setAxis('y');

      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(0, 1, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(1);
    });

    it('handles many bodies efficiently', () => {
      for (let i = 0; i < 100; i++) {
        const body = new RigidBody({ position: new Vector3(i * 0.5, 0, 0) });
        body.addCollider(new Collider({ shape: new SphereShape(1) }));
        bodies.push(body);
      }

      expect(() => {
        broadPhase.update(bodies);
      }).not.toThrow();
    });

    it('skips static-static pairs', () => {
      const body1 = new RigidBody({ type: BodyType.Static, position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ type: BodyType.Static, position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('clear() removes pairs', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);
      broadPhase.clear();

      expect(broadPhase.getPairs()).toHaveLength(0);
    });
  });

  describe('BVHBroadPhase', () => {
    let broadPhase: BVHBroadPhase;
    let bodies: RigidBody[];

    beforeEach(() => {
      broadPhase = new BVHBroadPhase();
      bodies = [];
    });

    it('finds overlapping bodies', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(1);
    });

    it('handles empty body list', () => {
      broadPhase.update([]);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('builds BVH for many bodies', () => {
      for (let i = 0; i < 50; i++) {
        const body = new RigidBody({
          position: new Vector3(
            Math.random() * 100,
            Math.random() * 100,
            Math.random() * 100
          )
        });
        body.addCollider(new Collider({ shape: new SphereShape(1) }));
        bodies.push(body);
      }

      expect(() => {
        broadPhase.update(bodies);
      }).not.toThrow();
    });

    it('skips static-static pairs', () => {
      const body1 = new RigidBody({ type: BodyType.Static, position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ type: BodyType.Static, position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('clear() removes tree and pairs', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      broadPhase.update(bodies);
      broadPhase.clear();

      expect(broadPhase.getPairs()).toHaveLength(0);
    });

    it('avoids duplicate pairs', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(2) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(2) }));

      const body3 = new RigidBody({ position: new Vector3(0, 1, 0) });
      body3.addCollider(new Collider({ shape: new SphereShape(2) }));

      bodies.push(body1, body2, body3);
      broadPhase.update(bodies);

      const pairs = broadPhase.getPairs();
      const pairSet = new Set(pairs.map(([a, b]) => `${a === body1 ? 'a' : a === body2 ? 'b' : 'c'}-${b === body1 ? 'a' : b === body2 ? 'b' : 'c'}`));

      expect(pairSet.size).toBe(pairs.length);
    });
  });

  describe('StandardNarrowPhase', () => {
    let narrowPhase: StandardNarrowPhase;

    beforeEach(() => {
      narrowPhase = new StandardNarrowPhase();
    });

    it('detects sphere-sphere collision', () => {
      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(1, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).not.toBeNull();
      expect(contacts!.length).toBeGreaterThan(0);
    });

    it('detects no collision when separated', () => {
      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(10, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).toBeNull();
    });

    it('generates contact points', () => {
      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(1, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).not.toBeNull();
      expect(contacts![0]).toHaveProperty('point');
      expect(contacts![0]).toHaveProperty('normal');
      expect(contacts![0]).toHaveProperty('penetration');
    });

    it('contact normal is normalized', () => {
      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(1, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).not.toBeNull();
      const normalLength = contacts![0].normal.length();
      expect(normalLength).toBeCloseTo(1, 5);
    });

    it('penetration is positive for overlapping shapes', () => {
      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(0.5, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).not.toBeNull();
      expect(contacts![0].penetration).toBeGreaterThan(0);
    });

    it('handles box-box collision', () => {
      const colliderA = new Collider({ shape: new BoxShape(Vector3.one()) });
      const colliderB = new Collider({ shape: new BoxShape(Vector3.one()) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(1, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).not.toBeNull();
    });

    it('handles box-sphere collision', () => {
      const colliderA = new Collider({ shape: new BoxShape(Vector3.one()) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const transformA = new RigidBody({ position: new Vector3(0, 0, 0) }).getWorldMatrix();
      const transformB = new RigidBody({ position: new Vector3(1, 0, 0) }).getWorldMatrix();

      const contacts = narrowPhase.testCollision(colliderA, colliderB, transformA, transformB);

      expect(contacts).not.toBeNull();
    });
  });

  describe('CollisionFilter', () => {
    let filter: CollisionFilter;

    beforeEach(() => {
      filter = new CollisionFilter();
    });

    it('allows all collisions by default', () => {
      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      expect(filter.canCollide(colliderA, colliderB)).toBe(true);
    });

    it('setLayerMask() configures layer interactions', () => {
      filter.setLayerMask(CollisionLayer.Player, 1 << CollisionLayer.Enemy);

      const mask = filter.getLayerMask(CollisionLayer.Player);
      expect(mask).toBe(1 << CollisionLayer.Enemy);
    });

    it('filters collisions based on layer mask', () => {
      filter.setLayerMask(CollisionLayer.Player, 0);

      const playerCollider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player
      });

      const enemyCollider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Enemy
      });

      expect(filter.canCollide(playerCollider, enemyCollider)).toBe(false);
    });

    it('allows collision when masks match', () => {
      filter.setLayerMask(CollisionLayer.Player, 1 << CollisionLayer.Enemy);
      filter.setLayerMask(CollisionLayer.Enemy, 1 << CollisionLayer.Player);

      const playerCollider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player
      });

      const enemyCollider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Enemy
      });

      expect(filter.canCollide(playerCollider, enemyCollider)).toBe(true);
    });

    it('getLayerMask() returns default for unset layers', () => {
      const mask = filter.getLayerMask(99);
      expect(mask).toBe(0xFFFFFFFF);
    });
  });

  describe('ContactGenerator', () => {
    let generator: ContactGenerator;
    let narrowPhase: StandardNarrowPhase;

    beforeEach(() => {
      generator = new ContactGenerator();
      narrowPhase = new StandardNarrowPhase();
    });

    it('generates contacts for colliding bodies', () => {
      const bodyA = new RigidBody({ position: new Vector3(0, 0, 0) });
      const bodyB = new RigidBody({ position: new Vector3(1, 0, 0) });

      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const contacts = generator.generateContacts(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        bodyA.getWorldMatrix(),
        bodyB.getWorldMatrix(),
        narrowPhase
      );

      expect(contacts).not.toBeNull();
    });

    it('caches contacts', () => {
      const bodyA = new RigidBody({ position: new Vector3(0, 0, 0) });
      const bodyB = new RigidBody({ position: new Vector3(1, 0, 0) });

      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      generator.generateContacts(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        bodyA.getWorldMatrix(),
        bodyB.getWorldMatrix(),
        narrowPhase
      );

      const cached = generator.getCachedContacts(bodyA, bodyB);
      expect(cached).not.toBeNull();
    });

    it('clear() removes cached contacts', () => {
      const bodyA = new RigidBody({ position: new Vector3(0, 0, 0) });
      const bodyB = new RigidBody({ position: new Vector3(1, 0, 0) });

      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      generator.generateContacts(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        bodyA.getWorldMatrix(),
        bodyB.getWorldMatrix(),
        narrowPhase
      );

      generator.clear();

      const cached = generator.getCachedContacts(bodyA, bodyB);
      expect(cached).toBeNull();
    });

    it('returns null for non-colliding bodies', () => {
      const bodyA = new RigidBody({ position: new Vector3(0, 0, 0) });
      const bodyB = new RigidBody({ position: new Vector3(10, 0, 0) });

      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      const contacts = generator.generateContacts(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        bodyA.getWorldMatrix(),
        bodyB.getWorldMatrix(),
        narrowPhase
      );

      expect(contacts).toBeNull();
    });
  });

  describe('CollisionDetector', () => {
    let detector: CollisionDetector;
    let bodies: RigidBody[];

    beforeEach(() => {
      detector = new CollisionDetector();
      bodies = [];
    });

    it('initializes with default broad and narrow phases', () => {
      expect(detector.broadPhase).toBeDefined();
      expect(detector.narrowPhase).toBeDefined();
      expect(detector.filter).toBeDefined();
    });

    it('can be created with custom phases', () => {
      const customDetector = new CollisionDetector({
        broadPhase: new BVHBroadPhase(),
        narrowPhase: new StandardNarrowPhase()
      });

      expect(customDetector.broadPhase).toBeDefined();
    });

    it('detectCollisions() finds manifolds', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      detector.detectCollisions(bodies);

      const manifolds = detector.getManifolds();
      expect(manifolds.length).toBeGreaterThan(0);
    });

    it('manifolds contain contact information', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      detector.detectCollisions(bodies);

      const manifolds = detector.getManifolds();
      expect(manifolds[0]).toHaveProperty('bodyA');
      expect(manifolds[0]).toHaveProperty('bodyB');
      expect(manifolds[0]).toHaveProperty('contacts');
      expect(manifolds[0]).toHaveProperty('normal');
      expect(manifolds[0]).toHaveProperty('penetration');
    });

    it('respects collision filters', () => {
      detector.filter.setLayerMask(CollisionLayer.Player, 0);

      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player
      }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Enemy
      }));

      bodies.push(body1, body2);
      detector.detectCollisions(bodies);

      expect(detector.getManifolds()).toHaveLength(0);
    });

    it('clear() removes manifolds', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(1) }));

      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(1) }));

      bodies.push(body1, body2);
      detector.detectCollisions(bodies);
      detector.clear();

      expect(detector.getManifolds()).toHaveLength(0);
    });

    it('handles multiple colliders per body', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      body1.addCollider(new Collider({ shape: new SphereShape(0.5) }));
      body1.addCollider(new Collider({ shape: new SphereShape(0.5) }));

      const body2 = new RigidBody({ position: new Vector3(0.5, 0, 0) });
      body2.addCollider(new Collider({ shape: new SphereShape(0.5) }));

      bodies.push(body1, body2);
      detector.detectCollisions(bodies);

      const manifolds = detector.getManifolds();
      expect(manifolds.length).toBeGreaterThan(0);
    });

    it('handles empty body list', () => {
      expect(() => {
        detector.detectCollisions([]);
      }).not.toThrow();

      expect(detector.getManifolds()).toHaveLength(0);
    });

    it('handles bodies without colliders', () => {
      const body1 = new RigidBody({ position: new Vector3(0, 0, 0) });
      const body2 = new RigidBody({ position: new Vector3(1, 0, 0) });

      bodies.push(body1, body2);

      expect(() => {
        detector.detectCollisions(bodies);
      }).not.toThrow();

      expect(detector.getManifolds()).toHaveLength(0);
    });
  });

  describe('persistent contacts', () => {
    it('contact generator maintains contacts across frames', () => {
      const generator = new ContactGenerator();
      const narrowPhase = new StandardNarrowPhase();

      const bodyA = new RigidBody({ position: new Vector3(0, 0, 0) });
      const bodyB = new RigidBody({ position: new Vector3(1, 0, 0) });

      const colliderA = new Collider({ shape: new SphereShape(1) });
      const colliderB = new Collider({ shape: new SphereShape(1) });

      generator.generateContacts(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        bodyA.getWorldMatrix(),
        bodyB.getWorldMatrix(),
        narrowPhase
      );

      const contacts1 = generator.getCachedContacts(bodyA, bodyB);

      generator.generateContacts(
        bodyA,
        bodyB,
        colliderA,
        colliderB,
        bodyA.getWorldMatrix(),
        bodyB.getWorldMatrix(),
        narrowPhase
      );

      const contacts2 = generator.getCachedContacts(bodyA, bodyB);

      expect(contacts1).not.toBeNull();
      expect(contacts2).not.toBeNull();
    });
  });
});
