import { describe, expect, it } from "vitest";
import { composeWorldMatrix, parseAuraColor, eulerToQuaternion } from "@aura3d/engine/contracts";

describe("C-06 scene graph", () => {
  const I = Float32Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  it("identity parents give identity local transform", () => {
    const m = composeWorldMatrix(I, {} as never, new Float32Array(16));
    expect(Array.from(m)).toEqual(Array.from(I));
  });
  it("translation lands in m[12..14]", () => {
    const m = composeWorldMatrix(I, { position: [1, 2, 3] } as never, new Float32Array(16));
    expect([m[12], m[13], m[14]]).toEqual([1, 2, 3]);
  });
  it("eulerToQuaternion zero angles is identity", () => {
    const q = eulerToQuaternion([0, 0, 0], "XYZ");
    expect(q[3]).toBeCloseTo(1, 6);
    expect(q[0] + q[1] + q[2]).toBeCloseTo(0, 6);
  });
  it("parseAuraColor hex returns rgba", () => {
    expect(parseAuraColor("#ff0000")).toEqual([1, 0, 0, 1]);
  });
});
