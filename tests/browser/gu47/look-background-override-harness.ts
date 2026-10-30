import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

/**
 * GU47 E-A (WP-1) acceptance probe: an FC Munich-style scene (`interior-industrial`, scene background #0d1a24, the
 * aura-fc-3d venue overrides) with and without the look `background` override. With the override the look HDRI is
 * emitted with `background: false`, so the top grid row shows the colour instead of the studio HDRI.
 */
interface BackgroundCapture { readonly variant: string; readonly topRowLuma: number; readonly topRowLuma4: number; readonly meanLuma: number; readonly jpeg: string }
declare global { interface Window { __GU47_EA__?: { render(variant: "before" | "after", settleMs?: number): Promise<BackgroundCapture> } } }

const BACKGROUND = "#0d1a24";

function build(variant: "before" | "after") {
  const overrides = { fogDensityScale: 0.5, exposureEv: 0.08, ...(variant === "after" ? { background: BACKGROUND } : {}) };
  return scene()
    .background(BACKGROUND)
    .camera(camera.perspective({ position: [0, 2.2, 7.5], target: [0, 1.2, 0], fov: 50 }))
    .add(looks.preset("interior-industrial", overrides))
    .add(primitives.plane({ name: "pitch", material: material.pbr({ color: "#2f6b34", roughness: 0.9, metallic: 0 }) }).scale([30, 1, 30]))
    .add(primitives.box({ name: "goal-post", material: material.pbr({ color: "#e8e8e8", roughness: 0.4, metallic: 0 }) }).position(0, 1, -3).scale([4, 2, 0.2]));
}

async function frame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function render(variant: "before" | "after", settleMs = 4000): Promise<BackgroundCapture> {
  const stage = document.getElementById("look-stage")!;
  stage.replaceChildren();
  const app = createAuraApp(stage, { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: build(variant) });
  const started = performance.now();
  while (performance.now() - started < 60_000 && !(app.diagnostics().drawCalls > 0)) await new Promise((resolve) => setTimeout(resolve, 50));
  const settled = performance.now();
  while (performance.now() - settled < settleMs) await new Promise((resolve) => setTimeout(resolve, 250));
  await frame();
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const canvas = app.canvas!;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
  const { width, height } = canvas;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const luma = (i: number): number => pixels[i * 4]! * 0.2126 + pixels[i * 4 + 1]! * 0.7152 + pixels[i * 4 + 2]! * 0.0722;
  // readPixels rows run bottom-up: the top grid row is the last `rows` rows.
  const band = (rows: number): number => {
    let sum = 0;
    for (let y = height - rows; y < height; y += 1) for (let x = 0; x < width; x += 1) sum += luma(y * width + x);
    return sum / (rows * width);
  };
  let total = 0;
  for (let i = 0; i < width * height; i += 1) total += luma(i);
  const copy = document.createElement("canvas");
  copy.width = width; copy.height = height;
  const ctx = copy.getContext("2d")!;
  const flipped = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) flipped.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  ctx.putImageData(flipped, 0, 0);
  const capture: BackgroundCapture = {
    variant,
    topRowLuma: Number(band(Math.round(height / 8)).toFixed(2)),
    topRowLuma4: Number(band(Math.round(height / 4)).toFixed(2)),
    meanLuma: Number((total / (width * height)).toFixed(2)),
    jpeg: copy.toDataURL("image/jpeg", 0.7).replace(/^data:image\/jpeg;base64,/, "")
  };
  app.dispose();
  return capture;
}

window.__GU47_EA__ = { render };
