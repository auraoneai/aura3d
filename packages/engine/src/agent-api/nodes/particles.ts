// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraEffectNode, AuraParticleBudgetDiagnostics, AuraParticleMaterialMode, AuraSceneNode } from "./types.js";
import { groups } from "./groups.js";
import { prefabs } from "./prefabs/index.js";
import { particleFountain } from "../particle-fountain-runtime.js";
import { lastParticleUpdateMs } from "@aura3d/rendering";

export const particles = {
  materialModes: (): readonly AuraParticleMaterialMode[] => ["additive-glow", "soft-alpha", "spark", "smoke", "splash", "dust", "star"],
  fountain: (options: { readonly color?: AuraColor; readonly count?: number; readonly emissionRate?: number } = {}): readonly AuraSceneNode[] => prefabs.particleFountain(options),
  diagnostics: collectParticleBudgetDiagnostics
} as const;

/**
 * PRD-07 P1-T3 — existing fields plus `declared`/`observedLive`/`observedDraws`.
 * The function is static: observed values are always null here and are filled
 * by the `effects` diagnostics section when a live effect system reports.
 * `measuredUpdateMs` is filled from the `particles` FrameStats scope when a
 * live prd07 contributor has wrapped a frame (null for static scenes).
 */
export function collectParticleBudgetDiagnostics(nodes: readonly AuraSceneNode[]): AuraParticleBudgetDiagnostics & { readonly declared: number; readonly observedLive: null; readonly observedDraws: null } {
  const flattened = groups.flatten(nodes);
  const particleEffects = flattened.filter((node): node is AuraEffectNode => node.kind === "effect" && node.effect === "particles");
  const totalParticles = particleEffects.reduce((sum, node) => sum + Math.max(120, Math.min(6000, node.particleCount ?? 900)), 0);
  const modes = Array.from(new Set(particleEffects.map((node) => node.materialMode ?? "soft-alpha"))).sort() as AuraParticleMaterialMode[];
  return {
    kind: "aura-particle-budget",
    effectCount: particleEffects.length,
    totalParticles,
    estimatedDrawCalls: particleEffects.length,
    heuristicUpdateCostMs: Number((totalParticles * 0.00018 + particleEffects.length * 0.04).toFixed(3)),
    // C-20/C-28: last measured "particles" scope ms; null until a live
    // prd07 frame wraps update+draw (static scenes stay null, not zero).
    measuredUpdateMs: lastParticleUpdateMs(),
    modes,
    texturedBillboards: particleEffects.filter((node) => node.texturedBillboard !== false).length,
    declared: totalParticles,
    observedLive: null,
    observedDraws: null
  };
}
