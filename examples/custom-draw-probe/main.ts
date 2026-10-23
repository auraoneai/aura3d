/**
 * material.custom draw probe: a matrix of the smallest custom materials the Crayon ports use
 * (opaque / alpha / additive, depthWrite, side, inside-view sphere at several sizes, additive cone,
 * runtime setUniform on a transparent geometry.custom beam). Each case mounts its own app on the
 * shared canvas, renders identity output, and reports mean RGB samples.
 */
import { camera, createAuraApp, effects, geometry, lights, material, primitives, scene, texture, type AuraApp } from "@aura3d/engine";
import { BEAM_FRAGMENT as PORT_FRAGMENT, BEAM_VERTEX as PORT_VERTEX, beamGeometry, beamSpec as portBeamSpec } from "../drift-and-deliver-port/headlights";

type Spec = Parameters<typeof material.custom>[0];
interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface CaseResult { readonly id: string; readonly center: Rgb; readonly corner: Rgb; readonly lit: number; readonly grid: number[]; readonly extra?: Record<string, unknown> }

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

interface Case { readonly id: string; build(): { readonly scene: ReturnType<typeof scene>; readonly after?: (app: AuraApp) => void; readonly perFrame?: (app: AuraApp, frame: number) => void; readonly output?: Record<string, unknown> } }
const bg = (color = "#000000") => scene().background(color);

/** The Drift & Deliver headlight beam (its real shader and geometry) under the port's conditions, lamp off (a0) and on (a1). */
function portBeamCases(): Case[] {
  const portCamera = camera.perspective({ position: [0, 4.3, -10.6], target: [0, 1.25, 5], fov: 56, near: 0.4, far: 2400 });
  const skyTex = () => {
    const c = document.createElement("canvas"); c.width = 4; c.height = 256;
    const g = c.getContext("2d")!; const grad = g.createLinearGradient(0, 0, 0, 256);
    for (const [at, color] of [[0, "#4f8cca"], [0.5, "#9dc2e0"], [1, "#ffe9c4"]] as const) grad.addColorStop(at, color);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    return texture.canvas({ canvas: c, colorSpace: "srgb" });
  };
  interface V { readonly name: string; readonly post?: boolean; readonly lit?: boolean; readonly neutral?: boolean; readonly update?: boolean; readonly sky?: boolean }
  const variants: V[] = [
    { name: "plain" }, { name: "bloomaa", post: true }, { name: "lights", lit: true }, { name: "neutral", neutral: true },
    { name: "update", update: true }, { name: "full", post: true, lit: true, neutral: true, update: true, sky: true }
  ];
  return variants.flatMap((v) => [0, 1].map((amount): Case => ({
    id: `port-beam-${v.name}-a${amount}`,
    build: () => {
      const base = beamGeometry();
      const world = { positions: Float32Array.from(base.positions), normals: Float32Array.from(base.normals) };
      const node = geometry.custom(geometry.dynamic({ positions: base.positions, normals: base.normals, uvs: base.uvs, indices: base.indices }), { name: "car-beams", material: material.custom(portBeamSpec(amount)) }).runtime({ id: "car-beams" });
      let s = (v.sky ? scene().background({ texture: skyTex() }) : bg()).camera(portCamera).add(node);
      if (v.lit) s = s.add(lights.directional({ name: "sun", position: [-62, 68, -36], target: [0, 0, 0], intensity: 3.15, color: "#ffd9a2" })).add(lights.hemisphere({ name: "sky", skyColor: "#cfe0f4", groundColor: "#8a7f6e", intensity: 0.9 })).add(lights.ambient({ name: "fill", intensity: 0.24, color: "#d8dae0" }));
      if (v.post) s = s.add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.05, radius: 0.35 })).add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
      return {
        scene: s,
        output: v.neutral ? { toneMapping: "neutral", exposure: 1.34, dither: false } : undefined,
        perFrame: v.update ? (app: AuraApp) => {
          const h = app.nodes.require("car-beams");
          h.updateAttribute?.("position", { array: world.positions });
          h.updateAttribute?.("normal", { array: world.normals });
          h.setUniform?.("beamAmount", amount);
        } : undefined
      };
    }
  })));
}

