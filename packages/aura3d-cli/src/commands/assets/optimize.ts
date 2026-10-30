/**
 * `aura3d assets optimize --file in.glb --out out.glb [--role hero|vehicle|character|prop|background]`
 *
 * Direct-file mode of the `assets optimize` verb (the id-based admission pipeline stays in prd05). Dedup, weld,
 * budgeted simplify, prune, texture downscale (colour/ORM -> jpeg, normal -> png) and a stable vertex order. Geometry
 * stays float32 by default: meshopt quantisation moves scale into a node transform, which skews the grounding and
 * bounds checks `assets import-meshy` runs, so `meshopt: true` is for static background props you will not measure.
 *
 * GU47 E-A HDRI delivery: `aura3d assets optimize --file in.hdr --out out_1k.hdr --hdri 1k|2k [--rgb9e5-cube]` writes
 * a box-downsized Radiance `.hdr` and, with `--rgb9e5-cube`, a KTX2 RGB9E5 radiance cube next to it (`optimizeHdriFile`).
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "./gltfToolkit.js";

export type OptimizeRole = "hero" | "vehicle" | "character" | "prop" | "background";

/** Vertex and texture budgets by role (Meshy meshes weld to roughly half as many vertices as triangles). */
export const OPTIMIZE_BUDGETS: Readonly<Record<OptimizeRole, { readonly maxVerts: number; readonly tex: number }>> = {
  hero: { maxVerts: 40000, tex: 2048 },
  vehicle: { maxVerts: 40000, tex: 2048 },
  character: { maxVerts: 30000, tex: 2048 },
  prop: { maxVerts: 6000, tex: 1024 },
  background: { maxVerts: 15000, tex: 1024 }
};

export const MAX_OPTIMIZE_TEXTURE = 4096;

export interface OptimizeGlbOptions {
  readonly input: string;
  readonly output: string;
  readonly projectDir?: string;
  readonly role?: OptimizeRole;
  readonly maxVerts?: number;
  readonly tex?: number;
  /** false skips simplification even when over budget. */
  readonly simplify?: boolean;
  readonly meshopt?: boolean;
  /** Simplifier error tolerance, 0..1 (default 0.05). */
  readonly error?: number;
  readonly toolkit?: GltfToolkit;
}

export interface OptimizePlan {
  readonly role: OptimizeRole;
  readonly maxVerts: number;
  readonly tex: number;
  readonly simplify: boolean;
  readonly meshopt: boolean;
  readonly error: number;
}

export interface OptimizeGlbResult extends OptimizePlan {
  readonly input: string;
  readonly output: string;
  readonly bytesIn: number;
  readonly bytesOut: number;
  readonly vertsBefore: number;
  readonly vertsAfter: number;
  readonly skinned: boolean;
  readonly simplified: boolean;
}

export function isOptimizeRole(value: string): value is OptimizeRole {
  return value in OPTIMIZE_BUDGETS;
}

/** Pure planning step: resolve role budgets and validate overrides (no files, no toolkit). */
export function planOptimize(options: Pick<OptimizeGlbOptions, "role" | "maxVerts" | "tex" | "simplify" | "meshopt" | "error">): OptimizePlan {
  const role = options.role ?? "prop";
  if (!isOptimizeRole(role)) throw new Error(`Unknown optimize role "${String(role)}". Use ${Object.keys(OPTIMIZE_BUDGETS).join(", ")}.`);
  const budget = OPTIMIZE_BUDGETS[role];
  const maxVerts = options.maxVerts ?? budget.maxVerts;
  const tex = options.tex ?? budget.tex;
  const error = options.error ?? 0.05;
  if (!Number.isInteger(maxVerts) || maxVerts < 100) throw new Error(`--max-verts must be an integer >= 100 (got ${maxVerts}).`);
  if (!Number.isInteger(tex) || tex < 16 || tex > MAX_OPTIMIZE_TEXTURE) throw new Error(`--tex must be an integer from 16 to ${MAX_OPTIMIZE_TEXTURE} (got ${tex}).`);
  if (!(error > 0 && error <= 1)) throw new Error(`--error must be in (0, 1] (got ${error}).`);
  return { role, maxVerts, tex, simplify: options.simplify !== false, meshopt: options.meshopt === true, error };
}

