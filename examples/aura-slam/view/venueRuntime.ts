/**
 * GU47 WP-11: applies a venue row (view/look.ts) to the mounted app without remounting (PRD engine deps E-B, E-C):
 * - TT-L1 / TT-L2: the directional key is retuned with `setLight` (colour, intensity, position) and the floodlights are
 *   shown on the night court only (`setVisible`: a hidden light keeps its slot, so no shader rebuild);
 * - TT-E1: `app.lighting.setEnvironment` swaps the venue HDRI with a short dip cross-fade (only the active file is fetched);
 * - TT-E2: `app.atmosphere.setFog` sets or clears the venue fog; the desert's volumetric stage is enabled at High+ only;
 * - TT-P1: `app.setOutput` carries the preset's tone-map operator and the venue exposure, `app.post.setEffect` the grade,
 *   bloom and vignette (E-C runtime post control).
 * Presentation only: nothing here reads or writes sim state.
 */
import { postPresets, type AuraAssetRef, type AuraRuntimeNodeHandle, type AuraToneMappingOperator, type AuraVec3 } from "@aura3d/engine";
import { venueHdriAssets } from "./assets";
import { POST_EFFECT, VENUE_LIGHT_IDS, venueKeyLight } from "./lighting";
import { FLOODLIGHTS, sunPosition, type VenueLook } from "./look";

export interface VenueRuntimePlan {
  readonly venue: string;
  readonly key: { readonly visible: boolean; readonly patch: { readonly color: string; readonly intensity: number; readonly position: AuraVec3 } };
  readonly floods: readonly { readonly id: string; readonly visible: boolean }[];
  readonly environment: { readonly hdri: string; readonly url: string; readonly intensity: number; readonly rotationDeg: number; readonly background: boolean };
  readonly fog: { readonly color: string; readonly density: number } | null;
  readonly volumetricFog: boolean;
  readonly output: { readonly preset: VenueLook["grade"]["preset"]; readonly toneMapping: AuraToneMappingOperator; readonly exposure: number };
  readonly post: {
    readonly bloom: { readonly intensity: number; readonly threshold: number };
    readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
    readonly vignette: { readonly intensity: number };
  };
}

/** Tier names at or above High (TT-E2 / TT-PF1: the volumetric stage runs there only). */
export function isHighTier(tier: string | null | undefined): boolean {
  return tier === "high" || tier === "ultra";
}

/** Everything a venue change writes, as data (unit-tested; `applyVenueRuntime` only forwards it). */
export function venueRuntimePlan(look: VenueLook, tier: string | null = "high"): VenueRuntimePlan {
  const key = venueKeyLight(look);
  const preset = postPresets[look.grade.preset];
  const night = look.floodlights.length > 0;
  return {
    venue: look.id,
    key: { visible: true, patch: { color: key.color, intensity: key.intensity, position: sunPosition(key) } },
    floods: FLOODLIGHTS.map((f) => ({ id: f.name, visible: night })),
    environment: {
      hdri: look.hdri,
      url: venueHdriAssets[look.hdri].url,
      intensity: look.environmentIntensity,
      rotationDeg: look.environmentRotationDeg,
      background: look.background === "hdri"
    },
    fog: look.fog ? { color: look.fog.color, density: look.fog.density } : null,
    volumetricFog: Boolean(look.fog?.volumetricAtHigh) && isHighTier(tier),
    output: {
      preset: look.grade.preset,
      toneMapping: preset?.output.toneMapping ?? "aces",
      exposure: (preset?.output.exposure ?? 1) * look.grade.exposure
    },
    post: {
      bloom: { ...look.grade.bloom },
      grade: { contrast: look.grade.contrast, saturation: look.grade.saturation, temperature: look.grade.temperature, tint: look.grade.tint },
      vignette: { intensity: look.grade.vignette }
    }
  };
}

