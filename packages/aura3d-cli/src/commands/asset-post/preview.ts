/**
 * `aura3d assets preview <glb|id> --out views.png` — Node-only CPU preview of a GLB (ported from
 * tools/likeness-audit/render-views.mjs, with the three-quarter view and lambert term of tools/idol/render-views.py).
 *
 * What it is: an orthographic z-buffer rasteriser over the bind pose. Each triangle gets the material's base-colour
 * texture (nearest texel) times its base-colour factor and COLOR_0, shaded with one flat lambert term. Node transforms
 * and skin bind matrices are applied. What it is not: a render. No PBR, lights, shadows, normal maps, emissive,
 * transmission, morph weights, texture transforms or KTX2 decoding — so the output is labelled a CPU base-colour preview
 * and must never be presented as rendered or GPU evidence. No browser, GPU or Python is needed.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "../assets/gltfToolkit.js";
import { QUIET_GLTF_LOGGER } from "./logger.js";

export type PreviewView = "front" | "side" | "back" | "three-quarter";

/** Model yaw/pitch (degrees) per view. The model faces +Z; the camera looks down -Z. Side views from +X (the model's left). */
export const PREVIEW_VIEWS: Readonly<Record<PreviewView, { readonly yawDeg: number; readonly pitchDeg: number }>> = {
  front: { yawDeg: 0, pitchDeg: 0 },
  side: { yawDeg: -90, pitchDeg: 0 },
  back: { yawDeg: 180, pitchDeg: 0 },
  "three-quarter": { yawDeg: -45, pitchDeg: 20 }
};

export const DEFAULT_PREVIEW_VIEWS: readonly PreviewView[] = ["front", "side", "back", "three-quarter"];
export const PREVIEW_KIND = "cpu-base-colour-preview" as const;
export const PREVIEW_NOTE = "CPU base-colour preview (bind pose, base colour + flat lambert). Not a render: no PBR, lighting, normal maps or GPU.";

export interface RenderPreviewOptions {
  /** Views left to right (default front, side, back, three-quarter). */
  readonly views?: readonly PreviewView[];
  /** Square cell size in pixels per view (default 360, 32-2048). */
  readonly size?: number;
  /** Draw the label strip naming this a CPU base-colour preview (default true). */
  readonly label?: boolean;
  /** Background RGB 0-255 (default [40, 44, 52]). */
  readonly background?: readonly [number, number, number];
  readonly toolkit?: GltfToolkit;
  /** Resolution root for the glTF-Transform packages (default process.cwd()). */
  readonly projectDir?: string;
}

export interface RenderPreviewResult {
  readonly kind: typeof PREVIEW_KIND;
  readonly note: string;
  readonly input: string;
  readonly output: string;
  readonly views: readonly PreviewView[];
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  readonly triangles: number;
  readonly texturedTriangles: number;
  readonly sha256: string;
  readonly bytes: number;
  readonly warnings: readonly string[];
}

const LABEL_HEIGHT = 22;
const LIGHT = (() => {
  const l = [0.3, 0.6, 0.75];
  const n = Math.hypot(l[0]!, l[1]!, l[2]!);
  return [l[0]! / n, l[1]! / n, l[2]! / n] as const;
})();

interface DecodedTexture { readonly data: Buffer; readonly w: number; readonly h: number }

interface PreviewMaterial {
  readonly factor: readonly [number, number, number, number];
  readonly texture: DecodedTexture | null;
  /** Alpha below this is discarded (MASK cutoff, 0.1 for BLEND, -1 for OPAQUE). */
  readonly cutoff: number;
}

interface PreviewModel {
  /** World-space positions, 3 per vertex. */
  readonly positions: Float64Array;
  readonly uvs: Float32Array;
  /** Linear vertex colour, 4 per vertex (1s when COLOR_0 is absent). */
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  /** Material per triangle. */
  readonly triMaterial: Uint32Array;
  readonly materials: readonly PreviewMaterial[];
  readonly warnings: readonly string[];
}

