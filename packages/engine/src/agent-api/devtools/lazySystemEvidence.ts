// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLazySystemEvidence, AuraSceneKitLazySystemId } from "../index.js";

export type MutableAuraLazySystemEvidence = {
  requested: boolean;
  loaded: boolean;
  requestCount: number;
  loadCount: number;
  lastReason?: string;
  lastLoadMs?: number;
};

export const auraLazySystemEvidence = new Map<AuraSceneKitLazySystemId, MutableAuraLazySystemEvidence>();

export function ensureAuraLazySystemEvidence(system: AuraSceneKitLazySystemId) {
  const existing = auraLazySystemEvidence.get(system);
  if (existing) return existing;
  const created: MutableAuraLazySystemEvidence = { requested: false, loaded: false, requestCount: 0, loadCount: 0 };
  auraLazySystemEvidence.set(system, created);
  return created;
}

export function markAuraLazySystemRequested(system: AuraSceneKitLazySystemId, reason?: string): void {
  const entry = ensureAuraLazySystemEvidence(system);
  entry.requested = true;
  entry.requestCount += 1;
  entry.lastReason = reason;
}

export function markAuraLazySystemLoaded(system: AuraSceneKitLazySystemId, loadMs?: number): void {
  const entry = ensureAuraLazySystemEvidence(system);
  entry.loaded = true;
  entry.loadCount += 1;
  if (Number.isFinite(loadMs)) entry.lastLoadMs = loadMs;
}

export function collectAuraLazySystemEvidence(): readonly AuraLazySystemEvidence[] {
  return ([
    "physics-backend",
    "product-gltf-loader",
    "postprocess",
    "character-rig"
  ] as const).map((system) => {
    const entry = ensureAuraLazySystemEvidence(system);
    return {
      kind: "aura-lazy-system-evidence",
      system,
      requested: entry.requested,
      loaded: entry.loaded,
      requestCount: entry.requestCount,
      loadCount: entry.loadCount,
      ...(entry.lastReason ? { lastReason: entry.lastReason } : {}),
      ...(Number.isFinite(entry.lastLoadMs) ? { lastLoadMs: entry.lastLoadMs } : {})
    };
  });
}
