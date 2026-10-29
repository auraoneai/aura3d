import { describe, expect, it } from "vitest";
import { Clock } from "../../../packages/engine/src/agent-api/Clock";

// three.js Clock parity: start() resets elapsedTime to 0, `new Clock(false)` is the autoStart flag.
const withNow = (fn: (set: (ms: number) => void) => void): void => {
  const real = performance.now.bind(performance);
  let nowMs = 1000;
  performance.now = () => nowMs;
  try {
    fn((ms) => {
      nowMs = ms;
    });
  } finally {
    performance.now = real;
  }
};

describe("Clock three.js parity", () => {
  it("start() after stop() restarts elapsedTime from 0", () => {
    withNow((set) => {
      const clock = new Clock();
      clock.start();
      set(1500);
      expect(clock.getElapsedTime()).toBeCloseTo(0.5, 9);
      clock.stop();
      set(2600);
      clock.start();
      set(2700);
      expect(clock.getElapsedTime()).toBeCloseTo(0.1, 9);
      expect(clock.elapsedTime).toBeCloseTo(0.1, 9);
    });
  });

  it("accepts three's autoStart boolean", () => {
    withNow((set) => {
      const manual = new Clock(false);
      expect(manual.running).toBe(false);
      set(1100);
      expect(manual.getDelta()).toBe(0);
      expect(manual.running).toBe(false);
      manual.start();
      set(1300);
      expect(manual.getDelta()).toBeCloseTo(0.2, 9);
    });
  });
});

describe("Clock.stop() three.js parity (anim-phys-05)", () => {
  it("stop() keeps the time up to the stop, stays stopped, and loses nothing", () => {
    withNow((set) => {
      // three r185: start at 0, stop at 2.5 s, read at 5 s -> 2.5, running false, 2.5.
      set(0);
      const clock = new Clock();
      clock.start();
      set(2000);
      expect(clock.getElapsedTime()).toBeCloseTo(2, 9);
      set(2500);
      clock.stop();
      expect(clock.elapsedTime).toBeCloseTo(2.5, 9);
      expect(clock.running).toBe(false);
      expect(clock.autoStart).toBe(false);
      set(5000);
      expect(clock.getElapsedTime()).toBeCloseTo(2.5, 9);
      expect(clock.getDelta()).toBe(0);
      expect(clock.running).toBe(false);
    });
  });

  it("a never-started autoStart clock still starts on its first read", () => {
    withNow((set) => {
      const clock = new Clock();
      expect(clock.getDelta()).toBe(0);
      expect(clock.running).toBe(true);
      set(1250);
      expect(clock.getDelta()).toBeCloseTo(0.25, 9);
    });
  });
});
