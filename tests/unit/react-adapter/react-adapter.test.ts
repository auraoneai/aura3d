import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { defineAuraAssets } from "../../../packages/engine/src";
import { Camera, Effect, Lights, Model, Scene, buildSceneFromChildren, productViewerScene } from "../../../packages/react/src";

const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "/aura-assets/product.12345678.glb",
    hash: "sha256-product"
  }
} as const);

describe("@aura3d/react", () => {
  test("builds the same product-viewer scene concepts", () => {
    const snapshot = productViewerScene(assets.product).toJSON();
    expect(snapshot.nodes.some((node) => node.kind === "model")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "light")).toBe(true);
  });

  test("converts component children into an Aura scene", () => {
    const tree = createElement(
      Scene,
      { background: "#08111f" },
      createElement(Model, { asset: assets.product }),
      createElement(Lights, { preset: "studio" }),
      createElement(Camera, { mode: "orbit", distance: 4 }),
      createElement(Effect, { type: "bloom", intensity: 0.35 })
    );
    const snapshot = buildSceneFromChildren(tree).toJSON();
    expect(snapshot.background).toBe("#08111f");
    expect(snapshot.camera.mode).toBe("orbit");
    expect(snapshot.nodes.map((node) => node.kind)).toEqual(["model", "light", "effect"]);
  });
});
