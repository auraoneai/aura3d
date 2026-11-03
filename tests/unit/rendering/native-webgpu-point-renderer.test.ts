import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/engine/src/agent-api/compiler/lines";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import type { WebGPUDeviceLike, WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";

interface NativeBuffer {
  readonly label: string;
  destroyed: boolean;
  destroy(): void;
}

describe("WebGPU point quads through Renderer.render", () => {
  it("queues current point snapshots on successive public renderer frames", async () => {
    const buffers: NativeBuffer[] = [];
    const pointUploads: Uint8Array[] = [];
    const draws: number[][] = [];
    const queued: unknown[][] = [];
    const topologies: string[] = [];
    let signalFence!: () => void;
    const fence = new Promise<void>(resolve => { signalFence = resolve; });
    const native = {
      limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
      queue: {
        writeBuffer(buffer: NativeBuffer, _offset: number, data: ArrayBuffer | ArrayBufferView) {
          if (!buffer.label.startsWith("aura3d-point-")) return;
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          pointUploads.push(bytes.slice());
        },
        submit(commands: readonly unknown[]) { if (commands.length) queued.push([...commands]); },
        onSubmittedWorkDone: () => fence
      },
      createBuffer(descriptor: { label?: string }) {
        const buffer: NativeBuffer = { label: descriptor.label ?? "", destroyed: false, destroy() { this.destroyed = true; } };
        buffers.push(buffer);
        return buffer;
      },
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: (descriptor: object) => descriptor,
      createRenderPipeline(descriptor: { primitive: { topology: string } }) {
        topologies.push(descriptor.primitive.topology);
        return { getBindGroupLayout: (index: number) => ({ index }) };
      },
      createBindGroup: (descriptor: object) => descriptor,
      createCommandEncoder: () => ({
        beginRenderPass: () => ({
          setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setViewport() {}, setScissorRect() {},
          draw(...args: number[]) { draws.push(args); }, end() {}
        }),
        finish: () => ({})
      }),
      destroy() {}
    } as unknown as WebGPUDeviceLike;
    const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }) } as WebGPULike;
    const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
    const canvas = { width: 32, height: 24, getContext: () => context } as unknown as HTMLCanvasElement;
    const renderer = await Renderer.create({ backend: "webgpu", webgpu: gpu, canvas, width: 32, height: 24,
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_PARITY_LINES: true }) });
    const geometry = Geometry.points([[1, 0, 0]]);
    const material = new UnlitMaterial({ pointSize: 4 });
    const source = { renderItems: [{ label: "renderer-point", geometry, material }], cameraPolicy: "identity" as const,
      frustumCulling: false, shadow: { enabled: false } };
    try {
      renderer.render(source);
      geometry.vertexBuffer.setAttribute(0, "position", [2, 0, 0]);
      material.pointSize = 8;
      renderer.render(source);

      expect(draws).toEqual([[6, 1, 0], [6, 1, 0]]);
      expect(topologies).toEqual(["triangle-list", "triangle-list"]);
      expect(queued).toHaveLength(2);
      expect(geometry.vertexBuffer.hasAttemptedUpload).toBe(false);
      expect(pointUploads).toHaveLength(4);
      const firstPosition = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(0, true);
      expect([firstPosition(pointUploads[0]!), firstPosition(pointUploads[2]!)]).toEqual([1, 2]);
      const pointBuffers = buffers.filter(buffer => buffer.label.startsWith("aura3d-point-"));
      expect(pointBuffers).toHaveLength(4);
      expect(pointBuffers.every(buffer => !buffer.destroyed)).toBe(true);
      signalFence();
      await renderer.device.waitForSubmittedWork!();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      expect(pointBuffers.every(buffer => buffer.destroyed)).toBe(true);
    } finally {
      signalFence();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
});
