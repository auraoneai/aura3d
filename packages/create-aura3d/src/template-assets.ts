// On-demand template assets (audit RH-14). create-aura3d@4.5.0 is 101.9 MB unpacked; 87 MB of it is 51 binary files
// (GLB, WAV) under templates/*/public. Those files are left out of the npm tarball and listed, with size and sha256, in
// template-assets.json. After a template is copied, any listed file that is missing is downloaded from the tagged
// source tree for this package version and written only if its size and sha256 match. In a source checkout every file
// is present, so nothing is fetched.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const TEMPLATE_ASSET_MANIFEST = "template-assets.json";
/** Files at or above this size, with a binary extension, are fetched on demand instead of shipped. */
export const TEMPLATE_ASSET_MIN_BYTES = 256 * 1024;
export const TEMPLATE_ASSET_EXTENSIONS = [".glb", ".gltf", ".bin", ".wav", ".ogg", ".mp3", ".ktx2", ".hdr"] as const;

export interface TemplateAssetEntry {
  /** Path inside the template, POSIX separators (e.g. "public/aura-assets/hero.glb"). */
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface TemplateAssetManifest {
  readonly schema: "create-aura3d/template-assets@1";
  /** template name -> entries */
  readonly templates: Readonly<Record<string, readonly TemplateAssetEntry[]>>;
}

/**
 * Where a file comes from: `<base>/<path inside the package>`. `{version}` in a base is replaced with the package
 * version. Tried in order; AURA3D_TEMPLATE_ASSET_BASE (one base, or several separated by spaces) replaces the defaults.
 */
export const DEFAULT_TEMPLATE_ASSET_BASES = [
  "https://raw.githubusercontent.com/auraoneai/aura3d/v{version}/packages/create-aura3d",
  "https://cdn.jsdelivr.net/gh/auraoneai/aura3d@v{version}/packages/create-aura3d"
] as const;

const toPosix = (p: string) => p.split(sep).join("/");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Build the manifest from a package root (`<root>/templates/<name>/...`). Pure filesystem, sorted, deterministic. */
export function buildTemplateAssetManifest(rootDir: string, templates: readonly string[], listFiles: (dir: string) => string[]): TemplateAssetManifest {
  const out: Record<string, TemplateAssetEntry[]> = {};
  for (const template of [...templates].sort()) {
    const dir = resolve(rootDir, "templates", template);
    const entries: TemplateAssetEntry[] = [];
    for (const file of listFiles(dir).sort()) {
      const rel = toPosix(relative(dir, file));
      if (rel.split("/").some((part) => part === "node_modules" || part === "dist" || part === "test-results")) continue;
      if (!TEMPLATE_ASSET_EXTENSIONS.some((ext) => rel.toLowerCase().endsWith(ext))) continue;
      const size = statSync(file).size;
      if (size < TEMPLATE_ASSET_MIN_BYTES) continue;
      entries.push({ path: rel, bytes: size, sha256: sha256(readFileSync(file)) });
    }
    if (entries.length) out[template] = entries;
  }
  return { schema: "create-aura3d/template-assets@1", templates: out };
}

export function readTemplateAssetManifest(rootDir: string): TemplateAssetManifest | null {
  const file = resolve(rootDir, TEMPLATE_ASSET_MANIFEST);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as TemplateAssetManifest;
  if (parsed.schema !== "create-aura3d/template-assets@1") throw new Error(`create-aura3d: unknown ${TEMPLATE_ASSET_MANIFEST} schema ${String(parsed.schema)}`);
  return parsed;
}

/** Manifest entries of `template` that are missing (or the wrong size) in `projectDir`. */
export function missingTemplateAssets(manifest: TemplateAssetManifest | null, template: string, projectDir: string): TemplateAssetEntry[] {
  const entries = manifest?.templates[template] ?? [];
  return entries.filter((entry) => {
    const file = join(projectDir, ...entry.path.split("/"));
    return !existsSync(file) || statSync(file).size !== entry.bytes;
  });
}

export interface FetchTemplateAssetsOptions {
  readonly projectDir: string;
  readonly template: string;
  readonly entries: readonly TemplateAssetEntry[];
  readonly version: string;
  readonly bases?: readonly string[];
  readonly fetch?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  readonly log?: (line: string) => void;
}
export interface FetchTemplateAssetsResult {
  readonly fetched: readonly { path: string; url: string; bytes: number }[];
  readonly failed: readonly { path: string; reasons: readonly string[] }[];
}

export function templateAssetBases(env: Record<string, string | undefined> = process.env): string[] {
  const override = env.AURA3D_TEMPLATE_ASSET_BASE?.trim();
  return override ? override.split(/\s+/) : [...DEFAULT_TEMPLATE_ASSET_BASES];
}

/** Download each entry, verify size and sha256, write it atomically. Never writes a file that fails verification. */
export async function fetchTemplateAssets(options: FetchTemplateAssetsOptions): Promise<FetchTemplateAssetsResult> {
  const doFetch = options.fetch ?? ((url: string) => fetch(url));
  const bases = (options.bases ?? templateAssetBases()).map((b) => b.replace(/\{version\}/g, options.version).replace(/\/+$/, ""));
  const fetched: { path: string; url: string; bytes: number }[] = [];
  const failed: { path: string; reasons: string[] }[] = [];
  for (const entry of options.entries) {
    if (entry.path.split("/").some((part) => part === ".." || part === "") || entry.path.startsWith("/")) {
      failed.push({ path: entry.path, reasons: ["unsafe path in manifest"] });
      continue;
    }
    const reasons: string[] = [];
    let done = false;
    for (const base of bases) {
      const url = `${base}/templates/${options.template}/${entry.path}`;
      try {
        const response = await doFetch(url);
        if (!response.ok) { reasons.push(`${url}: HTTP ${response.status}`); continue; }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== entry.bytes) { reasons.push(`${url}: ${bytes.byteLength} bytes, expected ${entry.bytes}`); continue; }
        const digest = sha256(bytes);
        if (digest !== entry.sha256) { reasons.push(`${url}: sha256 ${digest.slice(0, 12)}..., expected ${entry.sha256.slice(0, 12)}...`); continue; }
        const target = join(options.projectDir, ...entry.path.split("/"));
        mkdirSync(dirname(target), { recursive: true });
        const temp = `${target}.download`;
        writeFileSync(temp, bytes);
        renameSync(temp, target);
        fetched.push({ path: entry.path, url, bytes: bytes.byteLength });
        options.log?.(`fetched ${entry.path} (${(bytes.byteLength / 1048576).toFixed(1)} MB)`);
        done = true;
        break;
      } catch (error) {
        reasons.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!done) failed.push({ path: entry.path, reasons });
  }
  return { fetched, failed };
}
