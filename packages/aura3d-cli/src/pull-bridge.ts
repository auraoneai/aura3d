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
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import * as assetIndex from "@aura3d/asset-index";
import type {
  AuraCanonicalAsset,
  AnimationAssetProfile,
  FederatedResolver as FederatedResolverType,
  ResolveCandidate,
  ResolveConstraints,
  ResolveResult,
  SourceAdapter,
} from "@aura3d/asset-index";
import { addAsset } from "./index.js";
import type { AssetCliResult } from "./index.js";

const {
  evaluateAnimationAssetProfile,
  evaluateGameAssetProfile,
  FederatedResolver,
  defaultAdapters,
  isAnimationAssetProfile,
  isAutoPullable,
} = assetIndex;

/**
 * Optional, concurrently-authored adapter factories. They may not be exported
 * yet (other agents own those files), so we look them up off the module
 * namespace at runtime instead of hard-importing. A missing factory simply
 * skips that optional source instead of causing a build break.
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
  const starterPack = optionalFactory("createAnimationStarterPackAdapter");
  const starterAdapters = starterPack ? [starterPack()] : [];

  // Primary: the hosted ~850k Aura3D catalog via its `/search` endpoint (hybrid
  // keyword + semantic + quality ranking). It already aggregates Objaverse,
  // Sketchfab, Poly Pizza, Poly Haven, OS3A, Khronos and the CC0 mirror, so it
  // supersedes per-source live federation. Fall back to live sources only if the
  // hosted-catalog adapter isn't available in this build.
  const auraIndex = optionalFactory("createAuraIndexAdapter");
  if (auraIndex) return [...starterAdapters, auraIndex()];

  const adapters: SourceAdapter[] = [...starterAdapters, ...defaultAdapters()];

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

export type CliAssetSearchProfile = "general" | "fighting-character" | AnimationAssetProfile;

export interface CliResolveConstraints {
  readonly license?: readonly ("CC0" | "CC-BY")[];
  readonly maxTriangles?: number;
  readonly animated?: boolean;
  readonly profile?: CliAssetSearchProfile;
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
    format?: "glb" | "gltf";
    redistributableOnly?: boolean;
  } = {};
  if (cli.profile === "fighting-character") {
    constraints.license = cli.license && cli.license.length > 0 ? cli.license : ["CC0", "CC-BY"];
    constraints.animated = true;
    constraints.format = "glb";
    constraints.maxTriangles = cli.maxTriangles ?? 200_000;
  } else if (isAnimationCliProfile(cli.profile)) {
    constraints.license = cli.license && cli.license.length > 0 ? cli.license : ["CC0", "CC-BY"];
    constraints.format = "glb";
    constraints.maxTriangles = cli.maxTriangles ?? animationProfileMaxTriangles(cli.profile);
    if (cli.profile === "animation-character") constraints.animated = true;
    else if (typeof cli.animated === "boolean") constraints.animated = cli.animated;
  } else {
    if (cli.license && cli.license.length > 0) constraints.license = cli.license;
    if (typeof cli.maxTriangles === "number") constraints.maxTriangles = cli.maxTriangles;
    if (typeof cli.animated === "boolean") constraints.animated = cli.animated;
  }
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
  options: { readonly profile?: CliAssetSearchProfile } = {},
): PullableSelection | PullableRefusal {
  const profile = options.profile ?? "general";
  const pullable = candidates.find((c) => {
    if (!isAutoPullable(c.asset)) return false;
    if (profile === "general") return true;
    return evaluateAssetProfile(c.asset, profile).suitable;
  });
  if (pullable) return { ok: true, candidate: pullable };

  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        "No candidates matched the query. Try a broader query or relax constraints.",
    };
  }
  if (profile !== "general") {
    const rejectedPullable = candidates.filter((c) => isAutoPullable(c.asset));
    if (rejectedPullable.length > 0) {
      return {
        ok: false,
        reason:
          `No auto-pullable candidate passed the ${profile} profile. ` +
          rejectedPullable.slice(0, 5).map((candidate) => {
            const evaluation = evaluateAssetProfile(candidate.asset, profile);
            const reasons = evaluation.rejectionReasons.length > 0
              ? evaluation.rejectionReasons.join("; ")
              : "profile did not report a concrete reason";
            return `"${candidate.asset.title}" (${candidate.asset.id}): ${reasons}`;
          }).join(" | "),
      };
    }
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

/**
 * Result of a download. A downloader normally writes to the requested
 * `destPath`; when the payload was a ZIP it unpacks into the same directory and
 * returns the assembled artifact's path via `path`. Returning nothing keeps the
 * legacy `(url, destPath) => void` contract (tests rely on this).
 */
