import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

export type GameAssetProfile = "fighting-character";

export interface GameAssetProfileScoringRules {
  readonly characterTerms: readonly string[];
  readonly fightingTerms: readonly string[];
  readonly unsuitableTerms: readonly string[];
  readonly ipRiskTerms: readonly string[];
  readonly triangleBudget: number;
  readonly fileSizeBudgetBytes: number;
  readonly compactFileSizeBudgetBytes: number;
  readonly bonuses: {
    readonly characterLike: number;
    readonly fightingLike: number;
    readonly animations: number;
    readonly glbFormat: number;
    readonly verifiedRedistributableLicense: number;
    readonly directDownload: number;
    readonly bounds: number;
    readonly sourcePage: number;
    readonly compactPayload: number;
  };
  readonly rejectionPenalty: number;
}

export interface GameAssetProfileDefinition {
  readonly id: GameAssetProfile;
  readonly label: string;
  readonly requiredMetadata: readonly string[];
  readonly optionalMetadata: readonly string[];
  readonly rejectionReasons: readonly string[];
  readonly scoring: GameAssetProfileScoringRules;
}

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

export const gameAssetProfileDefinitions: readonly GameAssetProfileDefinition[] = [
  {
    id: "fighting-character",
    label: "Fighting character",
    requiredMetadata: ["verified redistributable license", "GLB/glTF model", "humanoid/skeleton evidence", "embedded animation clips", "bounds", "checksum"],
    optionalMetadata: ["texture summary", "triangle budget", "morph targets", "orientation hints"],
    rejectionReasons: ["static asset", "non-humanoid metadata", "unverified license", "IP-risk metadata", "oversized browser payload", "missing clips"],
    scoring: {
      characterTerms: CHARACTER_TERMS,
      fightingTerms: FIGHTING_TERMS,
      unsuitableTerms: UNSUITABLE_TERMS,
      ipRiskTerms: IP_RISK_TERMS,
      triangleBudget: 200_000,
      fileSizeBudgetBytes: 50 * 1024 * 1024,
      compactFileSizeBudgetBytes: 25 * 1024 * 1024,
      bonuses: {
        characterLike: 20,
        fightingLike: 12,
        animations: 20,
        glbFormat: 8,
        verifiedRedistributableLicense: 6,
        directDownload: 4,
        bounds: 2,
        sourcePage: 2,
        compactPayload: 2
      },
      rejectionPenalty: -100
    }
  }
];

export function getGameAssetProfileDefinition(profile: GameAssetProfile): GameAssetProfileDefinition | undefined {
  return gameAssetProfileDefinitions.find((candidate) => candidate.id === profile);
}

export function evaluateGameAssetProfile(
  asset: AuraCanonicalAsset,
  profile: GameAssetProfile,
): GameAssetProfileEvaluation {
  const definition = getGameAssetProfileDefinition(profile);
  if (!definition) {
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
  const rules = definition.scoring;

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

  if (!hasAny(text, tags, rules.characterTerms)) {
    rejectionReasons.push("catalog metadata is not character-like or humanoid enough for a fighter.");
  }

  const unsuitable = firstUnsuitableTerm(text, rules.unsuitableTerms);
  if (unsuitable) {
    rejectionReasons.push(`catalog metadata looks like "${unsuitable}", not a complete playable fighter.`);
  }

  const ipRisk = firstIpRiskTerm(text, rules.ipRiskTerms);
  if (ipRisk) {
    rejectionReasons.push(`catalog metadata contains IP-risk term "${ipRisk}"; fighting-character profile only accepts license-safe original/generic assets.`);
  }

  if (typeof asset.triangles === "number" && asset.triangles > rules.triangleBudget) {
    rejectionReasons.push(`triangle count ${asset.triangles} exceeds fighting-character budget of ${rules.triangleBudget}.`);
  }

  if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes > rules.fileSizeBudgetBytes) {
    rejectionReasons.push(`payload ${asset.fileSizeBytes} bytes exceeds fighting-character browser budget of ${rules.fileSizeBudgetBytes}.`);
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
  if (hasAny(text, tags, rules.characterTerms)) scoreBonus += rules.bonuses.characterLike;
  if (hasAny(text, tags, rules.fightingTerms)) scoreBonus += rules.bonuses.fightingLike;
  if (asset.hasAnimations === true) scoreBonus += rules.bonuses.animations;
  if (asset.format === "glb") scoreBonus += rules.bonuses.glbFormat;
  if (asset.license.verified && asset.license.redistributable) scoreBonus += rules.bonuses.verifiedRedistributableLicense;
  if (asset.access === "direct-download") scoreBonus += rules.bonuses.directDownload;
  if (asset.bounds) scoreBonus += rules.bonuses.bounds;
  if (asset.sourcePage || asset.license.sourcePage) scoreBonus += rules.bonuses.sourcePage;
  if (typeof asset.fileSizeBytes === "number" && asset.fileSizeBytes <= rules.compactFileSizeBudgetBytes) scoreBonus += rules.bonuses.compactPayload;
  if (rejectionReasons.length > 0) scoreBonus += rules.rejectionPenalty;

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

function firstUnsuitableTerm(text: string, terms: readonly string[]): string | undefined {
  return terms.find((term) => {
    if (term === "weapon" || term === "hair") {
      return text.includes(term) && !/(character|humanoid|fighter|warrior|body|head|avatar)/i.test(text);
    }
    return text.includes(term);
  });
}

function firstIpRiskTerm(text: string, terms: readonly string[]): string | undefined {
  return terms.find((term) => text.includes(term));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
