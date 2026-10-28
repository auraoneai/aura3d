/**
 * Dense-instance shadow budget: an "auto" cascade count is capped at two once a scene stamps 8,192+ shadow-casting instances
 * (every cascade redraws every caster). Explicit cascades and the opt-out are never capped.
 */
import { describe, expect, it } from "vitest";
import {
  DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES,
  resolveShadowSystemConfig,
  shadowCastingInstanceCount
} from "../../../packages/engine/src/agent-api/compiler/shadows";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const transforms = (n: number) => Array.from({ length: n }, (_, i) => ({ position: [(i % 100) - 50, 0, Math.floor(i / 100) - 50] as [number, number, number] }));

function snapshotWith(count: number, castShadow = true): AuraSceneSnapshot {
  return scene()
    .add(lights.directional({ position: [30, 50, 20], shadow: true }))
    .add(instances.cylinder({ name: "trunks", transforms: transforms(count), castShadow }))
    .toJSON() as AuraSceneSnapshot;
}

const descriptors = (cascades?: number | "auto") => [{ shadowRequested: true, ...(cascades !== undefined ? { shadowOptions: { cascades } } : {}) }];

describe("dense instanced shadow budget", () => {
  it("counts only shadow-casting instances", () => {
    expect(shadowCastingInstanceCount(snapshotWith(500))).toBe(500);
    expect(shadowCastingInstanceCount(snapshotWith(500, false))).toBe(0);
  });

  it("caps auto cascades at two from DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES casters, leaves smaller scenes at the tier value", () => {
    expect(DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES).toBe(8192);
    const high = resolveShadowSystemConfig(snapshotWith(1000), descriptors(), "high");
    expect(high.cascades).toBe(3);
    expect(resolveShadowSystemConfig(snapshotWith(DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES - 1), descriptors(), "high").cascades).toBe(3);
    expect(resolveShadowSystemConfig(snapshotWith(DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES), descriptors(), "high").cascades).toBe(2);
    expect(resolveShadowSystemConfig(snapshotWith(18000), descriptors("auto"), "ultra" as never).cascades).toBeLessThanOrEqual(2);
  });

  it("never lowers a tier that already uses fewer cascades, and never touches an explicit cascade count", () => {
    expect(resolveShadowSystemConfig(snapshotWith(18000), descriptors(), "medium").cascades).toBe(2);
    expect(resolveShadowSystemConfig(snapshotWith(18000), descriptors(), "low").cascades).toBe(1);
    expect(resolveShadowSystemConfig(snapshotWith(18000), descriptors(3), "high").cascades).toBe(3);
  });

  it("can be switched off with __A3D_DENSE_SHADOWS__ = 'off'", () => {
    const g = globalThis as { __A3D_DENSE_SHADOWS__?: string };
    try {
      g.__A3D_DENSE_SHADOWS__ = "off";
      expect(resolveShadowSystemConfig(snapshotWith(18000), descriptors(), "high").cascades).toBe(3);
    } finally {
      delete g.__A3D_DENSE_SHADOWS__;
    }
  });
});
