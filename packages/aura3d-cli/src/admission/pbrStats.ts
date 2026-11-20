/**
 * PBR channel statistics for `aura3d assets inspect --pbr`, `aura3d assets validate --pbr`, the glossy-safe
 * `assets slim` gate and `assets generate`'s slim step (lessons A11 and A12).
 *
 * AI image-to-3D results (the Vesper GT coupe from Hunyuan 3D) ship plausible-looking but wrong PBR maps: a painted
 * body at metalness 0.77, roughness 0.17 (near mirror), and a JPEG normal map that dents every reflection. This module
 * decodes the material textures with `sharp` (resolved like the glTF toolkit and the G6 texture-sanity gate) and
 * reports, per material:
 *
 * - metalness and roughness percentiles (5/50/95): texture channel (B = metalness, G = roughness) x factor, or the
 *   factor alone when there is no metallicRoughness texture;
 * - normal-map tilt percentiles in degrees, A11 formula: n = 2c - 1 per texel and tilt = acos(n.z) without
 *   re-normalising, scaled by `normalTexture.scale`. Because n is not re-normalised this counts encoding drift
 *   (a flat texel stored as z = 254 instead of 255 reads 7.2 degrees), which is exactly the JPEG damage the lesson
 *   is about. `shadingTiltDeg` is the renderer-equivalent angle (normalised vector) for comparison;
 * - the encoding (PNG, JPEG, WebP, KTX2) and size of every texture;
 * - the base colour of the metallic texels (median, linear), to tell painted surfaces from metal.
 *
 * Warnings (codes are stable; see docs/agents/lessons-learned.md A11/A12):
 * - PBR_PAINT_METALLIC: median metalness > 0.5 while the median base colour of the metallic texels is not metal-like.
 *   Metal-like = a conductor's albedo: near-neutral at any brightness (silver, chrome, aluminium, steel, gunmetal and
 *   cool-tinted stylised steel: HSV saturation <= 0.35) or warm gold/brass/copper (hue 15-60 degrees, value >= 0.45,
 *   saturation <= 0.9). Saturated reds, blues, greens and purples (car paint, plastic) are not. A white, grey or black
 *   paint cannot be told from bare metal by colour alone, so it is not flagged.
 * - PBR_NORMAL_LOSSY_GLOSSY: a JPEG normal map on a glossy material (median roughness < 0.45, or metallic).
 * - PBR_NORMAL_NOISY: median normal tilt > 5 degrees on a smooth material (median roughness < 0.45). Rough materials
 *   carry intentional relief and diffuse reflections hide it, so they are not flagged.
 * - PBR_SINGLE_MATERIAL_VEHICLE: a vehicle (manifest role, or a vehicle word in the file/mesh/node names) whose one
 *   material covers >= 5,000 triangles: paint, glass, chrome and tyres cannot share one map set (A11 step 3).
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { parseGlbChunks } from "./glb.js";
import { sniffImageSize } from "./texel.js";

/** Median roughness below this (or a metallic median) makes a material glossy for slim, optimize and validate. */
export const PBR_GLOSSY_ROUGHNESS = 0.45;
/** Median metalness above this makes a material metallic. */
export const PBR_METALLIC = 0.5;
/** Median normal tilt (degrees, A11 formula) above this on a smooth material is PBR_NORMAL_NOISY. */
export const PBR_NOISY_TILT_DEG = 5;
/** Triangles one material must cover before a single-material vehicle is flagged. */
export const PBR_SINGLE_MATERIAL_TRIANGLES = 5000;
/** Samples per texture: a stride grid (no resampling, so per-texel noise is kept), at most SAMPLE_GRID^2 texels. */
const SAMPLE_GRID = 512;

export type PbrWarningCode = "PBR_PAINT_METALLIC" | "PBR_NORMAL_LOSSY_GLOSSY" | "PBR_NORMAL_NOISY" | "PBR_SINGLE_MATERIAL_VEHICLE";
export type PbrTextureSlot = "baseColor" | "metallicRoughness" | "normal" | "occlusion" | "emissive";
export type PbrEncoding = "png" | "jpeg" | "webp" | "ktx2" | "avif" | "unknown";

export interface PbrPercentiles {
  readonly p5: number;
  readonly p50: number;
  readonly p95: number;
}

