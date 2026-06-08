import { describe, expect, it } from "vitest";
import {
  createRenderDevice,
  MAX_WEBGPU_SKINNING_JOINTS,
  VertexFormat,
  type WebGPUAdapterLike,
  type WebGPUBufferDescriptorLike,
  type WebGPUBufferLike,
  type WebGPUDeviceLike,
  type WebGPULike
} from "../../../packages/rendering/src";

// T2.1 WebGPU 96-joint skinning parity. The WebGPU path previously skinned only 2 joints; it now
// uses a 96-joint palette (WebGL2 `u_jointMatrices[96]` parity) and the emulation rasterizer applies
// the full palette. This proves a vertex bound to a HIGH joint index (#80, far beyond the old cap of
// 2) actually drives the skinned render.

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
}

function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Column-major translate matrix (matches transformPosition's column-major convention).
function translate(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function palette(jointIndex: number, matrix: number[]): Float32Array {
  const data = new Float32Array(MAX_WEBGPU_SKINNING_JOINTS * 16);
  for (let j = 0; j < MAX_WEBGPU_SKINNING_JOINTS; j += 1) data.set(identity(), j * 16);
  data.set(matrix, jointIndex * 16);
  return data;
}

// A centered triangle, every vertex fully weighted to `jointIndex`.
function skinnedTriangle(jointIndex: number): Float32Array {
  const verts: number[][] = [
    [-0.6, -0.6, 0],
    [0.6, -0.6, 0],
    [0, 0.6, 0]
  ];
  const out: number[] = [];
  for (const v of verts) {
    out.push(v[0]!, v[1]!, v[2]!); // position
    out.push(jointIndex, 0, 0, 0); // joints
    out.push(1, 0, 0, 0); // weights
  }
  return new Float32Array(out);
}

async function renderSkinned(jointIndex: number, jointMatrix: number[]): Promise<number[]> {
  const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
  const width = 32;
  const height = 32;
  const target = device.createRenderTarget({ width, height, label: "skin-parity", format: "rgba8", depth: "texture" });
  const tri = skinnedTriangle(jointIndex);
  const vertexBuffer = device.createBuffer("vertex", tri.byteLength, tri);
  const shader = device.createShaderProgram({
    label: "skin-parity-shader",
    marker: "@aura3d-shader:skinned-unlit",
    vertex: `// @aura3d-shader:skinned-unlit
in vec3 position; in vec4 a_joints; in vec4 a_weights;
uniform mat4 u_modelViewProjection; uniform mat4 u_jointMatrices[96]; uniform float u_jointCount;
void main() { gl_Position = vec4(position, 1.0); }`,
    fragment: `// @aura3d-shader:skinned-unlit
uniform vec4 u_color; out vec4 outColor; void main() { outColor = u_color; }`
  });

  device.setRenderTarget(target);
  device.beginFrame(width, height);
  device.clear([0, 0, 0, 1]);
  device.draw({
    label: "skinned-triangle",
    topology: "triangles",
    vertexBuffer,
    vertexFormat: VertexFormat.P3J4W4,
    vertexCount: 3,
    shader,
    uniforms: new Map<string, unknown>([
      ["u_modelViewProjection", new Float32Array(identity())],
      ["u_color", [1, 1, 1, 1]],
      ["u_jointMatrices", palette(jointIndex, jointMatrix)],
      ["u_jointCount", MAX_WEBGPU_SKINNING_JOINTS]
    ]) as never
  });
  const center = Array.from(device.readPixels(width / 2, height / 2, 1, 1));
  device.endFrame();
  device.dispose();
  return center;
}

describe("WebGPU 96-joint skinning parity", () => {
  it("exposes a 96-joint palette capacity (WebGL2 u_jointMatrices[96] parity)", () => {
    expect(MAX_WEBGPU_SKINNING_JOINTS).toBe(96);
  });

  it("skins a vertex bound to joint #80 (beyond the old 2-joint cap)", async () => {
    // joint 80 = identity -> the triangle covers the center (white).
    const centered = await renderSkinned(80, identity());
    expect(centered[0]).toBeGreaterThan(200); // white triangle at center

    // joint 80 = translate far right -> the triangle leaves the center (stays cleared/black).
    const shifted = await renderSkinned(80, translate(5, 0, 0));
    expect(shifted[0]).toBeLessThan(50); // center no longer covered => joint #80 actually moved it
  });

  it("a high joint index produces the same result as the equivalent low index (palette parity)", async () => {
    const low = await renderSkinned(1, translate(0, 0, 0));
    const high = await renderSkinned(95, translate(0, 0, 0));
    expect(high).toEqual(low); // joint 95 is honored identically to joint 1
  });
});

function createFakeWebGPU(): WebGPULike {
  const device = createFakeWebGPUDevice();
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "skin-parity-adapter",
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
        const tgt = buffer as FakeWebGPUBuffer;
        const src = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        tgt.data.set(src, offset);
      },
      submit() {}
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return { data: new Uint8Array(descriptor.size), destroy() { this.data = new Uint8Array(0); } };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    createTexture(descriptor) {
      return { label: descriptor.label, format: descriptor.format, createView() { return { label: descriptor.label }; }, destroy() {} };
    },
    destroy() {}
  };
}
