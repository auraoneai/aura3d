import { PBRMaterial } from "@aura3d/rendering";
import type { Material } from "@aura3d/rendering";
import type { ProductAsset, ProductMaterialMode, ProductMaterialModeId } from "./ProductTypes";

export function createProductMaterialMode(id: ProductMaterialModeId = "asset"): ProductMaterialMode {
  switch (id) {
    case "asset":
      return { id, label: "Asset", description: "Use product-authored glTF materials." };
    case "clay":
      return { id, label: "Clay", description: "Neutral clay material for shape review." };
    case "matte":
      return { id, label: "Matte", description: "Low-glare product material pass." };
    case "metal-check":
      return { id, label: "Metal", description: "High-metallic inspection material pass." };
    case "contrast":
      return { id, label: "Contrast", description: "High contrast material separation pass." };
  }
}

export function applyProductMaterialMode(asset: ProductAsset, mode: ProductMaterialMode): ReadonlyMap<string, Material> {
  if (mode.id === "asset") {
    return asset.resources.materialLibrary;
  }
  const output = new Map<string, Material>();
  let index = 0;
  for (const key of asset.resources.materialLibrary.keys()) {
    output.set(key, materialForMode(mode.id, index));
    index += 1;
  }
  return output;
}

function materialForMode(mode: ProductMaterialModeId, index: number): PBRMaterial {
  if (mode === "metal-check") {
    return new PBRMaterial({ name: `product-metal-check-${index}`, baseColor: [0.72, 0.72, 0.68, 1], metallic: 1, roughness: 0.18 });
  }
  if (mode === "contrast") {
    const palette = [[0.9, 0.16, 0.12, 1], [0.1, 0.42, 0.86, 1], [0.96, 0.76, 0.18, 1], [0.16, 0.72, 0.38, 1]] as const;
    return new PBRMaterial({ name: `product-contrast-${index}`, baseColor: palette[index % palette.length], metallic: 0.15, roughness: 0.42 });
  }
  if (mode === "matte") {
    return new PBRMaterial({ name: `product-matte-${index}`, baseColor: [0.56, 0.6, 0.58, 1], metallic: 0, roughness: 0.86 });
  }
  return new PBRMaterial({ name: `product-clay-${index}`, baseColor: [0.74, 0.7, 0.64, 1], metallic: 0, roughness: 0.74 });
}
