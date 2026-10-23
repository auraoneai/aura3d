import { describe, expect, it } from "vitest";
import { chimeNotes, engineFreq, engineGain, rushGain, squealGain } from "../../../examples/drift-and-deliver-port/audio";

describe("procedural audio mapping", () => {
  it("the engine note rises with speed and under nitro, and is bounded", () => {
    expect(engineFreq(0, false)).toBe(46);
    expect(engineFreq(30, false)).toBeGreaterThan(engineFreq(10, false));
    expect(engineFreq(30, true)).toBeGreaterThan(engineFreq(30, false));
    expect(engineFreq(500, false)).toBe(engineFreq(60, false));
    expect(engineFreq(-30, false)).toBe(engineFreq(30, false));
  });

  it("is louder with speed and throttle but never clips", () => {
    expect(engineGain(60, true)).toBeGreaterThan(engineGain(0, false));
    expect(engineGain(60, true)).toBeLessThan(0.2);
  });

  it("only squeals while drifting and only rushes under nitro", () => {
    expect(squealGain(false, 40)).toBe(0);
    expect(squealGain(true, 40)).toBeGreaterThan(squealGain(true, 5));
    expect(squealGain(true, 500)).toBeLessThanOrEqual(0.11);
    expect(rushGain(false, 40)).toBe(0);
    expect(rushGain(true, 40)).toBeGreaterThan(0);
    expect(rushGain(true, 500)).toBeLessThanOrEqual(0.1);
  });

  it("chimes climb with the streak and differ by pickup", () => {
    expect(chimeNotes("coin", 1)).toHaveLength(2);
    expect(chimeNotes("star", 1)).toHaveLength(4);
    expect(chimeNotes("heart", 1)).toHaveLength(2);
    expect(chimeNotes("coin", 8)[0]).toBeGreaterThan(chimeNotes("coin", 1)[0]!);
    expect(chimeNotes("coin", 40)[0]).toBe(chimeNotes("coin", 8)[0]);
  });
});
