// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode } from "../index.js";
import { AuraNodeBuilder, effects } from "../index.js";
import { shadows } from "./shadows.js";

export const postEffectBuilders = {
  bloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) => {
    const antiBlowout = options.antiBlowout ?? true;
    const maxIntensity = options.maxIntensity ?? 0.92;
    const intensity = antiBlowout
      ? Math.min(maxIntensity, Math.max(0.05, options.intensity ?? 0.35))
      : options.intensity ?? 0.35;
    return new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "bloom",
      intensity,
      color: options.color ?? "#ffffff",
      radius: options.radius ?? 0.38,
      threshold: options.threshold ?? 0.7,
      antiBlowout,
      maxIntensity,
      ...(options.quality !== undefined ? { quality: options.quality } : {}),
      ...(options.softKnee !== undefined ? { softKnee: options.softKnee } : {}),
      ...(options.shoulder !== undefined ? { shoulder: options.shoulder } : {})
    });
  },
  neonBloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    effects.bloom({
      intensity: options.intensity ?? 0.72,
      color: options.color ?? "#ff42c8",
      radius: options.radius ?? 0.48,
      threshold: options.threshold ?? 0.68,
      antiBlowout: options.antiBlowout ?? true,
      maxIntensity: options.maxIntensity ?? 0.92,
      ...(options.quality !== undefined ? { quality: options.quality } : {}),
      ...(options.softKnee !== undefined ? { softKnee: options.softKnee } : {}),
      ...(options.shoulder !== undefined ? { shoulder: options.shoulder } : {})
    }),
  ambientOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "ambient-occlusion",
      name: options.name ?? "screen space ambient occlusion grounding",
      intensity: options.intensity ?? 0.42,
      radius: options.radius ?? 0.74,
      density: options.density ?? 0.58,
      color: options.color ?? "#020617"
    }),
  contactOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "contact-occlusion",
      name: options.name ?? "contact occlusion grounding",
      intensity: options.intensity ?? 0.36,
      radius: options.radius ?? 0.52,
      density: options.density ?? 0.7,
      color: options.color ?? "#020617"
    }),
  /**
   * Root color-grade node (muse3jsparity-PRD A3). contrast/saturation execute
   * natively; exposure/shadows/highlights/lut are recorded on the node and
   * warned (no native grade target yet — never silently accepted).
   */
  colorGrade: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "color-grade",
      name: options.name ?? "color grade",
      intensity: options.intensity ?? 1,
      exposure: options.exposure ?? 1,
      contrast: options.contrast ?? 1,
      saturation: options.saturation ?? 1,
      ...(options.shadows !== undefined ? { shadows: options.shadows } : {}),
      ...(options.highlights !== undefined ? { highlights: options.highlights } : {}),
      ...(options.lut !== undefined ? { lut: options.lut } : {})
    }),
  /**
   * Root anti-alias node (muse3jsparity-PRD A3). `fxaa` executes natively;
   * `off` submits nothing; `taa` uses renderer-owned velocity/history for opaque
   * rigid triangles. Unsupported deforming/transparent geometry emits a named warning.
   */
  antiAlias: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "anti-alias",
      name: options.name ?? "anti alias",
      mode: options.mode ?? "fxaa",
      intensity: options.intensity ?? 1
    }),
};
