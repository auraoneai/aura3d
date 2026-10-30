// Pip's Big Leap: runtime VFX preset pack (GU47 WP-16 PBL-V1, PBL-V2).
//
// Every gameplay event of the art direction gets one registered preset (E-F
// `registerPreset`; `burst(name)` resolves it before the built-in kinds). Presets keep one
// emitter layer each, so a burst `count` override (reduced motion halves it) is exact.
// Trails: a leaf-green ribbon while Pip glides and a white one while he dives (E-F
// `app.effects.trail`), stopped on landing. Everything here is presentation: the sim never
// reads it (PRD D8).

import type { AuraBurstOptions, AuraEffectInstanceHandle, AuraTrailHandle, AuraTrailOptions, AuraVec3, AuraVfxEffectSpec } from "@aura3d/engine";
import { PIP_PALETTE } from "./looks";

/** The pack's preset names, one per art-direction VFX event. */
export const PIP_VFX = {
  land: "pip-land-dust",
  jump: "pip-jump-puff",
  seed: "pip-seed-sparkle",
  acorn: "pip-acorn-ring",
  checkpoint: "pip-checkpoint-leaf",
  hurt: "pip-thorn-hit",
  gate: "pip-gate-open"
} as const;

export type PipVfxEvent = keyof typeof PIP_VFX;

type Layer = AuraVfxEffectSpec["layers"][number];

const emitter = (fields: Readonly<Record<string, unknown>>): Layer => ({ type: "emitter", ...fields });

/** Default emitter count per preset (the burst count reduced motion halves). */
export const PIP_VFX_COUNTS: Readonly<Record<PipVfxEvent, number>> = {
  land: 10,
  jump: 6,
  seed: 14,
  acorn: 1,
  checkpoint: 12,
  hurt: 10,
  gate: 36
};

/**
 * The presets. Land dust takes the world's felt-dust colour at burst time (`color`);
 * sun-seed gold stays reserved for the seed sparkle and the gate (identity palette).
 */
export const PIP_VFX_PRESETS: Readonly<Record<PipVfxEvent, AuraVfxEffectSpec>> = {
  land: {
    name: PIP_VFX.land,
    layers: [emitter({ preset: "dust-turf", count: PIP_VFX_COUNTS.land, speed: [0.5, 1.3], life: [0.35, 0.65], size: [0.05, 0.12], gravity: -1.6, drag: 2.4, spread: 1, additive: false, sprite: "smoke-a", maxScreen: 0.04 })]
  },
  jump: {
    name: PIP_VFX.jump,
    layers: [emitter({ preset: "dust-turf", count: PIP_VFX_COUNTS.jump, speed: [0.3, 0.8], life: [0.25, 0.45], size: [0.04, 0.09], gravity: -0.8, drag: 2, spread: 0.6, additive: false, sprite: "smoke-a", maxScreen: 0.035 })]
  },
  seed: {
    name: PIP_VFX.seed,
    layers: [
      emitter({ preset: "pickup-gold", count: PIP_VFX_COUNTS.seed, color: PIP_PALETTE.sunSeed, speed: [0.8, 1.8], life: [0.35, 0.6], size: [0.03, 0.06], gravity: 0.6, additive: true, sprite: "flare", maxScreen: 0.03 }),
      { type: "light", color: PIP_PALETTE.sunSeed, intensity: 4, range: 3, duration: 0.25 }
    ]
  },
  acorn: {
    name: PIP_VFX.acorn,
    layers: [emitter({ preset: "ring", count: PIP_VFX_COUNTS.acorn, color: "#d9a441", life: [0.3, 0.3], size: [0.5, 0.5], additive: true, sprite: "ring-thin", maxScreen: 0.12 })]
  },
  checkpoint: {
    name: PIP_VFX.checkpoint,
    layers: [emitter({ preset: "debris", count: PIP_VFX_COUNTS.checkpoint, color: PIP_PALETTE.moss, speed: [0.8, 1.6], life: [0.9, 1.4], size: [0.06, 0.11], gravity: -1.2, drag: 1.4, spread: 0.9, additive: false, sprite: "debris-chips", maxScreen: 0.04 })]
  },
  hurt: {
    name: PIP_VFX.hurt,
    layers: [
      emitter({ preset: "spark", count: PIP_VFX_COUNTS.hurt, color: "#9a5ab8", speed: [1.2, 2.4], life: [0.2, 0.35], size: [0.03, 0.05], gravity: -2, additive: true, sprite: "spark-streak", maxScreen: 0.03 }),
      { type: "camera", shake: 0.22 }
    ]
  },
  gate: {
    name: PIP_VFX.gate,
    layers: [
      emitter({ preset: "pickup-star", count: PIP_VFX_COUNTS.gate, color: PIP_PALETTE.sunSeed, speed: [1.2, 2.8], life: [0.6, 1.1], size: [0.04, 0.09], gravity: 0.4, additive: true, sprite: "flare", maxScreen: 0.04 }),
      { type: "light", color: PIP_PALETTE.sunSeed, intensity: 10, range: 8, duration: 0.6 }
    ]
  }
};

