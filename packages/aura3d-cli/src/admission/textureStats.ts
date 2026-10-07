/**
 * PRD-05 §6.4 G6 — texture sanity measurement on 256² decoded proxies.
 *
 * Pixel decode needs `sharp`, which is a `tools/asset-optimize` dependency
 * (the CLI itself carries no image deps per §4.4). Resolution follows the
 * established lane-05 bridge: `createRequire(<repo>/tools/asset-optimize/
 * package.json)` + `import(resolve("sharp"))`. When the tool deps are not
 * installed (plain `pnpm install` without `tools/asset-optimize` npm
 * install), the report is `available: false` and G6 records a fail —
 * release admission requires the measurement, never assumes it.
 *
 * Measured per §6.4 G6:
 * - normal maps: decoded vector length within [0.9, 1.1] for ≥ 95 % texels,
 *   mean B ≥ 0.7;
 * - ORM/metallicRoughness: R/G/B not all constant; a channel with σ < 0.004
 *   is flagged "replace texture with factor";
 * - base colour: sRGB luminance (0.2126R+0.7152G+0.0722B on 0–255) within
 *   [30, 240] on ≥ 95 % texels; metals (metallic ≥ 0.9 factor or ORM
 *   median ≥ 0.9) require ≥ 140;
 * - no texture above `profile.maxTextureDimension`; no non-power-of-two
 *   dimensions (post-optimize rule; recorded as `npot` flags).
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import type { AdmissionGltfJson } from "./glb.js";
import { sniffImageSize } from "./texel.js";

export interface TextureChannelStats {
  readonly mean: number;
  readonly stdDev: number;
  /** Fraction of texels whose channel value sits in `inRange` (0–255). */
  readonly inRange?: number;
}

export interface TextureSlotStats {
  readonly materialIndex: number;
  readonly materialName?: string;
  readonly slot: "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive";
  readonly width: number;
  readonly height: number;
  readonly mimeType?: string;
  readonly powerOfTwo: boolean;
  /** Decoded-channel stats (undefined when the image cannot be decoded). */
  readonly channels?: readonly TextureChannelStats[];
  /** Normal-map vector-length stats. */
  readonly normalLength?: { readonly mean: number; readonly inUnitRange: number; readonly meanBlue: number };
  /** sRGB luminance histogram (base colour). */
  readonly luminance?: { readonly mean: number; readonly inRange30to240: number };
  /** ORM channels whose σ < 0.004 (constant → "replace with factor"). */
  readonly constantChannels?: readonly string[];
  readonly error?: string;
}

export interface TextureSanityReport {
  readonly available: boolean;
  /** Reason the decode could not run (sharp missing, no images, …). */
  readonly unavailableReason?: string;
  readonly textures: readonly TextureSlotStats[];
}

interface GltfImageLike {
  readonly bufferView?: number;
  readonly uri?: string;
  readonly mimeType?: string;
}

interface GltfJsonImages extends AdmissionGltfJson {
  readonly bufferViews?: readonly { readonly byteOffset?: number; readonly byteLength: number }[];
  readonly images?: readonly GltfImageLike[];
  readonly textures?: readonly { readonly source?: number; readonly extensions?: Readonly<Record<string, { readonly source?: number }>> }[];
}

