import * as assetIndex from "@aura3d/asset-index";
import type {
  AuraCanonicalAsset,
  FederatedResolver as FederatedResolverType,
  ResolveCandidate,
  ResolveResult,
  SourceAdapter,
} from "@aura3d/asset-index";
import {
  buildDeepLinkAdapter,
  buildSearchAdapters,
} from "./adapters.js";
import {
  evaluateAssetProfile,
  rankForProfile,
  toResolveConstraints,
} from "./profiles.js";
import { rankResolveCandidates } from "./scoring.js";
import type {
  CliAssetSearchProfile,
  CliResolveConstraints,
} from "./types.js";

const { FederatedResolver, isAutoPullable } = assetIndex;

export interface SearchOptions {
  readonly query: string;
  readonly constraints?: CliResolveConstraints;
  readonly limit?: number;
  readonly env?: NodeJS.ProcessEnv;
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
  /** Directly fetchable asset URL, when the provider exposes one. */
  readonly downloadUrl?: string;
  /** Attribution author, needed to satisfy an attribution-bearing licence policy. */
  readonly author?: string;
  readonly profile?: {
    readonly name: Exclude<CliAssetSearchProfile, "general">;
    readonly suitable: boolean;
    readonly rejectionReasons: readonly string[];
    readonly warnings: readonly string[];
    readonly validationHooks: readonly string[];
  };
}

export interface SearchReport {
  readonly ok: boolean;
  readonly query: string;
  readonly profile: CliAssetSearchProfile;
  readonly candidates: readonly SearchCandidateLine[];
  readonly rejectedCandidates: readonly SearchCandidateLine[];
  readonly deepLinks: readonly SearchCandidateLine[];
  readonly warnings: readonly string[];
  readonly messages: readonly string[];
}

export function toLine(candidate: ResolveCandidate, profile: CliAssetSearchProfile = "general"): SearchCandidateLine {
  const { asset } = candidate;
  const line: {
    id: string;
    source: string;
    title: string;
    license: string;
    autoPullable: boolean;
    access: AuraCanonicalAsset["access"];
    sourcePage?: string;
    downloadUrl?: string;
    author?: string;
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
  /*
   * Surface the fetchable URL.
   *
   * Previously a search line carried only `sourcePage` -- a human-facing landing page, not a file. Any
   * programmatic consumer therefore had to re-run a resolve to obtain the actual URL, and the screening
   * pipeline rejected every candidate with "candidate has no download URL" despite the resolver knowing it.
   * Exposing it here keeps `assets search --json` sufficient for an automated screening loop, which is the
   * whole point of the search -> screen -> select flow.
   */
  const fetchable = asset.downloadUrl ?? asset.url;
  if (fetchable) line.downloadUrl = fetchable;
  /*
   * Surface attribution too.
   *
   * A CC-BY candidate without a recorded author cannot satisfy an attribution-bearing licence policy, and
   * omitting it here made the screening pipeline reject perfectly usable candidates for
   * `provenance-complete: author missing` when the provider had in fact supplied one.
   */
  const attribution = asset.author ?? asset.attribution;
  if (attribution) line.author = attribution;
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

export function makeDefaultResolver(
  adapters: readonly SourceAdapter[],
  limit: number,
): FederatedResolverType {
  return new FederatedResolver({ adapters, limit });
}

export async function runSearch(options: SearchOptions): Promise<SearchReport> {
  const env = options.env ?? process.env;
  const limit = options.limit ?? 10;
  const adapters = buildSearchAdapters(env);
  const resolver = options.makeResolver
    ? options.makeResolver(adapters)
    : makeDefaultResolver(adapters, limit);

  const constraints = toResolveConstraints(options.constraints ?? {}, false, options.query);
  const profile = options.constraints?.profile ?? "general";
  const result: ResolveResult = await resolver.resolve({
    text: options.query,
    constraints,
  });

  const rankedCandidates = rankResolveCandidates(rankForProfile(result.candidates, profile, options.query), {
    query: options.query,
    profile,
  });
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
      `${deepLinks.length} marketplace deep-link(s) - manual download (license check required).`,
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
