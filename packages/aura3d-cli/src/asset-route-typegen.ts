import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { scanAssetSourceAst } from "./asset-source-ast.js";
import { readAssetManifest, resolveTypedAssetApi } from "./asset-manifest.js";
import type {
  AuraCliAssetEntry,
  AuraCliAssetManifest,
} from "./index.js";

/**
 * PRD-05 §6.8/R11 — per-route typegen. `assets typegen --route apps/<app>`
 * scans the route's `src/` for `assets.<id>` references (the same AST scanner
 * `assets validate --source` uses) and emits `src/aura-assets.route.ts` with
 * only those ids. Route modules carry transport fields only — licence and
 * suitability strings go to `dist/credits.json`, never into the bundle.
 */

export type RouteTypegenVariant = "optimized" | "source" | "mobile";

export interface WriteRouteTypedAssetsOptions {
  readonly projectDir?: string;
  readonly route: string;
  readonly variant?: RouteTypegenVariant;
  readonly manifest?: AuraCliAssetManifest;
}

export interface RouteCreditsRow {
  readonly license?: string;
  readonly licenseName?: string;
  readonly licenseUrl?: string;
  readonly author?: string;
  readonly attribution?: string;
  readonly sourcePage?: string;
  readonly sourceUrl?: string;
  readonly retrievedAt?: string;
}

export interface WriteRouteTypedAssetsResult {
  readonly ok: boolean;
  readonly path: string;
  readonly creditsPath: string;
  readonly referencedIds: readonly string[];
  readonly missingIds: readonly string[];
  readonly scannedFiles: number;
}

const ROUTE_MODULE_NAME = "aura-assets.route.ts";
const ROUTE_MODULE_BASENAME = "aura-assets.route";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]);

export function writeRouteTypedAssets(options: WriteRouteTypedAssetsOptions): WriteRouteTypedAssetsResult {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = options.manifest ?? readAssetManifest(projectDir);
  const routeDir = resolve(projectDir, options.route);
  const variant = options.variant ?? "optimized";

  const sourceFiles = collectSourceFiles(join(routeDir, "src"));
  const referenced = new Set<string>();
  for (const file of sourceFiles) {
    const report = scanAssetSourceAst(relative(routeDir, file), readFileSync(file, "utf8"));
    for (const usage of report.typedAssetUsages) referenced.add(usage.assetId);
  }
  const referencedIds = [...referenced].sort();
  const entries = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const missingIds = referencedIds.filter((id) => !entries.has(id));
  const emitted = referencedIds
    .map((id) => entries.get(id))
    .filter((asset): asset is AuraCliAssetEntry => Boolean(asset))
    .map((asset) => routeModuleEntry(asset, variant));

  const path = join(routeDir, "src", ROUTE_MODULE_NAME);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderRouteModule(emitted, variant, resolveTypedAssetApi(routeDir)));

  const creditsPath = join(routeDir, "dist", "credits.json");
  mkdirSync(dirname(creditsPath), { recursive: true });
  const credits = Object.fromEntries(
    emitted
      .map((entry) => [entry.id, creditsRow(entry.asset)] as const)
      .filter((pair): pair is readonly [string, RouteCreditsRow] => pair[1] !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    creditsPath,
    `${JSON.stringify(
      {
        schema: "aura3d.asset-credits/1.0",
        route: options.route,
        generatedAt: new Date().toISOString(),
        assets: credits,
      },
      null,
      2,
    )}\n`,
  );

  return {
    ok: missingIds.length === 0,
    path,
    creditsPath,
    referencedIds,
    missingIds,
    scannedFiles: sourceFiles.length,
  };
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) stack.push(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === ROUTE_MODULE_NAME || entry.name.endsWith(".d.ts")) continue;
      const dot = entry.name.lastIndexOf(".");
      if (dot > 0 && SOURCE_EXTENSIONS.has(entry.name.slice(dot))) out.push(path);
    }
  }
  return out.sort();
}

interface RouteModuleEntry {
  readonly id: string;
  readonly asset: AuraCliAssetEntry;
  readonly url: string;
  readonly hash: string;
  readonly requiredDecoders?: readonly string[];
  readonly lods?: readonly { readonly level: number; readonly triangles: number; readonly screenCoverage: number }[];
  readonly colliderUrl?: string;
  readonly budget?: { readonly triangles: number; readonly gpuBytesHigh: number };
  readonly variants?: { readonly source?: string; readonly mobile?: string };
  /** Source-bound transport identity for an admitted scalar volume. */
  readonly integrity?: AuraCliAssetEntry["integrity"];
  readonly formatMetadata?: AuraCliAssetEntry["formatMetadata"];
  readonly metadata?: { readonly outputPath: string };
}

function normalizeSha256(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(?:sha256-)?([a-f0-9]{64})$/i.exec(value);
  return match ? `sha256-${match[1]!.toLowerCase()}` : undefined;
}

/**
 * Route generation never reads asset bytes or invents dependency digests. The
 * source admission record is the only currently available scalar-volume
 * identity, including the exact relative names in a detached header.
 */
