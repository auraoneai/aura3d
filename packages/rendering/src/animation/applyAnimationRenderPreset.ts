import { AnimationToonMaterial, type AnimationToonMaterialOptions } from "./AnimationToonMaterial.js";
import type { AnimationRenderPresetEvidence } from "./AnimationRenderPreset.js";
import type { AnimationMaterialStyle } from "./AnimationMaterialStyle.js";
import { colorGradePixels, outlinePixels, type ColorGradeResult, type OutlineResult } from "../PostProcessPass.js";

/**
 * applyAnimationRenderPreset — turns a (metadata) AnimationRenderPreset into the
 * concrete, pixel-affecting treatment it describes:
 *
 *  1. MATERIAL: builds a real `AnimationToonMaterial` (banded N·L ramp + rim) from
 *     the preset's `materialStyle`. The band count comes from `materialStyle.rampSteps`.
 *  2. OUTLINE: runs the existing Sobel `outlinePixels()` post-pass when the style
 *     requests outlines.
 *  3. COLOR GRADE: pushes a stylized, slightly-saturated, gently-contrasted grade
 *     consistent with the preset (storybook look), honoring `reducedFlash`.
 *
 * WHAT ACTUALLY AFFECTS PIXELS (honest accounting):
 *  - `material` is a fully-wired engine material. Assigning it to scene meshes and
 *    rendering with a ShaderLibrary that has the animation program registered produces
 *    banded toon shading on real fragments. THIS FUNCTION DOES NOT REASSIGN SCENE
 *    MESH MATERIALS — there is no scene-graph type imported here — it RETURNS the
 *    material so the caller (which owns the scene) can assign it. That assignment
 *    step is the one piece that is the caller's responsibility, not this function's.
 *  - `outline` (when present) is a real OutlineResult whose `.pixels` ARE modified
 *    image bytes. If you pass a frame buffer, the returned bytes are drawn pixels.
 *  - `colorGrade` (when a frame is passed) is a real ColorGradeResult — modified
 *    pixels.
 *
 * WHAT IS NOT WIRED:
 *  - Lights / shadows from the preset are reflected in the returned `lighting`
 *    descriptor and fed into the toon material's single key-light uniforms, but the
 *    multi-light rig (`preset.lights`) is descriptive — the toon program consumes one
 *    directional key light, not the full named rig.
 *  - Bloom/fog from the preset are NOT applied here (they belong to the HDR pipeline);
 *    only outline + color grade run as post-passes in this function.
 */

