/**
 * SI-7: the shadow-proxy threshold (and with it the dense depth path, which needs a proxy) counted pool
 * capacity, so a 2,000-slot pool with 40 live instances and the rest parked at y -999 got a proxy as if
 * 2,000 casters were on stage. The threshold now counts live instances.
 */
import { describe, expect, it } from "vitest";
import { qrPrimitiveGeometryOptions, INSTANCED_SHADOW_PROXY_MIN_INSTANCES, QrPrimitiveGeometryPool } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { createProductionPrimitiveResources, liveInstanceCount } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

const core = (): NonNullable<ReturnType<typeof qrPrimitiveGeometryOptions>> =>
  ({ ...qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["core"] }), undefined, {})!, pool: new QrPrimitiveGeometryPool() });

function pool(capacity: number, live: number, park: "y" | "scale" = "y"): AuraPrimitiveNode {
  return {
    kind: "primitive",
    primitive: "sphere",
    castShadow: true,
    instances: Array.from({ length: capacity }, (_, i) =>
      i < live ? { position: [i, 0, 0] } : park === "y" ? { position: [0, -999, 0] } : { position: [i, 0, 0], scale: 0 })
  } as unknown as AuraPrimitiveNode;
}

describe("liveInstanceCount", () => {
  it("skips slots parked below y -50 or at scale 0, including through the node position", () => {
    expect(liveInstanceCount(pool(900, 30))).toBe(30);
    expect(liveInstanceCount(pool(900, 30, "scale"))).toBe(30);
    expect(liveInstanceCount({ position: [0, -100, 0], instances: [{ position: [0, 0, 0] }, { position: [0, 80, 0] }] })).toBe(1);
    expect(liveInstanceCount({ instances: [{ scale: [1, 0, 1] }, {}] })).toBe(1);
    expect(liveInstanceCount({})).toBe(0);
  });
});

describe("shadow proxy threshold counts live instances", () => {
  it("a mostly parked pool gets no proxy (so no dense depth draws)", () => {
    const resource = createProductionPrimitiveResources(pool(2000, 40), core())[0]!;
    expect(resource.shadowGeometry).toBeUndefined();
  });

  it("a pool with enough live instances still gets one", () => {
    const resource = createProductionPrimitiveResources(pool(2000, INSTANCED_SHADOW_PROXY_MIN_INSTANCES + 10), core())[0]!;
    expect(resource.shadowGeometry).toBeDefined();
  });
});