function countVerts(doc: Loose): number {
  return doc
    .getRoot()
    .listMeshes()
    .reduce((sum: number, mesh: Loose) => sum + mesh.listPrimitives().reduce((acc: number, prim: Loose) => acc + (prim.getAttribute("POSITION")?.getCount() ?? 0), 0), 0);
}

export async function optimizeGlbFile(options: OptimizeGlbOptions): Promise<OptimizeGlbResult> {
  const plan = planOptimize(options);
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const input = resolve(projectDir, options.input);
  const output = resolve(projectDir, options.output);
  if (input === output) throw new Error("--out must differ from --file: optimize never overwrites its input.");
  const toolkit = options.toolkit ?? loadGltfToolkit(projectDir);
  const { dedup, weld, simplify, prune, textureCompress, meshopt, resample, reorder } = toolkit.functions;
  const io = await createGltfIo(toolkit);
  const doc = await io.read(input);
  const vertsBefore = countVerts(doc);
  const skinned = doc.getRoot().listSkins().length > 0;
  await doc.transform(dedup(), weld());
  let simplified = false;
  if (plan.simplify && vertsBefore > plan.maxVerts) {
    await doc.transform(simplify({ simplifier: toolkit.MeshoptSimplifier, ratio: Math.max(0.02, plan.maxVerts / vertsBefore), error: plan.error, lockBorder: skinned }));
    simplified = true;
  }
  await doc.transform(
    resample(),
    prune(),
    textureCompress({ encoder: toolkit.sharp, resize: [plan.tex, plan.tex], targetFormat: "jpeg", slots: /^(?!normal)/, quality: 86 }),
    textureCompress({ encoder: toolkit.sharp, resize: [plan.tex, plan.tex], slots: /^normal/ }),
    reorder({ encoder: toolkit.MeshoptEncoder })
  );
  if (plan.meshopt) await doc.transform(meshopt({ encoder: toolkit.MeshoptEncoder, level: "medium" }));
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, doc);
  return { ...plan, input, output, bytesIn: statSync(input).size, bytesOut: statSync(output).size, vertsBefore, vertsAfter: countVerts(doc), skinned, simplified };
}

export function optimizeUsage(): string {
  return "aura3d assets optimize --file in.glb --out out.glb [--role hero|vehicle|character|prop|background] [--max-verts N] [--tex N] [--no-simplify] [--meshopt] [--error 0.05] [--json]";
}

// ---------------------------------------------------------------------------
// GU47 E-A: HDRI delivery. A 2k Poly Haven source (4.3-7 MB) becomes a <= 1.5 MB 1k `.hdr`; `--rgb9e5-cube` adds a
// KTX2 cube (VK_FORMAT_E5B9G9R9_UFLOAT_PACK32, the container `readRgb9e5Cube` reads), about 2 MB for a 2k output.
// ---------------------------------------------------------------------------

/**
 * Rendering math resolves through the declared `@aura3d/rendering` dependency's `./lanes` export (as
 * `environments bake` does), so the command also works from a packed install.
 */
type RenderingLanes = typeof import("@aura3d/rendering/lanes");
type HdrImage = import("@aura3d/rendering/lanes").HdrImage;
const renderingLanes = (): Promise<RenderingLanes> => import("@aura3d/rendering/lanes");

export type HdriSize = "1k" | "2k";

/** Equirect width per `--hdri` size; the height keeps the source aspect (2:1 for an equirect). */
export const HDRI_SIZE_WIDTH: Readonly<Record<HdriSize, number>> = { "1k": 1024, "2k": 2048 };

export function isHdriSize(value: string): value is HdriSize {
  return value === "1k" || value === "2k";
}

export interface OptimizeHdriOptions {
  readonly input: string;
  readonly output: string;
  readonly projectDir?: string;
  readonly size: HdriSize;
  /** Explicit output width (default `HDRI_SIZE_WIDTH[size]`); a source at or below it is re-encoded, never upsampled. */
  readonly width?: number;
  /** Also write `<output stem>.rgb9e5.ktx2`: a radiance cube, face = output width / 8, box-filtered mip chain. */
  readonly rgb9e5Cube?: boolean;
}

