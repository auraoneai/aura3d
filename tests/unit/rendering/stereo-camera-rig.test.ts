import { describe, expect, it } from "vitest";
import {
  computePerspectiveCameraFrame,
  createStereoCameraRig
} from "../../../packages/rendering/src";

type StereoFrame = Parameters<typeof createStereoCameraRig>[0]["frame"];

function translatedRotatedFrame(near: number, horizontalScale: number): StereoFrame {
  const far = 100;
  return {
    cameraPosition: [3, 2, 5],
    near,
    // The camera looks along world -X; its local right axis is world -Z.
    viewMatrix: [
      0, 0, 1, 0,
      0, 1, 0, 0,
      -1, 0, 0, 0,
      5, -2, -3, 1
    ],
    // A perspective projection with a nonzero original lens-center offset.
    projectionMatrix: [
      horizontalScale, 0, 0, 0,
      0, 3, 0, 0,
      0.25, 0, -(far + near) / (far - near), -1,
      0, 0, -(2 * far * near) / (far - near), 0
    ]
  };
}

function projectedX(matrix: readonly number[], point: readonly [number, number, number]): number {
  const [x, y, z] = point;
  const clipX = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
  const clipW = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  expect(clipW).toBeGreaterThan(0);
  return clipX / clipW;
}

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
    expect(left.projectionMatrix[8]).toBeGreaterThan(frame.projectionMatrix[8]);
    expect(right.projectionMatrix[8]).toBeLessThan(frame.projectionMatrix[8]);
    expect(left.viewProjectionMatrix).not.toEqual(right.viewProjectionMatrix);
  });

  it.each([
    { near: 0.25, scale: 2, frontDisparity: 0.04, backDisparity: -0.02, offAxis: -0.13, layout: "side-by-side" as const },
    { near: 1.25, scale: 2, frontDisparity: 0.04, backDisparity: -0.02, offAxis: -0.13, layout: "over-under" as const },
    { near: 0.25, scale: 0.8, frontDisparity: 0.016, backDisparity: -0.008, offAxis: -0.202, layout: "side-by-side" as const }
  ])("projects world points around the focus plane for near=$near and scale=$scale", ({ near, scale, frontDisparity, backDisparity, offAxis, layout }) => {
    const frame = translatedRotatedFrame(near, scale);
    const originalProjection = [...frame.projectionMatrix];
    const rig = createStereoCameraRig({ frame, viewport: { x: 5, y: 6, width: 801, height: 601 },
      eyeSeparation: 0.2, convergenceDistance: 10, layout });
    const [left, right] = rig.views;

    // Camera-space depths 5, 10 and 20 are world x = -2, -7 and -17.
    const front = [-2, 2, 5] as const;
    const focus = [-7, 2, 5] as const;
    const behind = [-17, 2, 5] as const;
    const focusOffAxis = [-7, 2.4, 4.4] as const;
    const leftFocus = projectedX(left.viewProjectionMatrix, focus);
    const rightFocus = projectedX(right.viewProjectionMatrix, focus);
    expect(leftFocus).toBeCloseTo(-0.25, 10);
    expect(rightFocus).toBeCloseTo(-0.25, 10);
    expect(projectedX(left.viewProjectionMatrix, focusOffAxis)).toBeCloseTo(offAxis, 10);
    expect(projectedX(right.viewProjectionMatrix, focusOffAxis)).toBeCloseTo(offAxis, 10);
    expect(projectedX(left.viewProjectionMatrix, front) - projectedX(right.viewProjectionMatrix, front)).toBeCloseTo(frontDisparity, 10);
    expect(projectedX(left.viewProjectionMatrix, behind) - projectedX(right.viewProjectionMatrix, behind)).toBeCloseTo(backDisparity, 10);

    expect(left.eye).toBe("left");
    expect(right.eye).toBe("right");
    expect(left.cameraPosition[2]).toBeCloseTo(5.1, 10);
    expect(right.cameraPosition[2]).toBeCloseTo(4.9, 10);
    if (layout === "side-by-side") {
      expect(left.viewport).toEqual({ x: 5, y: 6, width: 400, height: 601 });
      expect(right.viewport).toEqual({ x: 405, y: 6, width: 401, height: 601 });
    } else {
      expect(left.viewport).toEqual({ x: 5, y: 6, width: 801, height: 300 });
      expect(right.viewport).toEqual({ x: 5, y: 306, width: 801, height: 301 });
    }
    expect(frame.projectionMatrix).toEqual(originalProjection);
    for (const eye of rig.views) {
      eye.projectionMatrix.forEach((value, index) => {
        if (index !== 8) expect(value).toBe(frame.projectionMatrix[index]);
      });
    }
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
