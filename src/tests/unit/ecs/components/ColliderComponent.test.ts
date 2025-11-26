/**
 * @fileoverview Unit tests for ColliderComponent.
 * Tests box, sphere, capsule, mesh colliders, triggers, and collision layers.
 */

import { describe, it, expect, beforeEach } from 'vitest';

class ColliderComponent {
  colliderType: 'box' | 'sphere' | 'capsule' | 'mesh' | 'compound';
  isTrigger: boolean;
  collisionLayer: number;
  collisionMask: number;
  material: {
    friction: number;
    restitution: number;
    density: number;
  };
  boxSize: [number, number, number];
  sphereRadius: number;
  capsuleRadius: number;
  capsuleHeight: number;
  meshId: string;
  children: any[];
  center: [number, number, number];
  enabled: boolean;

  constructor(options?: Partial<ColliderComponent>) {
    this.colliderType = options?.colliderType ?? 'box';
    this.isTrigger = options?.isTrigger ?? false;
    this.collisionLayer = options?.collisionLayer ?? 1;
    this.collisionMask = options?.collisionMask ?? 0xFFFFFFFF;
    this.material = options?.material ?? {
      friction: 0.5,
      restitution: 0.3,
      density: 1.0
    };
    this.boxSize = options?.boxSize ?? [1, 1, 1];
    this.sphereRadius = options?.sphereRadius ?? 0.5;
    this.capsuleRadius = options?.capsuleRadius ?? 0.5;
    this.capsuleHeight = options?.capsuleHeight ?? 2;
    this.meshId = options?.meshId ?? '';
    this.children = options?.children ?? [];
    this.center = options?.center ?? [0, 0, 0];
    this.enabled = options?.enabled ?? true;
  }

  setType(type: 'box' | 'sphere' | 'capsule' | 'mesh' | 'compound'): this {
    this.colliderType = type;
    return this;
  }

  setBox(width: number, height: number, depth: number): this {
    this.colliderType = 'box';
    this.boxSize = [width, height, depth];
    return this;
  }

  setSphere(radius: number): this {
    this.colliderType = 'sphere';
    this.sphereRadius = Math.max(0.001, radius);
    return this;
  }

  setCapsule(radius: number, height: number): this {
    this.colliderType = 'capsule';
    this.capsuleRadius = Math.max(0.001, radius);
    this.capsuleHeight = Math.max(0.001, height);
    return this;
  }

  setMesh(meshId: string): this {
    this.colliderType = 'mesh';
    this.meshId = meshId;
    return this;
  }

  setTrigger(isTrigger: boolean): this {
    this.isTrigger = isTrigger;
    return this;
  }

  setCollisionLayer(layer: number): this {
    this.collisionLayer = layer;
    return this;
  }

  setCollisionMask(mask: number): this {
    this.collisionMask = mask;
    return this;
  }

  setMaterial(friction: number, restitution: number, density: number = 1.0): this {
    this.material = {
      friction: Math.max(0, friction),
      restitution: Math.max(0, Math.min(1, restitution)),
      density: Math.max(0.001, density)
    };
    return this;
  }

  setCenter(x: number, y: number, z: number): this {
    this.center = [x, y, z];
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    return this;
  }

  canCollideWith(otherLayer: number): boolean {
    return (this.collisionMask & otherLayer) !== 0;
  }

  addChild(collider: ColliderComponent): this {
    if (this.colliderType !== 'compound') {
      this.colliderType = 'compound';
    }
    this.children.push(collider);
    return this;
  }

  removeChild(collider: ColliderComponent): boolean {
    const index = this.children.indexOf(collider);
    if (index !== -1) {
      this.children.splice(index, 1);
      return true;
    }
    return false;
  }

  getVolume(): number {
    switch (this.colliderType) {
      case 'box':
        return this.boxSize[0] * this.boxSize[1] * this.boxSize[2];
      case 'sphere':
        return (4/3) * Math.PI * Math.pow(this.sphereRadius, 3);
      case 'capsule':
        const cylinderVol = Math.PI * Math.pow(this.capsuleRadius, 2) * (this.capsuleHeight - 2 * this.capsuleRadius);
        const sphereVol = (4/3) * Math.PI * Math.pow(this.capsuleRadius, 3);
        return cylinderVol + sphereVol;
      default:
        return 0;
    }
  }

