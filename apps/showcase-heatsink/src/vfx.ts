/**
 * Thermal Drift VFX preset pack (GU47 WP-13 HS-13, PRD §3.2 item 3): six foundry bursts registered with
 * `app.effects.registerPreset`, the event -> burst map, the player's exhaust plume and the missile trails.
 *
 * Every burst fires with `camera: false`: the chase camera (camera.ts) owns shake through its trauma. Reduced motion
 * halves emission and caps the light flash at 0.3 of its authored intensity (PRD §6.3).
 *
 * The world scrolls past a nearly fixed player (track.ts places everything relative to the drone), so a ribbon trail
 * on the player would barely move; the player's heat reads as an attached exhaust plume instead, and only the
 * missiles, which travel in view space, draw `effects.trail` ribbons.
 */
import type { AuraAppEffects, AuraBurstOptions, AuraTrailOptions, AuraVfxEffectSpec } from "@aura3d/engine";
import type { SimEvent } from "./sim";
import { PALETTE } from "./look";

export type TdVfxKind = "td-slag-burst" | "td-ember-hit" | "td-wall-scrape" | "td-coolant-burst" | "td-boost-flare" | "td-shock";

/** Where a burst is placed relative to the player's drone (resolved in main.ts from the presented poses). */
export type VfxAnchor = "player" | "ahead" | "wall" | "exhaust" | "target";

export const TD_VFX_KINDS: readonly TdVfxKind[] = ["td-slag-burst", "td-ember-hit", "td-wall-scrape", "td-coolant-burst", "td-boost-flare", "td-shock"];

/** HDR colours (linear multipliers > 1 bloom). */
const MOLTEN: readonly [number, number, number] = [6, 2.1, 0.45];
const SLAG: readonly [number, number, number] = [4.2, 0.9, 0.35];
const EMBER: readonly [number, number, number] = [4.5, 1.5, 0.35];
const COOLANT: readonly [number, number, number] = [0.6, 2.6, 4.4];

export const TD_VFX_PRESETS: Readonly<Record<TdVfxKind, AuraVfxEffectSpec>> = {
  // Barrels, takedowns and the player's own destruction: molten slag, iron debris and a short amber flash.
  "td-slag-burst": {
    name: "td-slag-burst",
    layers: [
      { type: "emitter", preset: "explosion-small", count: 22, color: [...MOLTEN], speed: [3, 7.5], life: [0.35, 0.8], size: [0.16, 0.38], gravity: -5, maxScreen: 0.12 },
      { type: "emitter", preset: "debris", count: 10, color: PALETTE.oxidisedIron, speed: [2.5, 5], life: [0.6, 1.1], gravity: -9.8, size: [0.06, 0.14] },
      { type: "light", color: PALETTE.moltenAmber, intensity: 12, range: 12, duration: 0.4 }
    ]
  },
  // Laser hits: a tight spray of embers.
  "td-ember-hit": {
    name: "td-ember-hit",
    layers: [
      { type: "emitter", preset: "spark", count: 16, color: [...EMBER], speed: [2.5, 6], life: [0.18, 0.45], size: [0.03, 0.07], gravity: -6 },
      { type: "light", color: PALETTE.moltenAmber, intensity: 5, range: 6, duration: 0.15 }
    ]
  },
  // Wall scrapes: streaking slag-red sparks along the wall.
  "td-wall-scrape": {
    name: "td-wall-scrape",
    layers: [
      { type: "emitter", preset: "streak", count: 18, color: [...SLAG], speed: [5, 9], life: [0.15, 0.35], size: [0.03, 0.06], spread: 0.45, gravity: -3 }
    ]
  },
  // Coolant, shield and recharge pickups: the one place coolant cyan appears in the world.
  "td-coolant-burst": {
    name: "td-coolant-burst",
    layers: [
      { type: "emitter", preset: "pickup", count: 20, color: [...COOLANT], speed: [1.5, 3], life: [0.4, 0.8], size: [0.05, 0.11], gravity: 1.2 },
      { type: "light", color: PALETTE.coolantCyan, intensity: 6, range: 8, duration: 0.3 }
    ]
  },
  // Boost pads and boost onset: an amber flare behind the drone.
  "td-boost-flare": {
    name: "td-boost-flare",
    layers: [
      { type: "emitter", preset: "streak", count: 14, color: [...MOLTEN], speed: [6, 10], life: [0.12, 0.3], size: [0.05, 0.1], spread: 0.3, direction: [0, 0, 1] },
      { type: "light", color: "#ffb070", intensity: 8, range: 8, duration: 0.25 }
    ]
  },
  // Shockwave pulse: a hot ring of embers (the ring mesh itself is the scene torus).
  "td-shock": {
    name: "td-shock",
    layers: [
      { type: "emitter", preset: "ring", count: 24, color: [...EMBER], speed: [5, 7], life: [0.25, 0.45], size: [0.05, 0.1] },
      { type: "light", color: PALETTE.moltenAmber, intensity: 9, range: 14, duration: 0.3 }
    ]
  }
};