interface SharpLike {
  (input: Buffer): {
    raw(): { toBuffer(opts: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> };
    resize(w: number, h: number, o?: { fit?: string }): SharpLike extends never ? never : ReturnType<SharpLike>;
    metadata(): Promise<{ width?: number; height?: number; space?: string }>;
  };
}

type SharpFactory = (input: Buffer) => {
  raw(): { toBuffer(opts: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> };
  resize(w: number, h: number, o?: { fit?: string }): unknown;
  metadata(): Promise<{ width?: number; height?: number; space?: string }>;
};

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

async function loadSharp(repoRoot: string): Promise<SharpFactory | undefined> {
  try {
    const toolRequire = createRequire(resolve(repoRoot, "tools", "asset-optimize", "package.json"));
    const mod = (await import(toolRequire.resolve("sharp"))) as { default?: SharpFactory } & SharpFactory;
    return (mod.default ?? mod) as SharpFactory;
  } catch {
    return undefined;
  }
}

const PROXY = 256;

interface DecodeJob {
  readonly slot: TextureSlotStats["slot"];
  readonly materialIndex: number;
  readonly materialName?: string;
  readonly bytes: Buffer;
  readonly mimeType?: string;
}

/** Extracts image bytes for a material slot's texture reference. */
function imageBytesFor(json: GltfJsonImages, bin: Buffer | undefined, gltfDir: string, texInfo: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> } | undefined): { readonly bytes: Buffer; readonly mimeType?: string } | undefined {
  const textureIndex = texInfo?.extensions?.KHR_texture_basisu?.index ?? texInfo?.index;
  if (textureIndex === undefined) return undefined;
  const texture = json.textures?.[textureIndex];
  const sourceIndex = texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source;
  const image = sourceIndex !== undefined ? json.images?.[sourceIndex] : undefined;
  if (!image) return undefined;
  if (image.bufferView !== undefined && bin) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view) return undefined;
    return { bytes: bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength), mimeType: image.mimeType };
  }
  if (image.uri && !image.uri.startsWith("data:")) {
    const file = resolve(gltfDir, decodeURIComponent(image.uri));
    if (!existsSync(file)) return undefined;
    return { bytes: readFileSync(file), mimeType: image.mimeType ?? `image/${extname(file).slice(1)}` };
  }
  return undefined;
}

function channelStats(data: Buffer, width: number, height: number, channels: number): { channels: TextureChannelStats[]; normalLength?: TextureSlotStats["normalLength"]; luminance?: TextureSlotStats["luminance"]; constantChannels: string[] } {
  const px = width * height;
  const sums = [0, 0, 0, 0];
  const sumsSq = [0, 0, 0, 0];
  let normalInRange = 0;
  let normalBlueSum = 0;
  let luminanceInRange = 0;
  let luminanceSum = 0;
  for (let i = 0; i < px; i++) {
    const at = i * channels;
    const r = data[at] ?? 0;
    const g = data[at + 1] ?? 0;
    const b = data[at + 2] ?? 0;
    sums[0]! += r; sums[1]! += g; sums[2]! += b;
    sumsSq[0]! += r * r; sumsSq[1]! += g * g; sumsSq[2]! += b * b;
    const nx = r / 127.5 - 1;
    const ny = g / 127.5 - 1;
    const nz = b / 127.5 - 1;
    const len = Math.hypot(nx, ny, nz);
    if (len >= 0.9 && len <= 1.1) normalInRange += 1;
    normalBlueSum += nz;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminanceSum += lum;
    if (lum >= 30 && lum <= 240) luminanceInRange += 1;
  }
  const channels_: TextureChannelStats[] = [];
  const constantChannels: string[] = [];
  const names = ["R", "G", "B", "A"];
  for (let c = 0; c < Math.min(channels, 4); c++) {
    const mean = (sums[c] ?? 0) / px;
    const stdDev = Math.sqrt(Math.max(0, (sumsSq[c] ?? 0) / px - mean * mean));
    channels_.push({ mean, stdDev });
    if (stdDev / 255 < 0.004) constantChannels.push(names[c]!);
  }
  return {
    channels: channels_,
    normalLength: { mean: 0, inUnitRange: normalInRange / px, meanBlue: normalBlueSum / px },
    luminance: { mean: luminanceSum / px, inRange30to240: luminanceInRange / px },
    constantChannels
  };
}

/**
 * Measures G6 stats for every material texture slot in the glTF.
 * `gltfDir` resolves external image URIs (gltf container); GLB images come
 * from `bin`.
 */
