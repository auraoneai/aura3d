import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

export type AnimationAssetProfile =
  | "animation-character"
  | "animation-prop"
  | "animation-set"
  | "animation-environment";

export type AnimationAssetCategory = "character" | "prop" | "set" | "environment";

export interface AnimationAssetProfileEvaluation {
  readonly profile: AnimationAssetProfile;
  readonly category: AnimationAssetCategory;
  readonly suitable: boolean;
  readonly scoreBonus: number;
  readonly rejectionReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly matchedSignals: readonly string[];
  /**
   * Checks that could not be decided from pre-download catalog metadata and must
   * be re-run against the downloaded GLB (e.g. embedded animation clips, rig,
   * triangle budget, walkable bounds). Empty unless `preDownload` was set.
   */
  readonly validationHooks: readonly AnimationAssetValidationHook[];
}

/** A deferred, post-download check the resolver/CLI should run on the GLB. */
export type AnimationAssetValidationHook =
  | "animation-clips"
  | "humanoid-rig"
  | "facial-blendshapes"
  | "triangle-budget"
  | "payload-budget"
  | "walkable-bounds"
  | "character-scale-bounds"
  | "prop-scale-bounds";

export interface AnimationAssetProfileEvaluationOptions {
  /**
   * Pre-download (catalog-only) ranking mode. The hosted catalog exposes title +
   * tags + license but rarely rig/animation/triangle metadata, so in this mode
   * checks that depend on *absent* metadata DOWN-RANK and defer to a post-download
   * `validationHooks` entry instead of hard-rejecting the candidate. Proven-negative
   * signals (a `false` animation flag, photoreal/IP-risk/violence terms, or a
   * known-oversized payload/triangle/extent) still reject. Defaults to `false`
   * (strict post-download evaluation), preserving existing behavior.
   */
  readonly preDownload?: boolean;
}

export const animationAssetProfiles: readonly AnimationAssetProfile[] = [
  "animation-character",
  "animation-prop",
  "animation-set",
  "animation-environment",
];

const PROFILE_CATEGORY: Record<AnimationAssetProfile, AnimationAssetCategory> = {
  "animation-character": "character",
  "animation-prop": "prop",
  "animation-set": "set",
  "animation-environment": "environment",
};

const ANIMATION_STYLE_TERMS = [
  "animation",
  "toon",
  "stylized",
  "stylised",
  "cel",
  "cell shaded",
  "cel-shaded",
  "low poly",
  "low-poly",
  "cute",
  "kid",
  "kids",
  "child friendly",
  "chibi",
  "flat color",
  "handpainted",
  "hand painted",
  "poly pizza",
  "kenney",
  "quaternius",
];

const CHARACTER_TERMS = [
  "character",
  "humanoid",
  "person",
  "people",
  "boy",
  "girl",
  "kid",
  "hero",
  "villain",
  "sidekick",
  "mascot",
  "avatar",
  "actor",
  "narrator",
  "robot",
  "creature",
];

const FACIAL_TERMS = [
  "face",
  "facial",
  "expression",
  "expressive",
  "emotion",
  "mouth",
  "viseme",
  "lip sync",
  "lipsync",
  "blendshape",
  "blend shape",
  "morph",
];

const HUMANOID_RIG_TERMS = [
  "humanoid",
  "rigged",
  "armature",
  "skeleton",
  "skinned",
  "retarget",
  "mixamo",
  "animation",
  "animated",
];

const ANIMATION_TERMS = [
  "animated",
  "animation",
  "idle",
  "walk",
  "run",
  "talk",
  "gesture",
  "wave",
  "emote",
];

const PROP_TERMS = [
  "prop",
  "furniture",
  "chair",
  "table",
  "desk",
  "sofa",
  "vehicle",
  "tool",
  "toy",
  "book",
  "tree",
  "plant",
  "rock",
  "sign",
  "crate",
  "food",
];

const SET_TERMS = [
  "set",
  "room",
  "house",
  "classroom",
  "school",
  "park",
  "street",
  "interior",
  "exterior",
  "stage",
  "level",
  "playground",
  "space station",
  "underwater",
  "walkable",
  "floor",
  "environment",
];

const ENVIRONMENT_TERMS = [
  "environment",
  "skybox",
  "backdrop",
  "background",
  "hdri",
  "sky",
  "landscape",
  "world",
  "terrain",
  "horizon",
  "panorama",
  "diorama",
  "forest",
  "desert",
  "ocean",
  "mountain",
];