export function previewUsage(): string {
  return [
    "aura3d assets preview <file.glb|asset-id> --out views.png [--views front,side,back,three-quarter] [--size 360] [--no-label] [--json]",
    `  ${PREVIEW_NOTE}`,
    "  Node-only (no browser, GPU or Python). Deterministic: the same GLB and flags give byte-identical PNGs."
  ].join("\n");
}

export function parsePreviewViews(value: string): PreviewView[] {
  const views = value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean).map((v) => (v === "3/4" || v === "threequarter" ? "three-quarter" : v));
  for (const view of views) if (!(view in PREVIEW_VIEWS)) throw new Error(`--views: unknown view "${view}" (use ${Object.keys(PREVIEW_VIEWS).join(", ")}).`);
  if (views.length === 0) throw new Error("--views needs at least one view.");
  return views as PreviewView[];
}

function mat4Mul(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

const IDENTITY = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

async function decodeTexture(sharp: Loose, texture: Loose, warnings: string[]): Promise<DecodedTexture | null> {
  const mime = String(texture.getMimeType() ?? "");
  const image = texture.getImage();
  if (!image) return null;
  if (mime === "image/ktx2") {
    warnings.push(`texture "${texture.getName() || texture.getURI() || "unnamed"}" is KTX2; the preview uses the base-colour factor instead.`);
    return null;
  }
  try {
    const { data, info } = await sharp(Buffer.from(image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  } catch (error) {
    warnings.push(`texture "${texture.getName() || texture.getURI() || "unnamed"}" (${mime || "unknown type"}) could not be decoded: ${(error as Error).message}`);
    return null;
  }
}

async function loadPreviewModel(doc: Loose, sharp: Loose): Promise<PreviewModel> {
  const warnings: string[] = [];
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error("the GLB has no scene to preview.");
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const triMaterial: number[] = [];
  const materials: PreviewMaterial[] = [];
  const materialIndex = new Map<Loose, number>();
  const textureCache = new Map<Loose, DecodedTexture | null>();
  let skippedPrimitives = 0;

  const materialFor = async (material: Loose): Promise<{ index: number; texCoord: number }> => {
    const texCoord = material?.getBaseColorTextureInfo()?.getTexCoord() ?? 0;
    const existing = materialIndex.get(material ?? null);
    if (existing !== undefined) return { index: existing, texCoord };
    const factor = (material?.getBaseColorFactor() ?? [1, 1, 1, 1]) as [number, number, number, number];
    const baseTexture = material?.getBaseColorTexture() ?? null;
    let texture: DecodedTexture | null = null;
    if (baseTexture) {
      if (!textureCache.has(baseTexture)) textureCache.set(baseTexture, await decodeTexture(sharp, baseTexture, warnings));
      texture = textureCache.get(baseTexture) ?? null;
    }
    const mode = material?.getAlphaMode() ?? "OPAQUE";
    const cutoff = mode === "MASK" ? (material.getAlphaCutoff() ?? 0.5) : mode === "BLEND" ? 0.1 : -1;
    const index = materials.length;
    materials.push({ factor: [factor[0], factor[1], factor[2], factor[3]], texture, cutoff });
    materialIndex.set(material ?? null, index);
    return { index, texCoord };
  };

  const nodes: Loose[] = [];
  scene.traverse((node: Loose) => { nodes.push(node); });
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = node.getWorldMatrix() as ArrayLike<number>;
    const skin = node.getSkin();
    let jointMatrices: Float64Array[] | null = null;
    if (skin) {
      const ibm = skin.getInverseBindMatrices();
      jointMatrices = skin.listJoints().map((joint: Loose, i: number) =>
        mat4Mul(joint.getWorldMatrix() as ArrayLike<number>, ibm ? (ibm.getElement(i, []) as number[]) : IDENTITY));
    }
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos || prim.getMode() !== 4) {
        skippedPrimitives += 1;
        continue;
      }
      const { index: matIndex, texCoord } = await materialFor(prim.getMaterial());
      const uv = prim.getAttribute(`TEXCOORD_${texCoord}`) ?? prim.getAttribute("TEXCOORD_0");
      const color = prim.getAttribute("COLOR_0");
      const joints = jointMatrices ? prim.getAttribute("JOINTS_0") : null;
      const weights = jointMatrices ? prim.getAttribute("WEIGHTS_0") : null;
      const base = positions.length / 3;
      const count = pos.getCount();
      const p: number[] = [], t: number[] = [], c: number[] = [], j: number[] = [], w: number[] = [];
      for (let i = 0; i < count; i += 1) {
        pos.getElement(i, p);
        const x = p[0]!, y = p[1]!, z = p[2]!;
        if (joints && weights && jointMatrices) {
          joints.getElement(i, j);
          weights.getElement(i, w);
          let ox = 0, oy = 0, oz = 0, total = 0;
          for (let k = 0; k < 4; k += 1) {
            const weight = w[k] ?? 0;
            const m = jointMatrices[j[k] ?? 0];
            if (!weight || !m) continue;
            ox += weight * (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!);
            oy += weight * (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!);
            oz += weight * (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
            total += weight;
          }
          if (total > 0) positions.push(ox / total, oy / total, oz / total);
          else positions.push(world[0]! * x + world[4]! * y + world[8]! * z + world[12]!, world[1]! * x + world[5]! * y + world[9]! * z + world[13]!, world[2]! * x + world[6]! * y + world[10]! * z + world[14]!);
        } else {
          positions.push(world[0]! * x + world[4]! * y + world[8]! * z + world[12]!, world[1]! * x + world[5]! * y + world[9]! * z + world[13]!, world[2]! * x + world[6]! * y + world[10]! * z + world[14]!);
        }
        if (uv) { uv.getElement(i, t); uvs.push(t[0] ?? 0, t[1] ?? 0); } else uvs.push(0, 0);
        if (color) { color.getElement(i, c); colors.push(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, c.length > 3 ? (c[3] ?? 1) : 1); } else colors.push(1, 1, 1, 1);
      }
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : count;
      for (let i = 0; i + 2 < n; i += 3) {
        indices.push(base + (idx ? idx.getScalar(i) : i), base + (idx ? idx.getScalar(i + 1) : i + 1), base + (idx ? idx.getScalar(i + 2) : i + 2));
        triMaterial.push(matIndex);
      }
    }
  }
  if (skippedPrimitives > 0) warnings.push(`${skippedPrimitives} non-triangle or position-less primitive(s) skipped.`);
  if (indices.length === 0) throw new Error("the GLB has no triangle meshes in its default scene to preview.");
  return {
    positions: Float64Array.from(positions),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    triMaterial: Uint32Array.from(triMaterial),
    materials,
    warnings
  };
}

const encodeSrgb = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

/** Rasterise one view into `target` (RGB, row stride `stride` pixels) at column offset `left`. */
function rasterView(model: PreviewModel, view: PreviewView, size: number, target: Buffer, stride: number, left: number): number {
  const { yawDeg, pitchDeg } = PREVIEW_VIEWS[view];
  const yaw = (yawDeg * Math.PI) / 180, pitch = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const vertexCount = model.positions.length / 3;
  const vx = new Float64Array(vertexCount), vy = new Float64Array(vertexCount), vz = new Float64Array(vertexCount);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const used = new Uint8Array(vertexCount);
  for (const i of model.indices) used[i] = 1;
  for (let i = 0; i < vertexCount; i += 1) {
    const x = model.positions[i * 3]!, y = model.positions[i * 3 + 1]!, z = model.positions[i * 3 + 2]!;
    // Yaw about +Y, then pitch about +X (camera above for positive pitch).
    const rx = cy * x + sy * z, rz = -sy * x + cy * z;
    const ry = cp * y - sp * rz, rz2 = sp * y + cp * rz;
    vx[i] = rx; vy[i] = ry; vz[i] = rz2;
    if (!used[i]) continue;
    if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
  }
  const margin = Math.max(2, Math.round(size * 0.05));
  const scale = Math.min((size - 2 * margin) / (maxX - minX || 1), (size - 2 * margin) / (maxY - minY || 1));
  const ox = (size - (maxX - minX) * scale) / 2, oy = (size - (maxY - minY) * scale) / 2;
  const sx = new Float64Array(vertexCount), syy = new Float64Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    sx[i] = ox + (vx[i]! - minX) * scale;
    syy[i] = size - (oy + (vy[i]! - minY) * scale);
  }
  const zbuffer = new Float64Array(size * size).fill(-Infinity);
  let textured = 0;
  const tris = model.indices.length / 3;
  for (let t = 0; t < tris; t += 1) {
    const i0 = model.indices[t * 3]!, i1 = model.indices[t * 3 + 1]!, i2 = model.indices[t * 3 + 2]!;
    const material = model.materials[model.triMaterial[t]!]!;
    if (material.texture) textured += 1;
    const x0 = sx[i0]!, x1 = sx[i1]!, x2 = sx[i2]!, y0 = syy[i0]!, y1 = syy[i1]!, y2 = syy[i2]!;
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(d) < 1e-12) continue;
    // Flat lambert from the view-space face normal (|n·L| so inconsistent winding still shades).
    const ax = vx[i1]! - vx[i0]!, ay = vy[i1]! - vy[i0]!, az = vz[i1]! - vz[i0]!;
    const bx = vx[i2]! - vx[i0]!, by = vy[i2]! - vy[i0]!, bz = vz[i2]! - vz[i0]!;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const shade = 0.35 + 0.65 * Math.abs((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
    const px0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), px1 = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)));
    const py0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), py1 = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));
    const f = material.factor, tex = material.texture;
    for (let y = py0; y <= py1; y += 1) {
      for (let x = px0; x <= px1; x += 1) {
        const cx = x + 0.5, cyy = y + 0.5;
        const a = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cyy - y2)) / d;
        const b = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cyy - y2)) / d;
        const c = 1 - a - b;
        if (a < 0 || b < 0 || c < 0) continue;
        const z = a * vz[i0]! + b * vz[i1]! + c * vz[i2]!;
        const zi = y * size + x;
        if (z <= zbuffer[zi]!) continue;
        const col = (k: number): number => a * model.colors[i0 * 4 + k]! + b * model.colors[i1 * 4 + k]! + c * model.colors[i2 * 4 + k]!;
        const lr = f[0] * col(0), lg = f[1] * col(1), lb = f[2] * col(2);
        let alpha = f[3] * col(3);
        let r: number, g: number, bl: number;
        if (tex) {
          const u = a * model.uvs[i0 * 2]! + b * model.uvs[i1 * 2]! + c * model.uvs[i2 * 2]!;
          const v = a * model.uvs[i0 * 2 + 1]! + b * model.uvs[i1 * 2 + 1]! + c * model.uvs[i2 * 2 + 1]!;
          const tx = Math.min(tex.w - 1, Math.floor((((u % 1) + 1) % 1) * tex.w));
          const ty = Math.min(tex.h - 1, Math.floor((((v % 1) + 1) % 1) * tex.h));
          const o = (ty * tex.w + tx) * 4;
          alpha *= tex.data[o + 3]! / 255;
          // Texels are sRGB bytes; the linear factor scales them directly (preview approximation).
          r = tex.data[o]! * lr; g = tex.data[o + 1]! * lg; bl = tex.data[o + 2]! * lb;
        } else {
          r = encodeSrgb(lr); g = encodeSrgb(lg); bl = encodeSrgb(lb);
        }
        if (alpha < material.cutoff) continue;
        zbuffer[zi] = z;
        const o2 = (y * stride + left + x) * 3;
        target[o2] = Math.min(255, Math.round(r * shade));
        target[o2 + 1] = Math.min(255, Math.round(g * shade));
        target[o2 + 2] = Math.min(255, Math.round(bl * shade));
      }
    }
  }
  return textured;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[ch]!);
}

