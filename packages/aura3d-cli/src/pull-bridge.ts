/**
 * CLI pull-on-demand bridge.
 *
 * Wires `@aura3d/asset-index` (federated free-GLB search) into the existing
 * `assets add` typing/hashing pipeline so an agent can go from a natural-language
 * query to a typed `assets.<name>` ref.
 *
 * Two surfaces:
 *   - `assets search <query>`  — rank + print candidates, label what is/ isn't
 *     auto-pullable, and surface marketplace deep-links when nothing is.
 *   - `assets resolve <query> --name <name>` — pick the top AUTO-PULLABLE
 *     candidate, download its .glb, and run the normal `addAsset` flow.
 *
 * License safety mirrors the index: we NEVER auto-pull an UNVERIFIED or
 * deep-link-only asset. `selectPullable` is the single decision seam and is
 * deliberately pure so it can be unit-tested without a network or the CLI.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as assetIndex from "@aura3d/asset-index";
import type {
  AuraCanonicalAsset,
  FederatedResolver as FederatedResolverType,
  ResolveCandidate,
  ResolveConstraints,
  ResolveResult,
  SourceAdapter,
} from "@aura3d/asset-index";
import { addAsset } from "./index.js";
import type { AssetCliResult } from "./index.js";

const {
  FederatedResolver,
  defaultAdapters,
  isAutoPullable,
} = assetIndex;

/**
 * Optional, concurrently-authored adapter factories. They may not be exported
 * yet (other agents own those files), so we look them up off the module
 * namespace at runtime instead of hard-importing — a missing factory simply
 * means that source is unavailable, not a build break.
 */
type AdapterFactory = () => SourceAdapter;

function optionalFactory(name: string): AdapterFactory | undefined {
  const candidate = (assetIndex as Record<string, unknown>)[name];
  return typeof candidate === "function" ? (candidate as AdapterFactory) : undefined;
}

/** True only when a non-empty env var is present (used to gate keyed sources). */
function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Assemble the live source adapters for the CLI:
 *   - the zero-auth verified defaults (Khronos, OS3A, + Poly Haven when present),
 *   - key-gated sources only when their API key env var is set,
 * Each optional factory degrades to "absent" rather than throwing.
 */
export function buildSearchAdapters(
  env: NodeJS.ProcessEnv = process.env,
): SourceAdapter[] {
  // Primary: the hosted ~850k Aura3D catalog via its `/search` endpoint (hybrid
  // keyword + semantic + quality ranking). It already aggregates Objaverse,
  // Sketchfab, Poly Pizza, Poly Haven, OS3A, Khronos and the CC0 mirror, so it
  // supersedes per-source live federation. Fall back to live sources only if the
  // hosted-catalog adapter isn't available in this build.
  const auraIndex = optionalFactory("createAuraIndexAdapter");
  if (auraIndex) return [auraIndex()];

  const adapters: SourceAdapter[] = [...defaultAdapters()];

  const polyHaven = optionalFactory("createPolyHavenAdapter");
  if (polyHaven && !adapters.some((a) => a.id === "polyhaven")) {
    adapters.push(polyHaven());
  }

  // Key-gated sources: include only when the key is present; the adapter itself
  // also degrades to [] when the key is missing, but we avoid even constructing
  // it without a key so a no-key environment stays fully offline-deterministic.
  if (env.SKETCHFAB_API_TOKEN || env.SKETCHFAB_TOKEN) {
    const sketchfab = optionalFactory("createSketchfabAdapter");
    if (sketchfab) adapters.push(sketchfab());
  }
  if (env.POLY_PIZZA_API_KEY || env.POLYPIZZA_API_KEY) {
    const polyPizza = optionalFactory("createPolyPizzaAdapter");
    if (polyPizza) adapters.push(polyPizza());
  }

  return adapters;
}

/** Marketplace deep-link adapter, when the concurrently-authored factory exists. */
export function buildDeepLinkAdapter(): SourceAdapter | undefined {
  const factory = optionalFactory("createMarketplaceDeepLinkAdapter");
  return factory ? factory() : undefined;
}

export interface CliResolveConstraints {
  readonly license?: readonly ("CC0" | "CC-BY")[];
  readonly maxTriangles?: number;
  readonly animated?: boolean;
}

