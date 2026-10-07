// PRD-07 P3-T6 — SkyCaptureAdapter policy: no capture when there's no visible
// sky / an explicit environment exists / the C-09 slot is unprovided / the
// flag is off; a provided slot under A3D_QR_LIGHTING captures once through
// fromScene (the factory itself does the 6-face renders via renderToCubeFace).

import { describe, expect, it } from "vitest";
import { captureSkyEnvironment, SKY_CAPTURE_PENDING, SkyCaptureAdapter } from "../../../../packages/rendering/src/atmosphere/SkyCaptureAdapter";
import { environmentProbeFactorySlot, type EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

const flags = (names: readonly string[]): QrFlags => ({
  values: {},
  on: (n) => names.includes(String(n))
});

function appWith(sky: unknown | null, environment?: unknown) {
  let listeners: Array<() => void> = [];
  return {
    atmosphere: {
      state: () => ({ sky }),
      onSkyChanged: (l: () => void) => { listeners.push(l); return () => { listeners = listeners.filter((x) => x !== l); }; }
    },
    environment,
    fireSkyChanged: () => { for (const l of listeners) l(); }
  };
}

function fakeProbe(): EnvironmentProbe {
  return {
    kind: "environment-probe",
    specularCube: null as never,
    mipCount: 1,
    faceSize: 128,
    sh9: new Float32Array(27),
    shTexture: null,
    background: null,
    source: "capture",
    dispose() {}
  };
}

describe("P3-T6 SkyCaptureAdapter", () => {
  it("reports SKY_CAPTURE_PENDING when nothing qualifies", () => {
    const device = new MockRenderDevice();
    const off = flags([]);
    const skySpec = { model: "preetham", sun: { elevationDeg: 40, azimuthDeg: 10 } };
    expect(captureSkyEnvironment(appWith(skySpec), device, off).status).toBe(SKY_CAPTURE_PENDING);
    const on = flags(["A3D_QR_LIGHTING"]);
    expect(captureSkyEnvironment(appWith(null), device, on).status).toBe(SKY_CAPTURE_PENDING);
    expect(captureSkyEnvironment(appWith(skySpec, { url: "env.hdr" }), device, on).status).toBe(SKY_CAPTURE_PENDING);
  });

  it("captures through the real factory once the slot is provided and lit", () => {
    let faceCalls = 0;
    environmentProbeFactorySlot.provide(() => ({
      fromEquirect: () => fakeProbe(),
      fromCube: () => fakeProbe(),
      fromScene: (req) => {
        const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        // The factory drives renderFace once per cube face.
        for (let f = 0; f < 6; f++) { faceCalls += 1; req.renderFace(f as 0, null as never, identity); }
        return fakeProbe();
      },
      neutral: () => fakeProbe()
    }));
    const device = new MockRenderDevice();
    device.beginFrame(128, 128);
    const on = flags(["A3D_QR_LIGHTING"]);
    const app = appWith({ model: "preetham", sun: { elevationDeg: 40, azimuthDeg: 10 } });
    const result = captureSkyEnvironment(app, device, on);
    expect(result.status).toBe("captured");
    expect(result.probe).not.toBeNull();
    expect(faceCalls).toBe(6); // 6 face calls inside fromScene

    const adapter = new SkyCaptureAdapter(app, device, on);
    expect(adapter.current()).not.toBeNull();
    adapter.dispose();
    device.endFrame();
  });
});
