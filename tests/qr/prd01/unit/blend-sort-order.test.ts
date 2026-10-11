/**
 * Lane-01 row 01-S6 sort-order unit (PRD-01 §6.8, "ForwardPass.ts: queue
 * classification by blend mode … Test: unit sort order with 6 items").
 *
 * Unlike the synthetic `sortRenderQueueItems` case in
 * tests/unit/contracts/impl/prd01-blend.test.ts, this drives six real
 * RenderItems (opaque, 3× alpha at different depths, additive, multiply)
 * through `ForwardPass.execute` on a MockRenderDevice and asserts the order in
 * which the device received the draws: opaque first, then the alpha group
 * back-to-front, then the order-independent additive/multiply group.
 */

import { describe, expect, it } from "vitest";

import { ForwardPass, MockRenderDevice, UnlitMaterial } from "@aura3d/rendering";
import type { BlendMode } from "../../../../packages/rendering/src/contracts/blend";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";

function triangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
  vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
  vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
  vertices.setAttribute(2, "position", [0, 0.5, 0]);
  for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "normal", [0, 0, 1]);
  return new Geometry(vertices, null, "triangles", { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] });
}

function item(label: string, blendMode: BlendMode, z: number): RenderItem {
  const material = new UnlitMaterial({
    color: [1, 1, 1, 0.5],
    renderState: blendMode === "opaque" ? { blendMode } : { blendMode, depthWrite: false }
  } as never);
  return {
    label,
    geometry: triangle(),
    material,
    modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]
  } as RenderItem;
}

describe("prd01 C-04 ForwardPass blend-mode sort order (6 items)", () => {
  it("draws opaque, then alpha back-to-front, then additive/multiply", () => {
    // Camera at the origin looking down -Z: larger |z| = farther.
    const items = [
      item("alpha-near", "alpha", -1),
      item("additive-far", "additive", -100),
      item("alpha-far", "alpha", -90),
      item("multiply-mid", "multiply", -50),
      item("opaque", "opaque", -10),
      item("alpha-mid", "premultiplied", -30)
    ];
    const device = new MockRenderDevice();
    device.beginFrame(16, 16);
    new ForwardPass({ items, cameraPosition: [0, 0, 0] }).execute({ device, width: 16, height: 16 });

    const modes = device.drawCommands.map((command) => command.renderState?.blendMode ?? (command.renderState?.blend ? "alpha" : "opaque"));
    const order = device.drawCommands.map((command) => command.label);
    expect(device.drawCommands).toHaveLength(6);
    expect(order).toEqual(["opaque", "alpha-far", "alpha-mid", "alpha-near", "additive-far", "multiply-mid"]);
    expect(modes).toEqual(["opaque", "alpha", "premultiplied", "alpha", "additive", "multiply"]);
  });

  it("keeps the additive/multiply group after alpha even when it is nearer", () => {
    const items = [item("additive-near", "additive", -0.5), item("alpha-far", "alpha", -80), item("multiply-near", "multiply", -0.25)];
    const device = new MockRenderDevice();
    device.beginFrame(16, 16);
    new ForwardPass({ items, cameraPosition: [0, 0, 0] }).execute({ device, width: 16, height: 16 });
    const order = device.drawCommands.map((command) => command.label);
    expect(order[0]).toBe("alpha-far");
    expect(order.slice(1).sort()).toEqual(["additive-near", "multiply-near"]);
  });
});
