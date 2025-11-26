import { describe, it, expect, beforeEach } from 'vitest';
import { RigidBody, BodyType } from '../../../physics/RigidBody';
import { Collider } from '../../../physics/Collider';
import { BoxShape } from '../../../physics/shapes/BoxShape';
import { SphereShape } from '../../../physics/shapes/SphereShape';
import { Vector3 } from '../../../math/Vector3';
import { Quaternion } from '../../../math/Quaternion';
import { Matrix3 } from '../../../math/Matrix3';
import { Matrix4 } from '../../../math/Matrix4';

describe('RigidBody', () => {
  describe('body types', () => {
    it('creates dynamic body by default', () => {
      const body = new RigidBody();
      expect(body.type).toBe(BodyType.Dynamic);
      expect(body.inverseMass).toBeGreaterThan(0);
    });

    it('creates static body', () => {
      const body = new RigidBody({ type: BodyType.Static });
      expect(body.type).toBe(BodyType.Static);
      expect(body.inverseMass).toBe(0);
    });

    it('creates kinematic body', () => {
      const body = new RigidBody({ type: BodyType.Kinematic });
      expect(body.type).toBe(BodyType.Kinematic);
      expect(body.inverseMass).toBe(0);
    });

    it('static body has zero inverse mass', () => {
      const body = new RigidBody({ type: BodyType.Static, mass: 100 });
      expect(body.inverseMass).toBe(0);
    });

    it('kinematic body has zero inverse mass', () => {
      const body = new RigidBody({ type: BodyType.Kinematic, mass: 100 });
      expect(body.inverseMass).toBe(0);
    });

    it('dynamic body has non-zero inverse mass', () => {
      const body = new RigidBody({ type: BodyType.Dynamic, mass: 10 });
      expect(body.inverseMass).toBe(0.1);
    });
  });

  describe('mass and center of mass', () => {
    it('initializes with default mass', () => {
      const body = new RigidBody();
      expect(body.mass).toBe(1.0);
    });

    it('initializes with custom mass', () => {
      const body = new RigidBody({ mass: 50 });
      expect(body.mass).toBe(50);
    });

    it('setMass() updates mass and inverse mass', () => {
      const body = new RigidBody({ mass: 1 });
      body.setMass(10);
      expect(body.mass).toBe(10);
      expect(body.inverseMass).toBeCloseTo(0.1, 5);
    });

    it('setMass() with zero sets infinite mass', () => {
      const body = new RigidBody({ mass: 1 });
      body.setMass(0);
      expect(body.inverseMass).toBe(0);
    });

    it('static body maintains zero inverse mass on setMass', () => {
      const body = new RigidBody({ type: BodyType.Static, mass: 1 });
      body.setMass(100);
      expect(body.inverseMass).toBe(0);
    });

    it('very small mass is handled correctly', () => {
      const body = new RigidBody({ mass: 0.001 });
      expect(body.inverseMass).toBeCloseTo(1000, 2);
    });

    it('very large mass is handled correctly', () => {
      const body = new RigidBody({ mass: 10000 });
      expect(body.inverseMass).toBeCloseTo(0.0001, 6);
    });
  });

  describe('inertia tensor computation', () => {
    it('initializes with identity inertia', () => {
      const body = new RigidBody();
      expect(body.inertia.elements[0]).toBe(1);
      expect(body.inertia.elements[4]).toBe(1);
      expect(body.inertia.elements[8]).toBe(1);
    });

    it('setInertia() updates inertia tensor', () => {
      const body = new RigidBody();
      const inertia = Matrix4.identity();
      inertia.elements[0] = 10;
      inertia.elements[5] = 20;
      inertia.elements[10] = 30;

      body.setInertia(inertia);

      expect(body.inertia.elements[0]).toBe(10);
      expect(body.inertia.elements[4]).toBe(20);
      expect(body.inertia.elements[8]).toBe(30);
    });

    it('computes inverse inertia correctly', () => {
      const body = new RigidBody();
      const inertia = Matrix4.identity();
      inertia.elements[0] = 4;
      inertia.elements[5] = 4;
      inertia.elements[10] = 4;

      body.setInertia(inertia);

      expect(body.inverseInertia.elements[0]).toBeCloseTo(0.25, 5);
      expect(body.inverseInertia.elements[4]).toBeCloseTo(0.25, 5);
      expect(body.inverseInertia.elements[8]).toBeCloseTo(0.25, 5);
    });
  });

  describe('linear velocity', () => {
    it('initializes with zero velocity', () => {
      const body = new RigidBody();
      expect(body.linearVelocity.x).toBe(0);
      expect(body.linearVelocity.y).toBe(0);
      expect(body.linearVelocity.z).toBe(0);
    });

    it('velocity can be set directly', () => {
      const body = new RigidBody();
      body.linearVelocity.set(5, 10, -3);
      expect(body.linearVelocity.x).toBe(5);
      expect(body.linearVelocity.y).toBe(10);
      expect(body.linearVelocity.z).toBe(-3);
    });

    it('integration updates position based on velocity', () => {
      const body = new RigidBody({ position: new Vector3(0, 0, 0) });
      body.linearVelocity.set(10, 0, 0);

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      expect(body.position.x).toBeCloseTo(1, 5);
      expect(body.position.y).toBeCloseTo(0, 5);
    });
  });

  describe('angular velocity', () => {
    it('initializes with zero angular velocity', () => {
      const body = new RigidBody();
      expect(body.angularVelocity.x).toBe(0);
      expect(body.angularVelocity.y).toBe(0);
      expect(body.angularVelocity.z).toBe(0);
    });

    it('angular velocity can be set directly', () => {
      const body = new RigidBody();
      body.angularVelocity.set(1, 2, 3);
      expect(body.angularVelocity.x).toBe(1);
      expect(body.angularVelocity.y).toBe(2);
      expect(body.angularVelocity.z).toBe(3);
    });

    it('integration updates rotation based on angular velocity', () => {
      const body = new RigidBody();
      body.angularVelocity.set(0, Math.PI, 0);

      const dt = 0.01;
      const gravity = Vector3.zero();
      const initialRotation = body.rotation.clone();

      body.integrate(dt, gravity);

      expect(body.rotation.equals(initialRotation)).toBe(false);
    });

    it('rotation remains normalized', () => {
      const body = new RigidBody();
      body.angularVelocity.set(10, 5, 3);

      const dt = 0.1;
      const gravity = Vector3.zero();

      for (let i = 0; i < 100; i++) {
        body.integrate(dt, gravity);
      }

      const length = Math.sqrt(
        body.rotation.x ** 2 +
        body.rotation.y ** 2 +
        body.rotation.z ** 2 +
        body.rotation.w ** 2
      );
      expect(length).toBeCloseTo(1, 5);
    });
  });

  describe('linear damping', () => {
    it('has default linear damping', () => {
      const body = new RigidBody();
      expect(body.linearDamping).toBe(0.01);
    });

    it('custom linear damping can be set', () => {
      const body = new RigidBody({ linearDamping: 0.5 });
      expect(body.linearDamping).toBe(0.5);
    });

    it('damping reduces velocity over time', () => {
      const body = new RigidBody({ linearDamping: 0.1 });
      body.linearVelocity.set(10, 0, 0);

      const initialSpeed = body.linearVelocity.length();
      const dt = 0.1;
      const gravity = Vector3.zero();

      body.integrate(dt, gravity);

      const finalSpeed = body.linearVelocity.length();
      expect(finalSpeed).toBeLessThan(initialSpeed);
    });

    it('zero damping maintains velocity', () => {
      const body = new RigidBody({ linearDamping: 0 });
      body.linearVelocity.set(10, 0, 0);

      const initialSpeed = body.linearVelocity.length();
      const dt = 0.1;
      const gravity = Vector3.zero();

      body.integrate(dt, gravity);

      const finalSpeed = body.linearVelocity.length();
      expect(finalSpeed).toBeCloseTo(initialSpeed, 5);
    });

    it('high damping stops body quickly', () => {
      const body = new RigidBody({ linearDamping: 0.99 });
      body.linearVelocity.set(100, 0, 0);

      const dt = 0.1;
      const gravity = Vector3.zero();

      for (let i = 0; i < 10; i++) {
        body.integrate(dt, gravity);
      }

      expect(body.linearVelocity.length()).toBeLessThan(1);
    });
  });

  describe('angular damping', () => {
    it('has default angular damping', () => {
      const body = new RigidBody();
      expect(body.angularDamping).toBe(0.05);
    });

    it('custom angular damping can be set', () => {
      const body = new RigidBody({ angularDamping: 0.2 });
      expect(body.angularDamping).toBe(0.2);
    });

    it('damping reduces angular velocity over time', () => {
      const body = new RigidBody({ angularDamping: 0.1 });
      body.angularVelocity.set(10, 0, 0);

      const initialSpeed = body.angularVelocity.length();
      const dt = 0.1;
      const gravity = Vector3.zero();

      body.integrate(dt, gravity);

      const finalSpeed = body.angularVelocity.length();
      expect(finalSpeed).toBeLessThan(initialSpeed);
    });

    it('zero damping maintains angular velocity', () => {
      const body = new RigidBody({ angularDamping: 0 });
      body.angularVelocity.set(10, 0, 0);

      const initialSpeed = body.angularVelocity.length();
      const dt = 0.1;
      const gravity = Vector3.zero();

      body.integrate(dt, gravity);

      const finalSpeed = body.angularVelocity.length();
      expect(finalSpeed).toBeCloseTo(initialSpeed, 5);
    });
  });

  describe('force application', () => {
    it('applyForce() changes velocity', () => {
      const body = new RigidBody({ mass: 1 });
      const initialVelocity = body.linearVelocity.clone();

      body.applyForce(new Vector3(0, 100, 0));

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      expect(body.linearVelocity.y).toBeGreaterThan(initialVelocity.y);
    });

    it('applyForce() respects mass', () => {
      const lightBody = new RigidBody({ mass: 1 });
      const heavyBody = new RigidBody({ mass: 10 });

      const force = new Vector3(0, 100, 0);
      lightBody.applyForce(force);
      heavyBody.applyForce(force);

      const dt = 0.1;
      const gravity = Vector3.zero();

      lightBody.integrate(dt, gravity);
      heavyBody.integrate(dt, gravity);

      expect(lightBody.linearVelocity.y).toBeGreaterThan(heavyBody.linearVelocity.y);
    });

    it('applyForce() at point creates torque', () => {
      const body = new RigidBody({ mass: 1, position: new Vector3(0, 0, 0) });
      const force = new Vector3(0, 0, 10);
      const point = new Vector3(1, 0, 0);

      body.applyForce(force, point);

      expect(body.torqueAccumulator).toBeDefined();
    });

    it('static body ignores forces', () => {
      const body = new RigidBody({ type: BodyType.Static });
      const initialVelocity = body.linearVelocity.clone();

      body.applyForce(new Vector3(0, 1000, 0));

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      expect(body.linearVelocity.y).toBe(initialVelocity.y);
    });

    it('force accumulates over multiple calls', () => {
      const body = new RigidBody({ mass: 1 });

      body.applyForce(new Vector3(10, 0, 0));
      body.applyForce(new Vector3(10, 0, 0));

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      expect(body.linearVelocity.x).toBeCloseTo(2, 4);
    });

    it('force accumulator clears after integration', () => {
      const body = new RigidBody({ mass: 1 });

      body.applyForce(new Vector3(100, 0, 0));

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      const velocityAfterFirst = body.linearVelocity.x;

      body.integrate(dt, gravity);

      expect(body.linearVelocity.x).toBeCloseTo(velocityAfterFirst, 4);
    });
  });

  describe('impulse application', () => {
    it('applyImpulse() changes velocity instantly', () => {
      const body = new RigidBody({ mass: 1 });
      const initialVelocity = body.linearVelocity.clone();

      body.applyImpulse(new Vector3(0, 10, 0));

      expect(body.linearVelocity.y).toBe(initialVelocity.y + 10);
    });

    it('applyImpulse() respects mass', () => {
      const lightBody = new RigidBody({ mass: 1 });
      const heavyBody = new RigidBody({ mass: 10 });

      const impulse = new Vector3(0, 100, 0);
      lightBody.applyImpulse(impulse);
      heavyBody.applyImpulse(impulse);

      expect(lightBody.linearVelocity.y).toBeCloseTo(100, 4);
      expect(heavyBody.linearVelocity.y).toBeCloseTo(10, 4);
    });

    it('applyImpulse() at point affects angular velocity', () => {
      const body = new RigidBody({ mass: 1, position: new Vector3(0, 0, 0) });
      const impulse = new Vector3(0, 0, 10);
      const point = new Vector3(1, 0, 0);

      const initialAngularSpeed = body.angularVelocity.length();
      body.applyImpulse(impulse, point);

      const finalAngularSpeed = body.angularVelocity.length();
      expect(finalAngularSpeed).toBeGreaterThan(initialAngularSpeed);
    });

    it('static body ignores impulses', () => {
      const body = new RigidBody({ type: BodyType.Static });
      const initialVelocity = body.linearVelocity.clone();

      body.applyImpulse(new Vector3(0, 1000, 0));

      expect(body.linearVelocity.y).toBe(initialVelocity.y);
    });

    it('impulse does not require integration', () => {
      const body = new RigidBody({ mass: 2 });
      body.applyImpulse(new Vector3(0, 20, 0));

      expect(body.linearVelocity.y).toBeCloseTo(10, 4);
    });
  });

  describe('sleep mechanics', () => {
    it('initializes awake', () => {
      const body = new RigidBody();
      expect(body.isSleeping).toBe(false);
    });

    it('sleep() puts body to sleep', () => {
      const body = new RigidBody();
      body.sleep();
      expect(body.isSleeping).toBe(true);
    });

    it('sleep() zeros velocities', () => {
      const body = new RigidBody();
      body.linearVelocity.set(10, 5, 3);
      body.angularVelocity.set(1, 2, 3);

      body.sleep();

      expect(body.linearVelocity.x).toBe(0);
      expect(body.linearVelocity.y).toBe(0);
      expect(body.linearVelocity.z).toBe(0);
      expect(body.angularVelocity.x).toBe(0);
      expect(body.angularVelocity.y).toBe(0);
      expect(body.angularVelocity.z).toBe(0);
    });

    it('wakeUp() wakes sleeping body', () => {
      const body = new RigidBody();
      body.sleep();
      body.wakeUp();
      expect(body.isSleeping).toBe(false);
    });

    it('sleeping body does not integrate', () => {
      const body = new RigidBody({ position: new Vector3(0, 10, 0) });
      body.sleep();

      const initialPosition = body.position.clone();
      const dt = 0.1;
      const gravity = new Vector3(0, -9.81, 0);

      body.integrate(dt, gravity);

      expect(body.position.y).toBe(initialPosition.y);
    });

    it('applyForce() wakes sleeping body', () => {
      const body = new RigidBody({ mass: 1 });
      body.sleep();
      body.applyForce(new Vector3(0, 100, 0));
      expect(body.isSleeping).toBe(false);
    });

    it('applyImpulse() wakes sleeping body', () => {
      const body = new RigidBody({ mass: 1 });
      body.sleep();
      body.applyImpulse(new Vector3(0, 10, 0));
      expect(body.isSleeping).toBe(false);
    });

    it('body falls asleep when below threshold', () => {
      const body = new RigidBody();
      body.linearVelocity.set(0.001, 0.001, 0);
      body.angularVelocity.set(0, 0, 0);

      const dt = 0.1;
      const gravity = Vector3.zero();

      for (let i = 0; i < 10; i++) {
        body.integrate(dt, gravity);
      }

      expect(body.isSleeping).toBe(true);
    });

    it('body stays awake with high velocity', () => {
      const body = new RigidBody();
      body.linearVelocity.set(10, 0, 0);

      const dt = 0.1;
      const gravity = Vector3.zero();

      for (let i = 0; i < 10; i++) {
        body.integrate(dt, gravity);
      }

      expect(body.isSleeping).toBe(false);
    });
  });

  describe('collider management', () => {
    it('initializes with no colliders', () => {
      const body = new RigidBody();
      expect(body.colliders).toHaveLength(0);
    });

    it('addCollider() adds collider', () => {
      const body = new RigidBody();
      const collider = new Collider({ shape: new SphereShape(1) });

      body.addCollider(collider);

      expect(body.colliders).toHaveLength(1);
      expect(body.colliders[0]).toBe(collider);
    });

    it('can add multiple colliders', () => {
      const body = new RigidBody();
      const collider1 = new Collider({ shape: new SphereShape(1) });
      const collider2 = new Collider({ shape: new BoxShape(Vector3.one()) });

      body.addCollider(collider1);
      body.addCollider(collider2);

      expect(body.colliders).toHaveLength(2);
    });

    it('removeCollider() removes collider', () => {
      const body = new RigidBody();
      const collider = new Collider({ shape: new SphereShape(1) });

      body.addCollider(collider);
      body.removeCollider(collider);

      expect(body.colliders).toHaveLength(0);
    });

    it('removeCollider() handles non-existent collider', () => {
      const body = new RigidBody();
      const collider = new Collider({ shape: new SphereShape(1) });

      body.removeCollider(collider);

      expect(body.colliders).toHaveLength(0);
    });
  });

  describe('world matrix', () => {
    it('getWorldMatrix() returns correct transform', () => {
      const position = new Vector3(5, 10, -3);
      const rotation = Quaternion.fromAxisAngle(Vector3.up(), Math.PI / 4);
      const body = new RigidBody({ position, rotation });

      const matrix = body.getWorldMatrix();
      const translation = new Vector3(
        matrix.elements[12],
        matrix.elements[13],
        matrix.elements[14]
      );

      expect(translation.x).toBeCloseTo(position.x, 5);
      expect(translation.y).toBeCloseTo(position.y, 5);
      expect(translation.z).toBeCloseTo(position.z, 5);
    });

    it('getWorldMatrix() updates with position changes', () => {
      const body = new RigidBody({ position: new Vector3(0, 0, 0) });

      body.position.set(10, 20, 30);
      const matrix = body.getWorldMatrix();

      expect(matrix.elements[12]).toBe(10);
      expect(matrix.elements[13]).toBe(20);
      expect(matrix.elements[14]).toBe(30);
    });
  });

  describe('gravity scale', () => {
    it('has default gravity scale of 1', () => {
      const body = new RigidBody();
      expect(body.gravityScale).toBe(1);
    });

    it('custom gravity scale can be set', () => {
      const body = new RigidBody({ gravityScale: 2 });
      expect(body.gravityScale).toBe(2);
    });

    it('zero gravity scale prevents gravity effect', () => {
      const body = new RigidBody({ gravityScale: 0 });
      const initialVelocity = body.linearVelocity.clone();

      const dt = 0.1;
      const gravity = new Vector3(0, -9.81, 0);
      body.integrate(dt, gravity);

      expect(body.linearVelocity.y).toBeCloseTo(initialVelocity.y, 5);
    });

    it('gravity scale multiplies gravity force', () => {
      const body1 = new RigidBody({ mass: 1, gravityScale: 1 });
      const body2 = new RigidBody({ mass: 1, gravityScale: 2 });

      const dt = 0.1;
      const gravity = new Vector3(0, -9.81, 0);

      body1.integrate(dt, gravity);
      body2.integrate(dt, gravity);

      expect(Math.abs(body2.linearVelocity.y)).toBeCloseTo(Math.abs(body1.linearVelocity.y) * 2, 4);
    });

    it('negative gravity scale reverses gravity', () => {
      const body = new RigidBody({ mass: 1, gravityScale: -1 });

      const dt = 0.1;
      const gravity = new Vector3(0, -9.81, 0);
      body.integrate(dt, gravity);

      expect(body.linearVelocity.y).toBeGreaterThan(0);
    });
  });

  describe('integration', () => {
    it('position updates based on velocity', () => {
      const body = new RigidBody({ position: new Vector3(0, 0, 0) });
      body.linearVelocity.set(10, 20, 30);

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      expect(body.position.x).toBeCloseTo(1, 4);
      expect(body.position.y).toBeCloseTo(2, 4);
      expect(body.position.z).toBeCloseTo(3, 4);
    });

    it('velocity updates based on forces', () => {
      const body = new RigidBody({ mass: 1 });
      body.applyForce(new Vector3(100, 0, 0));

      const dt = 0.1;
      const gravity = Vector3.zero();
      body.integrate(dt, gravity);

      expect(body.linearVelocity.x).toBeCloseTo(10, 4);
    });

    it('handles multiple integration steps consistently', () => {
      const body = new RigidBody({ mass: 1, position: new Vector3(0, 0, 0) });
      body.linearVelocity.set(5, 0, 0);

      const dt = 0.01;
      const gravity = Vector3.zero();

      for (let i = 0; i < 100; i++) {
        body.integrate(dt, gravity);
      }

      expect(body.position.x).toBeCloseTo(5, 2);
    });
  });
});
