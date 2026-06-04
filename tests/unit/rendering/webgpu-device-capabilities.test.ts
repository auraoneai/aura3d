import { describe, expect, it } from "vitest";
import { createRenderDevice, type WebGPUAdapterLike, type WebGPUDeviceLike, type WebGPULike } from "../../../packages/rendering/src";

describe("WebGPU device capabilities", () => {
  it("publishes native capability flags from the WebGPU device surface", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createCapabilityWebGPU() });

    expect(device.kind).toBe("webgpu");
    expect(device.info.capabilities).toContain("buffers");
    expect(device.info.capabilities).toContain("render-targets");
    expect(device.info.capabilities).toContain("native-render-pipeline");
    expect(device.info.capabilities).toContain("native-sampled-textures");
    expect(device.info.capabilities).toContain("native-texture-readback");
    expect(device.info.renderer).toContain("unit-webgpu-capability-adapter");

    device.dispose();
  });
});

function createCapabilityWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-capability-adapter",
        info: { vendor: "aura3d-test", device: "capability-device" },
        async requestDevice() {
          return createCapabilityDevice();
        }
      };
    }
  };
}

function createCapabilityDevice(): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer() {},
      writeTexture() {},
      submit() {}
    },
    createBuffer(descriptor) {
      return {
        mapAsync: async () => {},
        getMappedRange: () => new ArrayBuffer(descriptor.size),
        unmap() {},
        destroy() {}
      };
    },
    createShaderModule: (descriptor) => ({ code: descriptor.code }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline() {},
        setVertexBuffer() {},
        setIndexBuffer() {},
        setBindGroup() {},
        draw() {},
        drawIndexed() {},
        end() {}
      }),
      copyTextureToBuffer() {},
      finish: () => ({})
    }),
    destroy() {}
  };
}