/** Translate CLI flags into the index's ResolveConstraints shape. */
export function toResolveConstraints(
  cli: CliResolveConstraints,
  redistributableOnly: boolean,
): ResolveConstraints {
  const constraints: {
    license?: readonly ("CC0" | "CC-BY")[];
    maxTriangles?: number;
    animated?: boolean;
    redistributableOnly?: boolean;
  } = {};
  if (cli.license && cli.license.length > 0) constraints.license = cli.license;
  if (typeof cli.maxTriangles === "number") constraints.maxTriangles = cli.maxTriangles;
  if (typeof cli.animated === "boolean") constraints.animated = cli.animated;
  if (redistributableOnly) constraints.redistributableOnly = true;
  return constraints;
}

/**
 * Pure selection seam: choose the top candidate Aura may legally auto-pull.
 *
 * Returns the first candidate that is downloadable under a verified,
 * redistributable license (`isAutoPullable`). When none qualifies it returns a
 * structured refusal explaining why, so the caller never silently pulls an
 * UNVERIFIED or deep-link-only asset.
 */
export interface PullableSelection {
  readonly ok: true;
  readonly candidate: ResolveCandidate;
}
export interface PullableRefusal {
  readonly ok: false;
  readonly reason: string;
}

export function selectPullable(
  candidates: readonly ResolveCandidate[],
): PullableSelection | PullableRefusal {
  const pullable = candidates.find((c) => isAutoPullable(c.asset));
  if (pullable) return { ok: true, candidate: pullable };

  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        "No candidates matched the query. Try a broader query or relax constraints.",
    };
  }
  const top = candidates[0]!.asset;
  return {
    ok: false,
    reason:
      `No auto-pullable candidate found. The best match "${top.title}" (${top.id}) ` +
      `is ${describeWhyNotPullable(top)}. Aura will not auto-pull an asset whose ` +
      `license is unverified or that is marketplace deep-link only. ` +
      `Review it at ${top.sourcePage ?? top.url} and add it manually once the ` +
      `license is confirmed.`,
  };
}

function describeWhyNotPullable(asset: AuraCanonicalAsset): string {
  if (asset.access !== "direct-download") return "marketplace deep-link only";
  if (!asset.license.verified) return `license UNVERIFIED (raw: "${asset.license.raw}")`;
  if (!asset.license.redistributable) return `license "${asset.license.spdx}" is not redistributable`;
  return "not auto-pullable";
}

/** Injected file downloader (overridable for tests). */
export type DownloadFile = (url: string, destPath: string) => Promise<void>;

