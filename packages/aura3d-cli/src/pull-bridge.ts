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
 *   - `assets resolve <query> --name <name>` — rank AUTO-PULLABLE candidates,
 *     download each in order, inspect post-download, and run the normal
 *     `addAsset` flow only for a candidate-level match.
 *
 * License safety mirrors the index: we NEVER auto-pull an UNVERIFIED or
 * deep-link-only asset. `selectPullable` is the single decision seam and is
 * deliberately pure so it can be unit-tested without a network or the CLI.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as assetIndex from "@aura3d/asset-index";
import type {
  FederatedResolver as FederatedResolverType,
  SourceAdapter,
} from "@aura3d/asset-index";
import { addAsset, inspectAsset } from "./index.js";
import type {
  AssetCliResult,
  AssetInspectionReport,
} from "./index.js";
import { buildSearchAdapters } from "./pull-bridge/adapters.js";
import { defaultDownloadFile } from "./pull-bridge/download.js";
import type { DownloadFile } from "./pull-bridge/download.js";
import {
  evaluateAssetProfile,
  rankForProfile,
  toResolveConstraints,
} from "./pull-bridge/profiles.js";
import {
  createPostDownloadCandidateBlockingWarnings,
  createPreDownloadCandidateBlockingWarnings,
  createResolveCandidateProvenance,
  mapCanonicalRoleToCli,
} from "./pull-bridge/provenance.js";
import { selectPullable } from "./pull-bridge/pullable.js";
import {
  rankResolveCandidates,
  scoreResolveCandidate,
} from "./pull-bridge/scoring.js";
import {
  makeDefaultResolver,
  runSearch,
  toLine,
} from "./pull-bridge/search.js";
import type { SearchCandidateLine } from "./pull-bridge/search.js";
import type {
  CliAssetSearchProfile,
  CliResolveConstraints,
} from "./pull-bridge/types.js";

export {
  defaultDownloadFile,
  rankResolveCandidates,
  runSearch,
  selectPullable,
  scoreResolveCandidate,
  toResolveConstraints,
};
export type { DownloadFile, DownloadResult } from "./pull-bridge/download.js";
export type { PullableRefusal, PullableSelection } from "./pull-bridge/pullable.js";
export type { AssetResolveCandidateScore } from "./pull-bridge/scoring.js";
export type {
  SearchCandidateLine,
  SearchOptions,
  SearchReport,
} from "./pull-bridge/search.js";
export type {
  CliAssetSearchProfile,
  CliResolveConstraints,
} from "./pull-bridge/types.js";

const { isAutoPullable } = assetIndex;

export { buildDeepLinkAdapter, buildSearchAdapters } from "./pull-bridge/adapters.js";

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
  readonly inspectAssetFn?: typeof inspectAsset;
  readonly tmpRoot?: string;
  /**
   * Retrieval timestamp recorded in provenance. Injectable so deterministic
   * builds can pin it; defaults to the wall clock at resolve time.
   */
  readonly retrievedAt?: string;
  /**
   * Zero-based index into the ranked, pullable candidate list.
   *
   * Without this, `resolve` always pulls the top-ranked candidate, so there is no way to reach the
   * 2nd/3rd/Nth result that `assets search` reported. That made automated
   * search -> pull -> inspect -> select impossible to script: resolving three different vehicle queries
   * returned the same asset three times. Selecting an asset that passes a structural check (for
   * example a vehicle whose wheels are actually modelled) requires trying candidates in turn.
   *
   * Out-of-range values fail loudly with the available count rather than silently falling back to the
   * top candidate, so a script cannot mistake "index ignored" for "index honoured".
   */
  readonly candidateIndex?: number;
  /**
   * Exact catalog id to pull, e.g. `objaverse:ffca09fb...`.
   *
   * Preferred over `candidateIndex` when a caller already knows the id from `assets search --json`,
   * because ranking can change between a search and a later resolve while an id cannot.
   */
  readonly candidateId?: string;
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
/**
 * Resolve `candidateId` / `candidateIndex` against the ranked pullable candidates.
 *
 * Returns the full list when neither is supplied, preserving existing top-candidate behaviour.
 */
