import { describe, expect, it, vi } from "vitest";
import { DeferredPipeline, nativeDrawingSceneFromRenderItems, prepareNativeDrawing, type NativeDrawingFrame, type NativeDrawingScene } from "../../../packages/rendering/src/webgpu/DeferredPipeline";
import { buildMeshlets, meshletIntersectsFrustum, MeshletPipeline } from "../../../packages/rendering/src/webgpu/MeshletPipeline";
import { VisibilityBufferPipeline } from "../../../packages/rendering/src/webgpu/VisibilityBufferPipeline";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function scene(): NativeDrawingScene {
  return {
    positions: new Float32Array([-.75,-.75,0, 0,-.75,0, -.35,.75,0, .05,-.75,0, .8,-.75,0, .4,.75,0]),
    normals: new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1]),
    indices: new Uint16Array([0,1,2,3,4,5]), triangleMaterials: new Uint32Array([0,1]),
    materials: [{ baseColor: [1, 0, 0, 1], shading: "unlit" }, { baseColor: [0, 1, 0, 1], emissive: [.1, 0, 0], shading: "lambert" }]
  };
}
function frame(): NativeDrawingFrame { return { scene: scene(), surface: { view: {}, width: 8, height: 8 }, viewProjection: identity }; }
function device(limits: Record<string, number> = {}) {
  const resources: { descriptor: Record<string, unknown>; destroy: ReturnType<typeof vi.fn> }[] = [];
  const pipelines: Record<string, unknown>[] = [];
  const modules: string[] = [];
  const uploads: Uint8Array[] = [];
  const passes: { descriptor: Record<string, unknown>; draws: number[][]; groups: unknown[]; indirect: number[] }[] = [];
  const computeDispatches: number[] = [];
  const commandOrder: string[] = [];
  let finish!: () => void;
  const completion = new Promise<void>(resolve => { finish = resolve; });
  const native = {
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxStorageBuffersPerShaderStage: 8, ...limits },
    queue: {
      writeBuffer: vi.fn((_buffer: unknown, _offset: number, data: ArrayBufferView) => uploads.push(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)))),
      submit: vi.fn(), onSubmittedWorkDone: () => completion
    },
    createBuffer(descriptor: Record<string, unknown>) { const buffer = { descriptor, destroy: vi.fn() }; resources.push(buffer); return buffer; },
    createTexture(descriptor: Record<string, unknown>) { const texture = { descriptor, destroy: vi.fn(), createView: () => ({ texture }) }; resources.push(texture); return texture; },
    createShaderModule({ code }: { code: string }) { modules.push(code); return { code }; },
    createRenderPipeline(descriptor: Record<string, unknown>) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createComputePipeline(descriptor: Record<string, unknown>) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createBindGroup(descriptor: Record<string, unknown>) { return descriptor; },
    createCommandEncoder() { return { beginComputePass() { return { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups(count: number) { computeDispatches.push(count); commandOrder.push("dispatch"); }, end() { commandOrder.push("end-compute"); } }; }, beginRenderPass(descriptor: Record<string, unknown>) {
      const trace: { descriptor: Record<string, unknown>; draws: number[][]; groups: unknown[]; indirect: number[] } = { descriptor, draws: [], groups: [], indirect: [] }; passes.push(trace);
      return { setPipeline() {}, setBindGroup(_index: number, group: unknown) { trace.groups.push(group); }, setVertexBuffer() {}, draw(...args: number[]) { trace.draws.push(args); }, drawIndirect(_buffer: unknown, offset: number) { trace.indirect.push(offset); commandOrder.push("draw-indirect"); }, end() {} };
    }, finish: () => ({}) }; }
  };
  return { native, resources, pipelines, modules, uploads, passes, computeDispatches, commandOrder, finish };
}

