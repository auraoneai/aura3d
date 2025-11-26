import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectPool } from '../../../core/ObjectPool';

/**
 * Comprehensive test suite for the ObjectPool class.
 * Tests cover object acquisition/release, automatic expansion, prewarm functionality,
 * reset callbacks, pool statistics, memory efficiency, and safety checks.
 *
 * Coverage target: 95%
 */
describe('ObjectPool', () => {
  interface TestObject {
    x: number;
    y: number;
    active: boolean;
  }

  let factory: ReturnType<typeof vi.fn>;
  let reset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    factory = vi.fn(() => ({ x: 0, y: 0, active: false }));
    reset = vi.fn((obj: TestObject) => {
      obj.x = 0;
      obj.y = 0;
      obj.active = false;
    });
  });

  describe('initialization', () => {
    it('creates empty pool by default', () => {
      const pool = new ObjectPool(factory, reset);

      expect(pool.pooledCount).toBe(0);
      expect(pool.totalCreated).toBe(0);
    });

    it('prewarms pool with initial size', () => {
      const pool = new ObjectPool(factory, reset, 10);

      expect(pool.pooledCount).toBe(10);
      expect(pool.totalCreated).toBe(10);
      expect(factory).toHaveBeenCalledTimes(10);
    });

    it('respects max size when prewarming', () => {
      const pool = new ObjectPool(factory, reset, 100, 50);

      expect(pool.pooledCount).toBe(50);
      expect(pool.totalCreated).toBe(50);
    });

    it('calls reset on prewarmed objects', () => {
      const pool = new ObjectPool(factory, reset, 5);

      expect(reset).toHaveBeenCalledTimes(5);
    });
  });

  describe('acquire() gets object', () => {
    it('returns object from pool', () => {
      const pool = new ObjectPool(factory, reset, 1);

      const obj = pool.acquire();

      expect(obj).toBeDefined();
      expect(obj.x).toBe(0);
      expect(obj.y).toBe(0);
    });

    it('creates new object when pool is empty', () => {
      const pool = new ObjectPool(factory, reset);

      expect(pool.pooledCount).toBe(0);

      const obj = pool.acquire();

      expect(obj).toBeDefined();
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('reuses pooled objects', () => {
      const pool = new ObjectPool(factory, reset, 5);

      const initialFactoryCalls = factory.mock.calls.length;

      pool.acquire();
      pool.acquire();

      expect(factory).toHaveBeenCalledTimes(initialFactoryCalls);
    });

    it('returns different objects on multiple calls', () => {
      const pool = new ObjectPool(factory, reset, 2);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      expect(obj1).not.toBe(obj2);
    });

    it('decrements pooled count', () => {
      const pool = new ObjectPool(factory, reset, 5);

      expect(pool.pooledCount).toBe(5);

      pool.acquire();

      expect(pool.pooledCount).toBe(4);
    });

    it('increments total created only when creating new', () => {
      const pool = new ObjectPool(factory, reset, 2);

      expect(pool.totalCreated).toBe(2);

      pool.acquire(); // From pool
      expect(pool.totalCreated).toBe(2);

      pool.acquire(); // From pool
      expect(pool.totalCreated).toBe(2);

      pool.acquire(); // Must create new
      expect(pool.totalCreated).toBe(3);
    });
  });

  describe('release() returns object', () => {
    it('returns object to pool', () => {
      const pool = new ObjectPool(factory, reset);

      const obj = pool.acquire();
      expect(pool.pooledCount).toBe(0);

      pool.release(obj);

      expect(pool.pooledCount).toBe(1);
    });

    it('calls reset callback', () => {
      const pool = new ObjectPool(factory, reset);

      const obj = pool.acquire();
      obj.x = 100;
      obj.y = 200;

      reset.mockClear();
      pool.release(obj);

      expect(reset).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledWith(obj);
    });

    it('resets object state', () => {
      const pool = new ObjectPool(factory, reset);

      const obj = pool.acquire();
      obj.x = 100;
      obj.y = 200;
      obj.active = true;

      pool.release(obj);

      expect(obj.x).toBe(0);
      expect(obj.y).toBe(0);
      expect(obj.active).toBe(false);
    });

    it('allows object to be reused', () => {
      const pool = new ObjectPool(factory, reset);

      const obj1 = pool.acquire();
      pool.release(obj1);

      const obj2 = pool.acquire();

      expect(obj2).toBe(obj1);
    });

    it('respects max size limit', () => {
      const pool = new ObjectPool(factory, reset, 0, 2);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      const obj3 = pool.acquire();

      pool.release(obj1);
      pool.release(obj2);
      pool.release(obj3);

      expect(pool.pooledCount).toBe(2);
    });

    it('discards objects when pool is full', () => {
      const pool = new ObjectPool(factory, reset, 0, 1);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      pool.release(obj1);
      expect(pool.pooledCount).toBe(1);

      pool.release(obj2);
      expect(pool.pooledCount).toBe(1); // Still 1, obj2 discarded
    });
  });

  describe('automatic expansion', () => {
    it('expands pool when empty', () => {
      const pool = new ObjectPool(factory, reset);

      expect(pool.totalCreated).toBe(0);

      pool.acquire();
      pool.acquire();
      pool.acquire();

      expect(pool.totalCreated).toBe(3);
    });

    it('creates objects on demand', () => {
      const pool = new ObjectPool(factory, reset, 2);

      pool.acquire();
      pool.acquire();

      factory.mockClear();

      pool.acquire(); // Should create new

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('handles unlimited pool size', () => {
      const pool = new ObjectPool(factory, reset);

      for (let i = 0; i < 1000; i++) {
        pool.acquire();
      }

      expect(pool.totalCreated).toBe(1000);
    });
  });

  describe('prewarm functionality', () => {
    it('creates specified number of objects', () => {
      const pool = new ObjectPool(factory, reset);

      pool.prewarm(10);

      expect(pool.pooledCount).toBe(10);
      expect(pool.totalCreated).toBe(10);
    });

    it('adds to existing pool', () => {
      const pool = new ObjectPool(factory, reset, 5);

      pool.prewarm(5);

      expect(pool.pooledCount).toBe(10);
    });

    it('calls factory for each object', () => {
      const pool = new ObjectPool(factory, reset);

      pool.prewarm(20);

      expect(factory).toHaveBeenCalledTimes(20);
    });

    it('calls reset on prewarmed objects', () => {
      const pool = new ObjectPool(factory, reset);

      reset.mockClear();
      pool.prewarm(15);

      expect(reset).toHaveBeenCalledTimes(15);
    });

    it('respects max size limit', () => {
      const pool = new ObjectPool(factory, reset, 0, 10);

      pool.prewarm(100);

      expect(pool.pooledCount).toBe(10);
    });

    it('handles zero prewarm count', () => {
      const pool = new ObjectPool(factory, reset);

      pool.prewarm(0);

      expect(pool.pooledCount).toBe(0);
    });
  });

  describe('reset callbacks', () => {
    it('resets object state before pooling', () => {
      let resetCount = 0;
      const resetFn = (obj: TestObject) => {
        obj.x = 0;
        obj.y = 0;
        resetCount++;
      };

      const pool = new ObjectPool(factory, resetFn);

      const obj = pool.acquire();
      obj.x = 100;
      obj.y = 200;

      pool.release(obj);

      expect(resetCount).toBe(1);
      expect(obj.x).toBe(0);
      expect(obj.y).toBe(0);
    });

    it('can perform complex cleanup', () => {
      interface ComplexObject {
        data: number[];
        map: Map<string, number>;
      }

      const complexFactory = () => ({
        data: [],
        map: new Map(),
      });

      const complexReset = (obj: ComplexObject) => {
        obj.data.length = 0;
        obj.map.clear();
      };

      const pool = new ObjectPool(complexFactory, complexReset);

      const obj = pool.acquire();
      obj.data.push(1, 2, 3);
      obj.map.set('key', 123);

      pool.release(obj);

      expect(obj.data).toHaveLength(0);
      expect(obj.map.size).toBe(0);
    });
  });

  describe('pool statistics', () => {
    it('tracks pooled count', () => {
      const pool = new ObjectPool(factory, reset, 10);

      expect(pool.pooledCount).toBe(10);

      pool.acquire();
      expect(pool.pooledCount).toBe(9);

      pool.acquire();
      expect(pool.pooledCount).toBe(8);
    });

    it('tracks total created', () => {
      const pool = new ObjectPool(factory, reset, 5);

      expect(pool.totalCreated).toBe(5);

      pool.acquire();
      pool.acquire();
      pool.acquire();
      pool.acquire();
      pool.acquire();

      expect(pool.totalCreated).toBe(5);

      pool.acquire(); // Creates new
      expect(pool.totalCreated).toBe(6);
    });

    it('tracks active count in debug mode', () => {
      const pool = new ObjectPool(factory, reset, 5, undefined, true);

      expect(pool.activeCount).toBe(0);

      const obj1 = pool.acquire();
      expect(pool.activeCount).toBe(1);

      const obj2 = pool.acquire();
      expect(pool.activeCount).toBe(2);

      pool.release(obj1);
      expect(pool.activeCount).toBe(1);

      pool.release(obj2);
      expect(pool.activeCount).toBe(0);
    });

    it('active count is 0 in production mode', () => {
      const pool = new ObjectPool(factory, reset, 5, undefined, false);

      pool.acquire();
      pool.acquire();

      expect(pool.activeCount).toBe(0); // Not tracked in production
    });

    it('tracks high water mark in debug mode', () => {
      const pool = new ObjectPool(factory, reset, 2, undefined, true);

      expect(pool.highWaterMark).toBe(0);

      const obj1 = pool.acquire();
      expect(pool.highWaterMark).toBe(1);

      const obj2 = pool.acquire();
      expect(pool.highWaterMark).toBe(2);

      const obj3 = pool.acquire();
      expect(pool.highWaterMark).toBe(3);

      pool.release(obj1);
      pool.release(obj2);

      expect(pool.highWaterMark).toBe(3); // Still the maximum
    });
  });

  describe('memory efficiency', () => {
    it('reuses objects instead of creating new', () => {
      const pool = new ObjectPool(factory, reset, 100);

      const objects: TestObject[] = [];

      for (let i = 0; i < 100; i++) {
        objects.push(pool.acquire());
      }

      const createdCount = pool.totalCreated;

      for (const obj of objects) {
        pool.release(obj);
      }

      for (let i = 0; i < 100; i++) {
        pool.acquire();
      }

      expect(pool.totalCreated).toBe(createdCount); // No new objects created
    });

    it('shrink() reduces memory footprint', () => {
      const pool = new ObjectPool(factory, reset, 100);

      pool.shrink(10);

      expect(pool.pooledCount).toBe(10);
    });

    it('shrink() does not affect active objects', () => {
      const pool = new ObjectPool(factory, reset, 100, undefined, true);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      pool.shrink(0);

      expect(pool.pooledCount).toBe(0);
      expect(pool.activeCount).toBe(2); // Still active
    });

    it('shrink() handles negative values', () => {
      const pool = new ObjectPool(factory, reset, 10);

      pool.shrink(-5);

      expect(pool.pooledCount).toBe(0);
    });

    it('clear() empties the pool', () => {
      const pool = new ObjectPool(factory, reset, 50);

      pool.clear();

      expect(pool.pooledCount).toBe(0);
    });

    it('clear() does not affect total created counter', () => {
      const pool = new ObjectPool(factory, reset, 50);

      const totalCreated = pool.totalCreated;

      pool.clear();

      expect(pool.totalCreated).toBe(totalCreated);
    });

    it('reset() clears everything', () => {
      const pool = new ObjectPool(factory, reset, 50, undefined, true);

      pool.acquire();
      pool.acquire();

      pool.reset();

      expect(pool.pooledCount).toBe(0);
      expect(pool.totalCreated).toBe(0);
      expect(pool.highWaterMark).toBe(0);
      expect(pool.activeCount).toBe(0);
    });
  });

  describe('debug mode safety checks', () => {
    it('detects double release', () => {
      const pool = new ObjectPool(factory, reset, 1, undefined, true);

      const obj = pool.acquire();
      pool.release(obj);

      expect(() => {
        pool.release(obj);
      }).toThrow('double-release detected');
    });

    it('detects release of unacquired object', () => {
      const pool = new ObjectPool(factory, reset, 0, undefined, true);

      const fakeObj = { x: 0, y: 0, active: false };

      expect(() => {
        pool.release(fakeObj);
      }).toThrow('not acquired');
    });

    it('allows release in production mode without errors', () => {
      const pool = new ObjectPool(factory, reset, 1, undefined, false);

      const obj = pool.acquire();
      pool.release(obj);

      expect(() => {
        pool.release(obj); // Should not throw in production
      }).not.toThrow();
    });

    it('tracks object ownership in debug mode', () => {
      const pool = new ObjectPool(factory, reset, 2, undefined, true);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      expect(pool.activeCount).toBe(2);

      pool.release(obj1);
      expect(pool.activeCount).toBe(1);

      pool.release(obj2);
      expect(pool.activeCount).toBe(0);
    });
  });

  describe('max size enforcement', () => {
    it('limits pool size', () => {
      const pool = new ObjectPool(factory, reset, 0, 5);

      for (let i = 0; i < 10; i++) {
        const obj = pool.acquire();
        pool.release(obj);
      }

      expect(pool.pooledCount).toBe(5);
    });

    it('allows unlimited growth when max size is undefined', () => {
      const pool = new ObjectPool(factory, reset);

      for (let i = 0; i < 100; i++) {
        const obj = pool.acquire();
        pool.release(obj);
      }

      expect(pool.pooledCount).toBe(100);
    });

    it('handles max size of 0', () => {
      const pool = new ObjectPool(factory, reset, 0, 0);

      const obj = pool.acquire();
      pool.release(obj);

      expect(pool.pooledCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles rapid acquire/release cycles', () => {
      const pool = new ObjectPool(factory, reset, 10);

      for (let i = 0; i < 1000; i++) {
        const obj = pool.acquire();
        pool.release(obj);
      }

      expect(pool.pooledCount).toBe(10);
    });

    it('handles acquiring all objects from pool', () => {
      const pool = new ObjectPool(factory, reset, 5);

      const objects = [];
      for (let i = 0; i < 5; i++) {
        objects.push(pool.acquire());
      }

      expect(pool.pooledCount).toBe(0);

      const newObj = pool.acquire(); // Should create new
      expect(pool.totalCreated).toBe(6);

      objects.push(newObj);

      for (const obj of objects) {
        pool.release(obj);
      }

      expect(pool.pooledCount).toBe(6);
    });

    it('handles object mutation after release', () => {
      const pool = new ObjectPool(factory, reset);

      const obj = pool.acquire();
      pool.release(obj);

      obj.x = 999; // Mutate after release

      const obj2 = pool.acquire();
      expect(obj2).toBe(obj);
      expect(obj2.x).toBe(999); // Pool doesn't care about mutations after release
    });

    it('works with primitive-like objects', () => {
      const numberPool = new ObjectPool(
        () => ({ value: 0 }),
        (obj) => { obj.value = 0; }
      );

      const obj = numberPool.acquire();
      obj.value = 42;

      numberPool.release(obj);

      const obj2 = numberPool.acquire();
      expect(obj2.value).toBe(0);
    });

    it('works with class instances', () => {
      class Vector2 {
        constructor(public x: number = 0, public y: number = 0) {}
        reset() {
          this.x = 0;
          this.y = 0;
        }
      }

      const pool = new ObjectPool(
        () => new Vector2(),
        (v) => v.reset()
      );

      const v = pool.acquire();
      v.x = 10;
      v.y = 20;

      pool.release(v);

      const v2 = pool.acquire();
      expect(v2.x).toBe(0);
      expect(v2.y).toBe(0);
    });

    it('handles empty reset function', () => {
      const pool = new ObjectPool(
        factory,
        () => {} // Empty reset
      );

      const obj = pool.acquire();
      obj.x = 100;

      pool.release(obj);

      const obj2 = pool.acquire();
      expect(obj2.x).toBe(100); // Not reset
    });
  });
});
