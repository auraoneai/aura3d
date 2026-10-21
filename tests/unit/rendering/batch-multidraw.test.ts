/**
 * Parity-L5 L5-03 — the multi-draw route end to end on the CPU side:
 * draw-data flag packing, stable texture identity across updates, synthesized
 * marker items, BatchPlanCache routing + diagnostics, DrawSubmit's deferred
 * `multiDrawElementsInstanced` run, and the loop fallback that keeps identical
 * pixels when `WEBGL_multi_draw` is absent.
 */

import { describe, expect, it } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { DrawCommand, RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { Texture } from "../../../packages/rendering/src/Texture";

import {
  DRAW_DATA_GEOMETRY_ID_SHIFT,
  DRAW_DATA_VISIBLE_BIT,
  DrawDataTexture,
  packDrawDataFlags,
  unpackDrawDataFlags
} from "../../../packages/rendering/src/batching/DrawDataTexture";
import {
  buildMultiDrawBatch,
  multiDrawCommands,
  refreshMultiDrawBatch,
  submitMultiDrawBatch,
  synthesizeMultiDrawItems,
  type MultiDrawBatch
} from "../../../packages/rendering/src/batching/MultiDrawBatch";
import type { MultiDrawGroup } from "../../../packages/rendering/src/batching/StaticMergePlanner";
import { BatchPlanCache } from "../../../packages/rendering/src/renderer/CullingBatching";
import { flushMultiDrawQueue, submitDraw } from "../../../packages/rendering/src/forward/DrawSubmit";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { registerPrd11DrawIdShader } from "../../../packages/rendering/src/batching/shaders/drawId.glsl";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

function boxGeometry(dye = 0): Geometry {
  const vb = new VertexBuffer(VertexFormat.P3N3, 4);
  for (let i = 0; i < 4; i += 1) {
    vb.setAttribute(i, "position", [i - 0.5, dye, 0]);
    vb.setAttribute(i, "normal", [0, 0, 1]);
  }
  return new Geometry(vb, new IndexBuffer([0, 1, 2, 0, 2, 3], 6));
}

function pbr(): PBRMaterial {
  return new PBRMaterial({
    baseColor: [1, 1, 1, 1],
    renderState: {
      depthTest: true,
      depthWrite: true,
      cullMode: "back",
      blend: false,
      depthCompare: "less-equal"
    }
  });
}

function translate(x: number, y = 0, z = 0): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function item(geometry: Geometry, x = 0): RenderItem {
  return { geometry, material: pbr(), modelMatrix: translate(x), castShadow: true };
}

function groupOf(members: readonly RenderItem[]): MultiDrawGroup {
  return { key: "g", programKey: "p", vertexLayoutKey: "v", members };
}

describe("DrawDataTexture flag packing (L5 visibility + geometryId)", () => {
  it("packs visible bit + geometryId losslessly", () => {
    expect(unpackDrawDataFlags(packDrawDataFlags(true, 0))).toEqual({ visible: true, geometryId: 0 });
    expect(unpackDrawDataFlags(packDrawDataFlags(false, 7))).toEqual({ visible: false, geometryId: 7 });
    const packed = packDrawDataFlags(true, 42);
    expect(packed & DRAW_DATA_VISIBLE_BIT).toBe(1);
    expect(packed >> DRAW_DATA_GEOMETRY_ID_SHIFT).toBe(42);
  });

  it("upload() keeps ONE texture object — updates bump revision in place", () => {
    const data = new DrawDataTexture(2);
    data.setDraw(0, { model: translate(1), baseColor: [1, 0, 0, 1], meta: [0, 0, 6, packDrawDataFlags(true, 0)] });
    const first: Texture = data.upload();
    const rev0 = first.revision;
    data.setDraw(1, { model: translate(9), baseColor: [0, 1, 0, 1], meta: [6, 4, 6, packDrawDataFlags(false, 1)] });
    const second = data.upload();
    expect(second).toBe(first);
    expect(second.revision).toBeGreaterThan(rev0);
    // Marker items hold this object — a replaced texture would leave them
    // bound to a disposed texture; identity stability is the contract.
    expect(data.drawTexels(1)[12]).toBe(9);
    expect(unpackDrawDataFlags(data.drawTexels(1)[23]!).visible).toBe(false);
  });
});

describe("synthesizeMultiDrawItems + refreshMultiDrawBatch (L5-03)", () => {
  function batch(): MultiDrawBatch {
    const members = [item(boxGeometry(), 0), item(boxGeometry(1), 3), item(boxGeometry(2), -3)];
    return buildMultiDrawBatch(groupOf(members));
  }

  it("emits one marker per member: pooled geometry, drawRange, shared draw-data texture", () => {
    const b = batch();
    const items = synthesizeMultiDrawItems(b);
    expect(items).toHaveLength(3);
    const geometry = items[0]!.geometry;
    for (const [drawIndex, it] of items.entries()) {
      expect(it.geometry).toBe(geometry);
      const marker = (it as RenderItem & { multiDraw?: { mode: string; drawIndex: number; drawData: Texture } }).multiDraw;
      expect(marker?.mode).toBe("multi-draw");
      expect(marker?.drawIndex).toBe(drawIndex);
      expect(marker?.drawData).toBe(b.drawData.upload());
    }
    // Indexed members → drawRange over the shared index arena.
    expect(items[1]!.drawRange).toEqual({ start: b.entries[1]!.firstIndex, count: b.entries[1]!.indexCount });
  });

  it("refresh rewrites rows in place — no re-pack, no texture churn", () => {
    const b = batch();
    const texture = b.drawData.upload();
    const member = b.group.members[1]!;
    (member.modelMatrix as number[])[12] = 42;
    refreshMultiDrawBatch(b);
    expect(b.drawData.upload()).toBe(texture);
    expect(b.drawData.drawTexels(1)[12]).toBe(42);
  });

  it("submitMultiDrawBatch: extension → one call; absent → per-draw loop", () => {
    const b = batch();
    const device = new MockRenderDevice();
    const commands = multiDrawCommands(device, b);
    const calls: unknown[][] = [];
    (device as RenderDevice).multiDrawElementsInstanced = (draws) => { calls.push([...draws]); };
    device.beginFrame(8, 8);
    submitMultiDrawBatch(device, b, commands, true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(3);
    expect(device.drawCommands).toHaveLength(0);
    submitMultiDrawBatch(device, b, commands, false);
    expect(device.drawCommands).toHaveLength(3);
    device.endFrame();
  });
});

describe("BatchPlanCache multi-draw routing + diagnostics (L5-03)", () => {
  it("multiDrawAvailable → marker items + multiDrawMode 'multi-draw'", () => {
    const cache = new BatchPlanCache();
    const items = [item(boxGeometry(), 0), item(boxGeometry(1), 5)];
    const out = cache.apply(items, { multiDrawAvailable: true });
    const markers = out.filter((it) => (it as { multiDraw?: unknown }).multiDraw !== undefined);
    expect(markers.length).toBeGreaterThan(0);
    expect(cache.lastReport.multiDrawMode).toBe("multi-draw");
  });

  it("unavailable → honest fallback: no markers, mode 'unavailable'", () => {
    const cache = new BatchPlanCache();
    const items = [item(boxGeometry(), 0), item(boxGeometry(1), 5)];
    const out = cache.apply(items, { multiDrawAvailable: false });
    expect(out.every((it) => (it as { multiDraw?: unknown }).multiDraw === undefined)).toBe(true);
    expect(cache.lastReport.multiDrawMode).toBe("unavailable");
  });

  it("signature-hit refresh keeps marker identity stable across matrix churn", () => {
    const cache = new BatchPlanCache();
    const mutable = [...translate(0)] as number[];
    const items = [item(boxGeometry(), 0), { ...item(boxGeometry(1)), modelMatrix: mutable } as RenderItem];
    const first = cache.apply(items, { multiDrawAvailable: true });
    const marked0 = first.find((i) => (i as { multiDraw?: { drawData?: Texture } }).multiDraw) as { multiDraw?: { drawData?: Texture } } | undefined;
    const tex0 = marked0?.multiDraw?.drawData;
    mutable[12] = 11;
    const second = cache.apply(items, { multiDrawAvailable: true });
    expect(second).toBe(first);
    expect(cache.planVersion).toBe(1);
    const marked1 = second.find((i) => (i as { multiDraw?: { drawData?: Texture } }).multiDraw) as { multiDraw?: { drawData?: Texture } } | undefined;
    const tex1 = marked1?.multiDraw?.drawData;
    expect(tex1).toBe(tex0);
  });
});

describe("DrawSubmit deferred multi-draw run (#181 / L5)", () => {
  function submitFixture() {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const multiDrawCalls: unknown[][] = [];
    (device as RenderDevice).multiDrawElementsInstanced = (draws) => { multiDrawCalls.push([...draws]); };
    const pipeline = { createDrawCommand: (init: Record<string, unknown>) => ({ ...init }) as unknown as DrawCommand } as never;
    const geometry = boxGeometry();
    const vertexBuffer = device.createBuffer("vertex", 64);
    const indexBuffer = device.createBuffer("index", 64);
    const drawData = new DrawDataTexture(2);
    drawData.upload();
    const bindingsFor = (drawIndex: number): Parameters<typeof submitDraw>[5] => ({
      item: {
        geometry,
        material: pbr(),
        modelMatrix: translate(0),
        castShadow: true,
        multiDraw: { mode: "multi-draw", drawIndex, drawData: drawData.upload() }
      } as unknown as RenderItem,
      vertexBuffer,
      indexBuffer,
      drawRange: { start: drawIndex * 6, count: 6 },
      uniforms: new Map(),
      instanceBinding: { count: 1 }
    });
    return { device, multiDrawCalls, pipeline, geometry, vertexBuffer, indexBuffer, drawData, bindingsFor };
  }

  it("consecutive markers sharing a draw-data texture become ONE multiDrawElementsInstanced", () => {
    const { device, multiDrawCalls, pipeline, geometry, vertexBuffer, indexBuffer, bindingsFor } = submitFixture();
    submitDraw(device, pipeline, geometry, 1, { start: 0, count: 6 }, bindingsFor(0));
    submitDraw(device, pipeline, geometry, 1, { start: 6, count: 6 }, bindingsFor(1));
    expect(device.drawCommands).toHaveLength(0); // still queued
    expect(flushMultiDrawQueue(device)).toBe(2);
    expect(multiDrawCalls).toHaveLength(1);
    expect(multiDrawCalls[0]).toHaveLength(2);
    void vertexBuffer; void indexBuffer;
  });

  it("a non-marker draw flushes the pending run first (order preserved)", () => {
    const { device, multiDrawCalls, pipeline, geometry, vertexBuffer, indexBuffer, bindingsFor, drawData } = submitFixture();
    submitDraw(device, pipeline, geometry, 1, { start: 0, count: 6 }, bindingsFor(0));
    submitDraw(device, pipeline, geometry, 1, { start: 0, count: 6 }, {
      item: { geometry, material: pbr(), modelMatrix: translate(0), castShadow: true },
      vertexBuffer,
      indexBuffer,
      drawRange: { start: 0, count: 6 },
      uniforms: new Map(),
      instanceBinding: { count: 1 }
    });
    // Marker flushed (single → device.draw), then the plain draw.
    expect(device.drawCommands).toHaveLength(2);
    expect(multiDrawCalls).toHaveLength(0);
    flushMultiDrawQueue(device);
    void drawData;
  });
});

describe("ProgramGenerator multi-draw pragma (L5-03)", () => {
  it("emits #extension WEBGL_multi_draw only when the ext define is set", () => {
    registerPrd11DrawIdShader();
    const flags = resolveQrFlags({ options: ["tiers.batching"] });
    const program = (value: string) => generateProgramImpl(
      normalizeProgramFeatures({ pass: "forward", lighting: "unlit", features: { "prd11.drawId": value } } as Partial<ProgramFeatures>),
      { flags }
    );
    expect(program("multi-draw").vertex).toContain("#extension WEBGL_multi_draw");
    expect(program("uniform").vertex).not.toContain("#extension WEBGL_multi_draw");
  });
});
