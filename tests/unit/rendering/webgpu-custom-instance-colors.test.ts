import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { ForwardPass, Geometry, MockRenderDevice } from "../../../packages/rendering/src";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const translation = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
// Matrix-only instanced stage (Cross Hop's sun-shade decal shape): never reads instanceColor.
const MATRIX_ONLY_VERTEX = "void main() { gl_Position = projectionMatrix * viewMatrix * (modelMatrix * instanceMatrix * vec4(position, 1.0)); }";
const COLOR_VERTEX = "out vec4 vColor;\nvoid main() { vColor = instanceColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }";
const FRAGMENT = "out vec4 outColor;\nvoid main() { outColor = vec4(1.0); }";
const COLOR_FRAGMENT = "in vec4 vColor; out vec4 outColor;\nvoid main() { outColor = vColor; }";
const WGSL_VERTEX = `/* @aura3d-bindings */
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(8) m0: vec4<f32>, @location(9) m1: vec4<f32>, @location(10) m2: vec4<f32>, @location(11) m3: vec4<f32>) -> @builtin(position) vec4<f32> {
  return aura.u_modelViewProjection * mat4x4<f32>(m0, m1, m2, m3) * vec4<f32>(a_position, 1.0);
}`;
const WGSL_FRAGMENT = `/* @aura3d-bindings */
@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }`;

function streams(kind: "webgl2" | "webgpu", vertex: string, fragment: string): string[] {
  const material = createCustomShaderMaterial({ glsl: { vertex, fragment }, wgsl: { vertex: WGSL_VERTEX, fragment: WGSL_FRAGMENT } });
  const device = new MockRenderDevice();
  if (kind === "webgpu") Object.defineProperty(device, "kind", { value: "webgpu" });
  try {
    device.beginFrame(8, 8);
    new ForwardPass({ items: [{
      geometry: Geometry.litCube(1), material, modelMatrix: IDENTITY, label: "pool",
      instanceTransforms: new Float32Array([...translation(-1), ...translation(1)]),
      instanceColors: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1])
    }] }).execute({ device, width: 8, height: 8 });
    device.endFrame();
    const draw = device.drawCommands.find((command) => command.label?.startsWith("pool"));
    expect(draw?.instanceCount).toBe(2);
    return draw!.instanceAttributes!.map((attribute) => attribute.shaderName);
  } finally {
    material.dispose();
    device.dispose();
  }
}

const MATRICES = ["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3"];

describe("instanced material.custom colour stream on WebGPU", () => {
  it("leaves the colour stream out on WebGPU when the program never reads instanceColor", () => {
    expect(streams("webgpu", MATRIX_ONLY_VERTEX, FRAGMENT)).toEqual(MATRICES);
  });
  it("keeps it on WebGL2 (bound by name, unchanged) and wherever the program reads it", () => {
    expect(streams("webgl2", MATRIX_ONLY_VERTEX, FRAGMENT)).toEqual([...MATRICES, "a_instanceColor"]);
    expect(streams("webgpu", COLOR_VERTEX, COLOR_FRAGMENT)).toEqual([...MATRICES, "a_instanceColor"]);
  });
});
