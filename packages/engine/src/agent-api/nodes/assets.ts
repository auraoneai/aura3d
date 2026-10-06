// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetDefinition, AuraAssetRef, AuraAssetMap } from "./types.js";
import { unique } from "../GameEvidence.js";

export const auraAssetRefBrand: unique symbol = Symbol("AuraAssetRef");

export function defineAuraAssets<const T extends Record<string, AuraAssetDefinition>>(definitions: T): AuraAssetMap<T> {
  const refs: Record<string, AuraAssetRef> = {};
  for (const [id, definition] of Object.entries(definitions)) {
    refs[id] = {
      ...definition,
      kind: "aura-asset-ref",
      id,
      [auraAssetRefBrand]: {
        type: definition.type,
        id
      }
    } as AuraAssetRef;
  }
  return refs as AuraAssetMap<T>;
}
