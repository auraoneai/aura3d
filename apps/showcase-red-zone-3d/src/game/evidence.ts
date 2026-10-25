/**
 * Red Zone 3D — runtime evidence channel.
 *
 * Publishes the same evidence object to all four capture globals each frame
 * (the contract every showcase route shares) so remote captures can verify
 * the game is live, rendering, and progressing without injected input.
 */
import type { GameState } from "./types";
import type { Director } from "./director";
import { installGameBeacon } from "@aura3d/engine/game";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-red-zone-3d", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__", "__gameEvidence", "__auraEvidence"] });
  gameBeacon.publishEvidence(evidence);
};

export interface EvidenceExtras {
  framesRendered: number;
  ready?: boolean;
  demo: boolean;
  athleteClips?: Record<string, string>;
  juice?: unknown;
  audio?: unknown;
  eventLog?: unknown;
  hud?: unknown;
  accessibility?: unknown;
  touch?: unknown;
  diagnostics?: unknown;
  meshyAssets: string[];
}

export function publishEvidence(s: GameState, director: Director, x: EvidenceExtras): Record<string, unknown> {
  const carrier = s.athletes.find((a) => a.id === s.carrier);
  const athleteClips = x.athleteClips ?? Object.fromEntries(s.athletes.map((a) => [a.id, s.phase === "preSnap" ? "Crouch_Idle_Loop" : "Run"]));
  const evidence = {
    route: "showcase-red-zone-3d",
    engine: "@aura3d/engine",
    ready: x.ready ?? true,
    framesRendered: x.framesRendered,
    look: "interior-industrial",
    mode: s.mode,
    phase: s.phase,
    playPhase: s.phase,
    venue: s.venue,
    cameraMode: director.mode(),
    demo: x.demo,
    teams: { home: s.userTeam.id, away: s.cpuTeam.id },
    score: { ...s.score },
    quarter: s.quarter,
    clock: Math.round(s.clock * 10) / 10,
    ot: s.ot,
    down: s.down,
    distance: Math.round(s.toGo * 10) / 10,
    los: Math.round(s.los * 10) / 10,
    firstDownLine: Math.round(s.firstDownLine * 10) / 10,
    possession: s.possession,
    direction: s.dir,
    coverage: s.coverage,
    play: s.play ? { id: s.play.def.id, name: s.play.def.name, type: s.play.def.type } : null,
    ball: {
      kind: s.ball.kind,
      x: Math.round(s.ball.x * 100) / 100,
      y: Math.round(s.ball.y * 100) / 100,
      z: Math.round(s.ball.z * 100) / 100,
      holder: s.ball.holder ?? null,
      target: s.ball.targetId ?? null
    },
    carrier: carrier ? { id: carrier.id, slot: carrier.slot, x: Math.round(carrier.x * 10) / 10, z: Math.round(carrier.z * 10) / 10 } : null,
    userControlled: s.userControlled ?? null,
    athletesOnField: s.athletes.length,
    athleteClips,
    athletes: s.athletes.map((a) => ({
      id: a.id,
      slot: a.slot,
      unit: a.unit,
      x: Math.round(a.x * 100) / 100,
      z: Math.round(a.z * 100) / 100,
      speed: Math.round(Math.hypot(a.vx, a.vz) * 100) / 100,
      pose: a.pose,
      clip: athleteClips[a.id] ?? "Crouch_Idle_Loop"
    })),
    labScore: s.labScore ?? null,
    stats: { ...s.stats },
    lastGain: s.lastGain,
    lastCall: s.lastCall,
    studio: { ...s.studio },
    juice: x.juice ?? null,
    audio: x.audio ?? null,
    eventLog: x.eventLog ?? null,
    hud: x.hud ?? null,
    accessibility: x.accessibility ?? null,
    touch: x.touch ?? null,
    diagnostics: x.diagnostics ?? null,
    meshyAssets: x.meshyAssets,
    deterministic: { rng: "lcg:0x7ed2f00d", ik: "game.racketSports.solveArmElbow", seeded: true }
  };
  publishBeacon(evidence);
  return evidence;
}
