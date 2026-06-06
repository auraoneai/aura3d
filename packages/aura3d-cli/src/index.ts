import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve } from "node:path";

export type AuraCliAssetType = "model" | "texture" | "environment" | "audio";
export type AuraCliHumanoidStatus = "humanoid" | "non-humanoid" | "unknown";
export type AuraCliHumanoidConfidence = "high" | "medium" | "low";

export interface AuraCliAnimationInspection {
  readonly clipCount: number;
  readonly clips: readonly AuraCliAnimationClipInspection[];
  readonly messages: readonly string[];
}

export interface AuraCliAnimationClipInspection {
  readonly index: number;
  readonly name: string;
  readonly channelCount: number;
  readonly samplerCount: number;
  readonly targetPaths: readonly string[];
  readonly targetNodes: readonly string[];
}

export interface AuraCliSkeletonInspection {
  readonly skinCount: number;
  readonly jointCount: number;
  readonly skins: readonly AuraCliSkeletonSkinInspection[];
  readonly messages: readonly string[];
}

export interface AuraCliSkeletonSkinInspection {
  readonly index: number;
  readonly name: string;
  readonly jointCount: number;
  readonly joints: readonly string[];
  readonly skeleton?: string;
}

export interface AuraCliMorphTargetInspection {
  readonly targetCount: number;
  readonly targetNames: readonly string[];
  readonly meshes: readonly AuraCliMorphTargetMeshInspection[];
  readonly messages: readonly string[];
}

export interface AuraCliMorphTargetMeshInspection {
  readonly index: number;
  readonly name: string;
  readonly targetNames: readonly string[];
}

export interface AuraCliAssetBoundsInspection {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly center: readonly [number, number, number];
  readonly maxDimension: number;
  readonly grounded: boolean;
}

export interface AuraCliMaterialInspection {
  readonly name: string;
  readonly visible: boolean;
  readonly readable: boolean;
  readonly opacity: number;
  readonly alphaMode?: string;
  readonly reasons: readonly string[];
}

export interface AuraCliOrientationInspection {
  readonly source: "gltf-extras" | "unknown";
  readonly forwardAxis?: string;
  readonly upAxis?: string;
  readonly messages: readonly string[];
}

export interface AuraCliHumanoidInspection {
  readonly humanoid: boolean;
  readonly status: AuraCliHumanoidStatus;
  readonly confidence: AuraCliHumanoidConfidence;
  readonly skinCount: number;
  readonly jointCount: number;
  readonly matchedBones: readonly string[];
  readonly missingBones: readonly string[];
  readonly messages: readonly string[];
}

export interface AuraCliAssetProvenance {
  readonly sourcePath: string;
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly author?: string;
  readonly sourceFamily?: string;
  readonly attribution?: string;
  readonly evidence?: readonly string[];
  readonly checkedAt: string;
}

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
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly materials: readonly string[];
  readonly materialMetadata?: readonly AuraCliMaterialInspection[];
  readonly animations: readonly string[];
  readonly animationMetadata?: AuraCliAnimationInspection;
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly skeleton?: AuraCliSkeletonInspection;
  readonly morphTargets?: AuraCliMorphTargetInspection;
  readonly provenance?: AuraCliAssetProvenance;
  readonly textures: readonly string[];
  readonly dependencies?: readonly string[];
  readonly orientation?: AuraCliOrientationInspection;
  readonly nodeNames?: readonly string[];
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
  readonly sourceUrl?: string;
  readonly license?: string;
  readonly author?: string;
  readonly sourceFamily?: string;
  readonly attribution?: string;
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

export interface AssetValidationOptions {
  readonly projectDir?: string;
  readonly noPlaceholders?: boolean;
  readonly requireLicense?: boolean;
  readonly provenanceFile?: string;
  readonly assetIds?: readonly string[];
}

export type AuraAssetReadinessProfile = "game" | "cartoon";
export type AuraGameAssetReadinessProfile = "fighting-character";
export type AuraAssetReadinessStatus = "passed" | "failed";

export interface AssetReadinessOptions {
  readonly projectDir?: string;
  readonly output?: string;
  readonly gameProfile?: AuraGameAssetReadinessProfile;
  readonly noPlaceholders?: boolean;
  readonly requireLicense?: boolean;
  readonly provenanceFile?: string;
  readonly assetIds?: readonly string[];
}

