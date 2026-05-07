import { describe, expect, it } from "vitest";
import { ShadowProjectionBuilder, type Bounds3 } from "../../../packages/rendering/src";

describe("ShadowProjectionBuilder", () => {
  it("projects caster bounds onto a receiver plane with stable hull bounds", () => {
    const casterBounds: Bounds3 = {
      min: [-0.5, 1, -0.5],
      max: [0.5, 2, 0.5]
    };

    const projection = new ShadowProjectionBuilder().projectBounds({
      casterBounds,
      lightDirection: [-0.5, -1, -0.25],
      receiverPlaneY: 0
    });

    expect(projection.points.length).toBeGreaterThanOrEqual(4);
    expect(projection.bounds.min[1]).toBe(0);
    expect(projection.bounds.max[1]).toBe(0);
    expect(projection.bounds.min[0]).toBeLessThan(casterBounds.min[0]);
    expect(projection.bounds.min[2]).toBeLessThan(casterBounds.min[2]);
  });

  it("rejects invalid light directions instead of producing unstable shadow coordinates", () => {
    const casterBounds: Bounds3 = {
      min: [-0.5, 1, -0.5],
      max: [0.5, 2, 0.5]
    };

    expect(() =>
      new ShadowProjectionBuilder().projectBounds({
        casterBounds,
        lightDirection: [1, 0, 0]
      })
    ).toThrow(/intersects the receiver plane/);
  });
});
