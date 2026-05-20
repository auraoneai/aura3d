import type { ProductExportResult, ProductRenderScene, ProductSceneManifest } from "./ProductTypes";

export async function exportProductRender(canvas: HTMLCanvasElement | OffscreenCanvas, scene: ProductRenderScene): Promise<ProductExportResult> {
  const dataUrl = await canvasToDataUrl(canvas);
  return {
    mimeType: "image/png",
    dataUrl,
    byteLength: dataUrl.length,
    manifest: exportProductSceneManifest(scene)
  };
}

export function exportProductSceneManifest(scene: ProductRenderScene): ProductSceneManifest {
  return {
    schema: "g3d-product-studio-scene/v1",
    assetId: scene.asset.id,
    title: scene.asset.title,
    partCount: scene.asset.parts.length,
    materialCount: scene.asset.materials.length,
    materialMode: scene.materialMode.id,
    lightingPreset: scene.lighting.preset,
    cameraPreset: scene.cameraFrame.preset,
    generatedAt: new Date().toISOString()
  };
}

async function canvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
    return canvas.toDataURL("image/png");
  }
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const buffer = await blob.arrayBuffer();
    return `data:image/png;base64,${base64(buffer)}`;
  }
  throw new Error("Product render export requires HTMLCanvasElement.toDataURL or OffscreenCanvas.convertToBlob.");
}

function base64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
