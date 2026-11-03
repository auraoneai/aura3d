/**
 * Parity-L5 L5-03 — the multi-draw route end to end on the CPU side:
 * draw-data flag packing, stable texture identity across updates, synthesized
 * marker items, BatchPlanCache routing + diagnostics, and synchronous
 * uniform-index submission while deferred forward batching is disabled.
 */

import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import {
  buildMultiDrawBatch,
  multiDrawCommands,
  refreshMultiDrawBatch,
  submitMultiDrawBatch,
  synthesizeMultiDrawItems,
  type MultiDrawBatch
} from "../../../packages/rendering/src/batching/MultiDrawBatch";
import type { MultiDrawGroup } from "../../../packages/rendering/src/batching/StaticMergePlanner";
import { BatchPlanCache, deviceSupportsMultiDraw } from "../../../packages/rendering/src/renderer/CullingBatching";
import { flushMultiDrawQueue, submitDraw } from "../../../packages/rendering/src/forward/DrawSubmit";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { selectShaderFeatureBits } from "../../../packages/rendering/src/program/FeatureSelect";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { registerPrd11DrawIdShader } from "../../../packages/rendering/src/batching/shaders/drawId.glsl";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerBatchedDrawShader } from "../../../packages/engine/src/agent-api/nodes/batched";
import { createEngineBatchInstanceItem, createEnginePackedBatchItem } from "../../../packages/rendering/src/batching/BatchMembers";

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