export interface PbrChannelStats extends PbrPercentiles {
  /** "texture" = texture channel x factor; "factor" = no texture, every percentile is the factor. */
  readonly source: "texture" | "factor";
  readonly factor: number;
}

export interface PbrTextureInfo {
  readonly slot: PbrTextureSlot;
  readonly textureIndex: number;
  readonly width: number;
  readonly height: number;
  readonly encoding: PbrEncoding;
  readonly lossy: boolean;
}

export interface PbrNormalStats {
  readonly encoding: PbrEncoding;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  /** A11 formula: acos(n.z) with n = 2c - 1 (not re-normalised), x normalTexture.scale; p90 included. */
  readonly tiltDeg: PbrPercentiles & { readonly p90: number };
  /** Renderer-equivalent tilt of the re-normalised, scaled vector. */
  readonly shadingTiltDeg: PbrPercentiles & { readonly p90: number };
}

export interface PbrBaseColorStats {
  /** Median linear RGB of the metallic texels (all texels when none are metallic), factor applied. */
  readonly medianLinear: readonly [number, number, number];
  /** HSV of that median in sRGB: hue degrees, saturation and value 0..1. */
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
  readonly metalLike: boolean;
  readonly source: "texture" | "factor";
}

export interface PbrMaterialStats {
  readonly index: number;
  readonly name: string;
  readonly triangles: number;
  readonly metalness: PbrChannelStats;
  readonly roughness: PbrChannelStats;
  readonly baseColor: PbrBaseColorStats;
  readonly normal?: PbrNormalStats;
  readonly textures: readonly PbrTextureInfo[];
  /** Median roughness < PBR_GLOSSY_ROUGHNESS, or median metalness > PBR_METALLIC. */
  readonly glossy: boolean;
  /** Textures that could not be decoded (KTX2, missing sharp, broken bytes); their stats fall back to factors. */
  readonly undecoded?: readonly string[];
}

export interface PbrWarning {
  readonly code: PbrWarningCode;
  readonly material: string;
  readonly message: string;
}

export interface PbrReport {
  readonly schema: "aura3d.pbr-stats/1";
  readonly file: string;
  /** false when sharp is missing: percentiles then come from factors only. */
  readonly decoded: boolean;
  readonly unavailableReason?: string;
  readonly materials: readonly PbrMaterialStats[];
  readonly warnings: readonly PbrWarning[];
}

export interface MeasurePbrOptions {
  /** Resolution root for `sharp` (default process.cwd()). */
  readonly projectDir?: string;
  /** Treat the model as a vehicle for PBR_SINGLE_MATERIAL_VEHICLE (default: a vehicle word in its names). */
  readonly vehicle?: boolean;
}

interface TextureRef {
  readonly index?: number;
  readonly scale?: number;
  readonly extensions?: Readonly<Record<string, { readonly index?: number }>>;
}

interface GltfJsonPbr {
  readonly accessors?: readonly { readonly count?: number }[];
  readonly bufferViews?: readonly { readonly byteOffset?: number; readonly byteLength: number }[];
  readonly images?: readonly { readonly bufferView?: number; readonly uri?: string; readonly mimeType?: string }[];
  readonly textures?: readonly { readonly source?: number; readonly extensions?: Readonly<Record<string, { readonly source?: number }>> }[];
  readonly materials?: readonly {
    readonly name?: string;
    readonly pbrMetallicRoughness?: {
      readonly baseColorFactor?: readonly number[];
      readonly metallicFactor?: number;
      readonly roughnessFactor?: number;
      readonly baseColorTexture?: TextureRef;
      readonly metallicRoughnessTexture?: TextureRef;
    };
    readonly normalTexture?: TextureRef;
    readonly occlusionTexture?: TextureRef;
    readonly emissiveTexture?: TextureRef;
  }[];
  readonly meshes?: readonly { readonly name?: string; readonly primitives?: readonly { readonly attributes?: Readonly<Record<string, number>>; readonly indices?: number; readonly material?: number; readonly mode?: number }[] }[];
  readonly nodes?: readonly { readonly name?: string }[];
}

