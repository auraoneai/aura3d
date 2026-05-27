import { describe, expect, it } from "vitest";
import { createRenderDevice, runWebGPURenderToTextureProof, type WebGPUAdapterLike, type WebGPUDeviceLike, type WebGPULike } from "../../../packages/rendering/src";

interface LifecycleBuffer {
  data: Uint8Array;
  mapAsync(): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

describe("WebGPU render target lifecycle", () => {
  it("creates, reads, presents, and disposes a WebGPU render target", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createLifecycleWebGPU() });
    const proof = runWebGPURenderToTextureProof(device, { width: 16, height: 16, label: "unit-webgpu-lifecycle" });

    expect(proof.backend).toBe("webgpu");
    expect(proof.readbackMatchesPresentation).toBe(true);
    expect(proof.diagnosticsBeforeDispose.renderTargets).toBe(1);
    expect(proof.disposedRenderTargets).toBeGreaterThanOrEqual(1);
    expect(proof.disposedTextures).toBeGreaterThanOrEqual(2);

    device.dispose();
    expect(device.disposed).toBe(true);
  });
});

function createLifecycleWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-lifecycle-adapter",
        async requestDevice() {
          return createLifecycleDevice();
        }
      };
    }
  };
}

function createLifecycleDevice(): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer(buffer, offset, data) {
        const target = buffer as { data?: Uint8Array };
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data?.set(source, offset);
      },
      submit() {}
    },
    createBuffer(descriptor): LifecycleBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        mapAsync: async () => {},
        getMappedRange() {
          const copy = new ArrayBuffer(this.data.byteLength);
          new Uint8Array(copy).set(this.data);
          return copy;
        },
        unmap() {},
        destroy() {
          this.data = new Uint8Array(0);
        }
      };
    },
    createShaderModule: (descriptor) => ({ code: descriptor.code }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    destroy() {}
  };
}
