import { describe, expect, it } from "vitest";
import {
  computePerspectiveCameraFrame,
  createStereoCameraRig
} from "../../../packages/rendering/src";

describe("StereoCameraRig", () => {
  it("creates side-by-side left and right eye view-projection matrices", () => {
    const frame = computePerspectiveCameraFrame({
      min: [-1, -1, -1],
      max: [1, 1, 1]
    }, {
      width: 1280,
      height: 720
    });

    const rig = createStereoCameraRig({
      frame,
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      eyeSeparation: 0.064,
      convergenceDistance: 8
    });

    const [left, right] = rig.views;
    expect(rig.layout).toBe("side-by-side");
    expect(rig.eyeSeparation).toBeCloseTo(0.064);
    expect(left.eye).toBe("left");
    expect(right.eye).toBe("right");
    expect(left.viewport).toEqual({ x: 0, y: 0, width: 640, height: 720 });
    expect(right.viewport).toEqual({ x: 640, y: 0, width: 640, height: 720 });
    expect(right.cameraPosition[0] - left.cameraPosition[0]).toBeCloseTo(0.064);
    expect(left.projectionMatrix[8]).toBeLessThan(frame.projectionMatrix[8]);
    expect(right.projectionMatrix[8]).toBeGreaterThan(frame.projectionMatrix[8]);
    expect(left.viewProjectionMatrix).not.toEqual(right.viewProjectionMatrix);
  });

  it("creates over-under stereo viewports without losing odd-pixel rows", () => {
    const frame = computePerspectiveCameraFrame({
      min: [-1, -1, -1],
      max: [1, 1, 1]
    }, {
      width: 900,
      height: 901
    });

    const rig = createStereoCameraRig({
      frame,
      viewport: { x: 4, y: 8, width: 900, height: 901 },
      layout: "over-under"
    });

    expect(rig.views[0].viewport).toEqual({ x: 4, y: 8, width: 900, height: 450 });
    expect(rig.views[1].viewport).toEqual({ x: 4, y: 458, width: 900, height: 451 });
  });

  it("rejects invalid stereo rig dimensions and optical setup", () => {
    const frame = computePerspectiveCameraFrame({
      min: [-1, -1, -1],
      max: [1, 1, 1]
    }, {
      width: 640,
      height: 480
    });

    expect(() => createStereoCameraRig({
      frame,
      viewport: { x: 0, y: 0, width: 1, height: 10 }
    })).toThrow(/viewport dimensions/);
    expect(() => createStereoCameraRig({
      frame,
      viewport: { x: 0, y: 0, width: 640, height: 480 },
      eyeSeparation: 0
    })).toThrow(/eyeSeparation/);
    expect(() => createStereoCameraRig({
      frame,
      viewport: { x: 0, y: 0, width: 640, height: 480 },
      convergenceDistance: frame.near
    })).toThrow(/convergenceDistance/);
  });
});
