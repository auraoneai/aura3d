import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AuraCliRenderedProbe } from "../asset-core-types.js";
import { resolveConfinedPath } from "./validation.js";

const THUMBNAIL_NAMES = ["thumbnail", "thumb", "preview", "render"];
const THUMBNAIL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const MAX_MESHY_THUMBNAIL_BYTES = 20 * 1024 * 1024;

export interface RetainedMeshyThumbnail {
  readonly sourceFile: string;
  readonly outputPath: string;
  readonly url: string;
  readonly sha256: string;
  readonly renderedProbe: AuraCliRenderedProbe;
}

export function findMeshyThumbnail(inputDir: string, requested: string | undefined): string | undefined {
  if (requested) return resolveConfinedPath(inputDir, requested, "thumbnail");
  const matches = readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && THUMBNAIL_EXTENSIONS.has(extname(entry.name).toLowerCase()) && THUMBNAIL_NAMES.includes(entry.name.replace(/\.[^.]+$/, "").toLowerCase()))
    .map((entry) => resolve(inputDir, entry.name));
  if (matches.length > 1) throw new Error("Meshy output contains multiple candidate thumbnails. Select exactly one with --thumbnail <relative-image>.");
  return matches[0];
}

export function retainMeshyThumbnail(options: {
  readonly projectDir: string;
  readonly inputDir: string;
  readonly requested?: string;
  readonly assetName: string;
  readonly outputDir: string;
  readonly publicPath: string;
}): RetainedMeshyThumbnail | undefined {
  const source = findMeshyThumbnail(options.inputDir, options.requested);
  if (!source) return undefined;
  const stat = statSync(source);
  const extension = extname(source).toLowerCase();
  if (!stat.isFile() || !THUMBNAIL_EXTENSIONS.has(extension)) throw new Error("Meshy thumbnail must be a PNG, JPEG, or WebP regular file.");
  if (stat.size === 0 || stat.size > MAX_MESHY_THUMBNAIL_BYTES) throw new Error("Meshy thumbnail must be non-empty and no larger than " + MAX_MESHY_THUMBNAIL_BYTES + " bytes.");
  const bytes = readFileSync(source);
  validateImageSignature(bytes, extension);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const fileName = options.assetName + ".meshy-candidate." + hash.slice(0, 8) + extension;
  const outputPath = join(options.outputDir, fileName).replaceAll("\\", "/");
  const destination = resolve(options.projectDir, outputPath);
  mkdirSync(resolve(options.projectDir, options.outputDir), { recursive: true });
  if (!existsSync(destination)) copyFileSync(source, destination);
  const url = options.publicPath.replace(/\/?$/, "/") + fileName;
  return {
    sourceFile: source,
    outputPath,
    url,
    sha256: "sha256-" + hash,
    renderedProbe: {
      url,
      kind: "manual-inspection",
      sha256: "sha256-" + hash,
      checkedAt: new Date().toISOString()
    }
  };
}

function validateImageSignature(bytes: Buffer, extension: string): void {
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const valid = extension === ".png" ? png : extension === ".webp" ? webp : jpeg;
  if (!valid) throw new Error("Meshy thumbnail content does not match its image extension.");
}
