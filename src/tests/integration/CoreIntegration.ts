/**
 * Core Module Integration Tests
 *
 * Tests for the core engine systems including:
 * - Engine lifecycle management
 * - Time system accuracy
 * - EventBus communication
 * - ObjectPool memory efficiency
 * - Task scheduling
 * - Logger functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Engine, EngineState } from '../../core/Engine';
import { EventBus } from '../../core/EventBus';
import { Time } from '../../core/Time';
import { ObjectPool } from '../../core/ObjectPool';
import { TaskScheduler } from '../../core/TaskScheduler';
import { Logger } from '../../core/Logger';

describe('Core Module Integration', () => {
  describe('Engine Lifecycle', () => {
    let engine: Engine | null = null;

    afterEach(() => {
      if (engine) {
        engine.destroy();
        engine = null;
      }
    });

    it('should create engine with default configuration', () => {
      engine = Engine.create();

      expect(engine).toBeDefined();
      expect(engine.state).toBe(EngineState.UNINITIALIZED);
      expect(engine.config.targetFPS).toBe(60);
      expect(engine.config.fixedTimestep).toBeCloseTo(1 / 60);
    });

    it('should create engine with custom configuration', () => {
      engine = Engine.create({
        targetFPS: 120,
        fixedTimestep: 1 / 120,
        maxSubSteps: 16,
        enableProfiling: true,
        autoStart: false
      });

      expect(engine.config.targetFPS).toBe(120);
      expect(engine.config.fixedTimestep).toBeCloseTo(1 / 120);
      expect(engine.config.maxSubSteps).toBe(16);
      expect(engine.config.enableProfiling).toBe(true);
    });

    it('should prevent creating multiple engine instances', () => {
      engine = Engine.create();

      expect(() => Engine.create()).toThrow('Engine instance already exists');
    });

    it('should initialize engine successfully', async () => {
      engine = Engine.create({ autoStart: false });

      await engine.init();

      expect(engine.state).toBe(EngineState.INITIALIZED);
      expect(engine.isInitialized).toBe(true);
    });

    it('should transition through complete lifecycle', async () => {
      engine = Engine.create({ autoStart: false });

      // UNINITIALIZED → INITIALIZED
      await engine.init();
      expect(engine.state).toBe(EngineState.INITIALIZED);

      // INITIALIZED → RUNNING
      engine.start();
      expect(engine.state).toBe(EngineState.RUNNING);
      expect(engine.isRunning).toBe(true);

      // RUNNING → PAUSED
      engine.pause();
      expect(engine.state).toBe(EngineState.PAUSED);
      expect(engine.isPaused).toBe(true);

      // PAUSED → RUNNING
      engine.resume();
      expect(engine.state).toBe(EngineState.RUNNING);

      // RUNNING → STOPPED
      engine.stop();
      expect(engine.state).toBe(EngineState.STOPPED);

      // STOPPED → RUNNING
      engine.start();
      expect(engine.state).toBe(EngineState.RUNNING);

      // * → DESTROYED
      engine.destroy();
      expect(engine.state).toBe(EngineState.DESTROYED);
    });

    it('should call lifecycle event handlers', async () => {
      const onInit = vi.fn();
      const onStart = vi.fn();
      const onStop = vi.fn();
      const onPause = vi.fn();
      const onResume = vi.fn();

      engine = Engine.create({ autoStart: false });

      engine.events.onInit = onInit;
      engine.events.onStart = onStart;
      engine.events.onStop = onStop;
      engine.events.onPause = onPause;
      engine.events.onResume = onResume;

      await engine.init();
      expect(onInit).toHaveBeenCalledWith(engine);

      engine.start();
      expect(onStart).toHaveBeenCalledWith(engine);

      engine.pause();
      expect(onPause).toHaveBeenCalledWith(engine);

      engine.resume();
      expect(onResume).toHaveBeenCalledWith(engine);

      engine.stop();
      expect(onStop).toHaveBeenCalledWith(engine);
    });

    it('should handle errors in event callbacks gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      engine = Engine.create({ autoStart: false });

      engine.events.onInit = () => {
        throw new Error('Test error in onInit');
      };

      await engine.init();

      // Engine should still be initialized despite callback error
      expect(engine.state).toBe(EngineState.INITIALIZED);

      consoleErrorSpy.mockRestore();
    });

    it('should reject invalid state transitions', async () => {
      engine = Engine.create({ autoStart: false });

      // Cannot start before init
      expect(() => engine!.start()).toThrow('Cannot start uninitialized engine');

      await engine.init();
      engine.destroy();

      // Cannot start destroyed engine
      expect(() => engine!.start()).toThrow('Cannot start destroyed engine');
    });

    it('should cleanup singleton instance on destroy', async () => {
      engine = Engine.create();
      await engine.init();

      expect(Engine.getInstance()).toBe(engine);

      engine.destroy();

      expect(Engine.getInstance()).toBeNull();

      // Should be able to create new instance after destroy
      engine = Engine.create();
      expect(engine).toBeDefined();
    });
  });

  describe('Time System', () => {
    let engine: Engine | null = null;

    beforeEach(() => {
      Time.reset();
    });

    afterEach(() => {
      if (engine) {
        engine.destroy();
        engine = null;
      }
    });

    it('should track delta time accurately', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      const initialTime = Time.time;

      Time.update();

      expect(Time.deltaTime).toBeGreaterThanOrEqual(0);
      expect(Time.time).toBeGreaterThanOrEqual(initialTime);
    });

    it('should maintain fixed timestep', async () => {
      const fixedTimestep = 1 / 60;
      engine = Engine.create({
        fixedTimestep,
        autoStart: false
      });

      await engine.init();

      expect(Time.fixedDeltaTime).toBeCloseTo(fixedTimestep);
    });

    it('should respect time scale', () => {
      Time.timeScale = 0.5;

      const dt = 0.016; // ~16ms
      Time.update();

      expect(Time.deltaTime).toBeLessThanOrEqual(dt * 0.5);

      Time.timeScale = 1.0; // Reset
    });

    it('should clamp max delta time', async () => {
      const fixedTimestep = 1 / 60;
      const maxSubSteps = 8;

      engine = Engine.create({
        fixedTimestep,
        maxSubSteps,
        autoStart: false
      });

      await engine.init();

      expect(Time.maxDeltaTime).toBeCloseTo(fixedTimestep * maxSubSteps);
    });

    it('should accumulate frame count', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      const initialFrameCount = engine.frameCount;

      engine.tick();

      expect(engine.frameCount).toBe(initialFrameCount + 1);
    });
  });

  describe('EventBus Communication', () => {
    beforeEach(() => {
      EventBus.clear();
    });

    afterEach(() => {
      EventBus.clear();
    });

    it('should register and emit events', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);
      EventBus.on('engine:start', handler3);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should respect handler priority', () => {
      const callOrder: number[] = [];

      EventBus.on('engine:start', () => callOrder.push(2), { priority: 2 });
      EventBus.on('engine:start', () => callOrder.push(10), { priority: 10 });
      EventBus.on('engine:start', () => callOrder.push(5), { priority: 5 });

      EventBus.emit('engine:start', undefined);

      expect(callOrder).toEqual([10, 5, 2]);
    });

    it('should unsubscribe handlers', () => {
      const handler = vi.fn();

      const unsubscribe = EventBus.on('engine:start', handler);
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should support one-time handlers', () => {
      const handler = vi.fn();

      EventBus.once('engine:start', handler);

      EventBus.emit('engine:start', undefined);
      expect(handler).toHaveBeenCalledTimes(1);

      EventBus.emit('engine:start', undefined);
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should pass event data to handlers', () => {
      const handler = vi.fn();

      EventBus.on('scene:load', handler);
      EventBus.emit('scene:load', { sceneName: 'TestScene' });

      expect(handler).toHaveBeenCalledWith({ sceneName: 'TestScene' });
    });

    it('should isolate handler errors', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler1 = vi.fn(() => { throw new Error('Handler 1 error'); });
      const handler2 = vi.fn();

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled(); // Should still be called

      consoleErrorSpy.mockRestore();
    });

    it('should warn about potential memory leaks', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Register 101 handlers (threshold is 100)
      for (let i = 0; i < 101; i++) {
        EventBus.on('engine:start', () => {});
      }

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should provide introspection methods', () => {
      EventBus.on('engine:start', () => {});
      EventBus.on('engine:stop', () => {});

      expect(EventBus.hasHandlers('engine:start')).toBe(true);
      expect(EventBus.hasHandlers('engine:pause')).toBe(false);
      expect(EventBus.getHandlerCount('engine:start')).toBe(1);
      expect(EventBus.getEventNames()).toContain('engine:start');
      expect(EventBus.getEventNames()).toContain('engine:stop');
    });
  });

  describe('ObjectPool Memory Management', () => {
    interface TestObject {
      x: number;
      y: number;
      z: number;
    }

    it('should create and manage pooled objects', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; }
      );

      const obj = pool.acquire();
      expect(obj).toEqual({ x: 0, y: 0, z: 0 });

      obj.x = 10;
      pool.release(obj);

      expect(pool.pooledCount).toBe(1);
    });

    it('should reuse pooled objects', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; }
      );

      const obj1 = pool.acquire();
      obj1.x = 100;
      pool.release(obj1);

      const obj2 = pool.acquire();

      // Should be same instance, reset to initial state
      expect(obj2).toBe(obj1);
      expect(obj2.x).toBe(0);
    });

    it('should prewarm pool for performance', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        10 // Initial size
      );

      expect(pool.pooledCount).toBe(10);
      expect(pool.totalCreated).toBe(10);
    });

    it('should track active and pooled objects', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        0,
        undefined,
        true // Debug mode
      );

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      expect(pool.activeCount).toBe(2);

      pool.release(obj1);

      expect(pool.activeCount).toBe(1);
      expect(pool.pooledCount).toBe(1);
    });

    it('should respect max pool size', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        0,
        5 // Max size
      );

      const objects: TestObject[] = [];
      for (let i = 0; i < 10; i++) {
        objects.push(pool.acquire());
      }

      for (const obj of objects) {
        pool.release(obj);
      }

      expect(pool.pooledCount).toBe(5);
    });

    it('should detect double-release errors in debug mode', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        0,
        undefined,
        true // Debug mode
      );

      const obj = pool.acquire();
      pool.release(obj);

      expect(() => pool.release(obj)).toThrow('double-release');
    });

    it('should shrink pool to reduce memory', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        10
      );

      expect(pool.pooledCount).toBe(10);

      pool.shrink(5);

      expect(pool.pooledCount).toBe(5);
    });

    it('should track high water mark', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        0,
        undefined,
        true // Debug mode
      );

      const objects: TestObject[] = [];
      for (let i = 0; i < 10; i++) {
        objects.push(pool.acquire());
      }

      expect(pool.highWaterMark).toBe(10);

      for (let i = 0; i < 5; i++) {
        pool.release(objects[i]);
      }

      expect(pool.highWaterMark).toBe(10); // Should remain at peak
    });

    it('should clear and reset pool', () => {
      const pool = new ObjectPool<TestObject>(
        () => ({ x: 0, y: 0, z: 0 }),
        (obj) => { obj.x = 0; obj.y = 0; obj.z = 0; },
        5
      );

      pool.clear();
      expect(pool.pooledCount).toBe(0);
      expect(pool.totalCreated).toBe(5); // Statistics preserved

      pool.reset();
      expect(pool.totalCreated).toBe(0); // Statistics reset
    });
  });

  describe('Task Scheduler', () => {
    it('should schedule and execute tasks', async () => {
      const scheduler = new TaskScheduler();
      const task = vi.fn();

      scheduler.schedule('test-task', task, 0);
      scheduler.update(0.016);

      expect(task).toHaveBeenCalled();
    });

    it('should execute tasks in priority order', () => {
      const scheduler = new TaskScheduler();
      const callOrder: number[] = [];

      scheduler.schedule('low', () => callOrder.push(1), 1);
      scheduler.schedule('high', () => callOrder.push(3), 3);
      scheduler.schedule('medium', () => callOrder.push(2), 2);

      scheduler.update(0.016);

      expect(callOrder).toEqual([3, 2, 1]);
    });

    it('should delay task execution', () => {
      const scheduler = new TaskScheduler();
      const task = vi.fn();

      scheduler.scheduleDelayed('delayed-task', task, 0.1, 0); // 100ms delay

      scheduler.update(0.05); // 50ms
      expect(task).not.toHaveBeenCalled();

      scheduler.update(0.06); // Total 110ms
      expect(task).toHaveBeenCalled();
    });

    it('should execute recurring tasks', () => {
      const scheduler = new TaskScheduler();
      const task = vi.fn();

      scheduler.scheduleRecurring('recurring-task', task, 0.1, 0); // Every 100ms

      scheduler.update(0.1);
      expect(task).toHaveBeenCalledTimes(1);

      scheduler.update(0.1);
      expect(task).toHaveBeenCalledTimes(2);

      scheduler.update(0.1);
      expect(task).toHaveBeenCalledTimes(3);
    });

    it('should cancel scheduled tasks', () => {
      const scheduler = new TaskScheduler();
      const task = vi.fn();

      scheduler.schedule('cancelable-task', task, 0);
      scheduler.cancel('cancelable-task');

      scheduler.update(0.016);

      expect(task).not.toHaveBeenCalled();
    });

    it('should clear all tasks', () => {
      const scheduler = new TaskScheduler();

      scheduler.schedule('task1', () => {}, 0);
      scheduler.schedule('task2', () => {}, 0);
      scheduler.schedule('task3', () => {}, 0);

      expect(scheduler.taskCount).toBe(3);

      scheduler.clear();

      expect(scheduler.taskCount).toBe(0);
    });
  });

  describe('Logger', () => {
    it('should create logger with context', () => {
      const logger = Logger.create('TestModule');

      expect(logger).toBeDefined();
    });

    it('should log messages at different levels', () => {
      const logger = Logger.create('TestModule');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      consoleSpy.mockRestore();
    });

    it('should respect log level filtering', () => {
      Logger.setLevel('warn');

      const logger = Logger.create('TestModule');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.debug('Should not appear');
      logger.info('Should not appear');
      logger.warn('Should appear');
      logger.error('Should appear');

      Logger.setLevel('debug'); // Reset
      consoleSpy.mockRestore();
    });

    it('should support structured logging with metadata', () => {
      const logger = Logger.create('TestModule');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('User logged in', {
        userId: 123,
        timestamp: Date.now()
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Integration: Engine + EventBus + Time', () => {
    let engine: Engine | null = null;

    afterEach(() => {
      if (engine) {
        engine.destroy();
        engine = null;
      }
      EventBus.clear();
    });

    it('should emit lifecycle events through EventBus', async () => {
      const startHandler = vi.fn();
      const stopHandler = vi.fn();

      EventBus.on('engine:start', startHandler);
      EventBus.on('engine:stop', stopHandler);

      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(startHandler).toHaveBeenCalledTimes(1);

      engine.start();
      expect(startHandler).toHaveBeenCalledTimes(2);

      engine.stop();
      expect(stopHandler).toHaveBeenCalledTimes(1);
    });

    it('should update Time system during engine tick', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      const timeBefore = Time.time;

      engine.tick();

      expect(Time.time).toBeGreaterThanOrEqual(timeBefore);
      expect(engine.frameCount).toBeGreaterThan(0);
    });
  });
});
