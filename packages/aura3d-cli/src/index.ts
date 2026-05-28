import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve } from "node:path";

export type AuraCliAssetType = "model" | "texture" | "environment" | "audio";

export interface AuraCliAssetManifest {
  readonly schema: "aura3d.assets/1.0";
  readonly assetBasePath: string;
  readonly outputDir: string;
  readonly typegen: string;
  readonly assets: readonly AuraCliAssetEntry[];
}

export interface AuraCliAssetEntry {
  readonly id: string;
  readonly type: AuraCliAssetType;
  readonly format: string;
  readonly source: string;
  readonly outputPath: string;
  readonly url: string;
  readonly hash: string;
  readonly sizeBytes: number;
  readonly bounds?: readonly [number, number, number];
  readonly materials: readonly string[];
  readonly animations: readonly string[];
  readonly textures: readonly string[];
  readonly thumbnailUrl?: string;
  readonly warnings: readonly string[];
}

export interface AddAssetOptions {
  readonly projectDir?: string;
  readonly file: string;
  readonly name: string;
  readonly type?: AuraCliAssetType;
  readonly publicPath?: string;
  readonly outputDir?: string;
  readonly typegen?: string;
  readonly copy?: boolean;
}

export interface AssetCliResult {
  readonly ok: boolean;
  readonly manifestPath: string;
  readonly manifest: AuraCliAssetManifest;
  readonly messages: readonly string[];
}

export interface AssetValidationResult extends AssetCliResult {
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

export const DEFAULT_AURA_ASSET_MANIFEST = "aura.assets.json";
export const DEFAULT_AURA_ASSET_OUTPUT_DIR = "public/aura-assets";
export const DEFAULT_AURA_ASSET_PUBLIC_PATH = "/aura-assets/";
export const DEFAULT_AURA_ASSET_TYPEGEN = "src/aura-assets.ts";

export function addAsset(options: AddAssetOptions): AssetCliResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const sourcePath = resolve(projectDir, options.file);
  if (!existsSync(sourcePath)) {
    throw new Error(`Aura3D assets add failed: "${options.file}" does not exist. Suggested fix: pass a real local GLB/glTF/texture path.`);
  }
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const current = readAssetManifest(projectDir);
  const outputDir = normalizeRelativePath(options.outputDir ?? current.outputDir ?? DEFAULT_AURA_ASSET_OUTPUT_DIR);
  const publicPath = normalizePublicPath(options.publicPath ?? current.assetBasePath ?? DEFAULT_AURA_ASSET_PUBLIC_PATH);
  const typegen = normalizeRelativePath(options.typegen ?? current.typegen ?? DEFAULT_AURA_ASSET_TYPEGEN);
  const hash = hashFile(sourcePath);
  const format = extname(sourcePath).slice(1).toLowerCase();
  const type = options.type ?? inferAssetType(format);
  const outputFileName = `${options.name}.${hash.slice(0, 8)}.${format}`;
  const outputPath = join(outputDir, outputFileName);
  if (options.copy !== false) {
    mkdirSync(resolve(projectDir, outputDir), { recursive: true });
    copyFileSync(sourcePath, resolve(projectDir, outputPath));
  }
  const inspection = inspectAssetFile(sourcePath, format);
  const thumbnailUrl = writeThumbnail(projectDir, outputDir, publicPath, options.name, inspection.bounds);
  const entry: AuraCliAssetEntry = {
    id: options.name,
    type,
    format,
    source: normalizeRelativePath(relative(projectDir, sourcePath)),
    outputPath: normalizeRelativePath(outputPath),
    url: `${publicPath}${outputFileName}`,
    hash: `sha256-${hash}`,
    sizeBytes: statSync(sourcePath).size,
    bounds: inspection.bounds,
    materials: inspection.materials,
    animations: inspection.animations,
    textures: inspection.textures,
    thumbnailUrl,
    warnings: createAssetWarnings(sourcePath, inspection)
  };
  const manifest = sortManifest({
    schema: "aura3d.assets/1.0",
    assetBasePath: publicPath,
    outputDir,
    typegen,
    assets: [
      ...current.assets.filter((asset) => asset.id !== entry.id),
      entry
    ]
  });
  writeAssetManifest(projectDir, manifest);
  writeTypedAssets(projectDir, manifest);
  return {
    ok: true,
    manifestPath,
    manifest,
    messages: [
      `Added ${entry.id} -> ${entry.url}`,
      `Wrote ${DEFAULT_AURA_ASSET_MANIFEST}`,
      `Wrote ${manifest.typegen}`
    ]
  };
}

