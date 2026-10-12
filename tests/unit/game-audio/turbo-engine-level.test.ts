import { describe, expect, it } from "vitest";
import {
  TURBO_ENGINE_IDLE_RATE,
  TURBO_ENGINE_MAX_RATE,
  turboEngineLevel
} from "../../../apps/showcase-turbo-drift-circuit/src/legacy/turbo-audio";

describe("turbo engine loop follows the car", () => {
  it("idles quietly when parked and rises monotonically with speed and throttle", () => {
    const idle = turboEngineLevel(0, 0);
    expect(idle).toBeLessThanOrEqual(0.15); // ≥ 16 dB under the authored level
    let prev = idle;
    for (let v = 0.1; v <= 1.0001; v += 0.1) {
      const level = turboEngineLevel(v, 0);
      expect(level).toBeGreaterThan(prev);
      expect(turboEngineLevel(v, 1)).toBeGreaterThan(level);
      prev = level;
    }
    expect(turboEngineLevel(1, 1)).toBeLessThanOrEqual(1);
    expect(TURBO_ENGINE_MAX_RATE / TURBO_ENGINE_IDLE_RATE).toBeGreaterThan(2);
  });
});