  serialize(): object {
    return {
      colliderType: this.colliderType,
      isTrigger: this.isTrigger,
      collisionLayer: this.collisionLayer,
      collisionMask: this.collisionMask,
      material: this.material,
      boxSize: this.boxSize,
      sphereRadius: this.sphereRadius,
      capsuleRadius: this.capsuleRadius,
      capsuleHeight: this.capsuleHeight,
      meshId: this.meshId,
      center: this.center,
      enabled: this.enabled
    };
  }

  deserialize(data: any): void {
    this.colliderType = data.colliderType ?? 'box';
    this.isTrigger = data.isTrigger ?? false;
    this.collisionLayer = data.collisionLayer ?? 1;
    this.collisionMask = data.collisionMask ?? 0xFFFFFFFF;
    this.material = data.material ?? { friction: 0.5, restitution: 0.3, density: 1.0 };
    this.boxSize = data.boxSize ?? [1, 1, 1];
    this.sphereRadius = data.sphereRadius ?? 0.5;
    this.capsuleRadius = data.capsuleRadius ?? 0.5;
    this.capsuleHeight = data.capsuleHeight ?? 2;
    this.meshId = data.meshId ?? '';
    this.center = data.center ?? [0, 0, 0];
    this.enabled = data.enabled ?? true;
  }

  reset(): void {
    this.colliderType = 'box';
    this.isTrigger = false;
    this.collisionLayer = 1;
    this.collisionMask = 0xFFFFFFFF;
    this.material = { friction: 0.5, restitution: 0.3, density: 1.0 };
    this.boxSize = [1, 1, 1];
    this.sphereRadius = 0.5;
    this.capsuleRadius = 0.5;
    this.capsuleHeight = 2;
    this.meshId = '';
    this.children = [];
    this.center = [0, 0, 0];
    this.enabled = true;
  }
}

