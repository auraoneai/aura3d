import { describe, expect, it } from "vitest";
import { Renderer } from "@aura3d/rendering";
import { createAnimationLabWorkflow } from "@aura3d/workflows";

describe("createAnimationLabWorkflow", () => {
  it("creates keyframe-driven animation lab output", async () => {
    const workflow = createAnimationLabWorkflow({ clip: "walk", speed: 1.25 });
    const updated = workflow.update(0.5);
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const diagnostics = renderer.render(updated, workflow.camera);

    expect(workflow.kind).toBe("animation-lab");
    expect(workflow.clips.map((clip) => clip.name)).toEqual(["idle", "walk", "run"]);
    expect(workflow.mixer.actionCount).toBe(1);
    expect(workflow.renderItems?.length).toBeGreaterThanOrEqual(5);
    expect(updated).not.toBe(workflow.source);
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["keyframe-clips", "timeline-sampling", "animated-transforms"]));
    expect(diagnostics.lastError).toBeNull();
    renderer.dispose();
  });
});