describe("native drawing paths", () => {
  it("executes a real deferred G-buffer and resolve and retires every GPU allocation after the fence", async () => {
    const mock = device(); const pipeline = new DeferredPipeline(mock.native, { outputFormat: "rgba8unorm" });
    expect(pipeline.render(frame())).toMatchObject({ requested: "deferred", active: "deferred", drawCalls: 2, triangles: 2 });
    expect(mock.native.queue.submit).toHaveBeenCalledTimes(1);
    expect(mock.passes).toHaveLength(2);
    expect((mock.passes[0]!.descriptor.colorAttachments as unknown[])).toHaveLength(3);
    expect(mock.passes.map(pass => pass.draws)).toEqual([[[6]], [[3]]]);
    expect(mock.resources.every(resource => resource.destroy.mock.calls.length === 0)).toBe(true);
    pipeline.dispose();
    expect(() => pipeline.render(frame())).toThrowError(/disposed/);
    expect(mock.resources.every(resource => resource.destroy.mock.calls.length === 0)).toBe(true);
    mock.finish(); await Promise.resolve();
    expect(mock.resources.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
    pipeline.dispose();
  });

  it("stops submitting after loss without destroying caller-owned devices or targets", async () => {
    const mock = device();
    let lose!: () => void;
    const lost = new Promise<void>(resolve => { lose = resolve; });
    const pipeline = new DeferredPipeline({ ...mock.native, lost }, { outputFormat: "rgba8unorm" });
    pipeline.render(frame());
    lose(); await Promise.resolve();
    expect(() => pipeline.render(frame())).toThrowError(/device is lost/);
    expect(mock.native.queue.submit).toHaveBeenCalledTimes(1);
    pipeline.dispose(); mock.finish(); await Promise.resolve();
    expect(mock.resources.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("rasterizes primitive IDs, resolves per-triangle materials and enforces storage limits", () => {
    const mock = device(); const pipeline = new VisibilityBufferPipeline(mock.native, { outputFormat: "rgba8unorm" });
    expect(pipeline.render(frame())).toMatchObject({ active: "visibility", triangles: 2, drawCalls: 2 });
    const attachments = mock.passes[0]!.descriptor.colorAttachments as { view: { texture: { descriptor: { format: string } } } }[];
    expect(attachments.map(item => item.view.texture.descriptor.format)).toEqual(["r32uint", "rgba16float"]);
    expect(mock.modules.join("\n")).toContain("triangleMaterials[id - 1u]");
    expect(mock.uploads.some(bytes => bytes.byteLength === 8 && new Uint32Array(bytes.buffer).join(",") === "0,1")).toBe(true);
    const small = device({ maxStorageBufferBindingSize: 4 });
    expect(() => new VisibilityBufferPipeline(small.native, { outputFormat: "rgba8unorm" }).render(frame())).toThrowError(/maxStorageBufferBindingSize/);
    expect(small.native.queue.submit).not.toHaveBeenCalled();
  });

  it("negotiates explicit fallback and actually renders through it", () => {
    const mock = device({ maxColorAttachments: 1 });
    expect(() => new DeferredPipeline(mock.native, { outputFormat: "rgba8unorm" })).toThrowError(/requires 3/);
    const deferred = new DeferredPipeline(mock.native, { outputFormat: "rgba8unorm", allowFallback: true });
    expect(deferred.render(frame())).toMatchObject({ requested: "deferred", active: "forward", drawCalls: 1, triangles: 2, fallbackReason: expect.stringContaining("3 color attachments") });
    expect(mock.native.queue.submit).toHaveBeenCalledTimes(1);
    expect(mock.passes).toHaveLength(1);
    expect(mock.passes[0]!.draws).toEqual([[6, 1, 0]]);
    const visibility = new VisibilityBufferPipeline(mock.native, { outputFormat: "rgba8unorm", allowFallback: true });
    expect(visibility.render(frame()).active).toBe("forward");
  });

  it("builds bounded meshlets and issues compute culling before indirect draws", () => {
    const input = scene(); input.positions[9] = 3; input.positions[12] = 4; input.positions[15] = 3.5;
    const chunks = buildMeshlets(input, { maxVertices: 3, maxTriangles: 1 });
    expect(chunks.map(chunk => [chunk.firstTriangle, chunk.triangleCount, chunk.uniqueVertices])).toEqual([[0,1,3], [1,1,3]]);
    expect(meshletIntersectsFrustum(chunks[0]!, identity)).toBe(true);
    expect(meshletIntersectsFrustum(chunks[1]!, identity)).toBe(false);
    expect(meshletIntersectsFrustum(buildMeshlets({ ...input, triangleNoCull: new Uint8Array([0,1]) }, { maxVertices: 3, maxTriangles: 1 })[1]!, identity)).toBe(true);
    const mock = device(); const pipeline = new MeshletPipeline(mock.native, { outputFormat: "rgba8unorm", maxVertices: 3, maxTriangles: 1 });
    const result = pipeline.render({ ...frame(), scene: input });
    expect(result).toMatchObject({ active: "meshlet", submittedMeshlets: 2, triangles: 2, trianglesAreUpperBound: true, computeDispatches: 1 });
    expect(mock.computeDispatches).toEqual([1]);
    expect(mock.passes[0]!.indirect).toEqual([0, 16]);
    expect(mock.commandOrder).toEqual(["dispatch", "end-compute", "draw-indirect", "draw-indirect"]);
    expect(mock.modules.join("\n")).toContain("commands[i] = vec4<u32>");
  });

  it("requires native compute for meshlet culling and uses the explicit forward fallback when allowed", () => {
    const mock = device();
    const withoutCompute = { ...mock.native, createComputePipeline: undefined };
    expect(() => new MeshletPipeline(withoutCompute, { outputFormat: "rgba8unorm" })).toThrowError(/requires compute/);
    const pipeline = new MeshletPipeline(withoutCompute, { outputFormat: "rgba8unorm", allowFallback: true });
    expect(pipeline.render(frame())).toMatchObject({ active: "forward", fallbackReason: expect.stringContaining("compute"), triangles: 2 });
    expect(mock.passes[0]!.draws).toEqual([[6, 1, 0]]);
  });

  it("fails a meshlet draw budget or submits the complete forward fallback", () => {
    const input = scene();
    // Two visible triangles straddle one off-screen triangle, requiring two draws.
    input.positions[9] = 3; input.positions[12] = 4; input.positions[15] = 3.5;
    const positions = new Float32Array([...input.positions, -.4,-.4,0, .4,-.4,0, 0,.4,0]);
    const three: NativeDrawingScene = { ...input, positions, normals: undefined, indices: new Uint16Array([0,1,2,3,4,5,6,7,8]), triangleMaterials: new Uint32Array([0,1,0]) };
    const mock = device();
    const options = { outputFormat: "rgba8unorm", maxVertices: 3, maxTriangles: 1, maxDrawsPerFrame: 1 } as const;
    const strict = new MeshletPipeline(mock.native, options);
    expect(() => strict.render({ ...frame(), scene: three })).toThrowError(/exceeding maxDrawsPerFrame/);
    expect(mock.native.queue.submit).not.toHaveBeenCalled();
    const fallback = new MeshletPipeline(mock.native, { ...options, allowFallback: true });
    expect(fallback.render({ ...frame(), scene: three })).toMatchObject({ active: "forward", triangles: 3, fallbackReason: expect.stringContaining("maxDrawsPerFrame") });
    expect(mock.passes[0]!.draws).toEqual([[9, 1, 0]]);
  });

  it("cleans partial allocations on failure, then creates correctly resized attachments", () => {
    const mock = device();
    const createTexture = mock.native.createTexture;
    let calls = 0;
    mock.native.createTexture = (descriptor: Record<string, unknown>) => { if (++calls === 2) throw new Error("allocation failed"); return createTexture(descriptor); };
    const pipeline = new DeferredPipeline(mock.native, { outputFormat: "rgba8unorm" });
    expect(() => pipeline.render(frame())).toThrowError(/allocation failed/);
    expect(mock.native.queue.submit).not.toHaveBeenCalled();
    expect(mock.resources.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
    mock.native.createTexture = createTexture;
    const resized = { ...frame(), surface: { view: {}, width: 19, height: 11 } };
    expect(pipeline.render(resized).active).toBe("deferred");
    const liveTextures = mock.resources.filter(resource => "format" in resource.descriptor && resource.destroy.mock.calls.length === 0);
    expect(liveTextures).toHaveLength(4);
    for (const texture of liveTextures) expect(texture.descriptor.size).toEqual([19, 11, 1]);
  });

  it("destroys allocations once when queue submission fails", () => {
    const mock = device();
    mock.native.queue.submit.mockImplementationOnce(() => { throw new Error("device lost"); });
    const pipeline = new VisibilityBufferPipeline(mock.native, { outputFormat: "rgba8unorm" });
    expect(() => pipeline.render(frame())).toThrowError(/device lost/);
    expect(mock.resources.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("converts render items with transforms, indexed geometry, material color and draw range", () => {
    const item = { geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [.2,.4,.6,1] }), modelMatrix: new Float32Array([2,0,0,0, 0,3,0,0, 0,0,1,0, 4,5,0,1]) };
    const converted = nativeDrawingSceneFromRenderItems([item]);
    expect(Array.from(converted.positions)).toEqual([3,3.5,0, 5,3.5,0, 4,6.5,0]);
    expect(converted.materials[0]!.baseColor).toEqual([.2,.4,.6,1]);
    expect(Array.from(converted.triangleMaterials)).toEqual([0]);
    expect(prepareNativeDrawing(converted).triangleCount).toBe(1);
    expect(nativeDrawingSceneFromRenderItems([{ ...item, drawRange: { start: 0, count: 0 } }]).positions).toHaveLength(0);
  });

  it("rejects unsupported transparent/deformed scenes and malformed triangle data before submission", () => {
    const mock = device(); const pipeline = new DeferredPipeline(mock.native, { outputFormat: "rgba8unorm" });
    const bad = scene(); bad.triangleMaterials[1] = 9;
    expect(() => pipeline.render({ ...frame(), scene: bad })).toThrowError(/triangleMaterials\[1\]/);
    expect(mock.native.queue.submit).not.toHaveBeenCalled();
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [1,1,1,.5] }) }])).toThrowError(/transparent/);
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry: Geometry.triangle(), instanceTransforms: new Float32Array(16) }])).toThrowError(/instanced/);
    const reversedWinding = new UnlitMaterial({ renderState: { frontFace: "cw" } as never });
    expect(() => nativeDrawingSceneFromRenderItems([{ geometry: Geometry.triangle(), material: reversedWinding }])).toThrowError(/extended draw state/);
  });
});
