import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

/**
 * Exposure calibration probe (beat-three.js PRD, WP-Q.1). A flat Lambert-like
 * plane (roughness 1, metallic 0) fills the frame, lit head-on by one light.
 * Under three.js r185 (no legacy lights) the linear output is
 * albedo * intensity / PI. Each case renders with the linear operator (so the
 * canvas bytes decode straight back to scene-linear) and, separately, with the
 * default ACES operator so the display-referred luma can be compared too.
 */

export type LightKind = "directional" | "ambient" | "hemisphere" | "none" | "ambient+directional" | "hemisphere+directional";
export interface CalibrationCase {
  readonly id: string;
  readonly light: LightKind;
  readonly intensity: number;
  readonly albedo: string;
  readonly lightColor?: string;
  readonly post?: boolean;
}
export interface CalibrationCapture {
  readonly id: string;
  readonly toneMapping: string;
  readonly meanLinear: readonly [number, number, number];
  readonly meanSrgb: readonly [number, number, number];
  readonly meanLuma: number;
  readonly warnings: readonly string[];
  readonly diag: unknown;
}

declare global {
  interface Window {
    __EXPOSURE__?: { render(c: CalibrationCase, toneMapping: string): Promise<CalibrationCapture> };
  }
}

const warnings: string[] = [];
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(" ").slice(0, 240));
  originalWarn(...args);
};

const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  warnings.push(`error: ${args.map(String).join(" ").slice(0, 400)}`);
  originalError(...args);
};

window.__EXPOSURE__ = { render };

const srgbToLinear = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function build(c: CalibrationCase) {
  const builder = scene()
    .background("#000000")
    .camera(camera.perspective({ position: [0, 4, 0.01], target: [0, 0, 0], fov: 42 }))
    .add(primitives.plane({ name: "floor", material: material.pbr({ color: c.albedo, roughness: 1, metallic: 0 }) }).position(0, 0, 0).scale([14, 1, 14]));
  if (c.light === "directional") builder.add(lights.directional({ name: "sun", position: [0, 5, 0], intensity: c.intensity, color: c.lightColor ?? "#ffffff" }));
  if (c.light.endsWith("+directional")) builder.add(lights.directional({ name: "sun", position: [0, 5, 0], intensity: 2, color: "#ffffff" }));
  if (c.light.startsWith("ambient")) builder.add(lights.ambient({ name: "amb", intensity: c.intensity, color: c.lightColor ?? "#ffffff" }));
  if (c.light.startsWith("hemisphere")) builder.add(lights.hemisphere({ name: "hemi", skyColor: c.lightColor ?? "#ffffff", groundColor: c.lightColor ?? "#ffffff", intensity: c.intensity }));
  if (c.post) builder.add(effects.bloom({ name: "inert-bloom", intensity: 0.0001, threshold: 50, radius: 0.1 }));
  return builder;
}

async function render(c: CalibrationCase, toneMapping: string): Promise<CalibrationCapture> {
  const stage = document.getElementById("exposure-stage")!;
  stage.replaceChildren();
  warnings.length = 0;
  const app = createAuraApp(stage, {
    pixelRatio: 1,
    resize: false,
    renderer: { qualityProfile: "production" },
    // "default" authors no output options at all, so a scene without post takes the quality:auto direct path.
    ...(toneMapping === "default" ? {} : { output: { toneMapping: toneMapping as never, exposure: 1, dither: false } }),
    scene: build(c)
  });
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
  const w = canvas.width, h = canvas.height;
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // Centre 50% only: keeps frame edges and any horizon out of the mean.
  const x0 = Math.floor(w * 0.25), x1 = Math.floor(w * 0.75), y0 = Math.floor(h * 0.25), y1 = Math.floor(h * 0.75);
  const lin = [0, 0, 0], srgb = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k += 1) { srgb[k]! += pixels[i + k]!; lin[k]! += srgbToLinear(pixels[i + k]!); }
      n += 1;
    }
  }
  const meanLinear = lin.map((v) => v / n) as unknown as [number, number, number];
  const meanSrgb = srgb.map((v) => v / n) as unknown as [number, number, number];
  const capture: CalibrationCapture = {
    id: c.id,
    toneMapping,
    meanLinear: meanLinear.map((v) => Number(v.toFixed(5))) as unknown as [number, number, number],
    meanSrgb: meanSrgb.map((v) => Number(v.toFixed(3))) as unknown as [number, number, number],
    meanLuma: Number((meanSrgb[0] * 0.2126 + meanSrgb[1] * 0.7152 + meanSrgb[2] * 0.0722).toFixed(3)),
    warnings: [...warnings],
    diag: (() => {
      const d = app.diagnostics() as unknown as Record<string, unknown>;
      const base = { drawCalls: d.drawCalls, runtimeWarnings: d.runtimeWarnings, errors: d.errors };
      // Full dump only for cases that come out black, to find out why.
      return meanSrgb[0] + meanSrgb[1] + meanSrgb[2] === 0 && c.light !== "none"
        ? { ...base, overlay: stage.innerText.slice(0, 600) }
        : base;
    })()
  };
  app.dispose();
  return capture;
}
