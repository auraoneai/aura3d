/**
 * render-modes.ts — PRD Phase I2 (rendering honesty). The SINGLE source of truth for:
 *
 *  1. WHICH cel is which. There are TWO distinct "cel" mechanisms and conflating them is the
 *     dishonesty this module exists to prevent:
 *       • IN-SHADER CEL  (GPU): the engine's real `AnimationToonMaterial` (banded N·L + Fresnel
 *         rim), assigned to non-glow SET PIECES at scene-build time in `scene-player.ts`. This is
 *         a true material shader — it shades geometry on the GPU before any pixels are read back.
 *       • CPU TOON POST-PASS: `applyToonTreatment` in `scripts/render-core.ts`, run on the
 *         CAPTURED RGBA pixels after read-back (quantize luma + Sobel ink + grade). This is a
 *         2D image filter — it never touches geometry or lighting.
 *     `renderModeNotes()` returns this contract verbatim so the studio/report can show it and the
 *     two are never described as the same thing.
 *
 *  2. The RENDER MODE (toon / wireframe / storyboard) and its verification. These are the three
 *     user-facing stage views; this module resolves the requested mode from a flag/env and
 *     verifies a request is one of the supported modes (no silent fallback to a dead mode).
 *
 *  3. The GLOBAL BLEND/alpha GHOST FIX. Many catalog GLBs set `alphaMode=BLEND` on an OPAQUE
 *     (opacity 1) material, so a textured mesh renders as a translucent white "ghost". The fix —
 *     force such materials opaque (blend off, depth write/test on) — must apply to EVERY render
 *     item (characters, props, set dressing), not just characters. `forceOpaqueIfGhost` is the one
 *     policy both `scene-player.ts` and any prop/set path call, so the fix is provably global.
 */

/** The three user-facing stage render modes (mirrors the UI `ViewMode`). */
export type RenderMode = "toon" | "wireframe" | "storyboard";

/** Shading style WITHIN the rendered (toon) mode: cel look vs realistic PBR. */
export type RenderStyle = "toon" | "pbr";

export const RENDER_MODES: readonly RenderMode[] = ["toon", "wireframe", "storyboard"];
export const RENDER_STYLES: readonly RenderStyle[] = ["toon", "pbr"];

/** True when `mode` is a real, supported render mode (not a dead/legacy flag). */
export function isRenderMode(mode: string): mode is RenderMode {
  return (RENDER_MODES as readonly string[]).includes(mode);
}

/** True when `style` is a real, supported render style. */
export function isRenderStyle(style: string): style is RenderStyle {
  return (RENDER_STYLES as readonly string[]).includes(style);
}

export interface ResolvedRenderMode {
  readonly mode: RenderMode;
  readonly style: RenderStyle;
  /** True when the cel image post-pass + in-shader cel apply (only in `toon` mode + `toon` style). */
  readonly celApplies: boolean;
}

/**
 * Resolve the effective render mode + style from explicit values, else env, else the defaults
 * (`toon` mode, `toon`/cel style). VERIFIES the request: an unknown mode/style THROWS rather than
 * silently falling back, so a typo can never quietly render the wrong view (PRD: "render-mode
 * verification; no dead flags").
 */
export function resolveRenderMode(opts: {
  readonly mode?: string;
  readonly style?: string;
  readonly env?: Record<string, string | undefined>;
} = {}): ResolvedRenderMode {
  const env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
  const rawMode = (opts.mode ?? env.AURA_RENDER_MODE ?? "toon").trim().toLowerCase();
  const rawStyle = (opts.style ?? env.AURA_RENDER_STYLE ?? "toon").trim().toLowerCase();
  if (!isRenderMode(rawMode)) {
    throw new Error(
      `Unknown AURA_RENDER_MODE "${rawMode}". Supported: ${RENDER_MODES.join(", ")} (no dead/legacy modes).`
    );
  }
  if (!isRenderStyle(rawStyle)) {
    throw new Error(
      `Unknown AURA_RENDER_STYLE "${rawStyle}". Supported: ${RENDER_STYLES.join(", ")}.`
    );
  }
  // Cel (both the in-shader material and the CPU post-pass) only applies in the rendered TOON mode
  // with the TOON style. Wireframe/storyboard are line/flat views; PBR style is realistic.
  const celApplies = rawMode === "toon" && rawStyle === "toon";
  return { mode: rawMode, style: rawStyle, celApplies };
}

/** The honest cel-vs-post-pass contract, returned verbatim for the resolver report / UI. */
export function renderModeNotes(): {
  readonly inShaderCel: string;
  readonly cpuToonPostPass: string;
  readonly modes: readonly RenderMode[];
  readonly styles: readonly RenderStyle[];
} {
  return {
    inShaderCel:
      "GPU material (AnimationToonMaterial): banded N·L + Fresnel rim, assigned to non-glow set pieces in scene-player.ts. Shades geometry before read-back.",
    cpuToonPostPass:
      "CPU 2D filter (render-core.ts applyToonTreatment): luma quantize + Sobel ink + grade on captured pixels. Never touches geometry/lighting.",
    modes: RENDER_MODES,
    styles: RENDER_STYLES
  };
}

/** A material's render state subset relevant to the ghost fix (the engine's `renderState`). */
export interface GhostFixableRenderState {
  blend?: boolean;
  depthWrite?: boolean;
  depthTest?: boolean;
}
export interface GhostFixableMaterial {
  readonly renderState?: GhostFixableRenderState;
  /** Opacity, when the material exposes it — opacity 1 + blend on is the ghost signature. */
  readonly opacity?: number;
}

/**
 * GLOBAL ghost fix. If a material is BLENDed yet effectively opaque (opacity ≥ 1 or unspecified),
 * force it opaque (blend off, depth write + test on) so its real textures render solid instead of
 * washing into the background. Returns true when it changed something (for proof/logging). Safe to
 * call on ANY render item — characters, props, set dressing — which is how the fix stays global.
 */
export function forceOpaqueIfGhost(material: GhostFixableMaterial | undefined | null): boolean {
  const rs = material?.renderState;
  if (!rs || !rs.blend) return false;
  // A genuinely translucent material (opacity < 1) is left alone; only opaque-but-BLENDed ghosts
  // are corrected.
  const opacity = typeof material?.opacity === "number" ? material.opacity : 1;
  if (opacity < 1) return false;
  rs.blend = false;
  rs.depthWrite = true;
  rs.depthTest = true;
  return true;
}

/** Apply the global ghost fix across a list of render items; returns the count of fixed materials. */
export function forceOpaqueAcrossRenderItems(
  items: readonly { readonly material?: GhostFixableMaterial }[]
): number {
  let fixed = 0;
  for (const item of items) if (forceOpaqueIfGhost(item.material)) fixed += 1;
  return fixed;
}
