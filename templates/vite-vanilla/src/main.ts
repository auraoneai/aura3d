import { Geometry, Renderer, UnlitMaterial } from "@aura3d/rendering";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) {
  throw new Error("Missing starter canvas.");
}

void renderStarterScene();

async function renderStarterScene(): Promise<void> {
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.02, 0.025, 0.03, 1],
    preserveDrawingBuffer: true,
  });

  renderer.render([
    {
      geometry: Geometry.triangle(),
      material: new UnlitMaterial({ color: [1, 0.36, 0.12, 1] }),
      label: "starter-triangle",
    },
  ]);
}