const PHOTOREAL_TERMS = [
  "photogrammetry",
  "scan",
  "scanned",
  "photoreal",
  "photo real",
  "realistic",
  "pbr scan",
  "raw scan",
  "statue",
  "bust",
  "sculpture",
];

const IP_RISK_TERMS = [
  "fan art",
  "fanart",
  "copyright",
  "copyrighted",
  "ripped",
  "rip",
  "pokemon",
  "mario",
  "sonic",
  "naruto",
  "dragon ball",
  "fortnite",
  "marvel",
  "dc comics",
  "star wars",
  "disney",
  "pixar",
  "spongebob",
];

const VIOLENCE_TERMS = [
  "gore",
  "blood",
  "horror",
  "corpse",
  "weapon pack",
  "gun",
  "rifle",
  "pistol",
];

export function isAnimationAssetProfile(profile: string): profile is AnimationAssetProfile {
  return (animationAssetProfiles as readonly string[]).includes(profile);
}

/** Hard cap on any single bounds dimension; beyond this an asset is mis-scaled. */
const INSANE_EXTENT_UNITS = 50;

export function evaluateAnimationAssetProfile(
  asset: AuraCanonicalAsset,
  profile: AnimationAssetProfile,
  options: AnimationAssetProfileEvaluationOptions = {},
): AnimationAssetProfileEvaluation {
  const preDownload = options.preDownload === true;
  const category = PROFILE_CATEGORY[profile];
  const rejectionReasons: string[] = [];
  const warnings: string[] = [];
  const matchedSignals: string[] = [];
  const validationHooks: AnimationAssetValidationHook[] = [];
  const text = searchableText(asset);
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  if (asset.access !== "direct-download") {
    rejectionReasons.push(`asset is marketplace/deep-link only; ${profile} auto-resolve requires direct-download access.`);
  }

  if (!asset.license.verified || !asset.license.redistributable) {
    rejectionReasons.push(`asset license is not verified redistributable (${asset.license.spdx}); ${profile} requires license-safe catalog provenance.`);
  }

  if (asset.format !== "glb") {
    rejectionReasons.push(`expected GLB format for animation-library auto-resolve; found ${asset.format}.`);
  }

  // An insanely large extent is a proven-negative signal in every mode: even
  // pre-download we know the bounds are wrong if the catalog reported them.
  if (asset.bounds) {
    const largest = Math.max(...asset.bounds.size);
    if (largest > INSANE_EXTENT_UNITS) {
      rejectionReasons.push(`bounds largest dimension ${formatNumber(largest)}m is implausible (> ${INSANE_EXTENT_UNITS}m); asset is mis-scaled.`);
    }
  }

  collectSignals(text, tags, ANIMATION_STYLE_TERMS, matchedSignals);
  const hasAnimationStyle = hasAny(text, tags, ANIMATION_STYLE_TERMS);
  if (!hasAnimationStyle) {
    warnings.push("catalog metadata does not explicitly prove animation/stylized art direction; inspect preview before publishing.");
  }

  const photoreal = firstTerm(text, PHOTOREAL_TERMS);
  if (photoreal && !hasAnimationStyle) {
    rejectionReasons.push(`catalog metadata looks photorealistic or scan-derived ("${photoreal}"), not animation-ready.`);
  } else if (photoreal) {
    warnings.push(`catalog metadata includes "${photoreal}"; verify the asset is stylized enough for animation use.`);
  }

  const ipRisk = firstTerm(text, IP_RISK_TERMS);
  if (ipRisk) {
    rejectionReasons.push(`catalog metadata contains IP-risk term "${ipRisk}"; animation profiles only accept license-safe original/generic assets.`);
  }

  const violenceRisk = firstTerm(text, VIOLENCE_TERMS);
  if (violenceRisk) {
    rejectionReasons.push(`catalog metadata contains child-safety risk term "${violenceRisk}".`);
  }

  applyProfileRules(asset, profile, text, tags, rejectionReasons, warnings, matchedSignals, validationHooks, preDownload);

  let scoreBonus = 0;
  if (hasAnimationStyle) scoreBonus += 24;
  if (asset.license.verified && asset.license.redistributable) scoreBonus += 8;
  if (asset.access === "direct-download") scoreBonus += 6;
  if (asset.format === "glb") scoreBonus += 6;
  if (asset.sourcePage || asset.license.sourcePage) scoreBonus += 2;
  if (asset.thumbnailUrl) scoreBonus += 2;
  if (asset.bounds) scoreBonus += 2;
  if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes <= payloadBudget(profile) / 2) scoreBonus += 2;
  scoreBonus += profileScoreBonus(asset, profile, text, tags, matchedSignals);
  if (rejectionReasons.length > 0) scoreBonus -= 100;

  return {
    profile,
    category,
    suitable: rejectionReasons.length === 0,
    scoreBonus,
    rejectionReasons,
    warnings,
    matchedSignals: [...new Set(matchedSignals)],
    validationHooks: [...new Set(validationHooks)],
  };
}