describe("BatchedGeometryPool materialization lifetime", () => {
  it("keeps old materializations live through repacking and releases them with the pool", () => {
    const first = boxGeometry();
    const second = boxGeometry(1);
    const device = new MockRenderDevice();
    const pool = new BatchedGeometryPool();
    pool.pack(first);
    const original = pool.asGeometry();
    const firstBuffer = original.vertexBuffer.upload(device);
    pool.pack(second);
    const repacked = pool.asGeometry();
    const secondBuffer = repacked.vertexBuffer.upload(device);
    const customBounds = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
    const rebound = pool.asGeometry(customBounds);
    const thirdBuffer = rebound.vertexBuffer.upload(device);
    expect([firstBuffer, secondBuffer, thirdBuffer].map((buffer) => buffer.disposed)).toEqual([false, false, false]);
    pool.dispose();
    expect([firstBuffer, secondBuffer, thirdBuffer].map((buffer) => buffer.disposed)).toEqual([true, true, true]);
    // Source geometry is borrowed; retiring the pool must leave it usable.
    expect(first.vertexBuffer.upload(device).disposed).toBe(false);
    first.dispose(); second.dispose(); device.dispose();
  });
});

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

  it("stores only the member tint alongside the material color and folds single-instance transforms", () => {
    const materialColor = [0.5, 0.25, 0.75, 0.5] as const;
    const material = new PBRMaterial({ baseColor: materialColor });
    const otherMaterial = new PBRMaterial({ baseColor: [0.25, 0.75, 0.5, 1] });
    const geometries = [boxGeometry(), boxGeometry(1), boxGeometry(2)];
    const colors = [new Float32Array([0.25, 0.5, 0.75, 0.5]), new Float32Array([0.75, 0.25, 0.5, 1])];
    const scaledModel = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 10, 20, 30, 1];
    const members: RenderItem[] = [
      { geometry: geometries[0]!, material, modelMatrix: scaledModel, instanceTransforms: translate(5, 6, 7), instanceColors: colors[0]! },
      { geometry: geometries[1]!, material, modelMatrix: translate(1), instanceTransforms: translate(2), instanceColors: colors[1]!, instanceCount: 1 },
      { geometry: geometries[2]!, material: otherMaterial, modelMatrix: translate(0) }
    ];
    const packed = buildMultiDrawBatch(groupOf(members));
    try {
      const texture = packed.drawData.upload();
      const markers = synthesizeMultiDrawItems(packed);
      const rowColor = (index: number) => Array.from(packed.drawData.drawTexels(index).slice(16, 20));
      expect(rowColor(0)).toEqual([0.25, 0.5, 0.75, 0.5]);
      expect(rowColor(1)).toEqual([0.75, 0.25, 0.5, 1]);
      expect(rowColor(2)).toEqual([1, 1, 1, 1]);
      expect(Array.from(packed.drawData.drawTexels(0).slice(0, 16))).toEqual([
        2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 20, 38, 58, 1
      ]);
      expect(packed.drawData.drawTexels(1)[12]).toBe(3);
      expect(markers.map((marker) => marker.material)).toEqual([material, material, otherMaterial]);
      expect(markers.every((marker) => marker.instanceColors === undefined && marker.instanceTransforms === undefined)).toBe(true);
      expect(Array.from(material.getParameter("u_baseColor") as ArrayLike<number>)).toEqual(materialColor);
      expect(rowColor(0).map((value, index) => value * materialColor[index]!)).toEqual([0.125, 0.125, 0.5625, 0.25]);
      expect(rowColor(1).map((value, index) => value * materialColor[index]!)).toEqual([0.375, 0.0625, 0.375, 0.5]);

      colors[0]![0] = 1;
      (members[0]!.instanceTransforms as number[])[12] = 6;
      refreshMultiDrawBatch(packed);
      expect(packed.drawData.upload()).toBe(texture);
      expect(rowColor(0)).toEqual([1, 0.5, 0.75, 0.5]);
      expect(packed.drawData.drawTexels(0)[12]).toBe(22);
    } finally {
      packed.pool.dispose(); packed.drawData.dispose();
      geometries.forEach((geometry) => geometry.dispose()); material.dispose(); otherMaterial.dispose();
    }
  });

  it("rejects colors or transforms that one draw-data row cannot represent", () => {
    const geometry = boxGeometry(), material = pbr();
    const single = { geometry, material, instanceTransforms: translate(0), instanceColors: [1, 0.5, 0.25, 1] };
    try {
      expect(() => buildMultiDrawBatch(groupOf([{ ...single, instanceTransforms: [...translate(0), ...translate(1)] }]))).toThrow(/one finite model and instance matrix/);
      expect(() => buildMultiDrawBatch(groupOf([{ ...single, instanceColors: [1, 0.5, 0.25] }]))).toThrow(/one finite RGBA/);
      expect(() => buildMultiDrawBatch(groupOf([{ ...single, instanceCount: 2 }]))).toThrow(/single instance/);
      material.setParameter("u_a3dInstanceColorTarget", 1);
      expect(() => buildMultiDrawBatch(groupOf([single]))).toThrow(/base color target/);
    } finally { geometry.dispose(); material.dispose(); }
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

describe("R-10 device-capability gate (WEBGL_multi_draw)", () => {
  function capableDevice(multiDraw: boolean): RenderDevice {
    const device = new MockRenderDevice() as unknown as RenderDevice;
    Object.defineProperty(device, "probe", { value: { multiDraw }, configurable: true });
    device.multiDrawElementsInstanced = () => undefined;
    return device;
  }
  const quad = (n: number): RenderItem[] => Array.from({ length: n }, (_, i) => item(boxGeometry(i), i * 3));

  it("deviceSupportsMultiDraw: probe flag + entry point; no device or no entry point is false", () => {
    expect(deviceSupportsMultiDraw(undefined)).toBe(false);
    expect(deviceSupportsMultiDraw(new MockRenderDevice() as unknown as RenderDevice)).toBe(false); // no entry point
    expect(deviceSupportsMultiDraw(capableDevice(true))).toBe(true);
    expect(deviceSupportsMultiDraw(capableDevice(false))).toBe(false); // probed absent extension
    expect(deviceSupportsMultiDraw({ multiDrawElementsInstanced: () => undefined })).toBe(true); // unprobed double
  });

  it("explicit multiDrawAvailable still wins over the device", () => {
    const cache = new BatchPlanCache();
    cache.apply(quad(3), { multiDrawAvailable: true, device: capableDevice(false) });
    expect(cache.lastReport.multiDrawMode).toBe("multi-draw");
    const off = new BatchPlanCache();
    off.apply(quad(3), { multiDrawAvailable: false, device: capableDevice(true) });
    expect(off.lastReport.multiDrawMode).toBe("unavailable");
  });

  describe("without an explicit option (generated-program path on)", () => {
    const generated = createTrustedQrFlags({ A3D_QR_CORE_GENERATOR: true });
    const none = createTrustedQrFlags({});
    function withGeneratedPrograms<T>(run: () => T): T {
      setRendererQrFlags(generated);
      try { return run(); } finally { setRendererQrFlags(none); }
    }

    it("extension absent → 'unavailable', no markers, draw count = one draw per item", () => {
      withGeneratedPrograms(() => {
        const cache = new BatchPlanCache();
        const device = capableDevice(false);
        const out = cache.apply(quad(4), { device });
        expect(cache.lastReport.multiDrawMode).toBe("unavailable");
        expect(out.every((it) => (it as { multiDraw?: unknown }).multiDraw === undefined)).toBe(true);
        expect(cache.lastReport.multiDrawBatches).toBe(0);
        expect(cache.lastReport.outputDraws).toBe(out.length);
      });
    });

    it("extension present → 'multi-draw'; outputDraws equals device submissions (one call per group)", () => {
      withGeneratedPrograms(() => {
        const cache = new BatchPlanCache();
        const device = capableDevice(true);
        const calls: unknown[][] = [];
        device.multiDrawElementsInstanced = (draws) => { calls.push([...draws]); };
        const out = cache.apply(quad(4), { device });
        expect(cache.lastReport.multiDrawMode).toBe("multi-draw");
        expect(cache.lastReport.multiDrawBatches).toBeGreaterThan(0);
        // Submit exactly what the planner emitted: markers sharing a group go
        // through ONE multiDrawElementsInstanced call, everything else is a draw.
        const markers = out.filter((it) => (it as { multiDraw?: unknown }).multiDraw !== undefined);
        const others = out.length - markers.length;
        const groups = new Set(markers.map((it) => (it as unknown as { multiDraw: { drawData: unknown } }).multiDraw.drawData));
        device.beginFrame(8, 8);
        for (const g of groups) {
          const members = markers.filter((it) => (it as unknown as { multiDraw: { drawData: unknown } }).multiDraw.drawData === g);
          device.multiDrawElementsInstanced?.(members as unknown as readonly DrawCommand[]);
        }
        device.endFrame();
        expect(calls.length + others).toBe(cache.lastReport.outputDraws);
      });
    });

    it("plan is rebuilt when device capability changes under an unchanged item list", () => {
      withGeneratedPrograms(() => {
        const cache = new BatchPlanCache();
        const items = quad(4);
        cache.apply(items, { device: capableDevice(true) });
        expect(cache.lastReport.multiDrawMode).toBe("multi-draw");
        const v = cache.planVersion;
        cache.apply(items, { device: capableDevice(false) });
        expect(cache.planVersion).toBe(v + 1);
        expect(cache.lastReport.multiDrawMode).toBe("unavailable");
      });
    });
  });

  it("generated-program path off → unavailable even on a capable device", () => {
    const cache = new BatchPlanCache();
    cache.apply(quad(4), { device: capableDevice(true) });
    expect(cache.lastReport.multiDrawMode).toBe("unavailable");
  });
});

describe("DrawSubmit synchronous multi-draw fallback", () => {
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

  it("submits each marked draw before later callbacks and honors a public draw override", () => {
    const { device, multiDrawCalls, pipeline, geometry, vertexBuffer, indexBuffer, bindingsFor } = submitFixture();
    const events: string[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => { events.push(`first-draw:${command.firstIndex ?? 0}`); draw(command); };
    submitDraw(device, pipeline, geometry, 1, { start: 0, count: 6 }, bindingsFor(0));
    events.push("later-callback");
    device.draw = (command) => { events.push(`replacement-draw:${command.firstIndex ?? 0}`); draw(command); };
    submitDraw(device, pipeline, geometry, 1, { start: 6, count: 6 }, bindingsFor(1));
    expect(events).toEqual(["first-draw:0", "later-callback", "replacement-draw:6"]);
    expect(device.drawCommands).toHaveLength(2);
    expect(flushMultiDrawQueue(device)).toBe(0);
    expect(multiDrawCalls).toHaveLength(0);
    void vertexBuffer; void indexBuffer;
  });

  it("does not inspect a multi-draw marker for eligibility", () => {
    const { device, multiDrawCalls, pipeline, geometry, vertexBuffer, indexBuffer, bindingsFor, drawData } = submitFixture();
    const marked = bindingsFor(0);
    Object.defineProperty(marked.item, "multiDraw", { get: () => { throw new Error("marker getter evaluated"); } });
    submitDraw(device, pipeline, geometry, 1, { start: 0, count: 6 }, marked);
    submitDraw(device, pipeline, geometry, 1, { start: 0, count: 6 }, {
      item: { geometry, material: pbr(), modelMatrix: translate(0), castShadow: true },
      vertexBuffer,
      indexBuffer,
      drawRange: { start: 0, count: 6 },
      uniforms: new Map(),
      instanceBinding: { count: 1 }
    });
    expect(device.drawCommands).toHaveLength(2);
    expect(multiDrawCalls).toHaveLength(0);
    expect(flushMultiDrawQueue(device)).toBe(0);
    void drawData;
  });
});

describe("ProgramGenerator multi-draw pragma (L5-03)", () => {
  it("emits #extension GL_ANGLE_multi_draw only when the ext define is set", () => {
    registerPrd11DrawIdShader();
    const flags = resolveQrFlags({ options: ["tiers.batching"] });
    const program = (value: string) => generateProgramImpl(
      normalizeProgramFeatures({ pass: "forward", lighting: "unlit", features: { "prd11.drawId": value } } as Partial<ProgramFeatures>),
      { flags }
    );
    expect(program("multi-draw").vertex).toContain("#extension GL_ANGLE_multi_draw");
    const loop = program("uniform");
    expect(loop.vertex).not.toContain("#extension GL_ANGLE_multi_draw");
    expect(loop.defines.A3D_PRD11_MULTI_DRAW_EXT).toBeUndefined();
    expect(loop.vertex).toContain("uniform highp int u_drawId;");
    if (spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0) {
      const dir = mkdtempSync(join(tmpdir(), "aura3d-drawid-loop-"));
      try {
        const vertex = join(dir, "source.vert"), fragment = join(dir, "source.frag");
        writeFileSync(vertex, loop.vertex); writeFileSync(fragment, loop.fragment);
        const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(linked).toContain("u_drawId");
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it("selects uniform-index variants for forward draw and warmup inputs", () => {
    registerPrd11DrawIdShader();
    registerBatchedDrawShader();
    const geometry = boxGeometry(), material = pbr();
    const marked = { geometry, material, multiDraw: { mode: "multi-draw", drawIndex: 2 } } as unknown as RenderItem;
    try {
      for (const [flag, id] of [["A3D_QR_TIERS_BATCHING", "prd11.drawId"], ["A3D_PARITY_BATCHING", "parity.batchDraw"]] as const) {
        const flags = createTrustedQrFlags({ [flag]: true });
        const selected = selectShaderFeatureBits({ item: marked, pass: "forward", flags, tier: QUALITY_TIERS.high });
        expect(selected[id]).toBe("loop");
        const generated = generateProgramImpl(normalizeProgramFeatures({ pass: "forward", lighting: "lit", features: selected }), { flags });
        expect(generated.defines.A3D_L5_MULTI_DRAW).toBeUndefined();
        expect(generated.defines.A3D_PRD11_MULTI_DRAW_EXT).toBeUndefined();
        expect(generated.vertex).toContain("uniform highp int u_drawId;");
      }
    } finally { geometry.dispose(); material.dispose(); }
  });

  it("rejects unproven direct packed ForwardPass items before submission", () => {
    registerPrd11DrawIdShader();
    const device = new MockRenderDevice(), geometry = boxGeometry(), material = pbr(), drawData = new DrawDataTexture(2);
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_TIERS_BATCHING: true });
    setRendererQrFlags(flags, device);
    const events: string[] = [];
    const texture = drawData.upload();
    const items = [0, 1].map((drawIndex) => ({ geometry, material, modelMatrix: translate(0),
      multiDraw: { mode: "multi-draw", drawIndex, drawData: texture },
      onBeforeRender: () => { events.push(`before:${drawIndex}`); } } as unknown as RenderItem));
    const draw = device.draw.bind(device);
    device.draw = (command) => { events.push(`draw:${command.uniforms?.get("u_drawId")}`); draw(command); };
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items }).execute({ device, width: 8, height: 8 }))
        .toThrow(/Packed draw rows require authenticated logical members/);
      expect(events).toEqual(["before:0"]);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); drawData.dispose(); device.dispose(); }
  });

  it("rejects a known packed carrier before earlier logical callbacks or draws", () => {
    const device = new MockRenderDevice(), geometry = boxGeometry(), material = pbr();
    let callbacks = 0;
    const first = { geometry, material, onBeforeRender: () => { callbacks += 1; } };
    const packed = createEnginePackedBatchItem({ geometry, material, multiDraw: { mode: "loop", drawIndex: 0 } });
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [first, packed] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/Packed draw rows require authenticated logical members/);
      expect(callbacks).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects per-member clipping callbacks on instance buckets before any callback or draw", () => {
    const device = new MockRenderDevice(), geometry = boxGeometry(), material = pbr();
    let callbacks = 0;
    const first = { geometry, material, onBeforeRender: () => { callbacks += 1; } };
    const bucket = createEngineBatchInstanceItem({ geometry, material, instanceTransforms: new Float32Array(translate(0)) });
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [first, bucket], materialClippingFor: () => { callbacks += 1; return undefined; } })
        .execute({ device, width: 8, height: 8 })).toThrow(/Per-member materialClippingFor/);
      expect(callbacks).toBe(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });
});
