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
