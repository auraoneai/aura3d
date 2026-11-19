/**
 * C-21 — sky, fog, atmosphere (engine side, CONTRACTS.md). Provider: PRD 07.
 * Flag: A3D_QR_VFX.
 */

import type { AuraColor, AuraVec3, AuraAssetRef } from "../agent-api/nodes/types.js";

export interface AuraSkySunSpec { readonly elevationDeg: number; readonly azimuthDeg: number; readonly intensity?: number; readonly color?: AuraColor; readonly discSize?: number; }
/** PRD-10 §6.3 Q-07-2 — ordered additive emission band on a gradient sky
 *  (aurora band / horizon city-glow). Each band is additive. */
export interface AuraSkyBand { readonly elevationDeg: number; readonly widthDeg: number; readonly color: AuraColor; readonly intensity: number; }
/** GU47 (declared by E-B, bound by E-G in `rendering/src/atmosphere/StarField.ts`): procedural star field on a sky. */
export interface AuraSkyStarsOptions { readonly count: number; readonly brightness?: number; }
/** GU47 (declared by E-B, bound by E-G in `rendering/src/atmosphere/CloudLayer.ts`): procedural cloud layer on a sky. */
export interface AuraSkyCloudsOptions { readonly coverage: number; readonly speed?: number; readonly color?: string; }
/**
 * The pre-GU47 star shapes the day-night sky (`nodes/sky.ts`) and the biome presets (`world/biomes.ts`) still emit;
 * kept assignable so the typed GU47 options land without breaking them (E-G narrows once those emit count/brightness).
 */
export interface AuraSkyStarsLegacySpec { readonly density?: number; readonly intensity?: number; readonly enabled?: boolean; readonly auroraBand?: boolean; }
/**
 * 5.7.0 stylised gradient sky: one colour band between the horizon and the zenith. It blends in over
 * `blend = [start, end]` (smoothstep), measured in sine of elevation above the horizon line (after
 * `horizonHeight` and `horizonSharpness`); bands blend in order, so list them from low to high.
 */
export interface AuraSkyGradientMidBand {
  readonly color: AuraColor;
  /** `[start, end]` of the blend, sine of elevation above the horizon line. Default `[0, 0.3]`. Negative values reach below it. */
  readonly blend?: readonly [number, number];
}
/** 5.7.0 stylised gradient sky: one sun glow lobe, `intensity * max(cos(angle to sun), 0) ^ exponent` times the sun colour. */
export interface AuraSkySunGlowLobe { readonly exponent: number; readonly intensity: number; }
/**
 * Sun on a gradient sky. `elevationDeg`/`azimuthDeg` set the direction (azimuth 0 faces +z, 90 faces +x).
 * The stylised profile also reads `glow`, `discIntensity`, `discSoftness` and `discBlend`; `discSize` is the
 * angular diameter in radians on both profiles.
 */
export interface AuraSkyGradientSunSpec extends AuraSkySunSpec {
  /** Stylised profile: up to 3 glow lobes around the sun (default `[{ exponent: 8, intensity: 0.25 }, { exponent: 64, intensity: 0.45 }]`); `[]` for none. */
  readonly glow?: readonly AuraSkySunGlowLobe[];
  /** Stylised profile: disc brightness, a multiple of the sun colour (default 3; 0 hides the disc). */
  readonly discIntensity?: number;
  /** Stylised profile: soft fraction of the disc radius, 0 (hard edge) to 1 (soft to the centre). Default 0.25. */
  readonly discSoftness?: number;
  /** Stylised profile: `"add"` adds the disc over the sky (default), `"replace"` paints it over the sky. */
  readonly discBlend?: "add" | "replace";
}
/** 5.7.0 stylised gradient sky: a horizon haze veil, `intensity * exp(-max(height, 0) * falloff)` towards `color`. */
export interface AuraSkyGradientHaze {
  /** Haze colour (default: the horizon colour). */
  readonly color?: AuraColor;
  /** Opacity at the horizon line, 0..1. */
  readonly intensity: number;
  /** How fast the haze thins with height (default 8). */
  readonly falloff?: number;
}
/**
 * The 5.7.0 stylised fields of `sky.gradient`. Passing any of them, or `style: "stylized"`, selects the stylised
 * profile; the classic profile keeps `exponent` and `horizonGlow` and draws exactly as before.
 */
