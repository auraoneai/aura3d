import { describe, expect, it } from "vitest";
import {
  MAX_UNIFORM_SKINNING_JOINTS,
  SkinningPaletteUploadManager,
  type RenderItem,
  type SkinningPaletteBinding
} from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { Material } from "../../../packages/rendering/src/Material";
import { type RenderShaderProgram, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

/**
 * E1 reason codes in diagnostics: every skinned submission records the
 * `decideSkinningPalettePath` decision (path + CPU-fallback reason) it uploaded with,
 * so per-rig palette claims rest on observed diagnostics.
 */
function fakeShader(uniforms: readonly string[]): RenderShaderProgram {
  return {
    reflection: {
      attributes: new Map(),
      uniforms: new Set(uniforms),
      attributeDetails: new Map(),
      uniformDetails: new Map()
    }
  } as unknown as RenderShaderProgram;
}

const FULL_SKINNING_UNIFORMS = [
  "u_jointMatrices",
  "u_jointCount",
  "u_jointPaletteTexture",
  "u_jointPaletteMode",
  "u_jointPaletteTextureSize"
] as const;

function skinnedItem(label: string): RenderItem {
  const vertices = new VertexBuffer(VertexFormat.P3N3J4W4, 3);
  for (let index = 0; index < 3; index += 1) {
    vertices.setAttribute(index, "position", [0, 0, 0]);
    vertices.setAttribute(index, "normal", [0, 0, 1]);
    vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
  }
  return {
    label,
    geometry: new Geometry(vertices, new IndexBuffer([0, 1, 2], 3)),
    material: new Material({ name: `${label}-material`, shaderKey: "skinning-decision-test" })
  };
}

function binding(jointCount: number): SkinningPaletteBinding {
  return { jointCount, matrices: new Float32Array(jointCount * 16).fill(1) };
}

describe("SkinningPaletteUploadManager decision diagnostics", () => {
  it("records a uniform-array decision with its reason for a small rig", () => {
    const manager = new SkinningPaletteUploadManager();
    manager.beginFrame();
    manager.bind(skinnedItem("hero-34"), binding(34), new Material({ name: "m", shaderKey: "k" }), fakeShader([...FULL_SKINNING_UNIFORMS]), new Map<string, UniformValue>());

    const diagnostics = manager.diagnostics();
    expect(diagnostics.submissions).toBe(1);
    expect(diagnostics.uniformArraySubmissions).toBe(1);
    expect(diagnostics.dataTextureSubmissions).toBe(0);
    expect(diagnostics.cpuFallbackCount).toBe(0);
    expect(diagnostics.decisions).toEqual([
      { label: "hero-34", jointCount: 34, path: "uniform-array", reason: "none-uniform-array", cpuFallback: false }
    ]);
    expect(diagnostics.decisionOverflow).toBe(0);
  });

  it("records a data-texture decision with its reason for a 136-joint rig", () => {
    const manager = new SkinningPaletteUploadManager();
    manager.beginFrame();
    manager.bind(
      skinnedItem("hero-136"),
      binding(136),
      new Material({ name: "m", shaderKey: "k" }),
      fakeShader([...FULL_SKINNING_UNIFORMS]),
      new Map<string, UniformValue>()
    );

    const diagnostics = manager.diagnostics();
    expect(diagnostics.uniformArraySubmissions).toBe(0);
    expect(diagnostics.dataTextureSubmissions).toBe(1);
    expect(diagnostics.decisions).toEqual([
      { label: "hero-136", jointCount: 136, path: "data-texture", reason: "none-data-texture", cpuFallback: false }
    ]);
    expect(diagnostics.maxJointCount).toBe(136);
    expect(diagnostics.jointsUploaded).toBe(136);
  });

  it("agrees with the uniform-array cap boundary on both sides", () => {
    const manager = new SkinningPaletteUploadManager();
    manager.beginFrame();
    const material = new Material({ name: "m", shaderKey: "k" });
    const shader = fakeShader([...FULL_SKINNING_UNIFORMS]);
    manager.bind(skinnedItem("at-cap"), binding(MAX_UNIFORM_SKINNING_JOINTS), material, shader, new Map<string, UniformValue>());
    manager.bind(skinnedItem("over-cap"), binding(MAX_UNIFORM_SKINNING_JOINTS + 1), material, shader, new Map<string, UniformValue>());

    const diagnostics = manager.diagnostics();
    expect(diagnostics.decisions.map((decision) => decision.path)).toEqual(["uniform-array", "data-texture"]);
    expect(diagnostics.decisions.map((decision) => decision.reason)).toEqual(["none-uniform-array", "none-data-texture"]);
  });

  it("records the cpu reason even when the upload then throws its contract error", () => {
    const manager = new SkinningPaletteUploadManager();
    manager.beginFrame();
    // Shader without the data-texture palette: the 136-joint upload must throw, but the
    // reason code for that decision is still published.
    expect(() =>
      manager.bind(
        skinnedItem("no-palette"),
        binding(136),
        new Material({ name: "m", shaderKey: "k" }),
        fakeShader(["u_jointMatrices", "u_jointCount"]),
        new Map<string, UniformValue>()
      )
    ).toThrow(/data-texture palette uniforms/);

    const diagnostics = manager.diagnostics();
    expect(diagnostics.submissions).toBe(0);
    expect(diagnostics.cpuFallbackCount).toBe(1);
    expect(diagnostics.decisions).toEqual([
      { label: "no-palette", jointCount: 136, path: "cpu", reason: "shader-lacks-data-texture-palette", cpuFallback: true }
    ]);
  });

  it("resets decisions every frame and bounds the recorded list", () => {
    const manager = new SkinningPaletteUploadManager();
    manager.beginFrame();
    const material = new Material({ name: "m", shaderKey: "k" });
    const shader = fakeShader([...FULL_SKINNING_UNIFORMS]);
    const uniforms = new Map<string, UniformValue>();
    for (let index = 0; index < 70; index += 1) {
      manager.bind(skinnedItem(`rig-${index}`), binding(4), material, shader, uniforms);
    }
    const full = manager.diagnostics();
    expect(full.submissions).toBe(70);
    expect(full.decisions).toHaveLength(64);
    expect(full.decisionOverflow).toBe(6);

    manager.beginFrame();
    const reset = manager.diagnostics();
    expect(reset.submissions).toBe(0);
    expect(reset.decisions).toEqual([]);
    expect(reset.decisionOverflow).toBe(0);
    expect(reset.cpuFallbackCount).toBe(0);
  });
});
