import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Archetype } from '../../../ecs/Archetype';
import { Bitset } from '../../../ecs/Bitset';
import { Entity, EntityUtils } from '../../../ecs/Entity';
import { ComponentRegistry, IComponent } from '../../../ecs/ComponentRegistry';

// Test components
class Position implements IComponent {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  onAttach(entity: number): void {
    this.attachedTo = entity;
  }

  onDetach(entity: number): void {
    this.detachedFrom = entity;
  }

  attachedTo: number | null = null;
  detachedFrom: number | null = null;
}

class Velocity implements IComponent {
  constructor(public vx: number = 0, public vy: number = 0, public vz: number = 0) {}
}

class Health implements IComponent {
  constructor(public current: number = 100, public max: number = 100) {}
}

describe('Archetype', () => {
  let positionId: number;
  let velocityId: number;
  let healthId: number;

  beforeEach(() => {
    ComponentRegistry.reset();
    positionId = ComponentRegistry.register(Position);
    velocityId = ComponentRegistry.register(Velocity);
    healthId = ComponentRegistry.register(Health);
  });

  afterEach(() => {
    ComponentRegistry.reset();
  });

  describe('construction', () => {
    it('creates archetype with signature', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.id).toBe(1);
      expect(archetype.signature.equals(signature)).toBe(true);
    });

    it('clones signature to prevent external modification', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      signature.set(velocityId);

      expect(archetype.signature.get(velocityId)).toBe(false);
    });

    it('starts with zero entities', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.entityCount).toBe(0);
    });

    it('initializes empty edge maps', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.addEdge.size).toBe(0);
      expect(archetype.removeEdge.size).toBe(0);
    });
  });

  describe('addEntity()', () => {
    it('adds entity and returns row', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(42, 0);

      const row = archetype.addEntity(entity);

      expect(row).toBe(0);
      expect(archetype.entityCount).toBe(1);
    });

    it('adds multiple entities with sequential rows', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);
      const e3 = EntityUtils.create(3, 0);

      expect(archetype.addEntity(e1)).toBe(0);
      expect(archetype.addEntity(e2)).toBe(1);
      expect(archetype.addEntity(e3)).toBe(2);
    });

    it('throws if entity already in archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      archetype.addEntity(entity);

      expect(() => archetype.addEntity(entity)).toThrow(/already in archetype/i);
    });

    it('increments entity count', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.entityCount).toBe(0);

      archetype.addEntity(EntityUtils.create(1, 0));
      expect(archetype.entityCount).toBe(1);

      archetype.addEntity(EntityUtils.create(2, 0));
      expect(archetype.entityCount).toBe(2);
    });
  });

  describe('removeEntity()', () => {
    it('removes entity using swap-and-pop', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);
      const e3 = EntityUtils.create(3, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);
      archetype.addEntity(e3);

      archetype.removeEntity(e2);

      expect(archetype.entityCount).toBe(2);
      expect(archetype.hasEntity(e2)).toBe(false);
    });

    it('returns swapped entity when removing from middle', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);
      const e3 = EntityUtils.create(3, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);
      archetype.addEntity(e3);

      const swapped = archetype.removeEntity(e1);

      expect(swapped).toBe(e3);
    });

    it('returns null when removing last entity', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const entity = EntityUtils.create(1, 0);
      archetype.addEntity(entity);

      const swapped = archetype.removeEntity(entity);

      expect(swapped).toBeNull();
    });

    it('throws if entity not in archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      expect(() => archetype.removeEntity(entity)).toThrow(/not in archetype/i);
    });

    it('decrements entity count', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);

      archetype.removeEntity(e1);
      expect(archetype.entityCount).toBe(1);

      archetype.removeEntity(e2);
      expect(archetype.entityCount).toBe(0);
    });
  });

  describe('hasEntity()', () => {
    it('returns true for entity in archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      archetype.addEntity(entity);

      expect(archetype.hasEntity(entity)).toBe(true);
    });

    it('returns false for entity not in archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      expect(archetype.hasEntity(entity)).toBe(false);
    });

    it('returns false after entity removed', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      archetype.addEntity(entity);
      archetype.removeEntity(entity);

      expect(archetype.hasEntity(entity)).toBe(false);
    });
  });

  describe('getEntityRow()', () => {
    it('returns row for entity in archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);

      expect(archetype.getEntityRow(e1)).toBe(0);
      expect(archetype.getEntityRow(e2)).toBe(1);
    });

    it('returns -1 for entity not in archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      expect(archetype.getEntityRow(entity)).toBe(-1);
    });

    it('updates after swap-and-pop', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);
      const e3 = EntityUtils.create(3, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);
      archetype.addEntity(e3);

      archetype.removeEntity(e1);

      expect(archetype.getEntityRow(e3)).toBe(0);
    });
  });

  describe('component operations', () => {
    it('setComponent() stores component', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      archetype.addEntity(entity);

      const pos = new Position(10, 20, 30);
      archetype.setComponent(entity, positionId, pos);

      const retrieved = archetype.getComponent<Position>(entity, positionId);
      expect(retrieved).toBe(pos);
      expect(retrieved?.x).toBe(10);
    });

    it('setComponent() calls onAttach hook', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(42, 0);

      archetype.addEntity(entity);

      const pos = new Position();
      archetype.setComponent(entity, positionId, pos);

      expect(pos.attachedTo).toBe(entity);
    });

    it('getComponent() returns undefined for missing component', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      archetype.addEntity(entity);

      const comp = archetype.getComponent(entity, velocityId);
      expect(comp).toBeUndefined();
    });

    it('getComponent() returns undefined for non-existent entity', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      const comp = archetype.getComponent(entity, positionId);
      expect(comp).toBeUndefined();
    });

    it('removeComponent() calls onDetach hook', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(42, 0);

      archetype.addEntity(entity);

      const pos = new Position();
      archetype.setComponent(entity, positionId, pos);
      archetype.removeComponent(entity, positionId);

      expect(pos.detachedFrom).toBe(entity);
    });

    it('getComponents() returns all entity components', () => {
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      archetype.addEntity(entity);

      const pos = new Position(1, 2, 3);
      const vel = new Velocity(4, 5, 6);

      archetype.setComponent(entity, positionId, pos);
      archetype.setComponent(entity, velocityId, vel);

      const components = archetype.getComponents(entity);

      expect(components.length).toBe(2);
      expect(components).toContain(pos);
      expect(components).toContain(vel);
    });

    it('getComponents() returns empty for non-existent entity', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);
      const entity = EntityUtils.create(1, 0);

      const components = archetype.getComponents(entity);
      expect(components).toHaveLength(0);
    });
  });

  describe('hasComponent()', () => {
    it('returns true for component in signature', () => {
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.hasComponent(positionId)).toBe(true);
      expect(archetype.hasComponent(velocityId)).toBe(true);
    });

    it('returns false for component not in signature', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.hasComponent(healthId)).toBe(false);
    });
  });

  describe('hasComponents()', () => {
    it('returns true when all components present', () => {
      const signature = Bitset.fromArray([positionId, velocityId, healthId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.hasComponents([positionId, velocityId])).toBe(true);
      expect(archetype.hasComponents([positionId])).toBe(true);
    });

    it('returns false when any component missing', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.hasComponents([positionId, velocityId])).toBe(false);
    });

    it('returns true for empty array', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      expect(archetype.hasComponents([])).toBe(true);
    });
  });

  describe('matchesSignature()', () => {
    it('matches when required components present', () => {
      const signature = Bitset.fromArray([positionId, velocityId, healthId]);
      const archetype = new Archetype(1, signature);

      const required = Bitset.fromArray([positionId, velocityId]);

      expect(archetype.matchesSignature(required)).toBe(true);
    });

    it('does not match when required component missing', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const required = Bitset.fromArray([positionId, velocityId]);

      expect(archetype.matchesSignature(required)).toBe(false);
    });

    it('matches with empty required', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const required = new Bitset();

      expect(archetype.matchesSignature(required)).toBe(true);
    });

    it('does not match when excluded component present', () => {
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);

      const required = Bitset.fromArray([positionId]);
      const excluded = Bitset.fromArray([velocityId]);

      expect(archetype.matchesSignature(required, excluded)).toBe(false);
    });

    it('matches when no excluded components present', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const required = Bitset.fromArray([positionId]);
      const excluded = Bitset.fromArray([velocityId]);

      expect(archetype.matchesSignature(required, excluded)).toBe(true);
    });
  });

  describe('forEach()', () => {
    it('iterates over all entities', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);
      const e3 = EntityUtils.create(3, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);
      archetype.addEntity(e3);

      const visited: Entity[] = [];
      archetype.forEach((entity, row) => {
        visited.push(entity);
      });

      expect(visited).toHaveLength(3);
      expect(visited).toContain(e1);
      expect(visited).toContain(e2);
      expect(visited).toContain(e3);
    });

    it('provides correct row indices', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      archetype.addEntity(EntityUtils.create(1, 0));
      archetype.addEntity(EntityUtils.create(2, 0));
      archetype.addEntity(EntityUtils.create(3, 0));

      const rows: number[] = [];
      archetype.forEach((entity, row) => {
        rows.push(row);
      });

      expect(rows).toEqual([0, 1, 2]);
    });

    it('works with empty archetype', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      let count = 0;
      archetype.forEach(() => {
        count++;
      });

      expect(count).toBe(0);
    });
  });

  describe('entities getter', () => {
    it('returns all entities', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);

      const entities = archetype.entities;

      expect(entities).toHaveLength(2);
      expect(entities).toContain(e1);
      expect(entities).toContain(e2);
    });

    it('returns readonly array', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const entities = archetype.entities as any;

      expect(() => {
        entities.push(EntityUtils.create(99, 0));
      }).toThrow();
    });
  });

  describe('toString()', () => {
    it('formats archetype as string', () => {
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(5, signature);

      const str = archetype.toString();

      expect(str).toContain('Archetype');
      expect(str).toContain('id:5');
      expect(str).toContain('entities:0');
    });

    it('includes component IDs', () => {
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);

      const str = archetype.toString();

      expect(str).toContain(positionId.toString());
      expect(str).toContain(velocityId.toString());
    });
  });

  describe('createSignature()', () => {
    it('creates bitset from component IDs', () => {
      const signature = Archetype.createSignature([positionId, velocityId]);

      expect(signature.get(positionId)).toBe(true);
      expect(signature.get(velocityId)).toBe(true);
      expect(signature.get(healthId)).toBe(false);
    });

    it('creates empty bitset for empty array', () => {
      const signature = Archetype.createSignature([]);

      expect(signature.isEmpty()).toBe(true);
    });
  });

  describe('edge tracking', () => {
    it('stores add edge', () => {
      const sig1 = Bitset.fromArray([positionId]);
      const sig2 = Bitset.fromArray([positionId, velocityId]);

      const arch1 = new Archetype(1, sig1);
      const arch2 = new Archetype(2, sig2);

      arch1.addEdge.set(velocityId, arch2);

      expect(arch1.addEdge.get(velocityId)).toBe(arch2);
    });

    it('stores remove edge', () => {
      const sig1 = Bitset.fromArray([positionId, velocityId]);
      const sig2 = Bitset.fromArray([positionId]);

      const arch1 = new Archetype(1, sig1);
      const arch2 = new Archetype(2, sig2);

      arch1.removeEdge.set(velocityId, arch2);

      expect(arch1.removeEdge.get(velocityId)).toBe(arch2);
    });
  });

  describe('stress tests', () => {
    it('handles 10000 entities', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const entities: Entity[] = [];
      for (let i = 0; i < 10000; i++) {
        const entity = EntityUtils.create(i + 1, 0);
        entities.push(entity);
        archetype.addEntity(entity);
      }

      expect(archetype.entityCount).toBe(10000);

      for (const entity of entities) {
        expect(archetype.hasEntity(entity)).toBe(true);
      }
    });

    it('handles rapid add/remove cycles', () => {
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      for (let cycle = 0; cycle < 100; cycle++) {
        const entities: Entity[] = [];

        for (let i = 0; i < 100; i++) {
          const entity = EntityUtils.create(i + 1, 0);
          entities.push(entity);
          archetype.addEntity(entity);
        }

        for (const entity of entities) {
          archetype.removeEntity(entity);
        }
      }

      expect(archetype.entityCount).toBe(0);
    });
  });
});
