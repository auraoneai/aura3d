import { describe, it, expect, beforeEach } from 'vitest';
import { Entity, EntityUtils, EntityPool } from '../../../ecs/Entity';

describe('Entity', () => {
  describe('EntityUtils', () => {
    describe('create()', () => {
      it('creates entity from index and generation', () => {
        const entity = EntityUtils.create(42, 5);
        expect(EntityUtils.getIndex(entity)).toBe(42);
        expect(EntityUtils.getGeneration(entity)).toBe(5);
      });

      it('creates entity with zero index', () => {
        const entity = EntityUtils.create(0, 1);
        expect(EntityUtils.getIndex(entity)).toBe(0);
        expect(EntityUtils.getGeneration(entity)).toBe(1);
      });

      it('creates entity with max index', () => {
        const maxIndex = EntityUtils.MAX_ENTITIES - 1;
        const entity = EntityUtils.create(maxIndex, 0);
        expect(EntityUtils.getIndex(entity)).toBe(maxIndex);
      });

      it('creates entity with max generation', () => {
        const maxGen = EntityUtils.MAX_GENERATION - 1;
        const entity = EntityUtils.create(100, maxGen);
        expect(EntityUtils.getGeneration(entity)).toBe(maxGen);
      });

      it('wraps index using mask', () => {
        const entity = EntityUtils.create(EntityUtils.MAX_ENTITIES + 10, 0);
        expect(EntityUtils.getIndex(entity)).toBe(10);
      });

      it('wraps generation using mask', () => {
        const entity = EntityUtils.create(0, EntityUtils.MAX_GENERATION + 3);
        expect(EntityUtils.getGeneration(entity)).toBe(3);
      });
    });

    describe('getIndex()', () => {
      it('extracts index from entity', () => {
        const entity = EntityUtils.create(123, 456);
        expect(EntityUtils.getIndex(entity)).toBe(123);
      });

      it('extracts zero index', () => {
        const entity = EntityUtils.create(0, 10);
        expect(EntityUtils.getIndex(entity)).toBe(0);
      });

      it('extracts max index', () => {
        const maxIndex = EntityUtils.MAX_ENTITIES - 1;
        const entity = EntityUtils.create(maxIndex, 0);
        expect(EntityUtils.getIndex(entity)).toBe(maxIndex);
      });
    });

    describe('getGeneration()', () => {
      it('extracts generation from entity', () => {
        const entity = EntityUtils.create(100, 7);
        expect(EntityUtils.getGeneration(entity)).toBe(7);
      });

      it('extracts zero generation', () => {
        const entity = EntityUtils.create(50, 0);
        expect(EntityUtils.getGeneration(entity)).toBe(0);
      });

      it('extracts max generation', () => {
        const maxGen = EntityUtils.MAX_GENERATION - 1;
        const entity = EntityUtils.create(0, maxGen);
        expect(EntityUtils.getGeneration(entity)).toBe(maxGen);
      });
    });

    describe('isValid()', () => {
      it('returns true for valid entities', () => {
        const entity = EntityUtils.create(1, 0);
        expect(EntityUtils.isValid(entity)).toBe(true);
      });

      it('returns false for INVALID entity', () => {
        expect(EntityUtils.isValid(EntityUtils.INVALID)).toBe(false);
      });

      it('returns false for zero', () => {
        expect(EntityUtils.isValid(0)).toBe(false);
      });

      it('validates entity with max values', () => {
        const entity = EntityUtils.create(EntityUtils.MAX_ENTITIES - 1, EntityUtils.MAX_GENERATION - 1);
        expect(EntityUtils.isValid(entity)).toBe(true);
      });
    });

    describe('toString()', () => {
      it('formats entity as readable string', () => {
        const entity = EntityUtils.create(42, 5);
        const str = EntityUtils.toString(entity);
        expect(str).toBe('Entity(idx:42, gen:5)');
      });

      it('formats INVALID entity', () => {
        const str = EntityUtils.toString(EntityUtils.INVALID);
        expect(str).toBe('Entity(idx:0, gen:0)');
      });

      it('formats entity with large values', () => {
        const entity = EntityUtils.create(1000000, 4000);
        const str = EntityUtils.toString(entity);
        expect(str).toMatch(/Entity\(idx:\d+, gen:\d+\)/);
      });
    });

    describe('constants', () => {
      it('INVALID equals zero', () => {
        expect(EntityUtils.INVALID).toBe(0);
      });

      it('MAX_ENTITIES is power of 2', () => {
        const isPowerOfTwo = (EntityUtils.MAX_ENTITIES & (EntityUtils.MAX_ENTITIES - 1)) === 0;
        expect(isPowerOfTwo).toBe(true);
      });

      it('MAX_GENERATION is power of 2', () => {
        const isPowerOfTwo = (EntityUtils.MAX_GENERATION & (EntityUtils.MAX_GENERATION - 1)) === 0;
        expect(isPowerOfTwo).toBe(true);
      });

      it('MAX_ENTITIES is at least 1 million', () => {
        expect(EntityUtils.MAX_ENTITIES).toBeGreaterThanOrEqual(1_000_000);
      });

      it('MAX_GENERATION is at least 4096', () => {
        expect(EntityUtils.MAX_GENERATION).toBeGreaterThanOrEqual(4096);
      });
    });

    describe('roundtrip encoding', () => {
      it('preserves values through create/get cycle', () => {
        const testCases = [
          { index: 0, gen: 0 },
          { index: 1, gen: 0 },
          { index: 42, gen: 5 },
          { index: 1000, gen: 100 },
          { index: EntityUtils.MAX_ENTITIES - 1, gen: 0 },
          { index: 0, gen: EntityUtils.MAX_GENERATION - 1 },
          { index: 12345, gen: 678 }
        ];

        for (const { index, gen } of testCases) {
          const entity = EntityUtils.create(index, gen);
          expect(EntityUtils.getIndex(entity)).toBe(index);
          expect(EntityUtils.getGeneration(entity)).toBe(gen);
        }
      });
    });
  });

  describe('EntityPool', () => {
    let pool: EntityPool;

    beforeEach(() => {
      pool = new EntityPool();
    });

    describe('construction', () => {
      it('creates pool with default capacity', () => {
        const defaultPool = new EntityPool();
        expect(defaultPool.aliveCount).toBe(0);
        expect(defaultPool.capacity).toBeGreaterThan(0);
      });

      it('creates pool with custom capacity', () => {
        const customPool = new EntityPool(512);
        expect(customPool.capacity).toBe(512);
      });

      it('starts with zero alive entities', () => {
        expect(pool.aliveCount).toBe(0);
      });
    });

    describe('create()', () => {
      it('creates entity with index 1 first', () => {
        const entity = pool.create();
        expect(EntityUtils.getIndex(entity)).toBe(1);
      });

      it('creates entities with sequential indices', () => {
        const e1 = pool.create();
        const e2 = pool.create();
        const e3 = pool.create();

        expect(EntityUtils.getIndex(e1)).toBe(1);
        expect(EntityUtils.getIndex(e2)).toBe(2);
        expect(EntityUtils.getIndex(e3)).toBe(3);
      });

      it('starts with generation 0', () => {
        const entity = pool.create();
        expect(EntityUtils.getGeneration(entity)).toBe(0);
      });

      it('increments alive count', () => {
        expect(pool.aliveCount).toBe(0);
        pool.create();
        expect(pool.aliveCount).toBe(1);
        pool.create();
        expect(pool.aliveCount).toBe(2);
      });

      it('expands capacity when needed', () => {
        const smallPool = new EntityPool(4);
        const initialCapacity = smallPool.capacity;

        for (let i = 0; i < 10; i++) {
          smallPool.create();
        }

        expect(smallPool.capacity).toBeGreaterThan(initialCapacity);
        expect(smallPool.aliveCount).toBe(10);
      });

      it('reuses destroyed entity slots', () => {
        const e1 = pool.create();
        const index1 = EntityUtils.getIndex(e1);

        pool.destroy(e1);

        const e2 = pool.create();
        const index2 = EntityUtils.getIndex(e2);

        expect(index2).toBe(index1);
      });

      it('increments generation on reuse', () => {
        const e1 = pool.create();
        const gen1 = EntityUtils.getGeneration(e1);

        pool.destroy(e1);

        const e2 = pool.create();
        const gen2 = EntityUtils.getGeneration(e2);

        expect(gen2).toBe(gen1 + 1);
      });

      it('throws when capacity exhausted', () => {
        const entities: Entity[] = [];

        const maxEntities = Math.min(10000, EntityUtils.MAX_ENTITIES);
        for (let i = 0; i < maxEntities; i++) {
          entities.push(pool.create());
        }

        expect(() => pool.create()).toThrow(/capacity exhausted/i);
      });
    });

    describe('destroy()', () => {
      it('destroys valid entity', () => {
        const entity = pool.create();
        expect(() => pool.destroy(entity)).not.toThrow();
      });

      it('decrements alive count', () => {
        const entity = pool.create();
        expect(pool.aliveCount).toBe(1);

        pool.destroy(entity);
        expect(pool.aliveCount).toBe(0);
      });

      it('throws on invalid entity', () => {
        expect(() => pool.destroy(EntityUtils.INVALID)).toThrow(/invalid entity/i);
      });

      it('throws on already destroyed entity', () => {
        const entity = pool.create();
        pool.destroy(entity);

        expect(() => pool.destroy(entity)).toThrow(/already destroyed|generation mismatch/i);
      });

      it('throws on entity with wrong generation', () => {
        const entity = pool.create();
        const wrongEntity = EntityUtils.create(EntityUtils.getIndex(entity), 999);

        expect(() => pool.destroy(wrongEntity)).toThrow(/generation mismatch|already destroyed/i);
      });

      it('throws on entity with invalid index', () => {
        const badEntity = EntityUtils.create(999999, 0);
        expect(() => pool.destroy(badEntity)).toThrow();
      });

      it('increments generation after destroy', () => {
        const e1 = pool.create();
        const index = EntityUtils.getIndex(e1);
        const gen1 = EntityUtils.getGeneration(e1);

        pool.destroy(e1);

        const e2 = pool.create();
        expect(EntityUtils.getIndex(e2)).toBe(index);
        expect(EntityUtils.getGeneration(e2)).toBe(gen1 + 1);
      });
    });

    describe('isAlive()', () => {
      it('returns true for alive entity', () => {
        const entity = pool.create();
        expect(pool.isAlive(entity)).toBe(true);
      });

      it('returns false for destroyed entity', () => {
        const entity = pool.create();
        pool.destroy(entity);
        expect(pool.isAlive(entity)).toBe(false);
      });

      it('returns false for INVALID entity', () => {
        expect(pool.isAlive(EntityUtils.INVALID)).toBe(false);
      });

      it('returns false for entity with wrong generation', () => {
        const entity = pool.create();
        const wrongEntity = EntityUtils.create(EntityUtils.getIndex(entity), 999);

        expect(pool.isAlive(wrongEntity)).toBe(false);
      });

      it('returns false for reused slot with old entity', () => {
        const e1 = pool.create();
        pool.destroy(e1);

        const e2 = pool.create();
        expect(pool.isAlive(e1)).toBe(false);
        expect(pool.isAlive(e2)).toBe(true);
      });

      it('returns false for entity from different pool', () => {
        const otherPool = new EntityPool();
        const entity = otherPool.create();

        expect(pool.isAlive(entity)).toBe(false);
      });
    });

    describe('aliveCount', () => {
      it('tracks entity creation', () => {
        expect(pool.aliveCount).toBe(0);

        pool.create();
        expect(pool.aliveCount).toBe(1);

        pool.create();
        pool.create();
        expect(pool.aliveCount).toBe(3);
      });

      it('tracks entity destruction', () => {
        const e1 = pool.create();
        const e2 = pool.create();
        const e3 = pool.create();

        pool.destroy(e2);
        expect(pool.aliveCount).toBe(2);

        pool.destroy(e1);
        pool.destroy(e3);
        expect(pool.aliveCount).toBe(0);
      });

      it('remains accurate after recycling', () => {
        const entities: Entity[] = [];

        for (let i = 0; i < 5; i++) {
          entities.push(pool.create());
        }
        expect(pool.aliveCount).toBe(5);

        for (let i = 0; i < 3; i++) {
          pool.destroy(entities[i]);
        }
        expect(pool.aliveCount).toBe(2);

        for (let i = 0; i < 3; i++) {
          pool.create();
        }
        expect(pool.aliveCount).toBe(5);
      });
    });

    describe('forEach()', () => {
      it('iterates over all alive entities', () => {
        const e1 = pool.create();
        const e2 = pool.create();
        const e3 = pool.create();

        const visited: Entity[] = [];
        pool.forEach((entity) => visited.push(entity));

        expect(visited).toContain(e1);
        expect(visited).toContain(e2);
        expect(visited).toContain(e3);
        expect(visited.length).toBe(3);
      });

      it('skips destroyed entities', () => {
        const e1 = pool.create();
        const e2 = pool.create();
        const e3 = pool.create();

        pool.destroy(e2);

        const visited: Entity[] = [];
        pool.forEach((entity) => visited.push(entity));

        expect(visited).toContain(e1);
        expect(visited).not.toContain(e2);
        expect(visited).toContain(e3);
        expect(visited.length).toBe(2);
      });

      it('works with empty pool', () => {
        let count = 0;
        pool.forEach(() => count++);
        expect(count).toBe(0);
      });
    });

    describe('iterator', () => {
      it('supports for-of iteration', () => {
        const e1 = pool.create();
        const e2 = pool.create();
        const e3 = pool.create();

        const visited: Entity[] = [];
        for (const entity of pool) {
          visited.push(entity);
        }

        expect(visited).toContain(e1);
        expect(visited).toContain(e2);
        expect(visited).toContain(e3);
        expect(visited.length).toBe(3);
      });

      it('skips destroyed entities in iteration', () => {
        const e1 = pool.create();
        const e2 = pool.create();
        const e3 = pool.create();

        pool.destroy(e2);

        const visited: Entity[] = [];
        for (const entity of pool) {
          visited.push(entity);
        }

        expect(visited.length).toBe(2);
        expect(visited).not.toContain(e2);
      });

      it('works with spread operator', () => {
        pool.create();
        pool.create();
        pool.create();

        const entities = [...pool];
        expect(entities.length).toBe(3);
      });
    });

    describe('clear()', () => {
      it('removes all entities', () => {
        pool.create();
        pool.create();
        pool.create();

        pool.clear();

        expect(pool.aliveCount).toBe(0);
      });

      it('invalidates existing entities', () => {
        const e1 = pool.create();
        const e2 = pool.create();

        pool.clear();

        expect(pool.isAlive(e1)).toBe(false);
        expect(pool.isAlive(e2)).toBe(false);
      });

      it('resets to initial state', () => {
        for (let i = 0; i < 10; i++) {
          pool.create();
        }

        pool.clear();

        const entity = pool.create();
        expect(EntityUtils.getIndex(entity)).toBe(1);
        expect(pool.aliveCount).toBe(1);
      });

      it('allows creating new entities after clear', () => {
        pool.create();
        pool.create();
        pool.clear();

        const newEntity = pool.create();
        expect(pool.isAlive(newEntity)).toBe(true);
      });
    });

    describe('stress tests', () => {
      it('handles 10000 entities', () => {
        const entities: Entity[] = [];

        for (let i = 0; i < 10000; i++) {
          entities.push(pool.create());
        }

        expect(pool.aliveCount).toBe(10000);

        for (const entity of entities) {
          expect(pool.isAlive(entity)).toBe(true);
        }
      });

      it('handles rapid create/destroy cycles', () => {
        for (let cycle = 0; cycle < 100; cycle++) {
          const entities: Entity[] = [];

          for (let i = 0; i < 100; i++) {
            entities.push(pool.create());
          }

          for (const entity of entities) {
            pool.destroy(entity);
          }
        }

        expect(pool.aliveCount).toBe(0);
      });

      it('generation wraps correctly at maximum', () => {
        let entity = pool.create();
        const index = EntityUtils.getIndex(entity);

        for (let i = 0; i < EntityUtils.MAX_GENERATION + 5; i++) {
          pool.destroy(entity);
          entity = pool.create();
        }

        expect(EntityUtils.getIndex(entity)).toBe(index);
        const gen = EntityUtils.getGeneration(entity);
        expect(gen).toBeLessThan(EntityUtils.MAX_GENERATION);
      });
    });
  });
});
