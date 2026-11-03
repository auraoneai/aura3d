#!/usr/bin/env node
// GU47 phase 6 (WP-32 budget): far-distance LODs for the repeated Meshy props and traffic. Reads the baked geometry
// (assets/meshy/<key>.bin, format in meshy.ts), simplifies the index list with meshoptimizer (seam-aware, error-bounded),
// drops unused vertices and writes assets/meshy/lod/<key>.bin in the same format plus meshy.lod.baked.ts.
// The LOD only draws beyond LOD_NEAR_M (world.ts), where a 4-15 m model covers a few dozen pixels at 720p.
// Usage: node examples/roadster-hours-port/tools/bake-lod.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const baked = readFileSync(resolve(root, "meshy.baked.ts"), "utf8");
const line = baked.split("\n").find((l) => l.startsWith("export const MESHY_MODELS"));
const models = JSON.parse(line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1));

/** key -> target triangle ratio; the error bound (fraction of the model extent) wins when it is tighter. */
const TARGETS = {
  palm: 0.18, pine: 0.18, villa: 0.15, townhouse: 0.15, boulders: 0.12,
  sedan: 0.15, hatch: 0.15, suv: 0.15, pickup: 0.15, bus: 0.15, boxtruck: 0.15, semi: 0.15, tanker: 0.15
};
// 4% of a 10 m tree is 0.4 m: under 2 px at the 150 m LOD switch on a 720p, 60 deg view.
const MAX_ERROR = 0.04;
// The far copies carry no texture: software WebGL2 upgrades textured materials one per presented frame (about one every
// 5-10 s on the capture runner), so a textured far node per kind left the far trees and town white past 60 s (p6-r1..r3).
// Each LOD takes the area-weighted mean of its base-colour texture under its own triangles instead (a 40 px tree).
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function decode(model, buf) {
  const n = model.vertices;
  let o = 0;
  const p = new Int16Array(buf, o, n * 3); o += n * 6;
  const nr = new Int8Array(buf, o, n * 3); o += n * 3; o += (4 - ((n * 3) % 4)) % 4;
  const uv = new Float32Array(buf.slice(o, o + n * 8)); o += n * 8;
  const count = model.triangles * 3;
  const idx = model.uint32 ? new Uint32Array(buf.slice(o, o + count * 4)) : Uint32Array.from(new Uint16Array(buf.slice(o, o + count * 2)));
  return { p: Int16Array.from(p), nr: Int8Array.from(nr), uv, idx };
}

await MeshoptSimplifier.ready;
mkdirSync(resolve(root, "assets/meshy/lod"), { recursive: true });
const out = {};
for (const [key, ratio] of Object.entries(TARGETS)) {
  const model = models[key];
  if (!model) throw new Error(`no baked model ${key}`);
  const file = readFileSync(resolve(root, `assets/meshy/${key}.bin`));
  const g = decode(model, file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const n = model.vertices;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = (g.p[i] / 32767) * model.ext;
  const target = Math.max(3, Math.floor((g.idx.length * ratio) / 3) * 3);
  // weld by position first (the bake splits vertices on UV seams, which pins every seam edge); the kept vertex keeps its own UV
  const weld = MeshoptSimplifier.generatePositionRemap(pos, 3);
  const welded = Uint32Array.from(g.idx, (v) => weld[v]);
  let [lod, err] = MeshoptSimplifier.simplify(welded, pos, 3, target, MAX_ERROR, ["Prune"]);
  if (lod.length > target * 1.6) [lod, err] = MeshoptSimplifier.simplify(welded, pos, 3, target, MAX_ERROR, ["Prune", "Permissive"]);
  if (lod.length > target * 1.6) [lod, err] = MeshoptSimplifier.simplifySloppy(welded, pos, 3, null, target, MAX_ERROR);
  // compact: keep only referenced vertices, in first-use order
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (const v of lod) if (remap[v] < 0) remap[v] = m++;
  const P = new Int16Array(m * 3), N = new Int8Array(m * 3), UV = new Float32Array(m * 2);
  for (let v = 0; v < n; v++) {
    const r = remap[v];
    if (r < 0) continue;
    P.set(g.p.subarray(v * 3, v * 3 + 3), r * 3); N.set(g.nr.subarray(v * 3, v * 3 + 3), r * 3); UV.set(g.uv.subarray(v * 2, v * 2 + 2), r * 2);
  }
  const I = m < 65536 ? Uint16Array.from(lod, (v) => remap[v]) : Uint32Array.from(lod, (v) => remap[v]);
  const pad = Buffer.alloc((4 - ((m * 3) % 4)) % 4);
  writeFileSync(resolve(root, `assets/meshy/lod/${key}.bin`), Buffer.concat([Buffer.from(P.buffer), Buffer.from(N.buffer), pad, Buffer.from(UV.buffer), Buffer.from(I.buffer)]));
  const { data: px, info } = await sharp(resolve(root, `assets/meshy/${key}.jpg`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let area = 0;
  for (let t = 0; t < lod.length; t += 3) {
    const [a, b, c] = [lod[t], lod[t + 1], lod[t + 2]];
    const e1 = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]), e2 = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
    const w = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
    const u = (g.uv[a * 2] + g.uv[b * 2] + g.uv[c * 2]) / 3, v = (g.uv[a * 2 + 1] + g.uv[b * 2 + 1] + g.uv[c * 2 + 1]) / 3;
    const x = Math.min(info.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * info.width)));
    const y = Math.min(info.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * info.height)));
    const o = (y * info.width + x) * info.channels;
    for (let k = 0; k < 3; k++) sum[k] += srgbToLinear(px[o + k] / 255) * w;
    area += w;
  }
  const color = "#" + sum.map((v) => Math.round(linearToSrgb(v / Math.max(area, 1e-9)) * 255).toString(16).padStart(2, "0")).join("");
  out[key] = { key, kind: model.kind, vertices: m, triangles: lod.length / 3, size: model.size, ext: model.ext, uint32: I instanceof Uint32Array, source: `assets/meshy/${key}.bin`, fullTriangles: model.triangles, error: Number(err.toFixed(4)), color };
  console.log(`${key}: ${model.triangles} -> ${lod.length / 3} triangles (${((lod.length / 3 / model.triangles) * 100).toFixed(1)}%), ${n} -> ${m} vertices, error ${err.toFixed(4)}, colour ${color}`);
}
const lines = [
  "/* GENERATED by tools/bake-lod.mjs from assets/meshy/<key>.bin (meshoptimizer simplify, error <= 4% of the extent); do not edit. */",
  "import type { MeshyBaked } from \"./meshy.baked\";",
  "export interface MeshyLodBaked extends MeshyBaked { fullTriangles: number; error: number; color: string }",
  `export const MESHY_LODS: Record<string, MeshyLodBaked> = ${JSON.stringify(out)};`,
  "/* same format as the full bins, same-origin, fetched at boot next to them */",
  "export const MESHY_LOD_BINS: Record<string, string> = {",
  ...Object.keys(out).map((k) => `  ${k}: new URL("./assets/meshy/lod/${k}.bin", import.meta.url).pathname,`),
  "};",
  ""
];
writeFileSync(resolve(root, "meshy.lod.baked.ts"), lines.join("\n"));