export interface OptimizeHdriResult {
  readonly input: string;
  readonly output: string;
  readonly size: HdriSize;
  readonly bytesIn: number;
  readonly bytesOut: number;
  readonly widthIn: number;
  readonly heightIn: number;
  readonly width: number;
  readonly height: number;
  readonly resized: boolean;
  readonly cube?: { readonly output: string; readonly faceSize: number; readonly mipCount: number; readonly bytes: number };
}

/** Per-axis box filter taps: destination pixel `d` averages its fractional source footprint `[d*r, (d+1)*r)`. */
function boxTaps(source: number, target: number): { readonly index: Int32Array; readonly weight: Float32Array; readonly start: Int32Array } {
  const ratio = source / target;
  const start = new Int32Array(target + 1);
  const index: number[] = [];
  const weight: number[] = [];
  for (let d = 0; d < target; d += 1) {
    start[d] = index.length;
    const lo = d * ratio;
    const hi = (d + 1) * ratio;
    for (let s = Math.floor(lo); s < Math.min(source, Math.ceil(hi)); s += 1) {
      const overlap = Math.min(s + 1, hi) - Math.max(s, lo);
      if (overlap > 0) {
        index.push(s);
        weight.push(overlap / ratio);
      }
    }
  }
  start[target] = index.length;
  return { index: Int32Array.from(index), weight: Float32Array.from(weight), start };
}

/**
 * Area-average (box) resample of an RGB float equirect: exact 2x2 / 8x8 means for integer ratios, fractional footprints
 * otherwise, so the mean radiance (what IBL integrates) is kept. Never upsamples: a target at or above the source on an
 * axis keeps that axis.
 */
export function downsampleHdrImage(image: HdrImage, width: number, height: number): HdrImage {
  const outW = Math.max(1, Math.min(image.width, Math.round(width)));
  const outH = Math.max(1, Math.min(image.height, Math.round(height)));
  if (outW === image.width && outH === image.height) return image;
  const tx = boxTaps(image.width, outW);
  const ty = boxTaps(image.height, outH);
  // Horizontal pass: image.height rows of outW pixels.
  const rows = new Float32Array(outW * image.height * 3);
  for (let y = 0; y < image.height; y += 1) {
    const src = y * image.width * 3;
    const dst = y * outW * 3;
    for (let x = 0; x < outW; x += 1) {
      let r = 0, g = 0, b = 0;
      for (let t = tx.start[x]!; t < tx.start[x + 1]!; t += 1) {
        const i = src + tx.index[t]! * 3;
        const w = tx.weight[t]!;
        r += image.data[i]! * w; g += image.data[i + 1]! * w; b += image.data[i + 2]! * w;
      }
      rows[dst + x * 3] = r; rows[dst + x * 3 + 1] = g; rows[dst + x * 3 + 2] = b;
    }
  }
  // Vertical pass.
  const data = new Float32Array(outW * outH * 3);
  for (let y = 0; y < outH; y += 1) {
    const dst = y * outW * 3;
    for (let t = ty.start[y]!; t < ty.start[y + 1]!; t += 1) {
      const src = ty.index[t]! * outW * 3;
      const w = ty.weight[t]!;
      for (let i = 0; i < outW * 3; i += 1) data[dst + i] = data[dst + i]! + rows[src + i]! * w;
    }
  }
  return { width: outW, height: outH, data };
}

/** Float RGB to an RGBE texel, the inverse of `decodeHdrEquirect`'s `m * 2^(e-128) / 255` (three r185 convention). */
function writeRgbeTexel(r: number, g: number, b: number, out: Uint8Array, offset: number, stride: number): void {
  const max = Math.max(r, g, b);
  let exp = max > 1e-32 && Number.isFinite(max) ? Math.floor(Math.log2(max)) + 1 : -Infinity;
  if (exp !== -Infinity && max / Math.pow(2, exp) >= 1) exp += 1; // log2 rounding at exact powers of two
  if (exp === -Infinity || exp + 128 < 1) {
    out[offset] = 0; out[offset + stride] = 0; out[offset + stride * 2] = 0; out[offset + stride * 3] = 0;
    return;
  }
  const e = Math.min(255, exp + 128);
  const scale = 255 / Math.pow(2, e - 128);
  const byte = (c: number): number => Math.min(255, Math.max(0, Math.round(c * scale)));
  out[offset] = byte(r); out[offset + stride] = byte(g); out[offset + stride * 2] = byte(b); out[offset + stride * 3] = e;
}