export interface DownloadResult {
  /** Final on-disk file to feed the add pipeline (defaults to the requested dest). */
  readonly path?: string;
}

/** Injected file downloader (overridable for tests). */
export type DownloadFile = (
  url: string,
  destPath: string,
) => Promise<DownloadResult | void>;

/** First four bytes of a ZIP local-file header ("PK\x03\x04"). */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** glTF binary container magic ("glTF"). */
const GLB_MAGIC = Buffer.from([0x67, 0x6c, 0x54, 0x46]);

/**
 * Default downloader backed by global fetch.
 *
 * Objaverse URLs are direct `.glb`; Poly Pizza / Sketchfab artifacts can arrive
 * as a ZIP (gltf + bin + textures, or a packaged .glb). We sniff the leading
 * bytes: a GLB/gltf body is written through as-is; a `PK` body is unpacked next
 * to `destPath` and the assembled .glb/.gltf path is returned. Auth-gated
 * Sketchfab `download` endpoints return JSON (a signed-URL envelope, or a 401);
 * we surface a clear, non-fatal-to-the-tool error instead of writing garbage.
 */
export const defaultDownloadFile: DownloadFile = async (url, destPath) => {
  const res = await fetch(url, { headers: { accept: "model/gltf-binary,application/zip,*/*" } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Aura3D resolve failed: ${url} requires authentication (HTTP ${res.status}). ` +
          `This source (e.g. Sketchfab) needs an OAuth download token; set SKETCHFAB_API_TOKEN ` +
          `or pull a direct-download (Objaverse) candidate instead.`,
      );
    }
    throw new Error(`Aura3D resolve failed: download of ${url} returned HTTP ${res.status}.`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Aura3D resolve failed: download of ${url} was empty.`);
  }

  // A Sketchfab download endpoint that 200s but returns a JSON signed-URL
  // envelope rather than model bytes — follow the envelope when we can, else fail
  // clearly. We never feed JSON into the GLB inspector.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || buffer[0] === 0x7b /* '{' */) {
    const followed = await followSignedDownload(buffer, destPath);
    if (followed) return followed;
    throw new Error(
      `Aura3D resolve failed: ${url} returned a JSON envelope, not model bytes ` +
        `(auth-gated download requiring an OAuth token). Pull a direct-download candidate instead.`,
    );
  }

  if (startsWith(buffer, ZIP_MAGIC)) {
    return unpackZipToModel(buffer, destPath);
  }

  writeFileSync(destPath, buffer);
  // A GLB/gltf can still reference EXTERNAL textures/.bin (e.g. the Kenney mirror
  // GLBs point at `Textures/*.png`). Fetch those siblings relative to the source
  // URL so the add pipeline's dependency check resolves them. Failures here are
  // soft: the add step reports any that are genuinely unreachable.
  await fetchExternalDependencies(buffer, url, destPath);
  return { path: destPath };
};

/** External `uri` refs (images + buffers) in a GLB JSON chunk or a .gltf file. */
function externalUris(modelBytes: Buffer, destPath: string): string[] {
  let json: unknown;
  try {
    if (startsWith(modelBytes, GLB_MAGIC)) {
      // GLB: 12-byte header, then chunk [u32 len][u32 type=JSON][bytes].
      if (modelBytes.length < 20) return [];
      const jsonLen = modelBytes.readUInt32LE(12);
      json = JSON.parse(modelBytes.toString("utf8", 20, 20 + jsonLen));
    } else if (destPath.toLowerCase().endsWith(".gltf")) {
      json = JSON.parse(modelBytes.toString("utf8"));
    } else {
      return [];
    }
  } catch {
    return [];
  }
  const doc = json as { images?: { uri?: string }[]; buffers?: { uri?: string }[] };
  const uris = [...(doc.images ?? []), ...(doc.buffers ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:"));
  return [...new Set(uris)];
}

/** Best-effort fetch of a model's external sibling resources next to destPath. */
async function fetchExternalDependencies(
  modelBytes: Buffer,
  sourceUrl: string,
  destPath: string,
): Promise<void> {
  const uris = externalUris(modelBytes, destPath);
  if (uris.length === 0) return;
  const dir = dirname(destPath);
  await Promise.all(
    uris.map(async (uri) => {
      const decoded = decodeURIComponent(uri);
      const target = join(dir, decoded);
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(uri, sourceUrl).toString();
      } catch {
        return;
      }
      try {
        const res = await fetch(resolvedUrl, { headers: { accept: "*/*" } });
        if (!res.ok) return;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length === 0) return;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      } catch {
        // Soft failure: leave the file absent; addAsset surfaces the gap.
      }
    }),
  );
}

