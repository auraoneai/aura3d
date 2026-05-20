import type { RenderDeviceDiagnostics } from "@galileo3d/rendering";
import type { ProductAsset, ProductDiagnostics } from "./ProductTypes";

export function createProductDiagnostics(asset: ProductAsset, renderDiagnostics?: RenderDeviceDiagnostics): ProductDiagnostics {
  const warnings: string[] = [];
  if (asset.parts.length < 8) warnings.push(`Product asset ${asset.id} has too few named parts for Product Studio.`);
  if (asset.materials.length < 3) warnings.push(`Product asset ${asset.id} has too few named materials for Product Studio.`);
  if (asset.gltf.images.length === 0 || asset.gltf.textures.length === 0) warnings.push(`Product asset ${asset.id} is missing texture-backed materials.`);
  if (asset.gltf.meshes.some((mesh) => !mesh.name)) warnings.push(`Product asset ${asset.id} contains unnamed meshes.`);
  return {
    assetId: asset.id,
    partCount: asset.parts.length,
    materialCount: asset.materials.length,
    textureCount: asset.gltf.textures.length,
    meshCount: asset.gltf.meshes.length,
    warnings,
    ...(renderDiagnostics ? { renderDiagnostics } : {})
  };
}
