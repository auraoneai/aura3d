/**
 * Zero-instance robustness: an instanced node/pool that is empty this frame must never throw (a throw
 * in the compile or draw path blanks the whole canvas). Empty means "draw nothing".
 */

import { describe, expect, it } from "vitest";

import { ForwardPass, Geometry, MockRenderDevice } from "../../../packages/rendering/src";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { lineNodeHandler, pointsNodeHandler } from "../../../packages/engine/src/agent-api/compiler/lines";
import { points } from "../../../packages/engine/src/agent-api/nodes/points";
import { lines } from "../../../packages/engine/src/agent-api/nodes/lines";
import { batched, batchedNodeHandler } from "../../../packages/engine/src/agent-api/nodes/batched";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/engine/src/agent-api/nodes/batched";

function boxGeometry(): Geometry {
  const vb = new VertexBuffer(VertexFormat.P3N3, 4);
  for (let i = 0; i < 4; i += 1) {
    vb.setAttribute(i, "position", [(i % 2) - 0.5, Math.floor(i / 2) - 0.5, 0]);
    vb.setAttribute(i, "normal", [0, 0, 1]);
  }
  return new Geometry(vb, new IndexBuffer([0, 1, 2, 0, 2, 3], 6));
}

function compileCtx(options: string) {
  return { flags: resolveQrFlags({ options: options as never }), renderer: undefined, assets: undefined, quality: undefined, strict: false, degrade: () => undefined } as never;
}

function collectOut() {
  const items: unknown[] = [];
  return { items, addItems(list: readonly unknown[]) { items.push(...list); }, addLights() {}, set() {}, feature() {} };
}

describe("empty instance arrays never throw", () => {
  it("instances.<primitive> with zero transforms builds an empty-instance node", () => {
    const node = instances.box({ transforms: [] }).toJSON();
    expect(node.instances).toEqual([]);
  });

  it("instances.<primitive> still rejects mismatched color counts", () => {
    expect(() => instances.box({ transforms: [{ position: [0, 0, 0] }], colors: ["#fff", "#000"] })).toThrow("color count");
  });

  for (const flags of ["all", "parity.batching,-core"]) {
    it(`batched.mesh with no live members emits nothing (${flags})`, () => {
      const mesh = batched.mesh({ maxInstances: 4 });
      mesh.addGeometry(boxGeometry());
      const out = collectOut();
      expect(() => batchedNodeHandler.compile(mesh.toJSON() as never, compileCtx(flags), out as never)).not.toThrow();
      expect(out.items).toHaveLength(0);
    });
  }

  it("a ForwardPass item with a zero-length instance array draws nothing and does not throw", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(() =>
      new ForwardPass({
        items: [{ geometry: Geometry.triangle(), modelMatrix: identity, label: "empty-instanced", instanceTransforms: new Float32Array(0) }]
      }).execute({ device, width: 8, height: 8 })
    ).not.toThrow();
    device.endFrame();
    expect(device.drawCommands.filter((command) => command.label === "empty-instanced")).toHaveLength(0);
  });

  it("a non-empty instanced item next to an empty one still draws", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    new ForwardPass({
      items: [
        { geometry: Geometry.triangle(), modelMatrix: identity, label: "empty-instanced", instanceTransforms: new Float32Array(0) },
        { geometry: Geometry.triangle(), modelMatrix: identity, label: "one-instance", instanceTransforms: identity }
      ]
    }).execute({ device, width: 8, height: 8 });
    device.endFrame();
    expect(device.drawCommands.filter((command) => command.label === "one-instance").length).toBeGreaterThan(0);
    expect(device.drawCommands.filter((command) => command.label === "empty-instanced")).toHaveLength(0);
  });

  it("a geometry drawRange of count 0 draws nothing and does not throw", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const geometry = Geometry.triangle();
    geometry.drawRange = { start: 0, count: 0 };
    expect(() =>
      new ForwardPass({ items: [{ geometry, modelMatrix: identity, label: "empty-range" }] }).execute({ device, width: 8, height: 8 })
    ).not.toThrow();
    device.endFrame();
    expect(device.drawCommands.filter((command) => command.label === "empty-range")).toHaveLength(0);
  });

  it("points and lines with zero positions build and compile to nothing with GEOMETRY_EMPTY", () => {
    const degraded: string[] = [];
    const ctx = { ...(compileCtx("all") as object), degrade: (d: { message: string }) => { degraded.push(d.message); } } as never;
    const pointsNode = points({ positions: [] }).toJSON();
    const lineNode = lines.line({ positions: [] }).toJSON();
    const out = collectOut();
    expect(() => pointsNodeHandler.compile(pointsNode as never, ctx, out as never)).not.toThrow();
    expect(() => lineNodeHandler.compile(lineNode as never, ctx, out as never)).not.toThrow();
    expect(degraded.filter((m) => m.startsWith("GEOMETRY_EMPTY"))).toHaveLength(2);
    expect(out.items).toHaveLength(0);
  });

  it("a one-point polyline is still an authoring error", () => {
    expect(() => lines.line({ positions: [[0, 0, 0]] })).toThrow("at least 2 points");
  });
});
