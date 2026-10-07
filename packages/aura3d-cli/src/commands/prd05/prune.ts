import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { readAssetManifest } from "../../asset-manifest.js";
import type { AuraCliAssetEntry, AuraCliAssetManifest } from "../../asset-core-types.js";

/**
 * PRD-05 Phase 6 — `assets prune`: removes files under the manifest
 * `outputDir` (default `public/aura-assets`) that no manifest entry
 * references via `outputPath`/`derived.*` URLs. `--dry-run` (the default)
 * only reports; `--apply` deletes.
 */

export interface AssetPruneRow {
  readonly path: string;
  readonly bytes: number;
  readonly lfsPointer: boolean;
}

export interface AssetPruneResult {
  readonly ok: boolean;
  readonly applied: boolean;
  readonly removed: readonly AssetPruneRow[];
  readonly bytesFreed: number;
  readonly referencedCount: number;
  readonly scannedCount: number;
  readonly outputDir: string;
}

export function assetsPrune(options: {
  readonly projectDir?: string;
  readonly apply?: boolean;
  readonly stdout?: (line: string) => void;
} = {}): AssetPruneResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const outputDir = resolve(projectDir, manifest.outputDir);

  const referenced = collectReferencedPaths(projectDir, manifest);
  const rows: AssetPruneRow[] = [];
  let scanned = 0;
  for (const file of walkFiles(outputDir)) {
    scanned++;
    const relativePath = relativeKey(projectDir, file);
    if (referenced.has(relativePath)) continue;
    const stat = statSync(file);
    rows.push({ path: relativePath, bytes: stat.size, lfsPointer: isLfsPointer(file, stat.size) });
  }

  rows.sort((a, b) => a.path.localeCompare(b.path));
  if (options.apply) {
    for (const row of rows) unlinkSync(resolve(projectDir, row.path));
  }
  const result: AssetPruneResult = {
    ok: true,
    applied: options.apply === true,
    removed: rows,
    bytesFreed: rows.reduce((total, row) => total + row.bytes, 0),
    referencedCount: referenced.size,
    scannedCount: scanned,
    outputDir: manifest.outputDir,
  };
  options.stdout?.(
    `${result.applied ? "Removed" : "Would remove"} ${rows.length} file(s) (${formatBytes(result.bytesFreed)}) ` +
    `from ${manifest.outputDir}; ${scanned} scanned, ${referenced.size} manifest-referenced.` +
    (result.applied ? "" : " Re-run with --apply to delete."),
  );
  const lfs = rows.filter((row) => row.lfsPointer);
  if (lfs.length > 0) {
    options.stdout?.(`${lfs.length} removed entr${lfs.length === 1 ? "y was" : "ies were"} LFS pointer files; git will stage the deletions.`);
  }
  return result;
}

/** Every project-relative path a manifest entry may still serve. */
function collectReferencedPaths(projectDir: string, manifest: AuraCliAssetManifest): Set<string> {
  const referenced = new Set<string>();
  const push = (value: string | undefined): void => {
    if (!value) return;
    const normalized = value.startsWith("/")
      ? join("public", value)                                   // url → public/<url>
      : value;
    referenced.add(relativeKey(projectDir, resolve(projectDir, normalized)));
  };
  const pushEntry = (asset: AuraCliAssetEntry): void => {
    push(asset.outputPath);
    push(asset.url);                                            // covers served path when outputPath unset
    push(asset.thumbnailUrl);
    const derived = asset.derived;
    if (!derived) return;
    push(derived.outputPath);
    push(derived.url);
    push(derived.mobileUrl);
    push(derived.collisionUrl);
  };
  for (const asset of manifest.assets) pushEntry(asset);
  return referenced;
}

function* walkFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) yield path;
    }
  }
}

function relativeKey(projectDir: string, path: string): string {
  return path.slice(projectDir.length + (projectDir.endsWith(sep) ? 0 : 1)).split(sep).join("/");
}

function isLfsPointer(path: string, size: number): boolean {
  if (size > 1024) return false;
  try {
    return readFileSync(path, "utf8").startsWith("version https://git-lfs.github.com/spec/v1");
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
