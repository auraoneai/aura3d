import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Time } from '../../../core/Time';

/**
 * Comprehensive test suite for the Time class.
 * Tests cover delta time tracking, fixed timestep, time scaling,
 * frame counting, and time accumulation.
 *
 * Coverage target: 95%
 */
describe('Time', () => {
  let performanceNowMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Time.reset();
    performanceNowMock = vi.spyOn(performance, 'now');
    performanceNowMock.mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Time.reset();
  });

  describe('initialization', () => {
    it('starts with default values', () => {
      expect(Time.deltaTime).toBe(0);
      expect(Time.unscaledDeltaTime).toBe(0);
      expect(Time.time).toBe(0);
      expect(Time.frameCount).toBe(0);
      expect(Time.fixedDeltaTime).toBe(1 / 60);
      expect(Time.timeScale).toBe(1);
      expect(Time.maxDeltaTime).toBe(0.1);
    });

    it('can be configured with custom fixed delta time', () => {
      Time.fixedDeltaTime = 1 / 120;

      expect(Time.fixedDeltaTime).toBe(1 / 120);
    });

    it('can be configured with custom max delta time', () => {
      Time.maxDeltaTime = 0.2;

      expect(Time.maxDeltaTime).toBe(0.2);
    });
  });

  describe('deltaTime tracking', () => {
    it('calculates deltaTime correctly', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.deltaTime).toBeCloseTo(0.01667, 4);
    });

    it('updates deltaTime each frame', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(16);
      Time.update();
      const delta1 = Time.deltaTime;

      performanceNowMock.mockReturnValue(32);
      Time.update();
      const delta2 = Time.deltaTime;

      expect(delta1).toBeCloseTo(0.016, 3);
      expect(delta2).toBeCloseTo(0.016, 3);
    });

    it('handles first update correctly', () => {
      performanceNowMock.mockReturnValue(1000);
      Time.update();

      // First update should use fixedDeltaTime instead of large jump
      expect(Time.deltaTime).toBe(Time.fixedDeltaTime);
    });

    it('tracks unscaledDeltaTime', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 2.0;

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.unscaledDeltaTime).toBeCloseTo(0.01667, 4);
      expect(Time.deltaTime).toBeCloseTo(0.03334, 4); // 2x time scale
    });

    it('caps deltaTime at maxDeltaTime', () => {
      Time.maxDeltaTime = 0.05;

      performanceNowMock.mockReturnValue(0);
      Time.update();

      // Simulate 1 second gap
      performanceNowMock.mockReturnValue(1000);
      Time.update();

      expect(Time.deltaTime).toBe(0.05);
      expect(Time.unscaledDeltaTime).toBe(0.05);
    });
  });

  describe('fixedDeltaTime for physics', () => {
    it('maintains fixed timestep value', () => {
      Time.fixedDeltaTime = 1 / 120;

      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.fixedDeltaTime).toBe(1 / 120);
    });

    it('is independent of variable frame rate', () => {
      const fixedDelta = 1 / 60;
      Time.fixedDeltaTime = fixedDelta;

      performanceNowMock.mockReturnValue(0);
      Time.update();

      // Fast frame
      performanceNowMock.mockReturnValue(8);
      Time.update();
      expect(Time.fixedDeltaTime).toBe(fixedDelta);

      // Slow frame
      performanceNowMock.mockReturnValue(50);
      Time.update();
      expect(Time.fixedDeltaTime).toBe(fixedDelta);
    });

    it('is used by fixed step iterator', () => {
      Time.fixedDeltaTime = 1 / 60;

      performanceNowMock.mockReturnValue(0);
      Time.update();

      // Simulate one fixed timestep worth of time
      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      let iterations = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations++;
      }

      expect(iterations).toBe(1);
    });
  });

  describe('unscaledDeltaTime', () => {
    it('is not affected by timeScale', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 0.5;

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.unscaledDeltaTime).toBeCloseTo(0.01667, 4);
      expect(Time.deltaTime).toBeCloseTo(0.008335, 4); // Half speed
    });

    it('tracks real elapsed time', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 0;

      performanceNowMock.mockReturnValue(100);
      Time.update();

      expect(Time.unscaledDeltaTime).toBe(0.1);
      expect(Time.deltaTime).toBe(0); // Paused
    });
  });

  describe('timeScale adjustment', () => {
    it('affects deltaTime', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 2.0;

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.deltaTime).toBeCloseTo(0.03334, 4); // 2x speed
    });

    it('can slow down time', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 0.5;

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.deltaTime).toBeCloseTo(0.008335, 4); // Half speed
    });

    it('can pause time', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 0;

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      expect(Time.deltaTime).toBe(0);
    });

    it('affects time accumulation', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 2.0;

      performanceNowMock.mockReturnValue(100);
      Time.update();

      // Time should advance at 2x speed
      expect(Time.time).toBeCloseTo(0.2, 4);
    });

    it('resets to 1.0 on reset', () => {
      Time.timeScale = 5.0;
      Time.reset();

      expect(Time.timeScale).toBe(1.0);
    });
  });

  describe('frameCount tracking', () => {
    it('increments each update', () => {
      expect(Time.frameCount).toBe(0);

      performanceNowMock.mockReturnValue(0);
      Time.update();
      expect(Time.frameCount).toBe(1);

      performanceNowMock.mockReturnValue(16.67);
      Time.update();
      expect(Time.frameCount).toBe(2);

      performanceNowMock.mockReturnValue(33.34);
      Time.update();
      expect(Time.frameCount).toBe(3);
    });

    it('is monotonically increasing', () => {
      const counts: number[] = [];

      for (let i = 0; i < 100; i++) {
        performanceNowMock.mockReturnValue(i * 16.67);
        Time.update();
        counts.push(Time.frameCount);
      }

      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBe(counts[i - 1] + 1);
      }
    });

    it('resets to 0 on reset', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();
      Time.update();
      Time.update();

      expect(Time.frameCount).toBe(3);

      Time.reset();

      expect(Time.frameCount).toBe(0);
    });
  });

  describe('time accumulation', () => {
    it('accumulates total time', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();
      expect(Time.time).toBe(0);

      performanceNowMock.mockReturnValue(100);
      Time.update();
      expect(Time.time).toBeCloseTo(0.1, 4);

      performanceNowMock.mockReturnValue(200);
      Time.update();
      expect(Time.time).toBeCloseTo(0.2, 4);
    });

    it('is affected by timeScale', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 2.0;

      performanceNowMock.mockReturnValue(100);
      Time.update();

      expect(Time.time).toBeCloseTo(0.2, 4); // 2x speed
    });

    it('pauses when timeScale is 0', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 0;

      performanceNowMock.mockReturnValue(100);
      Time.update();

      expect(Time.time).toBe(0);
    });

    it('resets to 0 on reset', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(1000);
      Time.update();

      expect(Time.time).toBeGreaterThan(0);

      Time.reset();

      expect(Time.time).toBe(0);
    });
  });

  describe('fixed step iterator', () => {
    it('yields correct number of iterations', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.fixedDeltaTime = 1 / 60;

      // Simulate 3 fixed timesteps worth of time
      performanceNowMock.mockReturnValue(50);
      Time.update();

      let iterations = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations++;
      }

      expect(iterations).toBe(3);
    });

    it('yields interpolation alpha', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.fixedDeltaTime = 1 / 60;

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      const alphas: number[] = [];
      for (const alpha of Time.getFixedStepIterator()) {
        alphas.push(alpha);
      }

      expect(alphas.length).toBeGreaterThan(0);
      for (const alpha of alphas) {
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    });

    it('respects maximum fixed steps', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.fixedDeltaTime = 1 / 60;

      // Simulate a very long frame (1 second)
      performanceNowMock.mockReturnValue(1000);
      Time.update();

      let iterations = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations++;
      }

      // Should cap at 8 iterations (MAX_FIXED_STEPS)
      expect(iterations).toBeLessThanOrEqual(8);
    });

    it('handles partial accumulation', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.fixedDeltaTime = 1 / 60;

      // Simulate half a timestep
      performanceNowMock.mockReturnValue(8);
      Time.update();

      let iterations = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations++;
      }

      expect(iterations).toBe(0);
    });

    it('accumulates partial time across updates', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.fixedDeltaTime = 1 / 60;

      // First update: half timestep
      performanceNowMock.mockReturnValue(8);
      Time.update();

      let iterations1 = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations1++;
      }
      expect(iterations1).toBe(0);

      // Second update: another half timestep
      performanceNowMock.mockReturnValue(17);
      Time.update();

      let iterations2 = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations2++;
      }
      expect(iterations2).toBe(1); // Now we have enough accumulated time
    });

    it('updates fixedStepCount', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.fixedDeltaTime = 1 / 60;

      performanceNowMock.mockReturnValue(50);
      Time.update();

      let count = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        count++;
      }

      expect(Time.fixedStepCount).toBe(count);
    });
  });

  describe('reset', () => {
    it('resets all timing values', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 2.0;

      performanceNowMock.mockReturnValue(1000);
      Time.update();
      Time.update();

      Time.reset();

      expect(Time.deltaTime).toBe(0);
      expect(Time.unscaledDeltaTime).toBe(0);
      expect(Time.time).toBe(0);
      expect(Time.frameCount).toBe(0);
      expect(Time.fixedTime).toBe(0);
      expect(Time.fixedStepCount).toBe(0);
      expect(Time.timeScale).toBe(1);
    });

    it('can be called multiple times', () => {
      Time.reset();
      Time.reset();

      expect(Time.frameCount).toBe(0);
    });

    it('prepares for new updates', () => {
      performanceNowMock.mockReturnValue(1000);
      Time.update();

      Time.reset();

      performanceNowMock.mockReturnValue(2000);
      Time.update();

      // Should use fixedDeltaTime for first update after reset
      expect(Time.deltaTime).toBe(Time.fixedDeltaTime);
    });
  });

  describe('visibility change handling', () => {
    it('resets timing when page becomes visible', () => {
      // Mock document.hidden
      Object.defineProperty(document, 'hidden', {
        writable: true,
        configurable: true,
        value: true,
      });

      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(1000);

      // Simulate page becoming visible
      Object.defineProperty(document, 'hidden', {
        writable: true,
        configurable: true,
        value: false,
      });

      Time.handleVisibilityChange();

      // Next update should not have huge delta
      performanceNowMock.mockReturnValue(2000);
      Time.update();

      // Delta should be reasonable, not 1 second
      expect(Time.deltaTime).toBeLessThan(0.1);
    });

    it('does nothing when page is hidden', () => {
      Object.defineProperty(document, 'hidden', {
        writable: true,
        configurable: true,
        value: true,
      });

      performanceNowMock.mockReturnValue(1000);
      Time.handleVisibilityChange();

      // Should not throw or cause issues
      expect(Time.frameCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles zero time scale', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 0;

      performanceNowMock.mockReturnValue(100);
      Time.update();

      expect(Time.deltaTime).toBe(0);
      expect(Time.time).toBe(0);
    });

    it('handles negative time scale', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = -1;

      performanceNowMock.mockReturnValue(100);
      Time.update();

      expect(Time.deltaTime).toBeLessThan(0);
    });

    it('handles very large time scale', () => {
      performanceNowMock.mockReturnValue(0);
      Time.update();

      Time.timeScale = 1000;

      performanceNowMock.mockReturnValue(1);
      Time.update();

      expect(Time.deltaTime).toBeGreaterThan(0);
    });

    it('handles very small fixed delta time', () => {
      Time.fixedDeltaTime = 0.001;

      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(16.67);
      Time.update();

      let iterations = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations++;
        if (iterations > 100) break; // Safety limit for test
      }

      expect(iterations).toBeLessThanOrEqual(8); // Should still respect MAX_FIXED_STEPS
    });

    it('handles very large fixed delta time', () => {
      Time.fixedDeltaTime = 1.0; // 1 second timestep

      performanceNowMock.mockReturnValue(0);
      Time.update();

      performanceNowMock.mockReturnValue(100);
      Time.update();

      let iterations = 0;
      for (const _alpha of Time.getFixedStepIterator()) {
        iterations++;
      }

      expect(iterations).toBe(0); // Not enough time for even one step
    });
  });
});