function applyProfileRules(
  asset: AuraCanonicalAsset,
  profile: AnimationAssetProfile,
  text: string,
  tags: readonly string[],
  rejectionReasons: string[],
  warnings: string[],
  matchedSignals: string[],
  validationHooks: AnimationAssetValidationHook[],
  preDownload: boolean,
): void {
  // Triangle/payload caps are proven-negatives only when the catalog actually
  // reported a count over budget; an absent count defers to a post-download hook
  // in pre-download mode (it always did fall through silently before).
  const maxTriangles = triangleBudget(profile);
  if (typeof asset.triangles === "number") {
    if (asset.triangles > maxTriangles) {
      rejectionReasons.push(`triangle count ${asset.triangles} exceeds ${profile} budget of ${maxTriangles}.`);
    }
  } else if (preDownload) {
    validationHooks.push("triangle-budget");
  }

  const maxPayload = payloadBudget(profile);
  if (typeof asset.fileSizeBytes === "number") {
    if (asset.fileSizeBytes > maxPayload) {
      rejectionReasons.push(`payload ${asset.fileSizeBytes} bytes exceeds ${profile} browser budget of ${maxPayload}.`);
    }
  } else if (preDownload) {
    validationHooks.push("payload-budget");
  }

  if (profile === "animation-character") {
    collectSignals(text, tags, CHARACTER_TERMS, matchedSignals);
    collectSignals(text, tags, HUMANOID_RIG_TERMS, matchedSignals);
    collectSignals(text, tags, FACIAL_TERMS, matchedSignals);
    collectSignals(text, tags, ANIMATION_TERMS, matchedSignals);
    if (!hasAny(text, tags, CHARACTER_TERMS)) {
      rejectionReasons.push("catalog metadata is not character-like enough for a animation-character.");
    }
    // Rig evidence rarely appears in catalog titles/tags. Pre-download we defer
    // it to a post-download rig check rather than rejecting every catalog hit.
    if (!hasAny(text, tags, HUMANOID_RIG_TERMS)) {
      if (preDownload) {
        warnings.push("catalog metadata does not prove a rig/skeleton; validate humanoid rig after download.");
        validationHooks.push("humanoid-rig");
      } else {
        rejectionReasons.push("catalog metadata does not show rigged/skinned/humanoid compatibility for a animation-character.");
      }
    }
    // A `false` flag is a proven static asset -> always reject. An *absent* flag
    // is unknown: pre-download we defer to an embedded-clip check; strict mode
    // keeps requiring proven clips.
    if (asset.hasAnimations === false) {
      rejectionReasons.push("asset is marked static; animation-character requires embedded animation clips.");
    } else if (asset.hasAnimations !== true) {
      if (preDownload) {
        warnings.push("missing animation metadata; validate embedded animation clips after download.");
        validationHooks.push("animation-clips");
      } else {
        rejectionReasons.push("missing animation metadata; animation-character requires proven embedded animation clips.");
      }
    }
    if (!hasAny(text, tags, FACIAL_TERMS)) {
      warnings.push("facial expression, mouth, morph, or viseme metadata is missing; validate lip-sync readiness after resolve.");
      if (preDownload) validationHooks.push("facial-blendshapes");
    }
    validateBounds(asset, 0.45, 4.5, profile, warnings, rejectionReasons, preDownload, validationHooks, "character-scale-bounds");
    return;
  }

  if (profile === "animation-prop") {
    collectSignals(text, tags, PROP_TERMS, matchedSignals);
    if (!hasAny(text, tags, PROP_TERMS)) {
      rejectionReasons.push("catalog metadata is not prop-like enough for a animation-prop.");
    }
    if (hasAny(text, tags, CHARACTER_TERMS) && !hasAny(text, tags, PROP_TERMS)) {
      rejectionReasons.push("catalog metadata looks like a character, not a standalone animation prop.");
    }
    validateBounds(asset, 0.02, 18, profile, warnings, rejectionReasons, preDownload, validationHooks, "prop-scale-bounds");
    return;
  }

  if (profile === "animation-set") {
    collectSignals(text, tags, SET_TERMS, matchedSignals);
    if (!hasAny(text, tags, SET_TERMS)) {
      rejectionReasons.push("catalog metadata is not set/location-like enough for a animation-set.");
    }
    if (asset.bounds) {
      const largest = Math.max(...asset.bounds.size);
      if (largest < 1.5) {
        rejectionReasons.push(`bounds largest dimension ${formatNumber(largest)}m is too small for a walkable animation set.`);
      }
    } else {
      warnings.push("bounds metadata unavailable; validate-animation must confirm walkable scale after resolve.");
      if (preDownload) validationHooks.push("walkable-bounds");
    }
    return;
  }

  collectSignals(text, tags, ENVIRONMENT_TERMS, matchedSignals);
  if (!hasAny(text, tags, ENVIRONMENT_TERMS)) {
    rejectionReasons.push("catalog metadata is not backdrop/sky/world-like enough for a animation-environment.");
  }
  if (asset.hasAnimations === true) {
    warnings.push("environment candidate includes animations; verify it behaves as a static backdrop or world layer.");
  }
}

