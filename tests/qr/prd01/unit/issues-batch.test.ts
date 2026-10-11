/**
 * Lane-01 01-ISSUES batch: one test per inbound issue this PR closes.
 *
 *  #36  barrel drops the deprecated `TerrainTile*` types and exports `toHeightTexture`.
 *  #90  Renderer scopes shadow + forward submission in C-28 FrameStats.
 *  #94  `invalidateGpuObjects()` forgets VAOs/uniform caches after context restore.
 *  #179 the rendering barrel re-exports `batching/`.
 *  #180 `multiDrawElementsInstanced` issues one `WEBGL_multi_draw` call.
 *  #181 DrawSubmit defers `item.multiDraw` members into one multi-draw; BVH batch cull hint.
 *  #198 `allShaderChunks()` enumerates every registered chunk.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import * as rendering from "../../../../packages/rendering/src";
import { Geometry, PBRMaterial, Renderer, type RenderSource } from "../../../../packages/rendering/src";
import * as batching from "../../../../packages/rendering/src/batching";
import { allShaderChunks, registerShaderChunk, shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import type { DrawCommand, RenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { WebGL2Buffer, WebGL2Device, WebGL2ShaderProgram } from "../../../../packages/rendering/src/WebGL2Device";
import { WebGL2Counters } from "../../../../packages/rendering/src/webgl2/Counters";
import { WebGL2DrawCallBinder, canMultiDraw } from "../../../../packages/rendering/src/webgl2/MultiDraw";
import { flushMultiDrawQueue, submitDraw } from "../../../../packages/rendering/src/forward/DrawSubmit";
import { cullBatchHints, excludeBatchedBvhItems, mergeBatchBounds } from "../../../../packages/rendering/src/performance/BVH";

const INDEX_TS = new URL("../../../../packages/rendering/src/index.ts", import.meta.url);

describe("#36 terrain barrel", () => {
  it("drops TerrainTileKey/Plan/GridOptions and exports toHeightTexture", () => {
    const source = readFileSync(INDEX_TS, "utf8");
    expect(source).not.toMatch(/\bTerrainTile(Key|Plan|GridOptions)\b/);
    expect(typeof rendering.toHeightTexture).toBe("function");
    const texture = rendering.toHeightTexture({ width: 2, height: 2, data: new Float32Array([0, 1, 2, 3]) } as never);
    expect(texture).toMatchObject({ width: 2, height: 2 });
    expect([...texture.data]).toEqual([0, 1, 2, 3]);
  });
});

describe("#90 FrameStats scopes", () => {
  it("Renderer.render scopes the shadow and forward phases", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, resolution: { dynamic: true } });
    try {
      const stats = renderer.frameStats;
      expect(stats).toBeDefined();
      const scope = vi.spyOn(stats!, "scope");
      const source: RenderSource = {
        renderItems: [{ geometry: Geometry.litCube(1), material: new PBRMaterial({ name: "issues-90" }), label: "issues-90" }]
      };
      renderer.render(source, undefined);
      const names = scope.mock.calls.map((call) => call[0]);
      expect(names).toContain("shadow");
      expect(names).toContain("forward");
    } finally {
      renderer.dispose();
    }
  });
});

// ── fake WebGL2 host (every GL call is a recorded no-op) ────────────────────

interface FakeHost {
  readonly host: Record<string, unknown>;
  readonly calls: { name: string; args: unknown[] }[];
}

function fakeHost(withMultiDraw: boolean): FakeHost {
  const calls: { name: string; args: unknown[] }[] = [];
  const ext = { multiDrawElementsInstancedWEBGL: (...args: unknown[]) => calls.push({ name: "multiDrawElementsInstancedWEBGL", args }) };
  let constant = 0x9000;
  const constants = new Map<string, number>();
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (/^[A-Z0-9_]+$/.test(prop)) {
        if (!constants.has(prop)) constants.set(prop, (constant += 1));
        return constants.get(prop);
      }
      if (prop === "getExtension") return (name: string) => (withMultiDraw && name === "WEBGL_multi_draw" ? ext : null);
      if (prop === "createVertexArray") return () => ({});
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return undefined;
      };
    }
  });
  const stateCache = new Proxy({} as Record<string, unknown>, {
    get: () => (...args: unknown[]) => {
      const apply = args[args.length - 1];
      if (typeof apply === "function") (apply as () => void)();
    }
  });
  const host: Record<string, unknown> = {
    gl,
    stateCache,
    counters: new WebGL2Counters(),
    buffers: new Set<WebGL2Buffer>(),
    shaders: new Set<WebGL2ShaderProgram>(),
    lifecycle: { assertFrame: () => undefined, readError: () => null },
    errorCheckMode: "frame",
    activeRenderTarget: null,
    maxVertexAttributes: 16,
    samplers: { activeTextureUnitIndex: 3, textureUnitBindings: new Map([["0", {}]]) }
  };
  return { host, calls };
}

function shader(host: Record<string, unknown>, uniforms: string[] = []): WebGL2ShaderProgram {
  const program = new WebGL2ShaderProgram(1, "md", "md", {
    attributes: new Map(), uniforms: new Set(uniforms), attributeDetails: new Map(), uniformDetails: new Map()
  } as never, {} as WebGLProgram, host.gl as never);
  (host.shaders as Set<WebGL2ShaderProgram>).add(program);
  return program;
}

function buffer(host: Record<string, unknown>, id: number): WebGL2Buffer {
  const b = new WebGL2Buffer(id, "vertex", 64, 0, {} as WebGLBuffer, host.gl as never);
  (host.buffers as Set<WebGL2Buffer>).add(b);
  return b;
}

function commands(host: Record<string, unknown>, program: WebGL2ShaderProgram, n: number): DrawCommand[] {
  const vb = buffer(host, 1);
  const ib = buffer(host, 2);
  const shared = { texture: "draw-data" };
  return Array.from({ length: n }, (_, i) => ({
    label: `m${i}`, topology: "triangles", vertexBuffer: vb, vertexFormat: VertexFormat.P3, vertexCount: 24,
    indexBuffer: ib, indexType: "uint16", indexCount: 36, firstIndex: i * 36, shader: program,
    uniforms: new Map<string, unknown>([["u_drawId", i], ["u_a3dDrawData", shared]])
  }) as unknown as DrawCommand);
}

describe("#180 WEBGL_multi_draw binding", () => {
  it("issues one multiDrawElementsInstancedWEBGL call for compatible entries", () => {
    const { host, calls } = fakeHost(true);
    const binder = new WebGL2DrawCallBinder(host as never);
    const draws = commands(host, shader(host), 5);
    binder.multiDrawElementsInstanced(draws);
    const multi = calls.filter((c) => c.name === "multiDrawElementsInstancedWEBGL");
    expect(multi).toHaveLength(1);
    const [, counts, , , offsets, , instances, , drawCount] = multi[0]!.args as [number, Int32Array, number, number, Int32Array, number, Int32Array, number, number];
    expect(drawCount).toBe(5);
    expect([...counts]).toEqual([36, 36, 36, 36, 36]);
    expect([...offsets]).toEqual([0, 72, 144, 216, 288]); // uint16 → 2 bytes per index
    expect([...instances]).toEqual([1, 1, 1, 1, 1]);
    expect(calls.some((c) => c.name === "drawElements")).toBe(false);
    const counters = host.counters as WebGL2Counters;
    expect(counters.drawCalls).toBe(1);
    expect(counters.multiDrawSubmissions).toBe(1);
    expect(counters.multiDrawMembers).toBe(5);
  });

  it("falls back to one draw per entry without the extension", () => {
    const { host, calls } = fakeHost(false);
    const binder = new WebGL2DrawCallBinder(host as never);
    binder.multiDrawElementsInstanced(commands(host, shader(host), 4));
    expect(calls.filter((c) => c.name === "drawElements")).toHaveLength(4);
    expect((host.counters as WebGL2Counters).drawCalls).toBe(4);
  });

  it("refuses a u_drawId loop program and mismatched entries", () => {
    const { host } = fakeHost(true);
    const loopProgram = shader(host, ["u_drawId"]);
    expect(canMultiDraw(commands(host, loopProgram, 3))).toBe(false);
    const draws = commands(host, shader(host), 3);
    expect(canMultiDraw(draws)).toBe(true);
    const mismatched = [...draws];
    mismatched[1] = { ...draws[1]!, uniforms: new Map<string, unknown>([["u_drawId", 1], ["u_a3dDrawData", { other: true }]]) } as DrawCommand;
    expect(canMultiDraw(mismatched)).toBe(false);
  });
});

describe("#94 invalidateGpuObjects", () => {
  it("clears the VAO cache so liveVertexArrays reads 0 and VAOs recreate lazily", () => {
    const { host } = fakeHost(false);
    const binder = new WebGL2DrawCallBinder(host as never);
    host.drawBinder = binder;
    const draws = commands(host, shader(host), 1);
    binder.draw(draws[0]!);
    expect(binder.vertexArrayCache.size).toBe(1);
    const invalidate = vi.fn();
    host.stateCache = new Proxy({}, { get: (_t, prop) => (prop === "invalidate" ? invalidate : (...a: unknown[]) => (a.at(-1) as () => void)?.()) });
    WebGL2Device.prototype.invalidateGpuObjects.call({ host } as never);
    expect(binder.vertexArrayCache.size).toBe(0);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const samplers = host.samplers as { activeTextureUnitIndex: number; textureUnitBindings: Map<string, unknown> };
    expect(samplers.activeTextureUnitIndex).toBe(-1);
    expect(samplers.textureUnitBindings.size).toBe(0);
    const creates = (host.counters as WebGL2Counters).vertexArrayCreateCount;
    binder.draw(draws[0]!);
    expect((host.counters as WebGL2Counters).vertexArrayCreateCount).toBe(creates + 1);
  });
});

describe("#179 batching barrel", () => {
  it("re-exports the batching module from @aura3d/rendering", () => {
    for (const name of ["planBatches", "BatchedGeometryPool", "DrawDataTexture", "buildMultiDrawBatch", "multiDrawCommands", "submitMultiDrawBatch", "geometryContentKey", "REASONS_NOT_BATCHED", "DRAW_DATA_TEXELS_PER_DRAW"] as const) {
      expect((rendering as Record<string, unknown>)[name]).toBe((batching as Record<string, unknown>)[name]);
    }
  });
});

describe("#181 DrawSubmit multi-draw fast path + BVH batch cull", () => {
  function fakeDevice(): RenderDevice & { draws: DrawCommand[]; multi: DrawCommand[][] } {
    const device = { draws: [] as DrawCommand[], multi: [] as DrawCommand[][] };
    return Object.assign(device, {
      draw: (c: DrawCommand) => device.draws.push(c),
      multiDrawElementsInstanced: (c: readonly unknown[]) => device.multi.push([...(c as DrawCommand[])])
    }) as never;
  }
  const pipeline = { createDrawCommand: (o: object) => ({ ...o }) } as never;
  const geometry = Geometry.litCube(1);
  function submit(device: RenderDevice, label: string, multiDraw?: object): void {
    const item = { label, geometry, ...(multiDraw ? { multiDraw } : {}) } as never;
    const range = { start: 0, count: 36 };
    submitDraw(device, pipeline, geometry, 1, range, { item, vertexBuffer: {} as never, indexBuffer: undefined, drawRange: range, uniforms: new Map(), instanceBinding: { count: 1 } });
  }

  it("defers consecutive members into one multi-draw and keeps order around plain draws", () => {
    const device = fakeDevice();
    const drawData = { id: "dd" };
    submit(device, "plain-a");
    submit(device, "m0", { mode: "multi-draw", drawIndex: 0, drawData });
    submit(device, "m1", { mode: "multi-draw", drawIndex: 1, drawData });
    submit(device, "m2", { mode: "multi-draw", drawIndex: 2, drawData });
    submit(device, "plain-b");
    expect(device.draws.map((c) => c.label)).toEqual(["plain-a", "plain-b"]);
    expect(device.multi.map((run) => run.map((c) => c.label))).toEqual([["m0", "m1", "m2"]]);
    expect(flushMultiDrawQueue(device)).toBe(0);
  });

  it("loop-mode members and a trailing single member draw normally", () => {
    const device = fakeDevice();
    submit(device, "loop", { mode: "loop", drawIndex: 0 });
    submit(device, "solo", { mode: "multi-draw", drawIndex: 0, drawData: {} });
    expect(flushMultiDrawQueue(device)).toBe(1);
    expect(device.draws.map((c) => c.label)).toEqual(["loop", "solo"]);
    expect(device.multi).toHaveLength(0);
  });

  it("culls a BatchPlan group once against merged bounds and skips its BVH nodes", () => {
    const boxes = [0, 1, 2].map((i) => ({ id: `b${i}`, bounds: { min: [i, 0, 0] as const, max: [i + 1, 1, 1] as const } }));
    const hint = { id: "g", bounds: mergeBatchBounds(boxes.map((b) => b.bounds)), memberIds: ["b0", "b1", "b2"] };
    expect(hint.bounds).toEqual({ min: [0, 0, 0], max: [3, 1, 1] });
    expect(excludeBatchedBvhItems([...boxes, { id: "solo", bounds: boxes[0]!.bounds }], [hint]).map((b) => b.id)).toEqual(["solo"]);
    const isVisible = vi.fn((bounds: { min: readonly number[] }) => bounds.min[0]! < 10);
    const result = cullBatchHints([hint], isVisible);
    expect(result.tests).toBe(1);
    expect(isVisible).toHaveBeenCalledTimes(1);
    expect(result.visibleMemberIds).toEqual(["b0", "b1", "b2"]);
    expect(cullBatchHints([hint], () => false).visibleMemberIds).toEqual([]);
  });
});

describe("#198 allShaderChunks", () => {
  it("enumerates every registered chunk as a snapshot", () => {
    const name = `qr01_issue198_${Date.now()}`;
    const before = allShaderChunks();
    registerShaderChunk({ name, owner: "prd01", glsl: "// #198", stage: "fragment" } as never);
    const after = allShaderChunks();
    expect(after.length).toBe(before.length + 1);
    expect(before.some((c) => c.name === name)).toBe(false);
    expect(after.find((c) => c.name === name)).toBe(shaderChunk(name));
    for (const chunk of after) expect(shaderChunk(chunk.name)).toBe(chunk);
  });
});
