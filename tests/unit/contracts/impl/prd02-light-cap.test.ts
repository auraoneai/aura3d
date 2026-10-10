/**
 * T0-27 — the forward direct-light cap is consistent: `LightUniforms.pack`
 * holds MAX_DIRECT_LIGHTS (16) lights in `u_lightData[96]`, so clustering must
 * engage above 16 with A3D_QR_LIGHTING on (it used to wait until 32, dropping
 * lights 17-32). Flag off keeps the legacy 16 threshold byte-for-byte.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import {
  FORWARD_DIRECT_LIGHT_CAPACITY,
  forwardLightCounters,
  resolveForwardClusteredLighting
} from "../../../../packages/rendering/src/forward/Lighting";
import {
  LightUniforms,
  MAX_DIRECT_LIGHTS,
  auraLightsCounters,
  recordAuraLightsCounters
} from "../../../../packages/rendering/src/LightUniforms";
import type { CollectedLight } from "../../../../packages/rendering/src/LightCollector";

const LIGHTING_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({});

afterEach(() => setRendererQrFlags(BASE));

function pointLight(index: number): CollectedLight {
  return {
    kind: "point",
    color: [1, 1, 1],
    intensity: 1 + index,
    position: [index - 12, 1, (index % 4) - 2],
    direction: [0, -1, 0],
    range: 6,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 1,
    source: { id: `point-${index}`, name: `point-${index}` }
  } as unknown as CollectedLight;
}

const points = (n: number): CollectedLight[] => Array.from({ length: n }, (_, i) => pointLight(i));

describe("T0-27 forward light cap (PRD-02 §6.3, C-28 lightsDroppedByCap)", () => {
  it("forward capacity equals the pack cap and the u_lightData[96] array", () => {
    expect(FORWARD_DIRECT_LIGHT_CAPACITY).toBe(MAX_DIRECT_LIGHTS);
    expect(MAX_DIRECT_LIGHTS * LightUniforms.vec4sPerLight).toBe(96);
    const lightData = LightUniforms.layout.fields.find((entry) => entry.name === "u_lightData");
    expect(lightData?.arrayLength).toBe(96);
  });

  it("24 point lights with the flag on cluster and give lightsDroppedByCap === 0", () => {
    setRendererQrFlags(LIGHTING_ON);
    recordAuraLightsCounters({ lightsEvaluated: -1, lightsDroppedByCap: -1 });
    const clustered = resolveForwardClusteredLighting(points(24), 64, 64, undefined);
    try {
      expect(clustered).not.toBeNull();
      expect(clustered!.diagnostics.requestedLightCount).toBe(24);
      expect(auraLightsCounters()).toEqual({ lightsEvaluated: 24, lightsDroppedByCap: 0 });
    } finally {
      clustered?.dispose();
    }
  });

  it("flag on: 16 lights stay on the uniform path with nothing dropped", () => {
    setRendererQrFlags(LIGHTING_ON);
    const clustered = resolveForwardClusteredLighting(points(16), 64, 64, undefined);
    expect(clustered).toBeNull();
    expect(auraLightsCounters()).toEqual({ lightsEvaluated: 16, lightsDroppedByCap: 0 });
    expect(LightUniforms.pack(points(16)).diagnostics.droppedCount).toBe(0);
  });

  it("flag off keeps the legacy threshold (17 clusters, 16 does not) and records no counters", () => {
    setRendererQrFlags(BASE);
    recordAuraLightsCounters({ lightsEvaluated: -1, lightsDroppedByCap: -1 });
    expect(resolveForwardClusteredLighting(points(16), 64, 64, undefined)).toBeNull();
    const clustered = resolveForwardClusteredLighting(points(17), 64, 64, undefined);
    try {
      expect(clustered).not.toBeNull();
    } finally {
      clustered?.dispose();
    }
    expect(auraLightsCounters()).toEqual({ lightsEvaluated: -1, lightsDroppedByCap: -1 });
  });

  it("the uniform path reports what the pack would drop", () => {
    expect(forwardLightCounters(24, false)).toEqual({ lightsEvaluated: 24, lightsDroppedByCap: 8 });
    expect(forwardLightCounters(24, true)).toEqual({ lightsEvaluated: 24, lightsDroppedByCap: 0 });
    expect(LightUniforms.pack(points(24)).diagnostics.droppedCount).toBe(8);
  });
});
