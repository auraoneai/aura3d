import type { ProductRenderScene, ProductStudio } from "@aura3d/product-studio";

export interface ProductStudioViewport {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  mount(parent: HTMLElement): void;
  resize(studio: ProductStudio): { readonly width: number; readonly height: number };
  render(studio: ProductStudio, scene: ProductRenderScene): void;
  dispose(): void;
}

export function createProductStudioViewport(): ProductStudioViewport {
  const canvas = document.createElement("canvas");
  canvas.className = "product-studio-canvas";
  canvas.dataset.testid = "product-studio-canvas";
  let width = 1280;
  let height = 900;
  return {
    canvas,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    mount(parent) {
      parent.append(canvas);
    },
    resize(studio) {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      studio.resize(width, height);
      return { width, height };
    },
    render(studio, scene) {
      studio.render(scene);
    },
    dispose() {
      canvas.remove();
    }
  };
}
