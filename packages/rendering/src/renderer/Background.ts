// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/Background.ts — owner lane 02.

import type { EnvironmentBackgroundOptions } from "../EnvironmentBackgroundPass";
import type { EnvironmentLightingOptions, ForwardEnvironmentFogOptions, RenderItem } from "../ForwardPass";
import type { RenderSource } from "../contracts/renderSource";
import type { EnvironmentProbe } from "../contracts/environment";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { Sampler } from "../Sampler";
import { buildNeutralRoomLegacyProbe, probeToEquirectTexture } from "../environment/probeBuild";
import { isIterable } from "./RenderShared";
import { Scene } from "@aura3d/scene";
import { rendererQrFlags } from "./FrameGraph";
import { readPrd02KillSwitches } from "../passes/Prd02SubFlags";

/** Specular-cube background binding uses the mip chain (PRD-02 §8.7 blurriness→lod). */
const PRD02_BACKGROUND_SAMPLER = new Sampler({
  minFilter: "linear-mipmap-linear",
  magFilter: "linear",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

/** RenderSource widening for the C-09 contributor output (contracts are lane-01). */
type RenderSourceWithProbe = RenderSource & {
  readonly environmentProbe?: EnvironmentProbe | null;
  /** Optional blur for cubemap backgrounds (0..1 → roughnessToLod). */
  readonly backgroundBlurriness?: number;
  /**
   * C-09 resolution `background` visibility. `false` = the bound probe lights
   * the scene but must not replace the authored background (the neutral-room
   * floor and `background: false` resolutions).
   */
  readonly environmentProbeBackground?: boolean;
  /** Resolution intensities for the probe's IBL terms (defaults 1). */
  readonly environmentProbeDiffuseIntensity?: number;
  readonly environmentProbeSpecularIntensity?: number;
  /** Additive constant ambient (linear rgb, authored `lights.ambient` sum) layered on the probe's IBL. */
  readonly environmentProbeAmbient?: { readonly color: readonly [number, number, number]; readonly intensity: number } | null;
  /** LIGHT-05/08: authored hemisphere lights as a directional sky/ground pair (linear, premultiplied), additive. */
  readonly environmentProbeHemisphere?: EnvironmentLightingOptions["hemisphere"];
  /**
   * GU47 E-B: the frame's environment yaw (radians about +Y; `setEnvironmentRotation`, `setEnvironment({ rotationDeg })`,
   * the authored hdri `rotation`). Absent = unrotated.
   */
  readonly environmentProbeRotation?: number;
};

/**
 * GU47 E-B handoff: the source's environment yaw as the renderer's rotation unit (turns: the background shader and
 * `EnvironmentLightingOptions.environmentMapRotation` multiply by 2π). `undefined` when the source carries none.
 */
function environmentProbeRotationTurns(source: RenderSource): number | undefined {
  const radians = (source as RenderSourceWithProbe).environmentProbeRotation;
  return typeof radians === "number" && Number.isFinite(radians) ? radians / (2 * Math.PI) : undefined;
}

/**
 * The probe background's rotation (turns): an explicit background rotation wins, else the environment yaw (the IBL
 * turns with it), else the pre-GU47 value (the explicit background's unset rotation, or 0 without one).
 */
function probeBackgroundRotation(source: RenderSource, explicit: RenderSource["environmentBackground"]): number | undefined {
  if (typeof explicit === "object" && explicit.rotation !== undefined) return explicit.rotation;
  return environmentProbeRotationTurns(source) ?? (typeof explicit === "object" ? undefined : 0);
}

type HemispherePair = NonNullable<EnvironmentLightingOptions["hemisphere"]>;

function sameHemisphere(a: HemispherePair | null, b: HemispherePair | null): boolean {
  if (a === null || b === null) return a === b;
  for (let i = 0; i < 3; i += 1) {
    if (a.sky[i] !== b.sky[i] || a.ground[i] !== b.ground[i] || a.direction[i] !== b.direction[i]) return false;
  }
  return true;
}

/**
 * The ambient scalar every program reads, with the hemisphere's flat mean folded in (programs without the PRD-02
 * chunk keep the hemisphere at its horizontal-normal value; the chunk's pack takes the mean back out).
 */
function ambientWithHemisphereMean(
  ambient: { readonly color: readonly [number, number, number]; readonly intensity: number } | null,
  hemisphere: HemispherePair | null
): { readonly color: readonly [number, number, number]; readonly intensity: number } | null {
  if (!hemisphere) return ambient;
  const total: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    total[i] = (ambient ? ambient.color[i]! * ambient.intensity : 0) + (hemisphere.sky[i]! + hemisphere.ground[i]!) / 2;
  }
  const peak = Math.max(total[0], total[1], total[2]);
  if (!(peak > 0)) return ambient;
  return { color: [total[0] / peak, total[1] / peak, total[2] / peak], intensity: peak };
}

export function collectEnvironmentBackground(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentBackgroundOptions | undefined {
  if (source instanceof Scene || isIterable(source) || source.environmentBackground === false) return undefined;
  if (rendererQrFlags().on("A3D_QR_LIGHTING")) {
    // `?a3dLighting=background=off` → fall through to the authored
    // environmentBackground (§6.5 kill switch, §17 toggle-delta).
    if (!readPrd02KillSwitches(source).background) return source.environmentBackground;
    const resolved = resolvePrd02EnvironmentBackground(source);
    if (resolved) return resolved;
  }
  return source.environmentBackground;
}

/**
 * prd02.background contributor (PRD-02 §9): the active C-09 probe supplies the
 * background — its equirect `background` texture when one exists and
 * `blurriness == 0`, otherwise the specular cube at lod = roughnessToLod(blur).
 * `environmentBackground: false` keeps the solid colour (returns undefined).
 */
export function resolvePrd02EnvironmentBackground(
  source: RenderSource
): EnvironmentBackgroundOptions | undefined {
  const probe = (source as RenderSourceWithProbe).environmentProbe;
  if (!probe) return undefined;
  // A probe bound only for IBL (neutral-room floor, `background: false`)
  // keeps the authored solid/sky background instead of painting the room.
  if ((source as RenderSourceWithProbe).environmentProbeBackground === false) return undefined;
  const explicit = source.environmentBackground;
  const blurriness = (source as RenderSourceWithProbe).backgroundBlurriness
    ?? (typeof explicit === "object" ? explicit.blurriness : 0)
    ?? 0;
  // E3 parity gap (conjunction only): an HDRI probe's `background` is the
  // raw rgba32f decode intermediate (GPUPMREMGenerator.fromEquirect). RGBA32F
  // is not linear-filterable in core WebGL2 (OES_texture_float_linear), and
  // the binding below carries the default LINEAR sampler — a sampler object
  // overrides the upload path's NEAREST pin, so the texture is incomplete
  // and samples (0,0,0,1): L4 runs 38429097048/38429102473 measured pure
  // black backgrounds on the HDRI scenes while the rgba16f specular cube
  // shaded the objects correctly in the same frames. Under the conjunction,
  // fall through to that filterable mipmapped cube instead of binding the
  // 32f equirect. Conjunction-off binds stay byte-identical; follow-up:
  // give the factory a half-float equirect background and drop this gate.
  const equirectFilterable = probe.background?.format !== "rgba32f";
  const e3Conjunction = rendererQrFlags().on("A3D_QR_COMPILER") && rendererQrFlags().on("A3D_QR_LIGHTING");
  const rotation = probeBackgroundRotation(source, explicit);
  if (probe.background && blurriness === 0 && !(e3Conjunction && !equirectFilterable)) {
    return {
      projection: "equirect",
      texture: new TextureBinding({ name: "u_environmentBackgroundTexture", texture: probe.background, required: true }),
      intensity: typeof explicit === "object" ? explicit.intensity : 1,
      rotation,
      inverseViewProjectionMatrix: typeof explicit === "object" ? explicit.inverseViewProjectionMatrix : undefined
    };
  }
  return {
    projection: "cubemap",
    texture: new TextureBinding({
      name: "u_environmentBackgroundCubeTexture",
      texture: probe.specularCube,
      required: true,
      sampler: PRD02_BACKGROUND_SAMPLER
    }),
    intensity: typeof explicit === "object" ? explicit.intensity : 1,
    rotation,
    blurriness,
    mipCount: probe.mipCount,
    inverseViewProjectionMatrix: typeof explicit === "object" ? explicit.inverseViewProjectionMatrix : undefined
  };
}

export function collectEnvironmentLighting(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentLightingOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.environmentLighting === false) return cloneEnvironmentLighting(DISABLED_RENDERER_ENVIRONMENT_LIGHTING);
  if (rendererQrFlags().on("A3D_QR_LIGHTING")) {
    const probeLighting = resolvePrd02EnvironmentLighting(source);
    if (probeLighting) return probeLighting;
    // #1141 / 02-S2: without A3D_QR_COMPILER no C-09 probe is ever bound
    // (only compileScene binds one), so the legacy bridge's environment —
    // the category generated map or the authored-ambient-only branch — was
    // all that lit a scene once the fallback rig is gone. Under the flag the
    // neutral room replaces those fallbacks (C-09 `prd02.neutral-room`);
    // authored environments keep their lighting, authored ambient stays additive.
    if (isPrd02LegacyFallbackEnvironment(source.environmentLighting)) return resolvePrd02NeutralRoomLighting(source.environmentLighting);
  }
  if (source.environmentLighting) return source.environmentLighting;
  return cloneEnvironmentLighting(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING);
}

/** Same process-global registry `compiler/environment.ts` fills (Symbol.for: survives duplicated module instances). */
const PRD02_LEGACY_FALLBACK_ENVIRONMENTS = Symbol.for("aura3d.prd02.legacyFallbackEnvironments");

/**
 * True when the source has no environment at all, or the engine marked it as
 * the legacy fallback of a scene with no environment and no lights (the
 * scene-category generated map). Authored environments and scenes with
 * authored lights are never marked and keep their lighting.
 */
export function isPrd02LegacyFallbackEnvironment(lighting: EnvironmentLightingOptions | undefined): boolean {
  if (!lighting) return true;
  const store = globalThis as { [PRD02_LEGACY_FALLBACK_ENVIRONMENTS]?: WeakSet<object> };
  return store[PRD02_LEGACY_FALLBACK_ENVIRONMENTS]?.has(lighting) ?? false;
}

/** One directional neutral room per renderer process (analytic r185 room + SH9 irradiance last level; no GGX prefilter). */
let prd02NeutralFloor: EnvironmentProbe | null = null;

/**
 * Neutral-room lighting replacing a legacy fallback environment. The
 * authored-ambient branch (a constant colour, no map, no procedural sky)
 * keeps its colour and intensity as the additive ambient term; the
 * scene-category generated map is dropped entirely (PRD-02 R16: no category
 * heuristics under the flag).
 */
export function resolvePrd02NeutralRoomLighting(legacy: EnvironmentLightingOptions | undefined): EnvironmentLightingOptions {
  prd02NeutralFloor ??= buildNeutralRoomLegacyProbe();
  const ambientOnly = legacy && !legacy.proceduralMap && !legacy.environmentMapTexture && !legacy.environmentCubeMapTexture;
  const ambient = ambientOnly && legacy.intensity > 0
    ? { color: [legacy.color[0], legacy.color[1], legacy.color[2]] as [number, number, number], intensity: legacy.intensity }
    : null;
  const probeSource = { environmentProbe: prd02NeutralFloor, environmentProbeAmbient: ambient } as unknown as RenderSource;
  return resolvePrd02EnvironmentLighting(probeSource)!;
}

/** One mipped rgba16f equirect per bound probe (WeakMap; disposed with the probe's specular cube). */
const prd02ProbeEquirects = new WeakMap<EnvironmentProbe, Texture>();

/**
 * PRD-02 Phase 3 legacy bridge: when a C-09 probe is bound, the legacy
 * environment-lighting path samples a *linear HDR* mipped equirect — no
 * Reinhard, no RGBA8 (E5 fix). The legacy procedural map is dropped.
 */
/** Last result per probe: the lighting object only changes when the probe, its intensities or its ambient term do. */
const prd02LightingMemo = new WeakMap<EnvironmentProbe, {
  readonly diffuse: number;
  readonly specular: number;
  readonly ambient: readonly [number, number, number, number] | null;
  readonly withProbe: boolean;
  readonly hemisphere: HemispherePair | null;
  /** GU47 E-B: environment yaw in turns (`undefined` = the source carries none). */
  readonly rotation: number | undefined;
  readonly result: EnvironmentLightingOptions;
}>();

export function resolvePrd02EnvironmentLighting(source: RenderSource): EnvironmentLightingOptions | undefined {
  const probe = (source as RenderSourceWithProbe).environmentProbe;
  if (!probe) return undefined;
  let equirect = prd02ProbeEquirects.get(probe);
  if (!equirect) {
    equirect = probeToEquirectTexture(probe);
    prd02ProbeEquirects.set(probe, equirect);
  }
  const meta = source as RenderSourceWithProbe;
  const diffuse = meta.environmentProbeDiffuseIntensity ?? 1;
  const specular = meta.environmentProbeSpecularIntensity ?? 1;
  const hemisphere = meta.environmentProbeHemisphere ?? null;
  const ambient = ambientWithHemisphereMean(meta.environmentProbeAmbient ?? null, hemisphere);
  const withProbe = rendererQrFlags().on("A3D_QR_COMPILER") && rendererQrFlags().on("A3D_QR_LIGHTING");
  // GU47 E-B handoff: the environment yaw rotates probe/IBL sampling
  // (`environmentMapRotation` turns -> ForwardPass `u_envRotation` radians).
  const rotation = environmentProbeRotationTurns(source);
  const memo = prd02LightingMemo.get(probe);
  if (memo
    && memo.diffuse === diffuse
    && memo.specular === specular
    && memo.withProbe === withProbe
    && memo.rotation === rotation
    && sameHemisphere(memo.hemisphere, hemisphere)
    && (memo.ambient === null
      ? ambient === null
      : ambient !== null
        && memo.ambient[0] === ambient.color[0] && memo.ambient[1] === ambient.color[1] && memo.ambient[2] === ambient.color[2]
        && memo.ambient[3] === ambient.intensity)) {
    return { ...memo.result };
  }
  const result: EnvironmentLightingOptions = {
    color: ambient?.color ?? [1, 1, 1],
    intensity: ambient?.intensity ?? 0,
    environmentMapTexture: new TextureBinding({
      name: "u_environmentMapTexture",
      texture: equirect,
      required: true,
      expectedColorSpace: "linear",
      sampler: new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" })
    }),
    environmentCubeMapTexture: new TextureBinding({
      name: "u_environmentCubeMapTexture",
      texture: probe.specularCube,
      required: false,
      expectedColorSpace: "linear",
      sampler: PRD02_BACKGROUND_SAMPLER
    }),
    environmentMapIntensity: diffuse,
    environmentMapSpecularIntensity: specular,
    environmentMapMipCount: equirect.mipLevels.length,
    environmentMapEncoding: "linear",
    ...(rotation !== undefined ? { environmentMapRotation: rotation } : {}),
    // E3 stage-2b: carry the probe itself (cube + SH9) to ForwardPass for
    // the PRD-02 IBL pack. Attached only under the conjunction so the
    // LIGHTING-only lighting object stays byte-identical.
    ...(withProbe
      ? { environmentProbe: probe }
      : {}),
    ...(hemisphere ? { hemisphere: { sky: [...hemisphere.sky], ground: [...hemisphere.ground], direction: [...hemisphere.direction] } as HemispherePair } : {})
  };
  prd02LightingMemo.set(probe, {
    diffuse,
    specular,
    withProbe,
    rotation,
    hemisphere: hemisphere ? { sky: [...hemisphere.sky], ground: [...hemisphere.ground], direction: [...hemisphere.direction] } as HemispherePair : null,
    ambient: ambient ? [ambient.color[0], ambient.color[1], ambient.color[2], ambient.intensity] : null,
    result
  });
  return { ...result };
}

export function collectEnvironmentFog(source: RenderSource | Iterable<RenderItem> | Scene): ForwardEnvironmentFogOptions | false | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  return source.environmentFog;
}

