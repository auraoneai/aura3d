import { resolve } from "node:path";
import { rankManifestReplacementCandidates } from "./showcase-spec-replacement-candidates.js";
import { applySelectedReplacement } from "./showcase-spec-replacement-apply.js";
import { readManifestAssets } from "./showcase-spec-replacement-manifest.js";
import { numberValue, readJson, recordValue, stringArray } from "./showcase-spec-replacement-values.js";
import type {
  ShowcaseSpec,
  ShowcaseSpecAsset,
  ShowcaseGameAssetPairEvidence,
  ShowcaseSpecRejectedAsset,
  ShowcaseSpecReplacementCandidate,
  ShowcaseSpecSelectedReplacement
} from "./showcase-spec-types.js";

interface ReplacementResolution {
  readonly spec: ShowcaseSpec;
  readonly blockers: readonly string[];
  readonly rejectedAssets: readonly ShowcaseSpecRejectedAsset[];
  readonly replacementCandidates: readonly ShowcaseSpecReplacementCandidate[];
  readonly selectedReplacement?: ShowcaseSpecSelectedReplacement;
}

export function resolveShowcaseSpecReplacements(
  spec: ShowcaseSpec,
  options: { readonly projectDir?: string } = {}
): ReplacementResolution {
  let resolvedSpec = spec;
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const manifest = readManifestAssets(projectDir);
  const blockers: string[] = [];
  const rejectedAssets: ShowcaseSpecRejectedAsset[] = [];
  const replacementCandidates: ShowcaseSpecReplacementCandidate[] = [];
  let selectedReplacement: ShowcaseSpecSelectedReplacement | undefined;

  for (const asset of spec.primaryAssets) {
    const policy = asset.assetPolicy;
    if (!policy?.allowReplacement) continue;
    const rejected = createRejectedAsset(spec, asset);
    if (!rejected) continue;
    rejectedAssets.push(rejected);

    const ranked = rankManifestReplacementCandidates({
      spec: resolvedSpec,
      rejectedAsset: asset,
      policy,
      manifest,
      projectDir
    });
    replacementCandidates.push(...ranked.map(({ candidate }) => candidate));
    const selected = ranked.find(({ candidate }) => candidate.accepted);
    if (!selected) {
      blockers.push(`replacement:${asset.id}:no-suitable-candidate`);
      continue;
    }

    selectedReplacement = {
      replaces: asset.id,
      id: selected.candidate.id,
      role: selected.candidate.role,
      score: selected.candidate.score,
      reasons: selected.candidate.reasons,
      provenance: selected.candidate.provenance
    };
    resolvedSpec = applySelectedReplacement({
      spec: resolvedSpec,
      rejectedAssetId: asset.id,
      selectedAsset: selected.specAsset,
      selectedEvidence: selected.candidate.evidence,
      selectedRacingTopology: selected.racingTopology,
      selectedPlayableSurfaceMap: selected.playableSurfaceMap
    });
  }

  const selectedId = selectedReplacement?.id;
  return {
    spec: resolvedSpec,
    blockers,
    rejectedAssets,
    replacementCandidates: selectedId
      ? replacementCandidates.map((candidate) => ({
        ...candidate,
        selected: candidate.id === selectedId && candidate.accepted
      }))
      : replacementCandidates,
    ...(selectedReplacement ? { selectedReplacement } : {})
  };
}

function createRejectedAsset(spec: ShowcaseSpec, asset: ShowcaseSpecAsset): ShowcaseSpecRejectedAsset | undefined {
  const evidence = spec.evidence.releaseAssetProbes?.[asset.id] ?? `tests/reports/showcase-release-asset-probes/${asset.id}.json`;
  const probe = readJson(evidence);
  const routePrimaryRejection = createRoutePrimaryRejectedAsset(spec, asset);
  if (!probe) {
    if (routePrimaryRejection) return routePrimaryRejection;
    return { id: asset.id, reason: "release-probe-missing", evidence, failures: ["missing-release-probe"] };
  }
  const probeRecord = recordValue(probe);
  const releaseEvidence = recordValue(probeRecord?.evidence);
  const failures = stringArray(releaseEvidence?.failures);
  if (releaseEvidence?.pass === true && failures.length === 0) {
    return routePrimaryRejection ?? createAssetPairRejectedAsset(spec, asset);
  }
  const pixels = recordValue(releaseEvidence?.pixels);
  const bounds = recordValue(pixels?.foregroundBounds);
  const blank =
    numberValue(pixels?.nonBackgroundPixels) === 0 ||
    numberValue(pixels?.colorBuckets) === 0 ||
    numberValue(bounds?.width) === 0 ||
    numberValue(bounds?.height) === 0;
  return {
    id: asset.id,
    reason: blank ? "release-probe-blank" : "release-probe-failing",
    evidence,
    failures: failures.length > 0 ? failures : ["release-probe-not-passing"]
  };
}

function createAssetPairRejectedAsset(spec: ShowcaseSpec, asset: ShowcaseSpecAsset): ShowcaseSpecRejectedAsset | undefined {
  const assetPairEvidence = findAssetPairEvidence(spec, asset.id);
  if (!assetPairEvidence || assetPairEvidence.verdict === "pass") return undefined;
  return {
    id: asset.id,
    reason: "game-asset-pair-failing",
    evidence: assetPairEvidence.screenshotEvidence,
    failures: assetPairEvidence.blockers.length > 0
      ? assetPairEvidence.blockers
      : [`game-asset-pair:${assetPairEvidence.category}:verdict-fail`]
  };
}

function findAssetPairEvidence(spec: ShowcaseSpec, assetId: string): ShowcaseGameAssetPairEvidence | undefined {
  const assetPairEvidence = spec.racing?.raceDesign.assetPairEvidence ?? spec.platformer?.levelDesign.assetPairEvidence;
  if (!assetPairEvidence?.assets.includes(assetId)) return undefined;
  return assetPairEvidence;
}

function createRoutePrimaryRejectedAsset(spec: ShowcaseSpec, asset: ShowcaseSpecAsset): ShowcaseSpecRejectedAsset | undefined {
  const probe = readJson(spec.evidence.routePrimaryProbe);
  const probeRecord = recordValue(probe);
  const primaryAssets = probeRecord?.primaryAssets;
  if (!Array.isArray(primaryAssets)) return undefined;
  const entry = primaryAssets.find((value) => recordValue(value)?.id === asset.id);
  const assetRecord = recordValue(entry);
  if (!assetRecord) return {
    id: asset.id,
    reason: "route-primary-missing",
    evidence: spec.evidence.routePrimaryProbe,
    failures: ["route-primary-asset-missing"]
  };
  const renderedProbe = recordValue(assetRecord.renderedProbe);
  const failures = stringArray(renderedProbe?.failures);
  if (failures.length === 0) return undefined;
  return {
    id: asset.id,
    reason: routePrimaryReason(renderedProbe, failures),
    evidence: spec.evidence.routePrimaryProbe,
    failures
  };
}

function routePrimaryReason(renderedProbe: Readonly<Record<string, unknown>> | undefined, failures: readonly string[]): ShowcaseSpecRejectedAsset["reason"] {
  if (renderedProbe?.clipped === true || failures.some((failure) => failure.includes("clipped"))) return "route-primary-clipped";
  return "route-primary-unreadable";
}
