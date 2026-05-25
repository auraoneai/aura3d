import { describe, expect, it } from "vitest";
import { createStereoEyeFrames, DEFAULT_STEREO_CONTROLS } from "../../../apps/stereo-effects/src/stereoControls";

describe("V8 stereo effects camera math", () => {
  const bounds = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
  const viewport = { width: 1280, height: 720 };

  it("separates left and right eye positions and view-projection matrices", () => {
    const [left, right] = createStereoEyeFrames(bounds, viewport, DEFAULT_STEREO_CONTROLS);

    expect(left.eye).toBe("left");
    expect(right.eye).toBe("right");
    expect(right.cameraPosition[0] - left.cameraPosition[0]).toBeCloseTo(DEFAULT_STEREO_CONTROLS.ipd);
    expect(left.viewProjectionMatrix).not.toEqual(right.viewProjectionMatrix);
  });

  it("changes parallax response when convergence or parallax changes", () => {
    const [leftLow] = createStereoEyeFrames(bounds, viewport, {
      ...DEFAULT_STEREO_CONTROLS,
      convergence: 8,
      parallax: 0.1
    });
    const [leftHigh] = createStereoEyeFrames(bounds, viewport, {
      ...DEFAULT_STEREO_CONTROLS,
      convergence: 1.2,
      parallax: 0.9
    });

    expect(leftLow.viewProjectionMatrix).not.toEqual(leftHigh.viewProjectionMatrix);
    expect(leftLow.viewMatrix).not.toEqual(leftHigh.viewMatrix);
  });
});