function startsWith(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

/**
 * Some catalog `download` endpoints return `{ gltf: { url }, ... }`. When the
 * sandbox has no creds the URL is usually still un-fetchable, but we attempt the
 * obvious direct artifact field so a future credentialed run works end-to-end.
 */
async function followSignedDownload(
  buffer: Buffer,
  destPath: string,
): Promise<DownloadResult | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch {
    return undefined;
  }
  const envelope = parsed as Record<string, unknown> | null;
  const directUrl =
    pickUrl(envelope?.["glb"]) ?? pickUrl(envelope?.["gltf"]) ?? pickUrl(envelope?.["model"]);
  if (!directUrl) return undefined;
  const res = await fetch(directUrl, { headers: { accept: "model/gltf-binary,application/zip,*/*" } });
  if (!res.ok) return undefined;
  const inner = Buffer.from(await res.arrayBuffer());
  if (inner.length === 0) return undefined;
  if (startsWith(inner, ZIP_MAGIC)) return unpackZipToModel(inner, destPath);
  writeFileSync(destPath, inner);
  return { path: destPath };
}

function pickUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>)["url"];
    if (typeof url === "string") return url;
  }
  return undefined;
}

/**
 * Minimal, dependency-free ZIP reader: walk the End-Of-Central-Directory and
 * central directory, inflate (or copy stored) entries, write them next to
 * `destPath`, and return the path to the assembled .glb (preferred) or .gltf.
 * Sibling .bin/texture files land in the same dir so the add pipeline's
 * dependency copier finds them.
 */
function unpackZipToModel(zip: Buffer, destPath: string): DownloadResult {
  const dir = dirname(destPath);
  const entries = readZipEntries(zip);
  if (entries.length === 0) {
    throw new Error("Aura3D resolve failed: downloaded ZIP contained no files.");
  }
  let glbPath: string | undefined;
  let gltfPath: string | undefined;
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    const safeName = basename(entry.name);
    if (!safeName) continue;
    const outPath = join(dir, safeName);
    writeFileSync(outPath, entry.data);
    const lower = safeName.toLowerCase();
    if (lower.endsWith(".glb") && (!glbPath || isPlausibleGlb(entry.data))) glbPath = outPath;
    else if (lower.endsWith(".gltf") && !gltfPath) gltfPath = outPath;
  }
  const chosen = glbPath ?? gltfPath;
  if (!chosen) {
    throw new Error("Aura3D resolve failed: ZIP did not contain a .glb or .gltf model.");
  }
  return { path: chosen };
}

function isPlausibleGlb(data: Buffer): boolean {
  return startsWith(data, GLB_MAGIC);
}

interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

/** Parse central-directory records and inflate each entry's local data. */
function readZipEntries(zip: Buffer): ZipEntry[] {
  const eocd = findEocd(zip);
  if (eocd < 0) return [];
  const total = zip.readUInt16LE(eocd + 10);
  let cd = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < total; i += 1) {
    if (cd + 46 > zip.length || zip.readUInt32LE(cd) !== 0x02014b50) break;
    const method = zip.readUInt16LE(cd + 10);
    const compSize = zip.readUInt32LE(cd + 20);
    const nameLen = zip.readUInt16LE(cd + 28);
    const extraLen = zip.readUInt16LE(cd + 30);
    const commentLen = zip.readUInt16LE(cd + 32);
    const localOffset = zip.readUInt32LE(cd + 42);
    const name = zip.toString("utf8", cd + 46, cd + 46 + nameLen);
    const data = inflateLocalEntry(zip, localOffset, method, compSize);
    if (data) entries.push({ name, data });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflateLocalEntry(
  zip: Buffer,
  localOffset: number,
  method: number,
  compSize: number,
): Buffer | undefined {
  if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) return undefined;
  const nameLen = zip.readUInt16LE(localOffset + 26);
  const extraLen = zip.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const comp = zip.subarray(dataStart, dataStart + compSize);
  if (method === 0) return Buffer.from(comp); // stored
  if (method === 8) {
    try {
      return inflateRawSync(comp);
    } catch {
      return undefined;
    }
  }
  return undefined; // unsupported compression method
}

