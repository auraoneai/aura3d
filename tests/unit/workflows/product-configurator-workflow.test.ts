import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProductConfiguratorWorkflow } from "@aura3d/workflows";

describe("createProductConfiguratorWorkflow", () => {
  it("loads a product asset and creates a product render scene", async () => {
    const workflow = await createProductConfiguratorWorkflow({
      asset: {
        id: "camera-kit",
        url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), "fixtures/product-studio/products/camera-kit/camera-kit.gltf"))),
        manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), "fixtures/product-studio/products/camera-kit/manifest.json")))
      },
      materialMode: "contrast",
      lighting: "hero-contrast",
      camera: "front-three-quarter"
    });

    expect(workflow.kind).toBe("product-configurator");
    expect(workflow.asset.parts.length).toBeGreaterThanOrEqual(8);
    expect(workflow.scene.materialMode.id).toBe("contrast");
    expect(workflow.scene.lighting.preset).toBe("hero-contrast");
    expect(workflow.diagnostics.featureChecklist).toEqual(expect.arrayContaining(["material-modes", "camera-presets"]));
    workflow.dispose();
  });
});

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
