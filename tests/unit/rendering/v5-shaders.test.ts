import { describe, expect, it } from "vitest";
import { CustomShaderMaterialCompat, NodeMaterialCompat, RawShaderMaterialCompat, SHADER_CHUNKS_V5, diagnoseV5Shader } from "../../../packages/three-compat/src";

describe("V5 shader authoring", () => {
  it("supports custom shader materials, raw shader materials, uniforms, nodes, chunks, and diagnostics", () => {
    const vertex = "void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }";
    const fragment = "precision highp float; out vec4 fragColor; void main() { fragColor = vec4(1.0); }";
    const material = new CustomShaderMaterialCompat(vertex, fragment).setUniform("uTime", 1).setUniform("uColor", [1, 0, 0]);
    const raw = new RawShaderMaterialCompat(vertex, fragment);
    const nodes = new NodeMaterialCompat().addNode({ id: "color", kind: "color" }).addNode({ id: "output", kind: "output" });
    const bad = diagnoseV5Shader(vertex, "precision highp float;");

    expect(material.diagnose().pass).toBe(true);
    expect(material.uniforms.entries()).toHaveLength(2);
    expect(raw.glslVersion).toBe("300 es");
    expect(nodes.compileGraph()).toEqual({ nodeCount: 2, hasOutput: true });
    expect(SHADER_CHUNKS_V5.pbrLighting).toContain("applyPbrLight");
    expect(bad.pass).toBe(false);
    expect(bad.errors).toContain("fragment shader missing void main");
  });
});
