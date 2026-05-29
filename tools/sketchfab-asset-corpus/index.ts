import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, relative, resolve } from "node:path";
import { addAsset, validateAssets } from "../../packages/aura3d-cli/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

interface SketchfabDownloadInfo {
  readonly uid: string;
  readonly name: string;
  readonly license: string;
  readonly assetPath: string;
  readonly format: "glb" | "gltf";
  readonly downloadedBytes: number;
}

type SketchfabDownloadResponse = Record<string, { readonly url?: string; readonly size?: number } | undefined>;

const workspace = resolve("tests/reports/sketchfab-asset-corpus-workspace");
const modelUid = process.env.SKETCHFAB_MODEL_UID?.trim() || "01371cd3990f4d9587d40244b5e2a0a8";
const token = process.env.SKETCHFAB_API_TOKEN?.trim();
const checks: ReleaseCheck[] = [];

rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
writeFileSync(resolve(workspace, "package.json"), JSON.stringify({ type: "module", scripts: { build: "echo sketchfab-asset-corpus-build" } }, null, 2));

if (!token) {
  checks.push({
    id: "sketchfab-api-token-present",
    pass: false,
    detail: "SKETCHFAB_API_TOKEN is missing; no secret value was inspected or recorded."
  });
  writeSketchfabMarkdown(undefined, checks);
  writeReport("tests/reports/sketchfab-asset-corpus.json", "aura3d-sketchfab-asset-corpus", checks, { workspace: repoRelative(workspace), modelUid });
} else {
  checks.push({
    id: "sketchfab-api-token-present",
    pass: true,
    detail: "SKETCHFAB_API_TOKEN was supplied through the process environment and was not written to disk."
  });

  const download = downloadSketchfabAsset(workspace, modelUid, token);
  checks.push({
    id: "sketchfab-download",
    pass: existsSync(resolve(workspace, download.assetPath)) && statSync(resolve(workspace, download.assetPath)).size > 0,
    detail: `${download.name} ${download.format} downloaded into ignored test workspace (${download.downloadedBytes} bytes).`
  });

  const addResult = addAsset({ projectDir: workspace, file: download.assetPath, name: "sketchfabCc0" });
  checks.push({
    id: "sketchfab-assets-add",
    pass: addResult.ok,
    detail: addResult.messages.join("; ")
  });

  const validation = validateAssets({ projectDir: workspace });
  const manifestAsset = validation.manifest.assets.find((entry) => entry.id === "sketchfabCc0");
  checks.push({
    id: "sketchfab-assets-validate",
    pass: validation.ok && Boolean(manifestAsset),
    detail: validation.ok && manifestAsset
      ? `manifest asset format=${manifestAsset.format}, materials=${manifestAsset.materials.length}, textures=${manifestAsset.textures.length}, animations=${manifestAsset.animations.length}`
      : validation.messages.join("; ")
  });
  checks.push({
    id: "sketchfab-typegen-created",
    pass: existsSync(resolve(workspace, "src/aura-assets.ts")),
    detail: "src/aura-assets.ts generated for the Sketchfab asset."
  });

  writeSketchfabMarkdown(download, checks);
  writeReport("tests/reports/sketchfab-asset-corpus.json", "aura3d-sketchfab-asset-corpus", checks, {
    workspace: repoRelative(workspace),
    modelUid: download.uid,
    modelName: download.name,
    license: download.license,
    assetPath: download.assetPath,
    format: download.format,
    manifestAsset,
    validationWarnings: validation.warnings
  });
}

function downloadSketchfabAsset(projectDir: string, uid: string, apiToken: string): SketchfabDownloadInfo {
  const metadata = fetchSketchfabDownloadMetadata(uid, apiToken);
  const glbUrl = metadata.glb?.url;
  const gltfUrl = metadata.gltf?.url;
  const name = process.env.SKETCHFAB_MODEL_NAME?.trim() || "Mermaid2";
  const license = process.env.SKETCHFAB_MODEL_LICENSE?.trim() || "CC0 Public Domain";

  if (glbUrl) {
    const target = "assets/external/sketchfab-cc0/model.glb";
    const bytes = downloadFile(glbUrl, resolve(projectDir, target));
    return { uid, name, license, assetPath: target, format: "glb", downloadedBytes: bytes };
  }

  if (!gltfUrl) {
    throw new Error("Sketchfab download metadata did not include a glb or gltf download URL.");
  }

  const archivePath = resolve(projectDir, "sketchfab-download.zip");
  const extractDir = resolve(projectDir, "sketchfab-extracted");
  const bytes = downloadFile(gltfUrl, archivePath);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  execFileSync("unzip", ["-q", archivePath, "-d", extractDir], { maxBuffer: 20 * 1024 * 1024 });
  const assetPath = normalizeGltfArchive(projectDir, extractDir, "assets/external/sketchfab-cc0");
  return { uid, name, license, assetPath, format: "gltf", downloadedBytes: bytes };
}