export function scanAssets(options: { readonly projectDir?: string; readonly directory: string }): AssetCliResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const directory = resolve(projectDir, options.directory);
  if (!existsSync(directory)) throw new Error(`Aura3D assets scan failed: "${options.directory}" does not exist.`);
  let result: AssetCliResult | undefined;
  for (const file of readdirSync(directory)) {
    const path = join(directory, file);
    if (!statSync(path).isFile()) continue;
    const format = extname(path).slice(1).toLowerCase();
    if (!["glb", "gltf", "png", "jpg", "jpeg", "webp", "hdr", "exr", "mp3", "wav", "ogg"].includes(format)) continue;
    const name = sanitizeAssetId(file.replace(/\.[^.]+$/, ""));
    result = addAsset({ projectDir, file: relative(projectDir, path), name });
  }
  return result ?? {
    ok: true,
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    manifest: readAssetManifest(projectDir),
    messages: ["No supported assets found."]
  };
}

export function validateAssets(options: { readonly projectDir?: string } = {}): AssetValidationResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const manifest = readAssetManifest(projectDir);
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const asset of manifest.assets) {
    const outputPath = resolve(projectDir, asset.outputPath);
    if (!existsSync(outputPath)) {
      failures.push(`Missing asset output for "${asset.id}": ${asset.outputPath}`);
      continue;
    }
    const actualHash = `sha256-${hashFile(outputPath)}`;
    if (actualHash !== asset.hash) failures.push(`Hash mismatch for "${asset.id}": expected ${asset.hash}, found ${actualHash}`);
    warnings.push(...asset.warnings.map((warning) => `${asset.id}: ${warning}`));
    if (asset.format === "gltf") {
      for (const texture of asset.textures) {
        if (texture.startsWith("data:")) continue;
        const texturePath = resolve(dirname(resolve(projectDir, asset.source)), texture);
        if (!existsSync(texturePath)) warnings.push(`${asset.id}: missing referenced texture ${texture}`);
      }
    }
  }
  const typegenPath = resolve(projectDir, manifest.typegen);
  if (!existsSync(typegenPath)) failures.push(`Missing typed asset module: ${manifest.typegen}. Run assets typegen.`);
  return {
    ok: failures.length === 0,
    manifestPath,
    manifest,
    failures,
    warnings,
    messages: failures.length === 0 ? ["Asset manifest is valid."] : failures
  };
}

export function writeTypedAssets(projectDir: string, manifest = readAssetManifest(projectDir)): string {
  const path = resolve(projectDir, manifest.typegen);
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    `import { defineAuraAssets } from "@aura3d/engine";`,
    "",
    "export const assets = defineAuraAssets({",
    ...manifest.assets.map((asset) => {
      const metadata = {
        materials: asset.materials,
        animations: asset.animations,
        textures: asset.textures,
        thumbnailUrl: asset.thumbnailUrl
      };
      const fields = [
        `type: ${JSON.stringify(asset.type)}`,
        `format: ${JSON.stringify(asset.format)}`,
        `url: ${JSON.stringify(asset.url)}`,
        `hash: ${JSON.stringify(asset.hash)}`,
        `bounds: ${JSON.stringify(asset.bounds ?? [0, 0, 0])}`,
        `sizeBytes: ${asset.sizeBytes}`,
        `metadata: ${JSON.stringify(metadata)}`
      ];
      return `  ${JSON.stringify(asset.id)}: { ${fields.join(", ")} },`;
    }),
    "} as const);",
    "",
    "export type AuraGeneratedAssets = typeof assets;",
    ""
  ];
  writeFileSync(path, lines.join("\n"));
  return path;
}

export function listAssets(options: { readonly projectDir?: string } = {}): readonly AuraCliAssetEntry[] {
  return readAssetManifest(resolve(options.projectDir ?? process.cwd())).assets;
}

export function createAssetThumbnails(options: { readonly projectDir?: string } = {}): AssetCliResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const assets = manifest.assets.map((asset) => ({
    ...asset,
    thumbnailUrl: writeThumbnail(projectDir, manifest.outputDir, manifest.assetBasePath, asset.id, asset.bounds)
  }));
  const next = sortManifest({ ...manifest, assets });
  writeAssetManifest(projectDir, next);
  writeTypedAssets(projectDir, next);
  return {
    ok: true,
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    manifest: next,
    messages: [`Generated ${next.assets.length} thumbnails.`]
  };
}

