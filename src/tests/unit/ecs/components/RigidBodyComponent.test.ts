/**
 * @fileoverview Unit tests for RigidBodyComponent.
 * Tests static/dynamic/kinematic types, mass, velocity, forces, and collision settings.
 */

import { describe, it, expect, beforeEach } from 'vitest';

class RigidBodyComponent {
  bodyType: 'static' | 'dynamic' | 'kinematic';
  mass: number;
  inertia: [number, number, number];
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number];
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  isAwake: boolean;
  isSleepingAllowed: boolean;
  continuousCollisionDetection: boolean;
  lockRotation: [boolean, boolean, boolean];
  constraints: number;

  constructor(options?: Partial<RigidBodyComponent>) {
    this.bodyType = options?.bodyType ?? 'dynamic';
    this.mass = options?.mass ?? 1;
    this.inertia = options?.inertia ?? [1, 1, 1];
    this.linearVelocity = options?.linearVelocity ?? [0, 0, 0];
    this.angularVelocity = options?.angularVelocity ?? [0, 0, 0];
    this.linearDamping = options?.linearDamping ?? 0.01;
    this.angularDamping = options?.angularDamping ?? 0.05;
    this.gravityScale = options?.gravityScale ?? 1;
    this.isAwake = options?.isAwake ?? true;
    this.isSleepingAllowed = options?.isSleepingAllowed ?? true;
    this.continuousCollisionDetection = options?.continuousCollisionDetection ?? false;
    this.lockRotation = options?.lockRotation ?? [false, false, false];
    this.constraints = options?.constraints ?? 0;
  }

  setBodyType(type: 'static' | 'dynamic' | 'kinematic'): this {
    this.bodyType = type;
    return this;
  }

  setMass(mass: number): this {
    this.mass = Math.max(0.001, mass);
    if (this.bodyType === 'dynamic') {
      this.updateInertia();
    }
    return this;
  }

  setInertia(x: number, y: number, z: number): this {
    this.inertia = [x, y, z];
    return this;
  }

  setLinearVelocity(x: number, y: number, z: number): this {
    this.linearVelocity = [x, y, z];
    this.isAwake = true;
    return this;
  }

  setAngularVelocity(x: number, y: number, z: number): this {
    this.angularVelocity = [x, y, z];
    this.isAwake = true;
    return this;
  }

  applyForce(x: number, y: number, z: number): this {
    if (this.bodyType !== 'dynamic') return this;
    const dt = 1/60;
    this.linearVelocity[0] += (x / this.mass) * dt;
    this.linearVelocity[1] += (y / this.mass) * dt;
    this.linearVelocity[2] += (z / this.mass) * dt;
    this.isAwake = true;
    return this;
  }

  applyImpulse(x: number, y: number, z: number): this {
    if (this.bodyType !== 'dynamic') return this;
    this.linearVelocity[0] += x / this.mass;
    this.linearVelocity[1] += y / this.mass;
    this.linearVelocity[2] += z / this.mass;
    this.isAwake = true;
    return this;
  }

  applyTorque(x: number, y: number, z: number): this {
    if (this.bodyType !== 'dynamic') return this;
    const dt = 1/60;
    this.angularVelocity[0] += (x / this.inertia[0]) * dt;
    this.angularVelocity[1] += (y / this.inertia[1]) * dt;
    this.angularVelocity[2] += (z / this.inertia[2]) * dt;
    this.isAwake = true;
    return this;
  }

  setDamping(linear: number, angular: number): this {
    this.linearDamping = Math.max(0, linear);
    this.angularDamping = Math.max(0, angular);
    return this;
  }

  setGravityScale(scale: number): this {
    this.gravityScale = scale;
    return this;
  }

  setAwake(awake: boolean): this {
    this.isAwake = awake;
    return this;
  }

  setSleepingAllowed(allowed: boolean): this {
    this.isSleepingAllowed = allowed;
    if (!allowed) this.isAwake = true;
    return this;
  }

  setContinuousCollisionDetection(enabled: boolean): this {
    this.continuousCollisionDetection = enabled;
    return this;
  }

  lockRotationAxis(x: boolean, y: boolean, z: boolean): this {
    this.lockRotation = [x, y, z];
    return this;
  }

  private updateInertia(): void {
    const r = Math.cbrt(3 * this.mass / (4 * Math.PI));
    const i = 0.4 * this.mass * r * r;
    this.inertia = [i, i, i];
  }

  serialize(): object {
    return {
      bodyType: this.bodyType,
      mass: this.mass,
      inertia: this.inertia,
      linearVelocity: this.linearVelocity,
      angularVelocity: this.angularVelocity,
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping,
      gravityScale: this.gravityScale,
      isAwake: this.isAwake,
      isSleepingAllowed: this.isSleepingAllowed,
      continuousCollisionDetection: this.continuousCollisionDetection,
      lockRotation: this.lockRotation,
      constraints: this.constraints
    };
  }

  deserialize(data: any): void {
    this.bodyType = data.bodyType ?? 'dynamic';
    this.mass = data.mass ?? 1;
    this.inertia = data.inertia ?? [1, 1, 1];
    this.linearVelocity = data.linearVelocity ?? [0, 0, 0];
    this.angularVelocity = data.angularVelocity ?? [0, 0, 0];
    this.linearDamping = data.linearDamping ?? 0.01;
    this.angularDamping = data.angularDamping ?? 0.05;
    this.gravityScale = data.gravityScale ?? 1;
    this.isAwake = data.isAwake ?? true;
    this.isSleepingAllowed = data.isSleepingAllowed ?? true;
    this.continuousCollisionDetection = data.continuousCollisionDetection ?? false;
    this.lockRotation = data.lockRotation ?? [false, false, false];
    this.constraints = data.constraints ?? 0;
  }

  reset(): void {
    this.bodyType = 'dynamic';
    this.mass = 1;
    this.inertia = [1, 1, 1];
    this.linearVelocity = [0, 0, 0];
    this.angularVelocity = [0, 0, 0];
    this.linearDamping = 0.01;
    this.angularDamping = 0.05;
    this.gravityScale = 1;
    this.isAwake = true;
    this.isSleepingAllowed = true;
    this.continuousCollisionDetection = false;
    this.lockRotation = [false, false, false];
    this.constraints = 0;
  }
}

