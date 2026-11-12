// Wonder World calm storybook VFX preset pack & ground-projected SDF target
// ripple shader (PRD Section 3.2, Section 6.1, WP-1).
//
// Design rules:
// - Every preset is soft, non-startling, low-count (<= 24 particles), zero
//   camera shake, zero screen flash, and disabled automatically when
//   `reducedMotion` is on (`app.effects.runtime = "off"`).
// - `targetRippleMaterial` supplies BOTH GLSL and WGSL (`a3dZeroToOneProjection`
//   compatible with Reversed-Z WebGPU and WebGL2), so WebGPU never falls back
//   with `CUSTOM_SHADER_WGSL_MISSING` or `WGSL_PROGRAM_MISSING`.
// - Pure presentation: zero wall-clock or Math.random calls (deterministic LCG
//   seed advances only when a burst fires).

import {
  material,
  type AuraBurstOptions,
  type AuraEffectInstanceHandle,
  type AuraMaterialSpec,
  type AuraTrailHandle,
  type AuraTrailOptions,
  type AuraVec3,
  type AuraVfxEffectSpec
} from "@aura3d/engine";

export const WONDER_VFX = {
  bubblePop: "soap-bubble-pop",
  meadowPollen: "meadow-pollen",
  musicNotes: "music-notes-soft",
  steamPuff: "steam-puff",
  waterDroplets: "water-droplets",
  soapFoam: "soap-foam",
  starDust: "warm-star-dust",
  cookieCrumb: "cookie-crumb",
  turfStep: "soft-turf-puff",
  sleepyStars: "sleepy-stars"
} as const;

export const SLEEPY_STAR_WORLDS = ["moonlit-nursery", "starlight-cloud"] as const;

export function isSleepyStarWorld(world: string | null | undefined): boolean {
  return world === "moonlit-nursery" || world === "starlight-cloud";
}

export type WonderVfxKind = keyof typeof WONDER_VFX;
export type WonderVfxPresetName = (typeof WONDER_VFX)[WonderVfxKind];

type VfxLayer = AuraVfxEffectSpec["layers"][number];

const emitter = (fields: Readonly<Record<string, unknown>>): VfxLayer => ({
  type: "emitter",
  ...fields
});

export const WONDER_VFX_COUNTS: Readonly<Record<WonderVfxKind, number>> = {
  bubblePop: 14,
  meadowPollen: 6,
  musicNotes: 8,
  steamPuff: 8,
  waterDroplets: 16,
  soapFoam: 14,
  starDust: 12,
  cookieCrumb: 6,
  turfStep: 6,
  sleepyStars: 14
};

