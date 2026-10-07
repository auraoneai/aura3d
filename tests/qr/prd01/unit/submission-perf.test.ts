/**
 * Lane-01 §15 Phase-6 tests: submission performance.
 *
 *  - 6a: `ForwardPass.drawItem` serves a cached `RenderPipeline` per
 *    (shader, vertex format, topology, render state, required attributes) and
 *    a pooled uniform packet — `RenderPipeline.constructedCount` is flat after
 *    the first frame (the `prd01-draw-throughput` assertion).
 *  - 6b: generated-path instancing is attribute-matrix only — 10,000
 *    instances submit ONE draw and create ZERO buffers on frame 2
 *    (persistent per-device InstanceBuffer slots; `u_instanceMatrices` never
 *    enters the uniform packet).
 *  - 6c (§6.1, unflagged): disposing a `WebGL2Buffer` evicts every cached VAO
 *    that references its id — verified on `WebGL2DrawCallBinder` with a stub
 *    host (the GL calls are the browser lane's job; the eviction index is
 *    pure data structure).
 *  - MeshConsolidation: 576 static boxes sharing one material merge to a
 *    single render item with conserved vertex count (identical raster =
 *    same baked vertices, per the existing bake-parity suite).
 */

import { describe, expect, it } from "vitest";

import {
  ForwardPass,
  Geometry,
  MockRenderDevice,
  RenderPipeline,
  UnlitMaterial,
  consolidateStaticMeshes,
  type RenderBuffer,
  type RenderShaderProgram,
  type ShaderSources
} from "@aura3d/rendering";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { WebGL2Buffer } from "../../../../packages/rendering/src/WebGL2Device";
import { WebGL2DrawCallBinder } from "../../../../packages/rendering/src/webgl2/MultiDraw";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { composeMat4, type Mat4 } from "../../../../packages/scene/src";

const V2 = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const OFF = resolveQrFlags({ env: {} });

function executeFrame(device: MockRenderDevice, pass: ForwardPass): void {
  device.beginFrame(16, 16);
  pass.execute({ device, width: 16, height: 16 });
  device.endFrame();
}

class CountingDevice extends MockRenderDevice {
  public bufferCreates = 0;

  override createBuffer(usage: "vertex" | "index" | "uniform", byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.bufferCreates += 1;
    return super.createBuffer(usage, byteLength, initialData);
  }
}

