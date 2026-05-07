import { describe, expect, it } from "vitest";
import { UniformLayout } from "../../../packages/rendering/src";

describe("UniformLayout", () => {
  it("packs scalar, vector, and matrix fields with 16-byte alignment", () => {
    const layout = new UniformLayout([
      { name: "count", type: "float" },
      { name: "color", type: "vec4" },
      { name: "matrix", type: "mat4" }
    ]);

    expect(layout.getField("count").offset).toBe(0);
    expect(layout.getField("color").offset).toBe(16);
    expect(layout.getField("matrix").offset).toBe(32);
    expect(layout.byteLength).toBe(96);
    expect(Array.from(layout.pack({
      count: 2,
      color: [0.1, 0.2, 0.3, 1],
      matrix: identityMatrix()
    }).slice(0, 12)).map(round3)).toEqual([
      2, 0, 0, 0,
      0.1, 0.2, 0.3, 1,
      1, 0, 0, 0
    ]);
  });

  it("packs uniform arrays at their declared padded GPU stride", () => {
    const layout = new UniformLayout([
      { name: "weights", type: "float", arrayLength: 3 },
      { name: "directions", type: "vec3", arrayLength: 2 },
      { name: "tail", type: "vec2" }
    ]);

    expect(layout.getField("weights")).toMatchObject({ offset: 0, byteLength: 48, alignment: 16 });
    expect(layout.getField("directions")).toMatchObject({ offset: 48, byteLength: 32, alignment: 16 });
    expect(layout.getField("tail")).toMatchObject({ offset: 80, byteLength: 8, alignment: 8 });
    expect(layout.byteLength).toBe(96);

    const packed = layout.pack({
      weights: [1, 2, 3],
      directions: [4, 5, 6, 7, 8, 9],
      tail: [10, 11]
    });

    expect(Array.from(packed)).toEqual([
      1, 0, 0, 0,
      2, 0, 0, 0,
      3, 0, 0, 0,
      4, 5, 6, 0,
      7, 8, 9, 0,
      10, 11, 0, 0
    ]);
  });

  it("rejects missing, wrong-sized, and non-finite uniform values", () => {
    const layout = new UniformLayout([{ name: "color", type: "vec4" }]);

    expect(() => layout.pack({})).toThrow(/Missing uniform value for color/);
    expect(() => layout.pack({ color: [1, 0, 0] })).toThrow(/requires 4 scalar values, got 3/);
    expect(() => layout.pack({ color: [1, 0, Number.NaN, 1] })).toThrow(/must contain finite values/);
  });
});

function identityMatrix(): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
