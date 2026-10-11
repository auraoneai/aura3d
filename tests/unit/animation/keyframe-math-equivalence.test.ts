import { describe, expect, it } from "vitest";
import {
  composeMat4 as composeMat4Keyframe,
  multiplyMat4 as multiplyMat4Keyframe,
  normalizeQuat as normalizeQuatKeyframe,
  type Mat4 as KeyframeMat4,
  type Quat as KeyframeQuat,
  type Vec3 as KeyframeVec3
} from "@aura3d/animation";
import {
  composeMat4 as composeMat4Canonical,
  multiplyMat4 as multiplyMat4Canonical,
  normalizeQuat as normalizeQuatCanonical
} from "@aura3d/scene/math";

// PRD-15 T6.8 / Q-06-3 property test: packages/animation/src/Keyframe.ts carries a
// hand-rolled copy of the TRS matrix math that @aura3d/scene/math owns canonically.
// 1,000 random TRS inputs must agree within 1e-6 before lane 06 may re-point the
// Keyframe helpers at the canonical module.
//
// DIVERGENCE RESOLVED (06-QXX): Keyframe.multiplyMat4 previously used
// row-major indexing over a column-major layout, computing B·A. Its only
// callers — Skeleton.worldMatrices/matrixPalette — intend A·B
// (parent·local, world·inverseBind), so the writer was fixed to
// column-major A·B rather than preserving operand order with a swap.
const TOLERANCE = 1e-6;
const SAMPLES = 1_000;

// Deterministic LCG so the property set is identical on every run.
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function expectClose(actual: readonly number[], expected: readonly number[], label: string): void {
  expect(actual.length, `${label} length`).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    const delta = Math.abs((actual[i] ?? 0) - (expected[i] ?? 0));
    expect(delta, `${label}[${i}]`).toBeLessThanOrEqual(TOLERANCE);
  }
}

describe("Keyframe math vs @aura3d/scene/math (Q-06-3)", () => {
  it("composeMat4/multiplyMat4/normalizeQuat agree within 1e-6 over 1,000 random TRS inputs", () => {
    const rng = makeRng(0x15a06);
    const rand = (lo: number, hi: number): number => lo + rng() * (hi - lo);
    for (let i = 0; i < SAMPLES; i += 1) {
      const t: KeyframeVec3 = [rand(-50, 50), rand(-50, 50), rand(-50, 50)];
      const q: KeyframeQuat = [rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(-1, 1)];
      const s: KeyframeVec3 = [rand(0.01, 8), rand(0.01, 8), rand(0.01, 8)];

      const keyComposed = composeMat4Keyframe(t, q, s);
      const canonicalComposed = composeMat4Canonical(t, q, s);
      expectClose(keyComposed, canonicalComposed, `composeMat4 sample ${i}`);

      const keyQ = normalizeQuatKeyframe(q);
      const canonicalQ = normalizeQuatCanonical(q);
      expectClose(keyQ, canonicalQ, `normalizeQuat sample ${i}`);

      const a: KeyframeMat4 = Array.from({ length: 16 }, () => rand(-4, 4)) as unknown as KeyframeMat4;
      const b: KeyframeMat4 = Array.from({ length: 16 }, () => rand(-4, 4)) as unknown as KeyframeMat4;
      // Keyframe now computes A·B in column-major, matching the canonical
      // convention element-for-tolerance.
      expectClose(multiplyMat4Keyframe(a, b), multiplyMat4Canonical(a, b), `multiplyMat4 sample ${i}`);
    }
  });
});
