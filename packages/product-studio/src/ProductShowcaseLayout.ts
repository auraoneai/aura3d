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
  readonly mode: "compact-multi-product";
  readonly items: readonly ProductShowcaseLayoutItem[];
  readonly frame: ProductShowcaseFrame;
  readonly limitations: readonly string[];
}

const COMPACT_SLOT_LAYOUT: Record<ProductShowcaseSlot, Omit<ProductShowcaseLayoutItem, "assetId" | "slot" | "materialVariantControl" | "defaultMaterialVariant">> = {
  hero: {
    position: [0.1, -0.89, 0.02],
    scale: [1, 1, 1],
    targetHeight: 0.6,
    yawRadians: -0.66,
    turntableSpeedRadiansPerSecond: 0.018
  },
  "left-detail": {
    position: [-0.98, -0.88, 0.28],
    scale: [1, 1, 1],
    targetHeight: 0.72,
    yawRadians: 0.1,
    turntableSpeedRadiansPerSecond: 0.18
  },
  "left-transparent": {
    position: [-1.24, -0.86, 0.72],
    scale: [1, 1, 1],
    targetHeight: 0.34,
    yawRadians: 0.45,
    turntableSpeedRadiansPerSecond: 0.1
  },
  "right-variant": {
    position: [1.0, -0.9, 0.38],
    scale: [1, 1, 1],
    targetHeight: 0.58,
    yawRadians: -0.52,
    turntableSpeedRadiansPerSecond: 0.14
  }
};

const COMPACT_FRAME: ProductShowcaseFrame = {
  boundsMin: [-1.56, -1.0, -0.76],
  boundsMax: [1.48, 0.58, 0.92],
  heroPaddingRatio: 0.008
};

export function createProductShowcaseLayout(slots: readonly ProductShowcaseSlotInput[]): ProductShowcaseLayout {
  return {
    schema: "g3d-product-showcase-layout/v1",
    mode: "compact-multi-product",
    items: slots.map((slot) => ({
      assetId: slot.assetId,
      slot: slot.slot,
      ...COMPACT_SLOT_LAYOUT[slot.slot],
      ...(slot.materialVariantControl ? { materialVariantControl: slot.materialVariantControl } : {}),
      ...(slot.defaultMaterialVariant ? { defaultMaterialVariant: slot.defaultMaterialVariant } : {})
    })),
    frame: COMPACT_FRAME,
    limitations: [
      "This layout helper owns deterministic multi-product staging and camera bounds, but it does not infer a semantic part graph from imported GLBs.",
      "Imported mesh triangle picking, authored exploded timelines, and physical contact shadows remain separate engine/runtime capabilities."
    ]
  };
}