function cloneEnvironmentLighting(environment: EnvironmentLightingOptions): EnvironmentLightingOptions {
  return {
    color: [...environment.color] as [number, number, number],
    intensity: environment.intensity,
    ...(environment.proceduralMap
      ? {
          proceduralMap: {
            skyColor: [...environment.proceduralMap.skyColor] as [number, number, number],
            horizonColor: [...environment.proceduralMap.horizonColor] as [number, number, number],
            groundColor: [...environment.proceduralMap.groundColor] as [number, number, number],
            specularColor: [...environment.proceduralMap.specularColor] as [number, number, number],
            intensity: environment.proceduralMap.intensity,
            specularIntensity: environment.proceduralMap.specularIntensity
          }
        }
      : {}),
    ...(environment.environmentMapTexture ? { environmentMapTexture: environment.environmentMapTexture } : {}),
    ...(environment.environmentCubeMapTexture ? { environmentCubeMapTexture: environment.environmentCubeMapTexture } : {}),
    ...(environment.environmentMapIntensity !== undefined ? { environmentMapIntensity: environment.environmentMapIntensity } : {}),
    ...(environment.environmentMapSpecularIntensity !== undefined ? { environmentMapSpecularIntensity: environment.environmentMapSpecularIntensity } : {}),
    ...(environment.environmentMapRotation !== undefined ? { environmentMapRotation: environment.environmentMapRotation } : {}),
    ...(environment.environmentMapMipCount !== undefined ? { environmentMapMipCount: environment.environmentMapMipCount } : {}),
    ...(environment.environmentMapEncoding ? { environmentMapEncoding: environment.environmentMapEncoding } : {}),
    ...(environment.environmentBrdfLutTexture ? { environmentBrdfLutTexture: environment.environmentBrdfLutTexture } : {}),
    ...(environment.environmentProbe ? { environmentProbe: environment.environmentProbe } : {})
  };
}

