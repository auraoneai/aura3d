import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { ShaderModule } from "../../../packages/rendering/src/ShaderModule";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

/** A mat4 array filled with fewer instances than its declared length (GL prefix-upload rule). */
async function fixture() {
  const writes: Float32Array[] = [];
  const native = {
    queue: {
      writeBuffer(_buffer: unknown, _offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        if (bytes.byteLength % 4 === 0) writes.push(new Float32Array(bytes));
      },
      submit() {}
    },
    createBuffer: ({ size }: { readonly size: number }) => ({ size, destroy() {} }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createShaderModule: (descriptor: unknown) => ({ descriptor }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }), finish: () => ({}) }),
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike }, device: native as unknown as WebGPUDeviceLike });
  const library = new ShaderLibrary();
  library.register({ name: "partial-mat4-array", marker: "partial-mat4-array",
    vertex: "// partial-mat4-array\nlayout(location=0) in vec3 a_position; uniform mat4 u_m[4]; void main() { gl_Position = u_m[0] * vec4(a_position, 1.0); }",
    fragment: "// partial-mat4-array\nout vec4 o; void main() { o = vec4(1.0); }",
    portableBindings: [{ name: "u_m", kind: "mat4", arrayLength: 4 }],
    webgpu: {
      vertex: "// partial-mat4-array\n/* @aura3d-bindings */\n@vertex fn vs_main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return aura.u_m[0] * vec4<f32>(p, 1.0); }",
      fragment: "// partial-mat4-array\n/* @aura3d-bindings */\n@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
    } });
  const shader = ShaderModule.fromLibrary(library, "partial-mat4-array").compile(device);
  const vertices = device.createBuffer("vertex", 36);
  const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
  const draw = (value: Float32Array) => device.draw({ topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3,
    vertexCount: 3, shader, uniforms: new Map([["u_m", value]]) });
  device.beginFrame(2, 2); device.setRenderTarget(target);
  return { device, writes, draw };
}

describe("WebGPU portable mat4 array uniforms", () => {
  it("accepts a whole-element prefix and zero-fills the remaining matrices", async () => {
    const f = await fixture();
    try {
      const two = new Float32Array(32).map((_, index) => index + 1);
      expect(() => f.draw(two)).not.toThrow();
      const upload = f.writes.find((values) => values.length >= 64 && values[0] === 1 && values[31] === 32);
      expect(upload).toBeDefined();
      expect(Array.from(upload!.slice(32, 64)).every((value) => value === 0)).toBe(true);
    } finally { f.device.endFrame(); f.device.dispose(); }
  });

  it("still rejects a value that is not a whole number of matrices or exceeds the array", async () => {
    const f = await fixture();
    try {
      expect(() => f.draw(new Float32Array(20))).toThrow(/wrong number or kind of components/);
      expect(() => f.draw(new Float32Array(80))).toThrow(/wrong number or kind of components/);
    } finally { f.device.endFrame(); f.device.dispose(); }
  });
});
