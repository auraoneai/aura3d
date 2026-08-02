import {
  normalizeLicense,
  scoreAsset,
  type AuraAssetIntendedRole,
  type AuraCanonicalAsset
} from "@aura3d/asset-index";
import {
  createProvenance,
  hasDurableProvenance,
  type ManifestAsset
} from "./showcase-spec-replacement-manifest.js";
import { readJson, recordValue, roundScore, stringArray } from "./showcase-spec-replacement-values.js";
import { gameGeometryGate } from "./showcase-spec-game-replacement-evidence.js";
import type {
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology,
  ShowcaseSpec,
  ShowcaseSpecAsset,
  ShowcaseSpecAssetPolicy,
  ShowcaseSpecReplacementCandidate
} from "./showcase-spec-types.js";

export interface CandidateEvaluation {
  readonly candidate: ShowcaseSpecReplacementCandidate;
  readonly specAsset: ShowcaseSpecAsset;
  readonly racingTopology?: ShowcaseRacingTrackTopology;
  readonly playableSurfaceMap?: ShowcasePlatformerPlayableSurfaceMap;
}

const MAX_RANKED_REPLACEMENT_CANDIDATES = 20;

export function rankManifestReplacementCandidates(options: {
  readonly spec: ShowcaseSpec;
  readonly rejectedAsset: ShowcaseSpecAsset;
  readonly policy: ShowcaseSpecAssetPolicy;
  readonly manifest: readonly ManifestAsset[];
  readonly projectDir: string;
}): readonly CandidateEvaluation[] {
  const rejectedHash = options.manifest.find((asset) => asset.id === options.rejectedAsset.id)?.hash;
  const query = options.policy.replacementQuery ?? `${options.rejectedAsset.role} replacement`;
  const evaluated = options.manifest
    .filter((asset) => asset.id !== options.rejectedAsset.id)
    .map((asset) => evaluateCandidate({
      spec: options.spec,
      asset,
      query,
      rejectedHash,
      policy: options.policy,
      projectDir: options.projectDir
    }))
    .filter(isPolicyRelevantCandidate)
    .sort(compareCandidateEvaluations);
  return retainGeometryCandidates(evaluated);
}

function isPolicyRelevantCandidate(candidate: CandidateEvaluation): boolean {
  return !candidate.candidate.penalties.some((penalty) => penalty.startsWith("role mismatch:"));
}

function compareCandidateEvaluations(left: CandidateEvaluation, right: CandidateEvaluation): number {
  if (left.candidate.accepted !== right.candidate.accepted) return left.candidate.accepted ? -1 : 1;
  const leftHasGeometry = hasGameGeometryEvidence(left);
  const rightHasGeometry = hasGameGeometryEvidence(right);
  if (leftHasGeometry !== rightHasGeometry) return leftHasGeometry ? -1 : 1;
  return right.candidate.score - left.candidate.score || left.candidate.id.localeCompare(right.candidate.id);
}

function retainGeometryCandidates(candidates: readonly CandidateEvaluation[]): readonly CandidateEvaluation[] {
  const retained = candidates.slice(0, MAX_RANKED_REPLACEMENT_CANDIDATES);
  const retainedIds = new Set(retained.map((candidate) => candidate.candidate.id));
  const extraGeometryCandidates = candidates.filter((candidate) => hasGameGeometryEvidence(candidate) && !retainedIds.has(candidate.candidate.id));
  return [...retained, ...extraGeometryCandidates];
}

function hasGameGeometryEvidence(candidate: CandidateEvaluation): boolean {
  return Boolean(candidate.racingTopology || candidate.playableSurfaceMap);
}

