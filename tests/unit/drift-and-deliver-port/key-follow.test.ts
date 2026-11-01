import { describe, expect, it } from "vitest";
import { followHeading, turnKey } from "../../../examples/drift-and-deliver-port/daylight";

describe("drift-and-deliver-port key follow (GU47 phase 4)", () => {
  it("leaves the authored key alone at heading 0 and turns it with the courier", () => {
    const d = [0, -0.6, 0.8] as const;
    expect(turnKey(d, 0)).toEqual([0, -0.6, 0.8]);
    const q = turnKey(d, Math.PI / 2);
    expect(q[0]).toBeCloseTo(0.8);
    expect(q[1]).toBeCloseTo(-0.6);
    expect(q[2]).toBeCloseTo(0);
  });

  it("eases toward the car heading along the shortest arc and settles", () => {
    let h = 0;
    for (let i = 0; i < 1800; i++) h = followHeading(h, Math.PI / 2, 1 / 60);
    expect(h).toBeCloseTo(Math.PI / 2, 2);
    const wrap = followHeading(3.1, -3.1, 0.1);
    expect(wrap).toBeGreaterThan(3.1);
    expect(followHeading(1, 1, 0.016)).toBe(1);
  });
});