function scalarSourceIdentity(asset: AuraCliAssetEntry): {
  readonly hash: string;
  readonly integrity: NonNullable<AuraCliAssetEntry["integrity"]>;
  readonly metadata: { readonly outputPath: string };
} {
  const fail = (message: string): never => { throw new Error(`Scalar-volume asset ${JSON.stringify(asset.id)}: ${message}`); };
  const hash = normalizeSha256(asset.hash ?? asset.sha256);
  if (!hash || (asset.sha256 !== undefined && normalizeSha256(asset.sha256) !== hash)) {
    return fail("a consistent admitted SHA-256 source hash is required.");
  }
  if (typeof asset.format !== "string" || !["nrrd", "nhdr"].includes(asset.format.toLowerCase())) {
    return fail("the source format must be nrrd or nhdr.");
  }
  if (typeof asset.url !== "string" || !asset.url) return fail("the admitted source URL is required.");
  const sourceIntegrity = asset.integrity;
  if (!sourceIntegrity || sourceIntegrity.version !== 1 || normalizeSha256(sourceIntegrity.digest) !== hash ||
      sourceIntegrity.requireDependencies !== true || !sourceIntegrity.dependencies ||
      typeof sourceIntegrity.dependencies !== "object" || Array.isArray(sourceIntegrity.dependencies)) {
    return fail("source integrity and complete dependency policy are required.");
  }
  const pairs = Object.entries(sourceIntegrity.dependencies).map(([reference, digest]) => {
    const normalized = normalizeSha256(digest);
    if (!reference || reference !== reference.normalize("NFC") || /[\u0000-\u001f\u007f\\:%?#]/u.test(reference) ||
        reference.startsWith("/") || reference.split("/").some((part) => !part || part === "." || part === "..") || !normalized) {
      return fail("a dependency reference or SHA-256 digest is invalid.");
    }
    return [reference, normalized] as const;
  });
  const references = asset.dependencies ?? [];
  if (!Array.isArray(references) || references.some((reference) => typeof reference !== "string" || !reference) ||
      new Set(references).size !== references.length || references.length !== pairs.length ||
      references.some((reference) => !Object.hasOwn(sourceIntegrity.dependencies!, reference))) {
    return fail("the admitted dependency list and integrity map must match.");
  }
  const outputPath = asset.outputPath;
  const normalizedPath = typeof outputPath === "string" ? outputPath.replaceAll("\\", "/") : "";
  if (!normalizedPath || /[\u0000-\u001f\u007f]/u.test(normalizedPath) || normalizedPath.startsWith("/") || /^[A-Za-z]:/.test(normalizedPath) ||
      normalizedPath.split("/").some((part) => !part || part === "." || part === "..")) {
    return fail("the staged output path must be a safe project-relative path.");
  }
  return {
    hash,
    integrity: { version: 1, digest: hash, dependencies: Object.fromEntries(pairs), requireDependencies: true },
    metadata: { outputPath },
  };
}

function routeModuleEntry(asset: AuraCliAssetEntry, variant: RouteTypegenVariant): RouteModuleEntry {
  const derived = asset.derived;
  const sourceUrl = asset.url;
  const url =
    variant === "source" ? sourceUrl
      : variant === "mobile" ? derived?.mobileUrl ?? derived?.url ?? sourceUrl
        : derived?.url ?? sourceUrl;
  const hash = variant === "source" ? asset.hash : derived?.hash ?? asset.hash;
  if ((asset.type as string) === "scalar-volume") {
    const source = scalarSourceIdentity(asset);
    // The manifest has no independent dependency inventory for derived or
    // mobile scalar volumes. A matching root hash alone is insufficient when
    // a different URL can resolve a different detached child.
    if (url !== sourceUrl || (variant !== "source" && derived?.url === sourceUrl &&
        normalizeSha256(derived.hash) !== source.hash)) {
      throw new Error(`Scalar-volume asset ${JSON.stringify(asset.id)}: the selected variant has no independently bound dependency integrity.`);
    }
    return {
      id: asset.id,
      asset,
      url,
      hash: source.hash,
      integrity: source.integrity,
      metadata: source.metadata,
      ...(asset.formatMetadata ? { formatMetadata: asset.formatMetadata } : {}),
    };
  }
  const budget = derived?.measurements?.after
    ? {
      triangles: derived.measurements.after.triangles,
      gpuBytesHigh: derived.measurements.after.gpuBytesByTier?.high ?? 0,
    }
    : undefined;
  const variants = derived && (derived.url !== sourceUrl || derived.mobileUrl)
    ? { source: sourceUrl, mobile: derived.mobileUrl }
    : undefined;
  return {
    id: asset.id,
    asset,
    url,
    hash,
    requiredDecoders: variant === "source" ? undefined : derived?.requiredDecoders,
    lods: derived?.lods,
    colliderUrl: derived?.collisionUrl,
    budget,
    variants,
  };
}

/** Render JSON data as a safe TypeScript literal, including `__proto__` keys. */
function routeLiteral(value: unknown): string {
  const raw = JSON.stringify(value, null, 2);
  if (raw === undefined) throw new TypeError("Route asset metadata cannot be serialized.");
  return raw.split("\n")
    .map((line) => line.replace(/^(\s*)"__proto__":/, '$1["__proto__"]:'))
    .join("\n");
}

function creditsRow(asset: AuraCliAssetEntry): RouteCreditsRow | undefined {
  const provenance = asset.provenance;
  if (!provenance) return undefined;
  const row: RouteCreditsRow = {
    license: provenance.license,
    licenseName: provenance.licenseName,
    licenseUrl: provenance.licenseUrl,
    author: provenance.author,
    attribution: provenance.attribution,
    sourcePage: provenance.sourcePage,
    sourceUrl: provenance.sourceUrl ?? provenance.downloadUrl,
    retrievedAt: provenance.retrievedAt,
  };
  return Object.values(row).some((value) => value !== undefined) ? row : undefined;
}

function renderRouteModule(entries: readonly RouteModuleEntry[], variant: RouteTypegenVariant, publicAssetApi: "@aura3d/lean" | "@aura3d/engine"): string {
  const declarationLines = entries.map((entry) => {
    const bounds = entry.asset.bounds ? " readonly bounds: readonly [number, number, number];" : "";
    const integrity = entry.integrity
      ? " readonly integrity: { readonly version: 1; readonly digest: string; readonly dependencies: Readonly<Record<string, string>>; readonly requireDependencies: true };"
      : "";
    const metadata = entry.metadata ? " readonly metadata: { readonly outputPath: string };" : "";
    const fields =
      ` readonly type: ${JSON.stringify(entry.asset.type)};` +
      ` readonly format: ${JSON.stringify(entry.asset.format)};` +
      ` readonly url: string; readonly hash: string;` +
      ` readonly sizeBytes: number;${bounds}` +
      ` readonly requiredDecoders?: readonly ("meshopt" | "draco" | "ktx2")[];` +
      ` readonly lods?: readonly { readonly level: number; readonly triangles: number; readonly screenCoverage: number }[];` +
      ` readonly colliderUrl?: string;` +
      ` readonly budget?: { readonly triangles: number; readonly gpuBytesHigh: number };` +
      ` readonly variants?: { readonly source?: string; readonly mobile?: string };` + integrity + metadata;
    return `  readonly ${JSON.stringify(entry.id)}: AuraAssetDefinition & {${fields} };`;
  });
  const entryLines = entries.map((entry) => {
    const asset = entry.asset;
    const lines = [
      `  ${JSON.stringify(entry.id)}: {`,
      `    type: ${JSON.stringify(asset.type)},`,
      `    format: ${JSON.stringify(asset.format)},`,
      `    url: ${JSON.stringify(entry.url)},`,
      `    hash: ${JSON.stringify(entry.hash)},`,
      ...(entry.integrity ? [`    integrity: ${routeLiteral(entry.integrity)},`] : []),
      ...(entry.formatMetadata ? [`    formatMetadata: ${routeLiteral(entry.formatMetadata)},`] : []),
      ...(entry.metadata ? [`    metadata: ${routeLiteral(entry.metadata)},`] : []),
      `    bounds: ${JSON.stringify(asset.bounds ?? [0, 0, 0])},`,
      `    sizeBytes: ${asset.sizeBytes},`,
    ];
    if (entry.requiredDecoders && entry.requiredDecoders.length > 0) {
      lines.push(`    requiredDecoders: ${JSON.stringify(entry.requiredDecoders)},`);
    }
    if (entry.lods && entry.lods.length > 0) {
      lines.push(`    lods: ${JSON.stringify(entry.lods)},`);
    }
    if (entry.colliderUrl) lines.push(`    colliderUrl: ${JSON.stringify(entry.colliderUrl)},`);
    if (entry.budget) lines.push(`    budget: ${JSON.stringify(entry.budget)},`);
    if (entry.variants) lines.push(`    variants: ${JSON.stringify(entry.variants)},`);
    lines.push("  },");
    return lines.join("\n");
  });
  return [
    `// Generated by \`aura3d assets typegen --route\` (variant: ${variant}).`,
    `// Transport fields only — licence/provenance data ships in dist/credits.json.`,
    `import { defineAuraAssets } from ${JSON.stringify(publicAssetApi)};`,
    `import type { AuraAssetDefinition, AuraAssetMap } from ${JSON.stringify(publicAssetApi)};`,
    "",
    "type AuraGeneratedRouteAssetDefinitions = {",
    ...declarationLines,
    "};",
    "",
    "export const assets: AuraAssetMap<AuraGeneratedRouteAssetDefinitions> = defineAuraAssets({",
    ...entryLines,
    "} as const);",
    "",
    "export type AuraGeneratedRouteAssets = typeof assets;",
    "",
  ].join("\n");
}

export { ROUTE_MODULE_BASENAME };