function findEocd(zip: Buffer): number {
  // EOCD signature 0x06054b50, scanning back from the end past any comment.
  const min = Math.max(0, zip.length - 0xffff - 22);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

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
  readonly profile?: {
    readonly name: Exclude<CliAssetSearchProfile, "general">;
    readonly suitable: boolean;
    readonly rejectionReasons: readonly string[];
    readonly warnings: readonly string[];
    /** Post-download checks deferred by pre-download ranking (animation profiles). */
    readonly validationHooks: readonly string[];
  };
}

export interface SearchReport {
  readonly ok: boolean;
  readonly query: string;
  readonly profile: CliAssetSearchProfile;
  readonly candidates: readonly SearchCandidateLine[];
  readonly rejectedCandidates: readonly SearchCandidateLine[];
  /** Deep-link discovery suggestions shown only when nothing is auto-pullable. */
  readonly deepLinks: readonly SearchCandidateLine[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

function toLine(candidate: ResolveCandidate, profile: CliAssetSearchProfile = "general"): SearchCandidateLine {
  const { asset } = candidate;
  const line: {
    id: string;
    source: string;
    title: string;
    license: string;
    autoPullable: boolean;
    access: AuraCanonicalAsset["access"];
    sourcePage?: string;
    profile?: SearchCandidateLine["profile"];
  } = {
    id: asset.id,
    source: asset.source,
    title: asset.title,
    license: asset.license.spdx,
    autoPullable: isAutoPullable(asset),
    access: asset.access,
  };
  if (asset.sourcePage) line.sourcePage = asset.sourcePage;
  if (profile !== "general") {
    const evaluation = evaluateAssetProfile(asset, profile);
    line.profile = {
      name: profile,
      suitable: evaluation.suitable,
      rejectionReasons: evaluation.rejectionReasons,
      warnings: evaluation.warnings,
      validationHooks: evaluation.validationHooks ?? [],
    };
  }
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
  const profile = options.constraints?.profile ?? "general";
  const result: ResolveResult = await resolver.resolve({
    text: options.query,
    constraints,
  });

  const rankedCandidates = rankForProfile(result.candidates, profile);
  const candidateLines = rankedCandidates.map((candidate) => toLine(candidate, profile));
  const candidates = profile !== "general"
    ? candidateLines.filter((candidate) => candidate.profile?.suitable === true)
    : candidateLines;
  const rejectedCandidates = profile !== "general"
    ? candidateLines.filter((candidate) => candidate.profile?.suitable !== true)
    : [];
  const anyPullable = candidates.some((c) => c.autoPullable);
  const anyProfileSuitable = profile === "general" || candidates.some((c) => c.profile?.suitable);
  const anyProfilePullable = profile === "general" || candidates.some((c) => c.autoPullable && c.profile?.suitable);
  const warnings = [...result.warnings];
  if (profile !== "general") {
    for (const candidate of candidateLines) {
      for (const warning of candidate.profile?.warnings ?? []) {
        warnings.push(`${candidate.id}: ${warning}`);
      }
    }
  }

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
  if (candidateLines.length === 0) {
    messages.push(`No candidates found for "${options.query}".`);
  } else {
    messages.push(`${candidates.length} candidate(s) for "${options.query}" using ${profile} profile.`);
    if (rejectedCandidates.length > 0) {
      messages.push(`${rejectedCandidates.length} rejected candidate(s) moved to rejectedCandidates by the ${profile} profile.`);
    }
    if (!anyPullable) {
      messages.push(
        "No auto-pullable candidate. Listed assets need a manual license check before use.",
      );
    }
    if (profile !== "general" && !anyProfileSuitable) {
      messages.push(
        `No ${profile}-ready candidate. Listed candidates were rejected by the asset profile; inspect rejectionReasons before resolving.`,
      );
    } else if (profile !== "general" && !anyProfilePullable) {
      messages.push(
        `No auto-pullable ${profile}-ready candidate. Resolve will refuse until a downloadable licensed candidate also passes the profile.`,
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
    profile,
    candidates,
    rejectedCandidates,
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
  /**
   * Retrieval timestamp recorded in provenance. Injectable so deterministic
   * builds can pin it; defaults to the wall clock at resolve time.
   */
  readonly retrievedAt?: string;
}

export interface ResolveReport {
  readonly ok: boolean;
  readonly profile: CliAssetSearchProfile;
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
  const profile = options.constraints?.profile ?? "general";
  const result = await resolver.resolve({ text: options.query, constraints });

  const ranked = rankForProfile(result.candidates, profile);
  const selection = selectPullable(ranked, { profile });
  if (!selection.ok) {
    throw new Error(`Aura3D resolve refused: ${selection.reason}`);
  }

  // Every candidate that passed the pure pullable+profile gate, in rank order.
  // We try them in turn: a download/parse failure (e.g. a GLB whose external
  // textures are unresolvable post-download) DOWN-RANKS that candidate and falls
  // through to the next, rather than aborting the whole resolve. (#20/#21/#23)
  const pullable = ranked.filter((c) => {
    if (!isAutoPullable(c.asset)) return false;
    if (profile === "general") return true;
    return evaluateAssetProfile(c.asset, profile).suitable;
  });

  const download = options.download ?? defaultDownloadFile;
  const tmpRoot = options.tmpRoot ?? tmpdir();
  const addFn = options.addAssetFn ?? addAsset;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const attemptWarnings: string[] = [];

  for (const candidateChoice of pullable) {
    const asset = candidateChoice.asset;
    try {
      const dir = mkdtempSync(join(tmpRoot, "aura3d-resolve-"));
      const ext = asset.format === "gltf" ? "gltf" : "glb";
      const tempFile = join(dir, `${options.name}.${ext}`);

      // The downloader may unpack a ZIP and hand back the assembled .glb/.gltf
      // path; fall back to the requested temp path when it returns void.
      const downloadResult = await download(asset.url, tempFile);
      const resolvedFile = downloadResult?.path ?? tempFile;

      // Capture the sha256 of the bytes we actually pulled plus a retrieval
      // timestamp (injectable for determinism) so provenance records exactly what
      // was fetched. (#19/#26)
      const sha256 = `sha256-${createHash("sha256").update(readFileSync(resolvedFile)).digest("hex")}`;

      const add = addFn({
        file: resolvedFile,
        name: options.name,
        ...(options.projectDir ? { projectDir: options.projectDir } : {}),
        sourceUrl: asset.sourcePage ?? asset.url,
        license: asset.license.spdx,
        sourceFamily: asset.source,
        attribution: asset.attribution,
        author: asset.attribution,
        sha256,
        retrievedAt,
      });

      const typedRef = `model(assets.${options.name})`;
      const messages: string[] = [...attemptWarnings, ...add.messages];
      messages.push(`Pulled ${asset.id} (${asset.license.spdx}) from ${asset.source}.`);
      messages.push(`Provenance: sha256 ${sha256}, retrieved ${retrievedAt}, source ${asset.sourcePage ?? asset.url}.`);
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
        profile,
        messages,
        warnings: [...result.warnings, ...attemptWarnings],
        typedRef,
        asset: toLine(candidateChoice, profile),
        add,
      };
    } catch (err) {
      attemptWarnings.push(`Skipped ${asset.id}: ${(err as Error).message}`);
    }
  }

  throw new Error(
    `Aura3D resolve failed: every auto-pullable candidate failed to download or assemble. ` +
      attemptWarnings.join(" | "),
  );
}

function rankForProfile(
  candidates: readonly ResolveCandidate[],
  profile: CliAssetSearchProfile,
): readonly ResolveCandidate[] {
  if (profile === "general") return candidates;
  return [...candidates].sort((a, b) => {
    const aEval = evaluateAssetProfile(a.asset, profile);
    const bEval = evaluateAssetProfile(b.asset, profile);
    return (
      Number(bEval.suitable) - Number(aEval.suitable) ||
      (b.score + bEval.scoreBonus) - (a.score + aEval.scoreBonus) ||
      a.asset.id.localeCompare(b.asset.id)
    );
  });
}

function isAnimationCliProfile(profile: CliAssetSearchProfile | undefined): profile is AnimationAssetProfile {
  return typeof profile === "string" && isAnimationAssetProfile(profile);
}

function evaluateAssetProfile(
  asset: AuraCanonicalAsset,
  profile: Exclude<CliAssetSearchProfile, "general">,
): { readonly suitable: boolean; readonly scoreBonus: number; readonly rejectionReasons: readonly string[]; readonly warnings: readonly string[]; readonly validationHooks?: readonly string[] } {
  // CLI search/resolve runs against the hosted catalog *before* downloading, so
  // animation profiles evaluate in pre-download mode: absent rig/animation/triangle
  // metadata down-ranks and defers to a post-download validation hook instead of
  // hard-rejecting every catalog candidate. (#20/#23)
  return profile === "fighting-character"
    ? evaluateGameAssetProfile(asset, "fighting-character")
    : evaluateAnimationAssetProfile(asset, profile, { preDownload: true });
}

function animationProfileMaxTriangles(profile: AnimationAssetProfile): number {
  switch (profile) {
    case "animation-character":
      return 160_000;
    case "animation-prop":
      return 100_000;
    case "animation-set":
      return 350_000;
    case "animation-environment":
      return 250_000;
  }
}
