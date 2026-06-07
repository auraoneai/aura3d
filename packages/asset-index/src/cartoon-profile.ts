import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

export type CartoonAssetProfile =
  | "cartoon-character"
  | "cartoon-prop"
  | "cartoon-set"
  | "cartoon-environment";

export type CartoonAssetCategory = "character" | "prop" | "set" | "environment";

export interface CartoonAssetProfileEvaluation {
  readonly profile: CartoonAssetProfile;
  readonly category: CartoonAssetCategory;
  readonly suitable: boolean;
  readonly scoreBonus: number;
  readonly rejectionReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly matchedSignals: readonly string[];
}

export const cartoonAssetProfiles: readonly CartoonAssetProfile[] = [
  "cartoon-character",
  "cartoon-prop",
  "cartoon-set",
  "cartoon-environment",
];

const PROFILE_CATEGORY: Record<CartoonAssetProfile, CartoonAssetCategory> = {
  "cartoon-character": "character",
  "cartoon-prop": "prop",
  "cartoon-set": "set",
  "cartoon-environment": "environment",
};

const CARTOON_STYLE_TERMS = [
  "cartoon",
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

export function isCartoonAssetProfile(profile: string): profile is CartoonAssetProfile {
  return (cartoonAssetProfiles as readonly string[]).includes(profile);
}

export function evaluateCartoonAssetProfile(
  asset: AuraCanonicalAsset,
  profile: CartoonAssetProfile,
): CartoonAssetProfileEvaluation {
  const category = PROFILE_CATEGORY[profile];
  const rejectionReasons: string[] = [];
  const warnings: string[] = [];
  const matchedSignals: string[] = [];
  const text = searchableText(asset);
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  if (asset.access !== "direct-download") {
    rejectionReasons.push(`asset is marketplace/deep-link only; ${profile} auto-resolve requires direct-download access.`);
  }

  if (!asset.license.verified || !asset.license.redistributable) {
    rejectionReasons.push(`asset license is not verified redistributable (${asset.license.spdx}); ${profile} requires license-safe catalog provenance.`);
  }

  if (asset.format !== "glb") {
    rejectionReasons.push(`expected GLB format for cartoon-library auto-resolve; found ${asset.format}.`);
  }

  collectSignals(text, tags, CARTOON_STYLE_TERMS, matchedSignals);
  const hasCartoonStyle = hasAny(text, tags, CARTOON_STYLE_TERMS);
  if (!hasCartoonStyle) {
    warnings.push("catalog metadata does not explicitly prove cartoon/stylized art direction; inspect preview before publishing.");
  }

  const photoreal = firstTerm(text, PHOTOREAL_TERMS);
  if (photoreal && !hasCartoonStyle) {
    rejectionReasons.push(`catalog metadata looks photorealistic or scan-derived ("${photoreal}"), not cartoon-ready.`);
  } else if (photoreal) {
    warnings.push(`catalog metadata includes "${photoreal}"; verify the asset is stylized enough for cartoon use.`);
  }

  const ipRisk = firstTerm(text, IP_RISK_TERMS);
  if (ipRisk) {
    rejectionReasons.push(`catalog metadata contains IP-risk term "${ipRisk}"; cartoon profiles only accept license-safe original/generic assets.`);
  }

  const violenceRisk = firstTerm(text, VIOLENCE_TERMS);
  if (violenceRisk) {
    rejectionReasons.push(`catalog metadata contains child-safety risk term "${violenceRisk}".`);
  }

  applyProfileRules(asset, profile, text, tags, rejectionReasons, warnings, matchedSignals);

  let scoreBonus = 0;
  if (hasCartoonStyle) scoreBonus += 24;
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
  };
}

