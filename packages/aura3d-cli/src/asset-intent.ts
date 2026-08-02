/**
 * Typed asset-intent contract.
 *
 * ## Why a declarative contract
 *
 * Three unusable hero vehicles shipped into Turbo Drift Circuit in succession. Each replacement was
 * chosen by re-wording a search query and hoping the resolver returned something better, because there
 * was nowhere to *state what the route actually needed*. The requirement lived in a human's head:
 * "a modern road car with visible tyres, textured, commercially usable". Nothing machine-readable
 * expressed it, so nothing could check a candidate against it.
 *
 * An asset intent makes that requirement a value. It is consumed by the screening pipeline
 * (`screenAssetCandidates`) to decide which candidates to reject and why, and by
 * `admitAssetForRole` to decide whether a registered asset is fit for the role it is used in.
 *
 * ## Deliberate separation from admission
 *
 * `AssetRoleRequirement` in `asset-role-admission.ts` is the *checkable* subset: thresholds derived from
 * an intent. `AssetIntent` is the *authored* form, and carries fields admission cannot check on its own
 * (style words, expected camera angles, fallback policy) which the pipeline uses for search, ranking and
 * probe configuration. Keeping them separate stops the admission checker from growing fields it cannot
 * actually verify, which is how "asset loads, therefore asset is fine" gets reintroduced.
 */

import type { AssetAdmissionRole, AssetRoleRequirement } from "./asset-role-admission.js";

/**
 * A visual feature a role may require to be *readable*, not merely present.
 *
 * The distinction is the entire point. `turboHeroCar` had 16 wheel parts at four corners and still read
 * as a wheelless shell, because a closed-wheel Le Mans body encloses them. "Has wheels" and "wheels are
 * visible" are different claims and the contract must be able to demand the second one.
 */
export type RequiredVisibleFeature =
  | "wheels"
  | "feet"
  | "hands"
  | "face"
  | "windows"
  | "doors"
  | "weapon-muzzle"
  | "interactive-surface";

/** How permissive the caller is about licensing. */
export type LicensePolicy =
  /** Public-domain or CC0 only: no attribution obligation. */
  | "public-domain-only"
  /** Attribution-required licences allowed; the pipeline records the attribution. */
  | "commercial-attribution-allowed"
  /** Any redistributable licence, including share-alike. */
  | "any-redistributable";

/** What the caller will do about scale and pivot. */
export type NormalizationPolicy =
  /** Let the renderer fit and ground the asset from its manifest bounds. */
  | "fit-and-ground"
  /** Use the asset's own world units untouched; the caller has verified they are correct. */
  | "preserve-source-units"
  /** Require the asset to already be authored at real-world scale with a grounded pivot. */
  | "require-authored-scale";

/** What to do when no candidate satisfies the intent. */
export type FallbackPolicy =
  /** Fail loudly. Correct for a hero: a wrong hero is worse than a missing one. */
  | "reject-and-fail"
  /** Accept the best-ranked candidate that fails only `unproven` checks, and record the gap. */
  | "accept-best-with-recorded-gaps"
  /** Fall back to a lesser role (e.g. background instead of hero) and record the downgrade. */
  | "downgrade-role";

/** Geometry budget for the role. */
export interface AssetGeometryBudget {
  readonly maxTriangles?: number | undefined;
  readonly minTriangles?: number | undefined;
  readonly maxFileBytes?: number | undefined;
  /**
   * Maximum draw calls this asset may contribute *per instance*.
   *
   * Added after a real regression: a 4.6MB pine cluster rendered correctly in isolation but carried 42
   * nodes and 5 materials per instance, and at composition density drove a route to 840 draw calls and a
   * blank capture. A triangle budget would not have caught it; instance draw cost is a separate axis.
   */
  readonly maxDrawCallsPerInstance?: number | undefined;
}

/** Camera angles the asset must read correctly from, in radians of azimuth. */
export interface AssetCameraExpectation {
  /**
   * Azimuths the asset is presented at. A hero requiring readable wheels must list at least two, because
   * a single dead-on angle is exactly where a car's bodywork hides its own wheels -- the mistake that
   * produced a false "the renderer drops wheel primitives" diagnosis.
   */
  readonly heroAzimuths: readonly number[];
  readonly elevation?: number | undefined;
}

