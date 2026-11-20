/**
 * `aura3d assets slim <glb…>` — re-encode PNG normal maps as JPEG (ported from tools/idol/slim.mjs).
 *
 * `assets optimize` keeps normal maps lossless (~2.5 MB each at 1024 px). At JPEG q92 the shading difference is not
 * visible on rough, matte props while files shrink 40-60%. On glossy surfaces JPEG's 8x8 blocks show as dents and
 * wavy reflections (lessons A11, A12), so by default a normal map used by a glossy material (median roughness, factor x
 * texture, below 0.45, or median metalness above 0.5; see admission/pbrStats.ts) is skipped and reported with the
 * reason; `allowGlossy` (`--allow-glossy`) forces the old behaviour. Files are rewritten in place unless `out` is given,
 * and a result that is not smaller than the input is never written.
 */

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { measurePbrStats, PBR_GLOSSY_ROUGHNESS, PBR_METALLIC, type PbrMaterialStats } from "../../admission/pbrStats.js";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "../assets/gltfToolkit.js";
import { QUIET_GLTF_LOGGER } from "./logger.js";

export interface SlimGlbOptions {
  /** JPEG quality 1-100 (default 92). */
  readonly quality?: number;
  /** Material texture slots to re-encode, matched as slot-name prefixes (default ["normal"] → normalTexture). */
  readonly slots?: readonly string[];
  /** Write here instead of rewriting `file` in place. */
  readonly out?: string;
  /** Also re-encode normal maps of glossy materials (the pre-5.7.0 behaviour; default false). */
  readonly allowGlossy?: boolean;
  readonly toolkit?: GltfToolkit;
  /** Resolution root for the glTF-Transform packages (default process.cwd()). */
  readonly projectDir?: string;
}

export interface SlimGlbResult {
  readonly file: string;
  /** Bytes before. */
  readonly before: number;
  /** Bytes of the file now on disk at `output` (equal to `before` when nothing was re-encoded). */
  readonly after: number;
  readonly output: string;
  /** PNG textures in the selected slots that were re-encoded. */
  readonly reencoded: number;
  /** PNG textures in the selected slots left lossless, each with the reason (glossy material). */
  readonly skipped: readonly SlimSkip[];
  readonly written: boolean;
}

export interface SlimSkip {
  readonly texture: string;
  readonly material: string;
  readonly reason: string;
}

export const SLIM_DEFAULT_QUALITY = 92;

export function slimUsage(): string {
  return [
    "aura3d assets slim <file.glb> [more.glb ...] [--quality 92] [--slots normal[,occlusion,...]] [--allow-glossy] [--out out.glb] [--json]",
    "  Re-encodes PNG textures in the given material slots (default: normal maps) as JPEG. Rewrites files in place",
    "  unless --out is given (single input only). A result that is not smaller than the input is not written.",
    `  Normal maps on glossy materials (median roughness < ${PBR_GLOSSY_ROUGHNESS}, or metalness > ${PBR_METALLIC}) stay PNG and are`,
    "  reported as skipped: JPEG blocks show as dents in glossy reflections. --allow-glossy re-encodes them anyway."
  ].join("\n");
}

function slotPattern(slots: readonly string[]): RegExp {
  for (const slot of slots) if (!/^[A-Za-z][A-Za-z0-9]*$/.test(slot)) throw new Error(`--slots: "${slot}" is not a texture slot name (use e.g. normal, occlusion, emissive, baseColor, metallicRoughness).`);
  return new RegExp(`^(?:${slots.join("|")})`);
}

