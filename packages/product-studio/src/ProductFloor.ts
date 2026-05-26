import { composeMat4 } from "@aura3d/scene";
import { Geometry, PBRMaterial } from "@aura3d/rendering";
import type { RenderItem } from "@aura3d/rendering";
import type { ProductAsset } from "./ProductTypes";

export function createProductFloor(asset: ProductAsset): RenderItem {
  const bounds = asset.resources.bounds;
  const width = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], 1) * 3.2;
  const y = bounds.min[1] - 0.04;
  return {
    label: "product-studio-floor",
    geometry: Geometry.texturedCube(1),
    material: new PBRMaterial({ name: "product-studio-floor-material", baseColor: [0.72, 0.73, 0.72, 1], metallic: 0, roughness: 0.62 }),
    includeInAutoFrame: false,
    modelMatrix: composeMat4([0, y, 0], [0, 0, 0, 1], [width, 0.035, width])
  };
}
