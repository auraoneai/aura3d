// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetDefinition, AuraAssetRef, AuraAssetMap } from "./types.js";
import { unique } from "../GameEvidence.js";

export const auraAssetRefBrand: unique symbol = Symbol("AuraAssetRef");

export function defineAuraAssets<const T extends Record<string, AuraAssetDefinition>>(definitions: T): AuraAssetMap<T> {
  const refs: Record<string, AuraAssetRef> = {};
  for (const [id, definition] of Object.entries(definitions)) {
    const sha256 = (definition as { readonly sha256?: string }).sha256;
    const normalizedHash = typeof definition.hash === "string" && definition.hash.length > 0
      ? definition.hash
      : typeof sha256 === "string" && sha256.length > 0
        ? sha256
        : undefined;
    refs[id] = {
      ...definition,
      ...(normalizedHash ? { hash: normalizedHash } : {}),
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
