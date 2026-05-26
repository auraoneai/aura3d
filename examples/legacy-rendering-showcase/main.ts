import { Renderer, createCanonicalProductSceneRenderKit } from "@aura3d/rendering";

declare global {
  interface Window {
    __A3D_RENDERING_SHOWCASE_V1__?: ExampleState;
  }
}

interface ExampleState {
  readonly status: "ready" | "error";
  readonly diagnostics?: unknown;
  readonly shadowEnabled: boolean;
  readonly postprocessEnabled: boolean;
  readonly error?: string;
}

const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='legacy-rendering-showcase-canvas']");
if (!canvas) throw new Error("Rendering showcase canvas missing.");

void boot();

async function boot(): Promise<void> {
  const kit = createCanonicalProductSceneRenderKit({ lightingPreset: "inspection" });
  try {
    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.clientWidth || 960,
      height: canvas.clientHeight || 540,
      clearColor: [0.012, 0.014, 0.018, 1],
      preserveDrawingBuffer: true
    });
    const diagnostics = renderer.renderScene(kit.source);
    window.__A3D_RENDERING_SHOWCASE_V1__ = {
      status: "ready",
      diagnostics,
      shadowEnabled: typeof kit.source.shadow === "object" && kit.source.shadow.enabled === true,
      postprocessEnabled: Boolean(kit.source.postprocess)
    };
  } catch (error) {
    window.__A3D_RENDERING_SHOWCASE_V1__ = {
      status: "error",
      shadowEnabled: false,
      postprocessEnabled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
