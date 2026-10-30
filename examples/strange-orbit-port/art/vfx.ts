/**
 * GU47 WP-25 (lane g15) VFX preset pack for Craterline GP (SO47-V1): one registered effect per race event, tinted in
 * the gouache palette (terracotta dust, chalk debris, gold stardust, amber gate ring, jade sling) instead of the
 * engine defaults. `registerOrbitVfx(app.effects)` registers them; `orbitVfxFor(event)` maps a race event type to a
 * preset and its burst options. No sim state is read or written here.
 */
import type { AuraAppEffects, AuraVfxEffectSpec } from "@aura3d/engine";

export const ORBIT_VFX = {
  landDust: "craterline-land-dust",
  hitDebris: "craterline-hit-debris",
  dustPickup: "craterline-dust-pickup",
  gateRing: "craterline-gate-ring",
  sling: "craterline-sling"
} as const;

export type OrbitVfxKind = (typeof ORBIT_VFX)[keyof typeof ORBIT_VFX];

/** Palette tints of the pack (sRGB hex). */
export const ORBIT_VFX_COLORS: Readonly<Record<OrbitVfxKind, string>> = {
  "craterline-land-dust": "#d98464",
  "craterline-hit-debris": "#f3ddaf",
  "craterline-dust-pickup": "#ffd27a",
  "craterline-gate-ring": "#ecb75f",
  "craterline-sling": "#93ead5"
};

export const ORBIT_VFX_PRESETS: readonly AuraVfxEffectSpec[] = [
  {
    name: ORBIT_VFX.landDust,
    layers: [{ type: "emitter", preset: "dust-clay", count: 26, speed: 2.6, life: 0.9, gravity: -1.2, color: ORBIT_VFX_COLORS["craterline-land-dust"], size: 0.5, spread: 1.2, drag: 1.6 }]
  },
  {
    name: ORBIT_VFX.hitDebris,
    layers: [
      { type: "emitter", preset: "debris", count: 14, speed: 5, life: 0.8, gravity: -6, color: ORBIT_VFX_COLORS["craterline-hit-debris"], size: 0.18 },
      { type: "emitter", preset: "spark-fire", count: 18, speed: 7, life: 0.35, color: "#ffc27a", additive: true, size: 0.08, at: 0 }
    ]
  },
  {
    name: ORBIT_VFX.dustPickup,
    layers: [{ type: "emitter", preset: "pickup-gold", count: 12, speed: 1.8, life: 0.55, color: ORBIT_VFX_COLORS["craterline-dust-pickup"], additive: true, size: 0.16 }]
  },
  {
    name: ORBIT_VFX.gateRing,
    layers: [
      { type: "emitter", preset: "ring", count: 1, life: 0.7, color: ORBIT_VFX_COLORS["craterline-gate-ring"], additive: true, size: 6 },
      { type: "light", intensity: 2.5, range: 14, duration: 0.35, color: ORBIT_VFX_COLORS["craterline-gate-ring"] }
    ]
  },
  {
    name: ORBIT_VFX.sling,
    layers: [
      { type: "emitter", preset: "ring", count: 1, life: 0.9, color: ORBIT_VFX_COLORS["craterline-sling"], additive: true, size: 3.5 },
      { type: "emitter", preset: "streak", count: 10, speed: 9, life: 0.5, color: ORBIT_VFX_COLORS["craterline-sling"], additive: true, size: 0.1 }
    ]
  }
];

/** Registers the pack on the app's effects surface (idempotent: a re-register replaces the spec). */
export function registerOrbitVfx(effects: Pick<AuraAppEffects, "registerPreset">): void {
  for (const spec of ORBIT_VFX_PRESETS) effects.registerPreset(spec.name, spec);
}

/** Race event type -> preset and burst count scale (reduced motion halves emission, PRD §6.3). */
export function orbitVfxFor(eventType: string, reducedMotion = false): { readonly kind: OrbitVfxKind; readonly count: number } | null {
  const scale = reducedMotion ? 0.5 : 1;
  const preset = ORBIT_VFX_PRESETS.find((p) => p.name === EVENT_TO_VFX[eventType]);
  if (!preset) return null;
  const first = preset.layers[0] as { readonly count?: number };
  return { kind: preset.name as OrbitVfxKind, count: Math.max(1, Math.round((first.count ?? 8) * scale)) };
}

const EVENT_TO_VFX: Readonly<Record<string, OrbitVfxKind>> = {
  land: ORBIT_VFX.landDust,
  hit: ORBIT_VFX.hitDebris,
  dust: ORBIT_VFX.dustPickup,
  gate: ORBIT_VFX.gateRing,
  sling: ORBIT_VFX.sling
};
