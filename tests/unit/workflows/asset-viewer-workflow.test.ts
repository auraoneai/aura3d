import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Renderer } from "@aura3d/rendering";
import { createAssetViewerWorkflow } from "@aura3d/workflows";

describe("createAssetViewerWorkflow", () => {
  it("loads a glTF asset and returns renderable workflow output", async () => {
    const workflow = await createAssetViewerWorkflow({
      url: jsonDataUri(readFileSync(join(process.cwd(), "fixtures/workflow-assets/assets/product-camera/product-camera.gltf"), "utf8")),
      postprocess: false,
      shadows: false,
      renderResources: {
        imageDecoder: () => ({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([220, 220, 220, 255]) })
      }
    });
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    const diagnostics = renderer.render(workflow.source, workflow.camera);

    expect(workflow.kind).toBe("asset-viewer");
    expect(workflow.diagnostics.asset?.meshCount).toBeGreaterThan(0);
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["asset-loading", "render-resources"]));
    expect(diagnostics.lastError).toBeNull();
    workflow.dispose();
    renderer.dispose();
  });
});

function jsonDataUri(json: string): string {
  return `data:model/gltf+json;base64,${Buffer.from(json).toString("base64")}`;
}
