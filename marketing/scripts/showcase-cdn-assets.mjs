import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export function removeLocalAuraAssets(distDir) {
  rmSync(path.join(distDir, "aura-assets"), { force: true, recursive: true });
}

export function rewriteBuiltAuraAssetUrls(distDir, assetBaseUrl) {
  const normalizedAssetBaseUrl = assetBaseUrl.replace(/\/+$/, "");
  if (!normalizedAssetBaseUrl) {
    throw new Error("A non-empty showcase asset base URL is required before rewriting asset URLs.");
  }

  let rewrittenFiles = 0;
  const rewrittenFilePaths = [];
  for (const file of collectBuiltFiles(distDir)) {
    const originalContent = readFileSync(file, "utf8");
    const rewrittenContent = originalContent.replace(
      /(["'(\s])\/aura-assets\//g,
      `$1${normalizedAssetBaseUrl}/`,
    );
    if (rewrittenContent === originalContent) continue;
    writeFileSync(file, rewrittenContent, "utf8");
    rewrittenFiles += 1;
    rewrittenFilePaths.push(file);
  }

  const renamedBundles = assignCdnCacheBustedBundleNames(distDir, rewrittenFilePaths);
  console.log(`Rewrote Aura asset URLs in ${rewrittenFiles} built website files to ${normalizedAssetBaseUrl}/.`);
  if (renamedBundles > 0) {
    console.log(`Renamed ${renamedBundles} rewritten JavaScript bundles so immutable Vercel edges cannot reuse stale local-asset content.`);
  }
}

function assignCdnCacheBustedBundleNames(distDir, rewrittenFilePaths) {
  const assetsDir = path.join(distDir, "assets");
  const renamedBundles = new Map();

  for (const file of rewrittenFilePaths) {
    if (!file.startsWith(`${assetsDir}${path.sep}`) || !file.endsWith(".js")) continue;
    const parsed = path.parse(file);
    if (parsed.name.includes("-cdn-")) continue;

    const content = readFileSync(file, "utf8");
    const digest = createHash("sha256").update(content).digest("hex").slice(0, 8);
    const renamedFile = path.join(parsed.dir, `${parsed.name}-cdn-${digest}${parsed.ext}`);
    renameSync(file, renamedFile);
    renamedBundles.set(path.basename(file), path.basename(renamedFile));
  }

  if (renamedBundles.size === 0) return 0;

  for (const file of collectBuiltFiles(distDir)) {
    const originalContent = readFileSync(file, "utf8");
    let rewrittenContent = originalContent;
    for (const [oldName, newName] of renamedBundles) {
      rewrittenContent = rewrittenContent.replaceAll(oldName, newName);
    }
    if (rewrittenContent !== originalContent) {
      writeFileSync(file, rewrittenContent, "utf8");
    }
  }

  return renamedBundles.size;
}

function collectBuiltFiles(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectBuiltFiles(entryPath));
    } else if (entry.isFile() && /\.(?:html|js|mjs|css|json|map)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}