const RLE_MIN_RUN = 4;

/** One planar channel of a scanline in the new-style Radiance RLE: runs (count > 128) of >= 4 bytes, else dumps. */
function writeRleChannel(src: Uint8Array, start: number, length: number, out: Uint8Array, at: number): number {
  const end = start + length;
  let cursor = start;
  let o = at;
  while (cursor < end) {
    let runStart = cursor;
    let runLength = 0;
    while (runStart < end) {
      runLength = 1;
      while (runLength < 127 && runStart + runLength < end && src[runStart + runLength] === src[runStart]) runLength += 1;
      if (runLength >= RLE_MIN_RUN) break;
      runStart += runLength;
    }
    if (runStart >= end) {
      runStart = end;
      runLength = 0;
    }
    while (cursor < runStart) {
      const count = Math.min(128, runStart - cursor);
      out[o++] = count;
      out.set(src.subarray(cursor, cursor + count), o);
      o += count;
      cursor += count;
    }
    if (runLength >= RLE_MIN_RUN) {
      out[o++] = 128 + runLength;
      out[o++] = src[runStart]!;
      cursor = runStart + runLength;
    }
  }
  return o;
}

/**
 * Radiance RGBE `.hdr` writer: `#?RADIANCE`, `FORMAT=32-bit_rle_rgbe`, `-Y h +X w`, then per-scanline RLE (flat
 * scanlines for widths outside 8..32767). `decodeHdrEquirect` reads it back.
 */
export function encodeRadianceHdr(image: HdrImage, comments: readonly string[] = []): Uint8Array {
  const { width, height, data } = image;
  const header = new TextEncoder().encode(
    `#?RADIANCE\n${comments.map((line) => `# ${line.replace(/[\r\n]+/g, " ")}\n`).join("")}FORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`
  );
  const rle = width >= 8 && width <= 0x7fff;
  // Worst case per scanline: the 4-byte RLE marker plus one dump byte per 128 literal bytes on each channel.
  const perLine = rle ? 4 + 4 * (width + Math.ceil(width / 128)) : width * 4;
  const out = new Uint8Array(header.length + perLine * height);
  out.set(header, 0);
  let o = header.length;
  const line = new Uint8Array(width * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      // Planar (r..., g..., b..., e...) for RLE; interleaved rgbe for flat scanlines.
      if (rle) writeRgbeTexel(data[i]!, data[i + 1]!, data[i + 2]!, line, x, width);
      else writeRgbeTexel(data[i]!, data[i + 1]!, data[i + 2]!, line, x * 4, 1);
    }
    if (!rle) {
      out.set(line, o);
      o += line.length;
      continue;
    }
    out[o++] = 2; out[o++] = 2; out[o++] = width >> 8; out[o++] = width & 0xff;
    for (let c = 0; c < 4; c += 1) o = writeRleChannel(line, c * width, width, out, o);
  }
  return out.subarray(0, o);
}

/** 2x2 box mip of one RGBA float cube face. */
function halveFace(face: Float32Array, size: number): Float32Array {
  const half = Math.max(1, size >> 1);
  const out = new Float32Array(half * half * 4);
  for (let y = 0; y < half; y += 1) {
    for (let x = 0; x < half; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const at = (yy: number, xx: number): number => face[(Math.min(size - 1, yy) * size + Math.min(size - 1, xx)) * 4 + c]!;
        out[(y * half + x) * 4 + c] = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) / 4;
      }
    }
  }
  return out;
}

/**
 * KTX2 RGB9E5 cube of an equirect: mip 0 resampled through `equirectToCubeFaces`, then a box-filtered mip chain to 1x1,
 * packed with `packRgb9e5` into the minimal container `readRgb9e5Cube` reads (6 faces, no supercompression). A radiance
 * cube for delivery; `aura3d environments bake --hdr` makes the GGX-prefiltered probe.
 */
