/**
 * C-21 — sky, fog, atmosphere (engine side, CONTRACTS.md). Provider: PRD 07.
 * Flag: A3D_QR_VFX.
 */

import type { AuraColor, AuraVec3, AuraAssetRef } from "../agent-api/index";

export interface AuraSkySunSpec { readonly elevationDeg: number; readonly azimuthDeg: number; readonly intensity?: number; readonly color?: AuraColor; readonly discSize?: number; }
export type AuraSkySpec =
  | { readonly model: "preetham"; readonly sun: AuraSkySunSpec; readonly turbidity?: number; readonly rayleigh?: number; readonly mieCoefficient?: number; readonly mieDirectionalG?: number; readonly exposure?: number; readonly clouds?: unknown; readonly stars?: unknown; readonly moon?: unknown; readonly groundColor?: AuraColor }
  | { readonly model: "gradient"; readonly zenith: AuraColor; readonly horizon: AuraColor; readonly ground?: AuraColor; readonly exponent?: number; readonly horizonGlow?: number; readonly sun?: AuraSkySunSpec; readonly bands?: unknown; readonly stars?: unknown; readonly moon?: unknown; readonly intensity?: number }
  | { readonly model: "hdri"; readonly texture: AuraAssetRef<"texture">; readonly intensity?: number; readonly rotation?: number; readonly blurriness?: number }
  | { readonly model: "cubemap"; readonly faces: readonly AuraAssetRef<"texture">[]; readonly intensity?: number };
export interface AuraHeightFogSpec { readonly mode?: "height" | "exp" | "exp2" | "linear" | "absorption"; readonly color?: AuraColor | "sky"; readonly density?: number; readonly heightDensity?: number; readonly heightFalloff?: number; readonly heightReference?: number; readonly start?: number; readonly maxOpacity?: number; readonly near?: number; readonly far?: number; readonly absorption?: AuraVec3; readonly sunInscatter?: number; readonly anisotropy?: number; readonly affectsBackground?: boolean; readonly backgroundDistance?: number; readonly transitionSeconds?: number; }
export interface AuraVolumetricFogSpec extends AuraHeightFogSpec { readonly quality?: "auto" | "analytic" | "froxel"; readonly volumetricFar?: number; readonly noise?: unknown; readonly lightShafts?: boolean; readonly localLights?: boolean; }
export interface AuraSkyNode { readonly kind: "sky"; readonly name: string; readonly spec: AuraSkySpec; readonly captureEnvironment: boolean; readonly affectsFog: boolean; }
export interface AuraAppAtmosphere { setFog(spec: AuraHeightFogSpec | null, o?: { transitionSeconds?: number }): void; setSky(spec: Partial<AuraSkySpec>, o?: { transitionSeconds?: number }): void; setWetness(value: number, o?: { transitionSeconds?: number }): void; state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number }; }
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

  setFog(spec: AuraHeightFogSpec | null, _o?: { transitionSeconds?: number }): void {
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
