import { describe, expect, it, vi } from "vitest";
import "../../../packages/engine/src/agent-api/compiler/lines";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { type DrawCommand, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { NativePointQuadArena, type NativePointQuadLease, type NativePointQuadSubmission } from "../../../packages/rendering/src/webgpu/NativePointQuads";

const WIDTH = 32;
const HEIGHT = 24;
const LIMITS = { maxCpuBytes: 1_000_000, maxGpuBytes: 1_000_000, maxStreamBytes: 1_000_000 };

/** The queue may call back before returning and can throw after recording work. */
async function fixture() {
  let finishFence!: () => void;
  const fence = new Promise<void>(resolve => { finishFence = resolve; });
  let inSubmit = false;
  let failWrites = false;
  let throwAfterSubmit = false;
  let onSubmit: (() => void) | undefined;
  let onDraw: (() => void) | undefined;
  const events: string[] = [];
  const submissions: unknown[][] = [];
  const draws: number[][] = [];
  const viewports: number[][] = [];
  const scissors: number[][] = [];
  const buffers: { label?: string; destroy: ReturnType<typeof vi.fn> }[] = [];
  const native = {
    limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer() { if (failWrites) throw new Error("injected write failure"); },
      submit(commands: readonly unknown[]) {
        if (commands.length === 0) return;
        inSubmit = true;
        events.push("submit-start");
        try {
          onSubmit?.();
          // Simulate a queue implementation that accepted work before it threw.
          submissions.push([...commands]);
          events.push("queued");
          if (throwAfterSubmit) throw new Error("injected submit failure after enqueue");
        } finally {
          inSubmit = false;
          events.push("submit-end");
        }
      },
      onSubmittedWorkDone() {
        events.push(inSubmit ? "fence-during-submit" : "fence-after-submit");
        return fence;
      }
    },
    createBuffer(descriptor: { label?: string }) {
      const result = { ...descriptor, destroy: vi.fn() };
      buffers.push(result);
      return result;
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createShaderModule: (descriptor: object) => descriptor,
    createBindGroupLayout: (descriptor: object) => descriptor,
    createPipelineLayout: (descriptor: object) => descriptor,
    createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
    createBindGroup: (descriptor: object) => descriptor,
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {}, setBindGroup() {}, setVertexBuffer() {},
        setViewport(...args: number[]) { viewports.push(args); },
        setScissorRect(...args: number[]) { scissors.push(args); },
        draw(...args: number[]) { draws.push(args); onDraw?.(); },
        end() {}
      }),
      finish: () => ({})
    }),
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const canvasContext = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const device = await WebGPUDevice.create({
    adapter: { requestDevice: async () => native }, device: native,
    canvas: { getContext: () => canvasContext } as unknown as HTMLCanvasElement
  });
  const source = Geometry.points([[1, 2, 3]]);
  const material = new UnlitMaterial({ pointSize: 7 });
  const item = { geometry: source, material };
  const arena = new NativePointQuadArena(device, LIMITS);
  const range = { start: 0, count: 1 };
  const lease = arena.acquire(source, range);
  const vertices = lease.upload();
  const generated = generateProgramImpl(normalizeProgramFeatures({
    lighting: "unlit", features: { "a3d.nativePrimitive": "points" }
  }), { flags: createTrustedQrFlags({ A3D_PARITY_LINES: true }) });
  const shader = device.createShaderProgram({
    label: "checked-point", marker: GENERATED_PROGRAM_MARKER,
    vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor!
  });
  const frameBytes = new Float32Array(76);
  frameBytes[69] = HEIGHT; // AuraFrame.resolutionFarTime.y
  const frame = device.createBuffer("uniform", frameBytes.byteLength, frameBytes);
  device.beginFrame(WIDTH, HEIGHT);
  device.bindUniformBuffer(frame, 0);
  const viewport = device.getNativePointViewport();
  const uniforms = new Map<string, UniformValue>(material.getParameters());
  uniforms.set("u_a3dPointViewport", [viewport.width, viewport.height]);
  const command: DrawCommand = {
    label: "point-draw", topology: "triangles", vertexBuffer: vertices[0]!, vertexBuffers: vertices,
    vertexFormat: lease.vertexFormat, vertexCount: lease.vertexCount, shader, uniforms,
    renderState: { ...material.renderState, cullMode: "none" }
  };
  const context: NativePointQuadSubmission = { lease, item, range, viewport };
  return {
    device, source, material, item, arena, lease, vertices, shader, frame, uniforms, command, context,
    buffers, events, submissions, draws, viewports, scissors,
    pointBuffers: () => buffers.filter(buffer => buffer.label?.startsWith("aura3d-point-")),
    onSubmit(callback?: () => void) { onSubmit = callback; },
    onDraw(callback?: () => void) { onDraw = callback; },
    failWrites(value: boolean) { failWrites = value; },
    failSubmitAfterEnqueue(value: boolean) { throwAfterSubmit = value; },
    finishFence,
    async close() {
      onSubmit = undefined;
      onDraw = undefined;
      throwAfterSubmit = false;
      finishFence();
      await arena.dispose();
      source.dispose();
      material.dispose();
      shader.dispose();
      frame.dispose();
      if (device.activeFrameToken) device.endFrame();
      device.dispose();
    }
  };
}