/** The slice of `AuraApp` a venue change touches (every member optional: stub surfaces and old builds degrade to no-ops). */
export interface VenueRuntimeApp {
  readonly nodes: { get?(id: string): AuraRuntimeNodeHandle | undefined; require?(id: string): AuraRuntimeNodeHandle };
  readonly lighting?: { setEnvironment?(texture: AuraAssetRef<"texture">, opts?: { intensity?: number; background?: boolean; rotationDeg?: number; crossfadeSeconds?: number }): void };
  readonly atmosphere?: { setFog?(spec: Record<string, unknown> | null, opts?: { transitionSeconds?: number; overrideSceneFog?: boolean }): void };
  readonly post?: { setEffect?(name: string, patch: Record<string, number | string | boolean | number[]>): void; setEffectEnabled?(name: string, enabled: boolean): void };
  setOutput?(output: Record<string, unknown>): void;
}

export interface ApplyVenueOptions {
  /** True at mount: the authored scene already carries this venue's environment and fog, so nothing is swapped or fetched. */
  readonly initial?: boolean;
  /** Seconds of the environment dip cross-fade on a venue change. */
  readonly crossfadeSeconds?: number;
}

const call = (fn: () => void): void => {
  try { fn(); } catch { /* optional surface on this build */ }
};

/** A runtime node by id, or undefined (`nodes.get` when the build has it, else a guarded `nodes.require`). */
export function optionalNode(app: Pick<VenueRuntimeApp, "nodes">, id: string): AuraRuntimeNodeHandle | undefined {
  if (typeof app.nodes.get === "function") return app.nodes.get(id);
  try { return app.nodes.require?.(id); } catch { return undefined; }
}

/** Writes a venue plan to the live app. Returns the plan it applied. */
export function applyVenueRuntime(app: VenueRuntimeApp, plan: VenueRuntimePlan, options: ApplyVenueOptions = {}): VenueRuntimePlan {
  const keyHandle = optionalNode(app, VENUE_LIGHT_IDS.key);
  if (keyHandle) {
    call(() => keyHandle.setVisible(plan.key.visible));
    call(() => (keyHandle as { setLight?: (p: VenueRuntimePlan["key"]["patch"]) => void }).setLight?.(plan.key.patch));
  }
  for (const flood of plan.floods) {
    const handle = optionalNode(app, flood.id);
    if (handle) call(() => handle.setVisible(flood.visible));
  }
  if (!options.initial) {
    const texture = venueHdriAssets[plan.environment.hdri as keyof typeof venueHdriAssets] as unknown as AuraAssetRef<"texture">;
    call(() => app.lighting?.setEnvironment?.(texture, {
      intensity: plan.environment.intensity,
      background: plan.environment.background,
      rotationDeg: plan.environment.rotationDeg,
      crossfadeSeconds: options.crossfadeSeconds ?? 0.5
    }));
    call(() => app.atmosphere?.setFog?.(plan.fog ? { color: plan.fog.color, density: plan.fog.density } : null, { overrideSceneFog: true }));
  }
  call(() => app.setOutput?.({ preset: plan.output.preset, toneMapping: plan.output.toneMapping, exposure: plan.output.exposure }));
  call(() => app.post?.setEffect?.(POST_EFFECT.bloom, { ...plan.post.bloom }));
  call(() => app.post?.setEffect?.(POST_EFFECT.grade, { ...plan.post.grade }));
  call(() => app.post?.setEffect?.(POST_EFFECT.vignette, { ...plan.post.vignette }));
  if (plan.volumetricFog && plan.fog) {
    call(() => app.post?.setEffect?.(POST_EFFECT.volumetricFog, { density: plan.fog!.density * 6, color: plan.fog!.color, intensity: 0.35, godRayDensity: 0.25 }));
    call(() => app.post?.setEffectEnabled?.(POST_EFFECT.volumetricFog, true));
  } else {
    call(() => app.post?.setEffectEnabled?.(POST_EFFECT.volumetricFog, false));
  }
  return plan;
}
