/**
 * Direct render path (beat-three.js PRD, L-P1, contract 3.1).
 *
 * Two ways a frame reaches the canvas:
 *
 * - `hdr-msaa`: the scene renders into a 4x multisampled RGBA16F target and an
 *   OutputPass blit tone-maps it onto the canvas (`A3D_QR_CORE_OUTPUT`). Needed
 *   whenever the scene authors post-processing, HDR output control or
 *   transmission.
 * - `direct`: the scene renders once into the canvas's own 8-bit MSAA
 *   framebuffer with the encode done in the forward shader (the same LDR route
 *   a post chain declining the v2 seam already takes). One pass, no offscreen
 *   multisampled target, no resolve blit.
 *
 * `resolveRenderPath` is a pure decision so it can be unit-tested without a GL
 * context; `withDirectPath` applies it by pinning `A3D_QR_CORE_OUTPUT` off for
 * the renderer's flags. `quality: "production"` never takes the direct path, so
 * it reproduces the previous behaviour exactly.
 */

import type { QrFlags } from "../contracts/core";
import { withCoreOutputOff } from "../renderer/coreOutputPostRoute";

export type AuraQualityMode = "auto" | "production" | "safe-basic" | "cinematic";
export type AuraRenderPath = "direct" | "hdr-msaa";

export interface RenderPathInput {
  /** Requested mode; `undefined` is `"auto"`. */
  readonly quality: AuraQualityMode | undefined;
  /**
   * Reasons the scene needs the HDR target (authored post-processing, HDR
   * output options, transmission, custom shaders, ...). Empty = eligible.
   */
  readonly blockers: readonly string[];
}

export interface RenderPathDecision {
  readonly path: AuraRenderPath;
  readonly quality: AuraQualityMode;
  /** Human-readable reason, surfaced as `app.diagnostics().renderPath.reason`. */
  readonly reason: string;
}

export const QUALITY_MODES: readonly AuraQualityMode[] = ["auto", "production", "safe-basic", "cinematic"];

export function isQualityMode(value: unknown): value is AuraQualityMode {
  return typeof value === "string" && (QUALITY_MODES as readonly string[]).includes(value);
}

export function resolveRenderPath(input: RenderPathInput): RenderPathDecision {
  const quality = input.quality ?? "auto";
  if (quality === "production" || quality === "cinematic") {
    return { path: "hdr-msaa", quality, reason: `quality "${quality}" always uses the HDR multisampled target` };
  }
  if (quality === "safe-basic") {
    // RP-06: the direct path has no post chain, so whatever would have needed the HDR target is dropped; name it.
    const dropped = input.blockers.length > 0 ? `; not rendered on this path: ${input.blockers.join("; ")}` : "";
    return { path: "direct", quality, reason: `quality "safe-basic" always uses the direct path${dropped}` };
  }
  if (input.blockers.length > 0) {
    return { path: "hdr-msaa", quality, reason: `scene needs the HDR target: ${input.blockers.join("; ")}` };
  }
  return { path: "direct", quality, reason: "scene authors no post-processing, HDR output or transmission" };
}

/** The parts of a render item {@link directPathItemBlockers} reads (structural, so no GL types are needed). */
export interface DirectPathItemLike {
  readonly label?: string;
  readonly material?: unknown;
}

type ParameterSource = { getParameter?(name: string): unknown; renderState?: { blend?: unknown } };

function numericParameter(material: ParameterSource, name: string): number {
  const value = material.getParameter?.(name);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * RP-01: reasons a decoded scene needs the HDR target that the authored snapshot cannot show, read from the render items a GLB
 * produced. Blending happens after the in-shader encode on the direct path (display space) but before it on the HDR path (linear),
 * so a BLEND material renders differently (50% white over black: 113/255 direct against 197/255 HDR). Transmission needs the
 * HDR scene-colour capture. The transmission test mirrors `itemReportsTransmissionLobe` (forward/Transmission.ts). Each reason
 * appears once.
 */
export function directPathItemBlockers(items: readonly DirectPathItemLike[]): string[] {
  const reasons = new Set<string>();
  for (const item of items) {
    const material = item.material as (ParameterSource & { baseMaterial?: ParameterSource }) | undefined;
    if (!material) continue;
    const base = material.baseMaterial ?? material;
    if (base.renderState?.blend) {
      reasons.add("decoded GLB has a transparent (BLEND) material");
      continue;
    }
    if (numericParameter(base, "u_transmissionFactor") > 0.001
      || numericParameter(base, "u_diffuseTransmissionFactor") > 0.001
      || numericParameter(base, "u_volumeThicknessFactor") > 0.001) {
      reasons.add("decoded GLB has a transmission material");
    }
  }
  return [...reasons];
}

/** The renderer flags for the direct path: the OutputPass/HDR-target route pinned off. */
export function withDirectPath(flags: QrFlags): QrFlags {
  return withCoreOutputOff(flags);
}
