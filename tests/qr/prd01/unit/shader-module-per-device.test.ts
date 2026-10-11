/**
 * Lane-01 regression (GPU run 38143556299, app-capture-pdb): a ShaderModule
 * shared by two devices (the static SceneDepthCopyPass module with two
 * Renderers on one page) must compile one program per device. A single
 * cached program handed device A's program to device B, and B's draw threw
 * "Shader is not a live WebGL2 resource owned by this device".
 */

import { describe, expect, it } from "vitest";

import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ShaderModule } from "../../../../packages/rendering/src/ShaderModule";

const SOURCE = {
  label: "qr-shader-module-per-device",
  marker: "@aura3d-qr:shader-module",
  vertex: "#version 300 es\n// @aura3d-qr:shader-module\nin vec3 a_position;\nvoid main() { gl_Position = vec4(a_position, 1.0); }",
  fragment: "#version 300 es\n// @aura3d-qr:shader-module\nprecision mediump float;\nout vec4 outColor;\nvoid main() { outColor = vec4(1.0); }"
};

describe("ShaderModule per-device programs", () => {
  it("compiles one program per device and reuses it per device", () => {
    const module = new ShaderModule(SOURCE as never);
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const pa = module.compile(a);
    const pb = module.compile(b);
    expect(pb).not.toBe(pa);
    expect(module.compile(a)).toBe(pa);
    expect(module.compile(b)).toBe(pb);
  });

  it("recompiles after the device's program is disposed and disposes every program", () => {
    const module = new ShaderModule(SOURCE as never);
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const first = module.compile(a);
    first.dispose();
    const second = module.compile(a);
    expect(second).not.toBe(first);
    const other = module.compile(b);
    module.dispose();
    expect(second.disposed).toBe(true);
    expect(other.disposed).toBe(true);
  });
});
