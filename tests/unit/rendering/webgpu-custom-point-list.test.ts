import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { PortableShaderMaterial } from "../../../packages/rendering/src/PortableShaderMaterial";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";

const GLSL_VERTEX = `#version 300 es
in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main() { gl_Position = u_modelViewProjection * vec4(a_position, 1.0); gl_PointSize = 4.0; }`;
const GLSL_FRAGMENT = `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(1.0); }`;
const wgslVertex = (marker: string) => `/* @aura3d-bindings */
${marker}
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return aura.u_modelViewProjection * vec4<f32>(a_position, 1.0);
}`;
const WGSL_FRAGMENT = `/* @aura3d-bindings */
@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }`;

function draw(marker: string) {
  const shaderLibrary = createDefaultShaderLibrary();
  const material = new PortableShaderMaterial({
    shaderLibrary, name: `point-list-${marker ? "on" : "off"}`,
    sources: { glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT }, wgsl: { vertex: wgslVertex(marker), fragment: WGSL_FRAGMENT } }
  });
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  for (let i = 0; i < 3; i += 1) vertices.setAttribute(i, "position", [i, 0, 0]);
  const geometry = new Geometry(vertices, null, "points");
  const device = new MockRenderDevice();
  Object.defineProperty(device, "kind", { value: "webgpu" });
  device.beginFrame(8, 8);
  const run = () => new ForwardPass({ items: [{ geometry, material }], shaderLibrary }).execute({ device, width: 8, height: 8 });
  return { device, run };
}

describe("WebGPU custom point materials (@aura3d-point-list opt-in)", () => {
  it("still rejects a custom point material whose WGSL twin does not opt in", () => {
    const { device, run } = draw("");
    try {
      expect(run).toThrowError(expect.objectContaining({ code: "NATIVE_UNLIT_POINTS_UNSUPPORTED" }));
      expect(device.drawCommands).toHaveLength(0);
    } finally { device.dispose(); }
  });
  it("draws an opted-in custom point material as a plain point list through the ordinary path", () => {
    const { device, run } = draw("// @aura3d-point-list");
    try {
      run();
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]!.topology).toBe("points");
      expect(device.drawCommands[0]!.vertexCount).toBe(3);
    } finally { device.dispose(); }
  });
});
