/**
 * `aura3d assets slim <glb…>` — re-encode PNG normal maps as JPEG (ported from tools/idol/slim.mjs).
 *
 * `assets optimize` keeps normal maps lossless (~2.5 MB each at 1024 px). At JPEG q92 the shading difference is not
 * visible in game while files shrink 40-60%. Files are rewritten in place unless `out` is given, and a result that is not
 * smaller than the input is never written.
 */

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "../assets/gltfToolkit.js";
import { QUIET_GLTF_LOGGER } from "./logger.js";

export interface SlimGlbOptions {
  /** JPEG quality 1-100 (default 92). */
  readonly quality?: number;
  /** Material texture slots to re-encode, matched as slot-name prefixes (default ["normal"] → normalTexture). */
  readonly slots?: readonly string[];
  /** Write here instead of rewriting `file` in place. */
  readonly out?: string;
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
  readonly written: boolean;
}

export const SLIM_DEFAULT_QUALITY = 92;

export function slimUsage(): string {
  return [
    "aura3d assets slim <file.glb> [more.glb ...] [--quality 92] [--slots normal[,occlusion,...]] [--out out.glb] [--json]",
    "  Re-encodes PNG textures in the given material slots (default: normal maps) as JPEG. Rewrites files in place",
    "  unless --out is given (single input only). A result that is not smaller than the input is not written."
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
  const candidates = doc.getRoot().listTextures().filter((texture: Loose) =>
    texture.getMimeType() === "image/png" && (listTextureSlots(texture) as string[]).some((slot) => pattern.test(slot)));
  const unchanged = (): SlimGlbResult => ({ file: input, before, after: before, output: input, reencoded: 0, written: false });
  if (candidates.length === 0) {
    if (output !== input) return copyThrough(io, doc, output, input, before);
    return unchanged();
  }
  await doc.transform(textureCompress({ encoder: toolkit.sharp, targetFormat: "jpeg", quality, slots: pattern }));
  if (output.toLowerCase().endsWith(".gltf")) {
    // JSON + sidecars: NodeIO lays the resources out next to the output.
    mkdirSync(dirname(output), { recursive: true });
    await io.write(output, doc);
    return { file: input, before, after: statSync(output).size, output, reencoded: candidates.length, written: true };
  }
  const bytes: Uint8Array = await io.writeBinary(doc);
  if (bytes.byteLength >= before) {
    // JPEG was not smaller: keep the input bytes (copied when --out names another file).
    if (output !== input) {
      mkdirSync(dirname(output), { recursive: true });
      copyFileSync(input, output);
    }
    return { file: input, before, after: before, output, reencoded: candidates.length, written: false };
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes);
  return { file: input, before, after: bytes.byteLength, output, reencoded: candidates.length, written: true };
}

async function copyThrough(io: Loose, doc: Loose, output: string, input: string, before: number): Promise<SlimGlbResult> {
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, doc);
  return { file: input, before, after: statSync(output).size, output, reencoded: 0, written: true };
}
