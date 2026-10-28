import { describe, expect, it } from "vitest";
import { Vector3 } from "../../../packages/math/src/index";
import { SphericalHarmonics3 } from "../../../packages/math/src/SphericalHarmonics3";
import { Path, Shape } from "../../../packages/math/src/index";
import { shapeParityMesh } from "../../../packages/rendering/src/geometry/Shape";

describe("SphericalHarmonics3.getBasisAt(normal, target)", () => {
  it("fills and returns the out-parameter like three", () => {
    const target: number[] = [];
    const normal = new Vector3(0.3, 0.8, -0.5).normalize();
    const result = SphericalHarmonics3.getBasisAt(normal, target);
    expect(result).toBe(target);
    expect(target).toHaveLength(9);
    expect(target[0]).toBeCloseTo(0.282095, 6);
    expect(SphericalHarmonics3.getBasisAt(normal)).toEqual(target);
    expect(new SphericalHarmonics3().getBasisAt(normal, [])).toEqual(target);
  });
});

describe("shapeParityMesh drops the repeated closing vertex like three's ShapeUtils", () => {
  it("emits 9 vertices for a closed pentagon with a closed square hole", () => {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(4, 0);
    shape.lineTo(4, 3);
    shape.lineTo(2, 4.5);
    shape.lineTo(0, 3);
    shape.lineTo(0, 0);
    const hole = new Path();
    hole.moveTo(1, 1);
    hole.lineTo(1, 2);
    hole.lineTo(2, 2);
    hole.lineTo(2, 1);
    hole.lineTo(1, 1);
    shape.holes.push(hole);
    const mesh = shapeParityMesh({ shape });
    expect(mesh.positions.length / 3).toBe(9);
    expect(mesh.indices).toHaveLength(27);
    expect(Math.max(...(mesh.indices ?? []))).toBe(8);
  });
});
