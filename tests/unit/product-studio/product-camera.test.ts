import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProductCameraFrame, loadProductAsset, validateProductCameraFrame } from "@galileo3d/product-studio";

describe("product camera framing", () => {
  it("creates valid frames for all Product Studio camera presets", async () => {
    const asset = await fixtureAsset("watch");
    for (const preset of ["front-three-quarter", "side-profile", "top-detail", "macro-detail"] as const) {
      const frame = createProductCameraFrame(asset, { preset, viewport: { width: 960, height: 640 } });
      validateProductCameraFrame(frame);
      expect(frame.preset).toBe(preset);
      expect(frame.frame.far).toBeGreaterThan(frame.frame.near);
    }
    asset.resources.dispose();
  });
});

async function fixtureAsset(id: string) {
  return loadProductAsset({
    id,
    url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), `fixtures/v2/products/${id}/${id}.gltf`))),
    manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), `fixtures/v2/products/${id}/manifest.json`)))
  });
}

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