export const WONDER_VFX_PRESETS: Readonly<Record<WonderVfxKind, AuraVfxEffectSpec>> = {
  bubblePop: {
    name: WONDER_VFX.bubblePop,
    layers: [
      emitter({
        preset: "ring",
        count: 1,
        color: "#E8F6FF",
        life: [0.32, 0.36],
        size: [0.22, 0.42],
        additive: false,
        sprite: "ring-thin",
        maxScreen: 0.08
      }),
      emitter({
        preset: "splash",
        count: WONDER_VFX_COUNTS.bubblePop,
        color: "#DFF4FF",
        speed: [0.35, 0.95],
        life: [0.35, 0.65],
        size: [0.025, 0.055],
        gravity: -0.9,
        drag: 2.2,
        spread: 1.0,
        additive: false,
        sprite: "bubble",
        maxScreen: 0.03
      })
    ]
  },
  meadowPollen: {
    name: WONDER_VFX.meadowPollen,
    layers: [
      emitter({
        preset: "dust",
        count: WONDER_VFX_COUNTS.meadowPollen,
        color: "#FFF4C8",
        speed: [0.08, 0.24],
        life: [1.4, 2.2],
        size: [0.02, 0.042],
        gravity: 0.06,
        drag: 1.6,
        spread: 1.2,
        additive: false,
        sprite: "dust-mote",
        maxScreen: 0.022
      })
    ]
  },
  musicNotes: {
    name: WONDER_VFX.musicNotes,
    layers: [
      emitter({
        preset: "ring",
        count: 1,
        color: "#FFE39E",
        life: [0.42, 0.48],
        size: [0.24, 0.46],
        additive: false,
        sprite: "ring-thin",
        maxScreen: 0.08
      }),
      emitter({
        preset: "pickup-gold",
        count: WONDER_VFX_COUNTS.musicNotes,
        color: "#FFDFA0",
        speed: [0.35, 0.85],
        life: [0.55, 0.95],
        size: [0.03, 0.06],
        gravity: 0.35,
        drag: 1.8,
        spread: 0.9,
        additive: false,
        sprite: "soft-dot",
        maxScreen: 0.03
      })
    ]
  },
  steamPuff: {
    name: WONDER_VFX.steamPuff,
    layers: [
      emitter({
        preset: "dust-turf",
        count: WONDER_VFX_COUNTS.steamPuff,
        color: "#FAF6EE",
        speed: [0.32, 0.72],
        life: [0.65, 1.15],
        size: [0.07, 0.16],
        gravity: 0.55,
        drag: 1.8,
        spread: 0.55,
        additive: false,
        sprite: "smoke-a",
        maxScreen: 0.045
      })
    ]
  },
  waterDroplets: {
    name: WONDER_VFX.waterDroplets,
    layers: [
      emitter({
        preset: "splash",
        count: WONDER_VFX_COUNTS.waterDroplets,
        color: "#BEE7FF",
        speed: [0.65, 1.45],
        life: [0.38, 0.7],
        size: [0.03, 0.065],
        gravity: -2.2,
        drag: 1.6,
        spread: 0.85,
        additive: false,
        sprite: "splash",
        maxScreen: 0.035
      })
    ]
  },
  soapFoam: {
    name: WONDER_VFX.soapFoam,
    layers: [
      emitter({
        preset: "dust-turf",
        count: WONDER_VFX_COUNTS.soapFoam,
        color: "#F7FCFF",
        speed: [0.22, 0.58],
        life: [0.55, 0.95],
        size: [0.045, 0.095],
        gravity: 0.18,
        drag: 2.4,
        spread: 0.95,
        additive: false,
        sprite: "bubble",
        maxScreen: 0.04
      })
    ]
  },
  starDust: {
    name: WONDER_VFX.starDust,
    layers: [
      emitter({
        preset: "pickup-star",
        count: WONDER_VFX_COUNTS.starDust,
        color: "#FFE9A6",
        speed: [0.28, 0.72],
        life: [0.65, 1.15],
        size: [0.03, 0.065],
        gravity: 0.22,
        drag: 1.9,
        spread: 1.0,
        additive: false,
        sprite: "glow",
        maxScreen: 0.032
      })
    ]
  },
  cookieCrumb: {
    name: WONDER_VFX.cookieCrumb,
    layers: [
      emitter({
        preset: "debris",
        count: WONDER_VFX_COUNTS.cookieCrumb,
        color: "#C9925B",
        speed: [0.28, 0.68],
        life: [0.35, 0.6],
        size: [0.02, 0.04],
        gravity: -2.1,
        drag: 1.8,
        spread: 0.75,
        additive: false,
        sprite: "soft-dot",
        maxScreen: 0.022
      })
    ]
  },
  turfStep: {
    name: WONDER_VFX.turfStep,
    layers: [
      emitter({
        preset: "dust-turf",
        count: WONDER_VFX_COUNTS.turfStep,
        color: "#E8DFC8",
        speed: [0.24, 0.58],
        life: [0.28, 0.48],
        size: [0.035, 0.075],
        gravity: -0.6,
        drag: 2.4,
        spread: 0.7,
        additive: false,
        sprite: "smoke-a",
        maxScreen: 0.03
      })
    ]
  },
  sleepyStars: {
    name: WONDER_VFX.sleepyStars,
    layers: [
      emitter({
        preset: "dust",
        count: WONDER_VFX_COUNTS.sleepyStars,
        maxParticles: 14,
        rate: 1.5,
        color: "#FFE4A0",
        colorOverLife: ["#FFE4A0", "#FFC878"],
        speed: [0.02, 0.06],
        life: [3.2, 4.8],
        size: [0.022, 0.048],
        gravity: 0.015,
        drag: 1.8,
        spread: 1.4,
        additive: false,
        sprite: "soft-dot",
        maxScreen: 0.024
      })
    ]
  }
};

export const LUMI_RIBBON_TRAIL: AuraTrailOptions = {
  width: 0.09,
  life: 0.55,
  color: "#FFE89E",
  widthOverSpeed: [0.2, 2.2]
};

