import { describe, it, expect } from 'vitest';
import * as CoreModule from '../../../core';

/**
 * Comprehensive test suite for core module exports.
 * Verifies all core exports are available, properly typed, and have no circular dependencies.
 *
 * Coverage target: 100% (export validation)
 */
describe('Core Module Exports', () => {
  describe('module structure', () => {
    it('exports core module', () => {
      expect(CoreModule).toBeDefined();
      expect(typeof CoreModule).toBe('object');
    });

    it('does not export undefined values', () => {
      const exports = Object.keys(CoreModule);

      for (const exportName of exports) {
        expect((CoreModule as any)[exportName]).toBeDefined();
      }
    });
  });

  describe('BuildInfo exports', () => {
    it('exports BuildInfo', () => {
      expect(CoreModule.BuildInfo).toBeDefined();
    });

    it('BuildInfo has correct shape', () => {
      const buildInfo = CoreModule.BuildInfo;

      expect(buildInfo.version).toBeDefined();
      expect(buildInfo.buildDate).toBeDefined();
      expect(buildInfo.gitCommit).toBeDefined();
    });
  });

  describe('Assert exports', () => {
    it('exports assert function', () => {
      expect(CoreModule.assert).toBeDefined();
      expect(typeof CoreModule.assert).toBe('function');
    });

    it('exports assertDefined function', () => {
      expect(CoreModule.assertDefined).toBeDefined();
      expect(typeof CoreModule.assertDefined).toBe('function');
    });

    it('exports assertNonNull function', () => {
      expect(CoreModule.assertNonNull).toBeDefined();
      expect(typeof CoreModule.assertNonNull).toBe('function');
    });
  });

  describe('Logger exports', () => {
    it('exports Logger class', () => {
      expect(CoreModule.Logger).toBeDefined();
      expect(typeof CoreModule.Logger).toBe('function');
    });

    it('exports LogLevel enum', () => {
      expect(CoreModule.LogLevel).toBeDefined();
      expect(CoreModule.LogLevel.TRACE).toBeDefined();
      expect(CoreModule.LogLevel.DEBUG).toBeDefined();
      expect(CoreModule.LogLevel.INFO).toBeDefined();
      expect(CoreModule.LogLevel.WARN).toBeDefined();
      expect(CoreModule.LogLevel.ERROR).toBeDefined();
      expect(CoreModule.LogLevel.FATAL).toBeDefined();
    });

    it('exports ConsoleSink class', () => {
      expect(CoreModule.ConsoleSink).toBeDefined();
      expect(typeof CoreModule.ConsoleSink).toBe('function');
    });

    it('exports ArraySink class', () => {
      expect(CoreModule.ArraySink).toBeDefined();
      expect(typeof CoreModule.ArraySink).toBe('function');
    });
  });

  describe('Time exports', () => {
    it('exports Time class', () => {
      expect(CoreModule.Time).toBeDefined();
      expect(typeof CoreModule.Time).toBe('function');
    });

    it('Time has static properties', () => {
      expect(CoreModule.Time.deltaTime).toBeDefined();
      expect(CoreModule.Time.fixedDeltaTime).toBeDefined();
      expect(CoreModule.Time.unscaledDeltaTime).toBeDefined();
      expect(CoreModule.Time.time).toBeDefined();
      expect(CoreModule.Time.frameCount).toBeDefined();
      expect(CoreModule.Time.timeScale).toBeDefined();
    });

    it('Time has static methods', () => {
      expect(typeof CoreModule.Time.update).toBe('function');
      expect(typeof CoreModule.Time.reset).toBe('function');
      expect(typeof CoreModule.Time.getFixedStepIterator).toBe('function');
    });
  });

  describe('EventBus exports', () => {
    it('exports EventBus class', () => {
      expect(CoreModule.EventBus).toBeDefined();
      expect(typeof CoreModule.EventBus).toBe('function');
    });

    it('EventBus has static methods', () => {
      expect(typeof CoreModule.EventBus.on).toBe('function');
      expect(typeof CoreModule.EventBus.once).toBe('function');
      expect(typeof CoreModule.EventBus.off).toBe('function');
      expect(typeof CoreModule.EventBus.emit).toBe('function');
      expect(typeof CoreModule.EventBus.clear).toBe('function');
    });
  });

  describe('ObjectPool exports', () => {
    it('exports ObjectPool class', () => {
      expect(CoreModule.ObjectPool).toBeDefined();
      expect(typeof CoreModule.ObjectPool).toBe('function');
    });

    it('ObjectPool can be instantiated', () => {
      const pool = new CoreModule.ObjectPool(
        () => ({ value: 0 }),
        (obj) => { obj.value = 0; }
      );

      expect(pool).toBeDefined();
      expect(typeof pool.acquire).toBe('function');
      expect(typeof pool.release).toBe('function');
    });
  });

  describe('Panic exports', () => {
    it('exports Panic class', () => {
      expect(CoreModule.Panic).toBeDefined();
      expect(typeof CoreModule.Panic).toBe('function');
    });

    it('exports PanicError class', () => {
      expect(CoreModule.PanicError).toBeDefined();
      expect(typeof CoreModule.PanicError).toBe('function');
    });

    it('Panic has static methods', () => {
      expect(typeof CoreModule.Panic.panic).toBe('function');
      expect(typeof CoreModule.Panic.panicIf).toBe('function');
    });
  });

  describe('Random exports', () => {
    it('exports Random class', () => {
      expect(CoreModule.Random).toBeDefined();
      expect(typeof CoreModule.Random).toBe('function');
    });

    it('Random can be instantiated', () => {
      const random = new CoreModule.Random();

      expect(random).toBeDefined();
      expect(typeof random.next).toBe('function');
      expect(typeof random.nextFloat).toBe('function');
      expect(typeof random.nextInt).toBe('function');
    });
  });

  describe('IdGenerator exports', () => {
    it('exports IdGenerator class', () => {
      expect(CoreModule.IdGenerator).toBeDefined();
      expect(typeof CoreModule.IdGenerator).toBe('function');
    });

    it('IdGenerator has static methods', () => {
      expect(typeof CoreModule.IdGenerator.next).toBe('function');
      expect(typeof CoreModule.IdGenerator.reset).toBe('function');
    });
  });

  describe('EngineConfig exports', () => {
    it('exports createDefaultConfig function', () => {
      expect(CoreModule.createDefaultConfig).toBeDefined();
      expect(typeof CoreModule.createDefaultConfig).toBe('function');
    });

    it('exports createDefaultEngineConfig function', () => {
      expect(CoreModule.createDefaultEngineConfig).toBeDefined();
      expect(typeof CoreModule.createDefaultEngineConfig).toBe('function');
    });

    it('exports RenderConfig type', () => {
      // Type exports can't be tested at runtime, but we can verify the function returns correct shape
      const config = CoreModule.createDefaultConfig();
      expect(config.rendering).toBeDefined();
    });
  });

  describe('TaskScheduler exports', () => {
    it('exports TaskScheduler class', () => {
      expect(CoreModule.TaskScheduler).toBeDefined();
      expect(typeof CoreModule.TaskScheduler).toBe('function');
    });

    it('exports TaskPriority enum', () => {
      expect(CoreModule.TaskPriority).toBeDefined();
      expect(CoreModule.TaskPriority.LOW).toBeDefined();
      expect(CoreModule.TaskPriority.NORMAL).toBeDefined();
      expect(CoreModule.TaskPriority.HIGH).toBeDefined();
      expect(CoreModule.TaskPriority.CRITICAL).toBeDefined();
    });

    it('TaskScheduler has static methods', () => {
      expect(typeof CoreModule.TaskScheduler.schedule).toBe('function');
      expect(typeof CoreModule.TaskScheduler.cancel).toBe('function');
      expect(typeof CoreModule.TaskScheduler.update).toBe('function');
    });
  });

  describe('Diagnostics exports', () => {
    it('exports Diagnostics class', () => {
      expect(CoreModule.Diagnostics).toBeDefined();
      expect(typeof CoreModule.Diagnostics).toBe('function');
    });

    it('Diagnostics has static methods', () => {
      expect(typeof CoreModule.Diagnostics.enable).toBe('function');
      expect(typeof CoreModule.Diagnostics.disable).toBe('function');
      expect(typeof CoreModule.Diagnostics.getReport).toBe('function');
    });
  });

  describe('Engine exports', () => {
    it('exports Engine class', () => {
      expect(CoreModule.Engine).toBeDefined();
      expect(typeof CoreModule.Engine).toBe('function');
    });

    it('exports EngineState enum', () => {
      expect(CoreModule.EngineState).toBeDefined();
      expect(CoreModule.EngineState.UNINITIALIZED).toBeDefined();
      expect(CoreModule.EngineState.INITIALIZED).toBeDefined();
      expect(CoreModule.EngineState.RUNNING).toBeDefined();
      expect(CoreModule.EngineState.PAUSED).toBeDefined();
      expect(CoreModule.EngineState.STOPPED).toBeDefined();
      expect(CoreModule.EngineState.DESTROYED).toBeDefined();
    });

    it('Engine has static methods', () => {
      expect(typeof CoreModule.Engine.create).toBe('function');
      expect(typeof CoreModule.Engine.getInstance).toBe('function');
    });
  });

  describe('type safety', () => {
    it('Logger.create returns ScopedLogger', () => {
      const logger = CoreModule.Logger.create('Test');

      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('ObjectPool is properly typed', () => {
      interface TestObj {
        value: number;
      }

      const pool = new CoreModule.ObjectPool<TestObj>(
        () => ({ value: 0 }),
        (obj) => { obj.value = 0; }
      );

      const obj: TestObj = pool.acquire();
      expect(obj.value).toBe(0);
    });

    it('EventBus is type-safe', () => {
      const handler = (data: void) => {
        expect(data).toBeUndefined();
      };

      CoreModule.EventBus.on('engine:start', handler);
      CoreModule.EventBus.emit('engine:start', undefined);
      CoreModule.EventBus.off('engine:start', handler);
    });
  });

  describe('no circular dependencies', () => {
    it('all exports are immediately accessible', () => {
      // If there were circular dependencies, some exports would be undefined
      const exports = Object.keys(CoreModule);

      for (const exportName of exports) {
        expect((CoreModule as any)[exportName]).not.toBeUndefined();
      }
    });

    it('classes can be instantiated without errors', () => {
      expect(() => {
        new CoreModule.Logger('Test');
      }).not.toThrow();

      expect(() => {
        new CoreModule.Random();
      }).not.toThrow();

      expect(() => {
        new CoreModule.ObjectPool(() => ({}), () => {});
      }).not.toThrow();

      expect(() => {
        new CoreModule.ConsoleSink();
      }).not.toThrow();

      expect(() => {
        new CoreModule.ArraySink();
      }).not.toThrow();
    });

    it('static methods work without initialization', () => {
      expect(() => {
        CoreModule.EventBus.getEventNames();
      }).not.toThrow();

      expect(() => {
        CoreModule.IdGenerator.next();
      }).not.toThrow();

      expect(() => {
        CoreModule.TaskScheduler.update();
      }).not.toThrow();
    });
  });

  describe('export consistency', () => {
    it('exports expected number of items', () => {
      const exports = Object.keys(CoreModule);

      // Should have a reasonable number of exports (not too few, not suspiciously many)
      expect(exports.length).toBeGreaterThan(10);
      expect(exports.length).toBeLessThan(100);
    });

    it('exports are unique', () => {
      const exports = Object.keys(CoreModule);
      const uniqueExports = [...new Set(exports)];

      expect(exports.length).toBe(uniqueExports.length);
    });

    it('all exported classes have constructors', () => {
      const classExports = [
        'Logger',
        'ConsoleSink',
        'ArraySink',
        'Time',
        'EventBus',
        'ObjectPool',
        'Panic',
        'PanicError',
        'Random',
        'IdGenerator',
        'TaskScheduler',
        'Diagnostics',
        'Engine',
      ];

      for (const className of classExports) {
        const exportedClass = (CoreModule as any)[className];
        expect(exportedClass).toBeDefined();
        expect(typeof exportedClass).toBe('function');
      }
    });

    it('all exported enums have values', () => {
      const enumExports = [
        'LogLevel',
        'TaskPriority',
        'EngineState',
      ];

      for (const enumName of enumExports) {
        const exportedEnum = (CoreModule as any)[enumName];
        expect(exportedEnum).toBeDefined();
        expect(typeof exportedEnum).toBe('object');
        expect(Object.keys(exportedEnum).length).toBeGreaterThan(0);
      }
    });
  });

  describe('runtime behavior', () => {
    it('Logger works after import', () => {
      const logger = CoreModule.Logger.create('ImportTest');

      expect(() => {
        logger.info('Test message');
      }).not.toThrow();
    });

    it('Time works after import', () => {
      expect(() => {
        CoreModule.Time.update();
      }).not.toThrow();

      expect(CoreModule.Time.frameCount).toBeGreaterThanOrEqual(0);
    });

    it('EventBus works after import', () => {
      let called = false;

      CoreModule.EventBus.on('engine:start', () => {
        called = true;
      });

      CoreModule.EventBus.emit('engine:start', undefined);

      expect(called).toBe(true);

      CoreModule.EventBus.clear();
    });

    it('ObjectPool works after import', () => {
      const pool = new CoreModule.ObjectPool(
        () => ({ value: 0 }),
        (obj) => { obj.value = 0; }
      );

      const obj = pool.acquire();
      expect(obj).toBeDefined();

      pool.release(obj);
      expect(pool.pooledCount).toBe(1);
    });

    it('Random works after import', () => {
      const random = new CoreModule.Random();

      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });

    it('IdGenerator works after import', () => {
      const id1 = CoreModule.IdGenerator.next();
      const id2 = CoreModule.IdGenerator.next();

      expect(id1).not.toBe(id2);
    });
  });
});
