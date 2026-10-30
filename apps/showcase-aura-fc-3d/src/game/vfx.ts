// Aura FC 3D — GU47 runtime VFX preset pack (WP-19 FC47-V1; art/direction.ts `vfx` entries).
//
// Every runtime effect kind the match fires is registered on `app.effects` with `registerPreset` (E-F: a registered
// name resolves in burst/spawn before the built-in table and every layer fires). The pack is per venue: the goal pyro
// takes the venue's colours and the storm lightning exists only on Munich. Reduced motion halves the particle counts
// and drops camera layers; reduced flash drops the light layers and the lightning (PRD 6.3, 6.4).
//
// Pure: no renderer, so the unit test registers the pack on a recording stub.

import type { AuraVfxEffectSpec } from "@aura3d/engine";
import { GOAL_HALF_W, PITCH_HX, PITCH_HZ } from "./dims";
import type { VenueId } from "./types";

export const FC_VFX_KINDS = ["fc-turf-divot", "fc-wet-splash", "fc-net-spark", "fc-goal-pyro", "fc-lightning"] as const;
export type FcVfxKind = (typeof FC_VFX_KINDS)[number];

export interface FcVfxOptions {
  readonly reducedMotion?: boolean;
  readonly reducedFlash?: boolean;
}

/** Pyro colours per venue (flame core, spark tail): the venue's own accent, never the lime game accent. */
export const VENUE_PYRO: Readonly<Record<VenueId, { readonly core: string; readonly tail: string }>> = {
  munich: { core: "#e8f2ff", tail: "#8fc8ff" },
  kyoto: { core: "#ff5fa2", tail: "#ffb0d0" },
  favela: { core: "#ffb066", tail: "#ff7a2a" },
  lagos: { core: "#ffd27a", tail: "#ff9a52" },
  uyuni: { core: "#fff1d8", tail: "#ffc9a0" },
  glacier: { core: "#7fe8c9", tail: "#cfe8ff" }
};

/** Turf divot / scuff colour per venue surface (sand on Lagos, salt on Uyuni, ice-dusted turf on Glacier). */
const VENUE_TURF: Readonly<Record<VenueId, { readonly chip: string; readonly scuff: string }>> = {
  munich: { chip: "#2f5a36", scuff: "#2a2418" },
  kyoto: { chip: "#355a3a", scuff: "#2a2018" },
  favela: { chip: "#6a5a3a", scuff: "#3a2e1e" },
  lagos: { chip: "#d9b27a", scuff: "#a8804e" },
  uyuni: { chip: "#e8e4dc", scuff: "#b8b0a4" },
  glacier: { chip: "#d8e8f0", scuff: "#5a6a70" }
};

/** Venues whose turf is wet (FC47-M1: roughness 0.35): touches throw a splash. */
export const WET_VENUES: readonly VenueId[] = ["munich", "kyoto"];

type Layer = AuraVfxEffectSpec["layers"][number];

function count(n: number, reducedMotion: boolean): number {
  return reducedMotion ? Math.max(1, Math.round(n / 2)) : n;
}

/** The pack for one venue (names = FC_VFX_KINDS minus what the venue or the accessibility state leaves out). */
export function fcVfxPack(venue: VenueId, opts: FcVfxOptions = {}): Readonly<Partial<Record<FcVfxKind, AuraVfxEffectSpec>>> {
  const rm = opts.reducedMotion === true;
  const rf = opts.reducedFlash === true;
  const turf = VENUE_TURF[venue];
  const pyro = VENUE_PYRO[venue];
  const light = (l: Layer): Layer[] => (rf ? [] : [l]);
  const pack: Partial<Record<FcVfxKind, AuraVfxEffectSpec>> = {
    "fc-turf-divot": {
      name: "fc-turf-divot",
      layers: [
        { type: "emitter", preset: "debris", sprite: "debris-chips", color: turf.chip, count: count(8, rm), speed: 1.6, size: [0.03, 0.07] },
        { type: "decal", size: 0.35, lifetime: 6, opacity: 0.45, color: turf.scuff }
      ]
    },
    "fc-net-spark": {
      name: "fc-net-spark",
      layers: [
        { type: "emitter", preset: "spark", sprite: "spark-streak", color: pyro.tail, count: count(14, rm), speed: 3.2 },
        ...light({ type: "light", intensity: 3, range: 6, duration: 0.12, color: pyro.core })
      ]
    },
    "fc-goal-pyro": {
      name: "fc-goal-pyro",
      layers: [
        // a fountain of sparks off the pyro box behind the goal line, then a smoke puff that drifts in the floodlight
        { type: "emitter", preset: "spark", sprite: "flame-loop", color: pyro.core, count: count(36, rm), speed: 6, direction: [0, 1, 0], spread: 0.35, life: [0.7, 1.3], gravity: -5 },
        { type: "emitter", preset: "spark", sprite: "spark-streak", color: pyro.tail, count: count(24, rm), speed: 4.5, direction: [0, 1, 0], spread: 0.6, at: 0.15 },
        { type: "emitter", preset: "dust", sprite: "smoke-a", color: "#9aa4b0", count: count(6, rm), speed: 0.6, size: [0.6, 1.2], at: 0.3 },
        ...light({ type: "light", intensity: 5, range: 14, duration: 0.6, color: pyro.core })
      ]
    }
  };
  if (WET_VENUES.includes(venue)) {
    pack["fc-wet-splash"] = {
      name: "fc-wet-splash",
      layers: [{ type: "emitter", preset: "splash", sprite: "splash", color: "#c8d8ec", count: count(10, rm), speed: 1.8 }]
    };
  }
  if (venue === "munich" && !rf) {
    // storm lightning over the far stand: two light pulses, no camera layer (the broadcast frame never shakes for it)
    pack["fc-lightning"] = {
      name: "fc-lightning",
      layers: [
        { type: "light", intensity: 14, range: 90, duration: 0.08, color: "#dce8ff" },
        { type: "light", intensity: 9, range: 90, duration: 0.12, color: "#c8d8ff", at: 0.16 }
      ]
    };
  }
  return pack;
}