export interface PreviewPng {
  /** PNG bytes (a Node Buffer at runtime; typed as Uint8Array so the public declarations need no Node types). */
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly views: readonly PreviewView[];
  readonly cellSize: number;
  readonly triangles: number;
  readonly texturedTriangles: number;
  readonly warnings: readonly string[];
}

/** Render the preview PNG in memory (used by renderPreview and `assets thumbnail`). */
export async function renderPreviewPng(glbPath: string, opts: RenderPreviewOptions = {}): Promise<PreviewPng> {
  const input = resolve(glbPath);
  if (!existsSync(input)) throw new Error(`File not found: ${glbPath}`);
  const views = opts.views && opts.views.length > 0 ? [...opts.views] : [...DEFAULT_PREVIEW_VIEWS];
  for (const view of views) if (!(view in PREVIEW_VIEWS)) throw new Error(`Unknown preview view "${view}".`);
  const size = opts.size ?? 360;
  if (!Number.isInteger(size) || size < 32 || size > 2048) throw new Error("--size must be an integer from 32 to 2048.");
  const background = opts.background ?? [40, 44, 52];
  const toolkit = opts.toolkit ?? loadGltfToolkit(opts.projectDir ?? process.cwd());
  const io = await createGltfIo(toolkit);
  let doc: Loose;
  try {
    doc = await io.read(input);
    doc.setLogger(QUIET_GLTF_LOGGER);
  } catch (error) {
    throw new Error(`${glbPath} could not be read as glTF/GLB: ${(error as Error).message}`);
  }
  const model = await loadPreviewModel(doc, toolkit.sharp);
  const width = size * views.length;
  const pixels = Buffer.alloc(width * size * 3);
  for (let i = 0; i < width * size; i += 1) {
    pixels[i * 3] = background[0]; pixels[i * 3 + 1] = background[1]; pixels[i * 3 + 2] = background[2];
  }
  let texturedTriangles = 0;
  views.forEach((view, index) => { texturedTriangles = rasterView(model, view, size, pixels, width, index * size); });
  const triangles = model.indices.length / 3;
  const sharp = toolkit.sharp;
  let png: Buffer;
  let height = size;
  if (opts.label !== false) {
    height = size + LABEL_HEIGHT;
    const text = `CPU base-colour preview, not a render | ${basename(input)} | ${triangles} tris | ${views.join(" / ")}`;
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-size="13" fill="#fff" font-family="monospace">${escapeXml(text)}</text></svg>`);
    png = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: svg, left: 0, top: 0 }, { input: pixels, raw: { width, height: size, channels: 3 }, left: 0, top: LABEL_HEIGHT }])
      .png()
      .toBuffer();
  } else {
    png = await sharp(pixels, { raw: { width, height: size, channels: 3 } }).png().toBuffer();
  }
  return { png, width, height, views, cellSize: size, triangles, texturedTriangles, warnings: model.warnings };
}

/**
 * Render a CPU base-colour preview of `glbPath` (front, side, back, three-quarter by default) into `outPng`.
 * The result is labelled `kind: "cpu-base-colour-preview"`; it is not rendered or GPU evidence.
 */
export async function renderPreview(glbPath: string, outPng: string, opts: RenderPreviewOptions = {}): Promise<RenderPreviewResult> {
  const preview = await renderPreviewPng(glbPath, opts);
  const output = resolve(outPng);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, preview.png);
  return {
    kind: PREVIEW_KIND,
    note: PREVIEW_NOTE,
    input: resolve(glbPath),
    output,
    views: preview.views,
    cellSize: preview.cellSize,
    width: preview.width,
    height: preview.height,
    triangles: preview.triangles,
    texturedTriangles: preview.texturedTriangles,
    sha256: createHash("sha256").update(preview.png).digest("hex"),
    bytes: preview.png.length,
    warnings: preview.warnings
  };
}
