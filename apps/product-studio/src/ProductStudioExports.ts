import type { ProductExportResult, ProductRenderScene, ProductStudio } from "@aura3d/product-studio";

export async function exportCurrentProductRender(studio: ProductStudio, scene: ProductRenderScene): Promise<ProductExportResult> {
  return studio.exportPng(scene);
}
