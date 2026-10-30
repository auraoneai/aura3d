/**
 * The Bellkeeper's Walk VFX preset pack (GU47 WP-33, WW47-V1..V3): every runtime effect the walk fires, registered by
 * name with `app.effects.registerPreset`, plus the looping petal stream that makes the wind visible.
 *
 * Tiers and comfort (PRD §6.3, §6.4): Low fires no particles at all (budget: no particles on Low); reduced motion halves
 * every emission and slows the petal stream; reduced flash skips the bell's warm screen flash. Presentation only.
 */
import type { AuraApp } from "@aura3d/engine";
import { WIND_DIR, gustAt } from "./wind";

type EffectSpec = Parameters<AuraApp["effects"]["registerPreset"]>[1];
type Vec3 = [number, number, number];

const DOWNWIND: Vec3 = [WIND_DIR[0], 0.12, WIND_DIR[1]];

/** Named one-shot presets. Colours are sRGB hex (paper cream, brass, wax red, lantern amber, turf, sea foam). */
export const WIND_VFX_PRESETS: Readonly<Record<string, EffectSpec>> = {
  "wind-letter-flutter": {
    name: "wind-letter-flutter",
    layers: [
      { type: "emitter", preset: "dust", count: 26, speed: [1.2, 2.6], life: [1.1, 1.9], gravity: -0.35, color: "#f4ead2", size: [0.06, 0.12], spread: 0.55, direction: DOWNWIND, drag: 0.6, additive: false, maxScreen: 0.04 },
      { type: "emitter", preset: "pickup", count: 10, speed: [0.6, 1.4], life: [0.6, 1.0], gravity: 0.6, color: "#ffd9a0", intensity: 1.6, size: [0.04, 0.08], spread: 1, additive: true }
    ]
  },
  "wind-bell-ring": {
    name: "wind-bell-ring",
    layers: [
      { type: "emitter", preset: "ring", count: 36, speed: [2.5, 4], life: [0.5, 0.9], gravity: 0, color: "#d9a441", intensity: 2.2, size: [0.05, 0.1], spread: 1, additive: true },
      { type: "emitter", preset: "pickup", count: 18, speed: [0.8, 1.8], life: [0.9, 1.6], gravity: 0.4, color: "#ffe2b8", intensity: 1.8, size: [0.05, 0.1], spread: 1, direction: DOWNWIND, additive: true },
      { type: "light", intensity: 6, range: 9, duration: 0.6, color: "#ffd38a" }
    ]
  },
  "wind-lantern-flare": {
    name: "wind-lantern-flare",
    layers: [
      { type: "emitter", preset: "pickup", count: 8, speed: [0.3, 0.8], life: [0.6, 1.1], gravity: 0.8, color: "#ffbf66", intensity: 2, size: [0.03, 0.06], spread: 1, additive: true },
      { type: "light", intensity: 3, range: 5, duration: 0.4, color: "#ffbf66" }
    ]
  },
  "wind-grass-flick": {
    name: "wind-grass-flick",
    layers: [
      { type: "emitter", preset: "dust", count: 10, speed: [0.5, 1.2], life: [0.4, 0.8], gravity: -2.5, color: "#9cb874", size: [0.04, 0.09], spread: 0.9, additive: false, maxScreen: 0.03 }
    ]
  },
  "wind-ripple": {
    name: "wind-ripple",
    layers: [
      { type: "emitter", preset: "splash", count: 12, speed: [0.6, 1.4], life: [0.4, 0.8], gravity: -4, color: "#dfeee6", size: [0.03, 0.07], spread: 0.6, additive: false, maxScreen: 0.03 }
    ]
  },
  "wind-gust-streak": {
    name: "wind-gust-streak",
    layers: [
      { type: "emitter", preset: "streak", count: 6, speed: [5, 8], life: [0.3, 0.55], gravity: 0, color: "#fff4e0", intensity: 0.7, size: [0.02, 0.035], spread: 0.08, direction: DOWNWIND, additive: true, maxScreen: 0.05 }
    ]
  }
};

/** Petals and seeds streaming downwind around the traveller (WW47-V1): about 220 live on High, a looping spawn. */
export function petalStreamSpec(motion: number): EffectSpec {
  return {
    name: "wind-petals",
    layers: [
      { type: "emitter", preset: "dust", count: Math.round(220 * motion), speed: [1.4 * motion, 2.6 * motion], life: [2.5, 4], gravity: -0.12, color: "#f6e7c8", size: [0.05, 0.1], spread: 0.35, direction: DOWNWIND, drag: 0.2, additive: false, maxScreen: 0.03 },
      { type: "emitter", preset: "dust", count: Math.round(60 * motion), speed: [1.2 * motion, 2.2 * motion], life: [2.5, 4], gravity: -0.1, color: "#e9a0a8", size: [0.04, 0.08], spread: 0.35, direction: DOWNWIND, drag: 0.2, additive: false, maxScreen: 0.03 }
    ]
  };
}

