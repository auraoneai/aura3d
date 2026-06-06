import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

export type GameAssetProfile = "fighting-character";

export interface GameAssetProfileEvaluation {
  readonly profile: GameAssetProfile;
  readonly suitable: boolean;
  readonly scoreBonus: number;
  readonly rejectionReasons: readonly string[];
  readonly warnings: readonly string[];
}

const CHARACTER_TERMS = [
  "fighter",
  "fighting",
  "humanoid",
  "human",
  "character",
  "warrior",
  "ninja",
  "soldier",
  "boxer",
  "knight",
  "martial",
  "brawler",
  "hero",
  "enemy",
  "npc",
  "avatar",
  "robot",
  "android",
  "mannequin",
  "zombie",
  "skeleton",
  "monster",
];

const FIGHTING_TERMS = [
  "fighter",
  "fighting",
  "combat",
  "attack",
  "punch",
  "kick",
  "martial",
  "boxing",
  "brawler",
  "warrior",
  "ninja",
  "sword",
];

const UNSUITABLE_TERMS = [
  "aircraft",
  "airplane",
  "plane",
  "vehicle",
  "car",
  "truck",
  "weapon",
  "gun",
  "rifle",
  "sword only",
  "building",
  "architecture",
  "house",
  "room",
  "environment",
  "terrain",
  "stage",
  "prop",
  "furniture",
  "chair",
  "table",
  "helmet",
  "hair",
  "hat",
  "shoe",
  "boot",
  "rock",
  "tree",
  "plant",
  "sculpt",
  "sculpture",
  "statue",
  "bust",
  "figurine",
  "miniature",
  "scan",
  "photogrammetry",
  "pedestal",
  "spider",
  "animal",
  "quadruped",
  "creature",
  "insect",
  "dragon",
  "dinosaur",
  "horse",
  "dog",
  "cat",
  "bird",
  "fish",
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
 ];

export function evaluateGameAssetProfile(
  asset: AuraCanonicalAsset,
  profile: GameAssetProfile,
): GameAssetProfileEvaluation {
  if (profile !== "fighting-character") {
    return {
      profile,
      suitable: false,
      scoreBonus: 0,
      rejectionReasons: [`Unsupported game asset profile "${profile}".`],
      warnings: [],
    };
  }

  const rejectionReasons: string[] = [];
  const warnings: string[] = [];
  const text = searchableText(asset);
  const tags = asset.tags.map((tag) => tag.toLowerCase());

  if (asset.access !== "direct-download") {
    rejectionReasons.push("asset is marketplace/deep-link only; fighting-character auto-resolve requires direct-download access.");
  }

  if (!asset.license.verified || !asset.license.redistributable) {
    rejectionReasons.push(`asset license is not verified redistributable (${asset.license.spdx}); fighting-character requires license-safe catalog provenance.`);
  }

  if (asset.format !== "glb") {
    rejectionReasons.push(`expected GLB format for browser-game fighter auto-resolve; found ${asset.format}.`);
  }

  if (asset.hasAnimations !== true) {
    rejectionReasons.push(
      asset.hasAnimations === false
        ? "asset is marked static; fighting-character requires embedded animation clips."
        : "missing animation metadata; fighting-character requires proven embedded animation clips.",
    );
  }

  if (!hasAny(text, tags, CHARACTER_TERMS)) {
    rejectionReasons.push("catalog metadata is not character-like or humanoid enough for a fighter.");
  }

  const unsuitable = firstUnsuitableTerm(text);
  if (unsuitable) {
    rejectionReasons.push(`catalog metadata looks like "${unsuitable}", not a complete playable fighter.`);
  }

  const ipRisk = firstIpRiskTerm(text);
  if (ipRisk) {
    rejectionReasons.push(`catalog metadata contains IP-risk term "${ipRisk}"; fighting-character profile only accepts license-safe original/generic assets.`);
  }

  if (typeof asset.triangles === "number" && asset.triangles > 200_000) {
    rejectionReasons.push(`triangle count ${asset.triangles} exceeds fighting-character budget of 200000.`);
  }

  if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes > 50 * 1024 * 1024) {
    rejectionReasons.push(`payload ${asset.fileSizeBytes} bytes exceeds fighting-character browser budget of 52428800.`);
  }

  if (asset.bounds) {
    const largest = Math.max(...asset.bounds.size);
    if (largest > 4.5) {
      rejectionReasons.push(`bounds largest dimension ${formatNumber(largest)}m is too large for a character-scale fighter.`);
    }
    const height = asset.bounds.size[1];
    if (height > 0 && height < 0.75) {
      warnings.push(`bounds height ${formatNumber(height)}m is small for a humanoid fighter; confirm scale after resolve.`);
    }
  } else {
    warnings.push("bounds metadata unavailable; validate-game must confirm scale after resolve.");
  }

  let scoreBonus = 0;
  if (hasAny(text, tags, CHARACTER_TERMS)) scoreBonus += 20;
  if (hasAny(text, tags, FIGHTING_TERMS)) scoreBonus += 12;
  if (asset.hasAnimations === true) scoreBonus += 20;
  if (asset.format === "glb") scoreBonus += 8;
  if (asset.license.verified && asset.license.redistributable) scoreBonus += 6;
  if (asset.access === "direct-download") scoreBonus += 4;
  if (asset.bounds) scoreBonus += 2;
  if (asset.sourcePage || asset.license.sourcePage) scoreBonus += 2;
  if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes <= 25 * 1024 * 1024) scoreBonus += 2;
  if (rejectionReasons.length > 0) scoreBonus -= 100;

  return {
    profile,
    suitable: rejectionReasons.length === 0,
    scoreBonus,
    rejectionReasons,
    warnings,
  };
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

function firstUnsuitableTerm(text: string): string | undefined {
  return UNSUITABLE_TERMS.find((term) => {
    if (term === "weapon" || term === "hair") {
      return text.includes(term) && !/(character|humanoid|fighter|warrior|body|head|avatar)/i.test(text);
    }
    return text.includes(term);
  });
}

function firstIpRiskTerm(text: string): string | undefined {
  return IP_RISK_TERMS.find((term) => text.includes(term));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
