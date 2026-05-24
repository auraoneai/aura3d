export type ProductShowcaseSlot = "hero" | "left-detail" | "left-transparent" | "right-variant";

export interface ProductShowcaseSlotInput {
  readonly assetId: string;
  readonly slot: ProductShowcaseSlot;
  readonly materialVariantControl?: string;
  readonly defaultMaterialVariant?: string;
}

export interface ProductShowcaseLayoutItem {
  readonly assetId: string;
  readonly slot: ProductShowcaseSlot;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly targetHeight: number;
  readonly yawRadians: number;
  readonly turntableSpeedRadiansPerSecond: number;
  readonly materialVariantControl?: string;
  readonly defaultMaterialVariant?: string;
}

export interface ProductShowcaseFrame {
  readonly boundsMin: readonly [number, number, number];
  readonly boundsMax: readonly [number, number, number];
  readonly heroPaddingRatio: number;
}

export interface ProductShowcaseLayout {
  readonly schema: "g3d-product-showcase-layout/v1";
  readonly mode: "hero-product-with-secondary-detail";
  readonly items: readonly ProductShowcaseLayoutItem[];
  readonly frame: ProductShowcaseFrame;
  readonly limitations: readonly string[];
}

const COMPACT_SLOT_LAYOUT: Record<ProductShowcaseSlot, Omit<ProductShowcaseLayoutItem, "assetId" | "slot" | "materialVariantControl" | "defaultMaterialVariant">> = {
  hero: {
    position: [-0.28, -0.88, 0.0],
    scale: [1, 1, 1],
    targetHeight: 0.92,
    yawRadians: -0.38,
    turntableSpeedRadiansPerSecond: 0.001
  },
  "left-detail": {
    position: [-2.28, -0.86, -0.72],
    scale: [1, 1, 1],
    targetHeight: 0.24,
    yawRadians: 0.34,
    turntableSpeedRadiansPerSecond: 0.1
  },
  "left-transparent": {
    position: [-2.36, -0.87, 0.68],
    scale: [1, 1, 1],
    targetHeight: 0.11,
    yawRadians: 0.58,
    turntableSpeedRadiansPerSecond: 0.06
  },
  "right-variant": {
    position: [2.34, -0.86, 0.58],
    scale: [1, 1, 1],
    targetHeight: 0.24,
    yawRadians: -0.82,
    turntableSpeedRadiansPerSecond: 0.08
  }
};

const COMPACT_FRAME: ProductShowcaseFrame = {
  boundsMin: [-1.3, -1.0, -0.78],
  boundsMax: [1.3, 0.5, 0.86],
  heroPaddingRatio: 0.02
};

export function createProductShowcaseLayout(slots: readonly ProductShowcaseSlotInput[]): ProductShowcaseLayout {
  return {
    schema: "g3d-product-showcase-layout/v1",
    mode: "hero-product-with-secondary-detail",
    items: slots.map((slot) => ({
      assetId: slot.assetId,
      slot: slot.slot,
      ...COMPACT_SLOT_LAYOUT[slot.slot],
      ...(slot.materialVariantControl ? { materialVariantControl: slot.materialVariantControl } : {}),
      ...(slot.defaultMaterialVariant ? { defaultMaterialVariant: slot.defaultMaterialVariant } : {})
    })),
    frame: COMPACT_FRAME,
    limitations: [
      "This layout helper owns deterministic hero-first product staging and camera bounds; secondary products remain loaded but are kept outside the default hero frame so they cannot read as debris attached to the car.",
      "The layout does not infer a semantic part graph from imported GLBs; imported mesh triangle picking, authored exploded timelines, and physical contact shadows remain separate engine/runtime capabilities."
    ]
  };
}
