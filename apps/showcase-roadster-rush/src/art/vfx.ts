/**
 * GU47 WP-12 AO-V1: the Apex Overdrive runtime effect pack (PRD §3.2 item 3). Five registered presets, one per gameplay
 * event, on E-F's registered-preset layers and atlas sprites; plus the player (cyan) and rival (red) trail options.
 * Colours come from the identity palette: warm tangerine/sodium for impacts, cyan only for the player, red only for rivals.
 * Counts are sized so a dense moment stays under the art direction's 96 live particles on High (crash 28 + land 10 + bolt 8
 * + skykill 14 + rocket 18 = 78), and reduced motion halves every emission (PRD §6.3).
 */
import type { AuraVfxEffectSpec, AuraTrailOptions, material } from "@aura3d/engine";
import { createFlipbookAtlas, type FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";
import { APEX_PALETTE, hexToUnit } from "./look";
import { WGSL_CLIP, WGSL_COLOR, WGSL_MATH, wgslStage } from "./wgsl";

export type ApexVfxKind = "apex-crash" | "apex-bolt" | "apex-land" | "apex-rocket" | "apex-skykill";

export const APEX_VFX_KINDS: readonly ApexVfxKind[] = ["apex-crash", "apex-bolt", "apex-land", "apex-rocket", "apex-skykill"];

/** Live-particle ceiling for a dense moment (art direction tiers.high.particles; AO-V1 acceptance liveCount <= 96). */
export const APEX_VFX_LIVE_CAP = 96;
/** Largest on-screen diameter of the crash burst as a fraction of the viewport height (AO-V1: <= 0.12 of screen). */
export const APEX_CRASH_MAX_SCREEN = 0.12;

/** The pack, keyed by the registered kind (each spec's `name` equals its key). */
export function apexVfxPresets(reducedMotion = false): Readonly<Record<ApexVfxKind, AuraVfxEffectSpec>> {
  const n = (count: number): number => Math.max(1, Math.round(reducedMotion ? count / 2 : count));
  return {
    "apex-crash": {
      name: "apex-crash",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(18), speed: [6, 14], life: [0.25, 0.6], size: [0.05, 0.12], color: APEX_PALETTE.tangerine, intensity: 3, sprite: "spark-streak", additive: true, maxScreen: APEX_CRASH_MAX_SCREEN },
        { type: "emitter", preset: "debris", count: n(10), speed: [3, 8], life: [0.6, 1.1], gravity: -14, color: APEX_PALETTE.charcoal, sprite: "debris-chips", additive: false, maxScreen: 0.04 },
        { type: "light", intensity: 6, range: 14, duration: 0.25, color: APEX_PALETTE.tangerine }
      ]
    },
    "apex-bolt": {
      name: "apex-bolt",
      layers: [
        { type: "emitter", preset: "pickup-gold", count: n(8), speed: [1.5, 3.5], life: [0.25, 0.45], size: [0.06, 0.1], color: APEX_PALETTE.bolt, intensity: 2.4, sprite: "glow", additive: true, maxScreen: 0.03 }
      ]
    },
    "apex-land": {
      name: "apex-land",
      layers: [
        { type: "emitter", preset: "spark", count: n(10), speed: [3, 7], life: [0.18, 0.35], size: [0.03, 0.06], color: APEX_PALETTE.sodium, intensity: 2.6, sprite: "spark-streak", additive: true, direction: [0, 0.35, 0], spread: 1.2, maxScreen: 0.03 }
      ]
    },
    "apex-rocket": {
      name: "apex-rocket",
      layers: [
        { type: "emitter", preset: "streak", count: n(18), speed: [10, 20], life: [0.2, 0.4], size: [0.04, 0.08], color: APEX_PALETTE.cyan, intensity: 2.2, sprite: "spark-streak", additive: true, direction: [0, 0, 1], spread: 0.35, maxScreen: 0.05 },
        { type: "light", intensity: 4, range: 10, duration: 0.3, color: APEX_PALETTE.cyan }
      ]
    },
    "apex-skykill": {
      name: "apex-skykill",
      layers: [
        { type: "emitter", preset: "spark-fire", count: n(14), speed: [5, 11], life: [0.25, 0.5], size: [0.05, 0.1], color: APEX_PALETTE.rival, intensity: 2.8, sprite: "flare", additive: true, maxScreen: 0.06 },
        { type: "emitter", preset: "ring", count: 1, speed: 0, life: 0.35, size: [0.8, 0.8], color: APEX_PALETTE.rival, intensity: 1.6, sprite: "ring-thin", additive: true, maxScreen: 0.08 }
      ]
    }
  };
}

/** Anything with E-F's `registerPreset` (the app's `effects` extension). */
export interface ApexPresetRegistry {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
}