/** Re-encode PNG textures in `slots` (default normal maps) as JPEG at `quality`; see SlimGlbResult. */
export async function slimGlb(file: string, opts: SlimGlbOptions = {}): Promise<SlimGlbResult> {
  const input = resolve(file);
  if (!existsSync(input)) throw new Error(`File not found: ${file}`);
  const quality = opts.quality ?? SLIM_DEFAULT_QUALITY;
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("--quality must be an integer from 1 to 100.");
  const slots = opts.slots && opts.slots.length > 0 ? opts.slots : ["normal"];
  const pattern = slotPattern(slots);
  const output = resolve(opts.out ?? file);
  const before = statSync(input).size;

  const toolkit = opts.toolkit ?? loadGltfToolkit(opts.projectDir ?? process.cwd());
  const { textureCompress, listTextureSlots } = toolkit.functions as Loose;
  const io = await createGltfIo(toolkit);
  const doc: Loose = await io.read(input);
  doc.setLogger(QUIET_GLTF_LOGGER);
  const pngInSlots = doc.getRoot().listTextures().filter((texture: Loose) =>
    texture.getMimeType() === "image/png" && (listTextureSlots(texture) as string[]).some((slot) => pattern.test(slot)));
  const skipped = opts.allowGlossy || pngInSlots.length === 0 ? [] : await glossySkips(input, doc, pngInSlots, opts.projectDir);
  const skippedTextures = new Set(skipped.map((skip) => skip.textureRef));
  const candidates = pngInSlots.filter((texture: Loose) => !skippedTextures.has(texture));
  const skips: SlimSkip[] = skipped.map(({ textureRef: _ref, ...skip }) => skip);
  const unchanged = (): SlimGlbResult => ({ file: input, before, after: before, output: input, reencoded: 0, skipped: skips, written: false });
  if (candidates.length === 0) {
    if (output !== input) return copyThrough(io, doc, output, input, before, skips);
    return unchanged();
  }
  // Select exactly the candidates (a texture shared by a glossy and a matte material stays lossless): textureCompress
  // matches `pattern` against texture names, so the candidates carry a temporary marker name for the transform.
  const marker = `__aura3d_slim_${process.pid}_`;
  const names = new Map<Loose, string>();
  candidates.forEach((texture: Loose, index: number) => {
    names.set(texture, texture.getName());
    texture.setName(`${marker}${index}`);
  });
  try {
    await doc.transform(textureCompress({ encoder: toolkit.sharp, targetFormat: "jpeg", quality, slots: pattern, pattern: new RegExp(`^${marker}\\d+$`) }));
  } finally {
    for (const [texture, name] of names) texture.setName(name);
  }
  if (output.toLowerCase().endsWith(".gltf")) {
    // JSON + sidecars: NodeIO lays the resources out next to the output.
    mkdirSync(dirname(output), { recursive: true });
    await io.write(output, doc);
    return { file: input, before, after: statSync(output).size, output, reencoded: candidates.length, skipped: skips, written: true };
  }
  const bytes: Uint8Array = await io.writeBinary(doc);
  if (bytes.byteLength >= before) {
    // JPEG was not smaller: keep the input bytes (copied when --out names another file).
    if (output !== input) {
      mkdirSync(dirname(output), { recursive: true });
      copyFileSync(input, output);
    }
    return { file: input, before, after: before, output, reencoded: candidates.length, skipped: skips, written: false };
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
  return { file: input, before, after: bytes.byteLength, output, reencoded: candidates.length, skipped: skips, written: true };
}

async function copyThrough(io: Loose, doc: Loose, output: string, input: string, before: number, skipped: readonly SlimSkip[]): Promise<SlimGlbResult> {
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, doc);
  return { file: input, before, after: statSync(output).size, output, reencoded: 0, skipped, written: true };
}

/** Why a material is glossy, or undefined when it is not. */
export function glossyReason(stats: Pick<PbrMaterialStats, "roughness" | "metalness">): string | undefined {
  const rough = stats.roughness.p50;
  const metal = stats.metalness.p50;
  const measured = `roughness median ${rough.toFixed(2)}, metalness median ${metal.toFixed(2)}`;
  if (rough < PBR_GLOSSY_ROUGHNESS) return `glossy (${measured}; roughness < ${PBR_GLOSSY_ROUGHNESS})`;
  if (metal > PBR_METALLIC) return `metallic (${measured}; metalness > ${PBR_METALLIC})`;
  return undefined;
}

/**
 * Candidate textures used as a normal map by a glossy material. Materials are matched by index: glTF-Transform reads
 * materials in file order, the order measurePbrStats reports them in.
 */
async function glossySkips(input: string, doc: Loose, candidates: readonly Loose[], projectDir?: string): Promise<(SlimSkip & { readonly textureRef: Loose })[]> {
  const report = await measurePbrStats(input, { projectDir: projectDir ?? process.cwd() });
  const materials: Loose[] = doc.getRoot().listMaterials();
  const out: (SlimSkip & { readonly textureRef: Loose })[] = [];
  for (const texture of candidates) {
    for (const [index, material] of materials.entries()) {
      const usesAsNormal = material.getNormalTexture() === texture
        || material.listExtensions?.().some((ext: Loose) => typeof ext.getClearcoatNormalTexture === "function" && ext.getClearcoatNormalTexture() === texture);
      if (!usesAsNormal) continue;
      const stats = report.materials[index];
      const reason = stats ? glossyReason(stats) : undefined;
      if (!reason) continue;
      out.push({ textureRef: texture, texture: texture.getName() || texture.getURI() || `texture ${doc.getRoot().listTextures().indexOf(texture)}`, material: material.getName() || `material ${index}`, reason: `normal map on ${reason}; kept PNG (pass --allow-glossy to re-encode)` });
      break;
    }
  }
  return out;
}
