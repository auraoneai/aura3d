import { describe, expect, it } from "vitest";
import {
  createRenderDevice,
  runWebGPURenderToTextureProof,
  type WebGPUAdapterLike,
  type WebGPUBufferDescriptorLike,
  type WebGPUBufferLike,
  type WebGPUDeviceLike,
  type WebGPULike
} from "../../../packages/rendering/src";

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
}

describe("WebGPU render-to-texture proof", () => {
  it("renders into an offscreen WebGPU render target, presents it, and disposes resources", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });

    const proof = runWebGPURenderToTextureProof(device, {
      width: 24,
      height: 24,
      label: "unit-webgpu-rtt"
    });

    expect(proof.backend).toBe("webgpu");
    expect(proof.renderTargetFormat).toBe("rgba8");
    expect(proof.hasDepthTexture).toBe(true);
    expect(proof.drawCalls).toBe(1);
    expect(proof.targetPixel).toEqual([26, 204, 51, 255]);
    expect(proof.presentedPixel).toEqual([26, 204, 51, 255]);
    expect(proof.readbackMatchesPresentation).toBe(true);
    expect(proof.targetPixels.byteLength).toBe(24 * 24 * 4);
    expect(proof.diagnosticsBeforeDispose.renderTargets).toBe(1);
    expect(proof.diagnosticsBeforeDispose.textures).toBe(1);
    expect(proof.disposedRenderTargets).toBeGreaterThanOrEqual(1);
    expect(proof.disposedTextures).toBeGreaterThanOrEqual(2);

    device.dispose();
    expect(device.disposed).toBe(true);
  });

  it("rejects non-WebGPU devices so RTT evidence cannot be counted from a fallback backend", () => {
    const device = new (class {
      readonly kind = "mock" as const;
    })();

    expect(() => runWebGPURenderToTextureProof(device as never)).toThrow(/requires a WebGPU render device/);
  });
});

function createFakeWebGPU(): WebGPULike {
  const device = createFakeWebGPUDevice();
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-rtt-adapter",
        info: { vendor: "aura3d-test" },
        async requestDevice() {
          return device;
        }
      };
    }
  };
}

function createFakeWebGPUDevice(): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const target = buffer as FakeWebGPUBuffer;
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(source, offset);
      },
      submit() {}
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        destroy() {
          this.data = new Uint8Array(0);
        }
      };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    createTexture(descriptor) {
      return {
        label: descriptor.label,
        format: descriptor.format,
        createView() {
          return { label: descriptor.label };
        },
        destroy() {}
      };
    },
    destroy() {}
  };
}
