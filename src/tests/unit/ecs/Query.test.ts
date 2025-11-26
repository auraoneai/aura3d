import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Query, QueryDescriptor } from '../../../ecs/Query';
import { Archetype } from '../../../ecs/Archetype';
import { Bitset } from '../../../ecs/Bitset';
import { ComponentRegistry, IComponent } from '../../../ecs/ComponentRegistry';
import { EntityUtils } from '../../../ecs/Entity';

// Test components
class Position implements IComponent {
  x: number = 0;
  y: number = 0;
  z: number = 0;
}

class Velocity implements IComponent {
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;
}

class Health implements IComponent {
  current: number = 100;
  max: number = 100;
}

class Mesh implements IComponent {
  vertexCount: number = 0;
}

class Sprite implements IComponent {
  textureId: number = 0;
}

class Hidden implements IComponent {}
class Disabled implements IComponent {}
class Frozen implements IComponent {}

describe('Query', () => {
  let positionId: number;
  let velocityId: number;
  let healthId: number;
  let meshId: number;
  let spriteId: number;
  let hiddenId: number;
  let disabledId: number;
  let frozenId: number;

  beforeEach(() => {
    ComponentRegistry.reset();
    positionId = ComponentRegistry.register(Position);
    velocityId = ComponentRegistry.register(Velocity);
    healthId = ComponentRegistry.register(Health);
    meshId = ComponentRegistry.register(Mesh);
    spriteId = ComponentRegistry.register(Sprite);
    hiddenId = ComponentRegistry.register(Hidden);
    disabledId = ComponentRegistry.register(Disabled);
    frozenId = ComponentRegistry.register(Frozen);
  });

  afterEach(() => {
    ComponentRegistry.reset();
  });

  describe('construction', () => {
    it('creates query with all requirement', () => {
      const query = new Query({ all: [Position] });
      expect(query.descriptor.all).toEqual([Position]);
    });

    it('creates query with multiple all requirements', () => {
      const query = new Query({ all: [Position, Velocity] });
      expect(query.descriptor.all).toEqual([Position, Velocity]);
    });

    it('creates query with any requirement', () => {
      const query = new Query({ any: [Mesh, Sprite] });
      expect(query.descriptor.any).toEqual([Mesh, Sprite]);
    });

    it('creates query with none requirement', () => {
      const query = new Query({ none: [Hidden, Disabled] });
      expect(query.descriptor.none).toEqual([Hidden, Disabled]);
    });

    it('creates complex query', () => {
      const descriptor: QueryDescriptor = {
        all: [Position, Velocity],
        any: [Mesh, Sprite],
        none: [Hidden]
      };

      const query = new Query(descriptor);
      expect(query.descriptor).toEqual(descriptor);
    });

    it('initializes version to 0', () => {
      const query = new Query({ all: [Position] });
      expect(query.version).toBe(0);
    });

    it('initializes with empty archetype list', () => {
      const query = new Query({ all: [Position] });
      expect(query.matchingArchetypes).toHaveLength(0);
    });
  });

  describe('static factory methods', () => {
    it('Query.all() creates query with all requirement', () => {
      const query = Query.all(Position, Velocity);
      expect(query.descriptor.all).toEqual([Position, Velocity]);
      expect(query.descriptor.any).toBeUndefined();
      expect(query.descriptor.none).toBeUndefined();
    });

    it('Query.any() creates query with any requirement', () => {
      const query = Query.any(Mesh, Sprite);
      expect(query.descriptor.any).toEqual([Mesh, Sprite]);
      expect(query.descriptor.all).toBeUndefined();
      expect(query.descriptor.none).toBeUndefined();
    });

    it('Query.none() creates query with none requirement', () => {
      const query = Query.none(Hidden, Disabled);
      expect(query.descriptor.none).toEqual([Hidden, Disabled]);
      expect(query.descriptor.all).toBeUndefined();
      expect(query.descriptor.any).toBeUndefined();
    });

    it('Query.fromDescriptor() creates from descriptor', () => {
      const descriptor: QueryDescriptor = {
        all: [Position],
        none: [Hidden]
      };

      const query = Query.fromDescriptor(descriptor);
      expect(query.descriptor).toEqual(descriptor);
    });
  });

  describe('matchesSignature()', () => {
    it('matches signature with all required components', () => {
      const query = Query.all(Position, Velocity);
      const signature = Bitset.fromArray([positionId, velocityId, healthId]);

      expect(query.matchesSignature(signature)).toBe(true);
    });

    it('does not match signature missing required component', () => {
      const query = Query.all(Position, Velocity);
      const signature = Bitset.fromArray([positionId]);

      expect(query.matchesSignature(signature)).toBe(false);
    });

    it('matches signature with at least one any component', () => {
      const query = Query.any(Mesh, Sprite);
      const signature1 = Bitset.fromArray([meshId]);
      const signature2 = Bitset.fromArray([spriteId]);
      const signature3 = Bitset.fromArray([meshId, spriteId]);

      expect(query.matchesSignature(signature1)).toBe(true);
      expect(query.matchesSignature(signature2)).toBe(true);
      expect(query.matchesSignature(signature3)).toBe(true);
    });

    it('does not match signature with no any components', () => {
      const query = Query.any(Mesh, Sprite);
      const signature = Bitset.fromArray([positionId]);

      expect(query.matchesSignature(signature)).toBe(false);
    });

    it('does not match signature with excluded component', () => {
      const query = Query.none(Hidden, Disabled);
      const signature = Bitset.fromArray([positionId, hiddenId]);

      expect(query.matchesSignature(signature)).toBe(false);
    });

    it('matches signature without excluded components', () => {
      const query = Query.none(Hidden);
      const signature = Bitset.fromArray([positionId, velocityId]);

      expect(query.matchesSignature(signature)).toBe(true);
    });

    it('matches complex query correctly', () => {
      const query = new Query({
        all: [Position],
        any: [Mesh, Sprite],
        none: [Hidden]
      });

      const match1 = Bitset.fromArray([positionId, meshId]);
      const match2 = Bitset.fromArray([positionId, spriteId]);
      const noMatch1 = Bitset.fromArray([positionId]);
      const noMatch2 = Bitset.fromArray([positionId, meshId, hiddenId]);

      expect(query.matchesSignature(match1)).toBe(true);
      expect(query.matchesSignature(match2)).toBe(true);
      expect(query.matchesSignature(noMatch1)).toBe(false);
      expect(query.matchesSignature(noMatch2)).toBe(false);
    });

    it('empty any requirement matches all', () => {
      const query = new Query({ all: [Position] });
      const signature = Bitset.fromArray([positionId, velocityId]);

      expect(query.matchesSignature(signature)).toBe(true);
    });
  });

  describe('matches()', () => {
    it('matches archetype by signature', () => {
      const query = Query.all(Position, Velocity);
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);

      expect(query.matches(archetype)).toBe(true);
    });

    it('delegates to matchesSignature', () => {
      const query = new Query({
        all: [Position],
        none: [Hidden]
      });

      const goodSignature = Bitset.fromArray([positionId, velocityId]);
      const badSignature = Bitset.fromArray([positionId, hiddenId]);

      const goodArchetype = new Archetype(1, goodSignature);
      const badArchetype = new Archetype(2, badSignature);

      expect(query.matches(goodArchetype)).toBe(true);
      expect(query.matches(badArchetype)).toBe(false);
    });
  });

  describe('archetype management', () => {
    it('_addArchetype() adds archetype to list', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      query._addArchetype(archetype);

      expect(query.matchingArchetypes).toContain(archetype);
      expect(query.matchingArchetypes.length).toBe(1);
    });

    it('_addArchetype() increments version', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const initialVersion = query.version;
      query._addArchetype(archetype);

      expect(query.version).toBe(initialVersion + 1);
    });

    it('_removeArchetype() removes archetype from list', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      query._addArchetype(archetype);
      query._removeArchetype(archetype);

      expect(query.matchingArchetypes).not.toContain(archetype);
      expect(query.matchingArchetypes.length).toBe(0);
    });

    it('_removeArchetype() increments version', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      query._addArchetype(archetype);
      const versionAfterAdd = query.version;

      query._removeArchetype(archetype);
      expect(query.version).toBe(versionAfterAdd + 1);
    });

    it('_removeArchetype() handles non-existent archetype', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const versionBefore = query.version;
      query._removeArchetype(archetype);

      expect(query.version).toBe(versionBefore);
    });
  });

  describe('entityCount', () => {
    it('returns zero for query with no archetypes', () => {
      const query = Query.all(Position);
      expect(query.entityCount).toBe(0);
    });

    it('returns sum of entity counts across archetypes', () => {
      const query = Query.all(Position);
      const sig1 = Bitset.fromArray([positionId]);
      const sig2 = Bitset.fromArray([positionId, velocityId]);

      const arch1 = new Archetype(1, sig1);
      const arch2 = new Archetype(2, sig2);

      arch1.addEntity(EntityUtils.create(1, 0));
      arch1.addEntity(EntityUtils.create(2, 0));

      arch2.addEntity(EntityUtils.create(3, 0));
      arch2.addEntity(EntityUtils.create(4, 0));
      arch2.addEntity(EntityUtils.create(5, 0));

      query._addArchetype(arch1);
      query._addArchetype(arch2);

      expect(query.entityCount).toBe(5);
    });
  });

  describe('entityArray', () => {
    it('returns empty array for query with no archetypes', () => {
      const query = Query.all(Position);
      expect(query.entityArray).toHaveLength(0);
    });

    it('returns all entities from matching archetypes', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);
      const e3 = EntityUtils.create(3, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);
      archetype.addEntity(e3);

      query._addArchetype(archetype);

      const entities = query.entityArray;
      expect(entities).toHaveLength(3);
      expect(entities).toContain(e1);
      expect(entities).toContain(e2);
      expect(entities).toContain(e3);
    });

    it('returns entities from multiple archetypes', () => {
      const query = Query.all(Position);
      const sig1 = Bitset.fromArray([positionId]);
      const sig2 = Bitset.fromArray([positionId, velocityId]);

      const arch1 = new Archetype(1, sig1);
      const arch2 = new Archetype(2, sig2);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      arch1.addEntity(e1);
      arch2.addEntity(e2);

      query._addArchetype(arch1);
      query._addArchetype(arch2);

      const entities = query.entityArray;
      expect(entities).toHaveLength(2);
      expect(entities).toContain(e1);
      expect(entities).toContain(e2);
    });
  });

  describe('get()', () => {
    it('returns components for entity in matching archetype', () => {
      const query = Query.all(Position, Velocity);
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);

      const entity = EntityUtils.create(1, 0);
      archetype.addEntity(entity);

      const pos = new Position();
      pos.x = 10;
      archetype.setComponent(entity, positionId, pos);

      query._addArchetype(archetype);

      const components = query.get(entity);
      expect(components).not.toBeNull();
      expect(components!.length).toBeGreaterThan(0);
    });

    it('returns null for entity not in query', () => {
      const query = Query.all(Position);
      const entity = EntityUtils.create(1, 0);

      const components = query.get(entity);
      expect(components).toBeNull();
    });
  });

  describe('forEach()', () => {
    it('calls callback for each entity', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);

      query._addArchetype(archetype);

      const visited: number[] = [];
      query.forEach((entity, components) => {
        visited.push(entity);
      });

      expect(visited).toHaveLength(2);
      expect(visited).toContain(e1);
      expect(visited).toContain(e2);
    });

    it('provides components array to callback', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const entity = EntityUtils.create(1, 0);
      archetype.addEntity(entity);

      const pos = new Position();
      pos.x = 42;
      archetype.setComponent(entity, positionId, pos);

      query._addArchetype(archetype);

      let receivedComponents: any[] = [];
      query.forEach((e, components) => {
        receivedComponents = components;
      });

      expect(receivedComponents.length).toBeGreaterThan(0);
    });

    it('iterates across multiple archetypes', () => {
      const query = Query.all(Position);
      const sig1 = Bitset.fromArray([positionId]);
      const sig2 = Bitset.fromArray([positionId, velocityId]);

      const arch1 = new Archetype(1, sig1);
      const arch2 = new Archetype(2, sig2);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      arch1.addEntity(e1);
      arch2.addEntity(e2);

      query._addArchetype(arch1);
      query._addArchetype(arch2);

      const visited: number[] = [];
      query.forEach((entity) => {
        visited.push(entity);
      });

      expect(visited).toHaveLength(2);
    });

    it('does nothing when no archetypes match', () => {
      const query = Query.all(Position);

      let callCount = 0;
      query.forEach(() => {
        callCount++;
      });

      expect(callCount).toBe(0);
    });
  });

  describe('forEachWith()', () => {
    it('provides typed components in order', () => {
      const query = Query.all(Position, Velocity);
      const signature = Bitset.fromArray([positionId, velocityId]);
      const archetype = new Archetype(1, signature);

      const entity = EntityUtils.create(1, 0);
      archetype.addEntity(entity);

      const pos = new Position();
      pos.x = 10;
      const vel = new Velocity();
      vel.vx = 5;

      archetype.setComponent(entity, positionId, pos);
      archetype.setComponent(entity, velocityId, vel);

      query._addArchetype(archetype);

      let receivedPos: Position | null = null;
      let receivedVel: Velocity | null = null;

      query.forEachWith([Position, Velocity], (e, p, v) => {
        receivedPos = p;
        receivedVel = v;
      });

      expect(receivedPos).toBe(pos);
      expect(receivedVel).toBe(vel);
    });

    it('extracts components in specified order', () => {
      const query = Query.all(Position, Velocity, Health);
      const signature = Bitset.fromArray([positionId, velocityId, healthId]);
      const archetype = new Archetype(1, signature);

      const entity = EntityUtils.create(1, 0);
      archetype.addEntity(entity);

      const pos = new Position();
      const vel = new Velocity();
      const health = new Health();

      archetype.setComponent(entity, positionId, pos);
      archetype.setComponent(entity, velocityId, vel);
      archetype.setComponent(entity, healthId, health);

      query._addArchetype(archetype);

      let order1: any[] = [];
      query.forEachWith([Velocity, Position], (e, v, p) => {
        order1 = [v, p];
      });

      expect(order1[0]).toBe(vel);
      expect(order1[1]).toBe(pos);

      let order2: any[] = [];
      query.forEachWith([Health, Position], (e, h, p) => {
        order2 = [h, p];
      });

      expect(order2[0]).toBe(health);
      expect(order2[1]).toBe(pos);
    });
  });

  describe('iterator', () => {
    it('supports for-of loops', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);

      query._addArchetype(archetype);

      const entities: number[] = [];
      for (const entity of query) {
        entities.push(entity);
      }

      expect(entities).toHaveLength(2);
      expect(entities).toContain(e1);
      expect(entities).toContain(e2);
    });

    it('works with spread operator', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      archetype.addEntity(EntityUtils.create(1, 0));
      archetype.addEntity(EntityUtils.create(2, 0));
      archetype.addEntity(EntityUtils.create(3, 0));

      query._addArchetype(archetype);

      const entities = [...query];
      expect(entities).toHaveLength(3);
    });
  });

  describe('entities() generator', () => {
    it('yields all entities', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      const e1 = EntityUtils.create(1, 0);
      const e2 = EntityUtils.create(2, 0);

      archetype.addEntity(e1);
      archetype.addEntity(e2);

      query._addArchetype(archetype);

      const entities: number[] = [];
      for (const entity of query.entities()) {
        entities.push(entity);
      }

      expect(entities).toHaveLength(2);
      expect(entities).toContain(e1);
      expect(entities).toContain(e2);
    });
  });

  describe('query patterns', () => {
    it('simple component query', () => {
      const query = Query.all(Position);
      const matchSig = Bitset.fromArray([positionId]);
      const noMatchSig = Bitset.fromArray([velocityId]);

      expect(query.matchesSignature(matchSig)).toBe(true);
      expect(query.matchesSignature(noMatchSig)).toBe(false);
    });

    it('multi-component AND query', () => {
      const query = Query.all(Position, Velocity, Health);
      const matchSig = Bitset.fromArray([positionId, velocityId, healthId]);
      const noMatch1 = Bitset.fromArray([positionId, velocityId]);
      const noMatch2 = Bitset.fromArray([positionId, healthId]);

      expect(query.matchesSignature(matchSig)).toBe(true);
      expect(query.matchesSignature(noMatch1)).toBe(false);
      expect(query.matchesSignature(noMatch2)).toBe(false);
    });

    it('OR query with any', () => {
      const query = Query.any(Mesh, Sprite);
      const match1 = Bitset.fromArray([meshId]);
      const match2 = Bitset.fromArray([spriteId]);
      const match3 = Bitset.fromArray([meshId, spriteId]);
      const noMatch = Bitset.fromArray([positionId]);

      expect(query.matchesSignature(match1)).toBe(true);
      expect(query.matchesSignature(match2)).toBe(true);
      expect(query.matchesSignature(match3)).toBe(true);
      expect(query.matchesSignature(noMatch)).toBe(false);
    });

    it('exclusion query with none', () => {
      const query = new Query({
        all: [Position],
        none: [Hidden, Disabled]
      });

      const match = Bitset.fromArray([positionId, velocityId]);
      const noMatch1 = Bitset.fromArray([positionId, hiddenId]);
      const noMatch2 = Bitset.fromArray([positionId, disabledId]);
      const noMatch3 = Bitset.fromArray([positionId, hiddenId, disabledId]);

      expect(query.matchesSignature(match)).toBe(true);
      expect(query.matchesSignature(noMatch1)).toBe(false);
      expect(query.matchesSignature(noMatch2)).toBe(false);
      expect(query.matchesSignature(noMatch3)).toBe(false);
    });

    it('complex query with all, any, and none', () => {
      const query = new Query({
        all: [Position, Velocity],
        any: [Mesh, Sprite],
        none: [Hidden, Frozen]
      });

      const match1 = Bitset.fromArray([positionId, velocityId, meshId]);
      const match2 = Bitset.fromArray([positionId, velocityId, spriteId]);

      const noMatch1 = Bitset.fromArray([positionId, velocityId]);
      const noMatch2 = Bitset.fromArray([positionId, velocityId, meshId, hiddenId]);
      const noMatch3 = Bitset.fromArray([positionId, meshId]);

      expect(query.matchesSignature(match1)).toBe(true);
      expect(query.matchesSignature(match2)).toBe(true);
      expect(query.matchesSignature(noMatch1)).toBe(false);
      expect(query.matchesSignature(noMatch2)).toBe(false);
      expect(query.matchesSignature(noMatch3)).toBe(false);
    });
  });

  describe('performance with large entity sets', () => {
    it('handles 10000 entities efficiently', () => {
      const query = Query.all(Position);
      const signature = Bitset.fromArray([positionId]);
      const archetype = new Archetype(1, signature);

      for (let i = 0; i < 10000; i++) {
        archetype.addEntity(EntityUtils.create(i + 1, 0));
      }

      query._addArchetype(archetype);

      expect(query.entityCount).toBe(10000);

      let count = 0;
      query.forEach(() => {
        count++;
      });

      expect(count).toBe(10000);
    });
  });
});