describe("PRD-01 §15 Phase 6a — pipeline cache + uniform packet pool", () => {
  it("constructs zero RenderPipelines after the first frame on the generated path", () => {
    setRendererQrFlags(V2);
    try {
      const device = new CountingDevice();
      const item: RenderItem = { geometry: Geometry.box(), material: new UnlitMaterial({ name: "perf-unlit" }), label: "perf-item" };
      // Production rebuilds passes per frame — the caches are device-keyed.
      for (let frame = 0; frame < 4; frame += 1) {
        const before = RenderPipeline.constructedCount;
        executeFrame(device, new ForwardPass({ items: [item] }));
        const delta = RenderPipeline.constructedCount - before;
        if (frame === 0) expect(delta).toBeGreaterThan(0);
        else expect(delta).toBe(0);
      }
      device.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });

  it("keeps the same pipeline for a second item sharing shader+format+state", () => {
    setRendererQrFlags(V2);
    try {
      const device = new CountingDevice();
      const material = new UnlitMaterial({ name: "perf-shared" });
      const items: RenderItem[] = [
        { geometry: Geometry.box(), material, label: "a" },
        { geometry: Geometry.box(), material, label: "b" }
      ];
      const before = RenderPipeline.constructedCount;
      executeFrame(device, new ForwardPass({ items }));
      expect(RenderPipeline.constructedCount - before).toBe(1);
      device.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });
});

describe("PRD-01 §15 Phase 6b — attribute-matrix instancing only", () => {
  it("draws 10,000 instances in one draw and creates zero buffers after frame 1", () => {
    setRendererQrFlags(V2);
    try {
      const device = new CountingDevice();
      const transforms = new Float32Array(10_000 * 16);
      for (let i = 0; i < 10_000; i += 1) {
        const base = i * 16;
        transforms[base] = 1;
        transforms[base + 5] = 1;
        transforms[base + 10] = 1;
        transforms[base + 15] = 1;
        transforms[base + 12] = i % 100;
      }
      const item: RenderItem = {
        geometry: Geometry.box(),
        material: new UnlitMaterial({ name: "perf-instanced" }),
        instanceTransforms: transforms,
        label: "perf-10k"
      };

      executeFrame(device, new ForwardPass({ items: [item] }));
      const draws = device.drawCommands.filter((c) => (c.instanceCount ?? 1) > 1);
      expect(draws).toHaveLength(1);
      expect(draws[0]?.instanceCount).toBe(10_000);
      const matrixAttrs = draws[0]?.instanceAttributes?.filter((a) => a.shaderName.startsWith("a_instanceMatrix"));
      expect(matrixAttrs).toHaveLength(4);
      // Attribute path only: the generated program never declares the legacy
      // uniform array — `u_instanceMatrices` in the material packet is inert
      // (uploadUniforms skips non-reflected names), matrices ride the buffer.
      expect(draws[0]?.shader?.reflection.uniforms.has("u_instanceMatrices") ?? false).toBe(false);
      expect(draws[0]?.shader?.reflection.attributes.has("a_instanceMatrix0") ?? false).toBe(true);

      // Frame 2 (fresh pass, device-keyed pools): no new GL buffers at all.
      const buffersBefore = device.bufferCreates;
      executeFrame(device, new ForwardPass({ items: [item] }));
      expect(device.bufferCreates - buffersBefore).toBe(0);
      device.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });

  it("flag-off keeps the legacy uniform path (attribute instancing never engages)", () => {
    setRendererQrFlags(OFF);
    try {
      const device = new CountingDevice();
      const transforms = new Float32Array(4 * 16);
      transforms[0] = transforms[5] = transforms[10] = transforms[15] = 1;
      transforms[16] = transforms[21] = transforms[26] = transforms[31] = 1;
      transforms[32] = transforms[37] = transforms[42] = transforms[47] = 1;
      transforms[48] = transforms[53] = transforms[58] = transforms[63] = 1;
      const item: RenderItem = {
        geometry: Geometry.box(),
        material: new UnlitMaterial({ name: "perf-off" }),
        instanceTransforms: transforms,
        label: "perf-off-item"
      };
      executeFrame(device, new ForwardPass({ items: [item] }));
      const draws = device.drawCommands.filter((c) => (c.instanceCount ?? 1) > 1);
      // Legacy lean library supports the uniform path (u_instanceMatrices).
      for (const draw of draws) {
        expect(draw.instanceAttributes ?? []).toHaveLength(0);
        expect(draw.uniforms?.has("u_instanceMatrices") ?? false).toBe(true);
      }
      device.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });
});

// ── 6c: VAO eviction index (CONTRACTS §6.1 declared leak fix) ──────────────

interface StubHost {
  gl: {
    deleteBuffer(handle: object): void;
    readonly ARRAY_BUFFER: number;
    readonly ELEMENT_ARRAY_BUFFER: number;
    readonly FLOAT: number;
    readonly TRIANGLES: number;
    readonly LINES: number;
    readonly POINTS: number;
    deletedVertexArrays: number;
    createVertexArray(): object;
    bindVertexArray(handle: object | null): void;
    deleteVertexArray(handle: object): void;
    bindBuffer(target: number, handle: object): void;
    enableVertexAttribArray(location: number): void;
    disableVertexAttribArray(location: number): void;
    vertexAttribPointer(...args: unknown[]): void;
    vertexAttribDivisor(location: number, divisor: number): void;
    vertexAttrib4f(...args: unknown[]): void;
    vertexAttrib2f(...args: unknown[]): void;
  };
  stateCache: {
    bindVertexArray(handle: object | null, apply: () => void): void;
    bindBuffer(target: number, handle: object, apply: () => void): void;
  };
  counters: { vertexArrayCreateCount: number };
  buffers: Set<WebGL2Buffer>;
}

function stubHost(): StubHost {
  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    LINES: 0x0001,
    POINTS: 0x0000,
    deletedVertexArrays: 0,
    deleteBuffer: () => undefined,
    createVertexArray: () => ({}),
    bindVertexArray: () => undefined,
    deleteVertexArray: () => {
      gl.deletedVertexArrays += 1;
    },
    bindBuffer: () => undefined,
    enableVertexAttribArray: () => undefined,
    disableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    vertexAttribDivisor: () => undefined,
    vertexAttrib4f: () => undefined,
    vertexAttrib2f: () => undefined
  };
  return {
    gl,
    stateCache: {
      bindVertexArray: (_h, apply) => apply(),
      bindBuffer: (_t, _h, apply) => apply()
    },
    counters: { vertexArrayCreateCount: 0 },
    buffers: new Set<WebGL2Buffer>()
  };
}

function stubShader(id: number): RenderShaderProgram {
  return {
    id,
    label: "stub",
    marker: "stub",
    disposed: false,
    reflection: { attributes: new Map(), uniforms: new Set(), attributeDetails: new Map(), uniformDetails: new Map() },
    dispose(this: { disposed: boolean }) {
      this.disposed = true;
    }
  } as unknown as RenderShaderProgram;
}

function makeBuffer(host: StubHost, binder: WebGL2DrawCallBinder, id: number): WebGL2Buffer {
  const buffer = new WebGL2Buffer(id, "vertex", 16, 0, {} as WebGLBuffer, host.gl as unknown as WebGL2RenderingContext);
  // Mirror WebGL2Device.createBuffer's dispose wiring (the half under test).
  buffer.onDispose = () => {
    binder.evictVertexArraysForBuffer(buffer.id);
    host.buffers.delete(buffer);
  };
  host.buffers.add(buffer);
  return buffer;
}

describe("PRD-01 §15 Phase 6c — VAO eviction on RenderBuffer.dispose (§6.1)", () => {
  it("1,000 disposed instance buffers return the VAO map to baseline", () => {
    const host = stubHost();
    const binder = new WebGL2DrawCallBinder(host as never);
    const vertexBuffer = makeBuffer(host, binder, 1);
    const shader = stubShader(9);
    const baseline = binder.vertexArrayCache.size;

    const instanceBuffers: WebGL2Buffer[] = [];
    for (let i = 0; i < 1_000; i += 1) {
      const inst = makeBuffer(host, binder, 100 + i);
      instanceBuffers.push(inst);
      binder.bindVertexArrayForCommand(
        {
          vertexBuffer,
          vertexCount: 3,
          vertexFormat: VertexFormat.P3,
          topology: "triangles",
          instanceAttributes: [{ buffer: inst, shaderName: "a_instanceMatrix0", components: 4, offset: 0, stride: 64, divisor: 1 }]
        },
        shader as never,
        vertexBuffer
      );
    }
    expect(binder.vertexArrayCache.size).toBe(baseline + 1_000);
    expect(host.buffers.size).toBe(1_001);

    for (const buffer of instanceBuffers) buffer.dispose();
    expect(binder.vertexArrayCache.size).toBe(baseline);
    expect(host.gl.deletedVertexArrays).toBe(1_000);
    expect(host.buffers.size).toBe(1);
    expect(host.buffers.has(vertexBuffer)).toBe(true);
  });

  it("disposing the vertex buffer evicts every VAO it keys", () => {
    const host = stubHost();
    const binder = new WebGL2DrawCallBinder(host as never);
    const shader = stubShader(11);
    const vb1 = makeBuffer(host, binder, 1);
    const vb2 = makeBuffer(host, binder, 2);
    binder.bindVertexArrayForCommand({ vertexBuffer: vb1, vertexCount: 3, vertexFormat: VertexFormat.P3, topology: "triangles" }, shader as never, vb1);
    binder.bindVertexArrayForCommand({ vertexBuffer: vb2, vertexCount: 3, vertexFormat: VertexFormat.P3, topology: "triangles" }, shader as never, vb2);
    expect(binder.vertexArrayCache.size).toBe(2);
    vb1.dispose();
    expect(binder.vertexArrayCache.size).toBe(1);
    vb2.dispose();
    expect(binder.vertexArrayCache.size).toBe(0);
  });
});

// ── MeshConsolidation: 576 static boxes → single merged item ───────────────

describe("PRD-01 §15 Phase 6c — MeshConsolidation for static primitives", () => {
  it("576 static boxes consolidate to one render item with conserved vertex count", () => {
    const material = new UnlitMaterial({ name: "merged-boxes" });
    const inputs = Array.from({ length: 576 }, (_, i) => ({
      geometry: Geometry.litCube(1),
      material,
      modelMatrix: composeMat4([(i % 24) * 2, Math.floor(i / 24) * 2, 0], [0, 0, 0, 1], [1, 1, 1]) as Mat4
    }));
    const result = consolidateStaticMeshes(inputs);
    expect(result.inputItems).toBe(576);
    expect(result.submittedItems).toBe(1);
    expect(result.mergedMeshes).toBe(1);
    expect(result.drawCallReduction).toBe(575);

    // Same geometry through the same pass → same rasterized vertex stream:
    // the merged item's total vertex count equals 576 individual submissions.
    setRendererQrFlags(V2);
    try {
      const mergedDevice = new CountingDevice();
      executeFrame(mergedDevice, new ForwardPass({ items: result.renderItems }));
      const mergedVertexTotal = mergedDevice.drawCommands.reduce((sum, c) => sum + c.vertexCount, 0);
      const unmergedDevice = new CountingDevice();
      executeFrame(unmergedDevice, new ForwardPass({ items: inputs.map((i) => ({ geometry: i.geometry, material: i.material, modelMatrix: i.modelMatrix })) }));
      const unmergedVertexTotal = unmergedDevice.drawCommands.reduce((sum, c) => sum + c.vertexCount, 0);
      expect(mergedDevice.drawCommands.length).toBeLessThanOrEqual(unmergedDevice.drawCommands.length);
      expect(mergedVertexTotal).toBe(unmergedVertexTotal);
      mergedDevice.dispose();
      unmergedDevice.dispose();
    } finally {
      setRendererQrFlags(OFF);
    }
  });
});
