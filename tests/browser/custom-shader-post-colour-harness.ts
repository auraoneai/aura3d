import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

/**
 * A full-frame quad whose `material.custom` fragment shader writes a fixed colour, rendered with
 * and without post effects. A custom shader's output is display-referred, so the centre pixel
 * must not change when a post effect is added.
 */
type VariantId = "baseline" | "decoded" | "decoded-bloom-grade" | "safe-basic" | "bloom" | "grade" | "vignette0" | "fxaa" | "bloom-grade" | "pbr-baseline" | "pbr-bloom";

export const CUSTOM_COLOUR = [0.2, 0.5, 0.9] as const;

interface Capture {
  readonly id: VariantId;
  readonly centre: readonly [number, number, number, number];
  readonly corner: readonly [number, number, number, number];
  readonly postprocessEnabled: boolean;
  readonly actualPasses: readonly string[];
  readonly drawCalls: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

declare global {
  interface Window {
    __POST_COLOUR__?: { readonly colour: readonly number[]; render(spec: string): Promise<Capture>; ids: readonly VariantId[] };
    __POST_COLOUR_ERROR__?: string;
  }
}

const ids: readonly VariantId[] = ["baseline", "decoded", "decoded-bloom-grade", "safe-basic", "bloom", "grade", "vignette0", "fxaa", "bloom-grade", "pbr-baseline", "pbr-bloom"];

function sceneFor(id: VariantId) {
  const [r, g, b] = CUSTOM_COLOUR;
  const pbr = id.startsWith("pbr");
  const surface = pbr
    ? material.pbr({ color: "#336699", roughness: 0.9, metallic: 0 })
    : id.startsWith("decoded")
      ? material.custom({ glsl: { fragment: `#include <colorspace_decode>\nout vec4 outColor;\nvoid main() { outColor = vec4(a3dSrgbToLinear(vec3(${r}, ${g}, ${b})), 1.0); }` }, side: "double" })
      : material.custom({ glsl: { fragment: `out vec4 outColor;\nvoid main() { outColor = vec4(${r}, ${g}, ${b}, 1.0); }` }, side: "double" });
  const builder = scene()
    .background("#202020")
    .camera(camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 40 }))
    .add(primitives.plane({ name: "quad", size: [12, 1, 12], material: surface }).rotate(Math.PI / 2, 0, 0));
  if (pbr) builder.add(lights.ambient({ name: "ambient", intensity: 1 })).add(lights.directional({ name: "sun", position: [0, 0, 5], target: [0, 0, 0], intensity: 1 }));
  if (id === "bloom" || id === "bloom-grade" || id === "decoded-bloom-grade" || id === "pbr-bloom") builder.add(effects.bloom({ name: "bloom", intensity: 0.2, threshold: 4, radius: 0.3 }));
  if (id === "grade" || id === "bloom-grade" || id === "decoded-bloom-grade") builder.add(effects.colorGrade({ name: "grade" }));
  if (id === "vignette0") builder.add(effects.vignette({ name: "vignette", intensity: 0, smoothness: 0.7 }));
  if (id === "fxaa") builder.add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  return builder;
}

const warnings: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ").slice(0, 200)); originalWarn(...args); };

async function render(spec: string): Promise<Capture> {
  warnings.length = 0;
  const [id, outputMode] = spec.split("@") as [VariantId, string | undefined];
  const stage = document.querySelector<HTMLElement>("#stage")!;
  stage.replaceChildren();
  const app = createAuraApp(stage, {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: id === "safe-basic" ? "safe-basic" : "production", fallback: "safe-basic" },
    ...(outputMode === "none" ? { output: { toneMapping: "none", dither: false } as never } : {}),
    scene: sceneFor(id)
  });
  await app.ready();
  for (let i = 0; i < 6; i += 1) app.step(1 / 60);
  const blob = (await app.capture?.({ type: "png-blob" })) as Blob;
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = surface.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const sample = (x: number, y: number) => {
    const px = ctx.getImageData(x, y, 1, 1).data;
    return [px[0]!, px[1]!, px[2]!, px[3]!] as const;
  };
  const diagnostics = app.diagnostics();
  const post = diagnostics.renderer?.postprocess;
  const capture: Capture = {
    id: spec as VariantId,
    centre: sample(bitmap.width >> 1, bitmap.height >> 1),
    corner: sample(8, 8),
    postprocessEnabled: post?.enabled ?? false,
    actualPasses: [...(post?.actualPasses ?? [])],
    drawCalls: diagnostics.drawCalls,
    errors: (diagnostics.errors ?? []).map(String).slice(0, 4),
    warnings: warnings.slice(0, 6)
  };
  app.dispose();
  return capture;
}

window.__POST_COLOUR__ = { colour: CUSTOM_COLOUR, render, ids };