export async function measureTextureSanity(json: AdmissionGltfJson, bin: Buffer | undefined, gltfDir: string, repoRoot: string): Promise<TextureSanityReport> {
  const full = json as GltfJsonImages;
  const sharp = await loadSharp(repoRoot);
  const jobs: DecodeJob[] = [];
  const materials = (full.materials ?? []) as readonly {
    readonly name?: string;
    readonly pbrMetallicRoughness?: {
      readonly baseColorTexture?: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> };
      readonly metallicRoughnessTexture?: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> };
    };
    readonly normalTexture?: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> };
    readonly occlusionTexture?: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> };
    readonly emissiveTexture?: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> };
  }[];
  materials.forEach((material, materialIndex) => {
    const slots: [TextureSlotStats["slot"], { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> } | undefined][] = [
      ["baseColor", material.pbrMetallicRoughness?.baseColorTexture],
      ["normal", material.normalTexture],
      ["metallicRoughness", material.pbrMetallicRoughness?.metallicRoughnessTexture],
      ["occlusion", material.occlusionTexture],
      ["emissive", material.emissiveTexture]
    ];
    for (const [slot, info] of slots) {
      const image = imageBytesFor(full, bin, gltfDir, info);
      if (image) jobs.push({ slot, materialIndex, materialName: material.name, bytes: image.bytes, mimeType: image.mimeType });
    }
  });
  if (jobs.length === 0) {
    return { available: true, textures: [] };
  }
  if (!sharp) {
    return {
      available: false,
      unavailableReason: "sharp is not installed — run `npm install` in tools/asset-optimize (G6 decode needs it).",
      textures: jobs.map((job) => {
        const size = sniffImageSize(job.bytes, job.mimeType);
        return {
          slot: job.slot,
          materialIndex: job.materialIndex,
          ...(job.materialName ? { materialName: job.materialName } : {}),
          width: size?.[0] ?? 0,
          height: size?.[1] ?? 0,
          ...(job.mimeType ? { mimeType: job.mimeType } : {}),
          powerOfTwo: size ? isPowerOfTwo(size[0]) && isPowerOfTwo(size[1]) : false,
          error: "decode-unavailable"
        };
      })
    };
  }
  const textures: TextureSlotStats[] = [];
  for (const job of jobs) {
    const size = sniffImageSize(job.bytes, job.mimeType);
    const base: TextureSlotStats = {
      slot: job.slot,
      materialIndex: job.materialIndex,
      ...(job.materialName ? { materialName: job.materialName } : {}),
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
      ...(job.mimeType ? { mimeType: job.mimeType } : {}),
      powerOfTwo: size ? isPowerOfTwo(size[0]) && isPowerOfTwo(size[1]) : false
    };
    try {
      let pipeline = sharp(job.bytes);
      const meta = await pipeline.metadata();
      const srcW = size?.[0] ?? meta.width ?? 0;
      const srcH = size?.[1] ?? meta.height ?? 0;
      if (srcW > PROXY || srcH > PROXY) {
        const scale = Math.min(1, PROXY / Math.max(srcW, srcH));
        pipeline = pipeline.resize(Math.max(1, Math.round(srcW * scale)), Math.max(1, Math.round(srcH * scale)), { fit: "fill" }) as typeof pipeline;
      }
      const raw = await pipeline.raw().toBuffer({ resolveWithObject: true });
      const stats = channelStats(raw.data, raw.info.width, raw.info.height, raw.info.channels);
      const space = meta.space;
      textures.push({
        ...base,
        width: raw.info.width || base.width,
        height: raw.info.height || base.height,
        channels: stats.channels,
        ...(job.slot === "normal" ? { normalLength: { ...stats.normalLength!, meanBlue: stats.normalLength!.meanBlue } } : {}),
        ...(job.slot === "baseColor" ? { luminance: stats.luminance } : {}),
        ...(job.slot === "metallicRoughness" || job.slot === "occlusion" ? { constantChannels: stats.constantChannels } : {}),
        ...(space && space !== "srgb" && job.slot === "baseColor" ? { error: `colorspace-${space}` } : {})
      });
    } catch (error) {
      // KTX2/basisu sources can't be decoded by sharp — sniffed dims still land.
      textures.push({ ...base, error: `undecodable: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}` });
    }
  }
  return { available: true, textures };
}