const DISABLED_RENDERER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0, 0, 0],
  intensity: 0,
  proceduralMap: {
    skyColor: [0, 0, 0],
    horizonColor: [0, 0, 0],
    groundColor: [0, 0, 0],
    specularColor: [0, 0, 0],
    intensity: 0,
    specularIntensity: 0
  },
  environmentMapIntensity: 0,
  environmentMapSpecularIntensity: 0
};

/**
 * E3 step 4 verdict: this renderer default (ambient 0.42 + procedural
 * 0.5/0.82) is already deleted on the conjunction path — and on every
 * LIGHTING path — because `collectEnvironmentLighting` intercepts
 * no-environment and legacy-fallback sources with the neutral room above
 * before the default clone at its tail can run, and the conjunction
 * requires LIGHTING. The constant itself is public API and stays
 * byte-identical for flag-off callers; passed explicitly as authored
 * lighting under the conjunction, its procedural terms are zeroed at the
 * ForwardPass bind layer (frozen suppression) and its ambient remains the
 * sole diffuse term (no sampled map).
 */
export const DEFAULT_RENDERER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0.78, 0.8, 0.84],
  intensity: 0.42,
  proceduralMap: {
    skyColor: [0.64, 0.76, 0.94],
    horizonColor: [0.94, 0.82, 0.62],
    groundColor: [0.12, 0.13, 0.15],
    specularColor: [1, 0.94, 0.78],
    intensity: 0.5,
    specularIntensity: 0.82
  }
};
