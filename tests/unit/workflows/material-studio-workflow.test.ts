import { describe, expect, it } from "vitest";
import { Renderer } from "@aura3d/rendering";
import { createMaterialStudioWorkflow } from "@aura3d/workflows";

describe("createMaterialStudioWorkflow", () => {
  it("creates material comparison render output", async () => {
    const workflow = createMaterialStudioWorkflow({ mode: "comparison" });
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const diagnostics = renderer.render(workflow.source, workflow.camera);

    expect(workflow.kind).toBe("material-studio");
    expect(workflow.renderItems?.length).toBeGreaterThanOrEqual(3);
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["pbr", "textured-pbr", "normal-mapped-pbr"]));
    expect(diagnostics.lastError).toBeNull();
    renderer.dispose();
  });
});