function selectRequestedCandidates<T extends { readonly asset: { readonly id: string } }>(
  pullable: readonly T[],
  options: Pick<ResolveOptions, "candidateId" | "candidateIndex">,
): readonly T[] {
  if (options.candidateId !== undefined) {
    const match = pullable.find((candidate) => candidate.asset.id === options.candidateId);
    if (!match) {
      const available = pullable.map((candidate) => candidate.asset.id);
      throw new Error(
        `Aura3D resolve failed: --candidate-id "${options.candidateId}" is not among the ${available.length} pullable candidate(s): ${available.join(", ") || "none"}`,
      );
    }
    return [match];
  }
  if (options.candidateIndex !== undefined) {
    const index = options.candidateIndex;
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Aura3D resolve failed: --index must be a non-negative integer (got "${String(index)}").`);
    }
    if (index >= pullable.length) {
      throw new Error(
        `Aura3D resolve failed: --index ${index} is out of range; only ${pullable.length} pullable candidate(s) available for this query.`,
      );
    }
    // Start at the requested candidate but keep the remaining ones as fallbacks, so a download or
    // inspection failure still degrades gracefully instead of aborting the resolve.
    return pullable.slice(index);
  }
  return pullable;
}

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

  const ranked = rankResolveCandidates(rankForProfile(result.candidates, profile), {
    query: options.query,
    profile,
  });
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

  /*
   * Narrow the ranked, pullable list to the caller's explicit selection, if any.
   *
   * This happens after the pullable filter so an index refers to the same list a caller sees from
   * `assets search`, and it fails loudly on a miss: silently pulling the top candidate when an index
   * or id does not match would make an automated screening loop believe it had tried N assets when it
   * had really tried one, N times.
   */
  const selectedPullable = selectRequestedCandidates(pullable, options);

  const download = options.download ?? defaultDownloadFile;
  const tmpRoot = options.tmpRoot ?? tmpdir();
  const addFn = options.addAssetFn ?? addAsset;
  const inspectFn = options.inspectAssetFn ?? inspectAsset;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const attemptWarnings: string[] = [];

  for (const candidateChoice of selectedPullable) {
    const asset = candidateChoice.asset;
    try {
      const preDownloadWarnings = createPreDownloadCandidateBlockingWarnings(asset);
      if (preDownloadWarnings.length > 0) {
        throw new Error(`pre-download candidate quality blocked: ${preDownloadWarnings.join("; ")}`);
      }

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
      const inspection = inspectFn({
        file: resolvedFile,
        ...(options.projectDir ? { projectDir: options.projectDir } : {}),
        animation: true,
        humanoid: true,
        skeleton: true,
        morphs: true,
        license: true,
      });
      const postDownloadWarnings = createPostDownloadCandidateBlockingWarnings(asset, inspection, profile);
      if (postDownloadWarnings.length > 0) {
        throw new Error(`post-download inspection blocked candidate: ${postDownloadWarnings.join("; ")}`);
      }
      const candidateScore = scoreResolveCandidate(candidateChoice, {
        query: options.query,
        profile,
      });
      const resolveCandidate = createResolveCandidateProvenance(
        candidateChoice,
        options.query,
        candidateScore,
        inspection,
      );

      const add = addFn({
        file: resolvedFile,
        name: options.name,
        ...(options.projectDir ? { projectDir: options.projectDir } : {}),
        sourcePage: asset.sourcePage,
        downloadUrl: asset.downloadUrl ?? asset.url,
        sourceUrl: asset.sourcePage ?? asset.url,
        license: asset.license.spdx,
        licenseName: (asset.licenseName ?? asset.license.raw) || asset.license.spdx,
        licenseUrl: asset.licenseUrl ?? asset.license.sourcePage,
        licenseRaw: asset.license.raw,
        sourceFamily: asset.sourceFamily ?? asset.source,
        attribution: asset.attribution ?? asset.author,
        author: asset.author ?? asset.attribution,
        sha256,
        resolveCandidate,
        retrievedAt,
        quality: "candidate",
        role: mapCanonicalRoleToCli(asset.intendedRole),
        suitabilityReason: asset.roleSuitability ?? "Resolved catalog candidate; release validation and rendered-probe proof are still required.",
      });

      const typedRef = `model(assets.${options.name})`;
      const messages: string[] = [...attemptWarnings, ...add.messages];
      messages.push(`Resolved candidate ${asset.id} (${asset.license.spdx}) from ${asset.source}.`);
      messages.push(`Provenance: sha256 ${sha256}, retrieved ${retrievedAt}, source ${asset.sourcePage ?? asset.url}.`);
      messages.push(
        `Candidate score ${candidateScore.total}: ${candidateScore.reasons.join("; ") || "no positive score reasons"}. ` +
          `Release validation is still required before public examples.`,
      );
      if (asset.license.attributionRequired) {
        const credit = asset.attribution ?? asset.sourcePage ?? asset.source;
        messages.push(
          `Attribution required (${asset.license.spdx}): credit "${credit}". ` +
            `See ${asset.sourcePage ?? asset.url}.`,
        );
      }
      messages.push(`Use the typed ref: ${typedRef}`);
      messages.push(`Next: run aura3d assets validate --release --source <entrypoint> and attach retained rendered-probe proof before claiming release readiness.`);

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