function applyProfileRules(
  asset: AuraCanonicalAsset,
  profile: CartoonAssetProfile,
  text: string,
  tags: readonly string[],
  rejectionReasons: string[],
  warnings: string[],
  matchedSignals: string[],
): void {
  const maxTriangles = triangleBudget(profile);
  if (typeof asset.triangles === "number" && asset.triangles > maxTriangles) {
    rejectionReasons.push(`triangle count ${asset.triangles} exceeds ${profile} budget of ${maxTriangles}.`);
  }

  const maxPayload = payloadBudget(profile);
  if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes > maxPayload) {
    rejectionReasons.push(`payload ${asset.fileSizeBytes} bytes exceeds ${profile} browser budget of ${maxPayload}.`);
  }

  if (profile === "cartoon-character") {
    collectSignals(text, tags, CHARACTER_TERMS, matchedSignals);
    collectSignals(text, tags, HUMANOID_RIG_TERMS, matchedSignals);
    collectSignals(text, tags, FACIAL_TERMS, matchedSignals);
    collectSignals(text, tags, ANIMATION_TERMS, matchedSignals);
    if (!hasAny(text, tags, CHARACTER_TERMS)) {
      rejectionReasons.push("catalog metadata is not character-like enough for a cartoon-character.");
    }
    if (!hasAny(text, tags, HUMANOID_RIG_TERMS)) {
      rejectionReasons.push("catalog metadata does not show rigged/skinned/humanoid compatibility for a cartoon-character.");
    }
    if (asset.hasAnimations !== true) {
      rejectionReasons.push(
        asset.hasAnimations === false
          ? "asset is marked static; cartoon-character requires embedded animation clips."
          : "missing animation metadata; cartoon-character requires proven embedded animation clips.",
      );
    }
    if (!hasAny(text, tags, FACIAL_TERMS)) {
      warnings.push("facial expression, mouth, morph, or viseme metadata is missing; validate lip-sync readiness after resolve.");
    }
    validateBounds(asset, 0.45, 4.5, profile, warnings, rejectionReasons);
    return;
  }

  if (profile === "cartoon-prop") {
    collectSignals(text, tags, PROP_TERMS, matchedSignals);
    if (!hasAny(text, tags, PROP_TERMS)) {
      rejectionReasons.push("catalog metadata is not prop-like enough for a cartoon-prop.");
    }
    if (hasAny(text, tags, CHARACTER_TERMS) && !hasAny(text, tags, PROP_TERMS)) {
      rejectionReasons.push("catalog metadata looks like a character, not a standalone cartoon prop.");
    }
    validateBounds(asset, 0.02, 18, profile, warnings, rejectionReasons);
    return;
  }

  if (profile === "cartoon-set") {
    collectSignals(text, tags, SET_TERMS, matchedSignals);
    if (!hasAny(text, tags, SET_TERMS)) {
      rejectionReasons.push("catalog metadata is not set/location-like enough for a cartoon-set.");
    }
    if (asset.bounds) {
      const largest = Math.max(...asset.bounds.size);
      if (largest < 1.5) {
        rejectionReasons.push(`bounds largest dimension ${formatNumber(largest)}m is too small for a walkable cartoon set.`);
      }
    } else {
      warnings.push("bounds metadata unavailable; validate-cartoon must confirm walkable scale after resolve.");
    }
    return;
  }

  collectSignals(text, tags, ENVIRONMENT_TERMS, matchedSignals);
  if (!hasAny(text, tags, ENVIRONMENT_TERMS)) {
    rejectionReasons.push("catalog metadata is not backdrop/sky/world-like enough for a cartoon-environment.");
  }
  if (asset.hasAnimations === true) {
    warnings.push("environment candidate includes animations; verify it behaves as a static backdrop or world layer.");
  }
}

function profileScoreBonus(
  asset: AuraCanonicalAsset,
  profile: CartoonAssetProfile,
  text: string,
  tags: readonly string[],
  matchedSignals: readonly string[],
): number {
  let bonus = Math.min(12, matchedSignals.length * 2);
  if (profile === "cartoon-character") {
    if (hasAny(text, tags, CHARACTER_TERMS)) bonus += 16;
    if (hasAny(text, tags, HUMANOID_RIG_TERMS)) bonus += 12;
    if (hasAny(text, tags, FACIAL_TERMS)) bonus += 10;
    if (hasAny(text, tags, ANIMATION_TERMS) || asset.hasAnimations === true) bonus += 14;
    return bonus;
  }
  if (profile === "cartoon-prop") {
    if (hasAny(text, tags, PROP_TERMS)) bonus += 18;
    if (asset.hasAnimations === false || asset.hasAnimations === undefined) bonus += 4;
    return bonus;
  }
  if (profile === "cartoon-set") {
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
  profile: CartoonAssetProfile,
  warnings: string[],
  rejectionReasons: string[],
): void {
  if (!asset.bounds) {
    warnings.push("bounds metadata unavailable; validate-cartoon must confirm scale after resolve.");
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

function triangleBudget(profile: CartoonAssetProfile): number {
  switch (profile) {
    case "cartoon-character":
      return 160_000;
    case "cartoon-prop":
      return 100_000;
    case "cartoon-set":
      return 350_000;
    case "cartoon-environment":
      return 250_000;
  }
}

function payloadBudget(profile: CartoonAssetProfile): number {
  switch (profile) {
    case "cartoon-character":
      return 45 * 1024 * 1024;
    case "cartoon-prop":
      return 30 * 1024 * 1024;
    case "cartoon-set":
      return 90 * 1024 * 1024;
    case "cartoon-environment":
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
