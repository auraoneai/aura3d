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
interface LookCapture { readonly id: string; readonly meanLuma: number; readonly nonBlack: number; readonly jpeg: string; readonly warnings: readonly string[] }
declare global { interface Window { __LOOKS__?: { ids: readonly string[]; render(id: string): Promise<LookCapture> } } }

const warnings: string[] = [];
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ").slice(0, 200)); originalWarn(...args); };

function build(id: string) {
  return scene()
    .camera(camera.perspective({ position: [0, 2.6, 5.2], target: [0, 0.6, 0], fov: 42 }))
    .add(looks.preset(id as never))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#9a9a9a", roughness: 0.85, metallic: 0 }) }).position(0, 0, 0).scale([14, 1, 14]))
    .add(primitives.box({ name: "box-a", material: material.pbr({ color: "#c8c8c8", roughness: 0.5, metallic: 0 }) }).position(-1.1, 0.5, 0))
    .add(primitives.sphere({ name: "ball", material: material.pbr({ color: "#b0b0b0", roughness: 0.4, metallic: 0 }) }).position(0.4, 0.5, 0.6))
    .add(primitives.box({ name: "box-b", material: material.pbr({ color: "#e8e8e8", roughness: 0.4, metallic: 0 }) }).position(1.4, 0.35, -0.6).scale([0.7, 0.7, 0.7]));
}

async function render(id: string): Promise<LookCapture> {
  const stage = document.getElementById("looks-stage")!;
  stage.replaceChildren();
  warnings.length = 0;
  const app = createAuraApp(stage, { pixelRatio: 1, resize: false, renderer: { qualityProfile: "production" }, scene: build(id) });
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
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let sum = 0, nonBlack = 0;
  const n = canvas.width * canvas.height;
  for (let i = 0; i < n; i += 1) {
    const l = pixels[i * 4]! * 0.2126 + pixels[i * 4 + 1]! * 0.7152 + pixels[i * 4 + 2]! * 0.0722;
    sum += l;
    if (l > 8) nonBlack += 1;
  }
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
    nonBlack: Number((nonBlack / n).toFixed(3)),
    jpeg: copy.toDataURL("image/jpeg", 0.6).replace(/^data:image\/jpeg;base64,/, ""),
    warnings: [...warnings]
  };
  app.dispose();
  return capture;
}

window.__LOOKS__ = { ids: LOOK_IDS, render };
