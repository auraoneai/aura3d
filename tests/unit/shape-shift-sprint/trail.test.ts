import { describe, expect, it } from "vitest";
import { Batch } from "../../../examples/shared/runner-kit/index";
import { confettiMesh } from "../../../apps/showcase-shape-shift-sprint/src/meshes";
import { advanceTrailChip, trailChipScale, type TrailChip } from "../../../apps/showcase-shape-shift-sprint/src/world";

const chip = (life: number): TrailChip => ({ life, x: 0, y: 0.4, z: 0, vx: 0.3, vy: 1.5, vz: 6, spin: 0, color: 0 });

/** Normals `Batch.place` writes for one confetti chip at `scale` (the batch `flush` rejects non-finite values). */
function placedNormals(scale: number): Float32Array {
  const batch = new Batch(confettiMesh(), 1, [1, 1, 1]);
  batch.place(0, 0, 0, 0, 0.7, scale, scale, scale);
  return batch.normals;
}

describe("Shape Shift Sprint confetti trail", () => {
  it("a zero scale is what made Batch.place write NaN normals (the autopilot RangeError)", () => {
    expect(Array.from(placedNormals(0)).some((n) => !Number.isFinite(n))).toBe(true);
  });

  it("retires a chip whose life reaches exactly zero instead of drawing it at scale 0", () => {
    const c = chip(0.1);
    expect(advanceTrailChip(c, 0.1)).toBe(false);
    expect(advanceTrailChip(chip(0.05), 0.1)).toBe(false);
  });

  it("every chip that stays alive gets a positive scale and finite normals, for 1/60 s and clamped 0.1 s steps", () => {
    for (const dt of [1 / 60, 1 / 30, 0.1, 0.0333]) {
      const c = chip(0.8);
      let frames = 0;
      while (advanceTrailChip(c, dt)) {
        const scale = trailChipScale(c.life);
        expect(scale).toBeGreaterThan(0);
        expect(Array.from(placedNormals(scale)).every(Number.isFinite)).toBe(true);
        frames++;
      }
      expect(frames).toBeGreaterThan(0);
      expect(c.life).toBeLessThanOrEqual(0);
    }
  });

  it("keeps the trail look: full size until the last 0.3 s", () => {
    expect(trailChipScale(0.8)).toBeCloseTo(0.12);
    expect(trailChipScale(0.15)).toBeCloseTo(0.06);
    expect(trailChipScale(1e-18)).toBe(1e-3);
  });
});
