import { describe, expect, it } from "vitest";
import { WebXRSessionController, type A3DXRFrameLike, type A3DXRSessionLike, type A3DXRSystemLike } from "../../../packages/input/src";

describe("WebXRSessionController", () => {
  it("starts an injected XR session and samples controller and hit-test state", async () => {
    let hapticPulse: readonly [number, number] | null = null;
    const xr: A3DXRSystemLike = {
      async isSessionSupported(mode) {
        return mode === "immersive-ar";
      },
      async requestSession(): Promise<A3DXRSessionLike> {
        return {
          inputSources: [{
            handedness: "right",
            targetRayMode: "tracked-pointer",
            profiles: ["generic-trigger"],
            targetRaySpace: "target-ray-space",
            gripSpace: "grip-space",
            gamepad: {
              buttons: [{ pressed: true, value: 0.9 }, { pressed: false, value: 0 }],
              axes: [0.25, -0.5],
              hapticActuators: [{
                pulse(intensity, duration) {
                  hapticPulse = [intensity, duration];
                  return true;
                }
              }]
            }
          }],
          async requestReferenceSpace(type) {
            return { type };
          },
          async end() {}
        };
      }
    };
    const frame: A3DXRFrameLike = {
      getHitTestResults() {
        return [{ position: [0.1, 0.2, -1], normal: [0, 1, 0] }];
      },
      getPose(space) {
        const offset = space === "grip-space" ? 2 : 1;
        return { transform: { matrix: [1, 0, 0, offset, 0, 1, 0, offset, 0, 0, 1, offset, 0, 0, 0, 1] } };
      }
    };

    const controller = new WebXRSessionController({
      xr,
      mode: "immersive-ar",
      requiredFeatures: ["hit-test"],
      referenceSpace: "viewer"
    });

    await expect(controller.isSupported()).resolves.toBe(true);
    await expect(controller.start()).resolves.toMatchObject({
      mode: "immersive-ar",
      referenceSpace: "viewer",
      supported: true,
      started: true
    });

    const sample = controller.sampleFrame(frame, "test-hit-source");
    expect(sample.active).toBe(true);
    expect(sample.controllerCount).toBe(1);
    expect(sample.controllers[0]).toMatchObject({
      handedness: "right",
      triggerPressed: true,
      primaryValue: 0.9,
      axes: [0.25, -0.5],
      hapticActuatorCount: 1
    });
    expect(sample.controllers[0]?.targetRayMatrix).toEqual([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1]);
    expect(sample.controllers[0]?.gripMatrix).toEqual([1, 0, 0, 2, 0, 1, 0, 2, 0, 0, 1, 2, 0, 0, 0, 1]);
    expect(sample.hitTestCount).toBe(1);
    expect(sample.hitTests[0]).toMatchObject({
      position: [0.1, 0.2, -1],
      normal: [0, 1, 0]
    });
    await expect(controller.pulseHaptics(0.4, 25)).resolves.toBe(1);
    expect(hapticPulse).toEqual([0.4, 25]);

    await controller.end();
    expect(controller.active).toBe(false);
  });

  it("reports unsupported when no XR system exists", async () => {
    const controller = new WebXRSessionController({ mode: "immersive-vr" });
    await expect(controller.isSupported()).resolves.toBe(false);
    await expect(controller.start()).resolves.toMatchObject({
      mode: "immersive-vr",
      supported: false,
      started: false
    });
  });
});