type SharpFactory = (input: Buffer) => {
  raw(): { toBuffer(opts: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> };
};

interface DecodedImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

const VEHICLE_WORDS = /(?:^|[^a-z])(?:car|cars|coupe|sedan|hatch|hatchback|suv|truck|pickup|van|bus|taxi|kart|racer|racecar|vehicle|motorbike|motorcycle|bike|tractor|jeep|buggy|roadster|limo|ambulance|firetruck)(?:[^a-z]|$)/i;

/** Splits camelCase so `vesperCoupe` and `ao_SedanNW` expose their words to the vehicle pattern. */
export function looksLikeVehicleName(name: string): boolean {
  return VEHICLE_WORDS.test(name.replace(/([a-z])([A-Z])/g, "$1 $2"));
}

/** Resolves `sharp` from the project, then the CLI's own install, then the repo's tools/asset-optimize. */
export function loadPbrSharp(projectDir: string): SharpFactory | undefined {
  const requirers = [
    createRequire(resolve(projectDir, "package.json")),
    createRequire(import.meta.url),
    createRequire(resolve(projectDir, "tools", "asset-optimize", "package.json"))
  ];
  for (const req of requirers) {
    try {
      const mod = req("sharp") as { default?: SharpFactory } & SharpFactory;
      return (mod.default ?? mod) as SharpFactory;
    } catch {
      // try the next resolution root
    }
  }
  return undefined;
}

export function sniffEncoding(bytes: Buffer, mimeType?: string): PbrEncoding {
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x89504e47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && bytes[0] === 0xab && bytes.toString("latin1", 1, 4) === "KTX") return "ktx2";
  if (bytes.length >= 12 && bytes.toString("latin1", 4, 12).startsWith("ftypavi")) return "avif";
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("ktx2")) return "ktx2";
  if (mime.includes("avif")) return "avif";
  return "unknown";
}

/** JPEG is always lossy; WebP may be either, so it counts as lossy unless proven otherwise. KTX2 (Basis) is lossy. */
function isLossy(encoding: PbrEncoding): boolean {
  return encoding === "jpeg" || encoding === "webp" || encoding === "ktx2" || encoding === "avif";
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]!;
}

function percentiles(values: Float32Array): PbrPercentiles & { readonly p90: number } {
  const sorted = values.slice().sort();
  return { p5: round(percentile(sorted, 0.05)), p50: round(percentile(sorted, 0.5)), p90: round(percentile(sorted, 0.9)), p95: round(percentile(sorted, 0.95)) };
}

function round(value: number, digits = 3): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** HSV of an sRGB colour (0..1 channels): hue in degrees. */
export function rgbToHsv(r: number, g: number, b: number): { readonly hue: number; readonly saturation: number; readonly value: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

/**
 * True when an sRGB colour could be a conductor's albedo: near-neutral (silver, chrome, aluminium, steel, gunmetal)
 * or warm gold/brass/copper. Documented in the module header and in lessons A11.
 */
export function isMetalLikeColor(hsv: { readonly hue: number; readonly saturation: number; readonly value: number }): boolean {
  if (hsv.saturation <= 0.35) return true;
  return hsv.value >= 0.45 && hsv.saturation <= 0.9 && hsv.hue >= 15 && hsv.hue <= 60;
}

function imageBytes(json: GltfJsonPbr, bin: Buffer | undefined, gltfDir: string, ref: TextureRef | undefined): { bytes: Buffer; mimeType?: string; textureIndex: number } | undefined {
  const textureIndex = ref?.extensions?.KHR_texture_basisu?.index ?? ref?.index;
  if (textureIndex === undefined) return undefined;
  const texture = json.textures?.[textureIndex];
  const ext = texture?.extensions ?? {};
  const sourceIndex = texture?.source ?? ext.KHR_texture_basisu?.source ?? ext.EXT_texture_webp?.source ?? ext.EXT_texture_avif?.source;
  const image = sourceIndex !== undefined ? json.images?.[sourceIndex] : undefined;
  if (!image) return undefined;
  if (image.bufferView !== undefined) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view || !bin) return undefined;
    const start = view.byteOffset ?? 0;
    return { bytes: bin.subarray(start, start + view.byteLength), mimeType: image.mimeType, textureIndex };
  }
  if (image.uri?.startsWith("data:")) {
    const comma = image.uri.indexOf(",");
    const header = image.uri.slice(5, comma);
    return { bytes: Buffer.from(image.uri.slice(comma + 1), header.endsWith(";base64") ? "base64" : "utf8"), mimeType: header.split(";")[0], textureIndex };
  }
  if (image.uri) {
    const file = resolve(gltfDir, decodeURIComponent(image.uri));
    if (!existsSync(file)) return undefined;
    return { bytes: readFileSync(file), mimeType: image.mimeType ?? `image/${extname(file).slice(1)}`, textureIndex };
  }
  return undefined;
}

