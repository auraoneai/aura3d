import { describe, expect, it, vi } from "vitest";
import "../../../packages/engine/src/agent-api/compiler/lines";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedUnlitProgram, GENERATED_UNLIT_MATERIAL_OFFSETS, packGeneratedUnlitMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { NATIVE_POINT_WGSL, validateNativePointRasterInputs } from "../../../packages/rendering/src/webgpu/NativePointShader";

function capture(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function nativeFixture() {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  let lose!: (value: { reason: string }) => void;
  let rejectLoss!: (error: Error) => void;
  const lost = new Promise<{ reason: string }>((resolve, reject) => { lose = resolve; rejectLoss = reject; });
  let failFence = false;
  let failCreate = false, failWrite = false, failDestroy = false;
  const buffers: { size: number; usage: number; destroy: ReturnType<typeof vi.fn> }[] = [];
  const modules: { code: string }[] = [];
  const native = {
    limits: { maxBufferSize: 4096, maxVertexBuffers: 8 }, lost,
    queue: { writeBuffer() { if (failWrite) throw new Error("point upload failed"); }, submit() {}, onSubmittedWorkDone: () => failFence ? Promise.reject(new Error("fence failed")) : fence },
    createBuffer({ size, usage }: { size: number; usage: number }) {
      if (failCreate) throw new Error("point allocation failed");
      const result = { size, usage, destroy: vi.fn(() => { if (failDestroy) throw new Error("point destruction failed"); }) }; buffers.push(result); return result;
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createShaderModule(descriptor: { code: string }) { modules.push(descriptor); return descriptor; },
    destroy: vi.fn()
  };
  return { native: native as unknown as WebGPUDeviceLike, buffers, modules, finish, lose, rejectLoss,
    failFences(value: boolean) { failFence = value; }, failAllocations(value: boolean) { failCreate = value; },
    failWrites(value: boolean) { failWrite = value; }, failDestruction(value: boolean) { failDestroy = value; } };
}

function pointSource(bits = 0) {
  const features = normalizeProgramFeatures({ lighting: "unlit", alphaMode: "mask", vertexColors: true,
    features: { "a3d.nativePrimitive": "points", "a3d.clipping": true, ...(bits ? { "prd15.parityPoints": bits } : {}) } });
  return generateProgramImpl(features, { flags: createTrustedQrFlags({ A3D_PARITY_LINES: true }) });
}

describe("staged generated WebGPU point source", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])("selects exact producer point features for bit packet %i", bits => {
    const source = pointSource(bits);
    const program = createGeneratedUnlitProgram(source.descriptor!);
    expect(program).toMatchObject({ primitive: "points", rasterTopology: "triangles", clipping: true,
      point: { attenuated: (bits & 1) !== 0, mapped: (bits & 2) !== 0, round: (bits & 4) !== 0 } });
    expect(program.requiredVertexLocations).toEqual([0, 3, 4]);
    expect(program.resources.map(resource => [resource.uniform, resource.samplerBinding, resource.textureBinding]))
      .toEqual(bits & 2 ? [["u_pointMap", 5, 6]] : []);
    expect(program.vertex).toContain("@location(3) pointCorner: vec2f");
    expect(program.vertex).toContain("a3dPointCenterInSceneClip(clip)");
    expect(program.vertex).toContain(`a3dPointPixelSize(material.pointRaster.x, frame.resolutionFarTime.y, clip.w, ${(bits & 1) !== 0})`);
    expect(program.vertex).toContain("a3dPointExpandSceneClip(clip, pointCorner, pixels, material.pointRaster.yz)");
    expect(program.fragment.includes("textureSample(u_pointMapTexture, u_pointMapSampler, input.pointCoord)")).toBe(Boolean(bits & 2));
    expect(program.fragment.includes("if (!a3dPointInRoundFootprint(input.pointCoord)) { discard; }")).toBe(Boolean(bits & 4));
    expect(program.fragment).toContain("if (base.a < material.alphaControls.x) { discard; }");
    expect(program.fragment).toContain("generatedUnlitClipRetains(input.world, input.local)");
    if (bits & 2) expect(program.fragment.indexOf("textureSample(u_pointMapTexture")).toBeLessThan(program.fragment.indexOf("if (input.pointInvalid"));
  });

  it("uses target height for attenuation, raster viewport for expansion and the source center for clip planes", () => {
    expect(NATIVE_POINT_WGSL).toContain("size * (0.5 * targetHeight) / max(clipW, 1e-3)");
    expect(NATIVE_POINT_WGSL).toContain("0.12 * targetHeight");
    expect(NATIVE_POINT_WGSL).toContain("center.w >= 0.05");
    expect(NATIVE_POINT_WGSL).toContain("corner.x - 0.5, 0.5 - corner.y");
    expect(NATIVE_POINT_WGSL).toContain("vec2f(2.0 * pixels) / viewport");
    const bytes = packGeneratedUnlitMaterialUniforms(new Map<string, UniformValue>([["u_pointSize", 12], ["u_a3dPointViewport", [320, 180]]]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([0, 1, 2, 3].map(index => view.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.pointRaster! + index * 4, true))).toEqual([12, 320, 180, 0]);
    const program = createGeneratedUnlitProgram(pointSource(7).descriptor!);
    expect(program.vertex).toContain("@location(0) @interpolate(flat) world: vec3f");
    expect(program.vertex).toContain("@location(1) @interpolate(flat) local: vec3f");
    expect(program.vertex).toContain("@location(6) @interpolate(linear) pointCoord: vec2f");
    expect(program.vertex.indexOf("a3dPointCenterInSceneClip(clip)")).toBeLessThan(program.vertex.indexOf("a3dPointExpandSceneClip(clip, pointCorner"));
  });

  it("rejects point-raster parameters that collapse or overflow at shader precision", () => {
    const valid = { size: 12, targetHeight: 1080, viewportWidth: 640.5, viewportHeight: 360, attenuated: true };
    expect(() => validateNativePointRasterInputs(valid)).not.toThrow();
    expect(() => validateNativePointRasterInputs({ ...valid, attenuated: false })).not.toThrow();
    for (const invalid of [
      { ...valid, size: 0 }, { ...valid, size: 1e-100 }, { ...valid, size: Number.MAX_VALUE },
      { ...valid, targetHeight: 1.5 }, { ...valid, viewportWidth: 0 }, { ...valid, viewportHeight: 1e-100 },
      { ...valid, size: 1e29, targetHeight: 1e12 }, { ...valid, attenuated: "yes" as never }
    ]) expect(() => validateNativePointRasterInputs(invalid)).toThrow(/point raster/i);
  });

  it("fails closed on inconsistent point metadata and still prevents a native point draw", async () => {
    const source = pointSource(7), descriptor = source.descriptor!;
    expect(() => createGeneratedUnlitProgram({ ...descriptor, defines: { ...descriptor.defines, A3D_PARITY_POINT_MAP: undefined as never } }))
      .toThrow(/define/i);
    expect(() => createGeneratedUnlitProgram({ ...descriptor, activeFeatures: [{ id: "prd15.parityPoints", value: 8 }] }))
      .toThrow(/contributor|feature bits/i);
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const shader = device.createShaderProgram({ label: "point-stage", marker: GENERATED_PROGRAM_MARKER,
      vertex: source.vertex, fragment: source.fragment, generatedProgram: descriptor });
    const vertices = device.createBuffer("vertex", 24);
    try {
      device.beginFrame(8, 8);
      expect(fixture.modules.some(module => module.code.includes("a3dPointExpandSceneClip"))).toBe(true);
      for (const topology of ["points", "triangles"] as const) {
        expect(() => device.draw({ topology, vertexBuffer: vertices, vertexCount: 1, shader })).toThrow(/quad lease and depth path/i);
      }
      device.endFrame();
    } finally { fixture.finish(); vertices.dispose(); device.dispose(); }
  });
});

