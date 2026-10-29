import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

// The 15 v0 look presets (packages/engine/src/agent-api/looks/lookPresets.ts); hard-coded because the root entry does not export the id list.
const LOOK_IDS = [
  "outdoor-day", "golden-hour", "overcast", "night-city", "polar-night", "alpine-snow", "interior-warm", "interior-neutral",
  "interior-industrial", "space", "underwater", "product-studio", "character-showcase", "arena-fight", "neon-arcade"
] as const;

/**
 * Look preset exposure probe: every `looks.preset(id)` lights the same small scene (grey ground, three grey solids),
 * so a mean-luma shift between two engine builds is attributable to the lighting convention alone.
 */
interface LookCapture { readonly id: string; readonly meanLuma: number; readonly firstFrameLuma: number; readonly nonBlack: number; readonly jpeg: string; readonly warnings: readonly string[] }
declare global { interface Window { __LOOKS__?: { ids: readonly string[]; render(id: string, settleMs?: number, fillScale?: number): Promise<LookCapture> } } }

const warnings: string[] = [];
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ").slice(0, 200)); originalWarn(...args); };

/** `fillScale` multiplies the intensity of the look's procedural fill (the `lookFill` environment node), for calibration sweeps. */
function lookWithFillScale(id: string, fillScale: number) {
  const node = looks.preset(id as never).toJSON() as unknown as { children?: Array<{ lookFill?: boolean; intensity?: number }> };
  if (fillScale !== 1) for (const child of node.children ?? []) if (child.lookFill === true && typeof child.intensity === "number") child.intensity *= fillScale;
  return node as never;
}

function build(id: string, fillScale = 1) {
  return scene()
    .camera(camera.perspective({ position: [0, 2.6, 5.2], target: [0, 0.6, 0], fov: 42 }))
    .add(lookWithFillScale(id, fillScale))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#9a9a9a", roughness: 0.85, metallic: 0 }) }).position(0, 0, 0).scale([14, 1, 14]))
    .add(primitives.box({ name: "box-a", material: material.pbr({ color: "#c8c8c8", roughness: 0.5, metallic: 0 }) }).position(-1.1, 0.5, 0))
    .add(primitives.sphere({ name: "ball", material: material.pbr({ color: "#b0b0b0", roughness: 0.4, metallic: 0 }) }).position(0.4, 0.5, 0.6))
    .add(primitives.box({ name: "box-b", material: material.pbr({ color: "#e8e8e8", roughness: 0.4, metallic: 0 }) }).position(1.4, 0.35, -0.6).scale([0.7, 0.7, 0.7]));
}

/**
 * `settleMs` waits after the first presented frame before the reported reading. A baked environment probe (night, studio) is
 * fetched asynchronously and replaces the analytic neutral floor a few seconds in, so a 2-frame read measures the placeholder
 * floor, not the final lighting. `firstFrameLuma` keeps the early reading for comparison.
 */
async function render(id: string, settleMs = 0, fillScale = 1): Promise<LookCapture> {
  const stage = document.getElementById("looks-stage")!;
  stage.replaceChildren();
  warnings.length = 0;
  const app = createAuraApp(stage, { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: build(id, fillScale) });
  const started = performance.now();
  while (performance.now() - started < 60_000) {
    const d = app.diagnostics();
    if (d.drawCalls > 0 && d.renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const canvas = app.canvas!;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
  const n = canvas.width * canvas.height;
  const read = () => {
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0, nonBlack = 0;
    for (let i = 0; i < n; i += 1) {
      const l = pixels[i * 4]! * 0.2126 + pixels[i * 4 + 1]! * 0.7152 + pixels[i * 4 + 2]! * 0.0722;
      sum += l;
      if (l > 8) nonBlack += 1;
    }
    return { pixels, sum, nonBlack };
  };
  const first = read();
  const settleStart = performance.now();
  while (performance.now() - settleStart < settleMs) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (settleMs > 0) {
    // Same sequence as the first reading: the drawing buffer is only valid right after a presented frame.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    app.step(1 / 60);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  const { pixels, sum, nonBlack } = settleMs > 0 ? read() : first;
  const copy = document.createElement("canvas");
  copy.width = canvas.width; copy.height = canvas.height;
  const ctx = copy.getContext("2d")!;
  const flipped = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    flipped.data.set(pixels.subarray((canvas.height - 1 - y) * canvas.width * 4, (canvas.height - y) * canvas.width * 4), y * canvas.width * 4);
  }
  ctx.putImageData(flipped, 0, 0);
  const capture: LookCapture = {
    id,
    meanLuma: Number((sum / n).toFixed(2)),
    firstFrameLuma: Number((first.sum / n).toFixed(2)),
    nonBlack: Number((nonBlack / n).toFixed(3)),
    jpeg: copy.toDataURL("image/jpeg", 0.6).replace(/^data:image\/jpeg;base64,/, ""),
    warnings: [...warnings]
  };
  app.dispose();
  return capture;
}

window.__LOOKS__ = { ids: LOOK_IDS, render };
