/**
 * material.custom draw probe: a matrix of the smallest custom materials the Crayon ports use
 * (opaque / alpha / additive, depthWrite, side, inside-view sphere at several sizes, additive cone,
 * runtime setUniform on a transparent geometry.custom beam). Each case mounts its own app on the
 * shared canvas, renders identity output, and reports mean RGB samples.
 */
import { camera, createAuraApp, geometry, material, primitives, scene, type AuraApp } from "@aura3d/engine";

type Spec = Parameters<typeof material.custom>[0];
interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface CaseResult { readonly id: string; readonly center: Rgb; readonly corner: Rgb; readonly lit: number; readonly extra?: Record<string, unknown> }

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const errors: string[] = [];
const warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ").slice(0, 240)); origWarn(...args); };

const solid = (r: number, g: number, b: number, a = 1) => `out vec4 outColor;\nvoid main() { outColor = vec4(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, ${a.toFixed(3)}); }`;
const quad = (z: number, fragment: string, spec: Partial<Spec> = {}, size = 2.4) =>
  primitives.plane({ name: `q${z}`, size: [size, 1, size], material: material.custom({ glsl: { fragment }, side: "double", ...spec } as Spec) }).position(0, 0, z).rotate(Math.PI / 2, 0, 0);
const front = camera.perspective({ position: [0, 0, 7], target: [0, 0, 0], fov: 40 });
const inside = camera.perspective({ position: [0, 40, 0], target: [0, 0, 0], fov: 60, near: 0.3, far: 4200 });

