import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const DIRECT_PROMPT_10_ASSET = "benchmark/assets/sneaker.glb";
const MODEL_PATH_PATTERN = /(?:https?:\/\/|(?:\.\.?\/|\/)?)[A-Za-z0-9_.~:/-]+\.(?:glb|gltf|obj|fbx|usdz|usd|dae)(?:[?#][^\s"'`)]+)?/gi;

export function auditPromptAssetPaths(options) {
  const promptFile = options.promptFile ?? "";
  const promptDir = options.promptDir;
  const sourceDir = options.sourceDir ?? (promptDir ? join(promptDir, "source") : undefined);
  const repoRoot = options.repoRoot ?? process.cwd();
  const library = options.library ?? options.metadata?.library ?? null;

  if (!promptFile.includes("10-product-viewer")) {
    const audit = {
      prompt: promptFile,
      skipped: true,
      reason: "asset path auditing applies only to prompt 10",
      invented: [],
      inventedUnique: [],
      inventedAssetPaths: 0,
      allowed: [],
      typedAuraEvidence: null,
      failures: []
    };
    writeAudit(promptDir, audit);
    return audit;
  }

  if (!sourceDir) {
    throw new Error("auditPromptAssetPaths requires sourceDir or promptDir");
  }

  const files = generatedSourceFiles(sourceDir);
  const fileTexts = files.map((file) => ({ file, rel: file.slice(sourceDir.length + 1), text: readFileSync(file, "utf8") }));
  const canonicalAsset = readCanonicalPromptAsset(repoRoot);
  const typedAuraEvidence = collectTypedAuraEvidence(sourceDir, fileTexts, canonicalAsset, library);
  const allowed = [];
  const invented = [];
  const failures = [];

  for (const entry of fileTexts) {
    for (const match of entry.text.matchAll(MODEL_PATH_PATTERN)) {
      const raw = match[0];
      const normalized = normalizeAssetPath(raw);
      const allowedReason = classifySourceAssetPath(normalized, entry.rel, typedAuraEvidence, canonicalAsset);
      const record = { kind: "source-reference", path: raw, normalized, file: entry.rel };
      if (allowedReason) {
        allowed.push({ ...record, reason: allowedReason });
      } else {
        invented.push(record);
      }
    }
  }

  for (const publicFile of publicGlbFiles(sourceDir)) {
    const normalized = normalizeAssetPath(publicFile.rel.replace(/^public\//, ""));
    const hash = sha256File(publicFile.file);
    const record = { kind: "public-file", path: publicFile.rel, normalized, file: publicFile.rel, sha256: `sha256-${hash}` };
    if (normalized === DIRECT_PROMPT_10_ASSET && hash === canonicalAsset?.hash) {
      allowed.push({ ...record, reason: "runner-copied prompt asset fixture" });
    } else if (
      isGeneratedSneakerAuraAsset(normalized) &&
      hash === canonicalAsset?.hash &&
      hasValidTypedAuraEvidence(normalized, typedAuraEvidence)
    ) {
      allowed.push({ ...record, reason: "typed Aura CLI generated output file" });
    } else {
      invented.push(record);
    }
  }

  if (!canonicalAsset) {
    failures.push(`canonical prompt asset missing: ${DIRECT_PROMPT_10_ASSET}`);
  }
  if (typedAuraEvidence.usesUnsafeModelUrl) {
    failures.push("unsafeModelUrl is not valid evidence for prompt 10 typed asset usage");
  }
  if (typedAuraEvidence.usesStringAssetId) {
    failures.push("model(\"sneaker\") is not valid typed Aura asset evidence");
  }
  if (invented.length > 0) {
    failures.push("invented or unevidenced GLB paths found");
  }
  const inventedUnique = uniqueNormalized(invented);

  const audit = {
    prompt: promptFile,
    skipped: false,
    invented: sortRecords(invented),
    inventedUnique,
    inventedAssetPaths: inventedUnique.length,
    allowed: sortRecords(allowed),
    typedAuraEvidence,
    failures
  };
  writeAudit(promptDir, audit);
  return audit;
}

function writeAudit(promptDir, audit) {
  if (promptDir) {
    writeFileSync(join(promptDir, "asset-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  }
}

function generatedSourceFiles(sourceDir) {
  return walkFiles(sourceDir, (file) => {
    const rel = file.slice(sourceDir.length + 1);
    if (rel.startsWith("node_modules/") || rel.startsWith("dist/") || rel.startsWith("public/")) return false;
    if (rel === "package.json" || rel === "tsconfig.json") return false;
    return /(^index\.html$|^vite\.config\.[cm]?[tj]s$|^src\/|\.css$|\.ts$|\.tsx$|\.js$|\.jsx$|\.html$)/.test(rel);
  }).sort();
}

function publicGlbFiles(sourceDir) {
  const publicDir = join(sourceDir, "public");
  return walkFiles(publicDir, (file) => /\.(glb|gltf|obj|fbx|usdz|usd|dae)$/i.test(file))
    .map((file) => ({ file, rel: `public/${file.slice(publicDir.length + 1)}` }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

function walkFiles(root, predicate, acc = []) {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const file = join(root, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(entry)) {
        walkFiles(file, predicate, acc);
      }
    } else if (predicate(file)) {
      acc.push(file);
    }
  }
  return acc;
}

function collectTypedAuraEvidence(sourceDir, fileTexts, canonicalAsset, library) {
  const auraAssetsPath = join(sourceDir, "src", "aura-assets.ts");
  const auraManifestPath = join(sourceDir, "aura.assets.json");
  const auraAssetsText = existsSync(auraAssetsPath) ? readFileSync(auraAssetsPath, "utf8") : "";
  const manifest = readAuraAssetManifest(auraManifestPath);
  const manifestSneaker = Array.isArray(manifest?.assets)
    ? manifest.assets.find((asset) => asset && asset.id === "sneaker")
    : null;
  const appTexts = fileTexts.filter((entry) => entry.rel !== "src/aura-assets.ts");
  const appSourceText = appTexts.map((entry) => entry.text).join("\n");
  const sneakerUrl = readSneakerUrl(auraAssetsText);
  const normalizedSneakerUrl = sneakerUrl ? normalizeAssetPath(sneakerUrl) : null;
  const manifestSourcePath = typeof manifestSneaker?.source === "string" ? join(sourceDir, manifestSneaker.source) : null;
  const manifestOutputPath = typeof manifestSneaker?.outputPath === "string" ? join(sourceDir, manifestSneaker.outputPath) : null;
  const manifestSourceHash = manifestSourcePath && existsSync(manifestSourcePath) ? sha256File(manifestSourcePath) : null;
  const manifestOutputHash = manifestOutputPath && existsSync(manifestOutputPath) ? sha256File(manifestOutputPath) : null;
  const expectedHash = canonicalAsset?.hash ? `sha256-${canonicalAsset.hash}` : null;
  const expectedPrefix = canonicalAsset?.hash?.slice(0, 8) ?? null;
  const expectedUrl = expectedPrefix ? `/aura-assets/sneaker.${expectedPrefix}.glb` : null;
  const expectedOutputPath = expectedPrefix ? `public/aura-assets/sneaker.${expectedPrefix}.glb` : null;

  return {
    library,
    canonicalPromptAssetHash: canonicalAsset?.hash ? `sha256-${canonicalAsset.hash}` : null,
    hasAuraAssetsModule: Boolean(auraAssetsText),
    auraAssetsUsesDefineAuraAssets: /\bdefineAuraAssets\s*\(/.test(auraAssetsText),
    auraAssetsContainsManifestHash: Boolean(expectedHash && auraAssetsText.includes(expectedHash)),
    auraAssetsContainsManifestUrl: Boolean(sneakerUrl && auraAssetsText.includes(sneakerUrl)),
    hasAuraAssetManifest: Boolean(manifest),
    manifestSchema: typeof manifest?.schema === "string" ? manifest.schema : null,
    manifestTypegen: typeof manifest?.typegen === "string" ? manifest.typegen : null,
    manifestAssetBasePath: typeof manifest?.assetBasePath === "string" ? manifest.assetBasePath : null,
    manifestOutputDir: typeof manifest?.outputDir === "string" ? manifest.outputDir : null,
    manifestHasSneakerEntry: Boolean(manifestSneaker),
    manifestSneakerUrl: typeof manifestSneaker?.url === "string" ? manifestSneaker.url : null,
    manifestSneakerHash: typeof manifestSneaker?.hash === "string" ? manifestSneaker.hash : null,
    manifestSneakerOutputPath: typeof manifestSneaker?.outputPath === "string" ? manifestSneaker.outputPath : null,
    manifestSneakerSource: typeof manifestSneaker?.source === "string" ? manifestSneaker.source : null,
    manifestSourceHash: manifestSourceHash ? `sha256-${manifestSourceHash}` : null,
    manifestOutputHash: manifestOutputHash ? `sha256-${manifestOutputHash}` : null,
    manifestMatchesCanonicalAsset: Boolean(
      manifest?.schema === "aura3d.assets/1.0" &&
        manifest.typegen === "src/aura-assets.ts" &&
        manifest.assetBasePath === "/aura-assets/" &&
        manifest.outputDir === "public/aura-assets" &&
        manifestSneaker &&
        manifestSneaker.type === "model" &&
        manifestSneaker.format === "glb" &&
        manifestSneaker.url === expectedUrl &&
        manifestSneaker.outputPath === expectedOutputPath &&
        expectedHash &&
        manifestSneaker.hash === expectedHash &&
        manifestSourceHash === canonicalAsset?.hash &&
        manifestOutputHash === canonicalAsset?.hash
    ),
    hasSneakerEntry: /["']?sneaker["']?\s*:/.test(auraAssetsText),
    sneakerUrl,
    normalizedSneakerUrl,
    sneakerUrlIsAllowedPromptAsset:
      normalizedSneakerUrl === DIRECT_PROMPT_10_ASSET || isGeneratedSneakerAuraAsset(normalizedSneakerUrl),
    importsGeneratedAssets: appTexts.some((entry) =>
      /import\s*\{[^}]*\bassets\b[^}]*\}\s*from\s*["']\.\/aura-assets(?:\.[cm]?[tj]s)?["']/.test(entry.text)
    ),
    usesTypedSneakerAsset: /\bassets\s*\.\s*sneaker\b|\bassets\s*\[\s*["']sneaker["']\s*\]/.test(appSourceText),
    usesStringAssetId: /\bmodel\s*\(\s*["'][^"']+["']\s*\)/.test(appSourceText),
    usesUnsafeModelUrl: /\bunsafeModelUrl\s*\(/.test(appSourceText)
  };
}

function readSneakerUrl(auraAssetsText) {
  const sneakerBlock = auraAssetsText.match(/["']?sneaker["']?\s*:\s*\{[\s\S]*?\}/);
  if (!sneakerBlock) return null;
  const url = sneakerBlock[0].match(/\burl\s*:\s*["']([^"']+\.glb)["']/);
  return url ? url[1] : null;
}

function classifySourceAssetPath(normalized, rel, typedAuraEvidence, canonicalAsset) {
  if (normalized === DIRECT_PROMPT_10_ASSET && canonicalAsset) return "provided prompt asset";
  if (isGeneratedSneakerAuraAsset(normalized) && rel !== "src/aura-assets.ts") return null;
  if (isGeneratedSneakerAuraAsset(normalized) && hasValidTypedAuraEvidence(normalized, typedAuraEvidence)) {
    return "typed Aura CLI generated sneaker asset";
  }
  return null;
}

function hasValidTypedAuraEvidence(normalized, typedAuraEvidence) {
  return Boolean(
    typedAuraEvidence.library === "Aura3D" &&
    typedAuraEvidence.hasAuraAssetsModule &&
      typedAuraEvidence.auraAssetsUsesDefineAuraAssets &&
      typedAuraEvidence.auraAssetsContainsManifestHash &&
      typedAuraEvidence.auraAssetsContainsManifestUrl &&
      typedAuraEvidence.hasAuraAssetManifest &&
      typedAuraEvidence.manifestMatchesCanonicalAsset &&
      typedAuraEvidence.manifestSneakerUrl &&
      normalizeAssetPath(typedAuraEvidence.manifestSneakerUrl) === normalized &&
      typedAuraEvidence.manifestSneakerHash &&
      typedAuraEvidence.hasSneakerEntry &&
      typedAuraEvidence.normalizedSneakerUrl === normalized &&
      typedAuraEvidence.sneakerUrlIsAllowedPromptAsset &&
      typedAuraEvidence.sneakerUrl === typedAuraEvidence.manifestSneakerUrl &&
      typedAuraEvidence.importsGeneratedAssets &&
      typedAuraEvidence.usesTypedSneakerAsset &&
      !typedAuraEvidence.usesStringAssetId &&
      !typedAuraEvidence.usesUnsafeModelUrl
  );
}

function isGeneratedSneakerAuraAsset(normalized) {
  return /^aura-assets\/sneaker\.[a-f0-9]{8,}\.glb$/i.test(normalized ?? "");
}

function normalizeAssetPath(path) {
  return path.replace(/[?#].*$/, "").replace(/^(\.\/|\.\.\/|\/)+/, "");
}

function sortRecords(records) {
  return [...records].sort((a, b) => `${a.normalized}:${a.file}`.localeCompare(`${b.normalized}:${b.file}`));
}

function uniqueNormalized(records) {
  return Array.from(new Set(records.map((record) => record.normalized))).sort();
}

function readAuraAssetManifest(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readCanonicalPromptAsset(repoRoot) {
  const path = join(repoRoot, DIRECT_PROMPT_10_ASSET);
  if (!existsSync(path)) return null;
  return { path: DIRECT_PROMPT_10_ASSET, hash: sha256File(path) };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
