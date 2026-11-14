// Aura FC 3D — Sculpted Multi-Material Articulated Footballer & Goalkeeper Rigs.
//
// Each athlete is ONE articulated multi-material body group (`${id}-body`) plus a contact shadow and a team turf ring.
// Multi-material slots preserve skin, hair and boots while tinting `{ target: /-kit$/, color: kit.shirt }` via `${id}-kit`.
// Clip and phase come from the sim through `game/locomotion.ts` (kick swings whip through ball contact on the sim's
// launch frame; run cycles advance with distance so planted cleated boots do not slide) and drive every joint
// statelessly via `"ZYX"` Euler rotations (`poseArticulatedFootballer`).

import { game, material, primitives } from "@aura3d/engine";
import type { PlayerState } from "./types";
import { athleteAnimation, athleteModelScale, type LocoClip } from "./locomotion";
import {
  FOOTBALLER_CANONICAL_HEIGHT,
  GOALKEEPER_CANONICAL_HEIGHT,
  buildArticulatedFootballerNode,
  poseArticulatedFootballer
} from "../art/proceduralModels";

export type RigNode = any;

export interface AthleteRig {
  readonly id: string;
  body: RigNode;
  shadow: RigNode;
  ring: RigNode;
  readonly lookup?: (nodeId: string) => RigNode;
  kitKey: string;
  jerseyColor: string;
  trimColor: string;
  readonly modelScale: number;
  readonly phaseOffset: number;
  loco: LocoClip;
  /** Clip and phase last handed to the body (published in the route evidence). */
  activeClip: string;
  activePhase: number;
}

export interface AthleteKit {
  readonly jersey: string;
  readonly shorts: string;
  readonly socks: string;
  readonly boots: string;
  readonly skin: string;
  readonly trim: string;
  readonly keeper: boolean;
}

const SKIN_TONES = ["#c68a5a", "#8a5f42", "#e0b48a", "#6e4a30", "#d09a6a"] as const;

/* ------------------------------------------------------------------ */
/*  Team kits                                                          */
/* ------------------------------------------------------------------ */

/**
 * Match kit palette — FIXED per side so both teams are always strongly contrasted (different hue AND different
 * value) and identity stays stable for the whole match, whatever clubs the fixture names.
 *
 * Outfield red (#b2352f, hue ≈4°, mid-dark) vs sky (#d9e8f7, hue ≈212°, very light): ~150° hue apart with a large
 * light/dark split. Keepers wear a third colour each — yellow (hue ≈48°) and purple (hue ≈266°).
 */
export interface TeamKit {
  readonly shirt: string;
  readonly shorts: string;
  readonly socks: string;
  readonly gkShirt: string;
  readonly gkShorts: string;
  readonly gkSocks: string;
}

export const TEAM_KITS: readonly [TeamKit, TeamKit] = [
  { shirt: "#b2352f", shorts: "#f2f0e2", socks: "#b2352f", gkShirt: "#e5c433", gkShorts: "#17191f", gkSocks: "#e5c433" },
  { shirt: "#d9e8f7", shorts: "#16233e", socks: "#f2f0e2", gkShirt: "#8a54d1", gkShorts: "#14161c", gkSocks: "#8a54d1" }
];

/** Kit for one athlete id: "h-*" is team 0, "a-*" team 1, "*-gk" keeps goal. */
export function teamKitForId(id: string): { team: 0 | 1; keeper: boolean; shirt: string; shorts: string; socks: string } {
  const team: 0 | 1 = id.startsWith("a-") ? 1 : 0;
  const keeper = id.endsWith("-gk");
  const kit = TEAM_KITS[team];
  return keeper
    ? { team, keeper, shirt: kit.gkShirt, shorts: kit.gkShorts, socks: kit.gkSocks }
    : { team, keeper, shirt: kit.shirt, shorts: kit.shorts, socks: kit.socks };
}

export function skinFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SKIN_TONES[h % SKIN_TONES.length];
}

function isPowerFrameRole(id: string): boolean {
  return id.endsWith("-gk") || id.endsWith("-df0") || id.endsWith("-df1");
}

const idHash = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
};

/* ------------------------------------------------------------------ */

/** FC47-M2 fabric rim term on shirts and garment panels (micromesh floodlight sheen). */
export const KIT_FABRIC_RIM = { color: "#eef4fc", power: 3.6, intensity: 0.45 } as const;

/** Blob-disc opacity under each athlete: 0.32 (4.6.2); the phase-4 hybrid path, where the key casts real shadows, 0.14. */
export const BLOB_OPACITY = 0.32;
export const HYBRID_BLOB_OPACITY = 0.14;

