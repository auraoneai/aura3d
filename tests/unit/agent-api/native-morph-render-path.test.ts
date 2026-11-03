import { describe, expect, it } from "vitest";
import { camera, geometry, material, scene } from "../../../packages/engine/src/public/index";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderBuffer, MockRenderDevice, Renderer } from "../../../packages/rendering/src";
import type { RenderItem } from "@aura3d/rendering";

type PackedChannel = Float32Array | number[];
type AuthoredMorph = {
  name?: string;
  positions: PackedChannel;
  normals?: PackedChannel;
  tangents?: PackedChannel;
};

const triangle = [0, 0, 0, 2, 0, 0, 0, 2, 0];
const baseNormals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
const up = [0, 1, 0, 0, 1, 0, 0, 1, 0];
const raise = [0, 0, 2, 0, 0, 2, 0, 0, 2];
const noDelta = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** Public authoring and the production compiler feed a real Renderer on a mock device. */
async function fixture(targets: AuthoredMorph[]) {
  const authored = geometry.define({
    positions: triangle.slice(), normals: baseNormals.slice(), indices: [0, 1, 2], morphTargets: targets
  });
  const object = geometry.custom(authored, { name: "morph", material: material.pbr({ color: "#ffffff" }) })
    .runtime({ id: "morph" });
  const snapshot = scene({ camera: camera.perspective({ position: [0, 0, 8], target: [0, 0, 0] }) }).add(object).toJSON();
  const node = snapshot.nodes[0] as AuraPrimitiveNode;
  const registry = createAuraRuntimeNodeRegistry(snapshot);
  const entries = createProductionRuntimePrimitiveEntries([node]);
  const handle = registry.require("morph");
  const canvas = { width: 64, height: 64 } as HTMLCanvasElement;
  const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64 });
  const device = renderer.device as MockRenderDevice;

  const frame = (): RenderItem => {
    const input = createProductionRuntimeRendererInput(snapshot, canvas, [], entries, 0, registry, new Set(),
      { color: [0, 0, 0], intensity: 0 }, []);
    const items = [...(input.source.collectRenderItems?.() ?? [])];
    expect(items).toHaveLength(1);
    return items[0]!;
  };
  const draw = (item: RenderItem): MockRenderBuffer => {
    device.drawCommands.length = 0;
    renderer.render([item]);
    const buffer = device.drawCommands[0]?.vertexBuffer;
    expect(buffer).toBeInstanceOf(MockRenderBuffer);
    return buffer as MockRenderBuffer;
  };
  const dispose = (): void => {
    renderer.dispose();
    registry.dispose();
    for (const entry of entries) for (const resource of entry.resources) {
      resource.geometry.dispose();
      if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) resource.shadowGeometry.dispose();
      resource.material.dispose();
      if (resource.texturedMaterial && resource.texturedMaterial !== resource.material) resource.texturedMaterial.dispose();
    }
  };
  return { authored, entries, handle, frame, draw, dispose };
}

function floatAttribute(item: RenderItem, buffer: MockRenderBuffer, semantic: "position" | "normal", vertex = 0): number[] {
  const format = item.geometry.vertexBuffer.format;
  const attribute = format.getAttribute(semantic);
  const view = new DataView(buffer.bytes.buffer, buffer.bytes.byteOffset, buffer.bytes.byteLength);
  return [0, 1, 2].map((axis) => view.getFloat32(vertex * format.stride + attribute.offset + axis * 4, true));
}