describe("WebGPU point buffer ownership", () => {
  it("brands the exact point allocation and invalidates stamps on failed writes, storage use and native exposure", async () => {
    const fixture = nativeFixture(), otherFixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const other = await WebGPUDevice.create({ adapter: { requestDevice: async () => otherFixture.native } });
    const first = device.createNativePointBuffer(new Uint8Array([1, 2, 3, 4]));
    const second = device.createNativePointBuffer(new Uint8Array([5, 6, 7, 8]));
    const third = device.createNativePointBuffer(new Uint8Array([9, 10, 11, 12]));
    if (!first.ok || !second.ok || !third.ok) throw new Error("expected point allocations");
    try {
      expect("pointBufferStamps" in device).toBe(false);
      expect(() => device.assertNativePointBufferStamp(first.buffer, first.stamp)).not.toThrow();
      expect(() => device.assertNativePointBufferStamp(second.buffer, first.stamp)).toThrow(/stale or foreign/i);
      expect(() => other.assertNativePointBufferStamp(first.buffer, first.stamp)).toThrow(/stale or foreign/i);
      expect(() => device.assertNativePointBufferStamp(first.buffer, {})).toThrow(/stale or foreign/i);
      expect(() => device.updateBuffer(first.buffer, 5, new Uint8Array([1]))).toThrow(/out of bounds/i);
      expect(() => device.assertNativePointBufferStamp(first.buffer, first.stamp)).toThrow(/stale or foreign/i);
      device.beginFrame(4, 4);
      expect(() => device.draw({ topology: "triangles", vertexBuffer: second.buffer, vertexCount: 1,
        nativeStorageBindings: [{ kind: "storage-buffer", name: "storage", group: 2, binding: 0, buffer: second.buffer }] })).toThrow(/storage and vertex/i);
      expect(() => device.assertNativePointBufferStamp(second.buffer, second.stamp)).toThrow(/stale or foreign/i);
      device.endFrame();
      device.getNativeBuffer(third.buffer);
      expect(() => device.assertNativePointBufferStamp(third.buffer, third.stamp)).toThrow(/exposed to native writes/i);
      const retirements = [first, second, third].map(result => device.retireNativePointBuffer(result.buffer));
      fixture.finish(); await Promise.all(retirements);
      expect(() => device.assertNativePointBufferStamp(third.buffer, third.stamp)).toThrow(/disposed/i);
    } finally { fixture.finish(); otherFixture.finish(); device.dispose(); other.dispose(); }
  });

  it("waits for failed uploaded allocations to be destroyed after the queue fence", async () => {
    const fixture = nativeFixture(); fixture.failWrites(true);
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native }, device: fixture.native });
    const empty = device.createNativePointBuffer(new Uint8Array(0));
    if (empty.ok) throw new Error("expected an invalid point buffer");
    await empty.cleanup;
    expect(fixture.buffers).toHaveLength(0);
    const result = device.createNativePointBuffer(new Uint8Array(8));
    if (result.ok) throw new Error("expected a point upload failure");
    let released = false; void result.cleanup.then(() => { released = true; }, () => {});
    await Promise.resolve();
    expect(released).toBe(false);
    expect(fixture.buffers[0]!.destroy).not.toHaveBeenCalled();
    fixture.finish(); await result.cleanup;
    expect(released).toBe(true);
    expect(fixture.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    device.dispose();
  });

  it("releases unknown allocations on genuine loss but retains ambiguous point destruction", async () => {
    const fixture = nativeFixture(); fixture.failAllocations(true);
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native }, device: fixture.native });
    const unknown = device.createNativePointBuffer(new Uint8Array(4));
    if (unknown.ok) throw new Error("expected an allocation failure");
    let released = false; void unknown.cleanup.then(() => { released = true; }, () => {});
    fixture.finish(); device.dispose(); await Promise.resolve(); await Promise.resolve();
    expect(released).toBe(false);
    fixture.lose({ reason: "destroyed" }); await unknown.cleanup;
    expect(released).toBe(true);

    const other = nativeFixture(); other.failWrites(true); other.failDestruction(true);
    const second = await WebGPUDevice.create({ adapter: { requestDevice: async () => other.native }, device: other.native });
    const failed = second.createNativePointBuffer(new Uint8Array(4));
    if (failed.ok) throw new Error("expected an upload failure");
    let destroyed = false; void failed.cleanup.then(() => { destroyed = true; }, () => {});
    const failedInvalidation = vi.fn();
    second.onNativePointInvalidated(failedInvalidation);
    other.finish();
    const failure = await failed.cleanup.then(() => undefined, error => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("point destruction failed");
    await flush();
    expect(other.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(destroyed).toBe(false);
    expect(leaves(capture(() => second.dispose()))).toContain(failure);
    other.lose({ reason: "destroyed" });
    await flush();
    await expect(failed.cleanup).rejects.toBe(failure);
    expect(leaves(capture(() => second.dispose()))).toContain(failure);
    expect(second.resourceInterop.owns(other.buffers[0]!)).toBe(true);
    expect(second[resourceDisposalPending]).toBe(true);
    expect(failedInvalidation).not.toHaveBeenCalled();
    expect(other.buffers[0]!.destroy).toHaveBeenCalledOnce();
    expect(destroyed).toBe(false);

    const third = nativeFixture(); third.failDestruction(true);
    const thirdDevice = await WebGPUDevice.create({ adapter: { requestDevice: async () => third.native }, device: third.native });
    const allocated = thirdDevice.createNativePointBuffer(new Uint8Array(4));
    if (!allocated.ok) throw new Error("expected a point allocation");
    const retirement = thirdDevice.retireNativePointBuffer(allocated.buffer);
    let retired = false; void retirement.then(() => { retired = true; }, () => {});
    const pointInvalidation = vi.fn();
    thirdDevice.onNativePointInvalidated(pointInvalidation);
    third.finish();
    const retirementFailure = await retirement.then(() => undefined, error => error);
    expect(retirementFailure).toBeInstanceOf(Error);
    expect((retirementFailure as Error).message).toBe("point destruction failed");
    await flush();
    expect(third.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(retired).toBe(false);
    expect(leaves(capture(() => thirdDevice.dispose()))).toContain(retirementFailure);
    third.lose({ reason: "destroyed" });
    await flush();
    await expect(retirement).rejects.toBe(retirementFailure);
    expect(leaves(capture(() => thirdDevice.dispose()))).toContain(retirementFailure);
    expect(thirdDevice.resourceInterop.owns(third.buffers[0]!)).toBe(true);
    expect(thirdDevice[resourceDisposalPending]).toBe(true);
    expect(pointInvalidation).not.toHaveBeenCalled();
    expect(third.buffers[0]!.destroy).toHaveBeenCalledOnce();
    expect(retired).toBe(false);
  });

  it("captures the effective scene viewport and scissor, and rejects stale, foreign or invalid snapshots", async () => {
    const fixture = nativeFixture(), otherFixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const other = await WebGPUDevice.create({ adapter: { requestDevice: async () => otherFixture.native } });
    const scene = device.createRenderTarget({ width: 100, height: 80, depth: false });
    const shadow = device.createRenderTarget({ width: 64, height: 64, depth: false });
    try {
      device.beginFrame(100, 80); device.setRenderTarget(scene);
      expect(device.getNativePointViewport()).toMatchObject({ target: scene, targetWidth: 100, targetHeight: 80,
        x: 0, y: 0, width: 100, height: 80, scissor: null });
      device.setViewport(10, 20, 40, 30); device.setScissor(12, 22, 8, 6); device.setScissorTest(true);
      const snapshot = device.getNativePointViewport();
      expect(snapshot).toMatchObject({ generation: device.generation, frameToken: device.activeFrameToken, target: scene,
        x: 10, y: 20, width: 40, height: 30, scissor: { x: 12, y: 22, width: 8, height: 6 } });
      expect(() => device.assertNativePointViewport(snapshot)).not.toThrow();
      expect(() => other.assertNativePointViewport(snapshot)).toThrow(/stale/i);
      expect(() => device.assertNativePointViewport({ ...snapshot })).toThrow(/stale/i);
      device.setViewport(11, 20, 40, 30);
      expect(() => device.assertNativePointViewport(snapshot)).toThrow(/stale/i);
      device.setViewport(10, 20, 40, 30); device.setRenderTarget(shadow);
      expect(() => device.assertNativePointViewport(snapshot)).toThrow(/stale/i);
      expect(() => device.assertNativePointViewport(snapshot, false)).not.toThrow();
      device.setRenderTarget(scene); device.setViewport(0, 0, 101, 80);
      expect(() => device.getNativePointViewport()).toThrow(/invalid/i);
      device.setViewport(0, 0, 100, 80); device.setScissor(0, 0, 1.5, 2);
      expect(() => device.getNativePointViewport()).toThrow(/invalid/i);
      device.setScissor(0, 0, 2, 2); device.endFrame();
      expect(() => device.assertNativePointViewport(snapshot, false)).toThrow(/stale/i);
    } finally { fixture.finish(); otherFixture.finish(); scene.dispose(); shadow.dispose(); device.dispose(); other.dispose(); }
  });

  it("uses the persistent canvas viewport until a frame-scoped viewport overrides it", async () => {
    const fixture = nativeFixture();
    const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native },
      canvas: { getContext: () => context } as unknown as HTMLCanvasElement });
    try {
      device.setViewport(4, 6, 20, 30, { persistent: true });
      device.beginFrame(64, 48);
      expect(device.getNativePointViewport()).toMatchObject({ target: null, x: 4, y: 6, width: 20, height: 30 });
      device.setViewport(1, 2, 10, 12);
      expect(device.getNativePointViewport()).toMatchObject({ target: null, x: 1, y: 2, width: 10, height: 12 });
      device.endFrame();
    } finally { fixture.finish(); device.dispose(); }
  });

  it("removes disposed CPU shadows from the live inventory without destroying queued buffers", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const otherFixture = nativeFixture();
    const other = await WebGPUDevice.create({ adapter: { requestDevice: async () => otherFixture.native } });
    try {
      const retired = Array.from({ length: 32 }, () => device.createBuffer("vertex", 7));
      for (const buffer of retired) { buffer.dispose(); buffer.dispose(); }
      expect((device as unknown as { buffers: Set<unknown> }).buffers.size).toBe(0);
      expect(device.getDiagnostics()).toMatchObject({ buffers: 0, bufferBytes: 0, disposedBuffers: 32 });
      expect(fixture.buffers.every(buffer => buffer.size === 8 && buffer.destroy.mock.calls.length === 0)).toBe(true);
      expect(() => device.readBuffer(retired[0]!)).toThrow(/disposed/i);
      expect(() => other.retireNativePointBuffer(retired[0]!)).toThrow(/not created/i);
      const completions = retired.map(buffer => device.retireNativePointBuffer(buffer));
      expect(device.retireNativePointBuffer(retired[0]!)).toBe(completions[0]);
      fixture.finish(); await Promise.all(completions);
      expect(fixture.buffers.every(buffer => buffer.destroy.mock.calls.length === 1)).toBe(true);
      expect(device.resourceInterop.liveResources).toBe(0);
    } finally { fixture.finish(); otherFixture.finish(); device.dispose(); other.dispose(); }
  });

  it("requires verified limits and permanently rejects a borrowed native handle as point-authoritative", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    try {
      expect(device.getNativePointLimits()).toEqual({ generation: device.generation, maxBufferSize: 4096, maxVertexBuffers: 8 });
      const buffer = device.createBuffer("vertex", 8, new Uint8Array(8));
      expect("handle" in buffer).toBe(false);
      expect(() => device.assertNativePointBufferUnexposed(buffer)).not.toThrow();
      expect(device.getNativeBuffer(buffer)).toBe(fixture.buffers[0]);
      device.updateBuffer(buffer, 0, new Uint8Array(8));
      expect(device.readBuffer(buffer)).toEqual(new Uint8Array(8));
      expect(() => device.assertNativePointBufferUnexposed(buffer)).toThrow(/exposed to native writes/i);
    } finally { fixture.finish(); device.dispose(); }
    const missing = nativeFixture();
    const native = { ...missing.native, limits: undefined } as WebGPUDeviceLike;
    const unsupported = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    try { expect(() => unsupported.getNativePointLimits()).toThrow(/reported device buffer limits/i); }
    finally { missing.finish(); unsupported.dispose(); }
  });

  it("keeps a borrowed device's retirement pending across wrapper disposal", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native }, device: fixture.native });
    const buffer = device.createBuffer("vertex", 16);
    const completion = device.retireNativePointBuffer(buffer);
    let settled = false; void completion.then(() => { settled = true; });
    const invalidated = vi.fn(); device.onNativePointInvalidated(invalidated);
    device.dispose(); await Promise.resolve();
    expect(settled).toBe(false);
    expect(fixture.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(invalidated).not.toHaveBeenCalled();
    fixture.finish(); await completion;
    await Promise.resolve(); await Promise.resolve();
    expect(fixture.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(device.retireNativePointBuffer(buffer)).toBe(completion);
    expect(invalidated).not.toHaveBeenCalled();
    const late = vi.fn(); device.onNativePointInvalidated(late); expect(late).not.toHaveBeenCalled();
    fixture.lose({ reason: "destroyed" }); await Promise.resolve();
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("invalidates pending borrowed resources on real loss even after wrapper disposal", async () => {
    const fixture = nativeFixture();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native }, device: fixture.native });
    const buffer = device.createBuffer("vertex", 16);
    const completion = device.retireNativePointBuffer(buffer);
    const invalidated = vi.fn(); device.onNativePointInvalidated(invalidated);
    device.dispose();
    fixture.lose({ reason: "destroyed" });
    await completion;
    expect(fixture.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
    fixture.finish();
  });

  it("does not treat a rejected loss promise or failed fence as native invalidation", async () => {
    const fixture = nativeFixture(); fixture.failFences(true);
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => fixture.native } });
    const buffer = device.createBuffer("vertex", 16);
    const completion = device.retireNativePointBuffer(buffer);
    const invalidated = vi.fn(); device.onNativePointInvalidated(invalidated);
    fixture.rejectLoss(new Error("loss status unavailable"));
    await Promise.resolve(); await Promise.resolve();
    expect(device.contextLost).toBe(true);
    expect(fixture.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(invalidated).not.toHaveBeenCalled();
    device.dispose(); await completion;
    expect(fixture.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
  });

  it("retains an unfenced allocation if owned-device destruction is unavailable", async () => {
    const fixture = nativeFixture();
    const native = { ...fixture.native, destroy: undefined,
      queue: { ...fixture.native.queue, onSubmittedWorkDone: undefined } } as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    const buffer = device.createBuffer("vertex", 16);
    const completion = device.retireNativePointBuffer(buffer);
    const invalidated = vi.fn(); device.onNativePointInvalidated(invalidated);
    device.dispose(); await Promise.resolve();
    expect(fixture.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(invalidated).not.toHaveBeenCalled();
    fixture.lose({ reason: "destroyed" }); await completion;
    expect(fixture.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
  });
});
