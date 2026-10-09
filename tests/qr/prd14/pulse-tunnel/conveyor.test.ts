// tests/qr/prd14/pulse-tunnel/conveyor.test.ts — §14.4 segment conveyor:
// recycling keeps ≤ N live segments (N = the tier's segment budget). The
// pool is created full and only ever recycles entries in place.
import { describe, expect, it } from "vitest";
import {
  createPulseConveyor,
  PULSE_CONVEYOR_BUDGET
} from "../../../../apps/showcase-pulse-tunnel/src/gameplay/conveyor";

const spec = (liveCount: number) => ({
  segmentLength: 1.35,
  liveCount,
  headZ: -14.6,
  recycleZ: 1.6,
  y: 0.32,
  scale: [1.94, 1.48, 1] as const
});

describe("pulse-tunnel segment conveyor (§14.4)", () => {
  it("never exceeds N live segments while recycling over a long run", () => {
    const n = PULSE_CONVEYOR_BUDGET.high;
    const conveyor = createPulseConveyor(spec(n));
    expect(conveyor.segments.length).toBe(n);
    // Simulate ~400 m of streaming (≈29 s at gate speed 14).
    for (let step = 0; step < 4000; step += 1) {
      conveyor.advance(0.1);
      expect(conveyor.segments.length).toBeLessThanOrEqual(n);
      for (const segment of conveyor.segments) {
        expect(segment.position[2]).toBeLessThanOrEqual(1.6);
        expect(segment.position[2]).toBeGreaterThan(1.6 - n * 1.35);
      }
    }
    expect(conveyor.travelled).toBeCloseTo(400, 5);
  });

  it("wraps a hoop past the player plane back to the far end", () => {
    const conveyor = createPulseConveyor(spec(4));
    const first = conveyor.segments[0]!;
    // Push the leading hoop just past recycleZ.
    conveyor.advance(1.6 - (-14.6) + 0.3);
    expect(first.position[2]).toBeLessThanOrEqual(1.6);
    expect(first.position[2]).toBeGreaterThan(1.6 - 4 * 1.35);
    // The hoop re-entered at the far end, behind the head.
    expect(first.position[2]).toBeLessThan(conveyor.segments[3]!.position[2]);
  });

  it("keeps the band covering the whole tunnel view", () => {
    const n = PULSE_CONVEYOR_BUDGET.low;
    const conveyor = createPulseConveyor(spec(n));
    conveyor.advance(123.4);
    const zs = conveyor.segments.map((s) => s.position[2]).sort((a, b) => a - b);
    // Every neighbour gap stays at one segmentLength — the band has no holes.
    for (let i = 1; i < zs.length; i += 1) {
      expect(zs[i]! - zs[i - 1]!).toBeCloseTo(1.35, 5);
    }
  });
});
