// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";

/**
 * Phase-3 v2 effect option fields (`vignette`, `film-grain`,
 * `chromatic-aberration`) — `AuraEffectNode` field additions are a lane-15
 * `nodes/types.ts` touch (qr-request filed); this local widening keeps the
 * factories typed until the union lands.
 */
interface PostV3EffectOptions extends Omit<AuraEffectNode, "kind" | "effect"> {
  readonly smoothness?: number;
  readonly roundness?: number;
  readonly size?: number;
  readonly luminanceResponse?: number;
}
import { effects } from "../nodes/effects.composite.js";
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
      // CCR-03-3: authored keys, inert on the legacy bridge. Delegating
      // factories pass their own caller's list through `postAuthored`.
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
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
      postAuthored: Object.keys(options).filter((key) => key !== "postAuthored"),
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
      color: options.color ?? "#020617",
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored")
    }),
  contactOcclusion: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "contact-occlusion",
      name: options.name ?? "contact occlusion grounding",
      intensity: options.intensity ?? 0.36,
      radius: options.radius ?? 0.52,
      density: options.density ?? 0.7,
      color: options.color ?? "#020617",
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored")
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
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
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
      intensity: options.intensity ?? 1,
      // `postAuthored` — not `mode` — carries the authored/default split: the
      // factory keeps its legacy `mode ?? "fxaa"` fill, so the bridge reads
      // `postAuthored` for "mode actually authored" (absent → `auto`).
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored")
    }),
  /**
   * PRD-03 §6.9/§8.12 (Phase 3): display vignette — S10b `DISPLAY_GRADE`.
   * `color` accepts "#rrggbb" or [r,g,b]; the bridge maps to `vignette`.
   * (AuraEffectType/AuraEffectNode field extension is lane-15-owned —
   * qr-request pending; the literals cast until it lands.)
   */
  vignette: (options: PostV3EffectOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "vignette",
      name: options.name ?? "vignette",
      intensity: options.intensity ?? 0.3,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.smoothness !== undefined ? { smoothness: options.smoothness } : {}),
      ...(options.roundness !== undefined ? { roundness: options.roundness } : {}),
      ...(options.color !== undefined ? { color: options.color } : {})
    } as unknown as AuraEffectNode),
  /** Phase 3: S12 film grain (size in px, luminanceResponse modulates the lerp). */
  filmGrain: (options: PostV3EffectOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "film-grain",
      name: options.name ?? "film grain",
      intensity: options.intensity ?? 0.05,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored"),
      ...(options.size !== undefined ? { size: options.size } : {}),
      ...(options.luminanceResponse !== undefined ? { luminanceResponse: options.luminanceResponse } : {})
    } as unknown as AuraEffectNode),
  /** Phase 3: §8.12 radial chromatic aberration on the HDR composite (S10). */
  chromaticAberration: (options: PostV3EffectOptions = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "chromatic-aberration",
      name: options.name ?? "chromatic aberration",
      intensity: options.intensity ?? 0.0015,
      postAuthored: options.postAuthored ?? Object.keys(options).filter((key) => key !== "postAuthored")
    } as unknown as AuraEffectNode),
};