describe("public custom primitive morph render path", () => {
  it("submits normal deltas as tuples and draws the weighted normal without changing authored arrays", async () => {
    const positions = Float32Array.from(raise);
    const normals = Float32Array.from(up);
    const positionsBefore = [...positions];
    const normalsBefore = [...normals];
    const f = await fixture([{ name: "bend", positions, normals }]);
    try {
      f.handle.setMorphTarget("bend", 0.5);
      const item = f.frame();
      expect(item.morphWeights).toEqual([0.5]);
      expect(item.morphTargets?.[0]?.positions).toEqual([[0, 0, 2], [0, 0, 2], [0, 0, 2]]);
      expect(item.morphTargets?.[0]?.normals).toEqual([[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
      const buffer = f.draw(item);
      expect(floatAttribute(item, buffer, "position")).toEqual([0, 0, 1]);
      const normal = floatAttribute(item, buffer, "normal");
      expect(normal[0]).toBeCloseTo(0);
      expect(normal[1]).toBeCloseTo(1 / Math.sqrt(5));
      expect(normal[2]).toBeCloseTo(2 / Math.sqrt(5));
      expect([...positions]).toEqual(positionsBefore);
      expect([...normals]).toEqual(normalsBefore);
    } finally { f.dispose(); }
  });

  it("refreshes cached tuples after in-place live position and normal edits", async () => {
    const positions = Float32Array.from(raise);
    const normals = Float32Array.from(up);
    const f = await fixture([{ name: "bend", positions, normals }]);
    try {
      f.handle.setMorphTarget("bend", 1);
      const first = f.frame();
      positions[2] = 3;
      normals[0] = 0.75;
      const second = f.frame();
      expect(first.morphTargets?.[0]?.positions?.[0]).toEqual([0, 0, 2]);
      expect(first.morphTargets?.[0]?.normals?.[0]).toEqual([0, 1, 0]);
      expect(second.morphTargets?.[0]?.positions?.[0]).toEqual([0, 0, 3]);
      expect(second.morphTargets?.[0]?.normals?.[0]).toEqual([0.75, 1, 0]);
      const buffer = f.draw(second);
      expect(floatAttribute(second, buffer, "position")).toEqual([0, 0, 3]);
      const normal = floatAttribute(second, buffer, "normal");
      const length = Math.hypot(0.75, 1, 1);
      expect(normal[0]).toBeCloseTo(0.75 / length);
      expect(normal[1]).toBeCloseTo(1 / length);
      expect(normal[2]).toBeCloseTo(1 / length);
    } finally { f.dispose(); }
  });

  it.each(["short", "nonfinite"] as const)("rejects a %s live channel even after a successful cached frame", async (invalid) => {
    const f = await fixture([{ name: "bend", positions: raise.slice(), normals: up.slice() }]);
    try {
      f.handle.setMorphTarget("bend", 1);
      expect(f.frame().morphTargets?.[0]?.normals).toHaveLength(3);
      const live = f.entries[0]!.resources[0]!.geometry.morphTargets![0]! as { normals: PackedChannel };
      if (invalid === "short") live.normals = Array.from(live.normals).slice(0, -1);
      else live.normals[2] = Number.NaN;
      expect(() => f.frame()).toThrow(invalid === "short" ? /one vec3 delta per vertex/i : /finite deltas/i);
    } finally { f.dispose(); }
  });

  it("rejects an active tangent delta when the custom geometry has no base tangent", async () => {
    const tangent = Float32Array.from([1, 0, 0, 1, 0, 0, 1, 0, 0]);
    const before = [...tangent];
    const f = await fixture([{ name: "twist", positions: Float32Array.from(noDelta), tangents: tangent }]);
    try {
      expect(f.entries[0]!.resources[0]!.geometry.vertexBuffer.format.hasAttribute("tangent")).toBe(false);
      f.handle.setMorphTarget("twist", 1);
      expect(() => f.frame()).toThrow(/MORPH_TANGENT_BASE_REQUIRED/);
      expect([...tangent]).toEqual(before);
    } finally { f.dispose(); }
  });

  it("allows a zero-weight tangent target beside an active position-only target", async () => {
    const tangent = Float32Array.from([1, 0, 0, 1, 0, 0, 1, 0, 0]);
    const f = await fixture([
      { name: "move", positions: Float32Array.from(raise) },
      { name: "twist", positions: Float32Array.from(noDelta), tangents: tangent }
    ]);
    try {
      f.handle.setMorphTargets({ move: 0.5, twist: 0 });
      const item = f.frame();
      expect(item.morphWeights).toEqual([0.5, 0]);
      expect(item.morphTargets?.[0]?.normals).toBeUndefined();
      expect(item.morphTargets?.[1]?.tangents).toEqual([[1, 0, 0], [1, 0, 0], [1, 0, 0]]);
      expect(floatAttribute(item, f.draw(item), "position")).toEqual([0, 0, 1]);
      expect([...tangent]).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0]);
    } finally { f.dispose(); }
  });
});
