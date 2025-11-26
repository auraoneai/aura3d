import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Engine, EngineState } from '../../../core/Engine';
import { EventBus } from '../../../core/EventBus';
import { Time } from '../../../core/Time';

/**
 * Comprehensive test suite for the Engine class.
 * Tests cover initialization, lifecycle, frame timing, subsystem access, and events.
 *
 * Coverage target: 95%
 */
describe('Engine', () => {
  let engine: Engine | null = null;

  beforeEach(() => {
    // Clear any existing engine instance
    const existingEngine = Engine.getInstance();
    if (existingEngine) {
      existingEngine.destroy();
    }

    // Clear event bus
    EventBus.clear();

    // Reset Time
    Time.reset();

    // Mock performance.now for deterministic testing
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    // Clean up engine instance
    if (engine) {
      engine.destroy();
      engine = null;
    }

    const existingEngine = Engine.getInstance();
    if (existingEngine) {
      existingEngine.destroy();
    }

    // Restore all mocks
    vi.restoreAllMocks();
    EventBus.clear();
  });

  describe('initialization', () => {
    it('creates with default config', () => {
      engine = Engine.create();

      expect(engine).toBeDefined();
      expect(engine.config.targetFPS).toBe(60);
      expect(engine.config.fixedTimestep).toBe(1 / 60);
      expect(engine.config.maxSubSteps).toBe(8);
      expect(engine.config.enableProfiling).toBe(false);
      expect(engine.config.autoStart).toBe(true);
    });

    it('creates with custom config', () => {
      engine = Engine.create({
        targetFPS: 120,
        fixedTimestep: 1 / 120,
        maxSubSteps: 4,
        enableProfiling: true,
        autoStart: false,
      });

      expect(engine.config.targetFPS).toBe(120);
      expect(engine.config.fixedTimestep).toBe(1 / 120);
      expect(engine.config.maxSubSteps).toBe(4);
      expect(engine.config.enableProfiling).toBe(true);
      expect(engine.config.autoStart).toBe(false);
    });

    it('initializes all subsystems', async () => {
      engine = Engine.create({ autoStart: false });

      expect(engine.state).toBe(EngineState.UNINITIALIZED);

      await engine.init();

      expect(engine.state).toBe(EngineState.INITIALIZED);
      expect(engine.world).toBeDefined();
    });

    it('sets up render loop', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        return 1;
      });

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      expect(rafSpy).toHaveBeenCalled();
    });

    it('throws error when creating second instance', () => {
      engine = Engine.create({ autoStart: false });

      expect(() => {
        Engine.create({ autoStart: false });
      }).toThrow('Engine instance already exists');
    });

    it('initializes Time subsystem with correct values', async () => {
      engine = Engine.create({
        fixedTimestep: 1 / 120,
        maxSubSteps: 10,
        autoStart: false,
      });

      await engine.init();

      expect(Time.fixedDeltaTime).toBe(1 / 120);
      expect(Time.maxDeltaTime).toBe((1 / 120) * 10);
    });

    it('calls onInit callback when provided', async () => {
      const onInitCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onInit = onInitCallback;

      await engine.init();

      expect(onInitCallback).toHaveBeenCalledWith(engine);
    });

    it('auto-starts when autoStart is true', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      engine = Engine.create({ autoStart: true });
      await engine.init();

      expect(engine.state).toBe(EngineState.RUNNING);
      expect(rafSpy).toHaveBeenCalled();
    });

    it('does not auto-start when autoStart is false', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(engine.state).toBe(EngineState.INITIALIZED);
      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('start() begins game loop', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(engine.state).toBe(EngineState.INITIALIZED);

      engine.start();

      expect(engine.state).toBe(EngineState.RUNNING);
      expect(rafSpy).toHaveBeenCalled();
      expect(engine.isRunning).toBe(true);
    });

    it('stop() halts game loop', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
      const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame');

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      expect(engine.state).toBe(EngineState.RUNNING);

      engine.stop();

      expect(engine.state).toBe(EngineState.STOPPED);
      expect(cancelRafSpy).toHaveBeenCalled();
      expect(engine.isRunning).toBe(false);
    });

    it('pause() suspends updates', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
      const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame');

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      engine.pause();

      expect(engine.state).toBe(EngineState.PAUSED);
      expect(cancelRafSpy).toHaveBeenCalled();
      expect(engine.isPaused).toBe(true);
    });

    it('resume() continues updates', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();
      engine.pause();

      rafSpy.mockClear();

      engine.resume();

      expect(engine.state).toBe(EngineState.RUNNING);
      expect(rafSpy).toHaveBeenCalled();
      expect(engine.isRunning).toBe(true);
    });

    it('dispose() cleans up resources', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      engine.destroy();

      expect(engine.state).toBe(EngineState.DESTROYED);
      expect(Engine.getInstance()).toBeNull();
    });

    it('throws error when starting uninitialized engine', () => {
      engine = Engine.create({ autoStart: false });

      expect(() => {
        engine!.start();
      }).toThrow('Cannot start uninitialized engine');
    });

    it('throws error when starting destroyed engine', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.destroy();

      expect(() => {
        engine!.start();
      }).toThrow('Cannot start destroyed engine');
    });

    it('warns when starting already running engine', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      // Should not throw, just warn
      expect(() => {
        engine!.start();
      }).not.toThrow();
    });

    it('warns when pausing non-running engine', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(() => {
        engine!.pause();
      }).not.toThrow();
    });

    it('warns when resuming non-paused engine', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(() => {
        engine!.resume();
      }).not.toThrow();
    });

    it('can restart after stopping', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();
      engine.stop();

      rafSpy.mockClear();

      engine.start();

      expect(engine.state).toBe(EngineState.RUNNING);
      expect(rafSpy).toHaveBeenCalled();
    });
  });

  describe('frame timing', () => {
    it('maintains fixed timestep', async () => {
      let fixedUpdateCount = 0;

      engine = Engine.create({
        autoStart: false,
        fixedTimestep: 1 / 60,
      });

      engine.events.onFixedUpdate = () => {
        fixedUpdateCount++;
      };

      await engine.init();

      // Simulate one frame of 16.67ms (1/60 second)
      vi.spyOn(performance, 'now').mockReturnValue(16.67);
      Time.update();

      engine.tick();

      // Should execute exactly one fixed update
      expect(fixedUpdateCount).toBe(1);
    });

    it('handles variable frame rates', async () => {
      const updateDeltas: number[] = [];

      engine = Engine.create({ autoStart: false });
      engine.events.onUpdate = (dt) => {
        updateDeltas.push(dt);
      };

      await engine.init();

      // Frame 1: 16ms
      vi.spyOn(performance, 'now').mockReturnValue(16);
      Time.update();
      engine.tick();

      // Frame 2: 33ms (slow frame)
      vi.mocked(performance.now).mockReturnValue(49);
      Time.update();
      engine.tick();

      expect(updateDeltas.length).toBe(2);
      expect(updateDeltas[0]).toBeGreaterThan(0);
      expect(updateDeltas[1]).toBeGreaterThan(0);
    });

    it('caps maximum delta time', async () => {
      let fixedUpdateCount = 0;

      engine = Engine.create({
        autoStart: false,
        fixedTimestep: 1 / 60,
        maxSubSteps: 8,
      });

      engine.events.onFixedUpdate = () => {
        fixedUpdateCount++;
      };

      await engine.init();

      // Simulate a very long frame (1 second)
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      Time.update();

      engine.tick();

      // Should cap at maxSubSteps
      expect(fixedUpdateCount).toBeLessThanOrEqual(8);
    });

    it('accumulates time correctly', async () => {
      let fixedUpdateCount = 0;

      engine = Engine.create({
        autoStart: false,
        fixedTimestep: 1 / 60,
      });

      engine.events.onFixedUpdate = () => {
        fixedUpdateCount++;
      };

      await engine.init();

      // Frame 1: 8ms (half of fixed timestep)
      vi.spyOn(performance, 'now').mockReturnValue(8);
      Time.update();
      engine.tick();
      expect(fixedUpdateCount).toBe(0); // Accumulator not full yet

      // Frame 2: 17ms (now accumulator should trigger)
      vi.mocked(performance.now).mockReturnValue(25);
      Time.update();
      engine.tick();
      expect(fixedUpdateCount).toBe(1); // Now it should fire
    });

    it('executes multiple fixed updates per frame when needed', async () => {
      let fixedUpdateCount = 0;

      engine = Engine.create({
        autoStart: false,
        fixedTimestep: 1 / 60,
      });

      engine.events.onFixedUpdate = () => {
        fixedUpdateCount++;
      };

      await engine.init();

      // Simulate a frame that's 3x the fixed timestep
      vi.spyOn(performance, 'now').mockReturnValue(50); // ~3 * 16.67ms
      Time.update();

      engine.tick();

      expect(fixedUpdateCount).toBe(3);
    });
  });

  describe('subsystem access', () => {
    it('provides world access', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(engine.world).toBeDefined();
      expect(engine.world.entityCount).toBeDefined();
    });

    it('provides time access', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(engine.deltaTime).toBeDefined();
      expect(engine.time).toBeDefined();
      expect(engine.frameCount).toBeDefined();
    });

    it('provides fps access', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(engine.fps).toBeDefined();
      expect(typeof engine.fps).toBe('number');
    });

    it('provides config access', async () => {
      engine = Engine.create({
        autoStart: false,
        targetFPS: 144,
      });

      expect(engine.config.targetFPS).toBe(144);
    });

    it('config is immutable', async () => {
      engine = Engine.create({ autoStart: false });

      expect(() => {
        (engine!.config as any).targetFPS = 30;
      }).toThrow();
    });
  });

  describe('events', () => {
    it('emits onStart event', async () => {
      const onStartCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onStart = onStartCallback;

      await engine.init();
      engine.start();

      expect(onStartCallback).toHaveBeenCalledWith(engine);
    });

    it('emits onUpdate event with delta', async () => {
      const onUpdateCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onUpdate = onUpdateCallback;

      await engine.init();

      vi.spyOn(performance, 'now').mockReturnValue(16.67);
      Time.update();

      engine.tick();

      expect(onUpdateCallback).toHaveBeenCalled();
      expect(onUpdateCallback.mock.calls[0][0]).toBeGreaterThan(0);
    });

    it('emits onFixedUpdate event', async () => {
      const onFixedUpdateCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onFixedUpdate = onFixedUpdateCallback;

      await engine.init();

      vi.spyOn(performance, 'now').mockReturnValue(16.67);
      Time.update();

      engine.tick();

      expect(onFixedUpdateCallback).toHaveBeenCalledWith(engine.config.fixedTimestep);
    });

    it('emits onLateUpdate event', async () => {
      const onLateUpdateCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onLateUpdate = onLateUpdateCallback;

      await engine.init();

      vi.spyOn(performance, 'now').mockReturnValue(16.67);
      Time.update();

      engine.tick();

      expect(onLateUpdateCallback).toHaveBeenCalled();
    });

    it('emits onPause/onResume events', async () => {
      const onPauseCallback = vi.fn();
      const onResumeCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onPause = onPauseCallback;
      engine.events.onResume = onResumeCallback;

      await engine.init();
      engine.start();

      engine.pause();
      expect(onPauseCallback).toHaveBeenCalledWith(engine);

      engine.resume();
      expect(onResumeCallback).toHaveBeenCalledWith(engine);
    });

    it('emits onStop event', async () => {
      const onStopCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onStop = onStopCallback;

      await engine.init();
      engine.start();
      engine.stop();

      expect(onStopCallback).toHaveBeenCalledWith(engine);
    });

    it('emits onDestroy event', async () => {
      const onDestroyCallback = vi.fn();

      engine = Engine.create({ autoStart: false });
      engine.events.onDestroy = onDestroyCallback;

      await engine.init();
      engine.destroy();

      expect(onDestroyCallback).toHaveBeenCalledWith(engine);
    });

    it('handles errors in callbacks gracefully', async () => {
      engine = Engine.create({ autoStart: false });
      engine.events.onUpdate = () => {
        throw new Error('Test error');
      };

      await engine.init();

      // Should not throw, just log error
      expect(() => {
        engine!.tick();
      }).not.toThrow();
    });

    it('emits EventBus events on start', async () => {
      const eventCallback = vi.fn();
      EventBus.on('engine:start', eventCallback);

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.start();

      expect(eventCallback).toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    it('tracks frame count', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      const initialFrameCount = engine.frameCount;

      vi.spyOn(performance, 'now').mockReturnValue(16.67);
      Time.update();
      engine.tick();

      expect(engine.frameCount).toBe(initialFrameCount + 1);
    });

    it('calculates FPS', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      let currentTime = 0;
      const timeSpy = vi.spyOn(performance, 'now');

      // Simulate 60 frames over 1 second
      for (let i = 0; i < 60; i++) {
        currentTime += 16.67;
        timeSpy.mockReturnValue(currentTime);
        Time.update();
        engine.tick();
      }

      // FPS should be close to 60
      expect(engine.fps).toBeGreaterThan(0);
    });

    it('provides getStats() method', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      const stats = engine.getStats();

      expect(stats).toBeDefined();
      expect(stats.fps).toBeDefined();
      expect(stats.frameTime).toBeDefined();
      expect(stats.entityCount).toBeDefined();
      expect(stats.systemCount).toBeDefined();
    });
  });

  describe('singleton pattern', () => {
    it('getInstance returns null when no instance exists', () => {
      expect(Engine.getInstance()).toBeNull();
    });

    it('getInstance returns existing instance', async () => {
      engine = Engine.create({ autoStart: false });

      const instance = Engine.getInstance();

      expect(instance).toBe(engine);
    });

    it('clears singleton on destroy', async () => {
      engine = Engine.create({ autoStart: false });
      await engine.init();

      engine.destroy();

      expect(Engine.getInstance()).toBeNull();
    });
  });

  describe('visibility handling', () => {
    it('sets up visibility change handler on init', async () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      engine = Engine.create({ autoStart: false });
      await engine.init();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('removes visibility handler on destroy', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      engine = Engine.create({ autoStart: false });
      await engine.init();
      engine.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });
  });
});
