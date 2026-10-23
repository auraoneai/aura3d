/**
 * Instanced texture probe: the same textured material (a 2x1 red|green data texture on `texture`) rendered through
 * primitives.box, primitive `instances`, instances.mesh and batched.mesh (single- and multi-geometry). Every form must
 * show the texel colours (red on the left of the box, green on the right), never a white/untextured surface.
 */
import { batched, camera, createAuraApp, instances, lights, material, primitives, scene, texture, type AuraApp } from "@aura3d/engine";

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface CaseResult { readonly image?: string; readonly id: string; readonly left: Rgb; readonly right: Rgb; readonly lit: number; readonly extra: Record<string, unknown> }
interface Case { readonly id: string; readonly flags?: string; build(): ReturnType<typeof scene> }

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const errors: string[] = [];
const warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ").slice(0, 240)); origWarn(...args); };

const checker = () => texture.data({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), colorSpace: "srgb" });
const textured = () => material.pbr({ color: "#ffffff", roughness: 1, metallic: 0, texture: checker() as never });
const front = camera.perspective({ position: [0, 0, 7], target: [0, 0, 0], fov: 40 });
const base = () => scene()
  .camera(front)
  .add(lights.ambient({ name: "amb", intensity: 1.2 }))
  .add(lights.directional({ name: "sun", position: [0, 2, 8], target: [0, 0, 0], intensity: 1.5 }));

const plain = () => material.pbr({ color: "#ff3030", roughness: 1, metallic: 0 });
const FLAGS = "parity.batching,tiers.batching,core";
const multi = (m: () => ReturnType<typeof material.pbr>) => () => {
  const mesh = batched.mesh({ maxInstances: 4, maxVertices: 4096, maxIndices: 8192, geometries: ["box", "sphere"], material: m() });
  mesh.addInstance(0);
  mesh.setMatrixAt(mesh.addInstance(1), [0.3, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.3, 0, 2.6, 1.6, 0, 1]);
  return base().add(mesh);
};
const cases: Case[] = [
  { id: "plain-batched-multidraw-flags", flags: FLAGS, build: multi(plain) },
  { id: "batched-multidraw-flags", flags: FLAGS, build: multi(textured) },
  { id: "plain-box", build: () => base().add(primitives.box({ name: "b", size: [2, 2, 2], material: plain() })) },
  { id: "plain-instances-mesh", build: () => base().add(instances.mesh("box", plain(), 1)) },
  {
    id: "plain-batched-multidraw-limits",
    build: () => {
      const mesh = batched.mesh({ maxInstances: 4, maxVertices: 4096, maxIndices: 8192, geometries: ["box", "sphere"], material: plain() });
      mesh.addInstance(0);
      mesh.setMatrixAt(mesh.addInstance(1), [0.3, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.3, 0, 2.6, 1.6, 0, 1]);
      return base().add(mesh);
    }
  },
  {
    id: "plain-batched-loop",
    build: () => {
      const mesh = batched.mesh({ maxInstances: 4, geometries: ["box", "sphere"], material: plain(), multiDraw: "loop" });
      mesh.addInstance(0);
      mesh.setMatrixAt(mesh.addInstance(1), [0.3, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.3, 0, 2.6, 1.6, 0, 1]);
      return base().add(mesh);
    }
  },
  {
    id: "plain-batched-multidraw",
    build: () => {
      const mesh = batched.mesh({ maxInstances: 4, geometries: ["box", "sphere"], material: plain() });
      mesh.addInstance(0);
      mesh.setMatrixAt(mesh.addInstance(1), [0.3, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.3, 0, 2.6, 1.6, 0, 1]);
      return base().add(mesh);
    }
  },
  { id: "primitive-box", build: () => base().add(primitives.box({ name: "b", size: [2, 2, 2], material: textured() })) },
  { id: "primitive-instances", build: () => base().add(primitives.box({ name: "b", size: [2, 2, 2], material: textured(), instances: [{ position: [0, 0, 0] }] } as never)) },
  { id: "instances-mesh", build: () => base().add(instances.mesh("box", textured(), 1)) },
  {
    id: "batched-single",
    build: () => {
      const mesh = batched.mesh({ maxInstances: 2, geometries: ["box"], material: textured() });
      mesh.addInstance(0);
      return base().add(mesh);
    }
  },
  {
    id: "batched-multidraw",
    build: () => {
      const mesh = batched.mesh({ maxInstances: 4, geometries: ["box", "sphere"], material: textured() });
      const a = mesh.addInstance(0);
      const b = mesh.addInstance(1);
      mesh.setMatrixAt(b, [0.3, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.3, 0, 2.6, 1.6, 0, 1]);
      void a;
      return base().add(mesh);
    }
  }
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
  app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, output: { toneMapping: "none", dither: false } as never, scene: found.build() as never, ...(found.flags ? { qualityRebuild: { flags: found.flags } } : {}) } as never);
  await app.ready();
  // The textured upgrade resolves after mount: let it land, then render.
  for (let i = 0; i < 20; i += 1) { app.step(1 / 60); await new Promise((r) => setTimeout(r, 40)); }
  const blob = (await app.capture?.({ type: "png-blob" })) as Blob;
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = surface.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let lit = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! + img.data[i + 1]! + img.data[i + 2]! > 30) lit += 1;
  const w = img.width, h = img.height;
  const cy = Math.floor(h / 2);
  const diag = app.diagnostics?.();
  const small = new OffscreenCanvas(160, 120);
  small.getContext("2d")!.drawImage(bitmap, 0, 0, 160, 120);
  const jpg = await small.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  const bytes = new Uint8Array(await jpg.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  const image = btoa(bin);
  return {
    image,
    id, lit,
    left: mean(img, Math.floor(w * 0.5 - 28), cy - 4, Math.floor(w * 0.5 - 20), cy + 4),
    right: mean(img, Math.floor(w * 0.5 + 20), cy - 4, Math.floor(w * 0.5 + 28), cy + 4),
    extra: { warnings: warnings.slice(0, 6), errors: (diag as unknown as { errors?: readonly unknown[] } | undefined)?.errors?.length ?? -1, drawCalls: (app.info?.render as { calls?: number } | undefined)?.calls }
  };
}

(window as unknown as Record<string, unknown>).__ITP__ = { ids: cases.map((c) => c.id), run, errors };
(window as unknown as Record<string, unknown>).__ITP_READY__ = true;
document.querySelector("#evidence")!.textContent = "ready";
