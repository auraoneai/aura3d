import { describe, expect, it } from "vitest";
import {
  completeHole,
  isHoleFailed,
  roundTotals,
  starsFor,
  strokeLimit,
  versusPar
} from "../../../apps/showcase-siege-golf/src/score";
import { canonicalShotInput, launchSpeed, pointerShot } from "../../../apps/showcase-siege-golf/src/shot";

/** PRD scoring law pins (SG-07 thresholds + SG-12 round math). */

describe("siege golf star ratings", () => {
  it("awards three stars at or under par", () => {
    expect(starsFor(2, 2)).toBe(3);
    expect(starsFor(1, 2)).toBe(3);
  });

  it("awards two stars up to par plus two", () => {
    expect(starsFor(3, 2)).toBe(2);
    expect(starsFor(4, 2)).toBe(2);
  });

  it("awards one star beyond par plus two", () => {
    expect(starsFor(5, 2)).toBe(1);
    expect(starsFor(9, 2)).toBe(1);
  });
});

describe("siege golf stroke limit", () => {
  it("is par plus four", () => {
    expect(strokeLimit(2)).toBe(6);
    expect(strokeLimit(5)).toBe(9);
  });

  it("fails exactly past the limit", () => {
    expect(isHoleFailed(6, 2)).toBe(false);
    expect(isHoleFailed(7, 2)).toBe(true);
  });
});

describe("siege golf hole completion", () => {
  it("records stars on completion", () => {
    const entry = completeHole({ holeIndex: 0, par: 3, strokes: 3 });
    expect(entry.strokes).toBe(3);
    expect(entry.stars).toBe(3);
  });

  it("refuses to complete a failed hole", () => {
    expect(() => completeHole({ holeIndex: 0, par: 2, strokes: 7 })).toThrow();
  });

  it("refuses incomplete entries", () => {
    expect(() => completeHole({ holeIndex: 0, par: 2, strokes: undefined })).toThrow();
  });
});

describe("siege golf round totals", () => {
  it("sums strokes and stars across a mixed round", () => {
    const totals = roundTotals([
      { holeIndex: 0, par: 2, strokes: 2 },   // 3 stars
      { holeIndex: 1, par: 3, strokes: 4 },   // 2 stars
      { holeIndex: 2, par: 3, strokes: 8 },   // failed, 0 stars
      { holeIndex: 3, par: 4, strokes: undefined } // in progress
    ]);
    expect(totals.totalStrokes).toBe(14);
    expect(totals.totalPar).toBe(8);
    expect(totals.totalStars).toBe(5);
    expect(totals.maxStars).toBe(9);
    expect(totals.holesCompleted).toBe(2);
    expect(totals.holesFailed).toBe(1);
  });

  it("labels versus-par scores", () => {
    expect(versusPar(3, 3)).toBe("E");
    expect(versusPar(2, 3)).toBe("-1");
    expect(versusPar(6, 3)).toBe("+3");
  });
});

describe("siege golf shot contract", () => {
  it("normalizes aim vectors through the live mini-golf kit", () => {
    const canonical = canonicalShotInput([0.3, -0.9], 1.4)!;
    const length = Math.hypot(canonical.vector[0], canonical.vector[1]);
    expect(length).toBeCloseTo(1, 5);
  });

  it("rejects non-finite or non-positive input", () => {
    expect(canonicalShotInput([Number.NaN, -1], 1)).toBeNull();
    expect(canonicalShotInput([0, -1], 0)).toBeNull();
    expect(canonicalShotInput([0, -1], -2)).toBeNull();
  });

  it("maps power to launch speed per the kit impulse law", () => {
    expect(launchSpeed(1)).toBeCloseTo(1 * 0.32 / 0.045, 6);
    expect(launchSpeed(2.4)).toBeCloseTo(2.4 * 0.32 / 0.045, 6);
  });

  it("ignores sub-drag-threshold pointer gestures via the kit mapping", () => {
    expect(pointerShot({ x: 100, y: 100 }, { x: 101, y: 101 })).toBeNull();
  });
});