/** Stride-grid sample coordinates (normalised texel centres), shared by every texture of a material. */
function sampleGrid(width: number, height: number): { readonly us: Float32Array; readonly vs: Float32Array } {
  const nx = Math.max(1, Math.min(SAMPLE_GRID, width));
  const ny = Math.max(1, Math.min(SAMPLE_GRID, height));
  const us = new Float32Array(nx * ny);
  const vs = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      us[y * nx + x] = (x + 0.5) / nx;
      vs[y * nx + x] = (y + 0.5) / ny;
    }
  }
  return { us, vs };
}

function texel(image: DecodedImage, u: number, v: number): number {
  const x = Math.min(image.width - 1, Math.floor(u * image.width));
  const y = Math.min(image.height - 1, Math.floor(v * image.height));
  return (y * image.width + x) * image.channels;
}

function triangleCount(json: GltfJsonPbr, materialIndex: number): number {
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.material !== materialIndex) continue;
      const mode = primitive.mode ?? 4;
      if (mode !== 4 && mode !== 5 && mode !== 6) continue;
      const count = primitive.indices !== undefined ? json.accessors?.[primitive.indices]?.count : json.accessors?.[primitive.attributes?.POSITION ?? -1]?.count;
      if (count === undefined) continue;
      triangles += mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
    }
  }
  return triangles;
}

function readGltf(file: string): { json: GltfJsonPbr; bin?: Buffer } {
  if (file.toLowerCase().endsWith(".glb")) {
    const chunks = parseGlbChunks(readFileSync(file));
    return { json: chunks.json as GltfJsonPbr, ...(chunks.bin ? { bin: chunks.bin } : {}) };
  }
  return { json: JSON.parse(readFileSync(file, "utf8")) as GltfJsonPbr };
}

