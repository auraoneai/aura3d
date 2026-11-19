import { describe, expect, it } from "vitest";
import { detectLimbFlips } from "../../../packages/animation/src/pose/Retarget";

function quatY(deg: number): number[] {
  const h = (deg * Math.PI) / 360;
  return [0, Math.sin(h), 0, Math.cos(h)];
}
function clip(...angles: number[]) {
  const values = new Float32Array(angles.flatMap(quatY));
  return { tracks: [{ target: "bone_7.rotation", valueType: "quaternion", keyframeCount: angles.length, values }] } as never;
}

describe("detectLimbFlips", () => {
  it("reports a jump between adjacent keyframes larger than the threshold", () => {
    const flips = detectLimbFlips(clip(0, 150), 120);
    expect(flips).toHaveLength(1);
    expect(flips[0]!.degrees).toBeCloseTo(150, 0);
  });

  it("does not report smooth motion below the threshold", () => {
    expect(detectLimbFlips(clip(0, 30, 60, 90), 120)).toHaveLength(0);
  });

  it("treats q and -q as the same rotation (shortest arc)", () => {
    const values = new Float32Array([...quatY(10), ...quatY(10).map((v) => -v)]);
    const c = { tracks: [{ target: "b", valueType: "quaternion", keyframeCount: 2, values }] } as never;
    expect(detectLimbFlips(c, 120)).toHaveLength(0);
  });
});
