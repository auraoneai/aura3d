import { describe, expect, it } from "vitest";
import {
  WebXRSessionController,
  type A3DXRFrameLike,
  type A3DXRSessionLike,
  type A3DXRSystemLike
} from "../../../packages/input/src";

function trackedHand() {
  return {
    handedness: "left" as const,
    trackingState: "tracked" as const,
    joints: {
      wrist: { position: [0.1, 1.2, -0.3] as readonly [number, number, number], radius: 0.02 },
      "index-finger-tip": { position: [0.12, 1.25, -0.4] as readonly [number, number, number], radius: 0.012 }
    }
  };
}

function xrSystem(session: A3DXRSessionLike): A3DXRSystemLike {
  return {
    async isSessionSupported() {
      return true;
    },
    async requestSession() {
      return session;
    }
  };
}

describe("WebXR hand input + XR camera (N3)", () => {
  it("reads controller, hand, camera, and capability state from an injected session", async () => {
    const session: A3DXRSessionLike = {
      inputSources: [
        {
          handedness: "left",
          targetRayMode: "tracked-pointer",
          profiles: ["generic-trigger-squeeze", "hand-tracking"],
          hand: trackedHand(),
          gamepad: { buttons: [{ pressed: true, value: 0.7 }], axes: [] }
        },
        { handedness: "right", targetRayMode: "tracked-pointer", profiles: [], gamepad: { buttons: [], axes: [] } }
      ],
      enabledFeatures: ["local-floor", "hand-tracking"],
      async requestReferenceSpace(type) {
        return { type };
      },
      async end() {}
    };
    const frame: A3DXRFrameLike = {
      getHitTestResults() {
        return [{ position: [0, 0, -1], normal: [0, 1, 0] }];
      },
      getViewerPose() {
        return {
          position: [0, 1.6, 0],
          orientation: [0, 0, 0, 1],
          viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.6, 0, 1],
          projectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]
        };
      }
    };
    const controller = new WebXRSessionController({
      xr: xrSystem(session),
      mode: "immersive-vr",
      referenceSpace: "local-floor"
    });
    await controller.start();
    const sample = controller.sampleFrame(frame, "hit-source");

    expect(sample.controllerCount).toBe(2);
    expect(sample.hands.length).toBe(1);
    expect(sample.hands[0]).toMatchObject({
      handedness: "left",
      tracked: true,
      jointCount: 2
    });
    expect(sample.hands[0]?.joints["wrist"]?.position).toEqual([0.1, 1.2, -0.3]);
    expect(sample.hands[0]?.joints["wrist"]?.radius).toBe(0.02);

    expect(sample.camera.tracked).toBe(true);
    expect(sample.camera.position).toEqual([0, 1.6, 0]);
    expect(sample.camera.viewMatrix).toHaveLength(16);
    expect(sample.camera.projectionMatrix).toHaveLength(16);

    expect(sample.capabilities).toMatchObject({
      handTracking: true,
      viewerPose: true,
      hitTest: true,
      haptics: false,
      referenceSpace: "local-floor",
      enabledFeatures: ["local-floor", "hand-tracking"]
    });
    await controller.end();
  });

  it("degrades to explicit untracked/empty state when the session provides nothing", async () => {
    const controller = new WebXRSessionController({
      xr: xrSystem({
        inputSources: [{ handedness: "none", hand: { trackingState: "not-tracked", joints: {} } }],
        async requestReferenceSpace(type) {
          return { type };
        },
        async end() {}
      }),
      mode: "inline"
    });
    await controller.start();
    const sample = controller.sampleFrame(undefined, undefined);
    expect(sample.hands.length).toBe(1);
    expect(sample.hands[0]?.tracked).toBe(false);
    expect(sample.hands[0]?.jointCount).toBe(0);
    expect(sample.camera).toMatchObject({ tracked: false, position: null, viewMatrix: null });
    expect(sample.capabilities).toMatchObject({
      handTracking: false,
      viewerPose: false,
      hitTest: false,
      haptics: false
    });
    await controller.end();
  });

  it("sanitizes non-finite joint and pose data instead of propagating NaN", async () => {
    const controller = new WebXRSessionController({
      xr: xrSystem({
        inputSources: [{
          handedness: "right",
          hand: {
            trackingState: "tracked",
            joints: {
              wrist: { position: [Number.NaN, 1, 1] as unknown as readonly [number, number, number], radius: Number.NaN },
              "index-finger-tip": { position: [0, 1, 0] as readonly [number, number, number] }
            }
          }
        }],
        async requestReferenceSpace(type) {
          return { type };
        },
        async end() {}
      }),
      mode: "immersive-vr"
    });
    await controller.start();
    const sample = controller.sampleFrame({
      getViewerPose: () => ({ viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, Number.NaN, 0, 0, 0, 0, 1] })
    });
    expect(sample.hands[0]?.tracked).toBe(true);
    expect(sample.hands[0]?.joints["wrist"]?.position).toBeNull();
    expect(sample.hands[0]?.joints["wrist"]?.radius).toBe(0);
    // All-unsafe pose degrades to untracked rather than NaN matrices.
    expect(sample.camera.tracked).toBe(false);
    await controller.end();
  });
});