function evaluateCandidate(options: {
  readonly spec: ShowcaseSpec;
  readonly asset: ManifestAsset;
  readonly query: string;
  readonly rejectedHash?: string;
  readonly policy: ShowcaseSpecAssetPolicy;
  readonly projectDir: string;
}): CandidateEvaluation {
  const asset = options.asset;
  const role = normalizeRole(asset.role, options.policy.requiredRole);
  const provenance = createProvenance(asset);
  const canonical = toCanonicalAsset(asset, role, provenance);
  const baseScore = scoreAsset(canonical, options.query);
  const reasons: string[] = [`asset-index scoreAsset ${roundScore(baseScore)}`];
  const penalties: string[] = [];

  if (roleMatchesPolicy(role, options.policy)) reasons.push(`role ${role} matches replacement policy`);
  else penalties.push(`role mismatch: ${role}`);

  if (hasDurableProvenance(provenance)) reasons.push("durable provenance preserved");
  else penalties.push("missing durable provenance");

  if (options.policy.minQuality === "release" && asset.quality !== "release") penalties.push("quality is not release");
  else if (asset.quality === "release") reasons.push("release quality metadata present");

  const releaseProbePath = options.spec.evidence.releaseAssetProbes?.[asset.id]
    ?? `tests/reports/showcase-release-asset-probes/${asset.id}.json`;
  const releaseProbePasses = releaseAssetProbePasses(releaseProbePath);
  if (releaseProbePasses) reasons.push("passing retained release probe");
  else if (options.policy.requireRenderedProbe) penalties.push("missing passing release probe");

  if (options.rejectedHash && asset.hash === options.rejectedHash) penalties.push("same content hash as rejected asset");
  if (baseScore <= 0) penalties.push("no resolver ranking match for replacement query");
  penalties.push(...gameAssetPenalties(role, asset, options.query));
  penalties.push(...surfaceDetailPenalties(role, asset));
  const geometryGate = gameGeometryGate(options.spec, role, asset, { projectDir: options.projectDir });
  reasons.push(...geometryGate.reasons);
  penalties.push(...geometryGate.penalties);

  const penaltyCost = penalties.reduce((total, penalty) => {
    if (penalty.startsWith("same content hash")) return total + 100;
    if (penalty.includes("provenance") || penalty.includes("release probe")) return total + 50;
    if (penalty.includes("quality") || penalty.includes("role mismatch")) return total + 20;
    if (penalty.includes("game asset")) return total + 18;
    if (penalty.includes("surface detail")) return total + 40;
    return total + 8;
  }, 0);
  const score = Math.max(0, roundScore(baseScore + qualityBonus(asset) + evidenceBonus(releaseProbePasses) + gameAssetBonus(role, asset, options.query) - penaltyCost));
  const accepted = score > 0 && penalties.length === 0;

  return {
    candidate: {
      id: asset.id,
      role,
      typedRef: `assets.${asset.id}`,
      score,
      reasons,
      penalties,
      provenance,
      evidence: releaseProbePasses ? releaseProbePath : undefined,
      accepted,
      selected: false
    },
    specAsset: {
      id: asset.id,
      role,
      typedRef: `assets.${asset.id}`,
      quality: asset.quality ?? "candidate",
      hasDurableProvenance: hasDurableProvenance(provenance),
      hasRenderedProbe: releaseProbePasses,
      hasOrientationEvidence: Boolean(asset.orientation),
      hasForegroundBounds: releaseProbePasses
    },
    ...(geometryGate.racingTopology ? { racingTopology: geometryGate.racingTopology } : {}),
    ...(geometryGate.playableSurfaceMap ? { playableSurfaceMap: geometryGate.playableSurfaceMap } : {})
  };
}

function toCanonicalAsset(asset: ManifestAsset, role: string, provenance: ReturnType<typeof createProvenance>): AuraCanonicalAsset {
  return {
    id: `manifest:${asset.id}`,
    source: provenance.sourcePage ?? asset.source ?? "aura-assets-manifest",
    title: splitAssetId(asset.id).join(" "),
    description: asset.suitabilityReason,
    url: provenance.downloadUrl ?? asset.url ?? asset.source ?? "",
    downloadUrl: provenance.downloadUrl ?? asset.url,
    access: "direct-download",
    format: "glb",
    license: normalizeLicense(provenance.license, provenance.licenseUrl ?? provenance.sourcePage),
    licenseName: provenance.license,
    licenseUrl: provenance.licenseUrl,
    tags: [...splitAssetId(asset.id), role.toLowerCase()],
    sourcePage: provenance.sourcePage,
    author: provenance.author,
    attribution: provenance.author,
    intendedRole: toCanonicalRole(role),
    roleSuitability: asset.suitabilityReason,
    bounds: asset.bounds ? { size: asset.bounds } : undefined,
    dimensions: asset.boundsMetadata?.size,
    materialCount: asset.materials?.length,
    textureCount: asset.textures?.length,
    animationClipCount: asset.animations?.length,
    skinCount: asset.skeleton?.skinCount,
    morphTargetCount: asset.morphTargets?.targetCount,
    qualityWarnings: asset.warnings
  };
}

function releaseAssetProbePasses(relativePath: string): boolean {
  const probe = readJson(relativePath);
  const probeRecord = recordValue(probe);
  const evidence = recordValue(probeRecord?.evidence);
  const renderedProbe = recordValue(probeRecord?.renderedProbe);
  return evidence?.pass === true &&
    stringArray(evidence.failures).length === 0 &&
    typeof renderedProbe?.sha256 === "string" &&
    Boolean(recordValue(renderedProbe.foregroundBounds));
}

function normalizeRole(role: string | undefined, requiredRole: ShowcaseSpecAssetPolicy["requiredRole"]): string {
  if (role && role.trim()) return role;
  return requiredRole === "platformer-world" ? "world" : requiredRole ?? "world";
}

