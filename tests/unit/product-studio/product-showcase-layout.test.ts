import { describe, expect, it } from "vitest";
import { createProductShowcaseLayout } from "@galileo3d/product-studio";

describe("product showcase layout", () => {
  it("creates a deterministic compact multi-product layout with frame bounds", () => {
    const layout = createProductShowcaseLayout([
      { assetId: "chronograph-watch", slot: "left-detail", materialVariantControl: "watchVariant", defaultMaterialVariant: "Midnight Gold" },
      { assetId: "car-concept", slot: "hero", materialVariantControl: "carVariant", defaultMaterialVariant: "Carmine Candy" },
      { assetId: "sunglasses-khronos", slot: "left-transparent" },
      { assetId: "materials-variants-shoe", slot: "right-variant", materialVariantControl: "shoeVariant", defaultMaterialVariant: "beach" }
    ]);

    expect(layout.schema).toBe("g3d-product-showcase-layout/v1");
    expect(layout.mode).toBe("compact-multi-product");
    expect(layout.items.map((item) => item.assetId)).toEqual([
      "chronograph-watch",
      "car-concept",
      "sunglasses-khronos",
      "materials-variants-shoe"
    ]);
    expect(layout.items.find((item) => item.slot === "hero")).toMatchObject({
      assetId: "car-concept",
      targetHeight: 0.6,
      defaultMaterialVariant: "Carmine Candy"
    });
    expect(layout.items.find((item) => item.slot === "left-detail")).toMatchObject({
      assetId: "chronograph-watch",
      targetHeight: 0.72,
      defaultMaterialVariant: "Midnight Gold"
    });
    expect(layout.items.find((item) => item.slot === "right-variant")).toMatchObject({
      assetId: "materials-variants-shoe",
      targetHeight: 0.58,
      defaultMaterialVariant: "beach"
    });
    expect(layout.frame).toEqual({
      boundsMin: [-1.56, -1, -0.76],
      boundsMax: [1.48, 0.58, 0.92],
      heroPaddingRatio: 0.008
    });
    expect(layout.limitations.join(" ")).toContain("does not infer a semantic part graph");
  });
});