export interface AuraSkyGradientStylizedFields {
  /** `"classic"` (power curve, the pre-5.7 look) or `"stylized"` (smoothstep bands, painted sun, haze). Default: stylized when any stylised field is set. */
  readonly style?: "classic" | "stylized";
  /** Stylised profile: up to 6 bands between the horizon and the zenith, low to high. */
  readonly mid?: AuraSkyGradientMidBand | readonly AuraSkyGradientMidBand[];
  /** Stylised profile: `[start, end]` of the zenith blend above the horizon line (default `[0.22, 0.85]` with a mid band, `[0, 1]` without). */
  readonly zenithBlend?: readonly [number, number];
  /** Stylised profile: `[start, end]` of the ground blend below the horizon line, measured downwards (default `[0, 0.25]`). */
  readonly groundBlend?: readonly [number, number];
  /** Stylised profile: sine of elevation of the horizon line (default 0; negative lowers it). */
  readonly horizonHeight?: number;
  /** Stylised profile: multiplies the height above the horizon line before every blend (default 1; 2 squeezes the bands towards the horizon). */
  readonly horizonSharpness?: number;
  /** Stylised profile: horizon haze veil. */
  readonly haze?: AuraSkyGradientHaze;
  /** Stylised profile: about one display code value of triangular noise against banding (default false). The sky is tone-mapped with the scene, like any drawn surface. */
  readonly dither?: boolean;
}
export type AuraSkySpec =
  | { readonly model: "preetham"; readonly sun: AuraSkySunSpec; readonly turbidity?: number; readonly rayleigh?: number; readonly mieCoefficient?: number; readonly mieDirectionalG?: number; readonly exposure?: number; readonly clouds?: AuraSkyCloudsOptions; readonly stars?: AuraSkyStarsOptions | AuraSkyStarsLegacySpec; readonly moon?: unknown; readonly groundColor?: AuraColor }
  | ({ readonly model: "gradient"; readonly zenith: AuraColor; readonly horizon: AuraColor; readonly ground?: AuraColor; readonly exponent?: number; readonly horizonGlow?: number; readonly sun?: AuraSkyGradientSunSpec; readonly bands?: readonly AuraSkyBand[]; readonly stars?: AuraSkyStarsOptions | AuraSkyStarsLegacySpec; readonly clouds?: AuraSkyCloudsOptions; readonly moon?: unknown; readonly intensity?: number } & AuraSkyGradientStylizedFields)
  | { readonly model: "hdri"; readonly texture: AuraAssetRef<"texture">; readonly intensity?: number; readonly rotation?: number; readonly blurriness?: number }
  | { readonly model: "cubemap"; readonly faces: readonly AuraAssetRef<"texture">[]; readonly intensity?: number };
export interface AuraHeightFogSpec { readonly mode?: "height" | "exp" | "exp2" | "linear" | "absorption"; readonly color?: AuraColor | "sky"; readonly density?: number; readonly heightDensity?: number; readonly heightFalloff?: number; readonly heightReference?: number; readonly start?: number; readonly maxOpacity?: number; readonly near?: number; readonly far?: number; readonly absorption?: AuraVec3; readonly sunInscatter?: number; readonly anisotropy?: number; readonly affectsBackground?: boolean; readonly backgroundDistance?: number; readonly transitionSeconds?: number; }
export interface AuraVolumetricFogSpec extends AuraHeightFogSpec { readonly quality?: "auto" | "analytic" | "froxel"; readonly volumetricFar?: number; readonly noise?: unknown; readonly lightShafts?: boolean; readonly localLights?: boolean; }
export interface AuraSkyNode { readonly kind: "sky"; readonly name: string; readonly spec: AuraSkySpec; readonly captureEnvironment: boolean; readonly affectsFog: boolean; }
/** GU47 E-B: `app.atmosphere.setFog` spec (PRD §3.1 E-B). `null` clears the fog. */
export type AuraSetFogSpec = Partial<AuraHeightFogSpec> & { readonly near?: number; readonly far?: number };
/** GU47 E-B: `app.atmosphere.setFog` options. */
export interface AuraSetFogOptions {
  /** Seconds to blend from the fog shown now (density in linear space, colour in linear RGB). */
  readonly transitionSeconds?: number;
  /**
   * Apply the spec to the scene's fog node (the active `effects.fog` / height-fog node: its fields are merged over the
   * node's) instead of only to node-free scenes. Default: true when every fog node of the scene is a plain
   * `effects.fog`, false when the scene authors a height or volumetric fog node.
   */
  readonly overrideSceneFog?: boolean;
}
export interface AuraAppAtmosphere { setFog(spec: AuraSetFogSpec | null, o?: AuraSetFogOptions): void; setSky(spec: Partial<AuraSkySpec>, o?: { transitionSeconds?: number }): void; setWetness(value: number, o?: { transitionSeconds?: number }): void; state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number }; }
// AuraApp.atmosphere: AuraAppAtmosphere (via C-38); sky.preetham/gradient/hdri builders; sky node kind registered via C-36

/**
 * PR 0a stub: setFog writes through the environmentFog RenderSource field;
 * sky.preetham/gradient lower to sky.dayNight with a `capability-degraded`
 * degradation; setWetness records the value only.
 */
export class StubAppAtmosphere implements AuraAppAtmosphere {
  private fog: AuraHeightFogSpec | null = null;
  private sky: AuraSkySpec | null = null;
  private wetness = 0;

  constructor(private readonly applyFog: (spec: AuraHeightFogSpec | null) => void = () => { /* host seam (PR 0b) */ }) {}

  setFog(spec: AuraSetFogSpec | null, _o?: AuraSetFogOptions): void {
    this.fog = spec;
    this.applyFog(spec);
  }

  setSky(spec: Partial<AuraSkySpec>, _o?: { transitionSeconds?: number }): void {
    this.sky = spec as AuraSkySpec;
  }

  setWetness(value: number, _o?: { transitionSeconds?: number }): void {
    this.wetness = value;
  }

  state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number } {
    return { fog: this.fog, sky: this.sky, wetness: this.wetness };
  }
}
