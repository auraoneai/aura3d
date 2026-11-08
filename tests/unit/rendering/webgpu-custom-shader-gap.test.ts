import { describe, expect, it } from "vitest";
import { material } from "../../../packages/engine/src/agent-api/nodes/material.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";

const GLSL = { fragment: "out vec4 outColor;\nvoid main() { outColor = vec4(1.0); }" };
const WGSL = { fragment: "/* @aura3d-bindings */\n@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }" };

describe("WebGPU pre-check: material.custom with GLSL and no WGSL twin", () => {
  it("names the nodes whose custom material has no WGSL program", () => {
    const snapshot = scene()
      .add(primitives.box({ name: "sky dome", material: material.custom({ glsl: GLSL }) }))
      .add(primitives.box({ name: "paired", material: material.custom({ glsl: GLSL, wgsl: WGSL }) }))
      .toJSON();
    expect(webgpuCustomShaderGap(snapshot)).toEqual({ code: "CUSTOM_SHADER_WGSL_MISSING", missing: ["wgsl:sky-dome"] });
  });

  it("finds GLSL-only materials in nested groups and instanced nodes, and caps the name list", () => {
    const glslOnly = () => material.custom({ glsl: GLSL });
    let s = scene();
    for (let i = 0; i < 6; i += 1) s = s.add(primitives.box({ name: `tower-${i}`, material: glslOnly(), instances: [{ position: [i, 0, 0] }] }));
    const gap = webgpuCustomShaderGap(s.toJSON());
    expect(gap?.missing).toEqual(["wgsl:tower-0", "wgsl:tower-1", "wgsl:tower-2", "wgsl:tower-3", "+2 more"]);
  });

  it("passes scenes whose custom materials all carry WGSL, and scenes without custom materials", () => {
    expect(webgpuCustomShaderGap(scene().add(primitives.box({ name: "a", material: material.custom({ glsl: GLSL, wgsl: WGSL }) })).toJSON())).toBeUndefined();
    expect(webgpuCustomShaderGap(scene().add(primitives.box({ name: "b", material: material.pbr({ color: "#ff0000" }) })).toJSON())).toBeUndefined();
    expect(webgpuCustomShaderGap(undefined)).toBeUndefined();
  });

  it("flags a WGSL twin with a vertex stage but no fragment stage (the compiler leaves that fragment empty)", () => {
    const vertexOnly = { vertex: "/* @aura3d-bindings */\n@vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }" };
    const snapshot = scene().add(primitives.box({ name: "half", material: material.custom({ glsl: GLSL, wgsl: vertexOnly }) })).toJSON();
    expect(webgpuCustomShaderGap(snapshot)).toEqual({ code: "CUSTOM_SHADER_WGSL_MISSING", missing: ["wgsl:half"] });
  });

  it("flags built-in materials that lower to GLSL-only custom programs (material.toon)", () => {
    const snapshot = scene().add(primitives.box({ name: "toon", material: material.toon({ color: "#88aaff" }) })).toJSON();
    expect(webgpuCustomShaderGap(snapshot)?.code).toBe("CUSTOM_SHADER_WGSL_MISSING");
  });
});