/** Decodes every material texture of a GLB/glTF and returns per-material PBR statistics plus PBR_* warnings. */
export async function measurePbrStats(file: string, options: MeasurePbrOptions = {}): Promise<PbrReport> {
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`File not found: ${file}`);
  const { json, bin } = readGltf(path);
  const gltfDir = dirname(path);
  const sharp = loadPbrSharp(resolve(options.projectDir ?? process.cwd()));
  const cache = new Map<number, Promise<DecodedImage | undefined>>();
  const decode = (bytes: Buffer, textureIndex: number): Promise<DecodedImage | undefined> => {
    if (!sharp) return Promise.resolve(undefined);
    let pending = cache.get(textureIndex);
    if (!pending) {
      pending = sharp(bytes).raw().toBuffer({ resolveWithObject: true })
        .then(({ data, info }) => ({ data, width: info.width, height: info.height, channels: info.channels }))
        .catch(() => undefined);
      cache.set(textureIndex, pending);
    }
    return pending;
  };

  const materials: PbrMaterialStats[] = [];
  for (const [index, material] of (json.materials ?? []).entries()) {
    const pbr = material.pbrMetallicRoughness ?? {};
    const metallicFactor = pbr.metallicFactor ?? 1;
    const roughnessFactor = pbr.roughnessFactor ?? 1;
    const colorFactor = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const slots: [PbrTextureSlot, TextureRef | undefined][] = [
      ["baseColor", pbr.baseColorTexture],
      ["metallicRoughness", pbr.metallicRoughnessTexture],
      ["normal", material.normalTexture],
      ["occlusion", material.occlusionTexture],
      ["emissive", material.emissiveTexture]
    ];
    const textures: PbrTextureInfo[] = [];
    const decoded = new Map<PbrTextureSlot, DecodedImage>();
    const encodings = new Map<PbrTextureSlot, PbrEncoding>();
    const undecoded: string[] = [];
    for (const [slot, ref] of slots) {
      const image = imageBytes(json, bin, gltfDir, ref);
      if (!image) continue;
      const encoding = sniffEncoding(image.bytes, image.mimeType);
      const size = sniffImageSize(image.bytes, image.mimeType);
      const pixels = slot === "occlusion" || slot === "emissive" ? undefined : await decode(image.bytes, image.textureIndex);
      if (pixels) decoded.set(slot, pixels);
      else if (slot !== "occlusion" && slot !== "emissive") undecoded.push(`${slot} (${encoding}${sharp ? "" : ", sharp not installed"})`);
      encodings.set(slot, encoding);
      textures.push({ slot, textureIndex: image.textureIndex, width: size?.[0] ?? pixels?.width ?? 0, height: size?.[1] ?? pixels?.height ?? 0, encoding, lossy: isLossy(encoding) });
    }

    const mr = decoded.get("metallicRoughness");
    const color = decoded.get("baseColor");
    const normalImage = decoded.get("normal");
    const grid = sampleGrid(Math.max(mr?.width ?? 1, color?.width ?? 1), Math.max(mr?.height ?? 1, color?.height ?? 1));
    const samples = grid.us.length;

    let metalness: PbrChannelStats;
    let roughness: PbrChannelStats;
    const metalValues = new Float32Array(samples);
    if (mr) {
      const rough = new Float32Array(samples);
      for (let i = 0; i < samples; i += 1) {
        const at = texel(mr, grid.us[i]!, grid.vs[i]!);
        rough[i] = (mr.data[at + 1]! / 255) * roughnessFactor;
        metalValues[i] = (mr.data[at + 2]! / 255) * metallicFactor;
      }
      const m = percentiles(metalValues);
      const r = percentiles(rough);
      metalness = { p5: m.p5, p50: m.p50, p95: m.p95, source: "texture", factor: metallicFactor };
      roughness = { p5: r.p5, p50: r.p50, p95: r.p95, source: "texture", factor: roughnessFactor };
    } else {
      metalValues.fill(metallicFactor);
      metalness = { p5: metallicFactor, p50: metallicFactor, p95: metallicFactor, source: "factor", factor: metallicFactor };
      roughness = { p5: roughnessFactor, p50: roughnessFactor, p95: roughnessFactor, source: "factor", factor: roughnessFactor };
    }

    // Base colour of the metallic texels (where a painted body shading as metal shows), else of every texel.
    const linear = [srgbToLinear(1), srgbToLinear(1), srgbToLinear(1)].map((one, c) => one * (colorFactor[c] ?? 1));
    let medianLinear: [number, number, number] = [linear[0]!, linear[1]!, linear[2]!];
    if (color) {
      const metallicOnly = metalness.p50 > PBR_METALLIC;
      const channels: [number[], number[], number[]] = [[], [], []];
      for (let i = 0; i < samples; i += 1) {
        if (metallicOnly && metalValues[i]! <= PBR_METALLIC) continue;
        const at = texel(color, grid.us[i]!, grid.vs[i]!);
        for (let c = 0; c < 3; c += 1) channels[c]!.push(srgbToLinear(color.data[at + Math.min(c, color.channels - 1)]! / 255) * (colorFactor[c] ?? 1));
      }
      medianLinear = channels.map((values) => percentile(Float32Array.from(values).sort(), 0.5)) as [number, number, number];
    }
    const hsv = rgbToHsv(linearToSrgb(medianLinear[0]), linearToSrgb(medianLinear[1]), linearToSrgb(medianLinear[2]));
    const baseColor: PbrBaseColorStats = {
      medianLinear: [round(medianLinear[0]), round(medianLinear[1]), round(medianLinear[2])],
      hue: round(hsv.hue, 1),
      saturation: round(hsv.saturation),
      value: round(hsv.value),
      metalLike: isMetalLikeColor(hsv),
      source: color ? "texture" : "factor"
    };

    let normal: PbrNormalStats | undefined;
    if (normalImage) {
      const scale = material.normalTexture?.scale ?? 1;
      const ngrid = sampleGrid(normalImage.width, normalImage.height);
      const tilt = new Float32Array(ngrid.us.length);
      const shading = new Float32Array(ngrid.us.length);
      const factor = Math.min(1, Math.abs(scale));
      for (let i = 0; i < ngrid.us.length; i += 1) {
        const at = texel(normalImage, ngrid.us[i]!, ngrid.vs[i]!);
        const x = (normalImage.data[at]! / 255) * 2 - 1;
        const y = (normalImage.data[at + 1]! / 255) * 2 - 1;
        const z = (normalImage.data[at + 2]! / 255) * 2 - 1;
        tilt[i] = (Math.acos(Math.max(-1, Math.min(1, z))) * 180) / Math.PI * factor;
        shading[i] = (Math.atan2(Math.hypot(x * scale, y * scale), Math.max(1e-6, z)) * 180) / Math.PI;
      }
      const info = textures.find((t) => t.slot === "normal")!;
      normal = { encoding: encodings.get("normal") ?? "unknown", width: info.width, height: info.height, scale, tiltDeg: percentiles(tilt), shadingTiltDeg: percentiles(shading) };
    }

    materials.push({
      index,
      name: material.name ?? `material ${index}`,
      triangles: triangleCount(json, index),
      metalness,
      roughness,
      baseColor,
      ...(normal ? { normal } : {}),
      textures,
      glossy: roughness.p50 < PBR_GLOSSY_ROUGHNESS || metalness.p50 > PBR_METALLIC,
      ...(undecoded.length ? { undecoded } : {})
    });
  }

  const names = [basename(path), ...(json.meshes ?? []).map((mesh) => mesh.name ?? ""), ...(json.nodes ?? []).map((node) => node.name ?? "")];
  const vehicle = options.vehicle ?? names.some((name) => name && looksLikeVehicleName(name));
  const report: Omit<PbrReport, "warnings"> = {
    schema: "aura3d.pbr-stats/1",
    file: path,
    decoded: Boolean(sharp),
    ...(sharp ? {} : { unavailableReason: "sharp is not installed: npm install --save-dev sharp (texture percentiles fall back to factors)." }),
    materials
  };
  return { ...report, warnings: pbrWarnings(materials, { vehicle }) };
}

