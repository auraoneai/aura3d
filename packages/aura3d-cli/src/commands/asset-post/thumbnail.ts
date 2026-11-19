/**
 * `aura3d assets thumbnail [--asset id] [--size 256]` — real PNG thumbnails for admitted model assets, drawn by the CPU
 * preview renderer (one three-quarter view, no label). Replaces the old SVG-card writer: nothing is invented for
 * assets the renderer cannot draw; they are reported as skipped and keep their current thumbnailUrl.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_AURA_ASSET_MANIFEST } from "../../asset-constants.js";
import type { AssetCliResult, AuraCliAssetEntry } from "../../asset-core-types.js";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../../asset-manifest.js";
import { loadGltfToolkit, type GltfToolkit } from "../assets/gltfToolkit.js";
import { PREVIEW_KIND, renderPreviewPng, type PreviewView } from "./preview.js";

export interface CreateAssetThumbnailsOptions {
  readonly projectDir?: string;
  /** Only these asset ids (default: every model asset in the manifest). */
  readonly assetIds?: readonly string[];
  /** Square thumbnail size in pixels (default 256). */
  readonly size?: number;
  readonly view?: PreviewView;
  readonly toolkit?: GltfToolkit;
}

export interface AssetThumbnailRecord {
  readonly id: string;
  readonly thumbnailUrl: string;
  readonly path: string;
  readonly bytes: number;
  readonly triangles: number;
}

export interface AssetThumbnailsResult extends AssetCliResult {
  readonly kind: typeof PREVIEW_KIND;
  readonly thumbnails: readonly AssetThumbnailRecord[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
  readonly failures: readonly string[];
}

export function thumbnailUsage(): string {
  return [
    "aura3d assets thumbnail [--asset id[,id...]] [--size 256] [--json]",
    "  Writes <outputDir>/<id>.thumb.png for each glTF/GLB model asset (CPU base-colour preview, three-quarter view, not a",
    "  render) and each PNG/JPEG/WebP texture (downscaled), and points the manifest thumbnailUrl at it. Other assets",
    "  (audio, HDR, volumes, non-glTF models) are skipped; no thumbnail is made up. assets add runs this automatically."
  ].join("\n");
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Render PNG thumbnails for the manifest's model assets and point their thumbnailUrl at them. */
export async function createAssetThumbnails(options: CreateAssetThumbnailsOptions = {}): Promise<AssetThumbnailsResult> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  if (!existsSync(manifestPath)) throw new Error(`No ${DEFAULT_AURA_ASSET_MANIFEST} in ${projectDir}. Admit a model first: aura3d assets add <file.glb> --name <key>`);
  const manifest = readAssetManifest(projectDir);
  const wanted = options.assetIds && options.assetIds.length > 0 ? new Set(options.assetIds) : undefined;
  if (wanted) {
    const missing = [...wanted].filter((id) => !manifest.assets.some((asset) => asset.id === id));
    if (missing.length > 0) throw new Error(`Unknown asset id(s): ${missing.join(", ")}. List ids with: aura3d assets list`);
  }
  const size = options.size ?? 256;
  const toolkit = options.toolkit ?? loadGltfToolkit(projectDir);
  const thumbnails: AssetThumbnailRecord[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const failures: string[] = [];
  const updated = new Map<string, string>();

  for (const asset of manifest.assets) {
    if (wanted && !wanted.has(asset.id)) continue;
    const reason = skipReason(asset);
    if (reason) {
      skipped.push({ id: asset.id, reason });
      continue;
    }
    const source = resolve(projectDir, asset.outputPath);
    if (!existsSync(source)) {
      failures.push(`${asset.id}: model file is missing on disk (${asset.outputPath}).`);
      continue;
    }
    try {
      const preview = asset.type === "texture"
        ? await rasterTexturePng(toolkit, source, size)
        : await renderPreviewPng(source, { views: [options.view ?? "three-quarter"], size, label: false, toolkit });
      const fileName = `${asset.id}.thumb.png`;
      const path = resolve(projectDir, manifest.outputDir, fileName);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, preview.png);
      const thumbnailUrl = `${manifest.assetBasePath}${fileName}`;
      // The admission-time SVG card (<id>.thumb.svg) is ours; remove it so it is not shipped or mistaken for the thumbnail.
      if (asset.thumbnailUrl === `${manifest.assetBasePath}${asset.id}.thumb.svg`) rmSync(resolve(projectDir, manifest.outputDir, `${asset.id}.thumb.svg`), { force: true });
      updated.set(asset.id, thumbnailUrl);
      thumbnails.push({ id: asset.id, thumbnailUrl, path, bytes: preview.png.length, triangles: preview.triangles });
    } catch (error) {
      failures.push(`${asset.id}: ${(error as Error).message}`);
    }
  }

  const next = updated.size > 0
    ? { ...manifest, assets: manifest.assets.map((asset) => (updated.has(asset.id) ? { ...asset, thumbnailUrl: updated.get(asset.id)! } : asset)) }
    : manifest;
  if (updated.size > 0) {
    writeAssetManifest(projectDir, next);
    writeTypedAssets(projectDir, next);
  }
  return {
    ok: failures.length === 0,
    kind: PREVIEW_KIND,
    manifestPath,
    manifest: next,
    thumbnails,
    skipped,
    failures,
    messages: [
      `Wrote ${thumbnails.length} PNG thumbnail(s) (CPU base-colour previews, not renders).`,
      ...(skipped.length > 0 ? [`Skipped ${skipped.length}: ${skipped.map((item) => `${item.id} (${item.reason})`).join("; ")}`] : []),
      ...failures
    ]
  };
}

/** Raster texture formats the thumbnail downscales directly (sharp); other textures (HDR, KTX2, PVR...) are skipped. */
export const RASTER_TEXTURE_FORMATS: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "webp"]);

/** Whether `assets thumbnail` (and `assets add`) can draw a real PNG for this asset. */
export function canThumbnailAsset(asset: Pick<AuraCliAssetEntry, "id" | "type" | "format">): boolean {
  return skipReason(asset) === undefined;
}

async function rasterTexturePng(toolkit: GltfToolkit, source: string, size: number): Promise<{ png: Buffer; triangles: number }> {
  const png: Buffer = await toolkit.sharp(source).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return { png, triangles: 0 };
}

function skipReason(asset: Pick<AuraCliAssetEntry, "id" | "type" | "format">): string | undefined {
  if (asset.type === "texture") {
    if (!RASTER_TEXTURE_FORMATS.has(String(asset.format).toLowerCase())) return `${asset.format} texture (no raster preview)`;
    if (!SAFE_ID.test(asset.id)) return "id is not a safe file name";
    return undefined;
  }
  if (asset.type !== "model") return `${asset.type} asset`;
  if (asset.format !== "glb" && asset.format !== "gltf") return `${asset.format} model (convert to GLB first)`;
  if (!SAFE_ID.test(asset.id)) return "id is not a safe file name";
  return undefined;
}
