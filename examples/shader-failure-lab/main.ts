/**
 * Shader failure lab: a valid lit box on the left, and (unless `?broken=0`) a box with a deliberate
 * duplicate-variable GLSL error on the right. The frame must still render the valid box, and
 * diagnostics().shaderFailures must name the material, stage and the offending source line.
 * Query: broken=0|1, mode=skip|magenta|throw (renderer.shaderFailures).
 */
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

type Win = Window & { __SHADER_LAB__?: unknown; __SHADER_LAB_ERROR__?: string };

const q = new URLSearchParams(location.search);
const BROKEN_FRAGMENT = `out vec4 outColor;
void main() {
  float shade = 0.5;
  float shade = 0.9; // DUPLICATE_DECLARATION_LINE
  outColor = vec4(shade, 0.1, 0.8, 1.0);
}`;

function readPixels(canvas: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  const url = canvas.toDataURL("image/png");
  const img = new Image();
  return new Promise((ok, bad) => {
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = canvas.width;
      c.height = canvas.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ok(ctx.getImageData(0, 0, c.width, c.height).data);
    };
    img.onerror = () => bad(new Error("decode failed"));
    img.src = url;
  });
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
  canvas.width = 320;
  canvas.height = 180;
  let s = scene()
    .background("#101820")
    .camera(camera.perspective({ fov: 40, near: 0.1, far: 60, position: [0, 1.5, 9], target: [0, 0.5, 0] }))
    .add(lights.ambient({ color: "#ffffff", intensity: 0.9 }))
    .add(lights.directional({ color: "#fff6e5", intensity: 1.4, position: [4, 8, 6] }))
    .add(primitives.box({ name: "valid-box", size: [2, 2, 2], material: material.pbr({ color: "#e0b030", roughness: 0.6 }) }).position(-2.4, 0.5, 0));
  if (q.get("broken") !== "0") {
    s = s.add(primitives.box({ name: "broken-box", size: [2, 2, 2], material: material.custom({ glsl: { fragment: BROKEN_FRAGMENT } }) }).position(2.4, 0.5, 0));
  }
  const mode = q.get("mode");
  const app = createAuraApp(canvas, {
    scene: s, autoStart: false, resize: false, pixelRatio: 1,
    renderer: { quality: "high", ...(mode ? { shaderFailures: mode as "skip" | "magenta" | "throw" } : {}) }
  } as never);
  await app.ready();
  let stepError = "";
  for (let i = 0; i < 4; i += 1) {
    try { app.step(1 / 60); } catch (error) { stepError = `${(error as { code?: string }).code ?? ""}: ${(error as Error).message}`; }
  }
  const pixels = await readPixels(canvas);
  const sample = (x0: number, x1: number): { lit: number; magenta: number } => {
    let lit = 0, magenta = 0;
    for (let y = 60; y < 120; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * canvas.width + x) * 4;
        const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        if (Math.abs(r - 0x10) + Math.abs(g - 0x18) + Math.abs(b - 0x20) > 60) lit += 1;
        if (r > 180 && b > 180 && g < 80) magenta += 1;
      }
    }
    return { lit, magenta };
  };
  const diagnostics = app.diagnostics() as { errors: readonly string[]; shaderFailures?: readonly unknown[]; drawCalls: number };
  (window as Win).__SHADER_LAB__ = {
    ready: true,
    stepError,
    left: sample(60, 130),
    right: sample(190, 260),
    errors: diagnostics.errors,
    shaderFailures: diagnostics.shaderFailures ?? [],
    drawCalls: diagnostics.drawCalls,
    image: canvas.toDataURL("image/jpeg", 0.8)
  };
}

main().catch((error: unknown) => { (window as Win).__SHADER_LAB_ERROR__ = String((error as Error)?.stack ?? error); });