function roleMatchesPolicy(role: string, policy: ShowcaseSpecAssetPolicy): boolean {
  if (!policy.requiredRole) return true;
  if (policy.requiredRole === "architecture") return role === "architecture" || role === "building" || role === "environment";
  if (policy.requiredRole === "building") return role === "building" || role === "architecture" || role === "environment";
  if (policy.requiredRole === "data-station") return role === "data-station" || role === "abstract" || role === "effect-core";
  if (policy.requiredRole === "effect-core") return role === "effect-core" || role === "prop";
  if (policy.requiredRole === "facility" || policy.requiredRole === "industrial") return role === "facility" || role === "industrial" || role === "workcell" || role === "prop";
  if (policy.requiredRole === "platformer-world") return role === "world" || role === "stage" || role === "level";
  if (policy.requiredRole === "level") return role === "level" || role === "stage" || role === "world";
  return role === policy.requiredRole;
}

function toCanonicalRole(role: string): AuraAssetIntendedRole {
  if (role === "character") return "character";
  if (role === "vehicle") return "vehicle";
  if (role === "architecture" || role === "building" || role === "facility" || role === "industrial" || role === "workcell") return "environment";
  if (role === "abstract" || role === "data-station" || role === "effect-core" || role === "prop") return "prop";
  if (role === "level" || role === "stage") return "world";
  if (role === "environment") return "environment";
  if (role === "track") return "track";
  if (role === "world") return "world";
  return "unknown";
}

function qualityBonus(asset: ManifestAsset): number {
  return asset.quality === "release" ? 18 : asset.quality === "candidate" ? 8 : 0;
}

function evidenceBonus(releaseProbePasses: boolean): number {
  return releaseProbePasses ? 24 : 0;
}

function gameAssetBonus(role: string, asset: ManifestAsset, query: string): number {
  const tokens = gameTokens(asset, query);
  if (role === "vehicle") return hasAny(tokens, ["car", "kart", "sports", "race", "vehicle"]) ? 20 : 0;
  if (role === "track") return hasAny(tokens, ["track", "circuit", "road", "race", "route"]) ? 20 : 0;
  if (role === "character") return hasAny(tokens, ["runner", "character", "animated", "walk", "hero"]) ? 20 : 0;
  if (role === "world" || role === "stage" || role === "level") return hasAny(tokens, ["platform", "platformer", "side", "scroller", "level", "stage", "world"]) ? 20 : 0;
  return 0;
}

/**
 * Rejects a primary game asset that carries no texture data.
 *
 * Every other penalty here reads names, provenance, quality flags, or geometry. None of them looked at
 * whether the mesh has any surface detail, and `textureCount` was recorded on the candidate but never
 * scored. That is how the four promoted showcase routes ended up bound to untextured primaries:
 * measured, six of seven carry **zero** textures (`showcaseKenneyRaceCarRed` 0,
 * `showcaseKenneyNeonRaceCircuit` 0, `showcaseKenneyVerdantPlatformerWorld` 0, `auraClashPlayerRig` 0,
 * `arenaRooftopBuilding` 0), so their materials are flat colour factors and every capture reads as flat
 * untextured geometry no matter how the scene is lit, framed, or composed.
 *
 * A hero/primary role therefore requires at least one texture. Set dressing and abstract visualisation
 * are exempt, because a flat-shaded prop or debug guide is a legitimate choice.
 */
function surfaceDetailPenalties(role: string, asset: ManifestAsset): readonly string[] {
  const primaryRoles = new Set(["vehicle", "track", "character", "world", "stage", "level", "hero", "product"]);
  if (!primaryRoles.has(role)) return [];
  const textureCount = asset.textures?.length ?? 0;
  if (textureCount > 0) return [];
  return [`surface detail: ${role} primary asset carries no textures, so its materials are flat colour factors`];
}

function gameAssetPenalties(role: string, asset: ManifestAsset, query: string): readonly string[] {
  const tokens = gameTokens(asset, query);
  if (role === "vehicle" && !hasAny(tokens, ["car", "kart", "sports", "race", "vehicle"])) return ["game asset vehicle role lacks readable racing vehicle terms"];
  if (role === "track" && !hasAny(tokens, ["track", "circuit", "road", "race", "route"])) return ["game asset track role lacks visible road/circuit terms"];
  if (role === "character" && !hasAny(tokens, ["runner", "character", "animated", "walk", "hero"])) return ["game asset character role lacks locomotion/runner terms"];
  if ((role === "world" || role === "stage" || role === "level") && !hasAny(tokens, ["platform", "platformer", "side", "scroller", "level", "stage", "world"])) {
    return ["game asset platformer world role lacks side-scroller/platform terms"];
  }
  return [];
}

function gameTokens(asset: ManifestAsset, query: string): ReadonlySet<string> {
  return new Set([...splitAssetId(asset.id), ...splitAssetId(query), ...splitAssetId(asset.suitabilityReason ?? ""), String(asset.role ?? "").toLowerCase()].filter(Boolean));
}

function hasAny(tokens: ReadonlySet<string>, expected: readonly string[]): boolean {
  return expected.some((token) => tokens.has(token));
}

function splitAssetId(id: string): string[] {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
