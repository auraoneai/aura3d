import { describe, expect, it } from "vitest";
import { createRenderDevice, type WebGPUAdapterLike, type WebGPULike } from "../../../packages/rendering/src";
import { resolveProductionRuntimeRendererBackend } from "../../../packages/rendering/src/production-runtime";

describe("WebGPU backend selection", () => {
  it("never silently returns WebGL2 for an explicit WebGPU request", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createSelectionWebGPU() });

    expect(device.kind).toBe("webgpu");
    expect(device.info.backend).toBe("webgpu");
    device.dispose();
  });

  it("fails explicit WebGPU honestly when runtime support is absent", async () => {
    await expect(createRenderDevice({ backend: "webgpu", webgpu: { requestAdapter: async () => null } })).rejects.toMatchObject({
      code: "WEBGPU_ADAPTER_MISSING"
    });
  });

  it("keeps explicit WebGL2 separate from WebGPU runtime probing", async () => {
    await expect(createRenderDevice({ backend: "webgl2" })).rejects.toMatchObject({
      code: "MISSING_CANVAS"
    });
  });

  it("documents production runtime auto-selection diagnostics", () => {
    expect(resolveProductionRuntimeRendererBackend({ backend: "auto" })).toMatchObject({
      requestedBackend: "auto",
      selectedBackend: "webgl2",
      fallback: true
    });
  });
});

function createSelectionWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-selection-adapter",
        async requestDevice() {
          return {
            queue: { writeBuffer() {}, submit() {} },
            createBuffer: (descriptor) => ({ byteLength: descriptor.size, destroy() {} }),
            destroy() {}
          };
        }
      };
    }
  };
}
