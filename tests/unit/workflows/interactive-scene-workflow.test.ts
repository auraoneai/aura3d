import { describe, expect, it } from "vitest";
import { Renderer } from "@aura3d/rendering";
import { createInteractiveSceneWorkflow } from "@aura3d/workflows";

describe("createInteractiveSceneWorkflow", () => {
  it("creates updateable interactive scene output", async () => {
    const workflow = createInteractiveSceneWorkflow({ preset: "orbiting-products" });
    const updated = workflow.update(1.25);
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const diagnostics = renderer.render(updated, workflow.camera);

    expect(workflow.kind).toBe("interactive-scene");
    expect(workflow.renderItems?.length).toBeGreaterThanOrEqual(2);
    expect(updated).not.toBe(workflow.source);
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["update-loop", "animated-transforms"]));
    expect(diagnostics.lastError).toBeNull();
    renderer.dispose();
  });
});