const BEAM_VERTEX = `out vec3 vW; out float vT;
void main() { vT = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BEAM_FRAGMENT = `in vec3 vW; in float vT; out vec4 outColor;
void main() { float a = beamAmount * (1.0 - vT); outColor = vec4(beamColor, a); }`;
const beamSpec = (): Spec => ({
  glsl: { vertex: BEAM_VERTEX, fragment: BEAM_FRAGMENT },
  uniforms: { beamColor: { type: "color3", value: [1, 0.8, 0.6] }, beamAmount: { type: "f32", value: 0 } },
  transparent: true, depthWrite: false, depthTest: true, blending: "additive", side: "double"
} as Spec);
const coneGeometry = () => {
  const segs = 24, positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  positions.push(0, 0, 0); uvs.push(0.5, 0);
  for (let i = 0; i <= segs; i += 1) { const a = (i / segs) * Math.PI * 2; positions.push(Math.cos(a) * 1.2, Math.sin(a) * 1.2, -3); uvs.push(i / segs, 1); }
  for (let i = 1; i <= segs; i += 1) indices.push(0, i, i + 1);
  return geometry.dynamic({ positions: Float32Array.from(positions), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices) });
};

interface Case { readonly id: string; build(): { readonly scene: ReturnType<typeof scene>; readonly after?: (app: AuraApp) => void } }
const bg = (color = "#000000") => scene().background(color);
const cases: Case[] = [
  { id: "opaque-red", build: () => ({ scene: bg().camera(front).add(quad(0, solid(1, 0, 0))) }) },
  { id: "alpha-half-red", build: () => ({ scene: bg().camera(front).add(quad(0, solid(1, 0, 0, 0.5), { transparent: true })) }) },
  { id: "additive-grey", build: () => ({ scene: bg().camera(front).add(quad(0, solid(0.5, 0.5, 0.5, 1), { transparent: true, blending: "additive", depthWrite: false })) }) },
  { id: "additive-grey-alpha-half", build: () => ({ scene: bg().camera(front).add(quad(0, solid(0.5, 0.5, 0.5, 0.5), { transparent: true, blending: "additive", depthWrite: false })) }) },
  { id: "alpha-over-opaque-green", build: () => ({ scene: bg().camera(front).add(quad(0, solid(0, 1, 0))).add(quad(1, solid(1, 0, 0, 0.5), { transparent: true })) }) },
  { id: "depthwrite-off-opaque-behind", build: () => ({ scene: bg().camera(front).add(quad(1, solid(1, 0, 0), { depthWrite: false })).add(quad(0, solid(0, 1, 0))) }) },
  { id: "unused-uniforms-red", build: () => ({ scene: bg().camera(front).add(quad(0, solid(1, 0, 0), { uniforms: { a: { type: "f32", value: 1 }, b: { type: "color3", value: [1, 1, 1] } } })) }) },
  ...[20, 900, 3400].flatMap((size) => (["back", "double", "front"] as const).map((side): Case => ({
    id: `sky-${side}-${size}`,
    build: () => ({ scene: bg().camera(inside).add(primitives.sphere({ name: "sky", size, material: material.custom({ glsl: { fragment: solid(1, 0, 0) }, side, depthWrite: false } as Spec) })) })
  }))),
  { id: "sky-back-3400-moved-to-eye", build: () => ({
    scene: bg().camera(inside).add(primitives.sphere({ name: "sky", size: 3400, material: material.custom({ glsl: { fragment: solid(1, 0, 0) }, side: "back", depthWrite: false } as Spec) }).runtime({ id: "sky" })),
    after: (app) => { app.nodes.require("sky").setPosition?.(0, 40, 0); }
  }) },
  { id: "sky-back-900-uniforms-heavy", build: () => ({ scene: bg().camera(inside).add(primitives.sphere({ name: "sky", size: 900, material: material.custom({
    glsl: { fragment: `out vec4 outColor; void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }` },
    uniforms: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`u${i}`, { type: "color3", value: [i / 12, 0, 0] }])), side: "back", depthWrite: false } as Spec) })) }) },
  { id: "additive-cone-primitive", build: () => ({ scene: bg().camera(front).add(primitives.cone({ name: "cone", size: 2, material: material.custom({ glsl: { fragment: solid(1, 0.8, 0.6, 1) }, transparent: true, blending: "additive", depthWrite: false, side: "double" } as Spec) })) }) },
  { id: "beam-amount-0", build: () => ({ scene: bg().camera(front).add(geometry.custom(coneGeometry(), { name: "beam", material: material.custom(beamSpec()) }).runtime({ id: "beam" })) }) },
  { id: "beam-amount-1-initial", build: () => ({ scene: bg().camera(front).add(geometry.custom(coneGeometry(), { name: "beam", material: material.custom({ ...beamSpec(), uniforms: { beamColor: { type: "color3", value: [1, 0.8, 0.6] }, beamAmount: { type: "f32", value: 1 } } } as Spec) }).runtime({ id: "beam" })) }) },
  { id: "beam-amount-0-then-setUniform-1", build: () => ({
    scene: bg().camera(front).add(geometry.custom(coneGeometry(), { name: "beam", material: material.custom(beamSpec()) }).runtime({ id: "beam" })),
    after: (app) => { app.nodes.require("beam").setUniform?.("beamAmount", 1); }
  }) }
];

const mean = (img: ImageData, x0: number, y0: number, x1: number, y1: number): Rgb => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const i = (y * img.width + x) * 4; r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; n += 1; }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
};

let app: AuraApp | undefined;
async function run(id: string): Promise<CaseResult> {
  const found = cases.find((c) => c.id === id);
  if (!found) throw new Error(`unknown case ${id}`);
  app?.dispose(); app = undefined;
  warnings.length = 0;
  const built = found.build();
  app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, output: { toneMapping: "none", dither: false }, scene: built.scene });
  await app.ready();
  built.after?.(app);
  for (let i = 0; i < 6; i += 1) app.step(1 / 60);
  const blob = (await app.capture?.({ type: "png-blob" })) as Blob;
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = surface.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let lit = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! + img.data[i + 1]! + img.data[i + 2]! > 30) lit += 1;
  const w = img.width, h = img.height;
  const diag = app.diagnostics?.();
  return { id, center: mean(img, w / 2 - 12, h / 2 - 12, w / 2 + 12, h / 2 + 12), corner: mean(img, 4, 4, 24, 24), lit,
    extra: { warnings: warnings.slice(0, 4), errors: (diag as unknown as { errors?: readonly unknown[] } | undefined)?.errors?.length ?? -1, drawCalls: (app.info?.render as { calls?: number } | undefined)?.calls } };
}

(window as unknown as Record<string, unknown>).__CDP__ = { ids: cases.map((c) => c.id), run, errors };
(window as unknown as Record<string, unknown>).__CDP_READY__ = true;
document.querySelector("#evidence")!.textContent = "ready";
window.addEventListener("error", (e) => errors.push(e.message));
