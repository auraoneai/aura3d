import { describe, expect, it } from "vitest";
import { createProductShowcaseLayout } from "@aura3d/product-studio";

describe("product showcase layout", () => {
  it("creates a deterministic compact multi-product layout with frame bounds", () => {
    const layout = createProductShowcaseLayout([
      { assetId: "chronograph-watch", slot: "left-detail", materialVariantControl: "watchVariant", defaultMaterialVariant: "Midnight Gold" },
      { assetId: "car-concept", slot: "hero", materialVariantControl: "carVariant", defaultMaterialVariant: "Carmine Candy" },
      { assetId: "sunglasses-khronos", slot: "left-transparent" },
      { assetId: "materials-variants-shoe", slot: "right-variant", materialVariantControl: "shoeVariant", defaultMaterialVariant: "beach" }
    ]);

    expect(layout.schema).toBe("a3d-product-showcase-layout/v1");
    expect(layout.mode).toBe("hero-product-with-secondary-detail");
    expect(layout.items.map((item) => item.assetId)).toEqual([
      "chronograph-watch",
      "car-concept",
      "sunglasses-khronos",
      "materials-variants-shoe"
    ]);
    expect(layout.items.find((item) => item.slot === "hero")).toMatchObject({
      assetId: "car-concept",
      position: [-0.28, -0.88, 0.0],
      targetHeight: 0.92,
      yawRadians: -0.38,
      turntableSpeedRadiansPerSecond: 0.001,
      defaultMaterialVariant: "Carmine Candy"
    });
    expect(layout.items.find((item) => item.slot === "left-detail")).toMatchObject({
      assetId: "chronograph-watch",
      targetHeight: 0.24,
      position: [-2.28, -0.86, -0.72],
      defaultMaterialVariant: "Midnight Gold"
    });
    expect(layout.items.find((item) => item.slot === "right-variant")).toMatchObject({
      assetId: "materials-variants-shoe",
      targetHeight: 0.24,
      position: [2.34, -0.86, 0.58],
      defaultMaterialVariant: "beach"
    });
    expect(layout.frame).toEqual({
      boundsMin: [-1.3, -1.0, -0.78],
      boundsMax: [1.3, 0.5, 0.86],
      heroPaddingRatio: 0.02
    });
    expect(layout.limitations.join(" ")).toContain("secondary products remain loaded but are kept outside the default hero frame");
    expect(layout.limitations.join(" ")).toContain("does not infer a semantic part graph");
  });
});
