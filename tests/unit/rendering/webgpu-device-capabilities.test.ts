import { describe, expect, it } from "vitest";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { identityMat4 } from "@aura3d/scene";
import { createRenderDevice, type WebGPUAdapterLike, type WebGPUDeviceLike, type WebGPULike } from "../../../packages/rendering/src";

describe("WebGPU device capabilities", () => {
  it("routes temporal velocity through real portable source injection and matrix packing", async () => {
    const modules: string[] = [];
    const uploads: Uint8Array[] = [];
    const native = createCapabilityDevice();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: {
      requestAdapter: async () => ({ name: "unit-temporal-contract", requestDevice: async () => ({
        ...native,
        createShaderModule: descriptor => { modules.push(descriptor.code); return { code: descriptor.code }; },
        queue: { ...native.queue, writeBuffer: (_buffer, _offset, data) => {
          const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
          uploads.push(new Uint8Array(bytes));
        } }
      }) })
    } });
    const owner = new TemporalHistory();
    const model = identityMat4();
    const item = { geometry: Geometry.triangle(), label: "rigid-temporal-contract", modelMatrix: model };
    try {
      device.beginFrame(16,16);
      owner.prepare(device,16,16,[item],identityMat4(),{});
      owner.commit(); device.endFrame();
      model[12] = .25;
      device.beginFrame(16,16);
      owner.prepare(device,16,16,[item],identityMat4(),{});
      device.endFrame();
      const velocity = modules.filter(code => code.includes("AURA_TEMPORAL_VELOCITY"));
      expect(velocity.length).toBeGreaterThanOrEqual(2);
      for (const code of velocity) {
        expect(code).not.toContain("/* @aura3d-bindings */");
        expect(code).toContain("var<uniform> aura: Aura3DPortableUniforms");
        expect(code).toContain("u_previousViewProjection: mat4x4<f32>");
      }
      expect(velocity.some(code => code.includes("aura.u_unjitteredViewProjection*vec4"))).toBe(true);
      const packed = uploads.filter(bytes => bytes.byteLength === 192).map(bytes => new Float32Array(bytes.buffer));
      expect(packed.some(values => values[12] === .25 && values[28] === 0)).toBe(true);
    } finally { owner.dispose(); device.dispose(); }
  });

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
  it("waits for native queue completion and propagates queue failure", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createCapabilityWebGPU(() => pending) });
    let settled = false;
    const wait = device.waitForSubmittedWork!().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await wait;
    expect(settled).toBe(true);
    device.dispose();
    const failed = await createRenderDevice({ backend: "webgpu", webgpu: createCapabilityWebGPU(async () => { throw new Error("queue lost"); }) });
    await expect(failed.waitForSubmittedWork!()).rejects.toThrow("queue lost");
    failed.dispose();
  });

  it("rejects missing native completion rather than fabricating a completed frame", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createCapabilityWebGPU() });
    await expect(device.waitForSubmittedWork!()).rejects.toMatchObject({ code: "GPU_COMPLETION_UNAVAILABLE" });
    device.dispose();
  });

});

function createCapabilityWebGPU(completion?: () => Promise<void>): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-capability-adapter",
        info: { vendor: "aura3d-test", device: "capability-device" },
        async requestDevice() {
          return createCapabilityDevice(completion);
        }
      };
    }
  };
}

function createCapabilityDevice(completion?: () => Promise<void>): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer() {},
      writeTexture() {},
      submit() {},
      ...(completion ? { onSubmittedWorkDone: completion } : {})
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