export function doctor(options: { readonly projectDir?: string } = {}): AssetValidationResult {
  const validation = validateAssets(options);
  const packagePath = resolve(options.projectDir ?? process.cwd(), "package.json");
  const failures = [...validation.failures];
  if (!existsSync(packagePath)) failures.push("Missing package.json.");
  return {
    ...validation,
    ok: failures.length === 0,
    failures,
    messages: failures.length === 0 ? ["Aura3D project doctor passed."] : failures
  };
}

export function checkDeploy(options: { readonly projectDir?: string; readonly distDir?: string } = {}): AssetValidationResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const distDir = normalizeRelativePath(options.distDir ?? "dist");
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const asset of manifest.assets) {
    const distPath = resolve(projectDir, distDir, asset.url.replace(/^\//, ""));
    const publicPath = resolve(projectDir, asset.outputPath);
    if (!existsSync(distPath) && !existsSync(publicPath)) {
      failures.push(`Deploy check missing hashed asset for "${asset.id}": expected ${asset.url} in ${distDir} or ${asset.outputPath}`);
    }
    if (!/[a-f0-9]{8}\.[^.]+$/i.test(asset.url)) warnings.push(`${asset.id}: URL is not fingerprinted: ${asset.url}`);
  }
  const validation = validateAssets({ projectDir });
  failures.push(...validation.failures);
  warnings.push(...validation.warnings);
  return {
    ok: failures.length === 0,
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    manifest,
    failures,
    warnings,
    messages: failures.length === 0 ? ["Deploy check passed."] : failures
  };
}

export function initAgentFiles(options: { readonly projectDir?: string; readonly agent: "claude" | "cursor" | "copilot" | "generic" | "all" }): readonly string[] {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const targets = options.agent === "all" ? ["generic", "claude", "cursor", "copilot"] as const : [options.agent] as const;
  const written: string[] = [];
  for (const target of targets) {
    if (target === "generic") written.push(writeAgentFile(projectDir, "AGENTS.md", genericAgentText()));
    if (target === "claude") written.push(writeAgentFile(projectDir, ".claude/CLAUDE.md", genericAgentText("Claude")));
    if (target === "cursor") written.push(writeAgentFile(projectDir, ".cursor/rules/aura3d.mdc", genericAgentText("Cursor")));
    if (target === "copilot") written.push(writeAgentFile(projectDir, ".github/copilot-instructions.md", genericAgentText("GitHub Copilot")));
  }
  return written;
}

export function readAssetManifest(projectDir: string): AuraCliAssetManifest {
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  if (!existsSync(manifestPath)) {
    return {
      schema: "aura3d.assets/1.0",
      assetBasePath: DEFAULT_AURA_ASSET_PUBLIC_PATH,
      outputDir: DEFAULT_AURA_ASSET_OUTPUT_DIR,
      typegen: DEFAULT_AURA_ASSET_TYPEGEN,
      assets: []
    };
  }
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as AuraCliAssetManifest;
  if (parsed.schema !== "aura3d.assets/1.0") throw new Error(`Unsupported Aura3D asset manifest schema: ${String(parsed.schema)}`);
  return parsed;
}

export function writeAssetManifest(projectDir: string, manifest: AuraCliAssetManifest): void {
  writeFileSync(resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

interface AssetInspection {
  readonly bounds?: readonly [number, number, number];
  readonly materials: readonly string[];
  readonly animations: readonly string[];
  readonly textures: readonly string[];
}

function inspectAssetFile(path: string, format: string): AssetInspection {
  if (format === "gltf") return inspectGltf(JSON.parse(readFileSync(path, "utf8")) as GltfJson);
  if (format === "glb") return inspectGlb(readFileSync(path));
  return {
    materials: [],
    animations: [],
    textures: [],
    bounds: undefined
  };
}

interface GltfJson {
  readonly accessors?: readonly { readonly min?: readonly number[]; readonly max?: readonly number[] }[];
  readonly materials?: readonly { readonly name?: string }[];
  readonly animations?: readonly { readonly name?: string }[];
  readonly images?: readonly { readonly uri?: string; readonly name?: string }[];
}

function inspectGlb(buffer: Buffer): AssetInspection {
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb).");
  const length = buffer.readUInt32LE(8);
  if (length > buffer.length) throw new Error("Invalid GLB length. Suggested fix: run assets validate on the original export.");
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString("utf8", 16, 20);
  if (chunkType !== "JSON") throw new Error("Invalid GLB JSON chunk. Suggested fix: re-export the GLB.");
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + chunkLength).trim()) as GltfJson;
  return inspectGltf(json);
}

