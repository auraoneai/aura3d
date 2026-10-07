/**
 * PRD-05 §6.4 G10 (Phase 0 slice) — `stylized-flat` art-direction resolution.
 *
 * `stylized-flat` is the only structured replacement for the deleted
 * `suitabilityReason` regex waiver: an untextured release asset is accepted
 * only when its `artDirection` id resolves to an `assets/art-direction/<id>.json`
 * document declaring `shading: "stylized-flat"` AND the entry carries an
 * approved look-dev record bound to its current hash.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuraCliAssetEntry, AuraCliLookDevRecordDetail } from "../asset-core-types.js";

export interface ArtDirectionDocument {
  readonly id: string;
  readonly shading?: string;
  readonly palette?: readonly string[];
  readonly texelDensity?: number;
  readonly referenceImages?: readonly string[];
  readonly mix?: readonly string[];
}

/** Reads `assets/art-direction/<id>.json` under `projectDir`; undefined when absent/invalid. */
export function readArtDirectionDocument(projectDir: string, id: string | undefined): ArtDirectionDocument | undefined {
  if (!id || !/^[a-z0-9][a-z0-9-_]*$/i.test(id)) return undefined;
  const file = resolve(projectDir, "assets", "art-direction", `${id}.json`);
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object") return undefined;
    return { id, ...(parsed as Record<string, unknown>) } as ArtDirectionDocument;
  } catch {
    return undefined;
  }
}

/** A look-dev record counts as approved when a reviewer verdict accepted the asset's current hash. */
export function hasApprovedLookDevRecord(entry: Pick<AuraCliAssetEntry, "hash" | "derived" | "lookDev">): boolean {
  const record = entry.lookDev as AuraCliLookDevRecordDetail | undefined;
  if (!record || record.reviews.length === 0) return false;
  const boundHash = record.derivedHash ?? entry.derived?.hash ?? entry.hash;
  return record.reviews.some((review) => review.verdict === "accept") && boundHash === (entry.derived?.hash ?? entry.hash);
}

/**
 * The `stylized-flat` escape for G5/the untextured-release check: art-direction
 * doc exists, declares `shading: "stylized-flat"`, and look-dev approved.
 */
export function hasStylizedFlatApproval(projectDir: string, entry: Pick<AuraCliAssetEntry, "hash" | "derived" | "lookDev" | "artDirection">): boolean {
  const document = readArtDirectionDocument(projectDir, entry.artDirection);
  if (document?.shading !== "stylized-flat") return false;
  return hasApprovedLookDevRecord(entry);
}
