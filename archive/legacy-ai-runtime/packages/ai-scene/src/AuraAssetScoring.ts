import type { AuraAssetIntent } from "./AuraAssetIntent.js";
import type { AuraCinematicAssetManifestEntry } from "./AuraCinematicAssetManifest.js";

export interface AuraAssetScoreBreakdown {
  readonly total: number;
  readonly semantic: number;
  readonly mood: number;
  readonly category: number;
  readonly material: number;
  readonly scale: number;
  readonly visualQuality: number;
  readonly materialReadiness: number;
  readonly rejected: boolean;
  readonly rejectionReason?: string;
}

export function scoreCinematicAsset(intent: AuraAssetIntent, entry: AuraCinematicAssetManifestEntry): AuraAssetScoreBreakdown {
  const rejected = isDomCssRejected(intent, entry);
  const semantic = tagOverlap(intent.semanticTags, entry.semanticTags) * 14;
  const mood = tagOverlap(intent.moodTags, entry.moodTags) * 5;
  const material = tagOverlap(intent.materialDescriptors, entry.materialTags) * 4;
  const category = intent.category === entry.category ? 30 : 0;
  const scale = scoreScale(intent.scaleMeters, entry.scaleMeters);
  const visualQuality = clamp01(entry.visualQuality) * 12;
  const materialReadiness = clamp01(entry.materialReadiness) * 10;
  const total = rejected ? -Infinity : semantic + mood + category + material + scale + visualQuality + materialReadiness;
  return {
    total,
    semantic,
    mood,
    category,
    material,
    scale,
    visualQuality,
    materialReadiness,
    rejected,
    ...(rejected ? { rejectionReason: "DOM/CSS-only substitutes are not renderer-owned cinematic assets." } : {})
  };
}

export function sortAssetsBySemanticScore(intent: AuraAssetIntent, entries: readonly AuraCinematicAssetManifestEntry[]): readonly {
  readonly entry: AuraCinematicAssetManifestEntry;
  readonly score: AuraAssetScoreBreakdown;
}[] {
  return entries
    .map((entry) => ({ entry, score: scoreCinematicAsset(intent, entry) }))
    .filter((candidate) => !candidate.score.rejected && candidate.score.total > 0)
    .sort((left, right) => right.score.total - left.score.total);
}

function isDomCssRejected(intent: AuraAssetIntent, entry: AuraCinematicAssetManifestEntry): boolean {
  return entry.kind === "dom-css-overlay" || entry.substituteKind === "dom-css-only" || (!entry.rendererOwned && intent.disallowedSubstitutes.includes("dom-css-only"));
}

function tagOverlap(left: readonly string[], right: readonly string[]): number {
  const rightTags = new Set(right.map(normalizeTag));
  return left.map(normalizeTag).filter((tag) => rightTags.has(tag)).length;
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, "-");
}

function scoreScale(intentScale?: readonly [number, number, number], entryScale?: readonly [number, number, number]): number {
  if (!intentScale || !entryScale) return 3;
  const delta = intentScale.reduce((sum, value, index) => sum + Math.abs(value - (entryScale[index] ?? value)), 0);
  return Math.max(0, 8 - delta);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