export function athleteNodes(id: string, blobOpacity: number = BLOB_OPACITY, castMarkerShadows = true): RigNode[] {
  const isKeeper = id.endsWith("-gk");
  const isPower = isPowerFrameRole(id);
  const isCaptain = id.endsWith("-mf");
  const kit = teamKitForId(id);
  const targetHeight = isKeeper ? 2.32 : isPower ? 2.26 : 2.22;
  return [
    buildArticulatedFootballerNode(
      id,
      {
        shirt: kit.shirt,
        shorts: kit.shorts,
        socks: kit.socks,
        skin: skinFor(id),
        targetHeight,
        isKeeper,
        isCaptain,
        powerFrame: isPower,
        fabricRim: KIT_FABRIC_RIM
      },
      { runtimeFactory: (nodeId) => game.runtimeNode(nodeId) }
    ),
    primitives.cylinder({
      name: `${id}-shadow`,
      size: [1, 0.01, 1],
      material: material.pbr({ color: "#000000", roughness: 1, opacity: blobOpacity }),
      ...(castMarkerShadows ? {} : { castShadow: false })
    }).runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({
      name: `${id}-ring`,
      size: [0.68, 0.04, 0.04],
      material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.1 }),
      ...(castMarkerShadows ? {} : { castShadow: false })
    }).runtime(game.runtimeNode(`${id}-ring`))
  ];
}

export function resolveAthlete(app: any, id: string): AthleteRig {
  const req = (n: string) => app.nodes.require(`${id}-${n}`);
  const lookup = (nodeId: string) => {
    try {
      return app.nodes?.get?.(nodeId) ?? app.nodes?.require?.(nodeId) ?? null;
    } catch {
      return null;
    }
  };
  const canonicalHeight = id.endsWith("-gk") ? GOALKEEPER_CANONICAL_HEIGHT : FOOTBALLER_CANONICAL_HEIGHT;
  return {
    id,
    body: req("body"),
    shadow: req("shadow"),
    ring: req("ring"),
    lookup,
    kitKey: "",
    jerseyColor: teamKitForId(id).shirt,
    trimColor: "#d8ff3e",
    modelScale: athleteModelScale(id, canonicalHeight),
    phaseOffset: ((idHash(id) % 1000) / 1000) * 1.8,
    loco: "Ready",
    activeClip: "Ready",
    activePhase: 0
  };
}

/** Retint the team ring when the kit key changes (the kit colours are authored on the multi-material rig at mount). */
export function applyAthleteKit(rig: AthleteRig, kit: AthleteKit): void {
  const key = `${kit.jersey}|${kit.shorts}|${kit.socks}|${kit.boots}|${kit.skin}|${kit.trim}|${kit.keeper}`;
  if (rig.kitKey === key) return;
  rig.kitKey = key;
  rig.jerseyColor = kit.jersey;
  rig.trimColor = kit.trim || "#d8ff3e";
  rig.ring.setMaterial(material.emissive({ color: kit.jersey, emissive: kit.jersey, emissiveIntensity: 0.95 }));
}

/* ------------------------------------------------------------------ */
/*  Per-frame driver                                                   */
/* ------------------------------------------------------------------ */

/**
 * Pose one athlete: world transform of the articulated body, stateless `"ZYX"` Euler joint pose from the sim state,
 * shadow and team ring. `t` is `performance.now() / 1000`.
 */
export function poseAthlete(rig: AthleteRig, p: PlayerState, t: number): void {
  // Model forward is +Z; sim yaw=0 is +X, yaw=PI/2 is +Z -> modelY = PI/2 - p.yaw
  const diving = p.diveT > 0 && p.isKeeper;
  // aircraft-spin celebration turns the whole body (the clip is the jump loop)
  const spin = p.celebrateT > 0.2 && p.celebrateKind === 1 ? t * 5.5 : 0;
  const modelY = Math.PI / 2 - p.yaw + spin;
  // Keep `rig.body` on pure yaw (`rx = 0, rz = 0`) so `"ZYX"` Euler `setRotation` never hits gimbal lock
  // or world-Z pitch flip when goalkeepers stand at `modelY = ±PI/2` (`p.yaw = 0` or `PI`)!
  rig.body
    ?.setPosition(p.x, diving ? 0.14 : 0, p.z)
    .setRotation(0, modelY, 0)
    .setScale([1, 1, 1])
    .setVisible(true);

  const next = athleteAnimation(p, t, rig.modelScale, rig.loco, rig.phaseOffset);
  rig.loco = next.loco;
  const a = next.anim;
  rig.activeClip = a.clip;
  rig.activePhase = a.phase;
  rig.body?.setAnimation?.({ clip: a.clip, loop: a.loop, duration: a.duration, startTime: t - a.phase, crossFade: false });
  poseArticulatedFootballer(rig.lookup, rig.id, {
    clip: a.clip,
    phase: a.phase,
    duration: a.duration,
    isKeeper: p.isKeeper,
    celebrateKind: (p as PlayerState & { celebrateKind?: number }).celebrateKind,
    celebrateT: p.celebrateT,
    diveDir: p.diveDir,
    yaw: p.yaw
  });

  rig.shadow.setPosition(p.x, 0.014, p.z).setScale([1, 1, 1]).setVisible(true);
  const pulse = p.controlled ? 1.05 + Math.sin(t * 6) * 0.08 : 0.72;
  rig.ring
    .setPosition(p.x, 0.03, p.z)
    .setRotation(Math.PI / 2, 0, 0)
    .setScale([pulse, pulse, pulse])
    .setVisible(true);
}

export function hideAthlete(rig: AthleteRig): void {
  for (const h of [rig.body, rig.shadow, rig.ring]) h?.setVisible?.(false);
}
