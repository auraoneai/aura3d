import { describe, expect, it } from "vitest";
import { createOldBranchShaderGraphFixture } from "@galileo3d/editor-runtime";

describe("editor shader graph model", () => {
  it("ports bounded node library validation and codegen evidence from the old shader graph", () => {
    const fixture = createOldBranchShaderGraphFixture();
    const repeat = createOldBranchShaderGraphFixture();

    expect(fixture.id).toBe("v4-old-branch-shader-graph-fixture");
    expect(fixture.source).toBe("origin-master-shader-graph-adapted");
    expect(fixture.sourceFiles).toEqual([
      "origin/master:src/shaders/graph/ShaderGraph.ts",
      "origin/master:src/shaders/graph/NodeLibrary.ts",
      "origin/master:src/shaders/graph/GraphValidator.ts",
      "origin/master:src/shaders/graph/GraphSerializer.ts",
      "origin/master:src/shaders/graph/ShaderNode.ts"
    ]);
    expect(fixture.hash).toBe(repeat.hash);
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.nodes.map((node) => node.type)).toEqual([
      "uv.texcoord",
      "texture.sample2d",
      "color.rgb",
      "math.multiply",
      "vector.normal",
      "pbr.surface",
      "utility.output"
    ]);
    expect(fixture.categories).toEqual(["Color", "Math", "PBR", "Texture", "UV", "Utility", "Vector"]);
    expect(fixture.edges).toHaveLength(6);
    expect(fixture.validation).toMatchObject({
      valid: true,
      outputNodePresent: true,
      acyclic: true,
      connectedRequiredInputs: 6,
      typedConnections: 6,
      errors: []
    });
    expect(fixture.validation.warnings).toEqual([]);
    expect(fixture.codegen.targets).toEqual(["glsl", "wgsl"]);
    expect(fixture.codegen.uniformCount).toBe(3);
    expect(fixture.codegen.textureBindingCount).toBe(1);
    expect(fixture.codegen.generatedExpressionCount).toBeGreaterThanOrEqual(6);
    expect(fixture.codegen.glslHash).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.codegen.wgslHash).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.codegen.previewFragmentLines.join("\n")).toContain("g3dSurface.baseColor");
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "Unity Shader Graph parity",
      "Unreal Material Editor parity",
      "live visual node editor parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not claim a live visual node editor");
  });
});
