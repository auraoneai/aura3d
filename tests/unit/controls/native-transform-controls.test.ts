import { describe, expect, it } from "vitest";
import { ControlVector3, TransformControls } from "../../../packages/controls/src";

describe("TransformControls explicit deltas", () => {
  it("adds translate, rotate, and scale deltas to the corresponding attached-object properties", () => {
    const object = {
      position: new ControlVector3(0, 0, -5),
      rotation: new ControlVector3(0, 0, 0),
      scale: new ControlVector3(1, 1, 1)
    };
    const controls = new TransformControls();
    controls.attach(object);

    controls.setMode("translate");
    controls.apply(new ControlVector3(0.25, 0.5, -0.1));
    expectVector(object.position, [0.25, 0.5, -5.1]);
    expectVector(object.rotation, [0, 0, 0]);
    expectVector(object.scale, [1, 1, 1]);

    controls.setMode("rotate");
    controls.apply(new ControlVector3(0, 0.35, 0));
    expectVector(object.position, [0.25, 0.5, -5.1]);
    expectVector(object.rotation, [0, 0.35, 0]);
    expectVector(object.scale, [1, 1, 1]);

    controls.setMode("scale");
    controls.apply(new ControlVector3(0.2, 0.1, 0.3));
    expectVector(object.position, [0.25, 0.5, -5.1]);
    expectVector(object.rotation, [0, 0.35, 0]);
    expectVector(object.scale, [1.2, 1.1, 1.3]);

    controls.detach();
    for (const mode of ["translate", "rotate", "scale"] as const) {
      controls.setMode(mode);
      controls.apply(new ControlVector3(1, 1, 1));
    }
    expectVector(object.position, [0.25, 0.5, -5.1]);
    expectVector(object.rotation, [0, 0.35, 0]);
    expectVector(object.scale, [1.2, 1.1, 1.3]);
  });
});

function expectVector(actual: ControlVector3, expected: [number, number, number]): void {
  expect(actual.x).toBeCloseTo(expected[0]);
  expect(actual.y).toBeCloseTo(expected[1]);
  expect(actual.z).toBeCloseTo(expected[2]);
}