/** Bisect the port beam shader: same geometry and camera, one shader factor changed at a time (all lamp on). */
function portBisectCases(): Case[] {
  const portCamera = camera.perspective({ position: [0, 4.3, -10.6], target: [0, 1.25, 5], fov: 56, near: 0.4, far: 2400 });
  const head = "in vec3 vW; in vec3 vN; in float vT; out vec4 outColor;\n";
  const only = (body: string) => `${head}void main() { ${body} }`;
  const variants: { name: string; vertex?: string; fragment?: string }[] = [
    { name: "orig" },
    { name: "vert-no-normal", vertex: PORT_VERTEX.replace("vN = normalize(mat3(modelMatrix) * normal);", "vN = vec3(0.0, 1.0, 0.0);") },
    { name: "frag-amount-only", fragment: only("outColor = vec4(beamColor, beamAmount);") },
    { name: "frag-uv-only", fragment: only("float a = beamAmount * pow(1.0 - vT, 1.25) * smoothstep(0.0, 0.07, vT); outColor = vec4(beamColor, a);") },
    { name: "frag-road-only", fragment: only("float a = beamAmount * smoothstep(beamRoadY - 0.15, beamRoadY + 1.5, vW.y); outColor = vec4(beamColor, a);") },
    { name: "frag-near-only", fragment: only("float d = length(cameraPosition - vW); float a = beamAmount * smoothstep(beamNear, beamNear * 2.3, d); outColor = vec4(beamColor, a);") },
    { name: "frag-facing-only", fragment: only("vec3 v = cameraPosition - vW; float d = length(v); float facing = abs(dot(vN, v / max(d, 0.001))); float a = beamAmount * (0.72 + 0.28 * pow(1.0 - facing, 1.6)); outColor = vec4(beamColor, a);") },
    { name: "frag-orig-fixed-camera", fragment: PORT_FRAGMENT.replace("vec3 v = cameraPosition - vW;", "vec3 v = vec3(0.0, 4.3, -10.6) - vW;") },
    { name: "frag-vN-debug", fragment: only("outColor = vec4(abs(vN) * beamAmount, 1.0);") },
    { name: "frag-vT-debug", fragment: only("outColor = vec4(vT * beamAmount, 0.0, 0.0, 1.0);") }
  ];
  return variants.map((v): Case => ({
    id: `port-bisect-${v.name}`,
    build: () => {
      const base = beamGeometry();
      const spec = portBeamSpec(1);
      const custom = { ...spec, glsl: { vertex: v.vertex ?? PORT_VERTEX, fragment: v.fragment ?? PORT_FRAGMENT } };
      const node = geometry.custom(geometry.dynamic({ positions: base.positions, normals: base.normals, uvs: base.uvs, indices: base.indices }), { name: "car-beams", material: material.custom(custom as Spec) }).runtime({ id: "car-beams" });
      return { scene: bg().camera(portCamera).add(node) };
    }
  }));
}

/** Bisect the port beam GEOMETRY with a constant-colour shader (all lamp on, same camera as the port). */
function portGeomCases(): Case[] {
  const portCamera = camera.perspective({ position: [0, 4.3, -10.6], target: [0, 1.25, 5], fov: 56, near: 0.4, far: 2400 });
  const vertex = "void main() { vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }";
  const fragment = "out vec4 outColor; void main() { outColor = vec4(1.0, 0.2, 0.1, 1.0); }";
  const mat = (opaque = false) => material.custom({ glsl: { vertex, fragment }, ...(opaque ? {} : { transparent: true, depthWrite: false, depthTest: true, blending: "additive" }), side: "double" } as Spec);
  type Parts = { positions?: boolean; normals?: boolean; uvs?: boolean; indices?: "u32" | "u16" | "none" };
  const build = (parts: Parts, opaque = false, after?: (app: AuraApp) => void) => () => {
    const base = beamGeometry();
    const indices = parts.indices === "none" ? undefined : parts.indices === "u16" ? Uint16Array.from(base.indices) : base.indices;
    const spec = { positions: base.positions, ...(parts.normals === false ? {} : { normals: base.normals }), ...(parts.uvs === false ? {} : { uvs: base.uvs }), ...(indices ? { indices } : {}) };
    return { scene: bg().camera(portCamera).add(geometry.custom(geometry.dynamic(spec as never), { name: "car-beams", material: mat(opaque) }).runtime({ id: "car-beams" })), after };
  };
  const tri = () => ({ scene: bg().camera(portCamera).add(geometry.custom(geometry.dynamic({ positions: Float32Array.from([-2, 1, 8, 2, 1, 8, 0, 4, 8]), indices: Uint32Array.from([0, 1, 2]) }), { name: "tri", material: mat() }).runtime({ id: "tri" })) });
  return [
    { id: "port-geom-full", build: build({}) },
    { id: "port-geom-no-normals", build: build({ normals: false }) },
    { id: "port-geom-no-uvs", build: build({ uvs: false }) },
    { id: "port-geom-no-indices", build: build({ indices: "none" }) },
    { id: "port-geom-u16-indices", build: build({ indices: "u16" }) },
    { id: "port-geom-positions-only", build: build({ normals: false, uvs: false, indices: "none" }) },
    { id: "port-geom-full-nocull", build: build({}, false, (app) => { app.nodes.require("car-beams").frustumCulled = false; }) },
    { id: "port-geom-full-opaque", build: build({}, true) },
    { id: "port-geom-triangle", build: tri }
  ];
}

