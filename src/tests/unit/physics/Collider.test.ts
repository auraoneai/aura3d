import { describe, it, expect, beforeEach } from 'vitest';
import { Collider, CollisionLayer, AABBUtils } from '../../../physics/Collider';
import { BoxShape } from '../../../physics/shapes/BoxShape';
import { SphereShape } from '../../../physics/shapes/SphereShape';
import { CapsuleShape, CapsuleAxis } from '../../../physics/shapes/CapsuleShape';
import { RigidBody, BodyType } from '../../../physics/RigidBody';
import { PhysicsMaterial, CombineMode } from '../../../physics/PhysicsMaterial';
import { Vector3 } from '../../../math/Vector3';
import { Matrix4 } from '../../../math/Matrix4';

describe('Collider', () => {
  describe('initialization', () => {
    it('creates with required shape', () => {
      const shape = new SphereShape(1);
      const collider = new Collider({ shape });

      expect(collider.shape).toBe(shape);
    });

    it('creates with default material', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      expect(collider.material).toBeDefined();
      expect(collider.material.staticFriction).toBe(0.6);
    });

    it('creates with custom material', () => {
      const material = PhysicsMaterial.rubber();
      const collider = new Collider({
        shape: new SphereShape(1),
        material
      });

      expect(collider.material).toBe(material);
    });

    it('creates as non-trigger by default', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      expect(collider.isTrigger).toBe(false);
    });

    it('creates as trigger when specified', () => {
      const collider = new Collider({
        shape: new SphereShape(1),
        isTrigger: true
      });

      expect(collider.isTrigger).toBe(true);
    });

    it('initializes with default collision layer', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      expect(collider.layer).toBe(CollisionLayer.Default);
    });

    it('initializes with default layer mask', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      expect(collider.layerMask).toBe(0xFFFFFFFF);
    });

    it('initializes with custom layer', () => {
      const collider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player
      });

      expect(collider.layer).toBe(CollisionLayer.Player);
    });

    it('initializes with custom layer mask', () => {
      const mask = (1 << CollisionLayer.Default) | (1 << CollisionLayer.Enemy);
      const collider = new Collider({
        shape: new SphereShape(1),
        layerMask: mask
      });

      expect(collider.layerMask).toBe(mask);
    });
  });

  describe('attachment to rigid body', () => {
    it('can be attached to rigid body', () => {
      const body = new RigidBody();
      const collider = new Collider({ shape: new SphereShape(1) });

      body.addCollider(collider);

      expect(body.colliders).toContain(collider);
    });

    it('multiple colliders can be attached to body', () => {
      const body = new RigidBody();
      const collider1 = new Collider({ shape: new SphereShape(1) });
      const collider2 = new Collider({ shape: new BoxShape(Vector3.one()) });

      body.addCollider(collider1);
      body.addCollider(collider2);

      expect(body.colliders).toHaveLength(2);
    });

    it('can be removed from rigid body', () => {
      const body = new RigidBody();
      const collider = new Collider({ shape: new SphereShape(1) });

      body.addCollider(collider);
      body.removeCollider(collider);

      expect(body.colliders).not.toContain(collider);
    });
  });

  describe('local transform offset', () => {
    it('shape has default zero offset', () => {
      const shape = new SphereShape(1);
      expect(shape.offset.x).toBe(0);
      expect(shape.offset.y).toBe(0);
      expect(shape.offset.z).toBe(0);
    });

    it('shape can have custom offset', () => {
      const offset = new Vector3(0, 2, 0);
      const shape = new SphereShape(1, offset);

      expect(shape.offset.equals(offset)).toBe(true);
    });

    it('offset affects AABB calculation', () => {
      const offsetShape = new SphereShape(1, new Vector3(0, 5, 0));
      const normalShape = new SphereShape(1);

      const collider1 = new Collider({ shape: offsetShape });
      const collider2 = new Collider({ shape: normalShape });

      const transform = Matrix4.identity();
      const aabb1 = collider1.getAABB(transform);
      const aabb2 = collider2.getAABB(transform);

      expect(aabb1.min.y).toBeGreaterThan(aabb2.min.y);
    });

    it('offset works with rotation', () => {
      const shape = new BoxShape(new Vector3(1, 1, 1), new Vector3(2, 0, 0));
      const collider = new Collider({ shape });

      const rotation = Matrix4.rotationY(Math.PI / 2);
      const aabb = collider.getAABB(rotation);

      expect(aabb.min.x).toBeLessThan(0);
      expect(aabb.max.z).toBeGreaterThan(0);
    });
  });

  describe('physics material assignment', () => {
    it('material affects collision response', () => {
      const bouncyMaterial = new PhysicsMaterial({ restitution: 0.9 });
      const deadMaterial = new PhysicsMaterial({ restitution: 0.1 });

      const collider1 = new Collider({
        shape: new SphereShape(1),
        material: bouncyMaterial
      });

      const collider2 = new Collider({
        shape: new SphereShape(1),
        material: deadMaterial
      });

      expect(collider1.material.restitution).toBe(0.9);
      expect(collider2.material.restitution).toBe(0.1);
    });

    it('material can be changed after creation', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const newMaterial = PhysicsMaterial.ice();
      collider.material = newMaterial;

      expect(collider.material).toBe(newMaterial);
    });

    it('computes mass from material density', () => {
      const woodMaterial = new PhysicsMaterial({ density: 700 });
      const shape = new BoxShape(new Vector3(1, 1, 1));
      const collider = new Collider({ shape, material: woodMaterial });

      const mass = collider.computeMass();

      expect(mass).toBeCloseTo(700 * 8, 2);
    });
  });

  describe('isTrigger property', () => {
    it('trigger colliders generate events', () => {
      const triggerCollider = new Collider({
        shape: new SphereShape(1),
        isTrigger: true
      });

      expect(triggerCollider.isTrigger).toBe(true);
    });

    it('non-trigger colliders are solid', () => {
      const solidCollider = new Collider({
        shape: new SphereShape(1),
        isTrigger: false
      });

      expect(solidCollider.isTrigger).toBe(false);
    });

    it('isTrigger can be toggled', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      collider.isTrigger = true;
      expect(collider.isTrigger).toBe(true);

      collider.isTrigger = false;
      expect(collider.isTrigger).toBe(false);
    });
  });

  describe('collision filtering', () => {
    it('setLayer() changes collision layer', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      collider.setLayer(CollisionLayer.Player);

      expect(collider.layer).toBe(CollisionLayer.Player);
    });

    it('setLayerMask() changes layer mask', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const mask = (1 << CollisionLayer.Enemy);
      collider.setLayerMask(mask);

      expect(collider.layerMask).toBe(mask);
    });

    it('addLayerToMask() adds layer to mask', () => {
      const collider = new Collider({
        shape: new SphereShape(1),
        layerMask: 0
      });

      collider.addLayerToMask(CollisionLayer.Player);

      expect(collider.hasLayerInMask(CollisionLayer.Player)).toBe(true);
    });

    it('removeLayerFromMask() removes layer from mask', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      collider.removeLayerFromMask(CollisionLayer.Default);

      expect(collider.hasLayerInMask(CollisionLayer.Default)).toBe(false);
    });

    it('hasLayerInMask() checks layer presence', () => {
      const mask = (1 << CollisionLayer.Player) | (1 << CollisionLayer.Enemy);
      const collider = new Collider({
        shape: new SphereShape(1),
        layerMask: mask
      });

      expect(collider.hasLayerInMask(CollisionLayer.Player)).toBe(true);
      expect(collider.hasLayerInMask(CollisionLayer.Enemy)).toBe(true);
      expect(collider.hasLayerInMask(CollisionLayer.Environment)).toBe(false);
    });

    it('canCollideWith() checks bidirectional filtering', () => {
      const playerCollider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player,
        layerMask: (1 << CollisionLayer.Enemy)
      });

      const enemyCollider = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Enemy,
        layerMask: (1 << CollisionLayer.Player)
      });

      expect(playerCollider.canCollideWith(enemyCollider)).toBe(true);
      expect(enemyCollider.canCollideWith(playerCollider)).toBe(true);
    });

    it('canCollideWith() returns false when not in mask', () => {
      const collider1 = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player,
        layerMask: (1 << CollisionLayer.Environment)
      });

      const collider2 = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Enemy
      });

      expect(collider1.canCollideWith(collider2)).toBe(false);
    });

    it('canCollideWith() requires both masks to match', () => {
      const collider1 = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Player,
        layerMask: (1 << CollisionLayer.Enemy)
      });

      const collider2 = new Collider({
        shape: new SphereShape(1),
        layer: CollisionLayer.Enemy,
        layerMask: 0
      });

      expect(collider1.canCollideWith(collider2)).toBe(false);
    });
  });

  describe('AABB computation', () => {
    it('getAABB() computes bounding box', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const transform = Matrix4.identity();
      const aabb = collider.getAABB(transform);

      expect(aabb.min.x).toBeCloseTo(-1, 5);
      expect(aabb.max.x).toBeCloseTo(1, 5);
    });

    it('getAABB() updates with transform', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const transform = Matrix4.translation(5, 0, 0);
      const aabb = collider.getAABB(transform);

      expect(aabb.min.x).toBeCloseTo(4, 5);
      expect(aabb.max.x).toBeCloseTo(6, 5);
    });

    it('getAABB() caches result', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const transform = Matrix4.identity();
      const aabb1 = collider.getAABB(transform);
      const aabb2 = collider.getAABB(transform);

      expect(aabb1).toBe(aabb2);
    });

    it('markDirty() forces AABB recomputation', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const transform = Matrix4.identity();
      const aabb1 = collider.getAABB(transform);

      collider.markDirty();
      const aabb2 = collider.getAABB(transform);

      expect(aabb1).not.toBe(aabb2);
    });

    it('different shapes produce different AABBs', () => {
      const sphereCollider = new Collider({ shape: new SphereShape(1) });
      const boxCollider = new Collider({ shape: new BoxShape(new Vector3(2, 0.5, 1)) });

      const transform = Matrix4.identity();
      const sphereAABB = sphereCollider.getAABB(transform);
      const boxAABB = boxCollider.getAABB(transform);

      expect(sphereAABB.max.y).toBeGreaterThan(boxAABB.max.y);
    });
  });

  describe('volume and inertia', () => {
    it('getVolume() returns shape volume', () => {
      const shape = new SphereShape(1);
      const collider = new Collider({ shape });

      const volume = collider.getVolume();
      const expectedVolume = (4 / 3) * Math.PI;

      expect(volume).toBeCloseTo(expectedVolume, 2);
    });

    it('computeInertia() computes inertia tensor', () => {
      const shape = new SphereShape(1);
      const collider = new Collider({ shape });

      const inertia = collider.computeInertia(10);

      expect(inertia).toBeDefined();
      expect(inertia.elements[0]).toBeGreaterThan(0);
    });

    it('different shapes have different inertia', () => {
      const sphereCollider = new Collider({ shape: new SphereShape(1) });
      const boxCollider = new Collider({ shape: new BoxShape(new Vector3(1, 1, 1)) });

      const sphereInertia = sphereCollider.computeInertia(10);
      const boxInertia = boxCollider.computeInertia(10);

      expect(sphereInertia.elements[0]).not.toBe(boxInertia.elements[0]);
    });

    it('larger shapes have larger inertia', () => {
      const smallCollider = new Collider({ shape: new SphereShape(1) });
      const largeCollider = new Collider({ shape: new SphereShape(2) });

      const smallInertia = smallCollider.computeInertia(1);
      const largeInertia = largeCollider.computeInertia(1);

      expect(largeInertia.elements[0]).toBeGreaterThan(smallInertia.elements[0]);
    });
  });

  describe('user data', () => {
    it('initializes with null user data', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      expect(collider.userData).toBeNull();
    });

    it('can store user data', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      const data = { id: 123, name: 'Test' };
      collider.userData = data;

      expect(collider.userData).toBe(data);
    });

    it('can store different types of user data', () => {
      const collider = new Collider({ shape: new SphereShape(1) });

      collider.userData = 'string data';
      expect(collider.userData).toBe('string data');

      collider.userData = 42;
      expect(collider.userData).toBe(42);

      collider.userData = { complex: 'object' };
      expect(collider.userData.complex).toBe('object');
    });
  });

  describe('AABBUtils', () => {
    it('create() creates AABB from min/max', () => {
      const min = new Vector3(-1, -2, -3);
      const max = new Vector3(1, 2, 3);

      const aabb = AABBUtils.create(min, max);

      expect(aabb.min).toBe(min);
      expect(aabb.max).toBe(max);
    });

    it('fromCenterAndExtents() creates AABB from center', () => {
      const center = new Vector3(5, 10, 0);
      const extents = new Vector3(1, 2, 3);

      const aabb = AABBUtils.fromCenterAndExtents(center, extents);

      expect(aabb.min.x).toBeCloseTo(4, 5);
      expect(aabb.max.x).toBeCloseTo(6, 5);
      expect(aabb.min.y).toBeCloseTo(8, 5);
      expect(aabb.max.y).toBeCloseTo(12, 5);
    });

    it('overlaps() detects AABB overlap', () => {
      const aabb1 = AABBUtils.create(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const aabb2 = AABBUtils.create(
        new Vector3(0, 0, 0),
        new Vector3(2, 2, 2)
      );

      expect(AABBUtils.overlaps(aabb1, aabb2)).toBe(true);
    });

    it('overlaps() detects no overlap', () => {
      const aabb1 = AABBUtils.create(
        new Vector3(-2, -2, -2),
        new Vector3(-1, -1, -1)
      );

      const aabb2 = AABBUtils.create(
        new Vector3(1, 1, 1),
        new Vector3(2, 2, 2)
      );

      expect(AABBUtils.overlaps(aabb1, aabb2)).toBe(false);
    });

    it('getCenter() computes AABB center', () => {
      const aabb = AABBUtils.create(
        new Vector3(-2, -4, -6),
        new Vector3(2, 4, 6)
      );

      const center = AABBUtils.getCenter(aabb);

      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
      expect(center.z).toBe(0);
    });

    it('getExtents() computes AABB half-size', () => {
      const aabb = AABBUtils.create(
        new Vector3(-2, -4, -6),
        new Vector3(2, 4, 6)
      );

      const extents = AABBUtils.getExtents(aabb);

      expect(extents.x).toBe(2);
      expect(extents.y).toBe(4);
      expect(extents.z).toBe(6);
    });

    it('expandToInclude() expands AABB to include point', () => {
      const aabb = AABBUtils.create(
        new Vector3(-1, -1, -1),
        new Vector3(1, 1, 1)
      );

      const point = new Vector3(5, 0, 0);
      AABBUtils.expandToInclude(aabb, point);

      expect(aabb.max.x).toBe(5);
    });

    it('merge() combines two AABBs', () => {
      const aabb1 = AABBUtils.create(
        new Vector3(-2, -2, -2),
        new Vector3(-1, -1, -1)
      );

      const aabb2 = AABBUtils.create(
        new Vector3(1, 1, 1),
        new Vector3(2, 2, 2)
      );

      const merged = AABBUtils.merge(aabb1, aabb2);

      expect(merged.min.x).toBe(-2);
      expect(merged.max.x).toBe(2);
      expect(merged.min.y).toBe(-2);
      expect(merged.max.y).toBe(2);
    });
  });
});
