import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT_IMPORT = "@aura3d/engine";
const NON_PUBLIC_SUBPATH_PREFIX = `${ROOT_IMPORT}/`;
const PUBLIC_AURA_SUBPATH_IMPORTS = new Map([
  [`${ROOT_IMPORT}/scene-kits/particle-fountain`, new Set(["createAuraApp", "particleFountain", "sceneKits", "ui"])],
  [`${ROOT_IMPORT}/scene-kits/humanoid-walk`, new Set(["character", "createAuraApp", "humanoidWalk", "sceneKits"])],
  [`${ROOT_IMPORT}/scene-kits/product-viewer`, new Set(["createAuraApp", "defineAuraAssets", "product", "productViewer", "sceneKits"])]
]);
const PROMPT_10_ASSET_PATTERN = /(?:https?:\/\/|(?:\.\.?\/|\/)?)[A-Za-z0-9_.~:/-]+\.(?:glb|gltf|obj|fbx|usdz|usd|dae)(?:[?#][^\s"'`)]+)?/gi;

export function auditPromptSource(options) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const promptDir = options.promptDir ? resolve(options.promptDir) : null;
  const sourceDir = resolve(options.sourceDir ?? (promptDir ? join(promptDir, "source") : ""));
  if (!sourceDir) throw new Error("auditPromptSource requires sourceDir or promptDir");

  const promptFile = options.promptFile ?? "";
  const library = options.library ?? options.metadata?.library ?? null;
  const publicRootExports = new Set(options.publicRootExports ?? readPublicRootExports(repoRoot));
  const files = generatedSourceFiles(sourceDir);
  const fileTexts = files.map((file) => ({
    file,
    rel: relative(sourceDir, file).replaceAll("\\", "/"),
    text: readFileSync(file, "utf8")
  }));

  const unavailablePublicImports = [];
  const nonPublicSubpathImports = [];
  const unsafeAssetReferences = [];

  for (const entry of fileTexts) {
    for (const importRecord of collectModuleSpecifiers(entry.text)) {
      if (importRecord.specifier === ROOT_IMPORT) {
        for (const symbol of collectNamedImportSymbols(importRecord.clause)) {
          if (!publicRootExports.has(symbol.name)) {
            unavailablePublicImports.push({
              symbol: symbol.name,
              importedAs: symbol.importedAs,
              file: entry.rel,
              line: lineForOffset(entry.text, importRecord.offset),
              specifier: importRecord.specifier,
              reason: `not exported by public ${ROOT_IMPORT} root API`
            });
          }
        }
        if (hasDefaultImport(importRecord.clause)) {
          unavailablePublicImports.push({
            symbol: "default",
            importedAs: "default",
            file: entry.rel,
            line: lineForOffset(entry.text, importRecord.offset),
            specifier: importRecord.specifier,
            reason: `${ROOT_IMPORT} has no public default export for agent-authored sources`
          });
        }
      } else if (importRecord.specifier.startsWith(NON_PUBLIC_SUBPATH_PREFIX)) {
        const publicSubpathExports = PUBLIC_AURA_SUBPATH_IMPORTS.get(importRecord.specifier);
        if (publicSubpathExports) {
          for (const symbol of collectNamedImportSymbols(importRecord.clause)) {
            if (!publicSubpathExports.has(symbol.name)) {
              unavailablePublicImports.push({
                symbol: symbol.name,
                importedAs: symbol.importedAs,
                file: entry.rel,
                line: lineForOffset(entry.text, importRecord.offset),
                specifier: importRecord.specifier,
                reason: `not exported by public ${importRecord.specifier} API`
              });
            }
          }
          if (hasDefaultImport(importRecord.clause)) {
            unavailablePublicImports.push({
              symbol: "default",
              importedAs: "default",
              file: entry.rel,
              line: lineForOffset(entry.text, importRecord.offset),
              specifier: importRecord.specifier,
              reason: `${importRecord.specifier} has no public default export for agent-authored sources`
            });
          }
        } else {
          nonPublicSubpathImports.push({
            specifier: importRecord.specifier,
            file: entry.rel,
            line: lineForOffset(entry.text, importRecord.offset),
            reason: "agent-authored Aura benchmark sources must import the public root @aura3d/engine API or an explicitly public lean Aura subpath"
          });
        }
      }
    }

    if (isPrompt10(promptFile, sourceDir)) {
      unsafeAssetReferences.push(...collectPrompt10UnsafeAssetReferences(entry, { library }));
    }
  }

  const failures = [
    ...unavailablePublicImports.map((entry) => `unavailable public import ${entry.symbol} in ${entry.file}:${entry.line}`),
    ...nonPublicSubpathImports.map((entry) => `non-public Aura subpath import ${entry.specifier} in ${entry.file}:${entry.line}`),
    ...unsafeAssetReferences.map((entry) => `${entry.kind} in ${entry.file}:${entry.line}`)
  ];

  const audit = {
    schema: "a3d-prompt-source-audit",
    generatedAt: new Date().toISOString(),
    prompt: promptFile,
    sourceDir,
    pass: failures.length === 0,
    files: fileTexts.map((entry) => entry.rel),
    unavailablePublicImports: sortByLocation(unavailablePublicImports),
    nonPublicSubpathImports: sortByLocation(nonPublicSubpathImports),
    unsafeAssetReferences: sortByLocation(unsafeAssetReferences),
    failures
  };

  if (options.writeReport !== false && promptDir) {
    writeFileSync(join(promptDir, "source-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  }

  return audit;
}

export function readPublicRootExports(repoRoot = process.cwd()) {
  const root = resolve(repoRoot);
  const candidates = [
    join(root, "packages/engine/src/index.ts"),
    join(root, "packages/engine/src/agent-api/index.ts")
  ];
  const exports = new Set();
  for (const file of candidates) {
    if (existsSync(file)) collectExportsFromText(readFileSync(file, "utf8"), exports);
  }
  return [...exports].sort();
}

function collectExportsFromText(text, exports) {
  for (const match of text.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    exports.add(match[1]);
  }
  for (const match of text.matchAll(/\bexport\s*\{([\s\S]*?)\}\s*(?:from\s*["'][^"']+["'])?\s*;/g)) {
    for (const name of splitImportList(match[1])) {
      const cleaned = name.replace(/^type\s+/, "").trim();
      const alias = cleaned.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      const direct = cleaned.match(/^([A-Za-z_$][\w$]*)$/);
      if (alias) exports.add(alias[1]);
      else if (direct) exports.add(direct[1]);
    }
  }
}

function generatedSourceFiles(sourceDir) {
  return walkFiles(sourceDir, (file) => {
    const rel = relative(sourceDir, file).replaceAll("\\", "/");
    if (rel.startsWith("node_modules/") || rel.startsWith("dist/") || rel.startsWith("public/")) return false;
    if (rel === "package.json" || rel === "package-lock.json" || rel === "pnpm-lock.yaml" || rel === "tsconfig.json") return false;
    return /(^index\.html$|^vite\.config\.[cm]?[tj]s$|^src\/|\.css$|\.ts$|\.tsx$|\.js$|\.jsx$|\.html$)/.test(rel);
  }).sort();
}

function walkFiles(root, predicate, acc = []) {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const file = join(root, entry);
    if (["node_modules", "dist", ".git", "context", "benchmark", "_packages", ".npm-cache"].includes(entry)) continue;
    const stat = statSync(file);
    if (stat.isDirectory()) {
      walkFiles(file, predicate, acc);
    } else if (predicate(file)) {
      acc.push(file);
    }
  }
  return acc;
}

function collectModuleSpecifiers(text) {
  const records = [];
  const importFrom = /\bimport\s+([\s\S]*?)\s+from\s*["']([^"']+)["']/g;
  const sideEffectImport = /\bimport\s*["']([^"']+)["']/g;
  const exportFrom = /\bexport\s+([\s\S]*?)\s+from\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(importFrom)) {
    records.push({ clause: match[1], specifier: match[2], offset: match.index ?? 0 });
  }
  for (const match of text.matchAll(sideEffectImport)) {
    records.push({ clause: "", specifier: match[1], offset: match.index ?? 0 });
  }
  for (const match of text.matchAll(exportFrom)) {
    records.push({ clause: match[1], specifier: match[2], offset: match.index ?? 0 });
  }
  return records;
}

function collectNamedImportSymbols(clause) {
  const named = clause.match(/\{([\s\S]*?)\}/);
  if (!named) return [];
  return splitImportList(named[1]).flatMap((part) => {
    const cleaned = part.replace(/^type\s+/, "").trim();
    const match = cleaned.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    return match ? [{ name: match[1], importedAs: match[2] ?? match[1] }] : [];
  });
}

function splitImportList(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function hasDefaultImport(clause) {
  const beforeNamed = clause.split("{")[0].trim();
  if (beforeNamed === "type") return false;
  return Boolean(beforeNamed && !beforeNamed.startsWith("*") && /^[A-Za-z_$][\w$]*(?:\s*,)?$/.test(beforeNamed));
}

function collectPrompt10UnsafeAssetReferences(entry, options = {}) {
  const records = [];
  const library = options.library ?? null;
  const appSource = entry.rel !== "src/aura-assets.ts";
  for (const match of entry.text.matchAll(/\bunsafeModelUrl\s*\(/g)) {
    records.push({
      kind: "unsafeModelUrl",
      file: entry.rel,
      line: lineForOffset(entry.text, match.index ?? 0),
      reason: "prompt 10 must use typed assets, not unsafeModelUrl"
    });
  }
  for (const match of entry.text.matchAll(/\bmodel\s*\(\s*["']([^"']+)["']/g)) {
    records.push({
      kind: "stringModelAssetId",
      value: match[1],
      file: entry.rel,
      line: lineForOffset(entry.text, match.index ?? 0),
      reason: "prompt 10 must use model(assets.sneaker), not model(\"...\")"
    });
  }
  if (appSource && library === "Aura3D") {
    for (const match of entry.text.matchAll(PROMPT_10_ASSET_PATTERN)) {
      if (!isPrompt10ModelUrlReference(entry.text, match.index ?? 0, match[0])) continue;
      records.push({
        kind: /^https?:\/\//i.test(match[0]) ? "remoteModelUrl" : "hardCodedModelUrl",
        value: match[0],
        file: entry.rel,
        line: lineForOffset(entry.text, match.index ?? 0),
        reason: "prompt 10 app code must not hard-code model URLs; use generated typed assets"
      });
    }
  }
  return records;
}

function isPrompt10ModelUrlReference(text, offset, value) {
  if (/^https?:\/\//i.test(value)) return true;
  if (/^(?:\.\.?\/|\/)/.test(value)) return true;
  if (value.includes("/")) return true;

  const lineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", offset);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  return /\b(?:url|path|src|href|asset|loader|load|fetch|import)\b/i.test(line);
}

function isPrompt10(promptFile, sourceDir) {
  return /(?:^|\/)(?:10-|prompt-10)/.test(promptFile) || /(?:^|\/)prompt-10(?:\/|$)/.test(sourceDir);
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split(/\r\n|\r|\n/).length;
}

function sortByLocation(records) {
  return [...records].sort((a, b) => `${a.file}:${a.line}:${a.symbol ?? a.specifier ?? a.kind}`.localeCompare(`${b.file}:${b.line}:${b.symbol ?? b.specifier ?? b.kind}`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    console.error("Usage: node benchmark/runner/prompt-source-audit.mjs <sourceDir> [promptFile]");
    process.exit(2);
  }
  const audit = auditPromptSource({ sourceDir, promptFile: process.argv[3], writeReport: false });
  console.log(JSON.stringify(audit, null, 2));
  if (!audit.pass) process.exit(1);
}
