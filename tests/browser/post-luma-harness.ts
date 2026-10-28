import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

/**
 * Post-chain luma probe. Each scene renders once with no effects and once per
 * effect combination; the only difference between variants is the effect node,
 * so a mean-luma gap is attributable to the post chain (tone map and encode
 * happen once, in OutputPass, whether or not effects are on).
 */

type SceneId = "daylight" | "dusk-arena" | "pastel";
type EffectsId = "none" | "bloom" | "vignette" | "both";

interface Capture {
  readonly scene: SceneId;
  readonly effects: EffectsId;
  readonly flags: string;
  readonly meanLuma: number;
  readonly meanRgb: readonly [number, number, number];
  readonly meanChroma: number;
  readonly actualPasses: readonly string[];
  readonly postSkipped: unknown;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
}

declare global {
  interface Window {
    __POST_LUMA__?: { render(sceneId: SceneId, fx: EffectsId, flags?: string): Promise<Capture> };
    __POST_LUMA_ERROR__?: string;
  }
}

const warnings: string[] = [];
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(" ").slice(0, 240));
  originalWarn(...args);
};

window.__POST_LUMA__ = { render };

function build(sceneId: SceneId, fx: EffectsId) {
  const spec = {
    daylight: { bg: "#8ec5ff", ground: "#4f8a3c", box: "#d9573f", sun: 2.4 },
    "dusk-arena": { bg: "#14182b", ground: "#3a3f55", box: "#e0a53a", sun: 1.4 },
    pastel: { bg: "#f4d9a8", ground: "#d4a36a", box: "#b8323a", sun: 2.0 }
  }[sceneId];
  const builder = scene()
    .background(spec.bg)
    .camera(camera.perspective({ position: [0, 2.6, 5.2], target: [0, 0.6, 0], fov: 42 }))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: spec.ground, roughness: 0.85, metallic: 0 }) }).position(0, 0, 0).scale([14, 1, 14]))
    .add(primitives.box({ name: "box-a", material: material.pbr({ color: spec.box, roughness: 0.5, metallic: 0 }) }).position(-1.1, 0.5, 0).scale([1, 1, 1]))
    .add(primitives.box({ name: "box-b", material: material.pbr({ color: "#e8edf5", roughness: 0.4, metallic: 0 }) }).position(1.2, 0.35, -0.6).scale([0.7, 0.7, 0.7]))
    .add(lights.directional({ name: "sun", position: [3, 5, 3], intensity: spec.sun }));
  if (fx === "bloom" || fx === "both") builder.add(effects.bloom({ name: "probe-bloom", intensity: 0.16, threshold: 0.86, radius: 0.3 }));
  if (fx === "vignette" || fx === "both") builder.add(effects.vignette({ name: "probe-vignette", intensity: 0.16, smoothness: 0.65 }));
  return builder;
}

async function render(sceneId: SceneId, fx: EffectsId, requestedFlags?: string): Promise<Capture> {
  // "linearvig" is not a QR flag: it switches on the opt-in linear-light vignette (LegacyPost `linearVignetteEnabled`).
  const parts = (requestedFlags ?? "").split("+").filter(Boolean);
  (globalThis as { __A3D_LINEAR_VIGNETTE__?: boolean }).__A3D_LINEAR_VIGNETTE__ = parts.includes("linearvig");
  const flags = parts.filter((part) => part !== "linearvig").join(",") || undefined;
  const stage = document.getElementById("post-luma-stage")!;
  stage.replaceChildren();
  warnings.length = 0;
  const app = createAuraApp(stage, { pixelRatio: 1, resize: false, quality: "production", renderer: { qualityProfile: "production" }, ...(flags ? { qualityRebuild: { flags, allowUrlFlags: false } } : {}), scene: build(sceneId, fx) });
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
  let l = 0, c = 0, r = 0, g = 0, b = 0;
  const n = canvas.width * canvas.height;
  for (let i = 0; i < n; i += 1) {
    const R = pixels[i * 4]!, G = pixels[i * 4 + 1]!, B = pixels[i * 4 + 2]!;
    l += R * 0.2126 + G * 0.7152 + B * 0.0722;
    c += Math.max(R, G, B) - Math.min(R, G, B);
    r += R; g += G; b += B;
  }
  const diagnostics = app.diagnostics();
  const post = diagnostics.renderer?.postprocess;
  const out = diagnostics as unknown as { output?: { postSkipped?: unknown } };
  const capture: Capture = {
    scene: sceneId,
    effects: fx,
    flags: requestedFlags,
    meanLuma: Number((l / n).toFixed(3)),
    meanRgb: [Number((r / n).toFixed(2)), Number((g / n).toFixed(2)), Number((b / n).toFixed(2))],
    meanChroma: Number((c / n).toFixed(3)),
    actualPasses: [...(post?.actualPasses ?? [])],
    postSkipped: out.output?.postSkipped ?? null,
    warnings: [...warnings],
    drawCalls: diagnostics.drawCalls
  };
  app.dispose();
  return capture;
}
