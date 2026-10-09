/**
 * PRD-06 06-QXX (Q-XX, qr-requests-prd06.md:171-188) — every joint of a
 * `Skeleton.matrixPalette()` built from affine inputs must itself be affine:
 * elements 3, 7, 11 of each 16-float column-major block are 0 and element 15
 * is 1. `Keyframe.multiplyMat4` previously computed B·A (row-major read),
 * which surfaced as `(unit-3, 0.5–1.4)` garbage in `renderable.skinning
 * .matrices` row 3 in-browser. Also pins the multiply to the canonical
 * `@aura3d/scene` convention on arbitrary matrices.
 */
import { describe, expect, it } from "vitest";
import { Skeleton } from "../../../../packages/animation/src/Skeleton.js";
import { multiplyMat4 } from "../../../../packages/animation/src/Keyframe.js";
import { multiplyMat4 as canonicalMultiplyMat4 } from "@aura3d/scene/math";

const SQ = Math.SQRT1_2;

function boneChain() {
  return new Skeleton([
    { name: "hips", parentIndex: -1, translation: [0, 1, 0], rotation: [0, 0, 0, 1] },
    { name: "spine", parentIndex: 0, translation: [0, 0.25, 0], rotation: [0, SQ, 0, SQ] },
    { name: "arm.L", parentIndex: 1, translation: [0.1, 0.2, 0], rotation: [SQ, 0, 0, SQ], scale: [1.2, 1.2, 1.2] },
    { name: "arm.L.fk", parentIndex: 2, translation: [0.3, 0, 0], rotation: [0, 0, SQ, SQ] },
    { name: "leg.R", parentIndex: 0, translation: [-0.1, -0.4, 0], rotation: [0, 0, 0, 1] }
  ]);
}

describe("matrixPalette affine row 3 (06-QXX)", () => {
  it("every palette joint is affine: row 3 == (0,0,0,1)", () => {
    const palette = boneChain().matrixPalette();
    for (let j = 0; j < palette.length; j += 1) {
      const m = palette[j]!;
      expect(m[3], `joint ${j} [3]`).toBe(0);
      expect(m[7], `joint ${j} [7]`).toBe(0);
      expect(m[11], `joint ${j} [11]`).toBe(0);
      expect(m[15], `joint ${j} [15]`).toBe(1);
    }
  });

  it("worldMatrices chain is affine and hierarchical (parent · local)", () => {
    const worlds = boneChain().worldMatrices();
    for (const m of worlds) {
      expect(m[3]).toBe(0);
      expect(m[7]).toBe(0);
      expect(m[11]).toBe(0);
      expect(m[15]).toBe(1);
    }
    // arm.L world translation must be the parent's rotated composite, not
    // the raw local offset — catches operand-order regressions.
    const armWorld = worlds[2]!;
    expect(Math.abs(armWorld[12]!)).toBeGreaterThan(1e-6);
  });

  it("multiplyMat4 matches the canonical scene convention", () => {
    let s = 0x06a11;
    const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
    for (let i = 0; i < 50; i += 1) {
      const a = Array.from({ length: 16 }, () => rng() * 8 - 4);
      const b = Array.from({ length: 16 }, () => rng() * 8 - 4);
      const key = multiplyMat4(a as never, b as never);
      const canonical = canonicalMultiplyMat4(a as never, b as never);
      for (let k = 0; k < 16; k += 1) {
        expect(key[k]!, `sample ${i} [${k}]`).toBeCloseTo(canonical[k]!, 6);
      }
    }
  });
});
