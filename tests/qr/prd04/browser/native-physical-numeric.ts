/**
 * Deferred WebGPU compute probe for independent shader candidates. This is not
 * the Aura renderer, a frame capture, or pixel evidence. The corresponding
 * acceptance spec must not run before the global source-complete gate.
 */
import { NATIVE_DFG_LUT_SIZE } from "../oracles/native-dfg-lut";
import {
  buildNativePhysicalComputeWgsl,
  createNativePhysicalNumericPlan,
  describeNativePhysicalReadback,
  nativeDfgRgba16f,
} from "../oracles/native-physical-numeric-harness";

interface NumericBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}
interface NumericTexture { createView(): unknown; destroy(): void }
interface NumericPipeline { getBindGroupLayout(index: number): unknown }
interface NumericPass {
  setPipeline(pipeline: NumericPipeline): void;
  setBindGroup(index: number, group: unknown): void;
  dispatchWorkgroups(x: number): void;
  end(): void;
}
interface NumericEncoder {
  beginComputePass(): NumericPass;
  copyBufferToBuffer(source: NumericBuffer, sourceOffset: number, destination: NumericBuffer, destinationOffset: number, size: number): void;
  finish(): unknown;
}
interface NumericShaderModule {
  getCompilationInfo?(): Promise<{ messages: readonly { type: string; message: string }[] }>;
}
interface NumericDevice {
  queue: {
    writeTexture(destination: unknown, data: Uint16Array, layout: unknown, size: unknown): void;
    submit(commands: readonly unknown[]): void;
  };
  createBuffer(descriptor: unknown): NumericBuffer;
  createTexture(descriptor: unknown): NumericTexture;
  createSampler(descriptor: unknown): unknown;
  createShaderModule(descriptor: unknown): NumericShaderModule;
  createComputePipelineAsync(descriptor: unknown): Promise<NumericPipeline>;
  createBindGroup(descriptor: unknown): unknown;
  createCommandEncoder(): NumericEncoder;
  destroy(): void;
}
interface NumericAdapter {
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
    readonly isFallbackAdapter?: boolean;
  };
  requestDevice(): Promise<NumericDevice>;
}
interface NumericGpu { requestAdapter(): Promise<NumericAdapter | null> }

// WebGPU usage bits from the WebGPU API. Keep COPY_SRC and COPY_DST distinct.
const MAP_READ = 0x0001, COPY_SRC = 0x0004, COPY_DST = 0x0008, STORAGE = 0x0080;
const TEXTURE_COPY_DST = 0x0002, TEXTURE_BINDING = 0x0004, READ = 0x0001;

async function run(): Promise<unknown> {
  const plan = createNativePhysicalNumericPlan();
  const gpu = (navigator as Navigator & { gpu?: NumericGpu }).gpu;
  if (!gpu) return { status: "unsupported", reason: "WebGPU is unavailable", categories: plan.categories };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { status: "unsupported", reason: "No WebGPU adapter was returned", categories: plan.categories };
  const device = await adapter.requestDevice();
  let output: NumericBuffer | undefined;
  let readback: NumericBuffer | undefined;
  let lut: NumericTexture | undefined;
  try {
    const source = buildNativePhysicalComputeWgsl(plan);
    const shader = device.createShaderModule({ label: "independent physical numerical candidates", code: source });
    const compilation = await shader.getCompilationInfo?.();
    const errors = compilation?.messages.filter((message) => message.type === "error") ?? [];
    if (errors.length) throw new Error(`WGSL compilation: ${errors.map((error) => error.message).join("; ")}`);
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto", compute: { module: shader, entryPoint: "main" },
    });
    const size = (plan.probes.length + 1) * 16;
    output = device.createBuffer({ size, usage: STORAGE | COPY_SRC });
    readback = device.createBuffer({ size, usage: COPY_DST | MAP_READ });
    lut = device.createTexture({
      size: { width: NATIVE_DFG_LUT_SIZE, height: NATIVE_DFG_LUT_SIZE, depthOrArrayLayers: 1 },
      format: "rgba16float", usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    // queue.writeTexture accepts the unpadded 128-byte row; no buffer-copy row
    // alignment is assumed. The source contains binary16 words, not float32s.
    device.queue.writeTexture({ texture: lut }, nativeDfgRgba16f(),
      { bytesPerRow: NATIVE_DFG_LUT_SIZE * 8, rowsPerImage: NATIVE_DFG_LUT_SIZE },
      { width: NATIVE_DFG_LUT_SIZE, height: NATIVE_DFG_LUT_SIZE, depthOrArrayLayers: 1 });
    const sampler = device.createSampler({
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", minFilter: "linear", magFilter: "linear",
    });
    const resultGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: output } }],
    });
    const textureGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [{ binding: 28, resource: sampler }, { binding: 29, resource: lut.createView() }],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, resultGroup);
    pass.setBindGroup(1, textureGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, size);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(READ);
    const values = new Float32Array(readback.getMappedRange()).slice();
    readback.unmap();

    const { measurements, negativeControl } = describeNativePhysicalReadback(plan, values);
    return {
      status: "completed",
      evidence: "independent shader candidates in a WebGPU compute pass; no renderer or pixel evidence",
      adapter: adapter.info ? {
        vendor: adapter.info.vendor ?? null,
        architecture: adapter.info.architecture ?? null,
        device: adapter.info.device ?? null,
        description: adapter.info.description ?? null,
        isFallbackAdapter: adapter.info.isFallbackAdapter ?? null,
      } : null,
      categories: plan.categories,
      measurements,
      unmapped: plan.unmapped,
      negativeControl,
      conformance: {
        status: "incomplete",
        reasons: [
          "The shader candidates are not connected to the Aura renderer.",
          "Mapped-sample GPU tolerances and numerical approximation budgets are unresolved.",
          "Unmapped models and different horizon conventions require independent shader integration or an explicit supported-model contract.",
        ],
      },
    };
  } finally {
    output?.destroy();
    readback?.destroy();
    lut?.destroy();
    device.destroy();
  }
}

declare global {
  interface Window { __AURA_NATIVE_PHYSICAL_NUMERIC__?: unknown }
}

run().then((result) => {
  window.__AURA_NATIVE_PHYSICAL_NUMERIC__ = result;
}).catch((error: unknown) => {
  window.__AURA_NATIVE_PHYSICAL_NUMERIC__ = {
    status: "error", reason: error instanceof Error ? error.message : String(error),
  };
});