export interface ApplyAnimationRenderPresetFrame {
  /** RGBA8 pixel buffer (length === width * height * 4). */
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface AnimationRenderPresetLightingDescriptor {
  readonly keyLightDirection: readonly [number, number, number];
  readonly keyLightColor: readonly [number, number, number];
  readonly softShadows: boolean;
  readonly contactShadows: boolean;
  /** The full named rig from the preset (descriptive — not all consumed by the toon program). */
  readonly namedRig: readonly string[];
}

export interface ApplyAnimationRenderPresetOptions {
  /** Optional explicit base color override for the toon material. */
  readonly baseColor?: readonly [number, number, number, number] | undefined;
  /** Optional toon material override knobs (light direction/colors/rim). */
  readonly material?: Partial<AnimationToonMaterialOptions> | undefined;
  /** Optional frame to run the outline + color-grade post-passes against. */
  readonly frame?: ApplyAnimationRenderPresetFrame | undefined;
}

export interface ApplyAnimationRenderPresetResult {
  readonly kind: "animation-render-preset-application";
  /** Real engine material — assign to scene meshes to get banded toon pixels. */
  readonly material: AnimationToonMaterial;
  readonly materialStyle: AnimationMaterialStyle;
  /** Key-light descriptor derived from the preset, also baked into the material. */
  readonly lighting: AnimationRenderPresetLightingDescriptor;
  /** True when the Sobel outline pass is enabled for this preset. */
  readonly outlineEnabled: boolean;
  /** Present only when a frame was supplied AND outlines are enabled. Real modified pixels. */
  readonly outline?: OutlineResult | undefined;
  /** Present only when a frame was supplied. Real modified pixels. */
  readonly colorGrade?: ColorGradeResult | undefined;
  /** Honest per-stage record of what touched pixels. */
  readonly appliedToPixels: {
    readonly toonMaterial: "returned-for-caller-assignment";
    readonly outline: boolean;
    readonly colorGrade: boolean;
  };
}

const DEFAULT_KEY_LIGHT_DIRECTION: readonly [number, number, number] = [0.3, 0.8, 0.5];

/**
 * Map a AnimationMaterialStyle.treatment to a shadow-floor that keeps the chosen
 * look readable: flatter treatments use a higher floor (less contrast between bands).
 */
function shadowFloorForTreatment(style: AnimationMaterialStyle): number {
  switch (style.treatment) {
    case "flat-readable":
      return 0.6;
    case "soft-toon":
      return 0.45;
    case "cel":
      return 0.3;
    case "preserve-pbr":
    default:
      return 0.4;
  }
}

export function applyAnimationRenderPreset(
  preset: AnimationRenderPresetEvidence,
  options: ApplyAnimationRenderPresetOptions = {}
): ApplyAnimationRenderPresetResult {
  const style = preset.materialStyle;

  const keyLightDirection = options.material?.lightDirection ?? DEFAULT_KEY_LIGHT_DIRECTION;
  const keyLightColor = options.material?.lightColor ?? [1, 0.97, 0.9];

  // 1. MATERIAL — band count comes straight from the style's rampSteps (clamped to
  // the toon material's supported [2, 16] range).
  const bands = Math.max(2, Math.min(16, Math.round(style.rampSteps)));
  const material = new AnimationToonMaterial({
    name: `${preset.name}-toon`,
    baseColor: options.baseColor ?? options.material?.baseColor ?? [0.92, 0.58, 0.16, 1],
    bands,
    shadowFloor: options.material?.shadowFloor ?? shadowFloorForTreatment(style),
    lightDirection: keyLightDirection,
    lightColor: keyLightColor as readonly [number, number, number],
    rimColor: options.material?.rimColor ?? [0.6, 0.72, 1],
    rimPower: options.material?.rimPower ?? 3,
    // Cel treatment leans on a stronger rim for graphic edges.
    rimIntensity: options.material?.rimIntensity ?? (style.treatment === "cel" ? 0.6 : 0.4)
  });

  const lighting: AnimationRenderPresetLightingDescriptor = {
    keyLightDirection,
    keyLightColor: keyLightColor as readonly [number, number, number],
    softShadows: preset.shadows.soft,
    contactShadows: preset.shadows.contact,
    namedRig: preset.lights
  };

  const outlineEnabled = style.outline;

  let outline: OutlineResult | undefined;
  let colorGrade: ColorGradeResult | undefined;

  if (options.frame) {
    const { pixels, width, height } = options.frame;
    // 2. OUTLINE — real Sobel edge pass over the supplied frame.
    let working = pixels;
    if (outlineEnabled) {
      outline = outlinePixels(working, width, height, {
        // Warm storybook ink that reads against the night palette.
        color: [24, 18, 12, 255],
        width: 1,
        threshold: 0.22,
        opacity: 0.85
      });
      working = outline.pixels;
    }
    // 3. COLOR GRADE — stylized grade; reducedFlash trims saturation/contrast.
    const punch = preset.reducedFlash ? 1 : 1.05;
    colorGrade = colorGradePixels(working, width, height, {
      contrast: punch,
      saturation: 1 + style.saturationBoost,
      vibrance: preset.reducedFlash ? 0.05 : 0.12,
      vignette: 0.18
    });
  }

  return {
    kind: "animation-render-preset-application",
    material,
    materialStyle: style,
    lighting,
    outlineEnabled,
    outline,
    colorGrade,
    appliedToPixels: {
      toonMaterial: "returned-for-caller-assignment",
      outline: outline !== undefined,
      colorGrade: colorGrade !== undefined
    }
  };
}
