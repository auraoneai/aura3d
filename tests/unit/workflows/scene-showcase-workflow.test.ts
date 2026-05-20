import { describe, expect, it } from "vitest";
import { Renderer } from "@galileo3d/rendering";
import { createSceneShowcaseWorkflow } from "@galileo3d/workflows";

describe("createSceneShowcaseWorkflow", () => {
  it("creates a multi-object scene workflow", async () => {
    const workflow = createSceneShowcaseWorkflow({ preset: "gallery" });
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const diagnostics = renderer.render(workflow.source, workflow.camera);

    expect(workflow.kind).toBe("scene-showcase");
    expect(workflow.renderItems?.length).toBeGreaterThanOrEqual(3);
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["multi-object-scene", "camera-framing"]));
    expect(diagnostics.lastError).toBeNull();
    renderer.dispose();
  });
});
