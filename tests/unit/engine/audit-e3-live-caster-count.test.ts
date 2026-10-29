/**
 * Audit lane E3, wave 2 (handoff from E4, SI-7): the dense-caster count that drives the PCF tap tier and the dense cascade cap
 * counts live instances. Pool slots parked at world y <= -50 or at scale 0 are not shadow casters.
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

type Transform = { position: [number, number, number]; scale?: number | [number, number, number] };

const live = (n: number): Transform[] => Array.from({ length: n }, (_, i) => ({ position: [(i % 100) - 50, 0, Math.floor(i / 100) - 50] }));
const parkedLow = (n: number): Transform[] => Array.from({ length: n }, () => ({ position: [0, -999, 0] }));
const parkedScale = (n: number): Transform[] => Array.from({ length: n }, () => ({ position: [0, 0, 0], scale: 0 }));

function snapshotWith(transforms: Transform[], nodePosition?: [number, number, number]): AuraSceneSnapshot {
  return scene()
    .add(lights.directional({ position: [30, 50, 20], shadow: true }))
    .add(instances.cylinder({ name: "pool", transforms, castShadow: true, ...(nodePosition ? { position: nodePosition } : {}) }))
    .toJSON() as AuraSceneSnapshot;
}

const descriptors = [{ shadowRequested: true }];

describe("SI-7: shadow caster count ignores parked pool slots", () => {
  it("does not count slots parked at y <= -50 or at scale 0", () => {
    expect(shadowCastingInstanceCount(snapshotWith([...live(100), ...parkedLow(900)]))).toBe(100);
    expect(shadowCastingInstanceCount(snapshotWith([...live(100), ...parkedScale(50)]))).toBe(100);
  });

  it("adds the node's y to each instance's y before the parked test", () => {
    // Node at y -40 with instances at y -20: world y -60, parked.
    const lowered = live(10).map((t) => ({ position: [t.position[0], -20, t.position[2]] as [number, number, number] }));
    expect(shadowCastingInstanceCount(snapshotWith(lowered, [0, -40, 0]))).toBe(0);
  });

  it("keeps the node-level parked skip", () => {
    expect(shadowCastingInstanceCount(snapshotWith(live(100), [0, -60, 0]))).toBe(0);
  });

  it("a mostly parked pool no longer trips the dense cascade cap or the dense tap tier input", () => {
    const pool = [...live(1000), ...parkedLow(DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES)];
    const config = resolveShadowSystemConfig(snapshotWith(pool), descriptors, "high");
    expect(config.cascades).toBe(3);
    const tap = (globalThis as { __A3D_SHADOW_TAP_TIER__?: { casterInstances: number } }).__A3D_SHADOW_TAP_TIER__;
    expect(tap?.casterInstances).toBe(1000);
    // Live casters at the threshold still cap.
    expect(resolveShadowSystemConfig(snapshotWith(live(DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES)), descriptors, "high").cascades).toBe(2);
  });
});
