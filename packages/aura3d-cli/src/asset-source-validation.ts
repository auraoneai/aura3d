import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  DEFAULT_AURA_ASSET_MANIFEST,
  DEFAULT_AURA_ASSET_TYPEGEN,
} from "./asset-constants.js";
import { scanAssetSourceAst } from "./asset-source-ast.js";
import type {
  AssetSourceTypedAssetUsage,
  AssetSourceValidationReport,
  AssetValidationOptions,
  AuraCliAssetManifest,
} from "./index.js";

export function shouldScanSource(options: AssetValidationOptions): boolean {
  return options.source !== undefined || options.release === true;
}

export function validateAssetSource(
  projectDir: string,
  sourceOption: AssetValidationOptions["source"],
  manifest: AuraCliAssetManifest,
): AssetSourceValidationReport {
  const roots = resolveSourceValidationRoots(projectDir, sourceOption);
  const files = roots.flatMap((root) => collectSourceValidationFiles(projectDir, root));
  const failures: string[] = [];
  const warnings: string[] = [];
  const usageCounts = new Map<string, AssetSourceTypedAssetUsage>();
  const assetIds = new Set(manifest.assets.map((asset) => asset.id));
  for (const file of files) {
    const relativeFile = normalizeRelativePath(relative(projectDir, file));
    const source = readFileSync(file, "utf8");
    const scanText = stripSourceComments(source);
    const pushFailure = (message: string): void => {
      pushUnique(failures, `${relativeFile}: ${message}`);
    };
    const pushWarning = (message: string): void => {
      pushUnique(warnings, `${relativeFile}: ${message}`);
    };

    const astScan = scanAssetSourceAst(relativeFile, source);
    for (const failure of astScan.failures) pushFailure(failure);
    for (const warning of astScan.warnings) pushWarning(warning);

    for (const match of scanText.matchAll(/\bmodel\s*\(\s*(["'`])([^"'`]*?)\1/g)) {
      pushFailure(`raw model string id "${match[2]}" passed to model(). Use generated typed assets, for example model(assets.${sanitizeAssetId(match[2] ?? "asset")}).`);
    }

    for (const url of findRawGlbUrls(scanText)) {
      pushFailure(`raw GLB/glTF URL or path "${url}" found in source. Add it with assets add/resolve and use model(assets.x).`);
    }

    if (/\bunsafeModelUrl\b/.test(scanText)) {
      pushFailure("unsafeModelUrl is not allowed in public examples. Preserve typed asset safety with generated assets from ./src/aura-assets.");
    }
    if (/\bGLTFLoader\b/.test(scanText)) {
      pushFailure("GLTFLoader is not allowed in public examples. Use model(assets.x) from @aura3d/engine.");
    }
    if (/(?:from\s*["']three(?:\/examples[^"']*)?["']|import\s*["']three(?:\/examples[^"']*)?["']|require\s*\(\s*["']three(?:\/examples[^"']*)?["']\s*\))/.test(scanText)) {
      pushFailure("direct three imports are not allowed in public examples. Use @aura3d/engine public APIs.");
    }
    if (hasPrimitiveOnlyPrimaryRoleIndicator(scanText)) {
      pushWarning("primary-role scene appears primitive-only: source mentions character/world/vehicle/product/environment roles and uses primitives.* without typed model(assets.x).");
    }
    for (const warning of findPrimitivePrimaryRoleWarnings(scanText)) {
      pushWarning(warning);
    }
    for (const usage of astScan.typedAssetUsages) {
      const key = `${usage.assetId}\0${usage.typedAsset}\0${relativeFile}`;
      const current = usageCounts.get(key);
      usageCounts.set(key, {
        ...usage,
        file: relativeFile,
        occurrences: (current?.occurrences ?? 0) + 1,
      });
    }
  }
  const typedAssetUsages = [...usageCounts.values()].sort((a, b) =>
    a.assetId.localeCompare(b.assetId) ||
    a.file.localeCompare(b.file) ||
    a.typedAsset.localeCompare(b.typedAsset)
  );
  const filesByAsset = typedAssetUsages.reduce<Record<string, string[]>>((acc, usage) => {
    acc[usage.assetId] ??= [];
    if (!acc[usage.assetId].includes(usage.file)) acc[usage.assetId].push(usage.file);
    return acc;
  }, {});
  for (const filesForAsset of Object.values(filesByAsset)) {
    filesForAsset.sort((a, b) => a.localeCompare(b));
  }
  for (const usage of typedAssetUsages) {
    if (!assetIds.has(usage.assetId)) {
      failures.push(`${usage.file}: typed asset ${usage.typedAsset} is not present in ${DEFAULT_AURA_ASSET_MANIFEST}. Add it with aura3d assets add/resolve and regenerate ${DEFAULT_AURA_ASSET_TYPEGEN}.`);
    }
  }
  return {
    enabled: true,
    roots: roots.map((root) => normalizeRelativePath(relative(projectDir, root))),
    files: files.map((file) => normalizeRelativePath(relative(projectDir, file))),
    typedAssetUsages,
    filesByAsset,
    failures,
    warnings,
  };
}

function resolveSourceValidationRoots(projectDir: string, sourceOption: AssetValidationOptions["source"]): readonly string[] {
  if (typeof sourceOption === "string" && sourceOption.trim()) {
    return [resolve(projectDir, sourceOption)];
  }
  const defaultRoots = ["src", "app", "apps", "examples", "templates"]
    .map((entry) => resolve(projectDir, entry))
    .filter((entry) => existsSync(entry));
  return defaultRoots.length > 0 ? defaultRoots : [projectDir];
}

function collectSourceValidationFiles(projectDir: string, root: string): readonly string[] {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return isSourceValidationFile(projectDir, root) ? [root] : [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (isSkippedSourceValidationDirectory(entry.name)) continue;
        visit(path);
      } else if (entry.isFile() && isSourceValidationFile(projectDir, path)) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function isSkippedSourceValidationDirectory(name: string): boolean {
  return [
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".git",
    ".next",
    ".vite",
    "public",
    "assets",
    "artifacts",
  ].includes(name);
}

function isSourceValidationFile(projectDir: string, path: string): boolean {
  const relativePath = normalizeRelativePath(relative(projectDir, path));
  if (/(^|\/)aura-assets\.ts$/.test(relativePath)) return false;
  if (/(^|\/)(?:dist|build|coverage|node_modules|public|assets|artifacts)\//.test(relativePath)) return false;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}

function stripSourceComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findRawGlbUrls(source: string): readonly string[] {
  const matches = new Set<string>();
  for (const match of source.matchAll(/(["'`])([^"'`]*?(?:https?:\/\/|\/)[^"'`]*?\.gl(?:b|tf)(?:\?[^"'`]*)?)\1/gi)) {
    matches.add(match[2] ?? "");
  }
  for (const match of source.matchAll(/(["'`])([^"'`]*?\.gl(?:b|tf)(?:\?[^"'`]*)?)\1/gi)) {
    const value = match[2] ?? "";
    if (/^(?:\.{0,2}\/|https?:\/\/|\/|[a-z]:[\\/])/i.test(value)) matches.add(value);
  }
  return [...matches].filter(Boolean).sort();
}

function hasPrimitiveOnlyPrimaryRoleIndicator(source: string): boolean {
  if (!/\bprimitives\.[a-zA-Z_][\w]*/.test(source)) return false;
  if (/\bmodel\s*\(/.test(source) || /\bassets\.[a-zA-Z_][\w]*/.test(source)) return false;
  if (hasProceduralGamePrimitiveContract(source)) return false;
  const searchable = source
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return /\b(character|fighter|player|avatar|vehicle|car|kart|ship|world|level|stage|environment|terrain|hero\s+product|product|creature|weapon|primary)\b/i.test(searchable);
}

function hasProceduralGamePrimitiveContract(source: string): boolean {
  return /\bgame\.fallingBlocks\s*\(/.test(source) &&
    /\bprocedural(?:\s+Aura3D)?\s+falling-block\b/i.test(source);
}

function findPrimitivePrimaryRoleWarnings(source: string): readonly string[] {
  if (!/\bprimitives\.[a-zA-Z_][\w]*/.test(source)) return [];
  const warnings = new Set<string>();
  const primaryIdentifier = /\b(?:character|fighter|player|avatar|vehicle|car|kart|ship|world|level|stage|environment|terrain|hero|product|creature|weapon|track)\b/i;
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*primitives\.[a-zA-Z_][\w]*/g)) {
    const name = match[1] ?? "";
    const readable = name
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ");
    if (primaryIdentifier.test(readable)) {
      warnings.add(`primitive "${name}" appears assigned to a primary-role object. Primary characters, vehicles, worlds, tracks, products, and weapons must use typed model(assets.x) assets or be marked abstract/prototype.`);
    }
  }
  return [...warnings].sort();
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

function sanitizeAssetId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}