/** The bell's warm flash (WW47-V2): peak 0.12 for 0.2 s, well under the 0.3 reduced-flash cap, skipped under reduced flash. */
export const BELL_FLASH = { color: [1, 0.86, 0.62] as const, peak: 0.12, seconds: 0.2 };

/** Particle count scale for the comfort settings: 0 on Low (no particles), 0.5 under reduced motion, else 1. */
export function emissionScale(options: { readonly low: boolean; readonly reducedMotion: boolean }): number {
  if (options.low) return 0;
  return options.reducedMotion ? 0.5 : 1;
}

export interface WindVfx {
  letterFound(at: Vec3): void;
  bellRing(at: Vec3): void;
  lanternFlare(at: Vec3): void;
  hopLanding(at: Vec3, wet: boolean): void;
  /** Per frame: keep the petal stream upwind of the traveller, fire a gust streak when a gust band passes, fade the bell flash. */
  update(traveller: Vec3, time: number, dt: number): void;
  stop(): void;
}

export function createWindVfx(app: AuraApp, options: { readonly low: boolean; readonly reducedMotion: () => boolean; readonly reducedFlash: () => boolean }): WindVfx {
  const effects = app.effects;
  for (const [kind, spec] of Object.entries(WIND_VFX_PRESETS)) effects.registerPreset(kind, spec);
  const scale = (): number => emissionScale({ low: options.low, reducedMotion: options.reducedMotion() });
  let petals: ReturnType<AuraApp["effects"]["spawn"]> | null = null;
  let petalMotion = -1;
  let lastGust = 0;
  let flashLeft = 0;
  const fire = (kind: string, at: Vec3, extra: { count?: number } = {}): void => {
    const s = scale();
    if (s <= 0) return;
    effects.burst(kind, at, { scale: 1, camera: false, ...(extra.count !== undefined ? { count: Math.max(1, Math.round(extra.count * s)) } : {}) });
  };
  const flash = (amount: number): void => {
    app.setOutputOverlay?.({ flash: [BELL_FLASH.color[0], BELL_FLASH.color[1], BELL_FLASH.color[2], amount] });
  };
  return {
    letterFound(at) { fire("wind-letter-flutter", at); },
    bellRing(at) {
      fire("wind-bell-ring", at);
      if (!options.reducedFlash()) { flashLeft = BELL_FLASH.seconds; flash(BELL_FLASH.peak); }
    },
    lanternFlare(at) { fire("wind-lantern-flare", at); },
    hopLanding(at, wet) { fire(wet ? "wind-ripple" : "wind-grass-flick", at); },
    update(traveller, time, dt) {
      const s = scale();
      if (s > 0 && s !== petalMotion) {
        petals?.stop({ immediate: true });
        petals = effects.spawn(petalStreamSpec(s), upwind(traveller), { seed: 20261030 });
        petalMotion = s;
      }
      if (s <= 0 && petals) { petals.stop({ immediate: true }); petals = null; petalMotion = -1; }
      petals?.setPosition(upwind(traveller));
      const g = gustAt(traveller[0], traveller[2], time);
      // a gust band crossing the traveller (strength rising through 2.0) throws a few streaks downwind
      if (lastGust < 2 && g >= 2) fire("wind-gust-streak", [traveller[0] - WIND_DIR[0] * 4, traveller[1] + 1.4, traveller[2] - WIND_DIR[1] * 4]);
      lastGust = g;
      if (flashLeft > 0) {
        flashLeft = Math.max(0, flashLeft - dt);
        flash(flashLeft > 0 ? BELL_FLASH.peak * (flashLeft / BELL_FLASH.seconds) : 0);
        if (flashLeft === 0) app.setOutputOverlay?.({});
      }
    },
    stop() { petals?.stop({ immediate: true }); petals = null; petalMotion = -1; }
  };
}

/** The petal source sits 9 m upwind of the traveller and 1.5 m up, so the stream crosses the frame. */
function upwind(p: Vec3): Vec3 {
  return [p[0] - WIND_DIR[0] * 9, p[1] + 1.5, p[2] - WIND_DIR[1] * 9];
}