export interface AssetReadinessReport {
  readonly schema: "aura3d.asset-readiness/1.0";
  readonly profile: AuraAssetReadinessProfile;
  readonly gameProfile?: AuraGameAssetReadinessProfile;
  readonly ok: boolean;
  readonly status: AuraAssetReadinessStatus;
  readonly validator: AssetReadinessValidatorEvidence;
  readonly checkedAt: string;
  readonly manifestPath: string;
  readonly artifacts: AssetReadinessArtifacts;
  readonly contracts: readonly AssetReadinessValidationContract[];
  readonly summary: {
    readonly totalAssets: number;
    readonly modelAssets: number;
    readonly animatedModels: number;
    readonly textureAssets: number;
    readonly audioAssets: number;
    readonly environmentAssets: number;
    readonly animationClips: number;
    readonly humanoidModels: number;
  };
  readonly assets: readonly AssetReadinessAssetReport[];
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

export interface AssetReadinessValidatorEvidence {
  readonly id: "aura-clash-game-assets" | "aura-voice-cartoon-assets";
  readonly command: "assets validate-game" | "assets validate-cartoon";
  readonly label: string;
}

export interface AssetReadinessValidationContract {
  readonly id: string;
  readonly label: string;
  readonly profile: AuraAssetReadinessProfile;
  readonly sourceFamily?: "Quaternius" | "AuraVoice" | "custom";
  readonly intendedUse?: "fighter" | "cartoon-character" | "set" | "prop";
  readonly sourceOnly: boolean;
  readonly requiredChecks: readonly string[];
  readonly requiredAnimationClips?: readonly string[];
  readonly evidenceBoundary: string;
}

export interface AssetReadinessArtifacts {
  readonly evidencePath?: string;
  readonly manifestPath: string;
  readonly typedAssetsPath: string;
  readonly outputDir: string;
  readonly assetBasePath: string;
  readonly assetFiles: readonly AssetReadinessAssetArtifacts[];
}

export interface AssetReadinessAssetArtifacts {
  readonly id: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly publicUrl: string;
  readonly thumbnailPath?: string;
  readonly thumbnailUrl?: string;
  readonly dependencyPaths: readonly string[];
}

export interface AssetReadinessAnimationMetadata {
  readonly clipCount: number;
  readonly clips: readonly AssetReadinessAnimationClipMetadata[];
}

export interface AssetReadinessAnimationClipMetadata {
  readonly index: number;
  readonly name: string;
}

export interface AssetReadinessAssetReport {
  readonly id: string;
  readonly type: AuraCliAssetType;
  readonly format: string;
  readonly source: string;
  readonly outputPath: string;
  readonly url: string;
  readonly sizeBytes: number;
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly animations: readonly string[];
  readonly animation: AssetReadinessAnimationMetadata;
  readonly animationMetadata?: AuraCliAnimationInspection;
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly skeleton?: AuraCliSkeletonInspection;
  readonly morphTargets?: AuraCliMorphTargetInspection;
  readonly provenance?: AuraCliAssetProvenance;
  readonly placeholderFree: boolean;
  readonly licenseVerified: boolean;
  readonly materials: readonly string[];
  readonly materialMetadata?: readonly AuraCliMaterialInspection[];
  readonly textures: readonly string[];
  readonly orientation?: AuraCliOrientationInspection;
  readonly nodeNames?: readonly string[];
  readonly artifactPaths: AssetReadinessAssetArtifacts;
  readonly gameReady: boolean;
  readonly cartoonReady: boolean;
  readonly warnings: readonly string[];
}

export interface AssetInspectionReport {
  readonly ok: boolean;
  readonly schema: "aura3d.asset-inspection/1.0";
  readonly file: string;
  readonly format: string;
  readonly sizeBytes: number;
  readonly bounds?: readonly [number, number, number];
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly materials: readonly string[];
  readonly materialMetadata?: readonly AuraCliMaterialInspection[];
  readonly animations: readonly string[];
  readonly animation?: AuraCliAnimationInspection;
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly skeleton?: AuraCliSkeletonInspection;
  readonly morphTargets?: AuraCliMorphTargetInspection;
  readonly provenance?: Partial<AuraCliAssetProvenance>;
  readonly textures: readonly string[];
  readonly orientation?: AuraCliOrientationInspection;
  readonly nodeNames?: readonly string[];
  readonly dependencies: readonly string[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

export interface InspectAssetOptions {
  readonly projectDir?: string;
  readonly file: string;
  readonly animation?: boolean;
  readonly humanoid?: boolean;
  readonly skeleton?: boolean;
  readonly morphs?: boolean;
  readonly license?: boolean;
}

export interface CharacterAssemblyPlanOptions {
  readonly projectDir?: string;
  readonly name: string;
  readonly body: string;
  readonly parts?: readonly CharacterAssemblyPartInput[];
  readonly scale?: number;
  readonly output?: string;
}

export interface CharacterAssemblyPartInput {
  readonly slot: string;
  readonly asset: string;
  readonly attachTo?: string;
}

export interface CharacterAssemblyPlanResult {
  readonly ok: boolean;
  readonly schema: "aura3d.character-assembly/1.0";
  readonly name: string;
  readonly output: string;
  readonly body: CharacterAssemblyResolvedPart;
  readonly parts: readonly CharacterAssemblyResolvedPart[];
  readonly validation: {
    readonly failures: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly messages: readonly string[];
}

export interface CharacterAssemblyResolvedPart {
  readonly slot: string;
  readonly asset: string;
  readonly url: string;
  readonly type: AuraCliAssetType;
  readonly format: string;
  readonly animations: readonly string[];
  readonly humanoid?: AuraCliHumanoidInspection;
  readonly attachTo: string;
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
  const inspection = inspectAssetFile(sourcePath, format);
  const outputFileName = `${options.name}.${hash.slice(0, 8)}.${format}`;
  const outputPath = join(outputDir, outputFileName);
  if (options.copy !== false) {
    mkdirSync(resolve(projectDir, outputDir), { recursive: true });
    copyFileSync(sourcePath, resolve(projectDir, outputPath));
    copyAssetDependencies(projectDir, sourcePath, outputDir, inspection.dependencies);
  }
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
    boundsMetadata: inspection.boundsMetadata,
    materials: inspection.materials,
    materialMetadata: inspection.materialMetadata,
    animations: inspection.animations,
    animationMetadata: inspection.animation,
    humanoid: inspection.humanoid,
    skeleton: inspection.skeleton,
    morphTargets: inspection.morphTargets,
    provenance: createAssetProvenance(projectDir, sourcePath, options, inspection.provenance),
    textures: inspection.textures,
    dependencies: inspection.dependencies,
    orientation: inspection.orientation,
    nodeNames: inspection.nodeNames,
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
    if (!["glb", "gltf", "png", "jpg", "jpeg", "webp", "ktx2", "hdr", "exr", "mp3", "wav", "ogg"].includes(format)) continue;
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

export function inspectAsset(options: InspectAssetOptions): AssetInspectionReport {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const sourcePath = resolve(projectDir, options.file);
  if (!existsSync(sourcePath)) {
    throw new Error(`Aura3D assets inspect failed: "${options.file}" does not exist.`);
  }
  const format = extname(sourcePath).slice(1).toLowerCase();
  const inspection = inspectAssetFile(sourcePath, format);
  const warnings = createAssetWarnings(sourcePath, inspection);
  return {
    ok: warnings.length === 0,
    schema: "aura3d.asset-inspection/1.0",
    file: normalizeRelativePath(relative(projectDir, sourcePath)),
    format,
    sizeBytes: statSync(sourcePath).size,
    bounds: inspection.bounds,
    boundsMetadata: inspection.boundsMetadata,
    materials: inspection.materials,
    materialMetadata: inspection.materialMetadata,
    animations: inspection.animations,
    ...(options.animation ? { animation: inspection.animation } : {}),
    ...(options.humanoid ? { humanoid: inspection.humanoid } : {}),
    ...(options.skeleton ? { skeleton: inspection.skeleton } : {}),
    ...(options.morphs ? { morphTargets: inspection.morphTargets } : {}),
    ...(options.license ? { provenance: createAssetProvenance(projectDir, sourcePath, {}, inspection.provenance) } : {}),
    textures: inspection.textures,
    orientation: inspection.orientation,
    nodeNames: inspection.nodeNames,
    dependencies: inspection.dependencies,
    warnings,
    messages: warnings.length === 0 ? ["Asset inspection completed."] : warnings
  };
}

export function validateAssets(options: AssetValidationOptions = {}): AssetValidationResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const manifestMissing = !existsSync(manifestPath);
  const sourceManifest = readAssetManifest(projectDir);
  const manifest = filterAssetManifest(sourceManifest, options.assetIds);
  const externalProvenance = readExternalProvenance(projectDir, options.provenanceFile);
  const failures: string[] = manifestMissing
    ? [`Missing ${DEFAULT_AURA_ASSET_MANIFEST}. Suggested fix: run aura3d assets add ./asset.glb --name product or aura3d assets scan ./assets.`]
    : [];
  const missingAssetIds = findMissingAssetIds(sourceManifest, options.assetIds);
  for (const id of missingAssetIds) failures.push(`Requested asset "${id}" was not found in ${DEFAULT_AURA_ASSET_MANIFEST}.`);
  if (options.provenanceFile && !existsSync(resolve(projectDir, options.provenanceFile))) {
    failures.push(`Missing asset provenance evidence file: ${options.provenanceFile}`);
  }
  const warnings: string[] = [];
  for (const asset of manifest.assets) {
    const outputPath = resolve(projectDir, asset.outputPath);
    if (!existsSync(outputPath)) {
      failures.push(`Missing asset output for "${asset.id}": ${asset.outputPath}`);
      continue;
    }
    const actualHash = `sha256-${hashFile(outputPath)}`;
    if (actualHash !== asset.hash) failures.push(`Hash mismatch for "${asset.id}": expected ${asset.hash}, found ${actualHash}`);
    const provenance = resolveAssetProvenance(asset, externalProvenance);
    if (options.noPlaceholders && isPlaceholderAsset(asset, provenance)) {
      failures.push(`Placeholder asset is not allowed in strict release validation: "${asset.id}". Replace it with a real typed asset and provenance.`);
    }
    if (options.requireLicense && !hasUsableLicenseEvidence(provenance)) {
      failures.push(`Missing license/provenance evidence for "${asset.id}". Add it with assets add --license ... --source-url ... or pass --provenance <evidence.json>.`);
    }
    warnings.push(...asset.warnings.map((warning) => `${asset.id}: ${warning}`));
    if (asset.format === "gltf") {
      for (const dependency of asset.dependencies ?? asset.textures) {
        if (dependency.startsWith("data:")) continue;
        const sourceDependencyPath = resolve(dirname(resolve(projectDir, asset.source)), dependency);
        const outputDependencyPath = resolve(dirname(resolve(projectDir, asset.outputPath)), dependency);
        if (!existsSync(sourceDependencyPath) && !existsSync(outputDependencyPath)) {
          failures.push(`Missing referenced asset dependency for "${asset.id}": ${dependency}`);
        }
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
        animationClips: asset.animations,
        animationMetadata: asset.animationMetadata ?? createReadinessAnimationMetadata(asset.animations),
        humanoid: asset.humanoid?.humanoid ?? false,
        humanoidStatus: asset.humanoid?.status ?? "unknown",
        humanoidConfidence: asset.humanoid?.confidence ?? "low",
        skeleton: asset.skeleton,
        morphTargets: asset.morphTargets,
        provenance: asset.provenance,
        sourcePath: asset.source,
        outputPath: asset.outputPath,
        license: asset.provenance?.license,
        author: asset.provenance?.author,
        boundsMetadata: asset.boundsMetadata,
        materialMetadata: asset.materialMetadata,
        orientation: asset.orientation,
        nodeNames: asset.nodeNames ?? [],
        textures: asset.textures,
        dependencies: asset.dependencies ?? [],
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

export function validateGameAssets(options: AssetReadinessOptions = {}): AssetReadinessReport {
  return validateAssetReadiness("game", options);
}

export function validateCartoonAssets(options: AssetReadinessOptions = {}): AssetReadinessReport {
  return validateAssetReadiness("cartoon", options);
}

export function createCharacterAssemblyPlan(options: CharacterAssemblyPlanOptions): CharacterAssemblyPlanResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readAssetManifest(projectDir);
  const failures: string[] = [];
  const warnings: string[] = [];
  const output = normalizeRelativePath(options.output ?? `src/aura-character-${sanitizeAssetId(options.name)}.assembly.json`);
  const bodyAsset = manifest.assets.find((asset) => asset.id === options.body);
  if (!bodyAsset) {
    failures.push(`Missing body asset "${options.body}". Add it first with aura3d assets add ./body.glb --name ${options.body}.`);
  } else if (bodyAsset.type !== "model") {
    failures.push(`Body asset "${options.body}" must be a model asset, found ${bodyAsset.type}.`);
  } else if (bodyAsset.humanoid && !bodyAsset.humanoid.humanoid) {
    warnings.push(`Body asset "${options.body}" has humanoid status "${bodyAsset.humanoid.status}"; character assembly can still compose parts, but acting and retargeting may be limited.`);
  }
  const resolvePart = (part: CharacterAssemblyPartInput): CharacterAssemblyResolvedPart | undefined => {
    const asset = manifest.assets.find((entry) => entry.id === part.asset);
    if (!asset) {
      failures.push(`Missing ${part.slot} part asset "${part.asset}".`);
      return undefined;
    }
    if (asset.type !== "model") warnings.push(`${part.slot}: "${part.asset}" is ${asset.type}; character assembly expects model parts for rig/attachment safety.`);
    return {
      slot: part.slot,
      asset: part.asset,
      url: asset.url,
      type: asset.type,
      format: asset.format,
      animations: asset.animations,
      humanoid: asset.humanoid,
      attachTo: part.attachTo ?? defaultAttachPoint(part.slot)
    };
  };
  const parts = (options.parts ?? []).map(resolvePart).filter((part): part is CharacterAssemblyResolvedPart => Boolean(part));
  const body: CharacterAssemblyResolvedPart = bodyAsset
    ? {
        slot: "body",
        asset: bodyAsset.id,
        url: bodyAsset.url,
        type: bodyAsset.type,
        format: bodyAsset.format,
        animations: bodyAsset.animations,
        humanoid: bodyAsset.humanoid,
        attachTo: "root"
      }
    : {
        slot: "body",
        asset: options.body,
        url: "",
        type: "model",
        format: "missing",
        animations: [],
        attachTo: "root"
      };
  const plan = {
    schema: "aura3d.character-assembly/1.0",
    name: options.name,
    output,
    scale: options.scale ?? 1,
    body,
    parts,
    rules: {
      normalizeScale: true,
      facePositiveZ: true,
      preserveTypedAssetReferences: true,
      requireNamedAttachments: true
    }
  };
  mkdirSync(dirname(resolve(projectDir, output)), { recursive: true });
  writeFileSync(resolve(projectDir, output), `${JSON.stringify(plan, null, 2)}\n`);
  return {
    ok: failures.length === 0,
    schema: "aura3d.character-assembly/1.0",
    name: options.name,
    output,
    body,
    parts,
    validation: { failures, warnings },
    messages: failures.length === 0
      ? [`Wrote ${output}. Import typed assets from src/aura-assets.ts and compose with model(assets.${options.body}).`]
      : failures
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

function validateAssetReadiness(profile: AuraAssetReadinessProfile, options: AssetReadinessOptions): AssetReadinessReport {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const gameProfile = profile === "game" ? options.gameProfile : undefined;
  const sourceManifest = readAssetManifest(projectDir);
  const manifest = filterAssetManifest(sourceManifest, options.assetIds);
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  const evidencePath = options.output ? resolve(projectDir, options.output) : undefined;
  const validation = validateAssets({
    projectDir,
    noPlaceholders: options.noPlaceholders,
    requireLicense: options.requireLicense,
    provenanceFile: options.provenanceFile,
    assetIds: options.assetIds
  });
  const externalProvenance = readExternalProvenance(projectDir, options.provenanceFile);
  const failures = [...validation.failures];
  const warnings = [...validation.warnings];
  const modelAssets = manifest.assets.filter((asset) => asset.type === "model");
  const animatedModels = modelAssets.filter((asset) => asset.animations.length > 0);
  const animationClips = manifest.assets.reduce((total, asset) => total + asset.animations.length, 0);
  const humanoidModels = modelAssets.filter((asset) => asset.humanoid?.humanoid).length;
  const artifacts = createReadinessArtifacts(projectDir, manifest, evidencePath);
  const assets = manifest.assets.map((asset) => {
    const provenance = resolveAssetProvenance(asset, externalProvenance);
    const placeholderFree = !isPlaceholderAsset(asset, provenance);
    const licenseVerified = hasUsableLicenseEvidence(provenance);
    const assetWarnings = [...asset.warnings];
    const readinessIssues = createAssetReadinessIssues(profile, asset);
    const profileIssues = gameProfile === "fighting-character"
      ? createFightingCharacterReadinessIssues(asset, provenance, licenseVerified)
      : { failures: [] as string[], warnings: [] as string[] };
    if (asset.type === "model" && !asset.bounds) assetWarnings.push("Missing bounds; camera framing, collision proxies, and thumbnail composition will be weaker.");
    if (asset.type === "model" && asset.materials.length === 0) assetWarnings.push("No material names detected; authored visual diagnostics will be limited.");
    if (asset.type === "model" && asset.sizeBytes > 50 * 1024 * 1024) assetWarnings.push("Large model over 50MB; consider mesh/texture optimization before browser deployment.");
    if (asset.type === "model" && asset.animations.length > 0 && asset.humanoid?.status === "unknown") assetWarnings.push("Animated model has unknown humanoid status; inspect with --humanoid before using it as an acted character.");
    assetWarnings.push(...readinessIssues.warnings);
    assetWarnings.push(...profileIssues.warnings);
    pushUnique(failures, [...readinessIssues.failures, ...profileIssues.failures]);
    pushUnique(warnings, [...readinessIssues.warnings, ...profileIssues.warnings]);
    const gameReady = asset.type === "model" && Boolean(asset.bounds) && asset.materials.length > 0 && asset.sizeBytes <= 50 * 1024 * 1024 && readinessIssues.failures.length === 0 && profileIssues.failures.length === 0;
    const cartoonReady = asset.type === "model"
      ? Boolean(asset.bounds) && (asset.animations.length > 0 || /prop|set|stage|background|environment/i.test(asset.id))
      : asset.type === "audio" || asset.type === "texture";
    const artifactPaths = artifacts.assetFiles.find((entry) => entry.id === asset.id) ?? createReadinessAssetArtifacts(projectDir, manifest, asset);
    return {
      id: asset.id,
      type: asset.type,
      format: asset.format,
      source: asset.source,
      outputPath: asset.outputPath,
      url: asset.url,
      sizeBytes: asset.sizeBytes,
      bounds: asset.bounds,
      boundsMetadata: asset.boundsMetadata,
      animations: asset.animations,
      animation: createReadinessAnimationMetadata(asset.animations),
      animationMetadata: asset.animationMetadata,
      humanoid: asset.humanoid,
      skeleton: asset.skeleton,
      morphTargets: asset.morphTargets,
      provenance,
      placeholderFree,
      licenseVerified,
      materials: asset.materials,
      materialMetadata: asset.materialMetadata,
      textures: asset.textures,
      orientation: asset.orientation,
      nodeNames: asset.nodeNames,
      artifactPaths,
      gameReady,
      cartoonReady,
      warnings: assetWarnings
    };
  });
  if (profile === "game") {
    if (modelAssets.length === 0) failures.push("Game readiness requires at least one typed model asset. Add a GLB/GLTF with aura3d assets add ./fighter.glb --name fighter.");
    if (animatedModels.length === 0) warnings.push("No animated model clips detected. Static scenes can ship, but playable character showcases should include idle/walk/attack/hurt clips.");
    if (animatedModels.length > 0 && humanoidModels === 0) warnings.push("No humanoid model metadata detected. Character-heavy game routes should confirm humanoid status with assets inspect --humanoid and typed asset metadata.");
    for (const asset of assets) {
      if (asset.type !== "model") continue;
      if (!asset.gameReady) warnings.push(`${asset.id}: not game-ready yet; expected bounds, named materials, and browser-sized payload.`);
    }
    if (gameProfile === "fighting-character") {
      if (modelAssets.length < 1) failures.push("fighting-character profile requires at least one typed fighter model.");
      if (animatedModels.length < modelAssets.length) failures.push("fighting-character profile requires every selected model asset to include embedded animation clips.");
      if (humanoidModels < modelAssets.length) failures.push("fighting-character profile requires every selected model asset to include humanoid/skeleton metadata.");
    }
  } else {
    if (modelAssets.length === 0) failures.push("Cartoon readiness requires at least one typed model/set/prop GLB or GLTF.");
    if (animatedModels.length === 0) warnings.push("No animated character clips detected. Prompt-to-episode output can use transform animation, but character acting needs skeletal or pose clips.");
    if (animatedModels.length > 0 && humanoidModels === 0) warnings.push("No humanoid model metadata detected. Acting-heavy cartoon routes should confirm character rigs with assets inspect --humanoid.");
    const audioAssets = manifest.assets.filter((asset) => asset.type === "audio");
    if (audioAssets.length === 0) warnings.push("No audio assets detected. AuraVoice bridge can still reference external narration manifests, but local episode proof is stronger with audio registered.");
  }
  const ok = failures.length === 0;
  const baseMessage = ok
    ? `${profile === "game" ? "Game" : "Cartoon"} asset readiness report completed.`
    : failures;
  const messages = [
    ...(Array.isArray(baseMessage) ? baseMessage : [baseMessage]),
    ...(evidencePath ? [`Wrote asset readiness evidence: ${normalizeRelativePath(relative(projectDir, evidencePath))}`] : [])
  ];
  const report: AssetReadinessReport = {
    schema: "aura3d.asset-readiness/1.0",
    profile,
    ...(gameProfile ? { gameProfile } : {}),
    ok,
    status: ok ? "passed" : "failed",
    validator: createReadinessValidatorEvidence(profile),
    checkedAt: new Date().toISOString(),
    manifestPath,
    artifacts,
    contracts: createReadinessValidationContracts(profile),
    summary: {
      totalAssets: manifest.assets.length,
      modelAssets: modelAssets.length,
      animatedModels: animatedModels.length,
      textureAssets: manifest.assets.filter((asset) => asset.type === "texture").length,
      audioAssets: manifest.assets.filter((asset) => asset.type === "audio").length,
      environmentAssets: manifest.assets.filter((asset) => asset.type === "environment").length,
      animationClips,
      humanoidModels
    },
    assets,
    failures,
    warnings,
    messages
  };
  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function filterAssetManifest(manifest: AuraCliAssetManifest, assetIds?: readonly string[]): AuraCliAssetManifest {
  const normalized = normalizeAssetIdFilter(assetIds);
  if (normalized.length === 0) return manifest;
  const allowed = new Set(normalized);
  return {
    ...manifest,
    assets: manifest.assets.filter((asset) => allowed.has(asset.id))
  };
}

function findMissingAssetIds(manifest: AuraCliAssetManifest, assetIds?: readonly string[]): readonly string[] {
  const normalized = normalizeAssetIdFilter(assetIds);
  if (normalized.length === 0) return [];
  const existing = new Set(manifest.assets.map((asset) => asset.id));
  return normalized.filter((id) => !existing.has(id));
}

function normalizeAssetIdFilter(assetIds?: readonly string[]): readonly string[] {
  return [...new Set((assetIds ?? []).map((id) => id.trim()).filter(Boolean))];
}

function createReadinessValidatorEvidence(profile: AuraAssetReadinessProfile): AssetReadinessValidatorEvidence {
  return profile === "game"
    ? {
        id: "aura-clash-game-assets",
        command: "assets validate-game",
        label: "AuraClash game asset validator"
      }
    : {
        id: "aura-voice-cartoon-assets",
        command: "assets validate-cartoon",
        label: "AuraVoice cartoon asset validator"
      };
}

function createReadinessValidationContracts(profile: AuraAssetReadinessProfile): readonly AssetReadinessValidationContract[] {
  if (profile === "game") {
    return [
      {
        id: "quaternius-game-ready-fighter-validation-contract",
        label: "Quaternius-derived game-ready fighter validation contract",
        profile: "game",
        sourceFamily: "Quaternius",
        intendedUse: "fighter",
        sourceOnly: true,
        requiredChecks: [
          "typed Aura model asset entry generated by assets add",
          "Quaternius provenance or source-family metadata",
          "GLB/GLTF model with browser-sized payload",
          "bounds with grounded pivot and fighter-scale dimensions",
          "forward-facing +z or z orientation before runtime mirroring",
          "humanoid skeleton metadata suitable for retarget diagnostics",
          "readable visible materials and texture budget",
          "thumbnail or first-frame artifact path",
          "non-empty named fighting animation clips",
          "no floating hair-only assembly without a body/head anchor"
        ],
        requiredAnimationClips: ["idle", "walk", "lightPunch"],
        evidenceBoundary:
          "This CLI contract is source-only. It does not prove a Quaternius fighter passed validation until assets validate-game output and retained runtime/browser evidence are archived."
      }
    ];
  }

  return [
    {
      id: "auravoice-cartoon-character-asset-validation-contract",
      label: "AuraVoice cartoon asset validation contract",
      profile: "cartoon",
      sourceFamily: "AuraVoice",
      intendedUse: "cartoon-character",
      sourceOnly: true,
      requiredChecks: [
        "typed Aura model, texture, audio, or environment asset entry",
        "bounds for model/set composition",
        "animation or transform-ready character metadata",
        "audio or external AuraVoice manifest references for stronger episode proof"
      ],
      evidenceBoundary:
        "This CLI contract is source-only. It does not prove cartoon route readiness until validate-cartoon output, rendered frames, timing proof, and AuraVoice evidence are archived."
    }
  ];
}

function createReadinessArtifacts(projectDir: string, manifest: AuraCliAssetManifest, evidencePath?: string): AssetReadinessArtifacts {
  const artifacts: {
    evidencePath?: string;
    manifestPath: string;
    typedAssetsPath: string;
    outputDir: string;
    assetBasePath: string;
    assetFiles: readonly AssetReadinessAssetArtifacts[];
  } = {
    manifestPath: resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST),
    typedAssetsPath: resolve(projectDir, manifest.typegen),
    outputDir: resolve(projectDir, manifest.outputDir),
    assetBasePath: manifest.assetBasePath,
    assetFiles: manifest.assets.map((asset) => createReadinessAssetArtifacts(projectDir, manifest, asset))
  };
  if (evidencePath) artifacts.evidencePath = evidencePath;
  return artifacts;
}

function createReadinessAssetArtifacts(projectDir: string, manifest: AuraCliAssetManifest, asset: AuraCliAssetEntry): AssetReadinessAssetArtifacts {
  const artifact: {
    id: string;
    sourcePath: string;
    outputPath: string;
    publicUrl: string;
    thumbnailPath?: string;
    thumbnailUrl?: string;
    dependencyPaths: readonly string[];
  } = {
    id: asset.id,
    sourcePath: resolve(projectDir, asset.source),
    outputPath: resolve(projectDir, asset.outputPath),
    publicUrl: asset.url,
    dependencyPaths: (asset.dependencies ?? []).map((dependency) => resolve(dirname(resolve(projectDir, asset.outputPath)), dependency))
  };
  if (asset.thumbnailUrl) {
    artifact.thumbnailUrl = asset.thumbnailUrl;
    const thumbnailPath = resolvePublicArtifactPath(projectDir, manifest, asset.thumbnailUrl);
    if (thumbnailPath) artifact.thumbnailPath = thumbnailPath;
  }
  return artifact;
}

function createReadinessAnimationMetadata(animations: readonly string[]): AssetReadinessAnimationMetadata {
  return {
    clipCount: animations.length,
    clips: animations.map((name, index) => ({ index, name }))
  };
}

function createAssetReadinessIssues(
  profile: AuraAssetReadinessProfile,
  asset: AuraCliAssetEntry
): { readonly failures: readonly string[]; readonly warnings: readonly string[] } {
  if (asset.type !== "model") return { failures: [], warnings: [] };
  const failures: string[] = [];
  const warnings: string[] = [];
  const prefix = `${asset.id}:`;
  const characterLike = isCharacterLikeAsset(asset);

  if (profile === "game" && characterLike) {
    const missing = missingRequiredGameClips(asset.animations);
    if (missing.length > 0) {
      failures.push(`${prefix} missing required game animation clip${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
    }
  }

  const emptyClips = (asset.animationMetadata?.clips ?? []).filter((clip) => clip.channelCount === 0 || clip.samplerCount === 0);
  for (const clip of emptyClips) {
    failures.push(`${prefix} animation clip "${clip.name}" is empty; expected at least one channel and sampler.`);
  }

  const bounds = asset.boundsMetadata;
  if (bounds && bounds.maxDimension > 50) {
    failures.push(`${prefix} oversized bounds detected; largest dimension is ${bounds.maxDimension}m, expected at most 50m for browser game assets.`);
  } else if (bounds && characterLike && bounds.maxDimension > 4) {
    warnings.push(`${prefix} character-sized model is unusually large (${bounds.maxDimension}m); confirm scale before using it in gameplay.`);
  }
  if (bounds && characterLike && !bounds.grounded) {
    warnings.push(`${prefix} bounds are not grounded at the pivot; min.y is ${bounds.min[1]}m.`);
  }

  const orientation = asset.orientation;
  if (profile === "game" && characterLike && orientation?.forwardAxis && !["+z", "z"].includes(orientation.forwardAxis.toLowerCase())) {
    failures.push(`${prefix} wrong facing direction "${orientation.forwardAxis}"; fighting-game characters are expected to face +z before runtime mirroring.`);
  }

  const invisibleMaterials = (asset.materialMetadata ?? []).filter((material) => !material.visible || !material.readable);
  for (const material of invisibleMaterials) {
    failures.push(`${prefix} invisible or unreadable material "${material.name}" detected${material.reasons.length ? ` (${material.reasons.join("; ")})` : ""}.`);
  }

  if (profile === "game" && hasFloatingHairRisk(asset)) {
    failures.push(`${prefix} floating hair risk detected; hair-only geometry must be assembled onto a body/head with assets assemble-character before game validation.`);
  }

  return { failures, warnings };
}

function createFightingCharacterReadinessIssues(
  asset: AuraCliAssetEntry,
  provenance: AuraCliAssetProvenance | undefined,
  licenseVerified: boolean
): { readonly failures: readonly string[]; readonly warnings: readonly string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  const prefix = `${asset.id}:`;

  if (asset.type !== "model") {
    failures.push(`${prefix} fighting-character profile requires a model asset, found ${asset.type}.`);
    return { failures, warnings };
  }

  if (asset.format !== "glb" && asset.format !== "gltf") {
    failures.push(`${prefix} fighting-character profile requires GLB/GLTF model input, found ${asset.format}.`);
  }

  if (!licenseVerified) {
    failures.push(`${prefix} fighting-character profile requires verified redistributable license/provenance evidence.`);
  }

  if (!provenance?.sourceUrl && !provenance?.sourceFamily) {
    failures.push(`${prefix} fighting-character profile requires catalog/source provenance for release evidence.`);
  }

  if (asset.animations.length === 0) {
    failures.push(`${prefix} fighting-character profile requires embedded animation clips.`);
  }

  const missing = missingRequiredGameClips(asset.animations);
  if (missing.length > 0) {
    failures.push(`${prefix} fighting-character profile missing required animation clip${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }

  const skeletonJointCount = asset.skeleton?.jointCount ?? 0;
  if (!asset.humanoid?.humanoid && skeletonJointCount < 6) {
    failures.push(`${prefix} fighting-character profile requires humanoid metadata or at least 6 skeleton joints; found ${skeletonJointCount}.`);
  }

  const metadataRisk = findFightingCharacterMetadataRisk(asset);
  if (metadataRisk) {
    failures.push(`${prefix} fighting-character profile rejects ${metadataRisk.kind} metadata "${metadataRisk.term}"; use complete, original, license-safe humanoid fighter assets.`);
  }

  if (!asset.boundsMetadata) {
    failures.push(`${prefix} fighting-character profile requires bounds metadata for scale, ground, and lane checks.`);
  } else {
    const bounds = asset.boundsMetadata;
    const height = bounds.size[1];
    if (bounds.maxDimension > 4.5) {
      failures.push(`${prefix} fighting-character profile bounds too large (${bounds.maxDimension}m max); expected character-scale <= 4.5m.`);
    }
    if (height < 0.75) {
      failures.push(`${prefix} fighting-character profile height ${height}m is too small for a readable humanoid fighter.`);
    }
    if (!bounds.grounded) {
      warnings.push(`${prefix} fighting-character profile bounds are not grounded at pivot; min.y is ${bounds.min[1]}m.`);
    }
  }

  if (asset.materials.length === 0) {
    failures.push(`${prefix} fighting-character profile requires at least one readable material.`);
  }

  if (asset.sizeBytes > 50 * 1024 * 1024) {
    failures.push(`${prefix} fighting-character profile payload is ${asset.sizeBytes} bytes; expected <= 52428800 for browser gameplay.`);
  }

  return { failures, warnings };
}

function isCharacterLikeAsset(asset: AuraCliAssetEntry): boolean {
  if (asset.humanoid?.humanoid) return true;
  return /fighter|player|opponent|enemy|hero|character|avatar|humanoid|npc|body|mara/i.test(asset.id);
}

function findFightingCharacterMetadataRisk(asset: AuraCliAssetEntry): { readonly kind: "non-character" | "IP-risk"; readonly term: string } | undefined {
  const text = [
    asset.id,
    asset.source,
    asset.provenance?.sourceUrl ?? "",
    asset.provenance?.sourceFamily ?? "",
    asset.provenance?.author ?? "",
    ...(asset.nodeNames ?? []),
    ...asset.materials,
  ].join(" ").toLowerCase();

  const ipRiskTerms = [
    "fan art",
    "fanart",
    "copyright",
    "copyrighted",
    "ripped",
    "pokemon",
    "mario",
    "sonic",
    "naruto",
    "dragon ball",
    "fortnite",
    "marvel",
    "dc comics",
    "star wars",
    "disney",
  ];
  const ipRisk = ipRiskTerms.find((term) => text.includes(term));
  if (ipRisk) return { kind: "IP-risk", term: ipRisk };

  const nonCharacterTerms = [
    "aircraft",
    "airplane",
    "vehicle",
    "building",
    "architecture",
    "environment",
    "terrain",
    "prop",
    "furniture",
    "sculpt",
    "sculpture",
    "statue",
    "bust",
    "figurine",
    "miniature",
    "photogrammetry",
    "pedestal",
    "spider",
    "animal",
    "quadruped",
    "creature",
    "insect",
    "dragon",
    "dinosaur",
    "horse",
    "dog",
    "cat",
    "bird",
    "fish",
  ];
  const nonCharacter = nonCharacterTerms.find((term) => text.includes(term));
  if (nonCharacter) return { kind: "non-character", term: nonCharacter };

  return undefined;
}

function missingRequiredGameClips(animations: readonly string[]): readonly string[] {
  const normalized = animations.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const hasNamed = (patterns: readonly RegExp[]) => normalized.some((name) => patterns.some((pattern) => pattern.test(name)));
  const missing: string[] = [];
  if (!hasNamed([/idle/, /stand/])) missing.push("idle");
  if (!hasNamed([/walk/, /locomotion/, /move/])) missing.push("walk");
  if (!hasNamed([/lightpunch/, /lightattack/, /light/, /jab/, /punch/, /attack/])) missing.push("lightPunch");
  return missing;
}

function hasFloatingHairRisk(asset: AuraCliAssetEntry): boolean {
  const names = [asset.id, ...(asset.nodeNames ?? [])].join(" ").toLowerCase();
  if (!names.includes("hair")) return false;
  const hasBodyAnchor = /body|torso|spine|chest|head|neck|skull|face|hips|pelvis/.test(names);
  return !hasBodyAnchor;
}

function pushUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function resolvePublicArtifactPath(projectDir: string, manifest: AuraCliAssetManifest, url: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return undefined;
  if (url.startsWith(manifest.assetBasePath)) {
    return resolve(projectDir, manifest.outputDir, url.slice(manifest.assetBasePath.length));
  }
  return resolve(projectDir, url.replace(/^\//, "public/"));
}

function defaultAttachPoint(slot: string): string {
  const normalized = slot.toLowerCase();
  if (normalized.includes("hair") || normalized.includes("hat") || normalized.includes("face")) return "head";
  if (normalized.includes("hand") || normalized.includes("weapon") || normalized.includes("prop")) return "rightHand";
  if (normalized.includes("shoe") || normalized.includes("boot")) return "feet";
  if (normalized.includes("cape") || normalized.includes("back")) return "spine";
  return "root";
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
  readonly boundsMetadata?: AuraCliAssetBoundsInspection;
  readonly materials: readonly string[];
  readonly materialMetadata: readonly AuraCliMaterialInspection[];
  readonly animations: readonly string[];
  readonly animation: AuraCliAnimationInspection;
  readonly humanoid: AuraCliHumanoidInspection;
  readonly skeleton: AuraCliSkeletonInspection;
  readonly morphTargets: AuraCliMorphTargetInspection;
  readonly provenance?: Partial<AuraCliAssetProvenance>;
  readonly textures: readonly string[];
  readonly orientation: AuraCliOrientationInspection;
  readonly nodeNames: readonly string[];
  readonly dependencies: readonly string[];
}

function inspectAssetFile(path: string, format: string): AssetInspection {
  if (format === "gltf") return inspectGltf(JSON.parse(readFileSync(path, "utf8")) as GltfJson, dirname(path));
  if (format === "glb") return inspectGlb(readFileSync(path), dirname(path));
  return {
    materials: [],
    materialMetadata: [],
    animations: [],
    animation: emptyAnimationInspection(),
    humanoid: unknownHumanoidInspection("Humanoid detection is only available for GLB/glTF model assets."),
    skeleton: emptySkeletonInspection("Skeleton detection is only available for GLB/glTF model assets."),
    morphTargets: emptyMorphTargetInspection("Morph target detection is only available for GLB/glTF model assets."),
    textures: [],
    orientation: unknownOrientationInspection(),
    nodeNames: [],
    dependencies: [],
    bounds: undefined
  };
}

interface GltfJson {
  readonly asset?: { readonly extras?: unknown };
  readonly accessors?: readonly { readonly min?: readonly number[]; readonly max?: readonly number[] }[];
  readonly materials?: readonly {
    readonly name?: string;
    readonly alphaMode?: string;
    readonly alphaCutoff?: number;
    readonly pbrMetallicRoughness?: { readonly baseColorFactor?: readonly number[] };
    readonly extras?: unknown;
  }[];
  readonly animations?: readonly {
    readonly name?: string;
    readonly channels?: readonly {
      readonly sampler?: number;
      readonly target?: {
        readonly node?: number;
        readonly path?: string;
      };
    }[];
    readonly samplers?: readonly unknown[];
  }[];
  readonly images?: readonly { readonly uri?: string; readonly name?: string }[];
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly nodes?: readonly { readonly name?: string; readonly mesh?: number; readonly skin?: number; readonly children?: readonly number[]; readonly extras?: unknown }[];
  readonly skins?: readonly { readonly name?: string; readonly joints?: readonly number[]; readonly skeleton?: number }[];
  readonly meshes?: readonly {
    readonly name?: string;
    readonly weights?: readonly number[];
    readonly extras?: unknown;
    readonly primitives?: readonly { readonly targets?: readonly unknown[]; readonly extras?: unknown }[];
  }[];
}

function inspectGlb(buffer: Buffer, baseDir?: string): AssetInspection {
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb).");
  const length = buffer.readUInt32LE(8);
  if (length > buffer.length) throw new Error("Invalid GLB length. Suggested fix: run assets validate on the original export.");
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString("utf8", 16, 20);
  if (chunkType !== "JSON") throw new Error("Invalid GLB JSON chunk. Suggested fix: re-export the GLB.");
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + chunkLength).trim()) as GltfJson;
  return inspectGltf(json, baseDir);
}

function inspectGltf(json: GltfJson, baseDir?: string): AssetInspection {
  const dependencies = [
    ...(json.images ?? []).map((image) => image.uri).filter(isExternalUri),
    ...(json.buffers ?? []).map((buffer) => buffer.uri).filter(isExternalUri)
  ];
  if (baseDir) {
    const missing = dependencies.filter((dependency) => !existsSync(resolve(baseDir, dependency)));
    if (missing.length > 0) {
      throw new Error(`Aura3D assets add failed: referenced asset file missing: ${missing.join(", ")}. Suggested fix: keep external .bin and texture files beside the .gltf or export as .glb.`);
    }
  }
  const boundsMetadata = extractBoundsDetails(json);
  return {
    bounds: boundsMetadata?.size,
    boundsMetadata,
    materials: (json.materials ?? []).map((material, index) => material.name ?? `material-${index}`),
    materialMetadata: inspectGltfMaterials(json),
    animations: (json.animations ?? []).map((animation, index) => animation.name ?? `clip-${index}`),
    animation: inspectGltfAnimations(json),
    humanoid: inspectGltfHumanoid(json),
    skeleton: inspectGltfSkeleton(json),
    morphTargets: inspectGltfMorphTargets(json),
    provenance: inspectGltfProvenance(json),
    textures: (json.images ?? []).map((image, index) => image.uri ?? image.name ?? `image-${index}`),
    orientation: inspectGltfOrientation(json),
    nodeNames: (json.nodes ?? []).map((node, index) => node.name ?? `node-${index}`),
    dependencies
  };
}

function emptyAnimationInspection(): AuraCliAnimationInspection {
  return {
    clipCount: 0,
    clips: [],
    messages: ["No embedded animation clips detected."]
  };
}

function inspectGltfAnimations(json: GltfJson): AuraCliAnimationInspection {
  const clips = (json.animations ?? []).map((animation, index): AuraCliAnimationClipInspection => {
    const channels = animation.channels ?? [];
    const targetPaths = uniqueStrings(channels.map((channel) => channel.target?.path).filter(isString));
    const targetNodes = uniqueStrings(channels.map((channel) => {
      const nodeIndex = channel.target?.node;
      return typeof nodeIndex === "number" ? json.nodes?.[nodeIndex]?.name ?? `node-${nodeIndex}` : undefined;
    }).filter(isString));
    return {
      index,
      name: animation.name ?? `clip-${index}`,
      channelCount: channels.length,
      samplerCount: animation.samplers?.length ?? 0,
      targetPaths,
      targetNodes
    };
  });
  return {
    clipCount: clips.length,
    clips,
    messages: clips.length === 0
      ? ["No embedded animation clips detected."]
      : [`Detected ${clips.length} embedded animation clip${clips.length === 1 ? "" : "s"}.`]
  };
}

function inspectGltfHumanoid(json: GltfJson): AuraCliHumanoidInspection {
  const skinCount = json.skins?.length ?? 0;
  const jointIndexes = uniqueNumbers((json.skins ?? []).flatMap((skin) => skin.joints ?? []));
  const jointNames = uniqueStrings(jointIndexes.map((index) => json.nodes?.[index]?.name ?? `joint-${index}`));
  const nodeNames = uniqueStrings((json.nodes ?? []).map((node, index) => node.name ?? `node-${index}`));
  const candidates = jointNames.length > 0 ? jointNames : nodeNames;
  const requiredBones = ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;
  const matchedBones = requiredBones.filter((bone) => candidates.some((name) => matchesHumanoidBone(name, bone)));
  const missingBones = requiredBones.filter((bone) => !matchedBones.includes(bone));
  const hasSkin = jointIndexes.length > 0;
  const hasTorso = matchedBones.includes("hips") && matchedBones.includes("spine") && matchedBones.includes("head");
  const hasArms = matchedBones.includes("leftArm") && matchedBones.includes("rightArm");
  const hasLegs = matchedBones.includes("leftLeg") && matchedBones.includes("rightLeg");
  const humanoid = (hasSkin && hasTorso && hasArms && hasLegs) || (!hasSkin && hasTorso && matchedBones.length >= 5);
  const status: AuraCliHumanoidStatus = humanoid
    ? "humanoid"
    : hasSkin || matchedBones.length > 0
      ? "unknown"
      : "non-humanoid";
  const confidence: AuraCliHumanoidConfidence = humanoid && hasSkin
    ? "high"
    : humanoid || (hasSkin && matchedBones.length >= 5)
      ? "medium"
      : "low";
  return {
    humanoid,
    status,
    confidence,
    skinCount,
    jointCount: jointIndexes.length,
    matchedBones,
    missingBones,
    messages: humanoid
      ? [`Humanoid signals detected from ${hasSkin ? "skinned joints" : "node names"}.`]
      : status === "unknown"
        ? [`Humanoid status is unknown; missing bone groups: ${missingBones.join(", ")}.`]
        : ["No humanoid skeleton signals detected."]
  };
}

function inspectGltfSkeleton(json: GltfJson): AuraCliSkeletonInspection {
  const skins = (json.skins ?? []).map((skin, index): AuraCliSkeletonSkinInspection => {
    const joints = (skin.joints ?? []).map((jointIndex) => json.nodes?.[jointIndex]?.name ?? `joint-${jointIndex}`);
    const skeletonIndex = skin.skeleton;
    return {
      index,
      name: skin.name ?? `skin-${index}`,
      jointCount: joints.length,
      joints,
      ...(typeof skeletonIndex === "number" ? { skeleton: json.nodes?.[skeletonIndex]?.name ?? `node-${skeletonIndex}` } : {})
    };
  });
  const jointCount = uniqueStrings(skins.flatMap((skin) => skin.joints)).length;
  return {
    skinCount: skins.length,
    jointCount,
    skins,
    messages: skins.length === 0
      ? ["No skin/skeleton metadata detected."]
      : [`Detected ${skins.length} skin${skins.length === 1 ? "" : "s"} with ${jointCount} unique joint${jointCount === 1 ? "" : "s"}.`]
  };
}

function emptySkeletonInspection(message: string): AuraCliSkeletonInspection {
  return {
    skinCount: 0,
    jointCount: 0,
    skins: [],
    messages: [message]
  };
}

function inspectGltfMorphTargets(json: GltfJson): AuraCliMorphTargetInspection {
  const meshes = (json.meshes ?? []).map((mesh, index): AuraCliMorphTargetMeshInspection | undefined => {
    const meshExtras = objectValue(mesh.extras);
    const namedTargets = stringArrayValue(meshExtras?.targetNames ?? meshExtras?.morphTargetNames);
    const targetCount = Math.max(
      namedTargets.length,
      mesh.weights?.length ?? 0,
      ...(mesh.primitives ?? []).map((primitive) => primitive.targets?.length ?? 0)
    );
    if (targetCount === 0) return undefined;
    const targetNames = targetCount > 0
      ? Array.from({ length: targetCount }, (_, targetIndex) => namedTargets[targetIndex] ?? `target-${targetIndex}`)
      : [];
    return {
      index,
      name: mesh.name ?? `mesh-${index}`,
      targetNames
    };
  }).filter((mesh): mesh is AuraCliMorphTargetMeshInspection => Boolean(mesh));
  const targetNames = uniqueStrings(meshes.flatMap((mesh) => mesh.targetNames));
  return {
    targetCount: targetNames.length,
    targetNames,
    meshes,
    messages: targetNames.length === 0
      ? ["No morph target metadata detected."]
      : [`Detected ${targetNames.length} morph target${targetNames.length === 1 ? "" : "s"}.`]
  };
}

function emptyMorphTargetInspection(message: string): AuraCliMorphTargetInspection {
  return {
    targetCount: 0,
    targetNames: [],
    meshes: [],
    messages: [message]
  };
}

function inspectGltfProvenance(json: GltfJson): Partial<AuraCliAssetProvenance> | undefined {
  const assetExtras = objectValue(json.asset?.extras);
  const auraExtras = objectValue(assetExtras?.aura3d) ?? assetExtras;
  const provenance = objectValue(auraExtras?.provenance ?? auraExtras?.license ?? auraExtras?.source);
  const sourceUrl = stringValue(provenance?.sourceUrl ?? provenance?.url ?? auraExtras?.sourceUrl);
  const license = stringValue(provenance?.license ?? provenance?.spdx ?? auraExtras?.license);
  const author = stringValue(provenance?.author ?? provenance?.creator ?? auraExtras?.author);
  const sourceFamily = stringValue(provenance?.sourceFamily ?? provenance?.source ?? auraExtras?.sourceFamily);
  const attribution = stringValue(provenance?.attribution ?? auraExtras?.attribution);
  const evidence = stringArrayValue(provenance?.evidence ?? auraExtras?.evidence);
  if (!sourceUrl && !license && !author && !sourceFamily && !attribution && evidence.length === 0) return undefined;
  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(license ? { license } : {}),
    ...(author ? { author } : {}),
    ...(sourceFamily ? { sourceFamily } : {}),
    ...(attribution ? { attribution } : {}),
    ...(evidence.length > 0 ? { evidence } : {})
  };
}

function unknownHumanoidInspection(message: string): AuraCliHumanoidInspection {
  return {
    humanoid: false,
    status: "unknown",
    confidence: "low",
    skinCount: 0,
    jointCount: 0,
    matchedBones: [],
    missingBones: ["hips", "spine", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"],
    messages: [message]
  };
}

function matchesHumanoidBone(name: string, bone: "hips" | "spine" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg"): boolean {
  const raw = name.toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, "");
  const left = compact.includes("left") || /(^|[^a-z0-9])l([^a-z0-9]|$)/.test(raw) || /[^a-z0-9]l$/.test(raw);
  const right = compact.includes("right") || /(^|[^a-z0-9])r([^a-z0-9]|$)/.test(raw) || /[^a-z0-9]r$/.test(raw);
  const arm = compact.includes("arm") || compact.includes("forearm") || compact.includes("shoulder") || compact.includes("hand");
  const leg = compact.includes("leg") || compact.includes("thigh") || compact.includes("foot") || compact.includes("toe");
  if (bone === "hips") return compact.includes("hip") || compact.includes("pelvis");
  if (bone === "spine") return compact.includes("spine") || compact.includes("chest") || compact.includes("torso");
  if (bone === "head") return compact.includes("head") || compact.includes("neck");
  if (bone === "leftArm") return left && arm;
  if (bone === "rightArm") return right && arm;
  if (bone === "leftLeg") return left && leg;
  return right && leg;
}

function isExternalUri(uri: string | undefined): uri is string {
  return typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:");
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values)];
}

function extractBoundsDetails(json: GltfJson): AuraCliAssetBoundsInspection | undefined {
  let min: [number, number, number] | undefined;
  let max: [number, number, number] | undefined;
  for (const accessor of json.accessors ?? []) {
    if (!accessor.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) continue;
    min = min ? [Math.min(min[0], accessor.min[0]), Math.min(min[1], accessor.min[1]), Math.min(min[2], accessor.min[2])] : [accessor.min[0], accessor.min[1], accessor.min[2]];
    max = max ? [Math.max(max[0], accessor.max[0]), Math.max(max[1], accessor.max[1]), Math.max(max[2], accessor.max[2])] : [accessor.max[0], accessor.max[1], accessor.max[2]];
  }
  if (!min || !max) return undefined;
  const size = [round(max[0] - min[0]), round(max[1] - min[1]), round(max[2] - min[2])] as const;
  const center = [round((min[0] + max[0]) / 2), round((min[1] + max[1]) / 2), round((min[2] + max[2]) / 2)] as const;
  const roundedMin = [round(min[0]), round(min[1]), round(min[2])] as const;
  const roundedMax = [round(max[0]), round(max[1]), round(max[2])] as const;
  return {
    min: roundedMin,
    max: roundedMax,
    size,
    center,
    maxDimension: Math.max(...size),
    grounded: Math.abs(roundedMin[1]) <= 0.08
  };
}

function inspectGltfMaterials(json: GltfJson): readonly AuraCliMaterialInspection[] {
  return (json.materials ?? []).map((material, index) => {
    const name = material.name ?? `material-${index}`;
    const extras = objectValue(material.extras);
    const explicitVisible = booleanValue(extras?.visible);
    const explicitReadable = booleanValue(extras?.readable);
    const opacity = round(numberValue(material.pbrMetallicRoughness?.baseColorFactor?.[3]) ?? 1);
    const alphaMode = material.alphaMode;
    const alphaCutoff = numberValue(material.alphaCutoff);
    const reasons: string[] = [];
    if (opacity <= 0) reasons.push("baseColorFactor alpha is 0");
    if (alphaMode === "MASK" && (alphaCutoff ?? 0.5) >= 1) reasons.push("alpha mask cutoff hides fully transparent surfaces");
    if (explicitVisible === false) reasons.push("material extras mark visible=false");
    if (explicitReadable === false) reasons.push("material extras mark readable=false");
    const visible = explicitVisible ?? (opacity > 0 && !(alphaMode === "MASK" && (alphaCutoff ?? 0.5) >= 1));
    const readable = explicitReadable ?? visible;
    return {
      name,
      visible,
      readable,
      opacity,
      ...(alphaMode ? { alphaMode } : {}),
      reasons
    };
  });
}

function inspectGltfOrientation(json: GltfJson): AuraCliOrientationInspection {
  const assetExtras = objectValue(json.asset?.extras);
  const auraExtras = objectValue(assetExtras?.aura3d) ?? assetExtras;
  const orientation = objectValue(auraExtras?.orientation) ?? auraExtras;
  const forwardAxis = stringValue(orientation?.forwardAxis ?? orientation?.forward ?? orientation?.facing);
  const upAxis = stringValue(orientation?.upAxis ?? orientation?.up);
  if (!forwardAxis && !upAxis) return unknownOrientationInspection();
  return {
    source: "gltf-extras",
    ...(forwardAxis ? { forwardAxis } : {}),
    ...(upAxis ? { upAxis } : {}),
    messages: [`Orientation metadata detected${forwardAxis ? ` with forwardAxis=${forwardAxis}` : ""}${upAxis ? ` and upAxis=${upAxis}` : ""}.`]
  };
}

function unknownOrientationInspection(): AuraCliOrientationInspection {
  return {
    source: "unknown",
    messages: ["No orientation metadata detected; facing direction cannot be proven."]
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => stringValue(entry)).filter((entry): entry is string => Boolean(entry));
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function createAssetWarnings(path: string, inspection: AssetInspection): readonly string[] {
  const warnings: string[] = [];
  const size = statSync(path).size;
  if (size > 25 * 1024 * 1024) warnings.push("asset exceeds 25 MB; consider compression before deployment");
  if (!inspection.bounds) warnings.push("bounds could not be extracted");
  if (inspection.textures.length === 0 && ["glb", "gltf"].includes(extname(path).slice(1).toLowerCase())) warnings.push("no texture references detected");
  if (inspection.orientation.source === "unknown" && ["glb", "gltf"].includes(extname(path).slice(1).toLowerCase())) warnings.push("orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis");
  if (inspection.materialMetadata.some((material) => !material.visible || !material.readable)) warnings.push("one or more materials are invisible or unreadable");
  return warnings;
}

function createAssetProvenance(
  projectDir: string,
  sourcePath: string,
  options: Pick<AddAssetOptions, "sourceUrl" | "license" | "author" | "sourceFamily" | "attribution">,
  detected?: Partial<AuraCliAssetProvenance>
): AuraCliAssetProvenance {
  return {
    sourcePath: normalizeRelativePath(relative(projectDir, sourcePath)),
    ...(options.sourceUrl ?? detected?.sourceUrl ? { sourceUrl: options.sourceUrl ?? detected?.sourceUrl } : {}),
    ...(options.license ?? detected?.license ? { license: options.license ?? detected?.license } : {}),
    ...(options.author ?? detected?.author ? { author: options.author ?? detected?.author } : {}),
    ...(options.sourceFamily ?? detected?.sourceFamily ? { sourceFamily: options.sourceFamily ?? detected?.sourceFamily } : {}),
    ...(options.attribution ?? detected?.attribution ? { attribution: options.attribution ?? detected?.attribution } : {}),
    ...(detected?.evidence && detected.evidence.length > 0 ? { evidence: detected.evidence } : {}),
    checkedAt: new Date().toISOString()
  };
}

function readExternalProvenance(projectDir: string, provenanceFile?: string): ReadonlyMap<string, AuraCliAssetProvenance> {
  if (!provenanceFile) return new Map();
  const path = resolve(projectDir, provenanceFile);
  if (!existsSync(path)) return new Map();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const root = objectValue(parsed);
  if (!root) return new Map();
  const checkedAt = stringValue(root.updatedAt ?? root.verifiedAt ?? root.checkedAt) ?? new Date().toISOString();
  const records = [
    ...arrayObjectValue(root.launchGlbs),
    ...arrayObjectValue(root.assets),
    ...arrayObjectValue(root.assetEvidence)
  ];
  const byId = new Map<string, AuraCliAssetProvenance>();
  for (const record of records) {
    const typedAsset = stringValue(record.typedAsset);
    const id = stringValue(record.assetKey ?? record.id) ?? typedAsset?.replace(/^assets\./, "");
    if (!id) continue;
    const nestedProvenance = objectValue(record.provenance);
    const sourcePath = stringValue(record.sourcePath ?? record.source ?? nestedProvenance?.builderOutput) ?? id;
    const license = stringValue(record.license ?? record.licenseNote ?? nestedProvenance?.license);
    const sourceUrl = stringValue(record.sourceUrl ?? record.publicUrl ?? record.officialPage ?? nestedProvenance?.sourceUrl);
    const sourceFamily = stringValue(record.sourceFamily ?? nestedProvenance?.sourceFamily ?? nestedProvenance?.sourcePack);
    const author = stringValue(record.author ?? nestedProvenance?.author);
    const attribution = stringValue(record.attribution ?? record.credit ?? nestedProvenance?.attribution);
    const evidence = [
      ...stringArrayValue(record.evidence),
      ...stringArrayValue(record.intendedRouteUsage),
      ...stringArrayValue(nestedProvenance?.evidence)
    ];
    byId.set(id, {
      sourcePath,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(license ? { license } : {}),
      ...(author ? { author } : {}),
      ...(sourceFamily ? { sourceFamily } : {}),
      ...(attribution ? { attribution } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
      checkedAt
    });
  }
  return byId;
}

function arrayObjectValue(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => objectValue(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function resolveAssetProvenance(asset: AuraCliAssetEntry, externalProvenance: ReadonlyMap<string, AuraCliAssetProvenance>): AuraCliAssetProvenance | undefined {
  return asset.provenance ?? externalProvenance.get(asset.id);
}

function hasUsableLicenseEvidence(provenance: AuraCliAssetProvenance | undefined): boolean {
  const license = provenance?.license?.trim();
  if (!license) return false;
  return !/(unverified|unknown|candidate|needs[-\s]?confirmation|todo|placeholder)/i.test(license);
}

function isPlaceholderAsset(asset: AuraCliAssetEntry, provenance?: AuraCliAssetProvenance): boolean {
  const value = [
    asset.id,
    asset.source,
    asset.outputPath,
    asset.url,
    provenance?.sourcePath,
    provenance?.sourceUrl
  ].filter(Boolean).join(" ");
  return /(^|[-_./\s])(placeholder|dummy|mock|todo|replace-me|sample-placeholder)([-_./\s]|$)/i.test(value);
}

function copyAssetDependencies(projectDir: string, sourcePath: string, outputDir: string, dependencies: readonly string[]): void {
  const sourceDir = dirname(sourcePath);
  for (const dependency of dependencies) {
    if (dependency.startsWith("data:")) continue;
    const sourceDependencyPath = resolve(sourceDir, dependency);
    const outputDependencyPath = resolve(projectDir, outputDir, dependency);
    mkdirSync(dirname(outputDependencyPath), { recursive: true });
    copyFileSync(sourceDependencyPath, outputDependencyPath);
  }
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
  if (["mp3", "wav", "ogg"].includes(format)) return "audio";
  throw new Error(`Unsupported Aura3D asset format: ${format || "unknown"}. Suggested fix: use glb, gltf, png, jpg, webp, ktx2, hdr, exr, mp3, wav, or ogg.`);
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