/** Orientation evidence the caller needs before it will trust a forward direction. */
export type OrientationRequirement =
  /** Manifest must declare `forwardAxis`; reject otherwise. */
  | "require-manifest-evidence"
  /** Accept an inferred forward axis, recording that it is inferred. */
  | "allow-inferred"
  /** Orientation is irrelevant (radially symmetric props, terrain). */
  | "not-required";

/**
 * A route's declarative statement of what it needs from an asset.
 *
 * Every field is either used to *search*, to *reject*, or to *configure a probe*. Nothing here is
 * decorative; a field that could not change an outcome would be a comment.
 */
export interface AssetIntent {
  /** Stable id for the intent, used in reports so a rejection is traceable to a requirement. */
  readonly id: string;
  /** The role the asset will be used in. Drives which admission checks apply. */
  readonly role: AssetAdmissionRole;
  /** Free-text style intent, used to build search queries. */
  readonly style: string;
  /** Features that must be *visually readable*, not merely modelled. */
  readonly requiredVisibleFeatures?: readonly RequiredVisibleFeature[] | undefined;
  /** Require textured materials rather than flat colour. */
  readonly materialRequirement?: "textured" | "any" | undefined;
  readonly licensePolicy: LicensePolicy;
  readonly geometryBudget?: AssetGeometryBudget | undefined;
  readonly heroCameraAngles?: AssetCameraExpectation | undefined;
  readonly orientationRequirement?: OrientationRequirement | undefined;
  readonly normalizationPolicy?: NormalizationPolicy | undefined;
  readonly fallbackPolicy?: FallbackPolicy | undefined;
}

/** SPDX identifiers each policy admits. */
const LICENSE_POLICY_ALLOWLIST: Readonly<Record<LicensePolicy, readonly string[]>> = {
  "public-domain-only": ["CC0-1.0", "Unlicense", "PDDL-1.0"],
  "commercial-attribution-allowed": ["CC0-1.0", "Unlicense", "PDDL-1.0", "CC-BY-4.0", "CC-BY-3.0", "MIT", "Apache-2.0"],
  "any-redistributable": [
    "CC0-1.0", "Unlicense", "PDDL-1.0", "CC-BY-4.0", "CC-BY-3.0", "MIT", "Apache-2.0",
    "CC-BY-SA-4.0", "CC-BY-SA-3.0"
  ]
};

/** True when `spdx` satisfies `policy`. Unknown or missing identifiers never satisfy any policy. */
export function licenseSatisfiesPolicy(spdx: string | undefined, policy: LicensePolicy): boolean {
  if (!spdx) return false;
  return LICENSE_POLICY_ALLOWLIST[policy].includes(spdx);
}

/** SPDX identifiers a policy admits, for search-time filtering and error messages. */
export function licensesForPolicy(policy: LicensePolicy): readonly string[] {
  return LICENSE_POLICY_ALLOWLIST[policy];
}

/**
 * Minimum distinct hero azimuths required when a role demands a readable feature.
 *
 * Mirrors `HERO_MIN_RENDERED_AZIMUTHS` in the admission module. Duplicated as a *validation* rule here
 * so an intent that could never be satisfied is rejected when authored, rather than after a pipeline run.
 */
export const MIN_INTENT_HERO_AZIMUTHS = 2;

/**
 * Reject an intent that cannot be satisfied as written.
 *
 * Authoring-time validation matters because the alternative is a screening run that rejects every
 * candidate for a reason that is actually a defect in the request. Returns human-readable problems;
 * empty means the intent is coherent.
 */
