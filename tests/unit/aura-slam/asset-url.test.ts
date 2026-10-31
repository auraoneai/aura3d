import { describe, expect, it } from "vitest";
import { emittedAssetUrl } from "../../../examples/aura-slam/view/assets";

describe("aura-slam emitted asset URLs (4.7.0 live 404: inlined net tile lost its data: scheme)", () => {
  it("keeps the full href of an inlined data: URI", () => {
    const uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABA";
    expect(emittedAssetUrl(new URL(uri))).toBe(uri);
  });
  it("keeps blob: URLs whole", () => {
    expect(emittedAssetUrl(new URL("blob:https://aura3d.auraone.ai/1234"))).toMatch(/^blob:/);
  });
  it("uses the path of an emitted file", () => {
    expect(emittedAssetUrl(new URL("https://aura3d.auraone.ai/assets/net-alpha.abc.png"))).toBe("/assets/net-alpha.abc.png");
  });
});