/** PBR_* warnings for measured materials; see the module header for each rule. */
export function pbrWarnings(materials: readonly PbrMaterialStats[], options: { readonly vehicle?: boolean } = {}): PbrWarning[] {
  const warnings: PbrWarning[] = [];
  const fmt = (n: number, digits = 2): string => n.toFixed(digits);
  for (const material of materials) {
    const label = `"${material.name}"`;
    if (material.metalness.p50 > PBR_METALLIC && !material.baseColor.metalLike) {
      warnings.push({
        code: "PBR_PAINT_METALLIC",
        material: material.name,
        message: `material ${label}: metalness median ${fmt(material.metalness.p50)} on a base colour that is not metal-like (hue ${material.baseColor.hue.toFixed(0)}, saturation ${fmt(material.baseColor.saturation)}, value ${fmt(material.baseColor.value)}); painted surfaces are dielectric (metalness about 0) with a clearcoat (material.clearcoatPaint); do not hide the sheen by lowering specular.`
      });
    }
    if (material.normal && material.glossy && material.normal.encoding === "jpeg") {
      warnings.push({
        code: "PBR_NORMAL_LOSSY_GLOSSY",
        material: material.name,
        message: `material ${label}: JPEG normal map on a glossy surface (roughness median ${fmt(material.roughness.p50)}, metalness median ${fmt(material.metalness.p50)}); JPEG blocks show as dents and wavy reflections. Keep normal maps PNG; a map delivered as JPEG needs a lower normalScale or removal.`
      });
    }
    if (material.normal && material.roughness.p50 < PBR_GLOSSY_ROUGHNESS && material.normal.tiltDeg.p50 > PBR_NOISY_TILT_DEG) {
      warnings.push({
        code: "PBR_NORMAL_NOISY",
        material: material.name,
        message: `material ${label}: normal tilt median ${material.normal.tiltDeg.p50.toFixed(1)} deg (p90 ${material.normal.tiltDeg.p90.toFixed(1)}) on a smooth surface (roughness median ${fmt(material.roughness.p50)}); smooth panels should read 0 to 2 deg. Lower normalScale (start near 0.3) or drop the map.`
      });
    }
  }
  if (options.vehicle && materials.length === 1 && materials[0]!.triangles >= PBR_SINGLE_MATERIAL_TRIANGLES) {
    const only = materials[0]!;
    warnings.push({
      code: "PBR_SINGLE_MATERIAL_VEHICLE",
      material: only.name,
      message: `vehicle with one material "${only.name}" over ${only.triangles} triangles: split body paint, glass, chrome and tyres into separate materials (one map set rarely serves all four).`
    });
  }
  return warnings;
}

/** `CODE: message` lines, as appended to inspect and validate warnings. */
export function formatPbrWarnings(warnings: readonly PbrWarning[], prefix = ""): string[] {
  return warnings.map((warning) => `${prefix}${warning.code}: ${warning.message}`);
}