export function validateAssetIntent(intent: AssetIntent): readonly string[] {
  const problems: string[] = [];
  if (!intent.id.trim()) problems.push("intent id must not be empty");
  if (!intent.style.trim()) problems.push("intent style must not be empty; it is used to build search queries");

  const budget = intent.geometryBudget;
  if (budget?.maxTriangles !== undefined && budget?.minTriangles !== undefined &&
      budget.minTriangles > budget.maxTriangles) {
    problems.push(`geometry budget is empty: minTriangles ${budget.minTriangles} exceeds maxTriangles ${budget.maxTriangles}`);
  }
  for (const [field, value] of [
    ["maxTriangles", budget?.maxTriangles],
    ["minTriangles", budget?.minTriangles],
    ["maxFileBytes", budget?.maxFileBytes],
    ["maxDrawCallsPerInstance", budget?.maxDrawCallsPerInstance]
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      problems.push(`geometry budget ${field} must be a non-negative finite number (got ${String(value)})`);
    }
  }

  const features = intent.requiredVisibleFeatures ?? [];
  if (features.length > 0) {
    const azimuths = intent.heroCameraAngles?.heroAzimuths ?? [];
    const distinct = new Set(azimuths.map((azimuth) => Number(azimuth.toFixed(4))));
    if (distinct.size < MIN_INTENT_HERO_AZIMUTHS) {
      problems.push(
        `intent requires visible features (${features.join(", ")}) but declares only ${distinct.size} distinct hero azimuth(s); ` +
        `${MIN_INTENT_HERO_AZIMUTHS}+ are required because a single head-on angle is where a subject's own body hides its lower features`
      );
    }
  }

  if (features.includes("wheels") && intent.role !== "hero-vehicle" && intent.role !== "background-vehicle") {
    problems.push(`role "${intent.role}" cannot require visible wheels`);
  }
  if (features.includes("feet") && intent.role !== "playable-character") {
    problems.push(`role "${intent.role}" cannot require visible feet`);
  }
  return problems;
}

/**
 * Derive the checkable admission requirement from an authored intent.
 *
 * This is the seam between "what a route asked for" and "what a checker can verify". Anything the
 * checker cannot verify is deliberately *not* forwarded, so admission never reports a pass on a
 * dimension it did not measure.
 */
export function admissionRequirementForIntent(intent: AssetIntent): AssetRoleRequirement {
  const features = intent.requiredVisibleFeatures ?? [];
  const budget = intent.geometryBudget;
  return {
    role: intent.role,
    ...(features.includes("wheels") ? { requireReadableWheels: true } : {}),
    ...(intent.materialRequirement === "textured" ? { requireTextured: true } : {}),
    ...(budget?.maxTriangles !== undefined ? { maxTriangles: budget.maxTriangles } : {}),
    ...(budget?.minTriangles !== undefined ? { minTriangles: budget.minTriangles } : {}),
    // Attribution-bearing policies need author + licence recorded, so provenance completeness is checked.
    ...(intent.licensePolicy !== "public-domain-only" ? { requireProvenance: true } : {})
  };
}

/**
 * Build search queries for an intent, most specific first.
 *
 * Multiple phrasings rather than one, because a single query returning poor candidates was previously
 * indistinguishable from "the catalog has nothing" -- a conclusion I reached wrongly once and which cost
 * a whole pass. Enumerating phrasings makes the search itself auditable.
 */
export function searchQueriesForIntent(intent: AssetIntent): readonly string[] {
  const style = intent.style.trim();
  const roleWords: Partial<Record<AssetAdmissionRole, readonly string[]>> = {
    "hero-vehicle": ["car", "vehicle"],
    "background-vehicle": ["car", "traffic vehicle"],
    "playable-character": ["character", "character model"],
    environment: ["environment", "scene"],
    track: ["race track", "circuit"],
    platform: ["platform", "level block"],
    building: ["building", "house"],
    prop: ["prop"],
    collectible: ["collectible", "pickup"],
    weapon: ["weapon"],
    "ui-hero-object": ["product model"]
  };
  const words = roleWords[intent.role] ?? [];
  const queries = [style, ...words.map((word) => `${style} ${word}`)];
  if ((intent.requiredVisibleFeatures ?? []).includes("wheels")) {
    queries.push(`${style} car with visible wheels`);
  }
  // Dedupe while preserving specificity order.
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}