export interface WonderEffectsLike {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  burst(kind: string, position: AuraVec3, options?: AuraBurstOptions): AuraEffectInstanceHandle;
  trail(target: string, options: AuraTrailOptions): AuraTrailHandle;
}

export function registerWonderVfxPresets(fx: Pick<WonderEffectsLike, "registerPreset">): readonly string[] {
  const registered: string[] = [];
  for (const spec of Object.values(WONDER_VFX_PRESETS)) {
    fx.registerPreset(spec.name, spec);
    registered.push(spec.name);
  }
  return registered;
}

export interface WonderVfxEmitter {
  fire(kind: WonderVfxKind, at: AuraVec3, color?: string): void;
  resetSeed(): void;
}

export function createWonderVfxEmitter(
  fx: Pick<WonderEffectsLike, "burst">,
  isReducedMotion: () => boolean
): WonderVfxEmitter {
  let seed = 202605;
  return {
    fire(kind, at, color) {
      if (isReducedMotion()) return;
      seed = (seed * 1664525 + 1013904223) % 2147483648;
      fx.burst(WONDER_VFX[kind], at, {
        count: WONDER_VFX_COUNTS[kind],
        seed,
        camera: false,
        ...(color !== undefined ? { color } : {})
      });
    },
    resetSeed() {
      seed = 202605;
    }
  };
}

// ---------------------------------------------------------------------------
// Dual GLSL + WGSL ground-projected SDF target ripple ring material.
// Uses unit-plane local XZ coordinates (`position.xz` in [-0.5, 0.5]) so no UV
// attribute layout assumptions can diverge across WebGPU and WebGL2.

const RIPPLE_VERTEX_GLSL = `
out vec2 vRippleCoord;
void main() {
  vRippleCoord = position.xz * 2.0;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const RIPPLE_FRAGMENT_GLSL = `
in vec2 vRippleCoord;
out vec4 outColor;
void main() {
  float r = length(vRippleCoord);
  if (r > 1.0) discard;
  float outerRing = smoothstep(0.98, 0.86, r) * smoothstep(0.66, 0.78, r);
  float innerGlow = smoothstep(0.74, 0.12, r) * 0.22;
  float wave = 0.5 + 0.5 * sin(r * 14.0 - ripplePhase * 6.2831853);
  float softWave = smoothstep(0.92, 0.32, r) * wave * 0.16;
  float alpha = clamp((outerRing * 0.85 + innerGlow + softWave) * rippleOpacity, 0.0, 1.0);
  outColor = vec4(rippleColor, alpha);
}`;

const RIPPLE_VERTEX_WGSL = `
override a3dZeroToOneProjection: bool = false;
struct RippleVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) coord: vec2<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>) -> RippleVertexOutput {
  var out: RippleVertexOutput;
  out.coord = position.xz * 2.0;
  let clip = aura.u_projectionMatrix * aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(position, 1.0);
  out.position = vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
  return out;
}`;

const RIPPLE_FRAGMENT_WGSL = `
@fragment fn fs_main(@location(0) coord: vec2<f32>) -> @location(0) vec4<f32> {
  let r = length(coord);
  if (r > 1.0) { discard; }
  let outerRing = smoothstep(0.98, 0.86, r) * smoothstep(0.66, 0.78, r);
  let innerGlow = smoothstep(0.74, 0.12, r) * 0.22;
  let wave = 0.5 + 0.5 * sin(r * 14.0 - aura.u_ripplePhase * 6.2831853);
  let softWave = smoothstep(0.92, 0.32, r) * wave * 0.16;
  let alpha = clamp((outerRing * 0.85 + innerGlow + softWave) * aura.u_rippleOpacity, 0.0, 1.0);
  return vec4<f32>(aura.u_rippleColor, alpha);
}`;

export interface TargetRippleOptions {
  readonly color?: string;
  readonly opacity?: number;
  readonly phase?: number;
}

export function targetRippleMaterial(options: TargetRippleOptions = {}): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: RIPPLE_VERTEX_GLSL, fragment: RIPPLE_FRAGMENT_GLSL },
    wgsl: { vertex: RIPPLE_VERTEX_WGSL, fragment: RIPPLE_FRAGMENT_WGSL },
    uniforms: {
      rippleColor: { type: "color3", value: options.color ?? "#FFE8A3" },
      rippleOpacity: { type: "f32", value: options.opacity ?? 0.82 },
      ripplePhase: { type: "f32", value: options.phase ?? 0 }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  });
}