/** Which camera setups make a plain triangle disappear? Custom vs default vertex stage, look direction, offset from the origin. */
function portCamCases(): Case[] {
  const customVertex = "void main() { vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }";
  const fragment = "out vec4 outColor; void main() { outColor = vec4(1.0, 0.2, 0.1, 1.0); }";
  const mat = (custom: boolean) => material.custom({ glsl: custom ? { vertex: customVertex, fragment } : { fragment }, transparent: true, depthWrite: false, depthTest: true, blending: "additive", side: "double" } as Spec);
  const tri = (x: number, y: number, z: number, custom: boolean) => geometry.custom(geometry.dynamic({ positions: Float32Array.from([x - 1.5, y - 1, z, x + 1.5, y - 1, z, x, y + 1.5, z]), indices: Uint32Array.from([0, 1, 2]) }), { name: "tri", material: mat(custom) }).runtime({ id: "tri" });
  const cam = (pos: [number, number, number], target: [number, number, number]) => camera.perspective({ position: pos, target, fov: 56, near: 0.4, far: 2400 });
  const c = (id: string, make: () => ReturnType<typeof scene>): Case => ({ id, build: () => ({ scene: make() }) });
  return [
    c("pcam-front-tri-custom", () => bg().camera(front).add(tri(0, 0, 0, true))),
    c("pcam-front-tri-default", () => bg().camera(front).add(tri(0, 0, 0, false))),
    c("pcam-lookplusz-origin-tri-custom", () => bg().camera(cam([0, 0, -7], [0, 0, 0])).add(tri(0, 0, 0, true))),
    c("pcam-far-tri-custom", () => bg().camera(cam([0, 4.3, -10.6], [0, 1.25, 5])).add(tri(0, 2, 8, true))),
    c("pcam-far-tri-default", () => bg().camera(cam([0, 4.3, -10.6], [0, 1.25, 5])).add(tri(0, 2, 8, false))),
    c("pcam-far-quad-default", () => bg().camera(cam([0, 4.3, -10.6], [0, 1.25, 5])).add(quad(8, solid(1, 0.2, 0.1), { transparent: true, blending: "additive", depthWrite: false }, 3).position(0, 2, 8).rotate(0, 0, 0))),
    c("pcam-offset-lookminusz-tri-custom", () => bg().camera(cam([0, 4.3, 7], [0, 1.25, -8])).add(tri(0, 2, -8, true))),
    c("pcam-far-pbr-box", () => bg().camera(cam([0, 4.3, -10.6], [0, 1.25, 5])).add(primitives.box({ name: "box", size: 3, position: [0, 2, 8], material: material.emissive({ color: "#ff3322", emissive: "#ff3322" }) })).add(lights.ambient({ name: "a", intensity: 1 })))
  ];
}
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
  }) },
  ...portBeamCases(),
  ...portBisectCases(),
  ...portGeomCases(),
  ...portCamCases(),
  { id: "additive-quad-bloomaa", build: () => ({
    scene: bg().camera(front).add(quad(0, solid(0.5, 0.5, 0.5, 1), { transparent: true, blending: "additive", depthWrite: false })).add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.05, radius: 0.35 })).add(effects.antiAlias({ name: "aa", mode: "fxaa" }))
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
  app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, output: (built.output ?? { toneMapping: "none", dither: false }) as never, scene: built.scene });
  await app.ready();
  built.after?.(app);
  for (let i = 0; i < 6; i += 1) { built.perFrame?.(app, i); app.step(1 / 60); }
  const blob = (await app.capture?.({ type: "png-blob" })) as Blob;
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = surface.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let lit = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! + img.data[i + 1]! + img.data[i + 2]! > 30) lit += 1;
  const w = img.width, h = img.height;
  const grid: number[] = [];
  for (let gy = 0; gy < 12; gy += 1) for (let gx = 0; gx < 16; gx += 1) {
    const m = mean(img, Math.floor((gx * w) / 16), Math.floor((gy * h) / 12), Math.floor(((gx + 1) * w) / 16), Math.floor(((gy + 1) * h) / 12));
    grid.push(Math.round((m.r + m.g + m.b) / 3));
  }
  const diag = app.diagnostics?.();
  return { id, center: mean(img, w / 2 - 12, h / 2 - 12, w / 2 + 12, h / 2 + 12), corner: mean(img, 4, 4, 24, 24), lit, grid,
    extra: { warnings: warnings.slice(0, 4), errors: (diag as unknown as { errors?: readonly unknown[] } | undefined)?.errors?.length ?? -1, drawCalls: (app.info?.render as { calls?: number } | undefined)?.calls } };
}

(window as unknown as Record<string, unknown>).__CDP__ = { ids: cases.map((c) => c.id), run, errors };
(window as unknown as Record<string, unknown>).__CDP_READY__ = true;
document.querySelector("#evidence")!.textContent = "ready";
window.addEventListener("error", (e) => errors.push(e.message));