function inspectGltf(json: GltfJson): AssetInspection {
  return {
    bounds: extractBounds(json),
    materials: (json.materials ?? []).map((material, index) => material.name ?? `material-${index}`),
    animations: (json.animations ?? []).map((animation, index) => animation.name ?? `clip-${index}`),
    textures: (json.images ?? []).map((image, index) => image.uri ?? image.name ?? `image-${index}`)
  };
}

function extractBounds(json: GltfJson): readonly [number, number, number] | undefined {
  let min: [number, number, number] | undefined;
  let max: [number, number, number] | undefined;
  for (const accessor of json.accessors ?? []) {
    if (!accessor.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) continue;
    min = min ? [Math.min(min[0], accessor.min[0]), Math.min(min[1], accessor.min[1]), Math.min(min[2], accessor.min[2])] : [accessor.min[0], accessor.min[1], accessor.min[2]];
    max = max ? [Math.max(max[0], accessor.max[0]), Math.max(max[1], accessor.max[1]), Math.max(max[2], accessor.max[2])] : [accessor.max[0], accessor.max[1], accessor.max[2]];
  }
  return min && max ? [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])] : undefined;
}

function createAssetWarnings(path: string, inspection: AssetInspection): readonly string[] {
  const warnings: string[] = [];
  const size = statSync(path).size;
  if (size > 25 * 1024 * 1024) warnings.push("asset exceeds 25 MB; consider compression before deployment");
  if (!inspection.bounds) warnings.push("bounds could not be extracted");
  if (inspection.textures.length === 0 && ["glb", "gltf"].includes(extname(path).slice(1).toLowerCase())) warnings.push("no texture references detected");
  return warnings;
}

function writeThumbnail(projectDir: string, outputDir: string, publicPath: string, id: string, bounds?: readonly [number, number, number]): string {
  const fileName = `${id}.thumb.svg`;
  const outputPath = resolve(projectDir, outputDir, fileName);
  mkdirSync(dirname(outputPath), { recursive: true });
  const label = `${id}${bounds ? ` ${bounds.join("x")}` : ""}`;
  writeFileSync(outputPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#101720"/><path d="M80 126 160 46l80 80-80 28z" fill="#77a7ff"/><text x="160" y="160" text-anchor="middle" font-family="Arial" font-size="18" fill="#f4f7fb">${escapeXml(label)}</text></svg>`);
  return `${publicPath}${fileName}`;
}

function inferAssetType(format: string): AuraCliAssetType {
  if (["glb", "gltf"].includes(format)) return "model";
  if (["png", "jpg", "jpeg", "webp", "ktx2"].includes(format)) return "texture";
  if (["hdr", "exr"].includes(format)) return "environment";
  return "audio";
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sortManifest(manifest: AuraCliAssetManifest): AuraCliAssetManifest {
  return {
    ...manifest,
    assets: [...manifest.assets].sort((a, b) => a.id.localeCompare(b.id))
  };
}

function normalizePublicPath(path: string): string {
  const withStart = path.startsWith("/") || path.startsWith("http") ? path : `/${path}`;
  return withStart.endsWith("/") ? withStart : `${withStart}/`;
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function sanitizeAssetId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+(.)/g, (_, char: string) => char.toUpperCase()).replace(/^[^a-zA-Z_]+/, "") || "asset";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function writeAgentFile(projectDir: string, path: string, contents: string): string {
  const output = resolve(projectDir, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
  return output;
}

function genericAgentText(agent = "AI coding agent"): string {
  return `# Aura3D Instructions For ${agent}

Read ./llms.txt first, then ./docs/agents/README.md.

Use @aura3d/engine public imports only:
- createAuraApp
- scene
- model
- camera
- lights
- material
- effects
- timeline
- interactions
- defineAuraAssets

Do not invent asset paths or asset ids. Read ./src/aura-assets.ts after running:

npx @aura3d/cli@latest assets add ./assets/model.glb --name model

Use model(assets.model), not model("model").
Run npm run build and the template route-health/screenshot tests before claiming the scene is done.
`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
