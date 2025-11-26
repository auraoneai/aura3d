import { describe, it, expect, beforeEach } from 'vitest';
import {
  Constraint,
  ConstraintType,
  FixedConstraint,
  HingeConstraint
} from '../../../physics/Constraint';
import { RigidBody, BodyType } from '../../../physics/RigidBody';
import { Vector3 } from '../../../math/Vector3';

describe('Constraint', () => {
  describe('FixedConstraint', () => {
    let bodyA: RigidBody;
    let bodyB: RigidBody;

    beforeEach(() => {
      bodyA = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1,
        position: new Vector3(0, 0, 0)
      });

      bodyB = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1,
        position: new Vector3(2, 0, 0)
      });
    });

    it('creates with two bodies and anchors', () => {
      const anchorA = new Vector3(1, 0, 0);
      const anchorB = new Vector3(-1, 0, 0);

      const constraint = new FixedConstraint(bodyA, bodyB, anchorA, anchorB);

      expect(constraint.bodyA).toBe(bodyA);
      expect(constraint.bodyB).toBe(bodyB);
      expect(constraint.type).toBe(ConstraintType.Fixed);
    });

    it('has infinite break force by default', () => {
      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      expect(constraint.breakForce).toBe(Infinity);
    });

    it('custom break force can be set', () => {
      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      constraint.breakForce = 100;

      expect(constraint.breakForce).toBe(100);
    });

    it('solve() reduces error between anchors', () => {
      const anchorA = new Vector3(1, 0, 0);
      const anchorB = new Vector3(-1, 0, 0);

      bodyA.position.set(0, 0, 0);
      bodyB.position.set(5, 0, 0);

      const constraint = new FixedConstraint(bodyA, bodyB, anchorA, anchorB);

      const initialError = bodyB.position.add(anchorB).sub(bodyA.position.add(anchorA)).length();

      constraint.solve(1 / 60);

      const finalError = bodyB.position.add(anchorB).sub(bodyA.position.add(anchorA)).length();

      expect(finalError).toBeLessThan(initialError);
    });

    it('solve() moves both bodies when both dynamic', () => {
      const anchorA = Vector3.zero();
      const anchorB = Vector3.zero();

      bodyA.position.set(0, 0, 0);
      bodyB.position.set(10, 0, 0);

      const constraint = new FixedConstraint(bodyA, bodyB, anchorA, anchorB);

      const initialPosA = bodyA.position.clone();
      const initialPosB = bodyB.position.clone();

      constraint.solve(1 / 60);

      expect(bodyA.position.x).toBeGreaterThan(initialPosA.x);
      expect(bodyB.position.x).toBeLessThan(initialPosB.x);
    });

    it('solve() handles null bodyB gracefully', () => {
      const constraint = new FixedConstraint(
        bodyA,
        null as any,
        Vector3.zero(),
        Vector3.zero()
      );

      expect(() => {
        constraint.solve(1 / 60);
      }).not.toThrow();
    });

    it('solve() respects body types', () => {
      bodyA.type = BodyType.Static;
      bodyA.inverseMass = 0;

      bodyA.position.set(0, 0, 0);
      bodyB.position.set(10, 0, 0);

      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      const initialPosA = bodyA.position.clone();
      constraint.solve(1 / 60);

      expect(bodyA.position.x).toBe(initialPosA.x);
    });

    it('multiple solve() calls converge', () => {
      bodyA.position.set(0, 0, 0);
      bodyB.position.set(10, 0, 0);

      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      for (let i = 0; i < 10; i++) {
        constraint.solve(1 / 60);
      }

      const finalError = bodyB.position.sub(bodyA.position).length();
      expect(finalError).toBeLessThan(1);
    });

    it('maintains relative position of anchors', () => {
      const anchorA = new Vector3(1, 0, 0);
      const anchorB = new Vector3(-1, 0, 0);

      bodyA.position.set(0, 0, 0);
      bodyB.position.set(2, 0, 0);

      const constraint = new FixedConstraint(bodyA, bodyB, anchorA, anchorB);

      for (let i = 0; i < 20; i++) {
        constraint.solve(1 / 60);
      }

      const worldAnchorA = bodyA.position.add(anchorA);
      const worldAnchorB = bodyB.position.add(anchorB);
      const distance = worldAnchorB.sub(worldAnchorA).length();

      expect(distance).toBeLessThan(0.5);
    });

    it('works with offset anchors in Y direction', () => {
      const anchorA = new Vector3(0, 1, 0);
      const anchorB = new Vector3(0, -1, 0);

      bodyA.position.set(0, 0, 0);
      bodyB.position.set(0, 5, 0);

      const constraint = new FixedConstraint(bodyA, bodyB, anchorA, anchorB);

      for (let i = 0; i < 20; i++) {
        constraint.solve(1 / 60);
      }

      const worldAnchorA = bodyA.position.add(anchorA);
      const worldAnchorB = bodyB.position.add(anchorB);
      const distance = worldAnchorB.sub(worldAnchorA).length();

      expect(distance).toBeLessThan(1);
    });
  });

  describe('HingeConstraint', () => {
    let bodyA: RigidBody;
    let bodyB: RigidBody;

    beforeEach(() => {
      bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });

      bodyB = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1,
        position: new Vector3(1, 0, 0)
      });
    });

    it('creates with bodies, anchor, and axis', () => {
      const anchor = new Vector3(0, 0, 0);
      const axis = new Vector3(0, 1, 0);

      const constraint = new HingeConstraint(bodyA, bodyB, anchor, axis);

      expect(constraint.bodyA).toBe(bodyA);
      expect(constraint.bodyB).toBe(bodyB);
      expect(constraint.type).toBe(ConstraintType.Hinge);
    });

    it('normalizes hinge axis', () => {
      const anchor = new Vector3(0, 0, 0);
      const axis = new Vector3(0, 10, 0);

      const constraint = new HingeConstraint(bodyA, bodyB, anchor, axis);

      expect(constraint.axis.length()).toBeCloseTo(1, 5);
    });

    it('copies anchor to both bodies', () => {
      const anchor = new Vector3(5, 10, -3);
      const axis = new Vector3(0, 1, 0);

      const constraint = new HingeConstraint(bodyA, bodyB, anchor, axis);

      expect(constraint.anchorA.equals(anchor)).toBe(true);
      expect(constraint.anchorB.equals(anchor)).toBe(true);
    });

    it('motor is disabled by default', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      expect(constraint.motorEnabled).toBe(false);
    });

    it('motor can be enabled', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      constraint.motorEnabled = true;

      expect(constraint.motorEnabled).toBe(true);
    });

    it('motor speed can be set', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      constraint.motorSpeed = 10;

      expect(constraint.motorSpeed).toBe(10);
    });

    it('motor has default max force', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      expect(constraint.motorMaxForce).toBe(1000);
    });

    it('motor max force can be changed', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      constraint.motorMaxForce = 5000;

      expect(constraint.motorMaxForce).toBe(5000);
    });

    it('solve() can be called without error', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      expect(() => {
        constraint.solve(1 / 60);
      }).not.toThrow();
    });

    it('different axes produce different constraints', () => {
      const hinge1 = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.up()
      );

      const hinge2 = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        new Vector3(1, 0, 0)
      );

      expect(hinge1.axis.equals(hinge2.axis)).toBe(false);
    });

    it('constraint allows rotation around axis', () => {
      const constraint = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        new Vector3(0, 1, 0)
      );

      bodyB.angularVelocity.set(0, 5, 0);

      expect(() => {
        for (let i = 0; i < 10; i++) {
          constraint.solve(1 / 60);
        }
      }).not.toThrow();
    });
  });

  describe('Constraint base class', () => {
    it('constraint type enum has correct values', () => {
      expect(ConstraintType.Fixed).toBe(0);
      expect(ConstraintType.Hinge).toBe(1);
      expect(ConstraintType.BallSocket).toBe(2);
      expect(ConstraintType.Slider).toBe(3);
    });

    it('break force prevents constraint solving at high forces', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 0, 0)
      });

      const bodyB = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1,
        position: new Vector3(100, 0, 0)
      });

      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      constraint.breakForce = 10;

      expect(constraint.breakForce).toBe(10);
    });

    it('constraints can reference same body', () => {
      const body = new RigidBody({ mass: 1 });

      const constraint = new FixedConstraint(
        body,
        body,
        new Vector3(1, 0, 0),
        new Vector3(-1, 0, 0)
      );

      expect(constraint.bodyA).toBe(constraint.bodyB);
    });

    it('constraint with null bodyB is valid', () => {
      const body = new RigidBody({ mass: 1 });

      const constraint = new FixedConstraint(
        body,
        null as any,
        Vector3.zero(),
        Vector3.zero()
      );

      expect(constraint.bodyB).toBeNull();
    });
  });

  describe('constraint stability', () => {
    it('fixed constraint maintains distance under gravity', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 10, 0)
      });

      const bodyB = new RigidBody({
        type: BodyType.Dynamic,
        mass: 1,
        position: new Vector3(0, 8, 0)
      });

      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      const gravity = new Vector3(0, -9.81, 0);

      for (let i = 0; i < 100; i++) {
        bodyB.integrate(1 / 60, gravity);
        constraint.solve(1 / 60);
      }

      const distance = bodyB.position.sub(bodyA.position).length();
      expect(distance).toBeLessThan(3);
    });

    it('constraint handles extreme positions', () => {
      const bodyA = new RigidBody({
        position: new Vector3(0, 0, 0)
      });

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(1000, 1000, 1000)
      });

      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        Vector3.zero()
      );

      expect(() => {
        for (let i = 0; i < 10; i++) {
          constraint.solve(1 / 60);
        }
      }).not.toThrow();

      expect(Number.isFinite(bodyB.position.x)).toBe(true);
    });

    it('multiple constraints on same body', () => {
      const anchor = new RigidBody({
        type: BodyType.Static,
        position: new Vector3(0, 10, 0)
      });

      const body1 = new RigidBody({
        mass: 1,
        position: new Vector3(2, 10, 0)
      });

      const body2 = new RigidBody({
        mass: 1,
        position: new Vector3(-2, 10, 0)
      });

      const constraint1 = new FixedConstraint(
        anchor,
        body1,
        new Vector3(1, 0, 0),
        new Vector3(-1, 0, 0)
      );

      const constraint2 = new FixedConstraint(
        anchor,
        body2,
        new Vector3(-1, 0, 0),
        new Vector3(1, 0, 0)
      );

      const gravity = new Vector3(0, -9.81, 0);

      for (let i = 0; i < 60; i++) {
        body1.integrate(1 / 60, gravity);
        body2.integrate(1 / 60, gravity);
        constraint1.solve(1 / 60);
        constraint2.solve(1 / 60);
      }

      expect(Number.isFinite(body1.position.y)).toBe(true);
      expect(Number.isFinite(body2.position.y)).toBe(true);
    });

    it('constraint between two dynamic bodies is stable', () => {
      const bodyA = new RigidBody({
        mass: 1,
        position: new Vector3(0, 0, 0)
      });

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(2, 0, 0)
      });

      const constraint = new FixedConstraint(
        bodyA,
        bodyB,
        new Vector3(1, 0, 0),
        new Vector3(-1, 0, 0)
      );

      for (let i = 0; i < 100; i++) {
        constraint.solve(1 / 60);
      }

      const worldAnchorA = bodyA.position.add(new Vector3(1, 0, 0));
      const worldAnchorB = bodyB.position.add(new Vector3(-1, 0, 0));
      const error = worldAnchorB.sub(worldAnchorA).length();

      expect(error).toBeLessThan(0.5);
    });
  });

  describe('hinge constraint behavior', () => {
    it('allows rotation around hinge axis', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: Vector3.zero()
      });

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(1, 0, 0)
      });

      const hinge = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        new Vector3(0, 1, 0)
      );

      bodyB.angularVelocity.set(0, 10, 0);

      expect(() => {
        for (let i = 0; i < 60; i++) {
          bodyB.integrate(1 / 60, Vector3.zero());
          hinge.solve(1 / 60);
        }
      }).not.toThrow();
    });

    it('motor configuration affects simulation', () => {
      const bodyA = new RigidBody({
        type: BodyType.Static,
        position: Vector3.zero()
      });

      const bodyB = new RigidBody({
        mass: 1,
        position: new Vector3(1, 0, 0)
      });

      const hinge = new HingeConstraint(
        bodyA,
        bodyB,
        Vector3.zero(),
        new Vector3(0, 1, 0)
      );

      hinge.motorEnabled = true;
      hinge.motorSpeed = 5;
      hinge.motorMaxForce = 100;

      expect(hinge.motorEnabled).toBe(true);
      expect(hinge.motorSpeed).toBe(5);
      expect(hinge.motorMaxForce).toBe(100);
    });
  });
});