/** The slice of `app.effects` the pack uses. */
export interface FcEffectsLike {
  registerPreset?(kind: string, spec: AuraVfxEffectSpec): void;
  burst?(kind: string, position: readonly [number, number, number], options?: { normal?: readonly [number, number, number]; camera?: boolean }): unknown;
}

/** Register the venue's pack (call on boot and after every venue rebuild). Returns the registered names. */
export function registerFcVfxPack(effects: FcEffectsLike | undefined, venue: VenueId, opts: FcVfxOptions = {}): readonly FcVfxKind[] {
  const pack = fcVfxPack(venue, opts);
  const names = Object.keys(pack) as FcVfxKind[];
  for (const name of names) {
    try { effects?.registerPreset?.(name, pack[name]!); } catch { /* stub effects surface */ }
  }
  return names;
}

export type FcVfxEvent = "kick" | "shot" | "pass" | "tackle" | "goal" | "save" | "post";

export interface FcVfxBurst {
  readonly kind: FcVfxKind;
  readonly position: [number, number, number];
  readonly normal?: [number, number, number];
}

/**
 * The pack bursts one sim event fires (a read of the event position only; gameplay untouched). Goals light pyro on
 * both corners behind the scored goal plus a net spark, and on Munich a lightning strike over the far stand.
 */
export function fcVfxForEvent(event: FcVfxEvent, at: readonly [number, number, number], venue: VenueId, opts: FcVfxOptions = {}): FcVfxBurst[] {
  const ground: [number, number, number] = [at[0], 0.03, at[2]];
  const up: [number, number, number] = [0, 1, 0];
  const wet = WET_VENUES.includes(venue);
  switch (event) {
    case "kick":
    case "shot":
    case "pass":
      return wet ? [{ kind: "fc-wet-splash", position: ground }, { kind: "fc-turf-divot", position: ground, normal: up }] : [{ kind: "fc-turf-divot", position: ground, normal: up }];
    case "tackle":
      return [{ kind: "fc-turf-divot", position: ground, normal: up }, ...(wet ? [{ kind: "fc-wet-splash" as const, position: ground }] : [])];
    case "save":
    case "post":
      return [{ kind: "fc-net-spark", position: [at[0], Math.max(0.4, at[1]), at[2]] }];
    case "goal": {
      const side = at[0] >= 0 ? 1 : -1;
      const gx = side * (PITCH_HX + 2.2);
      const bursts: FcVfxBurst[] = [
        { kind: "fc-net-spark", position: [side * (PITCH_HX + 1), 1.4, Math.max(-GOAL_HALF_W, Math.min(GOAL_HALF_W, at[2]))] },
        { kind: "fc-goal-pyro", position: [gx, 0.2, -(GOAL_HALF_W + 4)] },
        { kind: "fc-goal-pyro", position: [gx, 0.2, GOAL_HALF_W + 4] }
      ];
      if (venue === "munich" && opts.reducedFlash !== true) bursts.push({ kind: "fc-lightning", position: [0, 30, -(PITCH_HZ + 30)] });
      return bursts;
    }
    default:
      return [];
  }
}

/** Fire the bursts for an event on `app.effects` (best effort). Returns what was fired, for the QA evidence. */
export function fireFcVfx(effects: FcEffectsLike | undefined, event: FcVfxEvent, at: readonly [number, number, number], venue: VenueId, opts: FcVfxOptions = {}): FcVfxBurst[] {
  const bursts = fcVfxForEvent(event, at, venue, opts);
  for (const b of bursts) {
    try { effects?.burst?.(b.kind, b.position, { ...(b.normal ? { normal: b.normal } : {}), camera: false }); } catch { /* stub */ }
  }
  return bursts;
}
