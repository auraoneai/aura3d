/**
 * Shadow-proxy geometry for dense instanced casters: the depth passes draw a coarser stand-in (RenderItem.shadowGeometry) while the
 * camera pass keeps its own geometry. Fewer triangles per cascade is the lever on a forest of 18,000 instances drawn once per cascade.
 */
import { describe, expect, it } from "vitest";
import { Geometry, MockRenderDevice } from "../../../packages/rendering/src";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { qrPrimitiveGeometryOptions, instancedShadowSegmentScale, instancedDefaultSegmentScale, QrPrimitiveGeometryPool } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { createProductionPrimitiveResources } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

const core = (): NonNullable<ReturnType<typeof qrPrimitiveGeometryOptions>> =>
  ({ ...qrPrimitiveGeometryOptions(resolveQrFlags({ options: ["core"] }), undefined, {})!, pool: new QrPrimitiveGeometryPool() });

function instancedNode(primitive: AuraPrimitiveNode["primitive"], count: number, castShadow = true): AuraPrimitiveNode {
  return {
    kind: "primitive",
    primitive,
    castShadow,
    instances: Array.from({ length: count }, (_, i) => ({ position: [i, 0, 0] as [number, number, number] }))
  } as unknown as AuraPrimitiveNode;
}

const triangles = (geometry: Geometry): number => (geometry.indexBuffer ? geometry.indexBuffer.data.length : geometry.vertexBuffer.vertexCount) / 3;

describe("instancedShadowSegmentScale", () => {
  it("is 1 for small or in-budget nodes, and never coarser than the camera scale", () => {
    expect(instancedShadowSegmentScale(undefined, 4000, "sphere")).toBe(1);
    expect(instancedShadowSegmentScale(64, 4000, "sphere")).toBe(1);
    expect(instancedShadowSegmentScale(100, 100, "box")).toBe(1);
    for (const [count, tris, prim] of [[2000, 3968, "sphere"], [8000, 192, "cylinder"], [8000, 64, "cone"], [20000, 3968, "sphere"]] as const) {
      expect(instancedShadowSegmentScale(count, tris, prim)).toBeLessThanOrEqual(instancedDefaultSegmentScale(count, tris));
    }
  });

  it("lets round and thin bodies go to an eighth and keeps cones and the rest at a quarter", () => {
    expect(instancedShadowSegmentScale(100_000, 3968, "sphere")).toBe(0.125);
    expect(instancedShadowSegmentScale(100_000, 192, "cylinder")).toBe(0.125);
    expect(instancedShadowSegmentScale(100_000, 64, "cone")).toBe(0.25);
  });
});

describe("resource shadowGeometry", () => {
  it("dense shadow-casting instanced nodes get a strictly coarser proxy", () => {
    const options = core();
    const resource = createProductionPrimitiveResources(instancedNode("sphere", 2000), options)[0]!;
    expect(resource.shadowGeometry).toBeDefined();
    expect(triangles(resource.shadowGeometry!)).toBeLessThan(triangles(resource.geometry));
  });

  it("no proxy for small nodes, non-casters, or nodes whose camera geometry is already at the shadow budget", () => {
    const options = core();
    expect(createProductionPrimitiveResources(instancedNode("sphere", 40), options)[0]!.shadowGeometry).toBeUndefined();
    expect(createProductionPrimitiveResources(instancedNode("sphere", 2000, false), options)[0]!.shadowGeometry).toBeUndefined();
    expect(createProductionPrimitiveResources(instancedNode("box", 2000), options)[0]!.shadowGeometry).toBeUndefined();
  });

  it("disposing the proxy leaves the camera geometry's shared buffers intact", () => {
    const options = core();
    const a = createProductionPrimitiveResources(instancedNode("sphere", 2000), options)[0]!;
    a.shadowGeometry!.dispose();
    expect(triangles(a.geometry)).toBeGreaterThan(0);
  });
});

describe("DepthPass with shadowGeometry", () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  it("draws the proxy's vertices, not the camera geometry's", () => {
    const options = core();
    const resource = createProductionPrimitiveResources(instancedNode("sphere", 2000), options)[0]!;
    const run = (shadowGeometry: Geometry | undefined) => {
      const device = new MockRenderDevice();
      device.beginFrame(8, 8);
      new DepthPass({
        casters: [{ geometry: resource.geometry, ...(shadowGeometry ? { shadowGeometry } : {}), modelMatrix: identity, label: "caster", instanceTransforms: identity }]
      }).execute({ device, width: 8, height: 8 });
      device.endFrame();
      return device.drawCommands.filter((command) => command.label?.startsWith("caster"));
    };
    const full = run(undefined);
    const proxy = run(resource.shadowGeometry);
    expect(full.length).toBeGreaterThan(0);
    expect(proxy.length).toBe(full.length);
    const count = (commands: typeof full) => commands.reduce((sum, command) => sum + ((command as { indexCount?: number }).indexCount ?? command.vertexCount ?? 0), 0);
    expect(count(proxy)).toBeLessThan(count(full));
  });

  it("ignores the proxy when the item carries a drawRange", () => {
    const options = core();
    const resource = createProductionPrimitiveResources(instancedNode("sphere", 2000), options)[0]!;
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const range = { start: 0, count: 6 };
    new DepthPass({
      casters: [{ geometry: resource.geometry, shadowGeometry: resource.shadowGeometry!, drawRange: range, modelMatrix: identity, label: "ranged", instanceTransforms: identity }]
    }).execute({ device, width: 8, height: 8 });
    device.endFrame();
    const commands = device.drawCommands.filter((command) => command.label?.startsWith("ranged"));
    expect(commands.length).toBeGreaterThan(0);
    expect((commands[0] as { indexCount?: number }).indexCount ?? commands[0]!.vertexCount).toBe(6);
  });
});
