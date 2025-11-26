import { describe, it, expect } from 'vitest';
import { PhysicsMaterial, CombineMode } from '../../../physics/PhysicsMaterial';

describe('PhysicsMaterial', () => {
  describe('initialization', () => {
    it('creates with default values', () => {
      const material = new PhysicsMaterial();

      expect(material.name).toBe('Material');
      expect(material.staticFriction).toBe(0.6);
      expect(material.dynamicFriction).toBe(0.4);
      expect(material.restitution).toBe(0.3);
      expect(material.frictionCombine).toBe(CombineMode.Average);
      expect(material.restitutionCombine).toBe(CombineMode.Average);
      expect(material.density).toBe(1000);
    });

    it('creates with custom name', () => {
      const material = new PhysicsMaterial({ name: 'Custom' });

      expect(material.name).toBe('Custom');
    });

    it('creates with custom friction values', () => {
      const material = new PhysicsMaterial({
        staticFriction: 0.8,
        dynamicFriction: 0.6
      });

      expect(material.staticFriction).toBe(0.8);
      expect(material.dynamicFriction).toBe(0.6);
    });

    it('creates with custom restitution', () => {
      const material = new PhysicsMaterial({ restitution: 0.9 });

      expect(material.restitution).toBe(0.9);
    });

    it('creates with custom combine modes', () => {
      const material = new PhysicsMaterial({
        frictionCombine: CombineMode.Multiply,
        restitutionCombine: CombineMode.Maximum
      });

      expect(material.frictionCombine).toBe(CombineMode.Multiply);
      expect(material.restitutionCombine).toBe(CombineMode.Maximum);
    });

    it('creates with custom density', () => {
      const material = new PhysicsMaterial({ density: 7850 });

      expect(material.density).toBe(7850);
    });
  });

  describe('friction coefficients', () => {
    it('static friction can be zero', () => {
      const material = new PhysicsMaterial({ staticFriction: 0 });

      expect(material.staticFriction).toBe(0);
    });

    it('static friction can exceed 1', () => {
      const material = new PhysicsMaterial({ staticFriction: 1.5 });

      expect(material.staticFriction).toBe(1.5);
    });

    it('dynamic friction is typically less than static', () => {
      const material = new PhysicsMaterial({
        staticFriction: 0.8,
        dynamicFriction: 0.6
      });

      expect(material.dynamicFriction).toBeLessThan(material.staticFriction);
    });

    it('dynamic friction can be set independently', () => {
      const material = new PhysicsMaterial({
        staticFriction: 0.5,
        dynamicFriction: 0.7
      });

      expect(material.dynamicFriction).toBe(0.7);
    });

    it('very high friction is allowed', () => {
      const material = new PhysicsMaterial({
        staticFriction: 10,
        dynamicFriction: 8
      });

      expect(material.staticFriction).toBe(10);
      expect(material.dynamicFriction).toBe(8);
    });
  });

  describe('restitution (bounciness)', () => {
    it('zero restitution means no bounce', () => {
      const material = new PhysicsMaterial({ restitution: 0 });

      expect(material.restitution).toBe(0);
    });

    it('one restitution means perfect bounce', () => {
      const material = new PhysicsMaterial({ restitution: 1 });

      expect(material.restitution).toBe(1);
    });

    it('restitution can exceed 1', () => {
      const material = new PhysicsMaterial({ restitution: 1.2 });

      expect(material.restitution).toBe(1.2);
    });

    it('typical restitution is between 0 and 1', () => {
      const material = new PhysicsMaterial({ restitution: 0.5 });

      expect(material.restitution).toBeGreaterThanOrEqual(0);
      expect(material.restitution).toBeLessThanOrEqual(1);
    });
  });

  describe('combine modes', () => {
    it('Average combine mode averages values', () => {
      const result = PhysicsMaterial.combineFriction(
        0.8,
        0.4,
        CombineMode.Average,
        CombineMode.Average
      );

      expect(result).toBeCloseTo(0.6, 5);
    });

    it('Minimum combine mode takes minimum', () => {
      const result = PhysicsMaterial.combineFriction(
        0.8,
        0.4,
        CombineMode.Minimum,
        CombineMode.Minimum
      );

      expect(result).toBe(0.4);
    });

    it('Maximum combine mode takes maximum', () => {
      const result = PhysicsMaterial.combineFriction(
        0.8,
        0.4,
        CombineMode.Maximum,
        CombineMode.Maximum
      );

      expect(result).toBe(0.8);
    });

    it('Multiply combine mode multiplies values', () => {
      const result = PhysicsMaterial.combineFriction(
        0.8,
        0.5,
        CombineMode.Multiply,
        CombineMode.Multiply
      );

      expect(result).toBeCloseTo(0.4, 5);
    });

    it('different modes use higher priority', () => {
      const result = PhysicsMaterial.combineFriction(
        0.8,
        0.4,
        CombineMode.Average,
        CombineMode.Maximum
      );

      expect(result).toBe(0.8);
    });

    it('combineRestitution works like combineFriction', () => {
      const result = PhysicsMaterial.combineRestitution(
        0.9,
        0.1,
        CombineMode.Average,
        CombineMode.Average
      );

      expect(result).toBeCloseTo(0.5, 5);
    });

    it('minimum restitution creates dead bounce', () => {
      const result = PhysicsMaterial.combineRestitution(
        0.9,
        0.0,
        CombineMode.Minimum,
        CombineMode.Minimum
      );

      expect(result).toBe(0.0);
    });

    it('maximum restitution creates bouncy collision', () => {
      const result = PhysicsMaterial.combineRestitution(
        0.9,
        0.1,
        CombineMode.Maximum,
        CombineMode.Maximum
      );

      expect(result).toBe(0.9);
    });

    it('multiply reduces both properties', () => {
      const friction = PhysicsMaterial.combineFriction(
        0.5,
        0.5,
        CombineMode.Multiply,
        CombineMode.Multiply
      );

      expect(friction).toBeCloseTo(0.25, 5);
    });
  });

  describe('preset materials', () => {
    it('default() creates standard material', () => {
      const material = PhysicsMaterial.default();

      expect(material.name).toBe('Default');
      expect(material.staticFriction).toBe(0.6);
      expect(material.dynamicFriction).toBe(0.4);
      expect(material.restitution).toBe(0.3);
      expect(material.density).toBe(1000);
    });

    it('ice() has very low friction', () => {
      const material = PhysicsMaterial.ice();

      expect(material.name).toBe('Ice');
      expect(material.staticFriction).toBe(0.05);
      expect(material.dynamicFriction).toBe(0.03);
      expect(material.restitution).toBe(0.1);
      expect(material.density).toBe(917);
    });

    it('rubber() has high friction and bounce', () => {
      const material = PhysicsMaterial.rubber();

      expect(material.name).toBe('Rubber');
      expect(material.staticFriction).toBe(0.9);
      expect(material.dynamicFriction).toBe(0.7);
      expect(material.restitution).toBe(0.85);
      expect(material.density).toBe(1200);
    });

    it('wood() has moderate properties', () => {
      const material = PhysicsMaterial.wood();

      expect(material.name).toBe('Wood');
      expect(material.staticFriction).toBe(0.5);
      expect(material.dynamicFriction).toBe(0.3);
      expect(material.restitution).toBe(0.4);
      expect(material.density).toBe(700);
    });

    it('metal() has low friction and bounce', () => {
      const material = PhysicsMaterial.metal();

      expect(material.name).toBe('Metal');
      expect(material.staticFriction).toBe(0.3);
      expect(material.dynamicFriction).toBe(0.2);
      expect(material.restitution).toBe(0.2);
      expect(material.density).toBe(7850);
    });

    it('concrete() has high friction, low bounce', () => {
      const material = PhysicsMaterial.concrete();

      expect(material.name).toBe('Concrete');
      expect(material.staticFriction).toBe(0.7);
      expect(material.dynamicFriction).toBe(0.6);
      expect(material.restitution).toBe(0.1);
      expect(material.density).toBe(2400);
    });

    it('bouncy() has very high restitution', () => {
      const material = PhysicsMaterial.bouncy();

      expect(material.name).toBe('Bouncy');
      expect(material.restitution).toBe(0.95);
    });

    it('frictionless() has zero friction', () => {
      const material = PhysicsMaterial.frictionless();

      expect(material.name).toBe('Frictionless');
      expect(material.staticFriction).toBe(0.0);
      expect(material.dynamicFriction).toBe(0.0);
    });
  });

  describe('density', () => {
    it('ice has realistic density', () => {
      const ice = PhysicsMaterial.ice();

      expect(ice.density).toBeCloseTo(917, 1);
    });

    it('wood has lower density than water', () => {
      const wood = PhysicsMaterial.wood();

      expect(wood.density).toBe(700);
      expect(wood.density).toBeLessThan(1000);
    });

    it('metal has high density', () => {
      const metal = PhysicsMaterial.metal();

      expect(metal.density).toBe(7850);
      expect(metal.density).toBeGreaterThan(5000);
    });

    it('concrete has medium-high density', () => {
      const concrete = PhysicsMaterial.concrete();

      expect(concrete.density).toBe(2400);
    });

    it('custom density can be very low', () => {
      const material = new PhysicsMaterial({ density: 10 });

      expect(material.density).toBe(10);
    });

    it('custom density can be very high', () => {
      const material = new PhysicsMaterial({ density: 19300 });

      expect(material.density).toBe(19300);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const original = PhysicsMaterial.rubber();
      const cloned = original.clone();

      expect(cloned.name).toBe(original.name);
      expect(cloned.staticFriction).toBe(original.staticFriction);
      expect(cloned.dynamicFriction).toBe(original.dynamicFriction);
      expect(cloned.restitution).toBe(original.restitution);
      expect(cloned.density).toBe(original.density);
      expect(cloned).not.toBe(original);
    });

    it('modifying clone does not affect original', () => {
      const original = PhysicsMaterial.metal();
      const cloned = original.clone();

      cloned.staticFriction = 10;
      cloned.restitution = 5;

      expect(original.staticFriction).toBe(0.3);
      expect(original.restitution).toBe(0.2);
    });

    it('cloned material preserves combine modes', () => {
      const original = new PhysicsMaterial({
        frictionCombine: CombineMode.Multiply,
        restitutionCombine: CombineMode.Maximum
      });

      const cloned = original.clone();

      expect(cloned.frictionCombine).toBe(CombineMode.Multiply);
      expect(cloned.restitutionCombine).toBe(CombineMode.Maximum);
    });
  });

  describe('material interactions', () => {
    it('ice on ice is very slippery', () => {
      const ice1 = PhysicsMaterial.ice();
      const ice2 = PhysicsMaterial.ice();

      const friction = PhysicsMaterial.combineFriction(
        ice1.staticFriction,
        ice2.staticFriction,
        ice1.frictionCombine,
        ice2.frictionCombine
      );

      expect(friction).toBeLessThan(0.1);
    });

    it('rubber on rubber has high friction', () => {
      const rubber1 = PhysicsMaterial.rubber();
      const rubber2 = PhysicsMaterial.rubber();

      const friction = PhysicsMaterial.combineFriction(
        rubber1.staticFriction,
        rubber2.staticFriction,
        rubber1.frictionCombine,
        rubber2.frictionCombine
      );

      expect(friction).toBeGreaterThan(0.8);
    });

    it('bouncy materials create very bouncy collisions', () => {
      const bouncy1 = PhysicsMaterial.bouncy();
      const bouncy2 = PhysicsMaterial.bouncy();

      const restitution = PhysicsMaterial.combineRestitution(
        bouncy1.restitution,
        bouncy2.restitution,
        bouncy1.restitutionCombine,
        bouncy2.restitutionCombine
      );

      expect(restitution).toBeGreaterThan(0.9);
    });

    it('rubber on ice is slippery', () => {
      const rubber = PhysicsMaterial.rubber();
      const ice = PhysicsMaterial.ice();

      const friction = PhysicsMaterial.combineFriction(
        rubber.staticFriction,
        ice.staticFriction,
        rubber.frictionCombine,
        ice.frictionCombine
      );

      expect(friction).toBeLessThan(rubber.staticFriction);
    });

    it('bouncy on concrete has medium restitution', () => {
      const bouncy = PhysicsMaterial.bouncy();
      const concrete = PhysicsMaterial.concrete();

      const restitution = PhysicsMaterial.combineRestitution(
        bouncy.restitution,
        concrete.restitution,
        bouncy.restitutionCombine,
        concrete.restitutionCombine
      );

      expect(restitution).toBeGreaterThan(concrete.restitution);
      expect(restitution).toBeLessThan(bouncy.restitution);
    });

    it('metal on metal has low bounce', () => {
      const metal1 = PhysicsMaterial.metal();
      const metal2 = PhysicsMaterial.metal();

      const restitution = PhysicsMaterial.combineRestitution(
        metal1.restitution,
        metal2.restitution,
        metal1.restitutionCombine,
        metal2.restitutionCombine
      );

      expect(restitution).toBeLessThan(0.3);
    });
  });

  describe('edge cases', () => {
    it('handles zero friction on both materials', () => {
      const result = PhysicsMaterial.combineFriction(
        0,
        0,
        CombineMode.Average,
        CombineMode.Average
      );

      expect(result).toBe(0);
    });

    it('handles zero restitution on both materials', () => {
      const result = PhysicsMaterial.combineRestitution(
        0,
        0,
        CombineMode.Average,
        CombineMode.Average
      );

      expect(result).toBe(0);
    });

    it('multiply with zero gives zero', () => {
      const result = PhysicsMaterial.combineFriction(
        1,
        0,
        CombineMode.Multiply,
        CombineMode.Multiply
      );

      expect(result).toBe(0);
    });

    it('maximum with extreme values', () => {
      const result = PhysicsMaterial.combineFriction(
        1000,
        1,
        CombineMode.Maximum,
        CombineMode.Maximum
      );

      expect(result).toBe(1000);
    });

    it('minimum with extreme values', () => {
      const result = PhysicsMaterial.combineFriction(
        1000,
        0.001,
        CombineMode.Minimum,
        CombineMode.Minimum
      );

      expect(result).toBe(0.001);
    });

    it('handles very high density', () => {
      const material = new PhysicsMaterial({ density: 100000 });

      expect(material.density).toBe(100000);
    });

    it('handles fractional density', () => {
      const material = new PhysicsMaterial({ density: 0.1 });

      expect(material.density).toBe(0.1);
    });
  });

  describe('realistic material properties', () => {
    it('wood floats in water density', () => {
      const wood = PhysicsMaterial.wood();

      expect(wood.density).toBeLessThan(1000);
    });

    it('metal sinks in water density', () => {
      const metal = PhysicsMaterial.metal();

      expect(metal.density).toBeGreaterThan(1000);
    });

    it('ice nearly floats in water', () => {
      const ice = PhysicsMaterial.ice();

      expect(ice.density).toBeLessThan(1000);
      expect(ice.density).toBeGreaterThan(900);
    });

    it('rubber has realistic friction for tires', () => {
      const rubber = PhysicsMaterial.rubber();

      expect(rubber.staticFriction).toBeGreaterThan(0.7);
      expect(rubber.dynamicFriction).toBeGreaterThan(0.5);
    });

    it('ice has realistic low friction', () => {
      const ice = PhysicsMaterial.ice();

      expect(ice.staticFriction).toBeLessThan(0.1);
      expect(ice.dynamicFriction).toBeLessThan(0.1);
    });
  });
});