/** Register the pack; returns the kinds registered (the QA hook lists them, AO-V1 "presets contain all 5"). */
export function registerApexVfx(effects: ApexPresetRegistry | undefined, reducedMotion = false): readonly ApexVfxKind[] {
  if (!effects) return [];
  const presets = apexVfxPresets(reducedMotion);
  for (const kind of APEX_VFX_KINDS) effects.registerPreset(kind, presets[kind]);
  return APEX_VFX_KINDS;
}

/**
 * Player wake (cyan, the sky-lane colour) and rival wake (red) as E-F trail options, kept for the E-F `worldOffset` handoff:
 * an engine trail cannot follow this camera-anchored game today, so src/render/wakes.ts draws both wakes game-side.
 */
export const APEX_PLAYER_TRAIL: AuraTrailOptions = { width: 0.32, life: 0.28, color: APEX_PALETTE.cyan, widthOverSpeed: [30, 60] };
export const APEX_RIVAL_TRAIL: AuraTrailOptions = { width: 0.28, life: 0.22, color: APEX_PALETTE.rival, widthOverSpeed: [10, 40] };

type CustomSpec = Parameters<typeof material.custom>[0];

/** Pre-baked 8x4 RGBA8 sprite-sheet atlases for guardrail/landing sparks and drift/touchdown tire smoke. */
export function createApexSparkAtlas(): FlipbookAtlasSpec {
  return createFlipbookAtlas("sparks", [255, 168, 76]);
}

export function createApexSmokeAtlas(): FlipbookAtlasSpec {
  return createFlipbookAtlas("dust", [206, 220, 242]);
}

const FLIPBOOK_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLIPBOOK_FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <colorspace_decode>
in vec2 vUv;
out vec4 outColor;
void main() {
  float cols = max(burstGrid.x, 1.0);
  float rows = max(burstGrid.y, 1.0);
  float idx = floor(clamp(burstState.x, 0.0, cols * rows - 1.0));
  float col = mod(idx, cols);
  float row = floor(idx / cols);
  vec2 cellUv = vec2((col + clamp(vUv.x, 0.02, 0.98)) / cols, (row + clamp(1.0 - vUv.y, 0.02, 0.98)) / rows);
  vec4 texel = texture(atlasTex, cellUv);
  vec3 rgb = a3dSrgbToLinear(texel.rgb) * a3dSrgbToLinear(burstTint) * max(burstState.z, 0.0);
  float a = a3dSaturate(texel.a * burstState.y);
  outColor = vec4(a3dFinite(rgb), a);
}`;

const FLIPBOOK_WGSL_VERTEX = wgslStage([WGSL_CLIP], /* wgsl */ `
struct FlipVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> FlipVarying {
  var out: FlipVarying;
  out.uv = a_uv;
  let w = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * w);
  return out;
}`);

const FLIPBOOK_WGSL_FRAGMENT = wgslStage([WGSL_MATH, WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let cols = max(aura.u_burstGrid.x, 1.0);
  let rows = max(aura.u_burstGrid.y, 1.0);
  let idx = floor(clamp(aura.u_burstState.x, 0.0, cols * rows - 1.0));
  let col = a3dModF(idx, cols);
  let row = floor(idx / cols);
  let cellUv = vec2<f32>((col + clamp(vUv.x, 0.02, 0.98)) / cols, (row + clamp(1.0 - vUv.y, 0.02, 0.98)) / rows);
  let texel = textureSample(u_atlasTexTexture, u_atlasTexSampler, cellUv);
  let rgb = a3dSrgbToLinear(texel.rgb) * a3dSrgbToLinear(aura.u_burstTint) * max(aura.u_burstState.z, 0.0);
  let a = a3dSaturate(texel.a * aura.u_burstState.y);
  return vec4<f32>(a3dFinite3(rgb), a);
}`);

/** Paired GLSL 3.00 + WGSL 8x4 sprite-sheet flipbook burst shader driven by `burstState = [frame, opacity, gain, 0]`. */
export function flipbookBurstSpec(atlas: FlipbookAtlasSpec, tintHex: string, additive: boolean): CustomSpec {
  return {
    glsl: { vertex: FLIPBOOK_VERTEX, fragment: FLIPBOOK_FRAGMENT },
    wgsl: { vertex: FLIPBOOK_WGSL_VERTEX, fragment: FLIPBOOK_WGSL_FRAGMENT },
    uniforms: {
      atlasTex: { type: "texture2d", value: atlas.texture },
      burstGrid: { type: "vec2", value: [atlas.columns, atlas.rows] },
      burstState: { type: "vec4", value: [0, 0, 1.8, 0] },
      burstTint: { type: "vec3", value: hexToUnit(tintHex) }
    },
    transparent: true,
    depthWrite: false,
    blending: additive ? "additive" : "normal",
    side: "double"
  };
}
