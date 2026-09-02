import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_AURA_ASSET_MANIFEST,
  DEFAULT_AURA_ASSET_OUTPUT_DIR,
  DEFAULT_AURA_ASSET_PUBLIC_PATH,
  DEFAULT_AURA_ASSET_TYPEGEN,
} from "./asset-constants.js";
import type {
  AuraCliAssetEntry,
  AuraCliAssetManifest,
} from "./index.js";

export function readAssetManifest(projectDir: string): AuraCliAssetManifest {
  const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
  if (!existsSync(manifestPath)) {
    return {
      schema: "aura3d.assets/1.0",
      assetBasePath: DEFAULT_AURA_ASSET_PUBLIC_PATH,
      outputDir: DEFAULT_AURA_ASSET_OUTPUT_DIR,
      typegen: DEFAULT_AURA_ASSET_TYPEGEN,
      assets: [],
    };
  }
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isAssetManifest(parsed)) {
    const schema = schemaField(parsed);
    throw new Error(`Unsupported Aura3D asset manifest schema: ${String(schema)}`);
  }
  return parsed;
}

export function writeAssetManifest(projectDir: string, manifest: AuraCliAssetManifest): void {
  writeFileSync(resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function writeTypedAssets(projectDir: string, manifest = readAssetManifest(projectDir)): string {
  const path = resolve(projectDir, manifest.typegen);
  mkdirSync(dirname(path), { recursive: true });
  const publicAssetApi = resolveTypedAssetApi(projectDir);
  const lines = [
    `import { defineAuraAssets } from ${JSON.stringify(publicAssetApi)};`,
    `import type { AuraAssetDefinition, AuraAssetMap } from ${JSON.stringify(publicAssetApi)};`,
    "",
    "type AuraGeneratedAssetDefinitions = {",
    ...manifest.assets.map((asset) => {
      const bounds = asset.bounds
        ? " readonly bounds: readonly [number, number, number];"
        : "";
      // Keep the generated declaration compact enough for very large asset
      // manifests while preserving the required fields consumers are allowed
      // to rely on. `AuraAssetDefinition` intentionally models partially known
      // external assets, so url/hash/bounds are optional there; a generated
      // manifest entry has already validated and written these exact fields.
      return `  readonly ${JSON.stringify(asset.id)}: AuraAssetDefinition & { readonly type: ${JSON.stringify(asset.type)}; readonly format: ${JSON.stringify(asset.format)}; readonly url: string; readonly hash: string;${bounds} };`;
    }),
    "};",
    "",
    "export const assets: AuraAssetMap<AuraGeneratedAssetDefinitions> = defineAuraAssets({",
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
        hierarchy: asset.hierarchy,
        // Keep provider task IDs and settings in the durable manifest, not public game source.
        provenance: asset.provenance ? { ...asset.provenance, generation: undefined } : undefined,
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
        thumbnailUrl: asset.thumbnailUrl,
        quality: asset.quality ?? "ungraded",
        role: asset.role ?? "unknown",
        suitabilityReason: asset.suitabilityReason,
        renderedProbe: asset.renderedProbe,
        gameGeometry: asset.gameGeometry,
      };
      return [
        `  ${JSON.stringify(asset.id)}: {`,
        formatField("type", asset.type),
        formatField("format", asset.format),
        formatField("url", asset.url),
        formatField("hash", asset.hash),
        formatField("bounds", asset.bounds ?? [0, 0, 0]),
        `    sizeBytes: ${asset.sizeBytes},`,
        formatField("metadata", metadata),
        "  },",
      ].join("\n");
    }),
    "} as const);",
    "",
    "export type AuraGeneratedAssets = typeof assets;",
    "",
  ];
  writeFileSync(path, lines.join("\n"));
  return path;
}

function resolveTypedAssetApi(projectDir: string): "@aura3d/lean" | "@aura3d/engine" {
  const packagePath = resolve(projectDir, "package.json");
  if (!existsSync(packagePath)) return "@aura3d/engine";
  try {
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
      readonly dependencies?: Record<string, string>;
      readonly devDependencies?: Record<string, string>;
    };
    const hasEngine = manifest.dependencies?.["@aura3d/engine"] !== undefined
      || manifest.devDependencies?.["@aura3d/engine"] !== undefined;
    if (hasEngine) return "@aura3d/engine";
    const hasLean = manifest.dependencies?.["@aura3d/lean"] !== undefined
      || manifest.devDependencies?.["@aura3d/lean"] !== undefined;
    return hasLean ? "@aura3d/lean" : "@aura3d/engine";
  } catch {
    return "@aura3d/engine";
  }
}

export function listAssets(options: { readonly projectDir?: string } = {}): readonly AuraCliAssetEntry[] {
  return readAssetManifest(resolve(options.projectDir ?? process.cwd())).assets;
}

function formatField(name: string, value: unknown): string {
  return `    ${name}: ${formatLiteral(value, 4)},`;
}

function formatLiteral(value: unknown, indent: number): string {
  const raw = JSON.stringify(value, null, 2);
  if (raw === undefined) return "undefined";
  return raw
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${" ".repeat(indent)}${line}`))
    .join("\n");
}

function createReadinessAnimationMetadata(animations: readonly string[]): {
  readonly clipCount: number;
  readonly clips: readonly { readonly index: number; readonly name: string }[];
} {
  return {
    clipCount: animations.length,
    clips: animations.map((name, index) => ({ index, name })),
  };
}

function isAssetManifest(value: unknown): value is AuraCliAssetManifest {
  return value !== null &&
    typeof value === "object" &&
    "schema" in value &&
    value.schema === "aura3d.assets/1.0" &&
    "assets" in value &&
    Array.isArray(value.assets);
}

function schemaField(value: unknown): unknown {
  if (value === null || typeof value !== "object" || !("schema" in value)) return undefined;
  return value.schema;
}
