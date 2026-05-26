import { describe, expect, it } from "vitest";
import { Renderer } from "@aura3d/rendering";
import { createComparisonWorkflow } from "@aura3d/workflows";

describe("createComparisonWorkflow", () => {
  it("creates a renderable A3D/Three.js comparison workflow", async () => {
    const workflow = createComparisonWorkflow({ focus: "migration" });
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const diagnostics = renderer.render(workflow.source, workflow.camera);

    expect(workflow.kind).toBe("comparison");
    expect(workflow.comparison.focus).toBe("migration");
    expect(workflow.comparison.a3dSteps.length).toBeGreaterThan(0);
    expect(workflow.comparison.threeJsSteps.length).toBeGreaterThan(0);
    expect(workflow.comparison.migrationNotes.join(" ")).toContain("@aura3d/three-compat");
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["threejs-setup-comparison", "migration-notes"]));
    expect(workflow.diagnostics.warnings[0]).toContain("same-scene Three.js visual superiority");
    expect(diagnostics.lastError).toBeNull();
    renderer.dispose();
  });
});