describe('RigidBodyComponent', () => {
  describe('initialization', () => {
    it('creates with default dynamic body', () => {
      const rb = new RigidBodyComponent();
      expect(rb.bodyType).toBe('dynamic');
      expect(rb.mass).toBe(1);
      expect(rb.isAwake).toBe(true);
    });

    it('creates as static body', () => {
      const rb = new RigidBodyComponent({ bodyType: 'static' });
      expect(rb.bodyType).toBe('static');
    });

    it('creates as kinematic body', () => {
      const rb = new RigidBodyComponent({ bodyType: 'kinematic' });
      expect(rb.bodyType).toBe('kinematic');
    });

    it('creates with custom mass', () => {
      const rb = new RigidBodyComponent({ mass: 10 });
      expect(rb.mass).toBe(10);
    });
  });

  describe('body types', () => {
    it('static bodies have infinite mass', () => {
      const rb = new RigidBodyComponent({ bodyType: 'static' });
      rb.applyForce(100, 0, 0);
      expect(rb.linearVelocity).toEqual([0, 0, 0]);
    });

    it('dynamic bodies respond to forces', () => {
      const rb = new RigidBodyComponent({ bodyType: 'dynamic', mass: 1 });
      rb.applyForce(10, 0, 0);
      expect(rb.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('kinematic bodies ignore forces', () => {
      const rb = new RigidBodyComponent({ bodyType: 'kinematic' });
      rb.applyForce(100, 0, 0);
      expect(rb.linearVelocity).toEqual([0, 0, 0]);
    });
  });

  describe('mass and inertia', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent();
    });

    it('setMass() updates mass', () => {
      rb.setMass(5);
      expect(rb.mass).toBe(5);
    });

    it('setMass() clamps to minimum', () => {
      rb.setMass(0);
      expect(rb.mass).toBeGreaterThan(0);
    });

    it('setInertia() updates inertia tensor', () => {
      rb.setInertia(2, 3, 4);
      expect(rb.inertia).toEqual([2, 3, 4]);
    });

    it('mass affects force response', () => {
      const rb1 = new RigidBodyComponent({ mass: 1 });
      const rb2 = new RigidBodyComponent({ mass: 10 });

      rb1.applyForce(10, 0, 0);
      rb2.applyForce(10, 0, 0);

      expect(rb1.linearVelocity[0]).toBeGreaterThan(rb2.linearVelocity[0]);
    });
  });

  describe('velocity', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent();
    });

    it('setLinearVelocity() updates velocity', () => {
      rb.setLinearVelocity(5, 10, 15);
      expect(rb.linearVelocity).toEqual([5, 10, 15]);
    });

    it('setAngularVelocity() updates angular velocity', () => {
      rb.setAngularVelocity(1, 2, 3);
      expect(rb.angularVelocity).toEqual([1, 2, 3]);
    });

    it('setting velocity wakes body', () => {
      rb.isAwake = false;
      rb.setLinearVelocity(1, 0, 0);
      expect(rb.isAwake).toBe(true);
    });
  });

  describe('force application', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent({ mass: 1 });
    });

    it('applyForce() changes velocity over time', () => {
      rb.applyForce(10, 0, 0);
      expect(rb.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('applyImpulse() instantly changes velocity', () => {
      rb.applyImpulse(5, 0, 0);
      expect(rb.linearVelocity[0]).toBeCloseTo(5);
    });

    it('applyTorque() changes angular velocity', () => {
      rb.setInertia(1, 1, 1);
      rb.applyTorque(1, 0, 0);
      expect(rb.angularVelocity[0]).toBeGreaterThan(0);
    });

    it('applying force wakes body', () => {
      rb.isAwake = false;
      rb.applyForce(1, 0, 0);
      expect(rb.isAwake).toBe(true);
    });
  });

  describe('damping', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent();
    });

    it('setDamping() updates both damping values', () => {
      rb.setDamping(0.5, 0.3);
      expect(rb.linearDamping).toBe(0.5);
      expect(rb.angularDamping).toBe(0.3);
    });

    it('setDamping() clamps to non-negative', () => {
      rb.setDamping(-1, -1);
      expect(rb.linearDamping).toBe(0);
      expect(rb.angularDamping).toBe(0);
    });
  });

  describe('gravity', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent();
    });

    it('setGravityScale() updates scale', () => {
      rb.setGravityScale(2);
      expect(rb.gravityScale).toBe(2);
    });

    it('supports zero gravity', () => {
      rb.setGravityScale(0);
      expect(rb.gravityScale).toBe(0);
    });

    it('supports negative gravity', () => {
      rb.setGravityScale(-1);
      expect(rb.gravityScale).toBe(-1);
    });
  });

  describe('sleep state', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent();
    });

    it('setAwake() wakes body', () => {
      rb.isAwake = false;
      rb.setAwake(true);
      expect(rb.isAwake).toBe(true);
    });

    it('setAwake() puts body to sleep', () => {
      rb.setAwake(false);
      expect(rb.isAwake).toBe(false);
    });

    it('setSleepingAllowed() enables sleeping', () => {
      rb.setSleepingAllowed(true);
      expect(rb.isSleepingAllowed).toBe(true);
    });

    it('disabling sleep wakes body', () => {
      rb.isAwake = false;
      rb.setSleepingAllowed(false);
      expect(rb.isAwake).toBe(true);
    });
  });

  describe('collision detection', () => {
    it('setContinuousCollisionDetection() enables CCD', () => {
      const rb = new RigidBodyComponent();
      rb.setContinuousCollisionDetection(true);
      expect(rb.continuousCollisionDetection).toBe(true);
    });

    it('CCD is disabled by default', () => {
      const rb = new RigidBodyComponent();
      expect(rb.continuousCollisionDetection).toBe(false);
    });
  });

  describe('rotation locking', () => {
    let rb: RigidBodyComponent;

    beforeEach(() => {
      rb = new RigidBodyComponent();
    });

    it('lockRotationAxis() locks specific axes', () => {
      rb.lockRotationAxis(true, false, true);
      expect(rb.lockRotation).toEqual([true, false, true]);
    });

    it('can lock all rotation axes', () => {
      rb.lockRotationAxis(true, true, true);
      expect(rb.lockRotation).toEqual([true, true, true]);
    });

    it('can unlock all rotation axes', () => {
      rb.lockRotationAxis(false, false, false);
      expect(rb.lockRotation).toEqual([false, false, false]);
    });
  });

  describe('serialization', () => {
    it('serialize() produces correct structure', () => {
      const rb = new RigidBodyComponent({
        bodyType: 'kinematic',
        mass: 5,
        linearVelocity: [1, 2, 3],
        angularVelocity: [0.1, 0.2, 0.3]
      });

      const data = rb.serialize();
      expect(data).toHaveProperty('bodyType', 'kinematic');
      expect(data).toHaveProperty('mass', 5);
    });

    it('deserialize() restores state', () => {
      const data = {
        bodyType: 'static' as const,
        mass: 10,
        linearVelocity: [5, 5, 5] as [number, number, number],
        angularVelocity: [1, 1, 1] as [number, number, number],
        gravityScale: 0.5
      };

      const rb = new RigidBodyComponent();
      rb.deserialize(data);

      expect(rb.bodyType).toBe('static');
      expect(rb.mass).toBe(10);
      expect(rb.gravityScale).toBe(0.5);
    });

    it('round-trip preserves data', () => {
      const rb1 = new RigidBodyComponent({
        bodyType: 'dynamic',
        mass: 2.5,
        linearVelocity: [1, 2, 3],
        lockRotation: [true, false, true]
      });

      const data = rb1.serialize();
      const rb2 = new RigidBodyComponent();
      rb2.deserialize(data);

      expect(JSON.stringify(rb1.serialize())).toBe(JSON.stringify(rb2.serialize()));
    });
  });

  describe('reset', () => {
    it('reset() returns to default state', () => {
      const rb = new RigidBodyComponent({
        bodyType: 'kinematic',
        mass: 100,
        linearVelocity: [10, 10, 10]
      });

      rb.reset();

      expect(rb.bodyType).toBe('dynamic');
      expect(rb.mass).toBe(1);
      expect(rb.linearVelocity).toEqual([0, 0, 0]);
    });
  });

  describe('method chaining', () => {
    it('supports full method chain', () => {
      const rb = new RigidBodyComponent();

      const result = rb
        .setBodyType('dynamic')
        .setMass(5)
        .setLinearVelocity(1, 2, 3)
        .setAngularVelocity(0.1, 0.2, 0.3)
        .setDamping(0.1, 0.2)
        .setGravityScale(1.5)
        .setSleepingAllowed(false)
        .setContinuousCollisionDetection(true)
        .lockRotationAxis(false, true, false);

      expect(result).toBe(rb);
      expect(rb.mass).toBe(5);
      expect(rb.gravityScale).toBe(1.5);
    });
  });
});