describe('ColliderComponent', () => {
  describe('initialization', () => {
    it('creates with default box collider', () => {
      const col = new ColliderComponent();
      expect(col.colliderType).toBe('box');
      expect(col.boxSize).toEqual([1, 1, 1]);
      expect(col.enabled).toBe(true);
    });

    it('creates as trigger', () => {
      const col = new ColliderComponent({ isTrigger: true });
      expect(col.isTrigger).toBe(true);
    });

    it('creates with custom layer', () => {
      const col = new ColliderComponent({ collisionLayer: 2 });
      expect(col.collisionLayer).toBe(2);
    });
  });

  describe('box collider', () => {
    it('setBox() creates box collider', () => {
      const col = new ColliderComponent();
      col.setBox(2, 3, 4);

      expect(col.colliderType).toBe('box');
      expect(col.boxSize).toEqual([2, 3, 4]);
    });

    it('getVolume() calculates box volume', () => {
      const col = new ColliderComponent();
      col.setBox(2, 3, 4);

      expect(col.getVolume()).toBe(24);
    });

    it('supports non-uniform box', () => {
      const col = new ColliderComponent();
      col.setBox(1, 2, 0.5);

      expect(col.boxSize).toEqual([1, 2, 0.5]);
    });

    it('supports cube', () => {
      const col = new ColliderComponent();
      col.setBox(1, 1, 1);

      expect(col.boxSize).toEqual([1, 1, 1]);
    });
  });

  describe('sphere collider', () => {
    it('setSphere() creates sphere collider', () => {
      const col = new ColliderComponent();
      col.setSphere(2);

      expect(col.colliderType).toBe('sphere');
      expect(col.sphereRadius).toBe(2);
    });

    it('setSphere() clamps to minimum', () => {
      const col = new ColliderComponent();
      col.setSphere(0);

      expect(col.sphereRadius).toBeGreaterThan(0);
    });

    it('getVolume() calculates sphere volume', () => {
      const col = new ColliderComponent();
      col.setSphere(1);

      const expectedVolume = (4/3) * Math.PI;
      expect(col.getVolume()).toBeCloseTo(expectedVolume, 5);
    });

    it('supports large sphere', () => {
      const col = new ColliderComponent();
      col.setSphere(100);

      expect(col.sphereRadius).toBe(100);
    });
  });

  describe('capsule collider', () => {
    it('setCapsule() creates capsule collider', () => {
      const col = new ColliderComponent();
      col.setCapsule(1, 3);

      expect(col.colliderType).toBe('capsule');
      expect(col.capsuleRadius).toBe(1);
      expect(col.capsuleHeight).toBe(3);
    });

    it('setCapsule() clamps radius to minimum', () => {
      const col = new ColliderComponent();
      col.setCapsule(0, 2);

      expect(col.capsuleRadius).toBeGreaterThan(0);
    });

    it('setCapsule() clamps height to minimum', () => {
      const col = new ColliderComponent();
      col.setCapsule(1, 0);

      expect(col.capsuleHeight).toBeGreaterThan(0);
    });

    it('getVolume() calculates capsule volume', () => {
      const col = new ColliderComponent();
      col.setCapsule(1, 4);

      const volume = col.getVolume();
      expect(volume).toBeGreaterThan(0);
    });

    it('supports tall capsule', () => {
      const col = new ColliderComponent();
      col.setCapsule(0.5, 10);

      expect(col.capsuleHeight).toBe(10);
    });
  });

  describe('mesh collider', () => {
    it('setMesh() creates mesh collider', () => {
      const col = new ColliderComponent();
      col.setMesh('character_mesh');

      expect(col.colliderType).toBe('mesh');
      expect(col.meshId).toBe('character_mesh');
    });

    it('accepts empty mesh ID', () => {
      const col = new ColliderComponent();
      col.setMesh('');

      expect(col.meshId).toBe('');
    });

    it('can change mesh', () => {
      const col = new ColliderComponent();
      col.setMesh('mesh1');
      col.setMesh('mesh2');

      expect(col.meshId).toBe('mesh2');
    });
  });

  describe('compound colliders', () => {
    it('addChild() creates compound collider', () => {
      const parent = new ColliderComponent();
      const child = new ColliderComponent();

      parent.addChild(child);

      expect(parent.colliderType).toBe('compound');
      expect(parent.children.length).toBe(1);
    });

    it('can add multiple children', () => {
      const parent = new ColliderComponent();
      const child1 = new ColliderComponent();
      const child2 = new ColliderComponent();

      parent.addChild(child1).addChild(child2);

      expect(parent.children.length).toBe(2);
    });

    it('removeChild() removes child collider', () => {
      const parent = new ColliderComponent();
      const child = new ColliderComponent();

      parent.addChild(child);
      const removed = parent.removeChild(child);

      expect(removed).toBe(true);
      expect(parent.children.length).toBe(0);
    });

    it('removeChild() returns false for non-existent child', () => {
      const parent = new ColliderComponent();
      const child = new ColliderComponent();

      const removed = parent.removeChild(child);

      expect(removed).toBe(false);
    });
  });

  describe('trigger volumes', () => {
    it('setTrigger() makes collider a trigger', () => {
      const col = new ColliderComponent();
      col.setTrigger(true);

      expect(col.isTrigger).toBe(true);
    });

    it('setTrigger() makes collider solid', () => {
      const col = new ColliderComponent({ isTrigger: true });
      col.setTrigger(false);

      expect(col.isTrigger).toBe(false);
    });

    it('triggers can have any shape', () => {
      const box = new ColliderComponent();
      box.setBox(1, 1, 1).setTrigger(true);

      const sphere = new ColliderComponent();
      sphere.setSphere(1).setTrigger(true);

      expect(box.isTrigger).toBe(true);
      expect(sphere.isTrigger).toBe(true);
    });
  });

  describe('collision layers', () => {
    it('setCollisionLayer() sets layer', () => {
      const col = new ColliderComponent();
      col.setCollisionLayer(4);

      expect(col.collisionLayer).toBe(4);
    });

    it('setCollisionMask() sets mask', () => {
      const col = new ColliderComponent();
      col.setCollisionMask(0xFF);

      expect(col.collisionMask).toBe(0xFF);
    });

    it('canCollideWith() checks layer compatibility', () => {
      const col = new ColliderComponent();
      col.setCollisionLayer(1);
      col.setCollisionMask(0b0011);

      expect(col.canCollideWith(0b0001)).toBe(true);
      expect(col.canCollideWith(0b0010)).toBe(true);
      expect(col.canCollideWith(0b0100)).toBe(false);
    });

    it('default mask collides with everything', () => {
      const col = new ColliderComponent();

      expect(col.canCollideWith(1)).toBe(true);
      expect(col.canCollideWith(0xFF)).toBe(true);
    });

    it('zero mask collides with nothing', () => {
      const col = new ColliderComponent();
      col.setCollisionMask(0);

      expect(col.canCollideWith(1)).toBe(false);
      expect(col.canCollideWith(0xFF)).toBe(false);
    });
  });

  describe('physics material', () => {
    it('setMaterial() updates friction and restitution', () => {
      const col = new ColliderComponent();
      col.setMaterial(0.8, 0.5);

      expect(col.material.friction).toBe(0.8);
      expect(col.material.restitution).toBe(0.5);
    });

    it('setMaterial() updates density', () => {
      const col = new ColliderComponent();
      col.setMaterial(0.5, 0.3, 2.0);

      expect(col.material.density).toBe(2.0);
    });

    it('setMaterial() clamps friction to non-negative', () => {
      const col = new ColliderComponent();
      col.setMaterial(-1, 0.5);

      expect(col.material.friction).toBe(0);
    });

    it('setMaterial() clamps restitution to [0,1]', () => {
      const col = new ColliderComponent();
      col.setMaterial(0.5, 1.5);

      expect(col.material.restitution).toBeLessThanOrEqual(1);
    });

    it('setMaterial() clamps density to minimum', () => {
      const col = new ColliderComponent();
      col.setMaterial(0.5, 0.5, 0);

      expect(col.material.density).toBeGreaterThan(0);
    });

    it('supports ice material (low friction)', () => {
      const col = new ColliderComponent();
      col.setMaterial(0.1, 0.3);

      expect(col.material.friction).toBe(0.1);
    });

    it('supports rubber material (high friction, high bounce)', () => {
      const col = new ColliderComponent();
      col.setMaterial(1.0, 0.9);

      expect(col.material.friction).toBe(1.0);
      expect(col.material.restitution).toBe(0.9);
    });
  });

  describe('center offset', () => {
    it('setCenter() updates center offset', () => {
      const col = new ColliderComponent();
      col.setCenter(1, 2, 3);

      expect(col.center).toEqual([1, 2, 3]);
    });

    it('default center is origin', () => {
      const col = new ColliderComponent();
      expect(col.center).toEqual([0, 0, 0]);
    });

    it('supports arbitrary offset', () => {
      const col = new ColliderComponent();
      col.setCenter(0.5, -0.5, 0.25);

      expect(col.center).toEqual([0.5, -0.5, 0.25]);
    });
  });

  describe('enable/disable', () => {
    it('setEnabled() enables collider', () => {
      const col = new ColliderComponent({ enabled: false });
      col.setEnabled(true);

      expect(col.enabled).toBe(true);
    });

    it('setEnabled() disables collider', () => {
      const col = new ColliderComponent();
      col.setEnabled(false);

      expect(col.enabled).toBe(false);
    });
  });

  describe('serialization', () => {
    it('serialize() produces correct structure', () => {
      const col = new ColliderComponent({
        colliderType: 'sphere',
        isTrigger: true,
        collisionLayer: 2,
        sphereRadius: 3
      });

      const data = col.serialize();

      expect(data).toHaveProperty('colliderType', 'sphere');
      expect(data).toHaveProperty('isTrigger', true);
      expect(data).toHaveProperty('collisionLayer', 2);
      expect(data).toHaveProperty('sphereRadius', 3);
    });

    it('deserialize() restores state', () => {
      const data = {
        colliderType: 'capsule' as const,
        isTrigger: false,
        collisionLayer: 3,
        capsuleRadius: 1,
        capsuleHeight: 4,
        material: { friction: 0.7, restitution: 0.4, density: 1.5 }
      };

      const col = new ColliderComponent();
      col.deserialize(data);

      expect(col.colliderType).toBe('capsule');
      expect(col.capsuleRadius).toBe(1);
      expect(col.capsuleHeight).toBe(4);
      expect(col.material.friction).toBe(0.7);
    });

    it('round-trip preserves data', () => {
      const col1 = new ColliderComponent({
        colliderType: 'box',
        boxSize: [2, 3, 4],
        isTrigger: true,
        collisionLayer: 5
      });

      const data = col1.serialize();
      const col2 = new ColliderComponent();
      col2.deserialize(data);

      expect(JSON.stringify(col1.serialize())).toBe(JSON.stringify(col2.serialize()));
    });
  });

  describe('reset', () => {
    it('reset() returns to default state', () => {
      const col = new ColliderComponent({
        colliderType: 'sphere',
        sphereRadius: 10,
        isTrigger: true
      });

      col.reset();

      expect(col.colliderType).toBe('box');
      expect(col.isTrigger).toBe(false);
      expect(col.boxSize).toEqual([1, 1, 1]);
    });
  });

  describe('method chaining', () => {
    it('supports full method chain', () => {
      const col = new ColliderComponent();

      const result = col
        .setBox(2, 2, 2)
        .setTrigger(false)
        .setCollisionLayer(3)
        .setCollisionMask(0xFF)
        .setMaterial(0.6, 0.4, 1.2)
        .setCenter(0, 1, 0)
        .setEnabled(true);

      expect(result).toBe(col);
      expect(col.boxSize).toEqual([2, 2, 2]);
      expect(col.collisionLayer).toBe(3);
    });
  });
});