function profileScoreBonus(
  asset: AuraCanonicalAsset,
  profile: AnimationAssetProfile,
  text: string,
  tags: readonly string[],
  matchedSignals: readonly string[],
): number {
  let bonus = Math.min(12, matchedSignals.length * 2);
  if (profile === "animation-character") {
    if (hasAny(text, tags, CHARACTER_TERMS)) bonus += 16;
    if (hasAny(text, tags, HUMANOID_RIG_TERMS)) bonus += 12;
    if (hasAny(text, tags, FACIAL_TERMS)) bonus += 10;
    if (hasAny(text, tags, ANIMATION_TERMS) || asset.hasAnimations === true) bonus += 14;
    return bonus;
  }
  if (profile === "animation-prop") {
    if (hasAny(text, tags, PROP_TERMS)) bonus += 18;
    if (asset.hasAnimations === false || asset.hasAnimations === undefined) bonus += 4;
    return bonus;
  }
  if (profile === "animation-set") {
    if (hasAny(text, tags, SET_TERMS)) bonus += 18;
    if (asset.bounds && Math.max(...asset.bounds.size) >= 1.5) bonus += 8;
    return bonus;
  }
  if (hasAny(text, tags, ENVIRONMENT_TERMS)) bonus += 18;
  if (asset.bounds && Math.max(...asset.bounds.size) >= 8) bonus += 6;
  return bonus;
}

function validateBounds(
  asset: AuraCanonicalAsset,
  minLargest: number,
  maxLargest: number,
  profile: AnimationAssetProfile,
  warnings: string[],
  rejectionReasons: string[],
  preDownload: boolean,
  validationHooks: AnimationAssetValidationHook[],
  hook: AnimationAssetValidationHook,
): void {
  if (!asset.bounds) {
    warnings.push("bounds metadata unavailable; validate-animation must confirm scale after resolve.");
    if (preDownload) validationHooks.push(hook);
    return;
  }
  const largest = Math.max(...asset.bounds.size);
  if (largest < minLargest) {
    rejectionReasons.push(`bounds largest dimension ${formatNumber(largest)}m is too small for ${profile}.`);
  }
  if (largest > maxLargest) {
    rejectionReasons.push(`bounds largest dimension ${formatNumber(largest)}m exceeds ${profile} scale budget of ${formatNumber(maxLargest)}m.`);
  }
}

function triangleBudget(profile: AnimationAssetProfile): number {
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

function payloadBudget(profile: AnimationAssetProfile): number {
  switch (profile) {
    case "animation-character":
      return 45 * 1024 * 1024;
    case "animation-prop":
      return 30 * 1024 * 1024;
    case "animation-set":
      return 90 * 1024 * 1024;
    case "animation-environment":
      return 80 * 1024 * 1024;
  }
}

function searchableText(asset: AuraCanonicalAsset): string {
  return [
    asset.id,
    asset.title,
    asset.description ?? "",
    asset.source,
    ...asset.tags,
  ].join(" ").toLowerCase();
}

function hasAny(text: string, tags: readonly string[], terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term) || tags.includes(term));
}

function collectSignals(text: string, tags: readonly string[], terms: readonly string[], matchedSignals: string[]): void {
  for (const term of terms) {
    if (text.includes(term) || tags.includes(term)) matchedSignals.push(term);
  }
}

function firstTerm(text: string, terms: readonly string[]): string | undefined {
  return terms.find((term) => text.includes(term));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
