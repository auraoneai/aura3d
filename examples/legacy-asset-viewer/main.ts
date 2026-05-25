import { Renderer } from "@galileo3d/rendering";
import { createRenderableScene, loadRenderableAsset } from "@galileo3d/assets";

declare global {
  interface Window {
    __G3D_ASSET_VIEWER_V1__?: ExampleState;
  }
}

interface ExampleState {
  readonly status: "ready" | "error";
  readonly diagnostics?: unknown;
  readonly warnings: readonly string[];
  readonly setupLineCount: number;
  readonly error?: string;
}

const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='legacy-asset-viewer-canvas']");
if (!canvas) throw new Error("Asset viewer canvas missing.");

void boot();

async function boot(): Promise<void> {
  try {
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.clientWidth || 960,
      height: canvas.clientHeight || 540,
      clearColor: [0.01, 0.012, 0.016, 1],
      preserveDrawingBuffer: true
    });
    const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.json");
    const scene = await createRenderableScene(asset, {
      camera: "auto-frame",
      lighting: "interiorGallery",
      shadows: true,
      postprocess: "product-default"
    });
    const diagnostics = renderer.renderScene(scene.source);
    window.__G3D_ASSET_VIEWER_V1__ = {
      status: "ready",
      diagnostics,
      warnings: scene.warnings,
      setupLineCount: scene.setupLineBudget
    };
  } catch (error) {
    window.__G3D_ASSET_VIEWER_V1__ = {
      status: "error",
      warnings: [],
      setupLineCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