describe("checked WebGPU point-quad submission", () => {
  it("queues six triangle vertices and applies the captured viewport and scissor", async () => {
    const f = await fixture();
    try {
      expect(() => f.device.draw(f.command)).toThrow(/quad lease/i);
      f.device.setViewport(2, 3, 16, 12);
      f.device.setScissor(3, 4, 8, 6);
      f.device.setScissorTest(true);
      const viewport = f.device.getNativePointViewport();
      f.uniforms.set("u_a3dPointViewport", [16, 12]);
      f.device.drawNativePointQuads(f.command, { ...f.context, viewport });
      expect(f.submissions).toHaveLength(1);
      expect(f.draws).toEqual([[6, 1, 0]]);
      expect(f.viewports).toContainEqual([2, 9, 16, 12, 0, 1]);
      expect(f.scissors).toContainEqual([3, 14, 8, 6]);
    } finally { await f.close(); }
  });

  it("rejects forged leases and mismatched source, range, layout, and viewport before queueing", async () => {
    const f = await fixture();
    const otherSource = Geometry.points([[1, 2, 3]]);
    try {
      expect(() => f.device.drawNativePointQuads(f.command, { ...f.context, lease: {} as NativePointQuadLease })).toThrow(/lease/i);
      expect(() => f.device.drawNativePointQuads(f.command, { ...f.context, item: { ...f.item, geometry: otherSource } })).toThrow(/lease|source/i);
      expect(() => f.device.drawNativePointQuads(f.command, { ...f.context, range: { start: 1, count: 1 } })).toThrow(/lease|range/i);
      expect(() => f.device.drawNativePointQuads({ ...f.command, vertexCount: 5 }, f.context)).toThrow(/command/i);
      expect(() => f.device.drawNativePointQuads(f.command, { ...f.context, viewport: { ...f.context.viewport } })).toThrow(/viewport.*stale/i);
      expect(f.submissions).toHaveLength(0);
    } finally { otherSource.dispose(); await f.close(); }
  });

  it("rejects a lease from another device even if its range and source bytes match", async () => {
    const first = await fixture();
    const second = await fixture();
    try {
      expect(() => second.device.drawNativePointQuads(second.command, { ...second.context, lease: first.lease })).toThrow(/lease|source|device/i);
      expect(second.submissions).toHaveLength(0);
    } finally { await first.close(); await second.close(); }
  });

  it("rejects unmarked source edits and an attempted upload after acquisition", async () => {
    const edited = await fixture();
    const uploaded = await fixture();
    try {
      edited.source.vertexBuffer.floats[0] = 42;
      expect(() => edited.device.drawNativePointQuads(edited.command, edited.context)).toThrow(/source.*changed/i);
      uploaded.source.vertexBuffer.upload(uploaded.device);
      expect(() => uploaded.device.drawNativePointQuads(uploaded.command, uploaded.context)).toThrow(/upload|authority/i);
      expect(edited.submissions).toHaveLength(0);
      expect(uploaded.submissions).toHaveLength(0);
    } finally { await edited.close(); await uploaded.close(); }
  });

  it("rejects stale draw ranges, unsupported deformation, and stale viewport state", async () => {
    const f = await fixture();
    try {
      f.source.drawRange = { start: 0, count: 0 };
      expect(() => f.device.drawNativePointQuads(f.command, f.context)).toThrow(/range/i);
      f.source.drawRange = undefined;
      expect(() => f.device.drawNativePointQuads(f.command, { ...f.context, item: { ...f.item, morphWeights: [1] } })).toThrow(/deformation|instancing/i);
      f.device.setViewport(0, 0, WIDTH / 2, HEIGHT);
      expect(() => f.device.drawNativePointQuads(f.command, f.context)).toThrow(/viewport.*stale/i);
      expect(f.submissions).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("rejects material changes, non-point shaders, and invalidated buffer stamps", async () => {
    const f = await fixture();
    const triangle = generateProgramImpl(normalizeProgramFeatures({
      lighting: "unlit", features: { "a3d.nativePrimitive": "triangles" }
    }), { flags: createTrustedQrFlags({ A3D_PARITY_LINES: true }) });
    const otherShader = f.device.createShaderProgram({ label: "not-points", marker: GENERATED_PROGRAM_MARKER,
      vertex: triangle.vertex, fragment: triangle.fragment, generatedProgram: triangle.descriptor! });
    try {
      expect(() => f.device.drawNativePointQuads({ ...f.command, shader: otherShader }, f.context)).toThrow(/generated shader|material/i);
      f.material.pointSize = 9;
      expect(() => f.device.drawNativePointQuads(f.command, f.context)).toThrow(/material|uniform/i);
      f.material.pointSize = 7;
      expect(() => f.device.updateBuffer(f.vertices[0]!, f.vertices[0]!.byteLength, new Uint8Array(4))).toThrow(/out of bounds/i);
      expect(() => f.device.drawNativePointQuads(f.command, f.context)).toThrow(/stamp.*stale/i);
      expect(f.submissions).toHaveLength(0);
    } finally { otherShader.dispose(); await f.close(); }
  });

  it("rejects a wrong-height frame, a failed write, or a borrowed native frame buffer", async () => {
    const wrongHeight = await fixture();
    const failedWrite = await fixture();
    const borrowed = await fixture();
    try {
      wrongHeight.device.updateBuffer(wrongHeight.frame, 276, new Float32Array([HEIGHT + 1]));
      expect(() => wrongHeight.device.drawNativePointQuads(wrongHeight.command, wrongHeight.context)).toThrow(/frame.*stale|wrong target height/i);
      failedWrite.failWrites(true);
      expect(() => failedWrite.device.updateBuffer(failedWrite.frame, 276, new Float32Array([HEIGHT]))).toThrow(/injected write failure/i);
      failedWrite.failWrites(false);
      expect(() => failedWrite.device.drawNativePointQuads(failedWrite.command, failedWrite.context)).toThrow(/frame.*write|frame.*stale/i);
      borrowed.device.getNativeBuffer(borrowed.frame);
      expect(() => borrowed.device.drawNativePointQuads(borrowed.command, borrowed.context)).toThrow(/frame.*write|frame.*stale/i);
      expect(wrongHeight.submissions).toHaveLength(0);
      expect(failedWrite.submissions).toHaveLength(0);
      expect(borrowed.submissions).toHaveLength(0);
    } finally { await wrongHeight.close(); await failedWrite.close(); await borrowed.close(); }
  });

  it("rechecks the source immediately before queueing when encoding invokes a callback", async () => {
    const f = await fixture();
    try {
      f.onDraw(() => { f.source.vertexBuffer.floats[0] = 99; });
      expect(() => f.device.drawNativePointQuads(f.command, f.context)).toThrow(/source.*changed/i);
      expect(f.draws).toEqual([[6, 1, 0]]);
      expect(f.submissions).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("rejects material render-state edits before and during point encoding", async () => {
    const before = await fixture();
    const during = await fixture();
    try {
      (before.material.renderState as { depthWrite: boolean }).depthWrite = false;
      expect(() => before.device.drawNativePointQuads(before.command, before.context)).toThrow(/render state/i);
      during.onDraw(() => { (during.material.renderState as { depthWrite: boolean }).depthWrite = false; });
      expect(() => during.device.drawNativePointQuads(during.command, during.context)).toThrow(/render state/i);
      expect(before.submissions).toHaveLength(0);
      expect(during.draws).toEqual([[6, 1, 0]]);
      expect(during.submissions).toHaveLength(0);
    } finally { await before.close(); await during.close(); }
  });

  it.each([false, true])("defers a reentrant release until the queue attempt ends (throw=%s)", async throwAfterEnqueue => {
    const f = await fixture();
    let release: Promise<void> | undefined;
    try {
      f.failSubmitAfterEnqueue(throwAfterEnqueue);
      f.onSubmit(() => {
        release = f.lease.release();
        expect(f.lease.status).toBe("uploaded");
        expect(f.pointBuffers().every(buffer => buffer.destroy.mock.calls.length === 0)).toBe(true);
      });
      if (throwAfterEnqueue) expect(() => f.device.drawNativePointQuads(f.command, f.context)).toThrow(/submit failure after enqueue/i);
      else f.device.drawNativePointQuads(f.command, f.context);
      expect(f.submissions).toHaveLength(1);
      expect(f.pointBuffers()).toHaveLength(2);
      expect(f.events).not.toContain("fence-during-submit");
      expect(f.events.indexOf("submit-end")).toBeLessThan(f.events.indexOf("fence-after-submit"));
      expect(f.arena.reservedGpuBytes).toBeGreaterThan(0);
      expect(f.pointBuffers().every(buffer => buffer.destroy.mock.calls.length === 0)).toBe(true);
      let released = false;
      void release!.then(() => { released = true; });
      await Promise.resolve();
      expect(released).toBe(false);
      f.finishFence();
      await release;
      expect(f.arena.reservedGpuBytes).toBe(0);
      expect(f.pointBuffers().every(buffer => buffer.destroy.mock.calls.length === 1)).toBe(true);
    } finally { await f.close(); }
  });
});