/** The player's exhaust: a continuous molten plume streaming backwards from the drone (spawned once, follows the node). */
export const EXHAUST_PLUME: AuraVfxEffectSpec = {
  name: "td-exhaust-plume",
  layers: [
    { type: "emitter", preset: "streak", count: 12, color: [...MOLTEN], speed: [7, 12], life: [0.1, 0.22], size: [0.05, 0.11], spread: 0.18, direction: [0, 0, 1], gravity: 0 }
  ]
};

/** Missile trails (`app.effects.trail`): the player's missile in molten amber, the incoming one in slag red. */
export const MISSILE_TRAIL: AuraTrailOptions = { width: 0.22, life: 0.45, color: PALETTE.moltenAmber };
export const INCOMING_TRAIL: AuraTrailOptions = { width: 0.26, life: 0.5, color: PALETTE.slagRed };

/** Which burst a simulation event fires, and where (null: none). Pure, so it is unit-tested. */
export function vfxForEvent(event: SimEvent): { readonly kind: TdVfxKind; readonly anchor: VfxAnchor } | null {
  switch (event.type) {
    case "barrel": return { kind: "td-slag-burst", anchor: "ahead" };
    case "takedown": return { kind: "td-slag-burst", anchor: "target" };
    case "destroyed": return { kind: "td-slag-burst", anchor: "player" };
    case "hit": return { kind: "td-ember-hit", anchor: "target" };
    case "damage": return event.source === "missile" ? { kind: "td-ember-hit", anchor: "player" } : null;
    case "scrape": return { kind: "td-wall-scrape", anchor: "wall" };
    case "pickup": return event.kind === "boost" ? { kind: "td-boost-flare", anchor: "exhaust" } : { kind: "td-coolant-burst", anchor: "player" };
    case "shock": return { kind: "td-shock", anchor: "player" };
    default: return null;
  }
}

/** First emitter count of a preset (the authored burst size). */
export function presetCount(kind: TdVfxKind): number {
  const layer = TD_VFX_PRESETS[kind].layers.find((l) => l.type === "emitter");
  return typeof layer?.count === "number" ? layer.count : 24;
}

/** Burst options: the game owns the camera; reduced motion halves emission and caps flashes at 0.3. */
export function burstOptions(kind: TdVfxKind, reducedMotion: boolean, seed: number): AuraBurstOptions {
  return reducedMotion
    ? { camera: false, seed, count: Math.max(1, Math.round(presetCount(kind) / 2)), intensity: 0.3 }
    : { camera: false, seed };
}

/** Register the pack on a live app (no-op when the effects extension is missing). Returns the kinds registered. */
export function registerThermalDriftVfx(effects: Pick<AuraAppEffects, "registerPreset"> | undefined): readonly TdVfxKind[] {
  if (!effects) return [];
  for (const kind of TD_VFX_KINDS) effects.registerPreset(kind, TD_VFX_PRESETS[kind]);
  return TD_VFX_KINDS;
}

/** Counts the bursts the game fired per kind (published on the QA hook so phase 2 can match them to beacon events). */
export class VfxLedger {
  readonly fired: Record<TdVfxKind, number> = { "td-slag-burst": 0, "td-ember-hit": 0, "td-wall-scrape": 0, "td-coolant-burst": 0, "td-boost-flare": 0, "td-shock": 0 };
  total = 0;
  note(kind: TdVfxKind): void {
    this.fired[kind] += 1;
    this.total += 1;
  }
  reset(): void {
    for (const kind of TD_VFX_KINDS) this.fired[kind] = 0;
    this.total = 0;
  }
}

/** World position of a burst anchor, from the drone position (x, y, z) and its lateral offset. */
export function anchorPosition(
  anchor: VfxAnchor,
  drone: readonly [number, number, number],
  target: readonly [number, number, number] | null,
  out: [number, number, number]
): [number, number, number] {
  const [x, y, z] = drone;
  switch (anchor) {
    case "ahead": out[0] = x; out[1] = y - 0.6; out[2] = z - 5; break;
    case "wall": out[0] = x >= 0 ? 10.5 : -10.5; out[1] = 0.9; out[2] = z - 1; break;
    case "exhaust": out[0] = x; out[1] = y; out[2] = z + 1.6; break;
    case "target":
      if (target) { out[0] = target[0]; out[1] = target[1]; out[2] = target[2]; } else { out[0] = x; out[1] = y; out[2] = z - 14; }
      break;
    default: out[0] = x; out[1] = y; out[2] = z; break;
  }
  return out;
}
