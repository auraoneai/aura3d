import * as assetIndex from "@aura3d/asset-index";
import type { AuraCanonicalAsset, ResolveCandidate } from "@aura3d/asset-index";
import { evaluateAssetProfile } from "./profiles.js";
import { rankResolveCandidates } from "./scoring.js";
import type { CliAssetSearchProfile } from "./types.js";

const { isAutoPullable } = assetIndex;

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
  const ranked = rankResolveCandidates(candidates, { profile });
  const pullable = ranked.find((c) => {
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
    const rejectedPullable = ranked.filter((c) => isAutoPullable(c.asset));
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
  const top = ranked[0]!.asset;
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