/** PBL-V2 trails: leaf-green while gliding, white while diving. */
export const PIP_TRAILS: Readonly<Record<"glide" | "dive", AuraTrailOptions>> = {
  glide: { width: 0.12, life: 0.45, color: "#7fbf4a", widthOverSpeed: [0.5, 3] },
  dive: { width: 0.1, life: 0.3, color: "#fff6e8", widthOverSpeed: [1, 6] }
};

/** The slice of `app.effects` the pack uses (tests pass a recorder). */
export interface PipEffectsLike {
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  burst(kind: string, position: AuraVec3, options?: AuraBurstOptions): AuraEffectInstanceHandle;
  trail(target: string, options: AuraTrailOptions): AuraTrailHandle;
  readonly liveCount: number;
}

/** Register the whole pack once per app (re-registering overwrites, so world swaps are safe). */
export function registerPipVfx(fx: Pick<PipEffectsLike, "registerPreset">): readonly string[] {
  const names: string[] = [];
  for (const spec of Object.values(PIP_VFX_PRESETS)) {
    fx.registerPreset(spec.name, spec);
    names.push(spec.name);
  }
  return names;
}

export interface PipVfxOptions {
  /** PRD 6.3: halve emission and drop camera layers. */
  readonly reducedMotion: boolean;
  /** The Pip node the trails follow. */
  readonly heroNode: string;
}

export interface PipVfxController {
  /** Fire one event's preset at a world position (`color` overrides the preset colour, e.g. the world's dust). */
  fire(event: PipVfxEvent, at: AuraVec3, color?: string): void;
  /** Start (or keep) the trail for a move state; any other state stops the running trail. */
  trailFor(state: "glide" | "dive" | null): void;
  /** Stop every running trail at once (world swaps). */
  stopTrails(): void;
  /** Bursts fired so far per event (evidence for the 30 s autoplay acceptance). */
  readonly fired: Readonly<Record<PipVfxEvent, number>>;
  readonly trail: "glide" | "dive" | null;
}

/** Reduced-motion burst count: half the preset count, at least one particle. */
export function burstCount(event: PipVfxEvent, reducedMotion: boolean): number {
  const base = PIP_VFX_COUNTS[event];
  return reducedMotion ? Math.max(1, Math.round(base * 0.5)) : base;
}

export function createPipVfx(fx: PipEffectsLike, options: PipVfxOptions): PipVfxController {
  const fired: Record<PipVfxEvent, number> = { land: 0, jump: 0, seed: 0, acorn: 0, checkpoint: 0, hurt: 0, gate: 0 };
  let seed = 1414;
  let trail: AuraTrailHandle | null = null;
  let trailKind: "glide" | "dive" | null = null;
  const stopTrails = (): void => {
    trail?.stop();
    trail = null;
    trailKind = null;
  };
  return {
    fire(event, at, color) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      fx.burst(PIP_VFX[event], at, {
        count: burstCount(event, options.reducedMotion),
        seed,
        camera: !options.reducedMotion,
        ...(color !== undefined ? { color } : {})
      });
      fired[event] += 1;
    },
    trailFor(state) {
      if (state === trailKind) return;
      stopTrails();
      if (state === null) return;
      const handle = fx.trail(options.heroNode, PIP_TRAILS[state]);
      trail = handle.alive ? handle : null;
      trailKind = trail ? state : null;
    },
    stopTrails,
    get fired() {
      return fired;
    },
    get trail() {
      return trailKind;
    }
  };
}