export function encodeRgb9e5CubeKtx2(
  lanes: Pick<RenderingLanes, "equirectToCubeFaces" | "packRgb9e5" | "KTX2_MAGIC" | "VK_FORMAT_E5B9G9R9_UFLOAT_PACK32">,
  image: HdrImage,
  faceSize: number
): { readonly bytes: Uint8Array; readonly mipCount: number } {
  const levels: Float32Array[][] = [lanes.equirectToCubeFaces(image, faceSize)];
  for (let size = faceSize; size > 1; size >>= 1) levels.push(levels[levels.length - 1]!.map((face) => halveFace(face, size)));
  const header = 68;
  const indexBytes = levels.length * 24;
  const levelBytes = levels.map((_, level) => 6 * Math.max(1, faceSize >> level) ** 2 * 4);
  const bytes = new Uint8Array(header + indexBytes + levelBytes.reduce((sum, n) => sum + n, 0));
  bytes.set(lanes.KTX2_MAGIC, 0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(12, lanes.VK_FORMAT_E5B9G9R9_UFLOAT_PACK32, true);
  view.setUint32(16, 4, true); // typeSize
  view.setUint32(20, faceSize, true);
  view.setUint32(24, faceSize, true);
  view.setUint32(36, 6, true); // faces; depth, layers and supercompression stay 0
  view.setUint32(40, levels.length, true);
  view.setUint32(48, header, true); // empty DFD / KVD at the header end
  view.setUint32(56, header, true);
  let offset = header + indexBytes;
  levels.forEach((faces, level) => {
    const size = Math.max(1, faceSize >> level);
    view.setBigUint64(header + level * 24, BigInt(offset), true);
    view.setBigUint64(header + level * 24 + 8, BigInt(levelBytes[level]!), true);
    view.setBigUint64(header + level * 24 + 16, BigInt(levelBytes[level]!), true);
    for (const face of faces) {
      for (let t = 0; t < size * size; t += 1) {
        view.setUint32(offset, lanes.packRgb9e5(face[t * 4]!, face[t * 4 + 1]!, face[t * 4 + 2]!), true);
        offset += 4;
      }
    }
  });
  return { bytes, mipCount: levels.length };
}

/** `out_1k.hdr` -> `out_1k.rgb9e5.ktx2`. */
export function hdriCubePath(output: string): string {
  return `${output.replace(/\.hdr$/i, "")}.rgb9e5.ktx2`;
}

export async function optimizeHdriFile(options: OptimizeHdriOptions): Promise<OptimizeHdriResult> {
  if (!isHdriSize(options.size)) throw new Error(`--hdri must be 1k or 2k (got ${String(options.size)}).`);
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const input = resolve(projectDir, options.input);
  const output = resolve(projectDir, options.output);
  if (input === output) throw new Error("--out must differ from --file: optimize never overwrites its input.");
  const width = options.width ?? HDRI_SIZE_WIDTH[options.size];
  if (!Number.isInteger(width) || width < 8) throw new Error(`HDRI width must be an integer >= 8 (got ${width}).`);
  const lanes = await renderingLanes();
  const source = lanes.decodeHdrEquirect(readFileSync(input));
  const image = downsampleHdrImage(source, width, Math.max(1, Math.round((width * source.height) / source.width)));
  const resized = image !== source;
  const encoded = encodeRadianceHdr(image, [
    `aura3d assets optimize --hdri ${options.size}: ${source.width}x${source.height} -> ${image.width}x${image.height} box filter`
  ]);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, encoded);
  let cube: OptimizeHdriResult["cube"];
  if (options.rgb9e5Cube) {
    const faceSize = Math.max(1, 2 ** Math.floor(Math.log2(Math.max(1, image.width / 8))));
    const { bytes, mipCount } = encodeRgb9e5CubeKtx2(lanes, image, faceSize);
    const cubeOutput = hdriCubePath(output);
    writeFileSync(cubeOutput, bytes);
    cube = { output: cubeOutput, faceSize, mipCount, bytes: bytes.byteLength };
  }
  return {
    input,
    output,
    size: options.size,
    bytesIn: statSync(input).size,
    bytesOut: encoded.byteLength,
    widthIn: source.width,
    heightIn: source.height,
    width: image.width,
    height: image.height,
    resized,
    ...(cube ? { cube } : {})
  };
}

export function optimizeHdriUsage(): string {
  return "aura3d assets optimize --file in.hdr --out out_1k.hdr --hdri 1k|2k [--rgb9e5-cube] [--json]";
}