/** Default downloader backed by global fetch; streams the body to disk. */
export const defaultDownloadFile: DownloadFile = async (url, destPath) => {
  const res = await fetch(url, { headers: { accept: "model/gltf-binary,*/*" } });
  if (!res.ok) {
    throw new Error(`Aura3D resolve failed: download of ${url} returned HTTP ${res.status}.`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Aura3D resolve failed: download of ${url} was empty.`);
  }
  writeFileSync(destPath, buffer);
};

export interface SearchOptions {
  readonly query: string;
  readonly constraints?: CliResolveConstraints;
  readonly limit?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam: override resolver construction. */
  readonly makeResolver?: (adapters: readonly SourceAdapter[]) => FederatedResolverType;
}

export interface SearchCandidateLine {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly license: string;
  readonly autoPullable: boolean;
  readonly access: AuraCanonicalAsset["access"];
  readonly sourcePage?: string;
}

export interface SearchReport {
  readonly ok: boolean;
  readonly query: string;
  readonly candidates: readonly SearchCandidateLine[];
  /** Deep-link discovery suggestions shown only when nothing is auto-pullable. */
  readonly deepLinks: readonly SearchCandidateLine[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

function toLine(candidate: ResolveCandidate): SearchCandidateLine {
  const { asset } = candidate;
  const line: {
    id: string;
    source: string;
    title: string;
    license: string;
    autoPullable: boolean;
    access: AuraCanonicalAsset["access"];
    sourcePage?: string;
  } = {
    id: asset.id,
    source: asset.source,
    title: asset.title,
    license: asset.license.spdx,
    autoPullable: isAutoPullable(asset),
    access: asset.access,
  };
  if (asset.sourcePage) line.sourcePage = asset.sourcePage;
  return line;
}

function makeDefaultResolver(
  adapters: readonly SourceAdapter[],
  limit: number,
): FederatedResolverType {
  return new FederatedResolver({ adapters, limit });
}

/** Run a federated search and produce a printable report. */
export async function runSearch(options: SearchOptions): Promise<SearchReport> {
  const env = options.env ?? process.env;
  const limit = options.limit ?? 10;
  const adapters = buildSearchAdapters(env);
  const resolver = options.makeResolver
    ? options.makeResolver(adapters)
    : makeDefaultResolver(adapters, limit);

  const constraints = toResolveConstraints(options.constraints ?? {}, false);
  const result: ResolveResult = await resolver.resolve({
    text: options.query,
    constraints,
  });

  const candidates = result.candidates.map(toLine);
  const anyPullable = candidates.some((c) => c.autoPullable);
  const warnings = [...result.warnings];

  let deepLinks: SearchCandidateLine[] = [];
  if (!anyPullable) {
    const deepLinkAdapter = buildDeepLinkAdapter();
    if (deepLinkAdapter) {
      try {
        const records = await deepLinkAdapter.search(
          { text: options.query, constraints: {} },
          { fetchJson: assetIndex.defaultFetchJson },
        );
        deepLinks = records.map((asset) => toLine({ asset, score: 0 }));
      } catch (err) {
        warnings.push(`${deepLinkAdapter.id}: ${(err as Error).message}`);
      }
    }
  }

  const messages: string[] = [];
  if (candidates.length === 0) {
    messages.push(`No candidates found for "${options.query}".`);
  } else {
    messages.push(`${candidates.length} candidate(s) for "${options.query}".`);
    if (!anyPullable) {
      messages.push(
        "No auto-pullable candidate. Listed assets need a manual license check before use.",
      );
    }
  }
  if (deepLinks.length > 0) {
    messages.push(
      `${deepLinks.length} marketplace deep-link(s) — manual download (license check required).`,
    );
  }

  return {
    ok: true,
    query: options.query,
    candidates,
    deepLinks,
    warnings,
    messages,
  };
}

export interface ResolveOptions {
  readonly query: string;
  readonly name: string;
  readonly projectDir?: string;
  readonly constraints?: CliResolveConstraints;
  readonly env?: NodeJS.ProcessEnv;
  /** Test seams. */
  readonly makeResolver?: (adapters: readonly SourceAdapter[]) => FederatedResolverType;
  readonly download?: DownloadFile;
  readonly addAssetFn?: typeof addAsset;
  readonly tmpRoot?: string;
}

export interface ResolveReport {
  readonly ok: boolean;
  readonly messages: readonly string[];
  readonly warnings: readonly string[];
  readonly typedRef?: string;
  readonly asset?: SearchCandidateLine;
  readonly add?: AssetCliResult;
}

/**
 * Resolve a query to the top auto-pullable candidate, download its .glb to a
 * temp path, and run the EXISTING `addAsset` pipeline so it lands as a typed
 * `assets.<name>`. Refuses (throws) when no candidate is auto-pullable.
 */
export async function runResolve(options: ResolveOptions): Promise<ResolveReport> {
  const env = options.env ?? process.env;
  if (!options.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.name)) {
    throw new Error(
      `Aura3D resolve failed: --name must be a valid identifier (got "${options.name ?? ""}").`,
    );
  }

  const adapters = buildSearchAdapters(env);
  const resolver = options.makeResolver
    ? options.makeResolver(adapters)
    : makeDefaultResolver(adapters, 10);

  // Constrain the resolve to redistributable, directly-downloadable assets up
  // front, then apply the pure selection seam as a belt-and-suspenders refusal.
  const constraints = toResolveConstraints(options.constraints ?? {}, true);
  const result = await resolver.resolve({ text: options.query, constraints });

  const selection = selectPullable(result.candidates);
  if (!selection.ok) {
    throw new Error(`Aura3D resolve refused: ${selection.reason}`);
  }

  const asset = selection.candidate.asset;
  const download = options.download ?? defaultDownloadFile;
  const tmpRoot = options.tmpRoot ?? tmpdir();
  const dir = mkdtempSync(join(tmpRoot, "aura3d-resolve-"));
  const ext = asset.format === "gltf" ? "gltf" : "glb";
  const tempFile = join(dir, `${options.name}.${ext}`);

  await download(asset.url, tempFile);

  const add = (options.addAssetFn ?? addAsset)({
    file: tempFile,
    name: options.name,
    ...(options.projectDir ? { projectDir: options.projectDir } : {}),
  });

  const typedRef = `model(assets.${options.name})`;
  const messages: string[] = [...add.messages];
  messages.push(`Pulled ${asset.id} (${asset.license.spdx}) from ${asset.source}.`);
  if (asset.license.attributionRequired) {
    const credit = asset.attribution ?? asset.sourcePage ?? asset.source;
    messages.push(
      `Attribution required (${asset.license.spdx}): credit "${credit}". ` +
        `See ${asset.sourcePage ?? asset.url}.`,
    );
  }
  messages.push(`Use the typed ref: ${typedRef}`);

  return {
    ok: add.ok,
    messages,
    warnings: result.warnings,
    typedRef,
    asset: toLine(selection.candidate),
    add,
  };
}