function fetchSketchfabDownloadMetadata(uid: string, apiToken: string): SketchfabDownloadResponse {
  const url = `https://api.sketchfab.com/v3/models/${uid}/download`;
  for (const scheme of ["Token", "Bearer"]) {
    const response = curlText(url, [`Authorization: ${scheme} ${apiToken}`]);
    if (response.status >= 200 && response.status < 300) {
      return JSON.parse(response.body) as SketchfabDownloadResponse;
    }
    if (response.status !== 401 && response.status !== 403) {
      throw new Error(`Sketchfab download metadata returned HTTP ${response.status}.`);
    }
  }
  throw new Error("Sketchfab download metadata rejected the supplied token.");
}

function curlText(url: string, headers: readonly string[]): { readonly body: string; readonly status: number } {
  const marker = "\n__AURA3D_HTTP_STATUS__:";
  const output = execFileSync("curl", [
    "-L",
    "--silent",
    "--show-error",
    "--max-time",
    "90",
    ...headers.flatMap((header) => ["-H", header]),
    "--write-out",
    `${marker}%{http_code}`,
    url
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error("curl response did not include an HTTP status marker.");
  const body = output.slice(0, markerIndex);
  const status = Number(output.slice(markerIndex + marker.length).trim());
  return { body, status };
}

function downloadFile(url: string, target: string): number {
  mkdirSync(dirname(target), { recursive: true });
  execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "180", "--output", target, url], {
    maxBuffer: 20 * 1024 * 1024
  });
  return statSync(target).size;
}

function normalizeGltfArchive(projectDir: string, sourceDir: string, targetDir: string): string {
  const gltfFile = listFiles(sourceDir)
    .filter((file) => file.toLowerCase().endsWith(".gltf"))
    .sort((a, b) => scoreGltfName(a) - scoreGltfName(b))[0];
  if (!gltfFile) throw new Error("Sketchfab glTF archive did not contain a .gltf file.");

  const sourceJson = JSON.parse(readFileSync(gltfFile, "utf8")) as {
    readonly buffers?: readonly { readonly uri?: string }[];
    readonly images?: readonly { readonly uri?: string }[];
  };

  for (const uri of referencedUris(sourceJson)) {
    const decoded = decodeURIComponent(uri);
    const source = resolve(dirname(gltfFile), decoded);
    const target = resolve(projectDir, targetDir, decoded);
    if (!source.startsWith(sourceDir) || !existsSync(source)) {
      throw new Error(`Sketchfab glTF referenced file missing: ${uri}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }

  const normalizedPath = `${targetDir}/scene.gltf`;
  mkdirSync(resolve(projectDir, targetDir), { recursive: true });
  writeFileSync(resolve(projectDir, normalizedPath), JSON.stringify(sourceJson, null, 2));
  return normalizedPath;
}

function referencedUris(gltf: {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string }[];
}): string[] {
  return [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => Boolean(uri))
    .filter((uri) => !uri.startsWith("data:") && !/^[a-z]+:\/\//i.test(uri) && !uri.startsWith("/"));
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function scoreGltfName(path: string): number {
  const name = basename(path).toLowerCase();
  if (name === "scene.gltf") return 0;
  if (name === "model.gltf") return 1;
  return 2;
}

function writeSketchfabMarkdown(download: SketchfabDownloadInfo | undefined, currentChecks: readonly ReleaseCheck[]): void {
  const lines = [
    "# Sketchfab Asset Corpus Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This document records authenticated Sketchfab CC0 asset evidence for the",
    "`ProductContextPRD.md` bring-your-own-assets claim. Downloaded model files",
    "live only under ignored `tests/reports/` workspace paths and are not",
    "committed.",
    "",
    "## Summary",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...currentChecks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    "",
    "## Source And License",
    "",
    ...(download
      ? [
          `- Source: Sketchfab API model \`${download.name}\` (\`${download.uid}\`).`,
          `- License: ${download.license}.`,
          `- Imported asset path: \`${download.assetPath}\`.`,
          `- Format tested: ${download.format}.`,
          `- Local workspace: \`${relative(process.cwd(), workspace)}\`.`
        ]
      : ["- Not run because `SKETCHFAB_API_TOKEN` was not supplied."]),
    "",
    "## Verdict",
    "",
    download && currentChecks.every((check) => check.pass)
      ? "Authenticated Sketchfab CC0 download, asset add, validation, and typegen pass."
      : "Authenticated Sketchfab CC0 corpus proof is not complete.",
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/sketchfab-asset-corpus-results.md", `${lines.join("\n")}\n`);
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
